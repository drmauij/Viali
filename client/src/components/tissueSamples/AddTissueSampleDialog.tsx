import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

interface Lab {
  id: string;
  name: string;
  applicableSampleTypes: string[] | null;
  isDefault: boolean;
}

const NO_SURGERY = "__none__";
const OTHER_LAB = "__other__";

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
  // Phase B: external lab is now a Select sourced from
  // GET /api/tissue-sample-external-labs?type=<sampleType>. The user can
  // pick an existing lab or fall back to manual free-text via "__other__".
  const [pickedLabId, setPickedLabId] = useState<string>("");
  const [manualLabName, setManualLabName] = useState<string>("");
  const [pickedSurgeryId, setPickedSurgeryId] = useState<string>(NO_SURGERY);

  const labsQuery = useQuery<Lab[]>({
    queryKey: [`/api/tissue-sample-external-labs?type=${sampleType}`],
    enabled: open,
  });
  const labs = labsQuery.data ?? [];

  // Auto-select the default lab (or the first lab) when the labs list
  // refreshes and we don't yet have a picked value. If there are no labs at
  // all, fall back to the manual-entry sentinel.
  useEffect(() => {
    if (!open) return;
    if (labsQuery.isLoading) return;
    if (pickedLabId) return; // user already chose
    if (labs.length === 0) {
      setPickedLabId(OTHER_LAB);
      return;
    }
    const def = labs.find((l) => l.isDefault) ?? labs[0];
    setPickedLabId(def.id);
  }, [open, labsQuery.isLoading, labs, pickedLabId]);

  const showSurgeryPicker =
    !extractionSurgeryId && Array.isArray(availableSurgeries);
  const resolvedSurgeryId = extractionSurgeryId
    ?? (pickedSurgeryId === NO_SURGERY ? null : pickedSurgeryId);

  const resolvedLabName: string | null =
    pickedLabId === OTHER_LAB
      ? manualLabName.trim() || null
      : labs.find((l) => l.id === pickedLabId)?.name ?? null;

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
          externalLab: resolvedLabName,
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
      setManualLabName("");
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
                // Reset lab selection so the labs query can re-pick the
                // default for the new type.
                setPickedLabId("");
                setManualLabName("");
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
            <Select
              value={pickedLabId}
              onValueChange={(v) => setPickedLabId(v)}
            >
              <SelectTrigger data-testid="select-tissue-sample-external-lab">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {labs.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                    {l.isDefault
                      ? ` · ${t("tissueSamples.labs.isDefault")}`
                      : ""}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_LAB}>
                  {t("tissueSamples.labs.otherLabel")}
                </SelectItem>
              </SelectContent>
            </Select>
            {pickedLabId === OTHER_LAB && (
              <Input
                className="mt-2"
                value={manualLabName}
                onChange={(e) => setManualLabName(e.target.value)}
                placeholder={t("tissueSamples.labs.manualPlaceholder")}
                data-testid="input-tissue-sample-external-lab-manual"
              />
            )}
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
