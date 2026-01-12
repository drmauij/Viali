import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import ModuleDrawer from "./ModuleDrawer";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  isAnesthesiaModule?: boolean;
  isSurgeryModule?: boolean;
  isBusinessModule?: boolean;
  isClinicModule?: boolean;
  isLogisticModule?: boolean;
}

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const { user, isAuthenticated } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [activeHospital, setActiveHospital] = useState<Hospital | undefined>();

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
      if (hospital.isClinicModule) return "clinic";
      if (hospital.isBusinessModule) return "business";
      if (hospital.isAnesthesiaModule) return "anesthesia";
      if (hospital.isSurgeryModule) return "surgery";
      if (hospital.isLogisticModule) return "logistic";
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
    const isNewOrModule = hospital.isAnesthesiaModule || hospital.isSurgeryModule;
    
    // Check if we're staying in a medical module
    const isCurrentMedical = ["anesthesia", "surgery", "clinic"].includes(currentModule);
    const isNewMedical = hospital.isAnesthesiaModule || hospital.isSurgeryModule || hospital.isClinicModule;
    
    // Pages that actually exist in each module - only preserve if target module has the page
    const modulePages: Record<string, string[]> = {
      anesthesia: ["op", "patients", "pacu", "preop", "settings", "appointments"],
      surgery: ["op", "patients", "preop", "checklists"],
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
      if (hospital.isClinicModule) {
        redirectPath = "/clinic";
      } else if (hospital.isBusinessModule) {
        redirectPath = "/business";
      } else if (hospital.isAnesthesiaModule) {
        redirectPath = "/anesthesia/op";
      } else if (hospital.isSurgeryModule) {
        redirectPath = "/surgery/op";
      } else if (hospital.isLogisticModule) {
        redirectPath = "/logistic/inventory";
      } else {
        redirectPath = "/inventory/items";
      }
    }
    
    // Navigate to the appropriate module page
    window.location.href = redirectPath;
  };

  if (!isAuthenticated) {
    return <div className="screen-container">{children}</div>;
  }

  return (
    <div className="screen-container">
      <ModuleDrawer />
      <TopBar
        hospitals={hospitals}
        activeHospital={activeHospital}
        onHospitalChange={handleHospitalChange}
      />
      {children}
      <BottomNav />
    </div>
  );
}
