import { generateAnesthesiaRecordPDF } from "@/lib/anesthesiaRecordPdf";
import type { Surgery, Patient } from "@shared/schema";

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
}

interface DownloadPdfResult {
  success: boolean;
  hasWarnings: boolean;
  error?: string;
}

/**
 * Single entry point for downloading anesthesia record PDFs.
 * Fetches all required data and generates the PDF with proper allergy ID to label conversion.
 * Uses jsPDF native drawing for all charts (reliable, full-width landscape rendering).
 * 
 * @param options - The options for PDF download
 * @returns Promise with success status and any warnings
 */
export async function downloadAnesthesiaRecordPdf(options: DownloadPdfOptions): Promise<DownloadPdfResult> {
  const { surgery, patient, hospitalId, anesthesiaSettings: providedSettings } = options;

  try {
    // Fetch critical data (anesthesia record, pre-op assessment, items, and settings if not provided)
    const fetchPromises: Promise<Response>[] = [
      fetch(`/api/anesthesia/records/surgery/${surgery.id}`, { credentials: "include" }),
      fetch(`/api/anesthesia/preop/surgery/${surgery.id}`, { credentials: "include" }),
      fetch(`/api/anesthesia/items/${hospitalId}`, { credentials: "include" }),
      fetch(`/api/items/${hospitalId}`, { credentials: "include" }), // Regular inventory items
    ];
    
    // Always fetch settings to ensure we have the correct checklist item keys
    if (!providedSettings) {
      fetchPromises.push(fetch(`/api/anesthesia/settings/${hospitalId}`, { credentials: "include" }));
    }
    
    const responses = await Promise.all(fetchPromises);
    const [anesthesiaRecordRes, preOpRes, anesthesiaItemsRes, inventoryItemsRes] = responses;
    const settingsRes = !providedSettings ? responses[4] : null;

    // Check for critical failures
    if (!anesthesiaRecordRes.ok && anesthesiaRecordRes.status !== 404) {
      throw new Error("Failed to load anesthesia record");
    }
    if (!anesthesiaItemsRes.ok) {
      throw new Error("Failed to load medication data");
    }

    const anesthesiaRecord = anesthesiaRecordRes.ok ? await anesthesiaRecordRes.json() : null;
    const preOpAssessment = preOpRes.ok ? await preOpRes.json() : null;
    const anesthesiaItems = await anesthesiaItemsRes.json();
    const inventoryItems = inventoryItemsRes.ok ? await inventoryItemsRes.json() : [];
    
    // Use provided settings or parse fetched settings
    const anesthesiaSettings: AnesthesiaSettingsForPdf | null = providedSettings || 
      (settingsRes?.ok ? await settingsRes.json() : null);

    // If we have an anesthesia record, fetch its related data
    let events: any[] = [];
    let medications: any[] = [];
    let clinicalSnapshot: any = null;
    let staffMembers: any[] = [];
    let positions: any[] = [];
    let inventoryUsage: any[] = [];
    let hasDataWarnings = false;

    if (anesthesiaRecord && anesthesiaRecord.id) {
      const [eventsRes, medicationsRes, snapshotRes, staffRes, positionsRes, inventoryUsageRes] = await Promise.all([
        fetch(`/api/anesthesia/events/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/medications/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/vitals/snapshot/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/staff/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/positions/${anesthesiaRecord.id}`, { credentials: "include" }),
        fetch(`/api/anesthesia/inventory/${anesthesiaRecord.id}`, { credentials: "include" }),
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
      inventoryUsage = inventoryUsageRes.ok ? await inventoryUsageRes.json() : [];

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

    // Fetch sticker documentation photos from object storage and convert to base64
    // This is needed because the PDF generator expects base64 data in stickerDoc.data
    if (anesthesiaRecord?.countsSterileData?.stickerDocs?.length > 0) {
      const stickerDocsWithData = await Promise.all(
        anesthesiaRecord.countsSterileData.stickerDocs.map(async (doc: any) => {
          // If already has base64 data (legacy), keep it
          if (doc.data) {
            return doc;
          }
          
          // If has storageKey, fetch the image from object storage
          if (doc.storageKey && doc.type === 'photo') {
            try {
              // Get presigned download URL
              const urlRes = await fetch(
                `/api/anesthesia/records/${anesthesiaRecord.id}/sticker-doc/${doc.id}/download-url`,
                { credentials: "include" }
              );
              
              if (!urlRes.ok) {
                console.warn(`[PDF-EXPORT] Failed to get download URL for sticker doc ${doc.id}`);
                return doc;
              }
              
              const { downloadURL } = await urlRes.json();
              
              // Fetch the actual image
              const imageRes = await fetch(downloadURL);
              if (!imageRes.ok) {
                console.warn(`[PDF-EXPORT] Failed to download sticker doc image ${doc.id}`);
                return doc;
              }
              
              // Convert to base64
              const blob = await imageRes.blob();
              const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
              
              return { ...doc, data: base64 };
            } catch (error) {
              console.warn(`[PDF-EXPORT] Error fetching sticker doc ${doc.id}:`, error);
              return doc;
            }
          }
          
          return doc;
        })
      );
      
      // Update the anesthesia record with the fetched image data
      anesthesiaRecord.countsSterileData.stickerDocs = stickerDocsWithData;
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

    // Generate PDF with native jsPDF charts (reliable, full-width landscape rendering)
    generateAnesthesiaRecordPDF({
      patient: patientWithAllergyLabels,
      surgery,
      anesthesiaRecord,
      preOpAssessment,
      clinicalSnapshot,
      events,
      medications,
      anesthesiaItems,
      inventoryItems,
      staffMembers,
      positions,
      timeMarkers: (anesthesiaRecord?.timeMarkers as any[]) || [],
      checklistSettings: anesthesiaSettings?.checklistItems || null,
      inventoryUsage,
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
