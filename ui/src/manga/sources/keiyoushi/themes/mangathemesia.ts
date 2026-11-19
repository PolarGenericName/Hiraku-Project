/**
 * Tema MangaThemesia (WordPress "Flavor"/MangaStream) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/mangathemesia (Apache 2.0).
 *
 * Cobre Tsundoku Traduções:
 * - listas em `/manga/?title=&page=&order=popular|update`
 * - detalhes na caixa `div.main-info` (info .imptdt, gêneros .mgen, sinopse
 *   .entry-content, nomes alternativos .alternative)
 * - capítulos em `#chapterlist li` com data em `.chapterdate`
 * - páginas em `div#readerarea img` (fallback: JSON de imagens em script
 *   base64 `ts_reader.run`)
 *
 * Sem sendView (o ping de visualização do original não é necessário aqui).
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaStatus,
  MangaSummary,
} from '../../../types';
import { extGet, extImage } from '../http';
import {
  absUrl,
  decodeId,
  encodeId,
  imageFromElement,
  parseChapterDate,
  queryJsoup,
  selectFirst,
  splitChapterName,
} from './madara';

export interface MangaThemesiaConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** Prefixo do bloco de nomes alternativos na sinopse */
  altNamePrefix?: string;
  /** Seletor dos cards da lista (Tsundoku: exclui novels) */
  searchSelector?: string;
}

const DEFAULT_ALT_PREFIX = 'Nome alternativo: ';
const DEFAULT_SEARCH_SELECTOR =
  '.utao .uta .imgu, .listupd .bs .bsx, .listo .bs .bsx';
const NEXT_SELECTOR = 'div.pagination .next, div.hpage .r';
const DETAILS_SELECTOR = 'div.bigcontent, div.animefull, div.main-info, div.postbody';
const TITLE_SELECTOR = '.entry-title, .ts-breadcrumb li:last-child span';
const DESCRIPTION_SELECTOR = '.desc, .entry-content[itemprop=description]';
const THUMBNAIL_SELECTOR = '.infomanga > div[itemprop=image] img, .thumb img';
const CHAPTER_LIST_SELECTOR =
  'div.bxcl li, div.cl li, #chapterlist li, ul li:has(div.chbox):has(div.eph-num)';
const CHAPTER_NAME_SELECTOR = '.lch a, .chapternum';
const CHAPTER_DATE_SELECTOR = '.chapterdate';
const PAGE_SELECTOR = 'div#readerarea img';
const UPDATED_ON_SELECTOR =
  '.listinfo time[itemprop=dateModified], .fmed:contains(update) time, ' +
  'span:contains(update) time, time[itemprop=dateModified]';
const TS_READER_B64 = 'data:text/javascript;base64,dHNfcmVhZGVyLnJ1bih7';
const IMAGE_LIST_REGEX = /["']?(?:images|imageUrls)["']?\s*[:=]\s*(\[[^\]]*])/;

/** selector(base, palavras) — port de MangaThemesia.selector(). */
function selector(base: string, words: string[]): string {
  return words.map((word) => base.replace(/%s/g, word)).join(', ');
}

const ARTIST_SELECTOR = selector(
  '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, ' +
    '.fmed b:contains(%s)+span, span:contains(%s)',
  ['artist', 'Artiste', 'Artista', 'الرسام', 'الناشر', 'İllüstratör', 'Çizer', 'Sanatçı', 'นักวาด'],
);

const AUTHOR_SELECTOR = selector(
  '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, ' +
    '.fmed b:contains(%s)+span, span:contains(%s)',
  ['Author', 'Auteur', 'autor', 'المؤلف', 'Mangaka', 'seniman', 'Pengarang', 'Yazar', 'ผู้แต่ง', 'นักเขียน'],
);

const ALT_NAME_SELECTOR =
  '.alternative, .wd-full:contains(alt) span, .alter, .seriestualt, ' +
  selector('.infotable tr:contains(%s) td:last-child', [
    'Alternative',
    'Alternatif',
    'الأسماء الثانوية',
  ]);

const GENRE_SELECTOR =
  'div.gnr a, .mgen a, .seriestugenre a, ' +
  selector('span:contains(%s)', ['genre', 'التصنيف']);

const TYPE_SELECTOR =
  selector(
    '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, ' +
      '.tsinfo .imptdt:contains(%s) a, .fmed b:contains(%s)+span, span:contains(%s) a',
    ['type', 'ประเภท', 'النوع', 'tipe', 'Türü'],
  ) + ', a[href*="type="]';

const STATUS_SELECTOR = selector(
  '.infotable tr:contains(%s) td:last-child, .tsinfo .imptdt:contains(%s) i, ' +
    '.fmed b:contains(%s)+span span:contains(%s)',
  [
    'status', 'Statut', 'Durum', '連載状況', 'Estado',
    'الحالة', 'حالة العمل', 'สถานะ', 'stato', 'Statüsü',
  ],
);

// ── Status (port de parseStatus + listas do tema) ───────────────────────────

const ONGOING_WORDS = [
  'en curso', 'ongoing', 'on going', 'new season', 'mass released', 'ativo',
  'en cours', 'en cours de publication', 'đang tiến hành', 'em lançamento',
  'онгоінг', 'publishing', 'devam ediyor', 'em andamento', 'in corso',
  'güncel', 'berjalan', 'продолжается', 'updating', 'lançando', 'in arrivo',
  'emision', 'en emision', 'curso', 'en marcha', 'publicandose', 'publicando',
  '连载中', 'devam etmekte', '連載中', 'مستمرة', 'مستمر',
];
const COMPLETED_WORDS = [
  'completed', 'completo', 'complété', 'fini', 'achevé', 'terminé',
  'tamamlandı', 'đã hoàn thành', 'hoàn thành', 'завершено', 'finished',
  'finalizad', 'completata', 'one-shot', 'bitti', 'tamat', 'completado',
  'concluído', '完結', 'concluido', '已完结', 'bitmiş', 'مكتملة',
];
const CANCELLED_WORDS = [
  'canceled', 'cancelled', 'cancelado', 'cancellato', 'cancelados',
  'dropped', 'discontinued', 'abandonné',
];
const HIATUS_WORDS = [
  'hiatus', 'on hold', 'season end', 'pausado', 'en espera', 'en pause',
  'en attente', 'hiato',
];

function parseMangaThemesiaStatus(text?: string | null): MangaStatus {
  if (!text) return 'unknown';
  const value = text.toLowerCase();
  if (ONGOING_WORDS.some((word) => value.includes(word))) return 'ongoing';
  if (COMPLETED_WORDS.some((word) => value.includes(word))) return 'completed';
  if (CANCELLED_WORDS.some((word) => value.includes(word))) return 'cancelled';
  if (HIATUS_WORDS.some((word) => value.includes(word))) return 'on_hiatus';
  return 'unknown';
}

/** Gênero: lowercase + capitaliza o primeiro char (port do tema). */
function normalizeGenre(genre: string): string {
  const lower = genre.toLowerCase();
  return (lower.charAt(0).toUpperCase() + lower.slice(1)).trim();
}

// ── Motor ───────────────────────────────────────────────────────────────────

export class MangaThemesiaSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly altNamePrefix: string;
  private readonly searchSelector: string;
  private readonly docCache = new Map<string, { doc: Document; url: string; at: number }>();

  constructor(config: MangaThemesiaConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.altNamePrefix = config.altNamePrefix ?? DEFAULT_ALT_PREFIX;
    this.searchSelector = config.searchSelector ?? DEFAULT_SEARCH_SELECTOR;
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  getPopular(page: number): Promise<MangasPage> {
    return this.listFrom(page, 'popular');
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.listFrom(page, 'update');
  }

  private async listFrom(page: number, order: string): Promise<MangasPage> {
    const url = `${this.baseUrl}/manga/?page=${page}&order=${order}`;
    const html = await extGet(url);
    return this.parseList(html);
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const trimmed = query.trim();
    const params = new URLSearchParams();
    if (trimmed) params.set('title', trimmed);
    params.set('page', String(page));
    const html = await extGet(`${this.baseUrl}/manga/?${params.toString()}`);
    return this.parseList(html);
  }

  private parseList(html: string): MangasPage {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mangas: MangaSummary[] = [];
    for (const element of queryJsoup(doc, this.searchSelector)) {
      const link = selectFirst(element, 'a[title], a');
      if (!link) continue;
      const href = link.getAttribute('href');
      const title = link.getAttribute('title') || (link.textContent || '').trim();
      if (!href || !title) continue;
      const img = selectFirst(element, 'img');
      const cover = img ? imageFromElement(img, this.baseUrl) : null;
      mangas.push({
        id: encodeId(this.pathOf(href)),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return { mangas, hasNextPage: selectFirst(doc, NEXT_SELECTOR) !== null };
  }

  private pathOf(href: string): string {
    if (href.startsWith(this.baseUrl)) return href.slice(this.baseUrl.length);
    try {
      const url = new URL(href, `${this.baseUrl}/`);
      return url.pathname + url.search;
    } catch {
      return href;
    }
  }

  // ── Página do mangá (cache p/ detalhes + capítulos) ───────────────────────

  private async mangaDoc(path: string): Promise<{ doc: Document; url: string }> {
    const cached = this.docCache.get(path);
    if (cached && Date.now() - cached.at < 60_000) return cached;
    const url = absUrl(path, `${this.baseUrl}/`) ?? `${this.baseUrl}/`;
    const html = await extGet(url);
    const entry = { doc: new DOMParser().parseFromString(html, 'text/html'), url, at: Date.now() };
    this.docCache.set(path, entry);
    return entry;
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    const { doc, url } = await this.mangaDoc(path);
    const profile = selectFirst(doc, DETAILS_SELECTOR);

    const title = this.extractTitle(doc, profile);
    if (!title) return null;

    let cover: string | null = null;
    let description: string | undefined;
    let genres: string[] = [];
    let author: string | undefined;
    let artist: string | undefined;
    let status: MangaStatus = 'unknown';

    if (profile) {
      const thumb = selectFirst(profile, THUMBNAIL_SELECTOR);
      if (thumb) cover = imageFromElement(thumb, url);

      description = selectFirst(profile, DESCRIPTION_SELECTOR)?.textContent?.trim() || undefined;

      const alt = selectFirst(profile, ALT_NAME_SELECTOR);
      const altText = alt ? (alt.textContent || '').trim() : '';
      if (altText) {
        const names = altText
          .split(/[|\/•,;]/)
          .map((name) => `- ${name.trim()}`)
          .filter((line) => line.length > 1)
          .join('\n');
        const block = `${this.altNamePrefix}\n${names}`.trim();
        description = `${description ? `${description}\n\n` : ''}${block}`.trim();
      }

      genres = queryJsoup(profile, GENRE_SELECTOR)
        .map((el) => (el.textContent || '').trim())
        .filter(Boolean);

      // tipo (manga/manhwa/novel) entra na lista de gêneros, como no original
      const type = selectFirst(profile, TYPE_SELECTOR);
      const typeText = type ? (type.textContent || '').trim() : '';
      if (typeText) genres.push(typeText);

      genres = genres.map(normalizeGenre);

      author = this.infoText(profile, AUTHOR_SELECTOR);
      artist = this.infoText(profile, ARTIST_SELECTOR);
      status = parseMangaThemesiaStatus(this.infoText(profile, STATUS_SELECTOR));
    }

    return {
      id,
      title,
      coverUrl: cover ? extImage(cover) : undefined,
      status,
      genres: genres.length ? genres : undefined,
      description,
      authors: author ? [author] : undefined,
      artists: artist ? [artist] : undefined,
    };
  }

  /** Título: seletor do tema → og:title → <title>. */
  private extractTitle(doc: Document, profile: Element | null): string {
    if (profile) {
      const fromProfile = selectFirst(profile, TITLE_SELECTOR);
      const text = fromProfile?.textContent?.trim();
      if (text) return text;
    }
    const og = selectFirst(doc, 'meta[property="og:title"]')?.getAttribute('content');
    if (og) return this.trimBlogSuffix(og);
    const title = doc.querySelector('title')?.textContent;
    return title ? this.trimBlogSuffix(title) : '';
  }

  private trimBlogSuffix(value: string): string {
    const text = value.trim();
    const idx = text.lastIndexOf(' - ');
    return (idx > 0 ? text.slice(0, idx) : text).trim();
  }

  /** Valor de um campo info (`.imptdt` etc.) — texto do seletor, sem vazios. */
  private infoText(profile: Element, selector: string): string | undefined {
    const value = selectFirst(profile, selector)?.textContent?.trim();
    if (!value || value === '-' || value.toLowerCase() === 'n/a' || value.toLowerCase() === 'unknown') {
      return undefined;
    }
    return value;
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    const { doc, url } = await this.mangaDoc(path);

    const chapters: Chapter[] = [];
    for (const element of queryJsoup(doc, CHAPTER_LIST_SELECTOR)) {
      const links = queryJsoup(element, 'a');
      const href = links[0]?.getAttribute('href');
      if (!href) continue;
      const name =
        queryJsoup(element, CHAPTER_NAME_SELECTOR)
          .map((el) => (el.textContent || '').trim())
          .filter(Boolean)
          .join(' ') || (links[0].textContent || '').trim();
      if (!name) continue;

      const dateText = selectFirst(element, CHAPTER_DATE_SELECTOR)?.textContent?.trim();
      const { number } = splitChapterName(name);
      chapters.push({
        id: encodeId(this.pathOf(href)),
        mangaId,
        number,
        title: name,
        uploadedAt: dateText
          ? parseChapterDate(dateText, 'dd/MM/yyyy')
          : this.updatedOnDate(doc, chapters.length === 0),
        language: 'pt-br',
      });
    }

    // "Updated On" só cobre o capítulo mais recente sem data (como no original)
    if (chapters.length && !chapters[0].uploadedAt) {
      chapters[0].uploadedAt = this.updatedOnDate(doc, true);
    }
    void url;
    return chapters;
  }

  private updatedOnDate(doc: Document, enabled: boolean): number | undefined {
    if (!enabled) return undefined;
    const time = selectFirst(doc, UPDATED_ON_SELECTOR);
    const datetime = time?.getAttribute('datetime') || time?.textContent;
    return datetime ? parseChapterDate(datetime, 'yyyy-MM-dd') : undefined;
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const path = decodeId(chapterId);
    const url = absUrl(path, `${this.baseUrl}/`) ?? `${this.baseUrl}/`;
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 1) imagens diretas no reader
    const pages: MangaPage[] = [];
    for (const img of queryJsoup(doc, PAGE_SELECTOR)) {
      const src = this.imgAttr(img, url);
      if (!src) continue;
      pages.push({ index: pages.length, imageUrl: extImage(src) });
    }
    if (pages.length) return pages;

    // 2) fallback: JSON de URLs num script base64 (ts_reader.run)
    const script = selectFirst(doc, `script[src^="${TS_READER_B64}"]`);
    let source = html;
    const dataUrl = script?.getAttribute('src');
    if (dataUrl && dataUrl.includes('base64,')) {
      try {
        const binary = atob(dataUrl.slice(dataUrl.indexOf('base64,') + 7));
        source = binary;
      } catch {
        source = html;
      }
    }
    const match = IMAGE_LIST_REGEX.exec(source);
    if (match) {
      try {
        const list = JSON.parse(match[1]) as unknown;
        if (Array.isArray(list)) {
          for (const entry of list) {
            if (typeof entry !== 'string' || !entry) continue;
            const abs = absUrl(entry, this.baseUrl) ?? entry;
            pages.push({ index: pages.length, imageUrl: extImage(abs) });
          }
        }
      } catch {
        /* JSON inválido → sem páginas */
      }
    }
    return pages;
  }

  /** imgAttr do tema: data-lazy-src > data-src > data-cfsrc > src (abs). */
  private imgAttr(img: Element, base: string): string | null {
    for (const attribute of ['data-lazy-src', 'data-src', 'data-cfsrc', 'src']) {
      const value = img.getAttribute(attribute);
      if (value) return absUrl(value, base);
    }
    return null;
  }
}

export function createMangaThemesiaSource(config: MangaThemesiaConfig): MangaThemesiaSource {
  return new MangaThemesiaSource(config);
}
