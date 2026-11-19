/**
 * Loja de fontes — padrão Mihon Extensions:
 * - Fontes nativas: habilitar/desabilitar (as "instaladas" do Hiraku)
 * - Extensões Keiyoushi portadas para TS: opt-in com badge +18
 */

import { useState } from 'react';
import { Flame, Globe, Puzzle, Search } from 'lucide-react';
import { useMangaStore } from '../hooks';
import {
  listSources,
  isSourceEnabled,
  enableSource,
  disableSource,
} from '../sources';
import { getKeiyoushiEntry } from '../sources/keiyoushi';
import { langLabel } from '../sourcePrefs';
import type { MangaSource } from '../types';
import Toggle from './Toggle';

const NSFW_BADGE = 'px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 text-[10px] font-semibold uppercase tracking-wide shrink-0';

/**
 * Fonte EXCLUSIVA de conteúdo adulto (seção própria "NSFW" da loja):
 * nome com "Yaoi"/"Hentai" ou a Amuy (regra combinada com o usuário).
 */
function isNsfwExclusive(id: string, name: string): boolean {
  const n = name.toLowerCase();
  return n.includes('yaoi') || n.includes('hentai') || id.endsWith('-amuy');
}

export default function SourceStoreTab() {
  const sources = useMangaStore(listSources);
  const enabledMap = useMangaStore(() =>
    Object.fromEntries(listSources().map((s) => [s.id, isSourceEnabled(s.id)]))
  );

  const [keiyoushiQuery, setKeiyoushiQuery] = useState('');

  function toggleNative(id: string, enable: boolean) {
    if (enable) enableSource(id);
    else disableSource(id);
  }

  // ── Fontes: nativas (de fábrica) x extensões Keiyoushi portadas ───────────
  const nativeSources = sources.filter((s) => s.family !== 'keiyoushi');
  const keiyoushiSources = sources
    .filter((s) => s.family === 'keiyoushi')
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const query = keiyoushiQuery.trim().toLowerCase();
  const matchesQuery = (s: { name: string }) =>
    !query || s.name.toLowerCase().includes(query);

  // Exclusivas de adulto (Yaoi/Hentai/Amuy) em seção própria "NSFW"
  const nsfwSources = keiyoushiSources.filter((s) => isNsfwExclusive(s.id, s.name));
  const mainSources = keiyoushiSources.filter((s) => !isNsfwExclusive(s.id, s.name));

  const visibleKeiyoushi = mainSources.filter(matchesQuery);
  const visibleNsfw = nsfwSources.filter(matchesQuery);
  const keiyoushiEnabled = keiyoushiSources.filter((s) => enabledMap[s.id]).length;

  return (
    <div>
      {/* ── Fontes nativas ──────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-1">
        <Globe size={18} className="text-[#7c3aed]" />
        <h2 className="text-lg font-semibold text-white">Fontes nativas</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Incluídas no Hiraku. As habilitadas aparecem em Navegar e na migração.
      </p>

      <div className="space-y-2 mb-10">
        {nativeSources.map((source) => (
          <div
            key={source.id}
            className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10"
          >
            <div className="w-9 h-9 rounded-lg bg-[#7c3aed]/15 flex items-center justify-center shrink-0">
              <Globe size={17} className="text-[#7c3aed]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{source.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {langLabel(source.lang)} · {source.baseUrl}
              </p>
            </div>
            <Toggle
              checked={!!enabledMap[source.id]}
              onChange={(v) => toggleNative(source.id, v)}
              label={`Habilitar ${source.name}`}
            />
          </div>
        ))}
      </div>

      {/* ── Extensões Keiyoushi portadas ─────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-1">
        <Puzzle size={18} className="text-[#7c3aed]" />
        <h2 className="text-lg font-semibold text-white">Extensões Keiyoushi (PT-BR)</h2>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        Portes nativos das extensões do repositório Keiyoushi (Apache 2.0).{' '}
        <strong className="text-gray-400 font-medium">
          {keiyoushiEnabled} de {keiyoushiSources.length}
        </strong>{' '}
        habilitadas. As desabilitadas não aparecem em Navegar.
      </p>

      <div className="relative mb-3">
        <Search
          size={15}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
        />
        <input
          type="search"
          value={keiyoushiQuery}
          onChange={(e) => setKeiyoushiQuery(e.target.value)}
          placeholder="Buscar extensão..."
          className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
        />
      </div>

      <div className="space-y-2">
        {visibleKeiyoushi.map((source) => (
          <KeiyoushiRow
            key={source.id}
            source={source}
            checked={!!enabledMap[source.id]}
            onToggle={(v) => toggleNative(source.id, v)}
          />
        ))}
        {visibleKeiyoushi.length === 0 && visibleNsfw.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-500">
            Nenhuma extensão encontrada para "{keiyoushiQuery}".
          </p>
        )}
      </div>

      {/* ── NSFW: exclusivas de conteúdo adulto ────────────────────────── */}
      {nsfwSources.length > 0 && (
        <div className="mt-10">
          <div className="flex items-center gap-2 mb-1">
            <Flame size={18} className="text-red-400" />
            <h2 className="text-lg font-semibold text-white">NSFW</h2>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Fontes exclusivas de conteúdo adulto.
          </p>
          <div className="space-y-2">
            {visibleNsfw.map((source) => (
              <KeiyoushiRow
                key={source.id}
                source={source}
                checked={!!enabledMap[source.id]}
                onToggle={(v) => toggleNative(source.id, v)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Linha de extensão Keiyoushi (usada nas listas principal e NSFW). */
function KeiyoushiRow({
  source,
  checked,
  onToggle,
}: {
  source: MangaSource;
  checked: boolean;
  onToggle: (value: boolean) => void;
}) {
  const entry = getKeiyoushiEntry(source.id);
  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="relative w-9 h-9 rounded-lg bg-[#7c3aed]/15 overflow-hidden flex items-center justify-center shrink-0">
        <Puzzle size={17} className="text-[#7c3aed]" />
        {entry?.icon && (
          <img
            src={entry.icon}
            alt=""
            loading="lazy"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-white truncate">{source.name}</span>
          {entry?.nsfw && <span className={NSFW_BADGE}>+18</span>}
        </p>
        <p className="text-xs text-gray-500 truncate">
          {langLabel(source.lang)} · {source.baseUrl}
          {entry?.version ? ` · v${entry.version}` : ''}
        </p>
      </div>
      <Toggle checked={checked} onChange={onToggle} label={`Habilitar ${source.name}`} />
    </div>
  );
}
