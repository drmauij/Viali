import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Patient = {
  id: string;
  hospitalId: string;
  patientNumber: string;
  surname: string;
  firstName: string;
  birthday: string;
  sex: "M" | "F" | "O";
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  insuranceProvider?: string | null;
  insuranceNumber?: string | null;
  healthInsuranceNumber?: string | null;
  idCardFrontUrl?: string | null;
  idCardBackUrl?: string | null;
  insuranceCardFrontUrl?: string | null;
  insuranceCardBackUrl?: string | null;
  allergies?: string[] | null;
  otherAllergies?: string | null;
  internalNotes?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

interface UsePatientMutationsParams {
  // IDs needed for API calls
  hospitalId: string | undefined;
  patientId: string | undefined;
  derivedPatientId: string | undefined;
  selectedCaseId: string;

  // Translation function (accepts i18next TFunction)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t: any;

  // Toast function
  toast: (opts: {
    title: string;
    description?: string;
    variant?: "default" | "destructive";
  }) => void;

  // State setters for note mutations
  setNewPatientNote: (value: string) => void;
  setPendingAttachments: (value: React.SetStateAction<File[]>) => void;
  setNoteToDelete: (value: { id: string; type: "patient" | "surgery" } | null) => void;

  // State setters for surgery mutations
  setIsCreateCaseOpen: (value: boolean) => void;
  setNewCase: (value: {
    plannedSurgery: string;
    chopCode: string;
    surgerySide: "" | "left" | "right" | "both";
    patientPosition: "" | "supine" | "trendelenburg" | "reverse_trendelenburg" | "lithotomy" | "lateral_decubitus" | "prone" | "jackknife" | "sitting" | "kidney" | "lloyd_davies";
    leftArmPosition: "" | "ausgelagert" | "angelagert";
    rightArmPosition: "" | "ausgelagert" | "angelagert";
    antibioseProphylaxe: boolean;
    surgeon: string;
    surgeonId: string;
    plannedDate: string;
    surgeryRoomId: string;
    duration: number;
    notes: string;
    noPreOpRequired: boolean;
  }) => void;
  setArchiveDialogSurgeryId: (value: string | null) => void;

  // State setters for patient mutations
  setIsEditDialogOpen: (value: boolean) => void;
  editOpenedViaUrl: React.MutableRefObject<boolean>;
  setLocation: (path: string) => void;
  moduleBasePath: string;

  // State setters for document mutations
  setDocumentToDelete: (value: any | null) => void;

  // State setters for pre-op mutations
  isSavingRef: React.MutableRefObject<boolean>;
  existingAssessment: any;
  setConsentInvitationAssessmentId: (value: string | null) => void;
  setShowConsentInvitationDialog: (value: boolean) => void;
  setCallbackAssessmentId: (value: string | null) => void;
  setCallbackPhoneNumber: (value: string) => void;
  setCallbackSlots: (value: Array<{ date: string; fromTime: string; toTime: string }>) => void;
  setShowCallbackAppointmentDialog: (value: boolean) => void;
  activeUnitPhone: string;

  // State setters for questionnaire mutations
  setIsFindQuestionnaireOpen: (value: boolean) => void;
  setSelectedUnassociatedQuestionnaire: (value: string | null) => void;
  setQuestionnaireSearchTerm: (value: string) => void;
  setIsImportQuestionnaireOpen: (value: boolean) => void;

  // Helper function for note attachment uploads
  uploadNoteAttachment: (file: File, noteType: "patient" | "surgery", noteId: string) => Promise<void>;
}

export function usePatientMutations({
  hospitalId,
  patientId,
  derivedPatientId,
  selectedCaseId,
  t,
  toast,
  setNewPatientNote,
  setPendingAttachments,
  setNoteToDelete,
  setIsCreateCaseOpen,
  setNewCase,
  setArchiveDialogSurgeryId,
  setIsEditDialogOpen,
  editOpenedViaUrl,
  setLocation,
  moduleBasePath,
  setDocumentToDelete,
  isSavingRef,
  existingAssessment,
  setConsentInvitationAssessmentId,
  setShowConsentInvitationDialog,
  setCallbackAssessmentId,
  setCallbackPhoneNumber,
  setCallbackSlots,
  setShowCallbackAppointmentDialog,
  activeUnitPhone,
  setIsFindQuestionnaireOpen,
  setSelectedUnassociatedQuestionnaire,
  setQuestionnaireSearchTerm,
  setIsImportQuestionnaireOpen,
  uploadNoteAttachment,
}: UsePatientMutationsParams) {
  // Create patient note mutation with attachments
  const createPatientNoteMutation = useMutation({
    mutationFn: async ({ content, attachments }: { content: string; attachments: File[] }) => {
      const res = await apiRequest('POST', `/api/patients/${derivedPatientId}/notes`, { content });
      const noteData = await res.json();

      // Upload attachments if any
      for (const file of attachments) {
        await uploadNoteAttachment(file, 'patient', noteData.id);
      }

      return noteData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${derivedPatientId}/notes/timeline`] });
      setNewPatientNote("");
      setPendingAttachments([]);
      toast({
        title: t('anesthesia.patientDetail.noteAdded', 'Note added'),
        description: t('anesthesia.patientDetail.noteAddedDesc', 'Your note has been saved.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.noteError', 'Error'),
        description: error.message || t('anesthesia.patientDetail.noteErrorDesc', 'Failed to save note.'),
        variant: "destructive",
      });
    }
  });

  // Delete note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string; type: 'patient' | 'surgery' }) => {
      const endpoint = type === 'patient'
        ? `/api/patient-notes/${id}`
        : `/api/anesthesia/surgery-notes/${id}`;
      return await apiRequest('DELETE', endpoint);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${derivedPatientId}/notes/timeline`] });
      setNoteToDelete(null);
      toast({
        title: t('anesthesia.patientDetail.noteDeleted', 'Note deleted'),
        description: t('anesthesia.patientDetail.noteDeletedDesc', 'The note has been removed.'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('anesthesia.patientDetail.noteDeleteError', 'Failed to delete note.'),
        variant: "destructive",
      });
    }
  });

  // Mutation to create a surgery
  const createSurgeryMutation = useMutation({
    mutationFn: async (surgeryData: {
      hospitalId: string;
      patientId: string;
      plannedSurgery: string;
      surgeon: string | null;
      surgeonId?: string | null;
      plannedDate: string;
      surgeryRoomId?: string | null;
      actualEndTime?: string;
    }) => {
      return await apiRequest("POST", "/api/anesthesia/surgeries", surgeryData);
    },
    onSuccess: () => {
      // Invalidate patient-specific surgeries query
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${hospitalId}&patientId=${derivedPatientId}`]
      });
      // Invalidate all surgery queries (for OP calendar)
      queryClient.invalidateQueries({
        queryKey: ['/api/anesthesia/surgeries'],
        exact: false
      });
      // Invalidate pre-op assessment list (hospital-specific)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${hospitalId}`);
        }
      });
      toast({
        title: t('anesthesia.patientDetail.successSurgeryCreated'),
        description: t('anesthesia.patientDetail.successSurgeryCreatedDesc'),
      });
      setIsCreateCaseOpen(false);
      setNewCase({ plannedSurgery: "", chopCode: "", surgerySide: "", patientPosition: "", leftArmPosition: "", rightArmPosition: "", antibioseProphylaxe: false, surgeon: "", surgeonId: "", plannedDate: "", surgeryRoomId: "", duration: 180, notes: "", noPreOpRequired: false });
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorSurgeryCreated'),
        variant: "destructive",
      });
    },
  });

  // Mutation to archive a surgery
  const archiveSurgeryMutation = useMutation({
    mutationFn: async (surgeryId: string) => {
      return await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/archive`);
    },
    onSuccess: () => {
      // Invalidate patient-specific surgeries query
      queryClient.invalidateQueries({
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${hospitalId}&patientId=${derivedPatientId}`]
      });
      // Invalidate all surgery queries (for OP calendar)
      queryClient.invalidateQueries({
        queryKey: ['/api/anesthesia/surgeries'],
        exact: false
      });
      // Invalidate pre-op assessment list (hospital-specific)
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${hospitalId}`);
        }
      });
      toast({
        title: t('anesthesia.patientDetail.successSurgeryArchived', 'Surgery archived'),
        description: t('anesthesia.patientDetail.successSurgeryArchivedDesc', 'Surgery has been moved to archive'),
      });
      setArchiveDialogSurgeryId(null);
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorSurgeryArchived', 'Failed to archive surgery'),
        variant: "destructive",
      });
    },
  });

  // Mutation to update a patient
  const updatePatientMutation = useMutation({
    mutationFn: async (patientData: Partial<Patient> & Record<string, any>) => {
      return await apiRequest("PATCH", `/api/patients/${patientId}`, patientData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/patients');
        }
      });
      toast({
        title: t('anesthesia.patientDetail.successPatientUpdated'),
        description: t('anesthesia.patientDetail.successPatientUpdatedDesc'),
      });
      setIsEditDialogOpen(false);

      // If edit was opened via URL navigation (e.g., from Surgery Summary), go back
      if (editOpenedViaUrl.current) {
        editOpenedViaUrl.current = false;
        // Use history.back() to return to where the user came from
        window.history.back();
      }
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorPatientUpdated'),
        variant: "destructive",
      });
    },
  });

  // Mutation to archive a patient
  const archivePatientMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/patients/${patientId}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/patients');
        }
      });
      toast({
        title: t('anesthesia.patientDetail.successPatientArchived', 'Patient archived'),
        description: t('anesthesia.patientDetail.successPatientArchivedDesc', 'Patient has been moved to archive'),
      });
      setLocation(`${moduleBasePath}/patients`);
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorPatientArchived', 'Failed to archive patient'),
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a staff document
  const deleteDocumentMutation = useMutation({
    mutationFn: async (docId: string) => {
      return await apiRequest("DELETE", `/api/patients/${derivedPatientId}/documents/${docId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${derivedPatientId}/documents`] });
      toast({
        title: t('anesthesia.patientDetail.documentDeleted', 'Document deleted'),
        description: t('anesthesia.patientDetail.documentDeletedDesc', 'The document has been removed'),
      });
      setDocumentToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorDocumentDelete', 'Failed to delete document'),
        variant: "destructive",
      });
    },
  });

  // Mutation to send pre-op assessment PDF via email
  const sendEmailMutation = useMutation({
    mutationFn: async (assessmentId: string) => {
      return await apiRequest("POST", `/api/anesthesia/preop/${assessmentId}/send-email`);
    },
    onSuccess: (_data: any) => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      toast({
        title: t('anesthesia.patientDetail.emailSent', 'Email Sent'),
        description: t('anesthesia.patientDetail.emailSentDescription', 'Pre-op assessment sent to patient'),
      });
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.emailError', 'Email Error'),
        description: error.message || t('anesthesia.patientDetail.emailSendFailed', 'Failed to send email'),
        variant: "destructive",
      });
    },
  });

  // Mutation to create pre-op assessment
  const createPreOpMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/preop", {
        surgeryId: selectedCaseId,
        ...data,
      });
      const responseData = await response.json();
      return { response: responseData, shouldSendEmail: data.sendEmailCopy && data.emailForCopy, standByData: { standBy: data.standBy, standByReason: data.standByReason } };
    },
    onSuccess: async (result: { response: any; shouldSendEmail: boolean; standByData: { standBy: boolean; standByReason: string } }) => {
      setTimeout(() => { isSavingRef.current = false; }, 500);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${hospitalId}`] });
      toast({
        title: t('anesthesia.patientDetail.saved'),
        description: t('anesthesia.patientDetail.preOpAssessmentSaved'),
      });

      if (result.shouldSendEmail && result.response?.id) {
        sendEmailMutation.mutate(result.response.id);
      }

      if (result.standByData.standBy && result.standByData.standByReason === 'signature_missing' && result.response?.id) {
        setConsentInvitationAssessmentId(result.response.id);
        setShowConsentInvitationDialog(true);
      }

      if (result.standByData.standBy && result.standByData.standByReason === 'consent_required' && result.response?.id) {
        setCallbackAssessmentId(result.response.id);
        setCallbackPhoneNumber(activeUnitPhone);
        setCallbackSlots([{ date: new Date().toISOString().split('T')[0], fromTime: '09:00', toTime: '10:00' }]);
        setShowCallbackAppointmentDialog(true);
      }
    },
    onError: (error: any) => {
      isSavingRef.current = false;
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorSaveAssessment'),
        variant: "destructive",
      });
    },
  });

  // Mutation to update pre-op assessment
  const updatePreOpMutation = useMutation({
    mutationFn: async (data: any) => {
      const prevStandBy = existingAssessment?.standBy || false;
      const prevStandByReason = existingAssessment?.standByReason || '';
      const response = await apiRequest("PATCH", `/api/anesthesia/preop/${existingAssessment?.id}`, data);
      return { response, shouldSendEmail: data.sendEmailCopy && data.emailForCopy, assessmentId: existingAssessment?.id, standByData: { standBy: data.standBy, standByReason: data.standByReason }, prevStandByData: { standBy: prevStandBy, standByReason: prevStandByReason } };
    },
    onSuccess: (result: { response: any; shouldSendEmail: boolean; assessmentId: string | undefined; standByData: { standBy: boolean; standByReason: string }; prevStandByData: { standBy: boolean; standByReason: string } }) => {
      setTimeout(() => { isSavingRef.current = false; }, 500);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${hospitalId}`] });
      toast({
        title: t('anesthesia.patientDetail.updated'),
        description: t('anesthesia.patientDetail.preOpAssessmentUpdated'),
      });

      if (result.shouldSendEmail && result.assessmentId) {
        sendEmailMutation.mutate(result.assessmentId);
      }

      const isNewStandByReason = !(result.prevStandByData.standBy && result.prevStandByData.standByReason === result.standByData.standByReason);

      if (isNewStandByReason && result.standByData.standBy && result.standByData.standByReason === 'signature_missing' && result.assessmentId) {
        setConsentInvitationAssessmentId(result.assessmentId);
        setShowConsentInvitationDialog(true);
      }

      if (isNewStandByReason && result.standByData.standBy && result.standByData.standByReason === 'consent_required' && result.assessmentId) {
        setCallbackAssessmentId(result.assessmentId);
        setCallbackPhoneNumber(activeUnitPhone);
        setCallbackSlots([{ date: new Date().toISOString().split('T')[0], fromTime: '09:00', toTime: '10:00' }]);
        setShowCallbackAppointmentDialog(true);
      }
    },
    onError: (error: any) => {
      isSavingRef.current = false;
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorUpdateAssessment'),
        variant: "destructive",
      });
    },
  });

  // Mutation to associate questionnaire with patient
  const associateQuestionnaireMutation = useMutation({
    mutationFn: async ({ responseId, patientId }: { responseId: string; patientId: string }) => {
      const response = await apiRequest('POST', `/api/questionnaire/responses/${responseId}/associate`, { patientId });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate questionnaire queries to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', derivedPatientId, 'links'] });
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/unassociated'] });
      setIsFindQuestionnaireOpen(false);
      setSelectedUnassociatedQuestionnaire(null);
      setQuestionnaireSearchTerm("");
      toast({
        title: t('anesthesia.patientDetail.questionnaireAssociated', 'Questionnaire Associated'),
        description: t('anesthesia.patientDetail.questionnaireAssociatedDesc', 'The questionnaire has been linked to this patient. You can now import the data.'),
      });
      // Open the import dialog after successful association
      setIsImportQuestionnaireOpen(true);
    },
    onError: (error: Error) => {
      toast({
        title: t('common.error', 'Error'),
        description: error.message || t('anesthesia.patientDetail.associationFailed', 'Failed to associate questionnaire'),
        variant: "destructive",
      });
    },
  });

  return {
    createPatientNoteMutation,
    deleteNoteMutation,
    createSurgeryMutation,
    archiveSurgeryMutation,
    updatePatientMutation,
    archivePatientMutation,
    deleteDocumentMutation,
    createPreOpMutation,
    updatePreOpMutation,
    sendEmailMutation,
    associateQuestionnaireMutation,
  };
}

export type PatientMutations = ReturnType<typeof usePatientMutations>;
