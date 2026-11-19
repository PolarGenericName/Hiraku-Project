/**
 * Detalhes do mangá — capa, informações e lista de capítulos
 * (padrão Mihon MangaInfoScreen + ChapterList).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import { toast } from 'sonner';
import { Activity, ArrowLeft, BookOpen, Check, ChevronDown, CircleDashed, ListChecks, Pencil, Play, Plus, RotateCcw, X } from 'lucide-react';
import type { Chapter, MangaDetails as Details } from '../types';
import {
  addToLibrary,
  getLibrary,
  getMangaHistory,
  removeFromLibrary,
  resetChaptersProgress,
  updateLibraryEntry,
} from '../storage';
import { useMangaStore } from '../hooks';
import { getSource } from '../sources';
import TrackerPanel from '../components/TrackerPanel';
import CoverPickerDialog from '../components/CoverPickerDialog';

const STATUS_LABELS: Record<string, string> = {
  ongoing: 'Em lançamento',
  completed: 'Concluído',
  on_hiatus: 'Em hiato',
  cancelled: 'Cancelado',
  unknown: 'Desconhecido',
};

const CHAPTERS_PAGE = 100;

export default function MangaDetailsPage() {
  const [, params] = useRoute('/manga/:sourceId/:mangaId');
  const [, navigate] = useLocation();
  const sourceId = params?.sourceId ?? '';
  const mangaId = params?.mangaId ?? '';

  const source = getSource(sourceId);
  const library = useMangaStore(getLibrary);
  const libraryEntry = useMemo(
    () => library.find((e) => e.sourceId === sourceId && e.mangaId === mangaId),
    [library, sourceId, mangaId]
  );

  const [details, setDetails] = useState<Details | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllChapters, setShowAllChapters] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  /** Seleção de capítulos (estilo Windows): marcar vários → zerar de uma vez */
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Re-render dos memos de histórico após um reset */
  const [historyVersion, setHistoryVersion] = useState(0);
  /** Última linha marcada — ancora a seleção por intervalo (estilo Windows) */
  const selectAnchor = useRef<string | null>(null);
  /** Long-press para ativar a seleção num capítulo */
  const pressTimer = useRef<number | null>(null);
  const pressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!source) {
      setError('Fonte não encontrada.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetails(null);
    setChapters([]);

    Promise.all([source.getMangaDetails(mangaId), source.getChapters(mangaId)])
      .then(([mangaDetails, chapterList]) => {
        if (cancelled) return;
        if (!mangaDetails) {
          setError('Não foi possível carregar o mangá.');
          return;
        }
        setDetails(mangaDetails);
        setChapters(chapterList);

        // Total real de capítulos → alimenta o badge "restantes" da biblioteca
        if (chapterList.length > 0) {
          const entry = getLibrary().find(
            (e) => e.sourceId === sourceId && e.mangaId === mangaId,
          );
          if (entry && entry.totalChapters !== chapterList.length) {
            updateLibraryEntry(sourceId, mangaId, { totalChapters: chapterList.length });
          }
        }
      })
      .catch(() => {
        if (!cancelled) setError('Erro ao carregar o mangá. Tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, mangaId]);

  const inLibrary = !!libraryEntry;
  const lastRead = libraryEntry?.lastReadChapter ?? 0;
  // Contagem real quando a lista carregou; fallback para o valor salvo
  const chapterCount = chapters.length || libraryEntry?.totalChapters || 0;

  // Histórico de páginas por capítulo (progresso parcial = "em leitura")
  const mangaHistory = useMemo(
    () => getMangaHistory().filter((h) => h.sourceId === sourceId && h.mangaId === mangaId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceId, mangaId, chapters.length, historyVersion],
  );
  const histByChapter = useMemo(
    () => new Map(mangaHistory.map((h) => [h.chapterId, h])),
    [mangaHistory],
  );

  /** Estado do capítulo para os ícones da lista. */
  function chapterState(ch: Chapter): 'read' | 'reading' | 'unread' {
    const h = histByChapter.get(ch.id);
    const partial = !!h && h.totalPages > 0 && h.page > 0 && h.page < h.totalPages - 1;
    if (ch.number < lastRead) return 'read';
    if (ch.number === lastRead) return partial ? 'reading' : 'read';
    return partial ? 'reading' : 'unread';
  }

  // Capítulo recomendado: um progresso parcial retoma nele; senão o 1º não lido
  const continueTarget = useMemo(() => {
    const asc = [...chapters].sort((a, b) => a.number - b.number);
    const partial = mangaHistory
      .filter((h) => h.totalPages > 0 && h.page > 0 && h.page < h.totalPages - 1)
      .map((h) => ({ h, ch: chapters.find((c) => c.id === h.chapterId) }))
      .filter((entry): entry is { h: (typeof mangaHistory)[number]; ch: Chapter } => !!entry.ch)
      .sort((a, b) => b.h.readAt - a.h.readAt)[0];
    if (partial) return { chapter: partial.ch, resume: true };
    const firstUnread = asc.find((c) => c.number > lastRead) ?? asc[0] ?? null;
    return firstUnread ? { chapter: firstUnread, resume: false } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapters, lastRead, mangaHistory]);

  const visibleChapters = showAllChapters ? chapters : chapters.slice(0, CHAPTERS_PAGE);

  // ── Seleção de capítulos (estilo Windows) ────────────────────────────────
  /**
   * Marca/desmarca com seleção por intervalo: clicar em 1 e depois em 6
   * preenche 2–5 automaticamente (âncora = última linha marcada).
   */
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        selectAnchor.current = null;
        return next;
      }
      const anchor = selectAnchor.current;
      const ia = anchor ? visibleChapters.findIndex((c) => c.id === anchor) : -1;
      const ib = visibleChapters.findIndex((c) => c.id === id);
      if (ia !== -1 && ib !== -1 && ia !== ib) {
        const lo = Math.min(ia, ib);
        const hi = Math.max(ia, ib);
        for (let i = lo; i <= hi; i++) next.add(visibleChapters[i].id);
      } else {
        next.add(id);
      }
      selectAnchor.current = id;
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const all = prev.size === visibleChapters.length;
      selectAnchor.current = null;
      return all ? new Set<string>() : new Set(visibleChapters.map((c) => c.id));
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    selectAnchor.current = null;
  }

  // ── Long-press num capítulo → ativa a seleção nele ───────────────────────
  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startPress(chapter: Chapter, e: React.PointerEvent) {
    cancelPress();
    pressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressFired.current = true;
      if (!selectMode) setSelectMode(true);
      selectAnchor.current = chapter.id;
      setSelected((prev) => {
        const next = new Set(prev);
        next.add(chapter.id);
        return next;
      });
    }, 450);
  }

  function movePress(e: React.PointerEvent) {
    if (pressTimer.current === null || !pressStart.current) return;
    // cancela se o dedo/mouse andou (scroll/gesto de arraste)
    if (Math.abs(e.clientX - pressStart.current.x) > 10 || Math.abs(e.clientY - pressStart.current.y) > 10) {
      cancelPress();
    }
  }

  /** Zera os capítulos selecionados de uma vez. */
  function resetSelected() {
    const ids = [...selected];
    if (!ids.length) return;
    resetChaptersProgress(sourceId, mangaId, ids);
    setHistoryVersion((v) => v + 1);
    setSelected(new Set());
    setSelectMode(false);
    selectAnchor.current = null;
    toast(
      ids.length === 1 ? 'Leitura do capítulo zerada' : `Leitura de ${ids.length} capítulos zerada`,
      { duration: 3500 },
    );
  }

  function toggleLibrary() {
    if (!details) return;
    if (inLibrary) {
      removeFromLibrary(sourceId, mangaId);
    } else {
      addToLibrary({
        sourceId,
        mangaId,
        title: details.title,
        coverUrl: details.coverUrl,
      });
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex gap-6 animate-pulse">
          <div className="w-48 h-72 rounded-xl bg-white/5 shrink-0" />
          <div className="flex-1 space-y-4 pt-4">
            <div className="h-8 w-2/3 rounded bg-white/5" />
            <div className="h-4 w-1/3 rounded bg-white/5" />
            <div className="space-y-2">
              <div className="h-3 w-full rounded bg-white/5" />
              <div className="h-3 w-5/6 rounded bg-white/5" />
              <div className="h-3 w-4/6 rounded bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="text-gray-400 mb-6">{error ?? 'Mangá não encontrado.'}</p>
        <Link
          href="/manga/browse"
          className="px-6 py-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium transition-colors"
        >
          Voltar a Navegar
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link
        href="/manga"
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors mb-5"
      >
        <ArrowLeft size={16} />
        Biblioteca
      </Link>

      {/* ── Cabeçalho ──────────────────────────────────────────── */}
      <div className="flex gap-6 mb-8 flex-wrap sm:flex-nowrap">
        <div className="relative w-44 h-64 sm:w-48 sm:h-72 shrink-0">
          <div className="w-full h-full rounded-xl overflow-hidden bg-gray-900 shadow-[0_20px_40px_rgba(124,58,237,0.2)]">
            {(libraryEntry?.coverUrl || details.coverUrl) && (
              <img
                src={libraryEntry?.coverUrl || details.coverUrl}
                alt={details.title}
                draggable={false}
                onDragStart={(e) => e.preventDefault()}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
          </div>
          {inLibrary && (
            <button
              type="button"
              title="Trocar capa"
              onClick={() => setCoverPickerOpen(true)}
              className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 backdrop-blur-sm text-gray-300 hover:text-white hover:bg-black/80 transition-colors cursor-pointer"
            >
              <Pencil size={14} />
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight">
            {details.title}
          </h1>

          <div className="flex items-center gap-2 mt-2 text-sm text-gray-400 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                details.status === 'ongoing'
                  ? 'bg-green-500/15 text-green-400'
                  : details.status === 'completed'
                    ? 'bg-blue-500/15 text-blue-400'
                    : 'bg-white/10 text-gray-300'
              }`}
            >
              {STATUS_LABELS[details.status ?? 'unknown']}
            </span>
            {details.year && <span>• {details.year}</span>}
            {source && (
              <>
                <span>•</span>
                <span>{source.name}</span>
              </>
            )}
            {chapterCount > 0 && (
              <>
                <span>•</span>
                <span>{chapterCount} capítulos</span>
              </>
            )}
          </div>

          {(details.authors?.length || details.artists?.length) && (
            <p className="text-sm text-gray-500 mt-2">
              {[...(details.authors ?? []), ...(details.artists ?? [])].join(', ')}
            </p>
          )}

          {details.genres && details.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {details.genres.slice(0, 8).map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => navigate(`/manga/browse?genre=${encodeURIComponent(genre)}`)}
                  title={`Buscar mangás do gênero ${genre}`}
                  className="px-2 py-0.5 rounded-md bg-white/5 text-xs text-gray-400 hover:bg-[#7c3aed]/25 hover:text-white hover:border-[#7c3aed]/50 border border-transparent transition-all duration-300 cursor-pointer"
                >
                  {genre}
                </button>
              ))}
            </div>
          )}

          {/* Ações */}
          <div className="flex items-center gap-2 mt-5 flex-wrap">
            <button
              type="button"
              onClick={toggleLibrary}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-transparent transition-all duration-300 ${
                inLibrary
                  ? 'bg-white/5 text-gray-200 hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50 hover:text-white'
                  : 'bg-[#7c3aed] hover:bg-[#6d28d9] hover:border-[#7c3aed]/60 text-white'
              }`}
            >
              {inLibrary ? <Check size={16} /> : <Plus size={16} />}
              {inLibrary ? 'Na biblioteca' : 'Adicionar à biblioteca'}
            </button>

            {continueTarget && (
              <Link
                href={`/manga/read/${sourceId}/${mangaId}/${continueTarget.chapter.id}`}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-200 border border-transparent transition-all duration-300 hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50 hover:text-white"
              >
                <Play size={16} />
                {lastRead > 0 ? 'Continuar leitura' : 'Iniciar leitura'}
              </Link>
            )}

            <button
              type="button"
              onClick={() => setTrackerOpen(true)}
              title="Monitoramento de leitura (trackers)"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-gray-300 border border-transparent transition-all duration-300 hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50 hover:text-white cursor-pointer"
            >
              <Activity size={16} />
              Monitoramento
            </button>
          </div>

          {inLibrary && lastRead > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              Último capítulo lido: {Number.isInteger(lastRead) ? lastRead : lastRead.toFixed(2)}
            </p>
          )}

          {/* Descrição */}
          {details.description && (
            <div className="mt-4">
              <p
                className={`text-sm text-gray-400 leading-relaxed ${
                  descriptionExpanded ? '' : 'line-clamp-4'
                }`}
              >
                {details.description}
              </p>
              <button
                type="button"
                onClick={() => setDescriptionExpanded((v) => !v)}
                className="flex items-center gap-1 text-xs text-[#7c3aed] hover:text-[#9061f9] mt-1"
              >
                <ChevronDown
                  size={14}
                  className={`transition-transform ${descriptionExpanded ? 'rotate-180' : ''}`}
                />
                {descriptionExpanded ? 'Mostrar menos' : 'Mostrar mais'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Capítulos ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <BookOpen size={18} className="text-[#7c3aed]" />
          Capítulos
          <span className="text-sm font-normal text-gray-500">({chapters.length})</span>
        </h2>

        {chapters.length > 0 && (
          <div className="flex items-center gap-2">
            {selectMode && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                {selected.size === visibleChapters.length ? 'Desmarcar todos' : 'Todos'}
              </button>
            )}
            <button
              type="button"
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectMode
                  ? 'bg-[#7c3aed] text-white'
                  : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <ListChecks size={14} />
              {selectMode ? 'Cancelar' : 'Selecionar'}
            </button>
          </div>
        )}
      </div>

      {chapters.length === 0 ? (
        <p className="text-gray-500 py-10 text-center">Nenhum capítulo disponível.</p>
      ) : (
        <>
          <div className="space-y-1.5">
            {visibleChapters.map((chapter) => {
              const state = chapterState(chapter);
              const read = state === 'read';
              const reading = state === 'reading';
              const isSelected = selected.has(chapter.id);
              return (
                <Link
                  key={chapter.id}
                  href={`/manga/read/${sourceId}/${mangaId}/${chapter.id}`}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  onPointerDown={(e) => startPress(chapter, e)}
                  onPointerMove={movePress}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onPointerCancel={cancelPress}
                  onClick={(e) => {
                    // o long-press já tratou — não navega
                    if (pressFired.current) {
                      e.preventDefault();
                      pressFired.current = false;
                      return;
                    }
                    if (selectMode) {
                      e.preventDefault();
                      toggleSelect(chapter.id);
                    }
                  }}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-colors group ${
                    selectMode ? 'cursor-pointer' : ''
                  } ${
                    isSelected
                      ? 'bg-[#7c3aed]/15 ring-1 ring-[#7c3aed]/60'
                      : read
                        ? 'hover:bg-white/5'
                        : 'bg-white/[0.03] hover:bg-white/[0.07]'
                  }`}
                >
                  {selectMode ? (
                    <span
                      className={`w-4 h-4 rounded shrink-0 border-2 flex items-center justify-center ${
                        isSelected ? 'bg-[#7c3aed] border-[#7c3aed]' : 'border-gray-600'
                      }`}
                    >
                      {isSelected && <Check size={11} strokeWidth={3} className="text-white" />}
                    </span>
                  ) : (
                    <span
                      className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        read ? 'bg-transparent' : 'bg-[#7c3aed]'
                      }`}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm truncate ${read ? 'text-gray-500' : 'text-white'}`}>
                      <span className={read ? '' : 'font-medium'}>
                        Cap. {Number.isInteger(chapter.number) ? chapter.number : chapter.number.toFixed(2)}
                      </span>
                      {chapter.title && (
                        <span className="text-gray-500"> · {chapter.title}</span>
                      )}
                    </p>
                  </div>
                  {chapter.language !== 'pt-br' && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-white/5 text-gray-500 shrink-0">
                      {chapter.language}
                    </span>
                  )}
                  {chapter.uploadedAt && (
                    <span className="text-xs text-gray-600 shrink-0 hidden sm:block">
                      {new Date(chapter.uploadedAt).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                  {reading ? (
                    <CircleDashed size={15} className="text-[#7c3aed] shrink-0" />
                  ) : (
                    <Check
                      size={15}
                      className={`shrink-0 ${read ? 'text-green-500' : 'text-transparent'}`}
                    />
                  )}
                </Link>
              );
            })}
          </div>

          {chapters.length > CHAPTERS_PAGE && !showAllChapters && (
            <div className="flex justify-center mt-5">
              <button
                type="button"
                onClick={() => setShowAllChapters(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-sm text-gray-300 transition-colors"
              >
                <ChevronDown size={16} />
                Mostrar todos ({chapters.length})
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Monitoramento (trackers) ─────────────────────────────── */}
      {trackerOpen && (
        <TrackerPanel
          open
          onClose={() => setTrackerOpen(false)}
          sourceId={sourceId}
          mangaId={mangaId}
          title={details.title}
          lastRead={lastRead}
        />
      )}

      {/* ── Trocar capa ──────────────────────────────────────────── */}
      {coverPickerOpen && (
        <CoverPickerDialog
          sourceId={sourceId}
          mangaId={mangaId}
          title={details.title}
          currentCover={libraryEntry?.coverUrl || details.coverUrl}
          onClose={() => setCoverPickerOpen(false)}
        />
      )}

      {/* ── Barra de ações da seleção ───────────────────────────── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[125] flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#0d0d12] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-150">
          <span className="text-sm text-gray-300 whitespace-nowrap">
            <strong className="text-white font-semibold">{selected.size}</strong>{' '}
            {selected.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <button
            type="button"
            onClick={resetSelected}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
            Zerar leitura
          </button>
          <button
            type="button"
            onClick={exitSelect}
            title="Cancelar seleção"
            className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
