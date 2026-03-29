import { useSyncExternalStore, useEffect } from "react";
import { useAuth } from "./useAuth";
import { applyHospitalSettings } from "@/lib/dateUtils";

interface Hospital {
  id: string;
  name: string;
  role: string;
  unitId: string;
  unitName: string;
  unitType?: string | null;
  // Deprecated: use unitType instead - these are derived from unitType for backwards compatibility
  isAnesthesiaModule?: boolean;
  isSurgeryModule?: boolean;
  isBusinessModule?: boolean;
  isClinicModule?: boolean;
  isLogisticModule?: boolean;
  showControlledMedications?: boolean;
  externalSurgeryToken?: string | null;
  visionAiProvider?: string;
  currency?: string;
  dateFormat?: string;
  hourFormat?: string;
  timezone?: string;
  defaultLanguage?: string;
  // Permission flags
  canConfigure?: boolean;
  canChat?: boolean;
  canPlanOps?: boolean;
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
  let activeHospital: Hospital | null = null;

  if (!userHospitals || userHospitals.length === 0) {
    activeHospital = null;
  } else if (savedHospitalKey) {
    const saved = userHospitals.find((h: any) =>
      `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
    );
    activeHospital = saved || userHospitals[0];
  } else {
    activeHospital = userHospitals[0];
  }

  // Apply hospital date/currency settings globally whenever the active hospital changes
  useEffect(() => {
    if (activeHospital) {
      applyHospitalSettings({
        dateFormat: activeHospital.dateFormat,
        hourFormat: activeHospital.hourFormat,
        currency: activeHospital.currency,
      });
    }
  }, [activeHospital?.id, activeHospital?.dateFormat, activeHospital?.hourFormat, activeHospital?.currency]);

  return activeHospital;
}

export function useHasPermission(permission: 'canConfigure' | 'canChat' | 'canPlanOps'): boolean {
  const activeHospital = useActiveHospital();
  if (!activeHospital) return false;
  return activeHospital.role === 'admin' || activeHospital[permission] === true;
}
