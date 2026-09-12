import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import AnimeDetails from "@/pages/AnimeDetails";
import AnimesPage from "@/pages/AnimesPage";
import FilmesPage from "@/pages/FilmesPage";
import Profile from "@/pages/Profile";
import AccountSetup from "@/pages/AccountSetup";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccountProvider, useAccount } from "./contexts/AccountContext";

const HomeLayout = () => <Layout><Home /></Layout>;
const SearchLayout = () => <Layout><Search /></Layout>;
const AnimesLayout = () => <Layout><AnimesPage /></Layout>;
const FilmesLayout = () => <Layout><FilmesPage /></Layout>;
const AnimeDetailsLayout = () => <Layout><AnimeDetails /></Layout>;
const ProfileLayout = () => <Layout><Profile /></Layout>;
const NotFoundLayout = () => <Layout><NotFound /></Layout>;

function AppContent() {
  const { isSetup } = useAccount();

  return (
    <>
      {!isSetup && (
        <div className="fixed inset-0 z-[100]">
          <AccountSetup />
        </div>
      )}
      <Switch>
        <Route path="/" component={HomeLayout} />
        <Route path="/search" component={SearchLayout} />
        <Route path="/animes" component={AnimesLayout} />
        <Route path="/filmes" component={FilmesLayout} />
        <Route path="/anime/:id" component={AnimeDetailsLayout} />
        <Route path="/profile" component={ProfileLayout} />
        <Route path="/404" component={NotFoundLayout} />
        <Route component={NotFoundLayout} />
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
