import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'wouter';
import { searchAniList, anilistToAnimeResult } from '@/lib/anilist';
import { Loader2, Search as SearchIcon, Star, X } from 'lucide-react';

interface SearchFilters {
  season?: string;
  year?: number;
  status?: string;
  format?: string;
  genre?: string;
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
        const data = await searchAniList(query || undefined, filters);
        setResults(data);
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
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-b from-accent/10 to-background border-b border-border p-8">
        <h1 className="text-3xl font-bold mb-6">Buscar Animes</h1>

        <form onSubmit={handleSearch} className="max-w-2xl">
          <div className="relative">
            <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={20} />
            <input
              type="text"
              placeholder="Buscar anime..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
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
          className="mt-4 text-accent hover:text-accent/80 text-sm font-medium"
        >
          {showFilters ? 'Ocultar Filtros' : 'Mostrar Filtros'}
          {hasActiveFilters && (
            <span className="ml-2 bg-accent text-white text-xs px-2 py-0.5 rounded-full">
              {Object.values(filters).filter(Boolean).length}
            </span>
          )}
        </button>

        {/* Filters */}
        {showFilters && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
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
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-muted-foreground hover:text-foreground"
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
            <Loader2 className="animate-spin text-accent" size={32} />
          </div>
        ) : results.length > 0 ? (
          <>
            <h2 className="text-xl font-semibold mb-4">
              {query ? `Resultados para "${query}"` : 'Todos os Animes'} ({results.length})
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {results.map((anime) => {
                const result = anilistToAnimeResult(anime);
                return (
                  <div
                    key={result.id}
                    onClick={() => setLocation(`/anime/${result.id}`)}
                    className="cursor-pointer group"
                  >
                    <div className="relative aspect-[9/13] rounded-lg overflow-hidden mb-2">
                      {result.thumbnail ? (
                        <img
                          src={result.thumbnail}
                          alt={result.title}
                          className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
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

                    <h3 className="text-sm font-medium line-clamp-2 group-hover:text-accent transition-colors">
                      {result.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {result.type && (
                        <span className="text-xs text-muted-foreground">{result.type}</span>
                      )}
                      {result.year && (
                        <span className="text-xs text-muted-foreground">{result.year}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : query ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Nenhum resultado encontrado para "{query}"</p>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Busque por um anime ou use os filtros</p>
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
      <label className="block text-sm font-medium mb-1 text-muted-foreground">{label}</label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="w-full px-3 py-2 bg-muted/50 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent"
      >
        <option value="">Todos</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </div>
  );
}
