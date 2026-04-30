import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/dateUtils";
import type { TissueSample } from "@shared/schema";

interface SurgeryRow {
  id: string;
  plannedDate: string | Date;
  plannedSurgery?: string | null;
}

interface Props {
  sample: TissueSample;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const NO_SURGERY = "__none__";

export function EditExtractionSurgeryDialog({
  sample,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id ?? sample.hospitalId;

  // Mirror the canonical patient-detail surgeries query exactly so we share
  // the cache key (no duplicate fetch when both views are mounted).
  const { data: surgeries, isLoading } = useQuery<SurgeryRow[]>({
    queryKey: [
      `/api/anesthesia/surgeries?hospitalId=${hospitalId}&patientId=${sample.patientId}`,
    ],
    enabled: open && Boolean(hospitalId) && Boolean(sample.patientId),
  });

  const [pickedId, setPickedId] = useState<string>(
    sample.extractionSurgeryId ?? NO_SURGERY,
  );

  // Re-sync local state when the dialog re-opens or the underlying sample's
  // FK changes (e.g. after a successful save).
  useEffect(() => {
    if (open) {
      setPickedId(sample.extractionSurgeryId ?? NO_SURGERY);
    }
  }, [open, sample.extractionSurgeryId]);

  const m = useMutation({
    mutationFn: async () => {
      const next = pickedId === NO_SURGERY ? null : pickedId;
      await apiRequest("PATCH", `/api/tissue-samples/${sample.id}`, {
        extractionSurgeryId: next,
      });
      return next;
    },
    onSuccess: (next) => {
      qc.invalidateQueries({
        queryKey: ["tissue-samples", sample.patientId],
      });
      qc.invalidateQueries({ queryKey: ["tissue-sample", sample.id] });
      const oldId = sample.extractionSurgeryId;
      if (oldId && oldId !== next) {
        qc.invalidateQueries({
          queryKey: ["tissue-samples", "surgery", oldId],
        });
      }
      if (next && next !== oldId) {
        qc.invalidateQueries({
          queryKey: ["tissue-samples", "surgery", next],
        });
      }
      toast({ title: t("common.success") });
      onOpenChange(false);
    },
    onError: (e: Error & { code?: string }) => {
      const msg =
        e?.code === "EXTRACTION_SURGERY_PATIENT_MISMATCH"
          ? t("tissueSamples.errors.surgeryPatientMismatch")
          : e?.code === "EXTRACTION_SURGERY_NOT_FOUND"
            ? t("tissueSamples.errors.surgeryNotFound")
            : (e?.message ?? "");
      toast({
        title: t("common.error"),
        description: msg,
        variant: "destructive",
      });
    },
  });

  const dirty = pickedId !== (sample.extractionSurgeryId ?? NO_SURGERY);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tissueSamples.editExtractionSurgery")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>{t("tissueSamples.extractionSurgery")}</Label>
          <Select
            value={pickedId}
            onValueChange={setPickedId}
            disabled={isLoading}
          >
            <SelectTrigger data-testid="select-tissue-sample-edit-extraction-surgery">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SURGERY}>
                {t("tissueSamples.noSurgeryLink")}
              </SelectItem>
              {(surgeries ?? []).map((s) => {
                const date = formatDate(s.plannedDate);
                const procedure = s.plannedSurgery?.trim() || "—";
                return (
                  <SelectItem key={s.id} value={s.id}>
                    {date} · {procedure}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!dirty || m.isPending}
            data-testid="button-tissue-sample-edit-extraction-surgery"
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
