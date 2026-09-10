import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { searchAniList, anilistToAnimeResult, filterSeasonDuplicates } from '@/lib/anilist';
import { batchCheckAvailability } from '@/providers';
import { Loader2, Star, Play, AlertCircle, Bookmark } from 'lucide-react';
import LoadingAnimation from '@/components/LoadingAnimation';

const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
const GENRES = [
  'Ação', 'Aventura', 'Comédia', 'Drama', 'Fantasia', 'Horror',
  'Mistério', 'Romance', 'Ficção Científica', 'Slice of Life', 'Esportes', 'Sobrenatural', 'Suspense',
];
const GENRE_VALUES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

interface FilterPageProps {
  format: 'TV' | 'MOVIE';
  title: string;
}

export default function FilterPage({ format, title }: FilterPageProps) {
  const [, setLocation] = useLocation();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState<number | undefined>(undefined);
  const [genre, setGenre] = useState<string | undefined>(undefined);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());

  // Favorites from localStorage
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('hiraku-favorites');
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Save favorites to localStorage
  useEffect(() => {
    localStorage.setItem('hiraku-favorites', JSON.stringify([...favorites]));
  }, [favorites]);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Search when filters change
  useEffect(() => {
    const search = async () => {
      try {
        setLoading(true);
        const filters: { format: string; year?: number; genre?: string } = { format };
        if (year) filters.year = year;
        if (genre) filters.genre = genre;
        
        const data = await searchAniList(undefined, filters, 1, 30);
        const filtered = filterSeasonDuplicates(data);
        setResults(filtered);

        // Check availability on AnimeFire
        if (filtered.length > 0) {
          try {
            const animesToCheck = filtered.map((anime: any) => ({
              id: anime.id.toString(),
              title: anime.title?.romaji || anime.title?.english || '',
              titleAlternative: anime.title?.english,
              year: anime.seasonYear,
              episodes: anime.episodes,
              status: anime.status,
            }));
            const available = await batchCheckAvailability(animesToCheck);
            setAvailableIds(available);

            // Filter to only show available anime
            if (available.size > 0) {
              const availableAnime = filtered.filter((anime: any) => 
                available.has(anime.id.toString())
              );
              setResults(availableAnime);
            }
          } catch (err) {
            console.error('Availability check error:', err);
          }
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 500);
    return () => clearTimeout(debounce);
  }, [format, year, genre]);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="pt-8 pb-6 px-8 md:px-16 text-center">
        <h1 className="text-3xl font-bold mb-6 text-white">{title}</h1>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-4 max-w-3xl mx-auto">
          {/* Year Filter */}
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium mb-1.5 text-gray-400">Ano</label>
            <select
              value={year || ''}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full px-3 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white text-sm"
            >
              <option value="" className="bg-gray-900">Todos</option>
              {YEARS.map((y) => (
                <option key={y} value={y} className="bg-gray-900">{y}</option>
              ))}
            </select>
          </div>

          {/* Genre Filter */}
          <div className="min-w-[150px]">
            <label className="block text-sm font-medium mb-1.5 text-gray-400">Gênero</label>
            <select
              value={genre ? GENRE_VALUES.indexOf(genre) : ''}
              onChange={(e) => {
                const idx = e.target.value;
                setGenre(idx !== '' ? GENRE_VALUES[Number(idx)] : undefined);
              }}
              className="w-full px-3 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white text-sm"
            >
              <option value="" className="bg-gray-900">Todos</option>
              {GENRES.map((g, idx) => (
                <option key={idx} value={idx} className="bg-gray-900">{g}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {(year || genre) && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setYear(undefined);
                  setGenre(undefined);
                }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Limpar Filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div className="px-8 md:px-16 pb-12">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingAnimation size="md" />
          </div>
        ) : results.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {results.map((anime) => {
              const result = anilistToAnimeResult(anime);
              return (
                <div
                  key={result.id}
                  onClick={() => setLocation(`/anime/${result.id}`)}
                  className="cursor-pointer group transition-all duration-300 hover:-translate-y-2 hover:z-10"
                >
                  <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 transition-all duration-300 group-hover:shadow-[0_20px_40px_rgba(124,58,237,0.3)]">
                    {result.thumbnail ? (
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-gray-800">
                        <span className="text-gray-500 text-xs">Sem imagem</span>
                      </div>
                    )}

                    {/* Favorite button */}
                    <button
                      onClick={(e) => toggleFavorite(result.id, e)}
                      className={`absolute top-2 right-2 p-2 rounded-lg transition-all duration-200 ${
                        favorites.has(result.id)
                          ? 'bg-purple-500/90 text-white'
                          : 'bg-black/50 text-gray-400 opacity-0 group-hover:opacity-100'
                      }`}
                    >
                      <Bookmark size={16} className={favorites.has(result.id) ? 'fill-current' : ''} />
                    </button>
                  </div>

                  <h3 className="text-sm font-medium text-gray-300 line-clamp-2 group-hover:text-purple-400 transition-colors leading-tight">
                    {result.title}
                  </h3>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhum resultado encontrado</p>
          </div>
        )}
      </div>
    </div>
  );
}
