import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ClipboardList, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface QuestionnaireImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  questionnaireAllergies: string[];
  questionnaireAllergiesNotes: string;
  questionnaireWeight: string;
}

export function QuestionnaireImportDialog({
  open,
  onOpenChange,
  patientId,
  patientName,
  questionnaireAllergies,
  questionnaireAllergiesNotes,
  questionnaireWeight,
}: QuestionnaireImportDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const hasAllergies = questionnaireAllergies.length > 0 || !!questionnaireAllergiesNotes;
  const hasWeight = !!questionnaireWeight;

  const handleImport = async () => {
    setIsSaving(true);
    try {
      const updates: Record<string, any> = {};

      if (hasWeight) {
        updates.weight = questionnaireWeight;
      }
      if (hasAllergies) {
        updates.allergies = questionnaireAllergies;
        if (questionnaireAllergiesNotes) {
          updates.otherAllergies = questionnaireAllergiesNotes;
        }
      }

      await apiRequest("PATCH", `/api/patients/${patientId}`, updates);

      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}`] });

      toast({
        title: t('common.success'),
        description: t('surgery.questionnaireImport.importSuccess', 'Patient data imported from questionnaire'),
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to import questionnaire data:", error);
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: t('surgery.questionnaireImport.importError', 'Failed to import data'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            {t('surgery.questionnaireImport.title', 'Questionnaire Data Available')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'surgery.questionnaireImport.description',
              '{{name}} has no weight or allergy information yet, but a completed questionnaire is available. Import basic patient data?',
              { name: patientName }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {hasWeight && (
            <div className="flex items-center gap-2 text-sm">
              <span className="font-medium">{t('anesthesia.op.weight', 'Weight')}:</span>
              <span>{questionnaireWeight} {t('anesthesia.op.kg', 'kg')}</span>
            </div>
          )}
          {hasAllergies && (
            <div className="flex items-start gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">{t('anesthesia.op.allergies', 'Allergies')}:</span>{" "}
                <span>
                  {[...questionnaireAllergies, questionnaireAllergiesNotes].filter(Boolean).join(", ")}
                </span>
              </div>
            </div>
          )}
          {!hasWeight && !hasAllergies && (
            <p className="text-sm text-muted-foreground">
              {t('surgery.questionnaireImport.noRelevantData', 'Questionnaire has no weight or allergy data to import.')}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.skip', 'Skip')}
          </Button>
          <Button onClick={handleImport} disabled={isSaving || (!hasWeight && !hasAllergies)}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t('surgery.questionnaireImport.importButton', 'Import')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
