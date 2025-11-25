import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "./useActiveHospital";

export type HospitalAnesthesiaSettings = {
  id: string;
  hospitalId: string;
  allergyList?: Array<{ id: string; label: string }>;
  medicationLists?: {
    anticoagulation?: Array<{ id: string; label: string }>;
    general?: Array<{ id: string; label: string }>;
  };
  illnessLists?: {
    cardiovascular?: Array<{ id: string; label: string }>;
    pulmonary?: Array<{ id: string; label: string }>;
    gastrointestinal?: Array<{ id: string; label: string }>;
    kidney?: Array<{ id: string; label: string }>;
    metabolic?: Array<{ id: string; label: string }>;
    neurological?: Array<{ id: string; label: string }>;
    psychiatric?: Array<{ id: string; label: string }>;
    skeletal?: Array<{ id: string; label: string }>;
    coagulation?: Array<{ id: string; label: string }>;
    infectious?: Array<{ id: string; label: string }>;
    woman?: Array<{ id: string; label: string }>;
    noxen?: Array<{ id: string; label: string }>;
    children?: Array<{ id: string; label: string }>;
  };
  checklistItems?: {
    signIn?: Array<{ id: string; label: string }>;
    timeOut?: Array<{ id: string; label: string }>;
    signOut?: Array<{ id: string; label: string }>;
  };
  createdAt: string;
  updatedAt: string;
};

export function useHospitalAnesthesiaSettings() {
  const activeHospital = useActiveHospital();

  return useQuery<HospitalAnesthesiaSettings | undefined>({
    queryKey: [`/api/anesthesia/settings/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
}
