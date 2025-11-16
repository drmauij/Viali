import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { saveMedication } from "@/services/timelinePersistence";
import { Pill } from "lucide-react";
import type { AnesthesiaMedication, MedicationConfig } from "@shared/schema";

/**
 * MedicationTrack - Medication dosing timeline component
 * 
 * Features:
 * - Render medication doses as time-stamped pills/markers on swimlanes
 * - Group by medication name
 * - Click-to-add medication dose with dialog
 * - Proper persistence with error handling
 * - Cache invalidation after mutations
 */

export interface AnesthesiaItem {
  id: string;
  name: string;
  medicationConfig?: MedicationConfig | null;
}

export interface MedicationTrackProps {
  anesthesiaRecordId: string;
  timeRange: {
    start: number; // ms timestamp
    end: number;   // ms timestamp
  };
  medications: AnesthesiaMedication[];
  anesthesiaItems: AnesthesiaItem[];
  onMedicationsChange?: (medications: AnesthesiaMedication[]) => void;
  height?: number;
}

export function MedicationTrack({
  anesthesiaRecordId,
  timeRange,
  medications,
  anesthesiaItems,
  onMedicationsChange,
  height = 400,
}: MedicationTrackProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Dialog states
  const [addDialog, setAddDialog] = useState<{
    open: boolean;
    timestamp: number | null;
  }>({ open: false, timestamp: null });

  // Form states for add dialog
  const [selectedMedicationId, setSelectedMedicationId] = useState("");
  const [doseValue, setDoseValue] = useState("");

  // Local medications state
  const [localMedications, setLocalMedications] = useState<AnesthesiaMedication[]>(medications);

  // Detect theme
  const isDark = document.documentElement.classList.contains("dark");

  // Save medication mutation
  const saveMedicationMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await saveMedication(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'medications'] });
      toast({
        title: "Medication saved",
        description: "Medication dose has been saved successfully.",
      });
    },
    onError: (error: any) => {
      console.error("Failed to save medication:", error);
      toast({
        title: "Error saving medication",
        description: error.message || "Failed to save medication dose. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Group medications by item name
  const medicationsByItem = useMemo(() => {
    const grouped = new Map<string, { item: AnesthesiaItem; doses: AnesthesiaMedication[] }>();
    
    localMedications.forEach((med) => {
      const item = anesthesiaItems.find(item => item.id === med.itemId);
      if (!item) return;
      
      if (!grouped.has(item.id)) {
        grouped.set(item.id, { item, doses: [] });
      }
      grouped.get(item.id)!.doses.push(med);
    });

    // Sort doses by timestamp within each group
    grouped.forEach((group) => {
      group.doses.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    return Array.from(grouped.values());
  }, [localMedications, anesthesiaItems]);

  // Handle background click to add new medication
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const timeRange_ms = timeRange.end - timeRange.start;
    const clickedTime = timeRange.start + (clickX / timelineWidth) * timeRange_ms;

    setAddDialog({ open: true, timestamp: clickedTime });
    setSelectedMedicationId("");
    setDoseValue("");
  };

  // Handle add medication submit
  const handleAddSubmit = async () => {
    if (!addDialog.timestamp || !selectedMedicationId || !doseValue) {
      toast({
        title: "Missing information",
        description: "Please select a medication and enter a dose value.",
        variant: "destructive",
      });
      return;
    }

    const selectedItem = anesthesiaItems.find(item => item.id === selectedMedicationId);
    if (!selectedItem) return;

    const unit = selectedItem.medicationConfig?.administrationUnit || "mg";
    const route = selectedItem.medicationConfig?.administrationRoute || "i.v.";

    try {
      const result = await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId,
        itemId: selectedMedicationId,
        timestamp: new Date(addDialog.timestamp),
        type: 'bolus',
        dose: doseValue,
        unit,
        route,
      });

      // Update local state
      const newMedication: AnesthesiaMedication = {
        id: result.id || crypto.randomUUID(),
        anesthesiaRecordId,
        itemId: selectedMedicationId,
        timestamp: new Date(addDialog.timestamp),
        type: 'bolus',
        dose: doseValue,
        unit,
        route,
        rate: null,
        endTimestamp: null,
        administeredBy: null,
        createdAt: new Date(),
      };

      const updatedMedications = [...localMedications, newMedication].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );
      setLocalMedications(updatedMedications);
      onMedicationsChange?.(updatedMedications);

      setAddDialog({ open: false, timestamp: null });
    } catch (error) {
      console.error("Failed to add medication:", error);
    }
  };

  // Calculate position for a timestamp
  const getPositionPercent = (timestamp: Date | string) => {
    const time_ms = new Date(timestamp).getTime();
    const range_ms = timeRange.end - timeRange.start;
    const offset_ms = time_ms - timeRange.start;
    return (offset_ms / range_ms) * 100;
  };

  // Format time for display
  const formatTime = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Medications</h3>
        <Button
          size="sm"
          onClick={() => {
            setAddDialog({ open: true, timestamp: Date.now() });
            setSelectedMedicationId("");
            setDoseValue("");
          }}
          data-testid="button-add-medication"
        >
          <Pill className="h-4 w-4 mr-2" />
          Add Medication
        </Button>
      </div>

      {/* Timeline */}
      <div
        className="relative border rounded-lg bg-background"
        style={{ height: `${height}px` }}
        onClick={handleBackgroundClick}
        data-testid="medication-timeline"
      >
        {/* Swimlanes for each medication */}
        <div className="absolute inset-0 overflow-y-auto">
          {medicationsByItem.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Click to add medication doses</p>
            </div>
          ) : (
            medicationsByItem.map((group, index) => (
              <div
                key={group.item.id}
                className="relative border-b last:border-b-0"
                style={{ height: '80px' }}
                data-testid={`medication-lane-${group.item.id}`}
              >
                {/* Medication name label */}
                <div className="absolute left-0 top-0 bottom-0 w-40 flex items-center px-3 bg-muted/30 border-r">
                  <span className="text-sm font-medium truncate" data-testid={`text-medication-name-${group.item.id}`}>
                    {group.item.name}
                  </span>
                </div>

                {/* Dose markers */}
                <div className="absolute left-40 right-0 top-0 bottom-0">
                  {group.doses.map((dose, doseIndex) => {
                    const positionPercent = getPositionPercent(dose.timestamp);
                    if (positionPercent < 0 || positionPercent > 100) return null;

                    return (
                      <div
                        key={dose.id || doseIndex}
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: `${positionPercent}%` }}
                        data-testid={`medication-dose-${dose.id || doseIndex}`}
                      >
                        <div className="flex flex-col items-center gap-1">
                          {/* Pill marker */}
                          <div className="w-8 h-8 rounded-full bg-blue-500 dark:bg-blue-600 flex items-center justify-center text-white shadow-md hover:scale-110 transition-transform cursor-pointer">
                            <Pill className="h-4 w-4" />
                          </div>
                          {/* Dose info */}
                          <div className="flex flex-col items-center text-xs bg-background/90 backdrop-blur-sm px-2 py-1 rounded shadow-sm">
                            <span className="font-semibold" data-testid={`text-dose-value-${dose.id || doseIndex}`}>
                              {dose.dose} {dose.unit}
                            </span>
                            <span className="text-muted-foreground" data-testid={`text-dose-time-${dose.id || doseIndex}`}>
                              {formatTime(dose.timestamp)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Add Medication Dialog */}
      <Dialog open={addDialog.open} onOpenChange={(open) => setAddDialog({ ...addDialog, open })}>
        <DialogContent data-testid="dialog-add-medication">
          <DialogHeader>
            <DialogTitle>Add Medication Dose</DialogTitle>
            <DialogDescription>
              Record a medication bolus dose
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Medication selector */}
            <div className="space-y-2">
              <Label htmlFor="medication-select">Medication</Label>
              <Select value={selectedMedicationId} onValueChange={setSelectedMedicationId}>
                <SelectTrigger id="medication-select" data-testid="select-medication">
                  <SelectValue placeholder="Select medication..." />
                </SelectTrigger>
                <SelectContent>
                  {anesthesiaItems.map((item) => (
                    <SelectItem key={item.id} value={item.id} data-testid={`select-medication-option-${item.id}`}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Dose input */}
            <div className="space-y-2">
              <Label htmlFor="dose-input">
                Dose {selectedMedicationId && anesthesiaItems.find(i => i.id === selectedMedicationId)?.medicationConfig?.administrationUnit 
                  ? `(${anesthesiaItems.find(i => i.id === selectedMedicationId)?.medicationConfig?.administrationUnit})` 
                  : ''}
              </Label>
              <Input
                id="dose-input"
                type="text"
                value={doseValue}
                onChange={(e) => setDoseValue(e.target.value)}
                placeholder="Enter dose value"
                data-testid="input-dose"
              />
            </div>

            {/* Timestamp display */}
            {addDialog.timestamp && (
              <div className="space-y-2">
                <Label>Time</Label>
                <div className="text-sm text-muted-foreground" data-testid="text-timestamp">
                  {formatTime(new Date(addDialog.timestamp))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialog({ open: false, timestamp: null })}
              data-testid="button-cancel-add"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubmit}
              disabled={saveMedicationMutation.isPending}
              data-testid="button-submit-add"
            >
              {saveMedicationMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
