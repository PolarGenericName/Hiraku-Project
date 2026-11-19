/**
 * "Mais" (menu do perfil) — categorias da biblioteca + estatísticas de uso.
 * Organizado como pedido: Categorias primeiro; depois Estatísticas em três
 * subseções — Visão Geral, Capítulos e episódios, Tempo.
 * (Backup e Dados moram nas Configurações, em "Dados e armazenamento".)
 */

import { useMemo, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Check,
  Folder,
  Pencil,
  Plus,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  createCategory,
  getCategories,
  getLibrary,
  getTotalChaptersRead,
  getReadingSeconds,
  removeCategory as removeCategoryEverywhere,
  renameCategory,
} from '@/manga/storage';
import { useMangaStore } from '@/manga/hooks';
import { getAllAnimeProgress } from '@/shared/lib/watchProgress';
import { useConfirm } from '@/shared/components/ConfirmDialog';

/** Estatísticas de animes (lidas uma vez no mount). */
function computeAnimeStats() {
  let completedAnimes = 0;
  let watchedEpisodes = 0;
  let watchSeconds = 0;
  for (const ap of Object.values(getAllAnimeProgress())) {
    const done = Object.values(ap.episodes).filter((e) => e.completed);
    watchedEpisodes += done.length;
    watchSeconds += done.reduce((sum, e) => sum + (e.duration || 0), 0);
    // "Completo" = total conhecido e todos os episódios registrados concluídos
    if (ap.totalEpisodes && ap.totalEpisodes > 0 && done.length >= ap.totalEpisodes) {
      completedAnimes++;
    }
  }
  return { completedAnimes, watchedEpisodes, watchSeconds };
}

function formatHours(seconds: number): string {
  const hours = seconds / 3600;
  return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Tv;
  label: string;
  value: string;
}) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className="text-[#7c3aed]" />
        <span className="text-xs text-gray-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white leading-none">{value}</p>
    </div>
  );
}

export default function More() {
  const library = useMangaStore(getLibrary);
  const categories = useMangaStore(getCategories);
  const { confirm, dialog } = useConfirm();

  const [animeStats] = useState(computeAnimeStats);
  const [newCat, setNewCat] = useState('');
  /** Categoria em edição inline (nome original → valor do input) */
  const [editing, setEditing] = useState<{ key: string; value: string } | null>(null);

  const chaptersRead = getTotalChaptersRead();
  const readingSeconds = getReadingSeconds();

  // Mangás com todos os capítulos lidos (ou marcados como concluídos)
  const completedMangas = library.filter(
    (e) => e.completed || (e.totalChapters > 0 && e.lastReadChapter >= e.totalChapters)
  ).length;

  const catCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of library) {
      for (const cat of entry.categories) counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }, [library]);

  function handleAdd() {
    const name = newCat.trim();
    if (!name) return;
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      toast('Essa categoria já existe');
      return;
    }
    createCategory(name);
    setNewCat('');
    toast(`Categoria “${name}” criada`, { duration: 2500 });
  }

  function handleRename() {
    if (!editing) return;
    const value = editing.value.trim();
    if (!value || value === editing.key) {
      setEditing(null);
      return;
    }
    if (!renameCategory(editing.key, value)) {
      toast('Já existe outra categoria com esse nome');
      return;
    }
    setEditing(null);
    toast('Categoria renomeada', { duration: 2500 });
  }

  async function handleDelete(cat: string) {
    const ok = await confirm({
      title: `Remover a categoria “${cat}”?`,
      description: 'Ela será desmarcada de todos os mangás da biblioteca. Esta ação não pode ser desfeita.',
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    removeCategoryEverywhere(cat);
    toast('Categoria removida', { duration: 2500 });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-white mb-8">Mais</h1>

      {/* ── Categorias ─────────────────────────────────────────── */}
      <section className="mb-10">
        <div className="flex items-center gap-2 mb-1">
          <Folder size={18} className="text-[#7c3aed]" />
          <h2 className="text-lg font-semibold text-white">Categorias</h2>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newCat}
            onChange={(e) => setNewCat(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="Nome da nova categoria..."
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#7c3aed]/60"
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newCat.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors cursor-pointer"
          >
            <Plus size={15} />
            Adicionar
          </button>
        </div>

        <div className="space-y-2">
          {categories.length === 0 && (
            <p className="text-sm text-gray-500 py-6 text-center">
              Nenhuma categoria ainda. Crie a primeira acima.
            </p>
          )}
          {categories.map((cat) =>
            editing?.key === cat ? (
              <div
                key={cat}
                className="flex items-center gap-2 p-3 rounded-xl bg-[#7c3aed]/10 border border-[#7c3aed]/40"
              >
                <input
                  type="text"
                  value={editing.value}
                  onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                  autoFocus
                  maxLength={40}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#7c3aed]/60"
                />
                <button
                  type="button"
                  onClick={handleRename}
                  title="Salvar"
                  className="p-2 rounded-lg text-green-400 hover:bg-green-500/10 transition-colors cursor-pointer"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  title="Cancelar"
                  className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                key={cat}
                className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/10"
              >
                <span className="min-w-0 flex-1 text-sm text-gray-200 truncate">{cat}</span>
                <span className="text-xs text-gray-500 shrink-0">
                  {catCounts.get(cat) ?? 0}{' '}
                  {(catCounts.get(cat) ?? 0) === 1 ? 'mangá' : 'mangás'}
                </span>
                <button
                  type="button"
                  onClick={() => setEditing({ key: cat, value: cat })}
                  title="Renomear"
                  className="p-2 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(cat)}
                  title="Excluir"
                  className="p-2 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          )}
        </div>
      </section>

      {/* ── Estatísticas ───────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={18} className="text-[#7c3aed]" />
          <h2 className="text-lg font-semibold text-white">Estatísticas</h2>
        </div>

        <div className="space-y-6">
          {/* Visão Geral */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Visão Geral</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Tv}
                label="Animes Completos"
                value={animeStats.completedAnimes.toLocaleString('pt-BR')}
              />
              <StatCard
                icon={BookOpen}
                label="Mangás completos"
                value={completedMangas.toLocaleString('pt-BR')}
              />
            </div>
          </div>

          {/* Capítulos e episódios */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Capítulos e episódios</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Tv}
                label="Total de episódios assistidos"
                value={animeStats.watchedEpisodes.toLocaleString('pt-BR')}
              />
              <StatCard
                icon={BookOpen}
                label="Total de capítulos lidos"
                value={chaptersRead.toLocaleString('pt-BR')}
              />
            </div>
          </div>

          {/* Tempo */}
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-2">Tempo</h3>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Tv}
                label="Horas assistindo anime"
                value={formatHours(animeStats.watchSeconds)}
              />
              <StatCard
                icon={BookOpen}
                label="Duração de leitura"
                value={formatHours(readingSeconds)}
              />
            </div>
          </div>
        </div>
      </section>

      <p className="mt-10 text-xs text-gray-600 text-center">Hiraku</p>

      {dialog}
    </div>
  );
}
