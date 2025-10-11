import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ModuleProvider } from "@/contexts/ModuleContext";
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
import Checklists from "@/pages/Checklists";
import Admin from "@/pages/Admin";
import Signup from "@/pages/Signup";
import ResetPassword from "@/pages/ResetPassword";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import Patients from "@/pages/anesthesia/Patients";
import PatientDetail from "@/pages/anesthesia/PatientDetail";
import CaseDetail from "@/pages/anesthesia/CaseDetail";
import PreOp from "@/pages/anesthesia/PreOp";
import Op from "@/pages/anesthesia/Op";
import Pacu from "@/pages/anesthesia/Pacu";
import AnesthesiaReports from "@/pages/anesthesia/Reports";
import AnesthesiaSettings from "@/pages/anesthesia/Settings";
import "@/i18n/config";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
      </div>
    );
  }

  return (
    <>
      <Switch>
        {!isAuthenticated ? (
          <>
            <Route path="/" component={Landing} />
            <Route path="/reset-password" component={ResetPassword} />
          </>
        ) : (
          <>
            <Route path="/" component={Items} />
            <Route path="/scan" component={Scan} />
            <Route path="/items" component={Items} />
            <Route path="/orders" component={Orders} />
            <Route path="/alerts" component={Alerts} />
            <Route path="/controlled" component={ControlledLog} />
            <Route path="/anesthesia" component={Patients} />
            <Route path="/anesthesia/patients" component={Patients} />
            <Route path="/anesthesia/patients/:id" component={PatientDetail} />
            <Route path="/anesthesia/cases/:id" component={CaseDetail} />
            <Route path="/anesthesia/preop" component={PreOp} />
            <Route path="/anesthesia/op" component={Op} />
            <Route path="/anesthesia/pacu" component={Pacu} />
            <Route path="/anesthesia/reports" component={AnesthesiaReports} />
            <Route path="/anesthesia/settings" component={AnesthesiaSettings} />
            <Route path="/checklists" component={Checklists} />
            <Route path="/admin" component={Admin} />
            <Route path="/signup" component={Signup} />
          </>
        )}
        <Route component={NotFound} />
      </Switch>
      
      {/* Force password change dialog */}
      {isAuthenticated && (user as any)?.mustChangePassword && (
        <ChangePasswordDialog open={true} required={true} />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <ModuleProvider>
            <TooltipProvider>
              <Toaster />
              <Layout>
                <Router />
              </Layout>
            </TooltipProvider>
          </ModuleProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
