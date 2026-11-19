/**
 * Source registry — espelha o SourceManager do Mihon.
 * Mantém a lista de fontes instaladas/habilitadas e resolve por ID.
 *
 * Fontes nativas TS: a instalação é apenas habilitar; não há APK.
 * Inclui a MangaDex e as extensões Keiyoushi portadas (opt-in: só entram
 * em uso quando o usuário habilita na Loja — ver defaultEnabled).
 *
 * Estado: sobrescreve o padrão de habilitação por fonte em
 * `hiraku-manga-source-overrides` ({id: boolean}); as chaves antigas
 * (`hiraku-manga-disabled` / `hiraku-manga-sources`) são migradas.
 */

import type { MangaSource } from '../types';
import { emitMangaChange } from '../storage';
import { MangaDexSource } from './mangadex';
import { buildKeiyoushiSources } from './keiyoushi';

/** Fontes fixas da build: núcleo + extensões portadas */
const nativeSources: MangaSource[] = [new MangaDexSource(), ...buildKeiyoushiSources()];

const OVERRIDE_KEY = 'hiraku-manga-source-overrides';
const LEGACY_DISABLED_KEY = 'hiraku-manga-disabled';
const LEGACY_ENABLED_KEY = 'hiraku-manga-sources';

function parseIdArray(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return null;
  }
}

function parseOverrides(raw: string | null): Record<string, boolean> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const out: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'boolean') out[key] = value;
    }
    return out;
  } catch {
    return null;
  }
}

let overrides: Record<string, boolean> | null = null;

function getOverrides(): Record<string, boolean> {
  if (overrides) return overrides;

  const current = parseOverrides(localStorage.getItem(OVERRIDE_KEY));
  if (current) {
    overrides = current;
    return overrides;
  }

  // Migração das chaves antigas (listas de ids → mapa de sobrescritas)
  const migrated: Record<string, boolean> = {};
  const disabled = parseIdArray(localStorage.getItem(LEGACY_DISABLED_KEY));
  if (disabled) for (const id of disabled) migrated[id] = false;
  const legacyEnabled = parseIdArray(localStorage.getItem(LEGACY_ENABLED_KEY));
  if (legacyEnabled) for (const id of legacyEnabled) migrated[id] = true;
  if (disabled || legacyEnabled) {
    try {
      localStorage.setItem(OVERRIDE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_DISABLED_KEY);
      localStorage.removeItem(LEGACY_ENABLED_KEY);
    } catch {
      // storage indisponível — só memória
    }
  }
  overrides = migrated;
  return overrides;
}

function persistOverrides() {
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(getOverrides()));
  } catch {
    // storage indisponível — mantém em memória
  }
  emitMangaChange();
}

export function listSources(): MangaSource[] {
  return [...nativeSources];
}

export function listEnabledSources(): MangaSource[] {
  const over = getOverrides();
  return listSources().filter((source) => over[source.id] ?? source.defaultEnabled ?? true);
}

export function getSource(id: string): MangaSource | null {
  return listSources().find((s) => s.id === id) || null;
}

export function isSourceEnabled(id: string): boolean {
  const source = getSource(id);
  if (!source) return false;
  return getOverrides()[id] ?? source.defaultEnabled ?? true;
}

export function enableSource(id: string) {
  getOverrides()[id] = true;
  persistOverrides();
}

export function disableSource(id: string) {
  getOverrides()[id] = false;
  persistOverrides();
}

/** Zera as sobrescritas de fonte (volta ao padrão de fábrica). */
export function resetSourceOverrides() {
  overrides = {};
  try {
    localStorage.removeItem(OVERRIDE_KEY);
    localStorage.removeItem(LEGACY_DISABLED_KEY);
    localStorage.removeItem(LEGACY_ENABLED_KEY);
  } catch {
    // storage indisponível
  }
  emitMangaChange();
}
