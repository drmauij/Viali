import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parameter: "pulse" | "BP" | "spo2";
  value: number;
  kind: "low" | "high";
  action?: string;
  onResolve: (note?: string) => Promise<void>;
}

export function DeviationResolveDialog({ open, onOpenChange, parameter, value, kind, action, onResolve }: Props) {
  const { t } = useTranslation();
  const [note, setNote] = useState("");
  const [isResolving, setIsResolving] = useState(false);

  const handleResolve = async () => {
    setIsResolving(true);
    try {
      await onResolve(note.trim() || undefined);
      setNote("");
      onOpenChange(false);
    } finally {
      setIsResolving(false);
    }
  };

  const label = kind === "low"
    ? t("postopOrders.deviationAlerts.belowMin")
    : t("postopOrders.deviationAlerts.aboveMax");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("postopOrders.deviationAlerts.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            <strong>{parameter.toUpperCase()}:</strong> {value} — {label}
          </div>
          {action && (
            <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100 text-sm">
              <strong>{t("postopOrders.deviationAlerts.actionLabel")}:</strong> {action}
            </div>
          )}
          <Textarea
            placeholder={t("postopOrders.deviationAlerts.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isResolving}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleResolve} disabled={isResolving}>
            {t("postopOrders.deviationAlerts.resolve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
