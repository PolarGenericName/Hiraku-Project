/**
 * MangaDex source — implementação nativa em TS do contrato MangaSource.
 * API pública: https://api.mangadex.org (via proxy local /api/mangadex).
 *
 * Idioma dos capítulos configurável por fonte (PT-BR/Inglês/Multilíngue);
 * o padrão "multilíngue" prioriza pt-br com fallback para en.
 */

import type {
  MangaSource,
  MangasPage,
  MangaSummary,
  MangaDetails,
  MangaStatus,
  Chapter,
  MangaPage,
} from '../types';
import {
  getSourceLangPref,
  langPrefPriority,
  langPrefToTranslatedLanguages,
} from '../sourcePrefs';

const PROXY_BASE = '/api/mangadex';
const API_TIMEOUT = 15000;
const PAGE_SIZE = 24;
const MAX_OFFSET = 9500; // MangaDex limita offset+limit a ~10000

async function apiGet<T>(path: string): Promise<T | null> {
  try {
    const url = `${PROXY_BASE}?path=${encodeURIComponent(path)}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch (error) {
    console.error('[MangaDex] API error:', error);
    return null;
  }
}

// ── Response shapes (API MangaDex) ───────────────────────────────────────────

interface MdRelationship {
  type: string;
  id: string;
  attributes?: Record<string, unknown>;
}

interface MdEntity {
  id: string;
  type: string;
  attributes: Record<string, any>;
  relationships?: MdRelationship[];
}

interface MdListResponse {
  data?: MdEntity[];
  total?: number;
  limit?: number;
  offset?: number;
}

// ── Mappers ──────────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, MangaStatus> = {
  ongoing: 'ongoing',
  completed: 'completed',
  on_hiatus: 'on_hiatus',
  cancelled: 'cancelled',
};

function mapStatus(status?: string): MangaStatus {
  return (status && STATUS_MAP[status]) || 'unknown';
}

/** Lowercase + sem acento (comparação de gêneros pt/en). */
function normalizeGenre(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/**
 * Sinônimos pt → en: os gêneros vêm em português das fontes Keiyoushi e as
 * tags da MangaDex são em inglês (ex.: "Comédia" → Comedy). Chaves em
 * minúsculas SEM acento (o needle já vem normalizado).
 */
const GENRE_PT_TO_EN: Record<string, string> = {
  acao: 'action',
  aventura: 'adventure',
  comedia: 'comedy',
  demonio: 'demons',
  esporte: 'sports',
  esportes: 'sports',
  escolar: 'school life',
  'vida escolar': 'school life',
  'ficcao cientifica': 'sci-fi',
  fantasia: 'fantasy',
  harem: 'harem',
  historico: 'historical',
  terror: 'horror',
  magia: 'magic',
  misterio: 'mystery',
  musica: 'music',
  parodia: 'parody',
  policial: 'police',
  psicologico: 'psychological',
  reencarnacao: 'reincarnation',
  sobrenatural: 'supernatural',
  suspense: 'thriller',
  vampiro: 'vampire',
  'slice of life': 'slice of life',
  'one shot': 'one shot',
};

function mapTitle(attributes: Record<string, any>): string {
  const title = attributes?.title;
  if (!title) return '';
  // Preferência: en → pt-br → primeiro disponível
  return title.en || title['pt-br'] || title['pt'] || Object.values(title)[0] || '';
}

function mapCover(entity: MdEntity): string | undefined {
  const rel = entity.relationships?.find((r) => r.type === 'cover_art');
  const fileName = rel?.attributes?.fileName as string | undefined;
  if (!fileName) return undefined;
  const direct = `https://uploads.mangadex.org/covers/${entity.id}/${fileName}.512.jpg`;
  // O CDN de capas gateia browsers (challenge) — passa pelo servidor local
  return `${PROXY_BASE}/image?url=${encodeURIComponent(direct)}`;
}

function mapSummary(entity: MdEntity): MangaSummary {
  const a = entity.attributes || {};
  const year =
    typeof a.year === 'number'
      ? a.year
      : a.startDate
        ? parseInt(String(a.startDate).slice(0, 4), 10) || undefined
        : undefined;

  return {
    id: entity.id,
    title: mapTitle(a),
    coverUrl: mapCover(entity),
    status: mapStatus(a.status),
    year: Number.isFinite(year) ? year : undefined,
    genres: Array.isArray(a.tags)
      ? a.tags.map((t: any) => t?.attributes?.name?.en).filter(Boolean)
      : undefined,
  };
}

function mapDetails(entity: MdEntity): MangaDetails {
  const base = mapSummary(entity);
  const a = entity.attributes || {};
  const authors = (entity.relationships || [])
    .filter((r) => r.type === 'author')
    .map((r) => (r.attributes?.name as string) || '')
    .filter(Boolean);

  return {
    ...base,
    description: a.description?.['pt-br'] || a.description?.en || undefined,
    authors: authors.length ? authors : undefined,
    artists: (entity.relationships || [])
      .filter((r) => r.type === 'artist')
      .map((r) => (r.attributes?.name as string) || '')
      .filter(Boolean) || undefined,
    preferredLanguage: 'pt-br',
  };
}

/** Monta o parâmetro translatedLanguage[] a partir da preferência da fonte */
function langParam(pref: ReturnType<typeof getSourceLangPref>): string {
  return langPrefToTranslatedLanguages(pref)
    .map((l) => `&translatedLanguage[]=${encodeURIComponent(l)}`)
    .join('');
}

/** Ordena idiomas pela prioridade da preferência (ex.: pt-br > en > resto) */
function byLanguagePriority(a: string, b: string, priority: string[]): number {
  const ia = priority.indexOf(a);
  const ib = priority.indexOf(b);
  return (ia === -1 ? priority.length : ia) - (ib === -1 ? priority.length : ib);
}

// ── Source ───────────────────────────────────────────────────────────────────

export class MangaDexSource implements MangaSource {
  id = 'mangadex';
  name = 'MangaDex';
  lang = 'pt-br';
  baseUrl = 'https://mangadex.org';
  supportsLatest = true;
  defaultEnabled = true;
  family = 'mangadex';
  supportsLangPref = true;

  async getPopular(page: number): Promise<MangasPage> {
    const offset = Math.min((page - 1) * PAGE_SIZE, MAX_OFFSET);
    const path =
      `/manga?limit=${PAGE_SIZE}&offset=${offset}` +
      `&order[followedCount]=desc` +
      `&contentRating[]=safe&contentRating[]=suggestive` +
      `&includes[]=cover_art`;

    const json = await apiGet<MdListResponse>(path);
    return {
      mangas: (json?.data || []).map(mapSummary),
      hasNextPage: offset + PAGE_SIZE < Math.min(json?.total || 0, MAX_OFFSET + PAGE_SIZE),
    };
  }

  async getLatest(page: number): Promise<MangasPage> {
    const offset = Math.min((page - 1) * PAGE_SIZE, MAX_OFFSET);
    // Últimos capítulos publicados (idioma conforme a preferência da fonte)
    const path =
      `/chapter?limit=${PAGE_SIZE}&offset=${offset}` +
      `&order[publishAt]=desc` +
      langParam(getSourceLangPref(this.id)) +
      `&contentRating[]=safe&contentRating[]=suggestive` +
      `&includes[]=manga`;

    const json = await apiGet<MdListResponse>(path);
    const mangaIds = new Set<string>();
    const mangas: MangaSummary[] = [];

    for (const chapter of json?.data || []) {
      const mangaRel = chapter.relationships?.find((r) => r.type === 'manga');
      if (!mangaRel || mangaIds.has(mangaRel.id)) continue;
      mangaIds.add(mangaRel.id);
      // A entidade manga nas relações traz os atributos básicos (sem capa)
      mangas.push(mapSummary(mangaRel as unknown as MdEntity));
    }

    // Busca as capas em lote (includes[]=manga não traz cover_art)
    if (mangas.length > 0) {
      const idsParam = mangas.map((m) => `ids[]=${encodeURIComponent(m.id)}`).join('&');
      const covers = await apiGet<MdListResponse>(
        `/manga?limit=${mangas.length}&${idsParam}&includes[]=cover_art`
      );
      if (covers?.data) {
        const coverById = new Map(covers.data.map((e) => [e.id, mapCover(e)]));
        for (const m of mangas) {
          const cover = coverById.get(m.id);
          if (cover) m.coverUrl = cover;
        }
      }
    }

    return {
      mangas,
      hasNextPage: offset + PAGE_SIZE < Math.min(json?.total || 0, MAX_OFFSET + PAGE_SIZE),
    };
  }

  async search(page: number, query: string): Promise<MangasPage> {
    const offset = Math.min((page - 1) * PAGE_SIZE, MAX_OFFSET);
    // Sem filtro de contentRating: a busca é intenção explícita do usuário
    // (filtros esconderiam títulos como Berserk, classificado como "erotica")
    const path =
      `/manga?title=${encodeURIComponent(query)}` +
      `&limit=${PAGE_SIZE}&offset=${offset}` +
      `&order[relevance]=desc` +
      `&includes[]=cover_art`;

    const json = await apiGet<MdListResponse>(path);
    return {
      mangas: (json?.data || []).map(mapSummary),
      hasNextPage: offset + PAGE_SIZE < Math.min(json?.total || 0, MAX_OFFSET + PAGE_SIZE),
    };
  }

  /** Cache de tags da MangaDex (todos os nomes → id) para filtro de gênero. */
  private genreTagCache: Array<{ id: string; names: string[] }> | null = null;

  /**
   * Resolve o nome de um gênero (pt/en, com ou sem acento) para o id da tag.
   * As tags da MangaDex têm nome só em inglês na maioria dos casos — por
   * isso o mapa de sinônimos pt→en e a comparação sem acento.
   */
  private async findGenreTagId(genre: string): Promise<string | null> {
    if (!this.genreTagCache) {
      const json = await apiGet<MdListResponse>('/manga/tag');
      this.genreTagCache = (json?.data ?? []).map((tag) => ({
        id: tag.id,
        names: Object.values((tag.attributes?.name ?? {}) as Record<string, string>).map((n) =>
          normalizeGenre(String(n)),
        ),
      }));
    }

    const needle = normalizeGenre(genre);
    const byName = this.genreTagCache.find((t) => t.names.includes(needle));
    if (byName) return byName.id;

    const alias = GENRE_PT_TO_EN[needle];
    if (alias) {
      const byAlias = this.genreTagCache.find((t) => t.names.includes(normalizeGenre(alias)));
      if (byAlias) return byAlias.id;
    }
    return null;
  }

  async searchByGenre(page: number, genre: string): Promise<MangasPage> {
    const tagId = await this.findGenreTagId(genre);
    // Sem tag conhecida: nada de busca por título (retorna lixo fuzzy que
    // não tem o gênero) — lista vazia é honesta.
    if (!tagId) return { mangas: [], hasNextPage: false };

    const offset = Math.min((page - 1) * PAGE_SIZE, MAX_OFFSET);
    const path =
      `/manga?includedTags[]=${encodeURIComponent(tagId)}` +
      `&limit=${PAGE_SIZE}&offset=${offset}` +
      `&order[followedCount]=desc` +
      `&contentRating[]=safe&contentRating[]=suggestive` +
      `&includes[]=cover_art`;

    const json = await apiGet<MdListResponse>(path);
    return {
      mangas: (json?.data || []).map(mapSummary),
      hasNextPage: offset + PAGE_SIZE < Math.min(json?.total || 0, MAX_OFFSET + PAGE_SIZE),
    };
  }

  async getMangaDetails(id: string): Promise<MangaDetails | null> {
    const path =
      `/manga/${encodeURIComponent(id)}` +
      `?includes[]=cover_art&includes[]=author&includes[]=artist`;

    const json = await apiGet<{ data?: MdEntity }>(path);
    if (!json?.data) return null;
    const pref = getSourceLangPref(this.id);
    return {
      ...mapDetails(json.data),
      preferredLanguage: pref === 'multi' ? 'pt-br' : pref,
    };
  }

  async getChapters(mangaId: string): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let offset = 0;
    const limit = 500;
    const pref = getSourceLangPref(this.id);
    const priority = langPrefPriority(pref);

    // Pagina até esgotar (capítulos podem passar de 500)
    // Sem contentRating: o usuário já abriu este mangá — todos os
    // capítulos devem aparecer (o filtro escondería mangás "erotica")
    for (let guard = 0; guard < 4; guard++) {
      const path =
        `/manga/${encodeURIComponent(mangaId)}/feed` +
        `?limit=${limit}&offset=${offset}` +
        `&order[chapter]=desc` +
        langParam(pref);

      const json = await apiGet<MdListResponse>(path);
      const data = json?.data || [];

      for (const ch of data) {
        const a = ch.attributes || {};
        const number = parseFloat(a.chapter);
        chapters.push({
          id: ch.id,
          mangaId,
          number: Number.isFinite(number) ? number : 0,
          title: a.title || undefined,
          scanlator: undefined, // requer include scanlation_group (custo extra)
          uploadedAt: a.publishAt ? Date.parse(a.publishAt) : undefined,
          language: a.translatedLanguage || 'en',
        });
      }

      offset += limit;
      if (!json?.total || offset >= json.total || data.length === 0) break;
    }

    // Deduplicar por número+idioma (grupos diferentes publicam o mesmo cap.)
    // Priorizar pt-br quando existe o mesmo número em dois idiomas
    const byNumber = new Map<number, Chapter>();
    for (const ch of chapters) {
      const existing = byNumber.get(ch.number);
      if (!existing) {
        byNumber.set(ch.number, ch);
        continue;
      }
      if (byLanguagePriority(ch.language, existing.language, priority) < 0) {
        byNumber.set(ch.number, ch);
      }
    }

    return Array.from(byNumber.values()).sort((a, b) => b.number - a.number);
  }

  async getChapter(chapterId: string): Promise<Chapter | null> {
    const json = await apiGet<{ data?: MdEntity }>(
      `/chapter/${encodeURIComponent(chapterId)}`
    );
    const ch = json?.data;
    if (!ch) return null;

    const a = ch.attributes || {};
    const number = parseFloat(a.chapter);
    const mangaRel = ch.relationships?.find((r) => r.type === 'manga');

    return {
      id: ch.id,
      mangaId: mangaRel?.id ?? '',
      number: Number.isFinite(number) ? number : 0,
      title: a.title || undefined,
      uploadedAt: a.publishAt ? Date.parse(a.publishAt) : undefined,
      language: a.translatedLanguage || 'en',
    };
  }

  async getPages(chapterId: string): Promise<MangaPage[]> {
    const json = await apiGet<{
      baseUrl?: string;
      chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
    }>(`/at-home/server/${encodeURIComponent(chapterId)}`);

    const baseUrl = json?.baseUrl;
    const hash = json?.chapter?.hash;
    const files = json?.chapter?.data;
    if (!baseUrl || !hash || !files?.length) return [];

    return files.map((file, index) => ({
      index,
      imageUrl: `${baseUrl}/data/${hash}/${file}`,
    }));
  }
}
