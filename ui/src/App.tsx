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
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/search" component={Search} />
            <Route path="/animes" component={AnimesPage} />
            <Route path="/filmes" component={FilmesPage} />
            <Route path="/anime/:id" component={AnimeDetails} />
            <Route path="/profile" component={Profile} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
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
