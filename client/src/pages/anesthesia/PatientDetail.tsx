import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus, Mail, Phone, AlertCircle, FileText as NoteIcon, Cake, UserCircle, UserRound, ClipboardList, Activity, BedDouble, X, Loader2, Pencil, Archive, Download, CheckCircle, Save, Send, Import, ImageIcon, Receipt, AlertTriangle, Users, StickyNote, Stethoscope, Camera, Paperclip, Image as ImageLucide, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Check, ChevronsUpDown } from "lucide-react";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Surgery } from "@shared/schema";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useModule } from "@/contexts/ModuleContext";
import { formatDate, formatDateTimeForInput, toProperCase, parseFlexibleDate, isoToDisplayDate } from "@/lib/dateUtils";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import SignaturePad from "@/components/SignaturePad";
import { downloadAnesthesiaRecordPdf } from "@/lib/downloadAnesthesiaRecordPdf";
import AnesthesiaRecordButton from "@/components/anesthesia/AnesthesiaRecordButton";
import { EditSurgeryDialog } from "@/components/anesthesia/EditSurgeryDialog";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { CameraCapture } from "@/components/CameraCapture";
import { PatientDocumentsSection } from "@/components/shared/PatientDocumentsSection";

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

export default function PatientDetail() {
  const { t } = useTranslation();
  // Support anesthesia, surgery, and clinic module routes
  const [, anesthesiaParams] = useRoute("/anesthesia/patients/:id");
  const [, surgeryParams] = useRoute("/surgery/patients/:id");
  const [, clinicParams] = useRoute("/clinic/patients/:id");
  // Direct pre-op route - skips patient detail and goes straight to pre-op dialog
  const [isPreOpRoute, preOpRouteParams] = useRoute("/anesthesia/preop/:surgeryId");
  const params = anesthesiaParams || surgeryParams || clinicParams;
  const [, setLocation] = useLocation();
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isPreOpOpen, setIsPreOpOpen] = useState(false);
  const [isDownloadingPreOpPdf, setIsDownloadingPreOpPdf] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isPatientCardVisible, setIsPatientCardVisible] = useState(true);
  const patientCardRef = useRef<HTMLDivElement>(null);
  const activeHospital = useActiveHospital();
  const { user } = useAuth();
  const canWrite = useCanWrite();
  const isPreOpReadOnly = !canWrite;
  const { activeModule } = useModule();
  const isSurgeryModule = activeModule === "surgery";
  const { addons } = useHospitalAddons();
  const isClinicModule = activeModule === "clinic";
  const moduleBasePath = isClinicModule ? "/clinic" : isSurgeryModule ? "/surgery" : "/anesthesia";
  // Clinic users can edit patient data but cannot create/edit/archive surgeries or access surgery details
  const canManageSurgeries = canWrite && !isClinicModule;
  const canViewSurgeryDetails = !isClinicModule;
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // Track if Edit Patient dialog was opened via URL navigation (should use history.back()) or button click (just close)
  const editOpenedViaUrl = useRef(false);
  // Track if Pre-OP dialog was opened via URL navigation (should use history.back()) or button click (just close)
  const preOpOpenedViaUrl = useRef(false);
  // Track if we're currently saving to prevent useEffect from resetting form data
  const isSavingRef = useRef(false);
  const [isArchiveDialogOpen, setIsArchiveDialogOpen] = useState(false);
  const [isSendQuestionnaireOpen, setIsSendQuestionnaireOpen] = useState(false);
  const [isImportQuestionnaireOpen, setIsImportQuestionnaireOpen] = useState(false);
  const [selectedQuestionnaireForImport, setSelectedQuestionnaireForImport] = useState<string | null>(null);
  const [isFindQuestionnaireOpen, setIsFindQuestionnaireOpen] = useState(false);
  const [questionnaireSearchTerm, setQuestionnaireSearchTerm] = useState("");
  const [selectedUnassociatedQuestionnaire, setSelectedUnassociatedQuestionnaire] = useState<string | null>(null);
  // Split-screen document preview state
  const [previewDocument, setPreviewDocument] = useState<{
    id: string;
    fileName: string;
    mimeType: string;
    url: string;
  } | null>(null);
  const [editForm, setEditForm] = useState({
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
    allergies: [] as string[],
    otherAllergies: "",
    internalNotes: "",
  });
  
  // Quick contact edit state for Pre-Op dialog
  const [isQuickContactOpen, setIsQuickContactOpen] = useState(false);
  const [quickContactForm, setQuickContactForm] = useState({ email: "", phone: "" });
  const [isQuickContactSaving, setIsQuickContactSaving] = useState(false);
  
  // Fetch surgery data when in direct pre-op route mode
  const { data: preOpSurgery, isLoading: isLoadingPreOpSurgery } = useQuery<Surgery>({
    queryKey: [`/api/anesthesia/surgeries/${preOpRouteParams?.surgeryId}`],
    enabled: !!isPreOpRoute && !!preOpRouteParams?.surgeryId,
  });
  
  // Derive patientId from either URL params or surgery (for pre-op route)
  const derivedPatientId = params?.id || preOpSurgery?.patientId;
  
  // Fetch patient data from API
  const { data: patient, isLoading, error } = useQuery<Patient>({
    queryKey: [`/api/patients/${derivedPatientId}`],
    enabled: !!derivedPatientId,
  });

  // Fetch surgeries for this patient
  const { 
    data: surgeries, 
    isLoading: isLoadingSurgeries,
    error: surgeriesError 
  } = useQuery<Surgery[]>({
    queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${derivedPatientId}`],
    enabled: !!derivedPatientId && !!activeHospital?.id,
  });

  // Timeline note type (combined patient notes + surgery notes)
  type TimelineNote = {
    id: string;
    type: 'patient' | 'surgery';
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

  type NoteAttachment = {
    id: string;
    noteType: 'patient' | 'surgery';
    noteId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number | null;
    createdAt: string;
  };

  // Fetch combined notes timeline for this patient
  const { 
    data: notesTimeline = [],
    isLoading: isLoadingNotes,
  } = useQuery<TimelineNote[]>({
    queryKey: [`/api/patients/${derivedPatientId}/notes/timeline`],
    enabled: !!derivedPatientId,
  });

  // State for new patient note
  const [newPatientNote, setNewPatientNote] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const [expandedNoteAttachments, setExpandedNoteAttachments] = useState<Record<string, NoteAttachment[]>>({});
  const [loadingAttachments, setLoadingAttachments] = useState<Record<string, boolean>>({});
  const [previewImage, setPreviewImage] = useState<{url: string; fileName: string} | null>(null);
  const [noteToDelete, setNoteToDelete] = useState<{id: string; type: 'patient' | 'surgery'} | null>(null);
  const noteAttachmentInputRef = useRef<HTMLInputElement>(null);

  // Upload file to S3 and create attachment record
  const uploadNoteAttachment = async (file: File, noteType: 'patient' | 'surgery', noteId: string) => {
    // Get upload ticket
    const ticketRes = await apiRequest('POST', `/api/notes/${noteType}/${noteId}/attachments/upload-ticket`, {
      filename: file.name,
      contentType: file.type,
    });
    const { uploadURL, storageKey } = await ticketRes.json();

    // Upload to S3
    await fetch(uploadURL, {
      method: 'PUT',
      body: file,
      headers: {
        'Content-Type': file.type,
      },
    });

    // Create attachment record
    await apiRequest('POST', `/api/notes/${noteType}/${noteId}/attachments`, {
      storageKey,
      fileName: file.name,
      mimeType: file.type,
      fileSize: file.size,
    });
  };

  // Fetch attachments for a note
  const fetchNoteAttachments = async (noteType: 'patient' | 'surgery', noteId: string) => {
    const key = `${noteType}-${noteId}`;
    if (loadingAttachments[key] || expandedNoteAttachments[key]) return;
    
    setLoadingAttachments(prev => ({ ...prev, [key]: true }));
    try {
      const res = await fetch(`/api/notes/${noteType}/${noteId}/attachments`, { credentials: 'include' });
      if (res.ok) {
        const attachments = await res.json();
        setExpandedNoteAttachments(prev => ({ ...prev, [key]: attachments }));
      }
    } catch (error) {
      console.error('Failed to fetch attachments:', error);
    } finally {
      setLoadingAttachments(prev => ({ ...prev, [key]: false }));
    }
  };

  // Get attachment download URL and preview
  const previewAttachment = async (attachmentId: string) => {
    try {
      const res = await fetch(`/api/notes/attachments/${attachmentId}/download`, { credentials: 'include' });
      if (res.ok) {
        const { downloadURL, fileName } = await res.json();
        setPreviewImage({ url: downloadURL, fileName });
      }
    } catch (error) {
      console.error('Failed to get attachment URL:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('anesthesia.patientDetail.attachmentLoadError', 'Failed to load attachment'),
        variant: "destructive",
      });
    }
  };

  // Handle file selection for new note
  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    setPendingAttachments(prev => [...prev, ...imageFiles]);
    if (noteAttachmentInputRef.current) {
      noteAttachmentInputRef.current.value = '';
    }
  };

  // Handle camera capture for notes (add to pending attachments)
  const handleNoteCameraCapture = async (photoDataUrl: string) => {
    // Convert base64 to file
    const response = await fetch(photoDataUrl);
    const blob = await response.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `photo-${timestamp}.jpg`, { type: 'image/jpeg' });
    
    setPendingAttachments(prev => [...prev, file]);
    setIsCameraOpen(false);
  };

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

  // Fetch invoices for this patient
  const { 
    data: patientInvoices = [], 
    isLoading: isLoadingInvoices 
  } = useQuery<PatientInvoice[]>({
    queryKey: [`/api/clinic/${activeHospital?.id}/invoices`, { patientId: derivedPatientId }],
    queryFn: async () => {
      const response = await fetch(`/api/clinic/${activeHospital?.id}/invoices?patientId=${derivedPatientId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 404) return []; // No invoices module access
        throw new Error('Failed to fetch invoices');
      }
      return response.json();
    },
    enabled: !!derivedPatientId && !!activeHospital?.id,
  });

  // Fetch surgeons for the hospital
  const {
    data: surgeons = [],
    isLoading: isLoadingSurgeons
  } = useQuery<Surgeon[]>({
    queryKey: [`/api/surgeons?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch surgery rooms for the hospital
  const {
    data: surgeryRooms = [],
    isLoading: isLoadingSurgeryRooms
  } = useQuery<{id: string; name: string}[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch questionnaire links/responses for the patient (for import feature)
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
      medications?: Array<{ name: string; dosage?: string; frequency?: string; reason?: string }>;
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
  
  const { data: questionnaireLinks = [] } = useQuery<QuestionnaireLink[]>({
    queryKey: ['/api/questionnaire/patient', derivedPatientId, 'links'],
    queryFn: async () => {
      const response = await fetch(`/api/questionnaire/patient/${derivedPatientId}/links`, {
        headers: { 'x-active-hospital-id': activeHospital?.id || '' },
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!derivedPatientId && !!activeHospital?.id && isPreOpOpen,
  });
  
  // Define type for questionnaire uploads
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
  
  // Define type for staff-uploaded patient documents
  type StaffDocument = {
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

  // Get the selected questionnaire response details (including uploads)
  const { data: selectedQuestionnaireResponse, isLoading: isLoadingQuestionnaireResponse } = useQuery<{
    response: QuestionnaireLink['response'];
    link: QuestionnaireLink;
    uploads?: QuestionnaireUpload[];
  }>({
    queryKey: ['/api/questionnaire/responses', selectedQuestionnaireForImport],
    queryFn: async () => {
      const response = await fetch(`/api/questionnaire/responses/${selectedQuestionnaireForImport}`, {
        headers: { 'x-active-hospital-id': activeHospital?.id || '' },
      });
      if (!response.ok) throw new Error('Failed to fetch questionnaire response');
      return response.json();
    },
    enabled: !!selectedQuestionnaireForImport && !!activeHospital?.id,
  });
  
  // Filter to only submitted questionnaires that have responses with IDs
  const submittedQuestionnaires = questionnaireLinks.filter(q => q.status === 'submitted' && q.response?.id);

  // Type for unassociated questionnaire responses
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

  // Fetch unassociated questionnaires for quick association
  const { data: unassociatedQuestionnaires = [], isLoading: isLoadingUnassociated, refetch: refetchUnassociated } = useQuery<UnassociatedQuestionnaire[]>({
    queryKey: ['/api/questionnaire/unassociated'],
    queryFn: async () => {
      const response = await fetch('/api/questionnaire/unassociated', {
        headers: { 'x-active-hospital-id': activeHospital?.id || '' },
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && isFindQuestionnaireOpen,
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

  // Fetch all patient uploads using a dedicated query with proper dependencies
  // The query key includes the response IDs to ensure refetch when new questionnaires are submitted
  const submittedResponseIds = submittedQuestionnaires.map(q => q.response?.id).filter(Boolean).sort().join(',');
  
  const { data: patientUploads = [] } = useQuery<QuestionnaireUpload[]>({
    queryKey: ['/api/questionnaire/patient-uploads', derivedPatientId, submittedResponseIds],
    queryFn: async () => {
      // Fetch uploads from all submitted questionnaire responses in parallel
      const responseIds = submittedQuestionnaires.map(q => q.response?.id).filter(Boolean) as string[];
      
      const uploadPromises = responseIds.map(async (responseId) => {
        const response = await fetch(`/api/questionnaire/responses/${responseId}`, {
          headers: { 'x-active-hospital-id': activeHospital?.id || '' },
        });
        if (response.ok) {
          const data = await response.json();
          return (data.uploads || []) as QuestionnaireUpload[];
        }
        return [];
      });
      
      const results = await Promise.all(uploadPromises);
      return results.flat();
    },
    enabled: !!derivedPatientId && !!activeHospital?.id && submittedResponseIds.length > 0,
    staleTime: 30000, // Cache for 30 seconds to avoid redundant calls
  });

  // Fetch staff-uploaded documents
  const { data: staffDocuments = [], isLoading: isLoadingStaffDocs } = useQuery<StaffDocument[]>({
    queryKey: [`/api/patients/${derivedPatientId}/documents`, derivedPatientId],
    enabled: !!derivedPatientId && !!activeHospital?.id,
  });

  // Type for note attachments displayed in Documents section
  type NoteAttachmentDoc = {
    id: string;
    noteType: 'patient' | 'surgery';
    noteId: string;
    storageKey: string;
    fileName: string;
    mimeType: string;
    fileSize: number | null;
    uploadedBy: string | null;
    createdAt: string;
    noteContent: string | null;
  };

  // Fetch note attachments for Documents section
  const { data: noteAttachmentDocs = [], isLoading: isLoadingNoteAttachments } = useQuery<NoteAttachmentDoc[]>({
    queryKey: [`/api/patients/${derivedPatientId}/note-attachments`, derivedPatientId],
    enabled: !!derivedPatientId && !!activeHospital?.id,
  });
  
  // Document upload state
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<StaffDocument['category']>('other');
  const [uploadDescription, setUploadDescription] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<StaffDocument | null>(null);
  const [patientUploadToDelete, setPatientUploadToDelete] = useState<QuestionnaireUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch hospital anesthesia settings
  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings();
  
  // Helper function to initialize illness state from hospital settings
  const createEmptyIllnessState = (illnessList?: Array<{ id: string; label: string }>) => {
    const state: Record<string, boolean> = {};
    if (illnessList) {
      illnessList.forEach(illness => {
        state[illness.id] = false;
      });
    }
    return state;
  };

  // Helper function to merge existing data with hospital settings structure
  const mergeIllnessData = (
    existingData: Record<string, boolean> | undefined,
    illnessList?: Array<{ id: string; label: string }>
  ) => {
    const state: Record<string, boolean> = {};
    if (illnessList) {
      illnessList.forEach(illness => {
        // Use existing value if available, otherwise false
        state[illness.id] = existingData?.[illness.id] || false;
      });
    }
    return state;
  };
  
  // Check for openPreOp query parameter and auto-open dialog
  useEffect(() => {
    if (!patient) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const openPreOpCaseId = urlParams.get('openPreOp');
    
    if (openPreOpCaseId) {
      setSelectedCaseId(openPreOpCaseId);
      setAssessmentData(prev => ({
        ...prev,
        allergies: patient.allergies || [],
      }));
      // Mark that this was opened via URL navigation
      preOpOpenedViaUrl.current = true;
      setIsPreOpOpen(true);
      
      // Clean up URL by removing openPreOp parameter
      const url = new URL(window.location.href);
      url.searchParams.delete('openPreOp');
      const newUrl = url.searchParams.toString() ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [patient]);

  // Auto-open pre-op dialog when accessed via direct pre-op route (/anesthesia/preop/:surgeryId)
  useEffect(() => {
    if (!isPreOpRoute || !preOpRouteParams?.surgeryId || !patient) return;
    
    // Only open if not already open to prevent loops
    if (!isPreOpOpen) {
      setSelectedCaseId(preOpRouteParams.surgeryId);
      setAssessmentData(prev => ({
        ...prev,
        allergies: patient.allergies || [],
      }));
      preOpOpenedViaUrl.current = true;
      setIsPreOpOpen(true);
    }
  }, [isPreOpRoute, preOpRouteParams?.surgeryId, patient, isPreOpOpen]);

  // Check for openEdit query parameter and auto-open edit patient dialog
  useEffect(() => {
    if (!patient) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const openEdit = urlParams.get('openEdit');
    
    if (openEdit === 'true') {
      // Initialize edit form with patient data
      setEditForm({
        surname: patient.surname || "",
        firstName: patient.firstName || "",
        birthday: patient.birthday ? new Date(patient.birthday).toISOString().split('T')[0] : "",
        sex: (patient.sex as "M" | "F" | "O") || "M",
        email: patient.email || "",
        phone: patient.phone || "",
        address: patient.address || "",
        street: (patient as any).street || "",
        postalCode: (patient as any).postalCode || "",
        city: (patient as any).city || "",
        emergencyContact: patient.emergencyContact || "",
        insuranceProvider: patient.insuranceProvider || "",
        insuranceNumber: patient.insuranceNumber || "",
        allergies: patient.allergies || [],
        otherAllergies: patient.otherAllergies || "",
        internalNotes: patient.internalNotes || "",
      });
      // Mark that this was opened via URL navigation (should go back after save)
      editOpenedViaUrl.current = true;
      setIsEditDialogOpen(true);
      
      // Clean up URL by removing openEdit parameter
      const url = new URL(window.location.href);
      url.searchParams.delete('openEdit');
      const newUrl = url.searchParams.toString() ? `${url.pathname}?${url.searchParams.toString()}` : url.pathname;
      window.history.replaceState({}, '', newUrl);
    }
  }, [patient]);

  const [newCase, setNewCase] = useState({
    plannedSurgery: "",
    chopCode: "",
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
  
  // CHOP procedure search query
  const { data: chopProcedures = [], isLoading: isLoadingChop } = useQuery<Array<{
    id: string;
    code: string;
    descriptionDe: string;
    chapter: string | null;
    indentLevel: number | null;
    laterality: string | null;
  }>>({
    queryKey: ['/api/chop-procedures', chopSearchTerm],
    queryFn: async () => {
      if (chopSearchTerm.length < 2) return [];
      const response = await fetch(`/api/chop-procedures?search=${encodeURIComponent(chopSearchTerm)}&limit=30`);
      if (!response.ok) throw new Error('Failed to search procedures');
      return response.json();
    },
    enabled: chopSearchTerm.length >= 2,
    staleTime: 60000,
  });
  
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [archiveDialogSurgeryId, setArchiveDialogSurgeryId] = useState<string | null>(null);
  const [consentData, setConsentData] = useState({
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
  
  // Signature pad states
  const [showAssessmentSignaturePad, setShowAssessmentSignaturePad] = useState(false);
  const [showConsentDoctorSignaturePad, setShowConsentDoctorSignaturePad] = useState(false);
  const [showConsentPatientSignaturePad, setShowConsentPatientSignaturePad] = useState(false);
  
  const [assessmentData, setAssessmentData] = useState(() => ({
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
  
  const [openSections, setOpenSections] = useState<string[]>(["general", "anesthesia"]);
  
  // Get medication lists from hospital settings
  const anticoagulationMedications = anesthesiaSettings?.medicationLists?.anticoagulation || [];
  const generalMedications = anesthesiaSettings?.medicationLists?.general || [];

  const { toast } = useToast();

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
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${derivedPatientId}`] 
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
          return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`);
        }
      });
      toast({
        title: t('anesthesia.patientDetail.successSurgeryCreated'),
        description: t('anesthesia.patientDetail.successSurgeryCreatedDesc'),
      });
      setIsCreateCaseOpen(false);
      setNewCase({ plannedSurgery: "", chopCode: "", surgeon: "", surgeonId: "", plannedDate: "", surgeryRoomId: "", duration: 180, notes: "", noPreOpRequired: false });
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
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${derivedPatientId}`] 
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
          return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`);
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
      return await apiRequest("PATCH", `/api/patients/${patient?.id}`, patientData);
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
      return await apiRequest("POST", `/api/patients/${patient?.id}/archive`);
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

  // Mutation to delete a patient questionnaire upload
  const deletePatientUploadMutation = useMutation({
    mutationFn: async (uploadId: string) => {
      return await apiRequest("DELETE", `/api/questionnaire/uploads/${uploadId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient-uploads', derivedPatientId] });
      toast({
        title: t('anesthesia.patientDetail.documentDeleted', 'Document deleted'),
        description: t('anesthesia.patientDetail.documentDeletedDesc', 'The document has been removed'),
      });
      setPatientUploadToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorDocumentDelete', 'Failed to delete document'),
        variant: "destructive",
      });
    },
  });
  
  // Handle file upload to S3
  const handleFileUpload = async (file: File) => {
    if (!derivedPatientId || !activeHospital?.id) return;
    
    setIsUploading(true);
    try {
      // Step 1: Get presigned upload URL using apiRequest
      const urlResultResponse = await apiRequest("POST", `/api/patients/${derivedPatientId}/documents/upload-url`, {
        filename: file.name,
        contentType: file.type,
      });
      
      const { uploadUrl, storageKey } = await urlResultResponse.json();
      
      // Step 2: Upload file directly to S3 (this is external, use fetch)
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
        },
        body: file,
      });
      
      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file');
      }
      
      // Step 3: Create document record using apiRequest
      await apiRequest("POST", `/api/patients/${derivedPatientId}/documents`, {
        category: uploadCategory,
        fileName: file.name,
        fileUrl: storageKey,
        mimeType: file.type,
        fileSize: file.size,
        description: uploadDescription || null,
      });
      
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${derivedPatientId}/documents`] });
      
      toast({
        title: t('anesthesia.patientDetail.documentUploaded', 'Document uploaded'),
        description: t('anesthesia.patientDetail.documentUploadedDesc', 'The document has been saved successfully'),
      });
      
      // Reset form
      setIsUploadDialogOpen(false);
      setUploadCategory('other');
      setUploadDescription('');
      
    } catch (error: any) {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorDocumentUpload', 'Failed to upload document'),
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle camera capture (convert base64 to file and upload)
  const handleCameraCapture = async (photoDataUrl: string) => {
    if (!derivedPatientId || !activeHospital?.id) return;
    
    // Convert base64 to file
    const response = await fetch(photoDataUrl);
    const blob = await response.blob();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = new File([blob], `photo-${timestamp}.jpg`, { type: 'image/jpeg' });
    
    await handleFileUpload(file);
    setIsCameraOpen(false);
  };

  // Handler for quick contact edit in Pre-Op dialog
  const handleQuickContactSave = async () => {
    if (!patient) return;
    
    // Check if anything changed to avoid unnecessary updates
    const emailChanged = (quickContactForm.email || "") !== (patient.email || "");
    const phoneChanged = (quickContactForm.phone || "") !== (patient.phone || "");
    
    if (!emailChanged && !phoneChanged) {
      setIsQuickContactOpen(false);
      return;
    }
    
    setIsQuickContactSaving(true);
    try {
      await apiRequest("PATCH", `/api/patients/${patient.id}`, {
        email: quickContactForm.email || null,
        phone: quickContactForm.phone || null,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patient.id}`] });
      toast({
        title: t('anesthesia.patientDetail.successContactUpdated'),
        description: t('anesthesia.patientDetail.successContactUpdatedDesc'),
      });
      setIsQuickContactOpen(false);
    } catch (error: any) {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: error.message || t('anesthesia.patientDetail.errorContactUpdated'),
        variant: "destructive",
      });
    } finally {
      setIsQuickContactSaving(false);
    }
  };

  // Fetch pre-op assessment for selected surgery
  const { data: existingAssessment } = useQuery<any>({
    queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`],
    enabled: !!selectedCaseId && isPreOpOpen,
  });

  // Pre-fill form when assessment is fetched
  useEffect(() => {
    // Get current user's full name for auto-fill
    const currentUserName = (user as any)?.firstName && (user as any)?.lastName 
      ? `${(user as any).firstName} ${(user as any).lastName}` 
      : (user as any)?.email || "";
    
    if (existingAssessment && isPreOpOpen && !isSavingRef.current) {
      setAssessmentData({
        height: existingAssessment.height || "",
        weight: existingAssessment.weight || "",
        allergies: existingAssessment.allergies || patient?.allergies || [],
        allergiesOther: existingAssessment.allergiesOther || patient?.otherAllergies || "",
        cave: existingAssessment.cave || "",
        asa: existingAssessment.asa || "",
        specialNotes: existingAssessment.specialNotes || "",
        anticoagulationMeds: existingAssessment.anticoagulationMeds || [],
        anticoagulationMedsOther: existingAssessment.anticoagulationMedsOther || "",
        generalMeds: existingAssessment.generalMeds || [],
        generalMedsOther: existingAssessment.generalMedsOther || "",
        medicationsNotes: existingAssessment.medicationsNotes || "",
        heartIllnesses: mergeIllnessData(existingAssessment.heartIllnesses, anesthesiaSettings?.illnessLists?.cardiovascular),
        heartNotes: existingAssessment.heartNotes || "",
        lungIllnesses: mergeIllnessData(existingAssessment.lungIllnesses, anesthesiaSettings?.illnessLists?.pulmonary),
        lungNotes: existingAssessment.lungNotes || "",
        giIllnesses: mergeIllnessData(existingAssessment.giIllnesses, anesthesiaSettings?.illnessLists?.gastrointestinal),
        kidneyIllnesses: mergeIllnessData(existingAssessment.kidneyIllnesses, anesthesiaSettings?.illnessLists?.kidney),
        metabolicIllnesses: mergeIllnessData(existingAssessment.metabolicIllnesses, anesthesiaSettings?.illnessLists?.metabolic),
        giKidneyMetabolicNotes: existingAssessment.giKidneyMetabolicNotes || "",
        neuroIllnesses: mergeIllnessData(existingAssessment.neuroIllnesses, anesthesiaSettings?.illnessLists?.neurological),
        psychIllnesses: mergeIllnessData(existingAssessment.psychIllnesses, anesthesiaSettings?.illnessLists?.psychiatric),
        skeletalIllnesses: mergeIllnessData(existingAssessment.skeletalIllnesses, anesthesiaSettings?.illnessLists?.skeletal),
        neuroPsychSkeletalNotes: existingAssessment.neuroPsychSkeletalNotes || "",
        coagulationIllnesses: mergeIllnessData(existingAssessment.coagulationIllnesses, anesthesiaSettings?.illnessLists?.coagulation),
        infectiousIllnesses: mergeIllnessData(existingAssessment.infectiousIllnesses, anesthesiaSettings?.illnessLists?.infectious),
        coagulationInfectiousNotes: existingAssessment.coagulationInfectiousNotes || "",
        womanIssues: mergeIllnessData(existingAssessment.womanIssues, anesthesiaSettings?.illnessLists?.woman),
        womanNotes: existingAssessment.womanNotes || "",
        noxen: mergeIllnessData(existingAssessment.noxen, anesthesiaSettings?.illnessLists?.noxen),
        noxenNotes: existingAssessment.noxenNotes || "",
        childrenIssues: mergeIllnessData(existingAssessment.childrenIssues, anesthesiaSettings?.illnessLists?.children),
        childrenNotes: existingAssessment.childrenNotes || "",
        // Anesthesia & Surgical History
        anesthesiaHistoryIssues: mergeIllnessData(existingAssessment.anesthesiaHistoryIssues, anesthesiaSettings?.illnessLists?.anesthesiaHistory),
        dentalIssues: mergeIllnessData(existingAssessment.dentalIssues, anesthesiaSettings?.illnessLists?.dental),
        ponvTransfusionIssues: mergeIllnessData(existingAssessment.ponvTransfusionIssues, anesthesiaSettings?.illnessLists?.ponvTransfusion),
        previousSurgeries: existingAssessment.previousSurgeries || "",
        anesthesiaSurgicalHistoryNotes: existingAssessment.anesthesiaSurgicalHistoryNotes || "",
        // Outpatient Care
        outpatientCaregiverFirstName: existingAssessment.outpatientCaregiverFirstName || "",
        outpatientCaregiverLastName: existingAssessment.outpatientCaregiverLastName || "",
        outpatientCaregiverPhone: existingAssessment.outpatientCaregiverPhone || "",
        anesthesiaTechniques: {
          general: existingAssessment.anesthesiaTechniques?.general || false,
          generalOptions: existingAssessment.anesthesiaTechniques?.generalOptions || {} as Record<string, boolean>,
          spinal: existingAssessment.anesthesiaTechniques?.spinal || false,
          epidural: existingAssessment.anesthesiaTechniques?.epidural || false,
          epiduralOptions: existingAssessment.anesthesiaTechniques?.epiduralOptions || {} as Record<string, boolean>,
          regional: existingAssessment.anesthesiaTechniques?.regional || false,
          regionalOptions: existingAssessment.anesthesiaTechniques?.regionalOptions || {} as Record<string, boolean>,
          sedation: existingAssessment.anesthesiaTechniques?.sedation || false,
          combined: existingAssessment.anesthesiaTechniques?.combined || false,
        },
        postOpICU: existingAssessment.postOpICU || false,
        anesthesiaOther: existingAssessment.anesthesiaOther || "",
        installations: existingAssessment.installations || {
          arterialLine: false, centralLine: false, epiduralCatheter: false, urinaryCatheter: false, nasogastricTube: false, peripheralIV: false,
        },
        installationsOther: existingAssessment.installationsOther || "",
        surgicalApprovalStatus: existingAssessment.surgicalApproval || "",
        standBy: existingAssessment.standBy || false,
        standByReason: existingAssessment.standByReason || "",
        standByReasonNote: existingAssessment.standByReasonNote || "",
        assessmentDate: existingAssessment.assessmentDate || new Date().toISOString().split('T')[0],
        doctorName: existingAssessment.doctorName || currentUserName,
        doctorSignature: existingAssessment.doctorSignature || "",
      });

      setConsentData({
        general: existingAssessment.consentGiven || false,
        analgosedation: existingAssessment.consentAnalgosedation || false,
        regional: existingAssessment.consentRegional || false,
        installations: existingAssessment.consentInstallations || false,
        icuAdmission: existingAssessment.consentICU || false,
        notes: existingAssessment.consentNotes || "",
        date: existingAssessment.consentDate || new Date().toISOString().split('T')[0],
        doctorSignature: existingAssessment.consentDoctorSignature || "",
        patientSignature: existingAssessment.patientSignature || "",
        emergencyNoSignature: existingAssessment.emergencyNoSignature || false,
        sendEmailCopy: existingAssessment.sendEmailCopy || false,
        emailForCopy: existingAssessment.emailForCopy || "",
        emailLanguage: (existingAssessment.emailLanguage as "en" | "de") || "de",
      });
    } else if (isPreOpOpen && !existingAssessment && patient) {
      // Reset form with patient allergies and current user's name for new assessments
      setAssessmentData(prev => ({
        ...prev,
        allergies: patient.allergies || [],
        allergiesOther: patient.otherAllergies || "",
        doctorName: currentUserName,
      }));
    }
  }, [existingAssessment, isPreOpOpen, patient, user, anesthesiaSettings]);

  // Initialize illness state from hospital settings when opening pre-op for new assessments
  useEffect(() => {
    if (!existingAssessment && isPreOpOpen && anesthesiaSettings?.illnessLists) {
      const lists = anesthesiaSettings.illnessLists;
      setAssessmentData(prev => ({
        ...prev,
        heartIllnesses: createEmptyIllnessState(lists.cardiovascular),
        lungIllnesses: createEmptyIllnessState(lists.pulmonary),
        giIllnesses: createEmptyIllnessState(lists.gastrointestinal),
        kidneyIllnesses: createEmptyIllnessState(lists.kidney),
        metabolicIllnesses: createEmptyIllnessState(lists.metabolic),
        neuroIllnesses: createEmptyIllnessState(lists.neurological),
        psychIllnesses: createEmptyIllnessState(lists.psychiatric),
        skeletalIllnesses: createEmptyIllnessState(lists.skeletal),
        coagulationIllnesses: createEmptyIllnessState(lists.coagulation),
        infectiousIllnesses: createEmptyIllnessState(lists.infectious),
        womanIssues: createEmptyIllnessState(lists.woman),
        noxen: createEmptyIllnessState(lists.noxen),
        childrenIssues: createEmptyIllnessState(lists.children),
        // Anesthesia & Surgical History
        anesthesiaHistoryIssues: createEmptyIllnessState(lists.anesthesiaHistory),
        dentalIssues: createEmptyIllnessState(lists.dental),
        ponvTransfusionIssues: createEmptyIllnessState(lists.ponvTransfusion),
      }));
    }
  }, [existingAssessment, isPreOpOpen, anesthesiaSettings]);

  // Mutation to create pre-op assessment
  const createPreOpMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/preop", {
        surgeryId: selectedCaseId,
        ...data,
      });
      return { response, shouldSendEmail: data.sendEmailCopy && data.emailForCopy };
    },
    onSuccess: async (result: { response: any; shouldSendEmail: boolean }) => {
      // Clear saving flag after a short delay to allow React to settle
      setTimeout(() => { isSavingRef.current = false; }, 500);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.patientDetail.saved'),
        description: t('anesthesia.patientDetail.preOpAssessmentSaved'),
      });
      
      if (result.shouldSendEmail && result.response?.id) {
        sendEmailMutation.mutate(result.response.id);
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
      const response = await apiRequest("PATCH", `/api/anesthesia/preop/${existingAssessment?.id}`, data);
      return { response, shouldSendEmail: data.sendEmailCopy && data.emailForCopy, assessmentId: existingAssessment?.id };
    },
    onSuccess: (result: { response: any; shouldSendEmail: boolean; assessmentId: string | undefined }) => {
      // Clear saving flag after a short delay to allow React to settle
      setTimeout(() => { isSavingRef.current = false; }, 500);
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`] });
      toast({
        title: t('anesthesia.patientDetail.updated'),
        description: t('anesthesia.patientDetail.preOpAssessmentUpdated'),
      });
      
      if (result.shouldSendEmail && result.assessmentId) {
        sendEmailMutation.mutate(result.assessmentId);
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

  // Mutation to send pre-op assessment PDF via email
  const sendEmailMutation = useMutation({
    mutationFn: async (assessmentId: string) => {
      return await apiRequest("POST", `/api/anesthesia/preop/${assessmentId}/send-email`);
    },
    onSuccess: (data: any) => {
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

  const handleCreateCase = () => {
    if (!newCase.plannedSurgery || !newCase.plannedDate) {
      toast({
        title: t('anesthesia.patientDetail.errorMissingRequiredFields'),
        description: t('anesthesia.patientDetail.errorFillPlannedSurgeryDate'),
        variant: "destructive",
      });
      return;
    }

    // Validate duration
    if (!newCase.duration || newCase.duration <= 0) {
      toast({
        title: t('anesthesia.patientDetail.errorInvalidDuration'),
        description: t('anesthesia.patientDetail.errorDurationGreaterZero'),
        variant: "destructive",
      });
      return;
    }

    if (!patient || !activeHospital) return;

    // Calculate end time from start time + duration
    const startDate = new Date(newCase.plannedDate);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + newCase.duration);

    const surgeryData = {
      hospitalId: activeHospital.id,
      patientId: patient.id,
      plannedSurgery: newCase.plannedSurgery,
      surgeon: newCase.surgeon || null,
      surgeonId: newCase.surgeonId || null,
      plannedDate: newCase.plannedDate,
      surgeryRoomId: newCase.surgeryRoomId || null,
      actualEndTime: endDate.toISOString(),
      notes: newCase.notes || null,
      noPreOpRequired: newCase.noPreOpRequired,
    };
    
    console.log("Creating surgery with data:", surgeryData);
    createSurgeryMutation.mutate(surgeryData);
  };

  const handleEditCase = (surgery: any) => {
    setEditingCaseId(surgery.id);
  };

  const handleArchiveCase = () => {
    if (!archiveDialogSurgeryId) return;
    archiveSurgeryMutation.mutate(archiveDialogSurgeryId);
  };

  const handleSavePreOpAssessment = async (markAsCompleted = false, overrideData: any = {}) => {
    // Set flag to prevent useEffect from resetting form data during save
    isSavingRef.current = true;
    
    const data = {
      ...assessmentData,
      ...overrideData, // Allow overriding specific fields (like signature)
      surgicalApproval: assessmentData.surgicalApprovalStatus,
      standBy: assessmentData.standBy,
      standByReason: assessmentData.standByReason,
      standByReasonNote: assessmentData.standByReasonNote,
      // Format consent data fields
      consentGiven: consentData.general,
      consentAnalgosedation: consentData.analgosedation,
      consentRegional: consentData.regional,
      consentInstallations: consentData.installations,
      consentICU: consentData.icuAdmission,
      consentNotes: consentData.notes,
      consentDate: consentData.date,
      consentDoctorSignature: consentData.doctorSignature,
      patientSignature: consentData.patientSignature,
      emergencyNoSignature: consentData.emergencyNoSignature,
      sendEmailCopy: consentData.sendEmailCopy,
      emailForCopy: consentData.emailForCopy,
      emailLanguage: consentData.emailLanguage,
      // Determine status based on anesthesiologist selection:
      // - stand-by: goes to Stand-by tab (status stays as-is, standBy flag is true)
      // - approved/not-approved: goes to Completed tab
      // - no selection: stays in In Progress tab (draft)
      status: markAsCompleted ? "completed" : 
              (assessmentData.surgicalApprovalStatus === "approved" || assessmentData.surgicalApprovalStatus === "not-approved") ? "completed" :
              "draft",
    };

    // Save allergies to patient table (single source of truth)
    if (patient) {
      await apiRequest("PATCH", `/api/patients/${patient.id}`, {
        allergies: assessmentData.allergies,
        otherAllergies: assessmentData.allergiesOther,
      });
      // Invalidate patient query to refresh allergies in UI
      queryClient.invalidateQueries({ queryKey: [`/api/patients/${patient.id}`] });
    }

    if (existingAssessment) {
      // Update existing assessment
      updatePreOpMutation.mutate(data);
    } else {
      // Create new assessment
      createPreOpMutation.mutate(data);
    }
  };

  // Auto-save functionality with debounce
  const [autoSaveTimeout, setAutoSaveTimeout] = useState<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    // Skip auto-save if assessment is already completed
    if (existingAssessment?.status === "completed") {
      return;
    }

    // Only auto-save if dialog is open and there's data
    if (isPreOpOpen && selectedCaseId) {
      // Clear existing timeout
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }

      // Set new timeout for auto-save (30 seconds after last change)
      const timeout = setTimeout(() => {
        // Only auto-save if there's meaningful user-entered data (not just defaults)
        const hasUserData = assessmentData.height || assessmentData.weight || 
                           assessmentData.asa || assessmentData.cave || 
                           assessmentData.specialNotes ||
                           assessmentData.anticoagulationMeds.length > 0 ||
                           assessmentData.generalMeds.length > 0;
        
        // Don't auto-save if already completed
        const isCompleted = existingAssessment?.status === "completed";
        
        if (hasUserData && !isCompleted && !createPreOpMutation.isPending && !updatePreOpMutation.isPending) {
          handleSavePreOpAssessment(false); // Save as draft
        }
      }, 30000); // 30 seconds

      setAutoSaveTimeout(timeout);

      return () => {
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [assessmentData, consentData, isPreOpOpen, selectedCaseId, existingAssessment?.status]);

  const handleCompleteAssessment = () => {
    // Validate required fields
    if (!assessmentData.asa) {
      toast({
        title: t('anesthesia.patientDetail.errorMissingASA'),
        description: t('anesthesia.patientDetail.errorSelectASA'),
        variant: "destructive",
      });
      return;
    }

    if (!assessmentData.doctorName) {
      toast({
        title: t('anesthesia.patientDetail.errorMissingDoctorName'),
        description: t('anesthesia.patientDetail.errorEnterDoctorName'),
        variant: "destructive",
      });
      return;
    }

    // Generate signature (simple text signature: name + timestamp)
    const now = new Date();
    const timestamp = now.toLocaleString('de-DE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    const signature = `${assessmentData.doctorName} - ${timestamp}`;
    const today = now.toISOString().split('T')[0];

    // Update local state for UI
    setAssessmentData(prev => ({
      ...prev,
      doctorSignature: signature,
      assessmentDate: today,
    }));

    // Save with signature override to avoid stale closure
    handleSavePreOpAssessment(true, {
      doctorSignature: signature,
      assessmentDate: today,
    });
  };


  // Handle importing questionnaire data into pre-op assessment
  const handleImportFromQuestionnaire = () => {
    if (!selectedQuestionnaireResponse?.response) return;
    
    const qResponse = selectedQuestionnaireResponse.response;
    
    // Map questionnaire fields to pre-op assessment fields
    setAssessmentData(prev => {
      const newData = { ...prev };
      
      // Height and weight
      if (qResponse.height) newData.height = qResponse.height;
      if (qResponse.weight) newData.weight = qResponse.weight;
      
      // Allergies - match IDs against the allergyList and auto-select checkboxes
      // The questionnaire stores allergy IDs that correspond to anesthesiaSettings.allergyList IDs
      if (qResponse.allergies && qResponse.allergies.length > 0) {
        const allergyList = anesthesiaSettings?.allergyList || [];
        const knownAllergyIds = allergyList.map((a: { id: string }) => a.id);
        
        const matchedAllergies: string[] = [...(newData.allergies || [])];
        const unmatchedAllergies: string[] = [];
        
        for (const allergyId of qResponse.allergies) {
          // Check if this allergy ID exists in the hospital's allergy list
          if (knownAllergyIds.includes(allergyId)) {
            if (!matchedAllergies.includes(allergyId)) {
              matchedAllergies.push(allergyId);
            }
          } else {
            // This is an unmatched allergy (free text or from a different config)
            unmatchedAllergies.push(allergyId);
          }
        }
        
        // Update the allergies checkbox array
        newData.allergies = matchedAllergies;
        
        // Add unmatched allergies to the "Other" field
        if (unmatchedAllergies.length > 0) {
          const allergiesText = unmatchedAllergies.join(', ');
          newData.allergiesOther = newData.allergiesOther 
            ? `${newData.allergiesOther}; Patient: ${allergiesText}` 
            : `Patient: ${allergiesText}`;
        }
      }
      if (qResponse.allergiesNotes) {
        newData.allergiesOther = newData.allergiesOther 
          ? `${newData.allergiesOther}; ${qResponse.allergiesNotes}` 
          : qResponse.allergiesNotes;
      }
      
      // Medications - match against predefined lists and auto-select, others go to notes
      if (qResponse.medications && qResponse.medications.length > 0) {
        const anticoagulationList = anesthesiaSettings?.medicationLists?.anticoagulation || [];
        const generalList = anesthesiaSettings?.medicationLists?.general || [];
        
        const matchedAnticoag: string[] = [...(newData.anticoagulationMeds || [])];
        const matchedGeneral: string[] = [...(newData.generalMeds || [])];
        const unmatchedMeds: string[] = [];
        
        for (const med of qResponse.medications) {
          const medNameLower = med.name.toLowerCase().trim();
          
          // Check if it matches anticoagulation list
          const anticoagMatch = anticoagulationList.find(
            (item: { id: string; label: string }) => item.label.toLowerCase() === medNameLower
          );
          if (anticoagMatch && !matchedAnticoag.includes(anticoagMatch.id)) {
            matchedAnticoag.push(anticoagMatch.id);
            continue;
          }
          
          // Check if it matches general list
          const generalMatch = generalList.find(
            (item: { id: string; label: string }) => item.label.toLowerCase() === medNameLower
          );
          if (generalMatch && !matchedGeneral.includes(generalMatch.id)) {
            matchedGeneral.push(generalMatch.id);
            continue;
          }
          
          // Not matched - add to unmatched list with details
          unmatchedMeds.push(
            `${med.name}${med.dosage ? ` (${med.dosage})` : ''}${med.frequency ? ` - ${med.frequency}` : ''}`
          );
        }
        
        // Update the medication arrays
        newData.anticoagulationMeds = matchedAnticoag;
        newData.generalMeds = matchedGeneral;
        
        // Add unmatched medications to the "Other" field
        if (unmatchedMeds.length > 0) {
          const medsText = unmatchedMeds.join('; ');
          newData.generalMedsOther = newData.generalMedsOther 
            ? `${newData.generalMedsOther}; Patient: ${medsText}` 
            : `Patient: ${medsText}`;
        }
      }
      if (qResponse.medicationsNotes) {
        newData.medicationsNotes = newData.medicationsNotes 
          ? `${newData.medicationsNotes}; ${qResponse.medicationsNotes}` 
          : qResponse.medicationsNotes;
      }
      
      // Smoking status -> noxen checkboxes and notes
      if (qResponse.smokingStatus && qResponse.smokingStatus !== 'never') {
        // Initialize noxen object if it doesn't exist
        if (!newData.noxen) {
          newData.noxen = {};
        }
        newData.noxen = { ...newData.noxen, smoking: true };
        
        // Add status and details to notes
        const smokingInfo = qResponse.smokingDetails 
          ? `Smoking: ${qResponse.smokingStatus} - ${qResponse.smokingDetails}`
          : `Smoking: ${qResponse.smokingStatus}`;
        newData.noxenNotes = newData.noxenNotes 
          ? `${newData.noxenNotes}; ${smokingInfo}` 
          : smokingInfo;
      }
      
      // Alcohol status -> noxen checkboxes and notes
      if (qResponse.alcoholStatus && qResponse.alcoholStatus !== 'never') {
        // Initialize noxen object if it doesn't exist
        if (!newData.noxen) {
          newData.noxen = {};
        }
        newData.noxen = { ...newData.noxen, alcohol: true };
        
        // Add status and details to notes
        const alcoholInfo = qResponse.alcoholDetails 
          ? `Alcohol: ${qResponse.alcoholStatus} - ${qResponse.alcoholDetails}`
          : `Alcohol: ${qResponse.alcoholStatus}`;
        newData.noxenNotes = newData.noxenNotes 
          ? `${newData.noxenNotes}; ${alcoholInfo}` 
          : alcoholInfo;
      }
      
      // Previous surgeries -> special notes (build on newData)
      if (qResponse.previousSurgeries) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nPrevious surgeries: ${qResponse.previousSurgeries}` 
          : `Previous surgeries: ${qResponse.previousSurgeries}`;
      }
      
      // Previous anesthesia problems -> special notes (build on newData)
      if (qResponse.previousAnesthesiaProblems) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nPrevious anesthesia problems: ${qResponse.previousAnesthesiaProblems}` 
          : `Previous anesthesia problems: ${qResponse.previousAnesthesiaProblems}`;
      }
      
      // Woman health (pregnancy, breastfeeding)
      if (qResponse.pregnancyStatus === 'yes' || qResponse.pregnancyStatus === 'possible') {
        if (newData.womanIssues) {
          newData.womanIssues = { ...newData.womanIssues, pregnancy: true };
        }
      }
      if (qResponse.breastfeeding) {
        if (newData.womanIssues) {
          newData.womanIssues = { ...newData.womanIssues, breastfeeding: true };
        }
      }
      if (qResponse.womanHealthNotes) {
        newData.womanNotes = newData.womanNotes 
          ? `${newData.womanNotes}; ${qResponse.womanHealthNotes}` 
          : qResponse.womanHealthNotes;
      }
      
      // Additional notes -> special notes (build on newData)
      if (qResponse.additionalNotes) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nPatient notes: ${qResponse.additionalNotes}` 
          : `Patient notes: ${qResponse.additionalNotes}`;
      }
      
      // Conditions/Illnesses - match against predefined lists and auto-select
      if (qResponse.conditions && Object.keys(qResponse.conditions).length > 0) {
        const illnessLists = anesthesiaSettings?.illnessLists || {};
        
        // Create mappings from illness ID to category
        const categoryMappings: Record<string, { category: string; dataKey: keyof typeof newData }> = {};
        
        const categoryToDataKey: Record<string, keyof typeof newData> = {
          cardiovascular: 'heartIllnesses',
          pulmonary: 'lungIllnesses',
          gastrointestinal: 'giIllnesses',
          kidney: 'kidneyIllnesses',
          metabolic: 'metabolicIllnesses',
          neurological: 'neuroIllnesses',
          psychiatric: 'psychIllnesses',
          skeletal: 'skeletalIllnesses',
          coagulation: 'coagulationIllnesses',
          infectious: 'infectiousIllnesses',
          woman: 'womanIssues',
          noxen: 'noxen',
          children: 'childrenIssues',
          anesthesiaHistory: 'anesthesiaHistoryIssues',
          dental: 'dentalIssues',
          ponvTransfusion: 'ponvTransfusionIssues',
        };
        
        // Build a lookup of all illness IDs to their categories
        Object.entries(illnessLists).forEach(([category, illnesses]) => {
          if (Array.isArray(illnesses)) {
            illnesses.forEach((illness: { id: string; label: string }) => {
              categoryMappings[illness.id] = {
                category,
                dataKey: categoryToDataKey[category] || 'heartIllnesses',
              };
            });
          }
        });
        
        // Process each condition from the questionnaire
        const unmatchedConditions: string[] = [];
        
        for (const [conditionId, conditionData] of Object.entries(qResponse.conditions)) {
          if (!(conditionData as { checked?: boolean }).checked) continue;
          
          const mapping = categoryMappings[conditionId];
          if (mapping) {
            // Found a matching illness - auto-select it
            const dataKey = mapping.dataKey;
            if (newData[dataKey] && typeof newData[dataKey] === 'object') {
              (newData[dataKey] as Record<string, boolean>)[conditionId] = true;
            }
            
            // Add notes if provided
            if ((conditionData as { notes?: string }).notes) {
              const notesKey = `${dataKey.replace('Illnesses', 'Notes')}` as keyof typeof newData;
              if (typeof newData[notesKey] === 'string') {
                const conditionNotes = (conditionData as { notes?: string }).notes;
                (newData as any)[notesKey] = (newData[notesKey] as string)
                  ? `${newData[notesKey]}; ${conditionId}: ${conditionNotes}`
                  : `${conditionId}: ${conditionNotes}`;
              }
            }
          } else {
            // Unmatched condition - add to special notes
            const conditionNotes = (conditionData as { notes?: string }).notes;
            unmatchedConditions.push(
              conditionNotes ? `${conditionId} (${conditionNotes})` : conditionId
            );
          }
        }
        
        // Add unmatched conditions to special notes
        if (unmatchedConditions.length > 0) {
          const conditionsText = unmatchedConditions.join(', ');
          newData.specialNotes = newData.specialNotes
            ? `${newData.specialNotes}\n\nPatient conditions: ${conditionsText}`
            : `Patient conditions: ${conditionsText}`;
        }
      }
      
      // Extended questionnaire fields (cast to any for additional properties)
      const qResponseExt = qResponse as any;
      
      // Dental Issues -> dentalIssues checkboxes
      if (qResponseExt.dentalIssues && Object.keys(qResponseExt.dentalIssues).length > 0) {
        const currentDental = newData.dentalIssues || {};
        for (const [issueId, isChecked] of Object.entries(qResponseExt.dentalIssues)) {
          if (isChecked) {
            currentDental[issueId] = true;
          }
        }
        newData.dentalIssues = currentDental;
      }
      if (qResponseExt.dentalNotes) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nDental notes: ${qResponseExt.dentalNotes}` 
          : `Dental notes: ${qResponseExt.dentalNotes}`;
      }
      
      // PONV & Transfusion Issues -> ponvTransfusionIssues checkboxes
      if (qResponseExt.ponvTransfusionIssues && Object.keys(qResponseExt.ponvTransfusionIssues).length > 0) {
        const currentPonv = newData.ponvTransfusionIssues || {};
        for (const [issueId, isChecked] of Object.entries(qResponseExt.ponvTransfusionIssues)) {
          if (isChecked) {
            currentPonv[issueId] = true;
          }
        }
        newData.ponvTransfusionIssues = currentPonv;
      }
      if (qResponseExt.ponvTransfusionNotes) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nPONV/Transfusion notes: ${qResponseExt.ponvTransfusionNotes}` 
          : `PONV/Transfusion notes: ${qResponseExt.ponvTransfusionNotes}`;
      }
      
      // Outpatient Caregiver -> outpatient care fields
      if (qResponseExt.outpatientCaregiverFirstName) {
        newData.outpatientCaregiverFirstName = qResponseExt.outpatientCaregiverFirstName;
      }
      if (qResponseExt.outpatientCaregiverLastName) {
        newData.outpatientCaregiverLastName = qResponseExt.outpatientCaregiverLastName;
      }
      if (qResponseExt.outpatientCaregiverPhone) {
        newData.outpatientCaregiverPhone = qResponseExt.outpatientCaregiverPhone;
      }
      
      // Questions for Doctor -> special notes with prominent label
      if (qResponseExt.questionsForDoctor) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\n⚠️ PATIENT QUESTIONS FOR DOCTOR:\n${qResponseExt.questionsForDoctor}` 
          : `⚠️ PATIENT QUESTIONS FOR DOCTOR:\n${qResponseExt.questionsForDoctor}`;
      }
      
      return newData;
    });
    
    toast({
      title: t('anesthesia.patientDetail.questionnaireImported'),
      description: t('anesthesia.patientDetail.questionnaireImportedDesc'),
    });
    
    setIsImportQuestionnaireOpen(false);
    setSelectedQuestionnaireForImport(null);
  };

  // Handle pre-op assessment PDF download
  const handleDownloadPreOpPDF = async () => {
    if (!existingAssessment?.id) return;
    
    setIsDownloadingPreOpPdf(true);
    try {
      const language = consentData.emailLanguage || 'de';
      const response = await fetch(`/api/anesthesia/preop/${existingAssessment.id}/pdf?language=${language}`, {
        method: 'GET',
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      const patientName = patient ? `${patient.surname}_${patient.firstName}`.replace(/[^a-zA-Z0-9_-]/g, '') : 'patient';
      a.download = `preop-${patientName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: t('anesthesia.patientDetail.pdfDownloaded', 'PDF Downloaded'),
        description: t('anesthesia.patientDetail.preOpPdfDownloadSuccess', 'Pre-op assessment downloaded successfully'),
      });
    } catch (error) {
      toast({
        title: t('anesthesia.patientDetail.error'),
        description: t('anesthesia.patientDetail.errorDownloadingPdf', 'Failed to download PDF'),
        variant: "destructive",
      });
    } finally {
      setIsDownloadingPreOpPdf(false);
    }
  };

  // Handle PDF download for a surgery - uses centralized PDF generation utility
  const handleDownloadPDF = async (surgery: Surgery) => {
    if (!patient) {
      toast({
        title: "Cannot generate PDF",
        description: "Patient data not available",
        variant: "destructive",
      });
      return;
    }

    if (!activeHospital) {
      toast({
        title: "Cannot generate PDF",
        description: "Hospital not selected. Please select a hospital first.",
        variant: "destructive",
      });
      return;
    }

    const result = await downloadAnesthesiaRecordPdf({
      surgery,
      patient: patient as any,
      hospitalId: activeHospital.id,
      anesthesiaSettings,
    });

    if (result.success) {
      toast({
        title: t('anesthesia.patientDetail.pdfGenerated'),
        description: result.hasWarnings
          ? t('anesthesia.patientDetail.pdfGeneratedWithWarnings')
          : t('anesthesia.patientDetail.pdfGeneratedSuccess'),
      });
    } else {
      toast({
        title: t('anesthesia.patientDetail.errorGeneratingPDF'),
        description: result.error || t('anesthesia.patientDetail.errorGeneratingPDFDesc'),
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "planned":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
      case "ongoing":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "completed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "archived":
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const calculateAge = (birthday: string) => {
    const today = new Date();
    const birthDate = new Date(birthday);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };
  
  const hasHeartData = () => {
    return Object.values(assessmentData.heartIllnesses).some(v => v) || assessmentData.heartNotes.trim() !== "";
  };
  
  const hasLungData = () => {
    return Object.values(assessmentData.lungIllnesses).some(v => v) || assessmentData.lungNotes.trim() !== "";
  };
  
  const hasGIKidneyMetabolicData = () => {
    return Object.values(assessmentData.giIllnesses).some(v => v) || 
           Object.values(assessmentData.kidneyIllnesses).some(v => v) || 
           Object.values(assessmentData.metabolicIllnesses).some(v => v) || 
           assessmentData.giKidneyMetabolicNotes.trim() !== "";
  };
  
  const hasNeuroPsychSkeletalData = () => {
    return Object.values(assessmentData.neuroIllnesses).some(v => v) || 
           Object.values(assessmentData.psychIllnesses).some(v => v) || 
           Object.values(assessmentData.skeletalIllnesses).some(v => v) || 
           assessmentData.neuroPsychSkeletalNotes.trim() !== "";
  };
  
  const hasCoagulationInfectiousData = () => {
    return Object.values(assessmentData.coagulationIllnesses).some(v => v) || 
           Object.values(assessmentData.infectiousIllnesses).some(v => v) || 
           assessmentData.coagulationInfectiousNotes.trim() !== "";
  };
  
  const hasWomanData = () => {
    return Object.values(assessmentData.womanIssues).some(v => v) || assessmentData.womanNotes.trim() !== "";
  };
  
  const hasNoxenData = () => {
    return Object.values(assessmentData.noxen).some(v => v) || assessmentData.noxenNotes.trim() !== "";
  };
  
  const hasChildrenData = () => {
    return Object.values(assessmentData.childrenIssues).some(v => v) || assessmentData.childrenNotes.trim() !== "";
  };
  
  const hasAnesthesiaData = () => {
    return Object.values(assessmentData.anesthesiaTechniques).some(v => v) ||
           assessmentData.postOpICU ||
           assessmentData.anesthesiaOther.trim() !== "" ||
           Object.values(assessmentData.installations).some(v => v) ||
           assessmentData.installationsOther.trim() !== "" ||
           assessmentData.surgicalApprovalStatus.trim() !== "" ||
           assessmentData.standBy;
  };
  
  const hasGeneralData = () => {
    return assessmentData.height.trim() !== "" ||
           assessmentData.weight.trim() !== "" ||
           assessmentData.allergies.length > 0 ||
           assessmentData.allergiesOther.trim() !== "" ||
           assessmentData.cave.trim() !== "" ||
           assessmentData.asa.trim() !== "" ||
           assessmentData.specialNotes.trim() !== "";
  };

  const hasAllergiesData = () => {
    return assessmentData.allergies.length > 0 ||
           assessmentData.allergiesOther.trim() !== "";
  };
  
  const hasMedicationsData = () => {
    return assessmentData.anticoagulationMeds.length > 0 ||
           assessmentData.anticoagulationMedsOther.trim() !== "" ||
           assessmentData.generalMeds.length > 0 ||
           assessmentData.generalMedsOther.trim() !== "" ||
           assessmentData.medicationsNotes.trim() !== "";
  };

  const hasAnesthesiaSurgicalHistoryData = () => {
    return Object.values(assessmentData.anesthesiaHistoryIssues).some(v => v) ||
           Object.values(assessmentData.dentalIssues).some(v => v) ||
           Object.values(assessmentData.ponvTransfusionIssues).some(v => v) ||
           assessmentData.previousSurgeries.trim() !== "" ||
           assessmentData.anesthesiaSurgicalHistoryNotes.trim() !== "";
  };

  const hasOutpatientCareData = () => {
    return assessmentData.outpatientCaregiverFirstName.trim() !== "" ||
           assessmentData.outpatientCaregiverLastName.trim() !== "" ||
           assessmentData.outpatientCaregiverPhone.trim() !== "";
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsPatientCardVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1,
        rootMargin: "-80px 0px 0px 0px"
      }
    );

    if (patientCardRef.current) {
      observer.observe(patientCardRef.current);
    }

    return () => {
      if (patientCardRef.current) {
        observer.unobserve(patientCardRef.current);
      }
    };
  }, []);

  // Loading state - show simple loading for pre-op route mode
  if (isLoading || (isPreOpRoute && isLoadingPreOpSurgery)) {
    // In pre-op route mode, show minimal loading indicator (not patient detail layout)
    if (isPreOpRoute) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-preop" />
            <p className="text-muted-foreground">{t('anesthesia.patientDetail.loadingPreOp', 'Loading assessment...')}</p>
          </div>
        </div>
      );
    }
    return (
      <div className="container mx-auto p-4 pb-20">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {t('anesthesia.patientDetail.backToPatients')}
          </Button>
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-patient" />
              <p className="text-muted-foreground">{t('anesthesia.patientDetail.loading')}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !patient) {
    // In pre-op route mode, navigate back to pre-op list on error
    if (isPreOpRoute) {
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="h-8 w-8 text-destructive" data-testid="icon-error" />
            <p className="text-foreground font-semibold" data-testid="text-error">{t('anesthesia.patientDetail.patientNotFound')}</p>
            <Button className="mt-4" onClick={() => setLocation('/anesthesia/preop')} data-testid="button-back-to-preop">
              {t('anesthesia.preop.backToList', 'Back to Pre-Op List')}
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="container mx-auto p-4 pb-20">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {t('anesthesia.patientDetail.backToPatients')}
          </Button>
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" data-testid="icon-error" />
              <p className="text-foreground font-semibold" data-testid="text-error">{t('anesthesia.patientDetail.patientNotFound')}</p>
              <p className="text-sm text-muted-foreground">{t('anesthesia.patientDetail.patientNotFoundDesc')}</p>
              <Link href="/anesthesia/patients">
                <Button className="mt-4" data-testid="button-back-to-patients">
                  {t('anesthesia.patientDetail.backToPatients')}
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`container mx-auto p-4 pb-20 ${isPreOpRoute ? 'hidden' : ''}`}>
      {/* Sticky Patient Header - hidden in pre-op route mode */}
      {!isPatientCardVisible && !isPreOpRoute && (
        <div 
          className="fixed top-0 left-0 right-0 bg-background border-b z-50 transition-all duration-200"
          data-testid="sticky-patient-header"
        >
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              {patient.sex === "M" ? (
                <UserCircle className="h-5 w-5 text-blue-500" data-testid="icon-sex-male" />
              ) : (
                <UserRound className="h-5 w-5 text-pink-500" data-testid="icon-sex-female" />
              )}
              <div>
                <div className="font-semibold" data-testid="text-patient-name">{patient.surname}, {patient.firstName}</div>
                <p className="text-xs text-muted-foreground" data-testid="text-patient-info">
                  {formatDate(patient.birthday)} ({calculateAge(patient.birthday)} years) • Patient ID: {patient.patientNumber}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            {t('anesthesia.patientDetail.backToPatients')}
          </Button>
        </Link>

        <Card ref={patientCardRef} data-testid="card-patient-details">
          <CardHeader>
            <CardTitle className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {patient.sex === "M" ? (
                  <UserCircle className="h-6 w-6 text-blue-500" data-testid="icon-sex-male-card" />
                ) : (
                  <UserRound className="h-6 w-6 text-pink-500" data-testid="icon-sex-female-card" />
                )}
                <div>
                  <div data-testid="text-patient-fullname">{patient.surname}, {patient.firstName}</div>
                  <p className="text-sm font-normal mt-1">
                    <span className="text-foreground font-medium" data-testid="text-patient-birthday">{formatDate(patient.birthday)} ({calculateAge(patient.birthday)} years)</span>
                    <span className="text-muted-foreground" data-testid="text-patient-number"> • Patient ID: {patient.patientNumber}</span>
                  </p>
                </div>
              </div>
              {canWrite && (
                <div className="flex items-center gap-2">
                  {addons.questionnaire && (
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setIsSendQuestionnaireOpen(true)}
                      data-testid="button-send-questionnaire"
                      title={t('common.patientCommunication', 'Patient Communication')}
                    >
                      <Send className="h-4 w-4 text-primary" />
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setEditForm({
                        surname: patient.surname,
                        firstName: patient.firstName,
                        birthday: patient.birthday,
                        sex: patient.sex,
                        email: patient.email || "",
                        phone: patient.phone || "",
                        address: patient.address || "",
                        street: (patient as any).street || "",
                        postalCode: (patient as any).postalCode || "",
                        city: (patient as any).city || "",
                        emergencyContact: patient.emergencyContact || "",
                        insuranceProvider: patient.insuranceProvider || "",
                        insuranceNumber: patient.insuranceNumber || "",
                        allergies: patient.allergies || [],
                        otherAllergies: patient.otherAllergies || "",
                        internalNotes: patient.internalNotes || "",
                      });
                      setIsEditDialogOpen(true);
                    }}
                    data-testid="button-edit-patient"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setIsArchiveDialogOpen(true)}
                    data-testid="button-archive-patient"
                    title={t('anesthesia.patientDetail.archivePatient', 'Archive Patient')}
                  >
                    <Archive className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Contact Information */}
            {(patient.email || patient.phone) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">{t('anesthesia.patientDetail.contactInformation')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.email')}</p>
                        <p className="font-medium" data-testid="text-patient-email">{patient.email}</p>
                      </div>
                    </div>
                  )}
                  {patient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.phone')}</p>
                        <p className="font-medium" data-testid="text-patient-phone">{patient.phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Allergies */}
            {((patient.allergies && patient.allergies.length > 0) || patient.otherAllergies) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  {t('anesthesia.patientDetail.allergies')}
                </h3>
                <div className="flex flex-wrap gap-2" data-testid="container-allergies">
                  {patient.allergies?.map((allergyId) => {
                    const allergyItem = anesthesiaSettings?.allergyList?.find(a => a.id === allergyId);
                    const displayLabel = allergyItem?.label || allergyId;
                    return (
                      <Badge key={allergyId} variant="destructive" className="text-xs" data-testid={`badge-allergy-${allergyId}`}>
                        {displayLabel}
                      </Badge>
                    );
                  })}
                  {patient.otherAllergies?.split(',').map((allergy, index) => {
                    const trimmed = allergy.trim();
                    if (!trimmed) return null;
                    return (
                      <Badge key={`other-${index}`} variant="destructive" className="text-xs" data-testid={`badge-other-allergy-${index}`}>
                        {trimmed}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Internal Notes */}
            {patient.internalNotes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <NoteIcon className="h-5 w-5 text-muted-foreground" />
                  {t('anesthesia.patientDetail.internalNotes')}
                </h3>
                <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md" data-testid="text-internal-notes">{patient.internalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>


      {/* Edit Surgery Dialog - Using shared component */}
      <EditSurgeryDialog 
        surgeryId={editingCaseId} 
        onClose={() => setEditingCaseId(null)} 
      />

      {/* Archive Surgery Confirmation Dialog */}
      <AlertDialog open={!!archiveDialogSurgeryId} onOpenChange={(open) => !open && setArchiveDialogSurgeryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.patientDetail.archiveSurgery', 'Archive Surgery?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.patientDetail.archiveSurgeryConfirmation', 'This surgery will be moved to the archive. All associated records will be preserved.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive-surgery">{t('anesthesia.patientDetail.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchiveCase}
              data-testid="button-confirm-archive-surgery"
              disabled={archiveSurgeryMutation.isPending}
            >
              {archiveSurgeryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('anesthesia.patientDetail.archiving', 'Archiving...')}
                </>
              ) : (
                t('anesthesia.patientDetail.archiveSurgery', 'Archive Surgery')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Content Tabs - Notes, Surgeries, Documents, and Invoices */}
      <Tabs defaultValue="notes" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="notes" data-testid="tab-notes">
            <StickyNote className="h-4 w-4 mr-1" />
            {t('anesthesia.patientDetail.notes', 'Notes')}
            {notesTimeline && notesTimeline.length > 0 && (
              <Badge variant="secondary" className="ml-2">{notesTimeline.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="surgeries" data-testid="tab-surgeries">
            {t('anesthesia.patientDetail.surgeries', 'Surgeries')}
            {surgeries && surgeries.length > 0 && (
              <Badge variant="secondary" className="ml-2">{surgeries.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="documents" data-testid="tab-documents">
            {t('anesthesia.patientDetail.documents', 'Documents')}
            {(patientUploads.length + staffDocuments.length + noteAttachmentDocs.length) > 0 && (
              <Badge variant="secondary" className="ml-2">{patientUploads.length + staffDocuments.length + noteAttachmentDocs.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            {t('anesthesia.patientDetail.invoices', 'Invoices')}
            {patientInvoices.length > 0 && (
              <Badge variant="secondary" className="ml-2">{patientInvoices.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Notes Tab - Combined timeline of patient notes and surgery notes */}
        <TabsContent value="notes" className="mt-0 space-y-4">
          {/* Hidden file input for attachments */}
          <input
            type="file"
            ref={noteAttachmentInputRef}
            onChange={handleAttachmentSelect}
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            data-testid="input-note-attachment"
          />
          
          {/* Add New Note */}
          {canWrite && (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2">
                  <Textarea
                    placeholder={t('anesthesia.patientDetail.writeANote', 'Write a note about this patient...')}
                    value={newPatientNote}
                    onChange={(e) => setNewPatientNote(e.target.value)}
                    className="min-h-[80px] flex-1"
                    data-testid="input-new-patient-note"
                  />
                </div>
                
                {/* Pending attachments preview */}
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingAttachments.map((file, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={URL.createObjectURL(file)}
                          alt={file.name}
                          className="h-16 w-16 object-cover rounded border"
                        />
                        <button
                          onClick={() => setPendingAttachments(prev => prev.filter((_, i) => i !== index))}
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCameraOpen(true)}
                    data-testid="button-take-photo"
                  >
                    <Camera className="h-4 w-4 mr-1" />
                    {t('anesthesia.patientDetail.takePhoto', 'Take Photo')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => noteAttachmentInputRef.current?.click()}
                    data-testid="button-attach-file"
                  >
                    <Paperclip className="h-4 w-4 mr-1" />
                    {t('anesthesia.patientDetail.attachFile', 'Attach File')}
                  </Button>
                  <div className="flex-1" />
                  <Button
                    onClick={() => createPatientNoteMutation.mutate({ content: newPatientNote, attachments: pendingAttachments })}
                    disabled={(!newPatientNote.trim() && pendingAttachments.length === 0) || createPatientNoteMutation.isPending}
                    data-testid="button-add-patient-note"
                  >
                    {createPatientNoteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    {t('anesthesia.patientDetail.addNote', 'Add Note')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes Timeline */}
          {isLoadingNotes ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : notesTimeline.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <StickyNote className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>{t('anesthesia.patientDetail.noNotesYet', 'No notes yet')}</p>
                <p className="text-sm">{t('anesthesia.patientDetail.addFirstNote', 'Add the first note to track patient communication or clinical information.')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notesTimeline.map((note) => (
                <Card key={note.id} className={note.type === 'surgery' ? 'border-l-4 border-l-blue-500' : 'border-l-4 border-l-green-500'}>
                  <CardContent className="py-3">
                    <div className="flex items-start gap-3">
                      {/* Icon based on note type */}
                      <div className={`p-2 rounded-full shrink-0 ${note.type === 'surgery' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-green-100 dark:bg-green-900'}`}>
                        {note.type === 'surgery' ? (
                          <Stethoscope className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        ) : (
                          <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        {/* Header with type badge, surgery info, and delete button */}
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <Badge variant={note.type === 'surgery' ? 'default' : 'secondary'} className="text-xs">
                            {note.type === 'surgery' 
                              ? t('anesthesia.patientDetail.surgeryNote', 'Surgery Note')
                              : t('anesthesia.patientDetail.generalNote', 'General Note')
                            }
                          </Badge>
                          {note.surgery && (
                            <span className="text-xs text-muted-foreground">
                              {note.surgery.plannedSurgery} ({new Date(note.surgery.plannedDate).toLocaleDateString()})
                            </span>
                          )}
                          <div className="flex-1" />
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setNoteToDelete({ id: note.id, type: note.type })}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        
                        {/* Note content */}
                        <p className="text-sm whitespace-pre-wrap break-words">{note.content}</p>
                        
                        {/* Attachments section - only show if note has attachments */}
                        {note.attachmentCount > 0 && (() => {
                          const key = `${note.type}-${note.id}`;
                          const attachments = expandedNoteAttachments[key];
                          const isLoading = loadingAttachments[key];
                          
                          return (
                            <div className="mt-2">
                              {!attachments && !isLoading && (
                                <button
                                  onClick={() => fetchNoteAttachments(note.type, note.id)}
                                  className="text-xs text-primary hover:underline flex items-center gap-1"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {t('anesthesia.patientDetail.loadAttachments', 'Load attachments')} ({note.attachmentCount})
                                </button>
                              )}
                              {isLoading && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  {t('common.loading', 'Loading...')}
                                </div>
                              )}
                              {attachments && attachments.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {attachments.map((att) => (
                                    <button
                                      key={att.id}
                                      onClick={() => previewAttachment(att.id)}
                                      className="relative group"
                                    >
                                      <div className="h-12 w-12 bg-muted rounded border flex items-center justify-center hover:bg-muted/80 transition-colors">
                                        <ImageLucide className="h-5 w-5 text-muted-foreground" />
                                      </div>
                                      <span className="absolute bottom-0 left-0 right-0 text-[8px] truncate bg-black/50 text-white px-0.5 rounded-b">
                                        {att.fileName.length > 10 ? att.fileName.slice(0, 10) + '...' : att.fileName}
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                        
                        {/* Footer with author and date */}
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <span>
                            {note.author.firstName || note.author.lastName 
                              ? `${note.author.firstName || ''} ${note.author.lastName || ''}`.trim()
                              : note.author.email || t('anesthesia.patientDetail.unknownAuthor', 'Unknown')
                            }
                          </span>
                          <span>•</span>
                          <span>{new Date(note.createdAt).toLocaleString()}</span>
                          {note.updatedAt && note.updatedAt !== note.createdAt && (
                            <>
                              <span>•</span>
                              <span className="italic">{t('anesthesia.patientDetail.edited', 'edited')}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          
          {/* Image Preview Modal */}
          {previewImage && (
            <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
              <DialogContent className="max-w-3xl">
                <DialogHeader>
                  <DialogTitle>{previewImage.fileName}</DialogTitle>
                </DialogHeader>
                <div className="flex justify-center">
                  <img
                    src={previewImage.url}
                    alt={previewImage.fileName}
                    className="max-h-[70vh] object-contain rounded"
                  />
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* Delete Note Confirmation Dialog */}
          <AlertDialog open={!!noteToDelete} onOpenChange={(open) => !open && setNoteToDelete(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('anesthesia.patientDetail.deleteNote', 'Delete Note')}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t('anesthesia.patientDetail.deleteNoteConfirm', 'Are you sure you want to delete this note? This action cannot be undone.')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-note">
                  {t('common.cancel', 'Cancel')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => noteToDelete && deleteNoteMutation.mutate(noteToDelete)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete-note"
                >
                  {deleteNoteMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {t('common.deleting', 'Deleting...')}
                    </>
                  ) : (
                    t('common.delete', 'Delete')
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="surgeries" className="mt-0 space-y-4">
          {/* New Surgery Button */}
          {canManageSurgeries && (
            <div className="flex justify-end">
              <Dialog open={isCreateCaseOpen} onOpenChange={setIsCreateCaseOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2" data-testid="button-create-case">
                    <Plus className="h-4 w-4" />
                    {t('anesthesia.patientDetail.newSurgery')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{t('anesthesia.patientDetail.createNewSurgery')}</DialogTitle>
                    <DialogDescription>{t('anesthesia.patientDetail.createNewSurgeryDesc')}</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>{t('anesthesia.patientDetail.plannedSurgery')}</Label>
                      <Popover open={chopSearchOpen} onOpenChange={setChopSearchOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={chopSearchOpen}
                            className="w-full justify-between h-auto min-h-10 text-left font-normal"
                            data-testid="select-planned-surgery"
                          >
                            {newCase.plannedSurgery ? (
                              <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                                <span className="text-sm whitespace-normal text-left">{newCase.plannedSurgery}</span>
                                {newCase.chopCode && (
                                  <span className="text-xs text-muted-foreground">CHOP: {newCase.chopCode}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">
                                {t('anesthesia.patientDetail.plannedSurgeryPlaceholder')}
                              </span>
                            )}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[450px] p-0" align="start">
                          <Command shouldFilter={false}>
                            <CommandInput 
                              placeholder={t('anesthesia.editSurgery.searchChop', 'Search CHOP procedures...')}
                              value={chopSearchTerm}
                              onValueChange={setChopSearchTerm}
                              data-testid="input-chop-search-patient"
                            />
                            <CommandList className="max-h-[300px] overflow-y-auto">
                              {chopSearchTerm.length < 2 ? (
                                <CommandEmpty className="py-4 px-2 text-center text-sm text-muted-foreground">
                                  {t('anesthesia.editSurgery.minCharsRequired', 'Type at least 2 characters')}
                                </CommandEmpty>
                              ) : isLoadingChop ? (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </div>
                              ) : chopProcedures.length === 0 ? (
                                <CommandEmpty>
                                  <div className="py-2 px-2 space-y-2">
                                    <p className="text-sm">{t('anesthesia.editSurgery.noChopFound', 'No CHOP procedures found')}</p>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full"
                                      onClick={() => {
                                        setNewCase({ ...newCase, plannedSurgery: chopSearchTerm, chopCode: '' });
                                        setChopSearchOpen(false);
                                      }}
                                      data-testid="button-use-custom-surgery-patient"
                                    >
                                      {t('anesthesia.editSurgery.useCustom', `Use "${chopSearchTerm}"`).replace('{term}', chopSearchTerm)}
                                    </Button>
                                  </div>
                                </CommandEmpty>
                              ) : (
                                <CommandGroup>
                                  {chopProcedures.map((proc) => (
                                    <CommandItem
                                      key={proc.id}
                                      value={proc.code}
                                      onSelect={() => {
                                        setNewCase({ ...newCase, plannedSurgery: proc.descriptionDe, chopCode: proc.code });
                                        setChopSearchOpen(false);
                                      }}
                                      className="flex flex-col items-start gap-0.5 cursor-pointer"
                                      data-testid={`chop-option-patient-${proc.code}`}
                                    >
                                      <div className="flex items-center gap-2 w-full">
                                        <Check
                                          className={cn(
                                            "h-4 w-4 shrink-0",
                                            newCase.chopCode === proc.code ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{proc.code}</span>
                                            {proc.laterality && (
                                              <span className="text-xs text-muted-foreground">({proc.laterality})</span>
                                            )}
                                          </div>
                                          <p className="text-sm whitespace-normal break-words">{proc.descriptionDe}</p>
                                        </div>
                                      </div>
                                    </CommandItem>
                                  ))}
                                  {chopSearchTerm.length >= 2 && (
                                    <CommandItem
                                      value="__custom__"
                                      onSelect={() => {
                                        setNewCase({ ...newCase, plannedSurgery: chopSearchTerm, chopCode: '' });
                                        setChopSearchOpen(false);
                                      }}
                                      className="border-t mt-1 pt-2"
                                      data-testid="chop-option-patient-custom"
                                    >
                                      <Check className="h-4 w-4 shrink-0 opacity-0" />
                                      <span className="text-sm text-muted-foreground">
                                        {t('anesthesia.editSurgery.useAsCustom', `Use as custom: "${chopSearchTerm}"`).replace('{term}', chopSearchTerm)}
                                      </span>
                                    </CommandItem>
                                  )}
                                </CommandGroup>
                              )}
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="surgeon">{t('anesthesia.patientDetail.surgeon')} <span className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.optional')}</span></Label>
                      <Select 
                        value={newCase.surgeonId || "none"} 
                        onValueChange={(value) => {
                          if (value === "none") {
                            setNewCase({ ...newCase, surgeon: "", surgeonId: "" });
                          } else {
                            const selectedSurgeon = surgeons.find(s => s.id === value);
                            setNewCase({ 
                              ...newCase, 
                              surgeon: selectedSurgeon?.name || "", 
                              surgeonId: value 
                            });
                          }
                        }}
                        disabled={isLoadingSurgeons}
                      >
                        <SelectTrigger data-testid="select-surgeon">
                          <SelectValue placeholder={isLoadingSurgeons ? t('anesthesia.patientDetail.loadingSurgeons') : t('anesthesia.patientDetail.selectSurgeonOptional')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground italic">{t('anesthesia.patientDetail.noSurgeonSelected')}</span>
                          </SelectItem>
                          {isLoadingSurgeons ? (
                            <SelectItem value="loading" disabled>
                              {t('anesthesia.patientDetail.loadingSurgeons')}
                            </SelectItem>
                          ) : surgeons.length === 0 ? (
                            <SelectItem value="no-surgeons" disabled>
                              {t('anesthesia.patientDetail.noSurgeonsAvailable')}
                            </SelectItem>
                          ) : (
                            surgeons.map((surgeon) => (
                              <SelectItem key={surgeon.id} value={surgeon.id}>
                                {surgeon.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="surgery-room">{t('anesthesia.patientDetail.surgeryRoom')} <span className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.optional')}</span></Label>
                      <Select 
                        value={newCase.surgeryRoomId || "none"} 
                        onValueChange={(value) => setNewCase({ ...newCase, surgeryRoomId: value === "none" ? "" : value })}
                        disabled={isLoadingSurgeryRooms}
                      >
                        <SelectTrigger data-testid="select-surgery-room">
                          <SelectValue placeholder={isLoadingSurgeryRooms ? t('anesthesia.patientDetail.loadingRooms') : t('anesthesia.patientDetail.selectSurgeryRoomOptional')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground italic">{t('anesthesia.patientDetail.noRoomSelected')}</span>
                          </SelectItem>
                          {isLoadingSurgeryRooms ? (
                            <SelectItem value="loading" disabled>
                              {t('anesthesia.patientDetail.loadingRooms')}
                            </SelectItem>
                          ) : surgeryRooms.length === 0 ? (
                            <SelectItem value="no-rooms" disabled>
                              {t('anesthesia.patientDetail.noSurgeryRoomsAvailable')}
                            </SelectItem>
                          ) : (
                            surgeryRooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                {room.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="date">{t('anesthesia.patientDetail.plannedDate')}</Label>
                      <Input
                        id="date"
                        type="datetime-local"
                        value={newCase.plannedDate}
                        onChange={(e) => setNewCase({ ...newCase, plannedDate: e.target.value })}
                        data-testid="input-planned-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration">{t('anesthesia.patientDetail.duration')}</Label>
                      <Input
                        id="duration"
                        type="number"
                        min="1"
                        value={newCase.duration}
                        onChange={(e) => setNewCase({ ...newCase, duration: parseInt(e.target.value) || 0 })}
                        data-testid="input-duration"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="notes">{t('anesthesia.patientDetail.notes')} <span className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.optional')}</span></Label>
                      <Textarea
                        id="notes"
                        placeholder={t('anesthesia.patientDetail.notesPlaceholder')}
                        value={newCase.notes}
                        onChange={(e) => setNewCase({ ...newCase, notes: e.target.value })}
                        data-testid="textarea-notes"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center space-x-2 pt-2">
                      <Checkbox
                        id="new-no-preop-required"
                        checked={newCase.noPreOpRequired}
                        onCheckedChange={(checked) => setNewCase({ ...newCase, noPreOpRequired: checked === true })}
                        data-testid="checkbox-new-no-preop-required"
                      />
                      <Label 
                        htmlFor="new-no-preop-required" 
                        className="text-sm font-normal cursor-pointer"
                      >
                        {t('anesthesia.surgery.noAnesthesia', 'Without Anesthesia (local anesthesia only)')}
                      </Label>
                    </div>
                    <Button 
                      onClick={handleCreateCase} 
                      className="w-full" 
                      data-testid="button-submit-case"
                      disabled={createSurgeryMutation.isPending}
                    >
                      {createSurgeryMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('anesthesia.patientDetail.creating')}
                        </>
                      ) : (
                        t('anesthesia.patientDetail.createSurgery')
                      )}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {isLoadingSurgeries ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-surgeries" />
                  <p className="text-muted-foreground">Loading surgeries...</p>
                </div>
              </CardContent>
            </Card>
          ) : surgeries && surgeries.length > 0 ? (
            <div className="space-y-4">
              {surgeries.map((surgery) => (
            <Card 
              key={surgery.id} 
              data-testid={`card-case-${surgery.id}`}
            >
              <CardContent className="pt-6 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold text-lg">{surgery.plannedSurgery}</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={getStatusColor(surgery.status)}>
                      {surgery.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDownloadPDF(surgery)}
                      data-testid={`button-download-pdf-${surgery.id}`}
                      title="Download Complete Record PDF"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    {canManageSurgeries && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEditCase(surgery)}
                          data-testid={`button-edit-surgery-${surgery.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setArchiveDialogSurgeryId(surgery.id)}
                          data-testid={`button-archive-surgery-${surgery.id}`}
                          title={t('anesthesia.patientDetail.archiveSurgery', 'Archive Surgery')}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t('anesthesia.patientDetail.surgery')}</p>
                    <p className="font-medium">{surgery.plannedSurgery}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('anesthesia.patientDetail.surgeon')}</p>
                    <p className="font-medium">{surgery.surgeon || t('anesthesia.patientDetail.notAssigned')}</p>
                    {surgery.surgeonId && (() => {
                      const surgeonData = surgeons.find(s => s.id === surgery.surgeonId);
                      return surgeonData?.phone ? (
                        <p className="text-sm text-muted-foreground">{surgeonData.phone}</p>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('anesthesia.patientDetail.room')}</p>
                    <p className="font-medium">
                      {surgery.surgeryRoomId 
                        ? surgeryRooms.find(r => r.id === surgery.surgeryRoomId)?.name || surgery.surgeryRoomId
                        : t('anesthesia.patientDetail.notAssigned')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t('anesthesia.patientDetail.plannedDate')}</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(surgery.plannedDate)}
                    </p>
                  </div>
                </div>

                {surgery.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-sm mb-1">Notes</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid={`text-notes-${surgery.id}`}>{surgery.notes}</p>
                  </div>
                )}

                {/* Surgery detail navigation - hidden for clinic users */}
                {canViewSurgeryDetails && (
                  isSurgeryModule ? (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex-col gap-2"
                        onClick={() => setLocation(`/surgery/preop/${surgery.id}`)}
                        data-testid={`button-surgery-preop-${surgery.id}`}
                      >
                        <ClipboardList className="h-10 w-10 text-primary" />
                        <span className="text-sm font-medium">{t('surgery.preop.title')}</span>
                      </Button>
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex-col gap-2"
                        onClick={() => setLocation(`${moduleBasePath}/op/${surgery.id}`)}
                        data-testid={`button-surgery-doc-${surgery.id}`}
                      >
                        <FileText className="h-10 w-10 text-primary" />
                        <span className="text-sm font-medium">{t('anesthesia.patientDetail.surgeryDocumentation')}</span>
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <Button
                        variant="outline"
                        className="h-auto py-4 flex-col gap-2"
                        onClick={() => {
                          setSelectedCaseId(surgery.id);
                          setAssessmentData(prev => ({
                            ...prev,
                            allergies: patient.allergies || [],
                          }));
                          preOpOpenedViaUrl.current = false;
                          setIsPreOpOpen(true);
                        }}
                        data-testid={`button-preop-${surgery.id}`}
                      >
                        <ClipboardList className="h-10 w-10 text-primary" />
                        <span className="text-sm font-medium">{t('anesthesia.patientDetail.preOp')}</span>
                      </Button>
                      
                      <AnesthesiaRecordButton surgeryId={surgery.id} />
                    </div>
                  )
                )}
              </CardContent>
            </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <FileText className="h-12 w-12 text-muted-foreground" data-testid="icon-no-surgeries" />
                  <p className="text-foreground font-semibold" data-testid="text-no-surgeries">No surgeries found</p>
                  <p className="text-sm text-muted-foreground">This patient has no scheduled surgeries yet.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-0">
          <div className="space-y-6">
            {/* Staff Documents Section - Using PatientDocumentsSection component with list/grid toggle */}
            {patient && activeHospital && (
              <PatientDocumentsSection
                patientId={patient.id}
                hospitalId={activeHospital.id}
                canWrite={canWrite}
                variant="card"
                onPreview={(url, fileName, mimeType) => {
                  setPreviewDocument({
                    id: 'preview',
                    fileName,
                    mimeType: mimeType || 'application/octet-stream',
                    url,
                  });
                }}
              />
            )}

            {/* Note Attachments Section */}
            {noteAttachmentDocs.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    {t('anesthesia.patientDetail.noteAttachments', 'Note Attachments')}
                    <Badge variant="outline" className="ml-2">{noteAttachmentDocs.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t('anesthesia.patientDetail.noteAttachmentsDesc', 'Files attached to patient and surgery notes.')}
                  </p>
                </CardHeader>
                <CardContent>
                  {isLoadingNoteAttachments ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {noteAttachmentDocs.map((att) => {
                        const isImage = att.mimeType?.startsWith('image/');
                        return (
                          <div 
                            key={att.id}
                            className="flex flex-col p-4 border rounded-lg hover:bg-muted/50 transition-colors group relative cursor-pointer"
                            onClick={() => previewAttachment(att.id)}
                            data-testid={`note-attachment-doc-${att.id}`}
                          >
                            {isImage ? (
                              <div className="w-full h-40 mb-3 overflow-hidden rounded bg-muted flex items-center justify-center">
                                <ImageLucide className="h-16 w-16 text-muted-foreground" />
                              </div>
                            ) : (
                              <div className="w-full h-40 mb-3 flex items-center justify-center bg-muted rounded">
                                <FileText className="h-16 w-16 text-muted-foreground" />
                              </div>
                            )}
                            <div className="space-y-2">
                              <p className="font-medium truncate group-hover:text-primary transition-colors">
                                {att.fileName}
                              </p>
                              <div className="flex items-center gap-2 text-sm">
                                <Badge variant="secondary" className="text-xs">
                                  {att.noteType === 'patient' 
                                    ? t('anesthesia.patientDetail.generalNote', 'General Note')
                                    : t('anesthesia.patientDetail.surgeryNote', 'Surgery Note')
                                  }
                                </Badge>
                                {att.fileSize && (
                                  <span className="text-muted-foreground">{(att.fileSize / 1024).toFixed(1)} KB</span>
                                )}
                              </div>
                              {att.noteContent && (
                                <p className="text-sm text-muted-foreground line-clamp-2">{att.noteContent}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                {new Date(att.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Patient Questionnaire Uploads Section */}
            {patientUploads.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {t('anesthesia.patientDetail.patientDocuments', 'Patient Documents')}
                    <Badge variant="outline" className="ml-2">{patientUploads.length}</Badge>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {t('anesthesia.patientDetail.patientDocumentsDesc', 'Files uploaded by the patient through the online questionnaire.')}
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {patientUploads.map((upload) => {
                      const isImage = upload.mimeType?.startsWith('image/');
                      const categoryLabels: Record<string, string> = {
                        medication_list: t('anesthesia.patientDetail.uploadCategoryMedication', 'Medication List'),
                        diagnosis: t('anesthesia.patientDetail.uploadCategoryDiagnosis', 'Diagnosis'),
                        exam_result: t('anesthesia.patientDetail.uploadCategoryExamResult', 'Exam Result'),
                        consent: t('anesthesia.patientDetail.uploadCategoryConsent', 'Consent Form'),
                        lab_result: t('anesthesia.patientDetail.uploadCategoryLabResult', 'Lab Result'),
                        imaging: t('anesthesia.patientDetail.uploadCategoryImaging', 'Imaging'),
                        referral: t('anesthesia.patientDetail.uploadCategoryReferral', 'Referral'),
                        external_report: t('anesthesia.patientDetail.uploadCategoryExternalReport', 'External Report'),
                        other: t('anesthesia.patientDetail.uploadCategoryOther', 'Other'),
                      };
                      const fileStreamUrl = `/api/questionnaire/uploads/${upload.id}/file?hospital_id=${activeHospital?.id}`;
                      return (
                        <div 
                          key={upload.id}
                          className="flex flex-col p-4 border rounded-lg hover:bg-muted/50 transition-colors group relative"
                          data-testid={`document-upload-${upload.id}`}
                        >
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 hover:bg-destructive hover:text-destructive-foreground z-10"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPatientUploadToDelete(upload);
                              }}
                              data-testid={`button-delete-patient-upload-${upload.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <div 
                            className="cursor-pointer"
                            onClick={() => {
                              setPreviewDocument({
                                id: upload.id,
                                fileName: upload.fileName,
                                mimeType: upload.mimeType || '',
                                url: fileStreamUrl,
                              });
                            }}
                          >
                          {isImage ? (
                            <div className="w-full h-40 mb-3 overflow-hidden rounded bg-muted">
                              <img 
                                src={fileStreamUrl} 
                                alt={upload.fileName}
                                className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                  const parent = target.parentElement;
                                  if (parent) {
                                    parent.innerHTML = '<div class="w-full h-full flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-muted-foreground"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg></div>';
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-full h-40 mb-3 flex items-center justify-center bg-muted rounded">
                              <FileText className="h-16 w-16 text-muted-foreground" />
                            </div>
                          )}
                          <div className="space-y-2">
                            <p className="font-medium truncate group-hover:text-primary transition-colors">
                              {upload.fileName}
                            </p>
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                              <Badge variant="secondary">
                                {categoryLabels[upload.category] || upload.category}
                              </Badge>
                              {upload.fileSize && (
                                <span>{(upload.fileSize / 1024).toFixed(1)} KB</span>
                              )}
                            </div>
                            {upload.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">{upload.description}</p>
                            )}
                          </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="invoices" className="mt-0">
          {isLoadingInvoices ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-invoices" />
                  <p className="text-muted-foreground">{t('anesthesia.patientDetail.loadingInvoices', 'Loading invoices...')}</p>
                </div>
              </CardContent>
            </Card>
          ) : patientInvoices.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  {t('anesthesia.patientDetail.patientInvoices', 'Patient Invoices')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('anesthesia.patientDetail.patientInvoicesDesc', 'Invoices issued for this patient.')}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {patientInvoices.map((invoice) => {
                    const statusColors: Record<string, string> = {
                      draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
                      sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
                      paid: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
                      cancelled: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
                    };
                    return (
                      <div 
                        key={invoice.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`invoice-item-${invoice.id}`}
                      >
                        <div className="flex items-center gap-4">
                          <Receipt className="h-8 w-8 text-muted-foreground" />
                          <div>
                            <p className="font-medium">
                              {t('anesthesia.patientDetail.invoiceNumber', 'Invoice #{{number}}', { number: invoice.invoiceNumber })}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(invoice.date)} • {invoice.customerName}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold">CHF {parseFloat(invoice.total).toFixed(2)}</p>
                            <Badge className={statusColors[invoice.status] || statusColors.draft}>
                              {t(`anesthesia.patientDetail.invoiceStatus.${invoice.status}`, invoice.status)}
                            </Badge>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setLocation(`/clinic/invoices/${invoice.id}`)}
                            data-testid={`button-view-invoice-${invoice.id}`}
                          >
                            {t('common.view', 'View')}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="flex flex-col items-center gap-3">
                  <Receipt className="h-12 w-12 text-muted-foreground" data-testid="icon-no-invoices" />
                  <p className="text-foreground font-semibold" data-testid="text-no-invoices">
                    {t('anesthesia.patientDetail.noInvoices', 'No invoices found')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t('anesthesia.patientDetail.noInvoicesDesc', 'Invoices for this patient will appear here once created.')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Pre-OP Full Screen Dialog */}
      <Dialog open={isPreOpOpen} onOpenChange={(open) => {
        if (!open) {
          // Clear document preview when closing dialog
          setPreviewDocument(null);
          // If in direct pre-op route mode, navigate back to pre-op list
          if (isPreOpRoute) {
            setLocation('/anesthesia/preop');
          } else if (preOpOpenedViaUrl.current && window.history.length > 1) {
            // If opened via URL navigation, use history.back() to return to previous page
            window.history.back();
          } else {
            // If opened via button click, just close the dialog
            setIsPreOpOpen(false);
          }
        } else {
          setIsPreOpOpen(open);
        }
      }}>
        <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden">
          <DialogHeader className="p-4 md:p-6 pb-4 shrink-0 relative">
            <DialogDescription className="sr-only">Pre-operative assessment and informed consent forms</DialogDescription>
            <div className="flex items-center justify-between mb-4 pr-10">
              <DialogTitle className="text-lg md:text-2xl">Pre-Operative Assessment</DialogTitle>
              <div className="flex items-center gap-1 absolute right-2 top-2 md:right-4 md:top-4 z-10">
                {existingAssessment && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDownloadPreOpPDF}
                    disabled={isDownloadingPreOpPdf}
                    data-testid="button-download-preop-pdf"
                    title={t('anesthesia.patientDetail.downloadPreOpPdf', 'Download Pre-Op PDF')}
                  >
                    {isDownloadingPreOpPdf ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Download className="h-5 w-5" />
                    )}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSendQuestionnaireOpen(true)}
                  data-testid="button-preop-communication"
                  title={t('common.patientCommunication', 'Patient Communication')}
                >
                  <Send className="h-5 w-5 text-primary" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    // If in direct pre-op route mode, navigate back to pre-op list
                    if (isPreOpRoute) {
                      setLocation('/anesthesia/preop');
                    } else if (preOpOpenedViaUrl.current && window.history.length > 1) {
                      // If opened via URL navigation, use history.back() to return to previous page
                      window.history.back();
                    } else {
                      // If opened via button click, just close the dialog
                      setIsPreOpOpen(false);
                    }
                  }}
                  data-testid="button-close-preop-dialog"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {patient.sex === "M" ? (
                <UserCircle className="h-8 w-8 text-blue-500" data-testid="icon-preop-sex-male" />
              ) : (
                <UserRound className="h-8 w-8 text-pink-500" data-testid="icon-preop-sex-female" />
              )}
              <div className="text-left flex-1">
                <p className="font-semibold text-base text-left" data-testid="text-preop-patient-name">{patient.surname}, {patient.firstName}</p>
                <p className="text-xs text-muted-foreground text-left" data-testid="text-preop-patient-info">
                  {formatDate(patient.birthday)} ({calculateAge(patient.birthday)} y) • ID: {patient.patientNumber}
                </p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {patient.phone && (
                    <a href={`tel:${patient.phone}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1" data-testid="text-preop-patient-phone">
                      <Phone className="h-3 w-3" />
                      {patient.phone}
                    </a>
                  )}
                  {patient.email && (
                    <a href={`mailto:${patient.email}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1" data-testid="text-preop-patient-email">
                      <Mail className="h-3 w-3" />
                      {patient.email}
                    </a>
                  )}
                  {!patient.phone && !patient.email && (
                    <span className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.noContactInfo')}</span>
                  )}
                  {!isPreOpReadOnly && (
                    <Popover open={isQuickContactOpen} onOpenChange={(open) => {
                      setIsQuickContactOpen(open);
                      if (open) {
                        setQuickContactForm({
                          email: patient.email || "",
                          phone: patient.phone || "",
                        });
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 ml-1"
                          data-testid="button-quick-contact-edit"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-72 p-4" align="start">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">{t('anesthesia.patientDetail.quickContactEdit')}</h4>
                          <div className="space-y-2">
                            <Label htmlFor="quick-phone" className="text-xs">{t('anesthesia.patientDetail.phone')}</Label>
                            <PhoneInputWithCountry
                              id="quick-phone"
                              value={quickContactForm.phone}
                              onChange={(value) => setQuickContactForm(prev => ({ ...prev, phone: value }))}
                              placeholder={t('anesthesia.patientDetail.enterPhone')}
                              className="h-8 text-sm"
                              data-testid="input-quick-phone"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="quick-email" className="text-xs">{t('anesthesia.patientDetail.email')}</Label>
                            <Input
                              id="quick-email"
                              type="email"
                              value={quickContactForm.email}
                              onChange={(e) => setQuickContactForm(prev => ({ ...prev, email: e.target.value }))}
                              placeholder={t('anesthesia.patientDetail.enterEmail')}
                              className="h-8 text-sm"
                              data-testid="input-quick-email"
                            />
                          </div>
                          <div className="flex gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsQuickContactOpen(false)}
                              className="flex-1"
                              data-testid="button-quick-contact-cancel"
                            >
                              {t('common.cancel')}
                            </Button>
                            <Button
                              size="sm"
                              onClick={handleQuickContactSave}
                              disabled={isQuickContactSaving}
                              className="flex-1"
                              data-testid="button-quick-contact-save"
                            >
                              {isQuickContactSaving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                t('common.save')
                              )}
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>
          
          {/* Mobile Document Preview Overlay - shown on small screens */}
          {previewDocument && (
            <div className="lg:hidden fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-medium truncate">{previewDocument.fileName}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => window.open(previewDocument.url, '_blank')}
                    title={t('common.openInNewTab', 'Open in new tab')}
                    data-testid="button-mobile-open-document-new-tab"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPreviewDocument(null)}
                    title={t('common.close', 'Close')}
                    data-testid="button-mobile-close-document-preview"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-2">
                {previewDocument.mimeType?.startsWith('image/') ? (
                  <img 
                    src={previewDocument.url}
                    alt={previewDocument.fileName}
                    className="w-full h-full object-contain"
                    data-testid="mobile-preview-image"
                  />
                ) : previewDocument.mimeType === 'application/pdf' ? (
                  <iframe
                    src={previewDocument.url}
                    className="w-full h-full border-0 rounded"
                    title={previewDocument.fileName}
                    data-testid="mobile-preview-pdf"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('anesthesia.patientDetail.previewNotAvailable', 'Preview not available for this file type')}</p>
                      <Button 
                        variant="outline" 
                        className="mt-4"
                        onClick={() => window.open(previewDocument.url, '_blank')}
                        data-testid="button-mobile-download-document"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t('common.download', 'Download')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
            <ResizablePanel defaultSize={previewDocument ? 60 : 100} minSize={40}>
              <Tabs defaultValue="assessment" className="h-full flex flex-col">
            <div className="px-6 shrink-0">
              <div className="mb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="assessment" data-testid="tab-assessment">{t('anesthesia.patientDetail.preOpAssessment')}</TabsTrigger>
                  <TabsTrigger value="consent" data-testid="tab-consent">{t('anesthesia.patientDetail.informedConsent')}</TabsTrigger>
                </TabsList>
              </div>
            </div>
            
            <TabsContent value="assessment" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
              {/* Read-only banner for guests */}
              {isPreOpReadOnly && (
                <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-200">{t('common.viewOnlyMode')}</p>
                    <p className="text-sm text-amber-600 dark:text-amber-400">{t('common.viewOnlyModeDescription')}</p>
                  </div>
                </div>
              )}
              <div className="flex justify-between items-center mb-2">
                <div className="flex gap-2">
                  {!isPreOpReadOnly && submittedQuestionnaires.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsImportQuestionnaireOpen(true)}
                      className="gap-2"
                      data-testid="button-import-questionnaire"
                    >
                      <Import className="h-4 w-4" />
                      {t('anesthesia.patientDetail.importFromQuestionnaire')}
                      <Badge variant="secondary" className="ml-1">{submittedQuestionnaires.length}</Badge>
                    </Button>
                  )}
                  {!isPreOpReadOnly && submittedQuestionnaires.length === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsFindQuestionnaireOpen(true)}
                      className="gap-2"
                      data-testid="button-find-questionnaire"
                    >
                      <ClipboardList className="h-4 w-4" />
                      {t('anesthesia.patientDetail.findQuestionnaire', 'Find & Associate Questionnaire')}
                    </Button>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSectionIds = ["general", "medications", "heart", "lungs", "gi-kidney-metabolic", "neuro-psych-skeletal", "coagulation-infectious", "woman", "noxen", "children", "anesthesia"];
                    const filledSections = allSectionIds.filter(id => {
                      if (id === "general") return hasGeneralData();
                      if (id === "medications") return hasMedicationsData();
                      if (id === "heart") return hasHeartData();
                      if (id === "lungs") return hasLungData();
                      if (id === "gi-kidney-metabolic") return hasGIKidneyMetabolicData();
                      if (id === "neuro-psych-skeletal") return hasNeuroPsychSkeletalData();
                      if (id === "coagulation-infectious") return hasCoagulationInfectiousData();
                      if (id === "woman") return hasWomanData();
                      if (id === "noxen") return hasNoxenData();
                      if (id === "children") return hasChildrenData();
                      if (id === "anesthesia") return hasAnesthesiaData();
                      return false;
                    });
                    
                    if (openSections.length > 0) {
                      setOpenSections([]);
                    } else {
                      setOpenSections(filledSections.length > 0 ? filledSections : allSectionIds);
                    }
                  }}
                  className="gap-2"
                  data-testid="button-toggle-all"
                >
                  {openSections.length > 0 ? (
                    <>
                      <ChevronUp className="h-4 w-4" />
                      {t('anesthesia.patientDetail.collapseAll')}
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      {t('anesthesia.patientDetail.expandAll')}
                    </>
                  )}
                </Button>
              </div>

              {/* Planned Surgery Card (Non-collapsible) */}
              <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-primary">{t('anesthesia.patientDetail.plannedSurgeryInformation')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.patientDetail.plannedSurgery')}</p>
                      <p className="font-semibold text-base">{surgeries?.find(s => s.id === selectedCaseId)?.plannedSurgery || selectedCaseId}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.patientDetail.surgeon')}</p>
                      <p className="font-semibold text-base">{surgeries?.find(s => s.id === selectedCaseId)?.surgeon || t('anesthesia.patientDetail.notAssigned')}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.patientDetail.plannedDate')}</p>
                      <p className="font-semibold text-base">
                        {(() => {
                          const plannedDate = surgeries?.find(s => s.id === selectedCaseId)?.plannedDate;
                          if (!plannedDate) return t('anesthesia.patientDetail.notScheduled');
                          return formatDate(plannedDate);
                        })()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Accordion 
                type="multiple" 
                value={openSections} 
                onValueChange={setOpenSections}
                className="space-y-4"
              >
                {/* General Data Section */}
                <AccordionItem value="general">
                  <Card className={hasGeneralData() || hasAllergiesData() ? "border-white dark:border-white" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{t('anesthesia.patientDetail.generalData')}</CardTitle>
                        {hasAllergiesData() && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            {t('anesthesia.patientDetail.allergies')}
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="space-y-4 pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>{t('anesthesia.patientDetail.heightCm')}</Label>
                            <Input
                              type="number"
                              value={assessmentData.height}
                              onChange={(e) => setAssessmentData({...assessmentData, height: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.enterHeight')}
                              disabled={isPreOpReadOnly}
                              data-testid="input-height"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('anesthesia.patientDetail.weightKg')}</Label>
                            <Input
                              type="number"
                              value={assessmentData.weight}
                              onChange={(e) => setAssessmentData({...assessmentData, weight: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.enterWeight')}
                              disabled={isPreOpReadOnly}
                              data-testid="input-weight"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{t('anesthesia.patientDetail.bmi')}</Label>
                            <Input
                              type="text"
                              value={assessmentData.height && assessmentData.weight ? 
                                (parseFloat(assessmentData.weight) / Math.pow(parseFloat(assessmentData.height) / 100, 2)).toFixed(1) : 
                                ''
                              }
                              readOnly
                              placeholder={t('anesthesia.patientDetail.autoCalculated')}
                              className="bg-muted"
                              data-testid="input-bmi"
                            />
                          </div>
                        </div>
                        <div className={`space-y-4 p-4 rounded-lg border ${hasAllergiesData() ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700" : "border-muted"}`}>
                          <Label className={`text-base font-semibold ${hasAllergiesData() ? "text-red-700 dark:text-red-300" : ""}`}>
                            {t('anesthesia.patientDetail.allergies')}
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                              <Badge
                                key={allergy.id}
                                variant={assessmentData.allergies.includes(allergy.id) ? "destructive" : "outline"}
                                className="cursor-pointer"
                                onClick={() => {
                                  if (isPreOpReadOnly) return;
                                  if (assessmentData.allergies.includes(allergy.id)) {
                                    setAssessmentData({...assessmentData, allergies: assessmentData.allergies.filter(a => a !== allergy.id)});
                                  } else {
                                    setAssessmentData({...assessmentData, allergies: [...assessmentData.allergies, allergy.id]});
                                  }
                                }}
                                data-testid={`badge-allergy-${allergy.id}`}
                              >
                                {allergy.label}
                              </Badge>
                            ))}
                          </div>
                          <div className="space-y-2">
                            <Label>{t('anesthesia.patientDetail.otherAllergies', 'Other Allergies')}</Label>
                            <Textarea
                              value={assessmentData.allergiesOther}
                              onChange={(e) => setAssessmentData({...assessmentData, allergiesOther: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.otherAllergiesPlaceholder')}
                              rows={2}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-allergies-other"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('anesthesia.patientDetail.cave')}</Label>
                          <Input
                            value={assessmentData.cave}
                            onChange={(e) => setAssessmentData({...assessmentData, cave: e.target.value})}
                            placeholder={t('anesthesia.patientDetail.cavePlaceholder')}
                            disabled={isPreOpReadOnly}
                            data-testid="input-cave"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>{t('anesthesia.patientDetail.asaClassification')}</Label>
                          <Select
                            value={assessmentData.asa}
                            onValueChange={(value) => setAssessmentData({...assessmentData, asa: value})}
                            disabled={isPreOpReadOnly}
                          >
                            <SelectTrigger data-testid="select-asa">
                              <SelectValue placeholder={t('anesthesia.patientDetail.selectASAClass')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="I">{t('anesthesia.patientDetail.asaI')}</SelectItem>
                              <SelectItem value="II">{t('anesthesia.patientDetail.asaII')}</SelectItem>
                              <SelectItem value="III">{t('anesthesia.patientDetail.asaIII')}</SelectItem>
                              <SelectItem value="IV">{t('anesthesia.patientDetail.asaIV')}</SelectItem>
                              <SelectItem value="V">{t('anesthesia.patientDetail.asaV')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>{t('anesthesia.patientDetail.specialNotes')}</Label>
                          <Textarea
                            value={assessmentData.specialNotes}
                            onChange={(e) => setAssessmentData({...assessmentData, specialNotes: e.target.value})}
                            placeholder={t('anesthesia.patientDetail.specialNotesPlaceholder')}
                            rows={3}
                            disabled={isPreOpReadOnly}
                            data-testid="textarea-special-notes"
                          />
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Patient Documents Section - All Documents with List/Grid Toggle and Upload */}
                {patient && activeHospital && (
                  <PatientDocumentsSection
                    patientId={patient.id}
                    hospitalId={activeHospital.id}
                    canWrite={!isPreOpReadOnly}
                    variant="accordion"
                    defaultExpanded={false}
                    onPreview={(url, fileName, mimeType) => {
                      setPreviewDocument({
                        id: 'preview',
                        fileName,
                        mimeType: mimeType || 'application/octet-stream',
                        url,
                      });
                    }}
                  />
                )}

                {/* Medications Section */}
                <AccordionItem value="medications">
                  <Card className={hasMedicationsData() ? "border-purple-400 dark:border-purple-600" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-medications">
                      <CardTitle className={`text-lg ${hasMedicationsData() ? "text-purple-600 dark:text-purple-400" : ""}`}>
                        {t('anesthesia.patientDetail.medications')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anticoagulationMedications')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {anticoagulationMedications.map((medication) => (
                                    <div key={medication.id} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`anticoag-${medication.id}`}
                                        checked={assessmentData.anticoagulationMeds.includes(medication.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setAssessmentData({...assessmentData, anticoagulationMeds: [...assessmentData.anticoagulationMeds, medication.id]});
                                          } else {
                                            setAssessmentData({...assessmentData, anticoagulationMeds: assessmentData.anticoagulationMeds.filter(m => m !== medication.id)});
                                          }
                                        }}
                                        disabled={isPreOpReadOnly}
                                        data-testid={`checkbox-anticoag-${medication.id}`}
                                      />
                                      <Label htmlFor={`anticoag-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                                    </div>
                                  ))}
                                </div>
                                <Input
                                  value={assessmentData.anticoagulationMedsOther}
                                  onChange={(e) => setAssessmentData({...assessmentData, anticoagulationMedsOther: e.target.value})}
                                  placeholder={t('anesthesia.patientDetail.otherAnticoagulationPlaceholder')}
                                  disabled={isPreOpReadOnly}
                                  data-testid="input-anticoag-other"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.generalMedications')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {generalMedications.map((medication) => (
                                    <div key={medication.id} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`general-med-${medication.id}`}
                                        checked={assessmentData.generalMeds.includes(medication.id)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setAssessmentData({...assessmentData, generalMeds: [...assessmentData.generalMeds, medication.id]});
                                          } else {
                                            setAssessmentData({...assessmentData, generalMeds: assessmentData.generalMeds.filter(m => m !== medication.id)});
                                          }
                                        }}
                                        disabled={isPreOpReadOnly}
                                        data-testid={`checkbox-general-med-${medication.id}`}
                                      />
                                      <Label htmlFor={`general-med-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                                    </div>
                                  ))}
                                </div>
                                <Input
                                  value={assessmentData.generalMedsOther}
                                  onChange={(e) => setAssessmentData({...assessmentData, generalMedsOther: e.target.value})}
                                  placeholder={t('anesthesia.patientDetail.otherMedicationsPlaceholder')}
                                  disabled={isPreOpReadOnly}
                                  data-testid="input-general-med-other"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes')}</Label>
                            <Textarea
                              value={assessmentData.medicationsNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, medicationsNotes: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.medicationsNotesPlaceholder')}
                              rows={14}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-medications-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Heart and Circulation Section */}
                <AccordionItem value="heart">
                  <Card className={hasHeartData() ? "border-red-500 dark:border-red-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-heart">
                      <CardTitle className={`text-lg ${hasHeartData() ? "text-red-600 dark:text-red-400" : ""}`}>
                        {t('anesthesia.patientDetail.heartAndCirculation')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions')}</Label>
                            <div className="space-y-2">
                              {(anesthesiaSettings?.illnessLists?.cardiovascular || []).map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={(assessmentData.heartIllnesses as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      heartIllnesses: {...assessmentData.heartIllnesses, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-${id}`}
                                  />
                                  <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes')}</Label>
                            <Textarea
                              value={assessmentData.heartNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, heartNotes: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.heartNotesPlaceholder')}
                              rows={8}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-heart-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Lungs Section */}
                <AccordionItem value="lungs">
                  <Card className={hasLungData() ? "border-blue-500 dark:border-blue-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-lungs">
                      <CardTitle className={`text-lg ${hasLungData() ? "text-blue-600 dark:text-blue-400" : ""}`}>
                        {t('anesthesia.patientDetail.lungs')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions')}</Label>
                            <div className="space-y-2">
                              {(anesthesiaSettings?.illnessLists?.pulmonary || []).map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={(assessmentData.lungIllnesses as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      lungIllnesses: {...assessmentData.lungIllnesses, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-${id}`}
                                  />
                                  <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes')}</Label>
                            <Textarea
                              value={assessmentData.lungNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, lungNotes: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.lungNotesPlaceholder')}
                              rows={6}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-lung-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* GI-Tract, Kidney and Metabolic Section */}
                <AccordionItem value="gi-kidney-metabolic">
                  <Card className={hasGIKidneyMetabolicData() ? "border-yellow-500 dark:border-yellow-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-gi-kidney-metabolic">
                      <CardTitle className={`text-lg ${hasGIKidneyMetabolicData() ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                        {t('anesthesia.patientDetail.giKidneyMetabolic')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.giTract')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.gastrointestinal || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.giIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        giIllnesses: {...assessmentData.giIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.kidney')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.kidney || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.kidneyIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        kidneyIllnesses: {...assessmentData.kidneyIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.metabolic')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.metabolic || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.metabolicIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        metabolicIllnesses: {...assessmentData.metabolicIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes')}</Label>
                            <Textarea
                              value={assessmentData.giKidneyMetabolicNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, giKidneyMetabolicNotes: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.giKidneyMetabolicNotesPlaceholder')}
                              rows={18}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-gi-kidney-metabolic-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Neurological, Psychiatry and Skeletal Section */}
                <AccordionItem value="neuro-psych-skeletal">
                  <Card className={hasNeuroPsychSkeletalData() ? "border-orange-500 dark:border-orange-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-neuro-psych-skeletal">
                      <CardTitle className={`text-lg ${hasNeuroPsychSkeletalData() ? "text-orange-600 dark:text-orange-400" : ""}`}>
                        {t('anesthesia.patientDetail.neuroPsychSkeletal')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.neurological')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.neurological || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.neuroIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        neuroIllnesses: {...assessmentData.neuroIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.psychiatry')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.psychiatric || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.psychIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        psychIllnesses: {...assessmentData.psychIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.skeletal')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.skeletal || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.skeletalIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        skeletalIllnesses: {...assessmentData.skeletalIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.neuroPsychSkeletalNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, neuroPsychSkeletalNotes: e.target.value})}
                              placeholder="Enter additional notes about neurological, psychiatric or skeletal conditions..."
                              rows={23}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-neuro-psych-skeletal-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Coagulation and Infectious Diseases Section */}
                <AccordionItem value="coagulation-infectious">
                  <Card className={hasCoagulationInfectiousData() ? "border-red-500 dark:border-red-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-coagulation-infectious">
                      <CardTitle className={`text-lg ${hasCoagulationInfectiousData() ? "text-red-600 dark:text-red-400" : ""}`}>
                        {t('anesthesia.patientDetail.coagulationInfectious')}
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.coagulation')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.coagulation || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.coagulationIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        coagulationIllnesses: {...assessmentData.coagulationIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.infectiousDiseases')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {(anesthesiaSettings?.illnessLists?.infectious || []).map(({ id, label }) => (
                                  <div key={id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={id}
                                      checked={(assessmentData.infectiousIllnesses as any)[id] || false}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        infectiousIllnesses: {...assessmentData.infectiousIllnesses, [id]: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes')}</Label>
                            <Textarea
                              value={assessmentData.coagulationInfectiousNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, coagulationInfectiousNotes: e.target.value})}
                              placeholder={t('anesthesia.patientDetail.coagulationInfectiousNotesPlaceholder')}
                              rows={16}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-coagulation-infectious-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Gynecology Section */}
                <AccordionItem value="woman">
                  <Card className={hasWomanData() ? "border-pink-500 dark:border-pink-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-woman">
                      <CardTitle className={`text-lg ${hasWomanData() ? "text-pink-600 dark:text-pink-400" : ""}`}>
                        Gynecology
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Conditions</Label>
                            <div className="space-y-2">
                              {(anesthesiaSettings?.illnessLists?.woman || []).map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={(assessmentData.womanIssues as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      womanIssues: {...assessmentData.womanIssues, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-${id}`}
                                  />
                                  <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.womanNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, womanNotes: e.target.value})}
                              placeholder="Enter additional notes about gynecological conditions..."
                              rows={6}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-woman-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Pediatric Section */}
                <AccordionItem value="children">
                  <Card className={hasChildrenData() ? "border-green-500 dark:border-green-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-children">
                      <CardTitle className={`text-lg ${hasChildrenData() ? "text-green-600 dark:text-green-400" : ""}`}>
                        Pediatric
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Conditions</Label>
                            <div className="space-y-2">
                              {(anesthesiaSettings?.illnessLists?.children || []).map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={(assessmentData.childrenIssues as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      childrenIssues: {...assessmentData.childrenIssues, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-${id}`}
                                  />
                                  <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.childrenNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, childrenNotes: e.target.value})}
                              placeholder="Enter additional notes about pediatric conditions..."
                              rows={6}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-children-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Dependencies (Substances) Section */}
                <AccordionItem value="noxen">
                  <Card className={hasNoxenData() ? "border-2 border-gray-500 dark:border-gray-400" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-noxen">
                      <CardTitle className={`text-lg ${hasNoxenData() ? "text-gray-700 dark:text-gray-300" : ""}`}>
                        Dependencies (Substances)
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Substances</Label>
                            <div className="space-y-2">
                              {(anesthesiaSettings?.illnessLists?.noxen || []).map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={id}
                                    checked={(assessmentData.noxen as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      noxen: {...assessmentData.noxen, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-${id}`}
                                  />
                                  <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.noxenNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, noxenNotes: e.target.value})}
                              placeholder="Enter additional notes about substance use..."
                              rows={6}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-noxen-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Anesthesia & Surgical History Section */}
                <AccordionItem value="anesthesiaHistory">
                  <Card className={hasAnesthesiaSurgicalHistoryData() ? "border-2 border-orange-500 dark:border-orange-400" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia-history">
                      <CardTitle className={`text-lg ${hasAnesthesiaSurgicalHistoryData() ? "text-orange-600 dark:text-orange-400" : ""}`}>Anesthesia & Surgical History</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0 space-y-6">
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Previous Surgeries</Label>
                          <Textarea
                            value={assessmentData.previousSurgeries}
                            onChange={(e) => setAssessmentData({...assessmentData, previousSurgeries: e.target.value})}
                            placeholder="List previous surgeries with dates if known..."
                            rows={3}
                            disabled={isPreOpReadOnly}
                            data-testid="textarea-previous-surgeries"
                          />
                        </div>
                        
                        {/* Anesthesia History Checkboxes */}
                        {anesthesiaSettings?.illnessLists?.anesthesiaHistory && anesthesiaSettings.illnessLists.anesthesiaHistory.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Previous Anesthesia Issues</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {anesthesiaSettings.illnessLists.anesthesiaHistory.map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`anesthesia-${id}`}
                                    checked={(assessmentData.anesthesiaHistoryIssues as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      anesthesiaHistoryIssues: {...assessmentData.anesthesiaHistoryIssues, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-anesthesia-${id}`}
                                  />
                                  <Label htmlFor={`anesthesia-${id}`} className="cursor-pointer text-sm">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Dental Status Checkboxes */}
                        {anesthesiaSettings?.illnessLists?.dental && anesthesiaSettings.illnessLists.dental.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Dental Status</Label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                              {anesthesiaSettings.illnessLists.dental.map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`dental-${id}`}
                                    checked={(assessmentData.dentalIssues as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      dentalIssues: {...assessmentData.dentalIssues, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-dental-${id}`}
                                  />
                                  <Label htmlFor={`dental-${id}`} className="cursor-pointer text-sm">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* PONV & Transfusion Checkboxes */}
                        {anesthesiaSettings?.illnessLists?.ponvTransfusion && anesthesiaSettings.illnessLists.ponvTransfusion.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">PONV & Transfusion History</Label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {anesthesiaSettings.illnessLists.ponvTransfusion.map(({ id, label }) => (
                                <div key={id} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`ponv-${id}`}
                                    checked={(assessmentData.ponvTransfusionIssues as any)[id] || false}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      ponvTransfusionIssues: {...assessmentData.ponvTransfusionIssues, [id]: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid={`checkbox-ponv-${id}`}
                                  />
                                  <Label htmlFor={`ponv-${id}`} className="cursor-pointer text-sm">{label}</Label>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        <div className="space-y-2">
                          <Label className="text-base font-semibold">Additional Notes</Label>
                          <Textarea
                            value={assessmentData.anesthesiaSurgicalHistoryNotes}
                            onChange={(e) => setAssessmentData({...assessmentData, anesthesiaSurgicalHistoryNotes: e.target.value})}
                            placeholder="Any additional details about previous anesthesia or surgery..."
                            rows={3}
                            disabled={isPreOpReadOnly}
                            data-testid="textarea-anesthesia-surgical-history-notes"
                          />
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Outpatient Care Section */}
                <AccordionItem value="outpatient">
                  <Card className={hasOutpatientCareData() ? "border-2 border-cyan-500 dark:border-cyan-400" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-outpatient">
                      <CardTitle className={`text-lg ${hasOutpatientCareData() ? "text-cyan-600 dark:text-cyan-400" : ""}`}>Outpatient Care</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0 space-y-4">
                        <p className="text-sm text-muted-foreground">For outpatient procedures, provide caregiver contact information.</p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="outpatientCaregiverFirstName">Caregiver First Name</Label>
                            <Input
                              id="outpatientCaregiverFirstName"
                              value={assessmentData.outpatientCaregiverFirstName}
                              onChange={(e) => setAssessmentData({...assessmentData, outpatientCaregiverFirstName: e.target.value})}
                              disabled={isPreOpReadOnly}
                              placeholder="First name"
                              data-testid="input-caregiver-first-name"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="outpatientCaregiverLastName">Caregiver Last Name</Label>
                            <Input
                              id="outpatientCaregiverLastName"
                              value={assessmentData.outpatientCaregiverLastName}
                              onChange={(e) => setAssessmentData({...assessmentData, outpatientCaregiverLastName: e.target.value})}
                              disabled={isPreOpReadOnly}
                              placeholder="Last name"
                              data-testid="input-caregiver-last-name"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="outpatientCaregiverPhone">Caregiver Phone</Label>
                          <PhoneInputWithCountry
                            id="outpatientCaregiverPhone"
                            value={assessmentData.outpatientCaregiverPhone}
                            onChange={(value) => setAssessmentData({...assessmentData, outpatientCaregiverPhone: value})}
                            disabled={isPreOpReadOnly}
                            placeholder="Phone number"
                            data-testid="input-caregiver-phone"
                          />
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Planned Anesthesia Section */}
                <AccordionItem value="anesthesia">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia">
                      <CardTitle className="text-lg">{t('anesthesia.patientDetail.plannedAnesthesiaInstallations')}</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anesthesiaTechnique')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                {/* General Anesthesia */}
                                <div className="space-y-2">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="general"
                                      checked={assessmentData.anesthesiaTechniques.general}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, general: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid="checkbox-general"
                                    />
                                    <Label htmlFor="general" className="cursor-pointer font-normal text-sm font-semibold">{t('anesthesia.patientDetail.generalAnesthesia')}</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.general && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'tiva-tci', label: t('anesthesia.patientDetail.tivaTci') },
                                        { id: 'tubus', label: t('anesthesia.patientDetail.tubus') },
                                        { id: 'rsi', label: t('anesthesia.patientDetail.rsi') },
                                        { id: 'larynxmask', label: t('anesthesia.patientDetail.larynxmask') },
                                        { id: 'larynxmask-auragain', label: t('anesthesia.patientDetail.larynxmaskAuraGain') },
                                        { id: 'rae-tubus', label: t('anesthesia.patientDetail.raeTubus') },
                                        { id: 'spiralfedertubus', label: t('anesthesia.patientDetail.spiralfedertubus') },
                                        { id: 'doppellumentubus', label: t('anesthesia.patientDetail.doppellumentubus') },
                                        { id: 'nasal-intubation', label: t('anesthesia.patientDetail.nasalIntubation') },
                                        { id: 'awake-intubation', label: t('anesthesia.patientDetail.awakeIntubation') },
                                        { id: 'ponv-prophylaxis', label: t('anesthesia.patientDetail.ponvProphylaxis') },
                                      ].map(({ id, label }) => (
                                        <div key={id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={id}
                                            checked={assessmentData.anesthesiaTechniques.generalOptions?.[id] || false}
                                            onCheckedChange={(checked) => setAssessmentData({
                                              ...assessmentData,
                                              anesthesiaTechniques: {
                                                ...assessmentData.anesthesiaTechniques,
                                                generalOptions: {
                                                  ...assessmentData.anesthesiaTechniques.generalOptions,
                                                  [id]: checked as boolean
                                                }
                                              }
                                            })}
                                            disabled={isPreOpReadOnly}
                                            data-testid={`checkbox-${id}`}
                                          />
                                          <Label htmlFor={id} className="cursor-pointer font-normal text-xs">{label}</Label>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Spinal Anesthesia */}
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="spinal"
                                    checked={assessmentData.anesthesiaTechniques.spinal}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, spinal: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-spinal"
                                  />
                                  <Label htmlFor="spinal" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.spinalAnesthesia')}</Label>
                                </div>

                                {/* Epidural Anesthesia */}
                                <div className="space-y-2">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="epidural"
                                      checked={assessmentData.anesthesiaTechniques.epidural}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, epidural: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid="checkbox-epidural"
                                    />
                                    <Label htmlFor="epidural" className="cursor-pointer font-normal text-sm font-semibold">{t('anesthesia.patientDetail.epiduralAnesthesia')}</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.epidural && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'thoracic', label: t('anesthesia.patientDetail.thoracic') },
                                        { id: 'lumbar', label: t('anesthesia.patientDetail.lumbar') },
                                      ].map(({ id, label }) => (
                                        <div key={id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`epidural-${id}`}
                                            checked={assessmentData.anesthesiaTechniques.epiduralOptions?.[id] || false}
                                            onCheckedChange={(checked) => setAssessmentData({
                                              ...assessmentData,
                                              anesthesiaTechniques: {
                                                ...assessmentData.anesthesiaTechniques,
                                                epiduralOptions: {
                                                  ...assessmentData.anesthesiaTechniques.epiduralOptions,
                                                  [id]: checked as boolean
                                                }
                                              }
                                            })}
                                            disabled={isPreOpReadOnly}
                                            data-testid={`checkbox-epidural-${id}`}
                                          />
                                          <Label htmlFor={`epidural-${id}`} className="cursor-pointer font-normal text-xs">{label}</Label>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Regional Anesthesia */}
                                <div className="space-y-2">
                                  <div className="flex items-center space-x-2">
                                    <Checkbox
                                      id="regional"
                                      checked={assessmentData.anesthesiaTechniques.regional}
                                      onCheckedChange={(checked) => setAssessmentData({
                                        ...assessmentData,
                                        anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, regional: checked as boolean}
                                      })}
                                      disabled={isPreOpReadOnly}
                                      data-testid="checkbox-regional"
                                    />
                                    <Label htmlFor="regional" className="cursor-pointer font-normal text-sm font-semibold">{t('anesthesia.patientDetail.regionalAnesthesia')}</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.regional && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'interscalene-block', label: t('anesthesia.patientDetail.interscaleneBlock') },
                                        { id: 'supraclavicular-block', label: t('anesthesia.patientDetail.supraclavicularBlock') },
                                        { id: 'infraclavicular-block', label: t('anesthesia.patientDetail.infraclavicularBlock') },
                                        { id: 'axillary-block', label: t('anesthesia.patientDetail.axillaryBlock') },
                                        { id: 'femoral-block', label: t('anesthesia.patientDetail.femoralBlock') },
                                        { id: 'sciatic-block', label: t('anesthesia.patientDetail.sciaticBlock') },
                                        { id: 'popliteal-block', label: t('anesthesia.patientDetail.poplitealBlock') },
                                        { id: 'tap-block', label: t('anesthesia.patientDetail.tapBlock') },
                                        { id: 'pecs-block', label: t('anesthesia.patientDetail.pecsBlock') },
                                        { id: 'serratus-block', label: t('anesthesia.patientDetail.serratusBlock') },
                                        { id: 'with-catheter', label: t('anesthesia.patientDetail.withCatheter') },
                                      ].map(({ id, label }) => (
                                        <div key={id} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`regional-${id}`}
                                            checked={assessmentData.anesthesiaTechniques.regionalOptions?.[id] || false}
                                            onCheckedChange={(checked) => setAssessmentData({
                                              ...assessmentData,
                                              anesthesiaTechniques: {
                                                ...assessmentData.anesthesiaTechniques,
                                                regionalOptions: {
                                                  ...assessmentData.anesthesiaTechniques.regionalOptions,
                                                  [id]: checked as boolean
                                                }
                                              }
                                            })}
                                            disabled={isPreOpReadOnly}
                                            data-testid={`checkbox-regional-${id}`}
                                          />
                                          <Label htmlFor={`regional-${id}`} className="cursor-pointer font-normal text-xs">{label}</Label>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Sedation */}
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="sedation"
                                    checked={assessmentData.anesthesiaTechniques.sedation}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, sedation: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-sedation"
                                  />
                                  <Label htmlFor="sedation" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.sedation')}</Label>
                                </div>

                                {/* Combined Technique */}
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="combined"
                                    checked={assessmentData.anesthesiaTechniques.combined}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      anesthesiaTechniques: {...assessmentData.anesthesiaTechniques, combined: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-combined"
                                  />
                                  <Label htmlFor="combined" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.combinedTechnique')}</Label>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.postOperativeCare')}</Label>
                              <div className="border rounded-lg p-3">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="postOpICU"
                                    checked={assessmentData.postOpICU}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      postOpICU: checked as boolean
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-post-op-icu"
                                  />
                                  <Label htmlFor="postOpICU" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.postOpIcu')}</Label>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.otherAnesthesiaDetails')}</Label>
                              <Textarea
                                value={assessmentData.anesthesiaOther}
                                onChange={(e) => setAssessmentData({...assessmentData, anesthesiaOther: e.target.value})}
                                placeholder={t('anesthesia.patientDetail.otherAnesthesiaPlaceholder')}
                                rows={3}
                                disabled={isPreOpReadOnly}
                                data-testid="textarea-anesthesia-other"
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.requiredInstallations')}</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="arterialLine"
                                    checked={assessmentData.installations.arterialLine}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, arterialLine: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-arterial-line"
                                  />
                                  <Label htmlFor="arterialLine" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.arterialLine')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="centralLine"
                                    checked={assessmentData.installations.centralLine}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, centralLine: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-central-line"
                                  />
                                  <Label htmlFor="centralLine" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.centralVenousLine')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="epiduralCatheter"
                                    checked={assessmentData.installations.epiduralCatheter}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, epiduralCatheter: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-epidural-catheter"
                                  />
                                  <Label htmlFor="epiduralCatheter" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.epiduralCatheter')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="urinaryCatheter"
                                    checked={assessmentData.installations.urinaryCatheter}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, urinaryCatheter: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-urinary-catheter"
                                  />
                                  <Label htmlFor="urinaryCatheter" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.urinaryCatheter')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="nasogastricTube"
                                    checked={assessmentData.installations.nasogastricTube}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, nasogastricTube: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-nasogastric-tube"
                                  />
                                  <Label htmlFor="nasogastricTube" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.nasogastricTube')}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="peripheralIV"
                                    checked={assessmentData.installations.peripheralIV}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, peripheralIV: checked as boolean}
                                    })}
                                    disabled={isPreOpReadOnly}
                                    data-testid="checkbox-peripheral-iv"
                                  />
                                  <Label htmlFor="peripheralIV" className="cursor-pointer font-normal text-sm">{t('anesthesia.patientDetail.peripheralIV')}</Label>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-base font-semibold">{t('anesthesia.patientDetail.otherInstallations')}</Label>
                              <Textarea
                                value={assessmentData.installationsOther}
                                onChange={(e) => setAssessmentData({...assessmentData, installationsOther: e.target.value})}
                                placeholder={t('anesthesia.patientDetail.otherInstallationsPlaceholder')}
                                rows={3}
                                disabled={isPreOpReadOnly}
                                data-testid="textarea-installations-other"
                              />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>

              {/* Doctor Signature and Save */}
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle>{t('anesthesia.patientDetail.assessmentCompletion')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Surgical Approval Status */}
                  <div className="space-y-2">
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "approved" ? "bg-green-50 dark:bg-green-950" : ""}`}>
                        <Checkbox
                          id="approved"
                          checked={assessmentData.surgicalApprovalStatus === "approved"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "approved" : "",
                            standBy: checked ? false : assessmentData.standBy,
                            standByReason: checked ? "" : assessmentData.standByReason,
                            standByReasonNote: checked ? "" : assessmentData.standByReasonNote
                          })}
                          disabled={isPreOpReadOnly}
                          data-testid="checkbox-approved"
                          className={assessmentData.surgicalApprovalStatus === "approved" ? "border-green-600 data-[state=checked]:bg-green-600" : ""}
                        />
                        <Label htmlFor="approved" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "approved" ? "text-green-700 dark:text-green-300 font-semibold" : ""}`}>
                          {t('anesthesia.patientDetail.approvedForSurgery')}
                        </Label>
                      </div>
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "not-approved" ? "bg-red-50 dark:bg-red-950" : ""}`}>
                        <Checkbox
                          id="not-approved"
                          checked={assessmentData.surgicalApprovalStatus === "not-approved"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "not-approved" : "",
                            standBy: checked ? false : assessmentData.standBy,
                            standByReason: checked ? "" : assessmentData.standByReason,
                            standByReasonNote: checked ? "" : assessmentData.standByReasonNote
                          })}
                          disabled={isPreOpReadOnly}
                          data-testid="checkbox-not-approved"
                          className={assessmentData.surgicalApprovalStatus === "not-approved" ? "border-red-600 data-[state=checked]:bg-red-600" : ""}
                        />
                        <Label htmlFor="not-approved" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "not-approved" ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>
                          {t('anesthesia.patientDetail.notApproved')}
                        </Label>
                      </div>
                    </div>
                  </div>

                  {/* Stand-By Status */}
                  <div className={`space-y-4 p-4 rounded-lg border ${assessmentData.standBy ? "bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700" : "border-muted"}`}>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="standby-toggle" className={`text-base font-semibold cursor-pointer ${assessmentData.standBy ? "text-amber-700 dark:text-amber-300" : ""}`}>
                        {t('anesthesia.patientDetail.standByLabel')}
                      </Label>
                      <Switch
                        id="standby-toggle"
                        checked={assessmentData.standBy}
                        onCheckedChange={(checked: boolean) => setAssessmentData({
                          ...assessmentData,
                          standBy: checked,
                          standByReason: checked ? assessmentData.standByReason : "",
                          standByReasonNote: checked ? assessmentData.standByReasonNote : "",
                          surgicalApprovalStatus: checked ? "" : assessmentData.surgicalApprovalStatus
                        })}
                        disabled={isPreOpReadOnly}
                        data-testid="switch-standby"
                        className={assessmentData.standBy ? "data-[state=checked]:bg-amber-600" : ""}
                      />
                    </div>
                    
                    {assessmentData.standBy && (
                      <div className="space-y-4 pt-2 border-t border-amber-200 dark:border-amber-800">
                        <div className="space-y-2">
                          <Label htmlFor="standby-reason" className="text-sm font-medium">
                            {t('anesthesia.patientDetail.standByReasonLabel')}
                          </Label>
                          <Select
                            value={assessmentData.standByReason}
                            onValueChange={(value) => setAssessmentData({
                              ...assessmentData,
                              standByReason: value,
                              standByReasonNote: value !== "other" ? "" : assessmentData.standByReasonNote
                            })}
                            disabled={isPreOpReadOnly}
                          >
                            <SelectTrigger data-testid="select-standby-reason">
                              <SelectValue placeholder={t('anesthesia.patientDetail.selectReason')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="signature_missing">{t('anesthesia.patientDetail.standByReasons.signatureMissing')}</SelectItem>
                              <SelectItem value="consent_required">{t('anesthesia.patientDetail.standByReasons.consentRequired')}</SelectItem>
                              <SelectItem value="waiting_exams">{t('anesthesia.patientDetail.standByReasons.waitingExams')}</SelectItem>
                              <SelectItem value="other">{t('anesthesia.patientDetail.standByReasons.other')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {assessmentData.standByReason === "other" && (
                          <div className="space-y-2">
                            <Label htmlFor="standby-note" className="text-sm font-medium">
                              {t('anesthesia.patientDetail.standByReasonNote')}
                            </Label>
                            <Textarea
                              id="standby-note"
                              value={assessmentData.standByReasonNote}
                              onChange={(e) => setAssessmentData({
                                ...assessmentData,
                                standByReasonNote: e.target.value
                              })}
                              placeholder={t('anesthesia.patientDetail.standByReasonNotePlaceholder')}
                              rows={2}
                              disabled={isPreOpReadOnly}
                              data-testid="textarea-standby-note"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Assessment Date and Doctor Name */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('anesthesia.patientDetail.assessmentDate')}</Label>
                      <Input
                        type="text"
                        placeholder="dd.MM.yyyy"
                        value={assessmentData.assessmentDate ? isoToDisplayDate(assessmentData.assessmentDate) : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const parsed = parseFlexibleDate(value);
                          if (parsed) {
                            setAssessmentData({...assessmentData, assessmentDate: parsed.isoDate});
                          } else {
                            setAssessmentData({...assessmentData, assessmentDate: value});
                          }
                        }}
                        onBlur={(e) => {
                          const parsed = parseFlexibleDate(e.target.value);
                          if (parsed) {
                            setAssessmentData({...assessmentData, assessmentDate: parsed.isoDate});
                          }
                        }}
                        disabled={isPreOpReadOnly}
                        data-testid="input-assessment-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('anesthesia.patientDetail.doctorName')}</Label>
                      <Input
                        value={assessmentData.doctorName}
                        onChange={(e) => setAssessmentData({...assessmentData, doctorName: e.target.value})}
                        placeholder={t('anesthesia.patientDetail.enterYourName')}
                        disabled={isPreOpReadOnly}
                        data-testid="input-doctor-name"
                      />
                    </div>
                  </div>

                  {/* Doctor Signature */}
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.doctorSignature')}</Label>
                    <div
                      className={`border-2 border-dashed rounded-lg p-6 transition-colors ${isPreOpReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                      onClick={() => !isPreOpReadOnly && setShowAssessmentSignaturePad(true)}
                      data-testid="assessment-signature-trigger"
                    >
                      {assessmentData.doctorSignature ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={assessmentData.doctorSignature} alt="Doctor signature" className="h-16 max-w-full" />
                          <p className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.clickToChangeSignature')}</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <i className="fas fa-signature text-2xl"></i>
                          <p className="text-sm">{t('anesthesia.patientDetail.clickToAddSignature')}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <Button 
                    variant="outline"
                    size="lg" 
                    className="w-full"
                    onClick={() => handleSavePreOpAssessment(false)}
                    disabled={isPreOpReadOnly || createPreOpMutation.isPending || updatePreOpMutation.isPending}
                    data-testid="button-save"
                  >
                    {(createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('anesthesia.patientDetail.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t('anesthesia.patientDetail.save')}
                      </>
                    )}
                  </Button>

                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="consent" className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>{t('anesthesia.patientDetail.informedConsentForAnesthesia')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-start space-x-3 p-4 border rounded-lg">
                        <Checkbox 
                          id="general"
                          checked={consentData.general}
                          onCheckedChange={(checked) => setConsentData({...consentData, general: checked as boolean})}
                          disabled={isPreOpReadOnly}
                          data-testid="checkbox-consent-general"
                        />
                        <div className="flex-1">
                          <Label htmlFor="general" className="font-semibold text-base cursor-pointer">
                            {t('anesthesia.patientDetail.generalAnesthesiaConsent')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-2">
                            {t('anesthesia.patientDetail.generalAnesthesiaDescription')}
                          </p>
                          <p className="text-sm text-destructive mt-2">
                            <strong>{t('anesthesia.patientDetail.possibleAdverseEvents')}</strong> {t('anesthesia.patientDetail.generalAnesthesiaRisks')}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3 p-4 border rounded-lg">
                        <Checkbox 
                          id="analgosedation"
                          checked={consentData.analgosedation}
                          onCheckedChange={(checked) => setConsentData({...consentData, analgosedation: checked as boolean})}
                          disabled={isPreOpReadOnly}
                          data-testid="checkbox-consent-analgosedation"
                        />
                        <div className="flex-1">
                          <Label htmlFor="analgosedation" className="font-semibold text-base cursor-pointer">
                            {t('anesthesia.patientDetail.analgosedationConsent')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-2">
                            {t('anesthesia.patientDetail.analgosedationDescription')}
                          </p>
                          <p className="text-sm text-destructive mt-2">
                            <strong>{t('anesthesia.patientDetail.possibleAdverseEvents')}</strong> {t('anesthesia.patientDetail.analgosedationRisks')}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="regional"
                        checked={consentData.regional}
                        onCheckedChange={(checked) => setConsentData({...consentData, regional: checked as boolean})}
                        disabled={isPreOpReadOnly}
                        data-testid="checkbox-consent-regional"
                      />
                      <div className="flex-1">
                        <Label htmlFor="regional" className="font-semibold text-base cursor-pointer">
                          {t('anesthesia.patientDetail.regionalAnesthesiaConsent')}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          {t('anesthesia.patientDetail.regionalAnesthesiaDescription')}
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>{t('anesthesia.patientDetail.possibleAdverseEvents')}</strong> {t('anesthesia.patientDetail.regionalAnesthesiaRisks')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="installations"
                        checked={consentData.installations}
                        onCheckedChange={(checked) => setConsentData({...consentData, installations: checked as boolean})}
                        disabled={isPreOpReadOnly}
                        data-testid="checkbox-installations"
                      />
                      <div className="flex-1">
                        <Label htmlFor="installations" className="font-semibold text-base cursor-pointer">
                          {t('anesthesia.patientDetail.plannedInstallationsConsent')}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          {t('anesthesia.patientDetail.plannedInstallationsDescription')}
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>{t('anesthesia.patientDetail.possibleAdverseEvents')}</strong> {t('anesthesia.patientDetail.plannedInstallationsRisks')}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="icuAdmission"
                        checked={consentData.icuAdmission}
                        onCheckedChange={(checked) => setConsentData({...consentData, icuAdmission: checked as boolean})}
                        disabled={isPreOpReadOnly}
                        data-testid="checkbox-icu"
                      />
                      <div className="flex-1">
                        <Label htmlFor="icuAdmission" className="font-semibold text-base cursor-pointer">
                          {t('anesthesia.patientDetail.postoperativeIcuAdmission')}
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          {t('anesthesia.patientDetail.postoperativeIcuDescription')}
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          {t('anesthesia.patientDetail.postoperativeIcuPurpose')}
                        </p>
                      </div>
                    </div>

                    {/* Fasting Requirements Section */}
                    <div className="p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        <h4 className="font-semibold text-amber-800 dark:text-amber-300">
                          {t('anesthesia.patientDetail.fastingRequirements', 'Pre-Operative Fasting Requirements')}
                        </h4>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-sm text-amber-800 dark:text-amber-200">
                        <li>{t('anesthesia.patientDetail.fastingFood', 'No solid food for 6 hours before surgery')}</li>
                        <li>{t('anesthesia.patientDetail.fastingLiquids', 'No liquids for 2 hours before surgery (water only allowed until then)')}</li>
                      </ul>
                    </div>

                    {/* Ambulatory Supervision Section */}
                    <div className="p-4 border rounded-lg bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <h4 className="font-semibold text-blue-800 dark:text-blue-300">
                          {t('anesthesia.patientDetail.ambulatorySupervision', 'Post-Anesthesia Care for Outpatients')}
                        </h4>
                      </div>
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        {t('anesthesia.patientDetail.ambulatorySupervisionText', 'For outpatient (ambulatory) procedures: The patient must be accompanied and supervised by a responsible adult for 24 hours after anesthesia.')}
                      </p>
                    </div>
                    
                    <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                      <Label htmlFor="consentNotes" className="font-semibold text-base">
                        {t('anesthesia.patientDetail.consentNotes')}
                      </Label>
                      <Textarea
                        id="consentNotes"
                        value={consentData.notes}
                        onChange={(e) => setConsentData({...consentData, notes: e.target.value})}
                        placeholder={t('anesthesia.patientDetail.consentNotesPlaceholder')}
                        className="min-h-[80px] resize-none"
                        disabled={isPreOpReadOnly}
                        data-testid="textarea-consent-notes"
                      />
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>{t('anesthesia.patientDetail.date')}</Label>
                      <Input
                        type="text"
                        placeholder="dd.MM.yyyy"
                        value={consentData.date ? isoToDisplayDate(consentData.date) : ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          const parsed = parseFlexibleDate(value);
                          if (parsed) {
                            setConsentData({...consentData, date: parsed.isoDate});
                          } else {
                            setConsentData({...consentData, date: value});
                          }
                        }}
                        onBlur={(e) => {
                          const parsed = parseFlexibleDate(e.target.value);
                          if (parsed) {
                            setConsentData({...consentData, date: parsed.isoDate});
                          }
                        }}
                        disabled={isPreOpReadOnly}
                        data-testid="input-consent-date"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('anesthesia.patientDetail.doctorSignature')}</Label>
                        <div
                          className={`border-2 border-dashed rounded-lg p-6 transition-colors ${isPreOpReadOnly ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                          onClick={() => !isPreOpReadOnly && setShowConsentDoctorSignaturePad(true)}
                          data-testid="consent-doctor-signature-trigger"
                        >
                          {consentData.doctorSignature ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={consentData.doctorSignature} alt="Doctor signature" className="h-16 max-w-full" />
                              <p className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.clickToChangeSignature')}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <i className="fas fa-signature text-2xl"></i>
                              <p className="text-sm">{t('anesthesia.patientDetail.clickToAddSignature')}</p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>{t('anesthesia.patientDetail.patientSignature')}</Label>
                        <div
                          className={`border-2 border-dashed rounded-lg p-6 transition-colors ${(isPreOpReadOnly || consentData.emergencyNoSignature) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50'}`}
                          onClick={() => !isPreOpReadOnly && !consentData.emergencyNoSignature && setShowConsentPatientSignaturePad(true)}
                          data-testid="consent-patient-signature-trigger"
                        >
                          {consentData.patientSignature ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={consentData.patientSignature} alt="Patient signature" className="h-16 max-w-full" />
                              <p className="text-xs text-muted-foreground">{t('anesthesia.patientDetail.clickToChangeSignature')}</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <i className="fas fa-signature text-2xl"></i>
                              <p className="text-sm">{t('anesthesia.patientDetail.clickToAddSignature')}</p>
                            </div>
                          )}
                        </div>
                        
                        {/* Emergency checkbox - patient cannot sign */}
                        <div className={`flex items-center space-x-2 p-2 rounded-lg ${consentData.emergencyNoSignature ? "bg-orange-50 dark:bg-orange-950" : ""}`}>
                          <Checkbox
                            id="emergencyNoSignature"
                            checked={consentData.emergencyNoSignature}
                            onCheckedChange={(checked) => setConsentData({
                              ...consentData, 
                              emergencyNoSignature: checked as boolean,
                              patientSignature: checked ? "" : consentData.patientSignature
                            })}
                            disabled={isPreOpReadOnly}
                            data-testid="checkbox-emergency-no-signature"
                            className={consentData.emergencyNoSignature ? "border-orange-600 data-[state=checked]:bg-orange-600" : ""}
                          />
                          <Label htmlFor="emergencyNoSignature" className={`cursor-pointer font-normal text-sm flex-1 ${consentData.emergencyNoSignature ? "text-orange-700 dark:text-orange-300 font-semibold" : ""}`}>
                            {t('anesthesia.patientDetail.emergencyNoSignature')}
                          </Label>
                        </div>
                      </div>
                    </div>
                    
                    {/* Email copy option */}
                    <div className="space-y-3 pt-4 border-t">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sendEmailCopy"
                          checked={consentData.sendEmailCopy}
                          onCheckedChange={(checked) => setConsentData({
                            ...consentData, 
                            sendEmailCopy: checked as boolean,
                            emailForCopy: checked ? (patient?.email || consentData.emailForCopy) : consentData.emailForCopy
                          })}
                          disabled={isPreOpReadOnly}
                          data-testid="checkbox-send-email-copy"
                        />
                        <Label htmlFor="sendEmailCopy" className="cursor-pointer font-normal text-sm">
                          {t('anesthesia.patientDetail.sendEmailCopy')}
                        </Label>
                      </div>
                      
                      {consentData.sendEmailCopy && (
                        <div className="space-y-3 ml-6">
                          <div className="space-y-2">
                            <Label className="text-sm">{t('anesthesia.patientDetail.emailForCopy')}</Label>
                            <Input
                              type="email"
                              value={consentData.emailForCopy}
                              onChange={(e) => setConsentData({...consentData, emailForCopy: e.target.value})}
                              placeholder={patient?.email || t('anesthesia.patientDetail.enterPatientEmail')}
                              disabled={isPreOpReadOnly}
                              data-testid="input-email-for-copy"
                            />
                            {!consentData.emailForCopy && !patient?.email && (
                              <p className="text-xs text-muted-foreground">
                                {t('anesthesia.patientDetail.noEmailAvailable')}
                              </p>
                            )}
                          </div>
                          
                          <div className="space-y-2">
                            <Label className="text-sm">{t('anesthesia.patientDetail.documentLanguage', 'Document Language')}</Label>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant={consentData.emailLanguage === 'de' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setConsentData({...consentData, emailLanguage: 'de'})}
                                disabled={isPreOpReadOnly}
                                className="flex items-center gap-2"
                                data-testid="button-email-lang-de"
                              >
                                <span className="text-lg">🇩🇪</span>
                                <span>Deutsch</span>
                              </Button>
                              <Button
                                type="button"
                                variant={consentData.emailLanguage === 'en' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setConsentData({...consentData, emailLanguage: 'en'})}
                                disabled={isPreOpReadOnly}
                                className="flex items-center gap-2"
                                data-testid="button-email-lang-en"
                              >
                                <span className="text-lg">🇬🇧</span>
                                <span>English</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <Button 
                      variant="outline"
                      size="lg" 
                      onClick={() => handleSavePreOpAssessment(false)}
                      disabled={isPreOpReadOnly || createPreOpMutation.isPending || updatePreOpMutation.isPending}
                      data-testid="button-save-consent"
                    >
                      {(createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t('anesthesia.patientDetail.saving')}
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          {t('anesthesia.patientDetail.save')}
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
              </Tabs>
            </ResizablePanel>
            
            {/* Document Preview Panel - shown on large screens when a file is selected */}
            {previewDocument && (
              <div className="hidden lg:contents">
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={40} minSize={25}>
                  <div className="h-full flex flex-col bg-muted/30">
                    <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">{previewDocument.fileName}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => window.open(previewDocument.url, '_blank')}
                          title={t('common.openInNewTab', 'Open in new tab')}
                          data-testid="button-open-document-new-tab"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => setPreviewDocument(null)}
                          title={t('common.close', 'Close')}
                          data-testid="button-close-document-preview"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-hidden p-2">
                      {previewDocument.mimeType?.startsWith('image/') ? (
                        <img 
                          src={previewDocument.url}
                          alt={previewDocument.fileName}
                          className="w-full h-full object-contain"
                          data-testid="preview-image"
                        />
                      ) : previewDocument.mimeType === 'application/pdf' ? (
                        <iframe
                          src={previewDocument.url}
                          className="w-full h-full border-0 rounded"
                          title={previewDocument.fileName}
                          data-testid="preview-pdf"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <div className="text-center">
                            <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                            <p className="text-sm text-muted-foreground">{t('anesthesia.patientDetail.previewNotAvailable', 'Preview not available for this file type')}</p>
                            <Button 
                              variant="outline" 
                              className="mt-4"
                              onClick={() => window.open(previewDocument.url, '_blank')}
                              data-testid="button-download-document"
                            >
                              <Download className="h-4 w-4 mr-2" />
                              {t('common.download', 'Download')}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </ResizablePanel>
              </div>
            )}
          </ResizablePanelGroup>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.editPatient')}</DialogTitle>
            <DialogDescription>{t('anesthesia.patientDetail.updatePatientInfo')}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="personal" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="personal">{t('anesthesia.patients.tabPersonal', 'Personal')}</TabsTrigger>
              <TabsTrigger value="address">{t('anesthesia.patients.tabAddress', 'Address')}</TabsTrigger>
              <TabsTrigger value="medical">{t('anesthesia.patients.tabMedical', 'Medical')}</TabsTrigger>
            </TabsList>
            
            <TabsContent value="personal" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-surname">{t('anesthesia.patients.surname')} *</Label>
                  <Input
                    id="edit-surname"
                    value={editForm.surname}
                    onChange={(e) => setEditForm({ ...editForm, surname: e.target.value })}
                    data-testid="input-edit-surname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-firstName">{t('anesthesia.patients.firstname')} *</Label>
                  <Input
                    id="edit-firstName"
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    data-testid="input-edit-firstName"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-birthday">{t('anesthesia.patients.dateOfBirth')} *</Label>
                  <Input
                    id="edit-birthday"
                    type="text"
                    placeholder="dd.MM.yyyy"
                    value={editForm.birthday ? isoToDisplayDate(editForm.birthday) : ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      const parsed = parseFlexibleDate(value);
                      if (parsed) {
                        setEditForm({ ...editForm, birthday: parsed.isoDate });
                      } else {
                        // Keep the raw value for typing, will be validated on save
                        setEditForm({ ...editForm, birthday: value });
                      }
                    }}
                    onBlur={(e) => {
                      const parsed = parseFlexibleDate(e.target.value);
                      if (parsed) {
                        setEditForm({ ...editForm, birthday: parsed.isoDate });
                      }
                    }}
                    data-testid="input-edit-birthday"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-sex">{t('anesthesia.patients.sex')} *</Label>
                  <Select
                    value={editForm.sex}
                    onValueChange={(value: "M" | "F" | "O") => setEditForm({ ...editForm, sex: value })}
                  >
                    <SelectTrigger data-testid="select-edit-sex">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="M">{t('anesthesia.patients.male')}</SelectItem>
                      <SelectItem value="F">{t('anesthesia.patients.female')}</SelectItem>
                      <SelectItem value="O">{t('anesthesia.patients.other')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="pt-2 text-xs text-muted-foreground">
                * {t('anesthesia.patients.requiredFields', 'Required fields')}
              </div>
            </TabsContent>
            
            <TabsContent value="address" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-email">Email</Label>
                  <Input
                    id="edit-email"
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    data-testid="input-edit-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-phone">{t('anesthesia.patients.phone')}</Label>
                  <PhoneInputWithCountry
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(value) => setEditForm({ ...editForm, phone: value })}
                    data-testid="input-edit-phone"
                  />
                </div>
              </div>

              <AddressAutocomplete
                values={{
                  street: editForm.street,
                  postalCode: editForm.postalCode,
                  city: editForm.city,
                }}
                onChange={(values) => setEditForm({ 
                  ...editForm, 
                  street: values.street, 
                  postalCode: values.postalCode, 
                  city: values.city 
                })}
                showLabels
              />

              <div className="space-y-2">
                <Label htmlFor="edit-emergencyContact">{t('anesthesia.patients.emergencyContact', 'Emergency Contact')}</Label>
                <PhoneInputWithCountry
                  id="edit-emergencyContact"
                  value={editForm.emergencyContact}
                  onChange={(value) => setEditForm({ ...editForm, emergencyContact: value })}
                  data-testid="input-edit-emergencyContact"
                  placeholder="79 123 45 67"
                />
              </div>
            </TabsContent>
            
            <TabsContent value="medical" className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-insuranceProvider">{t('anesthesia.patients.insuranceProvider', 'Insurance Provider')}</Label>
                  <Input
                    id="edit-insuranceProvider"
                    value={editForm.insuranceProvider}
                    onChange={(e) => setEditForm({ ...editForm, insuranceProvider: e.target.value })}
                    data-testid="input-edit-insuranceProvider"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-insuranceNumber">{t('anesthesia.patients.insuranceNumber', 'Insurance Number')}</Label>
                  <Input
                    id="edit-insuranceNumber"
                    value={editForm.insuranceNumber}
                    onChange={(e) => setEditForm({ ...editForm, insuranceNumber: e.target.value })}
                    data-testid="input-edit-insuranceNumber"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{t('anesthesia.patients.allergies', 'Allergies')}</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                    <Badge
                      key={allergy.id}
                      variant={editForm.allergies.includes(allergy.id) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        if (editForm.allergies.includes(allergy.id)) {
                          setEditForm({
                            ...editForm,
                            allergies: editForm.allergies.filter((a) => a !== allergy.id),
                          });
                        } else {
                          setEditForm({
                            ...editForm,
                            allergies: [...editForm.allergies, allergy.id],
                          });
                        }
                      }}
                      data-testid={`badge-edit-allergy-${allergy.id}`}
                    >
                      {allergy.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-otherAllergies">{t('anesthesia.patients.otherAllergies', 'Other Allergies')}</Label>
                <Textarea
                  id="edit-otherAllergies"
                  value={editForm.otherAllergies}
                  onChange={(e) => setEditForm({ ...editForm, otherAllergies: e.target.value })}
                  data-testid="textarea-edit-otherAllergies"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-internalNotes">{t('anesthesia.patients.notes')}</Label>
                <Textarea
                  id="edit-internalNotes"
                  value={editForm.internalNotes}
                  onChange={(e) => setEditForm({ ...editForm, internalNotes: e.target.value })}
                  data-testid="textarea-edit-internalNotes"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsEditDialogOpen(false)}
              data-testid="button-cancel-edit"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                if (!editForm.surname || !editForm.firstName || !editForm.birthday) {
                  toast({
                    title: t('anesthesia.patients.missingFields', 'Missing required fields'),
                    description: t('anesthesia.patients.fillRequiredFields', 'Please fill in Surname, First Name, and Birthday'),
                    variant: "destructive",
                  });
                  return;
                }
                // Parse and validate birthday
                const parsedBirthday = parseFlexibleDate(editForm.birthday);
                if (!parsedBirthday) {
                  toast({
                    title: t('anesthesia.patients.invalidDate', 'Invalid date'),
                    description: t('anesthesia.patients.invalidDateFormat', 'Please enter a valid date (e.g., 02.07.2027 or 020727)'),
                    variant: "destructive",
                  });
                  return;
                }
                updatePatientMutation.mutate({
                  surname: toProperCase(editForm.surname),
                  firstName: toProperCase(editForm.firstName),
                  birthday: parsedBirthday.isoDate,
                  sex: editForm.sex,
                  email: editForm.email || null,
                  phone: editForm.phone || null,
                  address: editForm.address || null,
                  street: editForm.street || null,
                  postalCode: editForm.postalCode || null,
                  city: editForm.city || null,
                  emergencyContact: editForm.emergencyContact || null,
                  insuranceProvider: editForm.insuranceProvider || null,
                  insuranceNumber: editForm.insuranceNumber || null,
                  allergies: editForm.allergies.length > 0 ? editForm.allergies : null,
                  otherAllergies: editForm.otherAllergies || null,
                  internalNotes: editForm.internalNotes || null,
                });
              }}
              disabled={updatePatientMutation.isPending}
              data-testid="button-save-patient-edit"
            >
              {updatePatientMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('anesthesia.patientDetail.saving')}
                </>
              ) : (
                t('anesthesia.patientDetail.saveChanges')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive Patient Confirmation Dialog */}
      <AlertDialog open={isArchiveDialogOpen} onOpenChange={setIsArchiveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.patientDetail.archivePatient', 'Archive Patient')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.patientDetail.archivePatientConfirmation', 'Are you sure you want to archive this patient? The patient will be moved to the archive and will no longer appear in the active patient list.')}
              <br /><br />
              <strong>{t('anesthesia.patientDetail.patient')}: {patient.surname}, {patient.firstName}</strong>
              <br />
              {t('anesthesia.patientDetail.patientId')}: {patient.patientNumber}
              <br /><br />
              {t('anesthesia.patientDetail.archiveInfo', 'Archived patients and their data are preserved and can be restored if needed.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">{t('anesthesia.patientDetail.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => archivePatientMutation.mutate()}
              disabled={archivePatientMutation.isPending}
              data-testid="button-confirm-archive-patient"
            >
              {archivePatientMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('anesthesia.patientDetail.archiving', 'Archiving...')}
                </>
              ) : (
                t('anesthesia.patientDetail.archivePatient', 'Archive Patient')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Signature Pads */}
      <SignaturePad
        isOpen={showAssessmentSignaturePad}
        onClose={() => setShowAssessmentSignaturePad(false)}
        onSave={(signature) => {
          setAssessmentData({...assessmentData, doctorSignature: signature});
          setShowAssessmentSignaturePad(false);
        }}
        title={t('anesthesia.patientDetail.doctorSignatureAssessment')}
      />
      
      <SignaturePad
        isOpen={showConsentDoctorSignaturePad}
        onClose={() => setShowConsentDoctorSignaturePad(false)}
        onSave={(signature) => {
          setConsentData({...consentData, doctorSignature: signature});
          setShowConsentDoctorSignaturePad(false);
        }}
        title={t('anesthesia.patientDetail.doctorSignatureConsent')}
      />
      
      <SignaturePad
        isOpen={showConsentPatientSignaturePad}
        onClose={() => setShowConsentPatientSignaturePad(false)}
        onSave={(signature) => {
          setConsentData({...consentData, patientSignature: signature});
          setShowConsentPatientSignaturePad(false);
        }}
        title={t('anesthesia.patientDetail.patientSignature')}
      />

      {/* Send Questionnaire Dialog */}
      {patient && (
        <SendQuestionnaireDialog
          open={isSendQuestionnaireOpen}
          onOpenChange={setIsSendQuestionnaireOpen}
          patientId={patient.id}
          patientName={`${patient.firstName} ${patient.surname}`}
          patientEmail={patient.email}
          patientPhone={patient.phone}
        />
      )}

      {/* Import from Questionnaire Dialog */}
      <Dialog open={isImportQuestionnaireOpen} onOpenChange={(open) => {
        setIsImportQuestionnaireOpen(open);
        if (!open) setSelectedQuestionnaireForImport(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.importFromQuestionnaire')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.importFromQuestionnaireDesc')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Questionnaire Selection */}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.selectQuestionnaire')}</Label>
              <Select
                value={selectedQuestionnaireForImport || ''}
                onValueChange={(value) => setSelectedQuestionnaireForImport(value)}
              >
                <SelectTrigger data-testid="select-questionnaire-import">
                  <SelectValue placeholder={t('anesthesia.patientDetail.selectQuestionnairePlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {submittedQuestionnaires.map((q) => (
                    <SelectItem key={q.id} value={q.response!.id}>
                      {formatDate(q.submittedAt || q.createdAt)} - {t('anesthesia.patientDetail.submitted')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview of data to import */}
            {isLoadingQuestionnaireResponse && selectedQuestionnaireForImport && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {selectedQuestionnaireResponse?.response && (
              <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium">{t('anesthesia.patientDetail.dataToImport')}</h4>
                
                {(selectedQuestionnaireResponse.response.height || selectedQuestionnaireResponse.response.weight) && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.measurements')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.height && `${t('anesthesia.patientDetail.heightCm')}: ${selectedQuestionnaireResponse.response.height}`}
                    {selectedQuestionnaireResponse.response.height && selectedQuestionnaireResponse.response.weight && ', '}
                    {selectedQuestionnaireResponse.response.weight && `${t('anesthesia.patientDetail.weightKg')}: ${selectedQuestionnaireResponse.response.weight}`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.allergies && selectedQuestionnaireResponse.response.allergies.length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.allergies')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.allergies.join(', ')}
                    {selectedQuestionnaireResponse.response.allergiesNotes && ` (${selectedQuestionnaireResponse.response.allergiesNotes})`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.medications && selectedQuestionnaireResponse.response.medications.length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.medications')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.medications.map(m => m.name).join(', ')}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.smokingStatus && selectedQuestionnaireResponse.response.smokingStatus !== 'never' && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.smoking')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.smokingStatus}
                    {selectedQuestionnaireResponse.response.smokingDetails && ` - ${selectedQuestionnaireResponse.response.smokingDetails}`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.previousSurgeries && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.previousSurgeries')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.previousSurgeries.substring(0, 100)}
                    {selectedQuestionnaireResponse.response.previousSurgeries.length > 100 && '...'}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.previousAnesthesiaProblems && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.previousAnesthesiaProblems')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.previousAnesthesiaProblems.substring(0, 100)}
                    {selectedQuestionnaireResponse.response.previousAnesthesiaProblems.length > 100 && '...'}
                  </div>
                )}

                {/* Medical Conditions */}
                {selectedQuestionnaireResponse.response.conditions && Object.keys(selectedQuestionnaireResponse.response.conditions).length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.medicalConditions', 'Medical Conditions')}:</span>{' '}
                    {Object.entries(selectedQuestionnaireResponse.response.conditions)
                      .filter(([_, value]: [string, any]) => value?.checked)
                      .map(([key, value]: [string, any]) => {
                        const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                        return value?.notes ? `${label} (${value.notes})` : label;
                      })
                      .join(', ') || t('common.none', 'None')
                    }
                  </div>
                )}

                {/* Alcohol Status */}
                {selectedQuestionnaireResponse.response.alcoholStatus && selectedQuestionnaireResponse.response.alcoholStatus !== 'never' && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.alcohol', 'Alcohol')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.alcoholStatus}
                    {selectedQuestionnaireResponse.response.alcoholDetails && ` - ${selectedQuestionnaireResponse.response.alcoholDetails}`}
                  </div>
                )}

                {/* Women's Health */}
                {(selectedQuestionnaireResponse.response.pregnancyStatus || selectedQuestionnaireResponse.response.breastfeeding || selectedQuestionnaireResponse.response.womanHealthNotes) && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.womanHealth', "Women's Health")}:</span>{' '}
                    {[
                      selectedQuestionnaireResponse.response.pregnancyStatus && selectedQuestionnaireResponse.response.pregnancyStatus !== 'not_applicable' && `Pregnancy: ${selectedQuestionnaireResponse.response.pregnancyStatus}`,
                      selectedQuestionnaireResponse.response.breastfeeding && 'Breastfeeding',
                      selectedQuestionnaireResponse.response.womanHealthNotes
                    ].filter(Boolean).join(', ')}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.additionalNotes && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.additionalNotes')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.additionalNotes.substring(0, 100)}
                    {selectedQuestionnaireResponse.response.additionalNotes.length > 100 && '...'}
                  </div>
                )}

                {/* Patient Uploaded Files Section */}
                {selectedQuestionnaireResponse.uploads && selectedQuestionnaireResponse.uploads.length > 0 && (
                  <div className="mt-4 pt-3 border-t">
                    <h5 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      {t('anesthesia.patientDetail.patientUploadedFiles', 'Patient Uploaded Files')} ({selectedQuestionnaireResponse.uploads.length})
                    </h5>
                    <div className="space-y-2">
                      {selectedQuestionnaireResponse.uploads.map((upload) => {
                        const isImage = upload.mimeType?.startsWith('image/');
                        const categoryLabels: Record<string, string> = {
                          medication_list: t('anesthesia.patientDetail.uploadCategoryMedication', 'Medication List'),
                          diagnosis: t('anesthesia.patientDetail.uploadCategoryDiagnosis', 'Diagnosis'),
                          exam_result: t('anesthesia.patientDetail.uploadCategoryExamResult', 'Exam Result'),
                          consent: t('anesthesia.patientDetail.uploadCategoryConsent', 'Consent Form'),
                          lab_result: t('anesthesia.patientDetail.uploadCategoryLabResult', 'Lab Result'),
                          imaging: t('anesthesia.patientDetail.uploadCategoryImaging', 'Imaging'),
                          referral: t('anesthesia.patientDetail.uploadCategoryReferral', 'Referral'),
                          external_report: t('anesthesia.patientDetail.uploadCategoryExternalReport', 'External Report'),
                          other: t('anesthesia.patientDetail.uploadCategoryOther', 'Other'),
                        };
                        return (
                          <div key={upload.id} className="flex items-start gap-3 p-2 bg-background rounded border" data-testid={`upload-item-${upload.id}`}>
                            {isImage ? (
                              <a href={upload.fileUrl} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                <img 
                                  src={upload.fileUrl} 
                                  alt={upload.fileName}
                                  className="w-16 h-16 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                  onError={(e) => {
                                    // Hide the broken image and show placeholder
                                    const target = e.target as HTMLImageElement;
                                    target.style.display = 'none';
                                    const placeholder = target.nextElementSibling as HTMLElement;
                                    if (placeholder) placeholder.style.display = 'flex';
                                  }}
                                />
                                <div className="w-16 h-16 items-center justify-center bg-muted rounded border flex-shrink-0 hidden">
                                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                                </div>
                              </a>
                            ) : (
                              <div className="w-16 h-16 flex items-center justify-center bg-muted rounded border flex-shrink-0">
                                <FileText className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <a 
                                href={upload.fileUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-sm font-medium hover:underline text-primary truncate block"
                                data-testid={`link-upload-${upload.id}`}
                              >
                                {upload.fileName}
                              </a>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Badge variant="secondary" className="text-xs">
                                  {categoryLabels[upload.category] || upload.category}
                                </Badge>
                                {upload.fileSize && (
                                  <span>{(upload.fileSize / 1024).toFixed(1)} KB</span>
                                )}
                              </div>
                              {upload.description && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{upload.description}</p>
                              )}
                            </div>
                            <a 
                              href={upload.fileUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="flex-shrink-0"
                            >
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                <Download className="h-4 w-4" />
                              </Button>
                            </a>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsImportQuestionnaireOpen(false);
                setSelectedQuestionnaireForImport(null);
              }}
              data-testid="button-cancel-import"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleImportFromQuestionnaire}
              disabled={!selectedQuestionnaireResponse?.response}
              data-testid="button-confirm-import"
            >
              <Import className="h-4 w-4 mr-2" />
              {t('anesthesia.patientDetail.importData')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Find & Associate Questionnaire Dialog */}
      <Dialog open={isFindQuestionnaireOpen} onOpenChange={(open) => {
        setIsFindQuestionnaireOpen(open);
        if (!open) {
          setSelectedUnassociatedQuestionnaire(null);
          setQuestionnaireSearchTerm("");
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.findQuestionnaire', 'Find & Associate Questionnaire')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.findQuestionnaireDesc', 'Search for an unassociated questionnaire filled by a walk-in patient and link it to this patient.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.searchQuestionnaires', 'Search by patient name')}</Label>
              <Input
                placeholder={t('anesthesia.patientDetail.searchQuestionnairesPlaceholder', 'Enter name or birthday...')}
                value={questionnaireSearchTerm}
                onChange={(e) => setQuestionnaireSearchTerm(e.target.value)}
                data-testid="input-search-questionnaires"
              />
            </div>

            {/* Current Patient Info */}
            {patient && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm font-medium text-primary">
                  {t('anesthesia.patientDetail.associatingTo', 'Will associate to:')}
                </p>
                <p className="text-sm">
                  {patient.firstName} {patient.surname} ({isoToDisplayDate(patient.birthday)})
                </p>
              </div>
            )}

            {/* List of Unassociated Questionnaires */}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.availableQuestionnaires', 'Available unassociated questionnaires')}</Label>
              
              {isLoadingUnassociated ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : unassociatedQuestionnaires.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('anesthesia.patientDetail.noUnassociatedQuestionnaires', 'No unassociated questionnaires found')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {unassociatedQuestionnaires
                    .filter(q => {
                      if (!questionnaireSearchTerm.trim()) return true;
                      const search = questionnaireSearchTerm.toLowerCase();
                      const fullName = `${q.patientFirstName || ''} ${q.patientSurname || ''}`.toLowerCase();
                      const birthday = q.patientBirthday ? isoToDisplayDate(q.patientBirthday) : '';
                      return fullName.includes(search) || birthday.includes(search);
                    })
                    .map((q) => {
                      const isSelected = selectedUnassociatedQuestionnaire === q.id;
                      // Check if this questionnaire seems to match the current patient
                      const matchesName = patient && 
                        q.patientFirstName?.toLowerCase() === patient.firstName?.toLowerCase() &&
                        q.patientSurname?.toLowerCase() === patient.surname?.toLowerCase();
                      const matchesBirthday = patient && q.patientBirthday && 
                        new Date(q.patientBirthday).toISOString().split('T')[0] === new Date(patient.birthday).toISOString().split('T')[0];
                      const isExactMatch = matchesName && matchesBirthday;
                      const isPartialMatch = matchesName || matchesBirthday;
                      
                      return (
                        <div
                          key={q.id}
                          onClick={() => setSelectedUnassociatedQuestionnaire(q.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            isSelected 
                              ? 'border-primary bg-primary/5' 
                              : isExactMatch
                                ? 'border-green-500 bg-green-50 dark:bg-green-950 hover:bg-green-100 dark:hover:bg-green-900'
                                : isPartialMatch
                                  ? 'border-amber-400 bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900'
                                  : 'border-border hover:bg-muted/50'
                          }`}
                          data-testid={`questionnaire-row-${q.id}`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">
                                {q.patientFirstName || t('common.unknown', 'Unknown')} {q.patientSurname || ''}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {q.patientBirthday ? isoToDisplayDate(q.patientBirthday) : t('common.noBirthday', 'No birthday')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {t('anesthesia.patientDetail.submittedOn', 'Submitted')}
                              </p>
                              <p className="text-sm">
                                {q.submittedAt || q.link.submittedAt 
                                  ? formatDate(q.submittedAt || q.link.submittedAt!) 
                                  : formatDate(q.link.createdAt)}
                              </p>
                            </div>
                          </div>
                          {isExactMatch && (
                            <Badge variant="default" className="mt-2 bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              {t('anesthesia.patientDetail.exactMatch', 'Exact Match')}
                            </Badge>
                          )}
                          {isPartialMatch && !isExactMatch && (
                            <Badge variant="secondary" className="mt-2 bg-amber-500 text-white">
                              {t('anesthesia.patientDetail.partialMatch', 'Partial Match')}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsFindQuestionnaireOpen(false);
                setSelectedUnassociatedQuestionnaire(null);
                setQuestionnaireSearchTerm("");
              }}
              data-testid="button-cancel-find-questionnaire"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() => {
                if (selectedUnassociatedQuestionnaire && patient) {
                  associateQuestionnaireMutation.mutate({
                    responseId: selectedUnassociatedQuestionnaire,
                    patientId: patient.id,
                  });
                }
              }}
              disabled={!selectedUnassociatedQuestionnaire || associateQuestionnaireMutation.isPending}
              data-testid="button-confirm-associate"
            >
              {associateQuestionnaireMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              {t('anesthesia.patientDetail.confirmAssociate', 'Associate & Import')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document Upload Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.uploadDocument', 'Upload Document')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.uploadDocumentDesc', 'Select a document category and upload a file.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.documentCategory', 'Category')}</Label>
              <Select value={uploadCategory} onValueChange={(val: StaffDocument['category']) => setUploadCategory(val)}>
                <SelectTrigger data-testid="select-document-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medication_list">{t('anesthesia.patientDetail.uploadCategoryMedication', 'Medication List')}</SelectItem>
                  <SelectItem value="diagnosis">{t('anesthesia.patientDetail.uploadCategoryDiagnosis', 'Diagnosis')}</SelectItem>
                  <SelectItem value="exam_result">{t('anesthesia.patientDetail.uploadCategoryExamResult', 'Exam Result')}</SelectItem>
                  <SelectItem value="consent">{t('anesthesia.patientDetail.uploadCategoryConsent', 'Consent Form')}</SelectItem>
                  <SelectItem value="lab_result">{t('anesthesia.patientDetail.uploadCategoryLabResult', 'Lab Result')}</SelectItem>
                  <SelectItem value="imaging">{t('anesthesia.patientDetail.uploadCategoryImaging', 'Imaging')}</SelectItem>
                  <SelectItem value="referral">{t('anesthesia.patientDetail.uploadCategoryReferral', 'Referral')}</SelectItem>
                  <SelectItem value="external_report">{t('anesthesia.patientDetail.uploadCategoryExternalReport', 'External Report')}</SelectItem>
                  <SelectItem value="other">{t('anesthesia.patientDetail.uploadCategoryOther', 'Other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.documentDescription', 'Description (optional)')}</Label>
              <Textarea 
                value={uploadDescription} 
                onChange={(e) => setUploadDescription(e.target.value)}
                placeholder={t('anesthesia.patientDetail.documentDescriptionPlaceholder', 'Add a short description...')}
                data-testid="input-document-description"
              />
            </div>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*,application/pdf,.doc,.docx,.txt"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleFileUpload(file);
                }
                e.target.value = '';
              }}
            />
            <Button 
              className="w-full" 
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              data-testid="button-select-file"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('anesthesia.patientDetail.uploading', 'Uploading...')}
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('anesthesia.patientDetail.selectFile', 'Select File')}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Camera Capture Dialog for Notes */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[9999] bg-black">
          <CameraCapture
            isOpen={isCameraOpen}
            onClose={() => setIsCameraOpen(false)}
            onCapture={handleNoteCameraCapture}
            fullFrame={true}
          />
        </div>
      )}

      {/* Delete Document Confirmation Dialog */}
      <AlertDialog open={!!documentToDelete} onOpenChange={(open) => !open && setDocumentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.patientDetail.deleteDocument', 'Delete Document')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.patientDetail.deleteDocumentConfirm', 'Are you sure you want to delete "{fileName}"? This action cannot be undone.', { fileName: documentToDelete?.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-document">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => documentToDelete && deleteDocumentMutation.mutate(documentToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-document"
            >
              {deleteDocumentMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.deleting', 'Deleting...')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Patient Upload Confirmation Dialog */}
      <AlertDialog open={!!patientUploadToDelete} onOpenChange={(open) => !open && setPatientUploadToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.patientDetail.deleteDocument', 'Delete Document')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.patientDetail.deleteDocumentConfirm', 'Are you sure you want to delete "{fileName}"? This action cannot be undone.', { fileName: patientUploadToDelete?.fileName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-patient-upload">
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => patientUploadToDelete && deletePatientUploadMutation.mutate(patientUploadToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-patient-upload"
            >
              {deletePatientUploadMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.deleting', 'Deleting...')}
                </>
              ) : (
                t('common.delete')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Standalone Document Preview Dialog - shown when viewing documents outside Pre-OP dialog */}
      <Dialog open={!!previewDocument && !isPreOpOpen} onOpenChange={(open) => !open && setPreviewDocument(null)}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium truncate">{previewDocument?.fileName}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => previewDocument && window.open(previewDocument.url, '_blank')}
                data-testid="button-open-document-new-tab"
              >
                <Download className="h-4 w-4 mr-2" />
                {t('common.download', 'Download')}
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4 bg-muted/30">
            {previewDocument?.mimeType?.startsWith('image/') ? (
              <img 
                src={previewDocument.url}
                alt={previewDocument.fileName}
                className="w-full h-full object-contain"
                data-testid="preview-image"
              />
            ) : previewDocument?.mimeType === 'application/pdf' ? (
              <iframe
                src={previewDocument.url}
                className="w-full h-full border-0 rounded"
                title={previewDocument.fileName}
                data-testid="preview-pdf"
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <FileText className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-4">{t('anesthesia.patientDetail.previewNotAvailable', 'Preview not available for this file type')}</p>
                  <Button onClick={() => previewDocument && window.open(previewDocument.url, '_blank')} data-testid="button-download-file">
                    <Download className="h-4 w-4 mr-2" />
                    {t('common.download', 'Download')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
