import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Send, Loader2, Mail, CheckCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { generateSurgeonSummaryPDF } from "@/lib/surgeonSummaryPdf";
import { useActiveHospital } from "@/hooks/useActiveHospital";

interface SendSurgeonSummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  surgery: any;
  patient: any;
}

export function SendSurgeonSummaryDialog({
  open,
  onOpenChange,
  surgery,
  patient,
}: SendSurgeonSummaryDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [email, setEmail] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const { data: hospitalUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/users`],
    enabled: !!activeHospital?.id && !!surgery?.surgeonId && open,
  });

  const surgeonUser = hospitalUsers.find((u: any) => u.id === surgery?.surgeonId) || null;

  const { data: anesthesiaRecord } = useQuery<any>({
    queryKey: [`/api/anesthesia/records/surgery/${surgery?.id}`],
    enabled: !!surgery?.id && open,
  });

  const { data: staffMembers = [] } = useQuery<any[]>({
    queryKey: [`/api/anesthesia/staff/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id && open,
  });

  useEffect(() => {
    if (open) {
      setIsSent(false);
      if (surgeonUser?.email) {
        setEmail(surgeonUser.email);
      } else {
        setEmail("");
      }
    }
  }, [open, surgeonUser?.email]);

  const formatDateForDisplay = (dateString: string | Date) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const handleSend = async () => {
    if (!email || !surgery || !patient) return;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: t('common.error', 'Error'),
        description: t('anesthesia.surgerySummary.invalidEmail', 'Please enter a valid email address'),
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const doc = generateSurgeonSummaryPDF({
        patient: {
          firstName: patient.firstName,
          surname: patient.surname,
          birthday: patient.birthday,
          patientNumber: patient.patientNumber,
        },
        surgery: {
          plannedSurgery: surgery.plannedSurgery,
          chopCode: surgery.chopCode,
          surgeon: surgery.surgeon,
          plannedDate: surgery.plannedDate,
          actualStartTime: surgery.actualStartTime,
          actualEndTime: surgery.actualEndTime,
          status: surgery.status,
        },
        anesthesiaRecord: anesthesiaRecord ? {
          anesthesiaStartTime: anesthesiaRecord.anesthesiaStartTime,
          anesthesiaEndTime: anesthesiaRecord.anesthesiaEndTime,
          timeMarkers: anesthesiaRecord.timeMarkers,
        } : null,
        staffMembers: staffMembers,
      });

      const pdfBase64 = doc.output('datauristring').split(',')[1];
      const patientName = `${patient.surname}, ${patient.firstName}`;
      const surgeryDate = formatDateForDisplay(surgery.plannedDate);

      await apiRequest('POST', `/api/anesthesia/surgeries/${surgery.id}/send-summary`, {
        toEmail: email,
        pdfBase64,
        patientName,
        procedureName: surgery.plannedSurgery,
        surgeryDate,
        language: i18n.language?.startsWith('de') ? 'de' : 'en',
      });

      setIsSent(true);
      toast({
        title: t('anesthesia.surgerySummary.emailSent', 'Email sent'),
        description: t('anesthesia.surgerySummary.emailSentDescription', 'Surgery summary has been sent successfully'),
      });
    } catch (error: any) {
      console.error('Failed to send surgery summary:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('anesthesia.surgerySummary.emailFailed', 'Failed to send email. Please try again.'),
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="dialog-send-surgeon-summary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            {t('anesthesia.surgerySummary.sendSummaryTitle', 'Send Surgery Summary')}
          </DialogTitle>
          <DialogDescription>
            {t('anesthesia.surgerySummary.sendSummaryDescription', 'Send a simplified surgery summary PDF via email')}
          </DialogDescription>
        </DialogHeader>

        {isSent ? (
          <div className="flex flex-col items-center gap-3 py-6" data-testid="send-summary-success">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <p className="text-sm text-center text-muted-foreground">
              {t('anesthesia.surgerySummary.emailSentTo', 'Summary sent to')} <strong>{email}</strong>
            </p>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              data-testid="button-close-send-summary"
            >
              {t('common.close', 'Close')}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1 text-sm">
              <div><strong>{t('anesthesia.pdf.name', 'Name')}:</strong> {patient?.surname}, {patient?.firstName}</div>
              <div><strong>{t('anesthesia.pdf.procedure', 'Procedure')}:</strong> {surgery?.plannedSurgery}</div>
              <div><strong>{t('anesthesia.pdf.plannedDate', 'Date')}:</strong> {surgery?.plannedDate ? formatDateForDisplay(surgery.plannedDate) : '-'}</div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="surgeon-email">{t('common.email', 'Email')}</Label>
              <Input
                id="surgeon-email"
                type="email"
                placeholder={t('anesthesia.surgerySummary.enterEmail', 'Enter email address')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="input-surgeon-email"
              />
              {surgeonUser?.email && email !== surgeonUser.email && (
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={() => setEmail(surgeonUser.email)}
                  data-testid="button-use-surgeon-email"
                >
                  {t('anesthesia.surgerySummary.useSurgeonEmail', 'Use surgeon email')}: {surgeonUser.email}
                </button>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSending}
                data-testid="button-cancel-send-summary"
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleSend}
                disabled={!email || isSending}
                data-testid="button-send-surgeon-summary"
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('anesthesia.surgerySummary.sending', 'Sending...')}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    {t('anesthesia.surgerySummary.sendEmail', 'Send Email')}
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
