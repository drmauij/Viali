import { Switch, Route, Redirect, useLocation } from "wouter";
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
import ErrorBoundary from "@/components/ErrorBoundary";
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
const AdminSettings = React.lazy(() => import("@/pages/admin/Settings"));
const AdminClinical = React.lazy(() => import("@/pages/admin/Clinical"));
const AdminIntegrations = React.lazy(() => import("@/pages/admin/Integrations"));
const AdminUsers = React.lazy(() => import("@/pages/admin/Users"));
const AdminBilling = React.lazy(() => import("@/pages/admin/Billing"));
const AdminPostopOrderTemplates = React.lazy(() => import("@/pages/admin/PostopOrderTemplates"));
const AdminGroups = React.lazy(() => import("@/pages/admin/Groups"));
const AdminGroupDetail = React.lazy(() => import("@/pages/admin/GroupDetail"));
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
const HR = React.lazy(() => import("@/pages/business/HR"));
const WorkerContractForm = React.lazy(() => import("@/pages/WorkerContractForm"));
const ExternalWorklog = React.lazy(() => import("@/pages/ExternalWorklog"));
const WorklogManagement = React.lazy(() => import("@/pages/WorklogManagement"));
const UnitWorklogs = React.lazy(() => import("@/pages/UnitWorklogs"));
const WorktimeKiosk = React.lazy(() => import("@/pages/clinic/WorktimeKiosk"));
const PublicWorktimeKiosk = React.lazy(() => import("@/pages/PublicWorktimeKiosk"));
const CancelAppointment = React.lazy(() => import("@/pages/CancelAppointment"));
const ManageAppointment = React.lazy(() => import("@/pages/ManageAppointment"));
const BookAppointment = React.lazy(() => import("@/pages/BookAppointment"));
const BookGroup = React.lazy(() => import("@/pages/BookGroup"));
const PublicApiDocs = React.lazy(() => import("@/pages/PublicApiDocs"));
const EditableValuesDemo = React.lazy(() => import("@/pages/EditableValuesDemo"));
const ApiPlayground = React.lazy(() => import("@/pages/ApiPlayground"));
const ClinicInvoices = React.lazy(() => import("@/pages/clinic/Invoices"));
const ClinicServices = React.lazy(() => import("@/pages/clinic/Services"));
const ClinicShiftTypes = React.lazy(() => import("@/pages/clinic/ShiftTypes"));
const ClinicShifts = React.lazy(() => import("@/pages/clinic/Shifts"));
const ClinicQuestionnaires = React.lazy(() => import("@/pages/clinic/UnassociatedQuestionnaires"));
const ClinicAppointments = React.lazy(() => import("@/pages/clinic/Appointments"));
const ClinicWebsite = React.lazy(() => import("@/pages/clinic/Website"));
const PatientQuestionnaire = React.lazy(() => import("@/pages/PatientQuestionnaire"));
const QuestionnaireAliasResolver = React.lazy(() => import("@/pages/QuestionnaireAliasResolver"));
const PatientPortal = React.lazy(() => import("@/pages/PatientPortal"));
const PatientRedirect = React.lazy(() => import("@/pages/PatientRedirect"));
const ExternalSurgeryRequest = React.lazy(() => import("@/pages/ExternalSurgeryRequest"));
const SurgeonPortal = React.lazy(() => import("@/pages/SurgeonPortal"));
const LogisticInventory = React.lazy(() => import("@/pages/logistic/LogisticInventory"));
const LogisticOrders = React.lazy(() => import("@/pages/logistic/LogisticOrders"));
const LogisticMatches = React.lazy(() => import("@/pages/logistic/LogisticMatches"));
const Funnels = React.lazy(() => import("@/pages/business/Funnels"));
const Flows = React.lazy(() => import("@/pages/business/Flows"));
const FlowCreate = React.lazy(() => import("@/pages/business/FlowCreate"));
const FlowMetrics = React.lazy(() => import("@/pages/business/FlowMetrics"));
const BusinessGroup = React.lazy(() => import("@/pages/business/Group"));
const ChainCockpit = React.lazy(() => import("@/pages/chain/Cockpit"));
const ChainFunnels = React.lazy(() => import("@/pages/chain/Funnels"));
const ChainFlows = React.lazy(() => import("@/pages/chain/Flows"));
const ChainFlowCreate = React.lazy(() => import("@/pages/chain/FlowCreate"));
const ChainLocations = React.lazy(() => import("@/pages/chain/Locations"));
const ChainTeam = React.lazy(() => import("@/pages/chain/Team"));

function PageLoader() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-gray-100" data-testid="loading-spinner" />
    </div>
  );
}

function SaveRedirectAndGoHome() {
  const [, navigate] = useLocation();

  useEffect(() => {
    const target = window.location.pathname + window.location.search;
    if (target !== "/" && !target.startsWith("/reset-password")) {
      sessionStorage.setItem("postLoginRedirect", target);
    }
    navigate("/", { replace: true });
  }, [navigate]);

  return <PageLoader />;
}

function HomeRedirect() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    const postLoginRedirect = sessionStorage.getItem("postLoginRedirect");
    if (postLoginRedirect && postLoginRedirect !== "/") {
      sessionStorage.removeItem("postLoginRedirect");
      navigate(postLoginRedirect, { replace: true });
      return;
    }

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

    // Chain admin default landing: if the user holds a group_admin role
    // anywhere and there's no saved module from a previous session, send
    // them straight to /chain. Patrik logs in → cockpit, no clinic detour.
    const isGroupAdmin = (user as any)?.hospitals?.some?.(
      (h: any) => h.role === "group_admin",
    );
    const isPlatformAdmin = !!(user as any)?.isPlatformAdmin;
    if ((isGroupAdmin || isPlatformAdmin) && !savedModule) {
      navigate("/chain", { replace: true });
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

function LeadRedirect() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const params = window.location.pathname.match(/^\/leads\/(.+)$/);
  const leadId = params?.[1];

  useEffect(() => {
    if (!user || !leadId) return;

    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) {
      navigate("/", { replace: true });
      return;
    }

    const savedHospitalKey = localStorage.getItem('activeHospital');
    let activeHospital = userHospitals[0];
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) =>
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) activeHospital = saved;
    }

    let basePath = "/clinic/appointments";
    if (activeHospital.unitType === 'anesthesia') basePath = "/anesthesia/appointments";
    else if (activeHospital.unitType === 'or') basePath = "/surgery/appointments";

    navigate(`${basePath}?leadId=${leadId}`, { replace: true });
  }, [navigate, user, leadId]);

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
          <Route path="/patient/:token">{(params) => <ErrorBoundary><PatientPortal /></ErrorBoundary>}</Route>
          <Route path="/questionnaire/hospital/:token">{(params) => <ErrorBoundary><PatientQuestionnaire /></ErrorBoundary>}</Route>
          <Route path="/questionnaire/:token">{(params) => <ErrorBoundary><PatientQuestionnaire /></ErrorBoundary>}</Route>
          <Route path="/q/:alias" component={QuestionnaireAliasResolver} />
          <Route path="/external-surgery/:token" component={ExternalSurgeryRequest} />
          <Route path="/surgeon-portal/:token" component={SurgeonPortal} />
          <Route path="/contract/:token" component={WorkerContractForm} />
          <Route path="/worklog/:token" component={ExternalWorklog} />
          <Route path="/kiosk/:token" component={PublicWorktimeKiosk} />
          <Route path="/manage-appointment/:token" component={ManageAppointment} />
          <Route path="/cancel-appointment/:token" component={ManageAppointment} />
          <Route path="/book/g/:token" component={BookGroup} />
          <Route path="/book/:token" component={BookAppointment} />
          <Route path="/api" component={PublicApiDocs} />

          {!isAuthenticated ? (
            <>
              <Route path="/" component={Landing} />
              <Route path="/reset-password" component={ResetPassword} />
              <Route component={SaveRedirectAndGoHome} />
            </>
          ) : (
            <>
              <Route path="/" component={HomeRedirect} />
              {/* Lead deep link — redirects to appointments with ?leadId= */}
              <Route path="/leads/:leadId" component={LeadRedirect} />
              {/* Module-agnostic patient redirect (card reader) */}
              <Route path="/patients/:id" component={PatientRedirect} />
              <Route path="/patients" component={PatientRedirect} />
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
              <Route path="/admin">{() => <ProtectedRoute requireAdmin><AdminSettings /></ProtectedRoute>}</Route>
              <Route path="/admin/clinical">{() => <ProtectedRoute requireAdmin><AdminClinical /></ProtectedRoute>}</Route>
              <Route path="/admin/users">{() => <ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>}</Route>
              <Route path="/admin/integrations">{() => <ProtectedRoute requireAdmin><AdminIntegrations /></ProtectedRoute>}</Route>
              <Route path="/admin/billing">{() => <ProtectedRoute requireAdmin><AdminBilling /></ProtectedRoute>}</Route>
              <Route path="/admin/postop-order-templates">{() => <ProtectedRoute requireAdmin><AdminPostopOrderTemplates /></ProtectedRoute>}</Route>
              {/* Platform Module — cross-tenant Viali operator surface. */}
              <Route path="/platform">{() => <Redirect to="/platform/groups" />}</Route>
              <Route path="/platform/groups">{() => <ProtectedRoute requirePlatform><AdminGroups /></ProtectedRoute>}</Route>
              <Route path="/platform/groups/:id">{() => <ProtectedRoute requirePlatform><AdminGroupDetail /></ProtectedRoute>}</Route>
              {/* Legacy /admin/groups paths — redirect to /platform/groups so in-flight
                  bookmarks and existing links don't 404 while Platform module rolls out. */}
              <Route path="/admin/groups/:id">{(params) => <Redirect to={`/platform/groups/${params.id}`} />}</Route>
              <Route path="/admin/groups">{() => <Redirect to="/platform/groups" />}</Route>
              <Route path="/admin/cameras">{() => <Redirect to="/admin/integrations" />}</Route>

              {/* Chain Module — group-admin operator surface for a single chain. */}
              <Route path="/chain">{() => <ProtectedRoute requireChain><ChainCockpit /></ProtectedRoute>}</Route>
              <Route path="/chain/funnels">{() => <ProtectedRoute requireChain><ChainFunnels /></ProtectedRoute>}</Route>
              <Route path="/chain/flows">{() => <ProtectedRoute requireChain><ChainFlows /></ProtectedRoute>}</Route>
              <Route path="/chain/flows/new">{() => <ProtectedRoute requireChain><ChainFlowCreate /></ProtectedRoute>}</Route>
              <Route path="/chain/flows/:id">{(params) => <ProtectedRoute requireChain><ChainFlowCreate editId={params.id} /></ProtectedRoute>}</Route>
              <Route path="/chain/locations">{() => <ProtectedRoute requireChain><ChainLocations /></ProtectedRoute>}</Route>
              <Route path="/chain/team">{() => <ProtectedRoute requireChain><ChainTeam /></ProtectedRoute>}</Route>
              <Route path="/chain/admin">{() => <ProtectedRoute requireChain><BusinessGroup /></ProtectedRoute>}</Route>
              {/* Legacy /admin/chain and /business/group paths — redirect into Chain
                  module. Phase A ships this component unchanged at its new home. */}
              <Route path="/admin/chain">{() => <Redirect to="/chain/admin" />}</Route>
              <Route path="/business/group">{() => <Redirect to="/chain/admin" />}</Route>
              {/* Funnels (conversion tracking / ad-funnel analytics). Previously
                  lived at /business/marketing; renamed for clarity since the
                  page shows funnels/ROI, not the generic "marketing" concept.
                  Old URL kept as a redirect so bookmarks survive. */}
              <Route path="/business/funnels">{() => <ProtectedRoute requireBusiness><Funnels /></ProtectedRoute>}</Route>
              <Route path="/business/marketing">{() => <Redirect to="/business/funnels" />}</Route>
              <Route path="/business/flows/new">{() => <ProtectedRoute requireBusiness><FlowCreate /></ProtectedRoute>}</Route>
              <Route path="/business/flows/:id/metrics">{(params) => <ProtectedRoute requireBusiness><FlowMetrics /></ProtectedRoute>}</Route>
              <Route path="/business/flows/:id">{(params) => <ProtectedRoute requireBusiness><FlowCreate editId={params.id} /></ProtectedRoute>}</Route>
              <Route path="/business/flows">{() => <ProtectedRoute requireBusiness><Flows /></ProtectedRoute>}</Route>
              <Route path="/business">{() => <ProtectedRoute requireBusiness><CostAnalytics /></ProtectedRoute>}</Route>
              <Route path="/business/administration">{() => <ProtectedRoute requireBusiness><SimplifiedDashboard /></ProtectedRoute>}</Route>
              <Route path="/business/hr">{() => <ProtectedRoute requireBusiness><HR /></ProtectedRoute>}</Route>
              <Route path="/business/staff">{() => <ProtectedRoute requireBusiness><HR /></ProtectedRoute>}</Route>
              <Route path="/business/contracts">{() => <ProtectedRoute requireBusiness><HR /></ProtectedRoute>}</Route>
              <Route path="/business/costs">{() => <ProtectedRoute requireBusiness><CostAnalytics /></ProtectedRoute>}</Route>
              <Route path="/business/time">{() => <ProtectedRoute requireBusiness><TimeAnalytics /></ProtectedRoute>}</Route>
              <Route path="/business/staff-full">{() => <ProtectedRoute requireBusiness><StaffCosts /></ProtectedRoute>}</Route>
              <Route path="/business/dashboard-full">{() => <ProtectedRoute requireBusiness><BusinessDashboard /></ProtectedRoute>}</Route>
              <Route path="/business/worklogs">{() => <ProtectedRoute requireBusiness><HR /></ProtectedRoute>}</Route>
              {/* Worktime Kiosk - any authenticated user */}
              <Route path="/worktime-kiosk" component={WorktimeKiosk} />
              {/* Clinic Module - ambulatory invoicing */}
              <Route path="/clinic">{() => <ProtectedRoute requireClinic><ClinicAppointments /></ProtectedRoute>}</Route>
              <Route path="/clinic/appointments">{() => <ProtectedRoute requireClinic><ClinicAppointments /></ProtectedRoute>}</Route>
              <Route path="/clinic/invoices">{() => <ProtectedRoute requireClinic><ClinicInvoices /></ProtectedRoute>}</Route>
              <Route path="/clinic/services">{() => <ProtectedRoute requireClinic><ClinicServices /></ProtectedRoute>}</Route>
              <Route path="/clinic/shift-types">{() => <ProtectedRoute requireClinic requireAdmin><ClinicShiftTypes /></ProtectedRoute>}</Route>
              <Route path="/clinic/shifts">{() => <ProtectedRoute requireClinic><ClinicShifts /></ProtectedRoute>}</Route>
              <Route path="/surgery/shifts">{() => <ProtectedRoute requireSurgery><ClinicShifts /></ProtectedRoute>}</Route>
              <Route path="/anesthesia/shifts">{() => <ProtectedRoute requireAnesthesia><ClinicShifts /></ProtectedRoute>}</Route>
              <Route path="/clinic/questionnaires">{() => <ProtectedRoute requireClinic><ClinicQuestionnaires /></ProtectedRoute>}</Route>
              <Route path="/clinic/patients">{() => <ProtectedRoute requireClinic><Patients /></ProtectedRoute>}</Route>
              <Route path="/clinic/patients/:id">{() => <ProtectedRoute requireClinic><PatientDetail /></ProtectedRoute>}</Route>
              <Route path="/clinic/website">{() => <ProtectedRoute requireClinic><ClinicWebsite /></ProtectedRoute>}</Route>
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

// Recover from mobile standby: repaint the rendering surface and
// refetch stale data so the user never comes back to a blank screen.
function useRepaintOnResume() {
  useEffect(() => {
    let hiddenAt = 0;
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        // Tiny opacity toggle forces the browser to repaint the page
        document.body.style.opacity = '0.99';
        requestAnimationFrame(() => { document.body.style.opacity = ''; });

        // If the tab was hidden for more than 30 seconds, invalidate key
        // queries so mounted components refetch fresh data. We avoid a blanket
        // invalidateQueries() because that refetches every mounted query at
        // once, overwhelming the browser with re-renders and freezing the tab.
        if (hiddenAt && Date.now() - hiddenAt > 30_000) {
          queryClient.invalidateQueries({ queryKey: ['/api/user'] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries'] });
          queryClient.invalidateQueries({ queryKey: ['/api/staff-pool'] });
          queryClient.invalidateQueries({ queryKey: ['/api/room-staff/all'] });
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);
}

function App() {
  useRepaintOnResume();
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
