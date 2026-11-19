/**
 * MangaFire — port TS da extensão Keiyoushi all/mangafire (Apache 2.0).
 *
 * Fonte: keiyoushi/extensions-source/src/all/mangafire
 * (MangaFire.kt + VrfSigner.kt + Dto.kt)
 *
 * API JSON em mangafire.to com query string assinada pelo VrfSigner:
 *   1) parâmetros ordenados por chave (params "[]" ganham índice [i])
 *   2) path+query (sem "/api") passa por 3 estágios de substituição XOR/T-table
 *   3) base64url do resultado vira o parâmetro "vrf"
 *
 * Capítulos vêm paginados (limit=200) e podem se repetir entre fontes
 * oficiais/fan — sem preferências de merge, mantemos todos (default do app).
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangaStatus,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage } from '../http';
import { decodeId, encodeId } from '../themes/madara';

const SITE_BASE = 'https://mangafire.to';
const LANG_CODE = 'pt-br';
const PAGE_SIZE = 50;
const CHAPTER_PAGE_SIZE = 200;

// ── VrfSigner ────────────────────────────────────────────────────────────────

interface Stage {
  table: Uint8Array;
  key: Uint8Array;
  iv: number;
}

function b64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const SIGN_STAGES: Stage[] = [
  {
    table: b64(
      'yINlmUNho8VYJT+ibTIP+9ESiULpVEtMOoD6U6lRE0R/xwXo/Xp9NrUgC4cw/Lmo33vUyjUE40kUoEWIr/fxfNNcq2s79ShQ5NhNrFnJ4hXPwOu/SuXzIbuTQKGFvfm08E9jvCfqAtoDqvQq3dVWPQFmJjgvkISBeXY3BgANR+yVnjGbcxZ47d6kLNfZPIayTq3/YGySb1KuVZodWp/WGNAO5pfMcpaK53Hhs0allBszaMaxuouOwdxbwgxIw6YunSsXjI05Yi0j9j4eHKfSXR8Ifo/Od+8iamRfCXTyvm7NGRGYdcQ0ywcK/u6RXhrbcCm4t2eCtrDgQVecJGkQ+A==',
    ),
    key: b64('0Ec58JOY3uBzJK9m3zqIOpdlF7UFiax9DmA='),
    iv: 0x5a,
  },
  {
    table: b64(
      'IUFltCxD3Oc2cwCgkJffthaOg9cgPUb0LgW6H/VtfcF0kc5F25t+aWj6JH9VOhOaY0rAFdUxlDnl5BLNvwEJvQtP5qcw7vdb/K+chnbwnspSHT8mz5lqwz41TezG0hkO06FTjJZhsyNuFLDpD2ZZxQj/QIRcF90zpmQ7Byu483WsQqUE0C342HL+JXngRB6fRzxRyVTaKu83h7UYTJ0QMt6ixFh6S3F8gqkKwrGTL3jHNBsD45UnifK8+RGtishQV2K3rujLKEkiZxpr2dYcudFW4oFsDKhad3CLBvuyTqsCo4B7mL5IKQ1vXo/MOOvq1I1d8ar9X6Ttu5KF4fZgiA==',
    ),
    key: b64('AAdjb1iPY8CiDmq9H34tKTBF8a3oDQ=='),
    iv: 0x35,
  },
  {
    table: b64(
      'NQHlu1/wVO5EmkwQymF810qqY2xG1k2obcas4Z9mCsPEIFl9pRIjFxbJ7ybMHbBckT5Ton85E0FOeHezbh/mjlEYpmpnlXOS8dgrqeq2KfxImTh1YK9y0PeMNhzA1OQzSY9brYOJq/l2QnE/hwOeZIhPixVSKIUlDb5vLcH6RWKxkIEMuP0bDwIqQ71AJJaEaMJL7A6YtyIwoRT+L5v4aZzodN/0+3nOGsfblFjgxSfPzVDjNFeNl5P26+kEC/8AHgdrpAbt3hHz3HrRN1Y6e+JHgF7ncFWnoF0y3THL1S71WgWGCa6KtSzTCCG58n68nTyj2T3Sshk7utqCtMi/ZQ==',
    ),
    key: b64('DELOJgPsVaCcblDtTGMdHzM='),
    iv: 0xba,
  },
];

/** Port de VrfSigner.sign — 3 estágios XOR/T-table, saída em base64url. */
function vrfSign(input: string): string {
  let data = new TextEncoder().encode(input);
  for (const { table, key, iv } of SIGN_STAGES) {
    const out = new Uint8Array(data.length);
    let prev = iv;
    for (let i = 0; i < data.length; i++) {
      prev = table[(data[i] ^ key[i % key.length] ^ prev) & 0xff] & 0xff;
      out[i] = prev;
    }
    data = out;
  }
  let binary = '';
  for (const byte of data) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Port do interceptor VrfSigner: monta a query ordenada por chave,
 * renomeia "[]" para "[i]" na string assinada e anexa o "vrf".
 */
function apiUrl(path: string, params: Record<string, string | string[]> = {}): string {
  const flat: [string, string][] = [];
  for (const [key, values] of Object.entries(params)) {
    for (const value of Array.isArray(values) ? values : [values]) flat.push([key, String(value)]);
  }
  flat.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

  let lastKey = '';
  let index = 0;
  const signedInput =
    path.replace(/^\/api/, '') +
    (flat.length
      ? '?' +
        flat
          .map(([key, value]) => {
            let newKey = key;
            if (key.endsWith('[]')) {
              if (lastKey !== key) index = 0;
              lastKey = key;
              newKey = key.replace('[]', `[${index++}]`);
            }
            return `${newKey}=${value}`;
          })
          .join('&')
      : '');

  const query = new URLSearchParams();
  for (const [key, value] of flat) query.append(key, value);
  query.set('vrf', vrfSign(signedInput));
  return `${SITE_BASE}${path}?${query}`;
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

interface ApiMeta {
  lastPage?: number;
  hasNext?: boolean;
}

interface ApiResponse<T> {
  items?: T[];
  meta?: ApiMeta;
}

interface PosterDto {
  small?: string;
  medium?: string;
  large?: string;
}

interface EntityDto {
  title: string;
}

interface MangaDto {
  hid: string;
  slug?: string;
  title: string;
  poster?: PosterDto;
}

interface MangaDetailsDto extends MangaDto {
  type?: string;
  status?: string;
  synopsisHtml?: string;
  authors?: EntityDto[];
  artists?: EntityDto[];
  genres?: EntityDto[];
  themes?: EntityDto[];
}

interface ChapterDto {
  id: number;
  number: number;
  name?: string | null;
  createdAt?: number;
  type?: string;
}

interface PageDto {
  url: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function apiGet<T>(path: string, params: Record<string, string | string[]> = {}): Promise<T> {
  const text = await extGet(apiUrl(path, params), { xhr: true });
  return JSON.parse(text) as T;
}

/** Poster do maior tamanho disponível (port de toSManga.thumbnail_url). */
function posterUrl(poster?: PosterDto): string | undefined {
  const url = poster?.large || poster?.medium || poster?.small;
  return url ? extImage(url) : undefined;
}

/** HTML do synopsis → texto simples (port de toMarkdown, simplificado). */
function htmlToText(html?: string): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || undefined;
}

function mapStatus(status?: string): MangaStatus {
  switch (status?.toLowerCase()) {
    case 'releasing':
      return 'ongoing';
    case 'finished':
      return 'completed';
    case 'on_hiatus':
      return 'on_hiatus';
    case 'discontinued':
      return 'cancelled';
    default:
      return 'unknown';
  }
}

function toSummary(manga: MangaDto): MangaSummary {
  return {
    id: encodeId(manga.hid),
    title: manga.title,
    coverUrl: posterUrl(manga.poster),
  };
}

function parseList(payload: ApiResponse<MangaDto>): MangasPage {
  const items = payload.items ?? [];
  const seen = new Set<string>();
  return {
    mangas: items
      .filter((manga) => {
        if (!manga?.hid || seen.has(manga.hid)) return false;
        seen.add(manga.hid);
        return true;
      })
      .map(toSummary),
    hasNextPage: payload.meta?.hasNext ?? false,
  };
}

/** Port de ChapterDto.toSChapter — número e título do capítulo. */
function toChapter(chapter: ChapterDto, mangaId: string): Chapter {
  const raw = String(chapter.number);
  const number = Number.isFinite(chapter.number) ? chapter.number : 0;
  const short = raw.endsWith('.0') ? raw.slice(0, -2) : raw;
  const name = chapter.name?.trim();
  const title = name ? (/\d/.test(name) ? name : `Ch. ${short} - ${name}`) : `Ch. ${short}`;
  return {
    id: encodeId(String(chapter.id)),
    mangaId,
    number,
    title,
    scanlator: chapter.type,
    uploadedAt: chapter.createdAt ? chapter.createdAt * 1000 : undefined,
    language: LANG_CODE,
  };
}

// ── Fonte ────────────────────────────────────────────────────────────────────

export function createMangaFireSource(): MangaSource {
  /** Todas as páginas de capítulos (a API pagina em limit=200). */
  async function fetchAllChapters(hid: string): Promise<ChapterDto[]> {
    const params = {
      language: LANG_CODE,
      sort: 'number',
      order: 'desc',
      page: '1',
      limit: String(CHAPTER_PAGE_SIZE),
    };
    const first = await apiGet<ApiResponse<ChapterDto>>(`/api/titles/${hid}/chapters`, params);
    const all = [...(first.items ?? [])];
    const lastPage = first.meta?.lastPage ?? 1;
    for (let page = 2; page <= lastPage && page <= 20; page++) {
      const next = await apiGet<ApiResponse<ChapterDto>>(`/api/titles/${hid}/chapters`, {
        ...params,
        page: String(page),
      });
      all.push(...(next.items ?? []));
    }
    return all;
  }

  async function fetchDetails(hid: string): Promise<MangaDetailsDto | null> {
    const payload = await apiGet<{ data?: MangaDetailsDto }>(`/api/titles/${hid}`);
    const data = payload.data;
    return data && data.hid ? data : null;
  }

  async function listByOrder(order: string, page: number): Promise<MangasPage> {
    const payload = await apiGet<ApiResponse<MangaDto>>('/api/titles', {
      [`order[${order}]`]: 'desc',
      'languages[]': LANG_CODE,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    return parseList(payload);
  }

  return {
    id: 'keiyoushi-pt-mangafire',
    name: 'MangaFire',
    lang: 'pt-br',
    baseUrl: SITE_BASE,
    supportsLatest: true,
    defaultEnabled: false,
    family: 'keiyoushi',

    async getPopular(page: number): Promise<MangasPage> {
      return listByOrder('views_30d', page);
    },

    async getLatest(page: number): Promise<MangasPage> {
      return listByOrder('chapter_updated_at', page);
    },

    async search(page: number, query: string): Promise<MangasPage> {
      const keyword = query.trim();
      const payload = await apiGet<ApiResponse<MangaDto>>('/api/titles', {
        ...(keyword ? { keyword } : {}),
        'languages[]': LANG_CODE,
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      return parseList(payload);
    },

    async getMangaDetails(id: string): Promise<MangaDetails | null> {
      const hid = decodeId(id);
      const data = await fetchDetails(hid);
      if (!data) return null;

      const genres = [
        ...(data.type ? [data.type.charAt(0).toUpperCase() + data.type.slice(1)] : []),
        ...(data.genres ?? []).map((genre) => genre.title),
        ...(data.themes ?? []).map((theme) => theme.title),
      ];

      return {
        ...toSummary(data),
        description: htmlToText(data.synopsisHtml),
        authors: (data.authors ?? []).map((author) => author.title),
        artists: (data.artists ?? []).map((artist) => artist.title),
        genres,
        tags: genres,
        status: mapStatus(data.status),
        preferredLanguage: LANG_CODE,
      };
    },

    async getChapters(mangaId: string): Promise<Chapter[]> {
      const hid = decodeId(mangaId);
      const chapters = await fetchAllChapters(hid);
      return chapters.map((chapter) => toChapter(chapter, mangaId));
    },

    async getPages(chapterId: string): Promise<MangaPage[]> {
      const rawId = decodeId(chapterId);
      const payload = await apiGet<{ data?: { pages?: PageDto[] } }>(`/api/chapters/${rawId}`);
      const pages = payload.data?.pages ?? [];
      return pages.map((page, index) => ({
        index,
        imageUrl: page.url.startsWith('http') ? extImage(page.url) : page.url,
      }));
    },
  };
}
