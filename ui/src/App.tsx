import { lazy, Suspense } from 'react';
import { Toaster } from "@/shared/components/ui/sonner";
import { TooltipProvider } from "@/shared/components/ui/tooltip";
import Layout from "@/shared/components/Layout";
import { Route, Switch } from "wouter";
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

function PageLoader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <LoadingAnimation />
    </div>
  );
}

function LazyHome() { return <Suspense fallback={<PageLoader />}><Layout><Home /></Layout></Suspense>; }
function LazySearch() { return <Suspense fallback={<PageLoader />}><Layout><Search /></Layout></Suspense>; }
function LazyAnimes() { return <Suspense fallback={<PageLoader />}><Layout><AnimesPage /></Layout></Suspense>; }
function LazyFilmes() { return <Suspense fallback={<PageLoader />}><Layout><FilmesPage /></Layout></Suspense>; }
function LazyAnimeDetails() { return <Suspense fallback={<PageLoader />}><Layout><AnimeDetails /></Layout></Suspense>; }
function LazyProfile() { return <Suspense fallback={<PageLoader />}><Layout><Profile /></Layout></Suspense>; }
function LazyNotFound() { return <Suspense fallback={<PageLoader />}><Layout><NotFound /></Layout></Suspense>; }

const AccountSetup = lazy(() => import("./features/profile/AccountSetup"));

function AppContent() {
  const { isSetup } = useAccount();

  return (
    <>
      {!isSetup && (
        <div className="fixed inset-0 z-[100]">
          <Suspense fallback={<PageLoader />}>
            <AccountSetup />
          </Suspense>
        </div>
      )}
      <Switch>
        <Route path="/" component={LazyHome} />
        <Route path="/search" component={LazySearch} />
        <Route path="/animes" component={LazyAnimes} />
        <Route path="/filmes" component={LazyFilmes} />
        <Route path="/anime/:id" component={LazyAnimeDetails} />
        <Route path="/profile" component={LazyProfile} />
        <Route path="/404" component={LazyNotFound} />
        <Route component={LazyNotFound} />
      </Switch>
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
