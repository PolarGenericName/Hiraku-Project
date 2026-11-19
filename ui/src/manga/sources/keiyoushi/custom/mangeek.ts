/**
 * ManGeek — port TS da extensão Keiyoushi pt/mangeek (Apache 2.0).
 *
 * Fonte: keiyoushi/extensions-source/src/pt/mangeek (ManGeek.kt + Dto.kt)
 *
 * API JSON em geekstations.com.br (só http, sem TLS) com URL assinada:
 *   nonce = timestamp em hex MAIÚSCULO
 *   key   = md5("M<input#MANG33K>D") em hex MINÚSCULO
 * Rota: /api/v2/pt/<route>/<nonce>[/<input>]/<key>
 *
 * Busca é um POST com corpo JSON {tags: []}; páginas vêm do endpoint
 * "chapter" (fallback "mirror"); imagens do IP 51.79.78.152 são servidas
 * por static.geekstations.com.br.
 */

import type {
  Chapter,
  MangaDetails,
  MangaPage,
  MangaSource,
  MangasPage,
  MangaSummary,
} from '../../../types';
import { extGet, extImage, extPostJson } from '../http';
import { decodeId, encodeId, md5HexString } from '../themes/madara';

const SITE_BASE = 'https://mangeek.app';
const API_BASE = 'http://geekstations.com.br/api/v2/pt';

interface ApiChapter {
  id: number;
  title: string;
}

interface ApiManga {
  id: number;
  title: string;
  alternative_title?: string | null;
  description?: string;
  tags?: string[];
  thumbnail?: string;
  finished?: boolean | null;
  chapters?: ApiChapter[] | null;
}

interface NewsDto {
  manga: ApiManga;
}

interface HomeDto {
  tops?: ApiManga[];
  trending?: ApiManga[];
  news?: NewsDto[];
  reading?: NewsDto[];
  categories?: { list?: ApiManga[] }[];
  tags?: string[];
}

interface ChapterPagesDto {
  pages?: string[];
}

/** Port de ManGeek.signedUrl — nonce hex maiúsculo, assinatura md5 minúscula. */
function signedUrl(route: string, input?: string): string {
  const nonce = Date.now().toString(16).toUpperCase();
  const signatureInput = input ?? nonce;
  const key = md5HexString(`M<${signatureInput}#MANG33K>D`);
  const parts = [API_BASE, route, nonce];
  if (input !== undefined) parts.push(input);
  parts.push(key);
  return parts.join('/');
}

/** Port de String.normalizeImageUrl — IP vira o host estático com https. */
function normalizeImageUrl(url: string): string {
  return url.replace(/^https?:\/\/51\.79\.78\.152/, 'https://static.geekstations.com.br');
}

/** tops + trending + news + reading + categorias, sem repetir (catalogMangas). */
function catalogMangas(home: HomeDto): ApiManga[] {
  const all: ApiManga[] = [
    ...(home.tops ?? []),
    ...(home.trending ?? []),
    ...(home.news ?? []).map((news) => news.manga),
    ...(home.reading ?? []).map((news) => news.manga),
    ...(home.categories ?? []).flatMap((category) => category.list ?? []),
  ];
  const seen = new Set<number>();
  return all.filter((manga) => {
    if (!manga || seen.has(manga.id)) return false;
    seen.add(manga.id);
    return true;
  });
}

function mapStatus(finished?: boolean | null): MangaSummary['status'] {
  if (finished === true) return 'completed';
  if (finished === false) return 'ongoing';
  return 'unknown';
}

function toSummary(manga: ApiManga): MangaSummary {
  const thumb = manga.thumbnail ? extImage(normalizeImageUrl(manga.thumbnail)) : undefined;
  return {
    id: encodeId(String(manga.id)),
    title: manga.title,
    coverUrl: thumb,
    status: mapStatus(manga.finished),
    genres: manga.tags ?? [],
  };
}

/** Port de ChapterDto.toSChapter — número com vírgula ou ponto decimal. */
function chapterNumber(title: string): number {
  const match = /\d+(?:[.,]\d+)?/.exec(title);
  if (!match) return 0;
  const value = Number(match[0].replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

async function getHome(): Promise<HomeDto> {
  const text = await extGet(signedUrl('home'), { xhr: true });
  return JSON.parse(text) as HomeDto;
}

async function getMangaApi(rawId: string): Promise<ApiManga | null> {
  const text = await extGet(signedUrl('manga', rawId), { xhr: true });
  const manga = JSON.parse(text) as ApiManga;
  return manga && typeof manga.id === 'number' ? manga : null;
}

/** Capítulos da API vêm do mais antigo ao mais novo — inverte (port de asReversed). */
function mapChapters(manga: ApiManga, mangaId: string): Chapter[] {
  const list = manga.chapters ?? [];
  return [...list].reverse().map((chapter) => ({
    id: encodeId(String(chapter.id)),
    mangaId,
    number: chapterNumber(chapter.title),
    title: chapter.title,
    language: 'pt-br',
  }));
}

async function pagesFrom(route: 'chapter' | 'mirror', chapterId: string): Promise<string[]> {
  try {
    const text = await extGet(signedUrl(route, chapterId), { xhr: true });
    const parsed = JSON.parse(text) as ChapterPagesDto;
    return parsed.pages ?? [];
  } catch {
    return [];
  }
}

export function createManGeekSource(): MangaSource {
  const popular = async (): Promise<MangasPage> => {
    const home = await getHome();
    return { mangas: catalogMangas(home).map(toSummary), hasNextPage: false };
  };

  return {
    id: 'keiyoushi-pt-mangeek',
    name: 'ManGeek',
    lang: 'pt-br',
    baseUrl: SITE_BASE,
    supportsLatest: true,
    defaultEnabled: false,
    family: 'keiyoushi',

    async getPopular(): Promise<MangasPage> {
      return popular();
    },

    async getLatest(): Promise<MangasPage> {
      const home = await getHome();
      const seen = new Set<number>();
      const mangas = (home.news ?? [])
        .map((news) => news.manga)
        .filter((manga) => {
          if (seen.has(manga.id)) return false;
          seen.add(manga.id);
          return true;
        })
        .map(toSummary);
      return { mangas, hasNextPage: false };
    },

    async search(_page: number, query: string): Promise<MangasPage> {
      const normalized = query.trim().toLowerCase();
      if (!normalized) return popular();

      const text = await extPostJson(signedUrl('search', normalized), { tags: [] }, { xhr: true });
      const mangas = (JSON.parse(text) as ApiManga[]) ?? [];
      const seen = new Set<number>();
      return {
        mangas: mangas
          .filter((manga) => {
            if (seen.has(manga.id)) return false;
            seen.add(manga.id);
            return true;
          })
          .map(toSummary),
        hasNextPage: false,
      };
    },

    async getMangaDetails(id: string): Promise<MangaDetails | null> {
      const manga = await getMangaApi(decodeId(id));
      if (!manga) return null;
      const alternative = manga.alternative_title?.trim();
      const showAlternative = alternative && alternative.toLowerCase() !== manga.title.toLowerCase();
      return {
        ...toSummary(manga),
        description: showAlternative
          ? `Título alternativo: ${alternative}\n\n${manga.description ?? ''}`
          : manga.description,
        tags: manga.tags ?? [],
      };
    },

    async getChapters(mangaId: string): Promise<Chapter[]> {
      const manga = await getMangaApi(decodeId(mangaId));
      if (!manga) return [];
      return mapChapters(manga, mangaId);
    },

    async getPages(chapterId: string): Promise<MangaPage[]> {
      const rawId = decodeId(chapterId);
      let pages = await pagesFrom('chapter', rawId);
      if (!pages.length) pages = await pagesFrom('mirror', rawId);
      return pages.map((url, index) => ({
        index,
        imageUrl: extImage(normalizeImageUrl(url)),
      }));
    },
  };
}
