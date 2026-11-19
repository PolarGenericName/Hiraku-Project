/**
 * Migração — transferir o progresso de um mangá da biblioteca de uma
 * fonte para outra (padrão Mihon MigrateSource).
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { useMangaStore } from '../hooks';
import { getLibrary, migrateLibraryEntry, type LibraryEntry } from '../storage';
import { getSource, listEnabledSources } from '../sources';
import type { MangaSource, MangaSummary } from '../types';
import MangaCard from '../components/MangaCard';
import { useConfirm } from '../../shared/components/ConfirmDialog';

export default function MigratePage() {
  const library = useMangaStore(getLibrary);
  const sources = listEnabledSources();
  const { confirm, dialog } = useConfirm();

  const [selected, setSelected] = useState<LibraryEntry | null>(null);
  const [targetId, setTargetId] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MangaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [migrated, setMigrated] = useState(false);

  const otherSources = selected ? sources.filter((s) => s.id !== selected.sourceId) : [];
  const target: MangaSource | null = otherSources.find((s) => s.id === targetId) ?? otherSources[0] ?? null;

  // Deep-link: /manga/migrate?key=<sourceId:mangaId> chega com o mangá
  // selecionado (vindo do menu de long-press da biblioteca)
  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get('key');
    if (!key) return;
    const entry = getLibrary().find((e) => e.key === key);
    if (entry) setSelected(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pré-preenche a busca com o título atual ao escolher o mangá
  useEffect(() => {
    if (selected) {
      setQuery(selected.title);
      setResults([]);
      setMigrated(false);
    }
  }, [selected]);

  // Busca o mesmo mangá na fonte de destino
  useEffect(() => {
    if (!selected || !target || query.trim().length < 2) {
      setResults([]);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const page = await target.search(1, query.trim());
        if (!cancelled) setResults(page.mangas);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selected, target, query]);

  async function handleMigrate(result: MangaSummary) {
    if (!selected || !target) return;
    const ok = await confirm({
      title: 'Migrar mangá de fonte?',
      description: `"${selected.title}" → ${target.name}\n\nO progresso de leitura será preservado.`,
      confirmLabel: 'Migrar',
    });
    if (!ok) return;
    migrateLibraryEntry(selected.key, target.id, result.id, result.title, result.coverUrl);
    setMigrated(true);
  }

  if (library.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-2xl font-bold text-white mb-3">Migração</h1>
        <p className="text-gray-400">
          Adicione mangás à biblioteca para poder migrá-los entre fontes.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        {selected && (
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setResults([]);
              setMigrated(false);
            }}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            title="Voltar"
          >
            <ArrowLeft size={20} />
          </button>
        )}
        <h1 className="text-2xl font-bold text-white">Migração</h1>
      </div>

      {!selected ? (
        <>
          <p className="text-sm text-gray-400 mb-5">
            Escolha um mangá da biblioteca para transferir o progresso para outra fonte.
          </p>

          {sources.length < 2 && (
            <div className="mb-6 p-4 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/30 text-sm text-gray-300">
              A migração precisa de ao menos duas fontes habilitadas. Atualmente só há{' '}
              <span className="text-white font-medium">{sources.length}</span> fonte habilitada.
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {library.map((entry) => (
              <MangaCard
                key={entry.key}
                sourceId={entry.sourceId}
                manga={{ id: entry.mangaId, title: entry.title, coverUrl: entry.coverUrl }}
                onClick={() => setSelected(entry)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-6">
          {/* Mangá de origem */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.04] border border-white/10">
            <div className="w-14 h-20 rounded-lg overflow-hidden bg-gray-900 shrink-0">
              {selected.coverUrl && (
                <img
                  src={selected.coverUrl}
                  alt=""
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-white font-medium truncate">{selected.title}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Fonte atual: {getSource(selected.sourceId)?.name ?? selected.sourceId} · Cap.{' '}
                {selected.lastReadChapter} lido
              </p>
            </div>
            <ArrowRight size={18} className="text-gray-600 shrink-0 ml-auto" />
            <div className="text-right shrink-0">
              <p className="text-sm font-medium text-[#7c3aed]">
                {target?.name ?? 'Sem destino'}
              </p>
            </div>
          </div>

          {migrated ? (
            <div className="py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
                <Check size={30} className="text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Migração concluída</h2>
              <p className="text-gray-400 mb-6">
                “{selected.title}” agora está em {target?.name} com o progresso preservado.
              </p>
              <Link
                href="/manga"
                className="px-6 py-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium transition-colors"
              >
                Voltar à biblioteca
              </Link>
            </div>
          ) : otherSources.length === 0 ? (
            <p className="text-gray-400 py-8 text-center">
              Nenhuma outra fonte habilitada para migrar. Habilite mais fontes em Configurações.
            </p>
          ) : (
            <>
              {/* Fonte de destino */}
              {otherSources.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap">
                  {otherSources.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTargetId(s.id)}
                      className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                        s.id === target?.id
                          ? 'bg-[#7c3aed] text-white'
                          : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Busca na fonte de destino */}
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Título do mangá na fonte de destino..."
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
                />
              </div>

              {loading && <p className="text-sm text-gray-500">Buscando em {target?.name}...</p>}

              {results.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {results.map((manga) => (
                    <div key={manga.id} className="relative">
                      <MangaCard
                        sourceId={target!.id}
                        manga={manga}
                        onClick={() => handleMigrate(manga)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {!loading && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-gray-500 py-6 text-center">
                  Nenhum resultado em {target?.name} para “{query}”.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {dialog}
    </div>
  );
}
