import { useEffect, useState } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useAnimeDetails, useSeasons, useEpisodes, useRecommendations } from '@/hooks/useAnime';
import { getEpisodeStream } from '@/providers';
import type { EpisodeStream } from '@/providers/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Loader2, ArrowLeft, Play, Star, Clock, Calendar, Search, ChevronDown, AlertCircle, Tv } from 'lucide-react';

export default function AnimeDetails() {
  const [, params] = useRoute('/anime/:id');
  const [, setLocation] = useLocation();
  const animeId = params?.id ? Number(params.id) : null;

  const { anime, providerSlug, providerDetails, loading, error } = useAnimeDetails(animeId);

  const { seasons, loading: loadingSeasons } = useSeasons(providerSlug);
  const [selectedSeason, setSelectedSeason] = useState<number | undefined>(undefined);

  const { episodes, loading: loadingEpisodes } = useEpisodes(providerSlug, selectedSeason);
  const { recommendations, loading: loadingRecs } = useRecommendations(providerSlug);

  const [selectedEpisode, setSelectedEpisode] = useState<string | null>(null);
  const [episodeQuery, setEpisodeQuery] = useState('');
  const [showSeasonMenu, setShowSeasonMenu] = useState(false);
  const [playerStream, setPlayerStream] = useState<EpisodeStream | null>(null);
  const [loadingPlayer, setLoadingPlayer] = useState(false);

  // Auto-select first season
  useEffect(() => {
    if (seasons.length > 0 && selectedSeason === undefined) {
      setSelectedSeason(seasons[0].number);
    }
  }, [seasons, selectedSeason]);

  // Reset season when slug changes
  useEffect(() => {
    setSelectedSeason(undefined);
    setSelectedEpisode(null);
  }, [providerSlug]);

  const handleEpisodeClick = async (episodeId: string, episodeNumber: string) => {
    setSelectedEpisode(episodeNumber);
    setLoadingPlayer(true);
    try {
      const stream = await getEpisodeStream(episodeId);
      if (stream) setPlayerStream(stream);
    } catch (err) {
      console.error('Failed to load stream:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  const handleNextEpisode = async () => {
    if (!playerStream?.nextEpisode) return;
    const next = playerStream.nextEpisode;
    setSelectedEpisode(String(next.number));
    setLoadingPlayer(true);
    try {
      const stream = await getEpisodeStream(next.id);
      if (stream) setPlayerStream(stream);
    } catch (err) {
      console.error('Failed to load next episode:', err);
    } finally {
      setLoadingPlayer(false);
    }
  };

  const getStatusColor = (status?: string) => {
    switch (status?.toUpperCase()) {
      case 'RELEASING': return 'bg-green-500/20 text-green-400';
      case 'FINISHED': return 'bg-blue-500/20 text-blue-400';
      case 'NOT_YET_RELEASED': return 'bg-yellow-500/20 text-yellow-400';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status?.toUpperCase()) {
      case 'RELEASING': return 'Em lançamento';
      case 'FINISHED': return 'Finalizado';
      case 'NOT_YET_RELEASED': return 'Em breve';
      case 'CANCELLED': return 'Cancelado';
      default: return status || '';
    }
  };

  const filteredEpisodes = episodes.filter((ep) => {
    if (episodeQuery && !ep.number.toString().includes(episodeQuery)) return false;
    return true;
  });

  // Format next air date
  const formatNextAir = (nextAir: { date: string; time: string }) => {
    try {
      const [year, month, day] = nextAir.date.split('-');
      return `${day}/${month}/${year} às ${nextAir.time}`;
    } catch {
      return nextAir.date;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-accent" size={40} />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Anime não encontrado'}</p>
          <button
            onClick={() => setLocation('/')}
            className="bg-accent text-white px-4 py-2 rounded-lg"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Banner */}
      <div className="relative h-[400px] overflow-hidden">
        {anime.bannerImage ? (
          <img
            src={anime.bannerImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : anime.coverImage?.large ? (
          <img
            src={anime.coverImage.large}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        ) : null}

        {/* Gradients */}
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />

        {/* Back Button */}
        <button
          onClick={() => setLocation('/')}
          className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm p-2 rounded-lg hover:bg-background/90 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex gap-6 items-end">
            {/* Poster */}
            {anime.coverImage?.large && (
              <img
                src={anime.coverImage.large}
                alt=""
                className="w-40 h-56 object-cover rounded-lg shadow-2xl hidden md:block"
              />
            )}

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl md:text-4xl font-bold mb-2">
                {anime.title?.romaji || anime.title?.english}
              </h1>

              {anime.title?.english && anime.title.romaji !== anime.title.english && (
                <p className="text-muted-foreground mb-3">{anime.title.english}</p>
              )}

              <div className="flex flex-wrap items-center gap-2 mb-4">
                {anime.averageScore && (
                  <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm">
                    <Star size={14} className="fill-current" />
                    <span>{(anime.averageScore / 10).toFixed(1)}</span>
                  </div>
                )}
                {anime.status && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(anime.status)}`}>
                    {getStatusLabel(anime.status)}
                  </span>
                )}
                {providerDetails?.ageRating && (
                  <span className="flex items-center gap-1 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm">
                    <AlertCircle size={12} />
                    {providerDetails.ageRating}+
                  </span>
                )}
                {anime.format && (
                  <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">
                    {anime.format}
                  </span>
                )}
                {anime.episodes && (
                  <span className="bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">
                    {anime.episodes} eps
                  </span>
                )}
                {anime.duration && (
                  <span className="flex items-center gap-1 bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">
                    <Clock size={12} />
                    {anime.duration}min
                  </span>
                )}
                {anime.season && anime.seasonYear && (
                  <span className="flex items-center gap-1 bg-muted text-muted-foreground px-3 py-1 rounded-full text-sm">
                    <Calendar size={12} />
                    {anime.season} {anime.seasonYear}
                  </span>
                )}
                {providerDetails?.nextAir && (
                  <span className="flex items-center gap-1 bg-purple-500/20 text-purple-400 px-3 py-1 rounded-full text-sm">
                    <Tv size={12} />
                    Próx: {formatNextAir(providerDetails.nextAir)}
                  </span>
                )}
              </div>

              {anime.genres && anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {anime.genres.slice(0, 5).map((genre) => (
                    <span key={genre} className="bg-accent/20 text-accent px-2 py-1 rounded text-xs">
                      {genre}
                    </span>
                  ))}
                </div>
              )}

              <button
                onClick={() => episodes[0] && handleEpisodeClick(episodes[0].id, episodes[0].number)}
                disabled={!episodes[0] || loadingEpisodes || loadingPlayer}
                className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
              >
                {loadingPlayer ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Play size={18} className="fill-current" />
                )}
                Assistir Agora
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {anime.description && (
        <div className="px-6 py-6 border-b border-border">
          <h2 className="text-lg font-semibold mb-2">Sinopse</h2>
          <p className="text-muted-foreground leading-relaxed max-w-4xl">
            {anime.description.replace(/<[^>]*>/g, '')}
          </p>
        </div>
      )}

      {/* Episodes Section */}
      <div className="px-6 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <h2 className="text-2xl font-bold">Episódios</h2>

          <div className="flex items-center gap-3">
            {/* Season Selector Dropdown */}
            {seasons.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowSeasonMenu(!showSeasonMenu)}
                  className="flex items-center gap-2 px-4 py-2 bg-muted/50 border border-border rounded-lg text-sm font-medium hover:bg-muted/80 transition-colors min-w-[160px]"
                >
                  <span>{seasons.find(s => s.number === selectedSeason)?.name || `Temporada ${selectedSeason || 1}`}</span>
                  <ChevronDown size={16} className={`transition-transform ${showSeasonMenu ? 'rotate-180' : ''}`} />
                </button>

                {showSeasonMenu && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setShowSeasonMenu(false)}
                    />
                    <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[160px] max-h-[300px] overflow-y-auto">
                      {seasons.map((season) => (
                        <button
                          key={season.number}
                          onClick={() => {
                            setSelectedSeason(season.number);
                            setShowSeasonMenu(false);
                            setSelectedEpisode(null);
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                            selectedSeason === season.number
                              ? 'bg-accent text-white'
                              : 'text-foreground hover:bg-muted'
                          }`}
                        >
                          {season.name || `Temporada ${season.number}`}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Episode Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <input
                type="text"
                placeholder="Buscar episódio..."
                value={episodeQuery}
                onChange={(e) => setEpisodeQuery(e.target.value)}
                className="pl-9 pr-4 py-2 bg-muted/50 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent w-48"
              />
            </div>
          </div>
        </div>

        {/* Loading states */}
        {loadingEpisodes ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-accent" size={24} />
          </div>
        ) : !providerSlug ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">
              Este anime pode não estar disponível no AnimeFire.
            </p>
          </div>
        ) : filteredEpisodes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredEpisodes.map((ep) => (
              <button
                key={`${ep.season}-${ep.number}`}
                onClick={() => handleEpisodeClick(ep.id, ep.number)}
                className={`group text-left rounded-xl overflow-hidden transition-all ${
                  selectedEpisode === ep.number
                    ? 'ring-2 ring-accent shadow-lg shadow-accent/20'
                    : 'bg-card hover:shadow-lg hover:shadow-black/20'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video overflow-hidden bg-muted">
                  {ep.thumbnail ? (
                    <img
                      src={ep.thumbnail}
                      alt={`Episódio ${ep.number}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Play size={32} />
                    </div>
                  )}
                  {/* Episode number badge */}
                  <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded">
                    EP {ep.number}
                  </div>
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-accent rounded-full p-3">
                      <Play size={20} className="text-white fill-current" />
                    </div>
                  </div>
                </div>

                {/* Info */}
                <div className="p-3">
                  <h3 className="font-medium text-sm line-clamp-1 mb-1">
                    {ep.title || `Episódio ${ep.number}`}
                  </h3>
                  {ep.synopsis && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {ep.synopsis}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        ) : episodes.length > 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum episódio encontrado com essa busca.</p>
        ) : (
          <p className="text-muted-foreground text-sm">
            Esse anime não tem episódios disponíveis.
          </p>
        )}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <div className="px-6 py-6 border-t border-border">
          <h2 className="text-2xl font-bold mb-4">Animes Parecidos</h2>
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {recommendations.slice(0, 12).map((rec) => (
              <button
                key={rec.id}
                onClick={() => setLocation(`/anime/${rec.id}`)}
                className="flex-shrink-0 w-36 group"
              >
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-2">
                  {rec.thumbnail ? (
                    <img
                      src={rec.thumbnail}
                      alt={rec.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Play size={24} />
                    </div>
                  )}
                  {rec.audio && (
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white text-xs px-1.5 py-0.5 rounded">
                      {rec.audio.includes('Dublado') ? 'DUB' : 'LEG'}
                    </div>
                  )}
                </div>
                <h3 className="text-sm font-medium line-clamp-2 text-left group-hover:text-accent transition-colors">
                  {rec.title}
                </h3>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Video Player */}
      {playerStream && (
        <VideoPlayer
          stream={playerStream}
          onClose={() => setPlayerStream(null)}
          onNextEpisode={playerStream.nextEpisode ? handleNextEpisode : undefined}
        />
      )}
    </div>
  );
}
