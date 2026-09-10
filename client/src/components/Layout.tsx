import { Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-black text-white">
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
          scrolled
            ? "bg-black/90 backdrop-blur-xl"
            : "bg-gradient-to-b from-black/80 to-transparent"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="Hiraku" className="w-8 h-8 object-contain" />
              <span className="text-lg font-bold text-white">Hiraku</span>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location === "/"
                    ? "text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Início
              </Link>

              <Link
                href="/animes"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location === "/animes"
                    ? "text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Animes
              </Link>

              <Link
                href="/filmes"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  location === "/filmes"
                    ? "text-white"
                    : "text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                Filmes
              </Link>
            </div>
          </div>

          <Link
            href="/search"
            className={`p-2 rounded-lg transition-all duration-200 ${
              location.startsWith("/search")
                ? "bg-white/10 text-white"
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            <Search size={20} />
          </Link>
        </div>
      </header>

      {/* Header fade effect */}
      <div className="fixed top-16 left-0 right-0 h-16 bg-gradient-to-b from-black to-transparent z-40 pointer-events-none" />

      <main className="w-full pt-16">
        {children}
      </main>
    </div>
  );
}
