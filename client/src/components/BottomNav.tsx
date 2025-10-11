import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "react-i18next";
import { useMemo, useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useModule } from "@/contexts/ModuleContext";

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
  const [hasCompletedImport, setHasCompletedImport] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    // Try to get active hospital from localStorage
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.locationId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    // Default to first hospital
    return userHospitals[0];
  }, [user]);

  const isAdmin = activeHospital?.role === "admin";

  // Fetch pending checklist count
  const { data: pendingCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/checklists/count/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
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

  const navItems: NavItem[] = useMemo(() => {
    if (activeModule === "anesthesia") {
      return [
        { id: "patients", icon: "fas fa-users", label: t('bottomNav.anesthesia.patients'), path: "/anesthesia/patients" },
        { id: "cases", icon: "fas fa-briefcase-medical", label: t('bottomNav.anesthesia.cases'), path: "/anesthesia/cases" },
        { id: "reports", icon: "fas fa-chart-line", label: t('bottomNav.anesthesia.reports'), path: "/anesthesia/reports" },
        { id: "settings", icon: "fas fa-cog", label: t('bottomNav.anesthesia.settings'), path: "/anesthesia/settings" },
      ];
    }
    
    const items = [
      { id: "items", icon: "fas fa-boxes", label: t('bottomNav.items'), path: "/items" },
      { id: "orders", icon: "fas fa-file-invoice", label: t('bottomNav.orders'), path: "/orders" },
      { id: "controlled", icon: "fas fa-shield-halved", label: t('bottomNav.controlled'), path: "/controlled" },
      { id: "checklists", icon: "fas fa-clipboard-check", label: t('bottomNav.checklists'), path: "/checklists" },
      { id: "admin", icon: "fas fa-user-shield", label: t('bottomNav.admin'), path: "/admin", adminOnly: true },
    ];
    return items.filter(item => !item.adminOnly || isAdmin);
  }, [t, isAdmin, activeModule]);

  const isActive = (path: string) => {
    if (path === "/items") {
      return location === "/" || location.startsWith("/items");
    }
    if (path === "/") {
      return location === "/";
    }
    return location.startsWith(path);
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
