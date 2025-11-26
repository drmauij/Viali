import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, AlertCircle, Download, X } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { useTranslation } from "react-i18next";

interface PatientInfoHeaderProps {
  patient: any;
  surgery: any;
  preOpAssessment: any;
  selectedAllergies: string[];
  otherAllergies: string;
  cave: string;
  allergyList?: Array<{ id: string; label: string }>;
  patientAge: number | null;
  isPreOpLoading: boolean;
  onDownloadPDF: () => void;
  onClose: () => void;
  onOpenAllergiesDialog: () => void;
}

export function PatientInfoHeader({
  patient,
  surgery,
  preOpAssessment,
  selectedAllergies,
  otherAllergies,
  cave,
  allergyList = [],
  patientAge,
  isPreOpLoading,
  onDownloadPDF,
  onClose,
  onOpenAllergiesDialog,
}: PatientInfoHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 bg-background relative">
      {/* Action Buttons - Fixed top-right */}
      <div className="absolute right-2 top-2 md:right-4 md:top-4 z-10 flex gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onDownloadPDF}
          data-testid="button-download-pdf"
          title={t('anesthesia.op.downloadCompleteRecordPDF')}
        >
          <Download className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          data-testid="button-close-op"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="px-4 md:px-6 py-3 pr-12 md:pr-14">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4 md:flex-wrap">
          {/* Patient Name & Icon */}
          <div className="flex items-center gap-3">
            <UserCircle className="h-8 w-8 text-blue-500" />
            <div>
              <h2 className="font-bold text-base md:text-lg">
                {patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() || t('anesthesia.op.patientFallback') : t('anesthesia.op.loadingData')}
              </h2>
              <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                {patient?.birthday && (
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {formatDate(patient.birthday)}{patientAge !== null && ` • ${patientAge} ${t('anesthesia.op.yearsOld')}`}
                  </p>
                )}
                {preOpAssessment && (
                  <div className="flex items-center gap-3 font-semibold text-sm">
                    {preOpAssessment.height && (
                      <>
                        <span className="text-foreground">{preOpAssessment.height} {t('anesthesia.op.cm')}</span>
                        <span className="text-muted-foreground">•</span>
                      </>
                    )}
                    {preOpAssessment.weight && (
                      <span className="text-foreground">{preOpAssessment.weight} {t('anesthesia.op.kg')}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Surgery Info */}
          <div className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
            <p className="text-xs font-medium text-primary/70">{t('anesthesia.op.procedure').toUpperCase()}</p>
            <p className="font-semibold text-sm text-primary">{surgery.plannedSurgery}</p>
            {surgery.surgeon && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {surgery.surgeon} • {formatDate(surgery.plannedDate)}
              </p>
            )}
          </div>

          {/* Allergies & CAVE - Clickable Display */}
          {(selectedAllergies.length > 0 || otherAllergies || cave) && (
            <div 
              onClick={onOpenAllergiesDialog}
              className="flex items-start gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
              data-testid="allergies-cave-warning"
            >
              <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="flex gap-4 flex-wrap flex-1">
                {selectedAllergies.length > 0 && (
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('anesthesia.op.allergies').toUpperCase()}</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : 
                        selectedAllergies.map(id => 
                          allergyList.find(a => a.id === id)?.label || id
                        ).join(", ")
                      }
                    </p>
                  </div>
                )}
                {otherAllergies && (
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('anesthesia.op.otherAllergies').toUpperCase()}</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : otherAllergies}
                    </p>
                  </div>
                )}
                {cave && (
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">{t('anesthesia.op.cave').toUpperCase()}</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : cave}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
