import { useState, useEffect, useRef } from "react";
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
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
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

  const autoSave = useAutoSaveMutation({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecordId) throw new Error("No anesthesia record");
      // Convert checklistType from camelCase to kebab-case: signIn -> sign-in, timeOut -> time-out, signOut -> sign-out
      const kebabType = checklistType.replace(/([A-Z])/g, '-$1').toLowerCase();
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
    if (!prevId && anesthesiaRecordId && hasAnyData && autoSave.status !== 'saving') {
      autoSave.mutate({
        checklist,
        notes,
        signature,
      });
    }
    
    // Update ref for next render
    prevAnesthesiaRecordIdRef.current = anesthesiaRecordId;
  }, [anesthesiaRecordId, checklist, notes, signature, autoSave]);

  const handleChecklistChange = (newChecklist: Record<string, boolean>) => {
    setChecklist(newChecklist);
    // Only trigger auto-save if anesthesiaRecordId exists
    if (anesthesiaRecordId) {
      autoSave.mutate({
        checklist: newChecklist,
        notes,
        signature,
      });
    }
  };

  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    // Only trigger auto-save if anesthesiaRecordId exists
    if (anesthesiaRecordId) {
      autoSave.mutate({
        checklist,
        notes: newNotes,
        signature,
      });
    }
  };

  const handleSignatureChange = (newSignature: string) => {
    setSignature(newSignature);
    // Only trigger auto-save if anesthesiaRecordId exists
    if (anesthesiaRecordId) {
      autoSave.mutate({
        checklist,
        notes,
        signature: newSignature,
      });
    }
  };

  return {
    checklist,
    notes,
    signature,
    showSignaturePad,
    saveStatus: autoSave.status,
    setChecklist: handleChecklistChange,
    setNotes: handleNotesChange,
    setSignature: handleSignatureChange,
    setShowSignaturePad,
  };
}
