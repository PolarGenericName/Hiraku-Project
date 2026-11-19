/**
 * Leitor de mangá — tela cheia, como o reader do Mihon.
 * Modos: Webtoon (rolagem contínua), Página → (LTR) e ← Página (RTL).
 * Salva progresso no histórico e marca o capítulo como lido.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useRoute } from 'wouter';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  HelpCircle,
  List,
  Maximize,
  Minimize,
  MoveLeft,
  MoveRight,
  RotateCcw,
  Rows3,
  Settings,
} from 'lucide-react';
import { getSource } from '../sources';
import LoadingAnimation from '../../shared/components/LoadingAnimation';
import type { Chapter, MangaDetails, MangaPage } from '../types';
import {
  addReadingSeconds,
  addToHistory,
  getLibrary,
  getMangaHistory,
  getReaderSettings,
  saveReaderSettings,
  updateLibraryEntry,
  type ReadingMode,
} from '../storage';

/** Direção de navegação ao chegar ao fim/começo de um capítulo */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
const MODE_LABELS: Record<ReadingMode, string> = {
  webtoon: 'Webtoon',
  ltr: 'Página →',
  rtl: '← Página',
};

/** Espaçamento (vão preto) entre as páginas no arraste — a próxima
 *  parte do outro canto da tela e centraliza quando a atual some. */
const SPREAD_VW = '40vw';

/** Ícone de cada modo de leitura (barra lateral + painel de modos). */
const MODE_ICONS: Record<ReadingMode, typeof Rows3> = {
  webtoon: Rows3, // faixas empilhadas = rolagem contínua
  ltr: MoveRight, // lê avançando para a direita
  rtl: MoveLeft, // lê avançando para a esquerda
};

function RailButton({
  icon: Icon,
  title,
  active,
  onClick,
}: {
  icon: typeof Rows3;
  title: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
        active ? 'bg-[#7c3aed] text-white' : 'text-gray-300 hover:text-white hover:bg-white/10'
      }`}
    >
      <Icon size={18} />
    </button>
  );
}

/**
 * Ponto de partida definido ao navegar para um capítulo vizinho
 * (ex.: voltar abre na última página). Variável de módulo porque o
 * componente é remontado a cada troca de capítulo.
 */
let pendingStartPage: number | null = null;

/**
 * /api/ext/image?url=<encoded> → URL original do CDN. O Discord bloqueia
 * assets de 127.0.0.1 (renderiza ícone de interrogação), e os CDNs de
 * mangá servem as imagens sem checagem de hotlink.
 */
function originalCoverUrl(cover?: string): string | null {
  if (!cover) return null;
  if (cover.startsWith('http')) return cover;
  const match = /^\/api\/ext\/image\?url=(.+)$/.exec(cover);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function MangaReader() {
  const [, params] = useRoute('/manga/read/:sourceId/:mangaId/:chapterId');
  const [, navigate] = useLocation();
  const sourceId = params?.sourceId ?? '';
  const mangaId = params?.mangaId ?? '';
  const chapterId = params?.chapterId ?? '';
  const source = getSource(sourceId);

  const initialSettings = useRef(getReaderSettings()).current;
  const [mode, setMode] = useState<ReadingMode>(initialSettings.mode);
  const [showProgressBar, setShowProgressBar] = useState(initialSettings.showProgressBar);
  const [showPageControls, setShowPageControls] = useState(initialSettings.showPageControls);
  /** Painel flutuante da barra lateral */
  const [panel, setPanel] = useState<'chapters' | 'settings' | 'help' | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Zoom do leitor (Ctrl+scroll) — 0.5 a 3 */
  const [zoom, setZoom] = useState(1);
  /** Indicador flutuante de zoom (aparece na ação, some sozinho) */
  const [zoomVisible, setZoomVisible] = useState(false);
  const zoomHideTimer = useRef<number | null>(null);
  /** Arraste ativo no modo paged (renderiza as páginas vizinhas do spread) */
  const [dragging, setDragging] = useState(false);
  /** Proporção (larg/alt) da última página carregada — reserva o espaço da
   *  próxima para não "nascer pequena e expandir" no load */
  const pageRatio = useRef<number | null>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [details, setDetails] = useState<MangaDetails | null>(null);
  const [pages, setPages] = useState<MangaPage[]>([]);
  const [index, setIndex] = useState(0);
  const [resumeIndex, setResumeIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);

  const detailsRef = useRef<MangaDetails | null>(null);
  detailsRef.current = details;
  const chapterRef = useRef<Chapter | null>(null);
  chapterRef.current = chapter;

  const detailsHref = `/manga/${sourceId}/${mangaId}`;

  // ── Carregamento do capítulo ──────────────────────────────────────────────
  useEffect(() => {
    if (!source) {
      setError(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setPages([]);
    setIndex(0);
    setZoom(1);
    zoomRef.current = 1;
    setDragging(false);
    setResumeIndex(null);
    pageRefs.current = [];

    (async () => {
      try {
        const [pageList, chapterList, mangaDetails, chapterInfo] = await Promise.all([
          source.getPages(chapterId),
          source.getChapters(mangaId),
          source.getMangaDetails(mangaId),
          source.getChapter?.(chapterId) ?? Promise.resolve(null),
        ]);
        if (cancelled) return;

        if (pageList.length === 0) {
          setError(true);
          setLoading(false);
          return;
        }

        // O capítulo pode não estar na lista deduplicada (ex.: versão em
        // outro idioma) — resolve direto pela API e cai para a lista
        const current = chapterInfo ?? chapterList.find((c) => c.id === chapterId) ?? null;
        const libraryEntry = getLibrary().find(
          (e) => e.sourceId === sourceId && e.mangaId === mangaId
        );

        // Ponto de partida: navegação explícita > histórico > início
        let startPage = 0;
        if (pendingStartPage !== null) {
          startPage = Math.min(Math.max(pendingStartPage, 0), pageList.length - 1);
          pendingStartPage = null;
        } else {
          const historyEntry = getMangaHistory().find((h) => h.chapterId === chapterId);
          if (historyEntry && historyEntry.totalPages === pageList.length) {
            startPage = Math.min(Math.max(historyEntry.page, 0), pageList.length - 1);
          }
        }

        setChapters(chapterList);
        setChapter(current);
        setDetails(mangaDetails);
        setPages(pageList);
        setIndex(startPage);
        if (startPage > 0) setResumeIndex(startPage);

        // Marca como lido e registra no histórico
        if (current) {
          if (libraryEntry && current.number > libraryEntry.lastReadChapter) {
            updateLibraryEntry(sourceId, mangaId, {
              lastReadChapter: current.number,
              totalChapters: Math.max(
                Math.round(current.number),
                libraryEntry.totalChapters
              ),
            });
          }
          addToHistory({
            sourceId,
            mangaId,
            chapterId,
            title: mangaDetails?.title ?? libraryEntry?.title ?? 'Mangá',
            coverUrl: mangaDetails?.coverUrl ?? libraryEntry?.coverUrl,
            chapterNumber: current.number,
            page: startPage,
            totalPages: pageList.length,
          });
        }

        setLoading(false);
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sourceId, mangaId, chapterId, source, reloadKey]);

  // ── Discord Rich Presence (mostra a leitura no perfil) ────────────────────
  useEffect(() => {
    if (!details || !chapter) return;
    const title = details.title || 'Mangá';
    const num = Number.isInteger(chapter.number)
      ? String(chapter.number)
      : chapter.number.toFixed(2);
    const capLabel = chapter.title || `Cap. ${num}`;
    // O Discord não baixa assets de 127.0.0.1 (ícone de interrogação) —
    // manda a URL original do CDN (servida sem checagem de hotlink).
    const cover = originalCoverUrl(details.coverUrl) || 'hiraku';
    window.electronAPI?.setActivity({
      details: title.slice(0, 128),
      state: `Lendo ${capLabel}`.slice(0, 128),
      largeImageKey: cover,
      largeImageText: source ? `${title} • ${source.name}` : title,
      smallImageKey: 'hiraku',
      smallImageText: 'Hiraku',
      startTimestamp: Date.now(),
      type: 0,
    });
    return () => {
      window.electronAPI?.clearActivity();
    };
  }, [details, chapter, source]);

  // ── Bloqueia o scroll da página atrás do leitor ───────────────────────────
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // ── Tempo de leitura (estatísticas da tela "Mais") ────────────────────────
  // Acumula enquanto o leitor está montado e a aba visível; persiste a cada
  // 15s e no desmontar (trocar de capítulo remonta o leitor → faz flush).
  useEffect(() => {
    let last = Date.now();
    const flush = () => {
      const now = Date.now();
      if (document.visibilityState === 'visible') {
        addReadingSeconds((now - last) / 1000);
      }
      last = now;
    };
    const iv = window.setInterval(flush, 15000);
    const onVisibility = () => flush();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  // ── Salva o progresso (debounce) ──────────────────────────────────────────
  useEffect(() => {
    if (loading || !pages.length || !chapter) return;
    const timer = window.setTimeout(() => {
      addToHistory({
        sourceId,
        mangaId,
        chapterId,
        title: detailsRef.current?.title ?? 'Mangá',
        coverUrl: detailsRef.current?.coverUrl,
        chapterNumber: chapter.number,
        page: index,
        totalPages: pages.length,
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [index, loading, pages.length, chapter, sourceId, mangaId, chapterId]);

  // ── Capítulos vizinhos (ordem de leitura: ascendente) ─────────────────────
  const ascendingChapters = useMemo(
    () => [...chapters].sort((a, b) => a.number - b.number),
    [chapters]
  );

  function adjacentChapter(direction: 'forward' | 'back'): Chapter | null {
    if (!chapter) return null;
    let i = ascendingChapters.findIndex((c) => c.id === chapter.id);
    // Fallback: o capítulo pode ter sido deduplicado da lista por número
    if (i === -1) i = ascendingChapters.findIndex((c) => c.number === chapter.number);
    if (i === -1) return null;
    const j = direction === 'forward' ? i + 1 : i - 1;
    return j >= 0 && j < ascendingChapters.length ? ascendingChapters[j] : null;
  }

  function goToChapter(next: Chapter | null, startPage: number | null = null) {
    if (!next) return;
    pendingStartPage = startPage;
    navigate(`/manga/read/${sourceId}/${mangaId}/${next.id}`);
  }

  // ── Navegação de páginas (modo paged) ─────────────────────────────────────
  function goPage(delta: number) {
    if (!pages.length) return;
    const next = index + delta;
    if (next < 0) {
      goToChapter(adjacentChapter('back'), pages.length - 1);
    } else if (next >= pages.length) {
      goToChapter(adjacentChapter('forward'), 0);
    } else {
      setIndex(next);
    }
  }

  // Pré-carrega a página vizinha (modo paged)
  useEffect(() => {
    if (mode === 'webtoon' || !pages.length) return;
    for (const i of [index + 1, index - 1]) {
      if (pages[i]) {
        const img = new Image();
        img.src = pages[i].imageUrl;
      }
    }
  }, [index, mode, pages]);

  // ── Webtoon: derivar página atual pela rolagem ────────────────────────────
  function handleScroll() {
    if (mode !== 'webtoon' || !pages.length) return;
    const el = scrollRef.current;
    if (!el) return;
    const range = el.scrollHeight - el.clientHeight;
    const ratio = range <= 0 ? 0 : el.scrollTop / range;
    const next = Math.min(
      pages.length - 1,
      Math.max(0, Math.round(ratio * (pages.length - 1)))
    );
    setIndex((prev) => (prev === next ? prev : next));
  }

  // ── Webtoon: rola até a página retomada quando a imagem carrega ──────────
  function handlePageImageLoad(i: number) {
    if (resumeIndex !== i) return;
    setResumeIndex(null);
    requestAnimationFrame(() => {
      pageRefs.current[i]?.scrollIntoView({ block: 'start' });
    });
  }

  // ── Tela cheia ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // ── Zoom com Ctrl+Scroll ──────────────────────────────────────────────────
  const zoomRef = useRef(1);

  /** Mostra o indicador flutuante de zoom (some sozinho em 1.8s). */
  function showZoomIndicator() {
    setZoomVisible(true);
    if (zoomHideTimer.current) window.clearTimeout(zoomHideTimer.current);
    zoomHideTimer.current = window.setTimeout(() => setZoomVisible(false), 1800);
  }

  /** Aplica o zoom (0.5 a 3, passos de 0.1) e mostra o indicador. */
  function applyZoom(next: number) {
    const z = Math.min(3, Math.max(0.5, Math.round(next * 10) / 10));
    zoomRef.current = z;
    setZoom(z);
    showZoomIndicator();
  }

  useEffect(() => {
    function onWheel(e: WheelEvent) {
      if (!e.ctrlKey) return;
      // não deixa o Ctrl+scroll dar zoom na janela do app
      e.preventDefault();
      const step = e.deltaY < 0 ? 0.1 : -0.1;
      const z = Math.min(3, Math.max(0.5, Math.round((zoomRef.current + step) * 10) / 10));
      zoomRef.current = z;
      setZoom(z);
      showZoomIndicator();
    }
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (zoomHideTimer.current) window.clearTimeout(zoomHideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined);
    } else {
      document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }

  function togglePanel(next: typeof panel) {
    setPanel((current) => (current === next ? null : next));
  }

  // ── Teclado ───────────────────────────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (panel) setPanel(null);
        else navigate(detailsHref);
        return;
      }
      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
        return;
      }
      if (mode === 'webtoon') return;

      const forwardKey = mode === 'ltr' ? 'ArrowRight' : 'ArrowLeft';
      const backKey = mode === 'ltr' ? 'ArrowLeft' : 'ArrowRight';
      if (e.key === forwardKey) {
        e.preventDefault();
        goPage(1);
      } else if (e.key === backKey) {
        e.preventDefault();
        goPage(-1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, index, pages.length, chapter, chapters, chapterId, panel]);

  function changeMode(next: ReadingMode) {
    setMode(next);
    setPanel(null);
    saveReaderSettings({ ...getReaderSettings(), mode: next });
  }

  /** Cicla os modos no clique do botão da barra (o ícone mostra o atual). */
  function cycleMode() {
    const order: ReadingMode[] = ['webtoon', 'ltr', 'rtl'];
    const next = order[(order.indexOf(mode) + 1) % order.length];
    changeMode(next);
  }

  // ── Arraste da página (modo paged) ────────────────────────────────────────
  // O movimento é aplicado DIRETO no DOM (el.style.transform) — sem
  // re-render a cada pixel, o arraste fica fluido.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; dx: number } | null>(null);
  const dragEndTimer = useRef<number | null>(null);

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    if (!pages[index]) return;
    if (dragEndTimer.current) {
      window.clearTimeout(dragEndTimer.current);
      dragEndTimer.current = null;
    }
    dragRef.current = { startX: e.clientX, dx: 0 };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    const el = wrapperRef.current;
    if (el) {
      el.style.transition = 'none';
      el.style.transform = `translateX(0px) scale(${zoomRef.current})`;
    }
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = wrapperRef.current;
    if (!drag || !el) return;
    drag.dx = e.clientX - drag.startX;
    // sem setState = fluido; o scale acompanha (o React só re-renderiza fora do drag)
    el.style.transform = `translateX(${drag.dx}px) scale(${zoomRef.current})`;
  }

  function scheduleDragEnd(fn: () => void, delay: number) {
    dragEndTimer.current = window.setTimeout(() => {
      dragEndTimer.current = null;
      fn();
    }, delay);
  }

  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    const el = wrapperRef.current;
    dragRef.current = null;
    if (!drag || !el) return;

    const dx = drag.dx;

    if (Math.abs(dx) > 60) {
      // completa o movimento: a atual sai pela borda e a vizinha,
      // que partiu do outro canto, assume o centro
      const forward = mode === 'ltr' ? dx < 0 : dx > 0;
      const travel = el.offsetWidth + window.innerWidth * 0.4;
      const duration = Math.min(420, 180 + (travel / Math.max(el.offsetWidth, 1)) * 140);
      el.style.transition = `transform ${duration}ms ease-out`;
      el.style.transform = `translateX(${dx < 0 ? -travel : travel}px) scale(${zoomRef.current})`;
      scheduleDragEnd(() => {
        el.style.transition = 'none';
        el.style.transform = `translateX(0px) scale(${zoomRef.current})`;
        setDragging(false);
        goPage(forward ? 1 : -1);
      }, duration);
      return;
    }

    if (Math.abs(dx) < 6) {
      // clique simples sem arraste: metade da tela
      setDragging(false);
      const leftHalf = e.clientX < window.innerWidth / 2;
      const forward = mode === 'ltr' ? !leftHalf : leftHalf;
      goPage(forward ? 1 : -1);
      return;
    }

    // não passou do limiar: volta suave para o lugar
    el.style.transition = 'transform 0.2s ease';
    el.style.transform = `translateX(0px) scale(${zoomRef.current})`;
    scheduleDragEnd(() => setDragging(false), 210);
  }

  function cancelDrag() {
    const el = wrapperRef.current;
    dragRef.current = null;
    if (el) {
      el.style.transition = 'transform 0.2s ease';
      el.style.transform = `translateX(0px) scale(${zoomRef.current})`;
    }
    scheduleDragEnd(() => setDragging(false), 210);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const chapterLabel = chapter
    ? `Cap. ${Number.isInteger(chapter.number) ? chapter.number : chapter.number.toFixed(2)}`
    : 'Capítulo';
  const nextChapter = adjacentChapter('forward');
  const prevChapter = adjacentChapter('back');
  // Último capítulo lido (para o ✓ do painel de capítulos)
  const libraryLastRead =
    getLibrary().find((e) => e.sourceId === sourceId && e.mangaId === mangaId)?.lastReadChapter ??
    0;

  // ── Progressão (topo): posição do capítulo + página ──────────────────────
  const chapterPos = useMemo(() => {
    if (!chapters.length || !chapter) return null;
    const asc = [...chapters].sort((a, b) => a.number - b.number);
    const i = asc.findIndex((c) => c.id === chapter.id);
    return i >= 0 ? { pos: i + 1, total: asc.length } : null;
  }, [chapters, chapter]);

  // Histórico por capítulo (✓ lido / ◔ em leitura + retomada de página)
  const histByChapter = useMemo(() => {
    const map = new Map<string, { page: number; totalPages: number }>();
    for (const h of getMangaHistory()) {
      if (h.sourceId !== sourceId || h.mangaId !== mangaId) continue;
      map.set(h.chapterId, { page: h.page, totalPages: h.totalPages });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId, mangaId, chapters.length]);

  /** Página salva do capítulo (retomar exato onde parou). */
  function resumePage(id: string): number {
    const h = histByChapter.get(id);
    if (h && h.totalPages > 0 && h.page > 0) return h.page;
    return 0;
  }

  return (
    // No Electron o reader começa abaixo da TitleBar (h-8) — senão os
    // botões do topo ficam cortados por ela (z-[400] > z-[90])
    <div
      className={`fixed left-0 right-0 bottom-0 ${isElectron ? 'top-8' : 'top-0'} z-[90] bg-black flex flex-col select-none`}
    >
      {/* ── Barra superior ──────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-30 bg-gradient-to-b from-black/95 via-black/70 to-transparent px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(detailsHref)}
          title="Voltar (Esc)"
          className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        <div className="min-w-0 flex-1">
          <p className="text-sm text-white font-medium truncate">
            {details?.title ?? 'Carregando...'}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {chapterLabel}
            {chapterPos && (
              <span className="text-gray-500">
                {' '}
                · {chapterPos.pos}/{chapterPos.total}
              </span>
            )}
            {pages.length > 0 && (
              <span> · página {index + 1}/{pages.length}</span>
            )}
          </p>
        </div>
      </div>

      {/* ── Conteúdo ────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5">
          <LoadingAnimation />
          <p className="text-sm text-gray-500">Carregando páginas...</p>
        </div>
      ) : error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-gray-400">Não foi possível carregar as páginas deste capítulo.</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
            >
              <RotateCcw size={16} />
              Tentar novamente
            </button>
            <Link
              href={detailsHref}
              className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-sm transition-colors"
            >
              Voltar ao mangá
            </Link>
          </div>
        </div>
      ) : mode === 'webtoon' ? (
        /* ── Webtoon: rolagem contínua ─────────────────────────── */
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto overscroll-contain reader-scroll"
          style={{ zoom }}
        >
          <div className="max-w-3xl mx-auto space-y-4">
            {pages.map((page, i) => (
              <div
                key={page.index}
                ref={(el) => {
                  pageRefs.current[i] = el;
                }}
                className="w-full"
              >
                <img
                  src={page.imageUrl}
                  alt={`Página ${i + 1}`}
                  loading={i < 3 || resumeIndex === i ? 'eager' : 'lazy'}
                  draggable={false}
                  className="w-full h-auto block"
                  onLoad={() => handlePageImageLoad(i)}
                  onError={() => {
                    if (resumeIndex === i) setResumeIndex(null);
                  }}
                />
              </div>
            ))}

            {/* Fim do capítulo */}
            <div className="flex flex-col items-center gap-3 py-12 px-6">
              {nextChapter ? (
                <button
                  type="button"
                  onClick={() => goToChapter(nextChapter, 0)}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white text-sm font-medium transition-colors"
                >
                  Próximo capítulo: Cap.{' '}
                  {Number.isInteger(nextChapter.number)
                    ? nextChapter.number
                    : nextChapter.number.toFixed(2)}
                  <ChevronRight size={16} />
                </button>
              ) : (
                <p className="text-sm text-gray-500">Você chegou ao fim disponível.</p>
              )}
              <Link
                href={detailsHref}
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Voltar ao mangá
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* ── Paged: uma página por vez (arraste para virar) ─────── */
        <div
          className="flex-1 relative overflow-hidden touch-none select-none"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={cancelDrag}
        >
          <div className="absolute inset-0 flex items-center justify-center px-4 pt-16 pb-14">
            {pages[index] && (
              <div
                ref={wrapperRef}
                className={`relative flex items-center h-full max-w-full ${
                  dragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
                style={{ transform: `scale(${zoom})` }}
              >
                <img
                  key={pages[index].index}
                  src={pages[index].imageUrl}
                  alt={`Página ${index + 1}`}
                  draggable={false}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                      pageRatio.current = img.naturalWidth / img.naturalHeight;
                    }
                  }}
                  style={pageRatio.current ? { aspectRatio: String(pageRatio.current) } : undefined}
                  className="h-full max-w-full object-contain shadow-[0_0_60px_rgba(0,0,0,0.8)]"
                />
                {/* Vizinhas: partem do outro canto da tela (vão preto de
                    40vw) e centralizam quando a atual sai */}
                {dragging && pages[index - 1] && (
                  <img
                    src={pages[index - 1].imageUrl}
                    alt={`Página ${index}`}
                    draggable={false}
                    loading="lazy"
                    className="absolute top-0 h-full max-w-full object-contain"
                    style={{
                      right: `calc(100% + ${SPREAD_VW})`,
                      ...(pageRatio.current ? { aspectRatio: String(pageRatio.current) } : {}),
                    }}
                  />
                )}
                {dragging && pages[index + 1] && (
                  <img
                    src={pages[index + 1].imageUrl}
                    alt={`Página ${index + 2}`}
                    draggable={false}
                    loading="lazy"
                    className="absolute top-0 h-full max-w-full object-contain"
                    style={{
                      left: `calc(100% + ${SPREAD_VW})`,
                      ...(pageRatio.current ? { aspectRatio: String(pageRatio.current) } : {}),
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Controles inferiores (opcionais — menu de configurações) */}
          {showPageControls && (
            <div className="absolute bottom-0 inset-x-0 z-20 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent">
            <button
              type="button"
              disabled={!prevChapter}
              onClick={() => goToChapter(prevChapter, pages.length - 1)}
              title="Capítulo anterior"
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft size={18} />
            </button>

            <button
              type="button"
              onClick={() => goPage(-1)}
              title="Página anterior"
              className="px-3 py-1.5 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              ‹ Anterior
            </button>

            <span className="text-xs text-gray-400 tabular-nums min-w-[70px] text-center">
              {index + 1} / {pages.length}
            </span>

            <button
              type="button"
              onClick={() => goPage(1)}
              title="Próxima página"
              className="px-3 py-1.5 rounded-lg text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            >
              Próxima ›
            </button>

            <button
              type="button"
              disabled={!nextChapter}
              onClick={() => goToChapter(nextChapter, 0)}
              title="Próximo capítulo"
              className="p-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight size={18} />
            </button>
            </div>
          )}
        </div>
      )}

      {/* ── Barra lateral flutuante de controles ─────────────────── */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 z-40 flex flex-col gap-1 p-1.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 shadow-2xl">
        <RailButton
          icon={ArrowLeft}
          title="Voltar ao mangá (Esc)"
          onClick={() => navigate(detailsHref)}
        />
        <RailButton
          icon={MODE_ICONS[mode]}
          title={`Modo: ${MODE_LABELS[mode]} (clique para trocar)`}
          onClick={cycleMode}
        />
        <RailButton
          icon={List}
          title="Capítulos"
          active={panel === 'chapters'}
          onClick={() => togglePanel('chapters')}
        />
        <RailButton
          icon={Settings}
          title="Configurações"
          active={panel === 'settings'}
          onClick={() => togglePanel('settings')}
        />
        <RailButton
          icon={isFullscreen ? Minimize : Maximize}
          title={isFullscreen ? 'Sair da tela cheia (F)' : 'Tela cheia (F)'}
          onClick={toggleFullscreen}
        />
        <RailButton
          icon={HelpCircle}
          title="Atalhos"
          active={panel === 'help'}
          onClick={() => togglePanel('help')}
        />
      </div>

      {/* Overlap: fecha o painel ao clicar fora */}
      {panel && <div className="fixed inset-0 z-30" onClick={() => setPanel(null)} />}

      {/* ── Painel: índice de capítulos ───────────────────────────── */}
      {panel === 'chapters' && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2 z-40 w-64 max-h-[70vh] overflow-y-auto reader-scroll rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl py-2">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Capítulos · {chapters.length}
          </p>
          {chapters.map((ch) => {
            const num = Number.isInteger(ch.number) ? ch.number : ch.number.toFixed(2);
            const isCurrent = ch.id === chapterId;
            const progress = histByChapter.get(ch.id);
            const isReading =
              !!progress &&
              progress.totalPages > 0 &&
              progress.page > 0 &&
              progress.page < progress.totalPages - 1;
            const isRead = !isReading && libraryLastRead > 0 && ch.number <= libraryLastRead;
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  // retoma na página salva (ou 0 se nunca leu)
                  goToChapter(ch, resumePage(ch.id));
                  setPanel(null);
                }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer ${
                  isCurrent
                    ? 'text-[#7c3aed] bg-[#7c3aed]/10'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {ch.title && ch.title !== `Capítulo ${num}` ? ch.title : `Capítulo ${num}`}
                  </span>
                  <span className="flex items-center gap-1.5 shrink-0">
                    {isReading && progress && (
                      <span className="text-[10px] text-[#7c3aed] tabular-nums">
                        {progress.page + 1}/{progress.totalPages}
                      </span>
                    )}
                    {isReading ? (
                      <CircleDashed size={13} className="text-[#7c3aed]" />
                    ) : (
                      isRead && <Check size={13} className="text-[#7c3aed]" />
                    )}
                  </span>
                </span>
                {ch.scanlator && (
                  <span className="text-[11px] text-gray-500">{ch.scanlator}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Painel: configurações ─────────────────────────────────── */}
      {panel === 'settings' && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2 z-40 w-56 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl p-2">
          <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Leitura
          </p>
          <label className="flex items-center justify-between gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
            <span className="text-sm text-gray-300">Barra de progresso</span>
            <input
              type="checkbox"
              checked={showProgressBar}
              onChange={(e) => {
                const next = e.target.checked;
                setShowProgressBar(next);
                saveReaderSettings({ ...getReaderSettings(), showProgressBar: next });
              }}
              className="accent-[#7c3aed] w-4 h-4"
            />
          </label>
          <label className="flex items-center justify-between gap-3 px-2 py-2.5 rounded-xl hover:bg-white/5 transition-colors cursor-pointer">
            <span className="text-sm text-gray-300">Controles de página</span>
            <input
              type="checkbox"
              checked={showPageControls}
              onChange={(e) => {
                const next = e.target.checked;
                setShowPageControls(next);
                saveReaderSettings({ ...getReaderSettings(), showPageControls: next });
              }}
              className="accent-[#7c3aed] w-4 h-4"
            />
          </label>
        </div>
      )}

      {/* ── Painel: atalhos ───────────────────────────────────────── */}
      {panel === 'help' && (
        <div className="absolute right-16 top-1/2 -translate-y-1/2 z-40 w-60 rounded-2xl bg-black/80 backdrop-blur-md border border-white/10 shadow-2xl p-3">
          <p className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Atalhos
          </p>
          {[
            ['← / →', 'Navegar páginas'],
            ['Ctrl + Scroll', 'Zoom in/out'],
            ['Esc', panel ? 'Fechar painel' : 'Sair do leitor'],
            ['F', 'Tela cheia'],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between gap-3 px-1 py-1.5">
              <span className="text-xs text-gray-400">{desc}</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-[11px] font-mono text-gray-300">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      )}

      {/* ── Indicador de zoom (surge na ação, some sozinho) ──────── */}
      {zoomVisible && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-[#111]/95 border border-white/10 shadow-2xl backdrop-blur-md">
          <button
            type="button"
            title="Diminuir zoom"
            onClick={() => applyZoom(zoom - 0.1)}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            −
          </button>
          <span className="text-sm font-semibold text-white tabular-nums min-w-[44px] text-center">
            {zoom.toFixed(1)}×
          </span>
          <button
            type="button"
            title="Aumentar zoom"
            onClick={() => applyZoom(zoom + 0.1)}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-sm flex items-center justify-center transition-colors cursor-pointer"
          >
            +
          </button>
        </div>
      )}

      {/* ── Barra de progresso ────────────────────────────────────── */}
      {showProgressBar && pages.length > 0 && (
        <div className="absolute bottom-0 inset-x-0 z-40 h-[3px] bg-white/10">
          <div
            className="h-full bg-[#7c3aed] reader-progress"
            style={{ width: `${((index + 1) / pages.length) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
