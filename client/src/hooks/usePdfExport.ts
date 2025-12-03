import { useToast } from "@/hooks/use-toast";
import { generateAnesthesiaRecordPDF } from "@/lib/anesthesiaRecordPdf";
import { useTranslation } from "react-i18next";
import type { UnifiedTimelineRef } from "@/components/anesthesia/UnifiedTimeline";
import type { RefObject } from "react";

interface UsePdfExportProps {
  patient: any;
  surgery: any;
  activeHospital: any;
  anesthesiaRecord: any;
  preOpAssessment: any;
  clinicalSnapshot: any;
  eventsData: any[];
  medicationsData: any[];
  anesthesiaItems: any[];
  staffMembers: any[];
  positions: any[];
  anesthesiaSettings: any;
  timelineRef: RefObject<UnifiedTimelineRef>;
  isRecordLoading: boolean;
  isVitalsLoading: boolean;
  isMedicationsLoading: boolean;
  isEventsLoading: boolean;
  isAnesthesiaItemsLoading: boolean;
  isClinicalSnapshotLoading: boolean;
  isStaffLoading: boolean;
  isPositionsLoading: boolean;
  vitalsStatus: string;
  medicationsStatus: string;
  eventsStatus: string;
  anesthesiaItemsStatus: string;
  staffStatus: string;
  positionsStatus: string;
  isAnesthesiaItemsError: boolean;
  isMedicationsError: boolean;
  isEventsError: boolean;
  isVitalsError: boolean;
  isClinicalSnapshotError: boolean;
  isStaffError: boolean;
  isPositionsError: boolean;
}

export function usePdfExport(props: UsePdfExportProps) {
  const { toast } = useToast();
  const { t } = useTranslation();

  const handleDownloadPDF = async () => {
    if (!props.patient || !props.surgery) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfMissingData'),
        variant: "destructive",
      });
      return;
    }

    if (!props.activeHospital) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfHospitalNotSelected'),
        variant: "destructive",
      });
      return;
    }

    if (props.isRecordLoading || !props.anesthesiaRecord) {
      toast({
        title: t('anesthesia.op.pdfWait'),
        description: "Loading anesthesia record. Please try again in a moment.",
        variant: "default",
      });
      return;
    }

    if (props.isVitalsLoading || props.isMedicationsLoading || props.isEventsLoading || 
        props.isAnesthesiaItemsLoading || props.isClinicalSnapshotLoading || 
        props.isStaffLoading || props.isPositionsLoading) {
      toast({
        title: t('anesthesia.op.pdfWait'),
        description: "Loading data for PDF export. Please try again in a moment.",
        variant: "default",
      });
      return;
    }

    const incompleteQueries = [];
    if (props.vitalsStatus !== 'success') incompleteQueries.push("vitals");
    if (props.medicationsStatus !== 'success') incompleteQueries.push("medications");
    if (props.eventsStatus !== 'success') incompleteQueries.push("events");
    if (props.anesthesiaItemsStatus !== 'success') incompleteQueries.push("medication definitions");
    if (props.staffStatus !== 'success') incompleteQueries.push("staff");
    if (props.positionsStatus !== 'success') incompleteQueries.push("positions");

    if (incompleteQueries.length > 0) {
      toast({
        title: t('anesthesia.op.pdfWait'),
        description: `Initializing data for PDF export: ${incompleteQueries.join(", ")}. Please try again in a moment.`,
        variant: "default",
      });
      return;
    }

    if (!props.anesthesiaItems || props.anesthesiaItems.length === 0) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: "No medication definitions available. Please ensure the hospital's anesthesia inventory is configured.",
        variant: "destructive",
      });
      return;
    }

    const criticalErrors = [];
    if (props.isAnesthesiaItemsError) criticalErrors.push("medication definitions");
    if (props.isMedicationsError) criticalErrors.push("medication administrations");
    if (props.isEventsError) criticalErrors.push("events");
    if (props.isVitalsError) criticalErrors.push("vitals");

    if (criticalErrors.length > 0) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: `Failed to load: ${criticalErrors.join(", ")}. Please refresh and try again.`,
        variant: "destructive",
      });
      return;
    }

    const hasMinorErrors = props.isClinicalSnapshotError || props.isStaffError || props.isPositionsError;
    if (hasMinorErrors) {
      console.warn("Some PDF data is incomplete:", {
        clinicalSnapshot: props.isClinicalSnapshotError,
        staff: props.isStaffError,
        positions: props.isPositionsError,
      });
    }

    try {
      let chartImage: string | null = null;
      
      // Export chart image from visible timeline with 4-hour zoom centered on data
      if (props.timelineRef.current) {
        try {
          console.log('[PDF-EXPORT] Exporting chart from visible timeline with 4-hour zoom...');
          chartImage = await props.timelineRef.current.exportForPdf();
          if (chartImage) {
            console.log('[PDF-EXPORT] Chart image exported successfully');
          } else {
            console.warn('[PDF-EXPORT] Timeline chart export returned null');
          }
        } catch (error) {
          console.error('[PDF-EXPORT] Failed to export chart from timeline:', error);
        }
      }

      // Convert allergy IDs to labels for PDF display
      let convertedAllergies: string[] | null = null;
      if (props.patient.allergies && props.patient.allergies.length > 0) {
        convertedAllergies = props.patient.allergies.map((allergyId: string) => {
          const allergyItem = props.anesthesiaSettings?.allergyList?.find((a: { id: string; label: string }) => a.id === allergyId);
          return allergyItem?.label || allergyId;
        });
      }

      const patientWithAllergyLabels = {
        ...props.patient,
        allergies: convertedAllergies,
      };

      generateAnesthesiaRecordPDF({
        patient: patientWithAllergyLabels,
        surgery: props.surgery,
        anesthesiaRecord: props.anesthesiaRecord || null,
        preOpAssessment: props.preOpAssessment || null,
        clinicalSnapshot: props.clinicalSnapshot || null,
        events: props.eventsData || [],
        medications: props.medicationsData || [],
        anesthesiaItems: props.anesthesiaItems || [],
        staffMembers: props.staffMembers || [],
        positions: props.positions || [],
        timeMarkers: (props.anesthesiaRecord?.timeMarkers as any[]) || [],
        checklistSettings: props.anesthesiaSettings?.checklistItems || null,
        chartImage,
      });

      toast({
        title: t('anesthesia.op.pdfGenerated'),
        description: hasMinorErrors 
          ? "PDF generated with some data unavailable (check console)" 
          : "Complete anesthesia record has been downloaded",
      });
    } catch (error: any) {
      console.error("PDF generation error:", error);
      toast({
        title: "Error generating PDF",
        description: error.message || "Failed to generate PDF. Please try again.",
        variant: "destructive",
      });
    }
  };

  return { handleDownloadPDF };
}
