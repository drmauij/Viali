import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus, Mail, Phone, AlertCircle, FileText as NoteIcon, Cake, UserCircle, UserRound, ClipboardList, Activity, BedDouble, X, Download, Loader2, Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect, useRef } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Surgery } from "@shared/schema";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { formatDate, formatDateTimeForInput } from "@/lib/dateUtils";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import SignaturePad from "@/components/SignaturePad";

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
};

export default function PatientDetail() {
  const [, params] = useRoute("/anesthesia/patients/:id");
  const [, setLocation] = useLocation();
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isPreOpOpen, setIsPreOpOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [isPatientCardVisible, setIsPatientCardVisible] = useState(true);
  const patientCardRef = useRef<HTMLDivElement>(null);
  const activeHospital = useActiveHospital();
  const { user } = useAuth();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  // Track if Pre-OP dialog was opened via URL navigation (should use history.back()) or button click (just close)
  const preOpOpenedViaUrl = useRef(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    surname: "",
    firstName: "",
    birthday: "",
    sex: "M" as "M" | "F" | "O",
    email: "",
    phone: "",
    address: "",
    emergencyContact: "",
    insuranceProvider: "",
    insuranceNumber: "",
    allergies: [] as string[],
    otherAllergies: "",
    internalNotes: "",
  });
  
  // Fetch patient data from API
  const { data: patient, isLoading, error } = useQuery<Patient>({
    queryKey: [`/api/patients/${params?.id}`],
    enabled: !!params?.id,
  });

  // Fetch surgeries for this patient
  const { 
    data: surgeries, 
    isLoading: isLoadingSurgeries,
    error: surgeriesError 
  } = useQuery<Surgery[]>({
    queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${params?.id}`],
    enabled: !!params?.id && !!activeHospital?.id,
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
  const [newCase, setNewCase] = useState({
    plannedSurgery: "",
    surgeon: "",
    plannedDate: "",
    surgeryRoomId: "",
    duration: 180, // Default 3 hours in minutes
    notes: "",
  });
  const [editingCaseId, setEditingCaseId] = useState<string | null>(null);
  const [editCase, setEditCase] = useState({
    plannedSurgery: "",
    surgeon: "",
    plannedDate: "",
    surgeryRoomId: "",
    duration: 180,
    notes: "",
  });
  const [deleteDialogSurgeryId, setDeleteDialogSurgeryId] = useState<string | null>(null);
  const [consentData, setConsentData] = useState({
    general: false,
    regional: false,
    installations: false,
    icuAdmission: false,
    date: new Date().toISOString().split('T')[0],
    doctorSignature: "",
    patientSignature: "",
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
    
    // Woman (Gynecological) - dynamically initialized from settings
    womanIssues: {} as Record<string, boolean>,
    womanNotes: "",
    
    // Noxen (Substances) - dynamically initialized from settings
    noxen: {} as Record<string, boolean>,
    noxenNotes: "",
    
    // Children (Pediatric) - dynamically initialized from settings
    childrenIssues: {} as Record<string, boolean>,
    childrenNotes: "",
    
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
    
    // Surgical Approval Status
    surgicalApprovalStatus: "", // "approved", "standby-ekg", "standby-labs", "standby-other", "not-approved"
    
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
      plannedDate: string;
      surgeryRoomId?: string | null;
      actualEndTime?: string;
    }) => {
      return await apiRequest("POST", "/api/anesthesia/surgeries", surgeryData);
    },
    onSuccess: () => {
      // Invalidate patient-specific surgeries query
      queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${params?.id}`] 
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
        title: "Surgery created",
        description: "The surgery has been successfully created.",
      });
      setIsCreateCaseOpen(false);
      setNewCase({ plannedSurgery: "", surgeon: "", plannedDate: "", surgeryRoomId: "", duration: 180, notes: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create surgery",
        variant: "destructive",
      });
    },
  });

  // Mutation to update a surgery
  const updateSurgeryMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<{
      plannedSurgery: string;
      surgeon: string | null;
      plannedDate: string;
      surgeryRoomId: string | null;
      actualEndTime: string;
    }> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, data);
    },
    onSuccess: () => {
      // Invalidate patient-specific surgeries query
      queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${params?.id}`] 
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
        title: "Surgery updated",
        description: "The surgery has been successfully updated.",
      });
      setEditingCaseId(null);
      setEditCase({ plannedSurgery: "", surgeon: "", plannedDate: "", surgeryRoomId: "", duration: 180 });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update surgery",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a surgery
  const deleteSurgeryMutation = useMutation({
    mutationFn: async (surgeryId: string) => {
      return await apiRequest("DELETE", `/api/anesthesia/surgeries/${surgeryId}`);
    },
    onSuccess: () => {
      // Invalidate patient-specific surgeries query
      queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/surgeries?hospitalId=${activeHospital?.id}&patientId=${params?.id}`] 
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
        title: "Surgery deleted",
        description: "The surgery has been successfully deleted.",
      });
      setDeleteDialogSurgeryId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete surgery",
        variant: "destructive",
      });
    },
  });

  // Mutation to update a patient
  const updatePatientMutation = useMutation({
    mutationFn: async (patientData: Partial<Patient>) => {
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
        title: "Patient updated",
        description: "The patient has been successfully updated.",
      });
      setIsEditDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update patient",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a patient
  const deletePatientMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("DELETE", `/api/patients/${patient?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/patients');
        }
      });
      toast({
        title: "Patient deleted",
        description: "The patient has been successfully deleted.",
      });
      setLocation("/anesthesia/patients");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete patient",
        variant: "destructive",
      });
    },
  });

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
    
    if (existingAssessment && isPreOpOpen) {
      setAssessmentData({
        height: existingAssessment.height || "",
        weight: existingAssessment.weight || "",
        allergies: existingAssessment.allergies || patient?.allergies || [],
        allergiesOther: existingAssessment.allergiesOther || "",
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
        womanIssues: mergeIllnessData(existingAssessment.womanIssues, anesthesiaSettings?.illnessLists?.woman),
        womanNotes: existingAssessment.womanNotes || "",
        noxen: mergeIllnessData(existingAssessment.noxen, anesthesiaSettings?.illnessLists?.noxen),
        noxenNotes: existingAssessment.noxenNotes || "",
        childrenIssues: mergeIllnessData(existingAssessment.childrenIssues, anesthesiaSettings?.illnessLists?.children),
        childrenNotes: existingAssessment.childrenNotes || "",
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
        assessmentDate: existingAssessment.assessmentDate || new Date().toISOString().split('T')[0],
        doctorName: existingAssessment.doctorName || currentUserName,
        doctorSignature: existingAssessment.doctorSignature || "",
      });

      setConsentData({
        general: existingAssessment.consentGiven || false,
        regional: existingAssessment.consentRegional || false,
        installations: existingAssessment.consentInstallations || false,
        icuAdmission: existingAssessment.consentICU || false,
        date: existingAssessment.consentDate || new Date().toISOString().split('T')[0],
        doctorSignature: existingAssessment.consentDoctorSignature || "",
        patientSignature: existingAssessment.patientSignature || "",
      });
    } else if (isPreOpOpen && !existingAssessment && patient) {
      // Reset form with patient allergies and current user's name for new assessments
      setAssessmentData(prev => ({
        ...prev,
        allergies: patient.allergies || [],
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
        womanIssues: createEmptyIllnessState(lists.woman),
        noxen: createEmptyIllnessState(lists.noxen),
        childrenIssues: createEmptyIllnessState(lists.children),
      }));
    }
  }, [existingAssessment, isPreOpOpen, anesthesiaSettings]);

  // Mutation to create pre-op assessment
  const createPreOpMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/anesthesia/preop", {
        surgeryId: selectedCaseId,
        ...data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`] });
      toast({
        title: "Saved",
        description: "Pre-op assessment saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save assessment",
        variant: "destructive",
      });
    },
  });

  // Mutation to update pre-op assessment
  const updatePreOpMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PATCH", `/api/anesthesia/preop/${existingAssessment?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${selectedCaseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop?hospitalId=${activeHospital?.id}`] });
      toast({
        title: "Updated",
        description: "Pre-op assessment updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update assessment",
        variant: "destructive",
      });
    },
  });

  const handleCreateCase = () => {
    if (!newCase.plannedSurgery || !newCase.plannedDate) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Planned Surgery and Planned Date",
        variant: "destructive",
      });
      return;
    }

    // Validate duration
    if (!newCase.duration || newCase.duration <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Duration must be greater than 0 minutes.",
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
      plannedDate: newCase.plannedDate,
      surgeryRoomId: newCase.surgeryRoomId || null,
      actualEndTime: endDate.toISOString(),
      notes: newCase.notes || null,
    };
    
    console.log("Creating surgery with data:", surgeryData);
    createSurgeryMutation.mutate(surgeryData);
  };

  const handleEditCase = (surgery: any) => {
    setEditingCaseId(surgery.id);
    
    // Calculate duration from existing start and end times
    let duration = 180; // Default 3 hours
    if (surgery.plannedDate && surgery.actualEndTime) {
      const start = new Date(surgery.plannedDate);
      const end = new Date(surgery.actualEndTime);
      const diffMs = end.getTime() - start.getTime();
      duration = Math.round(diffMs / (1000 * 60)); // Convert ms to minutes
    }
    
    setEditCase({
      plannedSurgery: surgery.plannedSurgery,
      surgeon: surgery.surgeon || "",
      plannedDate: formatDateTimeForInput(surgery.plannedDate),
      surgeryRoomId: surgery.surgeryRoomId || "",
      duration: duration,
      notes: surgery.notes || "",
    });
  };

  const handleUpdateCase = () => {
    if (!editCase.plannedSurgery || !editCase.plannedDate) {
      toast({
        title: "Missing required fields",
        description: "Please fill in Planned Surgery and Planned Date",
        variant: "destructive",
      });
      return;
    }

    // Validate duration
    if (!editCase.duration || editCase.duration <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Duration must be greater than 0 minutes.",
        variant: "destructive",
      });
      return;
    }

    if (!editingCaseId) return;

    // Calculate end time from start time + duration
    const startDate = new Date(editCase.plannedDate);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + editCase.duration);

    const updateData = {
      plannedSurgery: editCase.plannedSurgery,
      surgeon: editCase.surgeon || null,
      plannedDate: editCase.plannedDate,
      surgeryRoomId: editCase.surgeryRoomId || null,
      actualEndTime: endDate.toISOString(),
      notes: editCase.notes || null,
    };

    updateSurgeryMutation.mutate({ id: editingCaseId, data: updateData });
  };

  const handleDeleteCase = () => {
    if (!deleteDialogSurgeryId) return;
    deleteSurgeryMutation.mutate(deleteDialogSurgeryId);
  };

  const handleSavePreOpAssessment = async (markAsCompleted = false, overrideData: any = {}) => {
    const data = {
      ...assessmentData,
      ...overrideData, // Allow overriding specific fields (like signature)
      surgicalApproval: assessmentData.surgicalApprovalStatus,
      // Format consent data fields
      consentGiven: consentData.general,
      consentRegional: consentData.regional,
      consentInstallations: consentData.installations,
      consentICU: consentData.icuAdmission,
      consentDate: consentData.date,
      consentDoctorSignature: consentData.doctorSignature,
      patientSignature: consentData.patientSignature,
      // Set status - completed if explicitly marked or if signature present
      status: markAsCompleted ? "completed" : ((overrideData.doctorSignature || assessmentData.doctorSignature) ? "completed" : "draft"),
    };

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
        title: "Missing ASA Classification",
        description: "Please select ASA classification before completing the assessment",
        variant: "destructive",
      });
      return;
    }

    if (!assessmentData.doctorName) {
      toast({
        title: "Missing Doctor Name",
        description: "Please enter your name before completing the assessment",
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
           assessmentData.surgicalApprovalStatus.trim() !== "";
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
  
  const hasMedicationsData = () => {
    return assessmentData.anticoagulationMeds.length > 0 ||
           assessmentData.anticoagulationMedsOther.trim() !== "" ||
           assessmentData.generalMeds.length > 0 ||
           assessmentData.generalMedsOther.trim() !== "" ||
           assessmentData.medicationsNotes.trim() !== "";
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

  // Loading state
  if (isLoading) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-patient" />
              <p className="text-muted-foreground">Loading patient data...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error || !patient) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>
        </Link>
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <AlertCircle className="h-8 w-8 text-destructive" data-testid="icon-error" />
              <p className="text-foreground font-semibold" data-testid="text-error">Patient not found</p>
              <p className="text-sm text-muted-foreground">The patient you're looking for doesn't exist or has been removed.</p>
              <Link href="/anesthesia/patients">
                <Button className="mt-4" data-testid="button-back-to-patients">
                  Back to Patients
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      {/* Sticky Patient Header */}
      {!isPatientCardVisible && (
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
            Back to Patients
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
              <div className="flex items-center gap-2">
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
                  variant="destructive"
                  size="icon"
                  onClick={() => setIsDeleteDialogOpen(true)}
                  data-testid="button-delete-patient"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Contact Information */}
            {(patient.email || patient.phone) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {patient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium" data-testid="text-patient-email">{patient.email}</p>
                      </div>
                    </div>
                  )}
                  {patient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
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
                  Allergies
                </h3>
                <div className="space-y-2">
                  {patient.allergies && patient.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2" data-testid="container-allergies">
                      {patient.allergies.map((allergy) => (
                        <Badge key={allergy} variant="destructive" className="text-xs" data-testid={`badge-allergy-${allergy.toLowerCase()}`}>
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {patient.otherAllergies && (
                    <p className="text-sm text-muted-foreground" data-testid="text-other-allergies">{patient.otherAllergies}</p>
                  )}
                </div>
              </div>
            )}

            {/* Internal Notes */}
            {patient.internalNotes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <NoteIcon className="h-5 w-5 text-muted-foreground" />
                  Internal Notes
                </h3>
                <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md" data-testid="text-internal-notes">{patient.internalNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Surgeries ({surgeries?.length || 0})</h2>
        <Dialog open={isCreateCaseOpen} onOpenChange={setIsCreateCaseOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-case">
              <Plus className="h-4 w-4" />
              New Surgery
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Surgery</DialogTitle>
              <DialogDescription>Schedule a new surgery for this patient</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="surgery">Planned Surgery</Label>
                <Input
                  id="surgery"
                  placeholder="e.g., Laparoscopic Cholecystectomy"
                  value={newCase.plannedSurgery}
                  onChange={(e) => setNewCase({ ...newCase, plannedSurgery: e.target.value })}
                  data-testid="input-planned-surgery"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="surgeon">Surgeon <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Select 
                  value={newCase.surgeon || "none"} 
                  onValueChange={(value) => setNewCase({ ...newCase, surgeon: value === "none" ? "" : value })}
                  disabled={isLoadingSurgeons}
                >
                  <SelectTrigger data-testid="select-surgeon">
                    <SelectValue placeholder={isLoadingSurgeons ? "Loading surgeons..." : "Select surgeon (optional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground italic">No surgeon selected</span>
                    </SelectItem>
                    {isLoadingSurgeons ? (
                      <SelectItem value="loading" disabled>
                        Loading surgeons...
                      </SelectItem>
                    ) : surgeons.length === 0 ? (
                      <SelectItem value="no-surgeons" disabled>
                        No surgeons available
                      </SelectItem>
                    ) : (
                      surgeons.map((surgeon) => (
                        <SelectItem key={surgeon.id} value={surgeon.name}>
                          {surgeon.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="surgery-room">Surgery Room <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Select 
                  value={newCase.surgeryRoomId || "none"} 
                  onValueChange={(value) => setNewCase({ ...newCase, surgeryRoomId: value === "none" ? "" : value })}
                  disabled={isLoadingSurgeryRooms}
                >
                  <SelectTrigger data-testid="select-surgery-room">
                    <SelectValue placeholder={isLoadingSurgeryRooms ? "Loading rooms..." : "Select surgery room (optional)"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground italic">No room selected</span>
                    </SelectItem>
                    {isLoadingSurgeryRooms ? (
                      <SelectItem value="loading" disabled>
                        Loading rooms...
                      </SelectItem>
                    ) : surgeryRooms.length === 0 ? (
                      <SelectItem value="no-rooms" disabled>
                        No surgery rooms available
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
                <Label htmlFor="date">Planned Date</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={newCase.plannedDate}
                  onChange={(e) => setNewCase({ ...newCase, plannedDate: e.target.value })}
                  data-testid="input-planned-date"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Duration (minutes)</Label>
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
                <Label htmlFor="notes">Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="notes"
                  placeholder="Enter notes about antibiotics, patient position, etc."
                  value={newCase.notes}
                  onChange={(e) => setNewCase({ ...newCase, notes: e.target.value })}
                  data-testid="textarea-notes"
                  rows={3}
                />
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
                    Creating...
                  </>
                ) : (
                  "Create Surgery"
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Surgery Dialog */}
      <Dialog open={!!editingCaseId} onOpenChange={(open) => !open && setEditingCaseId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Surgery</DialogTitle>
            <DialogDescription>Update surgery details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-surgery">Planned Surgery</Label>
              <Input
                id="edit-surgery"
                placeholder="e.g., Laparoscopic Cholecystectomy"
                value={editCase.plannedSurgery}
                onChange={(e) => setEditCase({ ...editCase, plannedSurgery: e.target.value })}
                data-testid="input-edit-planned-surgery"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-surgeon">Surgeon <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select 
                value={editCase.surgeon || "none"} 
                onValueChange={(value) => setEditCase({ ...editCase, surgeon: value === "none" ? "" : value })}
                disabled={isLoadingSurgeons}
              >
                <SelectTrigger data-testid="select-edit-surgeon">
                  <SelectValue placeholder={isLoadingSurgeons ? "Loading surgeons..." : "Select surgeon (optional)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground italic">No surgeon selected</span>
                  </SelectItem>
                  {isLoadingSurgeons ? (
                    <SelectItem value="loading" disabled>
                      Loading surgeons...
                    </SelectItem>
                  ) : surgeons.length === 0 ? (
                    <SelectItem value="no-surgeons" disabled>
                      No surgeons available
                    </SelectItem>
                  ) : (
                    surgeons.map((surgeon) => (
                      <SelectItem key={surgeon.id} value={surgeon.name}>
                        {surgeon.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-surgery-room">Surgery Room <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Select 
                value={editCase.surgeryRoomId || "none"} 
                onValueChange={(value) => setEditCase({ ...editCase, surgeryRoomId: value === "none" ? "" : value })}
                disabled={isLoadingSurgeryRooms}
              >
                <SelectTrigger data-testid="select-edit-surgery-room">
                  <SelectValue placeholder={isLoadingSurgeryRooms ? "Loading rooms..." : "Select surgery room (optional)"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground italic">No room selected</span>
                  </SelectItem>
                  {isLoadingSurgeryRooms ? (
                    <SelectItem value="loading" disabled>
                      Loading rooms...
                    </SelectItem>
                  ) : surgeryRooms.length === 0 ? (
                    <SelectItem value="no-rooms" disabled>
                      No surgery rooms available
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
              <Label htmlFor="edit-date">Planned Date</Label>
              <Input
                id="edit-date"
                type="datetime-local"
                value={editCase.plannedDate}
                onChange={(e) => setEditCase({ ...editCase, plannedDate: e.target.value })}
                data-testid="input-edit-planned-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-duration">Duration (minutes)</Label>
              <Input
                id="edit-duration"
                type="number"
                min="1"
                value={editCase.duration}
                onChange={(e) => setEditCase({ ...editCase, duration: parseInt(e.target.value) || 0 })}
                data-testid="input-edit-duration"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes <span className="text-xs text-muted-foreground">(optional)</span></Label>
              <Textarea
                id="edit-notes"
                placeholder="Enter notes about antibiotics, patient position, etc."
                value={editCase.notes}
                onChange={(e) => setEditCase({ ...editCase, notes: e.target.value })}
                data-testid="textarea-edit-notes"
                rows={3}
              />
            </div>
            <Button 
              onClick={handleUpdateCase} 
              className="w-full" 
              data-testid="button-submit-edit-case"
              disabled={updateSurgeryMutation.isPending}
            >
              {updateSurgeryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Surgery"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Surgery Confirmation Dialog */}
      <AlertDialog open={!!deleteDialogSurgeryId} onOpenChange={(open) => !open && setDeleteDialogSurgeryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Surgery?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the surgery record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-surgery">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCase}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-surgery"
              disabled={deleteSurgeryMutation.isPending}
            >
              {deleteSurgeryMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                      onClick={() => handleEditCase(surgery)}
                      data-testid={`button-edit-surgery-${surgery.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteDialogSurgeryId(surgery.id)}
                      data-testid={`button-delete-surgery-${surgery.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Surgery</p>
                    <p className="font-medium">{surgery.plannedSurgery}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Surgeon</p>
                    <p className="font-medium">{surgery.surgeon || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Room</p>
                    <p className="font-medium">
                      {surgery.surgeryRoomId 
                        ? surgeryRooms.find(r => r.id === surgery.surgeryRoomId)?.name || surgery.surgeryRoomId
                        : 'Not assigned'}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Planned Date</p>
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

                <div className="grid grid-cols-3 gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => {
                      setSelectedCaseId(surgery.id);
                      // Auto-fill allergies from patient
                      setAssessmentData(prev => ({
                        ...prev,
                        allergies: patient.allergies || [],
                      }));
                      // Mark that this was opened via button click, not URL
                      preOpOpenedViaUrl.current = false;
                      setIsPreOpOpen(true);
                    }}
                    data-testid={`button-preop-${surgery.id}`}
                  >
                    <ClipboardList className="h-10 w-10 text-primary" />
                    <span className="text-sm font-medium">Pre-OP</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => setLocation(`/anesthesia/cases/${surgery.id}/op`)}
                    data-testid={`button-op-${surgery.id}`}
                  >
                    <Activity className="h-10 w-10 text-primary" />
                    <span className="text-sm font-medium">OP</span>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => setLocation(`/anesthesia/cases/${surgery.id}/pacu`)}
                    disabled={!(surgery as any).timeMarkers?.find((m: any) => m.code === 'A2' && m.time !== null)}
                    data-testid={`button-pacu-${surgery.id}`}
                  >
                    <BedDouble className={`h-10 w-10 ${(surgery as any).timeMarkers?.find((m: any) => m.code === 'A2' && m.time !== null) ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="text-sm font-medium">PACU</span>
                  </Button>
                </div>
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

      {/* Pre-OP Full Screen Dialog */}
      <Dialog open={isPreOpOpen} onOpenChange={(open) => {
        if (!open) {
          // If opened via URL navigation, use history.back() to return to previous page
          // If opened via button click, just close the dialog
          if (preOpOpenedViaUrl.current && window.history.length > 1) {
            window.history.back();
          } else {
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
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  // If opened via URL navigation, use history.back() to return to previous page
                  // If opened via button click, just close the dialog
                  if (preOpOpenedViaUrl.current && window.history.length > 1) {
                    window.history.back();
                  } else {
                    setIsPreOpOpen(false);
                  }
                }}
                className="absolute right-2 top-2 md:right-4 md:top-4 z-10"
                data-testid="button-close-preop-dialog"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex items-center gap-3">
              {patient.sex === "M" ? (
                <UserCircle className="h-8 w-8 text-blue-500" data-testid="icon-preop-sex-male" />
              ) : (
                <UserRound className="h-8 w-8 text-pink-500" data-testid="icon-preop-sex-female" />
              )}
              <div className="text-left">
                <p className="font-semibold text-base text-left" data-testid="text-preop-patient-name">{patient.surname}, {patient.firstName}</p>
                <p className="text-xs text-muted-foreground text-left" data-testid="text-preop-patient-info">
                  {formatDate(patient.birthday)} ({calculateAge(patient.birthday)} y) • ID: {patient.patientNumber}
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <Tabs defaultValue="assessment" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 shrink-0">
              <div className="mb-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="assessment" data-testid="tab-assessment">Pre-OP Assessment</TabsTrigger>
                  <TabsTrigger value="consent" data-testid="tab-consent">Informed Consent</TabsTrigger>
                </TabsList>
              </div>
            </div>
            
            <TabsContent value="assessment" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
              <div className="flex justify-end mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSectionIds = ["general", "medications", "heart", "lungs", "gi-kidney-metabolic", "neuro-psych-skeletal", "woman", "noxen", "children", "anesthesia"];
                    // Get only filled sections
                    const filledSections = allSectionIds.filter(id => {
                      if (id === "general") return hasGeneralData();
                      if (id === "medications") return hasMedicationsData();
                      if (id === "heart") return hasHeartData();
                      if (id === "lungs") return hasLungData();
                      if (id === "gi-kidney-metabolic") return hasGIKidneyMetabolicData();
                      if (id === "neuro-psych-skeletal") return hasNeuroPsychSkeletalData();
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
                      Collapse All
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4" />
                      Expand All
                    </>
                  )}
                </Button>
              </div>

              {/* Planned Surgery Card (Non-collapsible) */}
              <Card className="bg-primary/5 dark:bg-primary/10 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-primary">Planned Surgery Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Planned Surgery</p>
                      <p className="font-semibold text-base">{surgeries?.find(s => s.id === selectedCaseId)?.plannedSurgery || selectedCaseId}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Surgeon</p>
                      <p className="font-semibold text-base">{surgeries?.find(s => s.id === selectedCaseId)?.surgeon || 'Not assigned'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Planned Date</p>
                      <p className="font-semibold text-base">
                        {(() => {
                          const plannedDate = surgeries?.find(s => s.id === selectedCaseId)?.plannedDate;
                          if (!plannedDate) return 'Not scheduled';
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
                  <Card className={hasGeneralData() ? "border-white dark:border-white" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general">
                      <CardTitle className="text-lg">General Data</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="space-y-4 pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <Label>Height (cm)</Label>
                            <Input
                              type="number"
                              value={assessmentData.height}
                              onChange={(e) => setAssessmentData({...assessmentData, height: e.target.value})}
                              placeholder="Enter height..."
                              data-testid="input-height"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Weight (kg)</Label>
                            <Input
                              type="number"
                              value={assessmentData.weight}
                              onChange={(e) => setAssessmentData({...assessmentData, weight: e.target.value})}
                              placeholder="Enter weight..."
                              data-testid="input-weight"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>BMI</Label>
                            <Input
                              type="text"
                              value={assessmentData.height && assessmentData.weight ? 
                                (parseFloat(assessmentData.weight) / Math.pow(parseFloat(assessmentData.height) / 100, 2)).toFixed(1) : 
                                ''
                              }
                              readOnly
                              placeholder="Auto-calculated"
                              className="bg-muted"
                              data-testid="input-bmi"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Allergies</Label>
                          <div className="border rounded-lg p-3 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                                <div key={allergy} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`allergy-${allergy}`}
                                    checked={assessmentData.allergies.includes(allergy)}
                                    onCheckedChange={(checked) => {
                                      if (checked) {
                                        setAssessmentData({...assessmentData, allergies: [...assessmentData.allergies, allergy]});
                                      } else {
                                        setAssessmentData({...assessmentData, allergies: assessmentData.allergies.filter(a => a !== allergy)});
                                      }
                                    }}
                                    data-testid={`checkbox-allergy-${allergy.toLowerCase().replace(/\s+/g, '-')}`}
                                  />
                                  <Label htmlFor={`allergy-${allergy}`} className="cursor-pointer font-normal text-sm">{allergy}</Label>
                                </div>
                              ))}
                            </div>
                            <Input
                              value={assessmentData.allergiesOther}
                              onChange={(e) => setAssessmentData({...assessmentData, allergiesOther: e.target.value})}
                              placeholder="Other allergies (free text)..."
                              data-testid="input-allergies-other"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>CAVE</Label>
                          <Input
                            value={assessmentData.cave}
                            onChange={(e) => setAssessmentData({...assessmentData, cave: e.target.value})}
                            placeholder="CAVE (Contraindications, Warnings)..."
                            data-testid="input-cave"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>ASA Classification</Label>
                          <Select
                            value={assessmentData.asa}
                            onValueChange={(value) => setAssessmentData({...assessmentData, asa: value})}
                          >
                            <SelectTrigger data-testid="select-asa">
                              <SelectValue placeholder="Select ASA class" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="I">I - Healthy patient</SelectItem>
                              <SelectItem value="II">II - Mild systemic disease</SelectItem>
                              <SelectItem value="III">III - Severe systemic disease</SelectItem>
                              <SelectItem value="IV">IV - Life-threatening disease</SelectItem>
                              <SelectItem value="V">V - Moribund patient</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Special Notes</Label>
                          <Textarea
                            value={assessmentData.specialNotes}
                            onChange={(e) => setAssessmentData({...assessmentData, specialNotes: e.target.value})}
                            placeholder="Enter any special notes or considerations..."
                            rows={3}
                            data-testid="textarea-special-notes"
                          />
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Medications Section */}
                <AccordionItem value="medications">
                  <Card className={hasMedicationsData() ? "border-purple-400 dark:border-purple-600" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-medications">
                      <CardTitle className={`text-lg ${hasMedicationsData() ? "text-purple-600 dark:text-purple-400" : ""}`}>
                        Medications
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Anticoagulation Medications</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {anticoagulationMedications.map((medication) => (
                                    <div key={medication} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`anticoag-${medication}`}
                                        checked={assessmentData.anticoagulationMeds.includes(medication)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setAssessmentData({...assessmentData, anticoagulationMeds: [...assessmentData.anticoagulationMeds, medication]});
                                          } else {
                                            setAssessmentData({...assessmentData, anticoagulationMeds: assessmentData.anticoagulationMeds.filter(m => m !== medication)});
                                          }
                                        }}
                                        data-testid={`checkbox-anticoag-${medication.toLowerCase().replace(/\s+/g, '-')}`}
                                      />
                                      <Label htmlFor={`anticoag-${medication}`} className="cursor-pointer font-normal text-sm">{medication}</Label>
                                    </div>
                                  ))}
                                </div>
                                <Input
                                  value={assessmentData.anticoagulationMedsOther}
                                  onChange={(e) => setAssessmentData({...assessmentData, anticoagulationMedsOther: e.target.value})}
                                  placeholder="Other anticoagulation medications (free text)..."
                                  data-testid="input-anticoag-other"
                                />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">General Medications</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {generalMedications.map((medication) => (
                                    <div key={medication} className="flex items-center space-x-2">
                                      <Checkbox
                                        id={`general-med-${medication}`}
                                        checked={assessmentData.generalMeds.includes(medication)}
                                        onCheckedChange={(checked) => {
                                          if (checked) {
                                            setAssessmentData({...assessmentData, generalMeds: [...assessmentData.generalMeds, medication]});
                                          } else {
                                            setAssessmentData({...assessmentData, generalMeds: assessmentData.generalMeds.filter(m => m !== medication)});
                                          }
                                        }}
                                        data-testid={`checkbox-general-med-${medication.toLowerCase().replace(/\s+/g, '-')}`}
                                      />
                                      <Label htmlFor={`general-med-${medication}`} className="cursor-pointer font-normal text-sm">{medication}</Label>
                                    </div>
                                  ))}
                                </div>
                                <Input
                                  value={assessmentData.generalMedsOther}
                                  onChange={(e) => setAssessmentData({...assessmentData, generalMedsOther: e.target.value})}
                                  placeholder="Other medications (free text)..."
                                  data-testid="input-general-med-other"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.medicationsNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, medicationsNotes: e.target.value})}
                              placeholder="Enter additional notes about medications..."
                              rows={14}
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
                        Heart and Circulation
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Conditions</Label>
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
                              value={assessmentData.heartNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, heartNotes: e.target.value})}
                              placeholder="Enter additional notes about cardiovascular conditions..."
                              rows={8}
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
                        Lungs
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <Label className="text-base font-semibold">Conditions</Label>
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
                              value={assessmentData.lungNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, lungNotes: e.target.value})}
                              placeholder="Enter additional notes about respiratory conditions..."
                              rows={6}
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
                        GI-Tract, Kidney and Metabolic
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">GI-Tract</Label>
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
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Kidney</Label>
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
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Metabolic</Label>
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
                              value={assessmentData.giKidneyMetabolicNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, giKidneyMetabolicNotes: e.target.value})}
                              placeholder="Enter additional notes about GI, kidney or metabolic conditions..."
                              rows={18}
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
                        Neurological, Psychiatry and Skeletal
                      </CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Neurological</Label>
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
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Psychiatry</Label>
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
                                      data-testid={`checkbox-${id}`}
                                    />
                                    <Label htmlFor={id} className="cursor-pointer font-normal text-sm">{label}</Label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Skeletal</Label>
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
                              data-testid="textarea-neuro-psych-skeletal-notes"
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
                  <Card className={hasNoxenData() ? "border-black dark:border-gray-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-noxen">
                      <CardTitle className={`text-lg ${hasNoxenData() ? "text-black dark:text-gray-300" : ""}`}>
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
                              data-testid="textarea-noxen-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Planned Anesthesia Section */}
                <AccordionItem value="anesthesia">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia">
                      <CardTitle className="text-lg">Planned Anesthesia and Installations</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Anesthesia Technique</Label>
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
                                      data-testid="checkbox-general"
                                    />
                                    <Label htmlFor="general" className="cursor-pointer font-normal text-sm font-semibold">General Anesthesia</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.general && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'tiva-tci', label: 'TIVA/TCI' },
                                        { id: 'tubus', label: 'Tubus' },
                                        { id: 'rsi', label: 'RSI' },
                                        { id: 'larynxmask', label: 'Larynxmask' },
                                        { id: 'larynxmask-auragain', label: 'Larynxmask AuraGain' },
                                        { id: 'rae-tubus', label: 'RAE Tubus' },
                                        { id: 'spiralfedertubus', label: 'Spiralfedertubus' },
                                        { id: 'doppellumentubus', label: 'Doppellumentubus' },
                                        { id: 'nasal-intubation', label: 'Nasal Intubation' },
                                        { id: 'awake-intubation', label: 'Awake Intubation' },
                                        { id: 'ponv-prophylaxis', label: 'PONV Prophylaxis' },
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
                                    data-testid="checkbox-spinal"
                                  />
                                  <Label htmlFor="spinal" className="cursor-pointer font-normal text-sm">Spinal Anesthesia</Label>
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
                                      data-testid="checkbox-epidural"
                                    />
                                    <Label htmlFor="epidural" className="cursor-pointer font-normal text-sm font-semibold">Epidural Anesthesia</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.epidural && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'thoracic', label: 'Thoracic' },
                                        { id: 'lumbar', label: 'Lumbar' },
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
                                      data-testid="checkbox-regional"
                                    />
                                    <Label htmlFor="regional" className="cursor-pointer font-normal text-sm font-semibold">Regional Anesthesia</Label>
                                  </div>
                                  {assessmentData.anesthesiaTechniques.regional && (
                                    <div className="ml-6 space-y-1.5 p-2 bg-muted/30 rounded">
                                      {[
                                        { id: 'interscalene-block', label: 'Interscalene Block' },
                                        { id: 'supraclavicular-block', label: 'Supraclavicular Block' },
                                        { id: 'infraclavicular-block', label: 'Infraclavicular Block' },
                                        { id: 'axillary-block', label: 'Axillary Block' },
                                        { id: 'femoral-block', label: 'Femoral Block' },
                                        { id: 'sciatic-block', label: 'Sciatic Block' },
                                        { id: 'popliteal-block', label: 'Popliteal Block' },
                                        { id: 'tap-block', label: 'TAP Block' },
                                        { id: 'pecs-block', label: 'PECS Block' },
                                        { id: 'serratus-block', label: 'Serratus Block' },
                                        { id: 'with-catheter', label: 'with Catheter' },
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
                                    data-testid="checkbox-sedation"
                                  />
                                  <Label htmlFor="sedation" className="cursor-pointer font-normal text-sm">Sedation</Label>
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
                                    data-testid="checkbox-combined"
                                  />
                                  <Label htmlFor="combined" className="cursor-pointer font-normal text-sm">Combined Technique</Label>
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Post-Operative Care</Label>
                              <div className="border rounded-lg p-3">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="postOpICU"
                                    checked={assessmentData.postOpICU}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      postOpICU: checked as boolean
                                    })}
                                    data-testid="checkbox-post-op-icu"
                                  />
                                  <Label htmlFor="postOpICU" className="cursor-pointer font-normal text-sm">Post-op ICU</Label>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Other Anesthesia Details</Label>
                              <Textarea
                                value={assessmentData.anesthesiaOther}
                                onChange={(e) => setAssessmentData({...assessmentData, anesthesiaOther: e.target.value})}
                                placeholder="Enter additional anesthesia details..."
                                rows={3}
                                data-testid="textarea-anesthesia-other"
                              />
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Required Installations</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="arterialLine"
                                    checked={assessmentData.installations.arterialLine}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, arterialLine: checked as boolean}
                                    })}
                                    data-testid="checkbox-arterial-line"
                                  />
                                  <Label htmlFor="arterialLine" className="cursor-pointer font-normal text-sm">Arterial Line</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="centralLine"
                                    checked={assessmentData.installations.centralLine}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, centralLine: checked as boolean}
                                    })}
                                    data-testid="checkbox-central-line"
                                  />
                                  <Label htmlFor="centralLine" className="cursor-pointer font-normal text-sm">Central Venous Line</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="epiduralCatheter"
                                    checked={assessmentData.installations.epiduralCatheter}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, epiduralCatheter: checked as boolean}
                                    })}
                                    data-testid="checkbox-epidural-catheter"
                                  />
                                  <Label htmlFor="epiduralCatheter" className="cursor-pointer font-normal text-sm">Epidural Catheter</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="urinaryCatheter"
                                    checked={assessmentData.installations.urinaryCatheter}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, urinaryCatheter: checked as boolean}
                                    })}
                                    data-testid="checkbox-urinary-catheter"
                                  />
                                  <Label htmlFor="urinaryCatheter" className="cursor-pointer font-normal text-sm">Urinary Catheter</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="nasogastricTube"
                                    checked={assessmentData.installations.nasogastricTube}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, nasogastricTube: checked as boolean}
                                    })}
                                    data-testid="checkbox-nasogastric-tube"
                                  />
                                  <Label htmlFor="nasogastricTube" className="cursor-pointer font-normal text-sm">Nasogastric Tube</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="peripheralIV"
                                    checked={assessmentData.installations.peripheralIV}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      installations: {...assessmentData.installations, peripheralIV: checked as boolean}
                                    })}
                                    data-testid="checkbox-peripheral-iv"
                                  />
                                  <Label htmlFor="peripheralIV" className="cursor-pointer font-normal text-sm">Peripheral IV</Label>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Other Installations</Label>
                              <Textarea
                                value={assessmentData.installationsOther}
                                onChange={(e) => setAssessmentData({...assessmentData, installationsOther: e.target.value})}
                                placeholder="Enter additional installations..."
                                rows={3}
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
                  <CardTitle>Assessment Completion</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Assessment Date</Label>
                      <Input
                        type="date"
                        value={assessmentData.assessmentDate}
                        onChange={(e) => setAssessmentData({...assessmentData, assessmentDate: e.target.value})}
                        data-testid="input-assessment-date"
                      />
                      {assessmentData.assessmentDate && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(assessmentData.assessmentDate)}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Doctor Name</Label>
                      <Input
                        value={assessmentData.doctorName}
                        onChange={(e) => setAssessmentData({...assessmentData, doctorName: e.target.value})}
                        placeholder="Enter your name"
                        data-testid="input-doctor-name"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Doctor Signature</Label>
                    <div
                      className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setShowAssessmentSignaturePad(true)}
                      data-testid="assessment-signature-trigger"
                    >
                      {assessmentData.doctorSignature ? (
                        <div className="flex flex-col items-center gap-2">
                          <img src={assessmentData.doctorSignature} alt="Doctor signature" className="h-16 max-w-full" />
                          <p className="text-xs text-muted-foreground">Click to change signature</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <i className="fas fa-signature text-2xl"></i>
                          <p className="text-sm">Click to add signature</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-base font-semibold">Surgical Approval Status</Label>
                    <div className="space-y-2">
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "approved" ? "bg-green-50 dark:bg-green-950" : ""}`}>
                        <Checkbox
                          id="approved"
                          checked={assessmentData.surgicalApprovalStatus === "approved"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "approved" : ""
                          })}
                          data-testid="checkbox-approved"
                          className={assessmentData.surgicalApprovalStatus === "approved" ? "border-green-600 data-[state=checked]:bg-green-600" : ""}
                        />
                        <Label htmlFor="approved" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "approved" ? "text-green-700 dark:text-green-300 font-semibold" : ""}`}>
                          ✓ Approved for Surgery
                        </Label>
                      </div>
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "standby-ekg" ? "bg-yellow-50 dark:bg-yellow-950" : ""}`}>
                        <Checkbox
                          id="standby-ekg"
                          checked={assessmentData.surgicalApprovalStatus === "standby-ekg"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "standby-ekg" : ""
                          })}
                          data-testid="checkbox-standby-ekg"
                          className={assessmentData.surgicalApprovalStatus === "standby-ekg" ? "border-yellow-600 data-[state=checked]:bg-yellow-600" : ""}
                        />
                        <Label htmlFor="standby-ekg" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "standby-ekg" ? "text-yellow-700 dark:text-yellow-300 font-semibold" : ""}`}>
                          ⏸ Stand-by waiting for EKG
                        </Label>
                      </div>
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "standby-labs" ? "bg-yellow-50 dark:bg-yellow-950" : ""}`}>
                        <Checkbox
                          id="standby-labs"
                          checked={assessmentData.surgicalApprovalStatus === "standby-labs"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "standby-labs" : ""
                          })}
                          data-testid="checkbox-standby-labs"
                          className={assessmentData.surgicalApprovalStatus === "standby-labs" ? "border-yellow-600 data-[state=checked]:bg-yellow-600" : ""}
                        />
                        <Label htmlFor="standby-labs" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "standby-labs" ? "text-yellow-700 dark:text-yellow-300 font-semibold" : ""}`}>
                          ⏸ Stand-by waiting for Labs
                        </Label>
                      </div>
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "standby-other" ? "bg-yellow-50 dark:bg-yellow-950" : ""}`}>
                        <Checkbox
                          id="standby-other"
                          checked={assessmentData.surgicalApprovalStatus === "standby-other"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "standby-other" : ""
                          })}
                          data-testid="checkbox-standby-other"
                          className={assessmentData.surgicalApprovalStatus === "standby-other" ? "border-yellow-600 data-[state=checked]:bg-yellow-600" : ""}
                        />
                        <Label htmlFor="standby-other" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "standby-other" ? "text-yellow-700 dark:text-yellow-300 font-semibold" : ""}`}>
                          ⏸ Stand-by waiting for Other Exams
                        </Label>
                      </div>
                      <div className={`flex items-center space-x-2 p-2 rounded-lg ${assessmentData.surgicalApprovalStatus === "not-approved" ? "bg-red-50 dark:bg-red-950" : ""}`}>
                        <Checkbox
                          id="not-approved"
                          checked={assessmentData.surgicalApprovalStatus === "not-approved"}
                          onCheckedChange={(checked) => setAssessmentData({
                            ...assessmentData,
                            surgicalApprovalStatus: checked ? "not-approved" : ""
                          })}
                          data-testid="checkbox-not-approved"
                          className={assessmentData.surgicalApprovalStatus === "not-approved" ? "border-red-600 data-[state=checked]:bg-red-600" : ""}
                        />
                        <Label htmlFor="not-approved" className={`cursor-pointer font-normal text-sm flex-1 ${assessmentData.surgicalApprovalStatus === "not-approved" ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>
                          ✗ Not Approved
                        </Label>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline"
                      size="lg" 
                      onClick={() => handleSavePreOpAssessment(false)}
                      disabled={createPreOpMutation.isPending || updatePreOpMutation.isPending}
                      data-testid="button-save-draft"
                    >
                      {(createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Draft"
                      )}
                    </Button>
                    <Button 
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800" 
                      size="lg" 
                      onClick={handleCompleteAssessment}
                      disabled={createPreOpMutation.isPending || updatePreOpMutation.isPending || existingAssessment?.status === "completed"}
                      data-testid="button-complete-assessment"
                    >
                      {existingAssessment?.status === "completed" ? (
                        "✓ Completed"
                      ) : (
                        (createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Completing...
                          </>
                        ) : (
                          "Complete & Sign"
                        )
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="consent" className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Informed Consent for Anesthesia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="general"
                        checked={consentData.general}
                        onCheckedChange={(checked) => setConsentData({...consentData, general: checked as boolean})}
                        data-testid="checkbox-general"
                      />
                      <div className="flex-1">
                        <Label htmlFor="general" className="font-semibold text-base cursor-pointer">
                          General Anesthesia
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          Complete loss of consciousness using intravenous and/or inhaled medications.
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>Possible adverse events:</strong> Nausea, vomiting, sore throat, dental damage, awareness during anesthesia (rare), allergic reactions, cardiovascular complications.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="regional"
                        checked={consentData.regional}
                        onCheckedChange={(checked) => setConsentData({...consentData, regional: checked as boolean})}
                        data-testid="checkbox-regional"
                      />
                      <div className="flex-1">
                        <Label htmlFor="regional" className="font-semibold text-base cursor-pointer">
                          Regional Anesthesia
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          Numbing of a specific region using local anesthetic injections (spinal, epidural, nerve blocks).
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>Possible adverse events:</strong> Headache, back pain, nerve damage (rare), hypotension, bleeding, infection at injection site.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="installations"
                        checked={consentData.installations}
                        onCheckedChange={(checked) => setConsentData({...consentData, installations: checked as boolean})}
                        data-testid="checkbox-installations"
                      />
                      <div className="flex-1">
                        <Label htmlFor="installations" className="font-semibold text-base cursor-pointer">
                          Planned Installations (IV lines, catheters)
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          Placement of intravenous lines, arterial lines, central lines, or urinary catheters as needed.
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>Possible adverse events:</strong> Infection, bleeding, hematoma, pneumothorax (for central lines), thrombosis.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start space-x-3 p-4 border rounded-lg">
                      <Checkbox 
                        id="icuAdmission"
                        checked={consentData.icuAdmission}
                        onCheckedChange={(checked) => setConsentData({...consentData, icuAdmission: checked as boolean})}
                        data-testid="checkbox-icu"
                      />
                      <div className="flex-1">
                        <Label htmlFor="icuAdmission" className="font-semibold text-base cursor-pointer">
                          Postoperative ICU Admission
                        </Label>
                        <p className="text-sm text-muted-foreground mt-2">
                          Transfer to Intensive Care Unit for close monitoring after surgery.
                        </p>
                        <p className="text-sm text-destructive mt-2">
                          <strong>Purpose:</strong> Close hemodynamic monitoring, respiratory support, pain management, and early detection of complications.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={consentData.date}
                        onChange={(e) => setConsentData({...consentData, date: e.target.value})}
                        data-testid="input-consent-date"
                      />
                      {consentData.date && (
                        <p className="text-xs text-muted-foreground">
                          {formatDate(consentData.date)}
                        </p>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Doctor Signature</Label>
                        <div
                          className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setShowConsentDoctorSignaturePad(true)}
                          data-testid="consent-doctor-signature-trigger"
                        >
                          {consentData.doctorSignature ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={consentData.doctorSignature} alt="Doctor signature" className="h-16 max-w-full" />
                              <p className="text-xs text-muted-foreground">Click to change signature</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <i className="fas fa-signature text-2xl"></i>
                              <p className="text-sm">Click to add signature</p>
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Patient Signature</Label>
                        <div
                          className="border-2 border-dashed rounded-lg p-6 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => setShowConsentPatientSignaturePad(true)}
                          data-testid="consent-patient-signature-trigger"
                        >
                          {consentData.patientSignature ? (
                            <div className="flex flex-col items-center gap-2">
                              <img src={consentData.patientSignature} alt="Patient signature" className="h-16 max-w-full" />
                              <p className="text-xs text-muted-foreground">Click to change signature</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <i className="fas fa-signature text-2xl"></i>
                              <p className="text-sm">Click to add signature</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline"
                      size="lg" 
                      onClick={() => handleSavePreOpAssessment(false)}
                      disabled={createPreOpMutation.isPending || updatePreOpMutation.isPending}
                      data-testid="button-save-consent-draft"
                    >
                      {(createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        "Save Draft"
                      )}
                    </Button>
                    <Button 
                      className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800" 
                      size="lg" 
                      onClick={handleCompleteAssessment}
                      disabled={createPreOpMutation.isPending || updatePreOpMutation.isPending || existingAssessment?.status === "completed"}
                      data-testid="button-complete-consent"
                    >
                      {existingAssessment?.status === "completed" ? (
                        "✓ Completed"
                      ) : (
                        (createPreOpMutation.isPending || updatePreOpMutation.isPending) ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Completing...
                          </>
                        ) : (
                          "Complete & Sign"
                        )
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient</DialogTitle>
            <DialogDescription>Update patient information and medical details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-surname">Surname *</Label>
                <Input
                  id="edit-surname"
                  value={editForm.surname}
                  onChange={(e) => setEditForm({ ...editForm, surname: e.target.value })}
                  data-testid="input-edit-surname"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-firstName">First Name *</Label>
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
                <Label htmlFor="edit-birthday">Birthday *</Label>
                <Input
                  id="edit-birthday"
                  type="date"
                  value={editForm.birthday}
                  onChange={(e) => setEditForm({ ...editForm, birthday: e.target.value })}
                  data-testid="input-edit-birthday"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sex">Sex *</Label>
                <Select
                  value={editForm.sex}
                  onValueChange={(value: "M" | "F" | "O") => setEditForm({ ...editForm, sex: value })}
                >
                  <SelectTrigger data-testid="select-edit-sex">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                    <SelectItem value="O">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

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
                <Label htmlFor="edit-phone">Phone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  data-testid="input-edit-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-address">Address</Label>
              <Input
                id="edit-address"
                value={editForm.address}
                onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                data-testid="input-edit-address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-emergencyContact">Emergency Contact</Label>
              <Input
                id="edit-emergencyContact"
                value={editForm.emergencyContact}
                onChange={(e) => setEditForm({ ...editForm, emergencyContact: e.target.value })}
                data-testid="input-edit-emergencyContact"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-insuranceProvider">Insurance Provider</Label>
                <Input
                  id="edit-insuranceProvider"
                  value={editForm.insuranceProvider}
                  onChange={(e) => setEditForm({ ...editForm, insuranceProvider: e.target.value })}
                  data-testid="input-edit-insuranceProvider"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-insuranceNumber">Insurance Number</Label>
                <Input
                  id="edit-insuranceNumber"
                  value={editForm.insuranceNumber}
                  onChange={(e) => setEditForm({ ...editForm, insuranceNumber: e.target.value })}
                  data-testid="input-edit-insuranceNumber"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Allergies</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                  <Badge
                    key={allergy}
                    variant={editForm.allergies.includes(allergy) ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => {
                      if (editForm.allergies.includes(allergy)) {
                        setEditForm({
                          ...editForm,
                          allergies: editForm.allergies.filter((a) => a !== allergy),
                        });
                      } else {
                        setEditForm({
                          ...editForm,
                          allergies: [...editForm.allergies, allergy],
                        });
                      }
                    }}
                    data-testid={`badge-edit-allergy-${allergy.toLowerCase()}`}
                  >
                    {allergy}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-otherAllergies">Other Allergies (free text)</Label>
              <Textarea
                id="edit-otherAllergies"
                value={editForm.otherAllergies}
                onChange={(e) => setEditForm({ ...editForm, otherAllergies: e.target.value })}
                data-testid="textarea-edit-otherAllergies"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-internalNotes">Internal Notes</Label>
              <Textarea
                id="edit-internalNotes"
                value={editForm.internalNotes}
                onChange={(e) => setEditForm({ ...editForm, internalNotes: e.target.value })}
                data-testid="textarea-edit-internalNotes"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setIsEditDialogOpen(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!editForm.surname || !editForm.firstName || !editForm.birthday) {
                    toast({
                      title: "Missing required fields",
                      description: "Please fill in Surname, First Name, and Birthday",
                      variant: "destructive",
                    });
                    return;
                  }
                  updatePatientMutation.mutate({
                    surname: editForm.surname,
                    firstName: editForm.firstName,
                    birthday: editForm.birthday,
                    sex: editForm.sex,
                    email: editForm.email || null,
                    phone: editForm.phone || null,
                    address: editForm.address || null,
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
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Patient Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Patient</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this patient? This action cannot be undone.
              <br /><br />
              <strong>Patient: {patient.surname}, {patient.firstName}</strong>
              <br />
              Patient ID: {patient.patientNumber}
              <br /><br />
              All associated data, including surgeries and assessments, will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletePatientMutation.mutate()}
              disabled={deletePatientMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-patient"
            >
              {deletePatientMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Patient"
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
        title="Doctor Signature (Assessment)"
      />
      
      <SignaturePad
        isOpen={showConsentDoctorSignaturePad}
        onClose={() => setShowConsentDoctorSignaturePad(false)}
        onSave={(signature) => {
          setConsentData({...consentData, doctorSignature: signature});
          setShowConsentDoctorSignaturePad(false);
        }}
        title="Doctor Signature (Consent)"
      />
      
      <SignaturePad
        isOpen={showConsentPatientSignaturePad}
        onClose={() => setShowConsentPatientSignaturePad(false)}
        onSave={(signature) => {
          setConsentData({...consentData, patientSignature: signature});
          setShowConsentPatientSignaturePad(false);
        }}
        title="Patient Signature"
      />
    </div>
  );
}
