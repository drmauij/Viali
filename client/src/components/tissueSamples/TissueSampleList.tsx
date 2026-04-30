import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import type { TissueSample } from "@shared/schema";
import { TissueSampleCard } from "./TissueSampleCard";

interface Props {
  patientId?: string;
  surgeryId?: string;
  variant?: "patient" | "intraop";
}

export function TissueSampleList({ patientId, surgeryId, variant = "patient" }: Props) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  // patient view: list-by-patient. intraop view: list-by-surgery.
  const queryKey = surgeryId
    ? ["tissue-samples", "surgery", surgeryId]
    : ["tissue-samples", patientId];
  const url = surgeryId
    ? `/api/surgeries/${surgeryId}/tissue-samples`
    : `/api/patients/${patientId}/tissue-samples`;

  const { data, isLoading } = useQuery<TissueSample[]>({
    queryKey,
    queryFn: () => apiRequest("GET", url).then((r) => r.json()),
    enabled: Boolean(surgeryId || patientId),
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">…</div>;

  if (!data || data.length === 0) {
    return (
      <div
        className="text-sm text-muted-foreground italic"
        data-testid="tissue-samples-empty"
      >
        {t("tissueSamples.empty")}
      </div>
    );
  }

  const onClickSurgery = (sid: string) => setLocation(`/anesthesia/op/${sid}`);

  return (
    <div className="space-y-3">
      {data.map((s) => (
        <TissueSampleCard
          key={s.id}
          sample={s}
          onClickSurgery={onClickSurgery}
        />
      ))}
    </div>
  );
}
