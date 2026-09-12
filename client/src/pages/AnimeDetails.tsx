import { useEffect, useState, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useAnimeDetails, useSeasons, useEpisodes, useRecommendations } from '@/hooks/useAnime';
import { getEpisodeStream } from '@/providers';
import { searchAniList } from '@/lib/anilist';
import type { EpisodeStream } from '@/providers/types';
import VideoPlayer from '@/components/VideoPlayer';
import { Loader2, ArrowLeft, Play, Search, ChevronDown, Bookmark, Film, X, Star, Eye } from 'lucide-react';
import LoadingAnimation from '@/components/LoadingAnimation';
import { useAccount } from '@/contexts/AccountContext';
import {
  isEpisodeCompleted,
  getEpisodeProgressPercent,
  getNextUnwatchedEpisode,
  getContinueWatchingEpisode,
} from '@/lib/watchProgress';

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

  const [loadingRec, setLoadingRec] = useState<string | null>(null);
  const [showTrailer, setShowTrailer] = useState(false);
  const [fallbackTrailer, setFallbackTrailer] = useState<{ videoId: string } | null>(null);
  const [loadingTrailer, setLoadingTrailer] = useState(false);
  const { toggleSavedAnime, isSaved } = useAccount();

  // Check for trailer availability
  const hasTrailer = anime?.trailer?.site === 'youtube';
  const trailerVideoId = hasTrailer ? anime.trailer.id : fallbackTrailer?.videoId;

  // Drag-to-scroll for recommendations
  const recScrollRef = useRef<HTMLDivElement>(null);
  const recDragging = useRef(false);
  const recStartX = useRef(0);
  const recStartY = useRef(0);
  const recScrollLeft = useRef(0);
  const recWasDragged = useRef(false);

  const handleRecMouseDown = (e: React.MouseEvent) => {
    if (!recScrollRef.current) return;
    recDragging.current = true;
    recWasDragged.current = false;
    recStartX.current = e.pageX;
    recStartY.current = e.pageY;
    recScrollLeft.current = recScrollRef.current.scrollLeft;
    recScrollRef.current.style.cursor = 'grabbing';
  };

  const handleRecMouseMove = (e: React.MouseEvent) => {
    if (!recDragging.current || !recScrollRef.current) return;
    const dx = Math.abs(e.pageX - recStartX.current);
    const dy = Math.abs(e.pageY - recStartY.current);
    if (dx > 5 || dy > 5) {
      recWasDragged.current = true;
    }
    e.preventDefault();
    const x = e.pageX - recScrollRef.current.offsetLeft;
    const walk = (x - recStartX.current) * 1.5;
    recScrollRef.current.scrollLeft = recScrollLeft.current - walk;
  };

  const handleRecMouseUp = (e: React.MouseEvent) => {
    if (!recScrollRef.current) return;
    recDragging.current = false;
    recScrollRef.current.style.cursor = 'grab';
    if (recWasDragged.current) {
      e.stopPropagation();
    }
  };

  const handleRecScrollClick = (e: React.MouseEvent) => {
    if (recWasDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  const handleRecClick = async (rec: { id: string; title: string }) => {
    setLoadingRec(rec.id);
    try {
      const results = await searchAniList(rec.title);
      if (results.length > 0) {
        setLocation(`/anime/${results[0].id}`);
      } else {
        setLocation(`/search?q=${encodeURIComponent(rec.title)}`);
      }
    } catch {
      setLocation(`/search?q=${encodeURIComponent(rec.title)}`);
    } finally {
      setLoadingRec(null);
    }
  };

  const toggleFavorite = (id: string) => {
    toggleSavedAnime(id);
  };

  const searchTrailer = async () => {
    if (hasTrailer || loadingTrailer || fallbackTrailer) return;
    if (!anime?.title?.romaji) return;

    setLoadingTrailer(true);
    try {
      const title = anime.title.english || anime.title.romaji;
      const response = await fetch(`/api/trailer-search?q=${encodeURIComponent(title)}`);
      if (response.ok) {
        const data = await response.json();
        setFallbackTrailer(data);
      }
    } catch (err) {
      console.error('Failed to search trailer:', err);
    } finally {
      setLoadingTrailer(false);
    }
  };

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

  // Auto-play episode from history (URL query params ?episode=xxx&season=N)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetEpisodeId = params.get('episode');
    const targetSeason = params.get('season');
    if (!targetEpisodeId) return;

    // Set season if provided and not already selected
    if (targetSeason) {
      const seasonNum = parseInt(targetSeason, 10);
      if (!isNaN(seasonNum) && selectedSeason !== seasonNum) {
        setSelectedSeason(seasonNum);
        return;
      }
    }

    if (!episodes.length || loadingEpisodes) return;

    const episode = episodes.find(ep => ep.id === targetEpisodeId);
    if (episode && !playerStream && !loadingPlayer) {
      handleEpisodeClick(episode.id, episode.number);
      window.history.replaceState({}, '', `/anime/${animeId}`);
    }
  }, [episodes, loadingEpisodes, selectedSeason]);

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

  const filteredEpisodes = episodes.filter((ep) => {
    if (!episodeQuery) return true;
    const q = episodeQuery.toLowerCase();
    if (ep.number.toString().includes(q)) return true;
    if (ep.title?.toLowerCase().includes(q)) return true;
    if (ep.synopsis?.toLowerCase().includes(q)) return true;
    return false;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <LoadingAnimation />
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-4">{error || 'Anime não encontrado'}</p>
          <button
            onClick={() => window.history.back()}
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
      <div className="relative h-[550px] overflow-hidden">
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
          onClick={() => window.history.back()}
          className="absolute top-4 left-4 z-10 bg-background/80 backdrop-blur-sm p-2 rounded-lg hover:bg-background/90 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Content */}
        <div className="absolute bottom-0 left-0 right-0 p-8 pb-12">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              {(() => {
                const continueEp = animeId ? getContinueWatchingEpisode(String(animeId), episodes) : null;
                const nextEp = animeId && !continueEp ? getNextUnwatchedEpisode(String(animeId), episodes) : null;
                const targetEp = continueEp?.episode || nextEp || episodes[0];
                const isContinue = !!continueEp;

                return (
                  <button
                    onClick={() => targetEp && handleEpisodeClick(targetEp.id, String(targetEp.number))}
                    disabled={!targetEp || loadingEpisodes || loadingPlayer}
                    className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    {loadingPlayer ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Play size={18} className="fill-current" />
                    )}
                    {isContinue
                      ? `Continuar T${continueEp!.episode.season} EP${continueEp!.episode.number}`
                      : targetEp
                        ? `Assistir T${targetEp.season} EP${targetEp.number}`
                        : 'Assistir Agora'
                    }
                  </button>
                );
              })()}

              {animeId && (
                <button
                  onClick={() => toggleFavorite(String(animeId))}
                  className={`p-3 rounded-lg transition-all duration-300 hover:scale-110 active:scale-95 ${
                    isSaved(String(animeId))
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-400 hover:bg-purple-500/20 hover:text-purple-400'
                  }`}
                >
                  <Bookmark size={18} className={isSaved(String(animeId)) ? 'fill-current' : ''} />
                </button>
              )}

              {(hasTrailer || !loadingTrailer) && (
                <button
                  onClick={() => {
                    if (hasTrailer) {
                      setShowTrailer(true);
                    } else if (!fallbackTrailer) {
                      searchTrailer();
                    } else {
                      setShowTrailer(true);
                    }
                  }}
                  disabled={loadingTrailer}
                  className="p-3 rounded-lg text-gray-400 hover:bg-purple-500/20 hover:text-white transition-all duration-300 hover:scale-110 active:scale-95 disabled:opacity-50"
                >
                  {loadingTrailer ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Film size={18} />
                  )}
                </button>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-bold mb-2">
              {anime.title?.romaji || anime.title?.english}
            </h1>

            {anime.title?.english && anime.title.romaji !== anime.title.english && (
              <p className="text-muted-foreground mb-3">{anime.title.english}</p>
            )}

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {providerDetails?.ageRating && (() => {
                const ratingMap: Record<string, string> = {
                  'L': '/rating/L.jpg',
                  '10': '/rating/10.jpg',
                  '12': '/rating/12.jpg',
                  '14': '/rating/14.jpg',
                  '16': '/rating/16.jpg',
                  '18': '/rating/18.jpg',
                };
                const ratingKey = providerDetails.ageRating.replace('+', '').trim();
                const ratingImg = ratingMap[ratingKey];
                if (ratingImg) {
                  return (
                    <img
                      src={ratingImg}
                      alt={`Classificação indicativa ${ratingKey}`}
                      className="h-7 w-auto rounded"
                    />
                  );
                }
                return (
                  <span className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm font-medium">
                    {providerDetails.ageRating}+
                  </span>
                );
              })()}
              {anime.averageScore && (
                <div className="flex items-center gap-1 text-white text-sm">
                  <Star size={14} className="fill-current" />
                  <span>{(anime.averageScore / 10).toFixed(1)}</span>
                </div>
              )}
              {anime.seasonYear && (
                <span className="text-gray-300 text-sm">
                  {anime.seasonYear}
                </span>
              )}
              {episodes.length > 0 && (
                <span className="text-gray-300 text-sm">
                  {episodes.length} eps
                </span>
              )}
              {(() => {
                const seasonNames = seasons.map(s => (s.name || '').toLowerCase());
                const hasDub = seasonNames.some(n => n.includes('dub'));
                const hasLeg = seasonNames.some(n => n.includes('leg'));
                if (hasDub && hasLeg) return <span className="bg-white/10 text-gray-300 px-3 py-1 rounded-full text-sm font-medium">DUB / LEG</span>;
                if (hasDub) return <span className="bg-white/10 text-gray-300 px-3 py-1 rounded-full text-sm font-medium">DUB</span>;
                if (hasLeg) return <span className="bg-white/10 text-gray-300 px-3 py-1 rounded-full text-sm font-medium">LEG</span>;
                return null;
              })()}
            </div>

            {/* Genre Tags */}
            {anime.genres && anime.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {anime.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => setLocation(`/search?genre=${encodeURIComponent(genre)}`)}
                    className="bg-white/10 hover:bg-white/20 text-gray-300 px-3 py-1 rounded-full text-xs font-medium transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            )}

            {/* Synopsis */}
            {anime.description && (
              <p className="text-gray-300 leading-relaxed text-sm max-w-3xl line-clamp-3">
                {anime.description.replace(/<[^>]*>/g, '')}
              </p>
            )}
          </div>
        </div>
      </div>

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
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : !providerSlug ? (
          <div className="text-center py-8">
            <p className="text-muted-foreground text-sm">
              Este anime ou conteúdo não está disponível.
            </p>
          </div>
        ) : filteredEpisodes.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredEpisodes.map((ep) => {
              const completed = animeId ? isEpisodeCompleted(String(animeId), ep.id) : false;
              const progressPercent = animeId ? getEpisodeProgressPercent(String(animeId), ep.id) : 0;

              return (
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
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
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
                    {/* Watched badge */}
                    {completed && (
                      <div className="absolute top-2 right-2 bg-purple-500/90 backdrop-blur-sm text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                        <Eye size={12} />
                        Assistido
                      </div>
                    )}
                    {/* Play overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <Play size={32} className="text-purple-500 fill-current opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                    </div>
                    {/* Progress bar */}
                    {progressPercent > 0 && !completed && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                        <div
                          className="h-full bg-purple-500 transition-all"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                    )}
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
              );
            })}
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
        <div className="px-6 py-6">
          <h2 className="text-2xl font-bold mb-4">Animes Parecidos</h2>
          <div
            ref={recScrollRef}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
            style={{ cursor: 'grab' }}
            onMouseDown={handleRecMouseDown}
            onMouseMove={handleRecMouseMove}
            onMouseUp={handleRecMouseUp}
            onMouseLeave={handleRecMouseUp}
            onClick={handleRecScrollClick}
          >
            {recommendations.slice(0, 12).map((rec) => (
              <button
                key={rec.id}
                onClick={() => handleRecClick(rec)}
                disabled={loadingRec === rec.id}
                className="flex-shrink-0 w-36 group"
              >
                <div className="relative aspect-[3/4] rounded-lg overflow-hidden bg-muted mb-2">
                  {rec.thumbnail ? (
                    <img
                      src={rec.thumbnail}
                      alt={rec.title}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Play size={24} />
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

      {/* Trailer Modal */}
      {showTrailer && trailerVideoId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowTrailer(false)}>
          <div className="relative w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowTrailer(false)}
              className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <div className="aspect-video rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${trailerVideoId}?autoplay=1&rel=0`}
                title={`Trailer - ${anime?.title?.english || anime?.title?.romaji}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Video Player */}
      {playerStream && animeId && (
        <VideoPlayer
          stream={playerStream}
          animeId={String(animeId)}
          animeTitle={anime?.title?.romaji || anime?.title?.english || ''}
          animeCover={anime?.coverImage?.large || anime?.coverImage?.medium || ''}
          animeGenres={anime?.genres}
          animeYear={anime?.seasonYear}
          onClose={() => setPlayerStream(null)}
          onNextEpisode={playerStream.nextEpisode ? handleNextEpisode : undefined}
        />
      )}
    </div>
  );
}
