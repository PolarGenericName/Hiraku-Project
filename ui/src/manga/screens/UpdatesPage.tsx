/**
 * Atualizações — novos capítulos dos mangás da biblioteca (padrão Mihon
 * Updates): lista agrupada por dia com botão de atualizar.
 */

import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Check, RefreshCw, Trash2 } from 'lucide-react';
import { useMangaStore } from '../hooks';
import { groupByDay, timeLabel } from '../group';
import {
  getLibrary,
  getUpdates,
  clearReadUpdates,
  markAllUpdatesRead,
  markUpdateRead,
  setUpdatesForManga,
  updateLibraryEntry,
} from '../storage';
import { getSource } from '../sources';
import type { UpdateEntry } from '../storage';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function UpdatesPage() {
  const updates = useMangaStore(getUpdates);
  const [refreshing, setRefreshing] = useState(false);
  const [progress, setProgress] = useState('');

  // Entrar na tela já absorve as não-lidas (badge some sem clique extra)
  useEffect(() => {
    markAllUpdatesRead();
  }, []);

  const unreadCount = updates.filter((u) => !u.read).length;
  const groups = groupByDay(updates, (u) => u.publishedAt);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);

    // Limita a 30 mangás por atualização para respeitar o rate limit
    const library = getLibrary().slice(0, 30);

    for (let i = 0; i < library.length; i++) {
      const entry = library[i];
      setProgress(`${i + 1}/${library.length} · ${entry.title}`);
      const source = getSource(entry.sourceId);
      if (!source) continue;

      try {
        const chapters = await source.getChapters(entry.mangaId);
        const total = chapters.length
          ? Math.max(...chapters.map((c) => c.number))
          : entry.totalChapters;

        const recent = chapters.slice(0, 20);
        setUpdatesForManga(
          entry.sourceId,
          entry.mangaId,
          recent.map((c) => ({
            sourceId: entry.sourceId,
            mangaId: entry.mangaId,
            title: entry.title,
            coverUrl: entry.coverUrl,
            chapterNumber: c.number,
            chapterId: c.id,
            read: c.number <= entry.lastReadChapter,
            publishedAt: c.uploadedAt ?? Date.now(),
          }))
        );
        updateLibraryEntry(entry.sourceId, entry.mangaId, {
          totalChapters: Math.round(total),
        });
      } catch {
        // fonte indisponível — segue para a próxima
      }

      // Respeita o rate limit da fonte (~4 req/s)
      await sleep(250);
    }

    setProgress('');
    setRefreshing(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">Atualizações</h1>
          {unreadCount > 0 && (
            <span className="text-sm font-bold text-[#7c3aed]">{unreadCount} novas</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {updates.some((u) => u.read) && (
            <button
              type="button"
              onClick={clearReadUpdates}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              <Trash2 size={15} />
              Limpar lidas
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {refreshing && progress && (
        <p className="text-xs text-gray-500 mb-4 truncate">Verificando {progress}</p>
      )}

      {updates.length === 0 ? (
        <div className="py-24 text-center">
          <p className="text-lg text-white font-medium mb-2">Nenhuma atualização por aqui</p>
          <p className="text-gray-400 max-w-md mx-auto">
            Toque em “Atualizar” para verificar novos capítulos dos mangás da sua biblioteca.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500 mb-3">
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.items.map((update) => (
                  <UpdateRow key={update.key} update={update} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UpdateRow({ update }: { update: UpdateEntry }) {
  return (
    <div
      className={`group flex items-center gap-3 p-2.5 rounded-xl transition-colors ${
        update.read ? 'opacity-60' : 'bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
    >
      <Link
        href={`/manga/${update.sourceId}/${update.mangaId}`}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="shrink-0 w-11 h-14 rounded-md overflow-hidden bg-gray-900"
      >
        {update.coverUrl && (
          <img
            src={update.coverUrl}
            alt=""
            loading="lazy"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
      </Link>

      <div className="min-w-0 flex-1">
        <Link
          href={`/manga/${update.sourceId}/${update.mangaId}`}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="block text-sm text-white font-medium truncate hover:text-[#7c3aed] transition-colors"
        >
          {update.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span className={update.read ? 'text-gray-500' : 'text-[#7c3aed] font-semibold'}>
            Cap. {Number.isInteger(update.chapterNumber) ? update.chapterNumber : update.chapterNumber.toFixed(2)}
          </span>
          <span>•</span>
          <span>{timeLabel(update.publishedAt)}</span>
        </div>
      </div>

      {!update.read && (
        <button
          type="button"
          title="Marcar como lido"
          onClick={() => markUpdateRead(update.key)}
          className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Check size={16} />
        </button>
      )}

      <Link
        href={`/manga/read/${update.sourceId}/${update.mangaId}/${update.chapterId}`}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:bg-[#7c3aed] hover:text-white transition-colors"
      >
        Ler
      </Link>
    </div>
  );
}
