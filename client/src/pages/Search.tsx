import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { searchAniList, anilistToAnimeResult, filterSeasonDuplicates } from '@/lib/anilist';
import { batchCheckAvailability } from '@/providers';
import { Loader2, Search as SearchIcon, Star, X, Play, AlertCircle } from 'lucide-react';

interface SearchFilters {
  season?: string;
  year?: number;
  status?: string;
  format?: string;
  genre?: string;
  availableOnly?: boolean;
}

const SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];
const YEARS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);
const STATUSES = ['RELEASING', 'FINISHED', 'NOT_YET_RELEASED', 'CANCELLED'];
const FORMATS = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT'];
const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller',
];

export default function Search() {
  const [location, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<SearchFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set());
  const [checkingAvailability, setCheckingAvailability] = useState(false);

  // Parse URL params
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const q = params.get('q');
    const season = params.get('season');
    const year = params.get('year');
    const sort = params.get('sort');

    if (q) setQuery(q);
    if (season) setFilters((f) => ({ ...f, season }));
    if (year) setFilters((f) => ({ ...f, year: Number(year) }));
  }, [location]);

  // Search when query or filters change
  useEffect(() => {
    const search = async () => {
      if (!query.trim() && !Object.values(filters).some(Boolean)) {
        setResults([]);
        return;
      }

      try {
        setLoading(true);
        const data = await searchAniList(query || '', filters);
        setResults(filterSeasonDuplicates(data));

        // Check availability on AnimeFire
        if (data.length > 0) {
          setCheckingAvailability(true);
          try {
            const animesToCheck = data.map((anime: any) => ({
              id: anime.id.toString(),
              title: anime.title?.romaji || anime.title?.english || '',
              titleAlternative: anime.title?.english,
            }));
            const available = await batchCheckAvailability(animesToCheck);
            setAvailableIds(available);
          } catch (err) {
            console.error('Availability check error:', err);
          } finally {
            setCheckingAvailability(false);
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
  }, [query, filters]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const updateFilter = (key: keyof SearchFilters, value: any) => {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  };

  const clearFilters = () => {
    setFilters({});
    setAvailableIds(new Set());
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="bg-gradient-to-b from-purple-500/10 to-black border-b border-white/5 p-8">
        <h1 className="text-3xl font-bold mb-6 text-white">Buscar Animes</h1>

        <form onSubmit={handleSearch} className="max-w-2xl">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar anime..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 text-white placeholder-gray-500 transition-all"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </form>

        {/* Filters Toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="mt-4 text-purple-400 hover:text-purple-300 text-sm font-medium transition-colors"
        >
          {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          {hasActiveFilters && (
            <span className="ml-2 bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-full border border-purple-500/30">
              {Object.values(filters).filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 glass p-4 rounded-xl">
            <FilterSelect
              label="Temporada"
              value={filters.season}
              options={SEASONS}
              onChange={(v) => updateFilter('season', v)}
            />
            <FilterSelect
              label="Ano"
              value={filters.year?.toString()}
              options={YEARS.map(String)}
              onChange={(v) => updateFilter('year', v ? Number(v) : undefined)}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              options={STATUSES}
              onChange={(v) => updateFilter('status', v)}
            />
            <FilterSelect
              label="Formato"
              value={filters.format}
              options={FORMATS}
              onChange={(v) => updateFilter('format', v)}
            />
            <FilterSelect
              label="Gênero"
              value={filters.genre}
              options={GENRES}
              onChange={(v) => updateFilter('genre', v)}
            />
            <div className="flex items-center gap-2 pt-6">
              <input
                type="checkbox"
                id="availableOnly"
                checked={filters.availableOnly || false}
                onChange={(e) => updateFilter('availableOnly', e.target.checked)}
                className="w-4 h-4 rounded border-white/20 text-purple-500 focus:ring-purple-500/50"
              />
              <label htmlFor="availableOnly" className="text-sm text-gray-400">
                Só com episódios disponíveis
              </label>
            </div>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Results */}
      <div className="p-8">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-purple-500" size={32} />
          </div>
        ) : results.length > 0 ? (
          <>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-white">
                {query ? `Resultados para "${query}"` : 'Todos os Animes'}
              </h2>
              {checkingAvailability && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Loader2 className="animate-spin" size={12} />
                  Verificando disponibilidade...
                </span>
              )}
            </div>

            {/* Availability summary */}
            {availableIds.size > 0 && (
              <p className="text-sm text-gray-400 mb-4">
                {availableIds.size} de {results.length} animes disponíveis no AnimeFire
              </p>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results
                .filter((anime) => {
                  if (filters.availableOnly && !availableIds.has(anime.id.toString())) {
                    return false;
                  }
                  return true;
                })
                .map((anime) => {
                  const result = anilistToAnimeResult(anime);
                  const isAvailable = availableIds.has(anime.id.toString());
                  return (
                    <div
                      key={result.id}
                      onClick={() => setLocation(`/anime/${result.id}`)}
                      className="cursor-pointer group"
                    >
                      <div className="relative aspect-[9/13] rounded-xl overflow-hidden mb-2 bg-gray-900 border border-white/10 group-hover:border-purple-500/50 transition-all duration-300">
                        {result.thumbnail ? (
                          <img
                            src={result.thumbnail}
                            alt={result.title}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                            <span className="text-gray-500 text-sm">Sem imagem</span>
                          </div>
                        )}

                        {/* Availability badge */}
                        <div className="absolute top-2 left-2">
                          {isAvailable ? (
                            <div className="bg-purple-500/80 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1 border border-purple-400/30">
                              <Play size={10} className="fill-white text-white" />
                              <span className="text-xs font-bold text-white">Disponível</span>
                            </div>
                          ) : (
                            <div className="bg-gray-500/80 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1 border border-white/10">
                              <AlertCircle size={10} className="text-white" />
                              <span className="text-xs font-bold text-white">Indisponível</span>
                            </div>
                          )}
                        </div>

                        {result.score > 0 && (
                          <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1 border border-white/10">
                            <Star size={10} className="text-yellow-400 fill-current" />
                            <span className="text-xs font-bold text-white">{result.score}</span>
                          </div>
                        )}

                        {/* Hover Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-purple-600/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                          <div className="flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
                            <Play size={14} className="text-white fill-current" />
                            <span className="text-white text-sm font-medium">Assistir</span>
                          </div>
                        </div>
                      </div>

                      <h3 className="text-sm font-medium line-clamp-2 text-gray-200 group-hover:text-purple-400 transition-colors">
                        {result.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {result.type && (
                          <span className="text-xs text-gray-500">{result.type}</span>
                        )}
                        {result.year && (
                          <span className="text-xs text-gray-500">{result.year}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        ) : query ? (
          <div className="text-center py-12">
            <p className="text-gray-400">Nenhum resultado encontrado para "{query}"</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">Busque por um anime ou use os filtros</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1 text-gray-400">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-white"
      >
        <option value="" className="bg-gray-900">Todos</option>
        {options.map((opt) => (
          <option key={opt} value={opt} className="bg-gray-900">
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
