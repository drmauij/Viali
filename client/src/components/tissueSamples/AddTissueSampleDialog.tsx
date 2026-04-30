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

interface Props {
  patientId: string;
  extractionSurgeryId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (sample: TissueSample) => void;
}

export function AddTissueSampleDialog({
  patientId,
  extractionSurgeryId,
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

  const m = useMutation({
    mutationFn: async (): Promise<TissueSample> => {
      const res = await apiRequest(
        "POST",
        `/api/patients/${patientId}/tissue-samples`,
        {
          sampleType,
          notes: notes || null,
          extractionSurgeryId: extractionSurgeryId ?? null,
          externalLab: externalLab || null,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const err: Error & { code?: string } = new Error(
          body.message ?? `HTTP ${res.status}`,
        );
        err.code = body.code;
        throw err;
      }
      return res.json();
    },
    onSuccess: (sample) => {
      qc.invalidateQueries({ queryKey: ["tissue-samples", patientId] });
      if (extractionSurgeryId) {
        qc.invalidateQueries({
          queryKey: ["tissue-samples", "surgery", extractionSurgeryId],
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
