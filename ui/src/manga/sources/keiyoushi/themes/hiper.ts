/**
 * Tema Hiper (tRPC Next.js) — port TS de
 * keiyoushi/extensions-source/lib-multisrc/hiper (Apache 2.0).
 *
 * Cobre HipercooL e Hipertoon (+18):
 * - listas/busca via /api/trpc/search.query (sort popular/recent/relevance)
 * - detalhes via auth.me,series.bySlugWithGenres
 * - capítulos via auth.me,series.chapters (paginado, 20 por chamada)
 * - páginas via auth.me,series.bySlug,reader.chapterPages
 *
 * O gate do site responde 401 ou elementos "error" no batch: como no
 * original (interceptor + WebView), fazemos um GET na home para popular o
 * cookie e repetimos a chamada uma vez.
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
import { extGetRaw, extImage, ExtError } from '../http';
import { decodeId, encodeId } from './madara';
import type { Json } from './nextjs';

export interface HiperConfig {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** HipercooL exige x-flux-node (anti-bot); Hipertoon não envia */
  fluxNode?: string;
}

const LIMIT = 30;
const CHAPTER_PAGE_SIZE = 20;
const MAX_CHAPTER_PAGES = 100;
const MAX_RATING = 'pornographic';

interface RawManga {
  id: number;
  slug: string;
  title: string;
  synopsis?: string | null;
  coverUrl?: string | null;
  status?: string | null;
  genres?: string[] | null;
  authors?: string[] | null;
  artists?: string[] | null;
  type?: string | null;
  contentRating?: string | null;
}

interface RawChapter {
  id: number;
  number: number;
  title?: string | null;
  createdAt: string;
}

interface RawPage {
  pageOrder: number;
  webpUrl: string;
  avifUrl?: string | null;
}

function isObject(value: Json | undefined): value is { [key: string]: Json } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** element.result.data.json de um elemento do batch tRPC. */
function batchData(element: Json | undefined): Json | undefined {
  if (!isObject(element)) return undefined;
  const result = element.result;
  if (!isObject(result)) return undefined;
  const data = result.data;
  if (!isObject(data)) return undefined;
  return data.json ?? undefined;
}

function toStatus(text?: string | null): MangaStatus {
  switch ((text ?? '').toLowerCase().trim()) {
    case 'ongoing':
      return 'ongoing';
    case 'hiatus':
      return 'on_hiatus';
    case 'cancelled':
      return 'cancelled';
    case 'completed':
      return 'completed';
    default:
      return 'unknown';
  }
}

/** "Capítulo 12" / "Capítulo 12 – Arco final" (port de buildChapterName). */
function buildChapterName(number: number, title?: string | null): string {
  const label = `Capítulo ${String(number)}`;
  if (!title) return label;
  const hasNumber = (title.match(/\d+(?:\.\d+)?/g) ?? []).some(
    (value) => Number.parseFloat(value) === number,
  );
  return hasNumber ? title : `${label} ${title}`;
}

export class HiperSource implements MangaSource {
  readonly id: string;
  readonly name: string;
  readonly lang = 'pt-br';
  readonly baseUrl: string;
  readonly supportsLatest = true;
  readonly defaultEnabled = false;
  readonly family = 'keiyoushi';

  private readonly fluxNode?: string;
  private readonly jar = new Map<string, string>();

  constructor(config: HiperConfig) {
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.fluxNode = config.fluxNode;
  }

  // ── Cookies / headers ─────────────────────────────────────────────────────

  private absorb(setCookie: string): void {
    for (const pair of setCookie.split(';')) {
      const trimmed = pair.trim();
      const eq = trimmed.indexOf('=');
      if (eq <= 0) continue;
      const name = trimmed.slice(0, eq).trim();
      if (name) this.jar.set(name, trimmed.slice(eq + 1).trim());
    }
  }

  private opts(): { xhr: true; headers: Record<string, string> } {
    const headers: Record<string, string> = {};
    if (this.jar.size) {
      headers.cookie = [...this.jar].map(([name, value]) => `${name}=${value}`).join('; ');
    }
    if (this.fluxNode) headers['x-flux-node'] = this.fluxNode;
    return { xhr: true, headers };
  }

  /** Popula o cookie de sessão do site (o interceptor do original faz isso em 401). */
  private async warmUp(): Promise<void> {
    const result = await extGetRaw(`${this.baseUrl}/`, {
      headers: { accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    });
    this.absorb(result.cookies);
  }

  private async request(url: string): Promise<Json[]> {
    const result = await extGetRaw(url, this.opts());
    this.absorb(result.cookies);
    let parsed: unknown;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      throw new ExtError('O site retornou uma resposta inválida.', 'parsing');
    }
    if (!Array.isArray(parsed)) return [parsed as Json];
    return parsed as Json[];
  }

  /** GET do batch tRPC com retry único em 401 (warm-up de cookie). */
  private async fetchBatch(url: string): Promise<Json[]> {
    try {
      return await this.request(url);
    } catch (error) {
      if (error instanceof ExtError && error.status === 401) {
        await this.warmUp();
        return this.request(url);
      }
      throw error;
    }
  }

  private trpcUrl(procedure: string, input: unknown): string {
    return (
      `${this.baseUrl}/api/trpc/${procedure}` +
      `?batch=1&input=${encodeURIComponent(JSON.stringify(input))}`
    );
  }

  // ── Listas ────────────────────────────────────────────────────────────────

  getPopular(page: number): Promise<MangasPage> {
    return this.searchList(page, '', 'popular');
  }

  getLatest(page: number): Promise<MangasPage> {
    return this.searchList(page, '', 'recent');
  }

  search(page: number, query: string): Promise<MangasPage> {
    return this.searchList(page, query.trim(), 'relevance');
  }

  private async searchList(page: number, query: string, sort: string): Promise<MangasPage> {
    const input = {
      '0': {
        json: {
          q: query,
          sort,
          filters: {
            genres: null,
            type: null,
            status: null,
            contentRating: null,
            author: null,
            artist: null,
            year: null,
          },
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
          maxRating: MAX_RATING,
        },
        meta: {
          values: {
            'filters.genres': ['undefined'],
            'filters.type': ['undefined'],
            'filters.status': ['undefined'],
            'filters.contentRating': ['undefined'],
            'filters.author': ['undefined'],
            'filters.artist': ['undefined'],
            'filters.year': ['undefined'],
          },
        },
      },
    };

    const elements = await this.fetchBatch(this.trpcUrl('search.query', input));
    const json = batchData(elements[0]);
    const hits = isObject(json) && Array.isArray(json.hits) ? json.hits : [];
    const mangas: MangaSummary[] = [];
    for (const hit of hits) {
      if (!isObject(hit)) continue;
      const raw = hit as unknown as RawManga;
      if (!raw.slug || !raw.title) continue;
      mangas.push({
        id: encodeId(`${raw.slug}#${raw.id}`),
        title: raw.title,
        coverUrl: raw.coverUrl ? extImage(raw.coverUrl) : undefined,
        status: toStatus(raw.status),
      });
    }
    return { mangas, hasNextPage: hits.length > 0 };
  }

  // ── Detalhes ──────────────────────────────────────────────────────────────

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const [slug, seriesIdText] = decodeId(id).split('#');
    if (!slug) return null;

    const input = {
      '0': { json: null, meta: { values: ['undefined'] } },
      '1': { json: { slug } },
    };
    const elements = await this.fetchBatch(
      this.trpcUrl('auth.me,series.bySlugWithGenres', input),
    );
    const json = batchData(elements[elements.length - 1]);
    if (!isObject(json)) return null;
    const raw = json as unknown as RawManga;

    const genres = [
      ...(raw.genres ?? []),
      ...(raw.type ? [raw.type] : []),
      ...(raw.contentRating ? [raw.contentRating] : []),
    ].filter(Boolean);

    return {
      id: encodeId(`${raw.slug || slug}#${raw.id ?? seriesIdText ?? ''}`),
      title: raw.title,
      coverUrl: raw.coverUrl ? extImage(raw.coverUrl) : undefined,
      status: toStatus(raw.status),
      genres: genres.length ? genres : undefined,
      description: raw.synopsis || undefined,
      authors: raw.authors?.length ? raw.authors : undefined,
      artists: raw.artists?.length ? raw.artists : undefined,
    };
  }

  // ── Capítulos ─────────────────────────────────────────────────────────────

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const decoded = decodeId(mangaId);
    const [slug, seriesIdText] = decoded.split('#');
    const seriesId = Number(seriesIdText);
    if (!slug || !Number.isFinite(seriesId)) return [];

    const chapters: Chapter[] = [];
    const seen = new Set<number>();

    for (let page = 1; page <= MAX_CHAPTER_PAGES; page++) {
      const input = {
        '0': { json: { values: ['undefined'] } },
        '1': {
          json: {
            seriesId,
            chapterId: null,
            sort: 'best',
            page,
            limit: CHAPTER_PAGE_SIZE,
          },
          meta: { values: { chapterId: ['undefined'] } },
        },
        '2': { json: { seriesId } },
      };
      const elements = await this.fetchBatch(this.trpcUrl('auth.me,series.chapters', input));
      const json = batchData(elements[elements.length - 1]);
      if (!Array.isArray(json)) break;

      let added = 0;
      for (const entry of json) {
        if (!isObject(entry)) continue;
        const raw = entry as unknown as RawChapter;
        if (typeof raw.id !== 'number' || typeof raw.number !== 'number') continue;
        if (seen.has(raw.id)) continue;
        seen.add(raw.id);
        added++;
        chapters.push({
          id: encodeId(`${slug}|${raw.number}|${raw.id}`),
          mangaId,
          number: raw.number,
          title: buildChapterName(raw.number, raw.title),
          uploadedAt: raw.createdAt ? Date.parse(raw.createdAt) || undefined : undefined,
          language: 'pt-br',
        });
      }
      if (json.length < CHAPTER_PAGE_SIZE || added === 0) break;
    }

    return chapters;
  }

  // ── Páginas ───────────────────────────────────────────────────────────────

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const decoded = decodeId(chapterId);
    const [slug, numberText, chapterIdText] = decoded.split('|');
    const chapterNumber = Number.parseFloat(numberText);
    if (!slug || !Number.isFinite(chapterNumber)) return [];

    const input = {
      '0': { json: null, meta: { values: ['undefined'] } },
      '1': { json: { slug } },
      '2': {
        json: {
          seriesSlug: slug,
          chapterNumber,
          chapterId: Number(chapterIdText),
        },
      },
      '3': { json: { position: 'footer_bottom' } },
    };
    const url = this.trpcUrl('auth.me,series.bySlug,reader.chapterPages', input);

    let elements = await this.fetchBatch(url);
    if (elements.some((element) => isObject(element) && 'error' in element)) {
      // gate de sessão — warm-up do cookie e nova tentativa (como no original)
      await this.warmUp();
      elements = await this.request(url);
      if (elements.some((element) => isObject(element) && 'error' in element)) {
        throw new ExtError(
          'O site pediu uma verificação de segurança para este capítulo. Tente novamente em instantes.',
          'blocked',
        );
      }
    }

    const json = batchData(elements[elements.length - 1]);
    if (!Array.isArray(json)) return [];
    const pages: RawPage[] = [];
    for (const entry of json) {
      if (!isObject(entry)) continue;
      pages.push(entry as unknown as RawPage);
    }
    pages.sort((a, b) => (a.pageOrder ?? 0) - (b.pageOrder ?? 0));

    const out: MangaPage[] = [];
    for (const page of pages) {
      const target = page.avifUrl || page.webpUrl;
      if (!target) continue;
      out.push({ index: out.length, imageUrl: extImage(target) });
    }
    if (!out.length) {
      throw new ExtError('Nenhuma página encontrada no capítulo.', 'parsing');
    }
    return out;
  }
}

export function createHiperSource(config: HiperConfig): HiperSource {
  return new HiperSource(config);
}
