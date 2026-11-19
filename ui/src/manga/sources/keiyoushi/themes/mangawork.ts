/**
 * Tema MangaWork (WordPress com listas em /series e capítulos via
 * admin-ajax) — port TS de keiyoushi/extensions-source/lib-multisrc/mangawork
 * (Apache 2.0).
 *
 * Cobre Capitoons (apecomics) e PizzariaScan:
 * - listas em `{seriesPath}/?title=&order=&status=&type=`
 * - capítulos no `#chapter_list` + paginação `load_chapters` (admin-ajax)
 * - páginas em `div.reader-area img#imagech` (fallback JSON inline)
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage, extPost, ExtError } from '../http';
import {
  absUrl,
  decodeId,
  encodeId,
  imageFromElement,
  parseChapterDate,
  queryJsoup,
  selectFirst,
} from './madara';

export interface MangaWorkConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** Segmento da listagem (padrão "series"; PizzariaScan: "todas-as-obras") */
  seriesPath?: string;
  /** Datas longas "8 de novembro de 2026" (PizzariaScan) */
  ptBrDates?: boolean;
}

const ENTRY_SELECTOR = "div.w-full.h-full:has(a[href*='/manga/'])";
const ANCHOR_SELECTOR = "a[href*='/manga/']";
const NEXT_SELECTOR = '.pagination .page-numbers.current + a[href]';
const CHAPTER_CONTAINER = '#chapter_list.chapter_list_container';
const CHAPTER_NEXT_SELECTOR = 'button.load-chapters[data-paged]';
const PAGE_SELECTOR =
  "div.reader-area img#imagech, div.reader-area img[src*='/manga_auto_capitulos/']";
const PAGE_REGEX = /"image"\s*:\s*"([^"]+)"/g;
const NUMBER_RE = /(\d+(?:[.,]\d+)?)/;

const PT_MONTHS: Record<string, string> = {
  janeiro: '01', fevereiro: '02', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12',
};

function stripDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Mn}+/gu, '');
}

/** Port do parseChapterDate do tema (d/M/yyyy + variante "8 de novembro de 2026"). */
function parseWorkDate(text: string | null | undefined, ptBrLong: boolean): number | undefined {
  if (!text) return undefined;
  let value = text.trim();
  if (!value) return undefined;

  if (ptBrLong) {
    const match = value.match(/^(\d{1,2})\s+de\s+([a-zç]+)\s+de\s+(\d{4})$/i);
    if (match) {
      const month = PT_MONTHS[stripDiacritics(match[2].toLowerCase())];
      if (month) {
        value = `${match[1].padStart(2, '0')}/${month}/${match[3]}`;
      }
    }
  }
  return parseChapterDate(value, 'd/M/yyyy');
}

function parseStatus(text: string | null | undefined): MangaDetails['status'] {
  const value = (text ?? '').trim().toLowerCase();
  if (['publishing', 'ongoing', 'em andamento'].includes(value)) return 'ongoing';
  if (['finished', 'completed', 'concluído', 'concluido', 'finalizado'].includes(value)) {
    return 'completed';
  }
  if (['on hold', 'on-hold', 'hiatus', 'em hiato'].includes(value)) return 'on_hiatus';
  if (['cancelled', 'canceled', 'cancelado'].includes(value)) return 'cancelled';
  return 'unknown';
}

export class MangaWorkSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly seriesPath: string;
  private readonly ptBrDates: boolean;

  constructor(config: MangaWorkConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.seriesPath = (config.seriesPath ?? 'series').replace(/^\/+|\/+$/g, '');
    this.ptBrDates = config.ptBrDates === true;
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  getPopular(page: number): Promise<MangasPage> {
    return this.seriesPage(page, 'popular', '');
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.seriesPage(page, 'update', '');
  }

  search(page: number, query: string): Promise<MangasPage> {
    return this.seriesPage(page, 'title', query.trim());
  }

  private async seriesPage(page: number, order: string, query: string): Promise<MangasPage> {
    const url = new URL(`${this.baseUrl}/${this.seriesPath}/`);
    if (page > 1) url.pathname = `${url.pathname.replace(/\/+$/, '')}/page/${page}/`;
    url.searchParams.set('title', query);
    url.searchParams.set('order', order);
    url.searchParams.set('status', '');
    url.searchParams.set('type', '');
    const target = url.toString();

    const html = await extGet(target);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      mangas: this.parseEntries(doc, target),
      hasNextPage: selectFirst(doc, NEXT_SELECTOR) !== null,
    };
  }

  private parseEntries(doc: Document, base: string): MangaSummary[] {
    const out: MangaSummary[] = [];
    for (const el of queryJsoup(doc, ENTRY_SELECTOR)) {
      const anchor = selectFirst(el, ANCHOR_SELECTOR);
      const href = anchor?.getAttribute('href');
      if (!anchor || !href) continue;
      const title =
        (anchor.getAttribute('title') || '').trim() ||
        (selectFirst(el, 'h1')?.textContent || '').trim();
      if (!title) continue;
      const img = selectFirst(anchor, 'img');
      const cover = img ? imageFromElement(img, base) : null;
      out.push({
        id: encodeId(this.pathOf(href, base)),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return out;
  }

  private pathOf(href: string, base: string): string {
    try {
      const url = new URL(href, base);
      return url.pathname + url.search;
    } catch {
      return href;
    }
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    const url = absUrl(path, `${this.baseUrl}/`);
    if (!url) return null;
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const titleEl = selectFirst(doc, 'h1.text-4xl.font-bold.mb-2');
    if (!titleEl) return null;
    const base = url;

    const genreEls = queryJsoup(doc, '[itemprop=genre]');
    const genres = genreEls
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);

    const thumbEl = selectFirst(doc, 'img[itemprop=image], [itemprop=image] img');
    const cover = thumbEl ? imageFromElement(thumbEl, base) : null;

    const descEl = selectFirst(
      doc,
      'div.text-base.leading-relaxed.mb-6.text-muted-foreground',
    );

    const statusText = genreEls[0]?.previousElementSibling?.textContent ?? '';
    const author = this.infoValue(doc, 'Autor(es)');

    return {
      id,
      title: (titleEl.textContent || '').trim(),
      coverUrl: cover ? extImage(cover) : undefined,
      status: parseStatus(statusText),
      genres: genres.length ? genres : undefined,
      description: descEl ? (descEl.textContent || '').trim() || undefined : undefined,
      authors: author ? [author] : undefined,
    };
  }

  /** Valor de um campo "label → <p>" da grade de informações. */
  private infoValue(doc: Document, label: string): string | null {
    const items = queryJsoup(doc, 'div.grid.grid-cols-2.gap-4.text-sm.text-gray-600.mb-6 > div');
    for (const item of items) {
      const strong = selectFirst(item, 'strong');
      if ((strong?.textContent || '').trim() !== label) continue;
      const value = selectFirst(item, 'p');
      const text = (value?.textContent || '').trim();
      if (text) return text;
    }
    return null;
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    const url = absUrl(path, `${this.baseUrl}/`);
    if (!url) return [];
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    const collect = (root: Document) => {
      const container = selectFirst(root, CHAPTER_CONTAINER);
      if (!container) return;
      for (const el of queryJsoup(container, 'li')) {
        const chapter = this.chapterFrom(el, url);
        if (!chapter || seen.has(chapter.id)) continue;
        seen.add(chapter.id);
        chapters.push(chapter);
      }
    };

    collect(doc);

    const container = selectFirst(doc, CHAPTER_CONTAINER);
    const postId = container?.getAttribute('data-post-id');
    if (container && postId) {
      const count = container.getAttribute('data-count') || '1000';
      const requested = new Set<string>();
      let currentPage = parseInt(
        selectFirst(doc, CHAPTER_NEXT_SELECTOR)?.getAttribute('data-paged') || '1',
        10,
      );

      let nextButton = this.findNextChapterPage(doc, currentPage);
      while (nextButton) {
        const page = nextButton.getAttribute('data-paged');
        if (!page || requested.has(page)) break;
        requested.add(page);
        const order = nextButton.getAttribute('data-order') || 'DESC';

        const body = await extPost(
          `${this.baseUrl}/wp-admin/admin-ajax.php`,
          { action: 'load_chapters', post_id: postId, count, paged: page, order },
          { xhr: true, headers: { referer: url } },
        );
        const ajaxDoc = new DOMParser().parseFromString(body, 'text/html');
        collect(ajaxDoc);
        currentPage = parseInt(page, 10) || currentPage;
        nextButton = this.findNextChapterPage(ajaxDoc, currentPage);
      }
    }

    return chapters.sort(
      (a, b) => b.number - a.number || (b.uploadedAt || 0) - (a.uploadedAt || 0),
    );
  }

  private findNextChapterPage(doc: Document, currentPage: number): Element | null {
    for (const button of queryJsoup(doc, CHAPTER_NEXT_SELECTOR)) {
      const page = parseInt(button.getAttribute('data-paged') || '', 10);
      if (Number.isFinite(page) && page > currentPage) return button;
    }
    return null;
  }

  private chapterFrom(el: Element, referer: string): Chapter | null {
    const anchor = selectFirst(el, 'a[href]');
    if (!anchor) return null;
    const href = anchor.getAttribute('href');
    if (!href) return null;

    const nameEl = selectFirst(el, 'span.m-0, span.line-clamp-1');
    const name =
      (nameEl && (nameEl.textContent || '').trim()) ||
      (anchor.textContent || '').trim();
    if (!name) return null;

    const numberMatch = NUMBER_RE.exec(name);
    const number = numberMatch
      ? parseFloat(numberMatch[1].replace(',', '.'))
      : -1;

    const spans = queryJsoup(el, 'span');
    const dateText = spans.length ? (spans[spans.length - 1].textContent || '').trim() : '';

    return {
      id: encodeId(this.pathOf(href, referer)),
      mangaId: encodeId(this.pathOf(referer, referer)),
      number: Number.isFinite(number) ? number : -1,
      title: name,
      uploadedAt: parseWorkDate(dateText, this.ptBrDates),
      language: 'pt-br',
    };
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const path = decodeId(chapterId);
    const url = absUrl(path, `${this.baseUrl}/`);
    if (!url) return [];
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const urls: string[] = [];
    for (const img of queryJsoup(doc, PAGE_SELECTOR)) {
      const abs = imageFromElement(img, url);
      if (abs) urls.push(abs);
    }

    if (!urls.length) {
      PAGE_REGEX.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = PAGE_REGEX.exec(html))) {
        urls.push(match[1].replace(/\\\//g, '/'));
      }
    }

    if (!urls.length) {
      throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');
    }
    return urls.map((imageUrl, index) => ({ index, imageUrl: extImage(imageUrl) }));
  }
}

export function createMangaWorkSource(config: MangaWorkConfig): MangaWorkSource {
  return new MangaWorkSource(config);
}
