/**
 * Manga storage — biblioteca, atualizações e histórico de leitura.
 * localStorage com validação na leitura (padrão watchProgress.ts).
 *
 * Modelos espelham Mihon: LibraryManga, Updates, History.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface LibraryEntry {
  /** `${sourceId}:${mangaId}` — chave única composta */
  key: string;
  sourceId: string;
  mangaId: string;
  title: string;
  coverUrl?: string;
  /** Número do capítulo mais alto já lido */
  lastReadChapter: number;
  /** Total de capítulos conhecidos no momento da última atualização */
  totalChapters: number;
  /** true se o usuário marcou como concluído manualmente */
  completed: boolean;
  /** Categorias do usuário (vazio = sem categoria) */
  categories: string[];
  addedAt: number;
  updatedAt: number;
}

export interface UpdateEntry {
  key: string;
  sourceId: string;
  mangaId: string;
  title: string;
  coverUrl?: string;
  chapterNumber: number;
  chapterId: string;
  /** true se o capítulo já foi lido */
  read: boolean;
  /** timestamp da publicação conhecido */
  publishedAt: number;
}

export interface HistoryEntry {
  key: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  title: string;
  coverUrl?: string;
  chapterNumber: number;
  /** Página onde parou (índice 0-based) */
  page: number;
  totalPages: number;
  readAt: number;
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const LIBRARY_KEY = 'hiraku-manga-library';
const UPDATES_KEY = 'hiraku-manga-updates';
const HISTORY_KEY = 'hiraku-manga-history';
const CATEGORIES_KEY = 'hiraku-manga-categories';
const READER_SETTINGS_KEY = 'hiraku-manga-reader-settings';

// ── Change event ─────────────────────────────────────────────────────────────

/** Disparado a cada mutação — a UI assina via useMangaStore */
export const MANGA_EVENT = 'hiraku-manga-changed';

export function emitMangaChange() {
  try {
    window.dispatchEvent(new Event(MANGA_EVENT));
  } catch {
    // ambiente sem window — noop
  }
}

// ── Generic helpers ──────────────────────────────────────────────────────────

function loadArray<T>(key: string, isValid: (v: unknown) => v is T): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValid);
  } catch {
    return [];
  }
}

function saveArray(key: string, items: unknown[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage cheio — dados não persistem (mesma política do watchProgress)
  }
  emitMangaChange();
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// ── Cover URL normalization ──────────────────────────────────────────────────

const COVER_PROXY_PREFIX = '/api/mangadex/image?url=';
const MANGADEX_DIRECT_PREFIX = 'https://uploads.mangadex.org/';

/**
 * Reescreve URLs diretas do CDN de capas (gateadas por challenge de navegador)
 * para o proxy local. Entradas salvas antes do fix do proxy têm a URL direta
 * e não carregam — a normalização na leitura as conserta sem migração.
 */
function normalizeCoverUrl(url: string): string {
  if (url.startsWith(MANGADEX_DIRECT_PREFIX)) {
    return `${COVER_PROXY_PREFIX}${encodeURIComponent(url)}`;
  }
  return url;
}

/** Aplica normalizeCoverUrl em todas as entradas que tiverem coverUrl */
function normalizeCovers<T extends { coverUrl?: string }>(items: T[]): T[] {
  return items.map((item) => {
    if (typeof item.coverUrl !== 'string' || item.coverUrl === '') return item;
    const fixed = normalizeCoverUrl(item.coverUrl);
    return fixed === item.coverUrl ? item : { ...item, coverUrl: fixed };
  });
}

// ── Library ──────────────────────────────────────────────────────────────────

function isValidLibraryEntry(v: unknown): v is LibraryEntry {
  return (
    isRecord(v) &&
    typeof v.key === 'string' &&
    typeof v.sourceId === 'string' &&
    typeof v.mangaId === 'string' &&
    typeof v.title === 'string'
  );
}

export function getLibrary(): LibraryEntry[] {
  return normalizeCovers(loadArray(LIBRARY_KEY, isValidLibraryEntry));
}

export function saveLibrary(entries: LibraryEntry[]) {
  saveArray(LIBRARY_KEY, entries);
}

export function addToLibrary(entry: Omit<LibraryEntry, 'key' | 'addedAt' | 'updatedAt' | 'lastReadChapter' | 'totalChapters' | 'completed' | 'categories'>): LibraryEntry[] {
  const key = `${entry.sourceId}:${entry.mangaId}`;
  const entries = getLibrary().filter((e) => e.key !== key);
  const now = Date.now();
  const full: LibraryEntry = {
    ...entry,
    key,
    lastReadChapter: 0,
    totalChapters: 0,
    completed: false,
    categories: [],
    addedAt: now,
    updatedAt: now,
  };
  const next = [full, ...entries];
  saveLibrary(next);
  return next;
}

export function removeFromLibrary(sourceId: string, mangaId: string): LibraryEntry[] {
  const key = `${sourceId}:${mangaId}`;
  const next = getLibrary().filter((e) => e.key !== key);
  saveLibrary(next);
  return next;
}

export function updateLibraryEntry(
  sourceId: string,
  mangaId: string,
  patch: Partial<Pick<LibraryEntry, 'lastReadChapter' | 'totalChapters' | 'completed' | 'categories' | 'title' | 'coverUrl'>>
): void {
  const key = `${sourceId}:${mangaId}`;
  const entries = getLibrary();
  const idx = entries.findIndex((e) => e.key === key);
  if (idx === -1) return;
  entries[idx] = { ...entries[idx], ...patch, updatedAt: Date.now() };
  saveLibrary(entries);
}

export function isInLibrary(sourceId: string, mangaId: string): boolean {
  const key = `${sourceId}:${mangaId}`;
  return getLibrary().some((e) => e.key === key);
}

/**
 * Zera a leitura de capítulos específicos: apaga o histórico deles e
 * recalcula o lastReadChapter da biblioteca com o que restou.
 */
export function resetChaptersProgress(
  sourceId: string,
  mangaId: string,
  chapterIds: string[],
): void {
  if (!chapterIds.length) return;
  const targets = new Set(chapterIds.map((id) => `${sourceId}:${id}`));
  const remaining = getMangaHistory().filter((h) => !targets.has(h.key));
  saveArray(HISTORY_KEY, remaining);

  const maxChapter = remaining
    .filter((h) => h.sourceId === sourceId && h.mangaId === mangaId)
    .reduce((max, h) => Math.max(max, h.chapterNumber), 0);
  updateLibraryEntry(sourceId, mangaId, {
    lastReadChapter: maxChapter,
    completed: false,
  });
}

/** Zera TODO o progresso de um mangá (histórico + último lido). */
export function resetMangaProgress(sourceId: string, mangaId: string): void {
  const ids = getMangaHistory()
    .filter((h) => h.sourceId === sourceId && h.mangaId === mangaId)
    .map((h) => h.chapterId);
  resetChaptersProgress(sourceId, mangaId, ids);
  updateLibraryEntry(sourceId, mangaId, { lastReadChapter: 0, completed: false });
}

/** Marca todo o mangá como lido (badge some; updates dele viram lidos). */
export function markMangaAsRead(sourceId: string, mangaId: string): void {
  const entry = getLibrary().find(
    (e) => e.sourceId === sourceId && e.mangaId === mangaId,
  );
  if (!entry) return;
  const total = Math.max(entry.totalChapters, entry.lastReadChapter);
  updateLibraryEntry(sourceId, mangaId, { lastReadChapter: total });

  const updates = getUpdates();
  const prefix = `${sourceId}:${mangaId}:`;
  if (updates.some((u) => u.key.startsWith(prefix) && !u.read)) {
    saveArray(
      UPDATES_KEY,
      updates.map((u) => (u.key.startsWith(prefix) ? { ...u, read: true } : u)),
    );
  }
}

// ── Updates ──────────────────────────────────────────────────────────────────

function isValidUpdate(v: unknown): v is UpdateEntry {
  return (
    isRecord(v) &&
    typeof v.key === 'string' &&
    typeof v.sourceId === 'string' &&
    typeof v.mangaId === 'string' &&
    typeof v.title === 'string' &&
    typeof v.chapterNumber === 'number'
  );
}

export function getUpdates(): UpdateEntry[] {
  return normalizeCovers(loadArray(UPDATES_KEY, isValidUpdate));
}

/** Substitui as atualizações de um mangá específico */
export function setUpdatesForManga(sourceId: string, mangaId: string, updates: Omit<UpdateEntry, 'key'>[]): void {
  const prefix = `${sourceId}:${mangaId}:`;
  const others = getUpdates().filter((u) => !u.key.startsWith(prefix));
  const full = updates.map((u) => ({ ...u, key: `${prefix}${u.chapterId}` }));
  const merged = [...full, ...others].sort((a, b) => b.publishedAt - a.publishedAt);
  saveArray(UPDATES_KEY, merged.slice(0, 500));
}

export function markUpdateRead(key: string): void {
  const updates = getUpdates();
  const idx = updates.findIndex((u) => u.key === key);
  if (idx === -1) return;
  updates[idx] = { ...updates[idx], read: true };
  saveArray(UPDATES_KEY, updates);
}

/** Marca todas as atualizações não lidas como vistas (ação dos popups). */
export function markAllUpdatesRead(): void {
  const updates = getUpdates();
  if (!updates.some((u) => !u.read)) return;
  saveArray(
    UPDATES_KEY,
    updates.map((u) => (u.read ? u : { ...u, read: true })),
  );
}

export function clearReadUpdates(): void {
  saveArray(UPDATES_KEY, getUpdates().filter((u) => !u.read));
}

// ── History ──────────────────────────────────────────────────────────────────

function isValidHistory(v: unknown): v is HistoryEntry {
  return (
    isRecord(v) &&
    typeof v.key === 'string' &&
    typeof v.sourceId === 'string' &&
    typeof v.mangaId === 'string' &&
    typeof v.chapterId === 'string' &&
    typeof v.title === 'string'
  );
}

export function getMangaHistory(): HistoryEntry[] {
  return normalizeCovers(loadArray(HISTORY_KEY, isValidHistory));
}

export function addToHistory(entry: Omit<HistoryEntry, 'key' | 'readAt'>): void {
  const key = `${entry.sourceId}:${entry.chapterId}`;
  noteChapterRead(key); // stats: total acumulado de capítulos lidos
  const rest = getMangaHistory().filter((h) => h.key !== key);
  const full: HistoryEntry = { ...entry, key, readAt: Date.now() };
  saveArray(HISTORY_KEY, [full, ...rest].slice(0, 300));
}

export function removeFromHistory(key: string): HistoryEntry[] {
  const next = getMangaHistory().filter((h) => h.key !== key);
  saveArray(HISTORY_KEY, next);
  return next;
}

export function clearMangaHistory(): void {
  saveArray(HISTORY_KEY, []);
}

// ── Categories ───────────────────────────────────────────────────────────────

export function getCategories(): string[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c): c is string => typeof c === 'string');
  } catch {
    return [];
  }
}

export function saveCategories(categories: string[]): void {
  try {
    localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories));
  } catch {
    // noop
  }
  emitMangaChange();
}

/**
 * Cria uma categoria (case-insensitive). Retorna o nome canônico — o já
 * existente se houver duplicata — ou null se o nome for vazio.
 */
export function createCategory(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const cats = getCategories();
  const existing = cats.find((c) => c.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  saveCategories([...cats, trimmed]);
  return trimmed;
}

/** Renomeia a categoria e atualiza todas as entradas da biblioteca. */
export function renameCategory(oldName: string, newName: string): boolean {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return false;
  const cats = getCategories();
  if (cats.some((c) => c !== oldName && c.toLowerCase() === trimmed.toLowerCase())) {
    return false; // já existe outra com esse nome
  }
  saveCategories(cats.map((c) => (c === oldName ? trimmed : c)));
  const entries = getLibrary();
  let changed = false;
  const next = entries.map((e) => {
    if (!e.categories.includes(oldName)) return e;
    changed = true;
    return { ...e, categories: e.categories.map((c) => (c === oldName ? trimmed : c)) };
  });
  if (changed) saveLibrary(next);
  return true;
}

/** Remove a categoria da lista e de todas as entradas da biblioteca. */
export function removeCategory(cat: string): void {
  saveCategories(getCategories().filter((c) => c !== cat));
  const entries = getLibrary();
  const next = entries.map((e) =>
    e.categories.includes(cat)
      ? { ...e, categories: e.categories.filter((c) => c !== cat) }
      : e
  );
  saveLibrary(next);
}

// ── Stats: capítulos lidos (cumulativo, não limitado pelo histórico) ─────────

const READ_KEYS_KEY = 'hiraku-manga-read-keys';
let readKeysCache: Set<string> | null = null;

function loadReadKeys(): Set<string> {
  if (readKeysCache) return readKeysCache;
  try {
    const raw = localStorage.getItem(READ_KEYS_KEY);
    if (raw === null) {
      // Primeira execução: semeia com o histórico atual (até 300 entradas)
      const seeded = new Set(getMangaHistory().map((h) => h.key));
      readKeysCache = seeded;
      if (seeded.size > 0) {
        localStorage.setItem(READ_KEYS_KEY, JSON.stringify([...seeded]));
      }
      return readKeysCache;
    }
    const parsed: unknown = JSON.parse(raw);
    readKeysCache = new Set(
      Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : []
    );
  } catch {
    readKeysCache = new Set();
  }
  return readKeysCache;
}

/** Registra um capítulo como lido (idempotente). true = primeira vez. */
export function noteChapterRead(key: string): boolean {
  const set = loadReadKeys();
  if (set.has(key)) return false;
  set.add(key);
  try {
    localStorage.setItem(READ_KEYS_KEY, JSON.stringify([...set]));
  } catch {
    // storage cheio — a contagem não persiste (mesma política do resto)
  }
  return true;
}

/** Total acumulado de capítulos lidos (distinct) — estatísticas. */
export function getTotalChaptersRead(): number {
  return loadReadKeys().size;
}

// ── Stats: tempo total de leitura ────────────────────────────────────────────

const READING_TIME_KEY = 'hiraku-reading-time';

/** Segundos acumulados lendo mangás (estatísticas). */
export function getReadingSeconds(): number {
  try {
    const n = Number(localStorage.getItem(READING_TIME_KEY));
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function addReadingSeconds(seconds: number): void {
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  try {
    localStorage.setItem(READING_TIME_KEY, String(getReadingSeconds() + seconds));
  } catch {
    // noop
  }
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * Transfere uma entrada da biblioteca para outra fonte (mesmo mangá em
 * fonte diferente), preservando o progresso de leitura.
 */
export function migrateLibraryEntry(
  oldKey: string,
  newSourceId: string,
  newMangaId: string,
  newTitle: string,
  newCoverUrl?: string
): LibraryEntry[] {
  const entries = getLibrary();
  const idx = entries.findIndex((e) => e.key === oldKey);
  if (idx === -1) return entries;

  const newKey = `${newSourceId}:${newMangaId}`;
  if (entries.some((e) => e.key === newKey)) {
    // Já está no destino — remove a origem (progresso já existe lá)
    const next = entries.filter((e) => e.key !== oldKey);
    saveLibrary(next);
    return next;
  }

  entries[idx] = {
    ...entries[idx],
    key: newKey,
    sourceId: newSourceId,
    mangaId: newMangaId,
    title: newTitle,
    coverUrl: newCoverUrl,
    updatedAt: Date.now(),
  };
  saveLibrary(entries);
  return entries;
}

// ── Reader settings ──────────────────────────────────────────────────────────

export type ReadingMode = 'webtoon' | 'ltr' | 'rtl';

export interface ReaderSettings {
  mode: ReadingMode;
  /** Mostrar barra de progresso */
  showProgressBar: boolean;
  /** Mostrar os controles de passar página (inferiores do modo paged) */
  showPageControls: boolean;
}

const DEFAULT_READER: ReaderSettings = {
  mode: 'webtoon',
  showProgressBar: true,
  showPageControls: false, // desligado por padrão
};

export function getReaderSettings(): ReaderSettings {
  try {
    const raw = localStorage.getItem(READER_SETTINGS_KEY);
    if (!raw) return DEFAULT_READER;
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return DEFAULT_READER;
    const mode: ReadingMode =
      parsed.mode === 'ltr' || parsed.mode === 'rtl' || parsed.mode === 'webtoon'
        ? parsed.mode
        : DEFAULT_READER.mode;
    return {
      mode,
      showProgressBar:
        typeof parsed.showProgressBar === 'boolean'
          ? parsed.showProgressBar
          : DEFAULT_READER.showProgressBar,
      showPageControls:
        typeof parsed.showPageControls === 'boolean'
          ? parsed.showPageControls
          : DEFAULT_READER.showPageControls,
    };
  } catch {
    return DEFAULT_READER;
  }
}

export function saveReaderSettings(settings: ReaderSettings): void {
  try {
    localStorage.setItem(READER_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // noop
  }
  emitMangaChange();
}
