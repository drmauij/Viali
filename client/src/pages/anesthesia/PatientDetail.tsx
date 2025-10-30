import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus, Mail, Phone, AlertCircle, FileText as NoteIcon, Cake, UserCircle, UserRound, ClipboardList, Activity, BedDouble, X, Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  allergyNotes?: string | null;
  medicalNotes?: string | null;
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
    queryKey: [`/api/anesthesia/surgeries`, { patientId: params?.id }],
    enabled: !!params?.id,
  });

  // Fetch surgeons for the hospital
  const {
    data: surgeons = [],
    isLoading: isLoadingSurgeons
  } = useQuery<Surgeon[]>({
    queryKey: [`/api/surgeons`, { hospitalId: activeHospital?.id }],
    enabled: !!activeHospital?.id,
  });
  
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
      setIsPreOpOpen(true);
      
      // Clean up URL by removing only the openPreOp parameter
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
  });
  const [consentData, setConsentData] = useState({
    general: false,
    regional: false,
    installations: false,
    icuAdmission: false,
    date: new Date().toISOString().split('T')[0],
  });
  
  const [assessmentData, setAssessmentData] = useState({
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
    
    // Heart and Circulation
    heartIllnesses: {
      htn: false,
      chd: false,
      heartValve: false,
      arrhythmia: false,
      heartFailure: false,
    },
    heartNotes: "",
    
    // Lungs
    lungIllnesses: {
      asthma: false,
      copd: false,
      sleepApnea: false,
      pneumonia: false,
    },
    lungNotes: "",
    
    // GI-Tract, Kidney and Metabolic
    giIllnesses: {
      reflux: false,
      ibd: false,
      liverDisease: false,
    },
    kidneyIllnesses: {
      ckd: false,
      dialysis: false,
    },
    metabolicIllnesses: {
      diabetes: false,
      thyroid: false,
    },
    giKidneyMetabolicNotes: "",
    
    // Neurological, Psychiatry and Skeletal
    neuroIllnesses: {
      stroke: false,
      epilepsy: false,
      parkinsons: false,
      dementia: false,
    },
    psychIllnesses: {
      depression: false,
      anxiety: false,
      psychosis: false,
    },
    skeletalIllnesses: {
      arthritis: false,
      osteoporosis: false,
      spineDisorders: false,
    },
    neuroPsychSkeletalNotes: "",
    
    // Woman (Gynecological)
    womanIssues: {
      pregnancy: false,
      breastfeeding: false,
      menopause: false,
      gynecologicalSurgery: false,
    },
    womanNotes: "",
    
    // Noxen (Substances)
    noxen: {
      nicotine: false,
      alcohol: false,
      drugs: false,
    },
    noxenNotes: "",
    
    // Children (Pediatric)
    childrenIssues: {
      prematurity: false,
      developmentalDelay: false,
      congenitalAnomalies: false,
      vaccination: false,
    },
    childrenNotes: "",
    
    // Planned Anesthesia
    anesthesiaTechniques: {
      general: false,
      spinal: false,
      epidural: false,
      regional: false,
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
  });
  
  const [openSections, setOpenSections] = useState<string[]>(["general", "medications", "heart", "lungs", "gi-kidney-metabolic", "neuro-psych-skeletal", "woman", "noxen", "children", "anesthesia"]);

  const commonAllergies = [
    "Latex",
    "Penicillin",
    "Sulfa drugs",
    "Aspirin",
    "Iodine",
    "Shellfish",
    "Eggs",
    "Peanuts",
  ];
  
  const anticoagulationMedications = [
    "Aspirin",
    "Warfarin",
    "Clopidogrel",
    "Rivaroxaban",
    "Apixaban",
    "Heparin",
  ];
  
  const generalMedications = [
    "Metformin",
    "Insulin",
    "Levothyroxine",
    "Metoprolol",
    "Lisinopril",
    "Amlodipine",
    "Atorvastatin",
    "Omeprazole",
  ];

  const { toast } = useToast();

  // Mutation to create a surgery
  const createSurgeryMutation = useMutation({
    mutationFn: async (surgeryData: {
      hospitalId: string;
      patientId: string;
      plannedSurgery: string;
      surgeon: string | null;
      plannedDate: string;
    }) => {
      return await apiRequest("POST", "/api/anesthesia/surgeries", surgeryData);
    },
    onSuccess: () => {
      // Invalidate surgeries query with same queryKey pattern as the fetch
      queryClient.invalidateQueries({ 
        queryKey: [`/api/anesthesia/surgeries`, { patientId: params?.id }] 
      });
      toast({
        title: "Surgery created",
        description: "The surgery has been successfully created.",
      });
      setIsCreateCaseOpen(false);
      setNewCase({ plannedSurgery: "", surgeon: "", plannedDate: "" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create surgery",
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

    if (!patient || !activeHospital) return;

    const surgeryData = {
      hospitalId: activeHospital.id,
      patientId: patient.id,
      plannedSurgery: newCase.plannedSurgery,
      surgeon: newCase.surgeon || null,
      plannedDate: newCase.plannedDate, // Backend coerces to Date with z.coerce.date()
    };
    
    console.log("Creating surgery with data:", surgeryData);
    createSurgeryMutation.mutate(surgeryData);
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
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
            <CardTitle className="flex items-center gap-3">
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
            {((patient.allergies && patient.allergies.length > 0) || patient.allergyNotes) && (
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
                  {patient.allergyNotes && (
                    <p className="text-sm text-muted-foreground" data-testid="text-allergy-notes">{patient.allergyNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {patient.medicalNotes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <NoteIcon className="h-5 w-5 text-muted-foreground" />
                  Notes
                </h3>
                <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md" data-testid="text-medical-notes">{patient.medicalNotes}</p>
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Surgery</DialogTitle>
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
                <Label htmlFor="date">Planned Date</Label>
                <Input
                  id="date"
                  type="datetime-local"
                  value={newCase.plannedDate}
                  onChange={(e) => setNewCase({ ...newCase, plannedDate: e.target.value })}
                  data-testid="input-planned-date"
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
                  <Badge className={getStatusColor(surgery.status)}>
                    {surgery.status}
                  </Badge>
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
                    <p className="text-muted-foreground">Location</p>
                    <p className="font-medium">{surgery.surgeryRoomId || 'Not assigned'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Planned Date</p>
                    <p className="font-medium flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(surgery.plannedDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

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
                    data-testid={`button-pacu-${surgery.id}`}
                  >
                    <BedDouble className="h-10 w-10 text-primary" />
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
      <Dialog open={isPreOpOpen} onOpenChange={setIsPreOpOpen}>
        <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden">
          <DialogHeader className="p-4 md:p-6 pb-4 shrink-0 relative">
            <div className="flex items-center justify-between mb-4 pr-10">
              <DialogTitle className="text-lg md:text-2xl">Pre-Operative Assessment</DialogTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPreOpOpen(false)}
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
              <div>
                <p className="font-semibold text-base" data-testid="text-preop-patient-name">{patient.surname}, {patient.firstName}</p>
                <p className="text-xs text-muted-foreground" data-testid="text-preop-patient-info">
                  {formatDate(patient.birthday)} ({calculateAge(patient.birthday)} y) • ID: {patient.patientNumber}
                </p>
              </div>
            </div>
          </DialogHeader>
          
          <Tabs defaultValue="assessment" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 shrink-0">
              <div className="flex items-center gap-4 mb-4">
                <TabsList className="grid flex-1 grid-cols-2">
                  <TabsTrigger value="assessment" data-testid="tab-assessment">Pre-OP Assessment</TabsTrigger>
                  <TabsTrigger value="consent" data-testid="tab-consent">Informed Consent</TabsTrigger>
                </TabsList>
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2 shrink-0"
                  onClick={() => console.log("Downloading Pre-OP PDF for case:", selectedCaseId)}
                  data-testid="button-download-preop-pdf"
                >
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Download PDF</span>
                </Button>
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
                          try {
                            return new Date(plannedDate).toLocaleDateString();
                          } catch {
                            return 'Invalid date';
                          }
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
                              {commonAllergies.map((allergy) => (
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
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="htn"
                                  checked={assessmentData.heartIllnesses.htn}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    heartIllnesses: {...assessmentData.heartIllnesses, htn: checked as boolean}
                                  })}
                                  data-testid="checkbox-htn"
                                />
                                <Label htmlFor="htn" className="cursor-pointer">Hypertension (HTN)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="chd"
                                  checked={assessmentData.heartIllnesses.chd}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    heartIllnesses: {...assessmentData.heartIllnesses, chd: checked as boolean}
                                  })}
                                  data-testid="checkbox-chd"
                                />
                                <Label htmlFor="chd" className="cursor-pointer">Coronary Heart Disease (CHD)</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="heartValve"
                                  checked={assessmentData.heartIllnesses.heartValve}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    heartIllnesses: {...assessmentData.heartIllnesses, heartValve: checked as boolean}
                                  })}
                                  data-testid="checkbox-heart-valve"
                                />
                                <Label htmlFor="heartValve" className="cursor-pointer">Heart Valve Disease</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="arrhythmia"
                                  checked={assessmentData.heartIllnesses.arrhythmia}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    heartIllnesses: {...assessmentData.heartIllnesses, arrhythmia: checked as boolean}
                                  })}
                                  data-testid="checkbox-arrhythmia"
                                />
                                <Label htmlFor="arrhythmia" className="cursor-pointer">Arrhythmia</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="heartFailure"
                                  checked={assessmentData.heartIllnesses.heartFailure}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    heartIllnesses: {...assessmentData.heartIllnesses, heartFailure: checked as boolean}
                                  })}
                                  data-testid="checkbox-heart-failure"
                                />
                                <Label htmlFor="heartFailure" className="cursor-pointer">Heart Failure</Label>
                              </div>
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
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="asthma"
                                  checked={assessmentData.lungIllnesses.asthma}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    lungIllnesses: {...assessmentData.lungIllnesses, asthma: checked as boolean}
                                  })}
                                  data-testid="checkbox-asthma"
                                />
                                <Label htmlFor="asthma" className="cursor-pointer">Asthma</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="copd"
                                  checked={assessmentData.lungIllnesses.copd}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    lungIllnesses: {...assessmentData.lungIllnesses, copd: checked as boolean}
                                  })}
                                  data-testid="checkbox-copd"
                                />
                                <Label htmlFor="copd" className="cursor-pointer">COPD</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="sleepApnea"
                                  checked={assessmentData.lungIllnesses.sleepApnea}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    lungIllnesses: {...assessmentData.lungIllnesses, sleepApnea: checked as boolean}
                                  })}
                                  data-testid="checkbox-sleep-apnea"
                                />
                                <Label htmlFor="sleepApnea" className="cursor-pointer">Sleep Apnea</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="pneumonia"
                                  checked={assessmentData.lungIllnesses.pneumonia}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    lungIllnesses: {...assessmentData.lungIllnesses, pneumonia: checked as boolean}
                                  })}
                                  data-testid="checkbox-pneumonia"
                                />
                                <Label htmlFor="pneumonia" className="cursor-pointer">Pneumonia History</Label>
                              </div>
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
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="reflux"
                                    checked={assessmentData.giIllnesses.reflux}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      giIllnesses: {...assessmentData.giIllnesses, reflux: checked as boolean}
                                    })}
                                    data-testid="checkbox-reflux"
                                  />
                                  <Label htmlFor="reflux" className="cursor-pointer font-normal text-sm">Reflux</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="ibd"
                                    checked={assessmentData.giIllnesses.ibd}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      giIllnesses: {...assessmentData.giIllnesses, ibd: checked as boolean}
                                    })}
                                    data-testid="checkbox-ibd"
                                  />
                                  <Label htmlFor="ibd" className="cursor-pointer font-normal text-sm">IBD</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="liverDisease"
                                    checked={assessmentData.giIllnesses.liverDisease}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      giIllnesses: {...assessmentData.giIllnesses, liverDisease: checked as boolean}
                                    })}
                                    data-testid="checkbox-liver-disease"
                                  />
                                  <Label htmlFor="liverDisease" className="cursor-pointer font-normal text-sm">Liver Disease</Label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Kidney</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="ckd"
                                    checked={assessmentData.kidneyIllnesses.ckd}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      kidneyIllnesses: {...assessmentData.kidneyIllnesses, ckd: checked as boolean}
                                    })}
                                    data-testid="checkbox-ckd"
                                  />
                                  <Label htmlFor="ckd" className="cursor-pointer font-normal text-sm">Chronic Kidney Disease</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="dialysis"
                                    checked={assessmentData.kidneyIllnesses.dialysis}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      kidneyIllnesses: {...assessmentData.kidneyIllnesses, dialysis: checked as boolean}
                                    })}
                                    data-testid="checkbox-dialysis"
                                  />
                                  <Label htmlFor="dialysis" className="cursor-pointer font-normal text-sm">Dialysis</Label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Metabolic</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="diabetes"
                                    checked={assessmentData.metabolicIllnesses.diabetes}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      metabolicIllnesses: {...assessmentData.metabolicIllnesses, diabetes: checked as boolean}
                                    })}
                                    data-testid="checkbox-diabetes"
                                  />
                                  <Label htmlFor="diabetes" className="cursor-pointer font-normal text-sm">Diabetes</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="thyroid"
                                    checked={assessmentData.metabolicIllnesses.thyroid}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      metabolicIllnesses: {...assessmentData.metabolicIllnesses, thyroid: checked as boolean}
                                    })}
                                    data-testid="checkbox-thyroid"
                                  />
                                  <Label htmlFor="thyroid" className="cursor-pointer font-normal text-sm">Thyroid Disorder</Label>
                                </div>
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
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="stroke"
                                    checked={assessmentData.neuroIllnesses.stroke}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      neuroIllnesses: {...assessmentData.neuroIllnesses, stroke: checked as boolean}
                                    })}
                                    data-testid="checkbox-stroke"
                                  />
                                  <Label htmlFor="stroke" className="cursor-pointer font-normal text-sm">Stroke History</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="epilepsy"
                                    checked={assessmentData.neuroIllnesses.epilepsy}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      neuroIllnesses: {...assessmentData.neuroIllnesses, epilepsy: checked as boolean}
                                    })}
                                    data-testid="checkbox-epilepsy"
                                  />
                                  <Label htmlFor="epilepsy" className="cursor-pointer font-normal text-sm">Epilepsy</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="parkinsons"
                                    checked={assessmentData.neuroIllnesses.parkinsons}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      neuroIllnesses: {...assessmentData.neuroIllnesses, parkinsons: checked as boolean}
                                    })}
                                    data-testid="checkbox-parkinsons"
                                  />
                                  <Label htmlFor="parkinsons" className="cursor-pointer font-normal text-sm">Parkinson's Disease</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="dementia"
                                    checked={assessmentData.neuroIllnesses.dementia}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      neuroIllnesses: {...assessmentData.neuroIllnesses, dementia: checked as boolean}
                                    })}
                                    data-testid="checkbox-dementia"
                                  />
                                  <Label htmlFor="dementia" className="cursor-pointer font-normal text-sm">Dementia</Label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Psychiatry</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="depression"
                                    checked={assessmentData.psychIllnesses.depression}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      psychIllnesses: {...assessmentData.psychIllnesses, depression: checked as boolean}
                                    })}
                                    data-testid="checkbox-depression"
                                  />
                                  <Label htmlFor="depression" className="cursor-pointer font-normal text-sm">Depression</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="anxiety"
                                    checked={assessmentData.psychIllnesses.anxiety}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      psychIllnesses: {...assessmentData.psychIllnesses, anxiety: checked as boolean}
                                    })}
                                    data-testid="checkbox-anxiety"
                                  />
                                  <Label htmlFor="anxiety" className="cursor-pointer font-normal text-sm">Anxiety</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="psychosis"
                                    checked={assessmentData.psychIllnesses.psychosis}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      psychIllnesses: {...assessmentData.psychIllnesses, psychosis: checked as boolean}
                                    })}
                                    data-testid="checkbox-psychosis"
                                  />
                                  <Label htmlFor="psychosis" className="cursor-pointer font-normal text-sm">Psychosis</Label>
                                </div>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-base font-semibold">Skeletal</Label>
                              <div className="border rounded-lg p-3 space-y-2">
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="arthritis"
                                    checked={assessmentData.skeletalIllnesses.arthritis}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      skeletalIllnesses: {...assessmentData.skeletalIllnesses, arthritis: checked as boolean}
                                    })}
                                    data-testid="checkbox-arthritis"
                                  />
                                  <Label htmlFor="arthritis" className="cursor-pointer font-normal text-sm">Arthritis</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="osteoporosis"
                                    checked={assessmentData.skeletalIllnesses.osteoporosis}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      skeletalIllnesses: {...assessmentData.skeletalIllnesses, osteoporosis: checked as boolean}
                                    })}
                                    data-testid="checkbox-osteoporosis"
                                  />
                                  <Label htmlFor="osteoporosis" className="cursor-pointer font-normal text-sm">Osteoporosis</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox
                                    id="spineDisorders"
                                    checked={assessmentData.skeletalIllnesses.spineDisorders}
                                    onCheckedChange={(checked) => setAssessmentData({
                                      ...assessmentData,
                                      skeletalIllnesses: {...assessmentData.skeletalIllnesses, spineDisorders: checked as boolean}
                                    })}
                                    data-testid="checkbox-spine-disorders"
                                  />
                                  <Label htmlFor="spineDisorders" className="cursor-pointer font-normal text-sm">Spine Disorders</Label>
                                </div>
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
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="pregnancy"
                                  checked={assessmentData.womanIssues.pregnancy}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    womanIssues: {...assessmentData.womanIssues, pregnancy: checked as boolean}
                                  })}
                                  data-testid="checkbox-pregnancy"
                                />
                                <Label htmlFor="pregnancy" className="cursor-pointer">Pregnancy</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="breastfeeding"
                                  checked={assessmentData.womanIssues.breastfeeding}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    womanIssues: {...assessmentData.womanIssues, breastfeeding: checked as boolean}
                                  })}
                                  data-testid="checkbox-breastfeeding"
                                />
                                <Label htmlFor="breastfeeding" className="cursor-pointer">Breastfeeding</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="menopause"
                                  checked={assessmentData.womanIssues.menopause}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    womanIssues: {...assessmentData.womanIssues, menopause: checked as boolean}
                                  })}
                                  data-testid="checkbox-menopause"
                                />
                                <Label htmlFor="menopause" className="cursor-pointer">Menopause</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="gynecologicalSurgery"
                                  checked={assessmentData.womanIssues.gynecologicalSurgery}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    womanIssues: {...assessmentData.womanIssues, gynecologicalSurgery: checked as boolean}
                                  })}
                                  data-testid="checkbox-gynecological-surgery"
                                />
                                <Label htmlFor="gynecologicalSurgery" className="cursor-pointer">Gynecological Surgery</Label>
                              </div>
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
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="prematurity"
                                  checked={assessmentData.childrenIssues.prematurity}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    childrenIssues: {...assessmentData.childrenIssues, prematurity: checked as boolean}
                                  })}
                                  data-testid="checkbox-prematurity"
                                />
                                <Label htmlFor="prematurity" className="cursor-pointer">Prematurity</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="developmentalDelay"
                                  checked={assessmentData.childrenIssues.developmentalDelay}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    childrenIssues: {...assessmentData.childrenIssues, developmentalDelay: checked as boolean}
                                  })}
                                  data-testid="checkbox-developmental-delay"
                                />
                                <Label htmlFor="developmentalDelay" className="cursor-pointer">Developmental Delay</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="congenitalAnomalies"
                                  checked={assessmentData.childrenIssues.congenitalAnomalies}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    childrenIssues: {...assessmentData.childrenIssues, congenitalAnomalies: checked as boolean}
                                  })}
                                  data-testid="checkbox-congenital-anomalies"
                                />
                                <Label htmlFor="congenitalAnomalies" className="cursor-pointer">Congenital Anomalies</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="vaccination"
                                  checked={assessmentData.childrenIssues.vaccination}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    childrenIssues: {...assessmentData.childrenIssues, vaccination: checked as boolean}
                                  })}
                                  data-testid="checkbox-vaccination"
                                />
                                <Label htmlFor="vaccination" className="cursor-pointer">Vaccination Status</Label>
                              </div>
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
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="nicotine"
                                  checked={assessmentData.noxen.nicotine}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    noxen: {...assessmentData.noxen, nicotine: checked as boolean}
                                  })}
                                  data-testid="checkbox-nicotine"
                                />
                                <Label htmlFor="nicotine" className="cursor-pointer">Nicotine</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="alcohol"
                                  checked={assessmentData.noxen.alcohol}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    noxen: {...assessmentData.noxen, alcohol: checked as boolean}
                                  })}
                                  data-testid="checkbox-alcohol"
                                />
                                <Label htmlFor="alcohol" className="cursor-pointer">Alcohol</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="drugs"
                                  checked={assessmentData.noxen.drugs}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    noxen: {...assessmentData.noxen, drugs: checked as boolean}
                                  })}
                                  data-testid="checkbox-drugs"
                                />
                                <Label htmlFor="drugs" className="cursor-pointer">Drugs</Label>
                              </div>
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
                                  <Label htmlFor="general" className="cursor-pointer font-normal text-sm">General Anesthesia</Label>
                                </div>
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
                                  <Label htmlFor="epidural" className="cursor-pointer font-normal text-sm">Epidural Anesthesia</Label>
                                </div>
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
                                  <Label htmlFor="regional" className="cursor-pointer font-normal text-sm">Regional Anesthesia</Label>
                                </div>
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
                    <div className="border rounded-lg p-4 bg-white dark:bg-gray-900">
                      <div className="text-center text-sm text-muted-foreground py-8">
                        Double tap to sign
                      </div>
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

                  <Button className="w-full" size="lg" data-testid="button-save-assessment">
                    Save Pre-OP Assessment
                  </Button>
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
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Patient Signature</Label>
                        <div className="border-2 border-dashed rounded-lg h-32 flex items-center justify-center bg-muted/50">
                          <p className="text-sm text-muted-foreground">Double tap to sign</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Doctor Signature</Label>
                        <div className="border-2 border-dashed rounded-lg h-32 flex items-center justify-center bg-muted/50">
                          <p className="text-sm text-muted-foreground">Double tap to sign</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Button className="w-full" size="lg" data-testid="button-save-consent">
                    Save Informed Consent
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
