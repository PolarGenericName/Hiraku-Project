import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import {
  useHeroAnimes,
  useTrendingAnime,
  usePopularAnime,
  useSeasonalAnime,
  useAnimeByGenre,
} from '@/hooks/useAnime';
import { anilistToAnimeResult } from '@/lib/anilist';
import { findAnimeSlug, getAnimeDetails } from '@/providers';
import { Play, Bookmark, ChevronLeft, ChevronRight, Film, X } from 'lucide-react';
import LoadingAnimation from '@/components/LoadingAnimation';
import { useAccount } from '@/contexts/AccountContext';
import { getEpisodeProgressPercent } from '@/lib/watchProgress';

function getCurrentSeason() {
  const month = new Date().getMonth();
  if (month >= 0 && month <= 2) return 'WINTER';
  if (month >= 3 && month <= 5) return 'SPRING';
  if (month >= 6 && month <= 8) return 'SUMMER';
  return 'FALL';
}

function getCurrentYear() {
  return new Date().getFullYear();
}

const seasonLabels: Record<string, string> = {
  WINTER: 'Inverno',
  SPRING: 'Primavera',
  SUMMER: 'Verão',
  FALL: 'Outono',
};

export default function Home() {
  const [, setLocation] = useLocation();
  const [heroIndex, setHeroIndex] = useState(0);
  const [trailerAnime, setTrailerAnime] = useState<any>(null);
  const [ptBrDescriptions, setPtBrDescriptions] = useState<Record<number, string>>({});
  const { getHistory, toggleSavedAnime, isSaved } = useAccount();
  const watchHistory = getHistory();

  const { animes: heroAnimes, loading: loadingHero } = useHeroAnimes(5);
  const { animes: trending } = useTrendingAnime(20);
  const { animes: popular } = usePopularAnime(20);
  const { animes: seasonal } = useSeasonalAnime(
    getCurrentSeason(),
    getCurrentYear(),
    20
  );
  const { animes: romance } = useAnimeByGenre('Romance', 30);
  const { animes: comedy } = useAnimeByGenre('Comedy', 30);
  const { animes: sliceOfLife } = useAnimeByGenre('Slice of Life', 30);

  // Deduplicate only genre sections against each other
  const usedGenreIds = new Set<string>();

  const filterGenre = (animes: any[]) => {
    return animes.filter((a) => {
      const id = String(a.id);
      if (usedGenreIds.has(id)) return false;
      usedGenreIds.add(id);
      return true;
    });
  };

  const dedupRomance = filterGenre(romance);
  const dedupComedy = filterGenre(comedy);
  const dedupSliceOfLife = filterGenre(sliceOfLife);

  const loading = loadingHero;

  // Auto-rotate hero
  useEffect(() => {
    if (heroAnimes.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroAnimes.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [heroAnimes.length]);

  // Fetch PT-BR descriptions from streaming provider
  useEffect(() => {
    if (heroAnimes.length === 0) return;

    const fetchPtBr = async () => {
      for (const anime of heroAnimes) {
        if (ptBrDescriptions[anime.id]) continue;

        try {
          const slug = await findAnimeSlug(
            anime.title?.romaji || '',
            anime.title?.english,
            anime.seasonYear,
            anime.episodes,
            anime.status,
            anime.title?.native
          );
          if (slug) {
            const details = await getAnimeDetails(slug);
            if (details?.description) {
              setPtBrDescriptions((prev) => ({
                ...prev,
                [anime.id]: details.description!,
              }));
            }
          }
        } catch {}
      }
    };

    fetchPtBr();
  }, [heroAnimes]);

  const heroAnime = heroAnimes[heroIndex];

  const hasWatchHistory = watchHistory.length > 0;

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSavedAnime(id);
  }, [toggleSavedAnime]);

  const openTrailer = useCallback((anime: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (anime.trailer?.site === 'youtube') {
      setTrailerAnime(anime);
    }
  }, []);

  const closeTrailer = useCallback(() => {
    setTrailerAnime(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <LoadingAnimation />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Hero Slider */}
      {heroAnime && (
        <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
          {/* Background - Banner */}
          {heroAnimes.map((anime, idx) => (
            <div
              key={anime.id}
              className={`absolute inset-0 transition-opacity duration-[1500ms] ease-in-out ${
                idx === heroIndex ? 'opacity-100 z-[1]' : 'opacity-0 z-0'
              }`}
            >
              {anime.bannerImage ? (
                <img
                  src={anime.bannerImage}
                  alt=""
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className={`w-full h-full object-cover transition-transform duration-[8000ms] ease-out pointer-events-none ${
                    idx === heroIndex ? 'scale-105' : 'scale-100'
                  }`}
                />
              ) : anime.coverImage?.extraLarge ? (
                <img
                  src={anime.coverImage.extraLarge}
                  alt=""
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className={`w-full h-full object-cover opacity-30 transition-transform duration-[8000ms] ease-out pointer-events-none ${
                    idx === heroIndex ? 'scale-105' : 'scale-100'
                  }`}
                />
              ) : null}
            </div>
          ))}

          {/* Overlays */}
          <div className="absolute inset-0 z-[2] bg-gradient-to-t from-black via-black/60 to-transparent" />
          <div className="absolute inset-0 z-[2] bg-gradient-to-r from-black/90 via-black/50 to-transparent" />
          <div className="absolute inset-0 z-[2] bg-black/50" />

          {/* Content - Left Side */}
          <div className="relative z-10 h-full flex items-center px-8 md:px-16">
            <div className="max-w-2xl" key={heroAnime.id}>
              {/* Title */}
              <div className="mb-6 animate-[fadeSlideUp_0.7s_ease-out_0.1s_both]">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white drop-shadow-lg leading-tight">
                  {heroAnime.title?.english || heroAnime.title?.romaji}
                </h1>
                {heroAnime.title?.romaji && heroAnime.title?.english && (
                  <p className="text-gray-400 text-sm mt-2">{heroAnime.title.romaji}</p>
                )}
              </div>

              {/* Synopsis */}
              {(ptBrDescriptions[heroAnime.id] || heroAnime.description) && (
                <p className="text-gray-300 line-clamp-4 mb-6 text-base leading-relaxed animate-[fadeSlideUp_0.7s_ease-out_0.2s_both]">
                  {(ptBrDescriptions[heroAnime.id] || heroAnime.description || '')
                    .replace(/<[^>]*>/g, '')
                    .substring(0, 250)}
                  {(ptBrDescriptions[heroAnime.id] || heroAnime.description || '').length > 250 ? '...' : ''}
                </p>
              )}

              {/* Buttons */}
              <div className="flex items-center gap-4 animate-[fadeSlideUp_0.7s_ease-out_0.3s_both]">
                <button
                  onClick={() => setLocation(`/anime/${heroAnime.id}`)}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-8 py-3.5 rounded-xl font-semibold transition-all duration-300 shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:scale-105 active:scale-95 text-lg"
                >
                  <Play size={20} className="fill-current" />
                  Assistir
                </button>

                <button
                  onClick={(e) => toggleFavorite(String(heroAnime.id), e)}
                  className={`p-3.5 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 ${
                    isSaved(String(heroAnime.id))
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-400 hover:bg-purple-500/20 hover:text-purple-400'
                  }`}
                >
                  <Bookmark size={22} className={isSaved(String(heroAnime.id)) ? 'fill-current' : ''} />
                </button>

                {heroAnime.trailer?.site === 'youtube' && (
                  <button
                    onClick={(e) => openTrailer(heroAnime, e)}
                    className="p-3.5 rounded-xl text-gray-400 hover:bg-purple-500/20 hover:text-white transition-all duration-300 hover:scale-110 active:scale-95"
                  >
                    <Film size={22} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Indicators */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-2.5">
            {heroAnimes.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setHeroIndex(idx)}
                className={`rounded-full transition-all duration-500 ease-out ${
                  idx === heroIndex
                    ? 'w-10 h-2 bg-purple-500 shadow-lg shadow-purple-500/50'
                    : 'w-2 h-2 bg-white/30 hover:bg-white/50 hover:scale-125'
                }`}
              />
            ))}
          </div>

          {/* Navigation arrows */}
          <button
            onClick={() => setHeroIndex((prev) => (prev - 1 + heroAnimes.length) % heroAnimes.length)}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            onClick={() => setHeroIndex((prev) => (prev + 1) % heroAnimes.length)}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white transition-all opacity-0 hover:opacity-100 group-hover:opacity-100"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      )}

      {/* Trailer Mini Player */}
      {trailerAnime && trailerAnime.trailer?.site === 'youtube' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={closeTrailer}>
          <div className="relative w-full max-w-4xl mx-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeTrailer}
              className="absolute -top-12 right-0 p-2 text-gray-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
            <div className="aspect-video rounded-xl overflow-hidden shadow-2xl">
              <iframe
                src={`https://www.youtube.com/embed/${trailerAnime.trailer.id}?autoplay=1&rel=0`}
                title={`Trailer - ${trailerAnime.title?.english || trailerAnime.title?.romaji}`}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}

      {/* Content Sections */}
      <div className="py-10 space-y-10">

        {/* 1. Continuar Assistindo (só aparece se tiver histórico) */}
        {hasWatchHistory && (
          <section className="px-8 md:px-16">
            <h2 className="text-2xl font-bold text-white mb-4">Continuar Assistindo</h2>
            <HorizontalScroll>
              {watchHistory.map((item, i) => (
                <div
                  key={`${item.animeId}-${item.episodeId}-${i}`}
                  className="flex-shrink-0 w-44 cursor-pointer group/card transition-all duration-300 hover:scale-105 hover:z-10"
                  onClick={() => setLocation(`/anime/${item.animeId}?episode=${item.episodeId}&season=${item.season}`)}
                >
                  <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 group-hover/card:border-purple-500/50 transition-all duration-300 group-hover/card:shadow-[0_0_30px_rgba(124,58,237,0.4)]">
                    <img
                      src={item.animeCover}
                      alt={item.animeTitle}
                      draggable={false}
                      onDragStart={(e) => e.preventDefault()}
                      className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500 pointer-events-none"
                    />
                    {/* Progress bar */}
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                      <div
                        className="h-full bg-purple-500"
                        style={{ width: `${getEpisodeProgressPercent(item.animeId, item.episodeId)}%` }}
                      />
                    </div>
                    {/* Episode badge */}
                    <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
                      Ep. {item.episodeNumber}
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-gray-300 line-clamp-2 group-hover/card:text-purple-400 transition-colors leading-tight">
                    {item.animeTitle}
                  </h3>
                </div>
              ))}
            </HorizontalScroll>
          </section>
        )}

        {/* 2. Mais Curtidos */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Mais Curtidos</h2>
          <HorizontalScroll>
            {popular.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <AnimeCard
                  key={result.id}
                  result={result}
                  isFavorite={isSaved(result.id)}
                  onToggleFavorite={toggleFavorite}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                />
              );
            })}
          </HorizontalScroll>
        </section>

        {/* 3. Melhores Lançamentos */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Melhores Lançamentos</h2>
          <HorizontalScroll>
            {seasonal.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <AnimeCard
                  key={result.id}
                  result={result}
                  isFavorite={isSaved(result.id)}
                  onToggleFavorite={toggleFavorite}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                />
              );
            })}
          </HorizontalScroll>
        </section>

        {/* 4. Top 10 */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Top 10</h2>
          <Top10Scroll>
            <div className="flex gap-3">
              {[...heroAnimes, ...popular].slice(0, 10).map((anime, index) => {
                const result = anilistToAnimeResult(anime);
                return (
                  <div
                    key={result.id}
                    onClick={() => setLocation(`/anime/${result.id}`)}
                    className="flex-shrink-0 w-48 cursor-pointer group/card transition-all duration-300 hover:scale-105 hover:z-10"
                  >
                    {/* Card with number inside */}
                    <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 group-hover/card:border-purple-500/50 transition-all duration-300 group-hover/card:shadow-[0_0_30px_rgba(124,58,237,0.4)]">
                      {result.thumbnail ? (
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          draggable={false}
                          onDragStart={(e) => e.preventDefault()}
                          className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500 pointer-events-none"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-800">
                          <span className="text-gray-500 text-xs">Sem imagem</span>
                        </div>
                      )}

                      {/* Rank Number - inside card, bottom-right */}
                      <div className="absolute bottom-0 right-0 flex items-end">
                        <span
                          className="text-7xl font-black select-none leading-none"
                          style={{
                            background: 'linear-gradient(180deg, #a855f7 0%, #7c3aed 50%, #6d28d9 100%)',
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            fontFamily: "'Special Gothic Expanded One', sans-serif",
                            filter: 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8))',
                          }}
                        >
                          {index + 1}
                        </span>
                      </div>
                    </div>

                    {/* Title below card */}
                    <h3 className="text-sm font-medium text-gray-300 line-clamp-2 group-hover/card:text-purple-400 transition-colors leading-tight">
                      {result.title}
                    </h3>
                  </div>
                );
              })}
            </div>
          </Top10Scroll>
        </section>

        {/* 5. Romances */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Romances</h2>
          <HorizontalScroll>
            {dedupRomance.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <AnimeCard
                  key={result.id}
                  result={result}
                  isFavorite={isSaved(result.id)}
                  onToggleFavorite={toggleFavorite}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                />
              );
            })}
          </HorizontalScroll>
        </section>

        {/* 6. Comédia */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Comédia</h2>
          <HorizontalScroll>
            {dedupComedy.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <AnimeCard
                  key={result.id}
                  result={result}
                  isFavorite={isSaved(result.id)}
                  onToggleFavorite={toggleFavorite}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                />
              );
            })}
          </HorizontalScroll>
        </section>

        {/* 7. Slice of Life */}
        <section>
          <h2 className="text-2xl font-bold text-white mb-4 px-8 md:px-16">Slice of Life</h2>
          <HorizontalScroll>
            {dedupSliceOfLife.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <AnimeCard
                  key={result.id}
                  result={result}
                  isFavorite={isSaved(result.id)}
                  onToggleFavorite={toggleFavorite}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                />
              );
            })}
          </HorizontalScroll>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// COMPONENTS
// ============================================================================

function Top10Scroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const scrollLeftVal = useRef(0);
  const wasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    wasDragged.current = false;
    startX.current = e.pageX;
    startY.current = e.pageY;
    scrollLeftVal.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = Math.abs(e.pageX - startX.current);
    const dy = Math.abs(e.pageY - startY.current);
    if (dx > 5 || dy > 5) {
      wasDragged.current = true;
    }
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeftVal.current - walk;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.style.cursor = 'grab';
    if (wasDragged.current) {
      e.stopPropagation();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto scrollbar-hide px-8 md:px-16 pb-2 pt-4"
      style={{ cursor: 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const scrollLeftVal = useRef(0);
  const wasDragged = useRef(false);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const amount = 400;
    const maxScroll = el.scrollWidth - el.clientWidth;

    if (direction === 'right' && el.scrollLeft + amount >= maxScroll - 10) {
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    wasDragged.current = false;
    startX.current = e.pageX;
    startY.current = e.pageY;
    scrollLeftVal.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = Math.abs(e.pageX - startX.current);
    const dy = Math.abs(e.pageY - startY.current);
    if (dx > 5 || dy > 5) {
      wasDragged.current = true;
    }
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeftVal.current - walk;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.style.cursor = 'grab';
    if (wasDragged.current) {
      e.stopPropagation();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className="relative group/scroll">
      <button
        onClick={() => scroll('left')}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 p-2 rounded-full text-white opacity-0 group-hover/scroll:opacity-100 transition-opacity duration-300"
      >
        <ChevronLeft size={20} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scrollbar-hide px-8 md:px-16 pb-2 pt-4"
        style={{ cursor: 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      >
        {children}
      </div>

      <button
        onClick={() => scroll('right')}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/70 hover:bg-black/90 p-2 rounded-full text-white opacity-0 group-hover/scroll:opacity-100 transition-opacity duration-300"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}

function AnimeCard({
  result,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  result: ReturnType<typeof anilistToAnimeResult>;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-44 cursor-pointer group/card transition-all duration-300 hover:scale-105 hover:z-10"
    >
      <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 group-hover/card:border-purple-500/50 transition-all duration-300 group-hover/card:shadow-[0_0_30px_rgba(124,58,237,0.4)]">
        {result.thumbnail ? (
          <img
            src={result.thumbnail}
            alt={result.title}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500 pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <span className="text-gray-500 text-xs">Sem imagem</span>
          </div>
        )}

        {/* Favorite button */}
        <button
          onClick={(e) => onToggleFavorite(result.id, e)}
          className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-200 ${
            isFavorite
              ? 'bg-purple-500/90 text-white'
              : 'bg-black/50 text-gray-400 opacity-0 group-hover/card:opacity-100'
          }`}
        >
          <Bookmark size={12} className={isFavorite ? 'fill-current' : ''} />
        </button>
      </div>

      <h3 className="text-sm font-medium text-gray-300 line-clamp-2 group-hover/card:text-purple-400 transition-colors leading-tight">
        {result.title}
      </h3>
    </div>
  );
}


