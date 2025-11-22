import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";

const SURGERY_CONTEXT_KEY = "oplist_surgery_context";

export default function OpList() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSurgeryOpen, setEditSurgeryOpen] = useState(false);

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

  const handleOpenAnesthesia = () => {
    if (selectedSurgeryId && selectedPatientId) {
      // Save context before navigating away
      sessionStorage.setItem(SURGERY_CONTEXT_KEY, JSON.stringify({
        surgeryId: selectedSurgeryId,
        patientId: selectedPatientId
      }));
      setSummaryOpen(false);
      setLocation(`/anesthesia/op/${selectedSurgeryId}`);
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
    </div>
  );
}
