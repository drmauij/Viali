import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  X, 
  UserCircle,
  UserRound,
  AlertCircle,
  ClipboardCheck,
  FileText,
  Activity
} from "lucide-react";

// Mock patients data
const mockPatients = [
  {
    id: "1",
    patientId: "P-2024-001",
    surname: "Rossi",
    firstName: "Maria",
    birthday: "1968-05-12",
    sex: "F",
    height: "165",
    weight: "68",
    allergies: ["Latex", "Penicillin"],
  },
  {
    id: "3",
    patientId: "P-2024-003",
    surname: "Verdi",
    firstName: "Giuseppe",
    birthday: "1975-03-20",
    sex: "M",
    height: "175",
    weight: "82",
    allergies: [],
  },
];

const mockCases = [
  {
    id: "case-1",
    patientId: "1",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Romano",
    plannedDate: "2024-01-15",
    status: "awaiting-assessment",
  },
  {
    id: "case-3",
    patientId: "3",
    plannedSurgery: "Knee Arthroscopy",
    surgeon: "Dr. Lombardi",
    plannedDate: "2024-01-16",
    status: "awaiting-assessment",
  },
];

export default function PreOp() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  
  // Get case data from params
  const caseId = params.id;
  const currentCase = mockCases.find(c => c.id === caseId);
  
  // If no case found, redirect back
  useEffect(() => {
    if (!currentCase) {
      setIsOpen(false);
      setTimeout(() => setLocation("/anesthesia/preop"), 100);
    }
  }, [currentCase, setLocation]);
  
  // Get patient data for this case
  const currentPatient = currentCase ? mockPatients.find(p => p.id === currentCase.patientId) : null;
  
  if (!currentCase || !currentPatient) {
    return null;
  }

  // Handle dialog close and navigation
  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // When dialog closes, navigate to patient detail
      setTimeout(() => {
        setLocation(`/anesthesia/patients/${currentCase.patientId}`);
      }, 100);
    }
  };
  
  // Close dialog handler
  const handleClose = () => {
    handleDialogChange(false);
  };

  // Calculate age
  const calculateAge = (birthday: string) => {
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  // Calculate BMI
  const calculateBMI = () => {
    if (currentPatient.height && currentPatient.weight) {
      const heightM = parseFloat(currentPatient.height) / 100;
      const weightKg = parseFloat(currentPatient.weight);
      return (weightKg / (heightM * heightM)).toFixed(1);
    }
    return "N/A";
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-full h-screen m-0 p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Fixed Patient Info Header */}
        <div className="shrink-0 border-b bg-background">
          <div className="px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-8 flex-1">
              {/* Patient Name & Icon */}
              <div className="flex items-center gap-3">
                {currentPatient.sex === "M" ? (
                  <UserCircle className="h-8 w-8 text-blue-500" />
                ) : (
                  <UserRound className="h-8 w-8 text-pink-500" />
                )}
                <div>
                  <h2 className="font-bold text-lg">{currentPatient.surname}, {currentPatient.firstName}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(currentPatient.birthday).toLocaleDateString()} ({calculateAge(currentPatient.birthday)} years) • {currentPatient.patientId}
                  </p>
                </div>
              </div>

              {/* Surgery Info */}
              <div className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs font-medium text-primary/70">PLANNED PROCEDURE</p>
                <p className="font-semibold text-primary">{currentCase.plannedSurgery}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{currentCase.surgeon} • {new Date(currentCase.plannedDate).toLocaleDateString()}</p>
              </div>

              {/* Height/Weight/BMI */}
              <div className="flex gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Height</p>
                  <p className="font-semibold">{currentPatient.height} cm</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Weight</p>
                  <p className="font-semibold">{currentPatient.weight} kg</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">BMI</p>
                  <p className="font-semibold">{calculateBMI()}</p>
                </div>
              </div>

              {/* Allergies - Prominent Display */}
              {currentPatient.allergies.length > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">ALLERGIES</p>
                    <p className="font-semibold text-amber-900 dark:text-amber-100">
                      {currentPatient.allergies.join(", ")}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-close-preop"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="assessment" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0 border-b">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="assessment" data-testid="tab-assessment">
                <ClipboardCheck className="h-4 w-4 mr-2" />
                Assessment
              </TabsTrigger>
              <TabsTrigger value="medical-history" data-testid="tab-medical-history">
                <FileText className="h-4 w-4 mr-2" />
                Medical History
              </TabsTrigger>
              <TabsTrigger value="physical-exam" data-testid="tab-physical-exam">
                <Activity className="h-4 w-4 mr-2" />
                Physical Exam
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Assessment Tab */}
          <TabsContent value="assessment" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="space-y-6">
              <Card>
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-4">Pre-operative Checklist</h3>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Checkbox id="consent" />
                      <Label htmlFor="consent">Informed consent obtained</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="npo" />
                      <Label htmlFor="npo">NPO status confirmed (nothing by mouth)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="labs" />
                      <Label htmlFor="labs">Laboratory results reviewed</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="imaging" />
                      <Label htmlFor="imaging">Imaging studies reviewed (if applicable)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="medications" />
                      <Label htmlFor="medications">Current medications reviewed</Label>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="asa">ASA Physical Status Classification</Label>
                  <Input id="asa" placeholder="e.g., ASA II" />
                </div>
                <div>
                  <Label htmlFor="airway">Airway Assessment</Label>
                  <Textarea id="airway" placeholder="Mallampati score, mouth opening, neck mobility, etc." rows={3} />
                </div>
                <div>
                  <Label htmlFor="anesthesia-plan">Anesthesia Plan</Label>
                  <Textarea id="anesthesia-plan" placeholder="Proposed anesthetic technique and monitoring plan" rows={4} />
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Medical History Tab */}
          <TabsContent value="medical-history" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="space-y-4">
              <div>
                <Label htmlFor="medical-conditions">Medical Conditions</Label>
                <Textarea id="medical-conditions" placeholder="Current and past medical conditions" rows={4} />
              </div>
              <div>
                <Label htmlFor="surgical-history">Surgical History</Label>
                <Textarea id="surgical-history" placeholder="Previous surgeries and anesthetic experiences" rows={3} />
              </div>
              <div>
                <Label htmlFor="current-medications">Current Medications</Label>
                <Textarea id="current-medications" placeholder="List all current medications" rows={3} />
              </div>
              <div>
                <Label htmlFor="social-history">Social History</Label>
                <Textarea id="social-history" placeholder="Smoking, alcohol, drug use" rows={2} />
              </div>
            </div>
          </TabsContent>

          {/* Physical Exam Tab */}
          <TabsContent value="physical-exam" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bp">Blood Pressure</Label>
                  <Input id="bp" placeholder="e.g., 120/80" />
                </div>
                <div>
                  <Label htmlFor="hr">Heart Rate</Label>
                  <Input id="hr" placeholder="bpm" />
                </div>
                <div>
                  <Label htmlFor="temp">Temperature</Label>
                  <Input id="temp" placeholder="°C" />
                </div>
                <div>
                  <Label htmlFor="spo2">SpO2</Label>
                  <Input id="spo2" placeholder="%" />
                </div>
              </div>
              <div>
                <Label htmlFor="cardiovascular">Cardiovascular Exam</Label>
                <Textarea id="cardiovascular" placeholder="Heart sounds, rhythm, murmurs" rows={3} />
              </div>
              <div>
                <Label htmlFor="respiratory">Respiratory Exam</Label>
                <Textarea id="respiratory" placeholder="Breath sounds, respiratory effort" rows={3} />
              </div>
              <div>
                <Label htmlFor="other-findings">Other Findings</Label>
                <Textarea id="other-findings" placeholder="Neurological, musculoskeletal, etc." rows={3} />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
