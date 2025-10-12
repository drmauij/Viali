import { useRoute, useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Calendar, User, FileText, Plus, Mail, Phone, AlertCircle, FileText as NoteIcon, Cake, UserCircle, UserRound, ClipboardList, Activity, BedDouble } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ChevronDown, ChevronUp } from "lucide-react";

const mockPatient = {
  id: "1",
  patientId: "P-2024-001",
  surname: "Rossi",
  firstName: "Maria",
  birthday: "1968-05-12",
  sex: "F",
  email: "maria.rossi@example.com",
  phone: "+39 123 456 7890",
  allergies: ["Latex", "Penicillin"],
  allergyNotes: "Mild reaction to shellfish",
  notes: "Prefers morning appointments. History of hypertension.",
  createdAt: "2025-10-01T10:00:00Z",
};

const mockCases = [
  {
    id: "case-1",
    title: "Laparoscopic Cholecystectomy",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Smith",
    plannedDate: "2025-10-09T14:30:00Z",
    status: "completed",
    location: "OR 3",
  },
  {
    id: "case-2",
    title: "Hernia Repair",
    plannedSurgery: "Inguinal Hernia Repair",
    surgeon: "Dr. Johnson",
    plannedDate: "2025-10-12T09:00:00Z",
    status: "planned",
    location: "OR 1",
  },
];

export default function PatientDetail() {
  const [, params] = useRoute("/anesthesia/patients/:id");
  const [, setLocation] = useLocation();
  const [isCreateCaseOpen, setIsCreateCaseOpen] = useState(false);
  const [isPreOpOpen, setIsPreOpOpen] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
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
    plannedSurgery: "",
    plannedDate: "",
    surgeon: "",
    allergies: "",
    medications: "",
    asa: "",
    specialNotes: "",
    
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
    
    // Kidneys and Metabolic
    kidneyIllnesses: {
      ckd: false,
      dialysis: false,
      diabetes: false,
      thyroid: false,
    },
    kidneyNotes: "",
    
    // Neuro
    neuroIllnesses: {
      stroke: false,
      epilepsy: false,
      parkinsons: false,
      dementia: false,
    },
    neuroNotes: "",
    
    // Planned Anesthesia
    plannedAnesthesia: [] as string[],
    installations: [] as string[],
    
    // Doctor Info
    assessmentDate: new Date().toISOString().split('T')[0],
    doctorName: "",
    doctorSignature: "",
  });
  
  const [openSections, setOpenSections] = useState<string[]>(["general", "heart", "lungs", "kidneys", "neuro", "anesthesia"]);

  const surgeons = [
    "Dr. Smith",
    "Dr. Johnson",
    "Dr. Williams",
    "Dr. Brown",
    "Dr. Davis",
  ];

  const handleCreateCase = () => {
    console.log("Creating case:", { ...newCase, title: newCase.plannedSurgery });
    setIsCreateCaseOpen(false);
    setNewCase({ plannedSurgery: "", surgeon: "", plannedDate: "" });
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
  
  const hasKidneyData = () => {
    return Object.values(assessmentData.kidneyIllnesses).some(v => v) || assessmentData.kidneyNotes.trim() !== "";
  };
  
  const hasNeuroData = () => {
    return Object.values(assessmentData.neuroIllnesses).some(v => v) || assessmentData.neuroNotes.trim() !== "";
  };

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="mb-6">
        <Link href="/anesthesia/patients">
          <Button variant="ghost" className="gap-2 mb-4" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
            Back to Patients
          </Button>
        </Link>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              {mockPatient.sex === "M" ? (
                <UserCircle className="h-6 w-6 text-blue-500" />
              ) : (
                <UserRound className="h-6 w-6 text-pink-500" />
              )}
              <div>
                <div>{mockPatient.surname}, {mockPatient.firstName}</div>
                <p className="text-sm font-normal mt-1">
                  <span className="text-foreground font-medium">{formatDate(mockPatient.birthday)} ({calculateAge(mockPatient.birthday)} years)</span>
                  <span className="text-muted-foreground"> • Patient ID: {mockPatient.patientId}</span>
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Contact Information */}
            {(mockPatient.email || mockPatient.phone) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mockPatient.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{mockPatient.email}</p>
                      </div>
                    </div>
                  )}
                  {mockPatient.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Phone</p>
                        <p className="font-medium">{mockPatient.phone}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Allergies */}
            {(mockPatient.allergies.length > 0 || mockPatient.allergyNotes) && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  Allergies
                </h3>
                <div className="space-y-2">
                  {mockPatient.allergies.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {mockPatient.allergies.map((allergy) => (
                        <Badge key={allergy} variant="destructive" className="text-xs">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {mockPatient.allergyNotes && (
                    <p className="text-sm text-muted-foreground">{mockPatient.allergyNotes}</p>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {mockPatient.notes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                  <NoteIcon className="h-5 w-5 text-muted-foreground" />
                  Notes
                </h3>
                <p className="text-sm text-foreground bg-muted/50 p-3 rounded-md">{mockPatient.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Cases ({mockCases.length})</h2>
        <Dialog open={isCreateCaseOpen} onOpenChange={setIsCreateCaseOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-case">
              <Plus className="h-4 w-4" />
              New Case
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Case</DialogTitle>
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
                <Label htmlFor="surgeon">Surgeon</Label>
                <Select value={newCase.surgeon} onValueChange={(value) => setNewCase({ ...newCase, surgeon: value })}>
                  <SelectTrigger data-testid="select-surgeon">
                    <SelectValue placeholder="Select surgeon" />
                  </SelectTrigger>
                  <SelectContent>
                    {surgeons.map((surgeon) => (
                      <SelectItem key={surgeon} value={surgeon}>
                        {surgeon}
                      </SelectItem>
                    ))}
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
              <Button onClick={handleCreateCase} className="w-full" data-testid="button-submit-case">
                Create Case
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-4">
        {mockCases.map((caseItem) => (
          <Card 
            key={caseItem.id} 
            data-testid={`card-case-${caseItem.id}`}
          >
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <h3 className="font-semibold text-lg">{caseItem.title}</h3>
                </div>
                <Badge className={getStatusColor(caseItem.status)}>
                  {caseItem.status}
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Surgery</p>
                  <p className="font-medium">{caseItem.plannedSurgery}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Surgeon</p>
                  <p className="font-medium">{caseItem.surgeon}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Location</p>
                  <p className="font-medium">{caseItem.location}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Planned Date</p>
                  <p className="font-medium flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {new Date(caseItem.plannedDate).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-2">
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => {
                    setSelectedCaseId(caseItem.id);
                    setIsPreOpOpen(true);
                  }}
                  data-testid={`button-preop-${caseItem.id}`}
                >
                  <ClipboardList className="h-10 w-10 text-primary" />
                  <span className="text-sm font-medium">Pre-OP</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => setLocation(`/anesthesia/cases/${caseItem.id}/op`)}
                  data-testid={`button-op-${caseItem.id}`}
                >
                  <Activity className="h-10 w-10 text-primary" />
                  <span className="text-sm font-medium">OP</span>
                </Button>
                
                <Button
                  variant="outline"
                  className="h-auto py-4 flex-col gap-2"
                  onClick={() => setLocation(`/anesthesia/cases/${caseItem.id}/pacu`)}
                  data-testid={`button-pacu-${caseItem.id}`}
                >
                  <BedDouble className="h-10 w-10 text-primary" />
                  <span className="text-sm font-medium">PACU</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pre-OP Full Screen Dialog */}
      <Dialog open={isPreOpOpen} onOpenChange={setIsPreOpOpen}>
        <DialogContent className="max-w-full h-screen m-0 p-0 gap-0 flex flex-col">
          <DialogHeader className="p-6 pb-4 shrink-0">
            <DialogTitle className="text-2xl">
              Pre-OP - {mockCases.find(c => c.id === selectedCaseId)?.plannedSurgery || selectedCaseId}
            </DialogTitle>
            <p className="text-sm text-muted-foreground mt-2">
              {new Date(mockCases.find(c => c.id === selectedCaseId)?.plannedDate || '').toLocaleDateString()} • {mockCases.find(c => c.id === selectedCaseId)?.surgeon}
            </p>
          </DialogHeader>
          
          <Tabs defaultValue="assessment" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 shrink-0">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="assessment" data-testid="tab-assessment">Pre-OP Assessment</TabsTrigger>
                <TabsTrigger value="consent" data-testid="tab-consent">Informed Consent</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="assessment" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
              <div className="flex justify-end mb-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const allSectionIds = ["general", "heart", "lungs", "kidneys", "neuro", "anesthesia"];
                    if (openSections.length > 0) {
                      setOpenSections([]);
                    } else {
                      setOpenSections(allSectionIds);
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

              <Accordion 
                type="multiple" 
                value={openSections} 
                onValueChange={setOpenSections}
                className="space-y-4"
              >
                {/* General Data Section */}
                <AccordionItem value="general">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general">
                      <CardTitle className="text-lg">General Data</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="space-y-4 pt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Planned Surgery</Label>
                            <Input
                              value={assessmentData.plannedSurgery}
                              onChange={(e) => setAssessmentData({...assessmentData, plannedSurgery: e.target.value})}
                              data-testid="input-planned-surgery"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Planned Date</Label>
                            <Input
                              type="date"
                              value={assessmentData.plannedDate}
                              onChange={(e) => setAssessmentData({...assessmentData, plannedDate: e.target.value})}
                              data-testid="input-planned-date"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Surgeon</Label>
                          <Select
                            value={assessmentData.surgeon}
                            onValueChange={(value) => setAssessmentData({...assessmentData, surgeon: value})}
                          >
                            <SelectTrigger data-testid="select-surgeon">
                              <SelectValue placeholder="Select surgeon" />
                            </SelectTrigger>
                            <SelectContent>
                              {surgeons.map((surgeon) => (
                                <SelectItem key={surgeon} value={surgeon}>{surgeon}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Allergies</Label>
                          <Textarea
                            value={assessmentData.allergies}
                            onChange={(e) => setAssessmentData({...assessmentData, allergies: e.target.value})}
                            placeholder="Enter patient allergies..."
                            rows={2}
                            data-testid="textarea-allergies"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Medications</Label>
                          <Textarea
                            value={assessmentData.medications}
                            onChange={(e) => setAssessmentData({...assessmentData, medications: e.target.value})}
                            placeholder="Enter current medications..."
                            rows={3}
                            data-testid="textarea-medications"
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

                {/* Kidneys and Metabolic Section */}
                <AccordionItem value="kidneys">
                  <Card className={hasKidneyData() ? "border-yellow-500 dark:border-yellow-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-kidneys">
                      <CardTitle className={`text-lg ${hasKidneyData() ? "text-yellow-600 dark:text-yellow-400" : ""}`}>
                        Kidneys and Metabolic
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
                                  id="ckd"
                                  checked={assessmentData.kidneyIllnesses.ckd}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    kidneyIllnesses: {...assessmentData.kidneyIllnesses, ckd: checked as boolean}
                                  })}
                                  data-testid="checkbox-ckd"
                                />
                                <Label htmlFor="ckd" className="cursor-pointer">Chronic Kidney Disease (CKD)</Label>
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
                                <Label htmlFor="dialysis" className="cursor-pointer">Dialysis</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="diabetes"
                                  checked={assessmentData.kidneyIllnesses.diabetes}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    kidneyIllnesses: {...assessmentData.kidneyIllnesses, diabetes: checked as boolean}
                                  })}
                                  data-testid="checkbox-diabetes"
                                />
                                <Label htmlFor="diabetes" className="cursor-pointer">Diabetes</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id="thyroid"
                                  checked={assessmentData.kidneyIllnesses.thyroid}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    kidneyIllnesses: {...assessmentData.kidneyIllnesses, thyroid: checked as boolean}
                                  })}
                                  data-testid="checkbox-thyroid"
                                />
                                <Label htmlFor="thyroid" className="cursor-pointer">Thyroid Disorder</Label>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.kidneyNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, kidneyNotes: e.target.value})}
                              placeholder="Enter additional notes about kidney or metabolic conditions..."
                              rows={6}
                              data-testid="textarea-kidney-notes"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Neuro Section */}
                <AccordionItem value="neuro">
                  <Card className={hasNeuroData() ? "border-green-500 dark:border-green-700" : ""}>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-neuro">
                      <CardTitle className={`text-lg ${hasNeuroData() ? "text-green-600 dark:text-green-400" : ""}`}>
                        Neurological
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
                                  id="stroke"
                                  checked={assessmentData.neuroIllnesses.stroke}
                                  onCheckedChange={(checked) => setAssessmentData({
                                    ...assessmentData,
                                    neuroIllnesses: {...assessmentData.neuroIllnesses, stroke: checked as boolean}
                                  })}
                                  data-testid="checkbox-stroke"
                                />
                                <Label htmlFor="stroke" className="cursor-pointer">Stroke History</Label>
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
                                <Label htmlFor="epilepsy" className="cursor-pointer">Epilepsy</Label>
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
                                <Label htmlFor="parkinsons" className="cursor-pointer">Parkinson's Disease</Label>
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
                                <Label htmlFor="dementia" className="cursor-pointer">Dementia</Label>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-base font-semibold">Additional Notes</Label>
                            <Textarea
                              value={assessmentData.neuroNotes}
                              onChange={(e) => setAssessmentData({...assessmentData, neuroNotes: e.target.value})}
                              placeholder="Enter additional notes about neurological conditions..."
                              rows={6}
                              data-testid="textarea-neuro-notes"
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
                      <CardContent className="space-y-4 pt-0">
                        <div className="space-y-2">
                          <Label>Planned Anesthesia Technique</Label>
                          <Textarea
                            placeholder="Describe the planned anesthesia technique (e.g., General anesthesia with endotracheal intubation, Spinal anesthesia)..."
                            rows={3}
                            data-testid="textarea-planned-anesthesia"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Required Installations</Label>
                          <Textarea
                            placeholder="List required installations (e.g., Arterial line, Central venous catheter, Epidural catheter)..."
                            rows={3}
                            data-testid="textarea-installations"
                          />
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
