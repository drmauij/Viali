import { type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";

interface Hospital {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
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
            `${h.id}-${h.locationId}-${h.role}` === savedHospitalKey
          );
          if (saved) {
            setActiveHospital(saved);
            return;
          }
        }
        // Default to first hospital
        setActiveHospital(userHospitals[0]);
        localStorage.setItem('activeHospital', `${userHospitals[0].id}-${userHospitals[0].locationId}-${userHospitals[0].role}`);
      }
    }
  }, [user, activeHospital]);

  const handleHospitalChange = (hospital: Hospital) => {
    // Save to localStorage before reload
    localStorage.setItem('activeHospital', `${hospital.id}-${hospital.locationId}-${hospital.role}`);
    setActiveHospital(hospital);
    // Reload the page to refetch all queries with the new hospital/role context
    window.location.reload();
  };

  if (!isAuthenticated) {
    return <div className="screen-container">{children}</div>;
  }

  return (
    <div className="screen-container">
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
