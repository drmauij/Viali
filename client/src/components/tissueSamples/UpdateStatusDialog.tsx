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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  TISSUE_SAMPLE_TYPES,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";
import type { TissueSample } from "@shared/schema";

interface Props {
  sample: TissueSample;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function UpdateStatusDialog({ sample, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const config =
    TISSUE_SAMPLE_TYPES[sample.sampleType as TissueSampleType];
  const [toStatus, setToStatus] = useState(sample.status);
  const [note, setNote] = useState("");

  const m = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/tissue-samples/${sample.id}/status`, {
        toStatus,
        note: note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissue-samples", sample.patientId] });
      qc.invalidateQueries({ queryKey: ["tissue-sample", sample.id] });
      onOpenChange(false);
      setNote("");
    },
    onError: (e: any) => {
      const msg =
        e?.code === "INVALID_STATUS"
          ? t("tissueSamples.errors.invalidStatus")
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
          <DialogTitle>{t("tissueSamples.status")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>{t("tissueSamples.status")}</Label>
            <Select value={toStatus} onValueChange={setToStatus}>
              <SelectTrigger data-testid="select-tissue-sample-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(config?.statuses ?? []).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t("tissueSamples.history.noteLabel")}</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              data-testid="textarea-tissue-sample-status-note"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || toStatus === sample.status}
            data-testid="button-tissue-sample-status-save"
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
