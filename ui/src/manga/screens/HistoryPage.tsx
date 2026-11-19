/**
 * Histórico — leituras recentes agrupadas por dia (padrão Mihon History).
 * Retoma de onde parou; exclusão individual e geral.
 */

import { Link } from 'wouter';
import { History, X } from 'lucide-react';
import { useMangaStore } from '../hooks';
import { groupByDay, timeLabel } from '../group';
import { useConfirm } from '../../shared/components/ConfirmDialog';
import {
  getMangaHistory,
  removeFromHistory,
  clearMangaHistory,
  type HistoryEntry,
} from '../storage';

export default function HistoryPage() {
  const history = useMangaStore(getMangaHistory);
  const groups = groupByDay(history, (h) => h.readAt);
  const { confirm, dialog } = useConfirm();

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-white">Histórico</h1>
          <span className="text-sm text-gray-500">{history.length}</span>
        </div>

        {history.length > 0 && (
          <button
            type="button"
            onClick={async () => {
              const ok = await confirm({
                title: 'Limpar todo o histórico de leitura?',
                description: 'Os capítulos e a posição de leitura salvos serão apagados. Esta ação não pode ser desfeita.',
                confirmLabel: 'Limpar',
                danger: true,
              });
              if (ok) clearMangaHistory();
            }}
            className="px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            Limpar histórico
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-20 h-20 rounded-full bg-[#7c3aed]/15 flex items-center justify-center mb-5">
            <History size={36} className="text-[#7c3aed]" />
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Nenhuma leitura ainda</h2>
          <p className="text-gray-400 max-w-md">
            Os capítulos que você ler aparecerão aqui para continuar de onde parou.
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
                {group.items.map((entry) => (
                  <HistoryRow key={entry.key} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog}
    </div>
  );
}

function HistoryRow({ entry }: { entry: HistoryEntry }) {
  const resumeHref = `/manga/read/${entry.sourceId}/${entry.mangaId}/${entry.chapterId}`;

  return (
    <div className="group flex items-center gap-3 p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-colors">
      <Link
        href={resumeHref}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="shrink-0 w-11 h-14 rounded-md overflow-hidden bg-gray-900"
      >
        {entry.coverUrl && (
          <img
            src={entry.coverUrl}
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
          href={resumeHref}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="block text-sm text-white font-medium truncate hover:text-[#7c3aed] transition-colors"
        >
          {entry.title}
        </Link>
        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
          <span className="text-[#7c3aed] font-semibold">
            Cap.{' '}
            {Number.isInteger(entry.chapterNumber)
              ? entry.chapterNumber
              : entry.chapterNumber.toFixed(2)}
          </span>
          {entry.totalPages > 0 && (
            <>
              <span>•</span>
              <span>
                pág. {Math.min(entry.page + 1, entry.totalPages)}/{entry.totalPages}
              </span>
            </>
          )}
          <span>•</span>
          <span>{timeLabel(entry.readAt)}</span>
        </div>
      </div>

      <Link
        href={resumeHref}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-gray-300 hover:bg-[#7c3aed] hover:text-white transition-colors"
      >
        Continuar
      </Link>

      <button
        type="button"
        title="Remover do histórico"
        onClick={() => removeFromHistory(entry.key)}
        className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X size={16} />
      </button>
    </div>
  );
}
