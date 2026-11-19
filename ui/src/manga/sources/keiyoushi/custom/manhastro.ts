/**
 * Manhastro — port TS da extensão Keiyoushi pt/manhastro (Apache 2.0).
 *
 * Fonte: keiyoushi/extensions-source/src/pt/manhastro (Manhastro.kt + Dto.kt)
 *
 * Diferente das fontes Madara, usa API JSON própria em api2.manhastro.net
 * com proteção anti-XSSI (o corpo vem com prefixo )]}'). Sem HTML: tudo é
 * JSON bem definido (rank/diario, lancamentos, dados, paginas).
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

const SITE_BASE = 'https://manhastro.net';
const API_BASE = 'https://api2.manhastro.net';

interface ApiManga {
  manga_id: number;
  titulo?: string;
  titulo_brasil?: string | null;
  descricao?: string | null;
  descricao_brasil?: string | null;
  imagem?: string | null;
  generos?: string[];
  status?: string | null;
}

interface ApiChapter {
  capitulo_id: number;
  capitulo_nome: string;
  capitulo_data: string;
}

interface ApiResponse<T> {
  data: T;
  meta?: { has_more?: boolean };
}

interface PagesResponse {
  data: {
    chapter?: { baseUrl: string; hash: string; data: string[] };
  };
}

/** Anti-XSSI — o servidor prefixa )]}', "," ou "_" antes do JSON. */
function cleanJson(body: string): string {
  return body
    .replace(/^\uFEFF/, '')
    .replace(/^\)\]\}'/, '')
    .replace(/^,/, '')
    .replace(/^_/, '')
    .trim();
}

async function apiGet<T>(path: string): Promise<T> {
  const text = await extGet(`${API_BASE}${path}`, { xhr: true });
  return JSON.parse(cleanJson(text)) as T;
}

/** titulo_brasil quando existe, senão o título original (port de displayTitle). */
function displayTitle(manga: ApiManga): string {
  const brasil = manga.titulo_brasil?.trim();
  return brasil ? brasil : (manga.titulo || 'Sem título');
}

function displayDescription(manga: ApiManga): string | undefined {
  const brasil = manga.descricao_brasil?.trim();
  return brasil || manga.descricao || undefined;
}

/** "temp2.manhastro.com/..." (sem esquema) vira https://... */
function coverUrl(imagem?: string | null): string | undefined {
  if (!imagem) return undefined;
  return imagem.startsWith('http') ? imagem : `https://${imagem}`;
}

function mapStatus(status?: string | null): MangaStatus {
  if (status === 'on-going') return 'ongoing';
  if (status === 'end') return 'completed';
  return 'unknown';
}

function toSummary(manga: ApiManga): MangaSummary {
  return {
    id: encodeId(String(manga.manga_id)),
    title: displayTitle(manga),
    coverUrl: coverUrl(manga.imagem) ? extImage(coverUrl(manga.imagem)!) : undefined,
    status: mapStatus(manga.status),
    genres: manga.generos ?? [],
  };
}

/** "2026-06-25 15:38:10" → timestamp local (mesmo que tryParseDateTime). */
function parseDate(value?: string): number | undefined {
  if (!value) return undefined;
  const match = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return undefined;
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0),
  ).getTime();
}

/** Port de extractChapterNumber: primeiro número no nome do capítulo. */
function chapterNumber(name: string): number {
  const match = /(\d+(?:\.\d+)?)/.exec(name);
  return match ? Number(match[1]) : -1;
}

export function createManhastroSource(): MangaSource {
  return {
    id: 'keiyoushi-pt-manhastro',
    name: 'Manhastro',
    lang: 'pt-br',
    baseUrl: SITE_BASE,
    supportsLatest: true,
    defaultEnabled: false,
    family: 'keiyoushi',

    async getPopular(): Promise<MangasPage> {
      const result = await apiGet<ApiResponse<ApiManga[]>>('/rank/diario');
      return { mangas: (result.data ?? []).map(toSummary), hasNextPage: false };
    },

    async getLatest(): Promise<MangasPage> {
      const result = await apiGet<ApiResponse<ApiManga[]>>('/lancamentos');
      const seen = new Set<number>();
      const mangas = (result.data ?? [])
        .filter((manga) => {
          if (seen.has(manga.manga_id)) return false;
          seen.add(manga.manga_id);
          return true;
        })
        .map(toSummary);
      return { mangas, hasNextPage: false };
    },

    async search(page: number, query: string): Promise<MangasPage> {
      const params = new URLSearchParams({ page: String(page) });
      const nome = query.trim();
      if (nome) params.set('nome', nome);
      const result = await apiGet<ApiResponse<ApiManga[]>>(`/dados?${params}`);
      return {
        mangas: (result.data ?? []).map(toSummary),
        hasNextPage: result.meta?.has_more ?? false,
      };
    },

    async getMangaDetails(id: string): Promise<MangaDetails | null> {
      const mangaId = decodeId(id);
      const result = await apiGet<ApiResponse<ApiManga[]>>(`/dados?manga_id=${encodeURIComponent(mangaId)}`);
      const manga = result.data?.[0];
      if (!manga) return null;
      const genres = manga.generos ?? [];
      return {
        ...toSummary(manga),
        description: displayDescription(manga),
        genres,
        tags: genres,
      };
    },

    async getChapters(mangaId: string): Promise<Chapter[]> {
      const rawId = decodeId(mangaId);
      const result = await apiGet<ApiResponse<ApiChapter[]>>(`/dados/${encodeURIComponent(rawId)}`);
      return (result.data ?? [])
        .map((chapter) => ({
          id: encodeId(String(chapter.capitulo_id)),
          mangaId,
          number: chapterNumber(chapter.capitulo_nome),
          title: chapter.capitulo_nome,
          uploadedAt: parseDate(chapter.capitulo_data),
          language: 'pt-br',
        }))
        .sort((a, b) => b.number - a.number || (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
    },

    async getPages(chapterId: string): Promise<MangaPage[]> {
      const rawId = decodeId(chapterId);
      const result = await apiGet<PagesResponse>(`/paginas/${encodeURIComponent(rawId)}`);
      const chapter = result.data?.chapter;
      if (!chapter) return [];
      return chapter.data.map((filename, index) => ({
        index,
        imageUrl: extImage(`${chapter.baseUrl.replace(/\/+$/, '')}/${chapter.hash}/${filename}`),
      }));
    },
  };
}
