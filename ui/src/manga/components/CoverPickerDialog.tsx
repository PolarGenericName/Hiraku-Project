/**
 * Diálogo "Trocar capa" (Etapa 5) — escolhe nova capa para o mangá na
 * biblioteca: uma página do próprio mangá ou a capa vinda de outra fonte
 * habilitada. Restaura a capa original num clique.
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Image as ImageIcon, RotateCcw, Search, X } from 'lucide-react';
import { listEnabledSources, getSource } from '../sources';
import { updateLibraryEntry } from '../storage';
import type { Chapter, MangaPage, MangaSummary } from '../types';

interface CoverPickerProps {
  sourceId: string;
  mangaId: string;
  title: string;
  currentCover?: string;
  onClose: () => void;
}

export default function CoverPickerDialog({
  sourceId,
  mangaId,
  title,
  currentCover,
  onClose,
}: CoverPickerProps) {
  const source = getSource(sourceId);
  const [tab, setTab] = useState<'pages' | 'source'>('pages');

  // Aba "Páginas": capítulos do próprio mangá + páginas do capítulo escolhido
  const [originalCover, setOriginalCover] = useState<string | undefined>();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState('');
  const [pages, setPages] = useState<MangaPage[] | null>(null);
  const [pagesError, setPagesError] = useState(false);

  // Aba "Outra fonte": busca do título nas outras fontes habilitadas
  const others = listEnabledSources().filter((s) => s.id !== sourceId);
  const [otherId, setOtherId] = useState('');
  const [results, setResults] = useState<MangaSummary[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // Capa original (fonte) + capítulos — uma vez, na abertura
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    void source
      .getMangaDetails(mangaId)
      .then((d) => {
        if (!cancelled) setOriginalCover(d?.coverUrl);
      })
      .catch(() => {});
    void source
      .getChapters(mangaId)
      .then((chs) => {
        if (cancelled || !chs.length) return;
        const asc = [...chs].sort((a, b) => a.number - b.number);
        setChapters(asc);
        setChapterId((prev) => prev || asc[0].id); // padrão: primeiro capítulo
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [source, mangaId]);

  // Páginas do capítulo selecionado
  useEffect(() => {
    if (tab !== 'pages' || !chapterId || !source) return;
    let cancelled = false;
    setPages(null);
    setPagesError(false);
    void source
      .getPages(chapterId)
      .then((p) => {
        if (!cancelled) setPages(p);
      })
      .catch(() => {
        if (!cancelled) setPagesError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, chapterId, source]);

  // Busca na fonte escolhida
  useEffect(() => {
    if (tab !== 'source' || !otherId) return;
    const src = getSource(otherId);
    if (!src) return;
    let cancelled = false;
    setResults(null);
    setSearching(true);
    setSearchError(false);
    void src
      .search(1, title)
      .then((page) => {
        if (!cancelled) setResults(page.mangas);
      })
      .catch(() => {
        if (!cancelled) setSearchError(true);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, otherId, title]);

  function pick(coverUrl: string | undefined) {
    updateLibraryEntry(sourceId, mangaId, { coverUrl });
    toast('Capa atualizada', { duration: 2500 });
    onClose();
  }

  const canRestore = !!originalCover && originalCover !== currentCover;

  if (!source) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-[#0d0d12] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-5 animate-in fade-in zoom-in-95 duration-150 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white">Trocar capa</h3>
            <p className="text-sm text-gray-400 mt-0.5 truncate">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Fechar"
            className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Abas */}
        <div className="flex gap-1.5 mb-4 p-1 rounded-xl bg-white/[0.04] shrink-0">
          <button
            type="button"
            onClick={() => setTab('pages')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === 'pages' ? 'bg-[#7c3aed] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <ImageIcon size={14} />
            Páginas do mangá
          </button>
          <button
            type="button"
            onClick={() => setTab('source')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              tab === 'source' ? 'bg-[#7c3aed] text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            <Search size={14} />
            Outra fonte
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {/* ── Páginas do mangá ─────────────────────────────────────── */}
          {tab === 'pages' && (
            <div>
              {chapters.length > 0 && (
                <select
                  value={chapterId}
                  onChange={(e) => setChapterId(e.target.value)}
                  className="w-full mb-3 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#7c3aed]/60 cursor-pointer"
                >
                  {chapters.map((ch) => (
                    <option key={ch.id} value={ch.id} className="bg-[#0d0d12]">
                      Cap. {Number.isInteger(ch.number) ? ch.number : ch.number.toFixed(2)}
                      {ch.title ? ` · ${ch.title}` : ''}
                    </option>
                  ))}
                </select>
              )}

              {pages === null && !pagesError && (
                <p className="text-sm text-gray-500 py-6 text-center">Carregando páginas...</p>
              )}
              {pagesError && (
                <p className="text-sm text-gray-500 py-6 text-center">
                  Não foi possível carregar as páginas deste capítulo.
                </p>
              )}
              {pages && pages.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">Este capítulo não tem páginas.</p>
              )}
              {pages && pages.length > 0 && (
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
                  {pages.map((pg) => (
                    <button
                      key={pg.index}
                      type="button"
                      title={`Página ${pg.index + 1}`}
                      onClick={() => pick(pg.imageUrl)}
                      className="aspect-[3/4] rounded-lg overflow-hidden bg-gray-900 border border-white/10 hover:border-[#7c3aed] hover:scale-[1.03] transition-all cursor-pointer"
                    >
                      <img
                        src={pg.imageUrl}
                        alt={`Página ${pg.index + 1}`}
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Outra fonte ──────────────────────────────────────────── */}
          {tab === 'source' && (
            <div>
              {others.length === 0 && (
                <p className="text-sm text-gray-500 py-6 text-center">
                  Habilite outra fonte na Loja para usar a capa de lá.
                </p>
              )}
              {others.length > 0 && (
                <>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {others.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setOtherId(s.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                          otherId === s.id
                            ? 'bg-[#7c3aed] text-white'
                            : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>

                  {!otherId && (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Escolha uma fonte para buscar o mangá.
                    </p>
                  )}
                  {searching && (
                    <p className="text-sm text-gray-500 py-6 text-center">Buscando...</p>
                  )}
                  {searchError && (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Essa fonte não respondeu. Tente outra.
                    </p>
                  )}
                  {results && results.length === 0 && !searching && (
                    <p className="text-sm text-gray-500 py-6 text-center">
                      Nenhum resultado para “{title}”.
                    </p>
                  )}
                  {results && results.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {results.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => pick(m.coverUrl)}
                          disabled={!m.coverUrl}
                          className="text-left group cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <div className="aspect-[9/13] rounded-lg overflow-hidden bg-gray-900 border border-white/10 group-hover:border-[#7c3aed] group-hover:scale-[1.03] transition-all">
                            {m.coverUrl && (
                              <img
                                src={m.coverUrl}
                                alt={m.title}
                                loading="lazy"
                                draggable={false}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                            )}
                          </div>
                          <p className="mt-1.5 text-xs text-gray-400 group-hover:text-white line-clamp-2 leading-snug">
                            {m.title}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Restaurar capa original */}
        <div className="flex justify-end mt-4 pt-3 border-t border-white/10 shrink-0">
          {canRestore && (
            <button
              type="button"
              onClick={() => pick(originalCover)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors cursor-pointer"
            >
              <RotateCcw size={14} />
              Restaurar original
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
