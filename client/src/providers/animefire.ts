/**
 * AnimeFire Provider - PT-BR
 * Uses the AnimeFire REST API at api.animefire.io
 */

import type {
  AnimeProvider,
  AnimeResult,
  AnimeDetails,
  Season,
  Episode,
  Recommendation,
  EpisodeStream,
  StreamUrl,
} from './types';

const API_BASE = 'https://api.animefire.io';
const PROXY_BASE = '/api/proxy';
const API_TIMEOUT = 20000;

async function apiGet<T>(path: string): Promise<T> {
  const url = `${PROXY_BASE}?url=${encodeURIComponent(API_BASE + path)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(API_TIMEOUT) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export class AnimeFireProvider implements AnimeProvider {
  id = 'animefire';
  name = 'AnimeFire';
  baseUrl = 'https://animefire.plus';

  async search(query: string): Promise<AnimeResult[]> {
    try {
      console.log('[AnimeFire] Searching:', query);
      const json = await apiGet<any>(`/animes/pesquisar?q=${encodeURIComponent(query)}`);
      const items: any[] = json.data || [];

      const results: AnimeResult[] = items.map((item: any) => ({
        id: item.id,
        title: item.title,
        thumbnail: item.poster_src,
        type: 'TV',
      }));

      console.log('[AnimeFire] Search results:', results.length);
      return results;
    } catch (error) {
      console.error('[AnimeFire] Search error:', error);
      return [];
    }
  }

  async getAnimeDetails(id: string): Promise<AnimeDetails | null> {
    try {
      console.log('[AnimeFire] Details:', id);
      const json = await apiGet<any>(`/anime/${id}`);
      const data = json.data;
      if (!data?.hero) return null;

      const hero = data.hero;
      const genres = typeof hero.genres === 'string'
        ? hero.genres.split(/\s+/).filter(Boolean)
        : Array.isArray(hero.genres) ? hero.genres : [];

      return {
        id,
        title: hero.titles?.BR || hero.titles?.EN || '',
        titlePtBr: hero.titles?.BR,
        description: hero.synopsis,
        thumbnail: hero.poster_src,
        bannerImage: hero.backdrop_src,
        score: hero.score,
        status: hero.status,
        type: data.format || 'TV',
        genres,
        totalEpisodes: data.episodes?.length,
        ageRating: hero.age_rating ? String(hero.age_rating) : undefined,
        nextAir: hero.next_air ? {
          date: hero.next_air.date,
          time: hero.next_air.time,
          isNewSeason: hero.next_air.is_new_season,
        } : undefined,
      };
    } catch (error) {
      console.error('[AnimeFire] Details error:', error);
      return null;
    }
  }

  async getSeasons(id: string): Promise<Season[]> {
    try {
      const json = await apiGet<any>(`/anime/${id}`);
      const data = json.data;
      if (!data?.seasons) return [{ number: 1, name: 'Temporada 1', episodeCount: 0 }];

      const seasons: Season[] = data.seasons.map((s: any) => {
        const currentNum = s.number;
        const nextSeason = data.seasons.find((ns: any) => ns.number === currentNum + 1);
        const startEp = s.first_episode_number || 1;
        const endEp = nextSeason ? nextSeason.first_episode_number - 1 : (data.episodes?.length || startEp);
        const episodeCount = endEp - startEp + 1;

        return {
          number: currentNum,
          name: s.title || `Temporada ${currentNum}`,
          episodeCount: Math.max(episodeCount, 0),
        };
      });

      console.log('[AnimeFire] Seasons:', seasons.length);
      return seasons;
    } catch (error) {
      console.error('[AnimeFire] Seasons error:', error);
      return [{ number: 1, name: 'Temporada 1', episodeCount: 0 }];
    }
  }

  async getEpisodes(id: string, seasonNumber?: number): Promise<Episode[]> {
    try {
      const json = await apiGet<any>(`/anime/${id}`);
      const data = json.data;
      if (!data?.episodes) return [];

      let episodes: Episode[] = data.episodes.map((ep: any) => ({
        id: ep.id,
        number: String(ep.number),
        title: ep.title,
        thumbnail: ep.still_src,
        season: ep.season || 1,
        synopsis: ep.synopsis,
        audio: ep.audio,
      }));

      if (seasonNumber !== undefined) {
        episodes = episodes.filter((ep) => ep.season === seasonNumber);
      }

      episodes.sort((a, b) => parseFloat(a.number) - parseFloat(b.number));

      console.log('[AnimeFire] Episodes', seasonNumber ? `(S${seasonNumber})` : '(all)', ':', episodes.length);
      return episodes;
    } catch (error) {
      console.error('[AnimeFire] Episodes error:', error);
      return [];
    }
  }

  async getRecommendations(id: string): Promise<Recommendation[]> {
    try {
      const json = await apiGet<any>(`/anime/${id}`);
      const items = json.data?.recommendations?.items || [];

      const recs: Recommendation[] = items.map((item: any) => ({
        id: item.id,
        title: item.title,
        thumbnail: item.poster_src,
        audio: item.audio,
        status: item.status,
      }));

      console.log('[AnimeFire] Recommendations:', recs.length);
      return recs;
    } catch (error) {
      console.error('[AnimeFire] Recommendations error:', error);
      return [];
    }
  }

  async getEpisodeStream(episodeId: string): Promise<EpisodeStream | null> {
    try {
      console.log('[AnimeFire] Episode stream:', episodeId);
      const json = await apiGet<any>(`/episode/${episodeId}`);
      const data = json.data;
      if (!data) return null;

      const streams = (data.streams || [])
        .filter((s: any) => s.url && !s.is_offline)
        .map((s: any) => ({
          audio: s.audio,
          url: s.url,
          qualities: Array.isArray(s.qualities) ? s.qualities.join(' ') : (s.qualities || ''),
          isMtl: s.is_mtl || false,
        }));

      return {
        episodeId: data.id,
        title: data.title,
        number: data.number,
        season: data.season,
        streams,
        nextEpisode: data.nextEpisode ? {
          id: data.nextEpisode.id,
          title: data.nextEpisode.title,
          number: data.nextEpisode.number,
          season: data.nextEpisode.season,
          thumbnail: data.nextEpisode.still_src,
        } : undefined,
      };
    } catch (error) {
      console.error('[AnimeFire] Episode stream error:', error);
      return null;
    }
  }

  async getStreamUrl(id: string, episodeNumber: string): Promise<StreamUrl | null> {
    return null;
  }
}
