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
  Wind, 
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
      setLocation(`/anesthesia/patients/${currentCase.patientId}`);
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
                  data-testid="button-add-spo2"
                >
                  <Wind className="h-6 w-6 text-cyan-600" />
                  <span className="text-xs">SpO2</span>
                </Button>
              </div>

              {/* Timeline Visualization */}
              <div className="flex-1 flex flex-col">
                {/* Timeline Header */}
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Vitals Timeline</h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Start Time: 08:00</span>
                  </div>
                </div>

                {/* Scrollable Timeline Container */}
                <div className="flex-1 border rounded-lg bg-card overflow-hidden flex flex-col">
                  {/* Unified Scroll Container */}
                  <div className="flex-1 overflow-auto">
                    {/* Time Markers */}
                    <div className="border-b bg-muted/30 sticky top-0 z-10">
                      <div className="flex min-w-[1200px]">
                        {/* Spacer to match track label width */}
                        <div className="w-24 shrink-0 border-r" />
                        {/* Time marker cells */}
                        <div className="flex-1 flex">
                          {Array.from({ length: 13 }, (_, i) => {
                            const hour = 8 + Math.floor(i / 2);
                            const minute = i % 2 === 0 ? "00" : "30";
                            return (
                              <div
                                key={i}
                                className="flex-1 text-center py-2 border-r last:border-r-0 text-xs font-medium"
                              >
                                {hour}:{minute}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Vitals Tracks */}
                    <div className="min-w-[1200px]">
                      {/* BP Track */}
                      <div className="border-b">
                        <div className="flex items-center h-20">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-muted/20">
                            <p className="text-xs font-semibold text-blue-600">BP</p>
                            <p className="text-[10px] text-muted-foreground">mmHg</p>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0" />
                              ))}
                            </div>
                            {/* Sample data points */}
                            <div className="absolute inset-0 flex items-center px-4">
                              <div className="relative w-full h-8">
                                <svg className="w-full h-full">
                                  <line x1="5%" y1="50%" x2="15%" y2="40%" stroke="#2563eb" strokeWidth="2" />
                                  <line x1="15%" y1="40%" x2="25%" y2="45%" stroke="#2563eb" strokeWidth="2" />
                                  <circle cx="5%" cy="50%" r="4" fill="#2563eb" />
                                  <circle cx="15%" cy="40%" r="4" fill="#2563eb" />
                                  <circle cx="25%" cy="45%" r="4" fill="#2563eb" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* HR Track */}
                      <div className="border-b">
                        <div className="flex items-center h-20">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-muted/20">
                            <p className="text-xs font-semibold text-red-600">HR</p>
                            <p className="text-[10px] text-muted-foreground">bpm</p>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0" />
                              ))}
                            </div>
                            {/* Sample data points */}
                            <div className="absolute inset-0 flex items-center px-4">
                              <div className="relative w-full h-8">
                                <svg className="w-full h-full">
                                  <line x1="5%" y1="60%" x2="15%" y2="50%" stroke="#dc2626" strokeWidth="2" />
                                  <line x1="15%" y1="50%" x2="25%" y2="55%" stroke="#dc2626" strokeWidth="2" />
                                  <circle cx="5%" cy="60%" r="4" fill="#dc2626" />
                                  <circle cx="15%" cy="50%" r="4" fill="#dc2626" />
                                  <circle cx="25%" cy="55%" r="4" fill="#dc2626" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* SpO2 Track */}
                      <div className="border-b">
                        <div className="flex items-center h-20">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-muted/20">
                            <p className="text-xs font-semibold text-cyan-600">SpO2</p>
                            <p className="text-[10px] text-muted-foreground">%</p>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0" />
                              ))}
                            </div>
                            {/* Sample data points */}
                            <div className="absolute inset-0 flex items-center px-4">
                              <div className="relative w-full h-8">
                                <svg className="w-full h-full">
                                  <line x1="5%" y1="30%" x2="15%" y2="35%" stroke="#0891b2" strokeWidth="2" />
                                  <line x1="15%" y1="35%" x2="25%" y2="30%" stroke="#0891b2" strokeWidth="2" />
                                  <circle cx="5%" cy="30%" r="4" fill="#0891b2" />
                                  <circle cx="15%" cy="35%" r="4" fill="#0891b2" />
                                  <circle cx="25%" cy="30%" r="4" fill="#0891b2" />
                                </svg>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Events Swimlane */}
                      <div className="border-b bg-purple-50/50 dark:bg-purple-950/20">
                        <div className="flex items-center h-16">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-purple-100/50 dark:bg-purple-900/30">
                            <p className="text-xs font-semibold text-purple-700 dark:text-purple-400">Events</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-full text-[10px] mt-0.5 p-0"
                              data-testid="button-add-event"
                            >
                              + Add
                            </Button>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0 border-purple-200 dark:border-purple-800" />
                              ))}
                            </div>
                            {/* Sample events */}
                            <div className="absolute inset-0 flex items-center px-2">
                              <div
                                className="absolute bg-purple-500 text-white text-[10px] px-2 py-1 rounded"
                                style={{ left: "10%", top: "50%", transform: "translateY(-50%)" }}
                              >
                                Intubation
                              </div>
                              <div
                                className="absolute bg-purple-500 text-white text-[10px] px-2 py-1 rounded"
                                style={{ left: "30%", top: "50%", transform: "translateY(-50%)" }}
                              >
                                Incision
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Infusions Swimlane */}
                      <div className="border-b bg-green-50/50 dark:bg-green-950/20">
                        <div className="flex items-center h-16">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-green-100/50 dark:bg-green-900/30">
                            <p className="text-xs font-semibold text-green-700 dark:text-green-400">Infusions</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-full text-[10px] mt-0.5 p-0"
                              data-testid="button-add-infusion"
                            >
                              + Add
                            </Button>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0 border-green-200 dark:border-green-800" />
                              ))}
                            </div>
                            {/* Sample infusion bars */}
                            <div className="absolute inset-0 flex items-center">
                              <div
                                className="absolute bg-green-500/70 h-6 rounded flex items-center px-2"
                                style={{ left: "8%", width: "25%" }}
                              >
                                <span className="text-white text-[10px] font-medium truncate">Propofol 100mg/h</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Drugs/Medications Swimlane */}
                      <div className="border-b bg-amber-50/50 dark:bg-amber-950/20">
                        <div className="flex items-center h-16">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-amber-100/50 dark:bg-amber-900/30">
                            <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">Drugs</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-full text-[10px] mt-0.5 p-0"
                              data-testid="button-add-drug"
                            >
                              + Add
                            </Button>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0 border-amber-200 dark:border-amber-800" />
                              ))}
                            </div>
                            {/* Sample drug administrations */}
                            <div className="absolute inset-0 flex items-center px-2">
                              <div
                                className="absolute bg-amber-500 text-white text-[10px] px-2 py-1 rounded"
                                style={{ left: "12%", top: "50%", transform: "translateY(-50%)" }}
                              >
                                Fentanyl 100μg
                              </div>
                              <div
                                className="absolute bg-amber-500 text-white text-[10px] px-2 py-1 rounded"
                                style={{ left: "28%", top: "50%", transform: "translateY(-50%)" }}
                              >
                                Rocuronium 50mg
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Staff Swimlane */}
                      <div className="bg-slate-50/50 dark:bg-slate-950/20">
                        <div className="flex items-center h-16">
                          <div className="w-24 shrink-0 px-3 py-2 border-r bg-slate-100/50 dark:bg-slate-900/30">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-400">Staff</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-full text-[10px] mt-0.5 p-0"
                              data-testid="button-add-staff"
                            >
                              + Add
                            </Button>
                          </div>
                          <div className="flex-1 relative h-full">
                            {/* Grid lines */}
                            <div className="absolute inset-0 flex">
                              {Array.from({ length: 13 }).map((_, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0 border-slate-200 dark:border-slate-800" />
                              ))}
                            </div>
                            {/* Sample staff presence bars */}
                            <div className="absolute inset-0 flex flex-col justify-center gap-1 px-2">
                              <div
                                className="bg-slate-600 dark:bg-slate-400 h-4 rounded flex items-center px-2"
                                style={{ width: "70%" }}
                              >
                                <span className="text-white dark:text-slate-900 text-[10px] font-medium">Dr. Smith (Anesthesiologist)</span>
                              </div>
                              <div
                                className="bg-slate-500 dark:bg-slate-500 h-4 rounded flex items-center px-2"
                                style={{ width: "70%", marginLeft: "5%" }}
                              >
                                <span className="text-white text-[10px] font-medium">Nurse Johnson</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
