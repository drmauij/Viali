import { generateAnesthesiaRecordPDF } from "@/lib/anesthesiaRecordPdf";
import type { Surgery, Patient } from "@shared/schema";
import type { FullTimelineExportData, HiddenFullTimelineExporterRef } from "@/components/anesthesia/HiddenFullTimelineExporter";

interface AllergyItem {
  id: string;
  label: string;
}

interface ChecklistItems {
  signIn?: { id: string; label: string }[];
  timeOut?: { id: string; label: string }[];
  signOut?: { id: string; label: string }[];
}

interface AnesthesiaSettingsForPdf {
  allergyList?: AllergyItem[] | null;
  checklistItems?: ChecklistItems | null;
}

interface DownloadPdfOptions {
  surgery: Surgery;
  patient: Patient;
  hospitalId: string;
  anesthesiaSettings?: AnesthesiaSettingsForPdf | null;
  hiddenChartRef?: React.RefObject<{ exportChart: (snapshot: any) => Promise<string | null> }>;
  hiddenTimelineRef?: React.RefObject<HiddenFullTimelineExporterRef>;
}

interface DownloadPdfResult {
  success: boolean;
  hasWarnings: boolean;
  error?: string;
}

/**
 * Single entry point for downloading anesthesia record PDFs.
 * Fetches all required data and generates the PDF with proper allergy ID to label conversion.
 * 
 * @param options - The options for PDF download
 * @returns Promise with success status and any warnings
 */
export async function downloadAnesthesiaRecordPdf(options: DownloadPdfOptions): Promise<DownloadPdfResult> {
  const { surgery, patient, hospitalId, anesthesiaSettings: providedSettings, hiddenChartRef, hiddenTimelineRef } = options;

  try {
    // Fetch critical data (anesthesia record, pre-op assessment, items, and settings if not provided)
    const fetchPromises: Promise<Response>[] = [
      fetch(`/api/anesthesia/records/surgery/${surgery.id}`, { credentials: "include" }),
      fetch(`/api/anesthesia/preop/surgery/${surgery.id}`, { credentials: "include" }),
      fetch(`/api/anesthesia/items/${hospitalId}`, { credentials: "include" }),
    ];
    
    // Always fetch settings to ensure we have the correct checklist item keys
    if (!providedSettings) {
      fetchPromises.push(fetch(`/api/anesthesia/settings/${hospitalId}`, { credentials: "include" }));
    }
    
    const responses = await Promise.all(fetchPromises);
    const [anesthesiaRecordRes, preOpRes, itemsRes] = responses;
    const settingsRes = !providedSettings ? responses[3] : null;

    // Check for critical failures
    if (!anesthesiaRecordRes.ok && anesthesiaRecordRes.status !== 404) {
      throw new Error("Failed to load anesthesia record");
    }
    if (!itemsRes.ok) {
      throw new Error("Failed to load medication data");
    }

    const anesthesiaRecord = anesthesiaRecordRes.ok ? await anesthesiaRecordRes.json() : null;
    const preOpAssessment = preOpRes.ok ? await preOpRes.json() : null;
    const anesthesiaItems = await itemsRes.json();
    
    // Use provided settings or parse fetched settings
    const anesthesiaSettings: AnesthesiaSettingsForPdf | null = providedSettings || 
      (settingsRes?.ok ? await settingsRes.json() : null);

    // If we have an anesthesia record, fetch its related data
    let events: any[] = [];
    let medications: any[] = [];
    let clinicalSnapshot: any = null;
    let staffMembers: any[] = [];
    let positions: any[] = [];
    let hasDataWarnings = false;

    if (anesthesiaRecord && anesthesiaRecord.id) {
      const [eventsRes, medicationsRes, snapshotRes, staffRes, positionsRes] = await Promise.all([
        fetch(`/api/anesthesia/events/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/medications/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/vitals/snapshot/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/staff/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/positions/${anesthesiaRecord.id}`, { credentials: "include" }),
      ]);

      // Check for critical data failures
      const criticalFetchErrors = [];
      if (!eventsRes.ok) criticalFetchErrors.push("events");
      if (!medicationsRes.ok) criticalFetchErrors.push("medications");

      if (criticalFetchErrors.length > 0) {
        throw new Error(`Failed to load critical data: ${criticalFetchErrors.join(", ")}`);
      }

      // Parse all responses
      events = await eventsRes.json();
      medications = await medicationsRes.json();
      clinicalSnapshot = snapshotRes.ok ? await snapshotRes.json() : null;
      staffMembers = staffRes.ok ? await staffRes.json() : [];
      positions = positionsRes.ok ? await positionsRes.json() : [];

      // Track if any non-critical data failed to load
      hasDataWarnings = !snapshotRes.ok || !staffRes.ok || !positionsRes.ok;
      if (hasDataWarnings) {
        console.warn("[PDF-EXPORT] Some data is incomplete:", {
          snapshot: !snapshotRes.ok,
          staff: !staffRes.ok,
          positions: !positionsRes.ok,
        });
      }
    }

    // Export full timeline image using hidden timeline exporter (preferred)
    // Falls back to vitals-only chart if full timeline export fails
    let chartImage: string | null = null;
    let fullTimelineImage: string | null = null;
    
    // Try full timeline export first (includes all swimlanes)
    if (hiddenTimelineRef?.current && anesthesiaRecord) {
      try {
        console.log("[PDF-EXPORT] Exporting full timeline image...");
        
        // Calculate start/end time from anesthesia record or surgery
        const startTime = anesthesiaRecord.anesthesiaStartTime 
          ? new Date(anesthesiaRecord.anesthesiaStartTime).getTime()
          : surgery.actualStartTime 
            ? new Date(surgery.actualStartTime).getTime()
            : new Date(surgery.plannedDate).getTime();
        
        const endTime = anesthesiaRecord.anesthesiaEndTime
          ? new Date(anesthesiaRecord.anesthesiaEndTime).getTime()
          : surgery.actualEndTime
            ? new Date(surgery.actualEndTime).getTime()
            : startTime + (4 * 60 * 60 * 1000); // Default 4 hours if no end time
        
        // Extract data from clinicalSnapshot - structure may be nested under 'data'
        const snapshotData = clinicalSnapshot?.data || clinicalSnapshot;
        
        // Extract vitals (hr, bp, spo2, temp)
        const vitals = snapshotData ? {
          hr: snapshotData.hr || [],
          bp: snapshotData.bp || [],
          spo2: snapshotData.spo2 || [],
          temp: snapshotData.temp || [],
        } : undefined;
        
        // Extract ventilation data (pip, peep, tidalVolume, respiratoryRate, fio2, etco2)
        const ventilation = snapshotData ? {
          pip: snapshotData.pip || [],
          peep: snapshotData.peep || [],
          tidalVolume: snapshotData.tidalVolume || [],
          respiratoryRate: snapshotData.respiratoryRate || [],
          fio2: snapshotData.fio2 || [],
          etco2: snapshotData.etco2 || [],
        } : undefined;
        
        // Extract BIS and TOF data
        const bis = snapshotData?.bis || [];
        const tof = snapshotData?.tof || [];
        
        const timelineData: FullTimelineExportData = {
          startTime,
          endTime,
          vitals,
          events,
          medications,
          anesthesiaItems,
          staffMembers,
          positions,
          ventilation,
          bis,
          tof,
        };
        
        fullTimelineImage = await hiddenTimelineRef.current.exportTimeline(timelineData);
        if (fullTimelineImage) {
          console.log("[PDF-EXPORT] Full timeline image exported successfully");
          chartImage = fullTimelineImage;
        } else {
          console.warn("[PDF-EXPORT] Full timeline export returned null, falling back to vitals chart");
        }
      } catch (error) {
        console.error("[PDF-EXPORT] Failed to export full timeline:", error);
      }
    }
    
    // Fallback to vitals-only chart if full timeline failed
    if (!chartImage && clinicalSnapshot && hiddenChartRef?.current) {
      try {
        console.log("[PDF-EXPORT] Exporting vitals chart image (fallback)...");
        chartImage = await hiddenChartRef.current.exportChart(clinicalSnapshot);
        if (chartImage) {
          console.log("[PDF-EXPORT] Vitals chart image exported successfully");
        } else {
          console.warn("[PDF-EXPORT] Vitals chart export returned null");
        }
      } catch (error) {
        console.error("[PDF-EXPORT] Failed to export vitals chart:", error);
      }
    }

    // Convert allergy IDs to labels for PDF display
    // IMPORTANT: Keep null/undefined intact so PDF shows "No allergies known" fallback text
    let convertedAllergies: string[] | null = null;
    if (patient.allergies && patient.allergies.length > 0) {
      convertedAllergies = patient.allergies.map((allergyId: string) => {
        const allergyItem = anesthesiaSettings?.allergyList?.find(
          (a: { id: string; label: string }) => a.id === allergyId
        );
        return allergyItem?.label || allergyId;
      });
    }

    const patientWithAllergyLabels = {
      ...patient,
      email: patient.email ?? null,
      phone: patient.phone ?? null,
      address: patient.address ?? null,
      emergencyContact: patient.emergencyContact ?? null,
      insuranceProvider: patient.insuranceProvider ?? null,
      insuranceNumber: patient.insuranceNumber ?? null,
      internalNotes: patient.internalNotes ?? null,
      createdBy: patient.createdBy ?? null,
      createdAt: patient.createdAt ? new Date(patient.createdAt) : null,
      updatedAt: patient.updatedAt ? new Date(patient.updatedAt) : null,
      deletedAt: null,
      otherAllergies: patient.otherAllergies ?? null,
      allergies: convertedAllergies,
    };

    // Generate PDF
    generateAnesthesiaRecordPDF({
      patient: patientWithAllergyLabels,
      surgery,
      anesthesiaRecord,
      preOpAssessment,
      clinicalSnapshot,
      events,
      medications,
      anesthesiaItems,
      staffMembers,
      positions,
      timeMarkers: (anesthesiaRecord?.timeMarkers as any[]) || [],
      checklistSettings: anesthesiaSettings?.checklistItems || null,
      chartImage,
    });

    return {
      success: true,
      hasWarnings: hasDataWarnings,
    };
  } catch (error: any) {
    console.error("[PDF-EXPORT] Error generating PDF:", error);
    return {
      success: false,
      hasWarnings: false,
      error: error.message || "Failed to generate PDF",
    };
  }
}
