import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TISSUE_SAMPLE_TYPES,
  TISSUE_SAMPLE_TYPE_KEYS,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";
import type { TissueSample } from "@shared/schema";
import { formatDate } from "@/lib/dateUtils";

export interface SurgeryOption {
  id: string;
  plannedDate: string | Date;
  plannedSurgery?: string | null;
}

interface Props {
  patientId: string;
  extractionSurgeryId?: string | null;
  /**
   * When set (and `extractionSurgeryId` is null), the dialog renders an
   * optional surgery-picker so the user can link the sample to one of the
   * patient's existing surgeries during manual backfill from the patient tab.
   * The intraop card path leaves this undefined (the surgery is already
   * pinned via `extractionSurgeryId`).
   */
  availableSurgeries?: SurgeryOption[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (sample: TissueSample) => void;
}

const NO_SURGERY = "__none__";

export function AddTissueSampleDialog({
  patientId,
  extractionSurgeryId,
  availableSurgeries,
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const enabledTypes = TISSUE_SAMPLE_TYPE_KEYS.filter(
    (k) => TISSUE_SAMPLE_TYPES[k].enabledInUI,
  );
  const [sampleType, setSampleType] = useState<TissueSampleType>(
    enabledTypes[0],
  );
  const [notes, setNotes] = useState("");
  const [externalLab, setExternalLab] = useState(
    TISSUE_SAMPLE_TYPES[enabledTypes[0]].defaultExternalLab ?? "",
  );
  const [pickedSurgeryId, setPickedSurgeryId] = useState<string>(NO_SURGERY);

  const showSurgeryPicker =
    !extractionSurgeryId && Array.isArray(availableSurgeries);
  const resolvedSurgeryId = extractionSurgeryId
    ?? (pickedSurgeryId === NO_SURGERY ? null : pickedSurgeryId);

  const m = useMutation({
    mutationFn: async (): Promise<TissueSample> => {
      // apiRequest throws via throwIfResNotOk on non-2xx and propagates
      // the body's `code` onto the thrown Error (see queryClient.ts), which
      // onError below reads. No manual !res.ok branch needed.
      const res = await apiRequest(
        "POST",
        `/api/patients/${patientId}/tissue-samples`,
        {
          sampleType,
          notes: notes || null,
          extractionSurgeryId: resolvedSurgeryId,
          externalLab: externalLab || null,
        },
      );
      return res.json();
    },
    onSuccess: (sample) => {
      qc.invalidateQueries({ queryKey: ["tissue-samples", patientId] });
      if (resolvedSurgeryId) {
        qc.invalidateQueries({
          queryKey: ["tissue-samples", "surgery", resolvedSurgeryId],
        });
      }
      toast({
        title: t("tissueSamples.codeCopied"),
        description: sample.code,
      });
      navigator.clipboard.writeText(sample.code).catch(() => undefined);
      onCreated?.(sample);
      onOpenChange(false);
      setNotes("");
      setPickedSurgeryId(NO_SURGERY);
    },
    onError: (e: Error & { code?: string }) => {
      const code = e?.code;
      const msg =
        code === "MISSING_SAMPLE_CODE_PREFIX"
          ? t("tissueSamples.errors.missingPrefix")
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
          <DialogTitle>{t("tissueSamples.addSample")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("tissueSamples.type")}</Label>
            <Select
              value={sampleType}
              onValueChange={(v) => {
                setSampleType(v as TissueSampleType);
                const cfg = TISSUE_SAMPLE_TYPES[v as TissueSampleType];
                setExternalLab(cfg.defaultExternalLab ?? "");
              }}
            >
              <SelectTrigger data-testid="select-tissue-sample-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {enabledTypes.map((k) => (
                  <SelectItem key={k} value={k}>
                    {TISSUE_SAMPLE_TYPES[k].label[i18n.language as "de" | "en"]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("tissueSamples.externalLab")}</Label>
            <Input
              value={externalLab}
              onChange={(e) => setExternalLab(e.target.value)}
              data-testid="input-tissue-sample-external-lab"
            />
          </div>
          {showSurgeryPicker && (
            <div>
              <Label>{t("tissueSamples.linkExtractionSurgery")}</Label>
              <Select
                value={pickedSurgeryId}
                onValueChange={setPickedSurgeryId}
              >
                <SelectTrigger data-testid="select-tissue-sample-extraction-surgery">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SURGERY}>
                    {t("tissueSamples.noSurgeryLink")}
                  </SelectItem>
                  {(availableSurgeries ?? []).map((s) => {
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
          )}
          <div>
            <Label>{t("tissueSamples.notes")}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-tissue-sample-notes"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending}
            data-testid="button-tissue-sample-create"
          >
            {t("tissueSamples.addSample")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
