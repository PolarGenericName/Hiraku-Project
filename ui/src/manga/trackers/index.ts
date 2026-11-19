/**
 * Registro dos trackers disponíveis. Fase 1: MangaUpdates + Kitsu.
 */
import { kitsuTracker } from './kitsu';
import { mangaUpdatesTracker } from './mangaupdates';
import type { TrackerClient, TrackerId } from './types';

export * from './types';
export * from './store';

export const TRACKERS: TrackerClient[] = [mangaUpdatesTracker, kitsuTracker];

export function getTracker(id: TrackerId): TrackerClient | undefined {
  return TRACKERS.find((t) => t.id === id);
}
