import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import {
  TISSUE_SAMPLE_TYPES,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";
import type { TissueSample } from "@shared/schema";
import { formatDateTime } from "@/lib/dateUtils";

interface Props {
  patientId: string;
  surgeryId: string;
  /**
   * The patient's full sample list — already loaded by the intraop card. The
   * dialog filters this client-side to those that are unlinked AND not
   * destroyed; surfacing the array avoids a second identical fetch.
   */
  patientSamples: TissueSample[] | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LinkExistingSampleDialog({
  patientId,
  surgeryId,
  patientSamples,
  open,
  onOpenChange,
}: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const candidates = useMemo(
    () =>
      (patientSamples ?? []).filter(
        (s) => s.extractionSurgeryId === null && s.status !== "Vernichtet",
      ),
    [patientSamples],
  );

  const [pickedId, setPickedId] = useState<string | undefined>(undefined);

  // Reset selection whenever the dialog re-opens so a stale id from a previous
  // session doesn't pre-fill the Select.
  useEffect(() => {
    if (!open) setPickedId(undefined);
  }, [open]);

  const m = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/tissue-samples/${id}`, {
        extractionSurgeryId: surgeryId,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissue-samples", patientId] });
      qc.invalidateQueries({
        queryKey: ["tissue-samples", "surgery", surgeryId],
      });
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tissueSamples.linkExistingSample")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {candidates.length === 0 ? (
            <p
              className="text-sm text-muted-foreground italic"
              data-testid="tissue-sample-link-existing-empty"
            >
              {t("tissueSamples.linkExistingSampleEmpty")}
            </p>
          ) : (
            <>
              <Label>{t("tissueSamples.code")}</Label>
              <Select value={pickedId} onValueChange={setPickedId}>
                <SelectTrigger data-testid="select-tissue-sample-link-existing">
                  <SelectValue placeholder={t("tissueSamples.code")} />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((s) => {
                    const cfg =
                      TISSUE_SAMPLE_TYPES[s.sampleType as TissueSampleType];
                    const typeLabel =
                      cfg?.label[i18n.language as "de" | "en"] ?? s.sampleType;
                    return (
                      <SelectItem key={s.id} value={s.id}>
                        {s.code} · {typeLabel} · {formatDateTime(s.createdAt)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => pickedId && m.mutate(pickedId)}
            disabled={!pickedId || m.isPending || candidates.length === 0}
            data-testid="button-tissue-sample-link-existing"
          >
            {t("tissueSamples.linkExistingSample")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
