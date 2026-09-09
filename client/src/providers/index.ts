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

/**
 * Find the correct AnimeFire slug for an anime by searching and matching titles.
 */
export async function findAnimeSlug(
  romajiTitle: string,
  englishTitle?: string
): Promise<string | null> {
  console.log('[FindSlug] Searching:', romajiTitle, englishTitle ? `/ ${englishTitle}` : '');

  const titles = [romajiTitle, englishTitle].filter(Boolean) as string[];

  for (const title of titles) {
    const results = await searchAnime(title);
    console.log(`[FindSlug] "${title}" => ${results.length} results`);

    if (results.length === 0) continue;

    const normalizedSearch = normalizeTitle(title);

    // Log first 5 results
    results.slice(0, 5).forEach((r, i) => {
      console.log(`[FindSlug]   ${i}: "${r.title}" id:${r.id}`);
    });

    // Exact match
    for (const r of results) {
      if (normalizeTitle(r.title) === normalizedSearch) {
        console.log('[FindSlug] EXACT match:', r.id);
        return r.id;
      }
    }

    // Word containment - all search words present in result
    const searchWords = normalizedSearch.split(' ').filter(w => w.length > 2);
    for (const r of results) {
      const normalizedResult = normalizeTitle(r.title);
      const allWordsMatch = searchWords.every(w => normalizedResult.includes(w));
      if (allWordsMatch && searchWords.length >= 2) {
        console.log('[FindSlug] WORDS match:', r.title, '->', r.id);
        return r.id;
      }
    }

    console.log('[FindSlug] No match for', title);
  }

  // No reliable match found - return null instead of wrong result
  console.log('[FindSlug] No reliable match found');
  return null;
}

/**
 * Batch check availability for multiple anime (used in search results).
 * Returns a Set of AniList IDs that are available on AnimeFire.
 */
export async function batchCheckAvailability(
  animes: { id: string; title: string; titleAlternative?: string }[]
): Promise<Set<string>> {
  const available = new Set<string>();

  // Check in parallel, max 5 at a time to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < animes.length; i += batchSize) {
    const batch = animes.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (anime) => {
        const slug = await findAnimeSlug(anime.title, anime.titleAlternative);
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
