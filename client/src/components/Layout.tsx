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
  units?Id: string;
  units?Name: string;
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
    // Save to localStorage before reload
    localStorage.setItem('activeHospital', `${hospital.id}-${hospital.unitId}-${hospital.role}`);
    // Dispatch custom event to notify other components
    window.dispatchEvent(new CustomEvent("hospital-changed"));
    setActiveHospital(hospital);
    // Reload the page to refetch all queries with the new hospital/role context
    window.units?.reload();
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
