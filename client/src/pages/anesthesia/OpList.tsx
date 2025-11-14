import { useState } from "react";
import { useLocation } from "wouter";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import PreOpAssessmentDialog from "@/components/anesthesia/PreOpAssessmentDialog";
import { useActiveHospital } from "@/hooks/useActiveHospital";

export default function OpList() {
  const [, setLocation] = useLocation();
  const activeHospital = useActiveHospital();
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSurgeryOpen, setEditSurgeryOpen] = useState(false);
  const [preOpOpen, setPreOpOpen] = useState(false);

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
    setSummaryOpen(false);
    setPreOpOpen(true);
  };

  const handleOpenAnesthesia = () => {
    if (selectedSurgeryId) {
      setSummaryOpen(false);
      setLocation(`/anesthesia/op/${selectedSurgeryId}?returnTo=/anesthesia/op`);
    }
  };

  return (
    <div className="container mx-auto px-0 py-6 pb-24">
      {/* Header */}
      <div className="mb-6 px-4">
        <h1 className="text-2xl font-bold mb-2">OP Schedule</h1>
        <p className="text-sm text-muted-foreground">
          View and manage operating room schedules
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

      {/* Pre-OP Assessment Dialog */}
      {preOpOpen && selectedSurgeryId && activeHospital && (
        <PreOpAssessmentDialog
          open={preOpOpen}
          onOpenChange={(open) => {
            setPreOpOpen(open);
            if (!open) {
              setSummaryOpen(true); // Return to summary when closing preop
            }
          }}
          surgeryId={selectedSurgeryId}
          hospitalId={activeHospital.id}
        />
      )}
    </div>
  );
}
