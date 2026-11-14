// Estimativa do uso diário face às quotas do plano Spark (R7).
// Conta as leituras, escritas e eliminações que o dashboard.js faz em cada ação e
// multiplica por um cenário de utilização. O resultado é uma tabela em Markdown para o relatório.
//
// Uso:  node scripts/estimativa-quotas.mjs
//       node scripts/estimativa-quotas.mjs --utilizadores=400 --reservasPorUtilizador=20
// Qualquer parâmetro do CENÁRIO pode ser mudado com --nome=valor.
// É uma estimativa: comparem-na com o uso real na consola (Firestore > Uso).
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// Limites diários do plano Spark (guião do projeto).
const LIMITES = { leituras: 50_000, escritas: 20_000, eliminacoes: 20_000, hostingMB: 360 };

// Cenário por omissão: um dia de aulas com uso moderado. Ajustem aos vossos números.
const CENARIO = {
  utilizadores: 200,          // utilizadores diferentes que entram num dia
  aberturasPainel: 3,         // vezes que cada um abre ou recarrega o painel
  recursosAtivos: 20,         // salas e equipamentos ativos
  reservasPorUtilizador: 10,  // reservas no histórico de cada utilizador (são todas lidas)
  bloqueiosHoje: 60,          // bloqueios de meia hora de todos os recursos, hoje
  consultasHorarios: 4,       // vezes que cada um abre a grelha ou muda de dia
  bloqueiosPorConsulta: 4,    // bloqueios de um recurso num dia
  reservasCriadas: 1,         // reservas criadas por utilizador por dia
  blocosPorReserva: 3,        // meias horas por reserva (3 = 1 h 30)
  fracaoEquipamentoUnidade1: 0.3, // reservas na unidade 1 de equipamentos (leem também bloqueios antigos)
  cancelamentos: 0.2,         // cancelamentos por utilizador por dia
  gestores: 3,
  aberturasGestor: 10,        // vezes que cada gestor abre ou recarrega o painel
  recursosTotais: 25,         // inclui os desativados
  reservasTotais: 2_000,      // todas as reservas guardadas (o painel antigo do gestor lia-as todas)
  reservasJanela: 400,        // reservas dos últimos 30 dias e futuras (o que o painel do gestor lê agora)
  perfis: 500,
};

for (const arg of process.argv.slice(2)) {
  const [chave, valor] = arg.replace(/^--/, "").split("=");
  if (!(chave in CENARIO) || Number.isNaN(Number(valor))) {
    console.error(`Parâmetro desconhecido ou inválido: ${arg}`);
    console.error(`Parâmetros: ${Object.keys(CENARIO).join(", ")}`);
    process.exit(1);
  }
  CENARIO[chave] = Number(valor);
}
const c = CENARIO;

// Uma consulta que não devolve nada conta como 1 leitura.
const consulta = (documentos) => Math.max(1, documentos);

// ---------- Custo de cada ação (lido do dashboard.js) ----------
// loadData(): perfil + recursos ativos + as suas reservas + bloqueios de hoje.
const painelUtilizador = 1 + consulta(c.recursosAtivos) + consulta(c.reservasPorUtilizador) + consulta(c.bloqueiosHoje);
// loadData() do gestor: todos os recursos, reservas dos últimos 30 dias e futuras, bloqueios de hoje
// e todos os perfis. Antes da otimização lia todas as reservas de sempre (painelGestorAntigo).
const painelGestor = 1 + consulta(c.recursosTotais) + consulta(c.reservasJanela) + consulta(c.bloqueiosHoje) + consulta(c.perfis);
const painelGestorAntigo = painelGestor - consulta(c.reservasJanela) + consulta(c.reservasTotais);
// refreshDialogSlots(): bloqueios do recurso nesse dia.
const verHorarios = consulta(c.bloqueiosPorConsulta);
// Criar: consulta fresca dos bloqueios + transação (recurso + N bloqueios [+ N antigos]) + leitura do
// recurso feita pelas regras + painel recarregado. Escreve 1 reserva + N bloqueios.
const criarLeituras = verHorarios + 1 + c.blocosPorReserva * (1 + c.fracaoEquipamentoUnidade1) + 1 + painelUtilizador;
const criarEscritas = 1 + c.blocosPorReserva;
// Cancelar: transação (reserva + N bloqueios) + painel recarregado. 1 escrita, N eliminações.
const cancelarLeituras = 1 + c.blocosPorReserva + painelUtilizador;

// ---------- Total por dia ----------
const porUtilizador =
  c.aberturasPainel * painelUtilizador +
  c.consultasHorarios * verHorarios +
  c.reservasCriadas * criarLeituras +
  c.cancelamentos * cancelarLeituras;
const leiturasGestores = c.gestores * c.aberturasGestor * painelGestor;
const leituras = c.utilizadores * porUtilizador + leiturasGestores;
const escritas = c.utilizadores * (c.reservasCriadas * criarEscritas + c.cancelamentos * 1);
const eliminacoes = c.utilizadores * c.cancelamentos * c.blocosPorReserva;

// Hosting: tamanho real dos ficheiros em public/ (primeira visita, sem compressão).
// O SDK do Firebase vem de www.gstatic.com e não conta para a quota do Hosting.
function tamanho(pasta) {
  return readdirSync(pasta).reduce((total, nome) => {
    const caminho = join(pasta, nome);
    const info = statSync(caminho);
    return total + (info.isDirectory() ? tamanho(caminho) : info.size);
  }, 0);
}
const kbPorVisita = tamanho("public") / 1024;
const hostingMB = (c.utilizadores + c.gestores) * kbPorVisita / 1024;

// ---------- Capacidade: quantos utilizadores por dia cabem nas 50 000 leituras ----------
const capacidade = Math.floor((LIMITES.leituras - leiturasGestores) / porUtilizador);
const leiturasGestoresAntigo = c.gestores * c.aberturasGestor * painelGestorAntigo;

const n = (v) => Math.round(v).toLocaleString("pt-PT");
const pct = (v, lim) => `${(100 * v / lim).toFixed(1).replace(".", ",")}%`;

console.log(`## Estimativa de uso diário (cenário: ${c.utilizadores} utilizadores, ${c.gestores} gestores)\n`);
console.log("| Ação | Leituras | Escritas | Eliminações |");
console.log("| --- | ---: | ---: | ---: |");
console.log(`| Abrir o painel (utilizador) | ${n(painelUtilizador)} | 0 | 0 |`);
console.log(`| Abrir o painel (gestor) | ${n(painelGestor)} | 0 | 0 |`);
console.log(`| Abrir o painel (gestor), versão antiga que lia todas as reservas | ${n(painelGestorAntigo)} | 0 | 0 |`);
console.log(`| Ver horários de um recurso num dia | ${n(verHorarios)} | 0 | 0 |`);
console.log(`| Criar reserva de ${c.blocosPorReserva} meias horas | ${n(criarLeituras)} | ${n(criarEscritas)} | 0 |`);
console.log(`| Cancelar reserva de ${c.blocosPorReserva} meias horas | ${n(cancelarLeituras)} | 1 | ${c.blocosPorReserva} |`);
console.log("");
console.log("| Quota (por dia) | Uso estimado | Limite Spark | Percentagem |");
console.log("| --- | ---: | ---: | ---: |");
console.log(`| Leituras Firestore | ${n(leituras)} | ${n(LIMITES.leituras)} | ${pct(leituras, LIMITES.leituras)} |`);
console.log(`| Escritas Firestore | ${n(escritas)} | ${n(LIMITES.escritas)} | ${pct(escritas, LIMITES.escritas)} |`);
console.log(`| Eliminações Firestore | ${n(eliminacoes)} | ${n(LIMITES.eliminacoes)} | ${pct(eliminacoes, LIMITES.eliminacoes)} |`);
console.log(`| Transferência Hosting (MB) | ${hostingMB.toFixed(1).replace(".", ",")} | ${LIMITES.hostingMB} | ${pct(hostingMB, LIMITES.hostingMB)} |`);
console.log("");
console.log(`- Cada utilizador gasta cerca de ${n(porUtilizador)} leituras por dia; os ${c.gestores} gestores, ${n(leiturasGestores)} no total.`);
console.log(capacidade > 0
  ? `- Com este perfil de uso, as 50 000 leituras diárias chegam para cerca de ${n(capacidade)} utilizadores por dia.`
  : "- Só os painéis dos gestores já gastam as 50 000 leituras diárias: é preciso reduzir as leituras por abertura.");
console.log(`- Antes da otimização, os painéis dos gestores gastavam ${n(leiturasGestoresAntigo)} leituras por dia (${pct(leiturasGestoresAntigo, LIMITES.leituras)} do limite), porque cada abertura lia as ${n(c.reservasTotais)} reservas de sempre.`);
console.log(`- A primeira visita descarrega cerca de ${kbPorVisita.toFixed(0)} KB do Hosting (sem compressão; as visitas seguintes usam a cache do browser). O SDK do Firebase vem de www.gstatic.com e não conta.`);
