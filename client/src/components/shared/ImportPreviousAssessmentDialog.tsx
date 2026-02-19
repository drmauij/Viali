import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Import } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";

export type PreviousAssessmentEntry = {
  surgeryId: string;
  plannedDate: string | null;
  plannedSurgery: string | null;
  assessmentType: 'anesthesia' | 'surgery';
  assessmentDate: string | null;
  assessment: Record<string, any>;
};

interface ImportPreviousAssessmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  currentSurgeryId: string;
  onImport: (assessment: PreviousAssessmentEntry) => void;
}

export function ImportPreviousAssessmentDialog({
  open,
  onOpenChange,
  patientId,
  currentSurgeryId,
  onImport,
}: ImportPreviousAssessmentDialogProps) {
  const { t } = useTranslation();
  const [selectedIndex, setSelectedIndex] = useState<string>("");

  const { data: previousAssessments, isLoading } = useQuery<PreviousAssessmentEntry[]>({
    queryKey: [`/api/preop/patient/${patientId}/previous`, currentSurgeryId],
    queryFn: async () => {
      const res = await fetch(`/api/preop/patient/${patientId}/previous?excludeSurgeryId=${currentSurgeryId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: open && !!patientId,
  });

  const selectedAssessment = selectedIndex !== ""
    ? previousAssessments?.[parseInt(selectedIndex)]
    : undefined;

  const handleImport = () => {
    if (selectedAssessment) {
      onImport(selectedAssessment);
      setSelectedIndex("");
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) setSelectedIndex("");
  };

  const formatDisplayDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return formatDate(dateStr);
    } catch {
      return dateStr;
    }
  };

  const a = selectedAssessment?.assessment;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('anesthesia.patientDetail.importFromPrevious')}</DialogTitle>
          <DialogDescription>
            {t('anesthesia.patientDetail.importFromPreviousDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && (!previousAssessments || previousAssessments.length === 0) && (
            <p className="text-sm text-muted-foreground py-4">
              {t('anesthesia.patientDetail.noPreviousAssessments')}
            </p>
          )}

          {!isLoading && previousAssessments && previousAssessments.length > 0 && (
            <>
              <div className="space-y-2">
                <Label>{t('anesthesia.patientDetail.selectPreviousAssessment')}</Label>
                <Select value={selectedIndex} onValueChange={setSelectedIndex}>
                  <SelectTrigger data-testid="select-previous-assessment">
                    <SelectValue placeholder={t('anesthesia.patientDetail.selectPreviousAssessment')} />
                  </SelectTrigger>
                  <SelectContent>
                    {previousAssessments.map((entry, idx) => (
                      <SelectItem key={`${entry.surgeryId}-${entry.assessmentType}`} value={String(idx)}>
                        {formatDisplayDate(entry.plannedDate)} — {entry.plannedSurgery || entry.surgeryId}
                        {' '}({entry.assessmentType === 'anesthesia'
                          ? t('anesthesia.patientDetail.anesthesiaAssessment')
                          : t('anesthesia.patientDetail.surgeryAssessment')})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Preview */}
              {selectedAssessment && (
                <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-medium">{t('anesthesia.patientDetail.previewData')}</h4>
                    <Badge variant={selectedAssessment.assessmentType === 'anesthesia' ? 'default' : 'secondary'}>
                      {selectedAssessment.assessmentType === 'anesthesia'
                        ? t('anesthesia.patientDetail.anesthesiaAssessment')
                        : t('anesthesia.patientDetail.surgeryAssessment')}
                    </Badge>
                  </div>

                  {(a?.height || a?.weight) && (
                    <div className="text-sm">
                      <span className="font-medium">{t('anesthesia.patientDetail.measurements', 'Measurements')}:</span>{' '}
                      {a.height && `${t('anesthesia.patientDetail.heightCm', 'Height')}: ${a.height}`}
                      {a.height && a.weight && ', '}
                      {a.weight && `${t('anesthesia.patientDetail.weightKg', 'Weight')}: ${a.weight}`}
                    </div>
                  )}

                  {a?.cave && (
                    <div className="text-sm">
                      <span className="font-medium">CAVE:</span> {a.cave}
                    </div>
                  )}

                  {((a?.allergies && a.allergies.length > 0) || a?.allergiesOther || a?.otherAllergies) && (
                    <div className="text-sm">
                      <span className="font-medium">{t('anesthesia.patientDetail.allergies', 'Allergies')}:</span>{' '}
                      {a.allergies?.length > 0 && a.allergies.join(', ')}
                      {(a.allergiesOther || a.otherAllergies) && ` (${a.allergiesOther || a.otherAllergies})`}
                    </div>
                  )}

                  {((a?.anticoagulationMeds && a.anticoagulationMeds.length > 0) ||
                    (a?.generalMeds && a.generalMeds.length > 0) ||
                    a?.anticoagulationMedsOther || a?.generalMedsOther || a?.medicationsNotes) && (
                    <div className="text-sm">
                      <span className="font-medium">{t('anesthesia.patientDetail.medications', 'Medications')}:</span>{' '}
                      {[
                        ...(a.anticoagulationMeds || []),
                        ...(a.generalMeds || []),
                      ].join(', ')}
                      {(a.anticoagulationMedsOther || a.generalMedsOther) &&
                        ` + ${[a.anticoagulationMedsOther, a.generalMedsOther].filter(Boolean).join(', ')}`}
                    </div>
                  )}

                  {a?.specialNotes && (
                    <div className="text-sm">
                      <span className="font-medium">{t('anesthesia.patientDetail.additionalNotes', 'Notes')}:</span>{' '}
                      {a.specialNotes.substring(0, 150)}
                      {a.specialNotes.length > 150 && '...'}
                    </div>
                  )}

                  {a?.previousSurgeries && (
                    <div className="text-sm">
                      <span className="font-medium">{t('anesthesia.patientDetail.previousSurgeries', 'Previous Surgeries')}:</span>{' '}
                      {a.previousSurgeries.substring(0, 100)}
                      {a.previousSurgeries.length > 100 && '...'}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  data-testid="button-cancel-import-previous"
                >
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={!selectedAssessment}
                  data-testid="button-confirm-import-previous"
                >
                  <Import className="h-4 w-4 mr-2" />
                  {t('anesthesia.patientDetail.importData', 'Import Data')}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
