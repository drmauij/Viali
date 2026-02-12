import { Switch, Route, useLocation } from "wouter";
import { useEffect, Suspense } from "react";
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
import "@/i18n/config";

const NotFound = React.lazy(() => import("@/pages/not-found"));
const Landing = React.lazy(() => import("@/pages/Landing"));
const Home = React.lazy(() => import("@/pages/Home"));
const Scan = React.lazy(() => import("@/pages/Scan"));
const Items = React.lazy(() => import("@/pages/Items"));
const Orders = React.lazy(() => import("@/pages/Orders"));
const Alerts = React.lazy(() => import("@/pages/Alerts"));
const SupplierMatches = React.lazy(() => import("@/pages/SupplierMatches"));
const ControlledLog = React.lazy(() => import("@/pages/ControlledLog"));
const Checklists = React.lazy(() => import("@/pages/Checklists"));
const AdminHospital = React.lazy(() => import("@/pages/admin/Hospital"));
const AdminUsers = React.lazy(() => import("@/pages/admin/Users"));
const AdminCameraDevices = React.lazy(() => import("@/pages/admin/CameraDevices"));
const AdminBilling = React.lazy(() => import("@/pages/admin/Billing"));
const Signup = React.lazy(() => import("@/pages/Signup"));
const ResetPassword = React.lazy(() => import("@/pages/ResetPassword"));
const ChangePasswordDialog = React.lazy(() => import("@/components/ChangePasswordDialog"));
const Patients = React.lazy(() => import("@/pages/anesthesia/Patients"));
const PatientDetail = React.lazy(() => import("@/pages/anesthesia/PatientDetail"));
const CaseDetail = React.lazy(() => import("@/pages/anesthesia/CaseDetail"));
const PreOpList = React.lazy(() => import("@/pages/anesthesia/PreOpList"));
const OpList = React.lazy(() => import("@/pages/anesthesia/OpList"));
const Op = React.lazy(() => import("@/pages/anesthesia/Op"));
const Pacu = React.lazy(() => import("@/pages/anesthesia/Pacu"));
const AnesthesiaReports = React.lazy(() => import("@/pages/anesthesia/Reports"));
const AnesthesiaSettings = React.lazy(() => import("@/pages/anesthesia/Settings"));
const ClinicalDashboard = React.lazy(() => import("@/pages/anesthesia/ClinicalDashboard"));
const QuestionnaireReviews = React.lazy(() => import("@/pages/anesthesia/QuestionnaireReviews"));
const SurgerySettings = React.lazy(() => import("@/pages/surgery/SurgerySettings"));
const SurgeryPreOpList = React.lazy(() => import("@/pages/surgery/SurgeryPreOpList"));
const SurgeryPreOpDetail = React.lazy(() => import("@/pages/surgery/SurgeryPreOpDetail"));
const SurgeryChecklistMatrix = React.lazy(() => import("@/pages/surgery/ChecklistMatrix"));
const BusinessDashboard = React.lazy(() => import("@/pages/business/Dashboard"));
const CostAnalytics = React.lazy(() => import("@/pages/business/CostAnalytics"));
const TimeAnalytics = React.lazy(() => import("@/pages/business/TimeAnalytics"));
const StaffCosts = React.lazy(() => import("@/pages/business/StaffCosts"));
const SimplifiedDashboard = React.lazy(() => import("@/pages/business/SimplifiedDashboard"));
const SimplifiedStaff = React.lazy(() => import("@/pages/business/SimplifiedStaff"));
const BusinessContracts = React.lazy(() => import("@/pages/business/Contracts"));
const WorkerContractForm = React.lazy(() => import("@/pages/WorkerContractForm"));
const ExternalWorklog = React.lazy(() => import("@/pages/ExternalWorklog"));
const WorklogManagement = React.lazy(() => import("@/pages/WorklogManagement"));
const UnitWorklogs = React.lazy(() => import("@/pages/UnitWorklogs"));
const EditableValuesDemo = React.lazy(() => import("@/pages/EditableValuesDemo"));
const ApiPlayground = React.lazy(() => import("@/pages/ApiPlayground"));
const ClinicInvoices = React.lazy(() => import("@/pages/clinic/Invoices"));
const ClinicServices = React.lazy(() => import("@/pages/clinic/Services"));
const ClinicQuestionnaires = React.lazy(() => import("@/pages/clinic/UnassociatedQuestionnaires"));
const ClinicAppointments = React.lazy(() => import("@/pages/clinic/Appointments"));
const PatientQuestionnaire = React.lazy(() => import("@/pages/PatientQuestionnaire"));
const PatientPortal = React.lazy(() => import("@/pages/PatientPortal"));
const ExternalSurgeryRequest = React.lazy(() => import("@/pages/ExternalSurgeryRequest"));
const LogisticInventory = React.lazy(() => import("@/pages/logistic/LogisticInventory"));
const LogisticOrders = React.lazy(() => import("@/pages/logistic/LogisticOrders"));
const LogisticMatches = React.lazy(() => import("@/pages/logistic/LogisticMatches"));

function PageLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
    </div>
  );
}

function HomeRedirect() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const savedModule = localStorage.getItem("activeModule");
    
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

    const userHospitals = (user as any)?.hospitals;
    if (userHospitals && userHospitals.length > 0) {
      const savedHospitalKey = localStorage.getItem('activeHospital');
      let activeHospital = userHospitals[0];
      if (savedHospitalKey) {
        const saved = userHospitals.find((h: any) => 
          `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
        );
        if (saved) activeHospital = saved;
      }

      if (activeHospital.unitType === 'business') {
        navigate("/business", { replace: true });
        return;
      }

      if (activeHospital.unitType === 'anesthesia') {
        navigate("/anesthesia/op", { replace: true });
        return;
      }

      if (activeHospital.unitType === 'or') {
        navigate("/surgery/op", { replace: true });
        return;
      }

      if (activeHospital.unitType === 'clinic') {
        navigate("/clinic", { replace: true });
        return;
      }
    }

    navigate("/inventory/items", { replace: true });
  }, [navigate, user]);

  return <PageLoader />;
}

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <PageLoader />;
  }

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {/* Public routes accessible regardless of auth */}
          <Route path="/patient/:token" component={PatientPortal} />
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
              <Route path="/inventory">{() => <Items />}</Route>
              <Route path="/inventory/items">{() => <Items />}</Route>
              <Route path="/inventory/services">{() => <ClinicServices />}</Route>
              <Route path="/inventory/scan">{() => <Scan />}</Route>
              <Route path="/inventory/orders">{() => <Orders />}</Route>
              <Route path="/inventory/alerts">{() => <Alerts />}</Route>
              <Route path="/inventory/controlled">{() => <ControlledLog />}</Route>
              <Route path="/inventory/checklists">{() => <Checklists />}</Route>
              <Route path="/inventory/matches">{() => <SupplierMatches />}</Route>
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
      </Suspense>
      
      {/* Force password change dialog */}
      {isAuthenticated && (user as any)?.mustChangePassword && (
        <Suspense fallback={null}>
          <ChangePasswordDialog open={true} required={true} />
        </Suspense>
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
