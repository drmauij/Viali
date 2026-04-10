import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Rocket } from "lucide-react";
import type { Channel } from "./ChannelPicker";

interface Props {
  patientCount: number | null;
  channel: Channel | null;
  promoCode: string | null;
  campaignName: string;
  onSend: () => Promise<void>;
  sending: boolean;
  disabled: boolean;
}

export default function ReviewSend({
  patientCount,
  channel,
  promoCode,
  campaignName,
  onSend,
  sending,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const CHANNEL_LABEL: Record<string, string> = {
    sms: "SMS",
    email: t("flows.channel.email", "Email"),
    html_email: t("flows.channel.newsletter", "Newsletter"),
  };

  const summary = [
    patientCount !== null ? `${patientCount} ${t("flows.segment.patients", "Patients")}` : null,
    channel ? CHANNEL_LABEL[channel] : null,
    promoCode ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div>
        <div className="font-semibold text-sm">{campaignName || t("flows.review.campaign", "Campaign")}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {summary || t("flows.review.fillAllSteps", "Please complete all steps")}
        </div>
      </div>
      <Button
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || sending}
        className="gap-2"
        size="lg"
      >
        {sending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Rocket className="h-4 w-4" />
        )}
        {t("flows.review.send", "Send Campaign")}
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("flows.review.confirmTitle", "Send Campaign?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("flows.review.confirmDescription", "{{count}} patients will receive a {{channel}}.", {
                count: patientCount ?? 0,
                channel: channel ? CHANNEL_LABEL[channel] : "",
              })}
              {promoCode && ` ${t("flows.review.promoCode", "Promo code")}: ${promoCode}.`}{" "}
              {t("flows.review.irreversible", "This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmOpen(false);
                await onSend();
              }}
            >
              {t("flows.review.sendNow", "Send Now")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
