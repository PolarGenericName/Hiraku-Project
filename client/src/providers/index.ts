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
 * Find the correct AnimeFire slug for an anime by searching and matching titles.
 * Handles multiple versions (e.g., Hunter x Hunter 1999 vs 2011).
 */
export async function findAnimeSlug(
  romajiTitle: string,
  englishTitle?: string,
  anilistYear?: number,
  anilistEpisodes?: number,
  anilistStatus?: string
): Promise<string | null> {
  // Skip search for anime not yet released
  if (anilistStatus === 'NOT_YET_RELEASED' || anilistStatus === 'NOT_YET_RELEASED_OR_FINISHED') {
    console.log('[FindSlug] Skipping unreleased anime:', romajiTitle);
    return null;
  }

  console.log('[FindSlug] Searching:', romajiTitle, englishTitle ? `/ ${englishTitle}` : '', anilistYear ? `year:${anilistYear}` : '', anilistEpisodes ? `eps:${anilistEpisodes}` : '');

  const searchYear = anilistYear?.toString() || extractYear(romajiTitle) || extractYear(englishTitle || '');
  const titles = [romajiTitle, englishTitle].filter(Boolean) as string[];

  // Collect all unique candidate slugs across all title searches
  const allCandidates: { id: string; title: string }[] = [];
  const seenIds = new Set<string>();

  // Track all exact matches across all title searches (deduplicated by id)
  const exactMatchIds = new Set<string>();
  const exactMatches: { id: string; title: string }[] = [];
  const wordMatchIds = new Set<string>();
  const wordMatches: { id: string; title: string }[] = [];

  for (const title of titles) {
    const results = await searchAnime(title);
    console.log(`[FindSlug] "${title}" => ${results.length} results`);

    if (results.length === 0) continue;

    for (const r of results) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        allCandidates.push({ id: r.id, title: r.title });
      }
    }

    const normalizedSearch = normalizeTitle(title);

    results.slice(0, 5).forEach((r, i) => {
      console.log(`[FindSlug]   ${i}: "${r.title}" id:${r.id} year:${r.year}`);
    });

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
      const resultWords = normalizedResult.split(' ');
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
    console.log('[FindSlug] EXACT match (unique):', exactMatches[0].id);
    return exactMatches[0].id;
  }

  // If only one word match, return it directly
  if (wordMatches.length === 1 && exactMatches.length === 0) {
    console.log('[FindSlug] WORDS match (unique):', wordMatches[0].title, '->', wordMatches[0].id);
    return wordMatches[0].id;
  }

  // Fallback: if a search returned exactly 1 result and it contains the main keyword, use it
  for (const title of titles) {
    const results = await searchAnime(title);
    if (results.length === 1) {
      const r = results[0];
      if (!resultHasYearConflict(searchYear, r)) {
        const normalizedResult = normalizeTitle(r.title);
        const searchWords = normalizeTitle(title).split(' ').filter(w => w.length > 2);
        // Check if at least one significant word from search appears in result
        const hasKeyword = searchWords.some(w => normalizedResult.includes(w));
        if (hasKeyword) {
          console.log('[FindSlug] SINGLE RESULT match:', r.title, '->', r.id);
          return r.id;
        }
      }
    }
  }

  // Multiple exact/word matches (ambiguity) — use detail-based disambiguation
  const ambiguousMatches = [...exactMatches, ...wordMatches];
  const disambiguateFrom = ambiguousMatches.length > 1 ? ambiguousMatches : allCandidates;

  if (disambiguateFrom.length > 1 && (searchYear || anilistEpisodes)) {
    console.log(`[FindSlug] ${ambiguousMatches.length} ambiguous matches, checking details...`);

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

        console.log(`[FindSlug]   Detail: ${candidate.id} "${candidate.title}" eps:${details.totalEpisodes} year:${details.year}`);

        const detailYear = details.year;
        const detailEps = details.totalEpisodes;

        // If we have a year, prefer matching year
        if (searchYear && detailYear?.toString() === searchYear) {
          console.log('[FindSlug] DETAIL YEAR match:', candidate.title, '->', candidate.id);
          return candidate.id;
        }

        // If we have episode count, prefer closest match
        if (anilistEpisodes && detailEps) {
          const diff = Math.abs(anilistEpisodes - detailEps);
          if (diff <= 5) {
            console.log('[FindSlug] DETAIL EPS match:', candidate.title, `(${detailEps} eps)`, '->', candidate.id);
            return candidate.id;
          }
        }
      } catch {
        // Skip on error
      }
    }
  }

  console.log('[FindSlug] No reliable match found');
  return null;
}

/**
 * Batch check availability for multiple anime (used in search results).
 * Returns a Set of AniList IDs that are available on AnimeFire.
 */
export async function batchCheckAvailability(
  animes: { id: string; title: string; titleAlternative?: string; year?: number; episodes?: number; status?: string }[]
): Promise<Set<string>> {
  const available = new Set<string>();

  // Check in parallel, max 5 at a time to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < animes.length; i += batchSize) {
    const batch = animes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (anime) => {
        const slug = await findAnimeSlug(anime.title, anime.titleAlternative, anime.year, anime.episodes, anime.status);
        if (slug) {
          try {
            const episodes = await getEpisodes(slug);
            if (episodes.length > 0) {
              available.add(anime.id);
            }
          } catch {}
        }
      })
    );
  }

  return available;
}
