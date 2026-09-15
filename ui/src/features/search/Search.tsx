import { useEffect, useState } from 'react';
import { useLocation, useSearch } from 'wouter';
import { searchAniList, anilistToAnimeResult, filterSeasonDuplicates, getTrendingAnime, getPopularAnime, getUpcomingAnime, getSeasonalAnime } from '@/shared/lib/anilist';
import { batchCheckAvailability } from '@/providers';
import { Loader2, X, SlidersHorizontal, Bookmark } from 'lucide-react';
import LoadingAnimation from '@/shared/components/LoadingAnimation';
import { useAccount } from '@/contexts/AccountContext';

interface SearchFilters {
  season?: string;
  year?: number;
  status?: string;
  format?: string;
  genre?: string;
}

const SEASONS = ['VERÃO', 'OUTONO', 'INVERNO', 'PRIMAVERA'];
const SEASON_VALUES = ['SPRING', 'SUMMER', 'FALL', 'WINTER'];
const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
const STATUSES = ['LANÇANDO', 'FINALIZADO', 'EM BREVE', 'CANCELADO'];
const STATUS_VALUES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED'];
const FORMATS = ['TV', 'FILME', 'OVA', 'ONA', 'ESPECIAL', 'TV SHORT'];
const FORMAT_VALUES = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT'];
const GENRES = [
  'Ação', 'Aventura', 'Comédia', 'Drama', 'Fantasia', 'Horror',
  'Mistério', 'Romance', 'Ficção Científica', 'Slice of Life', 'Esportes', 'Sobrenatural', 'Suspense',
];
const GENRE_VALUES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

export default function Search() {
  const [location, setLocation] = useLocation();
  const searchString = useSearch();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const { toggleSavedAnime, isSaved } = useAccount();

  // Default animes (mixed trending + popular)
  const [defaultAnimes, setDefaultAnimes] = useState<any[]>([]);
  const [defaultLoading, setDefaultLoading] = useState(true);

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleSavedAnime(id);
  };

  // Parse URL params and search
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get('q');
    const season = params.get('season');
    const year = params.get('year');
    const genre = params.get('genre');

    // Update query
    if (q) setQuery(q);
    else if (!q && query) setQuery('');

    // Update filters
    const newFilters: SearchFilters = {};
    if (season) {
      const seasonIndex = SEASONS.indexOf(season);
      if (seasonIndex >= 0) {
        newFilters.season = SEASON_VALUES[seasonIndex];
      } else {
        newFilters.season = season;
      }
    }
    if (year) newFilters.year = Number(year);
    if (genre) {
      // Try to find in Portuguese genres first
      const genreIndex = GENRES.indexOf(genre);
      if (genreIndex >= 0) {
        newFilters.genre = GENRE_VALUES[genreIndex];
      } else {
        // Try to find in English genres (from AniList)
        const genreValueIndex = GENRE_VALUES.indexOf(genre);
        if (genreValueIndex >= 0) {
          newFilters.genre = GENRE_VALUES[genreValueIndex];
        } else {
          newFilters.genre = genre;
        }
      }
    }
    setFilters(newFilters);
    if (Object.values(newFilters).some(Boolean)) {
      setShowFilters(true);
    }
  }, [searchString]);

  // Load default animes on mount
  useEffect(() => {
    const loadDefault = async () => {
      try {
        setDefaultLoading(true);
        const [trending, popular, upcoming, seasonal] = await Promise.all([
          getTrendingAnime(1, 25),
          getPopularAnime(1, 25),
          getUpcomingAnime(1, 25),
          getSeasonalAnime('SPRING', new Date().getFullYear(), 1, 25),
        ]);

        // Combine and deduplicate
        const combined = [...trending];
        for (const anime of [...popular, ...upcoming, ...seasonal]) {
          if (!combined.find((a) => a.id === anime.id)) {
            combined.push(anime);
          }
        }

        // Filter to only ones with cover images and remove season duplicates
        const withImages = filterSeasonDuplicates(combined).filter((a) => a.coverImage?.large);
        setDefaultAnimes(withImages);
      } catch (err) {
        console.error('Error loading default animes:', err);
      } finally {
        setDefaultLoading(false);
      }
    };

    loadDefault();
  }, []);

  // Search when query or filters change
  useEffect(() => {
    const search = async () => {
      if (!query.trim() && !Object.values(filters).some(Boolean)) {
        setResults([]);
        setHasSearched(false);
        return;
      }

      try {
        setLoading(true);
        setHasSearched(true);
        const data = await searchAniList(query.trim() || undefined, filters);
        const filtered = filterSeasonDuplicates(data);

        // Check availability on the streaming provider before showing results
        if (filtered.length > 0) {
          setCheckingAvailability(true);
          try {
            const animesToCheck = filtered.map((anime: any) => ({
              id: anime.id.toString(),
              title: anime.title?.romaji || anime.title?.english || '',
              titleAlternative: anime.title?.english,
              nativeTitle: anime.title?.native,
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
            } else {
              // No available anime - show all results (user can still browse)
              setResults(filtered);
            }
          } catch (err) {
            console.error('Availability check error:', err);
            setResults(filtered);
          } finally {
            setCheckingAvailability(false);
          }
        } else {
          setResults(filtered);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(search, 500);
    return () => clearTimeout(debounce);
  }, [query, filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const clearFilters = () => {
    setFilters({});
    setAvailableIds(new Set());
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const displayAnimes = hasSearched ? results : defaultAnimes;

  return (
    <div className="min-h-screen bg-black">
      {/* Header - Centered */}
      <div className="pt-12 pb-8 px-8 md:px-16 relative">
        <h1 className="text-3xl font-bold mb-8 text-white text-center">Buscar Animes</h1>

        {/* Search Box with Filter Button */}
        <div className="max-w-3xl mx-auto">
          <form onSubmit={handleSearch} className="relative">
            <div className="flex items-center gap-3">
              {/* Search Input - Glass Effect */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Buscar anime..."
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  className="w-full pl-12 pr-10 py-3.5 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white placeholder-gray-500 transition-all"
                />
                <svg className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                {query && (
                  <button
                    type="button"
                    onClick={() => handleQueryChange('')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Filter Button */}
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className={`p-3.5 rounded-xl backdrop-blur-md border border-white/10 transition-all ${
                  showFilters || hasActiveFilters
                    ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <SlidersHorizontal size={20} />
                {hasActiveFilters && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                    {Object.values(filters).filter(Boolean).length}
                  </span>
                )}
              </button>
            </div>
          </form>

          {/* Filters Panel - Below Search */}
          {showFilters && (
            <div className="mt-4 p-4 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <FilterSelect
                  label="Temporada"
                  value={filters.season}
                  options={SEASONS}
                  values={SEASON_VALUES}
                  onChange={(v) => updateFilter('season', v)}
                />
                <FilterSelect
                  label="Ano"
                  value={filters.year?.toString()}
                  options={YEARS.map(String)}
                  values={YEARS.map(String)}
                  onChange={(v) => updateFilter('year', v ? Number(v) : undefined)}
                />
                <FilterSelect
                  label="Status"
                  value={filters.status}
                  options={STATUSES}
                  values={STATUS_VALUES}
                  onChange={(v) => updateFilter('status', v)}
                />
                <FilterSelect
                  label="Formato"
                  value={filters.format}
                  options={FORMATS}
                  values={FORMAT_VALUES}
                  onChange={(v) => updateFilter('format', v)}
                />
                <FilterSelect
                  label="Gênero"
                  value={filters.genre}
                  options={GENRES}
                  values={GENRE_VALUES}
                  onChange={(v) => updateFilter('genre', v)}
                />
              </div>
              {hasActiveFilters && (
                <div className="mt-3 pt-3 border-t border-white/10">
                  <button
                    onClick={clearFilters}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Limpar Filtros
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Results or Default Grid */}
      <div className="px-8 md:px-16 pb-12">
        {loading || defaultLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingAnimation />
          </div>
        ) : displayAnimes.length > 0 ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              {query && (
                <h2 className="text-xl font-semibold text-white">
                  Resultados para "{query}"
                </h2>
              )}
              {checkingAvailability && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="animate-spin" size={12} />
                  Verificando disponibilidade...
                </span>
              )}
            </div>

            {results.length > 0 && availableIds.size > 0 && (
              <p className="text-sm text-gray-400 mb-4">
                Animes disponíveis
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {displayAnimes
                .map((anime) => {
                  const result = anilistToAnimeResult(anime);
                  const isAvailable = availableIds.has(anime.id.toString());
                  return (
                    <AnimeCard
                      key={result.id}
                      result={result}
                      isAvailable={isAvailable}
                      showAvailability={results.length > 0}
                      isFavorite={isSaved(result.id)}
                      onToggleFavorite={toggleFavorite}
                      onClick={() => setLocation(`/anime/${result.id}`)}
                    />
                  );
                })}
            </div>
          </>
        ) : query ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhum resultado encontrado para "{query}"</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  values,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  values: string[];
  onChange: (value: string | undefined) => void;
}) {
  const selectedIndex = value ? values.indexOf(value) : -1;

  return (
    <div>
      <label className="block text-sm font-medium mb-1.5 text-gray-400">{label}</label>
      <select
        value={selectedIndex >= 0 ? selectedIndex : ''}
        onChange={(e) => {
          const idx = e.target.value;
          onChange(idx !== '' ? values[Number(idx)] : undefined);
        }}
        className="w-full px-3 py-2 bg-white/5 backdrop-blur-md border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/30 text-white text-sm"
      >
        <option value="" className="bg-gray-900">Todos</option>
        {options.map((opt, idx) => (
          <option key={idx} value={idx} className="bg-gray-900">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}

function AnimeCard({
  result,
  isAvailable,
  showAvailability,
  isFavorite,
  onToggleFavorite,
  onClick,
}: {
  result: any;
  isAvailable: boolean;
  showAvailability: boolean;
  isFavorite: boolean;
  onToggleFavorite: (id: string, e: React.MouseEvent) => void;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className="cursor-pointer group transition-all duration-300 hover:-translate-y-2 hover:z-10"
    >
      <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 transition-all duration-300 group-hover:shadow-[0_20px_40px_rgba(124,58,237,0.3)]">
        {result.thumbnail ? (
          <img
            src={result.thumbnail}
            alt={result.title}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-800">
            <span className="text-gray-500 text-xs">Sem imagem</span>
          </div>
        )}

        {/* Favorite button */}
        <button
          onClick={(e) => onToggleFavorite(result.id, e)}
          className={`absolute top-2 right-2 p-2 rounded-lg transition-all duration-200 ${
            isFavorite
              ? 'bg-purple-500/90 text-white'
              : 'bg-black/50 text-gray-400 opacity-0 group-hover:opacity-100'
          }`}
        >
          <Bookmark size={16} className={isFavorite ? 'fill-current' : ''} />
        </button>
      </div>

      <h3 className="text-sm font-medium text-gray-300 line-clamp-2 group-hover:text-purple-400 transition-colors leading-tight">
        {result.title}
      </h3>
    </div>
  );
}
