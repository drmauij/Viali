import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Items from "@/pages/Items";
import Orders from "@/pages/Orders";
import Alerts from "@/pages/Alerts";
import ControlledLog from "@/pages/ControlledLog";
import Admin from "@/pages/Admin";

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {isLoading || !isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : (
        <>
          <Route path="/" component={Items} />
          <Route path="/scan" component={Scan} />
          <Route path="/items" component={Items} />
          <Route path="/orders" component={Orders} />
          <Route path="/alerts" component={Alerts} />
          <Route path="/controlled" component={ControlledLog} />
          <Route path="/admin" component={Admin} />
        </>
      )}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Layout>
            <Router />
          </Layout>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
