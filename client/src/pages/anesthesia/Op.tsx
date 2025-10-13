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
  Gauge, 
  Heart, 
  Thermometer,
  Wind, 
  Syringe,
  Users,
  Clock,
  FileCheck,
  ClipboardList,
  Plus,
  UserCircle,
  UserRound,
  AlertCircle,
  LineChart
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
      <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden">
        {/* Fixed Patient Info Header */}
        <div className="shrink-0 border-b bg-background relative">
          {/* Close Button - Fixed top-right */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="absolute right-2 top-2 md:right-4 md:top-4 z-10"
            data-testid="button-close-op"
          >
            <X className="h-5 w-5" />
          </Button>

          <div className="px-4 md:px-6 py-3 pr-12 md:pr-14">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4 md:flex-wrap">
              {/* Patient Name & Icon */}
              <div className="flex items-center gap-3">
                {currentPatient.sex === "M" ? (
                  <UserCircle className="h-8 w-8 text-blue-500" />
                ) : (
                  <UserRound className="h-8 w-8 text-pink-500" />
                )}
                <div>
                  <h2 className="font-bold text-base md:text-lg">{currentPatient.surname}, {currentPatient.firstName}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    {new Date(currentPatient.birthday).toLocaleDateString()} ({calculateAge(currentPatient.birthday)} y) • {currentPatient.patientId}
                  </p>
                </div>
              </div>

              {/* Surgery Info */}
              <div className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs font-medium text-primary/70">PROCEDURE</p>
                <p className="font-semibold text-sm text-primary">{currentCase.plannedSurgery}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{currentCase.surgeon} • {new Date(currentCase.plannedDate).toLocaleDateString()}</p>
              </div>

              {/* Height/Weight/BMI - Hide on mobile, show on md+ */}
              <div className="hidden md:flex gap-4">
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
              <div className="flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg">
                <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400" />
                <div>
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300">ALLERGIES</p>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                    {currentPatient.allergies.join(", ")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="vitals" className="flex-1 flex flex-col min-h-0">
          <div className="px-2 md:px-6 shrink-0 border-b">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="vitals" data-testid="tab-vitals" className="flex-col md:flex-row gap-1 md:gap-2 py-2">
                <LineChart className="h-4 w-4" />
                <span className="text-xs md:text-sm">Vitals</span>
              </TabsTrigger>
              <TabsTrigger value="anesthesia" data-testid="tab-anesthesia" className="flex-col md:flex-row gap-1 md:gap-2 py-2">
                <Syringe className="h-4 w-4" />
                <span className="text-xs md:text-sm">Anesthesia</span>
              </TabsTrigger>
              <TabsTrigger value="checklists" data-testid="tab-checklists" className="flex-col md:flex-row gap-1 md:gap-2 py-2">
                <FileCheck className="h-4 w-4" />
                <span className="text-xs md:text-sm">Checklists</span>
              </TabsTrigger>
              <TabsTrigger value="postop" data-testid="tab-postop" className="flex-col md:flex-row gap-1 md:gap-2 py-2">
                <ClipboardList className="h-4 w-4" />
                <span className="text-xs md:text-sm">Post-op</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Vitals & Timeline Tab */}
          <TabsContent value="vitals" className="flex-1 overflow-hidden mt-0">
            <div className="h-full px-4 md:px-6 pt-4 pb-6">
              {/* Merged Vitals Timeline Container */}
              <div className="h-full border rounded-lg bg-card overflow-hidden flex flex-col">
                {/* Time Markers - Sticky Header */}
                <div className="border-b bg-muted/30 sticky top-0 z-20">
                  <div className="flex">
                    {/* Sticky first column spacer */}
                    <div className="w-32 md:w-40 shrink-0 border-r bg-muted/30" />
                    {/* Scrollable time markers */}
                    <div className="flex-1 overflow-x-auto">
                      <div className="flex min-w-[1200px]">
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
                </div>

                {/* Merged Vitals Swimlane */}
                <div className="flex-1 overflow-hidden">
                  <div className="flex h-full">
                    {/* Sticky First Column: Scales & Buttons */}
                    <div className="w-32 md:w-40 shrink-0 border-r bg-muted/10 flex flex-col sticky left-0 z-10">
                      {/* Numeric Scales */}
                      <div className="flex-1 relative grid grid-cols-4">
                        {/* BP Scale (200-50) */}
                        <div className="border-r py-2 relative">
                          <div className="h-full flex flex-col justify-between text-[10px] text-blue-600 font-medium px-1">
                            <span>200</span>
                            <span>150</span>
                            <span>100</span>
                            <span className="text-blue-400">50</span>
                          </div>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground whitespace-nowrap">
                            BP
                          </div>
                        </div>
                        
                        {/* HR Scale (200-20) */}
                        <div className="border-r py-2 relative">
                          <div className="h-full flex flex-col justify-between text-[10px] text-red-600 font-medium px-1">
                            <span>200</span>
                            <span>140</span>
                            <span>80</span>
                            <span className="text-red-400">20</span>
                          </div>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground whitespace-nowrap">
                            HR
                          </div>
                        </div>
                        
                        {/* Temp Scale (42-34) */}
                        <div className="border-r py-2 relative">
                          <div className="h-full flex flex-col justify-between text-[10px] text-orange-600 font-medium px-1">
                            <span>42</span>
                            <span>38</span>
                            <span>36</span>
                            <span className="text-orange-400">34</span>
                          </div>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground whitespace-nowrap">
                            Temp
                          </div>
                        </div>
                        
                        {/* SpO2 Scale (100-50) */}
                        <div className="py-2 relative">
                          <div className="h-full flex flex-col justify-between text-[10px] text-cyan-600 font-medium px-1">
                            <span>100</span>
                            <span>90</span>
                            <span>80</span>
                            <span className="text-cyan-400">50</span>
                          </div>
                          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 text-[10px] text-muted-foreground whitespace-nowrap">
                            SpO2
                          </div>
                        </div>
                      </div>

                      {/* Quick Add Buttons */}
                      <div className="border-t p-2 space-y-1">
                        <Button 
                          variant="outline" 
                          className="w-full h-10 flex items-center gap-2 justify-start text-xs p-2"
                          data-testid="button-add-bp"
                        >
                          <Gauge className="h-4 w-4 text-blue-600" />
                          <span>BP</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full h-10 flex items-center gap-2 justify-start text-xs p-2"
                          data-testid="button-add-hr"
                        >
                          <Heart className="h-4 w-4 text-red-600" />
                          <span>HR</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full h-10 flex items-center gap-2 justify-start text-xs p-2"
                          data-testid="button-add-temp"
                        >
                          <Thermometer className="h-4 w-4 text-orange-600" />
                          <span>Temp</span>
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full h-10 flex items-center gap-2 justify-start text-xs p-2"
                          data-testid="button-add-spo2"
                        >
                          <Wind className="h-4 w-4 text-cyan-600" />
                          <span>SpO2</span>
                        </Button>
                      </div>
                    </div>

                    {/* Scrollable Timeline Area */}
                    <div className="flex-1 overflow-x-auto overflow-y-hidden">
                      <div className="min-w-[1200px] h-full relative">
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex">
                          {Array.from({ length: 13 }).map((_, i) => (
                            <div key={i} className="flex-1 border-r last:border-r-0" />
                          ))}
                        </div>

                        {/* Vitals Data Visualization */}
                        <div className="absolute inset-0 p-4">
                          <svg className="w-full h-full">
                            {/* BP Systolic (blue) - scale 200-50 */}
                            <line x1="5%" y1="20%" x2="15%" y2="25%" stroke="#2563eb" strokeWidth="2" />
                            <line x1="15%" y1="25%" x2="25%" y2="22%" stroke="#2563eb" strokeWidth="2" />
                            <circle cx="5%" cy="20%" r="4" fill="#2563eb" />
                            <circle cx="15%" cy="25%" r="4" fill="#2563eb" />
                            <circle cx="25%" cy="22%" r="4" fill="#2563eb" />
                            
                            {/* BP Diastolic (light blue) - scale 200-50 */}
                            <line x1="5%" y1="35%" x2="15%" y2="38%" stroke="#60a5fa" strokeWidth="2" strokeDasharray="4" />
                            <line x1="15%" y1="38%" x2="25%" y2="36%" stroke="#60a5fa" strokeWidth="2" strokeDasharray="4" />
                            <circle cx="5%" cy="35%" r="3" fill="#60a5fa" />
                            <circle cx="15%" cy="38%" r="3" fill="#60a5fa" />
                            <circle cx="25%" cy="36%" r="3" fill="#60a5fa" />
                            
                            {/* HR (red) - scale 200-20 */}
                            <line x1="5%" y1="50%" x2="15%" y2="48%" stroke="#dc2626" strokeWidth="2" />
                            <line x1="15%" y1="48%" x2="25%" y2="52%" stroke="#dc2626" strokeWidth="2" />
                            <circle cx="5%" cy="50%" r="4" fill="#dc2626" />
                            <circle cx="15%" cy="48%" r="4" fill="#dc2626" />
                            <circle cx="25%" cy="52%" r="4" fill="#dc2626" />
                            
                            {/* Temp (orange) - scale 42-34 */}
                            <line x1="5%" y1="55%" x2="15%" y2="54%" stroke="#ea580c" strokeWidth="2" />
                            <line x1="15%" y1="54%" x2="25%" y2="56%" stroke="#ea580c" strokeWidth="2" />
                            <circle cx="5%" cy="55%" r="4" fill="#ea580c" />
                            <circle cx="15%" cy="54%" r="4" fill="#ea580c" />
                            <circle cx="25%" cy="56%" r="4" fill="#ea580c" />
                            
                            {/* SpO2 (cyan) - scale 100-50 */}
                            <line x1="5%" y1="15%" x2="15%" y2="18%" stroke="#0891b2" strokeWidth="2" />
                            <line x1="15%" y1="18%" x2="25%" y2="16%" stroke="#0891b2" strokeWidth="2" />
                            <circle cx="5%" cy="15%" r="4" fill="#0891b2" />
                            <circle cx="15%" cy="18%" r="4" fill="#0891b2" />
                            <circle cx="25%" cy="16%" r="4" fill="#0891b2" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Clinical Swimlanes - Events, Infusions, Drugs, Staff */}
                <div className="border-t">
                  <div className="flex">
                    {/* Sticky first column spacer */}
                    <div className="w-32 md:w-40 shrink-0 border-r bg-muted/10" />
                    {/* Scrollable swimlanes area */}
                    <div className="flex-1 overflow-x-auto">
                      <div className="min-w-[1200px]">
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
