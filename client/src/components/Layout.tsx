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
        setActiveHospital(userHospitals[0]);
      }
    }
  }, [user, activeHospital]);

  const handleHospitalChange = (hospital: Hospital) => {
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
