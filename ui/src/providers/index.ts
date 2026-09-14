/**
 * Provider Registry - Gerencia o provider de streaming PT-BR
 */

import type {
  AnimeProvider,
  AnimeResult,
  AnimeDetails,
  Season,
  Episode,
  Recommendation,
  EpisodeStream,
} from './types';
import { AnimeFireProvider } from './animefire';

const animefireProvider = new AnimeFireProvider();

const provider: AnimeProvider = animefireProvider;

// Cache de títulos JP: slug -> { jpTitle, year, episodes }
// Evita buscar detalhes repetidamente para o mesmo anime
// LRU: max 200 entries to prevent unbounded growth
const jpTitleCache = new Map<string, { jpTitle: string; year?: number; episodes?: number }>();
const JP_CACHE_MAX = 200;

export async function searchAnime(query: string): Promise<AnimeResult[]> {
  return provider.search(query);
}

export async function getAnimeDetails(animeId: string): Promise<AnimeDetails | null> {
  return provider.getAnimeDetails(animeId);
}

export async function getSeasons(animeId: string): Promise<Season[]> {
  return provider.getSeasons(animeId);
}

export async function getEpisodes(animeId: string, seasonNumber?: number): Promise<Episode[]> {
  return provider.getEpisodes(animeId, seasonNumber);
}

export async function getRecommendations(animeId: string): Promise<Recommendation[]> {
  return provider.getRecommendations(animeId);
}

export async function getEpisodeStream(episodeId: string): Promise<EpisodeStream | null> {
  return provider.getEpisodeStream(episodeId);
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(title: string): string | null {
  const match = title.match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : null;
}

function resultHasYearConflict(searchYear: string | null, result: { title: string; year?: number }): boolean {
  const resultYear = result.year?.toString() || extractYear(result.title);
  // Only conflict if BOTH sides have a year and they differ
  if (searchYear && resultYear && resultYear !== searchYear) return true;
  return false;
}

/**
 * Find the correct slug for an anime by searching and matching titles.
 * Handles multiple versions (e.g., Hunter x Hunter 1999 vs 2011).
 */
export async function findAnimeSlug(
  romajiTitle: string,
  englishTitle?: string,
  anilistYear?: number,
  anilistEpisodes?: number,
  anilistStatus?: string,
  nativeTitle?: string
): Promise<string | null> {
  // Skip search for anime not yet released
  if (anilistStatus === 'NOT_YET_RELEASED') {
    return null;
  }

  const searchYear = anilistYear?.toString() || extractYear(romajiTitle) || extractYear(englishTitle || '');
  // Only search with romaji and english - native (Japanese) doesn't work on the provider
  const titles = [romajiTitle, englishTitle].filter(Boolean) as string[];

  // Check cache first for known JP titles
  // Look up by searching cached JP titles against our search titles
  for (const [slug, cached] of Array.from(jpTitleCache.entries())) {
    const normalizedJp = normalizeTitle(cached.jpTitle);
    for (const searchTitle of titles) {
      if (normalizeTitle(searchTitle) === normalizedJp) {
        if (searchYear && cached.year && cached.year.toString() !== searchYear) continue;
        return slug;
      }
    }
  }

  // Collect all unique candidate slugs across all title searches
  const allCandidates: { id: string; title: string }[] = [];
  const seenIds = new Set<string>();

  // Track all exact matches across all title searches (deduplicated by id)
  const exactMatchIds = new Set<string>();
  const exactMatches: { id: string; title: string }[] = [];
  const wordMatchIds = new Set<string>();
  const wordMatches: { id: string; title: string }[] = [];

  // Store per-title results for fallback (avoids re-searching)
  const titleResultsMap = new Map<string, { id: string; title: string; year?: number }[]>();

  for (const title of titles) {
    const results = await searchAnime(title);

    titleResultsMap.set(title, results);

    if (results.length === 0) continue;

    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allCandidates.push({ id: r.id, title: r.title });
      }
    }

    const normalizedSearch = normalizeTitle(title);

    // Collect exact matches (don't return yet, deduplicate)
    for (const r of results) {
      if (resultHasYearConflict(searchYear, r)) continue;
      if (normalizeTitle(r.title) === normalizedSearch && !exactMatchIds.has(r.id)) {
        exactMatchIds.add(r.id);
        exactMatches.push({ id: r.id, title: r.title });
      }
    }

    // Collect word matches (don't return yet, deduplicate)
    const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
    for (const r of results) {
      if (resultHasYearConflict(searchYear, r)) continue;
      const normalizedResult = normalizeTitle(r.title);
      // Require ALL search words to match AND at least 60% of result words to match
      const allWordsMatch = searchWords.every(w => normalizedResult.includes(w));
      const matchRatio = searchWords.filter(w => normalizedResult.includes(w)).length / Math.max(searchWords.length, 1);
      if (allWordsMatch && searchWords.length >= 2 && matchRatio >= 0.6 && !wordMatchIds.has(r.id)) {
        wordMatchIds.add(r.id);
        wordMatches.push({ id: r.id, title: r.title });
      }
    }
  }

  // If only one exact match, return it directly
  if (exactMatches.length === 1) {
    return exactMatches[0].id;
  }

  // If only one word match, return it directly
  if (wordMatches.length === 1 && exactMatches.length === 0) {
    return wordMatches[0].id;
  }

  // Fallback: if a title search returned exactly 1 result and it contains the main keyword, use it
  for (const title of titles) {
    const cachedResults = titleResultsMap.get(title);
    if (cachedResults && cachedResults.length === 1) {
      const r = cachedResults[0];
      if (!resultHasYearConflict(searchYear, r)) {
        const normalizedResult = normalizeTitle(r.title);
        const searchWords = normalizeTitle(title).split(' ').filter(w => w.length > 2);
        const hasKeyword = searchWords.some(w => normalizedResult.includes(w));
        if (hasKeyword) {
          return r.id;
        }
      }
    }
  }

  // Multiple exact/word matches (ambiguity) — use detail-based disambiguation
  const ambiguousMatches = [...exactMatches, ...wordMatches];
  const disambiguateFrom = ambiguousMatches.length > 1 ? ambiguousMatches : allCandidates;

  if (disambiguateFrom.length > 0 && (searchYear || anilistEpisodes || ambiguousMatches.length > 1)) {
    // Sort: prioritize candidates that appeared in exact/word matches
    const exactIds = new Set(exactMatches.map(m => m.id));
    const wordIds = new Set(wordMatches.map(m => m.id));
    const sorted = [...disambiguateFrom].sort((a, b) => {
      if (exactIds.has(a.id) && !exactIds.has(b.id)) return -1;
      if (!exactIds.has(a.id) && exactIds.has(b.id)) return 1;
      if (wordIds.has(a.id) && !wordIds.has(b.id)) return -1;
      if (!wordIds.has(a.id) && wordIds.has(b.id)) return 1;
      return 0;
    });

    for (const candidate of sorted.slice(0, 5)) {
      try {
        const details = await provider.getAnimeDetails(candidate.id);
        if (!details) continue;

        // Cache the JP title info for future lookups
        if (details.titleJp) {
          // LRU eviction: remove oldest entry if at capacity
          if (jpTitleCache.size >= JP_CACHE_MAX) {
            const firstKey = jpTitleCache.keys().next().value;
            if (firstKey) jpTitleCache.delete(firstKey);
          }
          jpTitleCache.set(candidate.id, {
            jpTitle: details.titleJp,
            year: details.year,
            episodes: details.totalEpisodes,
          });
        }

        const detailYear = details.year;
        const detailEps = details.totalEpisodes;

        // Check if the JP original title matches any of our search titles
        if (details.titleJp) {
          const normalizedJp = normalizeTitle(details.titleJp);
          for (const searchTitle of titles) {
            if (normalizeTitle(searchTitle) === normalizedJp) {
              return candidate.id;
            }
          }
        }

        // If we have a year, prefer matching year
        if (searchYear && detailYear?.toString() === searchYear) {
          return candidate.id;
        }

        // If we have episode count, prefer closest match
        if (anilistEpisodes && detailEps) {
          const diff = Math.abs(anilistEpisodes - detailEps);
          if (diff <= 5) {
            return candidate.id;
          }
        }
      } catch {
        // Skip on error
      }
    }
  }

  return null;
}

/**
 * Quick slug search for batch availability checking.
 * Uses cache for known JP titles, falls back to romaji/english search with year match.
 * Much faster than findAnimeSlug for batch operations.
 */
async function findAnimeSlugQuick(
  romajiTitle: string,
  englishTitle?: string,
  anilistYear?: number
): Promise<string | null> {
  const searchYear = anilistYear?.toString() || extractYear(romajiTitle) || extractYear(englishTitle || '');
  const titles = [romajiTitle, englishTitle].filter(Boolean) as string[];

  // Check cache first
  for (const [slug, cached] of Array.from(jpTitleCache.entries())) {
    const normalizedJp = normalizeTitle(cached.jpTitle);
    for (const searchTitle of titles) {
      if (normalizeTitle(searchTitle) === normalizedJp) {
        if (searchYear && cached.year && cached.year.toString() !== searchYear) continue;
        return slug;
      }
    }
  }

  const seenIds = new Set<string>();

  for (const title of titles) {
    const results = await searchAnime(title);
    if (results.length === 0) continue;

    // Filter out already-seen results
    const newResults = results.filter(r => !seenIds.has(r.id));
    results.forEach(r => seenIds.add(r.id));

    if (newResults.length === 0) continue;

    // If only 1 new result, use it
    if (newResults.length === 1 && results.length === 1) {
      return results[0].id;
    }

    // Try to find by year match (no conflict)
    if (searchYear) {
      for (const r of newResults) {
        if (!resultHasYearConflict(searchYear, r)) {
          return r.id;
        }
      }
    }

    // First non-conflicting result as fallback
    if (newResults.length > 0) {
      return newResults[0].id;
    }
  }

  return null;
}

/**
 * Batch check availability for multiple anime (used in search results).
 * Returns a Set of AniList IDs that are available on the streaming provider.
 * Verifies episode count matches AniList data.
 */
export async function batchCheckAvailability(
  animes: { id: string; title: string; titleAlternative?: string; nativeTitle?: string; year?: number; episodes?: number; status?: string }[]
): Promise<Set<string>> {
  const available = new Set<string>();

  // Check in parallel, max 5 at a time to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < animes.length; i += batchSize) {
    const batch = animes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (anime) => {
        const slug = await findAnimeSlugQuick(anime.title, anime.titleAlternative, anime.year);
        if (slug) {
          try {
            const episodes = await getEpisodes(slug);
            if (episodes.length > 0) {
              // Verify episode count
              const anilistEps = anime.episodes;
              if (anilistEps && episodes.length > 0) {
                const ratio = episodes.length / anilistEps;
                // Accept if ratio is within reasonable bounds
                // Higher limit (15x) to handle provider combining seasons that AniList lists separately
                if (ratio >= 0.5 && ratio <= 15) {
                  available.add(anime.id);
                }
              } else {
                available.add(anime.id);
              }
            }
          } catch {}
        }
      })
    );
  }

  return available;
}
