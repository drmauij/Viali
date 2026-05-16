import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import ModuleDrawer from "./ModuleDrawer";
import { BillingLock } from "./BillingLock";
import { CommandPaletteProvider } from "@/components/CommandPalette";
import { useCardReaderBridge } from "@/hooks/useCardReaderBridge";
import { isDemoMode, toggleDemoMode } from "@/utils/demoMode";
import { queryClient } from "@/lib/queryClient";
import { SidebarProvider } from "@/components/ui/sidebar";
import { RoleModuleSidebar } from "@/components/sidebar/RoleModuleSidebar";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  unitType?: string | null;
  addonWorktime?: boolean;
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [activeHospital, setActiveHospital] = useState<Hospital | undefined>();
  const [demoMode, setDemoMode] = useState(() => isDemoMode());

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        e.preventDefault();
        const next = toggleDemoMode();
        setDemoMode(next);
        // Force refetch all queries so the transform applies/unapplies
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    const userHospitals = (user as any)?.hospitals;
    if (userHospitals && Array.isArray(userHospitals)) {
      setHospitals(userHospitals);
      
      if (!activeHospital && userHospitals.length > 0) {
        // Try to restore from localStorage first
        const savedHospitalKey = localStorage.getItem('activeHospital');
        if (savedHospitalKey) {
          const saved = userHospitals.find(h => 
            `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
          );
          if (saved) {
            setActiveHospital(saved);
            return;
          }
        }
        // Default to first hospital
        setActiveHospital(userHospitals[0]);
        localStorage.setItem('activeHospital', `${userHospitals[0].id}-${userHospitals[0].unitId}-${userHospitals[0].role}`);
      }
    }
  }, [user, activeHospital]);

  // Connect to local card reader bridge (silent if bridge isn't running)
  useCardReaderBridge();

  const handleHospitalChange = (hospital: Hospital) => {
    // Save to localStorage before redirect
    localStorage.setItem('activeHospital', `${hospital.id}-${hospital.unitId}-${hospital.role}`);
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent("hospital-changed"));
    setActiveHospital(hospital);
    
    // Get current path and try to preserve the module page
    const currentPath = window.location.pathname;
    
    // Extract the page type from current path (e.g., "inventory", "op", "patients", "checklists")
    const pathParts = currentPath.split('/').filter(Boolean);
    const currentModule = pathParts[0]; // e.g., "anesthesia", "surgery", "clinic", "business", "inventory"
    const currentPage = pathParts.slice(1).join('/'); // e.g., "inventory", "op", "patients", "checklists/matrix"
    
    // Module prefixes for each unit type
    const getModulePrefix = () => {
      if (hospital.unitType === 'clinic') return "clinic";
      if (hospital.unitType === 'business') return "business";
      if (hospital.unitType === 'anesthesia') return "anesthesia";
      if (hospital.unitType === 'or') return "surgery";
      if (hospital.unitType === 'logistic') return "logistic";
      return "inventory";
    };
    
    const newModulePrefix = getModulePrefix();
    
    // Pages that exist across OR modules (anesthesia/surgery)
    const orSharedPages = ["op", "inventory", "patients", "checklists", "checklists/matrix"];
    
    // Pages that exist across medical modules (anesthesia/surgery/clinic)
    const medicalSharedPages = ["patients", "inventory"];
    
    // Try to preserve the current page if it exists in the new module
    let redirectPath: string;
    
    // Check if we're moving between OR modules (anesthesia <-> surgery)
    const isCurrentOrModule = currentModule === "anesthesia" || currentModule === "surgery";
    const isNewOrModule = hospital.unitType === 'anesthesia' || hospital.unitType === 'or';
    
    // Check if we're staying in a medical module
    const isCurrentMedical = ["anesthesia", "surgery", "clinic"].includes(currentModule);
    const isNewMedical = hospital.unitType === 'anesthesia' || hospital.unitType === 'or' || hospital.unitType === 'clinic';
    
    // Pages that actually exist in each module - only preserve if target module has the page
    const modulePages: Record<string, string[]> = {
      anesthesia: ["op", "patients", "pacu", "preop", "settings", "appointments"],
      surgery: ["op", "patients", "checklists"],
      clinic: ["patients", "appointments", "questionnaires"],
      logistic: ["inventory", "orders"],
      inventory: ["items", "services", "orders", "matches"],
    };
    
    if (isCurrentOrModule && isNewOrModule && orSharedPages.some(page => currentPage === page || currentPage.startsWith(page + "/")) && currentPage !== "inventory") {
      // Moving between OR modules with a shared page (excluding inventory which doesn't exist) - preserve it
      redirectPath = `/${newModulePrefix}/${currentPage}`;
    } else if (isCurrentMedical && isNewMedical && currentPage === "patients") {
      // Only "patients" is shared across medical modules
      redirectPath = `/${newModulePrefix}/patients`;
    } else {
      // Default fallback to module home
      if (hospital.unitType === 'clinic') {
        redirectPath = "/clinic";
      } else if (hospital.unitType === 'business') {
        redirectPath = "/business";
      } else if (hospital.unitType === 'anesthesia') {
        redirectPath = "/anesthesia/op";
      } else if (hospital.unitType === 'or') {
        redirectPath = "/surgery/op";
      } else if (hospital.unitType === 'logistic') {
        redirectPath = "/logistic/inventory";
      } else {
        redirectPath = "/inventory/items";
      }
    }
    
    // Navigate to the appropriate module page
    window.location.href = redirectPath;
  };

  const [location] = useLocation();
  const sidebarEnabled =
    typeof window !== "undefined" && localStorage.getItem("featureSidebar") === "1";

  if (!isAuthenticated) {
    return <div className="screen-container">{children}</div>;
  }

  const innerContent = (
    <>
      {demoMode && (
        <div
          className="fixed top-2 right-2 z-[9999] bg-orange-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg cursor-pointer hover:bg-orange-600 transition-colors"
          onClick={() => {
            const next = toggleDemoMode();
            setDemoMode(next);
            queryClient.invalidateQueries();
          }}
          title="Demo Mode active — click or Ctrl+Shift+D to disable"
        >
          DEMO MODE
        </div>
      )}
      {!sidebarEnabled && <ModuleDrawer />}
      <TopBar
        hospitals={hospitals}
        activeHospital={activeHospital}
        onHospitalChange={handleHospitalChange}
      />
      <BillingLock>{children}</BillingLock>
      <BottomNav />
    </>
  );

  return (
    <CommandPaletteProvider>
      {sidebarEnabled && activeHospital ? (
        <SidebarProvider>
          <RoleModuleSidebar
            hospitals={hospitals as Parameters<typeof RoleModuleSidebar>[0]["hospitals"]}
            activeHospital={activeHospital as Parameters<typeof RoleModuleSidebar>[0]["activeHospital"]}
            activeRoute={location}
            onNavigate={(h, route) => {
              localStorage.setItem(
                "activeHospital",
                `${h.id}-${h.unitId}-${h.role}`,
              );
              window.location.href = route;
            }}
            onSwitchHospital={() => {
              // TopBar's existing dropdown still owns hospital switching
              document.dispatchEvent(new CustomEvent("topbar-open-hospital-picker"));
            }}
          />
          <div className="screen-container flex-1">{innerContent}</div>
        </SidebarProvider>
      ) : (
        <div className="screen-container">{innerContent}</div>
      )}
    </CommandPaletteProvider>
  );
}
