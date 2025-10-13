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
  
  // Timeline navigation state
  const [timelineStart, setTimelineStart] = useState(8); // Start hour (8:00 AM)
  const [zoomLevel, setZoomLevel] = useState(5); // Minutes per interval (5, 10, 15, 30)
  const [expandedSections, setExpandedSections] = useState<{[key: string]: boolean}>({
    beatmungsparameter: false,
  });

  // Calculate time intervals based on zoom
  const getTimeIntervals = () => {
    const intervals = [];
    const totalMinutes = 360; // 6 hours visible
    for (let i = 0; i <= totalMinutes; i += zoomLevel) {
      const hour = Math.floor((timelineStart * 60 + i) / 60);
      const minute = (timelineStart * 60 + i) % 60;
      intervals.push({ hour, minute: minute.toString().padStart(2, '0') });
    }
    return intervals;
  };

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
          <div className="px-6 shrink-0">
            <TabsList className="grid w-full grid-cols-4 mb-4">
              <TabsTrigger value="vitals" data-testid="tab-vitals">Vitals</TabsTrigger>
              <TabsTrigger value="anesthesia" data-testid="tab-anesthesia">Anesthesia</TabsTrigger>
              <TabsTrigger value="checklists" data-testid="tab-checklists">Checklists</TabsTrigger>
              <TabsTrigger value="postop" data-testid="tab-postop">Post-op</TabsTrigger>
            </TabsList>
          </div>

          {/* Vitals & Timeline Tab */}
          <TabsContent value="vitals" className="flex-1 overflow-hidden flex flex-col">
            {/* Professional Timeline Container */}
            <div className="flex-1 border-t bg-card overflow-hidden flex flex-col relative z-0">
                {/* Timeline Header with Navigation & Time Markers */}
                <div className="border-b bg-muted/30 shrink-0 relative z-0">
                  <div className="flex">
                    {/* Left Column: Navigation Controls */}
                    <div className="w-44 shrink-0 border-r bg-muted/30 flex items-center justify-between px-2 py-1">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setTimelineStart(Math.max(0, timelineStart - 1))}
                          data-testid="button-timeline-start"
                        >
                          <ChevronsLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setTimelineStart(Math.max(0, timelineStart - 0.25))}
                          data-testid="button-timeline-backward"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="text-xs font-medium">
                        {new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setTimelineStart(timelineStart + 0.25)}
                          data-testid="button-timeline-forward"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setTimelineStart(timelineStart + 1)}
                          data-testid="button-timeline-end"
                        >
                          <ChevronsRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Scrollable Time Markers */}
                    <div className="flex-1 overflow-x-auto">
                      <div className="flex min-w-[1400px]">
                        {getTimeIntervals().map((time, i) => (
                          <div
                            key={i}
                            className="flex-1 text-center py-1.5 border-r last:border-r-0 text-[10px] font-medium"
                          >
                            <div>{time.hour}:{time.minute}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    {/* Right: Zoom Controls */}
                    <div className="w-24 shrink-0 border-l bg-muted/30 flex items-center justify-center gap-1 px-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setZoomLevel(Math.min(30, zoomLevel + 5))}
                        data-testid="button-zoom-out"
                      >
                        <ZoomOut className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setZoomLevel(Math.max(5, zoomLevel - 5))}
                        data-testid="button-zoom-in"
                      >
                        <ZoomIn className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Professional Vitals & Clinical Swimlanes */}
                <div className="flex-1 overflow-y-auto">
                  <div className="flex">
                    {/* Sticky Left Column with Icons & Scales */}
                    <div className="w-44 shrink-0 border-r bg-gray-50 dark:bg-gray-900 sticky left-0 z-10 flex flex-col">
                      {/* Integrated Vitals with Unified Scale */}
                      <div className="h-96 border-b flex items-center justify-between px-3 relative bg-slate-50 dark:bg-slate-900">
                        {/* Parameter Icons on left - Clickable/Touchable Buttons */}
                        <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
                          <button className="flex flex-col items-center gap-0.5 p-2 border-2 border-blue-600 dark:border-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 active:bg-blue-100 dark:active:bg-blue-900/40 transition-colors" data-testid="button-vitals-nibp">
                            <Gauge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <span className="text-[9px] font-semibold text-blue-600 dark:text-blue-400">NIBP</span>
                          </button>
                          <button className="flex flex-col items-center gap-0.5 p-2 border-2 border-red-600 dark:border-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 active:bg-red-100 dark:active:bg-red-900/40 transition-colors" data-testid="button-vitals-hr">
                            <Heart className="h-5 w-5 text-red-600 dark:text-red-400" />
                            <span className="text-[9px] font-semibold text-red-600 dark:text-red-400">HR</span>
                          </button>
                          <button className="flex flex-col items-center gap-0.5 p-2 border-2 border-cyan-600 dark:border-cyan-400 rounded-lg hover:bg-cyan-50 dark:hover:bg-cyan-900/20 active:bg-cyan-100 dark:active:bg-cyan-900/40 transition-colors" data-testid="button-vitals-spo2">
                            <Droplet className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                            <span className="text-[9px] font-semibold text-cyan-600 dark:text-cyan-400">SpO2</span>
                          </button>
                          <button className="flex flex-col items-center gap-0.5 p-2 border-2 border-orange-600 dark:border-orange-400 rounded-lg hover:bg-orange-50 dark:hover:bg-orange-900/20 active:bg-orange-100 dark:active:bg-orange-900/40 transition-colors" data-testid="button-vitals-temp">
                            <Thermometer className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            <span className="text-[9px] font-semibold text-orange-600 dark:text-orange-400">°C</span>
                          </button>
                        </div>
                        
                        {/* Dual Numeric Scales on right */}
                        <div className="absolute right-2 top-0 bottom-0 flex gap-4 py-4">
                          {/* 0-240 Scale for BP/HR */}
                          <div className="flex flex-col justify-between text-[10px] font-semibold text-slate-700 dark:text-slate-300">
                            <span>240</span>
                            <span>200</span>
                            <span>160</span>
                            <span>120</span>
                            <span>80</span>
                            <span>40</span>
                            <span>0</span>
                          </div>
                          {/* 50-100 Scale for SpO2 */}
                          <div className="flex flex-col justify-between text-[10px] font-semibold text-cyan-600 dark:text-cyan-400">
                            <span>100</span>
                            <span>95</span>
                            <span>90</span>
                            <span>85</span>
                            <span>80</span>
                            <span>75</span>
                            <span>50</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Zeiten (Times) */}
                      <div className="h-16 border-b bg-purple-100 dark:bg-purple-900/30 flex items-center px-3">
                        <Clock className="h-4 w-4 text-purple-700 dark:text-purple-300 mr-2" />
                        <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">Zeiten</span>
                      </div>
                      
                      {/* Ereignisse & Maßnahmen (Events) */}
                      <div className="h-16 border-b bg-gray-100 dark:bg-gray-800 flex items-center px-3">
                        <MessageSquare className="h-4 w-4 text-gray-700 dark:text-gray-300 mr-2" />
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Ereignisse</span>
                      </div>
                      
                      {/* Herzrhythmus (Heart Rhythm) */}
                      <div className="h-16 border-b bg-pink-100 dark:bg-pink-900/30 flex items-center px-3">
                        <Activity className="h-4 w-4 text-pink-700 dark:text-pink-300 mr-2" />
                        <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">Herzrhythmus</span>
                      </div>
                      
                      {/* Medikamente (Medications) */}
                      <div className="min-h-48 border-b bg-green-50 dark:bg-green-900/20">
                        <div className="px-3 py-2 border-b bg-green-100 dark:bg-green-900/40">
                          <div className="flex items-center mb-2">
                            <Syringe className="h-4 w-4 text-green-700 dark:text-green-300 mr-2" />
                            <span className="text-xs font-semibold text-green-700 dark:text-green-300">Medikamente</span>
                          </div>
                        </div>
                        <div className="px-3 py-2 space-y-1">
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>Droperidol</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>Metamizol</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>Toradol</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>NaCl</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>Glucose</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px]">
                            <Checkbox className="h-3 w-3" />
                            <span>Diclofenac</span>
                          </div>
                        </div>
                      </div>
                      
                      {/* Lagerung (Positioning) */}
                      <div className="h-16 border-b bg-emerald-100 dark:bg-emerald-900/30 flex items-center px-3">
                        <Users className="h-4 w-4 text-emerald-700 dark:text-emerald-300 mr-2" />
                        <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Lagerung</span>
                      </div>
                      
                      {/* Beatmung (Ventilation) */}
                      <div className="h-20 border-b bg-pink-100 dark:bg-pink-900/30 flex items-center px-3">
                        <Wind className="h-4 w-4 text-pink-700 dark:text-pink-300 mr-2" />
                        <span className="text-xs font-semibold text-pink-700 dark:text-pink-300">Beatmung</span>
                      </div>
                      
                      {/* Beatmungsparameter (Ventilation Parameters) */}
                      {expandedSections.beatmungsparameter && (
                        <div className="min-h-32 border-b bg-blue-50 dark:bg-blue-900/20 px-3 py-2">
                          <div className="space-y-1 text-[9px] text-gray-700 dark:text-gray-300">
                            <div>etCO2 (mmHg)</div>
                            <div>P insp (mbar)</div>
                            <div>PEEP (mbar)</div>
                            <div>Tidalvolumen (ml)</div>
                            <div>Atemfrequenz (/min)</div>
                            <div>Minutenvolumen (l/min)</div>
                            <div>FiO2 (l/min)</div>
                          </div>
                        </div>
                      )}
                      <div className="h-10 border-b bg-blue-100 dark:bg-blue-900/40 flex items-center px-3 cursor-pointer" onClick={() => setExpandedSections(prev => ({ ...prev, beatmungsparameter: !prev.beatmungsparameter }))}>
                        <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">Parameter</span>
                        <ChevronDown className={`h-3 w-3 ml-auto transition-transform ${expandedSections.beatmungsparameter ? 'rotate-180' : ''}`} />
                      </div>
                      
                      {/* Ausfuhren (Outputs) */}
                      <div className="h-16 border-b bg-orange-100 dark:bg-orange-900/30 flex items-center px-3">
                        <Droplet className="h-4 w-4 text-orange-700 dark:text-orange-300 mr-2" />
                        <span className="text-xs font-semibold text-orange-700 dark:text-orange-300">Ausfuhren</span>
                      </div>
                      
                      {/* NRS (Pain Scores) */}
                      <div className="h-16 border-b bg-green-100 dark:bg-green-900/30 flex items-center px-3">
                        <AlertCircle className="h-4 w-4 text-green-700 dark:text-green-300 mr-2" />
                        <span className="text-xs font-semibold text-green-700 dark:text-green-300">NRS</span>
                      </div>
                      
                      {/* Scores */}
                      <div className="h-16 bg-slate-100 dark:bg-slate-800 flex items-center px-3">
                        <FileCheck className="h-4 w-4 text-slate-700 dark:text-slate-300 mr-2" />
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Scores</span>
                      </div>
                    </div>
                    
                    {/* Scrollable Timeline Content */}
                    <div className="flex-1 overflow-x-auto">
                      <div className="min-w-[1400px]">
                        {/* Integrated Vitals Swimlane - BP, HR, SpO2 on unified 0-240 scale */}
                        <div className="h-96 border-b relative bg-slate-50 dark:bg-slate-900">
                          {/* Grid lines */}
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-slate-200 dark:border-slate-700" />
                            ))}
                          </div>
                          
                          {/* Horizontal guide lines for scale */}
                          <div className="absolute inset-0 pointer-events-none">
                            {[240, 200, 160, 120, 80, 40, 0].map((value, i) => (
                              <div
                                key={value}
                                className="absolute w-full border-t border-slate-300/40 dark:border-slate-600/40"
                                style={{ top: `${(i / 6) * 100}%` }}
                              />
                            ))}
                          </div>
                          
                          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1000 384" preserveAspectRatio="none">
                            {/* Sample integrated vitals data - 15 data points with standard medical values */}
                            {[
                              { x: 5, sys: 118, dia: 78, hr: 58, spo2: 99 },
                              { x: 11, sys: 122, dia: 82, hr: 62, spo2: 100 },
                              { x: 17, sys: 116, dia: 76, hr: 59, spo2: 100 },
                              { x: 23, sys: 124, dia: 84, hr: 64, spo2: 99 },
                              { x: 29, sys: 120, dia: 80, hr: 60, spo2: 100 },
                              { x: 35, sys: 119, dia: 79, hr: 61, spo2: 100 },
                              { x: 41, sys: 125, dia: 85, hr: 63, spo2: 99 },
                              { x: 47, sys: 121, dia: 81, hr: 58, spo2: 100 },
                              { x: 53, sys: 117, dia: 77, hr: 62, spo2: 100 },
                              { x: 59, sys: 123, dia: 83, hr: 60, spo2: 99 },
                              { x: 65, sys: 120, dia: 80, hr: 61, spo2: 100 },
                              { x: 71, sys: 118, dia: 78, hr: 59, spo2: 100 },
                              { x: 77, sys: 122, dia: 82, hr: 63, spo2: 99 },
                              { x: 83, sys: 119, dia: 79, hr: 60, spo2: 100 },
                              { x: 89, sys: 121, dia: 81, hr: 62, spo2: 100 }
                            ].map((data, i, arr) => {
                              // Convert to viewBox coordinates (1000 wide, 384 tall)
                              const xPx = (data.x / 100) * 1000;
                              // Using 0-240 scale for BP/HR (standard values around 120/80 and 60)
                              const sysYPx = (1 - (data.sys / 240)) * 384;
                              const diaYPx = (1 - (data.dia / 240)) * 384;
                              const hrYPx = (1 - (data.hr / 240)) * 384;
                              // Using 50-100 scale for SpO2 (values around 100)
                              const spo2YPx = (1 - ((data.spo2 - 50) / 50)) * 384;
                              const mapValue = (data.sys + 2 * data.dia) / 3;
                              const mapYPx = (1 - (mapValue / 240)) * 384;
                              
                              return (
                                <g key={i}>
                                  {/* BP: Shaded area between systolic and diastolic */}
                                  {i < arr.length - 1 && (() => {
                                    const nextXPx = (arr[i+1].x / 100) * 1000;
                                    const nextSysYPx = (1 - (arr[i+1].sys / 240)) * 384;
                                    const nextDiaYPx = (1 - (arr[i+1].dia / 240)) * 384;
                                    return (
                                      <polygon
                                        points={`${xPx},${sysYPx} ${nextXPx},${nextSysYPx} ${nextXPx},${nextDiaYPx} ${xPx},${diaYPx}`}
                                        fill="#bfdbfe"
                                        opacity="0.4"
                                      />
                                    );
                                  })()}
                                  
                                  {/* BP: Systolic caret DOWN (v shape) - LARGER */}
                                  <polygon 
                                    points={`${xPx},${sysYPx} ${xPx-8},${sysYPx-12} ${xPx+8},${sysYPx-12}`} 
                                    fill="#3b82f6" 
                                    stroke="#1e40af" 
                                    strokeWidth="1" 
                                  />
                                  
                                  {/* BP: Diastolic caret UP (^ shape) - LARGER */}
                                  <polygon 
                                    points={`${xPx},${diaYPx} ${xPx-8},${diaYPx+12} ${xPx+8},${diaYPx+12}`} 
                                    fill="#3b82f6" 
                                    stroke="#1e40af" 
                                    strokeWidth="1" 
                                  />
                                  
                                  {/* BP: MAP small point */}
                                  <circle cx={xPx} cy={mapYPx} r="4" fill="#3b82f6" stroke="#1e40af" strokeWidth="1" />
                                  
                                  {/* Heart Rate: Red heart icon - SIMPLER & LARGER */}
                                  <polygon
                                    points={`${xPx},${hrYPx-4} ${xPx-6},${hrYPx-10} ${xPx-10},${hrYPx-6} ${xPx},${hrYPx+4} ${xPx+10},${hrYPx-6} ${xPx+6},${hrYPx-10}`}
                                    fill="#dc2626"
                                    stroke="#991b1b"
                                    strokeWidth="1"
                                  />
                                  
                                  {/* SpO2: Small cyan circle at 100 (or near) */}
                                  <circle cx={xPx} cy={spo2YPx} r="5" fill="#06b6d4" stroke="#0891b2" strokeWidth="1" />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        
                        {/* Zeiten (Times) Swimlane */}
                        <div className="h-16 border-b bg-purple-50 dark:bg-purple-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-purple-200 dark:border-purple-800" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex items-center px-2">
                            <div className="absolute bg-red-500 text-white text-[10px] px-2 py-1 rounded font-medium" style={{ left: "8%" }}>A1</div>
                            <div className="absolute bg-orange-500 text-white text-[10px] px-2 py-1 rounded font-medium" style={{ left: "25%" }}>AG</div>
                            <div className="absolute bg-purple-500 text-white text-[10px] px-2 py-1 rounded font-medium" style={{ left: "60%" }}>O2</div>
                          </div>
                        </div>
                        
                        {/* Ereignisse (Events) Swimlane */}
                        <div className="h-16 border-b bg-gray-50 dark:bg-gray-800 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex items-center px-2">
                            <MessageSquare className="absolute h-4 w-4 text-gray-600 dark:text-gray-300" style={{ left: "30%" }} />
                          </div>
                        </div>
                        
                        {/* Herzrhythmus (Heart Rhythm) Swimlane */}
                        <div className="h-16 border-b bg-pink-50 dark:bg-pink-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-pink-200 dark:border-pink-800" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex items-center px-2">
                            <div className="absolute bg-white dark:bg-gray-800 border border-pink-300 dark:border-pink-700 px-3 py-1 rounded text-xs font-medium" style={{ left: "15%" }}>SR</div>
                          </div>
                        </div>
                        
                        {/* Medikamente (Medications) Swimlane */}
                        <div className="min-h-48 border-b bg-green-50 dark:bg-green-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-green-200 dark:border-green-800" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex items-center px-2">
                            {/* Blue bolus bars with dose numbers */}
                            <div className="absolute" style={{ left: "20%", bottom: "20%" }}>
                              <div className="w-2 h-24 bg-blue-600 relative">
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium">100</span>
                              </div>
                            </div>
                            <div className="absolute" style={{ left: "45%", bottom: "20%" }}>
                              <div className="w-2 h-20 bg-blue-600 relative">
                                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-medium">75</span>
                              </div>
                            </div>
                            {/* Gray infusion duration box */}
                            <div className="absolute bg-gray-400/50 h-8 rounded flex items-center px-2" style={{ left: "10%", width: "30%" }}>
                              <span className="text-[10px] font-medium">100 ml/h</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Lagerung (Positioning) Swimlane */}
                        <div className="h-16 border-b bg-emerald-50 dark:bg-emerald-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-emerald-200 dark:border-emerald-800" />
                            ))}
                          </div>
                        </div>
                        
                        {/* Beatmung (Ventilation) Swimlane */}
                        <div className="h-20 border-b bg-pink-50 dark:bg-pink-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-pink-200 dark:border-pink-800" />
                            ))}
                          </div>
                          <div className="absolute inset-0 flex items-center px-2">
                            <div className="absolute left-2 text-[11px] font-medium text-pink-800 dark:text-pink-200">Leon plus | VCV - volumenkontrolliert</div>
                          </div>
                        </div>
                        
                        {/* Beatmungsparameter (Ventilation Parameters) - Expandable */}
                        {expandedSections.beatmungsparameter && (
                          <div className="min-h-32 border-b bg-blue-50 dark:bg-blue-900/20 relative">
                            <div className="absolute inset-0 flex">
                              {getTimeIntervals().map((time, i) => (
                                <div key={i} className="flex-1 border-r last:border-r-0 border-blue-200 dark:border-blue-800 px-1 py-2">
                                  <div className="flex flex-col gap-0.5 text-[9px] font-medium text-center">
                                    <div>32</div>
                                    <div>12</div>
                                    <div>5</div>
                                    <div>480</div>
                                    <div>12</div>
                                    <div>5</div>
                                    <div>0.4</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* Parameter Toggle Row */}
                        <div className="h-10 border-b bg-blue-100 dark:bg-blue-900/40 relative cursor-pointer" onClick={() => setExpandedSections(prev => ({ ...prev, beatmungsparameter: !prev.beatmungsparameter }))}>
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-blue-200 dark:border-blue-800" />
                            ))}
                          </div>
                        </div>
                        
                        {/* Ausfuhren (Outputs) Swimlane */}
                        <div className="h-16 border-b bg-orange-50 dark:bg-orange-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-orange-200 dark:border-orange-800" />
                            ))}
                          </div>
                        </div>
                        
                        {/* NRS (Pain Scores) Swimlane */}
                        <div className="h-16 border-b bg-green-50 dark:bg-green-900/20 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-green-200 dark:border-green-800" />
                            ))}
                          </div>
                        </div>
                        
                        {/* Scores Swimlane */}
                        <div className="h-16 bg-slate-50 dark:bg-slate-800 relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-slate-200 dark:border-slate-700" />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
          </TabsContent>

          {/* Anesthesia Documentation Tab */}
          <TabsContent value="anesthesia" className="flex-1 overflow-y-auto px-6 pt-6 pb-6 space-y-4">
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
          <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pt-6 pb-6 space-y-4">
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
          <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pt-6 pb-6 space-y-6">
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
