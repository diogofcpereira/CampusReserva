// Capturas de ecrã da aplicação publicada com os dois perfis (feedback de 28 out, ponto 3).
// Não cria, altera nem cancela nada: só abre páginas e seleciona um horário sem confirmar.
//
// Uso (terminal WSL, na raiz do repositório):
//   npm install --no-save playwright
//   npx playwright install --with-deps chromium
//   USER_EMAIL=... USER_PASSWORD=... GESTOR_EMAIL=... GESTOR_PASSWORD=... node scripts/capturas.mjs
//
// Variáveis opcionais: BASE (por omissão o site publicado) e OUT (por omissão ./capturas).
// As palavras-passe ficam só no terminal: nunca as escrevam neste ficheiro nem no GitHub.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = (process.env.BASE || "https://campusreservage.web.app").replace(/\/$/, "");
const OUT = process.env.OUT || "capturas";
const REPO = "https://github.com/diogofcpereira/CampusReserva";
const contas = {
  utilizador: [process.env.USER_EMAIL, process.env.USER_PASSWORD],
  gestor: [process.env.GESTOR_EMAIL, process.env.GESTOR_PASSWORD],
};
for (const [perfil, [email, pass]] of Object.entries(contas)) {
  if (!email || !pass) {
    console.error(`Falta a conta de ${perfil}: definam ${perfil === "gestor" ? "GESTOR" : "USER"}_EMAIL e ${perfil === "gestor" ? "GESTOR" : "USER"}_PASSWORD.`);
    process.exit(1);
  }
}
mkdirSync(OUT, { recursive: true });

const amanha = (() => {
  const d = new Date(Date.now() + 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();

const browser = await chromium.launch();
const guardadas = [];

async function capturar(page, nome) {
  await page.waitForTimeout(700); // deixar terminar as animações
  const caminho = `${OUT}/${nome}.png`;
  await page.screenshot({ path: caminho });
  guardadas.push(caminho);
  console.log("✔", caminho);
}

async function entrar(email, pass) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-PT" });
  const page = await context.newPage();
  await page.goto(`${BASE}/index.html`);
  await page.fill("#email", email);
  await page.fill("#password", pass);
  await page.click("#loginBtn");
  await page.waitForURL(/dashboard\.html/, { timeout: 30_000 });
  await page.waitForSelector("#appContent:not([hidden])", { timeout: 30_000 });
  return page;
}

async function abrir(page, vista) {
  await page.click(`[data-view="${vista}"]`);
  await page.waitForTimeout(400);
}

try {
  // ---------- Perfil utilizador ----------
  const [ue, up] = contas.utilizador;
  const u = await entrar(ue, up);
  await capturar(u, "01-utilizador-painel");
  await abrir(u, "resources");
  await capturar(u, "02-utilizador-salas-e-equipamentos");

  // Grelha de horários com um intervalo início–fim selecionado (sem confirmar a reserva).
  const primeiro = u.locator("#resourceGrid [data-reserve-id]").first();
  if (await primeiro.count()) {
    await primeiro.click();
    await u.fill("#dialogDate", amanha);
    await u.dispatchEvent("#dialogDate", "change");
    await u.waitForSelector("#slotGrid .slot-free", { timeout: 15_000 });
    const livres = u.locator("#slotGrid .slot-free");
    const inicio = await livres.first().getAttribute("data-slot-time");
    await livres.first().click();
    const [h, m] = inicio.split(":").map(Number);
    const fim = `${String(h + 1 + (m === 30 ? 1 : 0)).padStart(2, "0")}:${m === 30 ? "00" : "30"}`; // 1h30 depois
    const botaoFim = u.locator(`#slotGrid [data-slot-time="${fim}"]`);
    if (await botaoFim.isEnabled().catch(() => false)) await botaoFim.click();
    await capturar(u, "03-utilizador-grelha-com-intervalo");
    await u.click("#closeResourceDialog");
  } else {
    console.warn("Não há recursos ativos: a captura da grelha foi saltada.");
  }

  await abrir(u, "reservations");
  await capturar(u, "04-utilizador-as-minhas-reservas");
  await u.context().close();

  // ---------- Perfil gestor ----------
  const [ge, gp] = contas.gestor;
  const g = await entrar(ge, gp);
  await capturar(g, "05-gestor-painel");
  await abrir(g, "manager-reservations");
  await capturar(g, "06-gestor-gerir-reservas");
  await abrir(g, "manage-resources");
  await capturar(g, "07-gestor-salas-e-equipamentos");
  await abrir(g, "manage-users");
  await capturar(g, "08-gestor-utilizadores");
  await g.context().close();

  // ---------- Pipeline (páginas públicas do GitHub) ----------
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${REPO}/actions`, { waitUntil: "domcontentloaded" });
    await capturar(page, "09-pipeline-execucoes");
    const ultima = page.locator('a[href*="/actions/runs/"]').first();
    if (await ultima.count()) {
      await ultima.click();
      await page.waitForLoadState("domcontentloaded");
      await capturar(page, "10-pipeline-ultima-execucao");
    }
    await context.close();
  } catch (error) {
    console.warn("Não foi possível capturar o GitHub (façam essas capturas à mão):", error.message.split("\n")[0]);
  }
} catch (error) {
  console.error("Falhou:", error.message.split("\n")[0]);
  console.error("Confirmem as contas e se o site abre no browser.");
  process.exitCode = 1;
} finally {
  await browser.close();
  console.log(`\n${guardadas.length} capturas em ${OUT}/`);
}
