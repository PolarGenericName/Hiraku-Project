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
import { Loader2, Play, Bookmark, ChevronLeft, ChevronRight, Film, X, Star } from 'lucide-react';
import LoadingAnimation from '@/components/LoadingAnimation';

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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [ptBrDescriptions, setPtBrDescriptions] = useState<Record<number, string>>({});
  const [watchHistory, setWatchHistory] = useState<any[]>([]);

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

  // Fetch PT-BR descriptions from AnimeFire
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

  // Load watch history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('hiraku_watch_history');
      if (stored) {
        setWatchHistory(JSON.parse(stored));
      }
    } catch {}
  }, []);

  const hasWatchHistory = watchHistory.length > 0;

  const toggleFavorite = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
                  className={`w-full h-full object-cover transition-transform duration-[8000ms] ease-out ${
                    idx === heroIndex ? 'scale-105' : 'scale-100'
                  }`}
                />
              ) : anime.coverImage?.extraLarge ? (
                <img
                  src={anime.coverImage.extraLarge}
                  alt=""
                  className={`w-full h-full object-cover opacity-30 transition-transform duration-[8000ms] ease-out ${
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
                    favorites.has(String(heroAnime.id))
                      ? 'bg-purple-500/20 text-purple-400'
                      : 'text-gray-400 hover:bg-purple-500/20 hover:text-purple-400'
                  }`}
                >
                  <Bookmark size={22} className={favorites.has(String(heroAnime.id)) ? 'fill-current' : ''} />
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
              {watchHistory.map((item: any) => (
                <AnimeCard
                  key={item.anilistId}
                  result={{
                    id: String(item.anilistId),
                    title: item.title || '',
                    titleAlternative: undefined,
                    thumbnail: item.thumbnail || '',
                    score: 0,
                    type: 'TV',
                    year: undefined,
                    season: undefined,
                  }}
                  isFavorite={false}
                  onToggleFavorite={() => {}}
                  onClick={() => setLocation(`/anime/${item.anilistId}`)}
                />
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
                  isFavorite={favorites.has(result.id)}
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
                  isFavorite={favorites.has(result.id)}
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
          <div className="flex overflow-visible px-8 md:px-16 pb-4 pt-4">
            {[...heroAnimes, ...popular].slice(0, 10).map((anime, index) => {
              const result = anilistToAnimeResult(anime);
              return (
                <div
                  key={result.id}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                  className="flex-shrink-0 flex items-center cursor-pointer group/card mx-4 transition-all duration-300 hover:scale-105 hover:z-10"
                >
                  {/* Rank Number - Netflix style outline */}
                  <span
                    className="text-[200px] select-none leading-none"
                    style={{
                      WebkitTextStroke: '4px rgba(124, 58, 237, 0.5)',
                      color: 'transparent',
                      fontFamily: "'Special Gothic Expanded One', sans-serif",
                    }}
                  >
                    {index + 1}
                  </span>

                  {/* Anime Cover - overlaps number */}
                  <div className="relative w-32 h-48 rounded-lg overflow-hidden bg-gray-900 group-hover/card:border-purple-500/50 transition-all duration-300 -ml-8 z-[1] shadow-2xl group-hover/card:shadow-[0_0_30px_rgba(124,58,237,0.4)]">
                    {/* Gradient glow towards number */}
                    <div className="absolute inset-y-0 -left-6 w-6 bg-gradient-to-r from-black/50 to-transparent z-[2]" />
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <span className="text-gray-500 text-xs">Sem imagem</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
                  isFavorite={favorites.has(result.id)}
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
                  isFavorite={favorites.has(result.id)}
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
                  isFavorite={favorites.has(result.id)}
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

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const amount = 400;
    const maxScroll = el.scrollWidth - el.clientWidth;

    if (direction === 'right' && el.scrollLeft + amount >= maxScroll - 10) {
      // Reached near the end, scroll back to start
      el.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      el.scrollBy({
        left: direction === 'left' ? -amount : amount,
        behavior: 'smooth',
      });
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
            className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-500"
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


