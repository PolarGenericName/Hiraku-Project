import { Search, User } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";
import { useAccount } from "@/contexts/AccountContext";
import TitleBar from "./TitleBar";

interface LayoutProps {
  children: React.ReactNode;
}

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { account } = useAccount();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Hiraku" className="w-10 h-10 object-contain" />
              <span className="text-xl font-bold text-white">Hiraku</span>
            </Link>

            <div className="flex items-center gap-1">
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
            </div>
          </div>

          <div className="flex items-center gap-3">
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

            <Link
              href="/profile"
              className={`p-2.5 rounded-lg transition-all duration-200 ${
                location === "/profile"
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
            </Link>
          </div>
        </div>
      </header>

      {/* Header fade effect */}
      <div className={`fixed left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-40 pointer-events-none ${isElectron ? 'top-28' : 'top-20'}`} />

      <main className={`w-full ${isElectron ? 'pt-28' : 'pt-20'}`}>
        {children}
      </main>
    </div>
  );
}
