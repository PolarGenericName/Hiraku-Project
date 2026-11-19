/**
 * shot-slide.mjs — captura do leitor em modo paged via Playwright:
 * seeda a biblioteca, abre um mangá, faz um slide parcial e tira prints
 * do carregamento da próxima página (diagnóstico do layout shift).
 *
 * Uso: node tools/shot-slide.mjs   (vite dev em :3000)
 * Saída: <repo>/../opencode/shots/*.png (ou SHOTS_DIR)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOTS_DIR || 'C:/Users/PolarGeneric/AppData/Local/Temp/opencode/shots';
const BASE = 'http://localhost:3000';
const MANGA_ID = 'bWFuZ2Evb25lLXBpZWNl'; // manga/one-piece (Mugiwaras)

fs.mkdirSync(OUT, { recursive: true });

function shot(name) {
  return path.join(OUT, `${name}.png`);
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    // ── Seed: biblioteca + modo de leitura lateral ──
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((mangaId) => {
      // conta (senão o AccountSetup cobre a tela)
      localStorage.setItem(
        'hiraku-account',
        JSON.stringify({ name: 'Tester', avatar: '', history: [], savedAnimes: [], createdAt: Date.now() }),
      );
      localStorage.setItem(
        'hiraku-manga-library',
        JSON.stringify([
          {
            key: `keiyoushi-pt-mugiwarasoficial:${mangaId}`,
            sourceId: 'keiyoushi-pt-mugiwarasoficial',
            mangaId,
            title: 'One Piece',
            lastReadChapter: 0,
            totalChapters: 1198,
            completed: false,
            categories: [],
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            key: 'keiyoushi-pt-leitordemangas:bWFuZ2EvbG9ja2Vk',
            sourceId: 'keiyoushi-pt-leitordemangas',
            mangaId: 'bWFuZ2EvbG9ja2Vk',
            title: 'Blue Lock',
            lastReadChapter: 120,
            totalChapters: 300,
            completed: false,
            categories: [],
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
          {
            key: 'keiyoushi-pt-manganyx:cG9zdGVy',
            sourceId: 'keiyoushi-pt-manganyx',
            mangaId: 'cG9zdGVy',
            title: 'Ao Ashi',
            lastReadChapter: 0,
            totalChapters: 85,
            completed: false,
            categories: [],
            addedAt: Date.now(),
            updatedAt: Date.now(),
          },
        ]),
      );
      localStorage.setItem(
        'hiraku-manga-reader-settings',
        JSON.stringify({ mode: 'ltr', showProgressBar: true, showPageControls: false }),
      );
    }, MANGA_ID);

    // ── Biblioteca ──
    await page.goto(`${BASE}/manga`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: shot('00-biblioteca') });

    // ── Seleção em massa: ativa e marca2 cards ──
    await page.getByRole('button', { name: /Selecionar/ }).click();
    const cards = page.locator('.grid > div').first();
    await cards.click();
    await page.locator('.grid > div').nth(2).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: shot('00b-selecao') });
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();

    // ── Long-press num card → menu de atalhos ──
    const cardBox = await cards.boundingBox();
    if (cardBox) {
      await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(700); // segura até disparar o long-press
      await page.mouse.up();
      await page.waitForTimeout(350);
      await page.screenshot({ path: shot('00c-menu-card') });
      // fecha o menu
      await page.mouse.click(10, 400);
      await page.waitForTimeout(200);
    }

    // ── Detalhes (clica no card do One Piece) ──
    await page.click(`a[href*="mugiwarasoficial"]`, { timeout: 15000 });
    await page
      .getByRole('link', { name: /Iniciar leitura|Continuar leitura/ })
      .waitFor({ timeout: 90000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot('01-details') });

    // ── Leitor paged ──
    await page.getByRole('link', { name: /Iniciar leitura|Continuar leitura/ }).click();
    await page.waitForSelector('img[alt^="Página"]', { timeout: 90000 });
    await page.waitForTimeout(4000); // deixa a imagem carregar
    await page.screenshot({ path: shot('02-paged') });

    // ── Slide parcial (segurando no meio do gesto) ──
    const img = page.locator('img[alt^="Página"]').first();
    const box = await img.boundingBox();
    if (!box) throw new Error('imagem do reader não encontrada');
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 380, cy, { steps: 14 });
    // limpa o cache para a próxima página BAIXAR (reproduz o "carrega pequena")
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.clearBrowserCache');
    await page.waitForTimeout(450);
    await page.screenshot({ path: shot('03-slide-segurando') });

    // ── Solta: captura a troca de página (bug "carrega pequena e expande") ──
    await page.mouse.up();
    await page.waitForTimeout(70);
    await page.screenshot({ path: shot('04-apos-soltar-70ms') });
    await page.waitForTimeout(350);
    await page.screenshot({ path: shot('05-apos-soltar-420ms') });
    await page.waitForTimeout(900);
    await page.screenshot({ path: shot('06-estabilizado') });

    console.log(`prints salvos em ${OUT}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
