import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "./useActiveHospital";

export interface HospitalAddons {
  questionnaire: boolean;
  dispocura: boolean;
  retell: boolean;
  monitor: boolean;
  surgery: boolean;
  worktime: boolean;
  logistics: boolean;
  clinic: boolean;
}

interface AddonsResponse {
  addons: HospitalAddons;
  questionnaireDisabled?: boolean;
}

export function useHospitalAddons() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const { data, isLoading, error } = useQuery<AddonsResponse>({
    queryKey: ["/api/billing", hospitalId, "status"],
    enabled: !!hospitalId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return {
    addons: data?.addons ?? {
      questionnaire: false,
      dispocura: false,
      retell: false,
      monitor: false,
      surgery: false,
      worktime: false,
      logistics: false,
      clinic: false,
    },
    questionnaireDisabled: data?.questionnaireDisabled ?? false,
    isLoading,
    error,
    hospitalId,
  };
}
