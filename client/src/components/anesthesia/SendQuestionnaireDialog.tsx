import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MessageSquare } from "lucide-react";
import { PatientCommunicationContent } from "./PatientCommunicationContent";

interface SendQuestionnaireDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
}

export function SendQuestionnaireDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  patientEmail,
  patientPhone,
}: SendQuestionnaireDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg h-[80vh] max-h-[600px] flex flex-col p-0" data-testid="dialog-send-questionnaire">
        <DialogHeader className="px-4 pt-4 pb-2 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('messages.dialogTitle', 'Patient Communication')}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {patientName}
          </DialogDescription>
        </DialogHeader>

        <PatientCommunicationContent
          patientId={patientId}
          patientName={patientName}
          patientEmail={patientEmail}
          patientPhone={patientPhone}
          isEnabled={open}
        />
      </DialogContent>
    </Dialog>
  );
}
