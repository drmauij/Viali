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
  onSignatureAdded?: (signature: string) => void;
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
  onSignatureAdded,
}: UseChecklistStateProps): ChecklistState {
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const prevAnesthesiaRecordIdRef = useRef<string | undefined>();

  // Convert checklistType from camelCase to kebab-case: signIn -> sign-in, timeOut -> time-out, signOut -> sign-out
  const kebabType = checklistType.replace(/([A-Z])/g, '-$1').toLowerCase();

  // Single save mutation - only saves when signature is added
  const saveMutation = useAutoSaveMutation({
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
    const hasSignature = signature !== "";
    
    // If anesthesiaRecordId transitioned from undefined to defined, and we have a signature (meaning user completed the form)
    if (!prevId && anesthesiaRecordId && hasSignature && saveMutation.status !== 'saving') {
      saveMutation.mutate({
        checklist,
        notes,
        signature,
      });
    }
    
    // Update ref for next render
    prevAnesthesiaRecordIdRef.current = anesthesiaRecordId;
  }, [anesthesiaRecordId, checklist, notes, signature, saveMutation]);

  // Checkbox changes - only update local state, no auto-save
  const handleChecklistChange = (newChecklist: Record<string, boolean>) => {
    setChecklist(newChecklist);
    // No auto-save - will be saved together with signature
  };

  // Notes changes - only update local state, no auto-save
  const handleNotesChange = (newNotes: string) => {
    setNotes(newNotes);
    // No auto-save - will be saved together with signature
  };

  // Signature changes - save everything at once
  const handleSignatureChange = (newSignature: string) => {
    const hadNoSignature = !signature;
    setSignature(newSignature);
    // Save everything together when signature is added or cleared
    if (anesthesiaRecordId) {
      saveMutation.mutate({
        checklist,
        notes,
        signature: newSignature,
      });
    }
    // Call callback when signature is newly added (not cleared or updated)
    if (hadNoSignature && newSignature && onSignatureAdded) {
      onSignatureAdded(newSignature);
    }
  };

  return {
    checklist,
    notes,
    signature,
    showSignaturePad,
    saveStatus: saveMutation.status,
    setChecklist: handleChecklistChange,
    setNotes: handleNotesChange,
    setSignature: handleSignatureChange,
    setShowSignaturePad,
  };
}
