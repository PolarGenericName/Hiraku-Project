/**
 * Watch Progress - Sistema de progressão de assistência
 * Salva no localStorage: posição atual, episódios assistidos, etc.
 */

const STORAGE_KEY = 'hiraku-watch-progress';

export interface EpisodeProgress {
  /** ID do episódio no provider */
  episodeId: string;
  /** Número do episódio */
  episodeNumber: number;
  /** Temporada */
  season: number;
  /** Posição em segundos onde parou */
  currentTime: number;
  /** Duração total em segundos */
  duration: number;
  /** true se assistiu mais de 90% */
  completed: boolean;
  /** Timestamp da última visualização */
  lastWatched: number;
}

export interface AnimeProgress {
  /** Slug do anime no provider */
  animeId: string;
  /** Mapa de progresso por episodeId */
  episodes: Record<string, EpisodeProgress>;
}

type ProgressData = Record<string, AnimeProgress>;

function getAll(): ProgressData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

      const data: ProgressData = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          'episodes' in value &&
          value.episodes &&
          typeof value.episodes === 'object' &&
          !Array.isArray(value.episodes)
        ) {
          const episodes: Record<string, EpisodeProgress> = {};
          for (const [epId, ep] of Object.entries(value.episodes as Record<string, unknown>)) {
            if (ep && typeof ep === 'object' && !Array.isArray(ep)) {
              episodes[epId] = ep as EpisodeProgress;
            }
          }
          data[key] = { ...(value as AnimeProgress), episodes };
        }
      }
      return data;
  } catch {
    return {};
  }
}

function saveAll(data: ProgressData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage full or unavailable — progress won't persist
  }
}

/** Salva progresso de um episódio */
export function saveEpisodeProgress(
  animeId: string,
  episodeId: string,
  episodeNumber: number,
  season: number,
  currentTime: number,
  duration: number
) {
  const data = getAll();
  if (!data[animeId]) {
    data[animeId] = { animeId, episodes: {} };
  }

  const completed = duration > 0 && currentTime / duration >= 0.9;

  data[animeId].episodes[episodeId] = {
    episodeId,
    episodeNumber,
    season,
    currentTime,
    duration,
    completed,
    lastWatched: Date.now(),
  };

  saveAll(data);
}

/** Retorna progresso de um episódio específico */
export function getEpisodeProgress(
  animeId: string,
  episodeId: string
): EpisodeProgress | null {
  const data = getAll();
  const progress = data[animeId]?.episodes[episodeId];
  if (!progress || typeof progress !== 'object') return null;
  if (typeof progress.currentTime !== 'number' || !Number.isFinite(progress.currentTime)) return null;
  if (typeof progress.duration !== 'number' || !Number.isFinite(progress.duration)) return null;
  return progress;
}

/** Retorna a posição para retomar (em segundos) */
export function getResumeTime(animeId: string, episodeId: string): number {
  const progress = getEpisodeProgress(animeId, episodeId);
  if (!progress || progress.completed) return 0;
  return progress.currentTime;
}

/** Retorna todos os episódios assistidos de um anime */
export function getWatchedEpisodes(animeId: string): EpisodeProgress[] {
  const data = getAll();
  const anime = data[animeId];
  if (!anime) return [];
  return Object.values(anime.episodes).filter((ep) => ep.completed);
}

/** Retorna episódios parcialmente assistidos */
export function getPartialEpisodes(animeId: string): EpisodeProgress[] {
  const data = getAll();
  const anime = data[animeId];
  if (!anime) return [];
  return Object.values(anime.episodes).filter(
    (ep) => !ep.completed && ep.currentTime > 0
  );
}

/** Retorna true se o episódio foi completado */
export function isEpisodeCompleted(animeId: string, episodeId: string): boolean {
  const progress = getEpisodeProgress(animeId, episodeId);
  return progress?.completed || false;
}

/** Retorna a porcentagem assistida de um episódio (0-100) */
export function getEpisodeProgressPercent(
  animeId: string,
  episodeId: string
): number {
  const progress = getEpisodeProgress(animeId, episodeId);
  if (!progress || progress.duration === 0) return 0;
  return Math.min(100, Math.round((progress.currentTime / progress.duration) * 100));
}

/** Retorna o próximo episódio não assistido */
export function getNextUnwatchedEpisode(
  animeId: string,
  allEpisodes: { id: string; number: string | number; season?: number }[]
): { id: string; number: string | number; season: number } | null {
  const data = getAll();
  const anime = data[animeId];
  if (!anime) return allEpisodes[0] ? { ...allEpisodes[0], season: allEpisodes[0].season || 1 } : null;

  // Find first uncompleted episode
  for (const ep of allEpisodes) {
    const progress = anime.episodes[ep.id];
    if (!progress || !progress.completed) {
      return { id: ep.id, number: ep.number, season: ep.season || 1 };
    }
  }

  return null; // All completed
}

/** Retorna o episódio mais recente para continuar */
export function getContinueWatchingEpisode(
  animeId: string,
  allEpisodes: { id: string; number: string | number; season?: number }[]
): { episode: { id: string; number: string | number; season: number }; progress: EpisodeProgress } | null {
  const data = getAll();
  const anime = data[animeId];
  if (!anime) return null;

  // Find most recent partial episode
  let latest: EpisodeProgress | null = null;
  for (const ep of Object.values(anime.episodes)) {
    if (!ep.completed && ep.currentTime > 0) {
      if (!latest || ep.lastWatched > latest.lastWatched) {
        latest = ep;
      }
    }
  }

  if (!latest) return null;

  const episode = allEpisodes.find((e) => e.id === latest!.episodeId);
  if (!episode) return null;

  return { episode: { id: episode.id, number: episode.number, season: episode.season || 1 }, progress: latest };
}
