import { useActiveHospital } from "./useActiveHospital";

const WRITE_ROLES = ["admin", "manager", "doctor", "nurse", "staff"];

export function useCanWrite(): boolean {
  const activeHospital = useActiveHospital();
  
  if (!activeHospital?.role) return false;
  
  return WRITE_ROLES.includes(activeHospital.role);
}
