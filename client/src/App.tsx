import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import Home from "@/pages/Home";
import Search from "@/pages/Search";
import AnimeDetails from "@/pages/AnimeDetails";
import AnimesPage from "@/pages/AnimesPage";
import FilmesPage from "@/pages/FilmesPage";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={() => <Layout><Home /></Layout>} />
      <Route path={"/search"} component={() => <Layout><Search /></Layout>} />
      <Route path={"/animes"} component={() => <Layout><AnimesPage /></Layout>} />
      <Route path={"/filmes"} component={() => <Layout><FilmesPage /></Layout>} />
      <Route path={"/anime/:id"} component={() => <Layout><AnimeDetails /></Layout>} />
      <Route path={"/404"} component={() => <Layout><NotFound /></Layout>} />
      {/* Final fallback route */}
      <Route component={() => <Layout><NotFound /></Layout>} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
