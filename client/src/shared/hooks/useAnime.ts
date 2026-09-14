/**
 * Hooks para buscar dados de animes
 * AniList para catálogo + provider PT-BR para episódios
 */

import { useState, useEffect, useCallback } from 'react';
import {
  getTrendingAnime,
  getPopularAnime,
  getSeasonalAnime,
  getMediaById,
  getHeroAnimes,
  getUpcomingAnime,
  getAnimeByGenre,
  filterSeasonDuplicates,
  type AniListMedia,
} from '@/shared/lib/anilist';
import {
  findAnimeSlug,
  getAnimeDetails,
  getSeasons,
  getEpisodes,
  getRecommendations,
} from '@/providers';
import type { Season, Episode, Recommendation } from '@/providers/types';

interface UseAnimeListResult {
  animes: AniListMedia[];
  loading: boolean;
  error: string | null;
}

interface UseAnimeDetailsResult {
  anime: AniListMedia | null;
  providerSlug: string | null;
  providerDetails: {
    ageRating?: string;
    nextAir?: { date: string; time: string; isNewSeason: boolean };
  } | null;
  loading: boolean;
  error: string | null;
}

interface UseSeasonsResult {
  seasons: Season[];
  loading: boolean;
  error: string | null;
}

interface UseEpisodesResult {
  episodes: Episode[];
  loading: boolean;
  error: string | null;
}

// Hook para animes em tendência
export function useTrendingAnime(limit: number = 10): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getTrendingAnime(1, limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError('Erro ao carregar tendências');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [limit]);

  return { animes, loading, error };
}

// Hook para animes populares
export function usePopularAnime(limit: number = 10): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPopularAnime(1, limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError('Erro ao carregar populares');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [limit]);

  return { animes, loading, error };
}

// Hook para animes da temporada
export function useSeasonalAnime(
  season: string,
  year: number,
  limit: number = 10
): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSeasonalAnime(season, year, 1, limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError('Erro ao carregar temporada');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [season, year, limit]);

  return { animes, loading, error };
}

// Hook para detalhes do anime + provider slug
export function useAnimeDetails(id: number | null): UseAnimeDetailsResult {
  const [anime, setAnime] = useState<AniListMedia | null>(null);
  const [providerSlug, setProviderSlug] = useState<string | null>(null);
  const [providerDetails, setProviderDetails] = useState<UseAnimeDetailsResult['providerDetails']>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError(null);
      return;
    }

    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch AniList metadata
        const media = await getMediaById(id);
        if (ignore) return;
        setAnime(media);

        if (!media?.title?.romaji) {
          setLoading(false);
          return;
        }

        // 2. Find the correct slug by matching title
        const slug = await findAnimeSlug(
          media.title.romaji,
          media.title.english,
          media.seasonYear,
          media.episodes,
          media.status,
          media.title.native
        );

        if (ignore) return;
        setProviderSlug(slug);

        // 3. Fetch details for PT-BR synopsis and extra data
        if (slug) {
          const details = await getAnimeDetails(slug);
          if (details && !ignore) {
            setAnime((prev) => prev ? {
              ...prev,
              description: details.description || prev.description,
            } : prev);
            setProviderDetails({
              ageRating: details.ageRating,
              nextAir: details.nextAir,
            });
          }
        }
      } catch (err) {
        if (!ignore) setError('Erro ao carregar detalhes');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [id]);

  return { anime, providerSlug, providerDetails, loading, error };
}

// Hook para temporadas - recebe o slug já resolvido do provider
export function useSeasons(slug: string | null): UseSeasonsResult {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setSeasons([]);
      return;
    }

    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getSeasons(slug);
        if (!ignore) setSeasons(data);
      } catch (err) {
        if (!ignore) setError('Erro ao carregar temporadas');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [slug]);

  return { seasons, loading, error };
}

// Hook para episódios - recebe o slug já resolvido do provider
export function useEpisodes(
  slug: string | null,
  seasonNumber?: number
): UseEpisodesResult {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setEpisodes([]);
      return;
    }

    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getEpisodes(slug, seasonNumber);
        if (!ignore) setEpisodes(data);
      } catch (err) {
        if (!ignore) setError('Erro ao carregar episódios');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [slug, seasonNumber]);

  return { episodes, loading, error };
}

// Hook para recomendações
export function useRecommendations(slug: string | null): { recommendations: Recommendation[]; loading: boolean; error: string | null } {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setRecommendations([]);
      return;
    }

    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRecommendations(slug);
        if (!ignore) setRecommendations(data);
      } catch (err) {
        if (!ignore) setError('Erro ao carregar recomendações');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [slug]);

  return { recommendations, loading, error };
}

// Hook para hero slider - animes com trailer, banner, prioridade por popularidade
export function useHeroAnimes(limit: number = 5): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getHeroAnimes(limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError('Erro ao carregar hero');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [limit]);

  return { animes, loading, error };
}

// Hook para animes que vão lançar (Novidades)
export function useUpcomingAnime(limit: number = 10): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getUpcomingAnime(1, limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError('Erro ao carregar novidades');
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [limit]);

  return { animes, loading, error };
}

// Hook para animes por gênero (ex: Romance)
export function useAnimeByGenre(genre: string, limit: number = 10): UseAnimeListResult {
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getAnimeByGenre(genre, 1, limit * 2);
        if (!ignore) setAnimes(filterSeasonDuplicates(data).slice(0, limit));
      } catch (err) {
        if (!ignore) setError(`Erro ao carregar animes de ${genre}`);
      } finally {
        if (!ignore) setLoading(false);
      }
    };
    load();
    return () => { ignore = true; };
  }, [genre, limit]);

  return { animes, loading, error };
}
