import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const [accepted, setAccepted] = useState(false);

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
        title: t("praxisActivation.success.title", "Practice activated"),
        description: t("praxisActivation.success.description", "Redirecting to your calendar ..."),
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
        title: err.message ?? t("praxisActivation.error.title", "Activation failed"),
        variant: "destructive",
      });
    },
  });

  const valid =
    sourceName.trim().length > 0 &&
    password.length >= 8 &&
    password === confirm &&
    accepted;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("praxisActivation.modal.title", "Activate your practice on Viali")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t(
            "praxisActivation.modal.description",
            "This will create a full Viali instance for your practice. You will be redirected after activation. Your existing surgery requests will be imported automatically.",
          )}
        </p>
        <div className="space-y-3 mt-4">
          <div>
            <Label htmlFor="praxis-name">{t("praxisActivation.modal.praxisName", "Practice name")}</Label>
            <Input
              id="praxis-name"
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              placeholder={t("praxisActivation.modal.praxisNamePlaceholder", "Mueller Practice")}
              data-testid="input-praxis-name"
            />
          </div>
          <div>
            <Label htmlFor="praxis-password">{t("praxisActivation.modal.password", "Password")}</Label>
            <Input
              id="praxis-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-praxis-password"
            />
          </div>
          <div>
            <Label htmlFor="praxis-confirm">{t("praxisActivation.modal.confirmPassword", "Confirm password")}</Label>
            <Input
              id="praxis-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              data-testid="input-praxis-confirm"
            />
          </div>
        </div>
        <div
          data-testid="praxis-beta-banner"
          className="relative mt-4 overflow-hidden rounded-xl border border-indigo-500/40 bg-gradient-to-br from-indigo-600 to-purple-700 p-4 text-white shadow-lg ring-1 ring-indigo-300/30"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-indigo-100" aria-hidden />
            <div className="flex-1 space-y-3">
              {/* Paragraph 1 — beta status + support contact */}
              <div>
                <span className="inline-flex rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  {t("praxisActivation.modal.betaTag", "Beta")}
                </span>
                <p className="mt-1.5 text-sm leading-snug text-indigo-50">
                  {t(
                    "praxisActivation.modal.betaSupport",
                    "This is a beta feature — for any issue please reach us at",
                  )}{" "}
                  <a
                    href="mailto:support@viali.app"
                    className="font-semibold text-white underline underline-offset-2 hover:text-indigo-100"
                  >
                    support@viali.app
                  </a>
                </p>
              </div>
              {/* Paragraph 2 — pricing, visually separated */}
              <div className="border-t border-white/15 pt-3">
                <span className="inline-flex rounded-full bg-emerald-400/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-50">
                  {t("praxisActivation.modal.freeTag", "Free during beta")}
                </span>
                <p className="mt-1.5 text-sm leading-snug text-indigo-100">
                  {t(
                    "praxisActivation.modal.feeNotice",
                    "A subscription fee may apply once Viali leaves beta.",
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
        <label
          htmlFor="praxis-accept"
          className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-foreground"
        >
          <Checkbox
            id="praxis-accept"
            checked={accepted}
            onCheckedChange={v => setAccepted(v === true)}
            data-testid="checkbox-praxis-accept"
            className="mt-0.5"
          />
          <span className="leading-snug">
            {t(
              "praxisActivation.modal.acceptTerms",
              "I understand that this is a beta feature and that a subscription fee may apply once it leaves beta.",
            )}
          </span>
        </label>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={!valid || activate.isPending}
            onClick={() => activate.mutate()}
            data-testid="button-activate-praxis"
          >
            {activate.isPending
              ? t("praxisActivation.modal.activating", "Activating...")
              : t("praxisActivation.modal.activate", "Activate")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
