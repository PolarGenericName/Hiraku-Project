/**
 * Preferências de fonte — espelha as SourcePreferences do Mihon:
 * - pinned_catalogues → fixar fonte na tela Navegar
 * - source_languages   → filtro de idioma das fontes
 *
 * "Idioma por fonte" (sourceId → PT-BR/Inglês/Multilíngue) é extensão
 * própria: o Mihon não tem esse conceito (só filtro global de idioma).
 */

import { emitMangaChange } from './storage';

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceLangPref = 'pt-br' | 'en' | 'multi';

export const LANG_PREF_OPTIONS: Array<{ value: SourceLangPref; label: string; description: string }> = [
  { value: 'pt-br', label: 'PT-BR', description: 'Só capítulos traduzidos para o português' },
  { value: 'en', label: 'Inglês', description: 'Só capítulos traduzidos para o inglês' },
  { value: 'multi', label: 'Multilíngue', description: 'PT-BR e inglês, com prioridade para o PT-BR' },
];

/** Rótulo legível de um código de idioma (ex.: 'pt-br' → 'PT-BR') */
export function langLabel(code: string): string {
  if (code === 'pt-br') return 'PT-BR';
  if (code === 'pt') return 'Português';
  if (code === 'en') return 'Inglês';
  if (code === 'all' || code === 'multi' || code === '') return 'Multilíngue';
  return code.toUpperCase();
}

// ── Storage keys ─────────────────────────────────────────────────────────────

const PINNED_KEY = 'hiraku-manga-pinned';
const LANGS_KEY = 'hiraku-manga-source-langs';

function loadArray(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function saveArray(key: string, items: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch {
    // storage indisponível — mantém em memória
  }
  emitMangaChange();
}

function loadRecord(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function saveRecord(key: string, record: Record<string, unknown>) {
  try {
    localStorage.setItem(key, JSON.stringify(record));
  } catch {
    // storage indisponível — mantém em memória
  }
  emitMangaChange();
}

// ── Pins (pinned_catalogues) ─────────────────────────────────────────────────

export function getPinnedSources(): string[] {
  return loadArray(PINNED_KEY);
}

export function isSourcePinned(id: string): boolean {
  return getPinnedSources().includes(id);
}

export function toggleSourcePin(id: string): void {
  const pinned = getPinnedSources();
  const next = pinned.includes(id) ? pinned.filter((p) => p !== id) : [...pinned, id];
  saveArray(PINNED_KEY, next);
}

// ── Idioma por fonte (extensão própria — não existe no Mihon) ────────────────

export function getSourceLangPref(sourceId: string): SourceLangPref {
  const record = loadRecord(LANGS_KEY);
  const value = record[sourceId];
  return value === 'pt-br' || value === 'en' || value === 'multi' ? value : 'multi';
}

export function setSourceLangPref(sourceId: string, pref: SourceLangPref): void {
  const record = loadRecord(LANGS_KEY);
  record[sourceId] = pref;
  saveRecord(LANGS_KEY, record);
}

/** Traduz a preferência para os parâmetros translatedLanguage[] da MangaDex */
export function langPrefToTranslatedLanguages(pref: SourceLangPref): string[] {
  return pref === 'multi' ? ['pt-br', 'en'] : [pref];
}

/** Zera pins e idiomas por fonte (volta ao padrão de fábrica). */
export function resetSourcePrefs(): void {
  try {
    localStorage.removeItem(PINNED_KEY);
    localStorage.removeItem(LANGS_KEY);
  } catch {
    // storage indisponível
  }
  emitMangaChange();
}

/** Ordem de prioridade na deduplicação de capítulos (maior prioridade primeiro) */
export function langPrefPriority(pref: SourceLangPref): string[] {
  return pref === 'multi' ? ['pt-br', 'en'] : [pref];
}
