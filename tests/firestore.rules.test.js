// Testes automáticos das Security Rules do CampusReserva (R5).
// Modelo atual: reservas de 30 a 180 minutos, um bloqueio por cada meia hora,
// e equipamentos com várias unidades (capacity = número de unidades).
// Executar:  npm run test:regras
import { readFileSync } from "node:fs";
import { test, describe, before, beforeEach, after } from "node:test";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, writeBatch, serverTimestamp,
} from "firebase/firestore";

const DIA = "2026-11-20";
let env;

before(async () => {
  env = await initializeTestEnvironment({
    // O prefixo "demo-" garante que os testes nunca tocam no projeto real.
    projectId: "demo-campusreserva",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});

// ---------- Utilitários (mesma lógica do dashboard.js) ----------
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const horas = (inicio, minutos) => Array.from({ length: minutos / 30 }, (_, i) => fromMin(toMin(inicio) + 30 * i));
const slotId = (resourceId, date, time, type, unit) =>
  type === "equipamento" ? `${resourceId}_${date}_${time}_unit_${unit}` : `${resourceId}_${date}_${time}`;

const RECURSOS = {
  sala1: { name: "Sala B.2.04", type: "sala" },
  portatil: { name: "Portátil Dell", type: "equipamento" },
  pcAntigo: { name: "Computador antigo", type: "equipamento" },
  projetor: { name: "Projetor Epson", type: "equipamento" },
};

// Dados de uma reserva + os seus bloqueios, exatamente como o dashboard.js os grava.
function dadosReserva(uid, {
  resourceId = "sala1", date = DIA, startTime = "11:00", minutes = 30, unitNumber = 1, id,
  resourceName = RECURSOS[resourceId]?.name, extra = {},
} = {}) {
  const type = RECURSOS[resourceId]?.type ?? "sala";
  const times = horas(startTime, minutes);
  const slotIds = times.map((t) => slotId(resourceId, date, t, type, unitNumber));
  const reservationId = id ?? `res_${uid}_${resourceId}_${startTime}_${unitNumber}`;
  const reservation = {
    userId: uid, resourceId, resourceName, resourceType: type, date, startTime,
    endTime: fromMin(toMin(startTime) + minutes), durationMinutes: minutes, unitNumber,
    slotId: slotIds[0], slotIds, status: "ativa", ...extra,
  };
  const locks = times.map((t, i) => [slotIds[i], { reservationId, resourceId, date, startTime: t, unitNumber }]);
  return { reservationId, reservation, locks };
}

// Cria reserva + bloqueios numa só operação atómica (como a transação do dashboard.js).
function reservar(db, uid, opcoes = {}, { semBloqueios = 0 } = {}) {
  const { reservationId, reservation, locks } = dadosReserva(uid, opcoes);
  const batch = writeBatch(db);
  batch.set(doc(db, "reservations", reservationId), { ...reservation, createdAt: serverTimestamp() });
  locks.slice(0, locks.length - semBloqueios).forEach(([id, data]) => batch.set(doc(db, "reservationSlots", id), data));
  return batch.commit();
}

// Cancela: muda o estado e apaga TODOS os bloqueios na mesma operação.
function cancelar(db, reservationId, slotIds, { manterBloqueios = 0 } = {}) {
  const batch = writeBatch(db);
  batch.update(doc(db, "reservations", reservationId), { status: "cancelada", cancelledAt: serverTimestamp() });
  slotIds.slice(0, slotIds.length - manterBloqueios).forEach((id) => batch.delete(doc(db, "reservationSlots", id)));
  return batch.commit();
}

const EMAILS = { gestor1: "gestor@isla.pt", ana: "ana@isla.pt", rui: "rui@isla.pt" };
const como = (uid) => env.authenticatedContext(uid, { email: EMAILS[uid] ?? `${uid}@isla.pt` }).firestore();
const anonimo = () => env.unauthenticatedContext().firestore();

// Reserva já existente da Ana: Sala B.2.04, 10:00–10:30.
const ANA = dadosReserva("ana", { startTime: "10:00", id: "resAna" });

// Antes de cada teste: base limpa com 1 gestor, 2 utilizadores, 1 sala, 3 equipamentos e a reserva da Ana.
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const perfil = (uid, role) => ({ uid, email: EMAILS[uid], displayName: uid, role });
    await setDoc(doc(db, "users/gestor1"), perfil("gestor1", "gestor"));
    await setDoc(doc(db, "users/ana"), perfil("ana", "utilizador"));
    await setDoc(doc(db, "users/rui"), perfil("rui", "utilizador"));
    await setDoc(doc(db, "resources/sala1"), { name: "Sala B.2.04", type: "sala", location: "Edifício B", capacity: 30, active: true });
    await setDoc(doc(db, "resources/portatil"), { name: "Portátil Dell", type: "equipamento", location: "Reprografia", capacity: 3, active: true });
    await setDoc(doc(db, "resources/pcAntigo"), { name: "Computador antigo", type: "equipamento", location: "Reprografia", capacity: null, active: true });
    await setDoc(doc(db, "resources/projetor"), { name: "Projetor Epson", type: "equipamento", location: "Reprografia", capacity: 1, active: false });
    await setDoc(doc(db, "reservations/resAna"), ANA.reservation);
    for (const [id, data] of ANA.locks) await setDoc(doc(db, "reservationSlots", id), data);
  });
});

after(async () => {
  await env.cleanup();
});

// ---------- Perfis (users) ----------
describe("Perfis", () => {
  test("cria o próprio perfil como utilizador", async () => {
    await assertSucceeds(setDoc(doc(como("novo"), "users/novo"), {
      uid: "novo", email: "novo@isla.pt", displayName: "Novo", role: "utilizador",
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    }));
  });

  test("não se regista como gestor", async () => {
    await assertFails(setDoc(doc(como("novo"), "users/novo"), { uid: "novo", email: "novo@isla.pt", displayName: "Novo", role: "gestor" }));
  });

  test("não cria o perfil de outra pessoa", async () => {
    await assertFails(setDoc(doc(como("novo"), "users/outro"), { uid: "outro", email: "novo@isla.pt", displayName: "X", role: "utilizador" }));
  });

  test("não cria perfil com email diferente do da conta", async () => {
    await assertFails(setDoc(doc(como("novo"), "users/novo"), { uid: "novo", email: "reitor@isla.pt", displayName: "Novo", role: "utilizador" }));
  });

  test("altera o próprio nome visível", async () => {
    await assertSucceeds(updateDoc(doc(como("ana"), "users/ana"), { displayName: "Ana Silva", updatedAt: serverTimestamp() }));
  });

  test("não se promove a gestor", async () => {
    await assertFails(updateDoc(doc(como("ana"), "users/ana"), { role: "gestor" }));
  });

  test("não lê o perfil de outro utilizador", async () => {
    await assertFails(getDoc(doc(como("rui"), "users/ana")));
  });

  test("gestor lê todos os perfis e promove outro utilizador", async () => {
    const db = como("gestor1");
    await assertSucceeds(getDocs(collection(db, "users")));
    await assertSucceeds(updateDoc(doc(db, "users/ana"), { role: "gestor", updatedAt: serverTimestamp() }));
  });

  test("gestor não altera o próprio papel", async () => {
    await assertFails(updateDoc(doc(como("gestor1"), "users/gestor1"), { role: "utilizador" }));
  });

  test("ninguém apaga perfis", async () => {
    await assertFails(deleteDoc(doc(como("gestor1"), "users/ana")));
  });
});

// ---------- Recursos (resources) ----------
const novaSala = (extra = {}) => ({
  name: "Laboratório 3", type: "sala", location: "Edifício A", capacity: 20, description: "PCs",
  active: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), ...extra,
});

describe("Recursos", () => {
  test("sem sessão iniciada não se lê nada", async () => {
    await assertFails(getDoc(doc(anonimo(), "resources/sala1")));
  });

  test("utilizador lê e lista recursos ativos", async () => {
    const db = como("ana");
    await assertSucceeds(getDoc(doc(db, "resources/sala1")));
    await assertSucceeds(getDocs(query(collection(db, "resources"), where("active", "==", true))));
  });

  test("utilizador não vê recursos desativados", async () => {
    await assertFails(getDoc(doc(como("ana"), "resources/projetor")));
  });

  test("utilizador não cria nem edita recursos", async () => {
    await assertFails(setDoc(doc(como("ana"), "resources/novo"), novaSala()));
    await assertFails(updateDoc(doc(como("ana"), "resources/sala1"), { name: "Minha sala" }));
  });

  test("gestor cria sala com e sem capacidade", async () => {
    const db = como("gestor1");
    await assertSucceeds(setDoc(doc(db, "resources/novo1"), novaSala()));
    await assertSucceeds(setDoc(doc(db, "resources/novo2"), novaSala({ capacity: null })));
  });

  test("gestor cria equipamento com número de unidades", async () => {
    await assertSucceeds(setDoc(doc(como("gestor1"), "resources/novo"), novaSala({ type: "equipamento", capacity: 4 })));
  });

  test("equipamento novo tem de indicar o número de unidades", async () => {
    await assertFails(setDoc(doc(como("gestor1"), "resources/novo"), novaSala({ type: "equipamento", capacity: null })));
  });

  test("gestor não grava tipo ou capacidade inválidos", async () => {
    const db = como("gestor1");
    await assertFails(setDoc(doc(db, "resources/x1"), novaSala({ type: "carro" })));
    await assertFails(setDoc(doc(db, "resources/x2"), novaSala({ capacity: "muitos" })));
  });

  test("gestor edita e desativa um recurso antigo sem createdAt", async () => {
    const db = como("gestor1");
    await assertSucceeds(updateDoc(doc(db, "resources/sala1"), { name: "Sala B.2.05", updatedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db, "resources/sala1"), { active: false, updatedAt: serverTimestamp() }));
  });

  test("ninguém apaga recursos (desativa-se para manter o histórico)", async () => {
    await assertFails(deleteDoc(doc(como("gestor1"), "resources/sala1")));
  });
});

// ---------- Reservas (reservations + reservationSlots) ----------
describe("Reservas", () => {
  for (const minutes of [30, 60, 90, 120, 150, 180]) {
    test(`reserva uma sala por ${minutes} minutos`, async () => {
      await assertSucceeds(reservar(como("rui"), "rui", { startTime: "13:00", minutes }));
    });
  }

  for (const minutes of [30, 180]) {
    test(`reserva um equipamento por ${minutes} minutos`, async () => {
      await assertSucceeds(reservar(como("rui"), "rui", { resourceId: "portatil", startTime: "13:00", minutes }));
    });
  }

  test("equipamento antigo sem número de unidades conta como 1 unidade", async () => {
    await assertSucceeds(reservar(como("rui"), "rui", { resourceId: "pcAntigo" }));
    await assertFails(reservar(como("ana"), "ana", { resourceId: "pcAntigo", unitNumber: 2 }));
  });

  test("dois utilizadores reservam unidades diferentes do mesmo equipamento", async () => {
    await assertSucceeds(reservar(como("rui"), "rui", { resourceId: "portatil", unitNumber: 1 }));
    await assertSucceeds(reservar(como("ana"), "ana", { resourceId: "portatil", unitNumber: 2 }));
  });

  test("a mesma unidade no mesmo horário é recusada", async () => {
    await assertSucceeds(reservar(como("rui"), "rui", { resourceId: "portatil", unitNumber: 1 }));
    await assertFails(reservar(como("ana"), "ana", { resourceId: "portatil", unitNumber: 1 }));
  });

  test("unidade acima do número de unidades é recusada", async () => {
    await assertFails(reservar(como("rui"), "rui", { resourceId: "portatil", unitNumber: 4 }));
  });

  test("não há sobreposição: horário ocupado é recusado", async () => {
    await assertFails(reservar(como("rui"), "rui", { startTime: "10:00" }));
  });

  test("sobreposição parcial também é recusada (09:30–10:30 contra 10:00)", async () => {
    await assertFails(reservar(como("rui"), "rui", { startTime: "09:30", minutes: 60 }));
  });

  test("reserva sem todos os bloqueios é recusada", async () => {
    await assertFails(reservar(como("rui"), "rui", { minutes: 90 }, { semBloqueios: 1 }));
  });

  // Grava uma reserva com uma lista de bloqueios escolhida à mão (para tentar enganar as regras).
  function reservarComBloqueios(uid, opcoes, horasDosBloqueios, unidadeDosBloqueios) {
    const db = como(uid);
    const { reservationId, reservation } = dadosReserva(uid, opcoes);
    const type = RECURSOS[reservation.resourceId].type;
    const unit = unidadeDosBloqueios ?? reservation.unitNumber;
    const ids = horasDosBloqueios.map((t) => slotId(reservation.resourceId, reservation.date, t, type, unit));
    const batch = writeBatch(db);
    batch.set(doc(db, "reservations", reservationId), { ...reservation, slotId: ids[0], slotIds: ids, createdAt: serverTimestamp() });
    [...new Set(ids)].forEach((id, i) => batch.set(doc(db, "reservationSlots", id), {
      reservationId, resourceId: reservation.resourceId, date: reservation.date,
      startTime: horasDosBloqueios[i], unitNumber: unit,
    }));
    return batch.commit();
  }

  test("bloqueio fora do intervalo da reserva é recusado", async () => {
    // Reserva 11:00–12:00, mas tenta bloquear 11:00 e 15:00 (deixaria 11:30 livre e ocuparia 15:00).
    await assertFails(reservarComBloqueios("rui", { startTime: "11:00", minutes: 60 }, ["11:00", "15:00"]));
  });

  test("bloqueios repetidos são recusados", async () => {
    await assertFails(reservarComBloqueios("rui", { startTime: "11:00", minutes: 60 }, ["11:00", "11:00"]));
  });

  test("bloqueios de outra unidade são recusados", async () => {
    await assertFails(reservarComBloqueios("rui", { resourceId: "portatil", unitNumber: 1 }, ["11:00"], 2));
  });

  test("hora de fim incoerente é recusada", async () => {
    await assertFails(reservar(como("rui"), "rui", { minutes: 60, extra: { endTime: "15:00" } }));
  });

  test("duração fora da lista é recusada", async () => {
    const { reservationId, reservation, locks } = dadosReserva("rui", { minutes: 30 });
    const db = como("rui");
    const batch = writeBatch(db);
    batch.set(doc(db, "reservations", reservationId), { ...reservation, durationMinutes: 45, endTime: "11:45" });
    locks.forEach(([id, data]) => batch.set(doc(db, "reservationSlots", id), data));
    await assertFails(batch.commit());
  });

  test("não reserva em nome de outra pessoa", async () => {
    await assertFails(reservar(como("rui"), "ana"));
  });

  test("hora fora da grelha de 30 minutos é recusada", async () => {
    await assertFails(reservar(como("rui"), "rui", { startTime: "11:15" }));
  });

  test("data inexistente é recusada", async () => {
    await assertFails(reservar(como("rui"), "rui", { date: "2026-02-30" }));
  });

  test("recurso desativado não é reservável", async () => {
    await assertFails(reservar(como("rui"), "rui", { resourceId: "projetor" }));
  });

  test("nome do recurso falsificado é recusado", async () => {
    await assertFails(reservar(como("rui"), "rui", { resourceName: "Auditório VIP" }));
  });

  test("sem sessão iniciada não se reserva", async () => {
    await assertFails(reservar(anonimo(), "rui"));
  });

  test("utilizador lê as suas reservas mas não as de outros", async () => {
    await assertSucceeds(getDocs(query(collection(como("ana"), "reservations"), where("userId", "==", "ana"))));
    await assertFails(getDoc(doc(como("rui"), "reservations/resAna")));
  });

  test("qualquer utilizador vê a ocupação (bloqueios sem dados pessoais)", async () => {
    await assertSucceeds(getDocs(query(collection(como("rui"), "reservationSlots"),
      where("resourceId", "==", "sala1"), where("date", "==", DIA))));
  });

  test("gestor lê todas as reservas", async () => {
    await assertSucceeds(getDocs(collection(como("gestor1"), "reservations")));
  });

  test("dono cancela e o horário fica livre", async () => {
    await assertSucceeds(cancelar(como("ana"), "resAna", ANA.reservation.slotIds));
    await assertSucceeds(reservar(como("rui"), "rui", { startTime: "10:00" }));
  });

  test("cancelar uma reserva de 3 horas liberta os 6 bloqueios", async () => {
    const r = dadosReserva("rui", { resourceId: "portatil", startTime: "14:00", minutes: 180 });
    await assertSucceeds(reservar(como("rui"), "rui", { resourceId: "portatil", startTime: "14:00", minutes: 180 }));
    await assertSucceeds(cancelar(como("rui"), r.reservationId, r.reservation.slotIds));
  });

  test("cancelar sem apagar todos os bloqueios é recusado", async () => {
    const r = dadosReserva("rui", { startTime: "14:00", minutes: 90 });
    await assertSucceeds(reservar(como("rui"), "rui", { startTime: "14:00", minutes: 90 }));
    await assertFails(cancelar(como("rui"), r.reservationId, r.reservation.slotIds, { manterBloqueios: 1 }));
  });

  test("utilizador não cancela reservas de outros", async () => {
    await assertFails(cancelar(como("rui"), "resAna", ANA.reservation.slotIds));
  });

  test("utilizador não liberta o bloqueio de uma reserva ativa de outro", async () => {
    await assertFails(deleteDoc(doc(como("rui"), "reservationSlots", ANA.reservation.slotIds[0])));
  });

  test("gestor cancela qualquer reserva", async () => {
    await assertSucceeds(cancelar(como("gestor1"), "resAna", ANA.reservation.slotIds));
  });

  test("reserva cancelada não pode ser reativada", async () => {
    await assertSucceeds(cancelar(como("ana"), "resAna", ANA.reservation.slotIds));
    await assertFails(updateDoc(doc(como("ana"), "reservations/resAna"), { status: "ativa" }));
  });

  test("ninguém altera data ou hora de uma reserva", async () => {
    await assertFails(updateDoc(doc(como("ana"), "reservations/resAna"), { startTime: "11:00" }));
  });

  test("ninguém apaga reservas (mantém-se o histórico)", async () => {
    await assertFails(deleteDoc(doc(como("gestor1"), "reservations/resAna")));
  });
});