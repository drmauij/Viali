import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useModule } from "@/contexts/ModuleContext";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  adminOnly?: boolean;
}

export default function BottomNav() {
  const { t } = useTranslation();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { activeModule } = useModule();
  const { addons } = useHospitalAddons();
  const [hasCompletedImport, setHasCompletedImport] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    // Try to get active hospital from localStorage
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    // Default to first hospital
    return userHospitals[0];
  }, [user]);

  const isAdmin = activeHospital?.role === "admin";

  // Fetch pending checklist count for the active unit
  const { data: pendingCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/checklists/count/${activeHospital?.id}?unitId=${activeHospital?.unitId}`],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const hasPendingChecklists = (pendingCountData?.count || 0) > 0;

  // Poll for import job status and update localStorage
  useEffect(() => {
    if (!activeHospital?.id) return;

    const pollJobStatus = async () => {
      const savedJob = localStorage.getItem(`import-job-${activeHospital.id}`);
      if (savedJob) {
        try {
          const job = JSON.parse(savedJob);
          
          // Only poll if job is still processing
          if (job.status === 'processing') {
            const statusResponse = await fetch(`/api/import-jobs/${job.jobId}`, {
              credentials: "include"
            });
            const jobStatus = await statusResponse.json();
            
            if (jobStatus.status === 'completed') {
              const completedJob = {
                jobId: job.jobId,
                status: 'completed' as const,
                itemCount: jobStatus.results?.length || 0,
                results: jobStatus.results || []
              };
              localStorage.setItem(`import-job-${activeHospital.id}`, JSON.stringify(completedJob));
              setHasCompletedImport(true);
            } else if (jobStatus.status === 'failed') {
              localStorage.removeItem(`import-job-${activeHospital.id}`);
              setHasCompletedImport(false);
            } else if (jobStatus.status === 'processing') {
              // Update progress information
              const processingJob = {
                jobId: job.jobId,
                status: 'processing' as const,
                itemCount: jobStatus.totalImages || job.itemCount,
                currentImage: jobStatus.currentImage || 0,
                progressPercent: jobStatus.progressPercent || 0,
              };
              localStorage.setItem(`import-job-${activeHospital.id}`, JSON.stringify(processingJob));
            }
          } else if (job.status === 'completed') {
            setHasCompletedImport(true);
          }
        } catch (error) {
          console.error('Failed to poll job status:', error);
        }
      } else {
        setHasCompletedImport(false);
      }
    };

    // Check initially
    pollJobStatus();

    // Poll every 2 seconds
    pollingIntervalRef.current = setInterval(pollJobStatus, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [activeHospital?.id]);

  // Pre-Op tab is only visible for admin and doctor roles, not for nurse
  const canAccessPreOp = activeHospital?.role === "admin" || activeHospital?.role === "doctor";

  const navItems: NavItem[] = useMemo(() => {
    if (activeModule === "anesthesia") {
      const items: NavItem[] = [];
      // Only show appointments tab if Clinic add-on is enabled AND unit has showAppointments enabled (default true)
      if (addons.clinic && activeHospital?.showAppointments !== false) {
        items.push({ id: "appointments", icon: "fas fa-calendar-check", label: t('bottomNav.anesthesia.appointments', 'Appointments'), path: "/anesthesia/appointments" });
      }
      items.push({ id: "patients", icon: "fas fa-users", label: t('bottomNav.anesthesia.patients'), path: "/anesthesia/patients" });
      if (canAccessPreOp) {
        items.push({ id: "preop", icon: "fas fa-clipboard-list", label: t('bottomNav.anesthesia.preop'), path: "/anesthesia/preop" });
      }
      items.push({ id: "op", icon: "fas fa-heartbeat", label: t('bottomNav.anesthesia.op'), path: "/anesthesia/op" });
      items.push({ id: "pacu", icon: "fas fa-bed-pulse", label: t('bottomNav.anesthesia.pacu'), path: "/anesthesia/pacu" });
      items.push({ id: "settings", icon: "fas fa-cog", label: t('bottomNav.anesthesia.settings'), path: "/anesthesia/settings" });
      return items;
    }
    
    if (activeModule === "surgery") {
      const surgeryItems: NavItem[] = [];
      // Only show appointments tab if Clinic add-on is enabled AND unit has showAppointments enabled (default true)
      if (addons.clinic && activeHospital?.showAppointments !== false) {
        surgeryItems.push({ id: "appointments", icon: "fas fa-calendar-check", label: t('bottomNav.surgery.appointments', 'Appointments'), path: "/surgery/appointments" });
      }
      surgeryItems.push({ id: "patients", icon: "fas fa-users", label: t('bottomNav.surgery.patients'), path: "/surgery/patients" });
      // Pre-op tab visible for admin and doctor roles - comes BEFORE OP
      if (canAccessPreOp) {
        surgeryItems.push({ id: "preop", icon: "fas fa-clipboard-list", label: t('bottomNav.surgery.preop', 'Pre-Op'), path: "/surgery/preop" });
      }
      surgeryItems.push({ id: "op", icon: "fas fa-user-nurse", label: t('bottomNav.surgery.op'), path: "/surgery/op" });
      // Checklists tab only visible for admin and doctor roles
      if (canAccessPreOp) {
        surgeryItems.push({ id: "checklists", icon: "fas fa-clipboard-check", label: t('bottomNav.surgery.checklists'), path: "/surgery/checklists" });
      }
      return surgeryItems;
    }
    
    if (activeModule === "admin") {
      return [
        { id: "admin-hospital", icon: "fas fa-hospital", label: t('bottomNav.admin.hospital'), path: "/admin" },
        { id: "admin-users", icon: "fas fa-users", label: t('bottomNav.admin.users'), path: "/admin/users" },
        { id: "admin-cameras", icon: "fas fa-camera", label: t('bottomNav.admin.cameras'), path: "/admin/cameras" },
        { id: "admin-billing", icon: "fas fa-credit-card", label: t('bottomNav.admin.billing', 'Billing'), path: "/admin/billing" },
      ];
    }
    
    if (activeModule === "business") {
      const businessItems: NavItem[] = [
        { id: "business-dashboard", icon: "fas fa-chart-pie", label: t('bottomNav.business.dashboard'), path: "/business" },
      ];
      // Only show Costs, Staff, Contracts, and Worklogs tabs for admin and manager roles (not for staff role)
      // Staff role users can only access Dashboard tab
      if (activeHospital?.role === 'admin' || activeHospital?.role === 'manager') {
        businessItems.push({ id: "business-costs", icon: "fas fa-dollar-sign", label: t('bottomNav.business.costs', 'Costs'), path: "/business/costs" });
        businessItems.push({ id: "business-staff", icon: "fas fa-users", label: t('bottomNav.business.staff'), path: "/business/staff" });
        businessItems.push({ id: "business-contracts", icon: "fas fa-file-signature", label: t('bottomNav.business.contracts', 'Contracts'), path: "/business/contracts" });
        businessItems.push({ id: "business-worklogs", icon: "fas fa-clock", label: t('bottomNav.business.worklogs', 'Worklogs'), path: "/business/worklogs" });
      }
      return businessItems;
    }
    
    if (activeModule === "clinic") {
      const clinicItems: NavItem[] = [];
      // Only show appointments tab if unit has showAppointments enabled (default true)
      if (activeHospital?.showAppointments !== false) {
        clinicItems.push({ id: "clinic-appointments", icon: "fas fa-calendar-check", label: t('bottomNav.clinic.appointments', 'Appointments'), path: "/clinic/appointments" });
      }
      clinicItems.push({ id: "clinic-patients", icon: "fas fa-users", label: t('bottomNav.clinic.patients'), path: "/clinic/patients" });
      if (addons.questionnaire) {
        clinicItems.push({ id: "clinic-questionnaires", icon: "fas fa-file-medical", label: t('bottomNav.clinic.questionnaires', 'Questionnaires'), path: "/clinic/questionnaires" });
      }
      clinicItems.push({ id: "clinic-invoices", icon: "fas fa-file-invoice-dollar", label: t('bottomNav.clinic.invoices'), path: "/clinic" });
      return clinicItems;
    }
    
    if (activeModule === "logistic") {
      return [
        { id: "logistic-inventory", icon: "fas fa-boxes", label: t('bottomNav.logistic.inventory', 'Inventory'), path: "/logistic/inventory" },
        { id: "logistic-orders", icon: "fas fa-clipboard-list", label: t('bottomNav.logistic.orders', 'Orders'), path: "/logistic/orders" },
        { id: "logistic-matches", icon: "fas fa-link", label: t('bottomNav.matches', 'Matches'), path: "/inventory/matches" },
      ];
    }
    
    // Inventory module nav items
    const inventoryItems: NavItem[] = [
      { id: "items", icon: "fas fa-boxes", label: t('bottomNav.items'), path: "/inventory/items" },
      { id: "services", icon: "fas fa-briefcase-medical", label: t('bottomNav.services', 'Services'), path: "/inventory/services" },
      { id: "orders", icon: "fas fa-file-invoice", label: t('bottomNav.orders'), path: "/inventory/orders" },
      { id: "matches", icon: "fas fa-link", label: t('bottomNav.matches'), path: "/inventory/matches" },
    ];
    // Show controlled medications tab if enabled for this unit
    if (activeHospital?.showControlledMedications) {
      inventoryItems.push({ id: "controlled", icon: "fas fa-pills", label: t('bottomNav.controlled', 'BTM'), path: "/inventory/controlled" });
    }
    // Show checklists tab if there are pending checklists for this unit/role
    if (hasPendingChecklists) {
      inventoryItems.push({ id: "checklists", icon: "fas fa-clipboard-check", label: t('bottomNav.checklists', 'Checklists'), path: "/inventory/checklists" });
    }
    return inventoryItems;
  }, [t, activeModule, canAccessPreOp, activeHospital?.role, activeHospital?.showAppointments, activeHospital?.showControlledMedications, hasPendingChecklists, addons.clinic, addons.questionnaire]);

  const isActive = (path: string) => {
    if (path === "/inventory/items") {
      return location === "/inventory" || location?.startsWith("/inventory/items");
    }
    if (path === "/admin") {
      return location === "/admin";
    }
    // Business dashboard is at "/business" but costs is "/business/costs" and time is "/business/time"
    // Need exact match for "/business" to avoid matching "/business/costs" or "/business/time"
    if (path === "/business") {
      return location === "/business" || location === "/business/dashboard";
    }
    // Clinic invoices is at "/clinic" but patients is at "/clinic/patients"
    // Need exact match for "/clinic" to avoid matching "/clinic/patients"
    if (path === "/clinic") {
      return location === "/clinic" || location === "/clinic/invoices" || location?.startsWith("/clinic/invoices/");
    }
    return location?.startsWith(path);
  };

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${isActive(item.path) ? "active" : ""}`}
          onClick={() => navigate(item.path)}
          data-testid={`nav-${item.id}`}
        >
          <div style={{ position: 'relative' }}>
            <i className={item.icon}></i>
            {item.id === 'items' && hasCompletedImport && (
              <span
                className="import-badge"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-8px',
                  width: '10px',
                  height: '10px',
                  backgroundColor: '#10b981',
                  borderRadius: '50%',
                  border: '2px solid var(--background)',
                }}
                data-testid="import-badge"
              />
            )}
            {item.id === 'checklists' && hasPendingChecklists && (
              <span
                className="pending-badge"
                style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-8px',
                  width: '10px',
                  height: '10px',
                  backgroundColor: '#ef4444',
                  borderRadius: '50%',
                  border: '2px solid var(--background)',
                }}
                data-testid="pending-checklists-badge"
              />
            )}
          </div>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
