import { useState } from "react";
import { useLocation } from "wouter";
import OPCalendar from "@/components/anesthesia/OPCalendar";
import SurgerySummaryDialog from "@/components/anesthesia/SurgerySummaryDialog";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";

export default function OpList() {
  const [, setLocation] = useLocation();
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [editSurgeryOpen, setEditSurgeryOpen] = useState(false);

  const handleEventClick = (surgeryId: string) => {
    setSelectedSurgeryId(surgeryId);
    setSummaryOpen(true);
  };

  const handleEditSurgery = () => {
    setSummaryOpen(false);
    setEditSurgeryOpen(true);
  };

  const handleOpenPreOp = () => {
    if (selectedSurgeryId) {
      setSummaryOpen(false);
      // Navigate but preserve context - dialog will be shown by patient page
      setLocation(`/anesthesia/patients/${selectedSurgeryId}/preop?returnTo=/anesthesia/op`);
    }
  };

  const handleOpenAnesthesia = () => {
    if (selectedSurgeryId) {
      setSummaryOpen(false);
      setLocation(`/anesthesia/cases/${selectedSurgeryId}/op?returnTo=/anesthesia/op`);
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
    </div>
  );
}
