import { useMemo } from "react";
import { useAuth } from "./useAuth";

interface Hospital {
  id: string;
  name: string;
  role: string;
  locationId: string;
  locationName: string;
}

export function useActiveHospital(): Hospital | null {
  const { user } = useAuth();

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

  return activeHospital;
}
