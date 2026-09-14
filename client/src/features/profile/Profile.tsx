import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAccount, type EpisodeHistoryItem } from '@/contexts/AccountContext';
import { useAnimeDetails } from '@/shared/hooks/useAnime';
import { ArrowLeft, Camera, Trash2, X, Bookmark, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { getEpisodeProgressPercent } from '@/shared/lib/watchProgress';

function HistoryCard({ item, onClick }: { item: EpisodeHistoryItem; onClick: () => void }) {
  const progress = getEpisodeProgressPercent(item.animeId, item.episodeId);
  const timeAgo = getTimeAgo(item.watchedAt);

  return (
    <div
      onClick={onClick}
      className="flex-shrink-0 w-96 cursor-pointer group/card transition-all duration-200 hover:scale-[1.03]"
    >
      <div className="relative rounded-lg overflow-hidden bg-gray-900 aspect-video">
        <img
          src={item.animeCover}
          alt={item.animeTitle}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
          <div
            className="h-full bg-purple-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Episode badge */}
        <div className="absolute top-2 left-2 bg-black/70 px-2 py-0.5 rounded text-xs text-white">
          E{item.episodeNumber}
        </div>

        {/* Time ago */}
        <div className="absolute bottom-3 left-2 text-xs text-gray-300">
          {timeAgo}
        </div>
      </div>
      <p className="text-sm text-white mt-2 truncate group-hover/card:text-purple-400 transition-colors">
        {item.animeTitle}
      </p>
    </div>
  );
}

function HistoryScroll({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const scrollLeftVal = useRef(0);
  const wasDragged = useRef(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = true;
    wasDragged.current = false;
    startX.current = e.pageX;
    startY.current = e.pageY;
    scrollLeftVal.current = scrollRef.current.scrollLeft;
    scrollRef.current.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current || !scrollRef.current) return;
    const dx = Math.abs(e.pageX - startX.current);
    const dy = Math.abs(e.pageY - startY.current);
    if (dx > 5 || dy > 5) {
      wasDragged.current = true;
    }
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeftVal.current - walk;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    isDragging.current = false;
    scrollRef.current.style.cursor = 'grab';
    if (wasDragged.current) {
      e.stopPropagation();
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (wasDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div
      ref={scrollRef}
      className="overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide"
      style={{ cursor: 'grab' }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
    >
      {children}
    </div>
  );
}

function SavedAnimeCard({ anilistId, onClick }: { anilistId: string; onClick: () => void }) {
  const { anime, loading } = useAnimeDetails(Number(anilistId));

  if (loading || !anime) {
    return (
      <div>
        <div className="w-full aspect-[9/13] rounded-lg bg-gray-900 animate-pulse" />
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      className="cursor-pointer group/card transition-all duration-200 hover:scale-[1.03]"
    >
      <div className="relative w-full aspect-[9/13] rounded-lg overflow-hidden bg-gray-900">
        <img
          src={anime.coverImage?.large || anime.coverImage?.medium || ''}
          alt={anime.title?.romaji || ''}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity" />
      </div>
      <p className="text-xs text-white mt-2 line-clamp-2 group-hover/card:text-purple-400 transition-colors">
        {anime.title?.romaji || anime.title?.english || ''}
      </p>
    </div>
  );
}

function getTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d atrás`;
  const weeks = Math.floor(days / 7);
  return `${weeks}sem atrás`;
}

export default function Profile() {
  const { account, updateAvatar, updateName, clearHistory, toggleSavedAnime, getHistory, getSavedAnimes } = useAccount();
  const [, setLocation] = useLocation();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(account?.name || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (account) setNameValue(account.name);
  }, [account]);

  const handleAvatarChange = (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Arquivo muito grande. Máximo: 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      updateAvatar(reader.result as string);
      toast.success('Avatar atualizado!');
    };
    reader.readAsDataURL(file);
  };

  const handleNameSave = () => {
    if (nameValue.trim()) {
      updateName(nameValue.trim());
      setEditingName(false);
      toast.success('Nome atualizado!');
    }
  };

  const history = getHistory();
  const savedAnimes = getSavedAnimes();

  if (!account) return null;

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-4">
        <button
          onClick={() => setLocation('/')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={18} />
          <span>Voltar</span>
        </button>

        {/* Profile Info */}
        <div className="flex items-center gap-6 mb-8">
          {/* Avatar */}
          <button
            onClick={() => fileRef.current?.click()}
            className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-white/10 hover:border-purple-500/50 transition-colors group"
          >
            {account.avatar ? (
              <img src={account.avatar} alt={account.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-purple-600 flex items-center justify-center text-3xl font-bold text-white">
                {account.name[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Camera size={20} className="text-white" />
            </div>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleAvatarChange(file);
            }}
          />

          {/* Name */}
          <div className="flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  maxLength={30}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-xl focus:outline-none focus:border-purple-500/50"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                />
                <button
                  onClick={handleNameSave}
                  className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-500"
                >
                  Salvar
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="text-gray-500 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">{account.name}</h1>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-gray-500 hover:text-white text-sm transition-colors"
                >
                  Editar
                </button>
              </div>
            )}
            <p className="text-gray-500 text-sm mt-1">
              {history.length} episódio{history.length !== 1 ? 's' : ''} assistido{history.length !== 1 ? 's' : ''} ·{' '}
              {savedAnimes.length} salvo{savedAnimes.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 space-y-10 pb-16">
        {/* History */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock size={20} className="text-purple-400" />
              <h2 className="text-xl font-bold text-white">Histórico</h2>
            </div>
            {history.length > 0 && (
              <button
                onClick={() => {
                  clearHistory();
                  toast.success('Histórico limpo');
                }}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={14} />
                Limpar
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <Clock size={40} className="mx-auto mb-3 opacity-50" />
              <p>Nenhum episódio assistido ainda</p>
            </div>
          ) : (
            <HistoryScroll>
              <div className="flex gap-4">
                {history.map((item, i) => (
                  <HistoryCard
                    key={`${item.animeId}-${item.episodeId}-${i}`}
                    item={item}
                    onClick={() => setLocation(`/anime/${item.animeId}?episode=${item.episodeId}&season=${item.season}`)}
                  />
                ))}
              </div>
            </HistoryScroll>
          )}
        </section>

        {/* Saved Animes */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bookmark size={20} className="text-purple-400" />
            <h2 className="text-xl font-bold text-white">Salvos</h2>
          </div>

          {savedAnimes.length === 0 ? (
            <div className="text-center py-16 text-gray-600">
              <Bookmark size={40} className="mx-auto mb-3 opacity-50" />
              <p>Nenhum anime salvo</p>
            </div>
          ) : (
            <div className="grid grid-cols-5 gap-4">
              {[...savedAnimes].reverse().map((id) => (
                <SavedAnimeCard
                  key={id}
                  anilistId={id}
                  onClick={() => setLocation(`/anime/${id}`)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
