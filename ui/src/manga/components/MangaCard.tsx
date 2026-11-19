/**
 * Card de mangá para os grids (Biblioteca, Navegar, Migração).
 * Espelha o grid do Mihon: capa 9:13 + badge de capítulos não lidos.
 */

import { Link } from 'wouter';
import type { MangaSummary, MangaStatus } from '../types';

const STATUS_LABELS: Record<MangaStatus, string> = {
  ongoing: 'Em lançamento',
  completed: 'Concluído',
  on_hiatus: 'Em hiato',
  cancelled: 'Cancelado',
  unknown: '',
};

interface MangaCardProps {
  sourceId: string;
  manga: MangaSummary;
  /** Badge de capítulos não lidos (mostrado se > 0) */
  badge?: number;
  active?: boolean;
  onClick?: () => void;
}

export default function MangaCard({ sourceId, manga, badge, active, onClick }: MangaCardProps) {
  const statusLabel = manga.status ? STATUS_LABELS[manga.status] : '';

  const content = (
    <>
      <div
        className={`relative aspect-[9/13] rounded-xl overflow-hidden bg-gray-900 transition-all duration-300 group-hover:shadow-[0_20px_40px_rgba(124,58,237,0.3)] ${
          active ? 'ring-2 ring-[#7c3aed]' : ''
        }`}
      >
        {manga.coverUrl && (
          <img
            src={manga.coverUrl}
            alt={manga.title}
            loading="lazy"
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 pointer-events-none"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        {badge !== undefined && badge > 0 && (
          <div className="absolute top-2 right-2 min-w-[24px] h-6 px-1.5 rounded-full bg-[#7c3aed] text-white text-xs font-bold flex items-center justify-center shadow-lg">
            {badge}
          </div>
        )}
        {statusLabel && (
          <div className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-[11px] text-gray-200">{statusLabel}</span>
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-300 group-hover:text-white line-clamp-2 leading-snug">
        {manga.title}
      </p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        draggable={false}
        onDragStart={(e) => e.preventDefault()}
        className="group text-left w-full cursor-pointer relative transition-all duration-300 hover:scale-105 hover:z-10"
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={`/manga/${sourceId}/${manga.id}`}
      draggable={false}
      onDragStart={(e) => e.preventDefault()}
      className="group block relative transition-all duration-300 hover:scale-105 hover:z-10"
    >
      {content}
    </Link>
  );
}
