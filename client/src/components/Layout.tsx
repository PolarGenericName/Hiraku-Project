import { Home, Search } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useEffect, useState } from "react";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [activeNav, setActiveNav] = useState<"home" | "search">("home");

  useEffect(() => {
    if (location.startsWith("/search")) {
      setActiveNav("search");
    } else {
      setActiveNav("home");
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card/80 backdrop-blur-md border-b border-border">
        <div className="w-full px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img
              src="/logo.png"
              alt="Hiraku"
              className="w-8 h-8 object-contain"
            />
            <span className="text-lg font-bold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
              Hiraku
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            <Link href="/" className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeNav === "home"
                ? "bg-accent text-white shadow-lg shadow-accent/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
              <Home size={16} />
              <span>Início</span>
            </Link>

            <Link href="/search" className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              activeNav === "search"
                ? "bg-accent text-white shadow-lg shadow-accent/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}>
              <Search size={16} />
              <span>Buscar</span>
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full">
        {children}
      </main>
    </div>
  );
}
