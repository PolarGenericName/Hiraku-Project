/**
 * Diagnóstico do zoom (Ctrl+Scroll) no modo paged:
 * verifica se o indicador aparece e se a imagem escala.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SHOTS_DIR || 'C:/Users/PolarGeneric/AppData/Local/Temp/opencode/shots';
const BASE = 'http://localhost:3000';
const MANGA_ID = 'bWFuZ2Evb25lLXBpZWNl';

fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  try {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((mangaId) => {
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
            totalChapters: 0,
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

    await page.goto(`${BASE}/manga`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.click('a[href*="mugiwarasoficial"]', { timeout: 15000 });
    await page.getByRole('link', { name: /Iniciar leitura|Continuar leitura/ }).waitFor({ timeout: 90000 });
    await page.getByRole('link', { name: /Iniciar leitura|Continuar leitura/ }).click();
    await page.waitForSelector('img[alt^="Página"]', { timeout: 90000 });
    await page.waitForTimeout(4000);

    // captura o tamanho ANTES do zoom
    const before = await page.evaluate(() => {
      const img = document.querySelector('img[alt^="Página"]');
      const r = img?.getBoundingClientRect();
      return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null;
    });
    console.log('antes do zoom:', JSON.stringify(before));

    // Ctrl + wheel (zoom in)
    await page.keyboard.down('Control');
    for (let i = 0; i < 5; i++) {
      await page.mouse.wheel(0, -120);
      await page.waitForTimeout(120);
    }
    await page.keyboard.up('Control');
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const img = document.querySelector('img[alt^="Página"]');
      const r = img?.getBoundingClientRect();
      const wrapper = document.querySelector('[style*="zoom"]') || img?.parentElement;
      const indicator = [...document.querySelectorAll('div,span')]
        .map((el) => el.textContent || '')
        .find((t) => /^\d\.\d×$/.test(t.trim()));
      return {
        img: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        indicator: indicator?.trim() ?? null,
        wrapperStyleZoom: wrapper?.getAttribute('style') ?? null,
        wrapperComputedZoom: wrapper ? getComputedStyle(wrapper).zoom : null,
        wrapperRect: wrapper ? (() => { const wr = wrapper.getBoundingClientRect(); return { w: Math.round(wr.width), h: Math.round(wr.height) }; })() : null,
      };
    });
    console.log('depois do zoom:', JSON.stringify(after));

    await page.screenshot({ path: path.join(OUT, 'zoom-test.png') });
    console.log(`print em ${path.join(OUT, 'zoom-test.png')}`);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
