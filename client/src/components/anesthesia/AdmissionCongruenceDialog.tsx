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
  hospitalTimeZone: string;
  onResolve: (choice: AdmissionCongruenceChoice) => void;
}

function formatDisplay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("de-CH", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toInputValue(date: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function fromInputValue(value: string, tz: string): Date {
  const naive = new Date(value);
  const offsetMinutes = (() => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    }).formatToParts(naive);
    const offsetPart = fmt.find(p => p.type === "timeZoneName")?.value ?? "GMT+0";
    const match = /GMT([+-]?\d+)(?::(\d+))?/.exec(offsetPart);
    if (!match) return 0;
    const sign = match[1].startsWith("-") ? -1 : 1;
    const hours = Math.abs(parseInt(match[1], 10));
    const mins = match[2] ? parseInt(match[2], 10) : 0;
    return sign * (hours * 60 + mins);
  })();
  return new Date(naive.getTime() - offsetMinutes * 60 * 1000);
}

export function AdmissionCongruenceDialog({
  open,
  result,
  currentAdmission,
  newPlannedDate,
  hospitalTimeZone,
  onResolve,
}: Props) {
  const { t } = useTranslation();
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (open && result) {
      setCustomValue(toInputValue(result.suggestedAdmission, hospitalTimeZone));
    }
  }, [open, result, hospitalTimeZone]);

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
              {currentAdmission ? formatDisplay(currentAdmission, hospitalTimeZone) : "—"}
            </div>
          </div>
          <div>
            <Label>{t("admissionCongruence.newStartLabel")}</Label>
            <div className="text-sm text-muted-foreground">
              {formatDisplay(newPlannedDate, hospitalTimeZone)}
            </div>
          </div>
          <div>
            <Label>{t("admissionCongruence.suggestedLabel")}</Label>
            <div className="text-sm font-medium">
              {formatDisplay(result.suggestedAdmission, hospitalTimeZone)}
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
              const parsed = fromInputValue(customValue, hospitalTimeZone);
              onResolve({ kind: "custom", admissionTime: parsed });
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
