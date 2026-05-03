import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "./useActiveHospital";
import type { IllnessListItem, LocalizedListItem } from "@shared/schema";

export type HospitalAnesthesiaSettings = {
  id: string;
  hospitalId: string;
  allergyList?: Array<IllnessListItem>;
  medicationLists?: {
    anticoagulation?: Array<LocalizedListItem>;
    general?: Array<LocalizedListItem>;
  };
  illnessLists?: {
    cardiovascular?: Array<IllnessListItem>;
    pulmonary?: Array<IllnessListItem>;
    gastrointestinal?: Array<IllnessListItem>;
    kidney?: Array<IllnessListItem>;
    metabolic?: Array<IllnessListItem>;
    neurological?: Array<IllnessListItem>;
    psychiatric?: Array<IllnessListItem>;
    skeletal?: Array<IllnessListItem>;
    coagulation?: Array<IllnessListItem>;
    infectious?: Array<IllnessListItem>;
    woman?: Array<IllnessListItem>;
    noxen?: Array<IllnessListItem>;
    children?: Array<IllnessListItem>;
    anesthesiaHistory?: Array<IllnessListItem>;
    dental?: Array<IllnessListItem>;
    ponvTransfusion?: Array<IllnessListItem>;
  };
  checklistItems?: {
    signIn?: Array<LocalizedListItem>;
    timeOut?: Array<LocalizedListItem>;
    signOut?: Array<LocalizedListItem>;
  };
  createdAt: string;
  updatedAt: string;
};

export function useHospitalAnesthesiaSettings(hospitalIdOverride?: string) {
  const activeHospital = useActiveHospital();
  const hospitalId = hospitalIdOverride || activeHospital?.id;

  return useQuery<HospitalAnesthesiaSettings | undefined>({
    queryKey: [`/api/anesthesia/settings/${hospitalId}`],
    enabled: !!hospitalId,
  });
}
