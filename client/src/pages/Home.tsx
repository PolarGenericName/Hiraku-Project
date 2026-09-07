import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useTrendingAnime, usePopularAnime, useSeasonalAnime } from '@/hooks/useAnime';
import { anilistToAnimeResult } from '@/lib/anilist';
import { Loader2, Play, Star, ChevronLeft, ChevronRight, Search } from 'lucide-react';

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

export default function Home() {
  const [, setLocation] = useLocation();
  const [heroIndex, setHeroIndex] = useState(0);

  const { animes: trending, loading: loadingTrending } = useTrendingAnime(10);
  const { animes: popular, loading: loadingPopular } = usePopularAnime(20);
  const { animes: seasonal, loading: loadingSeasonal } = useSeasonalAnime(
    getCurrentSeason(),
    getCurrentYear(),
    10
  );

  const loading = loadingTrending || loadingPopular || loadingSeasonal;

  // Auto-rotate hero
  useEffect(() => {
    if (trending.length === 0) return;
    const interval = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % trending.length);
    }, 5000);
    return () => clearInterval(interval);
  }, [trending.length]);

  const heroAnime = trending[heroIndex];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin text-accent" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      {heroAnime && (
        <div className="relative h-[500px] overflow-hidden">
          {/* Background Image */}
          {heroAnime.bannerImage ? (
            <img
              src={heroAnime.bannerImage}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : heroAnime.coverImage?.large ? (
            <img
              src={heroAnime.coverImage.large}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30"
            />
          ) : null}
          
          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background/80 to-transparent" />

          {/* Content */}
          <div className="relative z-10 h-full flex items-end p-8 pb-12">
            <div className="max-w-3xl">
              <h1 className="text-4xl md:text-5xl font-bold mb-3 text-white">
                {heroAnime.title?.english || heroAnime.title?.romaji}
              </h1>
              
              {heroAnime.description && (
                <p className="text-muted-foreground line-clamp-3 mb-4 max-w-2xl">
                  {heroAnime.description.replace(/<[^>]*>/g, '')}
                </p>
              )}

              <div className="flex items-center gap-3 mb-6">
                {heroAnime.averageScore && (
                  <div className="flex items-center gap-1 bg-yellow-500/20 text-yellow-400 px-3 py-1 rounded-full text-sm">
                    <Star size={14} className="fill-current" />
                    <span>{(heroAnime.averageScore / 10).toFixed(1)}</span>
                  </div>
                )}
                {heroAnime.format && (
                  <span className="bg-muted/50 text-muted-foreground px-3 py-1 rounded-full text-sm">
                    {heroAnime.format}
                  </span>
                )}
                {heroAnime.episodes && (
                  <span className="bg-muted/50 text-muted-foreground px-3 py-1 rounded-full text-sm">
                    {heroAnime.episodes} eps
                  </span>
                )}
                {heroAnime.season && heroAnime.seasonYear && (
                  <span className="bg-muted/50 text-muted-foreground px-3 py-1 rounded-full text-sm">
                    {heroAnime.season} {heroAnime.seasonYear}
                  </span>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setLocation(`/anime/${heroAnime.id}`)}
                  className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  <Play size={18} className="fill-current" />
                  Assistir Agora
                </button>
                <button
                  onClick={() => setLocation(`/anime/${heroAnime.id}`)}
                  className="flex items-center gap-2 bg-muted/50 hover:bg-muted text-foreground px-6 py-3 rounded-lg font-semibold transition-colors"
                >
                  Mais Informações
                </button>
              </div>
            </div>
          </div>

          {/* Hero Indicators */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {trending.slice(0, 10).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setHeroIndex(idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === heroIndex ? 'w-8 bg-accent' : 'w-2 bg-muted/50 hover:bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Anime Sections */}
      <div className="px-6 py-8 space-y-12">
        {/* Trending */}
        <section>
          <SectionHeader
            title="Em Alta"
            onSeeAll={() => setLocation('/search?sort=TRENDING_DESC')}
          />
          <AnimeRow animes={trending} onAnimeClick={(id) => setLocation(`/anime/${id}`)} />
        </section>

        {/* Popular */}
        <section>
          <SectionHeader
            title="Populares"
            onSeeAll={() => setLocation('/search?sort=POPULARITY_DESC')}
          />
          <AnimeRow animes={popular} onAnimeClick={(id) => setLocation(`/anime/${id}`)} />
        </section>

        {/* Seasonal */}
        <section>
          <SectionHeader
            title={`${getCurrentSeason()} ${getCurrentYear()}`}
            onSeeAll={() => setLocation(`/search?season=${getCurrentSeason()}&year=${getCurrentYear()}`)}
          />
          <AnimeRow animes={seasonal} onAnimeClick={(id) => setLocation(`/anime/${id}`)} />
        </section>
      </div>
    </div>
  );
}

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        <div className="w-1 h-6 bg-accent rounded" />
        {title}
      </h2>
      <button
        onClick={onSeeAll}
        className="text-accent hover:text-accent/80 text-sm font-medium"
      >
        Ver Todos →
      </button>
    </div>
  );
}

function AnimeRow({
  animes,
  onAnimeClick,
}: {
  animes: any[];
  onAnimeClick: (id: string) => void;
}) {
  const scrollRef = useState<React.RefObject<HTMLDivElement | null>>(() => ({ current: null }))[0];

  const scroll = (direction: 'left' | 'right') => {
    if (!scrollRef.current) return;
    const amount = 300;
    scrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth',
    });
  };

  return (
    <div className="relative group">
      <button
        onClick={() => scroll('left')}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronLeft size={20} />
      </button>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scrollbar-hide pb-4"
      >
        {animes.map((anime) => {
          const result = anilistToAnimeResult(anime);
          return (
            <div
              key={result.id}
              onClick={() => onAnimeClick(result.id)}
              className="flex-shrink-0 w-40 cursor-pointer group/card"
            >
              <div className="relative aspect-[9/13] rounded-lg overflow-hidden mb-2">
                {result.thumbnail ? (
                  <img
                    src={result.thumbnail}
                    alt={result.title}
                    className="w-full h-full object-cover group-hover/card:scale-110 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center">
                    <span className="text-muted-foreground text-sm">Sem imagem</span>
                  </div>
                )}
                
                {result.score > 0 && (
                  <div className="absolute top-2 right-2 bg-accent/90 backdrop-blur-sm rounded px-2 py-1 flex items-center gap-1">
                    <Star size={10} className="fill-white text-white" />
                    <span className="text-xs font-bold text-white">{result.score}</span>
                  </div>
                )}
              </div>

              <h3 className="text-sm font-medium line-clamp-2 group-hover/card:text-accent transition-colors">
                {result.title}
              </h3>
              {result.type && (
                <span className="text-xs text-muted-foreground">{result.type}</span>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={() => scroll('right')}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-background/80 p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
