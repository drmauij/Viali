import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Save, CheckCircle2, Eye, Upload, Trash2, FileImage, FileText, Pencil, Camera, ChevronDown, ChevronUp, AlertCircle, AlertTriangle, X, Import, Search, ClipboardList } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { FlexibleDateInput } from "@/components/ui/flexible-date-input";
import { useHospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";
import SignaturePad from "@/components/SignaturePad";
import { PatientDocumentsSection } from "@/components/shared/PatientDocumentsSection";
import type { SurgeryPreOpAssessment } from "@shared/schema";

interface SurgeryPreOpFormProps {
  surgeryId: string;
  hospitalId: string;
  patientId?: string;
}

// Default medication lists (same as anesthesia)
const anticoagulationMedications = [
  { id: 'aspirin', label: 'Aspirin' },
  { id: 'clopidogrel', label: 'Clopidogrel' },
  { id: 'rivaroxaban', label: 'Rivaroxaban' },
  { id: 'apixaban', label: 'Apixaban' },
  { id: 'dabigatran', label: 'Dabigatran' },
  { id: 'warfarin', label: 'Warfarin' },
  { id: 'heparin', label: 'Heparin' },
  { id: 'enoxaparin', label: 'Enoxaparin' },
];

const generalMedications = [
  { id: 'betablocker', label: 'Beta-Blocker' },
  { id: 'acei', label: 'ACE Inhibitor' },
  { id: 'arb', label: 'ARB' },
  { id: 'diuretic', label: 'Diuretic' },
  { id: 'statin', label: 'Statin' },
  { id: 'insulin', label: 'Insulin' },
  { id: 'metformin', label: 'Metformin' },
  { id: 'thyroid', label: 'Thyroid medication' },
];

// AssessmentData matches surgeryPreOpAssessments schema fields exactly
interface AssessmentData {
  height: string;
  weight: string;
  cave: string;
  specialNotes: string;
  allergies: string[];
  otherAllergies: string;
  anticoagulationMeds: string[];
  anticoagulationMedsOther: string;
  generalMeds: string[];
  generalMedsOther: string;
  medicationsNotes: string;
  heartIllnesses: Record<string, boolean>;
  heartNotes: string;
  lungIllnesses: Record<string, boolean>;
  lungNotes: string;
  giIllnesses: Record<string, boolean>;
  kidneyIllnesses: Record<string, boolean>;
  metabolicIllnesses: Record<string, boolean>;
  giKidneyMetabolicNotes: string;
  neuroIllnesses: Record<string, boolean>;
  psychIllnesses: Record<string, boolean>;
  skeletalIllnesses: Record<string, boolean>;
  neuroPsychSkeletalNotes: string;
  womanIssues: Record<string, boolean>;
  womanNotes: string;
  noxen: Record<string, boolean>;
  noxenNotes: string;
  childrenIssues: Record<string, boolean>;
  childrenNotes: string;
  anesthesiaHistoryIssues: Record<string, boolean>;
  dentalIssues: Record<string, boolean>;
  ponvTransfusionIssues: Record<string, boolean>;
  previousSurgeries: string;
  anesthesiaSurgicalHistoryNotes: string;
  outpatientCaregiverFirstName: string;
  outpatientCaregiverLastName: string;
  outpatientCaregiverPhone: string;
  lastSolids: string;
  lastClear: string;
  // Status system matching anesthesia form
  surgicalApprovalStatus: string; // "approved", "not-approved", or ""
  standBy: boolean;
  standByReason: string; // "signature_missing", "consent_required", "waiting_exams", "other"
  standByReasonNote: string;
  assessmentDate: string;
  doctorName: string;
  doctorSignature: string;
  consentFileUrl: string | null;
  consentFileName: string | null;
  consentNotes: string;
  consentDate: string;
  patientSignature: string;
  status: string;
}

const initialAssessmentData: AssessmentData = {
  height: '',
  weight: '',
  cave: '',
  specialNotes: '',
  allergies: [],
  otherAllergies: '',
  anticoagulationMeds: [],
  anticoagulationMedsOther: '',
  generalMeds: [],
  generalMedsOther: '',
  medicationsNotes: '',
  heartIllnesses: {},
  heartNotes: '',
  lungIllnesses: {},
  lungNotes: '',
  giIllnesses: {},
  kidneyIllnesses: {},
  metabolicIllnesses: {},
  giKidneyMetabolicNotes: '',
  neuroIllnesses: {},
  psychIllnesses: {},
  skeletalIllnesses: {},
  neuroPsychSkeletalNotes: '',
  womanIssues: {},
  womanNotes: '',
  noxen: {},
  noxenNotes: '',
  childrenIssues: {},
  childrenNotes: '',
  anesthesiaHistoryIssues: {},
  dentalIssues: {},
  ponvTransfusionIssues: {},
  previousSurgeries: '',
  anesthesiaSurgicalHistoryNotes: '',
  outpatientCaregiverFirstName: '',
  outpatientCaregiverLastName: '',
  outpatientCaregiverPhone: '',
  lastSolids: '',
  lastClear: '',
  surgicalApprovalStatus: '',
  standBy: false,
  standByReason: '',
  standByReasonNote: '',
  assessmentDate: '',
  doctorName: '',
  doctorSignature: '',
  consentFileUrl: null,
  consentFileName: null,
  consentNotes: '',
  consentDate: '',
  patientSignature: '',
  status: 'draft',
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

export default function SurgeryPreOpForm({ surgeryId, hospitalId, patientId }: SurgeryPreOpFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [assessmentData, setAssessmentData] = useState<AssessmentData>(initialAssessmentData);
  const [openSections, setOpenSections] = useState<string[]>(['general']);
  const [consentPreview, setConsentPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [showDoctorSignaturePad, setShowDoctorSignaturePad] = useState(false);
  const [showPatientSignaturePad, setShowPatientSignaturePad] = useState(false);
  const [isImportQuestionnaireOpen, setIsImportQuestionnaireOpen] = useState(false);
  const [selectedQuestionnaireForImport, setSelectedQuestionnaireForImport] = useState<string | null>(null);
  
  // Find & Associate Questionnaire state
  const [isFindQuestionnaireOpen, setIsFindQuestionnaireOpen] = useState(false);
  const [selectedUnassociatedQuestionnaire, setSelectedUnassociatedQuestionnaire] = useState<string | null>(null);
  const [questionnaireSearchTerm, setQuestionnaireSearchTerm] = useState("");

  const { data: assessment, isLoading } = useQuery<SurgeryPreOpAssessment>({
    queryKey: [`/api/surgery/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  const { data: anesthesiaSettings } = useHospitalAnesthesiaSettings(hospitalId);

  // Fetch patient data for the Find & Associate dialog context
  const { data: patient } = useQuery<{
    id: string;
    firstName: string;
    surname: string;
    birthday: string;
  }>({
    queryKey: ['/api/anesthesia/patient', patientId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/patient/${patientId}`, {
        headers: { 'x-active-hospital-id': hospitalId || '' },
      });
      if (!response.ok) throw new Error('Failed to fetch patient');
      return response.json();
    },
    enabled: !!patientId && !!hospitalId,
  });

  // Fetch questionnaire links for import functionality
  const { data: questionnaireLinks = [] } = useQuery<QuestionnaireLink[]>({
    queryKey: ['/api/questionnaire/patient', patientId, 'links'],
    queryFn: async () => {
      const response = await fetch(`/api/questionnaire/patient/${patientId}/links`, {
        headers: { 'x-active-hospital-id': hospitalId || '' },
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!patientId && !!hospitalId,
  });

  // Get submitted questionnaires for the import dropdown
  const submittedQuestionnaires = questionnaireLinks.filter(
    (q) => q.status === 'submitted' && q.response?.id
  );
  // Fetch the selected questionnaire response details
  const { data: selectedQuestionnaireResponse, isLoading: isLoadingQuestionnaireResponse } = useQuery<{
    response: QuestionnaireLink['response'];
    link: QuestionnaireLink;
  }>({
    queryKey: ['/api/questionnaire/responses', selectedQuestionnaireForImport],
    queryFn: async () => {
      const response = await fetch(`/api/questionnaire/responses/${selectedQuestionnaireForImport}`, {
        headers: { 'x-active-hospital-id': hospitalId || '' },
      });
      if (!response.ok) throw new Error('Failed to fetch questionnaire response');
      return response.json();
    },
    enabled: !!selectedQuestionnaireForImport,
  });

  // Type for unassociated questionnaire responses
  type UnassociatedQuestionnaire = {
    id: string;
    patientFirstName: string | null;
    patientSurname: string | null;
    patientBirthday: string | null;
    submittedAt: string | null;
    link: {
      id: string;
      submittedAt: string | null;
      createdAt: string;
    };
  };

  // Fetch unassociated questionnaires for quick association
  const { data: unassociatedQuestionnaires = [], isLoading: isLoadingUnassociated, refetch: refetchUnassociated } = useQuery<UnassociatedQuestionnaire[]>({
    queryKey: ['/api/questionnaire/unassociated', hospitalId],
    queryFn: async () => {
      const response = await fetch('/api/questionnaire/unassociated', {
        headers: { 'x-active-hospital-id': hospitalId || '' },
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!hospitalId,
  });

  // Mutation to associate questionnaire with patient
  const associateQuestionnaireMutation = useMutation({
    mutationFn: async ({ responseId, patientId: pid }: { responseId: string; patientId: string }) => {
      return await apiRequest("POST", `/api/questionnaire/responses/${responseId}/associate`, { patientId: pid });
    },
    onSuccess: () => {
      setSelectedUnassociatedQuestionnaire(null);
      refetchUnassociated();
      queryClient.invalidateQueries({ queryKey: ['/api/questionnaire/patient', patientId, 'links'] });
      toast({
        title: t('surgery.preop.questionnaireAssociated', 'Questionnaire Associated'),
        description: t('surgery.preop.questionnaireAssociatedDesc', 'The questionnaire has been linked to this patient. You can now import the data.'),
      });
      setIsFindQuestionnaireOpen(false);
      setIsImportQuestionnaireOpen(true);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message || t('surgery.preop.associationFailed', 'Failed to associate questionnaire'),
        variant: "destructive",
      });
    },
  });

  // Populate form from assessment data
  useEffect(() => {
    if (assessment) {
      setAssessmentData({
        height: assessment.height || '',
        weight: assessment.weight || '',
        cave: assessment.cave || '',
        specialNotes: assessment.specialNotes || '',
        allergies: assessment.allergies || [],
        otherAllergies: assessment.otherAllergies || '',
        anticoagulationMeds: assessment.anticoagulationMeds || [],
        anticoagulationMedsOther: assessment.anticoagulationMedsOther || '',
        generalMeds: assessment.generalMeds || [],
        generalMedsOther: assessment.generalMedsOther || '',
        medicationsNotes: assessment.medicationsNotes || '',
        heartIllnesses: assessment.heartIllnesses || {},
        heartNotes: assessment.heartNotes || '',
        lungIllnesses: assessment.lungIllnesses || {},
        lungNotes: assessment.lungNotes || '',
        giIllnesses: assessment.giIllnesses || {},
        kidneyIllnesses: assessment.kidneyIllnesses || {},
        metabolicIllnesses: assessment.metabolicIllnesses || {},
        giKidneyMetabolicNotes: assessment.giKidneyMetabolicNotes || '',
        neuroIllnesses: assessment.neuroIllnesses || {},
        psychIllnesses: assessment.psychIllnesses || {},
        skeletalIllnesses: assessment.skeletalIllnesses || {},
        neuroPsychSkeletalNotes: assessment.neuroPsychSkeletalNotes || '',
        womanIssues: assessment.womanIssues || {},
        womanNotes: assessment.womanNotes || '',
        noxen: assessment.noxen || {},
        noxenNotes: assessment.noxenNotes || '',
        childrenIssues: assessment.childrenIssues || {},
        childrenNotes: assessment.childrenNotes || '',
        anesthesiaHistoryIssues: assessment.anesthesiaHistoryIssues || {},
        dentalIssues: assessment.dentalIssues || {},
        ponvTransfusionIssues: assessment.ponvTransfusionIssues || {},
        previousSurgeries: assessment.previousSurgeries || '',
        anesthesiaSurgicalHistoryNotes: assessment.anesthesiaSurgicalHistoryNotes || '',
        outpatientCaregiverFirstName: assessment.outpatientCaregiverFirstName || '',
        outpatientCaregiverLastName: assessment.outpatientCaregiverLastName || '',
        outpatientCaregiverPhone: assessment.outpatientCaregiverPhone || '',
        lastSolids: assessment.lastSolids || '',
        lastClear: assessment.lastClear || '',
        surgicalApprovalStatus: assessment.surgicalApprovalStatus || '',
        standBy: assessment.standBy || false,
        standByReason: assessment.standByReason || '',
        standByReasonNote: assessment.standByReasonNote || '',
        assessmentDate: assessment.assessmentDate || '',
        doctorName: assessment.doctorName || '',
        doctorSignature: assessment.doctorSignature || '',
        consentFileUrl: assessment.consentFileUrl || null,
        consentFileName: assessment.consentFileName || null,
        consentNotes: assessment.consentNotes || '',
        consentDate: assessment.consentDate || '',
        patientSignature: assessment.patientSignature || '',
        status: assessment.status || 'draft',
      });
      if (assessment.consentFileUrl) {
        setConsentPreview(assessment.consentFileUrl);
      }
    }
  }, [assessment]);

  const createMutation = useMutation({
    mutationFn: async (data: Partial<AssessmentData>) => {
      const response = await apiRequest("POST", '/api/surgery/preop', {
        surgeryId,
        ...data,
      });
      return response.json();
    },
    onSuccess: (newAssessment) => {
      queryClient.setQueryData([`/api/surgery/preop/surgery/${surgeryId}`], newAssessment);
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<AssessmentData>) => {
      if (!assessment?.id) throw new Error("No assessment ID");
      const response = await apiRequest("PATCH", `/api/surgery/preop/${assessment.id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop/surgery/${surgeryId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/surgery/preop?hospitalId=${hospitalId}`] });
      setLastSaved(new Date());
    },
  });

  const isCompleted = assessment?.status === "completed";
  const isReadOnly = isCompleted || !canWrite;

  // Debounced auto-save
  const triggerAutoSave = useCallback((data: AssessmentData) => {
    if (!canWrite || isCompleted) return;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(async () => {
      setIsSaving(true);
      try {
        if (!assessment?.id) {
          await createMutation.mutateAsync(data);
        } else {
          await updateMutation.mutateAsync(data);
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      } finally {
        setIsSaving(false);
      }
    }, 2000);
  }, [assessment?.id, canWrite, isCompleted, createMutation, updateMutation]);

  // Update data and trigger auto-save
  const updateAssessment = useCallback((updates: Partial<AssessmentData>) => {
    const newData = { ...assessmentData, ...updates };
    setAssessmentData(newData);
    triggerAutoSave(newData);
  }, [assessmentData, triggerAutoSave]);

  const handleManualSave = async () => {
    setIsSaving(true);
    try {
      if (!assessment?.id) {
        await createMutation.mutateAsync(assessmentData);
      } else {
        await updateMutation.mutateAsync(assessmentData);
      }
      toast({ title: t('common.saved'), description: t('surgery.preop.savedSuccess') });
    } catch (error) {
      toast({ title: t('common.error'), description: t('surgery.preop.saveError'), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Data = reader.result as string;
        setConsentPreview(base64Data);
        // Also persist to database
        updateAssessment({ consentFileUrl: base64Data, consentFileName: file.name });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveFile = () => {
    setConsentPreview(null);
    // Clear from database
    updateAssessment({ consentFileUrl: null, consentFileName: null });
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  // Handle importing questionnaire data into pre-op assessment
  const handleImportFromQuestionnaire = async () => {
    if (!selectedQuestionnaireResponse?.response) return;

    const qResponse = selectedQuestionnaireResponse.response;
    
    setAssessmentData(prev => {
      const newData = { ...prev };
      
      // Height and weight
      if (qResponse.height) newData.height = qResponse.height;
      if (qResponse.weight) newData.weight = qResponse.weight;
      
      // Allergies - match IDs against the allergyList and auto-select checkboxes
      if (qResponse.allergies && qResponse.allergies.length > 0) {
        const allergyList = anesthesiaSettings?.allergyList || [];
        const knownAllergyIds = allergyList.map((a: { id: string }) => a.id);
        
        const matchedAllergies: string[] = [...(newData.allergies || [])];
        const unmatchedAllergies: string[] = [];
        
        for (const allergyId of qResponse.allergies) {
          if (knownAllergyIds.includes(allergyId)) {
            if (!matchedAllergies.includes(allergyId)) {
              matchedAllergies.push(allergyId);
            }
          } else {
            unmatchedAllergies.push(allergyId);
          }
        }
        
        newData.allergies = matchedAllergies;
        
        if (unmatchedAllergies.length > 0) {
          const allergiesText = unmatchedAllergies.join(', ');
          newData.otherAllergies = newData.otherAllergies 
            ? `${newData.otherAllergies}; Patient: ${allergiesText}` 
            : `Patient: ${allergiesText}`;
        }
      }
      if (qResponse.allergiesNotes) {
        newData.otherAllergies = newData.otherAllergies 
          ? `${newData.otherAllergies}; ${qResponse.allergiesNotes}` 
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
          
          const anticoagMatch = anticoagulationList.find(
            (item: { id: string; label: string }) => item.label.toLowerCase() === medNameLower
          );
          if (anticoagMatch && !matchedAnticoag.includes(anticoagMatch.id)) {
            matchedAnticoag.push(anticoagMatch.id);
            continue;
          }
          
          const generalMatch = generalList.find(
            (item: { id: string; label: string }) => item.label.toLowerCase() === medNameLower
          );
          if (generalMatch && !matchedGeneral.includes(generalMatch.id)) {
            matchedGeneral.push(generalMatch.id);
            continue;
          }
          
          unmatchedMeds.push(
            `${med.name}${med.dosage ? ` (${med.dosage})` : ''}${med.frequency ? ` - ${med.frequency}` : ''}`
          );
        }
        
        newData.anticoagulationMeds = matchedAnticoag;
        newData.generalMeds = matchedGeneral;
        
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
        if (!newData.noxen) {
          newData.noxen = {};
        }
        newData.noxen = { ...newData.noxen, smoking: true };
        
        const smokingInfo = qResponse.smokingDetails 
          ? `Smoking: ${qResponse.smokingStatus} - ${qResponse.smokingDetails}`
          : `Smoking: ${qResponse.smokingStatus}`;
        newData.noxenNotes = newData.noxenNotes 
          ? `${newData.noxenNotes}; ${smokingInfo}` 
          : smokingInfo;
      }
      
      // Alcohol status -> noxen checkboxes and notes
      if (qResponse.alcoholStatus && qResponse.alcoholStatus !== 'never') {
        if (!newData.noxen) {
          newData.noxen = {};
        }
        newData.noxen = { ...newData.noxen, alcohol: true };
        
        const alcoholInfo = qResponse.alcoholDetails 
          ? `Alcohol: ${qResponse.alcoholStatus} - ${qResponse.alcoholDetails}`
          : `Alcohol: ${qResponse.alcoholStatus}`;
        newData.noxenNotes = newData.noxenNotes 
          ? `${newData.noxenNotes}; ${alcoholInfo}` 
          : alcoholInfo;
      }
      
      // Previous surgeries
      if (qResponse.previousSurgeries) {
        newData.previousSurgeries = newData.previousSurgeries 
          ? `${newData.previousSurgeries}\n\n${qResponse.previousSurgeries}` 
          : qResponse.previousSurgeries;
      }
      
      // Previous anesthesia problems -> special notes
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
      
      // Additional notes -> special notes
      if (qResponse.additionalNotes) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\nPatient notes: ${qResponse.additionalNotes}` 
          : `Patient notes: ${qResponse.additionalNotes}`;
      }
      
      // Conditions/Illnesses - match against predefined lists and auto-select
      if (qResponse.conditions && Object.keys(qResponse.conditions).length > 0) {
        const illnessLists = anesthesiaSettings?.illnessLists || {};
        
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
          woman: 'womanIssues',
          noxen: 'noxen',
          children: 'childrenIssues',
          anesthesiaHistory: 'anesthesiaHistoryIssues',
          dental: 'dentalIssues',
          ponvTransfusion: 'ponvTransfusionIssues',
        };
        
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
        
        const unmatchedConditions: string[] = [];
        
        for (const [conditionId, conditionData] of Object.entries(qResponse.conditions)) {
          if (!(conditionData as { checked?: boolean }).checked) continue;
          
          const mapping = categoryMappings[conditionId];
          if (mapping) {
            const dataKey = mapping.dataKey;
            if (newData[dataKey] && typeof newData[dataKey] === 'object') {
              (newData[dataKey] as Record<string, boolean>)[conditionId] = true;
            }
          } else {
            const conditionNotes = (conditionData as { notes?: string }).notes;
            unmatchedConditions.push(
              conditionNotes ? `${conditionId} (${conditionNotes})` : conditionId
            );
          }
        }
        
        if (unmatchedConditions.length > 0) {
          const conditionsText = unmatchedConditions.join(', ');
          newData.specialNotes = newData.specialNotes
            ? `${newData.specialNotes}\n\nPatient conditions: ${conditionsText}`
            : `Patient conditions: ${conditionsText}`;
        }
      }
      
      // Extended questionnaire fields
      const qResponseExt = qResponse as any;
      
      // Outpatient Caregiver
      if (qResponseExt.outpatientCaregiverFirstName) {
        newData.outpatientCaregiverFirstName = qResponseExt.outpatientCaregiverFirstName;
      }
      if (qResponseExt.outpatientCaregiverLastName) {
        newData.outpatientCaregiverLastName = qResponseExt.outpatientCaregiverLastName;
      }
      if (qResponseExt.outpatientCaregiverPhone) {
        newData.outpatientCaregiverPhone = qResponseExt.outpatientCaregiverPhone;
      }
      
      // Questions for Doctor
      if (qResponseExt.questionsForDoctor) {
        newData.specialNotes = newData.specialNotes 
          ? `${newData.specialNotes}\n\n⚠️ PATIENT QUESTIONS FOR DOCTOR:\n${qResponseExt.questionsForDoctor}` 
          : `⚠️ PATIENT QUESTIONS FOR DOCTOR:\n${qResponseExt.questionsForDoctor}`;
      }
      
      // Dental Notes -> anesthesiaSurgicalHistoryNotes
      if (qResponseExt.dentalNotes) {
        newData.anesthesiaSurgicalHistoryNotes = newData.anesthesiaSurgicalHistoryNotes
          ? `${newData.anesthesiaSurgicalHistoryNotes}\n\nDental notes: ${qResponseExt.dentalNotes}`
          : `Dental notes: ${qResponseExt.dentalNotes}`;
      }
      
      // PONV/Transfusion Notes -> anesthesiaSurgicalHistoryNotes
      if (qResponseExt.ponvTransfusionNotes) {
        newData.anesthesiaSurgicalHistoryNotes = newData.anesthesiaSurgicalHistoryNotes
          ? `${newData.anesthesiaSurgicalHistoryNotes}\n\nPONV/Transfusion notes: ${qResponseExt.ponvTransfusionNotes}`
          : `PONV/Transfusion notes: ${qResponseExt.ponvTransfusionNotes}`;
      }
      
      // Drug Use -> noxen checkboxes
      if (qResponseExt.drugUse && Object.keys(qResponseExt.drugUse).length > 0) {
        const activeDrugs = Object.entries(qResponseExt.drugUse)
          .filter(([_, checked]) => checked)
          .map(([drug]) => drug);
        
        if (activeDrugs.length > 0) {
          if (!newData.noxen) {
            newData.noxen = {};
          }
          activeDrugs.forEach(drug => {
            newData.noxen = { ...newData.noxen, [drug]: true };
          });
          
          // Add drug use details to noxenNotes
          const drugInfo = qResponseExt.drugUseDetails
            ? `Drug use: ${activeDrugs.join(', ')} - ${qResponseExt.drugUseDetails}`
            : `Drug use: ${activeDrugs.join(', ')}`;
          newData.noxenNotes = newData.noxenNotes
            ? `${newData.noxenNotes}; ${drugInfo}`
            : drugInfo;
        }
      }
      
      return newData;
    });

    // Import questionnaire-uploaded documents into patientDocuments table
    if (selectedQuestionnaireForImport && patientId && hospitalId) {
      try {
        await apiRequest('POST', `/api/questionnaire/responses/${selectedQuestionnaireForImport}/import-documents`, {
          patientId,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patientId}/documents`] });
      } catch (err) {
        console.error("Failed to import questionnaire documents:", err);
      }
    }

    toast({
      title: t('anesthesia.patientDetail.questionnaireImported', 'Questionnaire Imported'),
      description: t('anesthesia.patientDetail.questionnaireImportedDesc', 'Patient questionnaire data has been imported into the form'),
    });

    setIsImportQuestionnaireOpen(false);
    setSelectedQuestionnaireForImport(null);
  };

  // Helper to format date for display
  const formatDateDisplay = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  // Helper functions to check if sections have data
  const hasGeneralData = () => assessmentData.height || assessmentData.weight || assessmentData.cave || assessmentData.specialNotes;
  const hasAllergiesData = () => assessmentData.allergies.length > 0 || assessmentData.otherAllergies;
  const hasMedicationsData = () => assessmentData.anticoagulationMeds.length > 0 || assessmentData.generalMeds.length > 0 || assessmentData.medicationsNotes;
  const hasHeartData = () => Object.values(assessmentData.heartIllnesses).some(v => v) || assessmentData.heartNotes;
  const hasLungData = () => Object.values(assessmentData.lungIllnesses).some(v => v) || assessmentData.lungNotes;
  const hasGiKidneyData = () => Object.values(assessmentData.giIllnesses).some(v => v) || Object.values(assessmentData.kidneyIllnesses).some(v => v) || Object.values(assessmentData.metabolicIllnesses).some(v => v) || assessmentData.giKidneyMetabolicNotes;
  const hasNeuroPsychData = () => Object.values(assessmentData.neuroIllnesses).some(v => v) || Object.values(assessmentData.psychIllnesses).some(v => v) || Object.values(assessmentData.skeletalIllnesses).some(v => v) || assessmentData.neuroPsychSkeletalNotes;
  const hasAnesthesiaHistoryData = () => Object.values(assessmentData.anesthesiaHistoryIssues).some(v => v) || Object.values(assessmentData.dentalIssues).some(v => v) || Object.values(assessmentData.ponvTransfusionIssues).some(v => v) || assessmentData.previousSurgeries;
  const hasOutpatientData = () => assessmentData.outpatientCaregiverFirstName || assessmentData.outpatientCaregiverLastName || assessmentData.outpatientCaregiverPhone;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!canWrite && (
        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
          <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">{t('common.viewOnlyMode')}</p>
            <p className="text-sm text-amber-600 dark:text-amber-400">{t('common.viewOnlyModeDesc')}</p>
          </div>
        </div>
      )}
      
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('surgery.preop.formTitle')}</h2>
          {lastSaved && canWrite && (
            <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
              {isSaving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                  {t('common.lastSaved')}: {lastSaved.toLocaleTimeString()}
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {isCompleted && (
            <Badge className="bg-green-600">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              {t('common.completed')}
            </Badge>
          )}
          {!isCompleted && canWrite && (
            <Button
              variant="outline"
              onClick={handleManualSave}
              disabled={isSaving}
              data-testid="button-save-surgery-preop"
            >
              <Save className="h-4 w-4 mr-2" />
              {t('common.save')}
            </Button>
          )}
        </div>
      </div>

      {/* Import from Questionnaire Button */}
      {!isReadOnly && patientId && (
        <div className="flex flex-wrap justify-start gap-2">
          {submittedQuestionnaires.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportQuestionnaireOpen(true)}
              className="gap-2"
              data-testid="button-import-questionnaire"
            >
              <Import className="h-4 w-4" />
              {t('anesthesia.patientDetail.importFromQuestionnaire', 'Import from Questionnaire')}
              <Badge variant="secondary" className="ml-1">{submittedQuestionnaires.length}</Badge>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsFindQuestionnaireOpen(true)}
            className="gap-2"
            data-testid="button-find-questionnaire"
          >
            <Search className="h-4 w-4" />
            {t('surgery.preop.findQuestionnaire', 'Find & Associate Questionnaire')}
          </Button>
        </div>
      )}

      <Accordion 
        type="multiple" 
        value={openSections} 
        onValueChange={setOpenSections}
        className="space-y-4"
      >
        {/* General Data Section (with Allergies inside, matching anesthesia form) */}
        <AccordionItem value="general">
          <Card className={hasGeneralData() || hasAllergiesData() ? "border-white dark:border-white" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{t('anesthesia.patientDetail.generalData', 'General Data')}</CardTitle>
                {hasAllergiesData() && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    {t('anesthesia.patientDetail.allergies', 'Allergies')}
                  </Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="space-y-6 pt-0">
                {/* Vitals */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.heightCm', 'Height (cm)')}</Label>
                    <Input
                      type="number"
                      value={assessmentData.height}
                      onChange={(e) => updateAssessment({ height: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.enterHeight', 'Enter height')}
                      disabled={isReadOnly}
                      data-testid="input-height"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.weightKg', 'Weight (kg)')}</Label>
                    <Input
                      type="number"
                      value={assessmentData.weight}
                      onChange={(e) => updateAssessment({ weight: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.enterWeight', 'Enter weight')}
                      disabled={isReadOnly}
                      data-testid="input-weight"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.bmi', 'BMI')}</Label>
                    <Input
                      type="text"
                      value={assessmentData.height && assessmentData.weight ? 
                        (parseFloat(assessmentData.weight) / Math.pow(parseFloat(assessmentData.height) / 100, 2)).toFixed(1) : 
                        ''
                      }
                      readOnly
                      placeholder={t('anesthesia.patientDetail.autoCalculated', 'Auto-calculated')}
                      className="bg-muted"
                      data-testid="input-bmi"
                    />
                  </div>
                </div>
                
                {/* CAVE */}
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.cave', 'CAVE')}</Label>
                  <Input
                    value={assessmentData.cave}
                    onChange={(e) => updateAssessment({ cave: e.target.value })}
                    placeholder={t('anesthesia.patientDetail.cavePlaceholder', 'Important warnings...')}
                    disabled={isReadOnly}
                    data-testid="input-cave"
                  />
                </div>
                
                {/* Special Notes */}
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.specialNotes', 'Special Notes')}</Label>
                  <Textarea
                    value={assessmentData.specialNotes}
                    onChange={(e) => updateAssessment({ specialNotes: e.target.value })}
                    placeholder={t('anesthesia.patientDetail.specialNotesPlaceholder', 'Any special notes...')}
                    rows={3}
                    disabled={isReadOnly}
                    data-testid="textarea-special-notes"
                    style={{ fieldSizing: 'content' } as React.CSSProperties}
                  />
                </div>

                {/* Allergies (moved inside General Info to match anesthesia form) */}
                <div className={`space-y-4 p-4 rounded-lg border ${hasAllergiesData() ? "bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-700" : "border-muted"}`}>
                  <Label className={`text-base font-semibold ${hasAllergiesData() ? "text-red-700 dark:text-red-300" : ""}`}>
                    {t('anesthesia.patientDetail.allergies', 'Allergies')}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {(anesthesiaSettings?.allergyList || []).map((allergy) => (
                      <Badge
                        key={allergy.id}
                        variant={assessmentData.allergies.includes(allergy.id) ? "destructive" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          if (isReadOnly) return;
                          if (assessmentData.allergies.includes(allergy.id)) {
                            updateAssessment({
                              allergies: assessmentData.allergies.filter((a) => a !== allergy.id),
                            });
                          } else {
                            updateAssessment({
                              allergies: [...assessmentData.allergies, allergy.id],
                            });
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
                      value={assessmentData.otherAllergies}
                      onChange={(e) => updateAssessment({ otherAllergies: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.otherAllergiesPlaceholder', 'List other allergies...')}
                      rows={2}
                      disabled={isReadOnly}
                      data-testid="textarea-other-allergies"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Patient Documents Section (shared component) */}
        {patientId && hospitalId && (
          <PatientDocumentsSection
            patientId={patientId}
            hospitalId={hospitalId}
            canWrite={canWrite}
            variant="accordion"
          />
        )}

        {/* Medications Section */}
        <AccordionItem value="medications">
          <Card className={hasMedicationsData() ? "border-purple-400 dark:border-purple-600" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-medications">
              <CardTitle className={`text-lg ${hasMedicationsData() ? "text-purple-600 dark:text-purple-400" : ""}`}>
                {t('anesthesia.patientDetail.medications', 'Medications')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anticoagulationMedications', 'Anticoagulation')}</Label>
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {anticoagulationMedications.map((medication) => (
                            <div key={medication.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`anticoag-${medication.id}`}
                                checked={assessmentData.anticoagulationMeds.includes(medication.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    updateAssessment({ anticoagulationMeds: [...assessmentData.anticoagulationMeds, medication.id] });
                                  } else {
                                    updateAssessment({ anticoagulationMeds: assessmentData.anticoagulationMeds.filter(m => m !== medication.id) });
                                  }
                                }}
                                disabled={isReadOnly}
                                data-testid={`checkbox-anticoag-${medication.id}`}
                              />
                              <Label htmlFor={`anticoag-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                            </div>
                          ))}
                        </div>
                        <Input
                          value={assessmentData.anticoagulationMedsOther}
                          onChange={(e) => updateAssessment({ anticoagulationMedsOther: e.target.value })}
                          placeholder={t('anesthesia.patientDetail.otherAnticoagulationPlaceholder', 'Other anticoagulation...')}
                          disabled={isReadOnly}
                          data-testid="input-anticoag-other"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.generalMedications', 'General Medications')}</Label>
                      <div className="border rounded-lg p-3 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          {generalMedications.map((medication) => (
                            <div key={medication.id} className="flex items-center space-x-2">
                              <Checkbox
                                id={`general-med-${medication.id}`}
                                checked={assessmentData.generalMeds.includes(medication.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    updateAssessment({ generalMeds: [...assessmentData.generalMeds, medication.id] });
                                  } else {
                                    updateAssessment({ generalMeds: assessmentData.generalMeds.filter(m => m !== medication.id) });
                                  }
                                }}
                                disabled={isReadOnly}
                                data-testid={`checkbox-general-med-${medication.id}`}
                              />
                              <Label htmlFor={`general-med-${medication.id}`} className="cursor-pointer font-normal text-sm">{medication.label}</Label>
                            </div>
                          ))}
                        </div>
                        <Input
                          value={assessmentData.generalMedsOther}
                          onChange={(e) => updateAssessment({ generalMedsOther: e.target.value })}
                          placeholder={t('anesthesia.patientDetail.otherMedicationsPlaceholder', 'Other medications...')}
                          disabled={isReadOnly}
                          data-testid="input-general-med-other"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.additionalNotes', 'Additional Notes')}</Label>
                    <Textarea
                      value={assessmentData.medicationsNotes}
                      onChange={(e) => updateAssessment({ medicationsNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.medicationsNotesPlaceholder', 'Additional medication notes...')}
                      rows={14}
                      disabled={isReadOnly}
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
                {t('anesthesia.patientDetail.heartAndCirculation', 'Heart & Circulation')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions', 'Conditions')}</Label>
                    <div className="space-y-2">
                      {(anesthesiaSettings?.illnessLists?.cardiovascular || []).map(({ id, label }) => (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={id}
                            checked={assessmentData.heartIllnesses[id] || false}
                            onCheckedChange={(checked) => updateAssessment({
                              heartIllnesses: { ...assessmentData.heartIllnesses, [id]: checked as boolean }
                            })}
                            disabled={isReadOnly}
                            data-testid={`checkbox-${id}`}
                          />
                          <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.heartNotes}
                      onChange={(e) => updateAssessment({ heartNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={8}
                      disabled={isReadOnly}
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
                {t('anesthesia.patientDetail.lungs', 'Lungs & Respiratory')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.conditions', 'Conditions')}</Label>
                    <div className="space-y-2">
                      {(anesthesiaSettings?.illnessLists?.pulmonary || []).map(({ id, label }) => (
                        <div key={id} className="flex items-center space-x-2">
                          <Checkbox
                            id={id}
                            checked={assessmentData.lungIllnesses[id] || false}
                            onCheckedChange={(checked) => updateAssessment({
                              lungIllnesses: { ...assessmentData.lungIllnesses, [id]: checked as boolean }
                            })}
                            disabled={isReadOnly}
                            data-testid={`checkbox-${id}`}
                          />
                          <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.lungNotes}
                      onChange={(e) => updateAssessment({ lungNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={8}
                      disabled={isReadOnly}
                      data-testid="textarea-lung-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* GI, Kidney, Metabolic Section */}
        <AccordionItem value="gi-kidney-metabolic">
          <Card className={hasGiKidneyData() ? "border-amber-500 dark:border-amber-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-gi-kidney">
              <CardTitle className={`text-lg ${hasGiKidneyData() ? "text-amber-600 dark:text-amber-400" : ""}`}>
                {t('anesthesia.patientDetail.giKidneyMetabolic', 'GI, Kidney & Metabolic')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.gastrointestinal', 'Gastrointestinal')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.gastrointestinal || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.giIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                giIllnesses: { ...assessmentData.giIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.kidney', 'Kidney')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.kidney || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.kidneyIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                kidneyIllnesses: { ...assessmentData.kidneyIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.metabolic', 'Metabolic')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.metabolic || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.metabolicIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                metabolicIllnesses: { ...assessmentData.metabolicIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.giKidneyMetabolicNotes}
                      onChange={(e) => updateAssessment({ giKidneyMetabolicNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={12}
                      disabled={isReadOnly}
                      data-testid="textarea-gi-kidney-metabolic-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Neuro, Psych, Skeletal Section */}
        <AccordionItem value="neuro-psych-skeletal">
          <Card className={hasNeuroPsychData() ? "border-violet-500 dark:border-violet-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-neuro-psych">
              <CardTitle className={`text-lg ${hasNeuroPsychData() ? "text-violet-600 dark:text-violet-400" : ""}`}>
                {t('anesthesia.patientDetail.neuroPsychSkeletal', 'Neuro, Psych & Skeletal')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.neurological', 'Neurological')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.neurological || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.neuroIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                neuroIllnesses: { ...assessmentData.neuroIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.psychiatric', 'Psychiatric')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.psychiatric || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.psychIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                psychIllnesses: { ...assessmentData.psychIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.skeletal', 'Skeletal')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.skeletal || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.skeletalIllnesses[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                skeletalIllnesses: { ...assessmentData.skeletalIllnesses, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                    <Textarea
                      value={assessmentData.neuroPsychSkeletalNotes}
                      onChange={(e) => updateAssessment({ neuroPsychSkeletalNotes: e.target.value })}
                      placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                      rows={12}
                      disabled={isReadOnly}
                      data-testid="textarea-neuro-psych-skeletal-notes"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Anesthesia & Surgical History Section */}
        <AccordionItem value="anesthesia-history">
          <Card className={hasAnesthesiaHistoryData() ? "border-orange-500 dark:border-orange-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia-history">
              <CardTitle className={`text-lg ${hasAnesthesiaHistoryData() ? "text-orange-600 dark:text-orange-400" : ""}`}>
                {t('anesthesia.patientDetail.anesthesiaHistory', 'Anesthesia & Surgical History')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.anesthesiaIssues', 'Anesthesia Issues')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.anesthesiaHistory || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.anesthesiaHistoryIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                anesthesiaHistoryIssues: { ...assessmentData.anesthesiaHistoryIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.dentalIssues', 'Dental Issues')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.dental || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.dentalIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                dentalIssues: { ...assessmentData.dentalIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.ponvTransfusion', 'PONV & Transfusion')}</Label>
                      <div className="space-y-2">
                        {(anesthesiaSettings?.illnessLists?.ponvTransfusion || []).map(({ id, label }) => (
                          <div key={id} className="flex items-center space-x-2">
                            <Checkbox
                              id={id}
                              checked={assessmentData.ponvTransfusionIssues[id] || false}
                              onCheckedChange={(checked) => updateAssessment({
                                ponvTransfusionIssues: { ...assessmentData.ponvTransfusionIssues, [id]: checked as boolean }
                              })}
                              disabled={isReadOnly}
                              data-testid={`checkbox-${id}`}
                            />
                            <Label htmlFor={id} className="cursor-pointer">{label}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.previousSurgeries', 'Previous Surgeries')}</Label>
                      <Textarea
                        value={assessmentData.previousSurgeries}
                        onChange={(e) => updateAssessment({ previousSurgeries: e.target.value })}
                        placeholder={t('anesthesia.patientDetail.previousSurgeriesPlaceholder', 'List previous surgeries...')}
                        rows={6}
                        disabled={isReadOnly}
                        data-testid="textarea-previous-surgeries"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-base font-semibold">{t('anesthesia.patientDetail.notes', 'Notes')}</Label>
                      <Textarea
                        value={assessmentData.anesthesiaSurgicalHistoryNotes}
                        onChange={(e) => updateAssessment({ anesthesiaSurgicalHistoryNotes: e.target.value })}
                        placeholder={t('anesthesia.patientDetail.notesPlaceholder', 'Additional notes...')}
                        rows={6}
                        disabled={isReadOnly}
                        data-testid="textarea-anesthesia-history-notes"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>


        {/* Outpatient Care Section */}
        <AccordionItem value="outpatient">
          <Card className={hasOutpatientData() ? "border-cyan-500 dark:border-cyan-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-outpatient">
              <CardTitle className={`text-lg ${hasOutpatientData() ? "text-cyan-600 dark:text-cyan-400" : ""}`}>{t('anesthesia.patientDetail.outpatientCare', 'Outpatient Care')}</CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverFirstName', 'Caregiver First Name')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverFirstName}
                      onChange={(e) => updateAssessment({ outpatientCaregiverFirstName: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-firstname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverLastName', 'Caregiver Last Name')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverLastName}
                      onChange={(e) => updateAssessment({ outpatientCaregiverLastName: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-lastname"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('anesthesia.patientDetail.caregiverPhone', 'Phone')}</Label>
                    <Input
                      value={assessmentData.outpatientCaregiverPhone}
                      onChange={(e) => updateAssessment({ outpatientCaregiverPhone: e.target.value })}
                      disabled={isReadOnly}
                      data-testid="input-caregiver-phone"
                    />
                  </div>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Consent Upload Section */}
        <AccordionItem value="consent">
          <Card className={consentPreview ? "border-green-500 dark:border-green-700" : ""}>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-consent">
              <CardTitle className={`text-lg ${consentPreview ? "text-green-600 dark:text-green-400" : ""}`}>
                {t('surgery.preop.consentDocument', 'Consent Document')}
              </CardTitle>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0 space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t('surgery.preop.consentDocumentDesc', 'Upload the signed consent document')}
                </p>
                
                {consentPreview ? (
                  <div className="space-y-3">
                    <div className="border rounded-lg p-2 bg-muted/30">
                      <img 
                        src={consentPreview} 
                        alt={t('surgery.preop.consentImage', 'Consent document')} 
                        className="max-h-64 mx-auto object-contain rounded"
                      />
                    </div>
                    {!isReadOnly && (
                      <div className="flex gap-2 flex-wrap">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          data-testid="button-change-consent"
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t('surgery.preop.changeImage', 'Change')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => cameraInputRef.current?.click()}
                          data-testid="button-camera-consent"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          {t('surgery.preop.takePhoto', 'Take Photo')}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleRemoveFile}
                          data-testid="button-remove-consent"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          {t('common.remove', 'Remove')}
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  !isReadOnly && (
                    <div className="grid grid-cols-2 gap-4">
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium">{t('surgery.preop.uploadFile', 'Upload File')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('surgery.preop.uploadConsentDesc', 'JPG, PNG or PDF')}</p>
                      </div>
                      <div 
                        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => cameraInputRef.current?.click()}
                      >
                        <Camera className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm font-medium">{t('surgery.preop.takePhoto', 'Take Photo')}</p>
                        <p className="text-xs text-muted-foreground mt-1">{t('surgery.preop.useCamera', 'Use camera')}</p>
                      </div>
                    </div>
                  )
                )}
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-consent-file"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="input-consent-camera"
                />

                <div className="space-y-2">
                  <Label>{t('surgery.preop.consentNotes', 'Consent Notes')}</Label>
                  <Input 
                    value={assessmentData.consentNotes}
                    onChange={(e) => updateAssessment({ consentNotes: e.target.value })}
                    disabled={isReadOnly}
                    placeholder={t('surgery.preop.consentNotesPlaceholder', 'Any notes about consent...')}
                    data-testid="input-consent-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('surgery.preop.consentDate', 'Consent Date')}</Label>
                  <FlexibleDateInput
                    value={assessmentData.consentDate}
                    onChange={(value) => updateAssessment({ consentDate: value })}
                    disabled={isReadOnly}
                    data-testid="input-consent-date"
                  />
                </div>

                {/* Patient Signature */}
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.patientSignature', 'Patient Signature')}</Label>
                  {assessmentData.patientSignature ? (
                    <div className="border rounded-lg p-3 bg-muted/30">
                      <img 
                        src={assessmentData.patientSignature} 
                        alt={t('anesthesia.patientDetail.patientSignature')} 
                        className="max-h-24 mx-auto"
                      />
                      {!isReadOnly && (
                        <div className="flex justify-center mt-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowPatientSignaturePad(true)}
                            data-testid="button-change-patient-signature"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            {t('common.change')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateAssessment({ patientSignature: '' })}
                            data-testid="button-clear-patient-signature"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('common.clear')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center ${!isReadOnly ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
                      onClick={() => !isReadOnly && setShowPatientSignaturePad(true)}
                    >
                      <Pencil className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('anesthesia.patientDetail.clickToSign', 'Click to add signature')}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>

        {/* Assessment Completion Section */}
        <AccordionItem value="completion">
          <Card className={
            assessmentData.surgicalApprovalStatus === "approved" ? "border-green-500 dark:border-green-700" :
            assessmentData.surgicalApprovalStatus === "not-approved" ? "border-red-500 dark:border-red-700" :
            assessmentData.standBy ? "border-amber-500 dark:border-amber-700" : 
            assessmentData.doctorSignature ? "border-green-500 dark:border-green-700" : ""
          }>
            <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-completion">
              <div className="flex items-center gap-2">
                <CardTitle className={`text-lg ${
                  assessmentData.surgicalApprovalStatus === "approved" ? "text-green-600 dark:text-green-400" :
                  assessmentData.surgicalApprovalStatus === "not-approved" ? "text-red-600 dark:text-red-400" :
                  assessmentData.standBy ? "text-amber-600 dark:text-amber-400" :
                  assessmentData.doctorSignature ? "text-green-600 dark:text-green-400" : ""
                }`}>
                  {t('surgery.preop.assessmentCompletion', 'Assessment Completion')}
                </CardTitle>
                {assessmentData.surgicalApprovalStatus === "approved" && (
                  <Badge className="bg-green-600">{t('anesthesia.patientDetail.approvedForSurgery', 'Approved')}</Badge>
                )}
                {assessmentData.surgicalApprovalStatus === "not-approved" && (
                  <Badge variant="destructive">{t('anesthesia.patientDetail.notApproved', 'Not Approved')}</Badge>
                )}
                {assessmentData.standBy && !assessmentData.surgicalApprovalStatus && (
                  <Badge className="bg-amber-600">{t('anesthesia.patientDetail.standByLabel', 'Stand-By')}</Badge>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <CardContent className="pt-0 space-y-6">
                {/* Approved / Not Approved toggles */}
                <div className="space-y-3">
                  <div className={`flex items-center space-x-2 p-3 rounded-lg border ${assessmentData.surgicalApprovalStatus === "approved" ? "bg-green-50 dark:bg-green-950 border-green-300" : "border-muted"}`}>
                    <Checkbox
                      id="approved"
                      checked={assessmentData.surgicalApprovalStatus === "approved"}
                      onCheckedChange={(checked) => {
                        updateAssessment({
                          surgicalApprovalStatus: checked ? "approved" : "",
                          standBy: checked ? false : assessmentData.standBy,
                          standByReason: checked ? "" : assessmentData.standByReason,
                          standByReasonNote: checked ? "" : assessmentData.standByReasonNote
                        });
                      }}
                      disabled={isReadOnly}
                      data-testid="checkbox-approved"
                      className={assessmentData.surgicalApprovalStatus === "approved" ? "border-green-600 data-[state=checked]:bg-green-600" : ""}
                    />
                    <Label htmlFor="approved" className={`cursor-pointer font-normal flex-1 ${assessmentData.surgicalApprovalStatus === "approved" ? "text-green-700 dark:text-green-300 font-semibold" : ""}`}>
                      {t('anesthesia.patientDetail.approvedForSurgery', 'Approved for Surgery')}
                    </Label>
                  </div>
                  
                  <div className={`flex items-center space-x-2 p-3 rounded-lg border ${assessmentData.surgicalApprovalStatus === "not-approved" ? "bg-red-50 dark:bg-red-950 border-red-300" : "border-muted"}`}>
                    <Checkbox
                      id="not-approved"
                      checked={assessmentData.surgicalApprovalStatus === "not-approved"}
                      onCheckedChange={(checked) => {
                        updateAssessment({
                          surgicalApprovalStatus: checked ? "not-approved" : "",
                          standBy: checked ? false : assessmentData.standBy,
                          standByReason: checked ? "" : assessmentData.standByReason,
                          standByReasonNote: checked ? "" : assessmentData.standByReasonNote
                        });
                      }}
                      disabled={isReadOnly}
                      data-testid="checkbox-not-approved"
                      className={assessmentData.surgicalApprovalStatus === "not-approved" ? "border-red-600 data-[state=checked]:bg-red-600" : ""}
                    />
                    <Label htmlFor="not-approved" className={`cursor-pointer font-normal flex-1 ${assessmentData.surgicalApprovalStatus === "not-approved" ? "text-red-700 dark:text-red-300 font-semibold" : ""}`}>
                      {t('anesthesia.patientDetail.notApproved', 'Not Approved')}
                    </Label>
                  </div>
                </div>

                {/* Stand-By Status */}
                <div className={`space-y-4 p-4 rounded-lg border ${assessmentData.standBy ? "bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-700" : "border-muted"}`}>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="standby-toggle" className={`text-base font-medium cursor-pointer ${assessmentData.standBy ? "text-amber-700 dark:text-amber-300" : ""}`}>
                      {t('anesthesia.patientDetail.putCaseOnStandBy', 'Put Case on Stand-By')}
                    </Label>
                    <Switch
                      id="standby-toggle"
                      checked={assessmentData.standBy}
                      onCheckedChange={(checked) => {
                        updateAssessment({
                          standBy: checked,
                          standByReason: checked ? assessmentData.standByReason : "",
                          standByReasonNote: checked ? assessmentData.standByReasonNote : "",
                          surgicalApprovalStatus: checked ? "" : assessmentData.surgicalApprovalStatus
                        });
                      }}
                      disabled={isReadOnly}
                      data-testid="switch-standby"
                      className={assessmentData.standBy ? "data-[state=checked]:bg-amber-600" : ""}
                    />
                  </div>
                  
                  {assessmentData.standBy && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="standby-reason" className="text-sm font-medium">
                          {t('anesthesia.patientDetail.standByReasonLabel', 'Reason')}
                        </Label>
                        <Select
                          value={assessmentData.standByReason}
                          onValueChange={(value) => {
                            updateAssessment({
                              standByReason: value,
                              standByReasonNote: value !== "other" ? "" : assessmentData.standByReasonNote
                            });
                          }}
                          disabled={isReadOnly}
                        >
                          <SelectTrigger data-testid="select-standby-reason">
                            <SelectValue placeholder={t('anesthesia.patientDetail.selectReason', 'Select reason...')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="signature_missing">{t('anesthesia.patientDetail.standByReasons.signatureMissing', 'Patient informed, only signature missing')}</SelectItem>
                            <SelectItem value="consent_required">{t('anesthesia.patientDetail.standByReasons.consentRequired', 'Consent talk required')}</SelectItem>
                            <SelectItem value="waiting_exams">{t('anesthesia.patientDetail.standByReasons.waitingExams', 'Waiting for EKG/Labs/Other exams')}</SelectItem>
                            <SelectItem value="other">{t('anesthesia.patientDetail.standByReasons.other', 'Other reason')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {assessmentData.standByReason === "other" && (
                        <div className="space-y-2">
                          <Label htmlFor="standby-note" className="text-sm font-medium">
                            {t('anesthesia.patientDetail.standByReasonNote', 'Please specify')}
                          </Label>
                          <Textarea
                            id="standby-note"
                            value={assessmentData.standByReasonNote}
                            onChange={(e) => updateAssessment({ standByReasonNote: e.target.value })}
                            placeholder={t('anesthesia.patientDetail.standByReasonNotePlaceholder', 'Enter the reason...')}
                            rows={2}
                            disabled={isReadOnly}
                            data-testid="textarea-standby-note"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Reset button to reverse decisions */}
                {(assessmentData.surgicalApprovalStatus || assessmentData.standBy) && !isReadOnly && (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        updateAssessment({
                          surgicalApprovalStatus: "",
                          standBy: false,
                          standByReason: "",
                          standByReasonNote: ""
                        });
                      }}
                      data-testid="button-reset-status"
                    >
                      <X className="h-4 w-4 mr-2" />
                      {t('surgery.preop.resetDecision', 'Reset Decision')}
                    </Button>
                  </div>
                )}

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('surgery.preop.assessmentDate', 'Assessment Date')}</Label>
                    <FlexibleDateInput
                      value={assessmentData.assessmentDate}
                      onChange={(value) => updateAssessment({ assessmentDate: value })}
                      disabled={isReadOnly}
                      data-testid="input-assessment-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('surgery.preop.assessedBy', 'Assessed By')}</Label>
                    <Input 
                      value={assessmentData.doctorName}
                      onChange={(e) => updateAssessment({ doctorName: e.target.value })}
                      disabled={isReadOnly}
                      placeholder={t('surgery.preop.assessedByPlaceholder', 'Doctor name...')}
                      data-testid="input-doctor-name"
                    />
                  </div>
                </div>

                {/* Doctor Signature */}
                <div className="space-y-2">
                  <Label>{t('anesthesia.patientDetail.doctorSignature', 'Doctor Signature')}</Label>
                  {assessmentData.doctorSignature ? (
                    <div className="border rounded-lg p-3 bg-muted/30">
                      <img 
                        src={assessmentData.doctorSignature} 
                        alt={t('anesthesia.patientDetail.doctorSignature')} 
                        className="max-h-24 mx-auto"
                      />
                      {!isReadOnly && (
                        <div className="flex justify-center mt-2 gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setShowDoctorSignaturePad(true)}
                            data-testid="button-change-doctor-signature"
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            {t('common.change')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => updateAssessment({ doctorSignature: '' })}
                            data-testid="button-clear-doctor-signature"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('common.clear')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div 
                      className={`border-2 border-dashed rounded-lg p-6 text-center ${!isReadOnly ? 'cursor-pointer hover:bg-muted/50' : ''} transition-colors`}
                      onClick={() => !isReadOnly && setShowDoctorSignaturePad(true)}
                    >
                      <Pencil className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">{t('anesthesia.patientDetail.clickToSign', 'Click to add signature')}</p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>{t('surgery.preop.assessmentStatus', 'Status')}</Label>
                  <Select
                    value={assessmentData.status}
                    onValueChange={(value) => updateAssessment({ status: value })}
                    disabled={isReadOnly}
                  >
                    <SelectTrigger data-testid="select-status">
                      <SelectValue placeholder={t('surgery.preop.selectStatus', 'Select status...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{t('surgery.preop.draft', 'Draft')}</SelectItem>
                      <SelectItem value="completed">{t('surgery.preop.completed', 'Completed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-center pt-4">
                  <Button 
                    onClick={handleManualSave}
                    disabled={isReadOnly || isSaving}
                    data-testid="button-save-assessment-completion"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t('common.save')}
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </AccordionContent>
          </Card>
        </AccordionItem>
      </Accordion>

      {/* Signature Pads */}
      <SignaturePad
        isOpen={showDoctorSignaturePad}
        onClose={() => setShowDoctorSignaturePad(false)}
        onSave={(signature) => {
          updateAssessment({ doctorSignature: signature });
          setShowDoctorSignaturePad(false);
        }}
        title={t('anesthesia.patientDetail.doctorSignature', 'Doctor Signature')}
      />

      <SignaturePad
        isOpen={showPatientSignaturePad}
        onClose={() => setShowPatientSignaturePad(false)}
        onSave={(signature) => {
          updateAssessment({ patientSignature: signature });
          setShowPatientSignaturePad(false);
        }}
        title={t('anesthesia.patientDetail.patientSignature', 'Patient Signature')}
      />

      {/* Import from Questionnaire Dialog */}
      <Dialog open={isImportQuestionnaireOpen} onOpenChange={(open) => {
        setIsImportQuestionnaireOpen(open);
        if (!open) setSelectedQuestionnaireForImport(null);
      }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('anesthesia.patientDetail.importFromQuestionnaire', 'Import from Questionnaire')}</DialogTitle>
            <DialogDescription>
              {t('anesthesia.patientDetail.importFromQuestionnaireDesc', 'Select a submitted questionnaire to import patient data into this form.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Questionnaire Selection */}
            <div className="space-y-2">
              <Label>{t('anesthesia.patientDetail.selectQuestionnaire', 'Select Questionnaire')}</Label>
              <Select
                value={selectedQuestionnaireForImport || ''}
                onValueChange={(value) => setSelectedQuestionnaireForImport(value)}
              >
                <SelectTrigger data-testid="select-questionnaire-import">
                  <SelectValue placeholder={t('anesthesia.patientDetail.selectQuestionnairePlaceholder', 'Select a questionnaire...')} />
                </SelectTrigger>
                <SelectContent>
                  {submittedQuestionnaires.map((q) => (
                    <SelectItem key={q.id} value={q.response!.id}>
                      {formatDateDisplay(q.submittedAt || q.createdAt)} - {t('anesthesia.patientDetail.submitted', 'Submitted')}
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
                <h4 className="font-medium">{t('anesthesia.patientDetail.dataToImport', 'Data to Import')}</h4>
                
                {(selectedQuestionnaireResponse.response.height || selectedQuestionnaireResponse.response.weight) && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.measurements', 'Measurements')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.height && `${t('anesthesia.patientDetail.heightCm', 'Height')}: ${selectedQuestionnaireResponse.response.height}`}
                    {selectedQuestionnaireResponse.response.height && selectedQuestionnaireResponse.response.weight && ', '}
                    {selectedQuestionnaireResponse.response.weight && `${t('anesthesia.patientDetail.weightKg', 'Weight')}: ${selectedQuestionnaireResponse.response.weight}`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.allergies && selectedQuestionnaireResponse.response.allergies.length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.allergies', 'Allergies')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.allergies.join(', ')}
                    {selectedQuestionnaireResponse.response.allergiesNotes && ` (${selectedQuestionnaireResponse.response.allergiesNotes})`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.medications && selectedQuestionnaireResponse.response.medications.length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.medications', 'Medications')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.medications.map(m => m.name).join(', ')}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.smokingStatus && selectedQuestionnaireResponse.response.smokingStatus !== 'never' && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.smoking', 'Smoking')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.smokingStatus}
                    {selectedQuestionnaireResponse.response.smokingDetails && ` - ${selectedQuestionnaireResponse.response.smokingDetails}`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.alcoholStatus && selectedQuestionnaireResponse.response.alcoholStatus !== 'never' && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.alcohol', 'Alcohol')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.alcoholStatus}
                    {selectedQuestionnaireResponse.response.alcoholDetails && ` - ${selectedQuestionnaireResponse.response.alcoholDetails}`}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.previousSurgeries && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.previousSurgeries', 'Previous Surgeries')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.previousSurgeries.substring(0, 100)}
                    {selectedQuestionnaireResponse.response.previousSurgeries.length > 100 && '...'}
                  </div>
                )}

                {selectedQuestionnaireResponse.response.conditions && Object.keys(selectedQuestionnaireResponse.response.conditions).length > 0 && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.medicalConditions', 'Medical Conditions')}:</span>{' '}
                    {Object.entries(selectedQuestionnaireResponse.response.conditions)
                      .filter(([_, value]: [string, any]) => value?.checked)
                      .map(([key]: [string, any]) => key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()))
                      .join(', ') || t('common.none', 'None')
                    }
                  </div>
                )}

                {selectedQuestionnaireResponse.response.additionalNotes && (
                  <div className="text-sm">
                    <span className="font-medium">{t('anesthesia.patientDetail.additionalNotes', 'Additional Notes')}:</span>{' '}
                    {selectedQuestionnaireResponse.response.additionalNotes.substring(0, 100)}
                    {selectedQuestionnaireResponse.response.additionalNotes.length > 100 && '...'}
                  </div>
                )}
              </div>
            )}

            {/* Import Button */}
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsImportQuestionnaireOpen(false);
                  setSelectedQuestionnaireForImport(null);
                }}
                data-testid="button-cancel-import"
              >
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                onClick={handleImportFromQuestionnaire}
                disabled={!selectedQuestionnaireForImport || isLoadingQuestionnaireResponse}
                data-testid="button-confirm-import"
              >
                <Import className="h-4 w-4 mr-2" />
                {t('anesthesia.patientDetail.importData', 'Import Data')}
              </Button>
            </div>
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
            <DialogTitle>{t('surgery.preop.findQuestionnaire', 'Find & Associate Questionnaire')}</DialogTitle>
            <DialogDescription>
              {t('surgery.preop.findQuestionnaireDesc', 'Search for an unassociated questionnaire filled by a walk-in patient and link it to this patient.')}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label>{t('surgery.preop.searchQuestionnaires', 'Search by patient name')}</Label>
              <Input
                placeholder={t('surgery.preop.searchQuestionnairesPlaceholder', 'Enter name or birthday...')}
                value={questionnaireSearchTerm}
                onChange={(e) => setQuestionnaireSearchTerm(e.target.value)}
                data-testid="input-search-questionnaires"
              />
            </div>

            {/* Current Patient Info */}
            {patient && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm font-medium text-primary">
                  {t('surgery.preop.associatingTo', 'Will associate to:')}
                </p>
                <p className="text-sm">
                  {patient.firstName} {patient.surname} ({formatDateDisplay(patient.birthday)})
                </p>
              </div>
            )}

            {/* List of Unassociated Questionnaires */}
            <div className="space-y-2">
              <Label>{t('surgery.preop.availableQuestionnaires', 'Available unassociated questionnaires')}</Label>
              
              {isLoadingUnassociated ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : unassociatedQuestionnaires.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{t('surgery.preop.noUnassociatedQuestionnaires', 'No unassociated questionnaires found')}</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {unassociatedQuestionnaires
                    .filter(q => {
                      if (!questionnaireSearchTerm.trim()) return true;
                      const search = questionnaireSearchTerm.toLowerCase();
                      const fullName = `${q.patientFirstName || ''} ${q.patientSurname || ''}`.toLowerCase();
                      const birthday = q.patientBirthday ? formatDateDisplay(q.patientBirthday) : '';
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
                                {q.patientBirthday ? formatDateDisplay(q.patientBirthday) : t('common.noBirthday', 'No birthday')}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">
                                {t('surgery.preop.submittedOn', 'Submitted')}
                              </p>
                              <p className="text-sm">
                                {q.submittedAt || q.link.submittedAt 
                                  ? formatDateDisplay(q.submittedAt || q.link.submittedAt!) 
                                  : formatDateDisplay(q.link.createdAt)}
                              </p>
                            </div>
                          </div>
                          {isExactMatch && (
                            <Badge variant="default" className="mt-2 bg-green-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              {t('surgery.preop.exactMatch', 'Exact Match')}
                            </Badge>
                          )}
                          {isPartialMatch && !isExactMatch && (
                            <Badge variant="secondary" className="mt-2 bg-amber-500 text-white">
                              {t('surgery.preop.partialMatch', 'Partial Match')}
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
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={() => {
                if (selectedUnassociatedQuestionnaire && patientId) {
                  associateQuestionnaireMutation.mutate({
                    responseId: selectedUnassociatedQuestionnaire,
                    patientId: patientId,
                  });
                }
              }}
              disabled={!selectedUnassociatedQuestionnaire || associateQuestionnaireMutation.isPending}
              data-testid="button-confirm-associate"
            >
              {associateQuestionnaireMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {t('surgery.preop.confirmAssociate', 'Associate & Import')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
