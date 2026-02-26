import { useActiveHospital } from "./useActiveHospital";

const SURGERY_PLAN_ROLES = ["admin", "doctor"];
const SURGERY_PLAN_UNIT_TYPES = ["or", "anesthesia"];

export function useCanPlanSurgery(): boolean {
  const activeHospital = useActiveHospital();

  if (!activeHospital?.role || !activeHospital?.unitType) return false;

  return (
    SURGERY_PLAN_ROLES.includes(activeHospital.role) &&
    SURGERY_PLAN_UNIT_TYPES.includes(activeHospital.unitType)
  );
}
