/**
 * AniList API - Catálogo principal
 * GraphQL: https://graphql.anilist.co
 */

const ANILIST_API = 'https://graphql.anilist.co';
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
}

export interface AniListPageResponse {
  data?: {
    Page?: {
      pageInfo?: {
        total?: number;
        hasNextPage?: boolean;
      };
      media?: AniListMedia[];
    };
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

// ============================================================================
// EXPORTS
// ============================================================================

export async function searchAniList(
  search: string,
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
  const data = await query<AniListPageResponse>(SEARCH_QUERY, {
    search,
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
  const data = await query<AniListPageResponse>(TRENDING_QUERY, { page, perPage });
  return data?.Page?.media || [];
}

export async function getPopularAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListPageResponse>(POPULAR_QUERY, { page, perPage });
  return data?.Page?.media || [];
}

export async function getSeasonalAnime(
  season: string,
  year: number,
  page: number = 1,
  perPage: number = 10
): Promise<AniListMedia[]> {
  const data = await query<AniListPageResponse>(SEASONAL_QUERY, { season, year, page, perPage });
  return data?.Page?.media || [];
}

export async function getUpcomingAnime(page: number = 1, perPage: number = 10): Promise<AniListMedia[]> {
  const data = await query<AniListPageResponse>(UPCOMING_QUERY, { page, perPage });
  return data?.Page?.media || [];
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
