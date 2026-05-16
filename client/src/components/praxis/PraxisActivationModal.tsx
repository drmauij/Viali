import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Surgeon-portal token from the URL (e.g. /surgeon-portal/:token). Required for auth. */
  token: string;
}

export function PraxisActivationModal({ open, onClose, token }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [sourceName, setSourceName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const activate = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/surgeon-portal/${token}/praxis/activate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceName, password }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body?.error ?? `activation failed (${r.status})`);
      }
      return r.json() as Promise<{ sourceHospitalId: string; activeHospitalKey?: string }>;
    },
    onSuccess: (data) => {
      toast({
        title: t("praxisActivation.success.title", "Praxis aktiviert"),
        description: t("praxisActivation.success.description", "Sie werden zu Ihrem Kalender weitergeleitet ..."),
      });
      // Stamp the new praxis OR row as the active hospital so /surgery/op
      // boots into the newly provisioned tenant rather than whatever the
      // surgeon last used (or the first hospital in their list).
      if (data?.activeHospitalKey) {
        localStorage.setItem("activeHospital", data.activeHospitalKey);
      }
      window.location.href = "/surgery/op";
    },
    onError: (err: any) => {
      toast({
        title: err.message ?? t("praxisActivation.error.title", "Aktivierung fehlgeschlagen"),
        variant: "destructive",
      });
    },
  });

  const valid =
    sourceName.trim().length > 0 &&
    password.length >= 8 &&
    password === confirm;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("praxisActivation.modal.title", "Ihre Praxis auf Viali aktivieren")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "praxisActivation.modal.description",
            "Dadurch wird eine vollständige Viali-Instanz für Ihre Praxis erstellt. Nach der Aktivierung werden Sie weitergeleitet. Ihre bisherigen OP-Anfragen werden automatisch importiert.",
          )}
        </p>
        <div className="space-y-3 mt-4">
          <div>
            <Label htmlFor="praxis-name">{t("praxisActivation.modal.praxisName", "Praxisname")}</Label>
            <Input
              id="praxis-name"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={t("praxisActivation.modal.praxisNamePlaceholder", "Praxis Mueller")}
              data-testid="input-praxis-name"
            />
          </div>
          <div>
            <Label htmlFor="praxis-password">{t("praxisActivation.modal.password", "Passwort")}</Label>
            <Input
              id="praxis-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-praxis-password"
            />
          </div>
          <div>
            <Label htmlFor="praxis-confirm">{t("praxisActivation.modal.confirmPassword", "Passwort bestätigen")}</Label>
            <Input
              id="praxis-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="input-praxis-confirm"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Abbrechen")}
          </Button>
          <Button
            disabled={!valid || activate.isPending}
            onClick={() => activate.mutate()}
            data-testid="button-activate-praxis"
          >
            {activate.isPending
              ? t("praxisActivation.modal.activating", "Wird aktiviert ...")
              : t("praxisActivation.modal.activate", "Aktivieren")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
