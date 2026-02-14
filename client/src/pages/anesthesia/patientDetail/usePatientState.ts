import { useState, useRef } from "react";

// Types for note attachments used by expandedNoteAttachments state
export type NoteAttachment = {
  id: string;
  noteType: 'patient' | 'surgery';
  noteId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number | null;
  createdAt: string;
};

// Type for staff-uploaded patient documents
export type StaffDocument = {
  id: string;
  hospitalId: string;
  patientId: string;
  category: "medication_list" | "diagnosis" | "exam_result" | "consent" | "lab_result" | "imaging" | "referral" | "other";
  fileName: string;
  fileUrl: string;
  mimeType?: string;
  fileSize?: number;
  description?: string;
  uploadedBy: string;
  createdAt: string;
};

// Type for the preview document state
export type PreviewDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  url: string;
} | null;

// Type for the preview image state
export type PreviewImage = {
  url: string;
  fileName: string;
} | null;

// Type for the note to delete state
export type NoteToDelete = {
  id: string;
  type: 'patient' | 'surgery';
} | null;

// Type for the edit form
export type EditForm = {
  surname: string;
  firstName: string;
  birthday: string;
  sex: "M" | "F" | "O";
  email: string;
  phone: string;
  address: string;
  street: string;
  postalCode: string;
  city: string;
  emergencyContact: string;
  insuranceProvider: string;
  insuranceNumber: string;
  healthInsuranceNumber: string;
  allergies: string[];
  otherAllergies: string;
  internalNotes: string;
};

// Type for quick contact form
export type QuickContactForm = {
  email: string;
  phone: string;
};

// Type for the new case form
export type NewCase = {
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
};

// Type for consent data
export type ConsentData = {
  general: boolean;
  analgosedation: boolean;
  regional: boolean;
  installations: boolean;
  icuAdmission: boolean;
  notes: string;
  date: string;
  doctorSignature: string;
  patientSignature: string;
  emergencyNoSignature: boolean;
  sendEmailCopy: boolean;
  emailForCopy: string;
  emailLanguage: "en" | "de";
};

// Type for assessment data
export type AssessmentData = {
  // General Data
  height: string;
  weight: string;
  allergies: string[];
  allergiesOther: string;
  cave: string;
  asa: string;
  specialNotes: string;

  // Medications
  anticoagulationMeds: string[];
  anticoagulationMedsOther: string;
  generalMeds: string[];
  generalMedsOther: string;
  medicationsNotes: string;

  // Heart and Circulation
  heartIllnesses: Record<string, boolean>;
  heartNotes: string;

  // Lungs
  lungIllnesses: Record<string, boolean>;
  lungNotes: string;

  // GI-Tract
  giIllnesses: Record<string, boolean>;
  kidneyIllnesses: Record<string, boolean>;
  metabolicIllnesses: Record<string, boolean>;
  giKidneyMetabolicNotes: string;

  // Neurological, Psychiatry and Skeletal
  neuroIllnesses: Record<string, boolean>;
  psychIllnesses: Record<string, boolean>;
  skeletalIllnesses: Record<string, boolean>;
  neuroPsychSkeletalNotes: string;

  // Coagulation and Infectious Diseases
  coagulationIllnesses: Record<string, boolean>;
  infectiousIllnesses: Record<string, boolean>;
  coagulationInfectiousNotes: string;

  // Woman (Gynecological)
  womanIssues: Record<string, boolean>;
  womanNotes: string;

  // Noxen (Substances)
  noxen: Record<string, boolean>;
  noxenNotes: string;

  // Children (Pediatric)
  childrenIssues: Record<string, boolean>;
  childrenNotes: string;

  // Anesthesia & Surgical History
  anesthesiaHistoryIssues: Record<string, boolean>;
  dentalIssues: Record<string, boolean>;
  ponvTransfusionIssues: Record<string, boolean>;
  previousSurgeries: string;
  anesthesiaSurgicalHistoryNotes: string;

  // Outpatient Care
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;

  // Planned Anesthesia
  anesthesiaTechniques: {
    general: boolean;
    generalOptions: Record<string, boolean>;
    spinal: boolean;
    epidural: boolean;
    epiduralOptions: Record<string, boolean>;
    regional: boolean;
    regionalOptions: Record<string, boolean>;
    sedation: boolean;
    combined: boolean;
  };
  postOpICU: boolean;
  anesthesiaOther: string;

  installations: {
    arterialLine: boolean;
    centralLine: boolean;
    epiduralCatheter: boolean;
    urinaryCatheter: boolean;
    nasogastricTube: boolean;
    peripheralIV: boolean;
  };
  installationsOther: string;

  // Surgical Approval
  surgicalApprovalStatus: string;

  // Stand-By Status
  standBy: boolean;
  standByReason: string;
  standByReasonNote: string;

  // Doctor Info
  assessmentDate: string;
  doctorName: string;
  doctorSignature: string;
};

// Type for callback slots
export type CallbackSlot = {
  date: string;
  fromTime: string;
  toTime: string;
};

export function usePatientState() {
  // --- Main state block ---

  // Create/view case dialog
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);

  // Pre-op dialog
  const [isPreOpOpen, setIsPreOpOpen] = useState(false);
  const [isDownloadingPreOpPdf, setIsDownloadingPreOpPdf] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");

  // Patient card visibility
  const [isPatientCardVisible, setIsPatientCardVisible] = useState(true);
  const patientCardRef = useRef<HTMLDivElement>(null);

  // Edit patient dialog
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // Track if Edit Patient dialog was opened via URL navigation (should use history.back()) or button click (just close)
  const editOpenedViaUrl = useRef(false);
  // Track if Pre-OP dialog was opened via URL navigation (should use history.back()) or button click (just close)
  const preOpOpenedViaUrl = useRef(false);
  // Track if we're currently saving to prevent useEffect from resetting form data
  const isSavingRef = useRef(false);

  // Archive patient dialog
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);

  // Questionnaire dialogs
  const [isSendQuestionnaireOpen, setIsSendQuestionnaireOpen] = useState(false);
  const [isImportQuestionnaireOpen, setIsImportQuestionnaireOpen] = useState(false);
  const [selectedQuestionnaireForImport, setSelectedQuestionnaireForImport] = useState<string | null>(null);
  const [isFindQuestionnaireOpen, setIsFindQuestionnaireOpen] = useState(false);
  const [questionnaireSearchTerm, setQuestionnaireSearchTerm] = useState("");
  const [selectedUnassociatedQuestionnaire, setSelectedUnassociatedQuestionnaire] = useState<string | null>(null);

  // Split-screen document preview state
  const [previewDocument, setPreviewDocument] = useState<PreviewDocument>(null);

  // Edit patient form
  const [editForm, setEditForm] = useState<EditForm>({
    surname: "",
    firstName: "",
    birthday: "",
    sex: "M" as "M" | "F" | "O",
    email: "",
    phone: "",
    address: "",
    street: "",
    postalCode: "",
    city: "",
    emergencyContact: "",
    insuranceProvider: "",
    insuranceNumber: "",
    healthInsuranceNumber: "",
    allergies: [] as string[],
    otherAllergies: "",
    internalNotes: "",
  });

  // Quick contact edit state for Pre-Op dialog
  const [isQuickContactOpen, setIsQuickContactOpen] = useState(false);
  const [quickContactForm, setQuickContactForm] = useState<QuickContactForm>({ email: "", phone: "" });
  const [isQuickContactSaving, setIsQuickContactSaving] = useState(false);

  // --- Notes state ---

  const [newPatientNote, setNewPatientNote] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [expandedNoteAttachments, setExpandedNoteAttachments] = useState<Record<string, NoteAttachment[]>>({});
  const [loadingAttachments, setLoadingAttachments] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<PreviewImage>(null);
  const [noteToDelete, setNoteToDelete] = useState<NoteToDelete>(null);
  const noteAttachmentInputRef = useRef<HTMLInputElement>(null);

  // --- Document upload state ---

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<StaffDocument['category']>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<StaffDocument | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- New case form ---

  const [newCase, setNewCase] = useState<NewCase>({
    plannedSurgery: "",
    chopCode: "",
    surgerySide: "" as "" | "left" | "right" | "both",
    patientPosition: "" as "" | "supine" | "trendelenburg" | "reverse_trendelenburg" | "lithotomy" | "lateral_decubitus" | "prone" | "jackknife" | "sitting" | "kidney" | "lloyd_davies",
    leftArmPosition: "" as "" | "ausgelagert" | "angelagert",
    rightArmPosition: "" as "" | "ausgelagert" | "angelagert",
    antibioseProphylaxe: false,
    surgeon: "",
    surgeonId: "",
    plannedDate: "",
    surgeryRoomId: "",
    duration: 180, // Default 3 hours in minutes
    notes: "",
    noPreOpRequired: false,
  });
  const [chopSearchTerm, setChopSearchTerm] = useState("");
  const [chopSearchOpen, setChopSearchOpen] = useState(false);
  const [surgeonSearchOpen, setSurgeonSearchOpen] = useState(false);

  // --- Surgery editing/archiving ---

  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [archiveDialogSurgeryId, setArchiveDialogSurgeryId] = useState<string | null>(null);

  // --- Consent data ---

  const [consentData, setConsentData] = useState<ConsentData>({
    general: false,
    analgosedation: false,
    regional: false,
    installations: false,
    icuAdmission: false,
    notes: "",
    date: new Date().toISOString().split('T')[0],
    doctorSignature: "",
    patientSignature: "",
    emergencyNoSignature: false,
    sendEmailCopy: false,
    emailForCopy: "",
    emailLanguage: "de" as "en" | "de",
  });

  // --- Signature pad states ---

  const [showAssessmentSignaturePad, setShowAssessmentSignaturePad] = useState(false);
  const [showConsentDoctorSignaturePad, setShowConsentDoctorSignaturePad] = useState(false);
  const [showConsentPatientSignaturePad, setShowConsentPatientSignaturePad] = useState(false);

  // --- Consent invitation dialog ---

  const [showConsentInvitationDialog, setShowConsentInvitationDialog] = useState(false);
  const [consentInvitationAssessmentId, setConsentInvitationAssessmentId] = useState<string | null>(null);
  const [consentInvitationSending, setConsentInvitationSending] = useState(false);

  // --- Callback appointment dialog ---

  const [showCallbackAppointmentDialog, setShowCallbackAppointmentDialog] = useState(false);
  const [callbackAssessmentId, setCallbackAssessmentId] = useState<string | null>(null);
  const [callbackSending, setCallbackSending] = useState(false);
  const [callbackSlots, setCallbackSlots] = useState<CallbackSlot[]>([
    { date: new Date().toISOString().split('T')[0], fromTime: '09:00', toTime: '10:00' }
  ]);
  const [callbackPhoneNumber, setCallbackPhoneNumber] = useState('');

  // --- Assessment data (pre-op form) ---

  const [assessmentData, setAssessmentData] = useState<AssessmentData>(() => ({
    // General Data
    height: "",
    weight: "",
    allergies: [] as string[],
    allergiesOther: "",
    cave: "",
    asa: "",
    specialNotes: "",

    // Medications
    anticoagulationMeds: [] as string[],
    anticoagulationMedsOther: "",
    generalMeds: [] as string[],
    generalMedsOther: "",
    medicationsNotes: "",

    // Heart and Circulation - dynamically initialized from settings
    heartIllnesses: {} as Record<string, boolean>,
    heartNotes: "",

    // Lungs - dynamically initialized from settings
    lungIllnesses: {} as Record<string, boolean>,
    lungNotes: "",

    // GI-Tract - dynamically initialized from settings
    giIllnesses: {} as Record<string, boolean>,
    kidneyIllnesses: {} as Record<string, boolean>,
    metabolicIllnesses: {} as Record<string, boolean>,
    giKidneyMetabolicNotes: "",

    // Neurological, Psychiatry and Skeletal - dynamically initialized from settings
    neuroIllnesses: {} as Record<string, boolean>,
    psychIllnesses: {} as Record<string, boolean>,
    skeletalIllnesses: {} as Record<string, boolean>,
    neuroPsychSkeletalNotes: "",

    // Coagulation and Infectious Diseases - dynamically initialized from settings
    coagulationIllnesses: {} as Record<string, boolean>,
    infectiousIllnesses: {} as Record<string, boolean>,
    coagulationInfectiousNotes: "",

    // Woman (Gynecological) - dynamically initialized from settings
    womanIssues: {} as Record<string, boolean>,
    womanNotes: "",

    // Noxen (Substances) - dynamically initialized from settings
    noxen: {} as Record<string, boolean>,
    noxenNotes: "",

    // Children (Pediatric) - dynamically initialized from settings
    childrenIssues: {} as Record<string, boolean>,
    childrenNotes: "",

    // Anesthesia & Surgical History - dynamically initialized from settings
    anesthesiaHistoryIssues: {} as Record<string, boolean>,
    dentalIssues: {} as Record<string, boolean>,
    ponvTransfusionIssues: {} as Record<string, boolean>,
    previousSurgeries: "",
    anesthesiaSurgicalHistoryNotes: "",

    // Outpatient Care
    outpatientCaregiverFirstName: "",
    outpatientCaregiverLastName: "",
    outpatientCaregiverPhone: "",

    // Planned Anesthesia
    anesthesiaTechniques: {
      general: false,
      generalOptions: {} as Record<string, boolean>,
      spinal: false,
      epidural: false,
      epiduralOptions: {} as Record<string, boolean>,
      regional: false,
      regionalOptions: {} as Record<string, boolean>,
      sedation: false,
      combined: false,
    },
    postOpICU: false,
    anesthesiaOther: "",

    installations: {
      arterialLine: false,
      centralLine: false,
      epiduralCatheter: false,
      urinaryCatheter: false,
      nasogastricTube: false,
      peripheralIV: false,
    },
    installationsOther: "",

    // Surgical Approval
    surgicalApprovalStatus: "", // "approved", "not-approved", or ""

    // Stand-By Status
    standBy: false,
    standByReason: "", // "signature_missing", "consent_required", "waiting_exams", "other"
    standByReasonNote: "",

    // Doctor Info
    assessmentDate: new Date().toISOString().split('T')[0],
    doctorName: "",
    doctorSignature: "",
  }));

  // --- Accordion sections ---

  const [openSections, setOpenSections] = useState<string[]>(["general", "anesthesia"]);

  // --- Auto-save ---

  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  return {
    // Create/view case dialog
    isCreateCaseOpen, setIsCreateCaseOpen,

    // Pre-op dialog
    isPreOpOpen, setIsPreOpOpen,
    isDownloadingPreOpPdf, setIsDownloadingPreOpPdf,
    selectedCaseId, setSelectedCaseId,

    // Patient card visibility
    isPatientCardVisible, setIsPatientCardVisible,
    patientCardRef,

    // Edit patient dialog
    isEditDialogOpen, setIsEditDialogOpen,
    editOpenedViaUrl,
    preOpOpenedViaUrl,
    isSavingRef,

    // Archive patient dialog
    isArchiveDialogOpen, setIsArchiveDialogOpen,

    // Questionnaire dialogs
    isSendQuestionnaireOpen, setIsSendQuestionnaireOpen,
    isImportQuestionnaireOpen, setIsImportQuestionnaireOpen,
    selectedQuestionnaireForImport, setSelectedQuestionnaireForImport,
    isFindQuestionnaireOpen, setIsFindQuestionnaireOpen,
    questionnaireSearchTerm, setQuestionnaireSearchTerm,
    selectedUnassociatedQuestionnaire, setSelectedUnassociatedQuestionnaire,

    // Split-screen document preview
    previewDocument, setPreviewDocument,

    // Edit patient form
    editForm, setEditForm,

    // Quick contact edit
    isQuickContactOpen, setIsQuickContactOpen,
    quickContactForm, setQuickContactForm,
    isQuickContactSaving, setIsQuickContactSaving,

    // Notes
    newPatientNote, setNewPatientNote,
    pendingAttachments, setPendingAttachments,
    isUploadingAttachment, setIsUploadingAttachment,
    expandedNoteAttachments, setExpandedNoteAttachments,
    loadingAttachments, setLoadingAttachments,
    previewImage, setPreviewImage,
    noteToDelete, setNoteToDelete,
    noteAttachmentInputRef,

    // Document upload
    isUploadDialogOpen, setIsUploadDialogOpen,
    isCameraOpen, setIsCameraOpen,
    uploadCategory, setUploadCategory,
    uploadDescription, setUploadDescription,
    isUploading, setIsUploading,
    documentToDelete, setDocumentToDelete,
    fileInputRef,

    // New case form
    newCase, setNewCase,
    chopSearchTerm, setChopSearchTerm,
    chopSearchOpen, setChopSearchOpen,
    surgeonSearchOpen, setSurgeonSearchOpen,

    // Surgery editing/archiving
    editingCaseId, setEditingCaseId,
    archiveDialogSurgeryId, setArchiveDialogSurgeryId,

    // Consent data
    consentData, setConsentData,

    // Signature pad states
    showAssessmentSignaturePad, setShowAssessmentSignaturePad,
    showConsentDoctorSignaturePad, setShowConsentDoctorSignaturePad,
    showConsentPatientSignaturePad, setShowConsentPatientSignaturePad,

    // Consent invitation dialog
    showConsentInvitationDialog, setShowConsentInvitationDialog,
    consentInvitationAssessmentId, setConsentInvitationAssessmentId,
    consentInvitationSending, setConsentInvitationSending,

    // Callback appointment dialog
    showCallbackAppointmentDialog, setShowCallbackAppointmentDialog,
    callbackAssessmentId, setCallbackAssessmentId,
    callbackSending, setCallbackSending,
    callbackSlots, setCallbackSlots,
    callbackPhoneNumber, setCallbackPhoneNumber,

    // Assessment data (pre-op form)
    assessmentData, setAssessmentData,

    // Accordion sections
    openSections, setOpenSections,

    // Auto-save
    autoSaveTimeout, setAutoSaveTimeout,
  };
}

export type PatientState = ReturnType<typeof usePatientState>;
