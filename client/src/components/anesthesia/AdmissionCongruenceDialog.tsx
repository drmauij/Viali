import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdmissionCongruenceResult } from "@shared/admissionCongruence";
import { formatDateTime, formatDateTimeForInput, dateTimeLocalToISO } from "@/lib/dateUtils";

export type AdmissionCongruenceChoice =
  | { kind: "useSuggested" }
  | { kind: "custom"; admissionTime: Date }
  | { kind: "keepCurrent" }
  | { kind: "cancel" };

interface Props {
  open: boolean;
  result: AdmissionCongruenceResult | null;
  currentAdmission: Date | null;
  newPlannedDate: Date;
  onResolve: (choice: AdmissionCongruenceChoice) => void;
}

export function AdmissionCongruenceDialog({
  open,
  result,
  currentAdmission,
  newPlannedDate,
  onResolve,
}: Props) {
  const { t } = useTranslation();
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (open && result) {
      setCustomValue(formatDateTimeForInput(result.suggestedAdmission));
    }
  }, [open, result]);

  if (!result) return null;

  const reasonText =
    result.reason === "afterStart"
      ? t("admissionCongruence.reasonAfterStart")
      : result.reason === "wrongDay"
      ? t("admissionCongruence.reasonWrongDay")
      : "";

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onResolve({ kind: "cancel" }); }}>
      <DialogContent data-testid="dialog-admission-congruence">
        <DialogHeader>
          <DialogTitle>{t("admissionCongruence.modalTitle")}</DialogTitle>
          {reasonText && <DialogDescription>{reasonText}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>{t("admissionCongruence.currentLabel")}</Label>
            <div className="text-sm text-muted-foreground">
              {currentAdmission ? formatDateTime(currentAdmission) : "—"}
            </div>
          </div>
          <div>
            <Label>{t("admissionCongruence.newStartLabel")}</Label>
            <div className="text-sm text-muted-foreground">
              {formatDateTime(newPlannedDate)}
            </div>
          </div>
          <div>
            <Label>{t("admissionCongruence.suggestedLabel")}</Label>
            <div className="text-sm font-medium">
              {formatDateTime(result.suggestedAdmission)}
            </div>
          </div>
          <div>
            <Label htmlFor="custom-admission">{t("admissionCongruence.customLabel")}</Label>
            <Input
              id="custom-admission"
              type="datetime-local"
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              data-testid="input-admission-custom"
            />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onResolve({ kind: "cancel" })} data-testid="button-admission-cancel">
            {t("admissionCongruence.cancel")}
          </Button>
          <Button variant="outline" onClick={() => onResolve({ kind: "keepCurrent" })} data-testid="button-admission-keep">
            {t("admissionCongruence.keepCurrent")}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const iso = dateTimeLocalToISO(customValue);
              onResolve({ kind: "custom", admissionTime: new Date(iso) });
            }}
            data-testid="button-admission-custom"
          >
            {t("admissionCongruence.saveCustom")}
          </Button>
          <Button onClick={() => onResolve({ kind: "useSuggested" })} data-testid="button-admission-suggested">
            {t("admissionCongruence.useSuggested")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
