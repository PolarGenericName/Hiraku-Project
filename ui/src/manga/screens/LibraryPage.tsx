/**
 * Biblioteca — mangás salvos pelo usuário (padrão Mihon Library).
 * Grid de capas com badge de capítulos restantes, seleção em massa
 * (estilo Windows), menu ao segurar no card (atalhos: migrar/ler/zerar)
 * e modo Reorganizar (arrastar para reordenar a ordem do grid).
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { toast } from 'sonner';
import { ArrowLeftRight, BookOpen, Check, Folder, GripVertical, Image as ImageIcon, ListChecks, Plus, RotateCcw, Search, X } from 'lucide-react';
import { useMangaStore } from '../hooks';
import {
  getCategories,
  getLibrary,
  markMangaAsRead,
  removeFromLibrary,
  resetMangaProgress,
  saveCategories,
  saveLibrary,
  updateLibraryEntry,
  type LibraryEntry,
} from '../storage';
import { getSource } from '../sources';
import MangaCard from '../components/MangaCard';
import CoverPickerDialog from '../components/CoverPickerDialog';
import type { MangaSummary } from '../types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function toSummary(entry: LibraryEntry): MangaSummary {
  return {
    id: entry.mangaId,
    title: entry.title,
    coverUrl: entry.coverUrl,
  };
}

/** Capítulos restantes (badge): some em 0 quando tudo lido. */
function unreadOf(entry: LibraryEntry): number {
  return entry.completed
    ? 0
    : Math.max(0, Math.round(entry.totalChapters) - Math.round(entry.lastReadChapter));
}

/** Distância mínima (px) do ponteiro antes de o arraste começar. */
const DRAG_THRESHOLD = 6;

/** Índice da célula mais próxima do ponto (grade uniforme = célula sob o ponteiro). */
function nearestCellIndex(cells: DOMRect[], x: number, y: number): number {
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const dx = x - (c.left + c.width / 2);
    const dy = y - (c.top + c.height / 2);
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export default function LibraryPage() {
  const library = useMangaStore(getLibrary);
  const categories = useMangaStore(getCategories);
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');

  // ── Categorias pessoais ────────────────────────────────────────────────────
  const [catFilter, setCatFilter] = useState<string | null>(null);
  // undefined = fechado; key null = modo "só criar"; key = mangá p/ atribuir
  const [catDialog, setCatDialog] = useState<{ key: string | null } | null>(null);
  const [newCatName, setNewCatName] = useState('');
  /** Trocar capa: entrada da biblioteca que está com o diálogo aberto */
  const [coverEntry, setCoverEntry] = useState<LibraryEntry | null>(null);
  const catEntry = catDialog?.key
    ? library.find((e) => e.key === catDialog.key) ?? null
    : null;

  // Seleção em massa (estilo Windows)
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const selectAnchor = useRef<string | null>(null);

  // Menu ao segurar o card
  const [cardMenu, setCardMenu] = useState<{ x: number; y: number; entry: LibraryEntry } | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressFired = useRef(false);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  // ── Reorganizar (arrastar para reordenar o grid) ───────────────────────────
  const [reorderMode, setReorderMode] = useState(false);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOrder, setDragOrder] = useState<LibraryEntry[] | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<LibraryEntry[]>([]); // lista viva (render atual)
  const dragOrderRef = useRef<LibraryEntry[] | null>(null); // ordem durante o arraste
  const flipPrevRef = useRef<Map<string, DOMRect> | null>(null);
  const orderDirtyRef = useRef(false);
  const dragPosRef = useRef({ x: 0, y: 0 }); // ponteiro durante o arraste
  const dragMetaRef = useRef<{ key: string; el: HTMLElement; grabDX: number; grabDY: number; cells: DOMRect[] } | null>(null);
  const settleRef = useRef<{ id: number; el: HTMLElement } | null>(null); // animação de "encaixar" ao soltar
  const flipAnimsRef = useRef(new WeakMap<HTMLElement, Animation>());
  const reorderRef = useRef<{ finish: (save: boolean) => void } | null>(null);

  // Fontes já consultadas nesta sessão (evita repetir em falhas)
  const attempted = useRef(new Set<string>());

  // Preenche o total de capítulos dos mangás sem número (badge de restantes).
  useEffect(() => {
    const pending = library.filter(
      (e) => e.totalChapters <= 0 && !e.completed && !attempted.current.has(e.key),
    );
    if (!pending.length) return;

    let cancelled = false;
    void (async () => {
      for (const entry of pending) {
        if (cancelled) return;
        attempted.current.add(entry.key);
        try {
          const source = getSource(entry.sourceId);
          if (!source) continue;
          const chapters = await source.getChapters(entry.mangaId);
          if (cancelled || chapters.length === 0) continue;
          updateLibraryEntry(entry.sourceId, entry.mangaId, {
            totalChapters: Math.max(...chapters.map((c) => c.number)),
          });
        } catch {
          // fonte indisponível — tenta de novo na próxima sessão
        }
        await sleep(300);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [library]);

  // FLIP: durante o arraste, anima os cards vizinhos para as novas posições
  // (roda antes do paint — medição nova vs. medição anterior gravada no handler)
  useLayoutEffect(() => {
    if (!dragKey || !dragOrder) return;
    // o card arrastado trocou de célula no DOM — reaplica o transform antes do paint
    applyDragTransform();
    const prev = flipPrevRef.current;
    if (!prev) return;
    flipPrevRef.current = null;
    const grid = gridRef.current;
    if (!grid) return;
    for (const child of Array.from(grid.children)) {
      const el = child as HTMLElement;
      const key = el.dataset.key;
      if (!key || key === dragKey) continue; // o arrastado é controlado pelo transform direto
      const before = prev.get(key);
      if (!before) continue;
      const after = el.getBoundingClientRect();
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      flipAnimsRef.current.get(el)?.cancel();
      const anim = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: 160, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      );
      flipAnimsRef.current.set(el, anim);
    }
  }, [dragKey, dragOrder]);

  // Sai do modo reorganizar ao desmontar (deixa o estado limpo)
  useEffect(() => () => reorderRef.current?.finish(false), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return library.filter((e) => {
      if (catFilter && !e.categories.includes(catFilter)) return false;
      if (q && !e.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [library, query, catFilter]);

  // Lista viva durante o arraste (dragOrder) — usada pelo startDrag
  const displayList = dragOrder ?? filtered;
  listRef.current = displayList;

  // ── Seleção em massa ──────────────────────────────────────────────────────
  function toggleSelect(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
        selectAnchor.current = null;
        return next;
      }
      const anchor = selectAnchor.current;
      const ia = anchor ? filtered.findIndex((e) => e.key === anchor) : -1;
      const ib = filtered.findIndex((e) => e.key === key);
      if (ia !== -1 && ib !== -1 && ia !== ib) {
        const lo = Math.min(ia, ib);
        const hi = Math.max(ia, ib);
        for (let i = lo; i <= hi; i++) next.add(filtered[i].key);
      } else {
        next.add(key);
      }
      selectAnchor.current = key;
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => {
      const all = prev.size === filtered.length;
      selectAnchor.current = null;
      return all ? new Set<string>() : new Set(filtered.map((e) => e.key));
    });
  }

  function exitSelect() {
    setSelectMode(false);
    setSelected(new Set());
    selectAnchor.current = null;
  }

  function removeSelected() {
    const keys = [...selected];
    if (!keys.length) return;
    for (const key of keys) {
      const [sourceId, ...rest] = key.split(':');
      removeFromLibrary(sourceId, rest.join(':'));
    }
    setSelected(new Set());
    setSelectMode(false);
    selectAnchor.current = null;
    toast(
      keys.length === 1
        ? 'Mangá removido da biblioteca'
        : `${keys.length} mangás removidos da biblioteca`,
      { duration: 3500 },
    );
  }

  // ── Long-press no card → menu de atalhos ─────────────────────────────────
  function cancelPress() {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function startPress(entry: LibraryEntry, e: React.PointerEvent) {
    cancelPress();
    pressFired.current = false;
    pressStart.current = { x: e.clientX, y: e.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressFired.current = true;
      setCardMenu({ x: e.clientX, y: e.clientY, entry });
    }, 450);
  }

  function movePress(e: React.PointerEvent) {
    if (pressTimer.current === null || !pressStart.current) return;
    if (
      Math.abs(e.clientX - pressStart.current.x) > 10 ||
      Math.abs(e.clientY - pressStart.current.y) > 10
    ) {
      cancelPress();
    }
  }

  // ── Reorganizar: arraste por pointer (ordem persistida no storage) ─────────
  function updateDragOrder(order: LibraryEntry[]) {
    dragOrderRef.current = order;
    setDragOrder(order);
  }

  function applyDragTransform() {
    const meta = dragMetaRef.current;
    const order = dragOrderRef.current;
    if (!meta || !order) return;
    const idx = order.findIndex((en) => en.key === meta.key);
    if (idx < 0 || idx >= meta.cells.length) return;
    // acompanha o ponteiro compensando a célula onde o card está
    const dx = dragPosRef.current.x - meta.grabDX - meta.cells[idx].left;
    const dy = dragPosRef.current.y - meta.grabDY - meta.cells[idx].top;
    meta.el.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /** Salva a ordem do arraste mesclando dados frescos do storage. */
  function saveOrder(order: LibraryEntry[]) {
    const fresh = new Map(getLibrary().map((en) => [en.key, en]));
    const merged = order.map((en) => fresh.get(en.key) ?? en);
    const inOrder = new Set(order.map((en) => en.key));
    for (const en of fresh.values()) if (!inOrder.has(en.key)) merged.push(en);
    saveLibrary(merged);
  }

  function clearDrag() {
    if (settleRef.current) {
      window.clearTimeout(settleRef.current.id);
      settleRef.current = null;
    }
    const meta = dragMetaRef.current;
    if (meta) {
      meta.el.style.transition = '';
      meta.el.style.transform = '';
    }
    dragMetaRef.current = null;
    dragOrderRef.current = null;
    orderDirtyRef.current = false;
    flipPrevRef.current = null;
    setDragKey(null);
    setDragOrder(null);
  }

  function startReorder(e: React.PointerEvent, entry: LibraryEntry) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelPress();
    // um "encaixe" pendente de outro card encerra agora (evita timeout mudo)
    if (settleRef.current) {
      window.clearTimeout(settleRef.current.id);
      settleRef.current.el.style.transition = '';
      settleRef.current.el.style.transform = '';
      settleRef.current = null;
    }
    const el = e.currentTarget as HTMLElement;
    const grid = gridRef.current;
    if (!grid || reorderRef.current) return;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = el.getBoundingClientRect();
    const grabDX = e.clientX - rect.left;
    const grabDY = e.clientY - rect.top;
    // slots estáticos: a geometria do grid não muda, só quem ocupa cada slot
    const cells = Array.from(grid.children).map((c) => (c as HTMLElement).getBoundingClientRect());
    let started = false;

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!started) {
        if (
          Math.abs(ev.clientX - startX) < DRAG_THRESHOLD &&
          Math.abs(ev.clientY - startY) < DRAG_THRESHOLD
        ) {
          return;
        }
        started = true;
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* ponteiro já solto */
        }
        el.style.transition = 'none';
        dragPosRef.current = { x: ev.clientX, y: ev.clientY };
        dragMetaRef.current = { key: entry.key, el, grabDX, grabDY, cells };
        orderDirtyRef.current = false;
        setDragKey(entry.key);
        updateDragOrder(listRef.current);
        applyDragTransform();
      }
      dragPosRef.current = { x: ev.clientX, y: ev.clientY };
      applyDragTransform();

      // reordena quando o ponteiro entra em outra célula
      const order = dragOrderRef.current;
      if (!order) return;
      const cur = order.findIndex((en) => en.key === entry.key);
      const target = nearestCellIndex(cells, ev.clientX, ev.clientY);
      if (cur < 0 || target < 0 || target === cur) return;
      const prev = new Map<string, DOMRect>();
      for (const child of Array.from(grid.children)) {
        const ce = child as HTMLElement;
        if (ce.dataset.key) prev.set(ce.dataset.key, ce.getBoundingClientRect());
      }
      flipPrevRef.current = prev;
      const next = [...order];
      const [moved] = next.splice(cur, 1);
      next.splice(target, 0, moved);
      orderDirtyRef.current = true;
      updateDragOrder(next);
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      finish(true);
    };

    const onCancel = (ev: Event) => {
      const pev = ev as PointerEvent;
      if (pev.pointerId !== undefined && pev.pointerId !== pointerId) return;
      finish(true);
    };

    const onWheel = (ev: WheelEvent) => ev.preventDefault(); // células não podem sair do lugar

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('wheel', onWheel);
      try {
        el.releasePointerCapture(pointerId);
      } catch {
        /* já liberado */
      }
      reorderRef.current = null;
    };

    function finish(save: boolean) {
      cleanup();
      if (!started) return;
      const target = dragMetaRef.current?.el ?? el;
      if (save) {
        const order = dragOrderRef.current;
        if (orderDirtyRef.current && order) saveOrder(order);
        // encaixa suave na célula final
        target.style.transition = 'transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        target.style.transform = 'translate(0px, 0px)';
        if (settleRef.current) window.clearTimeout(settleRef.current.id);
        settleRef.current = { id: window.setTimeout(() => clearDrag(), 200), el: target };
      } else {
        clearDrag();
      }
    }

    reorderRef.current = { finish };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('wheel', onWheel, { passive: false });
  }

  function enterReorder() {
    cancelPress();
    setCardMenu(null);
    exitSelect();
    setQuery('');
    setCatFilter(null); // reordena sempre a lista completa
    setReorderMode(true);
    toast('Segure e arraste os cards para reordenar', { duration: 3000 });
  }

  function exitReorder() {
    reorderRef.current?.finish(false);
    setReorderMode(false);
  }

  // ── Categorias: criar e atribuir ao mangá ──────────────────────────────────
  function createCategory(name: string): string | null {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = categories.find((c) => c.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing; // já existe (reaproveita sem duplicar)
    saveCategories([...categories, trimmed]);
    return trimmed;
  }

  function toggleCategoryOnEntry(entry: LibraryEntry, cat: string) {
    const has = entry.categories.includes(cat);
    const next = has
      ? entry.categories.filter((c) => c !== cat)
      : [...entry.categories, cat];
    updateLibraryEntry(entry.sourceId, entry.mangaId, { categories: next });
  }

  function submitNewCategory(assignTo: LibraryEntry | null) {
    const created = createCategory(newCatName);
    if (!created) return;
    setNewCatName('');
    if (assignTo && !assignTo.categories.includes(created)) {
      toggleCategoryOnEntry(assignTo, created);
    }
    toast(`Categoria “${created}” criada`, { duration: 2500 });
  }

  function removeCategory(cat: string) {
    saveCategories(categories.filter((c) => c !== cat));
    // limpa a categoria de todos os mangás
    for (const entry of library) {
      if (entry.categories.includes(cat)) {
        updateLibraryEntry(entry.sourceId, entry.mangaId, {
          categories: entry.categories.filter((c) => c !== cat),
        });
      }
    }
    if (catFilter === cat) setCatFilter(null);
    toast(`Categoria “${cat}” removida`, { duration: 2500 });
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">Biblioteca</h1>
          <span className="text-sm text-gray-500">
            {library.length} {library.length === 1 ? 'mangá' : 'mangás'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {library.length > 0 && (
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar biblioteca..."
                className="w-56 pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
              />
            </div>
          )}

          {library.length > 0 && (
            <div className="flex items-center gap-2">
              {selectMode && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  {selected.size === filtered.length ? 'Desmarcar todos' : 'Todos'}
                </button>
              )}
              <button
                type="button"
                onClick={() => (reorderMode ? exitReorder() : enterReorder())}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  reorderMode
                    ? 'bg-[#7c3aed] text-white'
                    : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <GripVertical size={14} />
                {reorderMode ? 'Concluir' : 'Reorganizar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (reorderMode) exitReorder();
                  if (selectMode) {
                    exitSelect();
                  } else {
                    setSelectMode(true);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
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
      </div>

      {/* ── Chips de categoria (filtro) ───────────────────────────────────── */}
      {library.length > 0 && (
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1 -mt-2 scrollbar-none">
          <button
            type="button"
            onClick={() => setCatFilter(null)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              catFilter === null
                ? 'bg-[#7c3aed] text-white'
                : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Todas
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCatFilter(catFilter === cat ? null : cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                catFilter === cat
                  ? 'bg-[#7c3aed] text-white'
                  : 'bg-white/5 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setNewCatName('');
              setCatDialog({ key: null });
            }}
            title="Criar categoria"
            className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Plus size={13} />
            Nova
          </button>
        </div>
      )}

      {library.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-[#7c3aed]/15 flex items-center justify-center mb-5">
            <BookOpen size={36} className="text-[#7c3aed]" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Sua biblioteca está vazia</h2>
          <p className="text-gray-400 max-w-md mb-6">
            Busque um mangá em <span className="text-white font-medium">Navegar</span> e toque em
            “Adicionar à biblioteca” para salvá-lo aqui.
          </p>
          <Link
            href="/manga/browse"
            className="px-6 py-3 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] text-white font-medium transition-colors"
          >
            Navegar fontes
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 py-16 text-center">
          {catFilter
            ? `Nenhum mangá na categoria “${catFilter}”.`
            : `Nenhum mangá encontrado para “${query}”.`}
        </p>
      ) : (
        <div
          ref={gridRef}
          className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${
            reorderMode ? 'touch-none' : ''
          }`}
        >
          {displayList.map((entry) => {
            // Capítulos restantes: diminui conforme lê e some em 0 (tudo lido)
            const unread = unreadOf(entry);
            const isSelected = selected.has(entry.key);
            const isDragging = dragKey === entry.key;
            return (
              <div
                key={entry.key}
                data-key={entry.key}
                onPointerDown={(e) => (reorderMode ? startReorder(e, entry) : startPress(entry, e))}
                onPointerMove={movePress}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onPointerCancel={cancelPress}
                onClickCapture={(e) => {
                  // o long-press já tratou — não navega
                  if (pressFired.current) {
                    e.stopPropagation();
                    e.preventDefault();
                    pressFired.current = false;
                    return;
                  }
                  // no modo reorganizar o click não navega (só arrasta)
                  if (reorderMode) {
                    e.stopPropagation();
                    e.preventDefault();
                  }
                }}
                className={`relative rounded-xl transition-all duration-200 ${
                  reorderMode ? 'cursor-grab active:cursor-grabbing' : ''
                } ${
                  isDragging
                    ? 'z-30 opacity-90 shadow-[0_24px_48px_rgba(0,0,0,0.55)] ring-2 ring-[#7c3aed]'
                    : isSelected
                      ? 'ring-2 ring-[#7c3aed] scale-[0.98]'
                      : ''
                }`}
              >
                <MangaCard
                  sourceId={entry.sourceId}
                  manga={toSummary(entry)}
                  badge={unread}
                  onClick={selectMode ? () => toggleSelect(entry.key) : undefined}
                />
                {selectMode && (
                  <span
                    className={`absolute top-2 left-2 z-10 w-5 h-5 rounded border-2 flex items-center justify-center ${
                      isSelected ? 'bg-[#7c3aed] border-[#7c3aed]' : 'border-gray-500 bg-black/50'
                    }`}
                  >
                    {isSelected && <Check size={13} strokeWidth={3} className="text-white" />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Barra de ações da seleção ─────────────────────────────────── */}
      {selectMode && selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[125] flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#0d0d12] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in-95 duration-150">
          <span className="text-sm text-gray-300 whitespace-nowrap">
            <strong className="text-white font-semibold">{selected.size}</strong>{' '}
            {selected.size === 1 ? 'selecionado' : 'selecionados'}
          </span>
          <button
            type="button"
            onClick={removeSelected}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <X size={14} />
            Remover da biblioteca
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

      {/* ── Menu do card (long-press) ──────────────────────────────────── */}
      {cardMenu && (
        <>
          <div
            className="fixed inset-0 z-[130]"
            onClick={() => setCardMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCardMenu(null);
            }}
          />
          <div
            className="fixed z-[140] w-60 rounded-xl bg-[#0d0d12] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.6)] py-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={{
              left: Math.max(8, Math.min(cardMenu.x, window.innerWidth - 272)),
              top: Math.max(8, Math.min(cardMenu.y, window.innerHeight - 220)),
            }}
          >
            <p className="px-4 pt-2 pb-1.5 text-[11px] uppercase tracking-wide text-gray-500 truncate">
              {cardMenu.entry.title}
            </p>

            <button
              type="button"
              onClick={() => {
                const { entry } = cardMenu;
                setCardMenu(null);
                navigate(`/manga/migrate?key=${encodeURIComponent(entry.key)}`);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <ArrowLeftRight size={14} className="text-gray-400" />
              Migrar
            </button>

            <button
              type="button"
              onClick={() => {
                const { entry } = cardMenu;
                setCardMenu(null);
                setNewCatName('');
                setCatDialog({ key: entry.key });
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <Folder size={14} className="text-gray-400" />
              Categorias
            </button>

            <button
              type="button"
              onClick={() => {
                const { entry } = cardMenu;
                setCardMenu(null);
                setCoverEntry(entry);
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <ImageIcon size={14} className="text-gray-400" />
              Trocar capa
            </button>

            <button
              type="button"
              onClick={() => {
                const { entry } = cardMenu;
                setCardMenu(null);
                markMangaAsRead(entry.sourceId, entry.mangaId);
                toast('Mangá marcado como lido', { duration: 2500 });
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <Check size={14} className="text-green-500" />
              Marcar todo como lido
            </button>

            <button
              type="button"
              onClick={() => {
                const { entry } = cardMenu;
                setCardMenu(null);
                resetMangaProgress(entry.sourceId, entry.mangaId);
                toast('Leitura do mangá zerada', { duration: 2500 });
              }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors text-left cursor-pointer"
            >
              <RotateCcw size={14} className="text-[#7c3aed]" />
              Resetar leitura
            </button>
          </div>
        </>
      )}

      {/* ── Diálogo de categorias ──────────────────────────────────────────── */}
      {catDialog && (
        <>
          <div
            className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setCatDialog(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCatDialog(null);
            }}
          />
          <div className="fixed inset-0 z-[155] flex items-center justify-center px-4 pointer-events-none">
            <div className="w-full max-w-sm rounded-2xl bg-[#0d0d12] border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.6)] p-5 animate-in fade-in zoom-in-95 duration-150 pointer-events-auto">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-white">Categorias</h3>
                  {catEntry && (
                    <p className="text-sm text-gray-400 mt-0.5 truncate">{catEntry.title}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setCatDialog(null)}
                  title="Fechar"
                  className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Atribuição (só quando aberto a partir de um mangá) */}
              {catEntry && (
                <div className="space-y-1 mb-4 max-h-52 overflow-y-auto pr-1">
                  {categories.length === 0 && (
                    <p className="text-sm text-gray-500 py-2">
                      Nenhuma categoria ainda. Crie a primeira abaixo.
                    </p>
                  )}
                  {categories.map((cat) => {
                    const on = catEntry.categories.includes(cat);
                    return (
                      <div
                        key={cat}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCategoryOnEntry(catEntry, cat)}
                          className="flex flex-1 min-w-0 items-center gap-3 py-1 text-left cursor-pointer"
                        >
                          <span
                            className={`w-5 h-5 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${
                              on ? 'bg-[#7c3aed] border-[#7c3aed]' : 'border-gray-600'
                            }`}
                          >
                            {on && <Check size={13} strokeWidth={3} className="text-white" />}
                          </span>
                          <span className="text-sm text-gray-200 truncate">{cat}</span>
                        </button>
                        <button
                          type="button"
                          title={`Remover categoria “${cat}”`}
                          onClick={() => removeCategory(cat)}
                          className="p-1.5 rounded-md text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer shrink-0"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Criar nova */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitNewCategory(catEntry);
                  }}
                  placeholder="Nome da categoria..."
                  autoFocus
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
                />
                <button
                  type="button"
                  onClick={() => submitNewCategory(catEntry)}
                  disabled={!newCatName.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
                >
                  Criar
                </button>
              </div>
              {catEntry && (
                <p className="text-xs text-gray-600 mt-2.5">
                  Criar uma nova já adiciona ao mangá. Toque nas categorias para marcar.
                </p>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Diálogo de trocar capa ────────────────────────────────────────── */}
      {coverEntry && (
        <CoverPickerDialog
          sourceId={coverEntry.sourceId}
          mangaId={coverEntry.mangaId}
          title={coverEntry.title}
          currentCover={coverEntry.coverUrl}
          onClose={() => setCoverEntry(null)}
        />
      )}
    </div>
  );
}
