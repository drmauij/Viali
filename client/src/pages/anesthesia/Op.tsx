import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  X, 
  Activity, 
  Heart, 
  Thermometer, 
  Wind, 
  Droplets,
  Syringe,
  Users,
  Clock,
  FileCheck,
  ClipboardList,
  Plus,
  UserCircle,
  UserRound,
  AlertCircle
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
    id: "2",
    patientId: "P-2024-002",
    surname: "Bianchi",
    firstName: "Giovanni",
    birthday: "1957-11-03",
    sex: "M",
    height: "180",
    weight: "130",
    allergies: ["None"],
  },
];

const mockCases = [
  {
    id: "case-1",
    patientId: "1",
    plannedSurgery: "Laparoscopic Cholecystectomy",
    surgeon: "Dr. Romano",
    plannedDate: "2024-01-15",
    status: "in-progress",
  },
  {
    id: "case-2", 
    patientId: "2",
    plannedSurgery: "Total Hip Replacement",
    surgeon: "Dr. Smith",
    plannedDate: "2024-01-20",
    status: "scheduled",
  },
];

export default function Op() {
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
      setTimeout(() => setLocation("/anesthesia/patients"), 100);
    }
  }, [currentCase, setLocation]);
  
  // Get patient data for this case
  const currentPatient = currentCase ? mockPatients.find(p => p.id === currentCase.patientId) : null;
  
  if (!currentCase || !currentPatient) {
    return null;
  }
  
  // OP State
  const [opData, setOpData] = useState({
    // Vitals timeline data
    vitals: [] as any[],
    events: [] as any[],
    infusions: [] as any[],
    medications: [] as any[],
    staff: [] as any[],
    
    // Anesthesia documentation
    anesthesiaType: "",
    installations: [] as string[],
    
    // WHO Checklists
    signIn: {
      patientIdentity: false,
      site: false,
      procedure: false,
      consent: false,
      anesthesiaSafety: false,
      allergies: false,
      difficultAirway: false,
      bloodLoss: false,
    },
    timeOut: {
      teamIntroductions: false,
      patientConfirmed: false,
      procedureConfirmed: false,
      antibiotics: false,
      imaging: false,
      concerns: false,
    },
    signOut: {
      procedureRecorded: false,
      counts: false,
      specimens: false,
      equipment: false,
      concerns: false,
    },
    
    // Post-op
    postOpNotes: "",
    complications: "",
  });

  // Close dialog handler
  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      setLocation("/anesthesia/patients");
    }, 100);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-full h-screen m-0 p-0 gap-0 flex flex-col">
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
                <p className="text-xs font-medium text-primary/70">PROCEDURE</p>
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
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">ALLERGIES</p>
                  <p className="font-semibold text-amber-900 dark:text-amber-100">
                    {currentPatient.allergies.join(", ")}
                  </p>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              data-testid="button-close-op"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="vitals" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0 border-b">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="vitals" data-testid="tab-vitals">
                <Activity className="h-4 w-4 mr-2" />
                Vitals & Timeline
              </TabsTrigger>
              <TabsTrigger value="anesthesia" data-testid="tab-anesthesia">
                <Syringe className="h-4 w-4 mr-2" />
                Anesthesia
              </TabsTrigger>
              <TabsTrigger value="checklists" data-testid="tab-checklists">
                <FileCheck className="h-4 w-4 mr-2" />
                WHO Checklists
              </TabsTrigger>
              <TabsTrigger value="postop" data-testid="tab-postop">
                <ClipboardList className="h-4 w-4 mr-2" />
                Post-op
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Vitals & Timeline Tab */}
          <TabsContent value="vitals" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <div className="flex gap-4 h-full">
              {/* Quick Add Vitals Sidebar */}
              <div className="w-20 shrink-0 space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full h-16 flex-col gap-1 p-2"
                  data-testid="button-add-bp"
                >
                  <Activity className="h-6 w-6 text-blue-600" />
                  <span className="text-xs">BP</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-16 flex-col gap-1 p-2"
                  data-testid="button-add-hr"
                >
                  <Heart className="h-6 w-6 text-red-600" />
                  <span className="text-xs">HR</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-16 flex-col gap-1 p-2"
                  data-testid="button-add-temp"
                >
                  <Thermometer className="h-6 w-6 text-orange-600" />
                  <span className="text-xs">Temp</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-16 flex-col gap-1 p-2"
                  data-testid="button-add-spo2"
                >
                  <Wind className="h-6 w-6 text-cyan-600" />
                  <span className="text-xs">SpO2</span>
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full h-16 flex-col gap-1 p-2"
                  data-testid="button-add-fluid"
                >
                  <Droplets className="h-6 w-6 text-blue-400" />
                  <span className="text-xs">Fluid</span>
                </Button>
              </div>

              {/* Timeline Visualization */}
              <div className="flex-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Timeline View</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[500px] border rounded-lg bg-muted/20 flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-lg font-medium">Timeline visualization will appear here</p>
                        <p className="text-sm mt-2">Vitals, events, medications, and staff timeline</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Anesthesia Documentation Tab */}
          <TabsContent value="anesthesia" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Anesthesia Type & Installations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Anesthesia Type</Label>
                  <Input
                    value={opData.anesthesiaType}
                    onChange={(e) => setOpData({ ...opData, anesthesiaType: e.target.value })}
                    placeholder="e.g., General, Regional, Combined..."
                    data-testid="input-anesthesia-type"
                  />
                </div>
                <div>
                  <Label>Installations</Label>
                  <Textarea
                    placeholder="Document installations (arterial line, central line, etc.)"
                    rows={4}
                    data-testid="textarea-installations"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* WHO Checklists Tab */}
          <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4 space-y-4">
            {/* Sign-In Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-green-700 dark:text-green-300">Sign-In (Before Induction)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="sign-in-identity" data-testid="checkbox-sign-in-identity" />
                  <Label htmlFor="sign-in-identity" className="cursor-pointer">Patient identity confirmed</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sign-in-site" data-testid="checkbox-sign-in-site" />
                  <Label htmlFor="sign-in-site" className="cursor-pointer">Site marked</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sign-in-consent" data-testid="checkbox-sign-in-consent" />
                  <Label htmlFor="sign-in-consent" className="cursor-pointer">Consent confirmed</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sign-in-anesthesia" data-testid="checkbox-sign-in-anesthesia" />
                  <Label htmlFor="sign-in-anesthesia" className="cursor-pointer">Anesthesia safety check complete</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="sign-in-allergies" data-testid="checkbox-sign-in-allergies" />
                  <Label htmlFor="sign-in-allergies" className="cursor-pointer">Known allergies reviewed</Label>
                </div>
              </CardContent>
            </Card>

            {/* Time-Out Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-yellow-700 dark:text-yellow-300">Team Time-Out (Before Skin Incision)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="timeout-intro" data-testid="checkbox-timeout-intro" />
                  <Label htmlFor="timeout-intro" className="cursor-pointer">Team members introduced</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="timeout-patient" data-testid="checkbox-timeout-patient" />
                  <Label htmlFor="timeout-patient" className="cursor-pointer">Patient, site, and procedure confirmed</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="timeout-antibiotics" data-testid="checkbox-timeout-antibiotics" />
                  <Label htmlFor="timeout-antibiotics" className="cursor-pointer">Prophylactic antibiotics given</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="timeout-imaging" data-testid="checkbox-timeout-imaging" />
                  <Label htmlFor="timeout-imaging" className="cursor-pointer">Essential imaging displayed</Label>
                </div>
              </CardContent>
            </Card>

            {/* Sign-Out Checklist */}
            <Card>
              <CardHeader>
                <CardTitle className="text-red-700 dark:text-red-300">Sign-Out (Before Patient Leaves OR)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="signout-procedure" data-testid="checkbox-signout-procedure" />
                  <Label htmlFor="signout-procedure" className="cursor-pointer">Procedure recorded</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="signout-counts" data-testid="checkbox-signout-counts" />
                  <Label htmlFor="signout-counts" className="cursor-pointer">Instrument/sponge counts correct</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="signout-specimens" data-testid="checkbox-signout-specimens" />
                  <Label htmlFor="signout-specimens" className="cursor-pointer">Specimens labeled</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="signout-equipment" data-testid="checkbox-signout-equipment" />
                  <Label htmlFor="signout-equipment" className="cursor-pointer">Equipment problems addressed</Label>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Post-op Management Tab */}
          <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-4">
            <Card>
              <CardHeader>
                <CardTitle>Post-Operative Management</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Post-op Notes</Label>
                  <Textarea
                    value={opData.postOpNotes}
                    onChange={(e) => setOpData({ ...opData, postOpNotes: e.target.value })}
                    placeholder="Document post-operative observations and instructions..."
                    rows={6}
                    data-testid="textarea-postop-notes"
                  />
                </div>
                <div>
                  <Label>Complications (if any)</Label>
                  <Textarea
                    value={opData.complications}
                    onChange={(e) => setOpData({ ...opData, complications: e.target.value })}
                    placeholder="Document any complications encountered..."
                    rows={4}
                    data-testid="textarea-complications"
                  />
                </div>
                <Button className="w-full" size="lg" data-testid="button-save-op">
                  Save OP Record
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
