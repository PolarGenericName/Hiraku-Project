/**
 * Extensões Keiyoushi portadas para TS — fábrica e utilitários.
 * O catálogo vive em ./manifest.ts (gerado do código-fonte Apache 2.0).
 */

import type { MangaSource } from '../../types';
import { KEIYOUSHI_ENTRIES, type KeiyoushiEntry } from './manifest';
import {
  KEIYOUSHI_CUSTOM_ENTRIES,
  buildKeiyoushiCustomSources,
} from './custom';
import { createMadaraSource } from './themes/madara';
import { createGattsuSource } from './themes/gattsu';
import { createGreenShitSource } from './themes/greenshit';
import { createMangaWorkSource } from './themes/mangawork';
import { createMangoThemeSource } from './themes/mangotheme';
import { createHiperSource } from './themes/hiper';
import { createZeistMangaSource } from './themes/zeistmanga';
import { createAuroraSource } from './themes/aurora';
import { createMangaThemesiaSource } from './themes/mangathemesia';

const PREFIX = 'keiyoushi-pt-';

/** Metadados da loja (ícone, aviso +18, versão) — comum a Madara e custom. */
export interface KeiyoushiStoreMeta {
  id: string;
  name: string;
  baseUrl: string;
  version: string;
  nsfw: boolean;
  icon?: string;
}

/** Instancia uma extensão pelo tema declarado na entrada do manifesto. */
function createKeiyoushiSource(entry: KeiyoushiEntry): MangaSource {
  switch (entry.theme) {
    case 'madara':
      return createMadaraSource(entry);
    case 'gattsu':
      return createGattsuSource(entry);
    case 'greenshit':
      return createGreenShitSource(entry);
    case 'mangawork':
      return createMangaWorkSource(entry);
    case 'mangotheme':
      return createMangoThemeSource(entry);
    case 'hiper':
      return createHiperSource(entry);
    case 'zeistmanga':
      return createZeistMangaSource(entry);
    case 'aurora':
      return createAuroraSource(entry);
    case 'mangathemesia':
      return createMangaThemesiaSource(entry);
    default: {
      const unknown: never = entry;
      throw new Error(`Tema Keiyoushi desconhecido: ${JSON.stringify(unknown)}`);
    }
  }
}

/** Instancia todas as extensões portadas (estado só de configuração — barato). */
export function buildKeiyoushiSources(): MangaSource[] {
  return [
    ...KEIYOUSHI_ENTRIES.map((entry) => createKeiyoushiSource(entry)),
    ...buildKeiyoushiCustomSources(),
  ];
}

export function isKeiyoushiSourceId(id: string): boolean {
  return id.startsWith(PREFIX);
}

/** Metadados da loja (ícone, aviso +18, versão) por ID de fonte. */
export function getKeiyoushiEntry(id: string): KeiyoushiStoreMeta | undefined {
  return (
    KEIYOUSHI_ENTRIES.find((entry) => entry.id === id) ??
    KEIYOUSHI_CUSTOM_ENTRIES.find((entry) => entry.id === id)
  );
}

export { KEIYOUSHI_ENTRIES };
export type { KeiyoushiEntry };
