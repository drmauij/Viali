import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "./useActiveHospital";

export type HospitalAnesthesiaSettings = {
  id: string;
  hospitalId: string;
  allergyList?: string[];
  medicationLists?: {
    anticoagulation?: string[];
    general?: string[];
  };
  illnessLists?: {
    cardiovascular?: string[];
    pulmonary?: string[];
    gastrointestinal?: string[];
    kidney?: string[];
    metabolic?: string[];
    neurological?: string[];
    psychiatric?: string[];
    skeletal?: string[];
    woman?: string[];
    noxen?: string[];
    children?: string[];
  };
  checklistItems?: {
    signIn?: string[];
    timeOut?: string[];
    signOut?: string[];
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
