import { auth, db } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import {
  collection, doc, getDoc, getDocs, query, where,
  setDoc, updateDoc, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const TIME_SLOTS = makeTimeSlots();

let currentUser = null;
let currentProfile = null;
let resources = [];
let reservations = [];
let userProfiles = [];
let todaySlotLocks = [];
let dialogSlotLocks = [];
let activeFilter = "todos";
let managerReservationFilter = "todas";
let editingResourceId = "";
let selectedResourceId = "";
let selectedReservationTime = "";
let selectedReservationEndTime = "";
let selectionRangeCompleted = false;
let pendingCancellation = null;
let slotRefreshSequence = 0;

const viewTitles = {
  home: "Visão geral",
  resources: "Salas e equipamentos",
  reservations: "As minhas reservas",
  "manager-reservations": "Gestão de reservas",
  "manage-resources": "Gestão de salas e equipamentos",
  "manage-users": "Gestão de utilizadores"
};

const today = localDateString(new Date());
if ($("#dialogDate")) {
  $("#dialogDate").min = today;
  $("#dialogDate").value = today;
}
if ($("#todayLabel")) {
  $("#todayLabel").textContent = new Intl.DateTimeFormat("pt-PT", {
    weekday: "short", day: "numeric", month: "short", year: "numeric"
  }).format(new Date());
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("./index.html");
    return;
  }

  currentUser = user;
  try {
    await loadProfile();
    configureRoleUI();
    await loadData();
    $("#loadingPanel").hidden = true;
    $("#appContent").hidden = false;
    showView("home");
  } catch (error) {
    console.error("Erro ao iniciar a área reservada:", error);
    const panel = $("#loadingPanel");
    panel.replaceChildren();
    const title = document.createElement("strong");
    title.textContent = "Não foi possível carregar a dashboard.";
    const message = document.createElement("p");
    message.textContent = error.code === "permission-denied"
      ? "O Firestore recusou o acesso. Confirma as regras de segurança publicadas."
      : "Ocorreu um erro ao carregar os dados. Consulta a consola do browser (F12).";
    const details = document.createElement("p");
    details.textContent = `${error.code || "Erro"}: ${error.message || "Sem detalhes adicionais."}`;
    panel.append(title, message, details);
  }
});

async function loadProfile() {
  const profileSnapshot = await getDoc(doc(db, "users", currentUser.uid));
  const emailName = (currentUser.email ?? "utilizador")
    .split("@")[0]
    .replace(/[._-]+/g, " ");

  // Não cria documentos no Firestore durante o login.
  currentProfile = profileSnapshot.exists()
    ? profileSnapshot.data()
    : {
        uid: currentUser.uid,
        email: currentUser.email ?? "",
        displayName: emailName,
        role: "utilizador"
      };

  // Por segurança, só o valor explícito "gestor" ativa permissões de gestor.
  if (currentProfile.role !== "gestor") currentProfile.role = "utilizador";

  const displayName = String(currentProfile.displayName || emailName || "Utilizador").trim();
  const firstName = displayName.split(/\s+/)[0];
  const initials = initialsFor(displayName);
  const manager = currentProfile.role === "gestor";

  $("#homeWelcome").textContent = `Olá, ${firstName}!`;
  $("#sidebarUserName").textContent = displayName;
  $("#sidebarUserRole").textContent = manager ? "Gestor" : "Utilizador";
  $("#sidebarInitials").textContent = initials;
  $("#headerRole").textContent = manager ? "Gestor" : "Utilizador";
  $("#homeNavText").textContent = manager ? "Painel de gestão" : "Visão geral";
  $("#navLabel").textContent = manager ? "ADMINISTRAÇÃO" : "MENU PRINCIPAL";
}

function configureRoleUI() {
  const isManager = currentProfile?.role === "gestor";
  $$('[data-role="utilizador"]').forEach(element => { element.hidden = isManager; });
  $$('[data-role="gestor"]').forEach(element => { element.hidden = !isManager; });
  $("#userHome").hidden = isManager;
  $("#managerHome").hidden = !isManager;
}

async function loadData() {
  const isManager = currentProfile?.role === "gestor";
  const resourcesQuery = isManager
    ? collection(db, "resources")
    : query(collection(db, "resources"), where("active", "==", true));
  const reservationsQuery = isManager
    ? collection(db, "reservations")
    : query(collection(db, "reservations"), where("userId", "==", currentUser.uid));
  const todayLocksQuery = query(
    collection(db, "reservationSlots"),
    where("date", "==", localDateString(new Date()))
  );

  const requests = [
    getDocs(resourcesQuery),
    getDocs(reservationsQuery),
    getDocs(todayLocksQuery)
  ];
  if (isManager) requests.push(getDocs(collection(db, "users")));

  const results = await Promise.all(requests);
  resources = results[0].docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  reservations = results[1].docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  todaySlotLocks = results[2].docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  userProfiles = isManager
    ? results[3].docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }))
    : [];

  resources.sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "pt"));
  reservations.sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`));
  userProfiles.sort((a, b) => String(a.email ?? "").localeCompare(String(b.email ?? ""), "pt"));

  renderStats();
  renderResources();
  renderUserReservations();
  renderHomeReservations();
  if (isManager) {
    renderManagerResources();
    renderManagerReservations();
    renderManagerUsers();
    renderManagerHomeReservations();
  }
}

function renderStats() {
  const activeFuture = reservations.filter(item =>
    item.status === "ativa" && getSlotDate(item) >= new Date()
  ).length;
  const activeResources = resources.filter(item => item.active === true);
  const nextTime = getNextBookableTime();
  const freeEquipmentUnits = nextTime
    ? activeResources.filter(item => item.type === "equipamento").reduce((total, resource) =>
        total + getAvailableUnitNumbers(resource, localDateString(new Date()), [nextTime], todaySlotLocks).length, 0)
    : 0;

  $("#userStatReservations").textContent = String(activeFuture);
  $("#userStatRooms").textContent = String(activeResources.filter(item => item.type === "sala").length);
  $("#userStatEquipment").textContent = String(freeEquipmentUnits);

  if (currentProfile?.role === "gestor") {
    $("#managerStatResources").textContent = String(activeResources.length);
    $("#managerStatReservations").textContent = String(reservations.filter(item => item.status === "ativa").length);
    $("#managerStatUsers").textContent = String(userProfiles.length);
    $("#managerStatManagers").textContent = String(userProfiles.filter(item => item.role === "gestor").length);
  }
}

function renderResources() {
  const visible = resources.filter(resource =>
    resource.active === true &&
    (activeFilter === "todos" || resource.type === activeFilter)
  );
  renderResourceCards($("#resourceGrid"), visible);
  renderResourceCards($("#homeResourceGrid"), visible);
}

function renderResourceCards(grid, visible) {
  if (!grid) return;
  if (!visible.length) {
    grid.innerHTML = '<div class="empty-state empty-state-wide"><strong>Ainda não existem recursos nesta categoria</strong>Quando o gestor registar salas ou equipamentos, estes aparecerão aqui.</div>';
    return;
  }

  const nextTime = getNextBookableTime();
  grid.replaceChildren(...visible.map(resource => {
    const card = document.createElement("article");
    card.className = "resource-card";
    const isRoom = resource.type === "sala";
    const totalUnits = getResourceUnitCount(resource);
    const available = nextTime
      ? getAvailableUnitNumbers(resource, localDateString(new Date()), [nextTime], todaySlotLocks).length
      : 0;
    const description = resource.description || (isRoom
      ? "Espaço disponível para reserva por horário."
      : "Equipamento eletrónico disponível para reserva.");
    const availabilityText = !nextTime
      ? "Sem horários de início disponíveis hoje"
      : isRoom
        ? (available > 0 ? `Disponível às ${nextTime}` : `Ocupada às ${nextTime}`)
        : `${available}/${totalUnits} unidades livres${` às ${nextTime}`}`;
    const locationText = resource.type === "equipamento"
      ? "Equipamento móvel"
      : (resource.location || "Localização a definir");
    const capacityText = isRoom && resource.capacity
      ? `<span>♙ ${escapeHtml(String(resource.capacity))} lugares</span>`
      : "";

    card.innerHTML = `
      <div class="resource-card-top">
        <span class="resource-symbol ${isRoom ? "" : "equipment"}" aria-hidden="true">${isRoom ? "▦" : "▣"}</span>
        <span class="resource-tag">Ativo</span>
      </div>
      <h3>${escapeHtml(resource.name || "Recurso sem nome")}</h3>
      <p>${escapeHtml(description)}</p>
      <div class="resource-meta">
        <span>⌖ ${escapeHtml(locationText)}</span>
        ${capacityText}
        <span>${escapeHtml(availabilityText)}</span>
      </div>
      <button class="button button-primary" type="button" data-reserve-id="${escapeHtml(resource.id)}">Consultar horários <span aria-hidden="true">→</span></button>`;
    return card;
  }));
}

function renderUserReservations() {
  const list = $("#userReservationsList");
  const sorted = [...reservations].sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  $("#userReservationsCount").textContent = `${sorted.length} ${sorted.length === 1 ? "reserva" : "reservas"}`;
  if (!sorted.length) {
    list.innerHTML = '<div class="empty-state"><strong>Ainda não tens reservas</strong>Escolhe uma sala ou equipamento e consulta os horários disponíveis.</div>';
    return;
  }
  list.replaceChildren(...sorted.map(reservation => createReservationRow(reservation, false)));
}

function renderHomeReservations() {
  const list = $("#userHomeReservations");
  const upcoming = reservations.filter(item => item.status === "ativa" && getSlotDate(item) >= new Date())
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)).slice(0, 4);
  if (!upcoming.length) {
    list.innerHTML = '<div class="empty-state"><strong>Sem reservas futuras</strong>Quando fizeres uma reserva, ela aparecerá aqui.</div>';
    return;
  }
  list.replaceChildren(...upcoming.map(reservation => createCompactReservation(reservation, false)));
}

function renderManagerHomeReservations() {
  const list = $("#managerHomeReservations");
  const upcoming = reservations.filter(item => item.status === "ativa" && getSlotDate(item) >= new Date())
    .sort((a, b) => `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`)).slice(0, 5);
  if (!upcoming.length) {
    list.innerHTML = '<div class="empty-state"><strong>Sem reservas futuras</strong>As novas reservas de todos os utilizadores aparecerão aqui.</div>';
    return;
  }
  list.replaceChildren(...upcoming.map(reservation => createCompactReservation(reservation, true)));
}

function createCompactReservation(reservation, managerMode) {
  const date = parseLocalDate(reservation.date);
  const item = document.createElement("div");
  item.className = "compact-reservation";
  const owner = managerMode ? getProfileLabel(reservation.userId) : "";
  const unitText = reservation.resourceType === "equipamento"
    ? ` · Unidade ${Number(reservation.unitNumber || 1)}` : "";
  item.innerHTML = `
    <div class="date-tile"><strong>${date ? date.getDate() : "—"}</strong><small>${date ? date.toLocaleDateString("pt-PT", { month: "short" }) : "—"}</small></div>
    <div class="compact-reservation-main"><strong>${escapeHtml(reservation.resourceName || findResourceName(reservation.resourceId))}</strong><small>${escapeHtml(reservation.date || "")} · ${escapeHtml(reservation.startTime || "—")}–${escapeHtml(getReservationEndTime(reservation))}${escapeHtml(unitText)}${managerMode ? ` · ${escapeHtml(owner)}` : ""}</small></div>
    <span class="status-pill">Ativa</span>`;
  return item;
}

function createReservationRow(reservation, managerMode) {
  const row = document.createElement("article");
  row.className = "reservation-row";
  const cancelled = reservation.status !== "ativa";
  const date = parseLocalDate(reservation.date);
  const owner = managerMode ? getProfileLabel(reservation.userId) : "";
  const canCancel = !cancelled && (managerMode || getSlotDate(reservation) >= new Date());
  const unitText = reservation.resourceType === "equipamento"
    ? ` · Unidade ${Number(reservation.unitNumber || 1)}` : "";
  row.innerHTML = `
    <div class="date-tile"><strong>${date ? date.getDate() : "—"}</strong><small>${date ? date.toLocaleDateString("pt-PT", { month: "short" }) : "—"}</small></div>
    <div class="reservation-details"><h3>${escapeHtml(reservation.resourceName || findResourceName(reservation.resourceId))}</h3><p>${escapeHtml(reservation.date || "Data por definir")} · ${escapeHtml(reservation.startTime || "—")}–${escapeHtml(getReservationEndTime(reservation))} (${escapeHtml(formatDuration(getReservationDuration(reservation)))})${escapeHtml(unitText)}<br>${reservation.resourceType === "sala" ? "Sala" : "Equipamento"}${managerMode ? `<br><span class="reservation-owner">Reservado por: ${escapeHtml(owner)}</span>` : ""}</p></div>
    <div class="reservation-actions"><span class="status-pill ${cancelled ? "cancelled" : ""}">${cancelled ? "Cancelada" : "Ativa"}</span>${canCancel ? `<button class="cancel-button" type="button" data-cancel-id="${escapeHtml(reservation.id)}">Cancelar</button>` : ""}</div>`;
  return row;
}

// ---------------------- Modal de horários e disponibilidade ----------------------

const SLOT_END_TIME = "22:00";
const MAX_RESERVATION_MINUTES = 180;

async function openResourceDialog(resourceId) {
  if (!currentUser) return;
  const resource = resources.find(item => item.id === resourceId && item.active === true);
  if (!resource) return;

  selectedResourceId = resourceId;
  selectedReservationTime = "";
  selectedReservationEndTime = "";
  selectionRangeCompleted = false;
  dialogSlotLocks = [];

  $("#dialogResourceName").textContent = resource.name || "Recurso";
  $("#dialogResourceMeta").textContent = `${resource.type === "sala" ? "Sala" : "Equipamento eletrónico"}${resource.type === "sala" ? ` · ${resource.location || "Localização a definir"}` : ` · ${getResourceUnitCount(resource)} unidades`}${resource.type === "sala" && resource.capacity ? ` · ${resource.capacity} lugares` : ""}`;
  $("#dialogResourceSymbol").classList.toggle("equipment", resource.type !== "sala");
  $("#dialogResourceSymbol").textContent = resource.type === "sala" ? "▦" : "▣";
  $("#dialogDate").min = localDateString(new Date());
  $("#dialogDate").value = localDateString(new Date());
  $("#dialogError").hidden = true;
  updateSelectedSlotLabel();

  if (!$("#resourceDialog").open) $("#resourceDialog").showModal();
  await refreshDialogSlots();
}

async function refreshDialogSlots() {
  const sequence = ++slotRefreshSequence;
  const date = $("#dialogDate").value;
  const grid = $("#slotGrid");

  selectedReservationTime = "";
  selectedReservationEndTime = "";
  selectionRangeCompleted = false;
  updateSelectedSlotLabel();
  $("#dialogError").hidden = true;

  const resource = resources.find(item => item.id === selectedResourceId && item.active === true);
  if (!resource || !date) {
    grid.replaceChildren();
    $("#dialogAvailabilityMessage").textContent = "Escolhe uma data para consultar os horários.";
    return;
  }

  if (date < localDateString(new Date())) {
    grid.replaceChildren();
    $("#dialogAvailabilityMessage").textContent = "A data já passou. Escolhe hoje ou uma data futura.";
    return;
  }

  grid.innerHTML = '<div class="slots-loading"><span class="spinner"></span> A consultar horários...</div>';
  $("#dialogAvailabilityMessage").textContent = "A verificar os horários ocupados...";

  try {
    const snapshot = await getDocs(query(
      collection(db, "reservationSlots"),
      where("resourceId", "==", selectedResourceId),
      where("date", "==", date)
    ));

    if (sequence !== slotRefreshSequence || date !== $("#dialogDate").value || !$("#resourceDialog").open) return;

    dialogSlotLocks = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    let availableCount = 0;

    const buttons = [...TIME_SLOTS, SLOT_END_TIME].map(time => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-button";
      button.dataset.slotTime = time;

      if (time === SLOT_END_TIME) {
        button.classList.add("slot-end-only");
        button.dataset.endOnly = "true";
        button.dataset.statusLabel = "Limite de fim";
        button.innerHTML = `<strong>${time}</strong><small>Fim do dia</small>`;
        button.setAttribute("aria-label", `${time}, limite máximo do horário de funcionamento`);
        button.disabled = isPastSlot(date, time);
        return button;
      }

      if (isPastSlot(date, time)) {
        button.classList.add("slot-past");
        button.dataset.statusLabel = "Passado";
        button.innerHTML = `<strong>${time}</strong><small>Passado</small>`;
        button.disabled = true;
        button.setAttribute("aria-label", `${time}, horário passado`);
        return button;
      }

      // A disponibilidade base é sempre calculada por bloco de 30 minutos.
      // A disponibilidade de um intervalo maior é verificada ao escolher a hora de fim.
      const availableUnits = getAvailableUnitNumbers(resource, date, [time], dialogSlotLocks);

      if (availableUnits.length > 0) {
        availableCount++;
        button.classList.add("slot-free");
        button.dataset.statusLabel = resource.type === "equipamento"
          ? `${availableUnits.length} unid. livres`
          : "Disponível";
        button.innerHTML = `<strong>${time}</strong><small>${button.dataset.statusLabel}</small>`;
        button.setAttribute("aria-label", `${time}, disponível durante 30 minutos`);
      } else {
        button.classList.add("slot-occupied");
        button.dataset.statusLabel = "Ocupado";
        button.innerHTML = `<strong>${time}</strong><small>Ocupado</small>`;
        button.setAttribute("aria-label", `${time}, ocupado como horário de início`);
      }

      return button;
    });

    grid.replaceChildren(...buttons);
    renderDialogSlotSelection();

    $("#dialogAvailabilityMessage").textContent = availableCount
      ? `${availableCount} horários de início disponíveis. Clica num horário para selecionar o início; podes reservar 30 minutos ou escolher uma segunda hora para definir o fim.`
      : "Não existem horários de início livres nesta data. Escolhe outra data.";
  } catch (error) {
    console.error("Erro ao consultar a disponibilidade:", error);
    grid.innerHTML = '<div class="empty-state empty-state-wide"><strong>Não foi possível consultar os horários</strong>Confirma as regras de leitura de reservationSlots no Firestore.</div>';
    $("#dialogAvailabilityMessage").textContent = "Erro ao consultar disponibilidade.";
  }
}

function selectSlot(time) {
  const resource = resources.find(item => item.id === selectedResourceId && item.active === true);
  const date = $("#dialogDate").value;

  if (!resource || !date) return;

  // Depois de definir explicitamente um intervalo, o próximo clique inicia
  // uma nova seleção em vez de alterar silenciosamente a reserva anterior.
  if (!selectedReservationTime || selectionRangeCompleted) {
    beginSlotSelection(time, resource, date);
    return;
  }

  const startMinutes = clockMinutes(selectedReservationTime);
  const clickedMinutes = clockMinutes(time);

  if (time === SLOT_END_TIME && !selectedReservationTime) {
    showDialogError("Seleciona primeiro uma hora de início.");
    return;
  }

  if (clickedMinutes === startMinutes) {
    return;
  }

  // Clicar antes do início reinicia a seleção a partir desse horário.
  if (clickedMinutes < startMinutes) {
    beginSlotSelection(time, resource, date);
    return;
  }

  const durationMinutes = clickedMinutes - startMinutes;

  if (durationMinutes < 30) {
    showDialogError("A duração mínima de uma reserva é de 30 minutos.");
    return;
  }

  if (durationMinutes > MAX_RESERVATION_MINUTES) {
    showDialogError("A duração máxima permitida é de 3 horas. Escolhe uma hora de fim mais próxima.");
    return;
  }

  const intervalTimes = getSlotTimesForRange(selectedReservationTime, time);
  if (!intervalTimes) {
    showDialogError("O intervalo selecionado não é válido. Escolhe horários de 30 em 30 minutos, até às 22:00.");
    return;
  }

  const availableUnits = getAvailableUnitNumbers(resource, date, intervalTimes, dialogSlotLocks);
  if (availableUnits.length === 0) {
    showDialogError(`O intervalo ${selectedReservationTime}–${time} inclui pelo menos um bloco ocupado ou sem uma unidade disponível. Escolhe outra hora de fim.`);
    return;
  }

  selectedReservationEndTime = time;
  selectionRangeCompleted = true;
  $("#dialogError").hidden = true;
  updateSelectedSlotLabel();
}

function beginSlotSelection(time, resource, date) {
  if (time === SLOT_END_TIME) {
    showDialogError("22:00 é apenas o limite para terminar uma reserva. Escolhe primeiro uma hora de início.");
    return;
  }

  if (!TIME_SLOTS.includes(time) || isPastSlot(date, time)) {
    showDialogError("Escolhe um horário de início que ainda não tenha passado.");
    return;
  }

  const defaultEndTime = addMinutes(time, 30);
  const intervalTimes = getSlotTimesForRange(time, defaultEndTime);

  if (!intervalTimes) {
    showDialogError("Não é possível iniciar uma reserva neste horário. O funcionamento termina às 22:00.");
    return;
  }

  const availableUnits = getAvailableUnitNumbers(resource, date, intervalTimes, dialogSlotLocks);
  if (availableUnits.length === 0) {
    showDialogError(`Não existe disponibilidade entre ${time} e ${defaultEndTime}. Escolhe outro horário de início.`);
    return;
  }

  selectedReservationTime = time;
  selectedReservationEndTime = defaultEndTime;
  selectionRangeCompleted = false;
  $("#dialogError").hidden = true;
  updateSelectedSlotLabel();
}

function clearSlotSelection() {
  selectedReservationTime = "";
  selectedReservationEndTime = "";
  selectionRangeCompleted = false;
  $("#dialogError").hidden = true;
  updateSelectedSlotLabel();
  $("#dialogAvailabilityMessage").textContent = "Clica num horário disponível para definir o início. Sem uma segunda seleção, a reserva será de 30 minutos.";
}

function updateSelectedSlotLabel() {
  const hasSelection = Boolean(selectedReservationTime && selectedReservationEndTime);
  const durationMinutes = hasSelection
    ? clockMinutes(selectedReservationEndTime) - clockMinutes(selectedReservationTime)
    : 0;

  $("#selectedSlotLabel").textContent = hasSelection
    ? `${selectedReservationTime} – ${selectedReservationEndTime} (${formatDuration(durationMinutes)})`
    : "Nenhum horário selecionado";

  const confirmButton = $("#confirmReservationBtn");
  confirmButton.disabled = !hasSelection;
  confirmButton.textContent = hasSelection
    ? `Reservar ${formatDuration(durationMinutes)}`
    : "Confirmar reserva";

  const clearButton = $("#clearSlotSelection");
  if (clearButton) clearButton.hidden = !hasSelection;

  renderDialogSlotSelection();

  if (hasSelection) {
    $("#dialogAvailabilityMessage").textContent = selectionRangeCompleted
      ? `Intervalo ${selectedReservationTime}–${selectedReservationEndTime} selecionado (${formatDuration(durationMinutes)}). Podes confirmar a reserva.`
      : `Início ${selectedReservationTime} selecionado. A duração predefinida é de 30 minutos; clica numa hora posterior para escolher o fim (máximo de 3 horas).`;
  }
}

function renderDialogSlotSelection() {
  const hasSelection = Boolean(selectedReservationTime && selectedReservationEndTime);
  const startMinutes = hasSelection ? clockMinutes(selectedReservationTime) : -1;
  const endMinutes = hasSelection ? clockMinutes(selectedReservationEndTime) : -1;

  $$("#slotGrid .slot-button").forEach(button => {
    const time = button.dataset.slotTime;
    const slotMinutes = clockMinutes(time);
    const isStart = hasSelection && time === selectedReservationTime;
    const isEnd = hasSelection && time === selectedReservationEndTime;
    const isInsideRange = hasSelection && slotMinutes >= startMinutes && slotMinutes < endMinutes;

    button.classList.toggle("slot-selected", isStart);
    button.classList.toggle("slot-selected-start", isStart);
    button.classList.toggle("slot-selected-range", isInsideRange && !isStart);
    button.classList.toggle("slot-selected-end", isEnd);
    button.setAttribute("aria-pressed", String(isInsideRange || isEnd));

    const small = button.querySelector("small");
    if (!small) return;

    if (isStart) {
      small.textContent = "Início";
    } else if (isEnd) {
      small.textContent = "Fim";
    } else if (isInsideRange) {
      small.textContent = "Incluído";
    } else {
      small.textContent = button.dataset.statusLabel || "Disponível";
    }

    if (button.dataset.endOnly === "true") {
      button.disabled = isPastSlot($("#dialogDate").value, time) || !hasSelection || selectionRangeCompleted;
    }
  });
}

function showDialogError(message) {
  $("#dialogError").textContent = message;
  $("#dialogError").hidden = false;
}

$("#dialogDate").addEventListener("change", refreshDialogSlots);
$("#clearSlotSelection").addEventListener("click", clearSlotSelection);
$("#slotGrid").addEventListener("click", event => {
  const button = event.target.closest("[data-slot-time]");
  if (!button || button.disabled) return;
  selectSlot(button.dataset.slotTime);
});

$("#closeResourceDialog").addEventListener("click", () => $("#resourceDialog").close());
$("#resourceDialog").addEventListener("click", event => {
  if (event.target === $("#resourceDialog")) $("#resourceDialog").close();
});

["#resourceGrid", "#homeResourceGrid"].forEach(selector => {
  $(selector).addEventListener("click", event => {
    const button = event.target.closest("[data-reserve-id]");
    if (button) openResourceDialog(button.dataset.reserveId);
  });
});

$("#confirmReservationBtn").addEventListener("click", async () => {
  if (!currentUser || !selectedResourceId || !selectedReservationTime || !selectedReservationEndTime) return;

  const resource = resources.find(item => item.id === selectedResourceId && item.active === true);
  const date = $("#dialogDate").value;
  const startTime = selectedReservationTime;
  const endTime = selectedReservationEndTime;
  const durationMinutes = clockMinutes(endTime) - clockMinutes(startTime);
  const intervalTimes = getSlotTimesForRange(startTime, endTime);

  if (
    !resource ||
    !isValidDateString(date) ||
    date < localDateString(new Date()) ||
    isPastSlot(date, startTime) ||
    !intervalTimes ||
    durationMinutes < 30 ||
    durationMinutes > MAX_RESERVATION_MINUTES
  ) {
    showDialogError("Este intervalo já não pode ser reservado. Escolhe outra data ou horário.");
    return;
  }

  const confirmButton = $("#confirmReservationBtn");
  confirmButton.disabled = true;
  confirmButton.textContent = "A confirmar...";
  $("#dialogError").hidden = true;

  try {
    const freshSnapshot = await getDocs(query(
      collection(db, "reservationSlots"),
      where("resourceId", "==", resource.id),
      where("date", "==", date)
    ));

    const latestLocks = freshSnapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    const availableUnits = getAvailableUnitNumbers(resource, date, intervalTimes, latestLocks);

    if (availableUnits.length === 0) {
      await refreshDialogSlots();
      showDialogError("Este intervalo já não tem disponibilidade. A grelha foi atualizada; escolhe novamente os horários.");
      return;
    }

    const unitNumber = availableUnits[0];
    const slotIds = intervalTimes.map(time => makeResourceSlotId(resource.id, date, time, resource.type, unitNumber));
    const lockRefs = slotIds.map(slotId => doc(db, "reservationSlots", slotId));
    const resourceRef = doc(db, "resources", resource.id);
    const reservationRef = doc(collection(db, "reservations"));

    // Equipamentos antigos podiam ter bloqueios sem sufixo de unidade.
    // Verifica os IDs legados da unidade 1 para evitar sobreposições.
    const legacyRefs = resource.type === "equipamento" && unitNumber === 1
      ? intervalTimes.map(time => doc(db, "reservationSlots", makeSlotId(resource.id, date, time)))
      : [];
    const refsToCheck = [...lockRefs, ...legacyRefs];

    await runTransaction(db, async transaction => {
      const resourceSnapshot = await transaction.get(resourceRef);
      const lockSnapshots = await Promise.all(refsToCheck.map(ref => transaction.get(ref)));

      if (!resourceSnapshot.exists() || resourceSnapshot.data().active !== true) {
        throw new Error("RESOURCE_UNAVAILABLE");
      }

      if (lockSnapshots.some(snapshot => snapshot.exists())) {
        throw new Error("SLOT_ALREADY_BOOKED");
      }

      const latestResource = resourceSnapshot.data();
      if (latestResource.type !== resource.type || unitNumber > getResourceUnitCount(latestResource)) {
        throw new Error("RESOURCE_CAPACITY_CHANGED");
      }

      transaction.set(reservationRef, {
        userId: currentUser.uid,
        resourceId: resource.id,
        resourceName: latestResource.name,
        resourceType: latestResource.type,
        date,
        startTime,
        endTime,
        durationMinutes,
        unitNumber,
        slotId: slotIds[0],
        slotIds,
        status: "ativa",
        createdAt: serverTimestamp()
      });

      lockRefs.forEach((lockRef, index) => {
        transaction.set(lockRef, {
          reservationId: reservationRef.id,
          resourceId: resource.id,
          date,
          startTime: intervalTimes[index],
          unitNumber
        });
      });
    });

    $("#resourceDialog").close();
    showNotice(`Reserva criada: ${resource.name}, ${date}, ${startTime}–${endTime}${resource.type === "equipamento" ? ` (unidade ${unitNumber})` : ""}.`);
    await loadData();
  } catch (error) {
    console.error("Erro ao criar reserva:", error);

    if (error.message === "SLOT_ALREADY_BOOKED") {
      await refreshDialogSlots();
      showDialogError("Outra pessoa acabou de reservar este intervalo ou unidade. A disponibilidade foi atualizada; escolhe novamente os horários.");
    } else if (error.message === "RESOURCE_UNAVAILABLE" || error.message === "RESOURCE_CAPACITY_CHANGED") {
      showDialogError("O recurso foi alterado ou desativado pelo gestor. Atualiza a disponibilidade.");
      await loadData();
    } else if (error.code === "permission-denied") {
      showDialogError("A reserva foi bloqueada pelas regras do Firestore. Confirma que as regras atualizadas foram publicadas.");
    } else {
      showDialogError("Não foi possível criar a reserva. Atualiza os horários e tenta novamente.");
    }
  } finally {
    confirmButton.textContent = selectedReservationTime && selectedReservationEndTime
      ? `Reservar ${formatDuration(clockMinutes(selectedReservationEndTime) - clockMinutes(selectedReservationTime))}`
      : "Confirmar reserva";
    confirmButton.disabled = !(selectedReservationTime && selectedReservationEndTime);
  }
});

// ---------------------- Cancelamento com popup ----------------------


$("#userReservationsList").addEventListener("click", event => handleCancelClick(event, false));
$("#managerReservationsList").addEventListener("click", event => handleCancelClick(event, true));

function handleCancelClick(event, managerMode) {
  const button = event.target.closest("[data-cancel-id]");
  if (!button) return;
  const reservation = reservations.find(item => item.id === button.dataset.cancelId);
  if (!reservation || reservation.status !== "ativa") return;
  const isManager = currentProfile?.role === "gestor";
  if ((!managerMode && reservation.userId !== currentUser.uid) || (managerMode && !isManager)) return;

  pendingCancellation = reservation;
  const summary = $("#cancelReservationSummary");
  summary.replaceChildren();
  const details = [
    ["Recurso", reservation.resourceName || findResourceName(reservation.resourceId)],
    ["Data", reservation.date || "Data por definir"],
    ["Horário", `${reservation.startTime || "—"}–${getReservationEndTime(reservation)}`],
    ["Duração", formatDuration(getReservationDuration(reservation))]
  ];
  if (reservation.resourceType === "equipamento") details.push(["Unidade", `Unidade ${Number(reservation.unitNumber || 1)}`]);
  if (isManager) details.push(["Reservado por", getProfileLabel(reservation.userId)]);

  details.forEach(([label, value]) => {
    const row = document.createElement("div");
    row.className = "cancel-detail";
    const labelNode = document.createElement("span");
    labelNode.textContent = label;
    const valueNode = document.createElement("strong");
    valueNode.textContent = String(value || "—");
    row.append(labelNode, valueNode);
    summary.appendChild(row);
  });

  $("#cancelReservationIntro").textContent = "Confirma que pretendes cancelar esta reserva.";
  $("#confirmCancelReservationBtn").disabled = false;
  $("#confirmCancelReservationBtn").textContent = "Cancelar reserva";
  $("#cancelReservationDialog").showModal();
}

$("#closeCancelReservationDialog").addEventListener("click", () => $("#cancelReservationDialog").close());
$("#keepReservationBtn").addEventListener("click", () => $("#cancelReservationDialog").close());
$("#cancelReservationDialog").addEventListener("click", event => {
  if (event.target === $("#cancelReservationDialog")) $("#cancelReservationDialog").close();
});
$("#confirmCancelReservationBtn").addEventListener("click", cancelPendingReservation);

async function cancelPendingReservation() {
  if (!pendingCancellation) return;
  const reservation = pendingCancellation;
  const confirmButton = $("#confirmCancelReservationBtn");
  confirmButton.disabled = true;
  confirmButton.textContent = "A cancelar...";

  const reservationRef = doc(db, "reservations", reservation.id);
  const slotIds = Array.isArray(reservation.slotIds) && reservation.slotIds.length
    ? reservation.slotIds
    : [reservation.slotId || makeSlotId(reservation.resourceId, reservation.date, reservation.startTime)];
  const lockRefs = slotIds.map(slotId => doc(db, "reservationSlots", slotId));

  try {
    await runTransaction(db, async transaction => {
      const reservationSnapshot = await transaction.get(reservationRef);
      const lockSnapshots = await Promise.all(lockRefs.map(ref => transaction.get(ref)));
      if (!reservationSnapshot.exists()) throw new Error("RESERVATION_NOT_FOUND");
      const currentReservation = reservationSnapshot.data();
      if (currentReservation.status !== "ativa") throw new Error("ALREADY_CANCELLED");
      if (currentReservation.userId !== currentUser.uid && currentProfile?.role !== "gestor") {
        throw new Error("NOT_OWNER");
      }

      transaction.update(reservationRef, {
        status: "cancelada",
        cancelledAt: serverTimestamp()
      });

      lockSnapshots.forEach((snapshot, index) => {
        if (snapshot.exists()) transaction.delete(lockRefs[index]);
      });
    });

    pendingCancellation = null;
    $("#cancelReservationDialog").close();
    showNotice("Reserva cancelada. Os horários e a unidade voltaram a ficar disponíveis.");
    await loadData();
    if ($("#resourceDialog").open) await refreshDialogSlots();
  } catch (error) {
    console.error("Erro ao cancelar reserva:", error);
    showNotice(error.code === "permission-denied"
      ? "Não tens permissão para cancelar esta reserva. Confirma as regras do Firestore."
      : "Não foi possível cancelar a reserva. Atualiza a página e tenta novamente.", true);
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = "Cancelar reserva";
  }
}

// ---------------------- Gestão de recursos (gestor) ----------------------

function updateResourceFieldLabels() {
  const isEquipment = $("#resourceType").value === "equipamento";
  $("#resourceLocationField").hidden = isEquipment;
  $("#resourceLocation").required = !isEquipment;
  $("#resourceCapacityLabel").textContent = isEquipment
    ? "Número de unidades"
    : "Capacidade (lugares, opcional)";
  $("#resourceCapacity").required = isEquipment;
  $("#resourceCapacity").placeholder = isEquipment ? "Ex.: 4 unidades" : "Número de lugares";
  if (isEquipment) $("#resourceLocation").value = "";
}

$("#resourceType").addEventListener("change", updateResourceFieldLabels);
updateResourceFieldLabels();

$("#resourceForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (currentProfile?.role !== "gestor") return;

  const errorBox = $("#resourceError");
  errorBox.hidden = true;
  const name = $("#resourceName").value.trim();
  const type = $("#resourceType").value;
  const location = type === "sala" ? $("#resourceLocation").value.trim() : "";
  const capacityText = $("#resourceCapacity").value.trim();
  const capacity = capacityText ? Number(capacityText) : null;

  if (!name || !["sala", "equipamento"].includes(type) || (type === "sala" && !location)) {
    showFormError(errorBox, "Preenche o nome e o tipo. Para uma sala, indica também o piso/localização.");
    return;
  }
  if (type === "equipamento" && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
    showFormError(errorBox, "Indica o número total de unidades do equipamento, entre 1 e 1000.");
    return;
  }
  if (type === "sala" && capacityText && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
    showFormError(errorBox, "A capacidade da sala deve ser um número inteiro entre 1 e 1000.");
    return;
  }

  const saveButton = $("#saveResourceBtn");
  const wasEditing = Boolean(editingResourceId);
  saveButton.disabled = true;
  saveButton.textContent = "A guardar...";
  const fields = {
    name, type, location, capacity,
    description: $("#resourceDescription").value.trim(),
    active: $("#resourceActive").checked,
    updatedAt: serverTimestamp()
  };

  try {
    if (editingResourceId) {
      await updateDoc(doc(db, "resources", editingResourceId), fields);
      showNotice("Recurso atualizado com sucesso.");
    } else {
      await setDoc(doc(collection(db, "resources")), { ...fields, createdAt: serverTimestamp() });
      showNotice("Recurso adicionado com sucesso.");
    }
    resetResourceForm();
    await loadData();
  } catch (error) {
    console.error("Erro ao guardar recurso:", error);
    showFormError(errorBox, error.code === "permission-denied"
      ? "Só um gestor pode alterar recursos. Confirma as regras e o papel desta conta."
      : "Não foi possível guardar o recurso. Confirma os dados e tenta novamente.");
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = wasEditing ? "Guardar recurso" : "Guardar recurso";
  }
});

$("#managerResourceList").addEventListener("click", async event => {
  if (currentProfile?.role !== "gestor") return;
  const editButton = event.target.closest("[data-edit-resource]");
  const toggleButton = event.target.closest("[data-toggle-resource]");

  if (editButton) {
    const resource = resources.find(item => item.id === editButton.dataset.editResource);
    if (!resource) return;
    editingResourceId = resource.id;
    $("#editingResourceId").value = resource.id;
    $("#resourceName").value = resource.name ?? "";
    $("#resourceType").value = resource.type ?? "sala";
    updateResourceFieldLabels();
    $("#resourceLocation").value = resource.location ?? "";
    $("#resourceCapacity").value = resource.capacity ?? (resource.type === "equipamento" ? 1 : "");
    $("#resourceDescription").value = resource.description ?? "";
    $("#resourceActive").checked = resource.active === true;
    $("#resourceFormTitle").textContent = "Editar recurso";
    $("#saveResourceBtn").textContent = "Guardar alterações";
    $("#cancelEditBtn").hidden = false;
    $("#resourceForm").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (toggleButton) {
    const resource = resources.find(item => item.id === toggleButton.dataset.toggleResource);
    if (!resource) return;
    toggleButton.disabled = true;
    try {
      await updateDoc(doc(db, "resources", resource.id), {
        active: resource.active !== true,
        updatedAt: serverTimestamp()
      });
      showNotice(resource.active ? "Recurso desativado. As reservas antigas foram preservadas." : "Recurso reativado.");
      await loadData();
    } catch (error) {
      console.error("Erro ao alterar estado do recurso:", error);
      showNotice("Não foi possível alterar o estado do recurso.", true);
      toggleButton.disabled = false;
    }
  }
});

function renderManagerResources() {
  const list = $("#managerResourceList");
  $("#managerResourceCount").textContent = String(resources.length);
  if (!resources.length) {
    list.innerHTML = '<div class="empty-state"><strong>Sem recursos registados</strong>Usa o formulário para adicionar a primeira sala ou equipamento.</div>';
    return;
  }
  list.replaceChildren(...resources.map(resource => {
    const row = document.createElement("article");
    row.className = "manager-resource-row";
    const equipment = resource.type === "equipamento";
    row.innerHTML = `
      <span class="resource-symbol ${equipment ? "equipment" : ""}" aria-hidden="true">${equipment ? "▣" : "▦"}</span>
      <div class="manager-resource-name"><strong>${escapeHtml(resource.name || "Recurso sem nome")}</strong><small>${escapeHtml(equipment ? "Equipamento móvel" : (resource.location || "Sem localização"))} · ${equipment ? `${getResourceUnitCount(resource)} unidades` : "Sala"} · ${resource.active ? "Ativo" : "Desativado"}</small></div>
      <div class="manager-row-actions"><button class="mini-button" type="button" data-edit-resource="${escapeHtml(resource.id)}">Editar</button><button class="mini-button ${resource.active ? "mini-danger" : ""}" type="button" data-toggle-resource="${escapeHtml(resource.id)}">${resource.active ? "Desativar" : "Ativar"}</button></div>`;
    return row;
  }));
}

function resetResourceForm() {
  editingResourceId = "";
  $("#editingResourceId").value = "";
  $("#resourceForm").reset();
  $("#resourceActive").checked = true;
  $("#resourceFormTitle").textContent = "Adicionar recurso";
  $("#saveResourceBtn").textContent = "Guardar recurso";
  $("#cancelEditBtn").hidden = true;
  $("#resourceError").hidden = true;
  updateResourceFieldLabels();
}

$("#cancelEditBtn").addEventListener("click", resetResourceForm);

// ---------------------- Gestão de utilizadores (gestor) ----------------------

function renderManagerUsers() {
  const list = $("#managerUsersList");
  $("#managerUserCount").textContent = String(userProfiles.length);
  if (!userProfiles.length) {
    list.innerHTML = '<div class="empty-state"><strong>Não existem perfis registados</strong>As contas aparecem aqui quando têm um documento na coleção users do Firestore.</div>';
    return;
  }
  list.replaceChildren(...userProfiles.map(profile => {
    const row = document.createElement("article");
    row.className = "manager-user-row";
    const isManager = profile.role === "gestor";
    const isSelf = profile.id === currentUser.uid;
    const label = profile.displayName || (profile.email ? profile.email.split("@")[0] : `Utilizador ${profile.id.slice(0, 6)}`);
    row.innerHTML = `
      <div class="user-avatar">${escapeHtml(initialsFor(label))}</div>
      <div class="manager-user-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(profile.email || "Sem email no perfil")}${isSelf ? " · A tua conta" : ""}</small></div>
      <span class="user-role-badge ${isManager ? "manager-role" : ""}">${isManager ? "Gestor" : "Utilizador"}</span>
      <button class="mini-button ${isManager ? "mini-danger" : ""}" type="button" data-toggle-role="${escapeHtml(profile.id)}" data-next-role="${isManager ? "utilizador" : "gestor"}" ${isSelf ? 'disabled title="Não podes alterar o teu próprio perfil"' : ""}>${isManager ? "Retirar papel" : "Tornar gestor"}</button>`;
    return row;
  }));
}

$("#managerUsersList").addEventListener("click", async event => {
  const button = event.target.closest("[data-toggle-role]");
  if (!button || currentProfile?.role !== "gestor") return;
  const profileId = button.dataset.toggleRole;
  if (profileId === currentUser.uid) {
    showNotice("Não podes alterar as tuas próprias permissões.", true);
    return;
  }
  const profile = userProfiles.find(item => item.id === profileId);
  if (!profile) return;
  const nextRole = button.dataset.nextRole;
  const label = profile.displayName || profile.email || "este utilizador";
  const confirmation = nextRole === "gestor"
    ? `Queres dar permissões de gestor a ${label}?`
    : `Queres retirar as permissões de gestor a ${label}?`;
  if (!window.confirm(confirmation)) return;

  button.disabled = true;
  button.textContent = "A atualizar...";
  try {
    await updateDoc(doc(db, "users", profileId), {
      role: nextRole,
      updatedAt: serverTimestamp()
    });
    showNotice(nextRole === "gestor" ? "O utilizador foi promovido a gestor." : "As permissões de gestor foram retiradas.");
    await loadData();
  } catch (error) {
    console.error("Erro ao alterar papel do utilizador:", error);
    showNotice(error.code === "permission-denied"
      ? "O Firestore bloqueou a alteração. Confirma as regras e o papel desta conta."
      : "Não foi possível alterar o perfil. Tenta novamente.", true);
    button.disabled = false;
    button.textContent = nextRole === "gestor" ? "Tornar gestor" : "Retirar papel";
  }
});

// ---------------------- Filtros, navegação e sessão ----------------------

$$("[data-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.view)));
$$("[data-go-view]").forEach(button => button.addEventListener("click", () => showView(button.dataset.goView)));
$$("[data-filter]").forEach(button => button.addEventListener("click", () => {
  activeFilter = button.dataset.filter;
  $$("[data-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderResources();
}));
$$("[data-manager-reservation-filter]").forEach(button => button.addEventListener("click", () => {
  managerReservationFilter = button.dataset.managerReservationFilter;
  $$("[data-manager-reservation-filter]").forEach(item => item.classList.toggle("active", item === button));
  renderManagerReservations();
}));

$("#mobileMenuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("mobile-open"));
$("#logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
    window.location.replace("./index.html");
  } catch (error) {
    console.error("Erro ao terminar sessão:", error);
    showNotice("Não foi possível terminar sessão. Tenta novamente.", true);
  }
});

function showView(name) {
  const manager = currentProfile?.role === "gestor";
  const managerViews = ["manager-reservations", "manage-resources", "manage-users"];
  // Os gestores podem reservar recursos, mas a lista pessoal fica reservada aos utilizadores.
  const userOnlyViews = ["reservations"];
  if ((!manager && managerViews.includes(name)) || (manager && userOnlyViews.includes(name))) name = "home";
  $$(".page-view").forEach(view => {
    const active = view.id === `view-${name}`;
    view.classList.toggle("active", active);
    view.hidden = !active;
  });
  $$("[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $("#pageTitle").textContent = viewTitles[name] ?? "CampusReserva";
  $("#sidebar").classList.remove("mobile-open");
}

function renderManagerReservations() {
  if (currentProfile?.role !== "gestor") return;
  const list = $("#managerReservationsList");
  const filtered = [...reservations]
    .filter(item => managerReservationFilter === "todas" || item.status === managerReservationFilter)
    .sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));
  $("#managerReservationsCount").textContent = `${filtered.length} ${filtered.length === 1 ? "reserva" : "reservas"}`;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state"><strong>Não existem reservas neste filtro</strong>As reservas serão apresentadas aqui com o recurso, utilizador, data e estado.</div>';
    return;
  }
  list.replaceChildren(...filtered.map(reservation => createReservationRow(reservation, true)));
}

function showNotice(message, isError = false) {
  const notice = $("#globalNotice");
  notice.textContent = message;
  notice.classList.toggle("error", isError);
  notice.hidden = false;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { notice.hidden = true; }, 6500);
}

function showFormError(element, message) {
  element.textContent = message;
  element.hidden = false;
}

function getProfileLabel(uid) {
  const profile = userProfiles.find(item => item.id === uid);
  if (!profile) return `Conta ${String(uid || "").slice(0, 8)}`;
  return profile.displayName || profile.email || `Conta ${profile.id.slice(0, 8)}`;
}

function initialsFor(value) {
  return String(value || "CR").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "CR";
}

function makeTimeSlots() {
  const slots = [];
  for (let minutes = 8 * 60; minutes <= 21 * 60 + 30; minutes += 30) {
    slots.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return slots;
}

function makeSlotId(resourceId, date, time) {
  return `${resourceId}_${date}_${time}`;
}

function makeResourceSlotId(resourceId, date, time, resourceType, unitNumber) {
  return resourceType === "equipamento"
    ? `${resourceId}_${date}_${time}_unit_${unitNumber}`
    : makeSlotId(resourceId, date, time);
}

function getResourceUnitCount(resource) {
  if (resource.type !== "equipamento") return 1;
  const count = resource.capacity;
  return Number.isInteger(count) && count >= 1 ? count : 1;
}

function getAvailableUnitNumbers(resource, date, times, locks) {
  if (!Array.isArray(times) || times.length === 0) return [];
  const totalUnits = getResourceUnitCount(resource);
  const freeUnits = [];
  for (let unit = 1; unit <= totalUnits; unit++) {
    const isFree = times.every(time => !locks.some(lock =>
      lock.resourceId === resource.id &&
      lock.date === date &&
      lock.startTime === time &&
      Number(lock.unitNumber ?? 1) === unit
    ));
    if (isFree) freeUnits.push(unit);
  }
  return freeUnits;
}

function clockMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return NaN;
  return hours * 60 + minutes;
}

function getSlotTimesForRange(startTime, endTime) {
  if (!TIME_SLOTS.includes(startTime)) return null;

  const startMinutes = clockMinutes(startTime);
  const endMinutes = clockMinutes(endTime);
  const durationMinutes = endMinutes - startMinutes;

  if (
    !Number.isInteger(durationMinutes) ||
    ![30, 60, 90, 120, 150, 180].includes(durationMinutes) ||
    endMinutes > clockMinutes("22:00")
  ) {
    return null;
  }

  const times = [];
  for (let minutes = startMinutes; minutes < endMinutes; minutes += 30) {
    const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    if (!TIME_SLOTS.includes(time)) return null;
    times.push(time);
  }

  return times.length === durationMinutes / 30 ? times : null;
}

function getNextBookableTime() {
  const date = localDateString(new Date());
  return TIME_SLOTS.find(time => !isPastSlot(date, time)) || null;
}

function getReservationDuration(reservation) {
  const duration = Number(reservation.durationMinutes || 30);
  return [30, 60, 90, 120, 150, 180].includes(duration) ? duration : 30;
}

function getReservationEndTime(reservation) {
  return reservation.endTime || addMinutes(reservation.startTime || "08:00", getReservationDuration(reservation));
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0) return hours === 1 ? "1 hora" : `${hours} horas`;
  return `${hours} h ${remainingMinutes} min`;
}

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isValidDateString(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function parseLocalDate(value) {
  if (!isValidDateString(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getSlotDate(reservation) {
  const date = parseLocalDate(reservation.date);
  if (!date || !reservation.startTime) return new Date(0);
  const [hours, minutes] = reservation.startTime.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function isPastSlot(dateValue, time) {
  const date = parseLocalDate(dateValue);
  if (!date) return true;
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date <= new Date();
}

function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes + minutesToAdd;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function findResourceName(id) {
  return resources.find(item => item.id === id)?.name ?? "Recurso";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}
