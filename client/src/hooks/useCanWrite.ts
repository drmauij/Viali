import { useActiveHospital } from "./useActiveHospital";
import { WRITE_ROLES } from "@shared/roles";

export function useCanWrite(): boolean {
  const activeHospital = useActiveHospital();

  if (!activeHospital?.role) return false;

  return (WRITE_ROLES as readonly string[]).includes(activeHospital.role);
}
