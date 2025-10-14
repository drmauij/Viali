import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { UnifiedTimeline, type UnifiedTimelineData, type TimelineVitals, type TimelineEvent } from "@/components/anesthesia/UnifiedTimeline";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
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
  LineChart,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
  ZoomOut,
  Activity,
  MessageSquare,
  ChevronDown,
  Droplet
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
  
  // Generate mock timeline data - memoized
  const timelineData = useMemo((): UnifiedTimelineData => {
    const t0 = +new Date();
    const startTime = new Date(t0);
    startTime.setHours(8, 30, 0, 0);
    const t0Ms = +startTime;
    const step = 5 * 60 * 1000; // 5-minute intervals
    
    // Helper functions
    const seq = (n: number) => Array.from({ length: n }, (_, i) => i);
    const jitter = (base: number, amp = 5) => base + Math.round((Math.random() - .5) * 2 * amp);
    
    const times = seq(48).map(i => t0Ms + i * step); // 4 hours of data
    
    // Vitals data
    const vitals: TimelineVitals = {
      sysBP: times.map((t, i) => [t, jitter(120 + Math.round(8 * Math.sin(i / 4)), 4)] as [number, number]),
      diaBP: times.map((t, i) => [t, jitter(75 + Math.round(6 * Math.cos(i / 5)), 3)] as [number, number]),
      hr: times.map((t, i) => [t, jitter(68 + Math.round(5 * Math.sin(i / 3)), 3)] as [number, number]),
      spo2: times.map((t) => [t, jitter(98, 1)] as [number, number]),
    };
    
    // Events
    const events: TimelineEvent[] = [
      // Zeiten
      { time: t0Ms + 2 * step, swimlane: "zeiten", label: "Anästhesie Start", icon: "⏱", color: "#8b5cf6" },
      { time: t0Ms + 8 * step, swimlane: "zeiten", label: "Schnitt", icon: "✂️", color: "#8b5cf6" },
      { time: t0Ms + 35 * step, swimlane: "zeiten", label: "Naht", icon: "🧵", color: "#8b5cf6" },
      
      // Ereignisse
      { time: t0Ms + 5 * step, swimlane: "ereignisse", label: "Intubation", icon: "🫁", color: "#3b82f6" },
      { time: t0Ms + 15 * step, swimlane: "ereignisse", label: "Position change", icon: "🔄", color: "#3b82f6" },
      
      // Medikamente (bolus)
      { time: t0Ms + 3 * step, swimlane: "medikamente", label: "Propofol 200mg", icon: "💉", color: "#10b981", row: 0 },
      { time: t0Ms + 3 * step, swimlane: "medikamente", label: "Fentanyl 200µg", icon: "💉", color: "#10b981", row: 1 },
      { time: t0Ms + 12 * step, swimlane: "medikamente", label: "Rocuronium 50mg", icon: "💉", color: "#10b981", row: 0 },
      { time: t0Ms + 20 * step, swimlane: "medikamente", label: "Ephedrin 10mg", icon: "💉", color: "#10b981", row: 2 },
      
      // Infusionen (duration)
      { time: t0Ms + 5 * step, swimlane: "infusionen", label: "Ringer 1000ml", duration: 25 * step, color: "#06b6d4" },
      { time: t0Ms + 6 * step, swimlane: "perfusors", label: "Propofol 1% 5ml/h", duration: 35 * step, color: "#06b6d4" },
      { time: t0Ms + 6 * step, swimlane: "perfusors", label: "Remifentanil 0.2µg/kg/min", duration: 35 * step, color: "#06b6d4" },
      
      // Ventilation (with row parameters)
      { time: t0Ms + 5 * step, swimlane: "ventilation", label: "FiO₂ 50%", duration: 40 * step, color: "#f59e0b", row: 0 },
      { time: t0Ms + 10 * step, swimlane: "ventilation", label: "PEEP 5", duration: 30 * step, color: "#f59e0b", row: 1 },
      { time: t0Ms + 7 * step, swimlane: "ventilation", label: "VT 450ml", duration: 38 * step, color: "#f59e0b", row: 2 },
      { time: t0Ms + 8 * step, swimlane: "ventilation", label: "RR 12/min", duration: 37 * step, color: "#f59e0b", row: 3 },
      { time: t0Ms + 9 * step, swimlane: "ventilation", label: "Pinsp 18cmH2O", duration: 36 * step, color: "#f59e0b", row: 4 },
    ];
    
    return {
      startTime: t0Ms,
      endTime: t0Ms + 47 * step,
      vitals,
      events,
    };
  }, []);

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
      <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden" aria-describedby="op-dialog-description">
        <h2 className="sr-only" id="op-dialog-title">Intraoperative Monitoring - {currentPatient.surname}, {currentPatient.firstName}</h2>
        <p className="sr-only" id="op-dialog-description">Professional anesthesia monitoring system for tracking vitals, medications, and clinical events during surgery</p>
        {/* Fixed Patient Info Header */}
        <div className="shrink-0 bg-background relative">
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
          <div className="px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="vitals" data-testid="tab-vitals">Vitals</TabsTrigger>
              <TabsTrigger value="anesthesia" data-testid="tab-anesthesia">Anesthesia</TabsTrigger>
              <TabsTrigger value="checklists" data-testid="tab-checklists">Checklists</TabsTrigger>
              <TabsTrigger value="postop" data-testid="tab-postop">Post-op</TabsTrigger>
            </TabsList>
          </div>

          {/* Vitals & Timeline Tab */}
          <TabsContent value="vitals" className="data-[state=active]:flex-1 overflow-y-auto flex flex-col mt-0 px-0" data-testid="tab-content-vitals">
            <div className="border-t bg-card">
              <UnifiedTimeline data={timelineData} height={750} />
            </div>
          </TabsContent>

          {/* Anesthesia Documentation Tab */}
          <TabsContent value="anesthesia" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
            <Accordion type="multiple" className="space-y-4 w-full">
              {/* Installations Section */}
              <AccordionItem value="installations">
                <Card>
                  <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-installations">
                    <CardTitle className="text-lg">Installations</CardTitle>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="space-y-6 pt-0">
                      {/* Peripheral Access */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-base font-semibold">Peripheral Venous Access</Label>
                          <Button variant="outline" size="sm" data-testid="button-add-pv-access">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Entry
                          </Button>
                        </div>
                        
                        {/* Entry 1 */}
                        <div className="border rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-900">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Entry #1</span>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-remove-pv-1">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Location</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-pv-location-1">
                                <option value="">Select location</option>
                                <option value="right-hand">Right Hand (Dorsum)</option>
                                <option value="left-hand">Left Hand (Dorsum)</option>
                                <option value="right-forearm">Right Forearm</option>
                                <option value="left-forearm">Left Forearm</option>
                                <option value="right-ac-fossa">Right Antecubital Fossa</option>
                                <option value="left-ac-fossa">Left Antecubital Fossa</option>
                                <option value="right-wrist">Right Wrist</option>
                                <option value="left-wrist">Left Wrist</option>
                                <option value="right-foot">Right Foot</option>
                                <option value="left-foot">Left Foot</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Gauge</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-pv-gauge-1">
                                <option value="">Select gauge</option>
                                <option value="14G">14G (Orange)</option>
                                <option value="16G">16G (Gray)</option>
                                <option value="18G">18G (Green)</option>
                                <option value="20G">20G (Pink)</option>
                                <option value="22G">22G (Blue)</option>
                                <option value="24G">24G (Yellow)</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Number of Attempts</Label>
                            <Input type="number" placeholder="1" defaultValue="1" data-testid="input-pv-attempts-1" />
                          </div>
                          <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-pv-notes-1" />
                          </div>
                        </div>
                      </div>

                      {/* Arterial Line */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Arterial Line</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Location</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-location">
                                <option value="">Select location</option>
                                <option value="radial-left">Radial - Left</option>
                                <option value="radial-right">Radial - Right</option>
                                <option value="femoral-left">Femoral - Left</option>
                                <option value="femoral-right">Femoral - Right</option>
                                <option value="brachial">Brachial</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Gauge</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-gauge">
                                <option value="">Select gauge</option>
                                <option value="18G">18G</option>
                                <option value="20G">20G</option>
                                <option value="22G">22G</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-arterial-attempts" />
                            </div>
                            <div className="space-y-2">
                              <Label>Technique</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-arterial-technique">
                                <option value="">Select technique</option>
                                <option value="palpation">Palpation</option>
                                <option value="ultrasound">Ultrasound-guided</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Notes</Label>
                            <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-arterial-notes" />
                          </div>
                        </div>
                      </div>

                      {/* Central Venous Catheter */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Central Venous Catheter (CVC)</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Location</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-location">
                                <option value="">Select location</option>
                                <option value="ijv-right">Internal Jugular - Right</option>
                                <option value="ijv-left">Internal Jugular - Left</option>
                                <option value="subclavian-right">Subclavian - Right</option>
                                <option value="subclavian-left">Subclavian - Left</option>
                                <option value="femoral-right">Femoral - Right</option>
                                <option value="femoral-left">Femoral - Left</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Type</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-type">
                                <option value="">Select type</option>
                                <option value="triple-lumen">Triple Lumen</option>
                                <option value="double-lumen">Double Lumen</option>
                                <option value="single-lumen">Single Lumen</option>
                                <option value="introducer">Introducer (8.5Fr/9Fr)</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Insertion Depth (cm)</Label>
                              <Input type="number" placeholder="e.g., 15" data-testid="input-cvc-depth" />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-cvc-attempts" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Technique</Label>
                            <div className="flex gap-4">
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-cvc-ultrasound" />
                                <span>Ultrasound-guided</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-cvc-landmark" />
                                <span>Landmark</span>
                              </label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Complications</Label>
                            <Textarea rows={2} placeholder="None / Document any complications..." data-testid="textarea-cvc-complications" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>

              {/* Airway Management Section */}
              <AccordionItem value="airway">
                <Card>
                  <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-airway">
                    <CardTitle className="text-lg">Airway Management</CardTitle>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="space-y-6 pt-0">
                      {/* Airway Assessment */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Airway Assessment</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Mallampati Score</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-mallampati">
                                <option value="">Select score</option>
                                <option value="1">Class I</option>
                                <option value="2">Class II</option>
                                <option value="3">Class III</option>
                                <option value="4">Class IV</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Thyromental Distance</Label>
                              <Input placeholder="e.g., >6.5 cm" data-testid="input-thyromental" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Mouth Opening</Label>
                              <Input placeholder="e.g., >3 fingers" data-testid="input-mouth-opening" />
                            </div>
                            <div className="space-y-2">
                              <Label>Neck Mobility</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-neck-mobility">
                                <option value="">Select</option>
                                <option value="full">Full</option>
                                <option value="limited">Limited</option>
                                <option value="severely-limited">Severely Limited</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Airway Device */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Airway Device</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Device Type</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-airway-device">
                                <option value="">Select device</option>
                                <option value="ett">Endotracheal Tube (ETT)</option>
                                <option value="lma">Laryngeal Mask Airway (LMA)</option>
                                <option value="igel">I-gel</option>
                                <option value="face-mask">Face Mask Only</option>
                                <option value="tracheostomy">Tracheostomy</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Size</Label>
                              <Input placeholder="e.g., 7.5mm, #4" data-testid="input-airway-size" />
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Cuff Pressure (cmH2O)</Label>
                              <Input type="number" placeholder="20-30" data-testid="input-cuff-pressure" />
                            </div>
                            <div className="space-y-2">
                              <Label>Depth at Teeth (cm)</Label>
                              <Input type="number" placeholder="e.g., 21" data-testid="input-tube-depth" />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-intubation-attempts" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Laryngoscopy View (Cormack-Lehane)</Label>
                            <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cormack-lehane">
                              <option value="">Select grade</option>
                              <option value="1">Grade 1 - Full view of glottis</option>
                              <option value="2">Grade 2 - Partial view of glottis</option>
                              <option value="3">Grade 3 - Only epiglottis visible</option>
                              <option value="4">Grade 4 - No glottic structures visible</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Difficult Airway Documentation */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold text-red-600 dark:text-red-400">Difficult Airway Management</Label>
                        <div className="border-2 border-red-300 dark:border-red-700 rounded-lg p-4 space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox data-testid="checkbox-difficult-airway" />
                            <Label className="font-semibold">Difficult Airway Encountered</Label>
                          </div>
                          <div className="space-y-2">
                            <Label>Difficulty Type</Label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-difficult-ventilation" />
                                <span>Difficult Mask Ventilation</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-difficult-intubation" />
                                <span>Difficult Intubation</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-difficult-lma" />
                                <span>Difficult LMA Placement</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <Checkbox data-testid="checkbox-failed-intubation" />
                                <span>Failed Intubation</span>
                              </label>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Rescue Techniques Used</Label>
                            <Textarea rows={3} placeholder="Document all rescue techniques, additional equipment used, personnel called for assistance..." data-testid="textarea-rescue-techniques" />
                          </div>
                          <div className="space-y-2">
                            <Label>Final Airway Outcome</Label>
                            <Textarea rows={2} placeholder="Document final successful technique and airway status..." data-testid="textarea-airway-outcome" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>

              {/* Central/Regional Anesthesia Section */}
              <AccordionItem value="central-regional">
                <Card>
                  <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-central-regional">
                    <CardTitle className="text-lg">Central/Regional Anesthesia</CardTitle>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="space-y-6 pt-0">
                      {/* Spinal Anesthesia */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Spinal Anesthesia</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Level</Label>
                              <Input placeholder="e.g., L3-L4" data-testid="input-spinal-level" />
                            </div>
                            <div className="space-y-2">
                              <Label>Technique</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-spinal-technique">
                                <option value="">Select technique</option>
                                <option value="midline">Midline</option>
                                <option value="paramedian">Paramedian</option>
                                <option value="taylor">Taylor Approach</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Needle Gauge</Label>
                              <Input placeholder="e.g., 25G" data-testid="input-spinal-needle" />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-spinal-attempts" />
                            </div>
                            <div className="space-y-2">
                              <Label>Position</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-spinal-position">
                                <option value="">Select</option>
                                <option value="sitting">Sitting</option>
                                <option value="lateral">Lateral</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Local Anesthetic</Label>
                            <Input placeholder="e.g., Bupivacaine 0.5% heavy 12.5mg" data-testid="input-spinal-drug" />
                          </div>
                          <div className="space-y-2">
                            <Label>Additives</Label>
                            <Input placeholder="e.g., Fentanyl 20mcg, Morphine 100mcg" data-testid="input-spinal-additives" />
                          </div>
                          <div className="space-y-2">
                            <Label>Sensory Level Achieved</Label>
                            <Input placeholder="e.g., T6" data-testid="input-sensory-level" />
                          </div>
                        </div>
                      </div>

                      {/* Epidural Anesthesia */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Epidural Anesthesia (PDA)</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Level</Label>
                              <Input placeholder="e.g., T8-T9" data-testid="input-epidural-level" />
                            </div>
                            <div className="space-y-2">
                              <Label>Technique</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-epidural-technique">
                                <option value="">Select technique</option>
                                <option value="midline">Midline</option>
                                <option value="paramedian">Paramedian</option>
                                <option value="loss-of-resistance-air">Loss of Resistance - Air</option>
                                <option value="loss-of-resistance-saline">Loss of Resistance - Saline</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Needle Gauge</Label>
                              <Input placeholder="e.g., 18G Tuohy" data-testid="input-epidural-needle" />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-epidural-attempts" />
                            </div>
                            <div className="space-y-2">
                              <Label>Catheter Depth (cm)</Label>
                              <Input type="number" placeholder="e.g., 10" data-testid="input-catheter-depth" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Test Dose</Label>
                            <Input placeholder="e.g., Lidocaine 2% with Epi 1:200,000 - 3ml" data-testid="input-test-dose" />
                          </div>
                          <div className="space-y-2">
                            <Label>Loading Dose</Label>
                            <Input placeholder="e.g., Ropivacaine 0.2% 10ml" data-testid="input-loading-dose" />
                          </div>
                          <div className="space-y-2">
                            <Label>Infusion Rate</Label>
                            <Input placeholder="e.g., 6-8 ml/hr" data-testid="input-infusion-rate" />
                          </div>
                          <div className="space-y-2">
                            <Label>Sensory Level Achieved</Label>
                            <Input placeholder="e.g., T4-T10" data-testid="input-epidural-sensory-level" />
                          </div>
                        </div>
                      </div>

                      {/* Combined Spinal-Epidural */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Combined Spinal-Epidural (CSE)</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="space-y-2">
                            <Label>Technique Details</Label>
                            <Textarea rows={3} placeholder="Document needle-through-needle or separate space technique, medications used, catheter placement..." data-testid="textarea-cse-details" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>

              {/* Peripheral Regional Anesthesia Section */}
              <AccordionItem value="peripheral-blocks">
                <Card>
                  <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-peripheral-blocks">
                    <CardTitle className="text-lg">Peripheral Regional Anesthesia (Nerve Blocks)</CardTitle>
                  </AccordionTrigger>
                  <AccordionContent>
                    <CardContent className="space-y-6 pt-0">
                      {/* Block Details */}
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Block Information</Label>
                        <div className="border rounded-lg p-4 space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Block Type</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-block-type">
                                <option value="">Select block</option>
                                <optgroup label="Upper Extremity">
                                  <option value="interscalene">Interscalene Block</option>
                                  <option value="supraclavicular">Supraclavicular Block</option>
                                  <option value="infraclavicular">Infraclavicular Block</option>
                                  <option value="axillary">Axillary Block</option>
                                  <option value="pecs">PECS Block</option>
                                </optgroup>
                                <optgroup label="Lower Extremity">
                                  <option value="femoral">Femoral Block</option>
                                  <option value="sciatic">Sciatic Block</option>
                                  <option value="popliteal">Popliteal Block</option>
                                  <option value="adductor-canal">Adductor Canal Block</option>
                                  <option value="ankle">Ankle Block</option>
                                </optgroup>
                                <optgroup label="Truncal">
                                  <option value="tap">TAP Block</option>
                                  <option value="ql">Quadratus Lumborum Block</option>
                                  <option value="esp">Erector Spinae Plane Block</option>
                                  <option value="paravertebral">Paravertebral Block</option>
                                  <option value="intercostal">Intercostal Block</option>
                                </optgroup>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Side</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-block-side">
                                <option value="">Select side</option>
                                <option value="left">Left</option>
                                <option value="right">Right</option>
                                <option value="bilateral">Bilateral</option>
                              </select>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Technique</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-block-technique">
                                <option value="">Select</option>
                                <option value="ultrasound">Ultrasound-guided</option>
                                <option value="nerve-stimulator">Nerve Stimulator</option>
                                <option value="combined">Combined US + NS</option>
                                <option value="landmark">Landmark</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Needle Size</Label>
                              <Input placeholder="e.g., 22G 80mm" data-testid="input-block-needle" />
                            </div>
                            <div className="space-y-2">
                              <Label>Number of Attempts</Label>
                              <Input type="number" placeholder="1" data-testid="input-block-attempts" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Local Anesthetic</Label>
                            <Input placeholder="e.g., Ropivacaine 0.5% 20ml" data-testid="input-block-drug" />
                          </div>
                          <div className="space-y-2">
                            <Label>Additives</Label>
                            <Input placeholder="e.g., Dexamethasone 4mg, Dexmedetomidine 50mcg" data-testid="input-block-additives" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Catheter Placed</Label>
                              <select className="w-full border rounded-md p-2 bg-background" data-testid="select-catheter-placed">
                                <option value="no">No</option>
                                <option value="yes">Yes - Continuous Infusion</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <Label>Infusion Rate (if applicable)</Label>
                              <Input placeholder="e.g., 5 ml/hr" data-testid="input-block-infusion" />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Block Assessment</Label>
                            <Textarea rows={2} placeholder="Document sensory/motor block onset time, distribution, quality..." data-testid="textarea-block-assessment" />
                          </div>
                          <div className="space-y-2">
                            <Label>Complications</Label>
                            <Textarea rows={2} placeholder="None / Document any complications..." data-testid="textarea-block-complications" />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </AccordionContent>
                </Card>
              </AccordionItem>
            </Accordion>
          </TabsContent>

          {/* WHO Checklists Tab */}
          <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
            {/* Sign-In Checklist */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-green-700 dark:text-green-300">Sign-In (Before Induction)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
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
                </div>
                
                <div className="pt-4 border-t">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes for Sign-In checklist..."
                    rows={2}
                    data-testid="textarea-signin-notes"
                  />
                </div>
                
                <div>
                  <Label>Verified By (Signature)</Label>
                  <div className="border rounded-md p-2 bg-white dark:bg-slate-950 h-24" data-testid="signature-signin">
                    <canvas className="w-full h-full" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Time-Out Checklist */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-yellow-700 dark:text-yellow-300">Team Time-Out (Before Skin Incision)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
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
                </div>
                
                <div className="pt-4 border-t">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes for Time-Out checklist..."
                    rows={2}
                    data-testid="textarea-timeout-notes"
                  />
                </div>
                
                <div>
                  <Label>Verified By (Signature)</Label>
                  <div className="border rounded-md p-2 bg-white dark:bg-slate-950 h-24" data-testid="signature-timeout">
                    <canvas className="w-full h-full" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sign-Out Checklist */}
            <Card className="mb-4">
              <CardHeader>
                <CardTitle className="text-red-700 dark:text-red-300">Sign-Out (Before Patient Leaves OR)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
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
                </div>
                
                <div className="pt-4 border-t">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes for Sign-Out checklist..."
                    rows={2}
                    data-testid="textarea-signout-notes"
                  />
                </div>
                
                <div>
                  <Label>Verified By (Signature)</Label>
                  <div className="border rounded-md p-2 bg-white dark:bg-slate-950 h-24" data-testid="signature-signout">
                    <canvas className="w-full h-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Post-op Management Tab */}
          <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 mt-0">
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
