import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

interface Props {
  patientId: string;
  surgeryId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function LinkReimplantDialog({
  patientId,
  surgeryId,
  open,
  onOpenChange,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: samples } = useQuery<TissueSample[]>({
    queryKey: ["tissue-samples", patientId],
    queryFn: () =>
      apiRequest("GET", `/api/patients/${patientId}/tissue-samples`).then(
        (r) => r.json(),
      ),
    enabled: open,
  });

  const candidates = useMemo(
    () =>
      (samples ?? []).filter((s) => {
        const cfg = TISSUE_SAMPLE_TYPES[s.sampleType as TissueSampleType];
        return (
          cfg?.supportsReimplant === true &&
          s.status === "Angefordert zur Reimplantation"
        );
      }),
    [samples],
  );

  const [pickedId, setPickedId] = useState<string | undefined>(undefined);

  const m = useMutation({
    mutationFn: async (id: string) => {
      // Two requests: PATCH the FK, then transition status to Reimplantiert.
      // (Could be a single composite endpoint later; two requests keeps the
      // route surface small for v1.) apiRequest throws on non-2xx, so no
      // explicit ok-checks are needed here.
      await apiRequest("PATCH", `/api/tissue-samples/${id}`, {
        reimplantSurgeryId: surgeryId,
      });
      await apiRequest("POST", `/api/tissue-samples/${id}/status`, {
        toStatus: "Reimplantiert",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tissue-samples", patientId] });
      qc.invalidateQueries({
        queryKey: ["tissue-samples", "surgery", surgeryId],
      });
      onOpenChange(false);
    },
    onError: (e: Error) =>
      toast({
        title: t("common.error"),
        description: e?.message ?? "",
        variant: "destructive",
      }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tissueSamples.linkReimplant")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label>{t("tissueSamples.code")}</Label>
          <Select value={pickedId} onValueChange={setPickedId}>
            <SelectTrigger data-testid="select-tissue-sample-link-reimplant">
              <SelectValue placeholder={t("tissueSamples.code")} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => pickedId && m.mutate(pickedId)}
            disabled={!pickedId || m.isPending}
            data-testid="button-tissue-sample-link-reimplant"
          >
            {t("tissueSamples.linkReimplant")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
