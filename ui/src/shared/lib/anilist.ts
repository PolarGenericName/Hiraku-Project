/**
 * AniList API - Catálogo principal
 * GraphQL: https://graphql.anilist.co
 */

const ANILIST_API = '/api/anilist';
const API_TIMEOUT = 15000;

export interface AniListMedia {
  id: number;
  title: {
    romaji?: string;
    english?: string;
    native?: string;
  };
  description?: string;
  coverImage?: {
    large?: string;
    medium?: string;
    extraLarge?: string;
  };
  bannerImage?: string;
  averageScore?: number;
  episodes?: number;
  duration?: number;
  status?: string;
  format?: string;
  season?: string;
  seasonYear?: number;
  genres?: string[];
  nextAiringEpisode?: {
    episode: number;
    airingAt: number;
  };
  trailer?: {
    id: string;
    site: string;
    thumbnail?: string;
  };
}

interface AniListGraphQLResponse {
  Page?: {
    pageInfo?: {
      total?: number;
      hasNextPage?: boolean;
    };
    media?: AniListMedia[];
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = API_TIMEOUT
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

async function query<T>(queryStr: string, variables?: Record<string, any>): Promise<T | null> {
  try {
    const response = await fetchWithTimeout(ANILIST_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: queryStr, variables }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.data || null;
  } catch (error) {
    console.error('AniList API error:', error);
    return null;
  }
}

// ============================================================================
// QUERIES
// ============================================================================

const SEARCH_QUERY = `
  query ($search: String, $page: Int, $perPage: Int, $season: MediaSeason, $year: Int, $status: MediaStatus, $format: MediaFormat, $genre: String) {
    Page(page: $page, perPage: $perPage) {
      pageInfo {
        total
        hasNextPage
      }
      media(search: $search, type: ANIME, season: $season, seasonYear: $year, status: $status, format: $format, genre: $genre, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        coverImage { large medium }
        averageScore
        episodes
        status
        format
        season
        seasonYear
        genres
      }
    }
  }
`;

const MEDIA_DETAIL_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { large extraLarge }
      bannerImage
      averageScore
      episodes
      duration
      status
      format
      season
      seasonYear
      genres
      nextAiringEpisode { episode airingAt }
      trailer {
        id
        site
        thumbnail
      }
    }
  }
`;

const TRENDING_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: TRENDING_DESC, season: CURRENT, status: RELEASING) {
        id
        title { romaji english native }
        coverImage { large }
        averageScore
        episodes
        status
        format
        nextAiringEpisode { episode airingAt }
      }
    }
  }
`;

const POPULAR_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        coverImage { large }
        averageScore
        episodes
        status
        format
      }
    }
  }
`;

const SEASONAL_QUERY = `
  query ($season: MediaSeason, $year: Int, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, season: $season, seasonYear: $year, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        coverImage { large }
        averageScore
        episodes
        status
        format
        season
        seasonYear
      }
    }
  }
`;

const UPCOMING_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        coverImage { large }
        averageScore
        episodes
        status
        format
        season
        seasonYear
      }
    }
  }
`;

const GENRE_QUERY = `
  query ($genre: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, genre: $genre, sort: POPULARITY_DESC) {
        id
        title { romaji english native }
        coverImage { large }
        averageScore
        episodes
        status
        format
        season
        seasonYear
        genres
      }
    }
  }
`;

const HERO_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, sort: TRENDING_DESC, status: RELEASING) {
        id
        title { romaji english native }
        description(asHtml: false)
        coverImage { large extraLarge }
        bannerImage
        averageScore
        episodes
        status
        format
        season
        seasonYear
        genres
        trailer {
          id
          site
          thumbnail
        }
      }
    }
  }
`;

// ============================================================================
// EXPORTS
// ============================================================================

export async function searchAniList(
  search: string | undefined,
  filters?: {
    season?: string;
    year?: number;
    status?: string;
    format?: string;
    genre?: string;
  },
  page: number = 1,
  perPage: number = 20
): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(SEARCH_QUERY, {
    search: search || undefined,
    page,
    perPage,
    season: filters?.season || undefined,
    year: filters?.year || undefined,
    status: filters?.status || undefined,
    format: filters?.format || undefined,
    genre: filters?.genre || undefined,
  });

  return data?.Page?.media || [];
}

export async function getMediaById(id: number): Promise<AniListMedia | null> {
  const data = await query<{ Media?: AniListMedia }>(MEDIA_DETAIL_QUERY, { id });
  return data?.Media || null;
}

export async function getTrendingAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(TRENDING_QUERY, { page, perPage });
  return data?.Page?.media || [];
}

export async function getPopularAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(POPULAR_QUERY, { page, perPage });
  return data?.Page?.media || [];
}

export async function getSeasonalAnime(
  season: string,
  year: number,
  page: number = 1,
  perPage: number = 10
): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(SEASONAL_QUERY, { season, year, page, perPage });
  return data?.Page?.media || [];
}

export async function getUpcomingAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(UPCOMING_QUERY, { page, perPage });
  return data?.Page?.media || [];
}

export async function getAnimeByGenre(genre: string, page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(GENRE_QUERY, { genre, page, perPage });
  return data?.Page?.media || [];
}

export async function getHeroAnimes(limit: number = 5): Promise<AniListMedia[]> {
  const data = await query<AniListGraphQLResponse>(HERO_QUERY, { page: 1, perPage: 20 });
  const media = data?.Page?.media || [];

  // Filter: only animes with trailer and banner, prioritize by score + trending
  const withTrailer = media.filter(
    (m: AniListMedia) => m.trailer?.site === 'youtube' && m.bannerImage
  );

  // Sort: higher score first, then by trending (order from API)
  withTrailer.sort((a: AniListMedia, b: AniListMedia) => (b.averageScore || 0) - (a.averageScore || 0));

  return withTrailer.slice(0, limit);
}

/**
 * Converte AniListMedia para formato de resultado do provider
 */
export function anilistToAnimeResult(media: AniListMedia) {
  return {
    id: String(media.id),
    title: media.title?.english || media.title?.romaji || 'Unknown',
    titleAlternative: media.title?.romaji || media.title?.english,
    thumbnail: media.coverImage?.large || media.coverImage?.medium || '',
    score: media.averageScore || 0,
    type: media.format || 'TV',
    year: media.seasonYear,
    season: media.season,
  };
}

/**
 * Filtra duplicatas e entradas indesejadas do AniList.
 * Remove seasons, partes, courts, arcos e especiais.
 */
export function filterSeasonDuplicates(media: AniListMedia[]): AniListMedia[] {
  // Match "Season X", "2nd/3rd/etc Season", "Part X", "Cour X"
  const seasonPattern = /^Season\s+\d|Season\s+\d|2nd|3rd|4th|5th|6th|7th|Part\s*\d+|Cour\s*\d+/i;

  // Match cour continuations like "Title: Subtitle - CourName"
  // e.g. "BLEACH: Sennen Kessen-hen - Kashin-tan"
  const courPattern = /:.*\s-\s/;

  return media.filter((item) => {
    const titleRomaji = item.title?.romaji || '';
    const titleEnglish = item.title?.english || '';

    // Filter by title patterns (seasons, parts, courts)
    if (seasonPattern.test(titleRomaji) || seasonPattern.test(titleEnglish)) {
      return false;
    }

    // Filter cour continuations (": Subtitle - Name" pattern)
    if (courPattern.test(titleRomaji) || courPattern.test(titleEnglish)) {
      return false;
    }

    // Filter specials, OVAs, ONAs — rarely standalone anime
    const format = (item.format || '').toUpperCase();
    if (format === 'SPECIAL' || format === 'OVA' || format === 'ONA' || format === 'MUSIC') {
      return false;
    }

    // Filter TV entries with very few episodes (likely arc/special episodes)
    if (format === 'TV' && item.episodes && item.episodes <= 3) {
      return false;
    }

    return true;
  });
}
