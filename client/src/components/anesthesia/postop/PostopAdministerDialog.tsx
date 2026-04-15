import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  medicationRef: string;
  dose: string;
  route: "po" | "iv" | "sc" | "im";
  plannedAt: Date;
  onConfirm: (input: { actualDose: string; actualTime: string; note?: string }) => Promise<void>;
}

export function PostopAdministerDialog({ open, onOpenChange, medicationRef, dose, route, plannedAt, onConfirm }: Props) {
  const { t } = useTranslation();
  const [actualDose, setActualDose] = useState(dose);
  const [actualTime, setActualTime] = useState(() => plannedAt.toISOString().substring(11, 16));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm({ actualDose, actualTime, note: note.trim() || undefined });
      setNote("");
      onOpenChange(false);
    } catch (err) {
      console.error("Administer confirm failed:", err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("postopOrders.medExecution.administerTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-sm">
            <strong>{medicationRef}</strong> — {dose} {route.toUpperCase()}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs">{t("postopOrders.medExecution.actualDose")}</label>
              <Input value={actualDose} onChange={(e) => setActualDose(e.target.value)} />
            </div>
            <div className="w-32">
              <label className="text-xs">{t("postopOrders.medExecution.actualTime")}</label>
              <Input type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} />
            </div>
          </div>
          <Textarea
            placeholder={t("postopOrders.medExecution.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleConfirm} disabled={busy}>
            {t("postopOrders.medExecution.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
