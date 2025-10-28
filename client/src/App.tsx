import { Switch, Route, useLocation } from "wouter";
import { useEffect } from "react";
import React from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { ModuleProvider, useModule } from "@/contexts/ModuleContext";
import { EditValueProvider } from "@/components/EditableValue";
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
import AdminHospital from "@/pages/admin/Hospital";
import AdminUsers from "@/pages/admin/Users";
import Signup from "@/pages/Signup";
import ResetPassword from "@/pages/ResetPassword";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import Patients from "@/pages/anesthesia/Patients";
import PatientDetail from "@/pages/anesthesia/PatientDetail";
import CaseDetail from "@/pages/anesthesia/CaseDetail";
import PreOpList from "@/pages/anesthesia/PreOpList";
import OpList from "@/pages/anesthesia/OpList";
import Preop from "@/pages/anesthesia/Preop";
import Op from "@/pages/anesthesia/Op";
import Pacu from "@/pages/anesthesia/Pacu";
import CasePacu from "@/pages/anesthesia/CasePacu";
import PacuDetail from "@/pages/anesthesia/PacuDetail";
import AnesthesiaReports from "@/pages/anesthesia/Reports";
import AnesthesiaSettings from "@/pages/anesthesia/Settings";
import EditableValuesDemo from "@/pages/EditableValuesDemo";
import "@/i18n/config";

// Home redirect component that checks module preference
function HomeRedirect() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    // Read module preference directly from localStorage to avoid race conditions
    const savedModule = localStorage.getItem("activeModule");
    
    // If user has a saved preference, use it
    if (savedModule === "anesthesia") {
      navigate("/anesthesia/patients", { replace: true });
      return;
    } else if (savedModule === "admin") {
      navigate("/admin", { replace: true });
      return;
    } else if (savedModule === "inventory") {
      navigate("/inventory/items", { replace: true });
      return;
    }

    // No saved preference - intelligently default based on user's hospital configuration
    const userHospitals = (user as any)?.hospitals;
    if (userHospitals && userHospitals.length > 0) {
      // Get active hospital (first one or from localStorage)
      const savedHospitalKey = localStorage.getItem('activeHospital');
      let activeHospital = userHospitals[0];
      if (savedHospitalKey) {
        const saved = userHospitals.find((h: any) => 
          `${h.id}-${h.locationId}-${h.role}` === savedHospitalKey
        );
        if (saved) activeHospital = saved;
      }

      // If user is assigned to the anesthesia location, default to anesthesia module
      if (activeHospital.anesthesiaLocationId && 
          activeHospital.locationId === activeHospital.anesthesiaLocationId) {
        navigate("/anesthesia/patients", { replace: true });
        return;
      }
    }

    // Default to inventory for all other cases
    navigate("/inventory/items", { replace: true });
  }, [navigate, user]);

  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
    </div>
  );
}

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
            <Route path="/" component={HomeRedirect} />
            {/* Inventory Module */}
            <Route path="/inventory" component={Items} />
            <Route path="/inventory/items" component={Items} />
            <Route path="/inventory/scan" component={Scan} />
            <Route path="/inventory/orders" component={Orders} />
            <Route path="/inventory/alerts" component={Alerts} />
            <Route path="/inventory/controlled" component={ControlledLog} />
            <Route path="/inventory/checklists" component={Checklists} />
            {/* Anesthesia Module */}
            <Route path="/anesthesia" component={Patients} />
            <Route path="/anesthesia/patients" component={Patients} />
            <Route path="/anesthesia/patients/:id" component={PatientDetail} />
            <Route path="/anesthesia/cases/:id" component={CaseDetail} />
            <Route path="/anesthesia/preop" component={PreOpList} />
            <Route path="/anesthesia/op" component={OpList} />
            <Route path="/anesthesia/cases/:id/preop" component={Preop} />
            <Route path="/anesthesia/cases/:id/op" component={Op} />
            <Route path="/anesthesia/pacu" component={Pacu} />
            <Route path="/anesthesia/cases/:id/pacu" component={PacuDetail} />
            <Route path="/anesthesia/reports" component={AnesthesiaReports} />
            <Route path="/anesthesia/settings" component={AnesthesiaSettings} />
            {/* Admin Module */}
            <Route path="/admin" component={AdminHospital} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/signup" component={Signup} />
            {/* Demo/Testing Routes */}
            <Route path="/demo/editable-values" component={EditableValuesDemo} />
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
            <EditValueProvider>
              <TooltipProvider>
                <Toaster />
                <Layout>
                  <Router />
                </Layout>
              </TooltipProvider>
            </EditValueProvider>
          </ModuleProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
