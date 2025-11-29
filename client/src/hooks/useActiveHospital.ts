import { useSyncExternalStore } from "react";
import { useAuth } from "./useAuth";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  isAnesthesiaModule?: boolean;
  isSurgeryModule?: boolean;
  isBusinessModule?: boolean;
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("hospital-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("hospital-changed", callback);
  };
}

function getSnapshot() {
  return localStorage.getItem('activeHospital');
}

export function useActiveHospital(): Hospital | null {
  const { user } = useAuth();
  const savedHospitalKey = useSyncExternalStore(subscribe, getSnapshot);

  const userHospitals = (user as any)?.hospitals;
  if (!userHospitals || userHospitals.length === 0) return null;
  
  // Try to get active hospital from localStorage
  if (savedHospitalKey) {
    const saved = userHospitals.find((h: any) => 
      `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
    );
    if (saved) return saved;
  }
  
  // Default to first hospital
  return userHospitals[0];
}
