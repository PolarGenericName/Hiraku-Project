/**
 * Tema ZeistManga (feeds Blogger + páginas HTML) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/zeistmanga (Apache 2.0).
 *
 * Cobre 6 fontes PT-BR (Apenas Uma Fã, GALAX Scans, Hanmokku Scan, Ler 999,
 * Pink Rosa, Traduções do Lipe):
 * - listas via feed JSON `/-/<label>?alt=json` (latest/busca) ou bloco de
 *   populares no HTML da home
 * - detalhes na página do post (seletor por fonte + info boxes .y6x11p)
 * - capítulos via feed do Blogger (clwd.run / script legado / label do post)
 * - páginas no HTML do capítulo (ou JSON embutido, conforme a fonte)
 *
 * O fallback do feed de capítulos usa o label do post (`.chapter_get`,
 * script do projeto) ou o título — como no original.
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
  eachText,
  encodeId,
  ownText,
  parseChapterDate,
  queryJsoup,
  selectFirst,
  splitChapterName,
} from './madara';

export interface ZeistConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** false = sem ranking próprio (popular cai no latest) */
  supportsLatest?: boolean;
  /** Categoria do mangá no feed (padrão "Series") */
  mangaCategory?: string;
  /** Categoria dos capítulos (padrão "Chapter") */
  chapterCategory?: string;
  /** GALAX: feed novo via clwd.run / label= */
  useNewChapterFeed?: boolean;
  /**
   * Categorias incluídas nas buscas/latest (substitui o default). O Zeist
   * upstream busca com q={label:"A" label:"B"} -label:"..." — mangás com
   * label diferente de "Series" (ex.: "Manga", "Manhwa") senão não aparecem.
   */
  includedCategories?: string[];
  /** Categorias extras somadas ao default (ex.: "Todos os Projetos") */
  extraCategories?: string[];
  // popular (HTML da home)
  popularSelector?: string;
  popularTitleSelector?: string;
  popularUrlSelector?: string;
  // detalhes
  detailsSelector?: string;
  thumbSelector?: string;
  descriptionSelector?: string;
  genresSelector?: string;
  authorSelector?: string;
  artistSelector?: string;
  altNameSelector?: string;
  statusSelector?: string;
  /** Label do capítulo em atributo (apenasumafa/pinkrosa: .chapter_get) */
  chapterLabelSelector?: string;
  /** Label do capítulo dentro de um script (traducoesdolipe: catNameProject) */
  chapterLabelFromScript?: boolean;
  /** Hanmokku: busca em /search (HTML) em vez do feed */
  htmlSearch?: boolean;
  // páginas
  pageListSelector?: string;
  /** GALAX: HTML das páginas dentro de #zeist-raw-data */
  rawPages?: boolean;
  /** Traduções do Lipe: JSON de páginas num script */
  scriptPages?: boolean;
}

const MAX_RESULTS = 20; // MAX_MANGA_RESULTS
const CHAPTER_FETCH = 150; // MAX_CHAPTER_RESULTS
const CHAPTER_CHUNK = 50;
const EXCLUDED_CATEGORIES = ['Anime', 'Novel', 'Novela'];
const INFO_SELECTOR = '.y6x11p';
const INFO_TITLE = 'strong';
const INFO_DESC = 'span.dt';
const STATUS_WORDS = ['Status', 'Estado'];
const AUTHOR_WORDS = ['Author', 'Autor', 'Mangaka'];
const ARTIST_WORDS = ['Artist', 'Artista'];

// Categorias padrão do ZeistManga upstream (includedCategories)
const DEFAULT_INCLUDED_CATEGORIES = [
  'Series',
  'Manga',
  'Manhwa',
  'Manhua',
  'Doujinshi',
  'Web Novel (JP)',
  'Web Novel (KR)',
  'Web Novel (CN)',
];

const DEFAULTS = {
  supportsLatest: true,
  chapterCategory: 'Chapter',
  popularSelector: 'div.PopularPosts div.grid > figure',
  popularTitleSelector: 'figcaption > a',
  popularUrlSelector: 'figcaption > a',
  detailsSelector: '.grid.gtc-235fr',
  thumbSelector: 'img',
  descriptionSelector: '#synopsis',
  genresSelector: 'div.mt-15 > a[rel=tag]',
  authorSelector: 'span#author',
  artistSelector: 'span#artist',
  altNameSelector: 'header > p',
  statusSelector: 'span[data-status]',
  pageListSelector: 'div.check-box div.separator',
};

interface ResolvedConfig extends Required<
  Pick<
    ZeistConfig,
    | 'supportsLatest'
    | 'chapterCategory'
    | 'popularSelector'
    | 'popularTitleSelector'
    | 'popularUrlSelector'
    | 'detailsSelector'
    | 'thumbSelector'
    | 'descriptionSelector'
    | 'genresSelector'
    | 'authorSelector'
    | 'artistSelector'
    | 'altNameSelector'
    | 'statusSelector'
    | 'pageListSelector'
    | 'includedCategories'
  >
> {
  useNewChapterFeed: boolean;
  chapterLabelSelector?: string;
  chapterLabelFromScript: boolean;
  htmlSearch: boolean;
  rawPages: boolean;
  scriptPages: boolean;
}

function resolveConfig(config: ZeistConfig): ResolvedConfig {
  const included =
    config.includedCategories ??
    (config.extraCategories
      ? [...DEFAULT_INCLUDED_CATEGORIES, ...config.extraCategories]
      : DEFAULT_INCLUDED_CATEGORIES);
  return {
    ...DEFAULTS,
    supportsLatest: config.supportsLatest ?? DEFAULTS.supportsLatest,
    chapterCategory: config.chapterCategory ?? DEFAULTS.chapterCategory,
    includedCategories: included,
    popularSelector: config.popularSelector ?? DEFAULTS.popularSelector,
    popularTitleSelector: config.popularTitleSelector ?? DEFAULTS.popularTitleSelector,
    popularUrlSelector: config.popularUrlSelector ?? DEFAULTS.popularUrlSelector,
    detailsSelector: config.detailsSelector ?? DEFAULTS.detailsSelector,
    thumbSelector: config.thumbSelector ?? DEFAULTS.thumbSelector,
    descriptionSelector: config.descriptionSelector ?? DEFAULTS.descriptionSelector,
    genresSelector: config.genresSelector ?? DEFAULTS.genresSelector,
    authorSelector: config.authorSelector ?? DEFAULTS.authorSelector,
    artistSelector: config.artistSelector ?? DEFAULTS.artistSelector,
    altNameSelector: config.altNameSelector ?? DEFAULTS.altNameSelector,
    statusSelector: config.statusSelector ?? DEFAULTS.statusSelector,
    pageListSelector: config.pageListSelector ?? DEFAULTS.pageListSelector,
    useNewChapterFeed: config.useNewChapterFeed === true,
    chapterLabelSelector: config.chapterLabelSelector,
    chapterLabelFromScript: config.chapterLabelFromScript === true,
    htmlSearch: config.htmlSearch === true,
    rawPages: config.rawPages === true,
    scriptPages: config.scriptPages === true,
  };
}

// ── Status (port de parseStatus + listas do tema) ───────────────────────────

const STATUS_ONGOING = [
  'ongoing', 'en curso', 'en emisión', 'em lançamento', 'em andamento',
  'activo', 'ativo', 'lançando',
];
const STATUS_COMPLETED = ['completed', 'completo', 'finalizado'];
const STATUS_HIATUS = ['hiatus', 'pausado'];
const STATUS_CANCELLED = ['cancelled', 'dropped', 'dropado', 'abandonado', 'cancelado'];

function parseZeistStatus(text?: string | null): MangaStatus {
  const value = (text ?? '').toLowerCase().trim();
  if (STATUS_ONGOING.includes(value)) return 'ongoing';
  if (STATUS_COMPLETED.includes(value)) return 'completed';
  if (STATUS_HIATUS.includes(value)) return 'on_hiatus';
  if (STATUS_CANCELLED.includes(value)) return 'cancelled';
  return 'unknown';
}

// ── Feed JSON do Blogger ────────────────────────────────────────────────────

interface FeedValue {
  $t?: string;
}

interface FeedLink {
  rel?: string;
  href?: string;
}

interface FeedEntry {
  title?: FeedValue;
  published?: FeedValue;
  updated?: FeedValue;
  category?: Array<{ term?: string }>;
  link?: FeedLink[];
  content?: FeedValue;
  'media$thumbnail'?: { url?: string };
}

interface FeedPage {
  'openSearch$totalResults'?: FeedValue;
  'openSearch$itemsPerPage'?: FeedValue;
  entry?: FeedEntry[];
}

interface FeedResponse {
  feed?: FeedPage;
}

function entryTerms(entry: FeedEntry): string[] {
  return (entry.category ?? []).map((category) => category.term ?? '').filter(Boolean);
}

function alternateHref(entry: FeedEntry): string | null {
  const link = (entry.link ?? []).find((item) => item.rel === 'alternate');
  return link?.href ?? null;
}

/** URL do feed com a URL do post removida (substringAfter(baseUrl)). */
function stripBase(href: string, baseUrl: string): string {
  return href.startsWith(baseUrl) ? href.slice(baseUrl.length) : href;
}

/** Normaliza miniaturas do Blogger (regex do tema). */
function normalizeThumb(url: string): string {
  return url.replace(/\/s.+?-c\//g, '/w600/').replace(/=s(?!.*=s).+?-c$/g, '=w600');
}

function thumbFromEntry(entry: FeedEntry, baseUrl: string): string | null {
  const thumbnail = entry['media$thumbnail']?.url;
  if (thumbnail) return normalizeThumb(thumbnail);
  const html = entry.content?.$t;
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const img = doc.querySelector('img');
  return img ? absUrl(img.getAttribute('src'), baseUrl) : null;
}

// ── Motor ───────────────────────────────────────────────────────────────────

export class ZeistMangaSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest: boolean;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly cfg: ResolvedConfig;
  private readonly docCache = new Map<string, { doc: Document; url: string; at: number }>();

  constructor(config: ZeistConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.cfg = resolveConfig(config);
    this.supportsLatest = this.cfg.supportsLatest;
  }

  // ── URLs ──────────────────────────────────────────────────────────────────

  private apiUrl(feed?: string): string {
    const prefix = `${this.baseUrl}/feeds/posts/default/`;
    if (!feed) return `${prefix}?alt=json`;
    // "-" é o separador de labels do Blogger (default/-/Chapter/...)
    const segments = feed.split('/').map(encodeURIComponent).join('/');
    return `${prefix}-/${segments}?alt=json`;
  }

  /**
   * Query de categorias no formato do Blogger (sintaxe do Zeist upstream):
   * `{label:"A" label:"B"} -label:"X" -label:"Y" [texto]` — o `{...}` é OR,
   * `-label:` exclui. Buscar só por `/-/Series` perdia mangás com label
   * "Manga"/"Manhwa" etc.
   */
  private categoryQuery(text = ''): string {
    const parts = [`{${this.cfg.includedCategories.map((c) => `label:"${c}"`).join(' ')}}`];
    for (const cat of [...EXCLUDED_CATEGORIES, this.cfg.chapterCategory]) {
      parts.push(`-label:"${cat.trim()}"`);
    }
    const query = text.trim();
    if (query) parts.push(query);
    return parts.join(' ');
  }

  private feedOpts(): { xhr: true } {
    return { xhr: true };
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  async getPopular(page: number): Promise<MangasPage> {
    if (!this.cfg.supportsLatest) return this.getLatest(page);
    const html = await extGet(this.baseUrl);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mangas: MangaSummary[] = [];
    for (const element of queryJsoup(doc, this.cfg.popularSelector)) {
      const titleEl = selectFirst(element, this.cfg.popularTitleSelector);
      const urlEl = selectFirst(element, this.cfg.popularUrlSelector);
      if (!titleEl || !urlEl) continue;
      const href = urlEl.getAttribute('href');
      const title = (titleEl.textContent || '').trim();
      if (!href || !title) continue;
      const img = selectFirst(element, 'img');
      const cover = img
        ? absUrl(img.getAttribute('src') ?? img.getAttribute('data-src'), this.baseUrl)
        : null;
      mangas.push({
        id: encodeId(this.pathOf(href)),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return { mangas, hasNextPage: false };
  }

  async getLatest(page: number): Promise<MangasPage> {
    const start = MAX_RESULTS * (page - 1) + 1;
    const url =
      `${this.apiUrl()}&orderby=published` +
      `&q=${encodeURIComponent(this.categoryQuery())}` +
      `&max-results=${MAX_RESULTS + 1}&start-index=${start}`;
    return this.parseFeedList(await this.fetchFeed(url));
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const trimmed = query.trim();
    const start = MAX_RESULTS * (page - 1) + 1;
    const q = encodeURIComponent(this.categoryQuery(trimmed));

    if (this.cfg.htmlSearch && trimmed) {
      const url =
        `${this.baseUrl}/search?q=${q}` +
        `&max-results=${MAX_RESULTS + 1}&start-index=${start}`;
      const html = await extGet(url);
      return this.parseHtmlSearch(html);
    }

    const url = `${this.apiUrl()}&q=${q}&max-results=${MAX_RESULTS + 1}&start-index=${start}`;
    return this.parseFeedList(await this.fetchFeed(url));
  }

  /**
   * Gênero no Zeist = label do Blogger (as tags do details são os labels
   * `a[rel=tag]`): busca o feed com `q={label:"<gênero>"} -label:...`.
   */
  async searchByGenre(page: number, genre: string): Promise<MangasPage> {
    const trimmed = genre.trim();
    if (!trimmed) return { mangas: [], hasNextPage: false };
    const start = MAX_RESULTS * (page - 1) + 1;

    const parts = [`{label:"${trimmed.replace(/"/g, '')}"}`];
    for (const cat of [...EXCLUDED_CATEGORIES, this.cfg.chapterCategory]) {
      parts.push(`-label:"${cat.trim()}"`);
    }
    const url =
      `${this.apiUrl()}&q=${encodeURIComponent(parts.join(' '))}` +
      `&max-results=${MAX_RESULTS + 1}&start-index=${start}`;
    return this.parseFeedList(await this.fetchFeed(url));
  }

  private async fetchFeed(url: string): Promise<FeedResponse> {
    const text = await extGet(url, this.feedOpts());
    try {
      return JSON.parse(text) as FeedResponse;
    } catch {
      return {};
    }
  }

  private parseFeedList(response: FeedResponse): MangasPage {
    // Sem filtro local de categoria: o `q={labels} -labels` do Blogger já
    // seleciona (como no Zeist upstream desde "Fix some mangas not appearing").
    const entries = response.feed?.entry ?? [];
    const items = entries
      .map((entry) => this.entryToSummary(entry))
      .filter((item): item is MangaSummary => item !== null);

    const hasNextPage = items.length === MAX_RESULTS + 1;
    if (hasNextPage) items.pop();
    return { mangas: items, hasNextPage };
  }

  private entryToSummary(entry: FeedEntry): MangaSummary | null {
    const title = entry.title?.$t?.trim();
    const href = alternateHref(entry);
    if (!title || !href) return null;
    const cover = thumbFromEntry(entry, this.baseUrl);
    return {
      id: encodeId(stripBase(href, this.baseUrl)),
      title,
      coverUrl: cover ? extImage(cover) : undefined,
    };
  }

  /** Hanmokku: resultados em HTML (div.grid.gtc-f141a). */
  private parseHtmlSearch(html: string): MangasPage {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const mangas: MangaSummary[] = [];
    for (const element of queryJsoup(doc, 'div.grid.gtc-f141a > div')) {
      const titleEl = selectFirst(element, 'a.ck');
      const urlEl = selectFirst(element, 'a');
      if (!titleEl || !urlEl) continue;
      const href = urlEl.getAttribute('href');
      const title = (titleEl.textContent || '').trim();
      if (!href || !title) continue;
      const img = selectFirst(element, 'img');
      const cover = img
        ? absUrl(img.getAttribute('src') ?? img.getAttribute('data-src'), this.baseUrl)
        : null;
      mangas.push({
        id: encodeId(this.pathOf(href)),
        title,
        coverUrl: cover ? extImage(cover) : undefined,
      });
    }
    return { mangas, hasNextPage: false };
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

  /** Título do post: og:title sem o sufixo do blog (ou <title>). */
  private extractTitle(doc: Document): string {
    const og =
      selectFirst(doc, 'meta[property="og:title"]')?.getAttribute('content') ??
      selectFirst(doc, 'meta[property=og:title]')?.getAttribute('content');
    if (og) return this.trimBlogSuffix(og);
    const title = doc.querySelector('title')?.textContent;
    if (title) return this.trimBlogSuffix(title);
    return '';
  }

  private trimBlogSuffix(value: string): string {
    const text = value.trim();
    const idx = text.lastIndexOf(' - ');
    return (idx > 0 ? text.slice(0, idx) : text).trim();
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path = decodeId(id);
    const { doc } = await this.mangaDoc(path);
    const profile = selectFirst(doc, this.cfg.detailsSelector);
    const title = this.extractTitle(doc);
    if (!title) return null;

    let cover: string | null = null;
    let description: string | undefined;
    let genres: string[] = [];
    let author: string | undefined;
    let artist: string | undefined;
    let status: MangaStatus = 'unknown';

    if (profile) {
      const thumb = selectFirst(profile, this.cfg.thumbSelector);
      if (thumb) {
        const src =
          thumb.getAttribute('src') ??
          thumb.getAttribute('data-src') ??
          thumb.getAttribute('data-lazy-src');
        cover = absUrl(src, this.baseUrl);
      }

      description = eachText(profile, this.cfg.descriptionSelector).join(' ') || undefined;

      const alt = selectFirst(profile, this.cfg.altNameSelector);
      const altText = alt ? (alt.textContent || '').trim() : '';
      if (altText) {
        description = `${description ?? ''}\n\nNomes alternativos: ${altText}`.trim();
      }

      genres = eachText(profile, this.cfg.genresSelector);
      author = textOrNull(selectFirst(profile, this.cfg.authorSelector));
      artist = textOrNull(selectFirst(profile, this.cfg.artistSelector));
      status = parseZeistStatus(selectFirst(profile, this.cfg.statusSelector)?.textContent);

      if (status === 'unknown' || !author || !artist) {
        for (const info of queryJsoup(profile, INFO_SELECTOR)) {
          const own = ownText(info);
          const infoText = own || (selectFirst(info, INFO_TITLE)?.textContent || '').trim();
          const descText = eachText(info, INFO_DESC).join(' ').trim();
          if (status === 'unknown' && STATUS_WORDS.some((word) => infoText.includes(word))) {
            status = parseZeistStatus(descText);
          } else if (!author && AUTHOR_WORDS.some((word) => infoText.includes(word))) {
            author = descText || undefined;
          } else if (!artist && ARTIST_WORDS.some((word) => infoText.includes(word))) {
            artist = descText || undefined;
          }
        }
      }
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

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const path = decodeId(mangaId);
    const { doc, url } = await this.mangaDoc(path);
    const title = this.extractTitle(doc);
    const feedUrl = this.chapterFeedUrl(doc, title);
    const entries = await this.fetchAllChapters(feedUrl);

    const chapters: Chapter[] = [];
    for (const entry of entries) {
      if (!entryTerms(entry).includes(this.cfg.chapterCategory)) continue;
      const name = entry.title?.$t?.trim();
      const href = alternateHref(entry);
      if (!name || !href) continue;
      const dateText = entry.published?.$t ?? entry.updated?.$t;
      const { number } = splitChapterName(name);
      chapters.push({
        id: encodeId(stripBase(href, this.baseUrl)),
        mangaId,
        number,
        title: name,
        uploadedAt: dateText ? parseChapterDate(dateText, 'yyyy-MM-dd') : undefined,
        language: 'pt-br',
      });
    }
    void url;
    chapters.sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    return chapters;
  }

  /** Busca paginada do feed de capítulos (totalResults/itemsPerPage). */
  private async fetchAllChapters(feedUrl: string): Promise<FeedEntry[]> {
    const first = await this.fetchChapterPage(feedUrl, 1, CHAPTER_FETCH);
    const entries = [...(first.feed?.entry ?? [])];
    const total = Number(first.feed?.['openSearch$totalResults']?.$t) || CHAPTER_FETCH;
    const chunk = Number(first.feed?.['openSearch$itemsPerPage']?.$t) || CHAPTER_CHUNK;

    let guard = 0;
    for (let startIndex = entries.length; startIndex < total && guard < 50; startIndex += chunk) {
      guard++;
      const next = await this.fetchChapterPage(feedUrl, startIndex + 1, chunk);
      const pageEntries = next.feed?.entry ?? [];
      if (!pageEntries.length) break;
      entries.push(...pageEntries);
    }
    return entries;
  }

  private async fetchChapterPage(
    feedUrl: string,
    startIndex: number,
    maxResults: number,
  ): Promise<FeedResponse> {
    const url = new URL(feedUrl);
    url.searchParams.set('start-index', String(startIndex));
    url.searchParams.set('max-results', String(maxResults));
    return this.fetchFeed(url.toString());
  }

  /**
   * Cascade do original: useNew → script clwd.run → script legado →
   * new; se nada, o label (`.chapter_get`/script) ou o título.
   */
  private chapterFeedUrl(doc: Document, title: string): string {
    if (this.cfg.useNewChapterFeed) {
      try {
        return this.newChapterFeedUrl(doc);
      } catch {
        return this.chapterPathUrl(this.fallbackLabel(doc, title));
      }
    }

    const script = selectFirst(doc, '#clwd > script');
    if (script) {
      const match = /clwd\.run\(["']([^"']+)["']\)/.exec(script.textContent || '');
      const feed = match ? match[1] : this.fallbackLabel(doc, title);
      return this.chapterPathUrl(feed);
    }
    try {
      return this.oldChapterFeedUrl(doc);
    } catch {
      /* tenta o feed novo */
    }
    try {
      return this.newChapterFeedUrl(doc);
    } catch {
      return this.chapterPathUrl(this.fallbackLabel(doc, title));
    }
  }

  private chapterPathUrl(feed: string): string {
    const base = this.apiUrl(this.cfg.chapterCategory);
    const segments = feed.split('/').map(encodeURIComponent).join('/');
    return `${base.replace(/\?alt=json$/, '')}/${segments}?alt=json`;
  }

  private oldChapterFeedUrl(doc: Document): string {
    const script = selectFirst(doc, '#myUL > script');
    const src = script?.getAttribute('src');
    const match = src ? /([^']+)\?/.exec(src) : null;
    if (!match) throw new Error('sem feed legado');
    return `${this.baseUrl}${match[1]}?alt=json`;
  }

  private newChapterFeedUrl(doc: Document): string {
    let script = selectFirst(doc, '#clwd > script');
    let pattern = /clwd\.run\(["']([^"']+)["']\)/;
    if (!script) {
      script = selectFirst(doc, '#latest > script');
      pattern = /label\s*=\s*'([^']+)'/;
    }
    const match = script ? pattern.exec(script.textContent || '') : null;
    if (!match) throw new Error('sem feed novo');
    return `${this.apiUrl(match[1])}&start-index=1&max-results=999999`;
  }

  private fallbackLabel(doc: Document, title: string): string {
    if (this.cfg.chapterLabelSelector) {
      const element = selectFirst(doc, this.cfg.chapterLabelSelector);
      const label = element?.getAttribute('data-labelchapter');
      if (label) return label;
    }
    if (this.cfg.chapterLabelFromScript) {
      const script = queryJsoup(doc, 'script').find((element) =>
        (element.textContent || '').includes('catNameProject'),
      );
      const match = script ? /=\s+?\('([^']+)'/i.exec(script.textContent || '') : null;
      if (match) return match[1];
    }
    return title;
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const path = decodeId(chapterId);
    const url = absUrl(path, `${this.baseUrl}/`) ?? `${this.baseUrl}/`;
    const html = await extGet(url);
    const doc = new DOMParser().parseFromString(html, 'text/html');

    if (this.cfg.scriptPages) {
      const script = selectFirst(doc, '.chapter script');
      const content = script?.textContent || '';
      const match = /=\s*(\[[^\]]+\])/i.exec(content);
      if (match) {
        try {
          const list = JSON.parse(match[1]) as unknown;
          if (Array.isArray(list)) {
            return list
              .filter((entry): entry is string => typeof entry === 'string' && !!entry)
              .map((entry, index) => ({
                index,
                imageUrl: extImage(absUrl(entry, this.baseUrl) ?? entry),
              }));
          }
        } catch {
          /* JSON inválido → tenta o HTML */
        }
      }
    }

    if (this.cfg.rawPages) {
      const raw = selectFirst(doc, '#zeist-raw-data');
      const inner = new DOMParser().parseFromString(raw?.textContent || '', 'text/html');
      return this.parsePageImages(inner, this.baseUrl);
    }

    return this.parsePageImages(doc, url);
  }

  private parsePageImages(root: ParentNode, base: string): MangaPage[] {
    const out: MangaPage[] = [];
    for (const container of queryJsoup(root, this.cfg.pageListSelector)) {
      for (const img of queryJsoup(container, 'img[src], img[data-src], img[data-lazy-src]')) {
        const src =
          img.getAttribute('src') ||
          img.getAttribute('data-src') ||
          img.getAttribute('data-lazy-src');
        const abs = absUrl(src, base);
        if (!abs) continue;
        out.push({ index: out.length, imageUrl: extImage(abs) });
      }
    }
    return out;
  }
}

function textOrNull(element: Element | null): string | undefined {
  const text = element ? (element.textContent || '').trim() : '';
  return text || undefined;
}

export function createZeistMangaSource(config: ZeistConfig): ZeistMangaSource {
  return new ZeistMangaSource(config);
}
