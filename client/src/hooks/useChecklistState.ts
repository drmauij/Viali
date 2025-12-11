import { useState, useEffect, useRef } from "react";
import { useDebouncedAutoSave } from "@/hooks/useDebouncedAutoSave";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { apiRequest } from "@/lib/queryClient";

export type ChecklistType = 'signIn' | 'timeOut' | 'signOut';

interface ChecklistData {
  checklist?: Record<string, boolean>;
  notes?: string;
  signature?: string;
}

interface UseChecklistStateProps {
  checklistType: ChecklistType;
  anesthesiaRecordId?: string;
  surgeryId: string;
  initialData?: ChecklistData;
}

interface ChecklistState {
  checklist: Record<string, boolean>;
  notes: string;
  signature: string;
  showSignaturePad: boolean;
  saveStatus: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  setChecklist: (checklist: Record<string, boolean>) => void;
  setNotes: (notes: string) => void;
  setSignature: (signature: string) => void;
  setShowSignaturePad: (show: boolean) => void;
}

export function useChecklistState({
  checklistType,
  anesthesiaRecordId,
  surgeryId,
  initialData,
}: UseChecklistStateProps): ChecklistState {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const prevAnesthesiaRecordIdRef = useRef<string | undefined>();

  // Convert checklistType from camelCase to kebab-case: signIn -> sign-in, timeOut -> time-out, signOut -> sign-out
  const kebabType = checklistType.replace(/([A-Z])/g, '-$1').toLowerCase();

  // Debounced auto-save for checkbox/notes changes (longer debounce to batch multiple clicks)
  const debouncedSave = useDebouncedAutoSave({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecordId}/checklist/${kebabType}`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    debounceMs: 2000, // 2 second debounce for checkbox/notes changes
  });

  // Immediate save for signature changes (saves everything at once)
  const immediateSave = useAutoSaveMutation({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecordId}/checklist/${kebabType}`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  useEffect(() => {
    if (initialData) {
      if (initialData.checklist) {
        setChecklist(initialData.checklist);
      }
      if (initialData.notes) {
        setNotes(initialData.notes);
      }
      if (initialData.signature) {
        setSignature(initialData.signature);
      }
    }
  }, [initialData]);

  // Flush pending changes when anesthesiaRecordId becomes available
  useEffect(() => {
    const prevId = prevAnesthesiaRecordIdRef.current;
    const hasAnyData = Object.keys(checklist).length > 0 || notes.trim() !== "" || signature !== "";
    
    // If anesthesiaRecordId transitioned from undefined to defined, and we have pending data
    if (!prevId && anesthesiaRecordId && hasAnyData && immediateSave.status !== 'saving') {
      immediateSave.mutate({
        checklist,
        notes,
        signature,
      });
    }
    
    // Update ref for next render
    prevAnesthesiaRecordIdRef.current = anesthesiaRecordId;
  }, [anesthesiaRecordId, checklist, notes, signature, immediateSave]);

  const handleChecklistChange = (newChecklist: Record<string, boolean>) => {
    setChecklist(newChecklist);
    // Use debounced save for checkbox changes (batches multiple rapid clicks)
    if (anesthesiaRecordId) {
      debouncedSave.mutate({
        checklist: newChecklist,
        notes,
        signature,
      });
    }
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    // Use debounced save for notes changes
    if (anesthesiaRecordId) {
      debouncedSave.mutate({
        checklist,
        notes: newNotes,
        signature,
      });
    }
  };

  const handleSignatureChange = (newSignature: string) => {
    setSignature(newSignature);
    // Immediate save when signature is entered (flushes pending and saves everything)
    if (anesthesiaRecordId) {
      // Flush any pending debounced changes first, then do immediate save
      debouncedSave.flush?.();
      immediateSave.mutate({
        checklist,
        notes,
        signature: newSignature,
      });
    }
  };

  // Combine statuses: prioritize immediate save status, then debounced
  const combinedStatus = immediateSave.status !== 'idle' 
    ? immediateSave.status 
    : debouncedSave.status;

  return {
    checklist,
    notes,
    signature,
    showSignaturePad,
    saveStatus: combinedStatus,
    setChecklist: handleChecklistChange,
    setNotes: handleNotesChange,
    setSignature: handleSignatureChange,
    setShowSignaturePad,
  };
}
