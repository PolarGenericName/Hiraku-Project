import { lazy, Suspense } from 'react';
import { Toaster } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import Layout from "@/shared/components/Layout";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./shared/components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccountProvider, useAccount } from "./contexts/AccountContext";
import LoadingAnimation from "./shared/components/LoadingAnimation";

const Home = lazy(() => import("./features/home/Home"));
const Search = lazy(() => import("./features/search/Search"));
const AnimeDetails = lazy(() => import("./features/anime/AnimeDetails"));
const AnimesPage = lazy(() => import("./features/catalog/AnimesPage"));
const FilmesPage = lazy(() => import("./features/catalog/FilmesPage"));
const Profile = lazy(() => import("./features/profile/Profile"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Seção de mangás (Parte 2) — "app dentro do app"
const MangaLibrary = lazy(() => import("./manga/screens/LibraryPage"));
const MangaUpdates = lazy(() => import("./manga/screens/UpdatesPage"));
const MangaHistory = lazy(() => import("./manga/screens/HistoryPage"));
const MangaBrowse = lazy(() => import("./manga/screens/BrowsePage"));
const MangaMigrate = lazy(() => import("./manga/screens/MigratePage"));
const MangaDetails = lazy(() => import("./manga/screens/MangaDetails"));
const MangaReader = lazy(() => import("./manga/screens/MangaReader"));

// Configurações globais (animes + mangás + app) — menu Perfil → Configurações
const Settings = lazy(() => import("./pages/SettingsGlobal"));
const Licenses = lazy(() => import("./pages/Licenses"));
const Privacy = lazy(() => import("./pages/Privacy"));

// "Mais" — menu Perfil → Mais (categorias + estatísticas)
const More = lazy(() => import("./pages/More"));

function PageLoader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <LoadingAnimation />
    </div>
  );
}

const AccountSetup = lazy(() => import("./features/profile/AccountSetup"));

function AppContent() {
  const { isSetup } = useAccount();
  const [location] = useLocation();

  return (
    <>
      {!isSetup && (
        <div className="fixed inset-0 z-[100]">
          <Suspense fallback={<PageLoader />}>
            <AccountSetup />
          </Suspense>
        </div>
      )}
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <div key={location} className="fade-through">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/search" component={Search} />
              <Route path="/animes" component={AnimesPage} />
              <Route path="/filmes" component={FilmesPage} />
              <Route path="/anime/:id" component={AnimeDetails} />
              <Route path="/profile" component={Profile} />
              <Route path="/more" component={More} />
              <Route path="/settings" component={Settings} />
              <Route path="/settings/licenses" component={Licenses} />
              <Route path="/settings/privacy" component={Privacy} />
              {/* Compat: a antiga rota de mangá cai nas configurações globais */}
              <Route path="/manga/settings" component={Settings} />

              {/* Seção de mangás (Parte 2) */}
              <Route path="/manga" component={MangaLibrary} />
              <Route path="/manga/updates" component={MangaUpdates} />
              <Route path="/manga/history" component={MangaHistory} />
              <Route path="/manga/browse" component={MangaBrowse} />
              <Route path="/manga/migrate" component={MangaMigrate} />
              <Route path="/manga/read/:sourceId/:mangaId/:chapterId" component={MangaReader} />
              <Route path="/manga/:sourceId/:mangaId" component={MangaDetails} />

              <Route path="/404" component={NotFound} />
              <Route component={NotFound} />
            </Switch>
          </div>
        </Suspense>
      </Layout>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <AccountProvider>
          <TooltipProvider>
            <Toaster />
            <AppContent />
          </TooltipProvider>
        </AccountProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
