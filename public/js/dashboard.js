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
let activeFilter = "todos";
let managerReservationFilter = "todas";
let editingResourceId = "";
let selectedResourceId = "";
let selectedReservationTime = "";

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
$("#todayLabel").textContent = new Intl.DateTimeFormat("pt-PT", {
  weekday: "short", day: "numeric", month: "short", year: "numeric"
}).format(new Date());

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.replace("/index.html");
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
    $("#loadingPanel").innerHTML = "<p>Não foi possível carregar os dados. Confirma as regras do Firestore e tenta atualizar a página.</p>";
  }
});

async function loadProfile() {
  const profileRef = doc(db, "users", currentUser.uid);
  let profileSnapshot = await getDoc(profileRef);
  if (!profileSnapshot.exists()) {
    await setDoc(profileRef, {
      uid: currentUser.uid,
      email: currentUser.email ?? "",
      displayName: currentUser.displayName ?? "",
      role: "utilizador",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    profileSnapshot = await getDoc(profileRef);
  }

  currentProfile = profileSnapshot.data() ?? { role: "utilizador" };
  const emailName = (currentUser.email ?? "utilizador").split("@")[0].replace(/[._-]+/g, " ");
  const displayName = (currentProfile.displayName || emailName || "Utilizador").trim();
  const firstName = displayName.split(/\s+/)[0];
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "CR";
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

  const requests = [getDocs(resourcesQuery), getDocs(reservationsQuery)];
  if (isManager) requests.push(getDocs(collection(db, "users")));
  const results = await Promise.all(requests);
  const resourceSnapshot = results[0];
  const reservationSnapshot = results[1];
  const userSnapshot = isManager ? results[2] : null;

  resources = resourceSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  reservations = reservationSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() }));
  userProfiles = userSnapshot ? userSnapshot.docs.map(snapshot => ({ id: snapshot.id, ...snapshot.data() })) : [];
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
  const activeFuture = reservations.filter(item => item.status === "ativa" && getSlotDate(item) >= new Date()).length;
  const activeResources = resources.filter(item => item.active === true);
  $("#userStatReservations").textContent = String(activeFuture);
  $("#userStatRooms").textContent = String(activeResources.filter(item => item.type === "sala").length);
  $("#userStatEquipment").textContent = String(activeResources.filter(item => item.type === "equipamento").length);

  if (currentProfile?.role === "gestor") {
    $("#managerStatResources").textContent = String(activeResources.length);
    $("#managerStatReservations").textContent = String(reservations.filter(item => item.status === "ativa").length);
    $("#managerStatUsers").textContent = String(userProfiles.length);
    $("#managerStatManagers").textContent = String(userProfiles.filter(item => item.role === "gestor").length);
  }
}

function renderResources() {
  const visible = resources.filter(resource => resource.active === true && (activeFilter === "todos" || resource.type === activeFilter));
  renderResourceCards($("#resourceGrid"), visible);
  renderResourceCards($("#homeResourceGrid"), visible);
}

function renderResourceCards(grid, visible) {
  if (!grid) return;
  if (!visible.length) {
    grid.innerHTML = '<div class="empty-state empty-state-wide"><strong>Ainda não existem recursos nesta categoria</strong>Quando o gestor registar salas ou equipamentos, estes aparecerão aqui.</div>';
    return;
  }
  grid.replaceChildren(...visible.map(resource => {
    const card = document.createElement("article");
    card.className = "resource-card";
    const isRoom = resource.type === "sala";
    card.innerHTML = `
      <div class="resource-card-top">
        <span class="resource-symbol ${isRoom ? "" : "equipment"}" aria-hidden="true">${isRoom ? "▦" : "▣"}</span>
        <span class="resource-tag">Ativo</span>
      </div>
      <h3>${escapeHtml(resource.name || "Recurso sem nome")}</h3>
      <p>${escapeHtml(resource.description || (isRoom ? "Espaço disponível para reserva por horário." : "Equipamento eletrónico disponível para reserva."))}</p>
      <div class="resource-meta"><span>⌖ ${escapeHtml(resource.location || "Localização a definir")}</span>${resource.capacity ? `<span>♙ ${escapeHtml(String(resource.capacity))} ${isRoom ? "lugares" : "unidades"}</span>` : ""}</div>
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
  item.innerHTML = `
    <div class="date-tile"><strong>${date ? date.getDate() : "—"}</strong><small>${date ? date.toLocaleDateString("pt-PT", { month: "short" }) : "—"}</small></div>
    <div class="compact-reservation-main"><strong>${escapeHtml(reservation.resourceName || findResourceName(reservation.resourceId))}</strong><small>${escapeHtml(reservation.date || "")} · ${escapeHtml(reservation.startTime || "—")}–${escapeHtml(addThirtyMinutes(reservation.startTime || "08:00"))}${managerMode ? ` · ${escapeHtml(owner)}` : ""}</small></div>
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
  row.innerHTML = `
    <div class="date-tile"><strong>${date ? date.getDate() : "—"}</strong><small>${date ? date.toLocaleDateString("pt-PT", { month: "short" }) : "—"}</small></div>
    <div class="reservation-details"><h3>${escapeHtml(reservation.resourceName || findResourceName(reservation.resourceId))}</h3><p>${escapeHtml(reservation.date || "Data por definir")} · ${escapeHtml(reservation.startTime || "—")}–${escapeHtml(addThirtyMinutes(reservation.startTime || "08:00"))}<br>${reservation.resourceType === "sala" ? "Sala" : "Equipamento"}${managerMode ? `<br><span class="reservation-owner">Reservado por: ${escapeHtml(owner)}</span>` : ""}</p></div>
    <div class="reservation-actions"><span class="status-pill ${cancelled ? "cancelled" : ""}">${cancelled ? "Cancelada" : "Ativa"}</span>${canCancel ? `<button class="cancel-button" type="button" data-cancel-id="${escapeHtml(reservation.id)}">Cancelar</button>` : ""}</div>`;
  return row;
}

// ---------------------- Modal e disponibilidade ----------------------

async function openResourceDialog(resourceId) {
  if (currentProfile?.role !== "utilizador") return;
  const resource = resources.find(item => item.id === resourceId && item.active === true);
  if (!resource) return;
  selectedResourceId = resourceId;
  selectedReservationTime = "";
  $("#dialogResourceName").textContent = resource.name || "Recurso";
  $("#dialogResourceMeta").textContent = `${resource.type === "sala" ? "Sala" : "Equipamento eletrónico"} · ${resource.location || "Localização a definir"}${resource.capacity ? ` · ${resource.capacity} ${resource.type === "sala" ? "lugares" : "unidades"}` : ""}`;
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
  const date = $("#dialogDate").value;
  const grid = $("#slotGrid");
  selectedReservationTime = "";
  updateSelectedSlotLabel();
  $("#dialogError").hidden = true;

  if (!selectedResourceId || !date) {
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
    // Uma consulta ao Firestore recolhe os bloqueios deste recurso/data; os horários ocupados ficam visíveis a vermelho.
    const lockQuery = query(
      collection(db, "reservationSlots"),
      where("resourceId", "==", selectedResourceId),
      where("date", "==", date)
    );
    const snapshot = await getDocs(lockQuery);
    // Se a pessoa mudou a data enquanto a consulta decorria, não mostrar o resultado antigo.
    if (date !== $("#dialogDate").value || !$("#resourceDialog").open) return;
    const occupiedTimes = new Set(snapshot.docs.map(item => item.data().startTime));
    const now = new Date();
    let availableCount = 0;

    grid.replaceChildren(...TIME_SLOTS.map(time => {
      const occupied = occupiedTimes.has(time);
      const passed = isPastSlot(date, time);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slot-button ${occupied ? "slot-occupied" : passed ? "slot-past" : "slot-free"}`;
      button.dataset.slotTime = time;
      if (occupied) {
        button.innerHTML = `<strong>${time}</strong><small>Ocupado</small>`;
        button.setAttribute("aria-label", `${time}, horário ocupado`);
        // Não fica disabled: ao clicar, mostramos explicitamente o aviso de que já está ocupado.
      } else if (passed) {
        button.innerHTML = `<strong>${time}</strong><small>Passado</small>`;
        button.disabled = true;
        button.setAttribute("aria-label", `${time}, horário passado`);
      } else {
        button.innerHTML = `<strong>${time}</strong><small>Disponível</small>`;
        button.setAttribute("aria-label", `${time}, horário disponível`);
        availableCount++;
      }
      if (!occupied && !passed) {
        button.addEventListener("click", () => selectSlot(time));
      } else if (occupied) {
        button.addEventListener("click", () => {
          selectedReservationTime = "";
          $$("#slotGrid .slot-button").forEach(slotButton => slotButton.classList.remove("slot-selected"));
          updateSelectedSlotLabel();
          $("#dialogError").textContent = `O horário das ${time} já está ocupado. Escolhe outro horário para continuar.`;
          $("#dialogError").hidden = false;
        });
      }
      return button;
    }));

    $("#dialogAvailabilityMessage").textContent = availableCount
      ? `${availableCount} horários disponíveis. Cada intervalo corresponde a 30 minutos.`
      : "Não existem horários livres nesta data. Escolhe outro dia.";
  } catch (error) {
    console.error("Erro ao consultar a disponibilidade:", error);
    grid.innerHTML = '<div class="empty-state empty-state-wide"><strong>Não foi possível consultar os horários</strong>Confirma as regras de leitura de reservationSlots no Firestore e tenta novamente.</div>';
    $("#dialogAvailabilityMessage").textContent = "Erro ao consultar disponibilidade.";
  }
}

function selectSlot(time) {
  selectedReservationTime = time;
  $$(".slot-button").forEach(button => button.classList.toggle("slot-selected", button.dataset.slotTime === time));
  $("#dialogError").hidden = true;
  updateSelectedSlotLabel();
}

function updateSelectedSlotLabel() {
  const label = $("#selectedSlotLabel");
  const button = $("#confirmReservationBtn");
  label.textContent = selectedReservationTime
    ? `${selectedReservationTime} – ${addThirtyMinutes(selectedReservationTime)} (30 minutos)`
    : "Nenhum horário selecionado";
  button.disabled = !selectedReservationTime;
  button.textContent = selectedReservationTime ? `Reservar ${selectedReservationTime}` : "Confirmar reserva";
}

$("#dialogDate").addEventListener("change", refreshDialogSlots);
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
  if (currentProfile?.role !== "utilizador" || !selectedResourceId || !selectedReservationTime) return;
  const resource = resources.find(item => item.id === selectedResourceId && item.active === true);
  const date = $("#dialogDate").value;
  const startTime = selectedReservationTime;
  if (!resource || !date || date < localDateString(new Date()) || isPastSlot(date, startTime)) {
    $("#dialogError").textContent = "Este horário já não pode ser reservado. Escolhe outra data ou hora.";
    $("#dialogError").hidden = false;
    await refreshDialogSlots();
    return;
  }

  const slotId = makeSlotId(resource.id, date, startTime);
  const lockRef = doc(db, "reservationSlots", slotId);
  const resourceRef = doc(db, "resources", resource.id);
  const reservationRef = doc(collection(db, "reservations"));
  const confirmButton = $("#confirmReservationBtn");
  confirmButton.disabled = true;
  confirmButton.textContent = "A confirmar...";
  $("#dialogError").hidden = true;

  try {
    // O bloqueio e a reserva são escritos numa única transação. O documento do bloqueio impede reservas simultâneas duplicadas.
    await runTransaction(db, async transaction => {
      const [lockSnapshot, resourceSnapshot] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(resourceRef)
      ]);
      if (lockSnapshot.exists()) throw new Error("SLOT_ALREADY_BOOKED");
      if (!resourceSnapshot.exists() || resourceSnapshot.data().active !== true) throw new Error("RESOURCE_UNAVAILABLE");
      const latestResource = resourceSnapshot.data();
      transaction.set(reservationRef, {
        userId: currentUser.uid,
        resourceId: resource.id,
        resourceName: latestResource.name,
        resourceType: latestResource.type,
        date,
        startTime,
        slotId,
        status: "ativa",
        createdAt: serverTimestamp()
      });
      transaction.set(lockRef, { reservationId: reservationRef.id, resourceId: resource.id, date, startTime });
    });

    $("#resourceDialog").close();
    showNotice(`Reserva criada: ${resource.name}, ${date}, às ${startTime}.`);
    await loadData();
  } catch (error) {
    console.error("Erro ao criar reserva:", error);
    if (error.message === "SLOT_ALREADY_BOOKED") {
      $("#dialogError").textContent = "Este horário já está ocupado. Outra pessoa acabou de reservar este período; escolhe outro horário.";
      $("#dialogError").hidden = false;
      await refreshDialogSlots();
      // Preserva o aviso após atualizar a grelha.
      $("#dialogError").textContent = "Este horário já está ocupado. Escolhe outro horário.";
      $("#dialogError").hidden = false;
    } else if (error.message === "RESOURCE_UNAVAILABLE") {
      $("#dialogError").textContent = "Este recurso foi desativado pelo gestor e já não pode ser reservado.";
      $("#dialogError").hidden = false;
      await loadData();
    } else if (error.code === "permission-denied") {
      $("#dialogError").textContent = "A reserva foi bloqueada pelas regras de segurança do Firestore. Confirma a configuração das regras.";
      $("#dialogError").hidden = false;
    } else {
      $("#dialogError").textContent = "Não foi possível criar a reserva. Atualiza os horários e tenta novamente.";
      $("#dialogError").hidden = false;
    }
  } finally {
    confirmButton.textContent = selectedReservationTime ? `Reservar ${selectedReservationTime}` : "Confirmar reserva";
    confirmButton.disabled = !selectedReservationTime;
  }
});

// ---------------------- Cancelamento de reservas ----------------------

$("#userReservationsList").addEventListener("click", event => handleCancelClick(event, false));
$("#managerReservationsList").addEventListener("click", event => handleCancelClick(event, true));

async function handleCancelClick(event, managerMode) {
  const button = event.target.closest("[data-cancel-id]");
  if (!button) return;
  const reservation = reservations.find(item => item.id === button.dataset.cancelId);
  if (!reservation || reservation.status !== "ativa") return;
  const isManager = currentProfile?.role === "gestor";
  if ((!managerMode && reservation.userId !== currentUser.uid) || (managerMode && !isManager)) return;
  const ownerLabel = isManager ? ` (utilizador: ${getProfileLabel(reservation.userId)})` : "";
  if (!window.confirm(`Queres cancelar a reserva de ${reservation.resourceName || "recurso"} em ${reservation.date}, às ${reservation.startTime}${ownerLabel}?`)) return;

  button.disabled = true;
  button.textContent = "A cancelar...";
  try {
    const reservationRef = doc(db, "reservations", reservation.id);
    const lockRef = doc(db, "reservationSlots", reservation.slotId || makeSlotId(reservation.resourceId, reservation.date, reservation.startTime));
    await runTransaction(db, async transaction => {
      const [reservationSnapshot, lockSnapshot] = await Promise.all([
        transaction.get(reservationRef),
        transaction.get(lockRef)
      ]);
      if (!reservationSnapshot.exists()) throw new Error("RESERVATION_NOT_FOUND");
      const data = reservationSnapshot.data();
      const canManageThisReservation = currentProfile?.role === "gestor" || data.userId === currentUser.uid;
      if (!canManageThisReservation) throw new Error("NOT_OWNER");
      if (data.status !== "ativa") throw new Error("ALREADY_CANCELLED");
      transaction.update(reservationRef, { status: "cancelada", cancelledAt: serverTimestamp() });
      if (lockSnapshot.exists()) transaction.delete(lockRef);
    });
    showNotice("Reserva cancelada. O horário voltou a ficar disponível.");
    await loadData();
    if ($("#resourceDialog").open) await refreshDialogSlots();
  } catch (error) {
    console.error("Erro ao cancelar reserva:", error);
    showNotice(error.code === "permission-denied"
      ? "Não tens permissão para cancelar esta reserva. Confirma as regras do Firestore."
      : "Não foi possível cancelar a reserva. Atualiza a página e tenta novamente.", true);
    button.disabled = false;
    button.textContent = "Cancelar";
  }
}

// ---------------------- Gestão de recursos (gestor) ----------------------

$("#resourceForm").addEventListener("submit", async event => {
  event.preventDefault();
  if (currentProfile?.role !== "gestor") return;
  const errorBox = $("#resourceError");
  errorBox.hidden = true;
  const name = $("#resourceName").value.trim();
  const type = $("#resourceType").value;
  const location = $("#resourceLocation").value.trim();
  const capacityText = $("#resourceCapacity").value.trim();
  const capacity = capacityText ? Number(capacityText) : null;
  if (!name || !location || !["sala", "equipamento"].includes(type)) {
    showFormError(errorBox, "Preenche o nome, o tipo e a localização.");
    return;
  }
  if (capacityText && (!Number.isInteger(capacity) || capacity < 1 || capacity > 1000)) {
    showFormError(errorBox, "A capacidade tem de ser um número inteiro entre 1 e 1000.");
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
      ? "Só um gestor pode alterar recursos. Confirma o papel deste utilizador no Firestore."
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
    $("#resourceLocation").value = resource.location ?? "";
    $("#resourceCapacity").value = resource.capacity ?? "";
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
      await updateDoc(doc(db, "resources", resource.id), { active: resource.active !== true, updatedAt: serverTimestamp() });
      showNotice(resource.active ? "Recurso desativado. As reservas antigas foram preservadas." : "Recurso reativado.");
      await loadData();
    } catch (error) {
      console.error("Erro ao alterar estado do recurso:", error);
      showNotice("Não foi possível alterar o estado do recurso.", true);
      toggleButton.disabled = false;
    }
  }
});

$("#cancelEditBtn").addEventListener("click", resetResourceForm);

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
    row.innerHTML = `
      <span class="resource-symbol ${resource.type === "sala" ? "" : "equipment"}" aria-hidden="true">${resource.type === "sala" ? "▦" : "▣"}</span>
      <div class="manager-resource-name"><strong>${escapeHtml(resource.name || "Recurso sem nome")}</strong><small>${escapeHtml(resource.location || "Sem localização")} · ${resource.active ? "Ativo" : "Desativado"}</small></div>
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
}

// ---------------------- Gestão de perfis (gestor) ----------------------

function renderManagerUsers() {
  const list = $("#managerUsersList");
  $("#managerUserCount").textContent = String(userProfiles.length);
  if (!userProfiles.length) {
    list.innerHTML = '<div class="empty-state"><strong>Não existem perfis registados</strong>As contas serão listadas depois do primeiro login na aplicação.</div>';
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
      <button class="mini-button ${isManager ? "mini-danger" : ""}" type="button" data-toggle-role="${escapeHtml(profile.id)}" data-next-role="${isManager ? "utilizador" : "gestor"}" ${isSelf ? "disabled title=\"Não podes alterar o teu próprio perfil\"" : ""}>${isManager ? "Retirar papel" : "Tornar gestor"}</button>`;
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
    ? `Queres dar permissões de gestor a ${label}? Esta pessoa poderá gerir recursos, reservas e perfis.`
    : `Queres retirar as permissões de gestor a ${label}? Esta pessoa passará a ter acesso apenas à área de utilizador.`;
  if (!window.confirm(confirmation)) return;

  button.disabled = true;
  button.textContent = "A atualizar...";
  try {
    await updateDoc(doc(db, "users", profileId), { role: nextRole, updatedAt: serverTimestamp() });
    showNotice(nextRole === "gestor" ? "O utilizador foi promovido a gestor." : "As permissões de gestor foram retiradas.");
    await loadData();
  } catch (error) {
    console.error("Erro ao alterar papel do utilizador:", error);
    showNotice(error.code === "permission-denied"
      ? "O Firestore bloqueou a alteração. Publica as regras atualizadas e confirma que continuas a ser gestor."
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
    window.location.replace("/index.html");
  } catch (error) {
    console.error("Erro ao terminar sessão:", error);
    showNotice("Não foi possível terminar sessão. Tenta novamente.", true);
  }
});

function showView(name) {
  const manager = currentProfile?.role === "gestor";
  const managerViews = ["manager-reservations", "manage-resources", "manage-users"];
  const userViews = ["resources", "reservations"];
  if ((!manager && managerViews.includes(name)) || (manager && userViews.includes(name))) name = "home";
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
    list.innerHTML = '<div class="empty-state"><strong>Não existem reservas neste filtro</strong>Quando existirem reservas, serão apresentadas com o nome do recurso, utilizador, data e estado.</div>';
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
function makeSlotId(resourceId, date, time) { return `${resourceId}_${date}_${time}`; }
function addThirtyMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const total = hours * 60 + minutes + 30;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
function parseLocalDate(value) {
  if (!value) return null;
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
function isPastSlot(date, time) {
  const target = parseLocalDate(date);
  if (!target) return true;
  const [hours, minutes] = time.split(":").map(Number);
  target.setHours(hours, minutes, 0, 0);
  return target <= new Date();
}
function findResourceName(id) { return resources.find(item => item.id === id)?.name ?? "Recurso"; }
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
