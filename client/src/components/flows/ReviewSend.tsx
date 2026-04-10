import { useState } from "react";
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

const CHANNEL_LABEL: Record<string, string> = {
  sms: "SMS",
  email: "Email",
  html_email: "Newsletter",
};

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
  const [confirmOpen, setConfirmOpen] = useState(false);

  const summary = [
    patientCount !== null ? `${patientCount} Patienten` : null,
    channel ? CHANNEL_LABEL[channel] : null,
    promoCode ?? null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
      <div>
        <div className="font-semibold text-sm">{campaignName || "Kampagne"}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {summary || "Bitte alle Schritte ausfüllen"}
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
        Kampagne senden
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Kampagne senden?</AlertDialogTitle>
            <AlertDialogDescription>
              {patientCount} Patienten werden eine{" "}
              {channel ? CHANNEL_LABEL[channel] : ""} erhalten.
              {promoCode && ` Rabattcode: ${promoCode}.`}{" "}
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmOpen(false);
                await onSend();
              }}
            >
              Jetzt senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
