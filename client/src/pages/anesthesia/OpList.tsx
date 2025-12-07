import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import { DuplicateRecordsDialog } from "@/components/anesthesia/DuplicateRecordsDialog";
import { useModule } from "@/contexts/ModuleContext";
import { apiRequest } from "@/lib/queryClient";

const SURGERY_CONTEXT_KEY = "oplist_surgery_context";

interface TimeMarker {
  id: string;
  code: string;
  label: string;
  time: number | null;
}

interface AnesthesiaRecordWithCounts {
  id: string;
  surgeryId: string;
  createdAt: string;
  updatedAt: string;
  timeMarkers?: TimeMarker[];
  dataCounts: {
    vitals: number;
    medications: number;
    events: number;
  };
  totalDataPoints: number;
}

function shouldUsePacuMode(timeMarkers?: TimeMarker[]): boolean {
  if (!timeMarkers) return false;
  const x2Marker = timeMarkers.find(m => m.code === 'X2');
  const pMarker = timeMarkers.find(m => m.code === 'P');
  const hasX2 = x2Marker?.time != null;
  const hasP = pMarker?.time != null;
  return hasX2 && !hasP;
}

export default function OpList() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const { activeModule } = useModule();
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSurgeryOpen, setEditSurgeryOpen] = useState(false);
  const [duplicateRecords, setDuplicateRecords] = useState<AnesthesiaRecordWithCounts[]>([]);
  const [duplicatesDialogOpen, setDuplicatesDialogOpen] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);

  // Restore Surgery Summary dialog state when returning from Pre-OP/Anesthesia Record
  useEffect(() => {
    const savedContext = sessionStorage.getItem(SURGERY_CONTEXT_KEY);
    if (savedContext) {
      try {
        const { surgeryId, patientId } = JSON.parse(savedContext);
        setSelectedSurgeryId(surgeryId);
        setSelectedPatientId(patientId);
        setSummaryOpen(true);
        sessionStorage.removeItem(SURGERY_CONTEXT_KEY);
      } catch (e) {
        console.error("Failed to restore surgery context:", e);
      }
    }
  }, []);

  const handleEventClick = (surgeryId: string, patientId: string) => {
    setSelectedSurgeryId(surgeryId);
    setSelectedPatientId(patientId);
    setSummaryOpen(true);
  };

  const handleEditSurgery = () => {
    setSummaryOpen(false);
    setEditSurgeryOpen(true);
  };

  const handleOpenPreOp = () => {
    if (selectedPatientId && selectedSurgeryId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/anesthesia/patients/${selectedPatientId}?openPreOp=${selectedSurgeryId}`);
    }
  };

  const navigateToAnesthesiaRecord = useCallback((surgeryIdToUse: string, recordIdToUse?: string, usePacuMode?: boolean) => {
    if (selectedPatientId) {
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: surgeryIdToUse,
        patientId: selectedPatientId
      }));
    }
    setSummaryOpen(false);
    setDuplicatesDialogOpen(false);
    // Use PACU path if X2 marker is set but P is not
    const modePath = usePacuMode ? 'pacu' : 'op';
    // Include recordId in URL if specified (for opening specific record when duplicates exist)
    const url = recordIdToUse 
      ? `/anesthesia/${modePath}/${surgeryIdToUse}?recordId=${recordIdToUse}`
      : `/anesthesia/${modePath}/${surgeryIdToUse}`;
    setLocation(url);
  }, [selectedPatientId, setLocation]);

  const checkForDuplicateRecords = useCallback(async (surgeryId: string): Promise<AnesthesiaRecordWithCounts[]> => {
    try {
      const response = await apiRequest("GET", `/api/anesthesia/records/surgery/${surgeryId}/all`);
      if (response.ok) {
        return await response.json();
      }
      return [];
    } catch (error) {
      console.error("Failed to check for duplicate records:", error);
      return [];
    }
  }, []);

  const handleOpenAnesthesia = async () => {
    if (!selectedSurgeryId || !selectedPatientId) return;
    
    setIsCheckingDuplicates(true);
    
    try {
      const records = await checkForDuplicateRecords(selectedSurgeryId);
      
      if (records.length > 1) {
        // Multiple records found - show selection dialog
        setDuplicateRecords(records);
        setDuplicatesDialogOpen(true);
        setSummaryOpen(false);
      } else if (records.length === 1) {
        // Single record - use it directly and include recordId
        const record = records[0];
        const usePacuMode = shouldUsePacuMode(record.timeMarkers);
        navigateToAnesthesiaRecord(selectedSurgeryId, record.id, usePacuMode);
      } else {
        // No records exist yet - let Op.tsx create one
        navigateToAnesthesiaRecord(selectedSurgeryId);
      }
    } catch (error) {
      console.error("Error checking for duplicates:", error);
      // On error, just proceed with normal navigation
      navigateToAnesthesiaRecord(selectedSurgeryId);
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleSelectDuplicateRecord = async (recordId: string) => {
    // Navigate to the selected record with its specific recordId
    if (selectedSurgeryId) {
      // Fetch the specific record to check time markers
      let usePacuMode = false;
      try {
        const response = await apiRequest("GET", `/api/anesthesia/records/${recordId}`);
        if (response.ok) {
          const record = await response.json();
          usePacuMode = shouldUsePacuMode(record.timeMarkers);
        }
      } catch (e) {
        // If fetch fails, default to OP mode
      }
      navigateToAnesthesiaRecord(selectedSurgeryId, recordId, usePacuMode);
    }
  };

  const handleRefreshDuplicates = async () => {
    if (!selectedSurgeryId) return;
    const records = await checkForDuplicateRecords(selectedSurgeryId);
    setDuplicateRecords(records);
    
    // If only one record remains, auto-close dialog and navigate
    if (records.length <= 1) {
      setDuplicatesDialogOpen(false);
      if (records.length === 1) {
        // Check markers for the remaining record and include recordId
        const record = records[0];
        const usePacuMode = shouldUsePacuMode(record.timeMarkers);
        navigateToAnesthesiaRecord(selectedSurgeryId, record.id, usePacuMode);
      }
    }
  };

  const handleOpenSurgeryDocumentation = () => {
    if (selectedSurgeryId && selectedPatientId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/surgery/op/${selectedSurgeryId}`);
    }
  };

  return (
    <div className="container mx-auto px-0 py-6 pb-24">
      {/* Header */}
      <div className="mb-6 px-4">
        <h1 className="text-2xl font-bold mb-2">{t('anesthesia.op.scheduleTitle')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('anesthesia.op.scheduleSubtitle')}
        </p>
      </div>

      {/* Calendar View */}
      <div className="min-h-[600px]">
        <OPCalendar onEventClick={handleEventClick} />
      </div>

      {/* Surgery Summary Dialog */}
      {selectedSurgeryId && (
        <SurgerySummaryDialog
          open={summaryOpen}
          onOpenChange={setSummaryOpen}
          surgeryId={selectedSurgeryId}
          onEditSurgery={handleEditSurgery}
          onOpenPreOp={handleOpenPreOp}
          onOpenAnesthesia={handleOpenAnesthesia}
          onOpenSurgeryDocumentation={handleOpenSurgeryDocumentation}
          activeModule={activeModule}
        />
      )}

      {/* Edit Surgery Dialog */}
      {editSurgeryOpen && selectedSurgeryId && (
        <EditSurgeryDialog
          surgeryId={selectedSurgeryId}
          onClose={() => {
            setEditSurgeryOpen(false);
            setSummaryOpen(true); // Return to summary when closing edit
          }}
        />
      )}

      {/* Duplicate Records Dialog */}
      {selectedSurgeryId && duplicateRecords.length > 0 && (
        <DuplicateRecordsDialog
          open={duplicatesDialogOpen}
          onOpenChange={setDuplicatesDialogOpen}
          records={duplicateRecords}
          surgeryId={selectedSurgeryId}
          onSelectRecord={handleSelectDuplicateRecord}
          onRefresh={handleRefreshDuplicates}
        />
      )}
    </div>
  );
}
