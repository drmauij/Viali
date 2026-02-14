import { useQuery } from "@tanstack/react-query";
import type { Surgery } from "@shared/schema";

// ── Inline types (mirrored from PatientDetail.tsx) ──────────────────────────

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

type Surgeon = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

type PatientInvoice = {
  id: string;
  hospitalId: string;
  invoiceNumber: number;
  date: string;
  patientId: string | null;
  customerName: string;
  customerAddress: string | null;
  subtotal: string;
  vatRate: string;
  vatAmount: string;
  total: string;
  comments: string | null;
  status: "draft" | "sent" | "paid" | "cancelled";
  createdAt: string;
};

type TimelineNote = {
  id: string;
  type: "patient" | "surgery";
  content: string;
  createdAt: string;
  updatedAt: string | null;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  surgery: {
    id: string;
    plannedSurgery: string;
    plannedDate: string;
  } | null;
  attachmentCount: number;
};

type QuestionnaireLink = {
  id: string;
  token: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  response?: {
    id: string;
    allergies?: string[];
    allergiesNotes?: string;
    medications?: Array<{
      name: string;
      dosage?: string;
      frequency?: string;
      reason?: string;
    }>;
    medicationsNotes?: string;
    conditions?: Record<string, { checked: boolean; notes?: string }>;
    smokingStatus?: string;
    smokingDetails?: string;
    alcoholStatus?: string;
    alcoholDetails?: string;
    height?: string;
    weight?: string;
    previousSurgeries?: string;
    previousAnesthesiaProblems?: string;
    pregnancyStatus?: string;
    breastfeeding?: boolean;
    womanHealthNotes?: string;
    additionalNotes?: string;
  };
};

type QuestionnaireUpload = {
  id: string;
  responseId: string;
  category: "medication_list" | "diagnosis" | "exam_result" | "other";
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  description?: string;
  createdAt: string;
};

type UnassociatedQuestionnaire = {
  id: string;
  linkId: string;
  patientFirstName: string | null;
  patientSurname: string | null;
  patientBirthday: string | null;
  submittedAt: string | null;
  link: {
    id: string;
    hospitalId: string;
    patientId: string | null;
    status: string;
    submittedAt: string | null;
    createdAt: string;
  };
};

type StaffDocument = {
  id: string;
  hospitalId: string;
  patientId: string;
  category:
    | "medication_list"
    | "diagnosis"
    | "exam_result"
    | "consent"
    | "lab_result"
    | "imaging"
    | "referral"
    | "other";
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  description?: string;
  uploadedBy: string;
  createdAt: string;
};

type NoteAttachmentDoc = {
  id: string;
  noteType: "patient" | "surgery";
  noteId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  uploadedBy: string | null;
  createdAt: string;
  noteContent: string | null;
};

type ChopProcedure = {
  id: string;
  code: string;
  descriptionDe: string;
  chapter: string | null;
  indentLevel: number | null;
  laterality: string | null;
};

// ── Hook params ─────────────────────────────────────────────────────────────

interface UsePatientQueriesParams {
  patientId: string | undefined;
  derivedPatientId: string | undefined;
  hospitalId: string | undefined;
  unitId: string | undefined;
  selectedCaseId: string;
  isPreOpOpen: boolean;
  isPreOpRoute: boolean;
  preOpSurgeryId: string | undefined;
  selectedQuestionnaireForImport: string | null;
  isFindQuestionnaireOpen: boolean;
  chopSearchTerm: string;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function usePatientQueries({
  patientId,
  derivedPatientId,
  hospitalId,
  unitId,
  selectedCaseId,
  isPreOpOpen,
  isPreOpRoute,
  preOpSurgeryId,
  selectedQuestionnaireForImport,
  isFindQuestionnaireOpen,
  chopSearchTerm,
}: UsePatientQueriesParams) {
  // Fetch surgery data when in direct pre-op route mode
  const preOpSurgeryQuery = useQuery<Surgery>({
    queryKey: [`/api/anesthesia/surgeries/${preOpSurgeryId}`],
    enabled: !!isPreOpRoute && !!preOpSurgeryId,
  });

  // Fetch patient data from API
  const patientQuery = useQuery<Patient>({
    queryKey: [`/api/patients/${derivedPatientId}`],
    enabled: !!derivedPatientId,
  });

  // Fetch surgeries for this patient
  const surgeriesQuery = useQuery<Surgery[]>({
    queryKey: [
      `/api/anesthesia/surgeries?hospitalId=${hospitalId}&patientId=${derivedPatientId}`,
    ],
    enabled: !!derivedPatientId && !!hospitalId,
  });

  // Fetch combined notes timeline for this patient
  const notesTimelineQuery = useQuery<TimelineNote[]>({
    queryKey: [`/api/patients/${derivedPatientId}/notes/timeline`],
    enabled: !!derivedPatientId,
  });

  // Fetch invoices for this patient
  const invoicesQuery = useQuery<PatientInvoice[]>({
    queryKey: [
      `/api/clinic/${hospitalId}/invoices`,
      { patientId: derivedPatientId },
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/clinic/${hospitalId}/invoices?patientId=${derivedPatientId}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        if (response.status === 404) return []; // No invoices module access
        throw new Error("Failed to fetch invoices");
      }
      return response.json();
    },
    enabled: !!derivedPatientId && !!hospitalId,
  });

  // Fetch surgeons for the hospital
  const surgeonsQuery = useQuery<Surgeon[]>({
    queryKey: [`/api/surgeons?hospitalId=${hospitalId}`],
    enabled: !!hospitalId,
  });

  // Fetch surgery rooms for the hospital
  const surgeryRoomsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: [`/api/surgery-rooms/${hospitalId}`],
    enabled: !!hospitalId,
  });

  // Fetch hospital units (for questionnaire phone)
  const hospitalUnitsQuery = useQuery<
    Array<{ id: string; questionnairePhone?: string | null }>
  >({
    queryKey: [`/api/units/${hospitalId}`],
    enabled: !!hospitalId,
  });

  // Fetch questionnaire links/responses for the patient (for import feature)
  const questionnaireLinksQuery = useQuery<QuestionnaireLink[]>({
    queryKey: ["/api/questionnaire/patient", derivedPatientId, "links"],
    queryFn: async () => {
      const response = await fetch(
        `/api/questionnaire/patient/${derivedPatientId}/links`,
        { headers: { "x-active-hospital-id": hospitalId || "" } },
      );
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!derivedPatientId && !!hospitalId && isPreOpOpen,
  });

  // Get the selected questionnaire response details (including uploads)
  const selectedQuestionnaireResponseQuery = useQuery<{
    response: QuestionnaireLink["response"];
    link: QuestionnaireLink;
    uploads?: QuestionnaireUpload[];
  }>({
    queryKey: [
      "/api/questionnaire/responses",
      selectedQuestionnaireForImport,
    ],
    queryFn: async () => {
      const response = await fetch(
        `/api/questionnaire/responses/${selectedQuestionnaireForImport}`,
        { headers: { "x-active-hospital-id": hospitalId || "" } },
      );
      if (!response.ok)
        throw new Error("Failed to fetch questionnaire response");
      return response.json();
    },
    enabled: !!selectedQuestionnaireForImport && !!hospitalId,
  });

  // Fetch unassociated questionnaires for quick association
  const unassociatedQuestionnairesQuery = useQuery<
    UnassociatedQuestionnaire[]
  >({
    queryKey: ["/api/questionnaire/unassociated"],
    queryFn: async () => {
      const response = await fetch("/api/questionnaire/unassociated", {
        headers: { "x-active-hospital-id": hospitalId || "" },
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId && isFindQuestionnaireOpen,
  });

  // Fetch staff-uploaded documents
  const staffDocumentsQuery = useQuery<StaffDocument[]>({
    queryKey: [
      `/api/patients/${derivedPatientId}/documents`,
      derivedPatientId,
    ],
    enabled: !!derivedPatientId && !!hospitalId,
  });

  // Fetch note attachments for Documents section
  const noteAttachmentDocsQuery = useQuery<NoteAttachmentDoc[]>({
    queryKey: [
      `/api/patients/${derivedPatientId}/note-attachments`,
      derivedPatientId,
    ],
    enabled: !!derivedPatientId && !!hospitalId,
  });

  // Fetch pre-op assessment for selected surgery
  const existingAssessmentQuery = useQuery<any>({
    queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`],
    enabled: !!selectedCaseId && isPreOpOpen,
  });

  // CHOP procedure search query
  const chopProceduresQuery = useQuery<ChopProcedure[]>({
    queryKey: ["/api/chop-procedures", chopSearchTerm],
    queryFn: async () => {
      if (chopSearchTerm.length < 2) return [];
      const response = await fetch(
        `/api/chop-procedures?search=${encodeURIComponent(chopSearchTerm)}&limit=30`,
      );
      if (!response.ok) throw new Error("Failed to search procedures");
      return response.json();
    },
    enabled: chopSearchTerm.length >= 2,
    staleTime: 60000,
  });

  // Derive activeUnitPhone from hospital units
  const activeUnitPhone =
    hospitalUnitsQuery.data?.find((u) => u.id === unitId)
      ?.questionnairePhone || "";

  return {
    // Pre-op surgery (direct route)
    preOpSurgery: preOpSurgeryQuery.data,
    isLoadingPreOpSurgery: preOpSurgeryQuery.isLoading,

    // Patient
    patient: patientQuery.data,
    isLoading: patientQuery.isLoading,
    error: patientQuery.error,

    // Surgeries
    surgeries: surgeriesQuery.data,
    isLoadingSurgeries: surgeriesQuery.isLoading,
    surgeriesError: surgeriesQuery.error,

    // Notes timeline
    notesTimeline: notesTimelineQuery.data ?? [],
    isLoadingNotes: notesTimelineQuery.isLoading,

    // Invoices
    patientInvoices: invoicesQuery.data ?? [],
    isLoadingInvoices: invoicesQuery.isLoading,

    // Surgeons
    surgeons: surgeonsQuery.data ?? [],
    isLoadingSurgeons: surgeonsQuery.isLoading,

    // Surgery rooms
    surgeryRooms: surgeryRoomsQuery.data ?? [],
    isLoadingSurgeryRooms: surgeryRoomsQuery.isLoading,

    // Hospital units & derived phone
    hospitalUnits: hospitalUnitsQuery.data ?? [],
    activeUnitPhone,

    // Questionnaire links
    questionnaireLinks: questionnaireLinksQuery.data ?? [],

    // Selected questionnaire response
    selectedQuestionnaireResponse: selectedQuestionnaireResponseQuery.data,
    isLoadingQuestionnaireResponse:
      selectedQuestionnaireResponseQuery.isLoading,

    // Unassociated questionnaires
    unassociatedQuestionnaires: unassociatedQuestionnairesQuery.data ?? [],
    isLoadingUnassociated: unassociatedQuestionnairesQuery.isLoading,
    refetchUnassociated: unassociatedQuestionnairesQuery.refetch,

    // Staff documents
    staffDocuments: staffDocumentsQuery.data ?? [],
    isLoadingStaffDocs: staffDocumentsQuery.isLoading,

    // Note attachment docs
    noteAttachmentDocs: noteAttachmentDocsQuery.data ?? [],
    isLoadingNoteAttachments: noteAttachmentDocsQuery.isLoading,

    // Existing assessment
    existingAssessment: existingAssessmentQuery.data,

    // CHOP procedures
    chopProcedures: chopProceduresQuery.data ?? [],
    isLoadingChop: chopProceduresQuery.isLoading,
  };
}

export type PatientQueries = ReturnType<typeof usePatientQueries>;
