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
          <div className="shrink-0 bg-background z-10 relative">
            <TabsList className="grid w-full grid-cols-4 h-auto rounded-none border-b border-border bg-transparent p-0">
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
          <TabsContent value="vitals" className="flex-1 overflow-hidden mt-0 flex flex-col pt-1">
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
                      {/* NIBP Icon & Scale */}
                      <div className="h-48 border-b flex items-center justify-center px-3 relative">
                        <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-between py-3 text-[9px] font-medium text-purple-600 dark:text-purple-400">
                          <span>220</span>
                          <span>100</span>
                          <span>40</span>
                        </div>
                        <Gauge className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        <div className="absolute right-2 text-[10px] font-semibold text-muted-foreground">NIBP</div>
                      </div>
                      
                      {/* Heart Icon & Scale */}
                      <div className="h-40 border-b flex items-center justify-center px-3 relative">
                        <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-between py-3 text-[9px] font-medium text-red-600 dark:text-red-400">
                          <span>200</span>
                          <span>80</span>
                          <span>30</span>
                        </div>
                        <Heart className="h-6 w-6 text-red-600 dark:text-red-400" />
                        <div className="absolute right-2 text-[10px] font-semibold text-muted-foreground">HR</div>
                      </div>
                      
                      {/* Target Icon & Scale */}
                      <div className="h-32 border-b flex items-center justify-center px-3 relative">
                        <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-between py-3 text-[9px] font-medium text-purple-600 dark:text-purple-400">
                          <span>100</span>
                          <span>80</span>
                          <span>30</span>
                        </div>
                        <Activity className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                        <div className="absolute right-2 text-[10px] font-semibold text-muted-foreground">MAP</div>
                      </div>
                      
                      {/* Thermometer Icon & Scale */}
                      <div className="h-32 border-b flex items-center justify-center px-3 relative">
                        <div className="absolute left-2 top-0 bottom-0 flex flex-col justify-between py-3 text-[9px] font-medium text-orange-600 dark:text-orange-400">
                          <span>40</span>
                          <span>38</span>
                          <span>35</span>
                        </div>
                        <Thermometer className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                        <div className="absolute right-2 text-[10px] font-semibold text-muted-foreground">°C</div>
                      </div>
                      
                      {/* IV/Person Icon */}
                      <div className="h-20 border-b flex items-center justify-center px-3 relative">
                        <Droplet className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        <div className="absolute right-2 text-[10px] font-semibold text-muted-foreground">SpO2</div>
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
                        {/* NIBP Row with BP Visualization */}
                        <div className="h-48 border-b relative">
                          {/* Grid lines */}
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
                          {/* BP Visualization with dual arrows and shaded band */}
                          <svg className="absolute inset-0 w-full h-full">
                            {/* Sample BP data points */}
                            {[
                              { x: 10, sys: 120, dia: 70, map: 85 },
                              { x: 20, sys: 125, dia: 75, map: 90 },
                              { x: 30, sys: 115, dia: 70, map: 85 },
                              { x: 40, sys: 130, dia: 80, map: 95 },
                              { x: 50, sys: 120, dia: 75, map: 90 }
                            ].map((bp, i, arr) => {
                              const xPos = `${bp.x}%`;
                              const sysY = `${100 - ((bp.sys - 40) / 180) * 100}%`;
                              const diaY = `${100 - ((bp.dia - 40) / 180) * 100}%`;
                              const mapY = `${100 - ((bp.map - 40) / 180) * 100}%`;
                              
                              return (
                                <g key={i}>
                                  {/* Shaded band between systolic and diastolic */}
                                  {i < arr.length - 1 && (
                                    <polygon
                                      points={`${xPos} ${sysY}, ${bp.x + 10}% ${100 - ((arr[i+1].sys - 40) / 180) * 100}%, ${bp.x + 10}% ${100 - ((arr[i+1].dia - 40) / 180) * 100}%, ${xPos} ${diaY}`}
                                      fill="#93c5fd"
                                      opacity="0.3"
                                    />
                                  )}
                                  {/* Systolic arrow up */}
                                  <path d={`M ${xPos} ${sysY} l -3 -8 l 3 2 l 3 -2 z`} fill="#9333ea" />
                                  {/* Diastolic arrow down */}
                                  <path d={`M ${xPos} ${diaY} l -3 8 l 3 -2 l 3 2 z`} fill="#9333ea" />
                                  {/* Systolic trend line */}
                                  {i < arr.length - 1 && (
                                    <line
                                      x1={xPos}
                                      y1={sysY}
                                      x2={`${arr[i+1].x}%`}
                                      y2={`${100 - ((arr[i+1].sys - 40) / 180) * 100}%`}
                                      stroke="#9333ea"
                                      strokeWidth="2"
                                    />
                                  )}
                                  {/* Systolic circle marker */}
                                  <circle cx={xPos} cy={sysY} r="4" fill="#9333ea" />
                                  {/* MAP small arrow at bottom */}
                                  <path d={`M ${xPos} ${mapY} l -2 4 l 2 -1 l 2 1 z`} fill="#9333ea" opacity="0.6" />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        
                        {/* HR Row */}
                        <div className="h-40 border-b relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
                          <svg className="absolute inset-0 w-full h-full">
                            {/* Sample HR data - red line with circles */}
                            {[
                              { x: 10, hr: 72 },
                              { x: 20, hr: 68 },
                              { x: 30, hr: 75 },
                              { x: 40, hr: 70 },
                              { x: 50, hr: 73 }
                            ].map((point, i, arr) => {
                              const xPos = `${point.x}%`;
                              const yPos = `${100 - ((point.hr - 30) / 170) * 100}%`;
                              
                              return (
                                <g key={i}>
                                  {i < arr.length - 1 && (
                                    <line
                                      x1={xPos}
                                      y1={yPos}
                                      x2={`${arr[i+1].x}%`}
                                      y2={`${100 - ((arr[i+1].hr - 30) / 170) * 100}%`}
                                      stroke="#dc2626"
                                      strokeWidth="2"
                                    />
                                  )}
                                  <circle cx={xPos} cy={yPos} r="4" fill="#dc2626" />
                                </g>
                              );
                            })}
                          </svg>
                        </div>
                        
                        {/* MAP Row */}
                        <div className="h-32 border-b relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
                        </div>
                        
                        {/* Temperature Row */}
                        <div className="h-32 border-b relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
                        </div>
                        
                        {/* SpO2 Row */}
                        <div className="h-20 border-b relative">
                          <div className="absolute inset-0 flex">
                            {getTimeIntervals().map((_, i) => (
                              <div key={i} className="flex-1 border-r last:border-r-0 border-gray-200 dark:border-gray-700" />
                            ))}
                          </div>
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
          <TabsContent value="anesthesia" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-3">
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
          <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-3 space-y-4">
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
          <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 pt-3">
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
