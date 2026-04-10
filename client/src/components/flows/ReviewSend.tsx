import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Rocket, Save, FlaskConical } from "lucide-react";
import type { Channel } from "./ChannelPicker";

interface Props {
  patientCount: number | null;
  channel: Channel | null;
  promoCode: string | null;
  campaignName: string;
  onSend: () => Promise<void>;
  onSaveDraft: () => Promise<void>;
  onSendTest: (recipient: string, testVars: { vorname: string; nachname: string; behandlung: string }) => Promise<void>;
  sending: boolean;
  savingDraft: boolean;
  sendingTest: boolean;
  disabled: boolean;
}

export default function ReviewSend({
  patientCount,
  channel,
  promoCode,
  campaignName,
  onSend,
  onSaveDraft,
  onSendTest,
  sending,
  savingDraft,
  sendingTest,
  disabled,
}: Props) {
  const { t } = useTranslation();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [testVorname, setTestVorname] = useState("Maria");
  const [testNachname, setTestNachname] = useState("Muster");
  const [testBehandlung, setTestBehandlung] = useState("Fettabsaugung");

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

  const testPlaceholder = channel === "sms" ? "+41791234567" : "test@example.com";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-4 rounded-xl border border-primary/20 bg-primary/5">
        <div>
          <div className="font-semibold text-sm">{campaignName || t("flows.review.campaign", "Campaign")}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {summary || t("flows.review.fillAllSteps", "Please complete all steps")}
          </div>
        </div>
        <div className="flex gap-2">
          {/* Save Draft */}
          <Button
            variant="outline"
            onClick={onSaveDraft}
            disabled={savingDraft}
            className="gap-2"
          >
            {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("flows.review.saveDraft", "Save Draft")}
          </Button>

          {/* Send Test */}
          <Button
            variant="secondary"
            onClick={() => setTestOpen(true)}
            disabled={disabled || sendingTest}
            className="gap-2"
          >
            {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
            {t("flows.review.sendTest", "Send Test")}
          </Button>

          {/* Send Campaign */}
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={disabled || sending}
            className="gap-2"
            size="lg"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            {t("flows.review.send", "Send Campaign")}
          </Button>
        </div>
      </div>

      {/* Send Test Dialog */}
      <Dialog open={testOpen} onOpenChange={setTestOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("flows.review.testTitle", "Send Test Message")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t("flows.review.testDesc", "Send a test message with sample data to verify before sending to all recipients.")}
            </p>
            <div>
              <Label>{channel === "sms" ? t("flows.review.testPhone", "Phone Number") : t("flows.review.testEmail", "Email Address")}</Label>
              <Input
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={testPlaceholder}
                className="mt-1"
              />
            </div>
            <div className="border-t pt-3">
              <p className="text-xs text-muted-foreground mb-2">{t("flows.review.testVarsTitle", "Template variables for test:")}</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label className="text-xs">{"{{vorname}}"}</Label>
                  <Input value={testVorname} onChange={(e) => setTestVorname(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{"{{nachname}}"}</Label>
                  <Input value={testNachname} onChange={(e) => setTestNachname(e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">{"{{behandlung}}"}</Label>
                  <Input value={testBehandlung} onChange={(e) => setTestBehandlung(e.target.value)} className="h-8 text-sm" />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTestOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button
              onClick={async () => {
                await onSendTest(testRecipient, { vorname: testVorname, nachname: testNachname, behandlung: testBehandlung });
                setTestOpen(false);
              }}
              disabled={!testRecipient.trim() || sendingTest}
              className="gap-2"
            >
              {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              {t("flows.review.sendTestNow", "Send Test")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Send Confirm Dialog */}
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
