import type { FreeFlowSession } from "@/hooks/useMedicationState";
import type { SwimlaneConfig, AnesthesiaItem } from "./types";
import type { RateInfusionSegment, VitalsDialogState } from "./useVitalsDialogState";
import { formatTime } from "@/lib/dateUtils";

// ── Dependency types ──

interface MutationLike<TVariables> {
  mutate: (variables: TVariables, options?: any) => void;
  mutateAsync: (variables: TVariables) => Promise<any>;
}

interface UseInfusionHandlersParams {
  // Dialog state (all the state variables from useVitalsDialogState)
  dialogState: VitalsDialogState;

  // Data state from useMedicationState
  infusionData: Record<string, [number, string][]>;
  setInfusionData: React.Dispatch<React.SetStateAction<Record<string, [number, string][]>>>;
  freeFlowSessions: Record<string, FreeFlowSession[]>;
  setFreeFlowSessions: React.Dispatch<React.SetStateAction<Record<string, FreeFlowSession[]>>>;
  rateInfusionSessions: Record<string, any[]>;
  setRateInfusionSessions: React.Dispatch<React.SetStateAction<Record<string, any[]>>>;
  getActiveRateSession: (swimlaneId: string) => any;

  // Mutations
  createMedication: MutationLike<any>;
  updateMedication: MutationLike<any>;
  saveMedicationMutation: MutationLike<any>;

  // Record context
  anesthesiaRecordId?: string;
  anesthesiaItems: AnesthesiaItem[];
  activeSwimlanes: SwimlaneConfig[];
  currentTime: number;
  data: { medications?: any[] };

  // UI helpers
  toast: (opts: { title?: string; description?: string; variant?: "default" | "destructive" | null }) => void;
  t: (...args: any[]) => any;
}

/**
 * Extracts all infusion-related handler functions from UnifiedTimeline.
 * These handle free-flow infusions, rate-controlled infusions, infusion sheets,
 * rate selection, TCI stops, and rate changes.
 */
export function useInfusionHandlers({
  dialogState,
  infusionData,
  setInfusionData,
  freeFlowSessions,
  setFreeFlowSessions,
  rateInfusionSessions,
  setRateInfusionSessions,
  getActiveRateSession,
  createMedication,
  updateMedication,
  saveMedicationMutation,
  anesthesiaRecordId,
  anesthesiaItems,
  activeSwimlanes,
  currentTime,
  data,
  toast,
  t,
}: UseInfusionHandlersParams) {
  const {
    pendingInfusionValue, setPendingInfusionValue,
    infusionInput, setInfusionInput,
    setShowInfusionDialog,
    editingInfusionValue, setEditingInfusionValue,
    infusionEditInput, setInfusionEditInput,
    infusionEditTime, setInfusionEditTime,
    setShowInfusionEditDialog,
    pendingFreeFlowDose, setPendingFreeFlowDose,
    freeFlowDoseInput, setFreeFlowDoseInput,
    setShowFreeFlowDoseDialog,
    managingFreeFlowSession, setManagingFreeFlowSession,
    freeFlowManageTime, setFreeFlowManageTime,
    setShowFreeFlowManageDialog,
    freeFlowSheetSession, setFreeFlowSheetSession,
    sheetDoseInput, setSheetDoseInput,
    sheetTimeInput, setSheetTimeInput,
    setShowFreeFlowSheet,
    rateSheetSession, setRateSheetSession,
    sheetRateInput, setSheetRateInput,
    sheetRateTimeInput, setSheetRateTimeInput,
    sheetQuantityInput, setSheetQuantityInput,
    setShowRateSheet,
    pendingRateSelection, setPendingRateSelection,
    setCustomRateInput,
    setShowRateSelectionDialog,
    managingRate, setManagingRate,
    rateManageTime, setRateManageTime,
    setRateManageInput,
    setShowRateManageDialog,
  } = dialogState;

  const getActiveSession = getActiveRateSession;

  // Handle infusion value entry
  const handleInfusionValueEntry = () => {
    if (!pendingInfusionValue || !infusionInput.trim()) return;

    const { swimlaneId, time, label } = pendingInfusionValue;

    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, infusionInput.trim()] as [number, string]]
      };
    });

    // Reset dialog state
    setShowInfusionDialog(false);
    setPendingInfusionValue(null);
    setInfusionInput("");
  };

  // Handle infusion value edit save
  const handleInfusionValueEditSave = () => {
    if (!editingInfusionValue || !infusionEditInput.trim()) return;

    const { swimlaneId, index } = editingInfusionValue;

    // Use the edited timestamp directly (it's already a number)
    const newTimestamp = infusionEditTime;

    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData];
      updated[index] = [newTimestamp, infusionEditInput.trim()];
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });

    // Reset dialog state
    setShowInfusionEditDialog(false);
    setEditingInfusionValue(null);
    setInfusionEditInput("");
    setInfusionEditTime(0);
  };

  // Handle infusion value delete
  const handleInfusionValueDelete = () => {
    if (!editingInfusionValue) return;

    const { swimlaneId, index } = editingInfusionValue;

    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = existingData.filter((_, i) => i !== index);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });

    setShowInfusionEditDialog(false);
    setEditingInfusionValue(null);
    setInfusionEditInput("");
  };

  // Handle free-flow dose entry (first click, no default dose)
  const handleFreeFlowDoseEntry = () => {
    if (!pendingFreeFlowDose) return;

    const { swimlaneId, time, label } = pendingFreeFlowDose;

    // Validate numeric input only
    const doseValue = freeFlowDoseInput.trim();
    if (!doseValue || isNaN(Number(doseValue)) || Number(doseValue) <= 0) {
      toast({
        title: t("anesthesia.timeline.toasts.invalidDose", "Invalid dose"),
        description: t("anesthesia.timeline.toasts.invalidDoseDesc", "Please enter a valid numeric dose value"),
        variant: "destructive",
      });
      return;
    }

    // Create new session
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: time,
      dose: doseValue,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });

    // Add visual marker
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, doseValue] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Reset dialog state
    setShowFreeFlowDoseDialog(false);
    setPendingFreeFlowDose(null);
    setFreeFlowDoseInput("");
  };

  // Handle free-flow stop (second click)
  const handleFreeFlowStop = () => {
    if (!managingFreeFlowSession) return;

    const { swimlaneId, startTime } = managingFreeFlowSession;
    const stopTime = freeFlowManageTime;

    // Remove the session from active sessions (stopping it)
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });

    // Add a stop marker to terminate the dashed line
    // Use empty string as value to indicate stop point
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Always add stop marker (ensure it's at least 1ms after start to avoid duplicate)
      const actualStopTime = stopTime <= startTime ? startTime + 60000 : stopTime; // Add 1 minute if same time
      return {
        ...prev,
        [swimlaneId]: [...existingData, [actualStopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.administrationStopped", "Administration stopped"),
      description: t("anesthesia.timeline.toasts.administrationStoppedDesc", "{{label}} stopped at {{time}}", { label: managingFreeFlowSession.label, time: formatTime(new Date(stopTime)) }),
    });

    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow start (resume a stopped segment)
  const handleFreeFlowStart = () => {
    if (!managingFreeFlowSession) return;

    const { swimlaneId, label, dose, startTime } = managingFreeFlowSession;
    const resumeTime = freeFlowManageTime;

    // Create new session to resume the infusion
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: resumeTime,
      dose,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });

    // Add visual marker for resume
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [resumeTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.administrationResumed", "Administration resumed"),
      description: t("anesthesia.timeline.toasts.administrationResumedDesc", "{{label}} resumed with dose {{dose}}", { label, dose }),
    });

    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow start new (from management dialog)
  const handleFreeFlowStartNew = () => {
    if (!managingFreeFlowSession) return;

    const { swimlaneId, label, dose, startTime: oldStartTime } = managingFreeFlowSession;
    const baseTime = freeFlowManageTime;

    // Stop the current session 1 second before the base time
    const stopTime = baseTime - 1000;
    // Start the new session 60 seconds after the base time (60-second gap)
    const newStartTime = baseTime + 60000;

    // Remove the old session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== oldStartTime),
      };
    });

    // Create new session with same dose at the new start time
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: newStartTime,
      dose,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });

    // Add stop marker for old segment, then start marker for new segment (60 seconds later)
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const withStop = [...existingData, [stopTime, ""] as [number, string]];
      return {
        ...prev,
        [swimlaneId]: [...withStop, [newStartTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.newAdministrationStarted", "New administration started"),
      description: t("anesthesia.timeline.toasts.newAdministrationStartedDesc", "{{label}} started with dose {{dose}}", { label, dose }),
    });

    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle free-flow delete (from management dialog)
  const handleFreeFlowDelete = () => {
    if (!managingFreeFlowSession) return;

    const { swimlaneId, startTime } = managingFreeFlowSession;

    // Remove session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });

    // Remove ALL associated markers from infusionData for this segment
    // Find and remove all markers between session's startTime and the next stop marker (or end)
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => a[0] - b[0]);

      // Find the index of the segment start
      const segmentStartIndex = sortedData.findIndex(([time]) => time === startTime);

      if (segmentStartIndex === -1) {
        // Segment not found, return as is
        return prev;
      }

      // Find the next stop marker (empty string) after the segment start
      const segmentEndIndex = sortedData.findIndex((marker, idx) =>
        idx > segmentStartIndex && marker[1] === ""
      );

      // Remove markers based on whether a stop marker exists
      let filtered;
      if (segmentEndIndex === -1) {
        // No stop marker: only delete the start marker itself (currently running segment)
        filtered = sortedData.filter((_, idx) => idx !== segmentStartIndex);
      } else {
        // Stop marker exists: delete all markers from start to stop (inclusive)
        filtered = sortedData.filter((_, idx) =>
          idx < segmentStartIndex || idx > segmentEndIndex
        );
      }

      return {
        ...prev,
        [swimlaneId]: filtered,
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.administrationDeleted", "Administration deleted"),
      description: t("anesthesia.timeline.toasts.administrationDeletedDesc", "{{label}} administration removed", { label: managingFreeFlowSession.label }),
    });

    // Reset dialog state
    setShowFreeFlowManageDialog(false);
    setManagingFreeFlowSession(null);
    setFreeFlowManageTime(0);
  };

  // Handle unified sheet save
  const handleSheetSave = () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, startTime: oldTime, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim();
    const newTime = sheetTimeInput;

    if (!newDose) {
      toast({
        title: t("anesthesia.timeline.toasts.invalidQuantity", "Invalid quantity"),
        description: t("anesthesia.timeline.toasts.invalidQuantityDesc", "Please enter a quantity value"),
        variant: "destructive",
      });
      return;
    }

    // Find the marker index
    const existingData = infusionData[swimlaneId] || [];
    const markerIndex = existingData.findIndex(([t]) => t === oldTime);

    if (markerIndex === -1) return;

    // Update the infusion data
    setInfusionData(prev => {
      const updated = [...(prev[swimlaneId] || [])];
      updated[markerIndex] = [newTime, newDose];

      return {
        ...prev,
        [swimlaneId]: updated.sort((a, b) => a[0] - b[0]),
      };
    });

    // Always update the session to keep it in sync
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = sessions.map(session =>
        session.startTime === oldTime
          ? { ...session, startTime: newTime, dose: newDose }
          : session
      );
      return {
        ...prev,
        [swimlaneId]: updated.sort((a, b) => a.startTime - b.startTime),
      };
    });

    // Update the sheet session to reflect changes
    setFreeFlowSheetSession(prev => prev ? {
      ...prev,
      startTime: newTime,
      dose: newDose,
    } : null);

    toast({
      title: t("anesthesia.timeline.toasts.infusionUpdated", "Infusion updated"),
      description: t("anesthesia.timeline.toasts.infusionUpdatedDesc", "{{label}} updated", { label }),
    });

    // Reset sheet state
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet delete
  const handleSheetDelete = () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, startTime } = freeFlowSheetSession;

    // Remove session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== startTime),
      };
    });

    // Remove ALL associated markers from infusionData for this segment
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => a[0] - b[0]);

      // Find the index of the segment start
      const segmentStartIndex = sortedData.findIndex(([time]) => time === startTime);

      if (segmentStartIndex === -1) {
        return prev;
      }

      // Find the next stop marker after the segment start
      const segmentEndIndex = sortedData.findIndex((marker, idx) =>
        idx > segmentStartIndex && marker[1] === ""
      );

      // Remove markers based on whether a stop marker exists
      let filtered;
      if (segmentEndIndex === -1) {
        // No stop marker: only delete the start marker itself (currently running segment)
        filtered = sortedData.filter((_, idx) => idx !== segmentStartIndex);
      } else {
        // Stop marker exists: delete all markers from start to stop (inclusive)
        filtered = sortedData.filter((_, idx) =>
          idx < segmentStartIndex || idx > segmentEndIndex
        );
      }

      return {
        ...prev,
        [swimlaneId]: filtered,
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionDeleted", "Infusion deleted"),
      description: t("anesthesia.timeline.toasts.infusionDeletedDesc", "{{label}} removed", { label: freeFlowSheetSession.label }),
    });

    // Reset sheet state
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Apply edits to free-flow sheet session (called when dialog closes or actions are taken)
  const applySheetEdits = () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, startTime, dose } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim();
    const newStartTime = sheetTimeInput;

    // Only apply if there are actual changes
    if (!newDose && !newStartTime) return;
    if (newDose === dose && newStartTime === startTime) return;

    const finalDose = newDose || dose;
    const finalStartTime = newStartTime || startTime;

    // Update infusion data
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Remove old marker and add updated one
      const withoutOld = existingData.filter(([t, _]) => t !== startTime);
      return {
        ...prev,
        [swimlaneId]: [...withoutOld, [finalStartTime, finalDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Update session
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = sessions.map(s =>
        s.startTime === startTime
          ? { ...s, startTime: finalStartTime, dose: finalDose }
          : s
      );
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });
  };

  // Handle sheet stop
  const handleSheetStop = async () => {
    if (!freeFlowSheetSession || !anesthesiaRecordId) return;

    const { swimlaneId, label, startTime, dose } = freeFlowSheetSession;
    const stopTime = currentTime;

    // Apply any edits first (if quantity or time was changed)
    const newDose = sheetDoseInput.trim() || dose;
    const newStartTime = sheetTimeInput || startTime;

    // Find the medication ID for this infusion start
    const medications = data.medications || [];
    const swimlaneParts = swimlaneId.split('-item-');
    const adminGroupPart = swimlaneParts[0];

    // Get the item ID from the swimlane
    const item = anesthesiaItems?.find(i => {
      const expectedSwimlaneId = `${adminGroupPart}-item-${i.id}`;
      return expectedSwimlaneId === swimlaneId;
    });

    if (!item) {
      console.error('[SHEET-STOP] Could not find item for swimlane:', swimlaneId);
      return;
    }

    // Find the medication record for this infusion start
    const medicationRecord = medications.find(med =>
      med.itemId === item.id &&
      med.type === 'infusion_start' &&
      new Date(med.timestamp).getTime() === (newStartTime || startTime)
    );

    if (!medicationRecord) {
      console.error('[SHEET-STOP] Could not find medication record for infusion');
      return;
    }

    // If edits were made, update the infusion data
    if (newDose !== dose || newStartTime !== startTime) {
      setInfusionData(prev => {
        const existingData = prev[swimlaneId] || [];
        // Remove old marker and add updated one
        const withoutOld = existingData.filter(([t, _]) => t !== startTime);
        return {
          ...prev,
          [swimlaneId]: [...withoutOld, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
        };
      });

      // Update session if time changed
      if (newStartTime !== startTime) {
        setFreeFlowSessions(prev => {
          const sessions = prev[swimlaneId] || [];
          const updated = sessions.map(s =>
            s.startTime === startTime
              ? { ...s, startTime: newStartTime, dose: newDose }
              : s
          );
          return {
            ...prev,
            [swimlaneId]: updated,
          };
        });
      }
    }

    // Remove the session from freeFlowSessions
    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: sessions.filter(s => s.startTime !== (newStartTime || startTime)),
      };
    });

    // Add stop marker
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [stopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Save to database - update the medication record with endTimestamp
    try {
      await updateMedication.mutateAsync({
        id: medicationRecord.id,
        endTimestamp: new Date(stopTime),
      });

      toast({
        title: t("anesthesia.timeline.toasts.infusionStopped", "Infusion stopped"),
        description: t("anesthesia.timeline.toasts.infusionStoppedDesc", "{{label}} stopped", { label }),
      });
    } catch (error) {
      console.error('[SHEET-STOP] Error saving stop:', error);
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.failedToSaveInfusionStop", "Failed to save infusion stop"),
        variant: "destructive",
      });
      return;
    }

    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet start (resume)
  const handleSheetStart = () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, label } = freeFlowSheetSession;
    // Use the latest dose from input, or fallback to session dose
    const dose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    const newStartTime = currentTime;


    // Create a new session at current time
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: newStartTime,
      dose,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      const updated = [...sessions, newSession].sort((a, b) => a.startTime - b.startTime);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });

    // Add start marker with the same dose
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const updated = [...existingData, [newStartTime, dose] as [number, string]].sort((a, b) => a[0] - b[0]);
      return {
        ...prev,
        [swimlaneId]: updated,
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionResumed", "Infusion resumed"),
      description: t("anesthesia.timeline.toasts.infusionResumedDesc", "{{label}} resumed with dose {{dose}}", { label, dose }),
    });

    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet start new (hang a new bag)
  const handleSheetStartNew = async () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    // Use sheetTimeInput (clicked time) instead of currentTime
    const newStartTime = sheetTimeInput || currentTime;

    if (!newDose) {
      toast({
        title: t("anesthesia.timeline.toasts.quantityRequired", "Quantity required"),
        description: t("anesthesia.timeline.toasts.quantityRequiredDesc", "Please enter the quantity for the new bag"),
        variant: "destructive",
      });
      return;
    }

    // Get item ID from swimlane
    const item = anesthesiaItems.find(i => `admingroup-${i.administrationGroup}-item-${i.id}` === swimlaneId);
    if (!item) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.couldNotFindMedicationItem", "Could not find medication item"),
        variant: "destructive",
      });
      return;
    }

    // Update local state optimistically
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: newStartTime,
      dose: newDose,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });

    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Save to database using mutation
    console.log('[SHEET-START-NEW] Saving to database:', {
      anesthesiaRecordId,
      itemId: item.id,
      timestamp: new Date(newStartTime),
      dose: newDose,
    });

    try {
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId: anesthesiaRecordId!,
        itemId: item.id,
        timestamp: new Date(newStartTime),
        type: 'infusion_start' as const,
        rate: 'free',
        dose: newDose,
      });

      toast({
        title: t("anesthesia.timeline.toasts.newBagStarted", "New bag started"),
        description: t("anesthesia.timeline.toasts.newBagStartedDesc", "{{label}} - new bag with {{dose}}ml started", { label, dose: newDose }),
      });
    } catch (error) {
      console.error('[SHEET-START-NEW] Failed to save:', error);
      toast({
        title: t("anesthesia.timeline.toasts.errorSavingInfusion", "Error saving infusion"),
        description: error instanceof Error ? error.message : t("anesthesia.timeline.toasts.failedToSave", "Failed to save"),
        variant: "destructive",
      });
    }

    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // Handle sheet duplicate (create a parallel infusion)
  const handleSheetDuplicate = async () => {
    if (!freeFlowSheetSession) return;

    const { swimlaneId, label } = freeFlowSheetSession;
    const newDose = sheetDoseInput.trim() || freeFlowSheetSession.dose;
    const newStartTime = sheetTimeInput || currentTime; // Use selected time or current time

    if (!newDose) {
      toast({
        title: t("anesthesia.timeline.toasts.quantityRequired", "Quantity required"),
        description: t("anesthesia.timeline.toasts.quantityRequiredParallel", "Please enter the quantity for the parallel infusion"),
        variant: "destructive",
      });
      return;
    }

    // Get item ID from swimlane
    const item = anesthesiaItems.find(i => `admingroup-${i.administrationGroup}-item-${i.id}` === swimlaneId);
    if (!item) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.couldNotFindMedicationItem", "Could not find medication item"),
        variant: "destructive",
      });
      return;
    }

    // Update local state optimistically
    const newSession: FreeFlowSession = {
      id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      swimlaneId,
      startTime: newStartTime,
      dose: newDose,
      label,
    };

    setFreeFlowSessions(prev => {
      const sessions = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...sessions, newSession].sort((a, b) => a.startTime - b.startTime),
      };
    });

    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [newStartTime, newDose] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Save to database using mutation
    console.log('[SHEET-DUPLICATE] Saving parallel infusion to database:', {
      anesthesiaRecordId,
      itemId: item.id,
      timestamp: new Date(newStartTime),
      dose: newDose,
    });

    try {
      await saveMedicationMutation.mutateAsync({
        anesthesiaRecordId: anesthesiaRecordId!,
        itemId: item.id,
        timestamp: new Date(newStartTime),
        type: 'infusion_start' as const,
        rate: 'free',
        dose: newDose,
      });

      toast({
        title: t("anesthesia.timeline.toasts.parallelInfusionStarted", "Parallel infusion started"),
        description: t("anesthesia.timeline.toasts.parallelInfusionStartedDesc", "{{label}} - parallel infusion with {{dose}}ml started", { label, dose: newDose }),
      });
    } catch (error) {
      console.error('[SHEET-DUPLICATE] Failed to save:', error);
      toast({
        title: t("anesthesia.timeline.toasts.errorSavingInfusion", "Error saving infusion"),
        description: error instanceof Error ? error.message : t("anesthesia.timeline.toasts.failedToSave", "Failed to save"),
        variant: "destructive",
      });
    }

    // Close sheet
    setShowFreeFlowSheet(false);
    setFreeFlowSheetSession(null);
    setSheetDoseInput("");
    setSheetTimeInput(0);
  };

  // ============ Rate Infusion Sheet Handlers ============

  // Handle rate sheet save (editing historical rate data)
  const handleRateSheetSave = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const newTime = sheetRateTimeInput;

    if (!newRate) {
      toast({
        title: t("anesthesia.timeline.toasts.invalidRate", "Invalid rate"),
        description: t("anesthesia.timeline.toasts.invalidRateDesc", "Please enter a rate value"),
        variant: "destructive",
      });
      return;
    }

    // Update the rate in infusionData and session segments
    const session = getActiveSession(swimlaneId);
    if (session) {
      setRateInfusionSessions(prev => {
        const sessions = prev[swimlaneId];
        if (!sessions || sessions.length === 0) return prev;

        // Update the active session (last running or last in array)
        const activeIndex = sessions.findIndex((s: any) => s.state === 'running');
        const indexToUpdate = activeIndex !== -1 ? activeIndex : sessions.length - 1;

        const updatedSegments = sessions[indexToUpdate].segments.map((seg: any, idx: number) =>
          idx === sessions[indexToUpdate].segments.length - 1
            ? { ...seg, rate: newRate, startTime: newTime || seg.startTime }
            : seg
        );

        const updatedSessions = [...sessions];
        updatedSessions[indexToUpdate] = {
          ...sessions[indexToUpdate],
          segments: updatedSegments,
        };

        return {
          ...prev,
          [swimlaneId]: updatedSessions,
        };
      });
    }

    // Update infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      const sortedData = [...existingData].sort((a, b) => b[0] - a[0]);
      const latestIndex = sortedData.findIndex(([_, val]) => val !== "");

      if (latestIndex !== -1) {
        const updated = [...existingData];
        const originalTime = sortedData[latestIndex][0];
        const replaceIndex = updated.findIndex(([t]) => t === originalTime);
        if (replaceIndex !== -1) {
          updated[replaceIndex] = [newTime || originalTime, newRate];
        }
        return {
          ...prev,
          [swimlaneId]: updated.sort((a, b) => a[0] - b[0]),
        };
      }
      return prev;
    });

    toast({
      title: t("anesthesia.timeline.toasts.rateUpdated", "Rate updated"),
      description: t("anesthesia.timeline.toasts.rateUpdatedDesc", "{{label}} rate updated to {{rate}}", { label, rate: newRate }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetRateTimeInput(0);
  };

  // Handle rate sheet pause
  const handleRateSheetPause = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label } = rateSheetSession;

    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;

      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'paused',
        },
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionPaused", "Infusion paused"),
      description: t("anesthesia.timeline.toasts.infusionPausedDesc", "{{label}} paused", { label }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
  };

  // Handle rate sheet resume
  const handleRateSheetResume = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label } = rateSheetSession;

    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;

      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'running',
        },
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionResumed", "Infusion resumed"),
      description: t("anesthesia.timeline.toasts.infusionResumedSimple", "{{label}} resumed", { label }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
  };

  // Handle rate sheet stop
  const handleRateSheetStop = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label } = rateSheetSession;
    const stopTime = currentTime;

    // Add stop marker to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [stopTime, ""] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Update session state to stopped
    setRateInfusionSessions(prev => {
      const session = prev[swimlaneId];
      if (!session) return prev;

      return {
        ...prev,
        [swimlaneId]: {
          ...session,
          state: 'stopped',
        },
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionStopped", "Infusion stopped"),
      description: t("anesthesia.timeline.toasts.infusionStoppedDesc", "{{label}} stopped", { label }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
  };

  // Handle rate sheet change rate (creates new segment at current time)
  const handleRateSheetChangeRate = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label, rateUnit } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const changeTime = currentTime;

    if (!newRate) {
      toast({
        title: t("anesthesia.timeline.toasts.invalidRate", "Invalid rate"),
        description: t("anesthesia.timeline.toasts.invalidRateDesc", "Please enter a rate value"),
        variant: "destructive",
      });
      return;
    }

    // Add new rate segment
    setRateInfusionSessions(prev => {
      const sessions = prev[swimlaneId];
      if (!sessions || sessions.length === 0) return prev;

      const newSegment: RateInfusionSegment = {
        startTime: changeTime,
        rate: newRate,
        rateUnit: rateUnit,
      };

      const activeSession = sessions.find((s: any) => s.state === 'running') || sessions[sessions.length - 1];
      return {
        ...prev,
        [swimlaneId]: sessions.map((s: any) => s === activeSession ? {
          ...s,
          segments: [...s.segments, newSegment],
        } : s),
      };
    });

    // Add new rate to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [changeTime, newRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.rateChanged", "Rate changed"),
      description: t("anesthesia.timeline.toasts.rateChangedDesc", "{{label}} rate changed to {{rate}} {{unit}}", { label, rate: newRate, unit: rateUnit }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
  };

  // Handle rate sheet start new (new syringe with inventory deduction)
  const handleRateSheetStartNew = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label, rateUnit } = rateSheetSession;
    const newRate = sheetRateInput.trim();
    const newQuantity = sheetQuantityInput.trim();
    const startTime = currentTime;

    if (!newRate) {
      toast({
        title: t("anesthesia.timeline.toasts.rateRequired", "Rate required"),
        description: t("anesthesia.timeline.toasts.rateRequiredDesc", "Please enter a rate value"),
        variant: "destructive",
      });
      return;
    }

    // TODO: Add inventory deduction here when implementing task 7

    // Create new session or update existing
    const newSegment: RateInfusionSegment = {
      startTime,
      rate: newRate,
      rateUnit: rateUnit,
    };

    setRateInfusionSessions(prev => {
      return {
        ...prev,
        [swimlaneId]: [...(prev[swimlaneId] || []), {
          id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          swimlaneId,
          label,
          syringeQuantity: newQuantity || "50ml",
          startDose: newRate,
          segments: [newSegment],
          state: 'running' as const,
        }],
      };
    });

    // Add start marker to infusionData
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      // Add stop marker first if there was a previous session, then start new
      const withStop = existingData.length > 0
        ? [...existingData, [startTime, ""] as [number, string]]
        : existingData;
      return {
        ...prev,
        [swimlaneId]: [...withStop, [startTime, newRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.newInfusionStarted", "New infusion started"),
      description: t("anesthesia.timeline.toasts.newInfusionStartedDesc", "{{label}} started at {{rate}} {{unit}}", { label, rate: newRate, unit: rateUnit }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetQuantityInput("");
  };

  // Handle rate sheet delete
  const handleRateSheetDelete = () => {
    if (!rateSheetSession) return;

    const { swimlaneId, label } = rateSheetSession;

    // Remove entire session
    setRateInfusionSessions(prev => {
      const newSessions = { ...prev };
      delete newSessions[swimlaneId];
      return newSessions;
    });

    // Remove all infusion data for this lane
    setInfusionData(prev => {
      const newData = { ...prev };
      delete newData[swimlaneId];
      return newData;
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionDeleted", "Infusion deleted"),
      description: t("anesthesia.timeline.toasts.infusionDeletedDesc", "{{label}} removed", { label }),
    });

    setShowRateSheet(false);
    setRateSheetSession(null);
    setSheetRateInput("");
    setSheetQuantityInput("");
  };

  // Handle rate selection (from rate options or custom input)
  const handleRateSelection = (selectedRate: string, initialBolus?: string) => {
    if (!pendingRateSelection) return;

    const { swimlaneId, time, label, itemId } = pendingRateSelection;

    // Add the selected rate to infusion data
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [time, selectedRate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    // Get the rateUnit from the swimlane
    const swimlane = activeSwimlanes.find((lane: any) => lane.id === swimlaneId);
    const rateUnit = swimlane?.rateUnit || '';

    // Create initial rate infusion session
    const newSegment: RateInfusionSegment = {
      startTime: time,
      rate: selectedRate,
      rateUnit: rateUnit,
    };
    setRateInfusionSessions(prev => ({
      ...prev,
      [swimlaneId]: [...(prev[swimlaneId] || []), {
        id: `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        swimlaneId,
        label,
        syringeQuantity: "50ml",
        startDose: selectedRate,
        segments: [newSegment],
        state: 'running' as const,
      }],
    }));

    // Persist to database
    if (itemId && anesthesiaRecordId) {
      createMedication.mutate({
        anesthesiaRecordId,
        itemId,
        timestamp: new Date(time),
        type: 'infusion_start',
        rate: selectedRate,
        dose: selectedRate, // Syringe quantity
        initialBolus: initialBolus || undefined, // Initial bolus given at infusion start
      });
    }

    toast({
      title: t("anesthesia.timeline.toasts.rateSet", "Rate set"),
      description: initialBolus
        ? t("anesthesia.timeline.toasts.rateSetWithBolus", "{{label}} set to {{rate}} with {{bolus}} bolus", { label, rate: selectedRate, bolus: initialBolus })
        : t("anesthesia.timeline.toasts.rateSetDesc", "{{label}} set to {{rate}}", { label, rate: selectedRate }),
    });

    // Reset dialog state
    setShowRateSelectionDialog(false);
    setPendingRateSelection(null);
    setCustomRateInput("");
  };

  // Handle custom rate entry (from rate selection dialog)
  const handleCustomRateEntry = (customRate: string, initialBolus?: string) => {
    const rate = customRate.trim();
    if (!rate || isNaN(Number(rate)) || Number(rate) <= 0) {
      toast({
        title: t("anesthesia.timeline.toasts.invalidRate", "Invalid rate"),
        description: t("anesthesia.timeline.toasts.invalidRatePositive", "Please enter a valid positive number"),
        variant: "destructive",
      });
      return;
    }
    handleRateSelection(rate, initialBolus);
  };

  // Handle rate start (resume a stopped rate-controlled infusion)
  const handleRateStart = (rate: string) => {
    if (!managingRate) return;

    const { swimlaneId, label } = managingRate;
    const resumeTime = rateManageTime;

    // Add new rate marker to resume the infusion
    setInfusionData(prev => {
      const existingData = prev[swimlaneId] || [];
      return {
        ...prev,
        [swimlaneId]: [...existingData, [resumeTime, rate] as [number, string]].sort((a, b) => a[0] - b[0]),
      };
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionResumed", "Infusion resumed"),
      description: t("anesthesia.timeline.toasts.infusionResumedAtRate", "{{label}} resumed at {{rate}}", { label, rate }),
    });

    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle rate stop (update the infusion_start record's endTimestamp)
  const handleRateStop = () => {
    if (!managingRate || !anesthesiaRecordId) return;

    const { label, sessionId } = managingRate;
    const stopTime = rateManageTime;

    if (!sessionId) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.sessionNotIdentified", "Session not identified"),
        variant: "destructive",
      });
      return;
    }

    // Update the infusion_start record with endTimestamp
    updateMedication.mutate({
      id: sessionId,
      endTimestamp: new Date(stopTime),
    });

    toast({
      title: t("anesthesia.timeline.toasts.infusionStopped", "Infusion stopped"),
      description: t("anesthesia.timeline.toasts.infusionStoppedDesc", "{{label}} stopped", { label }),
    });

    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle TCI stop (stop infusion and record actual amount used for inventory calculation)
  const handleTciStop = (amountUsed: string) => {
    if (!managingRate || !anesthesiaRecordId) return;

    const { label, sessionId, itemId, administrationUnit, ampuleUnit } = managingRate;
    const stopTime = rateManageTime;

    // Validate amount input
    const parsedAmount = parseFloat(amountUsed);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.pleaseEnterValidAmount", "Please enter a valid amount"),
        variant: "destructive",
      });
      return;
    }

    if (!sessionId) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.sessionNotIdentified", "Session not identified"),
        variant: "destructive",
      });
      return;
    }

    if (!itemId) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.medicationItemNotIdentified", "Medication item not identified"),
        variant: "destructive",
      });
      return;
    }

    // For TCI, use ampuleUnit (e.g., "mg" from "200 mg" ampule content) as the dose unit
    // This is the actual medication unit, not the TCI target concentration unit
    const doseUnit = ampuleUnit || administrationUnit;
    const formattedDose = doseUnit
      ? `${amountUsed} ${doseUnit}`
      : amountUsed;

    // Close dialog immediately to show progress (user sees spinner in background)
    setShowRateManageDialog(false);

    // Update the infusion_start record with endTimestamp
    updateMedication.mutate({
      id: sessionId,
      endTimestamp: new Date(stopTime),
    }, {
      onSuccess: () => {
        // Create an infusion_stop record to capture the actual amount used
        // Link to the session via infusionSessionId for proper pairing
        createMedication.mutate({
          anesthesiaRecordId,
          itemId,
          timestamp: new Date(stopTime),
          type: 'infusion_stop',
          dose: formattedDose, // Store actual amount used for inventory calculation
          infusionSessionId: sessionId, // Link to the parent session
        }, {
          onSuccess: () => {
            // Only show success and reset state after both mutations complete
            toast({
              title: t("anesthesia.timeline.tciStopInfusion"),
              description: `${label} - ${formattedDose}`,
            });
            setManagingRate(null);
            setRateManageTime(0);
            setRateManageInput("");
          },
          onError: (error: any) => {
            toast({
              title: t("common.error", "Error"),
              description: t("anesthesia.timeline.toasts.failedToRecordTciAmount", "Failed to record TCI amount. Please try again."),
              variant: "destructive",
            });
            console.error('[TCI-STOP] Failed to create stop record:', error);
          }
        });
      },
      onError: (error: any) => {
        toast({
          title: t("common.error", "Error"),
          description: t("anesthesia.timeline.toasts.failedToStopTciInfusion", "Failed to stop TCI infusion. Please try again."),
          variant: "destructive",
        });
        console.error('[TCI-STOP] Failed to update session:', error);
        // Re-open dialog on error so user can try again
        setShowRateManageDialog(true);
      }
    });
  };

  // Handle start new rate (stop current and create new infusion_start)
  const handleRateStartNew = (newRate: string, initialBolus?: string) => {
    if (!managingRate || !anesthesiaRecordId) return;

    const { swimlaneId, label, itemId, sessionId } = managingRate;
    const newTime = rateManageTime;
    const stopTime = newTime - 60000; // Stop 1 minute before new start

    if (!itemId) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.medicationItemNotIdentified", "Medication item not identified"),
        variant: "destructive",
      });
      return;
    }

    // Get current session for syringe quantity
    const sessions = rateInfusionSessions[swimlaneId];
    const currentSession = sessions?.find((s: any) => s.id === sessionId);

    // First, stop the current infusion if there is one
    if (sessionId) {
      updateMedication.mutate({
        id: sessionId,
        endTimestamp: new Date(stopTime),
      });
    }

    // Then create a new infusion_start record
    createMedication.mutate({
      anesthesiaRecordId,
      itemId,
      timestamp: new Date(newTime),
      type: 'infusion_start',
      rate: newRate,
      dose: currentSession?.syringeQuantity || '50ml', // Use same syringe quantity or default
      initialBolus: initialBolus || undefined, // Initial bolus given at infusion start
    });

    toast({
      title: t("anesthesia.timeline.toasts.newInfusionStarted", "New infusion started"),
      description: t("anesthesia.timeline.toasts.newInfusionStartedSimple", "{{label}} started at {{rate}}", { label, rate: newRate }),
    });

    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  // Handle change rate (create a new rate_change medication record)
  const handleRateChange = (newRate: string) => {
    if (!managingRate || !anesthesiaRecordId) return;

    const { label, itemId } = managingRate;
    const changeTime = rateManageTime; // Use the manage time, not original time

    if (!itemId) {
      toast({
        title: t("common.error", "Error"),
        description: t("anesthesia.timeline.toasts.medicationItemNotIdentified", "Medication item not identified"),
        variant: "destructive",
      });
      return;
    }

    // Create a rate_change medication record
    createMedication.mutate({
      anesthesiaRecordId,
      itemId,
      timestamp: new Date(changeTime),
      type: 'rate_change',
      rate: newRate,
    });

    toast({
      title: t("anesthesia.timeline.toasts.rateChanged", "Rate changed"),
      description: t("anesthesia.timeline.toasts.rateChangedSimple", "{{label}} changed to {{rate}}", { label, rate: newRate }),
    });

    // Reset dialog state
    setShowRateManageDialog(false);
    setManagingRate(null);
    setRateManageTime(0);
    setRateManageInput("");
  };

  return {
    handleInfusionValueEntry,
    handleInfusionValueEditSave,
    handleInfusionValueDelete,
    handleFreeFlowDoseEntry,
    handleFreeFlowStop,
    handleFreeFlowStart,
    handleFreeFlowStartNew,
    handleFreeFlowDelete,
    handleSheetSave,
    handleSheetDelete,
    applySheetEdits,
    handleSheetStop,
    handleSheetStart,
    handleSheetStartNew,
    handleSheetDuplicate,
    handleRateSheetSave,
    handleRateSheetPause,
    handleRateSheetResume,
    handleRateSheetStop,
    handleRateSheetChangeRate,
    handleRateSheetStartNew,
    handleRateSheetDelete,
    handleRateSelection,
    handleCustomRateEntry,
    handleRateStart,
    handleRateStop,
    handleTciStop,
    handleRateStartNew,
    handleRateChange,
  };
}
