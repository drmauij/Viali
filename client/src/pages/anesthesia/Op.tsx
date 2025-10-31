import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { UnifiedTimeline, type UnifiedTimelineData, type TimelineVitals, type TimelineEvent, type VitalPoint } from "@/components/anesthesia/UnifiedTimeline";
import { PreOpOverview } from "@/components/anesthesia/PreOpOverview";
import PreopTab from "@/components/anesthesia/PreopTab";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Minus, Folder, Package, Loader2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { formatDate } from "@/lib/dateUtils";
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
  Droplet,
  Download
} from "lucide-react";

export default function Op() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

  // Get surgeryId from params
  const surgeryId = params.id;

  // Fetch surgery details
  const { data: surgery, isLoading: isSurgeryLoading, error: surgeryError } = useQuery({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch anesthesia record
  const { data: anesthesiaRecord, isLoading: isRecordLoading } = useQuery({
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch pre-op assessment
  const { data: preOpAssessment, isLoading: isPreOpLoading } = useQuery({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch vitals snapshots (requires recordId)
  const { data: vitalsData = [], isLoading: isVitalsLoading } = useQuery({
    queryKey: [`/api/anesthesia/vitals/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  // Fetch medications (requires recordId)
  const { data: medicationsData = [], isLoading: isMedicationsLoading } = useQuery({
    queryKey: [`/api/anesthesia/medications/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  // Fetch events (requires recordId)
  const { data: eventsData = [], isLoading: isEventsLoading } = useQuery({
    queryKey: [`/api/anesthesia/events/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  // If surgery not found or error, redirect back
  useEffect(() => {
    if (surgeryError || (!isSurgeryLoading && !surgery)) {
      setIsOpen(false);
      setTimeout(() => setLocation("/anesthesia/patients"), 100);
    }
  }, [surgery, surgeryError, isSurgeryLoading, setLocation]);

  // Dialog state for editing allergies and CAVE
  const [isAllergiesDialogOpen, setIsAllergiesDialogOpen] = useState(false);
  const [allergies, setAllergies] = useState("");
  const [cave, setCave] = useState("");
  
  // Temporary state for dialog editing
  const [tempAllergies, setTempAllergies] = useState("");
  const [tempCave, setTempCave] = useState("");

  // Update allergies and cave when preOp data is loaded
  useEffect(() => {
    if (preOpAssessment) {
      setAllergies(preOpAssessment.allergies?.join(", ") || "");
      setCave(preOpAssessment.cave || "");
    }
  }, [preOpAssessment]);
  
  const handleOpenAllergiesDialog = () => {
    setTempAllergies(allergies);
    setTempCave(cave);
    setIsAllergiesDialogOpen(true);
  };
  
  const handleSaveAllergies = () => {
    setAllergies(tempAllergies);
    setCave(tempCave);
    setIsAllergiesDialogOpen(false);
  };

  // Transform vitals data for timeline
  const timelineData = useMemo((): UnifiedTimelineData => {
    if (!vitalsData || vitalsData.length === 0) {
      const now = new Date().getTime();
      const sixHoursAgo = now - 6 * 60 * 60 * 1000;
      const sixHoursFuture = now + 6 * 60 * 60 * 1000;

      return {
        startTime: sixHoursAgo,
        endTime: sixHoursFuture,
        vitals: {
          sysBP: [],
          diaBP: [],
          hr: [],
          spo2: [],
        },
        events: [],
      };
    }

    // Convert vitals snapshots to timeline format
    const vitals: TimelineVitals = {
      sysBP: [],
      diaBP: [],
      hr: [],
      spo2: [],
    };

    vitalsData.forEach((snapshot: any) => {
      const timestamp = new Date(snapshot.timestamp).getTime();
      const data = snapshot.data || {};

      if (data.sysBP !== undefined) {
        vitals.sysBP.push({ time: timestamp, value: data.sysBP });
      }
      if (data.diaBP !== undefined) {
        vitals.diaBP.push({ time: timestamp, value: data.diaBP });
      }
      if (data.hr !== undefined) {
        vitals.hr.push({ time: timestamp, value: data.hr });
      }
      if (data.spo2 !== undefined) {
        vitals.spo2.push({ time: timestamp, value: data.spo2 });
      }
    });

    // Convert events to timeline format
    const events: TimelineEvent[] = (eventsData || []).map((event: any) => ({
      time: new Date(event.timestamp).getTime(),
      type: event.eventType || 'event',
      description: event.description || '',
    }));

    // Calculate time range
    const timestamps = vitalsData.map((s: any) => new Date(s.timestamp).getTime());
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : new Date().getTime() - 6 * 60 * 60 * 1000;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : new Date().getTime() + 6 * 60 * 60 * 1000;

    return {
      startTime: minTime - 60 * 60 * 1000, // 1 hour before first data point
      endTime: maxTime + 60 * 60 * 1000, // 1 hour after last data point
      vitals,
      events,
    };
  }, [vitalsData, eventsData]);

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
    postOpDestination: "",
    postOpNotes: "",
    complications: "",
  });

  // Inventory tracking state - { itemId: quantity }
  const [inventoryQuantities, setInventoryQuantities] = useState<Record<string, number>>({});

  // Fetch items for inventory tracking - filtered by anesthesia units
  const { data: items = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.anesthesiaUnitId}`, activeHospital?.anesthesiaUnitId],
    enabled: !!activeHospital?.id && !!activeHospital?.anesthesiaUnitId,
  });

  // Fetch folders - filtered by anesthesia units
  const { data: folders = [] } = useQuery<any[]>({
    queryKey: [`/api/folders/${activeHospital?.id}?unitId=${activeHospital?.anesthesiaUnitId}`, activeHospital?.anesthesiaUnitId],
    enabled: !!activeHospital?.id && !!activeHospital?.anesthesiaUnitId,
  });

  // Group items by folder and sort alphabetically
  const groupedItems = useMemo(() => {
    const groups: Record<string, any[]> = {};
    
    // Group items by folder
    items.forEach((item: any) => {
      const folderId = item.folderId || 'no-folder';
      if (!groups[folderId]) {
        groups[folderId] = [];
      }
      groups[folderId].push(item);
    });
    
    // Sort items within each folder alphabetically
    Object.keys(groups).forEach(folderId => {
      groups[folderId].sort((a, b) => a.name.localeCompare(b.name));
    });
    
    return groups;
  }, [items]);

  // Get folder name by id
  const getFolderName = (folderId: string) => {
    if (folderId === 'no-folder') return 'Uncategorized';
    const folder = folders.find((f: any) => f.id === folderId);
    return folder?.name || 'Unknown Folder';
  };

  // Auto-compute used quantities from anesthesia timeline data
  useEffect(() => {
    if (!medicationsData) return;

    const computedQuantities: Record<string, number> = {};
    
    // Parse medications from backend
    medicationsData.forEach((med: any) => {
      if (med.itemId && med.dose) {
        const quantity = parseFloat(med.dose) || 0;
        computedQuantities[med.itemId] = (computedQuantities[med.itemId] || 0) + quantity;
      }
    });
    
    setInventoryQuantities(computedQuantities);
  }, [medicationsData]);

  // Handle quantity change for inventory items
  const handleQuantityChange = (itemId: string, delta: number) => {
    setInventoryQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(0, (prev[itemId] || 0) + delta),
    }));
  };

  // Handle dialog close and navigation
  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        setLocation("/anesthesia/patients");
      }, 100);
    }
  };

  // Close dialog handler
  const handleClose = () => {
    handleDialogChange(false);
  };

  // Get patient weight from preOp assessment
  const patientWeight = preOpAssessment?.weight ? parseFloat(preOpAssessment.weight) : undefined;

  // Show loading state while initial data is loading
  if (isSurgeryLoading || isPreOpLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col items-center justify-center [&>button]:hidden">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Loading surgery data...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // If no surgery data, return null (redirect will happen via useEffect)
  if (!surgery) {
    return null;
  }

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden" aria-describedby="op-dialog-description">
        <h2 className="sr-only" id="op-dialog-title">Intraoperative Monitoring - Patient {surgery.patientId}</h2>
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
                <UserCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <h2 className="font-bold text-base md:text-lg">Patient {surgery.patientId}</h2>
                  <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                    <p className="text-xs md:text-sm text-muted-foreground">
                      Surgery ID: {surgery.id}
                    </p>
                    {preOpAssessment && (
                      <div className="flex items-center gap-3 font-semibold text-sm">
                        {preOpAssessment.height && (
                          <>
                            <span className="text-foreground">{preOpAssessment.height} cm</span>
                            <span className="text-muted-foreground">•</span>
                          </>
                        )}
                        {preOpAssessment.weight && (
                          <span className="text-foreground">{preOpAssessment.weight} kg</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Surgery Info */}
              <div className="px-3 py-2 bg-primary/10 border border-primary/30 rounded-lg">
                <p className="text-xs font-medium text-primary/70">PROCEDURE</p>
                <p className="font-semibold text-sm text-primary">{surgery.plannedSurgery}</p>
                {surgery.surgeon && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {surgery.surgeon} • {formatDate(surgery.plannedDate)}
                  </p>
                )}
              </div>

              {/* Allergies & CAVE - Clickable Display */}
              <div 
                onClick={handleOpenAllergiesDialog}
                className="flex items-start gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
                data-testid="allergies-cave-warning"
              >
                <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div className="flex gap-4 flex-wrap flex-1">
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">ALLERGIES</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : (allergies || "None")}
                    </p>
                  </div>
                  <div className="flex-1 min-w-[120px]">
                    <p className="text-xs font-medium text-amber-700 dark:text-amber-300">CAVE</p>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : (cave || "None")}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="vitals" className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 mb-4">
              <div className="flex-1 overflow-x-auto">
                <TabsList className="inline-flex w-auto min-w-full">
                  <TabsTrigger value="vitals" data-testid="tab-vitals" className="text-xs sm:text-sm whitespace-nowrap">
                    Vitals
                  </TabsTrigger>
                  <TabsTrigger value="anesthesia" data-testid="tab-anesthesia" className="text-xs sm:text-sm whitespace-nowrap">
                    Anesthesia
                  </TabsTrigger>
                  <TabsTrigger value="preop" data-testid="tab-preop" className="text-xs sm:text-sm whitespace-nowrap">
                    Pre-Op
                  </TabsTrigger>
                  <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm whitespace-nowrap">
                    Inventory
                  </TabsTrigger>
                  <TabsTrigger value="checklists" data-testid="tab-checklists" className="text-xs sm:text-sm whitespace-nowrap">
                    Checklists
                  </TabsTrigger>
                  <TabsTrigger value="postop" data-testid="tab-postop" className="text-xs sm:text-sm whitespace-nowrap">
                    Post-op
                  </TabsTrigger>
                </TabsList>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="flex items-center gap-1 sm:gap-2 shrink-0"
                data-testid="button-download-pdf"
                onClick={() => console.log("Downloading OP PDF for surgery:", surgeryId)}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">PDF</span>
              </Button>
            </div>
          </div>

          {/* Vitals & Timeline Tab */}
          <TabsContent value="vitals" className="data-[state=active]:flex-1 overflow-y-auto flex flex-col mt-0 px-0" data-testid="tab-content-vitals">
            <div className="border-t bg-card">
              {isVitalsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <UnifiedTimeline 
                  data={timelineData} 
                  now={new Date().getTime()} 
                  patientWeight={patientWeight}
                />
              )}
            </div>
          </TabsContent>

          {/* Anesthesia Documentation Tab */}
          <TabsContent value="anesthesia" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0">
            {isRecordLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
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
                                  <option value="direct">Direct (Seldinger)</option>
                                  <option value="transfixion">Transfixion</option>
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

                        {/* Central Line */}
                        <div className="space-y-3">
                          <Label className="text-base font-semibold">Central Venous Catheter</Label>
                          <div className="border rounded-lg p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Location</Label>
                                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-location">
                                  <option value="">Select location</option>
                                  <option value="right-ijv">Right Internal Jugular</option>
                                  <option value="left-ijv">Left Internal Jugular</option>
                                  <option value="right-subclavian">Right Subclavian</option>
                                  <option value="left-subclavian">Left Subclavian</option>
                                  <option value="femoral">Femoral</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <Label>Lumens</Label>
                                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-lumens">
                                  <option value="">Select lumens</option>
                                  <option value="1">Single</option>
                                  <option value="2">Double</option>
                                  <option value="3">Triple</option>
                                  <option value="4">Quad</option>
                                </select>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Depth (cm)</Label>
                                <Input type="number" placeholder="16" data-testid="input-cvc-depth" />
                              </div>
                              <div className="space-y-2">
                                <Label>Technique</Label>
                                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-cvc-technique">
                                  <option value="">Select technique</option>
                                  <option value="landmark">Landmark</option>
                                  <option value="ultrasound">Ultrasound-guided</option>
                                </select>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Notes</Label>
                              <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-cvc-notes" />
                            </div>
                          </div>
                        </div>

                        {/* Airway */}
                        <div className="space-y-3">
                          <Label className="text-base font-semibold">Airway Management</Label>
                          <div className="border rounded-lg p-4 space-y-3">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Device</Label>
                                <select className="w-full border rounded-md p-2 bg-background" data-testid="select-airway-device">
                                  <option value="">Select device</option>
                                  <option value="ett">Endotracheal Tube</option>
                                  <option value="lma">Laryngeal Mask Airway</option>
                                  <option value="facemask">Face Mask</option>
                                  <option value="tracheostomy">Tracheostomy</option>
                                </select>
                              </div>
                              <div className="space-y-2">
                                <Label>Size</Label>
                                <Input type="text" placeholder="e.g., 7.5" data-testid="input-airway-size" />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Depth (cm at teeth)</Label>
                                <Input type="number" placeholder="22" data-testid="input-airway-depth" />
                              </div>
                              <div className="space-y-2">
                                <Label>Cuff Pressure (cmH₂O)</Label>
                                <Input type="number" placeholder="20" data-testid="input-airway-cuff" />
                              </div>
                            </div>
                            <div className="space-y-2">
                              <Label>Notes</Label>
                              <Textarea rows={2} placeholder="Additional notes..." data-testid="textarea-airway-notes" />
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Anesthesia Type */}
                <AccordionItem value="anesthesia-type">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-anesthesia-type">
                      <CardTitle className="text-lg">Anesthesia Type</CardTitle>
                    </AccordionTrigger>
                    <AccordionContent>
                      <CardContent className="space-y-4 pt-0">
                        <div className="space-y-2">
                          <Label>Primary Anesthesia Type</Label>
                          <Select value={anesthesiaRecord?.anesthesiaType || ""}>
                            <SelectTrigger data-testid="select-anesthesia-type">
                              <SelectValue placeholder="Select anesthesia type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="general">General Anesthesia</SelectItem>
                              <SelectItem value="spinal">Spinal Anesthesia</SelectItem>
                              <SelectItem value="epidural">Epidural Anesthesia</SelectItem>
                              <SelectItem value="regional">Regional Anesthesia</SelectItem>
                              <SelectItem value="sedation">Sedation</SelectItem>
                              <SelectItem value="combined">Combined Technique</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>
            )}
          </TabsContent>

          {/* Pre-Op Tab */}
          <TabsContent value="preop" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-preop">
            {isPreOpLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !preOpAssessment ? (
              <div className="flex flex-col items-center justify-center h-64 gap-4">
                <p className="text-muted-foreground">No pre-operative assessment created yet</p>
                <Button
                  onClick={async () => {
                    try {
                      // Create a new assessment with status "draft"
                      await apiRequest("POST", "/api/anesthesia/preop", {
                        surgeryId: surgeryId,
                        status: "draft",
                        allergies: [],
                        height: "",
                        weight: "",
                      });
                      // Invalidate specific assessment query
                      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`] });
                      // Invalidate list query with correct key shape (matches PreOpList.tsx)
                      if (surgery) {
                        queryClient.invalidateQueries({ 
                          queryKey: ["/api/anesthesia/preop", { hospitalId: surgery.hospitalId }] 
                        });
                      }
                      toast({ title: "Pre-op assessment created", description: "You can now add patient information" });
                    } catch (error) {
                      toast({ title: "Error", description: "Failed to create assessment", variant: "destructive" });
                    }
                  }}
                  data-testid="button-create-preop"
                >
                  Create Pre-Op Assessment
                </Button>
              </div>
            ) : (
              <PreopTab surgeryId={surgeryId!} hospitalId={surgery?.hospitalId || ""} />
            )}
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-inventory">
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Medication & Supply Usage</h3>
                <Badge variant="outline" className="text-xs">
                  Auto-tracked from timeline
                </Badge>
              </div>

              {Object.keys(groupedItems).length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">No inventory items available</p>
                  </CardContent>
                </Card>
              ) : (
                <Accordion type="multiple" className="space-y-2 w-full">
                  {Object.keys(groupedItems).map((folderId) => (
                    <AccordionItem key={folderId} value={folderId}>
                      <Card>
                        <AccordionTrigger className="px-4 py-3 hover:no-underline" data-testid={`accordion-folder-${folderId}`}>
                          <div className="flex items-center gap-2">
                            <Folder className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{getFolderName(folderId)}</span>
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {groupedItems[folderId].length}
                            </Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                          <CardContent className="pt-0 space-y-2">
                            {groupedItems[folderId].map((item: any) => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                                data-testid={`inventory-item-${item.id}`}
                              >
                                <div className="flex-1">
                                  <p className="font-medium text-sm">{item.name}</p>
                                  <p className="text-xs text-muted-foreground">{item.unit}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleQuantityChange(item.id, -1)}
                                    data-testid={`button-decrease-${item.id}`}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-12 text-center font-semibold" data-testid={`quantity-${item.id}`}>
                                    {inventoryQuantities[item.id] || 0}
                                  </span>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleQuantityChange(item.id, 1)}
                                    data-testid={`button-increase-${item.id}`}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </CardContent>
                        </AccordionContent>
                      </Card>
                    </AccordionItem>
                  ))}
                </Accordion>
              )}
            </div>
          </TabsContent>

          {/* Checklists Tab */}
          <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-checklists">
            <div className="space-y-4">
              {/* Sign In */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Sign In (Before Induction)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaRecord?.signInChecklist && Object.keys(anesthesiaRecord.signInChecklist).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`signin-${key}`}
                        checked={anesthesiaRecord.signInChecklist[key] || false}
                        data-testid={`checkbox-signin-${key}`}
                      />
                      <label
                        htmlFor={`signin-${key}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Time Out */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Time Out (Before Incision)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaRecord?.timeOutChecklist && Object.keys(anesthesiaRecord.timeOutChecklist).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`timeout-${key}`}
                        checked={anesthesiaRecord.timeOutChecklist[key] || false}
                        data-testid={`checkbox-timeout-${key}`}
                      />
                      <label
                        htmlFor={`timeout-${key}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Sign Out */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Sign Out (Before Patient Leaves OR)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaRecord?.signOutChecklist && Object.keys(anesthesiaRecord.signOutChecklist).map((key) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        id={`signout-${key}`}
                        checked={anesthesiaRecord.signOutChecklist[key] || false}
                        data-testid={`checkbox-signout-${key}`}
                      />
                      <label
                        htmlFor={`signout-${key}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                      </label>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Post-op Tab */}
          <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-postop">
            <Card>
              <CardHeader>
                <CardTitle>Post-Operative Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Destination</Label>
                  <Select value={opData.postOpDestination}>
                    <SelectTrigger data-testid="select-postop-destination">
                      <SelectValue placeholder="Select destination" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pacu">PACU</SelectItem>
                      <SelectItem value="icu">ICU</SelectItem>
                      <SelectItem value="ward">Ward</SelectItem>
                      <SelectItem value="home">Home</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Post-Operative Notes</Label>
                  <Textarea
                    rows={4}
                    placeholder="Enter post-operative notes..."
                    value={opData.postOpNotes}
                    data-testid="textarea-postop-notes"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Complications</Label>
                  <Textarea
                    rows={3}
                    placeholder="Document any complications..."
                    value={opData.complications}
                    data-testid="textarea-postop-complications"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Allergies & CAVE Edit Dialog */}
    <Dialog open={isAllergiesDialogOpen} onOpenChange={setIsAllergiesDialogOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Edit Allergies & CAVE</h3>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allergies">Allergies</Label>
            <Textarea
              id="allergies"
              rows={3}
              placeholder="Enter allergies (comma separated)"
              value={tempAllergies}
              onChange={(e) => setTempAllergies(e.target.value)}
              data-testid="textarea-edit-allergies"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cave">CAVE (Contraindications)</Label>
            <Textarea
              id="cave"
              rows={3}
              placeholder="Enter contraindications and precautions"
              value={tempCave}
              onChange={(e) => setTempCave(e.target.value)}
              data-testid="textarea-edit-cave"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAllergiesDialogOpen(false)}
              data-testid="button-cancel-allergies"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAllergies}
              data-testid="button-save-allergies"
            >
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
