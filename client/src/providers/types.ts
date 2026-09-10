/**
 * Tipos para o sistema de providers de streaming
 * Foco: PT-BR apenas
 */

export interface AnimeResult {
  id: string;
  title: string;
  titleAlternative?: string;
  thumbnail?: string;
  score?: number;
  type?: string;
  year?: number;
  season?: string;
}

export interface AnimeDetails {
  id: string;
  title: string;
  titlePtBr?: string;
  titleJp?: string;
  titleAlternative?: string;
  description?: string;
  thumbnail?: string;
  bannerImage?: string;
  score?: number;
  status?: string;
  type?: string;
  genres?: string[];
  year?: number;
  season?: string;
  totalEpisodes?: number;
  ageRating?: string;
  nextAir?: {
    date: string;
    time: string;
    isNewSeason: boolean;
  };
}

export interface Season {
  number: number;
  name?: string;
  episodeCount: number;
}

export interface Episode {
  id: string;
  number: string;
  title?: string;
  thumbnail?: string;
  season?: number;
  synopsis?: string;
  audio?: string;
}

export interface Recommendation {
  id: string;
  title: string;
  thumbnail?: string;
  audio?: string;
  status?: string;
}

export interface StreamSource {
  audio: 'dublado' | 'legendado';
  url: string;
  qualities: string;
  isMtl: boolean;
}

export interface EpisodeStream {
  episodeId: string;
  title: string;
  number: number;
  season: number;
  streams: StreamSource[];
  nextEpisode?: {
    id: string;
    title: string;
    number: number;
    season: number;
    thumbnail?: string;
  };
}

export interface StreamUrl {
  url: string;
  quality: string;
  provider: string;
  referer?: string;
}

export interface AnimeProvider {
  id: string;
  name: string;
  baseUrl: string;
  
  search(query: string): Promise<AnimeResult[]>;
  getAnimeDetails(id: string): Promise<AnimeDetails | null>;
  getSeasons(id: string): Promise<Season[]>;
  getEpisodes(id: string, seasonNumber?: number): Promise<Episode[]>;
  getRecommendations(id: string): Promise<Recommendation[]>;
  getEpisodeStream(episodeId: string): Promise<EpisodeStream | null>;
  getStreamUrl(id: string, episodeNumber: string): Promise<StreamUrl | null>;
}
