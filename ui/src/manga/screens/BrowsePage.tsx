/**
 * Navegar — 2 sub-abas (padrão Mihon Browse: Sources | Extensions):
 *
 * - Fontes: lista agrupada (fixadas → por idioma) com pin, filtro de
 *   idioma, atalho Latest e busca global entre as fontes habilitadas
 *   (filtro padrão: só fixadas, como no GlobalSearch do Mihon).
 * - Loja: fontes nativas + repositórios adicionados por URL (formato
 *   index.min.json/repo.json do Mihon/Keiyoushi).
 *
 * Clicar numa fonte abre o catálogo (Populares/Recentes + busca interna),
 * como o BrowseSourceScreen do Mihon.
 */

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Eye, Globe, Pin, Search } from 'lucide-react';
import { listEnabledSources } from '../sources';
import { getPinnedSources, toggleSourcePin, langLabel } from '../sourcePrefs';
import { useMangaStore } from '../hooks';
import type { MangaSource, MangaSummary } from '../types';
import MangaCard from '../components/MangaCard';
import SourceStoreTab from '../components/SourceStoreTab';

type TopTab = 'sources' | 'store';
type Tab = 'popular' | 'latest';
type SearchScope = 'pinned' | 'all';

const TAB_CHIP =
  'px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer';
const SCOPE_CHIP =
  'flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer';

// ── Linha de fonte ───────────────────────────────────────────────────────────

function SourceRow({
  source,
  pinned,
  onOpen,
}: {
  source: MangaSource;
  pinned: boolean;
  onOpen: (id: string, tab: Tab) => void;
}) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] transition-colors">
      <button
        type="button"
        onClick={() => onOpen(source.id, 'popular')}
        className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
      >
        <div className="w-9 h-9 rounded-lg bg-[#7c3aed]/15 flex items-center justify-center shrink-0">
          <Globe size={17} className="text-[#7c3aed]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{source.name}</p>
          <p className="text-xs text-gray-500 truncate">
            {langLabel(source.lang)} · {source.baseUrl}
          </p>
        </div>
      </button>

      {/* Olho: deixa claro que a linha abre o catálogo da fonte */}
      <button
        type="button"
        title="Entrar no catálogo desta fonte"
        aria-label={`Entrar no catálogo de ${source.name}`}
        onClick={() => onOpen(source.id, 'popular')}
        className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
      >
        <Eye size={16} />
      </button>

      {source.supportsLatest && (
        <button
          type="button"
          onClick={() => onOpen(source.id, 'latest')}
          className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-gray-300 hover:text-white transition-colors cursor-pointer shrink-0"
        >
          Latest
        </button>
      )}

      <button
        type="button"
        onClick={() => toggleSourcePin(source.id)}
        title={pinned ? 'Desfixar fonte' : 'Fixar fonte'}
        className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer shrink-0"
      >
        <Pin size={16} className={pinned ? 'text-[#7c3aed] fill-current' : 'text-gray-500'} />
      </button>
    </div>
  );
}

// ── Lista de fontes agrupada (Mihon SourcesScreen) ───────────────────────────

function SourcesList({ onOpen }: { onOpen: (id: string, tab: Tab) => void }) {
  const sources = useMangaStore(listEnabledSources);
  const pinnedIds = useMangaStore(getPinnedSources);
  const [langFilter, setLangFilter] = useState('all');

  const langs = Array.from(new Set(sources.map((s) => s.lang))).sort();
  const visible =
    langFilter === 'all' ? sources : sources.filter((s) => s.lang === langFilter);

  const pinned = visible.filter((s) => pinnedIds.includes(s.id));
  const rest = visible.filter((s) => !pinnedIds.includes(s.id));

  const restByLang = new Map<string, MangaSource[]>();
  for (const s of rest) {
    const list = restByLang.get(s.lang);
    if (list) list.push(s);
    else restByLang.set(s.lang, [s]);
  }

  const groups: Array<{ key: string; label: string; items: MangaSource[] }> = [];
  if (pinned.length > 0) groups.push({ key: 'pinned', label: 'Fixadas', items: pinned });
  for (const lang of Array.from(restByLang.keys()).sort()) {
    groups.push({ key: lang, label: langLabel(lang), items: restByLang.get(lang)! });
  }

  if (visible.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        Nenhuma fonte neste idioma.
      </p>
    );
  }

  return (
    <div>
      {/* Filtro de idioma das fontes (source_languages do Mihon) */}
      {langs.length > 1 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {['all', ...langs].map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLangFilter(lang)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                langFilter === lang
                  ? 'bg-[#7c3aed] text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              {lang === 'all' ? 'Todos os idiomas' : langLabel(lang)}
            </button>
          ))}
        </div>
      )}

      {groups.map((group, gi) => (
        <div key={group.key} className={gi > 0 ? 'mt-6' : ''}>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            {group.label}
          </p>
          <div className="space-y-2">
            {group.items.map((s) => (
              <SourceRow
                key={s.id}
                source={s}
                pinned={pinnedIds.includes(s.id)}
                onOpen={onOpen}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Busca global (Mihon GlobalSearchScreen) ──────────────────────────────────

type SourceSearchState = { status: 'loading' | 'ok' | 'error'; items: MangaSummary[] };

function GlobalSearch({
  query,
  genre,
  sources,
  pinnedIds,
  onOpen,
}: {
  query: string;
  /** Gênero do deep-link (?genre=) — usa searchByGenre quando a fonte tem */
  genre: string | null;
  sources: MangaSource[];
  pinnedIds: string[];
  onOpen: (id: string) => void;
}) {
  const [states, setStates] = useState<Record<string, SourceSearchState>>({});
  const requestId = useRef(0);
  const term = genre ?? query;
  // Modo gênero: só fontes com filtro real — sem searchByGenre a busca por
  // texto retornaria mangás que NÃO têm o gênero (falso positivo).
  const eligible = genre ? sources.filter((s) => s.searchByGenre) : sources;
  const sourceKey = eligible.map((s) => s.id).join(',');

  // Busca em paralelo em todas as fontes do escopo
  useEffect(() => {
    const id = ++requestId.current;
    const initial: Record<string, SourceSearchState> = {};
    for (const s of eligible) initial[s.id] = { status: 'loading', items: [] };
    setStates(initial);
    if (eligible.length === 0) return;

    for (const s of eligible) {
      void (async () => {
        try {
          const page =
            genre && s.searchByGenre
              ? await s.searchByGenre(1, genre) // filtro real de tags
              : await s.search(1, term);
          if (id !== requestId.current) return;
          setStates((prev) => ({ ...prev, [s.id]: { status: 'ok', items: page.mangas } }));
        } catch {
          if (id !== requestId.current) return;
          setStates((prev) => ({ ...prev, [s.id]: { status: 'error', items: [] } }));
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, genre, sourceKey]);

  const finished = eligible.filter(
    (s) => states[s.id] && states[s.id].status !== 'loading'
  ).length;

  // Ordem do Mihon: com resultados primeiro, fixadas antes, depois A–Z
  const ordered = [...eligible].sort((a, b) => {
    const rank = (s: MangaSource) => {
      const st = states[s.id];
      if (!st || st.status === 'loading') return 0;
      if (st.status === 'error') return 2;
      return st.items.length > 0 ? 0 : 1;
    };
    const diff = rank(a) - rank(b);
    if (diff !== 0) return diff;
    const pa = pinnedIds.includes(a.id) ? 0 : 1;
    const pb = pinnedIds.includes(b.id) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.name.localeCompare(b.name);
  });

  return (
    <div>
      {finished < eligible.length && (
        <p className="text-xs text-gray-500 mb-4">
          Buscando em {finished}/{eligible.length} fontes...
        </p>
      )}

      {ordered.map((s) => {
        const st = states[s.id];
        return (
          <section key={s.id} className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                onClick={() => onOpen(s.id)}
                className="text-sm font-semibold text-white hover:text-[#a78bfa] transition-colors cursor-pointer"
              >
                {s.name}
              </button>
              <span className="text-xs text-gray-500">{langLabel(s.lang)}</span>
              {pinnedIds.includes(s.id) && (
                <Pin size={12} className="text-[#7c3aed] fill-current" />
              )}
            </div>

            {!st || st.status === 'loading' ? (
              <div className="h-40 rounded-xl bg-white/[0.03] animate-pulse" />
            ) : st.status === 'error' ? (
              <p className="text-sm text-red-400">Erro ao buscar nesta fonte.</p>
            ) : st.items.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum resultado.</p>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-2">
                {st.items.map((m) => (
                  <div key={m.id} className="w-32 shrink-0">
                    <MangaCard sourceId={s.id} manga={m} />
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ── Catálogo de uma fonte (BrowseSourceScreen) ───────────────────────────────

function SourceCatalog({
  source,
  initialTab,
  onBack,
}: {
  source: MangaSource;
  initialTab: Tab;
  onBack: () => void;
}) {
  const pinnedIds = useMangaStore(getPinnedSources);
  const pinned = pinnedIds.includes(source.id);

  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<MangaSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestId = useRef(0);

  // Debounce da busca
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searching = debouncedQuery.length > 0;

  // Busca inicial / troca de aba / termo
  useEffect(() => {
    loadPage(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source.id, tab, debouncedQuery]);

  async function loadPage(targetPage: number, append: boolean) {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);

    try {
      const result = searching
        ? await source.search(targetPage, debouncedQuery)
        : tab === 'popular'
          ? await source.getPopular(targetPage)
          : await source.getLatest(targetPage);

      if (id !== requestId.current) return; // resposta obsoleta
      setItems((prev) => (append ? [...prev, ...result.mangas] : result.mangas));
      setHasMore(result.hasNextPage);
      setPage(targetPage);
    } catch {
      if (id !== requestId.current) return;
      setError('Não foi possível carregar os resultados. Tente novamente.');
      if (!append) setItems([]);
      setHasMore(false);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  return (
    <div>
      {/* Cabeçalho com voltar + fixar */}
      <div className="flex items-center gap-3 mb-5">
        <button
          type="button"
          onClick={onBack}
          title="Voltar para as fontes"
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-white truncate">{source.name}</h2>
          <p className="text-xs text-gray-500 truncate">
            {langLabel(source.lang)} · {source.baseUrl}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleSourcePin(source.id)}
          title={pinned ? 'Desfixar fonte' : 'Fixar fonte'}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
        >
          <Pin size={17} className={pinned ? 'text-[#7c3aed] fill-current' : 'text-gray-500'} />
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Abas */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5">
          {(
            [
              ['popular', 'Populares'],
              ['latest', 'Recentes'],
            ] as Array<[Tab, string]>
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              disabled={searching}
              className={`${TAB_CHIP} ${
                !searching && tab === value
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:text-white disabled:hover:text-gray-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Busca nesta fonte */}
        <div className="relative flex-1 min-w-52 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Buscar em ${source.name}...`}
            className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {searching && <p className="text-xs text-gray-500 mb-4">Buscando “{debouncedQuery}”...</p>}

      {error && (
        <div className="py-16 text-center">
          <p className="text-gray-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={() => loadPage(1, false)}
            className="px-5 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!error && items.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {items.map((manga) => (
              <MangaCard key={`${manga.id}`} sourceId={source.id} manga={manga} />
            ))}
          </div>

          <div className="flex justify-center mt-8">
            {hasMore ? (
              <button
                type="button"
                onClick={() => loadPage(page + 1, true)}
                disabled={loading}
                className="px-6 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                {loading ? 'Carregando...' : 'Carregar mais'}
              </button>
            ) : (
              <span className="text-sm text-gray-600">Fim dos resultados</span>
            )}
          </div>
        </>
      )}

      {!error && loading && items.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 opacity-40 animate-pulse">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="aspect-[9/13] rounded-xl bg-white/5" />
          ))}
        </div>
      )}

      {!error && !loading && items.length === 0 && (
        <p className="py-16 text-center text-gray-500">Nenhum resultado encontrado.</p>
      )}
    </div>
  );
}

// ── Tela ─────────────────────────────────────────────────────────────────────

export default function BrowsePage() {
  const sources = useMangaStore(listEnabledSources);
  const pinnedIds = useMangaStore(getPinnedSources);

  // Deep-links: /manga/browse?tab=store abre na Loja;
  // /manga/browse?genre=X abre a busca filtrada pelo gênero (tags do details)
  const [topTab, setTopTab] = useState<TopTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('tab') === 'store' ? 'store' : 'sources';
  });
  const [genre, setGenre] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('genre'),
  );
  const [selected, setSelected] = useState<{ id: string; tab: Tab } | null>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>('pinned');

  // Debounce da busca global
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => window.clearTimeout(timer);
  }, [query]);

  const searching = debouncedQuery.length > 0 || genre !== null;
  const selectedSource = selected ? sources.find((s) => s.id === selected.id) ?? null : null;

  // Escopo da busca global: fixadas por padrão (GlobalSearch do Mihon);
  // sem nenhuma fixada, cai para todas as habilitadas. No modo gênero vai
  // em todas — o filtro real é raro (só MangaDex) e não deve depender de pin.
  const searchSources = genre
    ? sources
    : scope === 'pinned' && pinnedIds.length > 0
      ? sources.filter((s) => pinnedIds.includes(s.id))
      : sources;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <h1 className="text-2xl font-bold text-white">Navegar</h1>

        {!selected && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5">
            {(
              [
                ['sources', 'Fontes'],
                ['store', 'Loja'],
              ] as Array<[TopTab, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTopTab(value)}
                className={`${TAB_CHIP} ${
                  topTab === value ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selected ? (
        selectedSource ? (
          <SourceCatalog
            key={selectedSource.id}
            source={selectedSource}
            initialTab={selected.tab}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="py-16 text-center">
            <p className="text-gray-400 mb-4">Esta fonte não está mais habilitada.</p>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="px-5 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
            >
              Voltar
            </button>
          </div>
        )
      ) : topTab === 'store' ? (
        <SourceStoreTab />
      ) : sources.length === 0 ? (
        <div className="py-16 text-center">
          <h2 className="text-xl font-bold text-white mb-3">Nenhuma fonte habilitada</h2>
          <p className="text-gray-400 max-w-md mx-auto mb-6">
            Habilite ao menos uma fonte na Loja para começar a navegar.
          </p>
          <button
            type="button"
            onClick={() => setTopTab('store')}
            className="px-5 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
          >
            Abrir Loja de fontes
          </button>
        </div>
      ) : (
        <>
          {/* Busca global entre as fontes habilitadas */}
          <div className="relative mb-4 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value) setGenre(null); // texto tem prioridade
              }}
              placeholder="Busca global nas fontes..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
              >
                ×
              </button>
            )}
          </div>

          {searching ? (
            <>
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                {/* Chip do gênero vindo das tags do details */}
                {genre && (
                  <button
                    type="button"
                    onClick={() => setGenre(null)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#7c3aed] text-white text-xs font-medium transition-colors cursor-pointer hover:bg-[#6d28d9]"
                  >
                    Gênero: {genre}
                    <span aria-hidden>×</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScope('pinned')}
                  className={`${SCOPE_CHIP} ${
                    scope === 'pinned'
                      ? 'bg-[#7c3aed] text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Pin size={13} className={scope === 'pinned' ? 'fill-current' : ''} />
                  Fixadas
                </button>
                <button
                  type="button"
                  onClick={() => setScope('all')}
                  className={`${SCOPE_CHIP} ${
                    scope === 'all'
                      ? 'bg-[#7c3aed] text-white'
                      : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  Todas
                </button>
                {scope === 'pinned' && pinnedIds.length === 0 && !genre && (
                  <span className="text-xs text-gray-500">
                    Nenhuma fonte fixada. Exibindo todas as habilitadas.
                  </span>
                )}
                {genre && searchSources.every((s) => !s.searchByGenre) && (
                  <span className="text-xs text-amber-400">
                    Nenhuma fonte habilitada com filtro de gênero. Habilite a MangaDex
                    para este resultado.
                  </span>
                )}
              </div>

              <GlobalSearch
                query={debouncedQuery}
                genre={genre}
                sources={searchSources}
                pinnedIds={pinnedIds}
                onOpen={(id) => {
                  setQuery('');
                  setSelected({ id, tab: 'popular' });
                }}
              />
            </>
          ) : (
            <SourcesList onOpen={(id, tab) => setSelected({ id, tab })} />
          )}
        </>
      )}
    </div>
  );
}
