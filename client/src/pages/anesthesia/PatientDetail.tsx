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
            <div className="flex items-center justify-between">
              <DialogTitle className="text-2xl">Pre-OP - Case {selectedCaseId}</DialogTitle>
            </div>
          </DialogHeader>
          
          <Tabs defaultValue="assessment" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 shrink-0">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="assessment" data-testid="tab-assessment">Pre-OP Assessment</TabsTrigger>
                <TabsTrigger value="consent" data-testid="tab-consent">Informed Consent</TabsTrigger>
              </TabsList>
            </div>
            
            <TabsContent value="assessment" className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 mt-0">
              <Card>
                <CardHeader>
                  <CardTitle>Patient Assessment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>ASA Classification</Label>
                      <Select>
                        <SelectTrigger data-testid="select-asa-classification">
                          <SelectValue placeholder="Select ASA class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="I">I - Healthy</SelectItem>
                          <SelectItem value="II">II - Mild systemic disease</SelectItem>
                          <SelectItem value="III">III - Severe systemic disease</SelectItem>
                          <SelectItem value="IV">IV - Life-threatening disease</SelectItem>
                          <SelectItem value="V">V - Moribund</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mallampati Class</Label>
                      <Select>
                        <SelectTrigger data-testid="select-mallampati">
                          <SelectValue placeholder="Select class" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="I">I</SelectItem>
                          <SelectItem value="II">II</SelectItem>
                          <SelectItem value="III">III</SelectItem>
                          <SelectItem value="IV">IV</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Anesthesia Plan</Label>
                    <Textarea 
                      placeholder="Enter planned anesthesia technique and considerations..."
                      rows={4}
                      data-testid="textarea-anesthesia-plan"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Special Considerations</Label>
                    <Textarea 
                      placeholder="Enter any special considerations, allergies, or concerns..."
                      rows={4}
                      data-testid="textarea-special-considerations"
                    />
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
