import { Search, User, Settings, BookOpen, MoreHorizontal } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAccount } from "@/contexts/AccountContext";
import TitleBar from "@/features/player/TitleBar";
import UpdateNotification from "./UpdateNotification";
import ModeLever from "@/manga/components/ModeLever";
import { useMangaStore } from "@/manga/hooks";
import { getUpdates, markAllUpdatesRead } from "@/manga/storage";
import { getDiscordPresence, isMangaLocation, setAppMode } from "@/shared/lib/prefs";
import { initAutoBackup } from "@/shared/lib/backup";
import { toast } from "sonner";

interface LayoutProps {
  children: React.ReactNode;
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

// Notificação de novos capítulos: uma vez por sessão (só dispara quando
// há não-lidos, ou seja, o usuário ainda não abriu a tela de Atualizações)
let updatesNotified = false;

interface NavItemProps {
  href: string;
  label: string;
  active: boolean;
  badge?: number;
}

function NavItem({ href, label, active, badge }: NavItemProps) {
  return (
    <Link
      href={href}
      className={`relative px-4 py-2.5 rounded-lg text-base font-medium transition-all duration-200 ${
        active ? "text-white" : "text-gray-400 hover:text-white hover:bg-white/5"
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#7c3aed] text-[10px] font-bold flex items-center justify-center text-white shadow-[0_2px_8px_rgba(124,58,237,0.6)]">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { account } = useAccount();

  const isManga = isMangaLocation(location);
  const updates = useMangaStore(getUpdates);
  const unreadUpdates = updates.filter((u) => !u.read).length;

  // Sincroniza o último modo visitado (as rotas globais usam para preservar)
  useEffect(() => {
    if (location.startsWith('/manga')) setAppMode('manga');
    else if (location.startsWith('/anime') || ['/', '/animes', '/filmes', '/search'].includes(location))
      setAppMode('anime');
  }, [location]);

  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Aplica a preferência de presença do Discord salva (no web é no-op)
  useEffect(() => {
    window.electronAPI?.setDiscordEnabled(getDiscordPresence());
  }, []);

  // Scroll to top on route change
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  // Notificação de novos capítulos fora da tela de Atualizações
  useEffect(() => {
    if (updatesNotified) return;
    updatesNotified = true;
    const unread = getUpdates().filter((u) => !u.read);
    if (!unread.length) return;
    toast(
      unread.length === 1 ? '1 novo capítulo disponível' : `${unread.length} novos capítulos`,
      {
        description: `${unread
          .slice(0, 3)
          .map((u) => u.title)
          .join(' · ')}${unread.length > 3 ? '…' : ''}`,
        duration: 8000,
        action: {
          label: 'Marcar como visto',
          onClick: () => markAllUpdatesRead(),
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha o menu "Mais" ao clicar fora
  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [profileOpen]);

  // Sistema de backup automático (roda em background, ver shared/lib/backup)
  useEffect(() => {
    initAutoBackup();
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      {isElectron && <TitleBar />}
      <header
        className={`fixed left-0 right-0 z-50 transition-all duration-300 ${
          isElectron ? 'top-8' : 'top-0'
        } ${
          scrolled
            ? "bg-black/90 backdrop-blur-xl"
            : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6 min-w-0">
            <Link
              href={isManga ? "/manga" : "/"}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity shrink-0"
            >
              <img src="/logo.png" alt="Hiraku" className="w-10 h-10 object-contain" />
              <span className="text-xl font-bold text-white">Hiraku</span>
            </Link>

            <ModeLever />

            <div key={isManga ? 'manga-nav' : 'anime-nav'} className="nav-swap flex items-center gap-1">
              {isManga ? (
                <>
                  <NavItem href="/manga" label="Biblioteca" active={location === '/manga'} />
                  <NavItem
                    href="/manga/updates"
                    label="Atualizações"
                    active={location.startsWith('/manga/updates')}
                    badge={unreadUpdates}
                  />
                  <NavItem
                    href="/manga/history"
                    label="Histórico"
                    active={location.startsWith('/manga/history')}
                  />
                  <NavItem
                    href="/manga/browse"
                    label="Navegar"
                    active={location.startsWith('/manga/browse')}
                  />
                  <NavItem
                    href="/manga/migrate"
                    label="Migração"
                    active={location.startsWith('/manga/migrate')}
                  />
                </>
              ) : (
                <>
                  <Link
                    href="/"
                    className={`px-4 py-2.5 rounded-lg text-base font-medium transition-all duration-200 ${
                      location === "/"
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Início
                  </Link>

                  <Link
                    href="/animes"
                    className={`px-4 py-2.5 rounded-lg text-base font-medium transition-all duration-200 ${
                      location === "/animes"
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Animes
                  </Link>

                  <Link
                    href="/filmes"
                    className={`px-4 py-2.5 rounded-lg text-base font-medium transition-all duration-200 ${
                      location === "/filmes"
                        ? "text-white"
                        : "text-gray-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Filmes
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {!isManga && (
              <Link
                href="/search"
                className={`p-2.5 rounded-lg transition-all duration-200 ${
                  location.startsWith("/search")
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Search size={22} />
              </Link>
            )}

            {isManga && (
              <Link
                href="/manga/browse"
                className={`p-2.5 rounded-lg transition-all duration-200 lg:hidden ${
                  location.startsWith("/manga/browse")
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
                title="Navegar"
              >
                <BookOpen size={22} />
              </Link>
            )}

            {/* Avatar: menu Perfil / Configurações */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                aria-label="Menu do perfil"
                className={`p-2.5 rounded-lg transition-all duration-200 cursor-pointer ${
                  profileOpen || location === '/profile' || location === '/settings' || location === '/more'
                    ? "bg-white/10 text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                {account?.avatar ? (
                  <img
                    src={account.avatar}
                    alt={account.name}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <User size={26} />
                )}
              </button>

              {profileOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-[#111] border border-white/10 shadow-2xl py-1.5 overflow-hidden z-40">
                    <Link
                      href="/profile"
                      onClick={() => setProfileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        location === '/profile'
                          ? 'text-[#7c3aed] bg-[#7c3aed]/10'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <User size={16} />
                      Perfil
                    </Link>
                    <Link
                      href="/more"
                      onClick={() => setProfileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        location === '/more'
                          ? 'text-[#7c3aed] bg-[#7c3aed]/10'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <MoreHorizontal size={16} />
                      Mais
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setProfileOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        location === '/settings' || location === '/manga/settings'
                          ? 'text-[#7c3aed] bg-[#7c3aed]/10'
                          : 'text-gray-300 hover:bg-white/5'
                      }`}
                    >
                      <Settings size={16} />
                      Configurações
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Header fade effect */}
      <div className={`fixed left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-40 pointer-events-none ${isElectron ? 'top-28' : 'top-20'}`} />

      <main className={`w-full ${isElectron ? 'pt-28' : 'pt-20'}`}>
        {children}
      </main>
      <UpdateNotification />
    </div>
  );
}
