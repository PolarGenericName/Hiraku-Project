/**
 * Extensões Keiyoushi PT-BR fora do tema Madara — fontes com API própria
 * portadas manualmente (keiyoushi/extensions-source, Apache 2.0).
 *
 * Cada entrada declara os hosts extras que o proxy local precisa liberar e,
 * quando o site não tem TLS (só http puro), a exceção insecureHosts.
 */

import type { MangaSource } from '../../../types';
import { createMangaFireSource } from './mangafire';
import { createManGeekSource } from './mangeek';
import { createManhastroSource } from './manhastro';

export interface KeiyoushiCustomEntry {
  /** ID estável da fonte (keiyoushi-pt-<pkg>) */
  id: string;
  name: string;
  baseUrl: string;
  /** Sufixo do packageName (eu.kanade.tachiyomi.extension.pt.<pkg>) */
  pkg: string;
  /** Versão da extensão Keiyoushi da qual este port foi feito */
  version: string;
  /** true quando contentWarning = MIXED/NSFW (exibir tag +18) */
  nsfw: boolean;
  /** Ícone oficial da extensão (repositório Keiyoushi) */
  icon?: string;
  /** Hosts extras (APIs, CDNs de imagem) liberados no proxy */
  extraHosts?: string[];
  /** Hosts que só respondem em http puro (sem TLS) — exceção no proxy */
  insecureHosts?: string[];
  create(): MangaSource;
}

export const KEIYOUSHI_CUSTOM_ENTRIES: KeiyoushiCustomEntry[] = [
  {
    // Prioridade do usuário: MangaFire, Manhastro, ManGeek
    id: 'keiyoushi-pt-mangafire',
    name: 'MangaFire',
    baseUrl: 'https://mangafire.to',
    pkg: 'mangafire',
    version: '1.6.38',
    nsfw: true, // ContentWarning.MIXED → +18 (regra do Mihon)
    icon: 'https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/all/mangafire/res/mipmap-xhdpi/ic_launcher.png',
    extraHosts: [
      'mfcdn.nl', // capas (static.mfcdn.nl)
      'mfcdn3.xyz', // páginas do leitor (*.mfcdn3.xyz)
    ],
    create: createMangaFireSource,
  },
  {
    id: 'keiyoushi-pt-manhastro',
    name: 'Manhastro',
    baseUrl: 'https://manhastro.net',
    pkg: 'manhastro',
    version: '1.6.1',
    nsfw: true, // ContentWarning.NSFW
    icon: 'https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/manhastro/res/mipmap-xhdpi/ic_launcher.png',
    extraHosts: [
      'api2.manhastro.net', // API JSON
      'temp2.manhastro.com', // capas (redireciona para .net)
      'temp2.manhastro.net',
      'albums.manhastro.net', // imagens de capítulo
    ],
    create: createManhastroSource,
  },
  {
    id: 'keiyoushi-pt-mangeek',
    name: 'ManGeek',
    baseUrl: 'https://mangeek.app',
    pkg: 'mangeek',
    version: '1.6.3',
    nsfw: true, // ContentWarning.MIXED → +18 (regra do Mihon)
    icon: 'https://cdn.jsdelivr.net/gh/keiyoushi/extensions-source@main/src/pt/mangeek/res/mipmap-xhdpi/ic_launcher.png',
    extraHosts: [
      'geekstations.com.br', // API JSON (só http)
      'static.geekstations.com.br', // imagens
      // páginas vêm de hosts dinâmicos *.e2-{1..4}.dev (sem equivalente fixo)
      'e2-1.dev',
      'e2-2.dev',
      'e2-3.dev',
      'e2-4.dev',
    ],
    insecureHosts: ['geekstations.com.br'], // API sem TLS
    create: createManGeekSource,
  },
];

export function buildKeiyoushiCustomSources(): MangaSource[] {
  return KEIYOUSHI_CUSTOM_ENTRIES.map((entry) => entry.create());
}
