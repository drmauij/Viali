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
import { SocketProvider } from "@/contexts/SocketContext";
import { useAuth } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Scan from "@/pages/Scan";
import Items from "@/pages/Items";
import Orders from "@/pages/Orders";
import Alerts from "@/pages/Alerts";
import SupplierMatches from "@/pages/SupplierMatches";
import ControlledLog from "@/pages/ControlledLog";
import Checklists from "@/pages/Checklists";
import AdminHospital from "@/pages/admin/Hospital";
import AdminUsers from "@/pages/admin/Users";
import AdminCameraDevices from "@/pages/admin/CameraDevices";
import AdminBilling from "@/pages/admin/Billing";
import Signup from "@/pages/Signup";
import ResetPassword from "@/pages/ResetPassword";
import ChangePasswordDialog from "@/components/ChangePasswordDialog";
import Patients from "@/pages/anesthesia/Patients";
import PatientDetail from "@/pages/anesthesia/PatientDetail";
import CaseDetail from "@/pages/anesthesia/CaseDetail";
import PreOpList from "@/pages/anesthesia/PreOpList";
import OpList from "@/pages/anesthesia/OpList";
import Op from "@/pages/anesthesia/Op";
import Pacu from "@/pages/anesthesia/Pacu";
import AnesthesiaReports from "@/pages/anesthesia/Reports";
import AnesthesiaSettings from "@/pages/anesthesia/Settings";
import ClinicalDashboard from "@/pages/anesthesia/ClinicalDashboard";
import QuestionnaireReviews from "@/pages/anesthesia/QuestionnaireReviews";
import SurgerySettings from "@/pages/surgery/SurgerySettings";
import SurgeryPreOpList from "@/pages/surgery/SurgeryPreOpList";
import SurgeryPreOpDetail from "@/pages/surgery/SurgeryPreOpDetail";
import SurgeryChecklistMatrix from "@/pages/surgery/ChecklistMatrix";
import BusinessDashboard from "@/pages/business/Dashboard";
import CostAnalytics from "@/pages/business/CostAnalytics";
import TimeAnalytics from "@/pages/business/TimeAnalytics";
import StaffCosts from "@/pages/business/StaffCosts";
import SimplifiedDashboard from "@/pages/business/SimplifiedDashboard";
import SimplifiedStaff from "@/pages/business/SimplifiedStaff";
import BusinessContracts from "@/pages/business/Contracts";
import WorkerContractForm from "@/pages/WorkerContractForm";
import ExternalWorklog from "@/pages/ExternalWorklog";
import WorklogManagement from "@/pages/WorklogManagement";
import UnitWorklogs from "@/pages/UnitWorklogs";
import EditableValuesDemo from "@/pages/EditableValuesDemo";
import ApiPlayground from "@/pages/ApiPlayground";
import ClinicInvoices from "@/pages/clinic/Invoices";
import ClinicServices from "@/pages/clinic/Services";
import ClinicQuestionnaires from "@/pages/clinic/UnassociatedQuestionnaires";
import ClinicAppointments from "@/pages/clinic/Appointments";
import PatientQuestionnaire from "@/pages/PatientQuestionnaire";
import ExternalSurgeryRequest from "@/pages/ExternalSurgeryRequest";
import LogisticInventory from "@/pages/logistic/LogisticInventory";
import LogisticOrders from "@/pages/logistic/LogisticOrders";
import LogisticMatches from "@/pages/logistic/LogisticMatches";
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
      navigate("/anesthesia/op", { replace: true });
      return;
    } else if (savedModule === "business") {
      navigate("/business", { replace: true });
      return;
    } else if (savedModule === "admin") {
      navigate("/admin", { replace: true });
      return;
    } else if (savedModule === "inventory") {
      navigate("/inventory/items", { replace: true });
      return;
    } else if (savedModule === "clinic") {
      navigate("/clinic", { replace: true });
      return;
    } else if (savedModule === "logistic") {
      navigate("/logistic/inventory", { replace: true });
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
          `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
        );
        if (saved) activeHospital = saved;
      }

      // If user's unit has business module enabled, default to business module
      if (activeHospital.unitType === 'business') {
        navigate("/business", { replace: true });
        return;
      }

      // If user's unit has anesthesia module enabled, default to anesthesia module
      if (activeHospital.unitType === 'anesthesia') {
        navigate("/anesthesia/op", { replace: true });
        return;
      }

      // If user's unit has surgery module enabled, default to surgery module
      if (activeHospital.unitType === 'or') {
        navigate("/surgery/op", { replace: true });
        return;
      }

      // If user's unit has clinic module enabled, default to clinic module
      if (activeHospital.unitType === 'clinic') {
        navigate("/clinic", { replace: true });
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
        {/* Public routes accessible regardless of auth */}
        <Route path="/questionnaire/:token" component={PatientQuestionnaire} />
        <Route path="/questionnaire/hospital/:token" component={PatientQuestionnaire} />
        <Route path="/external-surgery/:token" component={ExternalSurgeryRequest} />
        <Route path="/contract/:token" component={WorkerContractForm} />
        <Route path="/worklog/:token" component={ExternalWorklog} />
        
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
            <Route path="/inventory/services" component={ClinicServices} />
            <Route path="/inventory/scan" component={Scan} />
            <Route path="/inventory/orders" component={Orders} />
            <Route path="/inventory/alerts" component={Alerts} />
            <Route path="/inventory/controlled" component={ControlledLog} />
            <Route path="/inventory/checklists" component={Checklists} />
            <Route path="/inventory/matches" component={SupplierMatches} />
            {/* Anesthesia Module - requires anesthesia unit access */}
            <Route path="/anesthesia">{() => <ProtectedRoute requireAnesthesia><Patients /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/appointments">{() => <ProtectedRoute requireAnesthesia><ClinicAppointments /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/patients">{() => <ProtectedRoute requireAnesthesia><Patients /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/patients/:id">{() => <ProtectedRoute requireAnesthesia><PatientDetail /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/cases/:id">{() => <ProtectedRoute requireAnesthesia><CaseDetail /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/preop">{() => <ProtectedRoute requireAnesthesia><PreOpList /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/preop/:surgeryId">{() => <ProtectedRoute requireAnesthesia><PatientDetail /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/op">{() => <ProtectedRoute requireAnesthesia><OpList /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/op/:id">{() => <ProtectedRoute requireAnesthesia><Op /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/cases/:id/op">{() => <ProtectedRoute requireAnesthesia><Op /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/pacu">{() => <ProtectedRoute requireAnesthesia><Pacu /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/pacu/:id">{() => <ProtectedRoute requireAnesthesia><Op /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/cases/:id/pacu">{() => <ProtectedRoute requireAnesthesia><Op /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/reports">{() => <ProtectedRoute requireAnesthesia><AnesthesiaReports /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/settings">{() => <ProtectedRoute requireAnesthesia><AnesthesiaSettings /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/worklogs">{() => <ProtectedRoute requireAnesthesia><UnitWorklogs /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/schedule">{() => <ProtectedRoute requireAnesthesia><OpList /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/clinical">{() => <ProtectedRoute requireAnesthesia><ClinicalDashboard /></ProtectedRoute>}</Route>
            <Route path="/anesthesia/questionnaires">{() => <ProtectedRoute requireAnesthesia><QuestionnaireReviews /></ProtectedRoute>}</Route>
            {/* Surgery Module - requires surgery unit access */}
            <Route path="/surgery">{() => <ProtectedRoute requireSurgery><OpList /></ProtectedRoute>}</Route>
            <Route path="/surgery/appointments">{() => <ProtectedRoute requireSurgery><ClinicAppointments /></ProtectedRoute>}</Route>
            <Route path="/surgery/patients">{() => <ProtectedRoute requireSurgery><Patients /></ProtectedRoute>}</Route>
            <Route path="/surgery/patients/:id">{() => <ProtectedRoute requireSurgery><PatientDetail /></ProtectedRoute>}</Route>
            <Route path="/surgery/op">{() => <ProtectedRoute requireSurgery><OpList /></ProtectedRoute>}</Route>
            <Route path="/surgery/op/:id">{() => <ProtectedRoute requireSurgery><Op /></ProtectedRoute>}</Route>
            <Route path="/surgery/settings">{() => <ProtectedRoute requireSurgery><SurgerySettings /></ProtectedRoute>}</Route>
            <Route path="/surgery/worklogs">{() => <ProtectedRoute requireSurgery><UnitWorklogs /></ProtectedRoute>}</Route>
            <Route path="/surgery/checklists">{() => <ProtectedRoute requireSurgery requireDoctorOrAdmin><SurgeryChecklistMatrix /></ProtectedRoute>}</Route>
            <Route path="/surgery/preop">{() => <ProtectedRoute requireSurgery><SurgeryPreOpList /></ProtectedRoute>}</Route>
            <Route path="/surgery/preop/:surgeryId">{() => <ProtectedRoute requireSurgery><SurgeryPreOpDetail /></ProtectedRoute>}</Route>
            {/* Admin Module - requires admin role */}
            <Route path="/admin">{() => <ProtectedRoute requireAdmin><AdminHospital /></ProtectedRoute>}</Route>
            <Route path="/admin/users">{() => <ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>}</Route>
            <Route path="/admin/cameras">{() => <ProtectedRoute requireAdmin><AdminCameraDevices /></ProtectedRoute>}</Route>
            <Route path="/admin/billing">{() => <ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>}</Route>
            {/* Business Module - requires business unit access */}
            {/* /business shows Dashboard (CostAnalytics) for managers, Administration (SimplifiedDashboard) for staff */}
            <Route path="/business">{() => <ProtectedRoute requireBusiness><CostAnalytics /></ProtectedRoute>}</Route>
            <Route path="/business/administration">{() => <ProtectedRoute requireBusiness><SimplifiedDashboard /></ProtectedRoute>}</Route>
            <Route path="/business/staff">{() => <ProtectedRoute requireBusiness><SimplifiedStaff /></ProtectedRoute>}</Route>
            <Route path="/business/contracts">{() => <ProtectedRoute requireBusiness><BusinessContracts /></ProtectedRoute>}</Route>
            <Route path="/business/costs">{() => <ProtectedRoute requireBusiness><CostAnalytics /></ProtectedRoute>}</Route>
            <Route path="/business/time">{() => <ProtectedRoute requireBusiness><TimeAnalytics /></ProtectedRoute>}</Route>
            <Route path="/business/staff-full">{() => <ProtectedRoute requireBusiness><StaffCosts /></ProtectedRoute>}</Route>
            <Route path="/business/dashboard-full">{() => <ProtectedRoute requireBusiness><BusinessDashboard /></ProtectedRoute>}</Route>
            <Route path="/business/worklogs">{() => <ProtectedRoute requireBusiness><WorklogManagement /></ProtectedRoute>}</Route>
            {/* Clinic Module - ambulatory invoicing */}
            <Route path="/clinic">{() => <ProtectedRoute requireClinic><ClinicInvoices /></ProtectedRoute>}</Route>
            <Route path="/clinic/appointments">{() => <ProtectedRoute requireClinic><ClinicAppointments /></ProtectedRoute>}</Route>
            <Route path="/clinic/invoices">{() => <ProtectedRoute requireClinic><ClinicInvoices /></ProtectedRoute>}</Route>
            <Route path="/clinic/services">{() => <ProtectedRoute requireClinic><ClinicServices /></ProtectedRoute>}</Route>
            <Route path="/clinic/questionnaires">{() => <ProtectedRoute requireClinic><ClinicQuestionnaires /></ProtectedRoute>}</Route>
            <Route path="/clinic/patients">{() => <ProtectedRoute requireClinic><Patients /></ProtectedRoute>}</Route>
            <Route path="/clinic/patients/:id">{() => <ProtectedRoute requireClinic><PatientDetail /></ProtectedRoute>}</Route>
            {/* Logistic Module - cross-unit inventory & orders view */}
            <Route path="/logistic">{() => <ProtectedRoute requireLogistic><LogisticInventory /></ProtectedRoute>}</Route>
            <Route path="/logistic/inventory">{() => <ProtectedRoute requireLogistic><LogisticInventory /></ProtectedRoute>}</Route>
            <Route path="/logistic/orders">{() => <ProtectedRoute requireLogistic><LogisticOrders /></ProtectedRoute>}</Route>
            <Route path="/logistic/matches">{() => <ProtectedRoute requireLogistic><LogisticMatches /></ProtectedRoute>}</Route>
            <Route path="/signup" component={Signup} />
            {/* Demo/Testing Routes */}
            <Route path="/demo/editable-values" component={EditableValuesDemo} />
            <Route path="/api-playground" component={ApiPlayground} />
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
      <SocketProvider>
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
      </SocketProvider>
    </QueryClientProvider>
  );
}

export default App;
