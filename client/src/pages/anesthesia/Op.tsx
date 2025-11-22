import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { UnifiedTimeline, type UnifiedTimelineData, type TimelineVitals, type TimelineEvent, type VitalPoint } from "@/components/anesthesia/UnifiedTimeline";
import { PreOpOverview } from "@/components/anesthesia/PreOpOverview";
import { 
  InstallationsSection,
  GeneralAnesthesiaSection,
  NeuraxialAnesthesiaSection,
  PeripheralBlocksSection
} from "@/components/anesthesia/AnesthesiaDocumentation";
import { InventoryUsageTab } from "@/components/anesthesia/InventoryUsageTab";
import {
  useInstallations,
  useGeneralTechnique,
  useAirwayManagement,
  useNeuraxialBlocks,
  usePeripheralBlocks,
} from "@/lib/anesthesiaDocumentation";
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
import SignaturePad from "@/components/SignaturePad";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
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
  Download,
  CheckCircle,
  MinusCircle,
  MessageSquareText,
  BedDouble
} from "lucide-react";

export default function Op() {
  const params = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [openEventsPanel, setOpenEventsPanel] = useState(false);
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const hasAttemptedCreate = useRef(false);

  // Determine mode based on route (PACU mode if URL contains /pacu)
  const isPacuMode = location.includes('/pacu');

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

  // Auto-create anesthesia record if it doesn't exist (404 only)
  useEffect(() => {
    const checkAndCreateRecord = async () => {
      // Only proceed if surgery exists, record not loading, haven't attempted, and have surgeryId
      if (!surgery || isRecordLoading || hasAttemptedCreate.current || !surgeryId || anesthesiaRecord) {
        return;
      }

      // Set flag immediately to prevent duplicate attempts in StrictMode
      hasAttemptedCreate.current = true;

      // Do our own fetch to check the exact status code
      try {
        const response = await fetch(`/api/anesthesia/records/surgery/${surgeryId}`, {
          credentials: "include",
        });

        // If 404, create the record
        if (response.status === 404) {
          await apiRequest("POST", "/api/anesthesia/records", {
            surgeryId: surgeryId,
          });
          
          // Invalidate to refetch the newly created record
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
        } else if (!response.ok) {
          // Other errors (401, 403, 500, etc.) - reset flag and log
          hasAttemptedCreate.current = false;
          console.error(`Failed to fetch anesthesia record: ${response.status}`);
        }
        // If 200, the record exists - keep flag to prevent re-checking
      } catch (error: any) {
        // Network error or creation failed - reset flag to allow retry
        hasAttemptedCreate.current = false;
        console.error("Error checking/creating anesthesia record:", error);
        toast({
          title: "Error",
          description: error.message || "Failed to create anesthesia record. Please refresh the page.",
          variant: "destructive",
        });
      }
    };

    checkAndCreateRecord();
  }, [surgery, anesthesiaRecord, surgeryId, isRecordLoading, toast]);

  // Fetch pre-op assessment
  const { data: preOpAssessment, isLoading: isPreOpLoading } = useQuery({
    queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch patient data
  const { data: patient, isLoading: isPatientLoading, error: patientError } = useQuery({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId,
  });

  // Show error toast if patient fetch fails
  useEffect(() => {
    if (patientError) {
      toast({
        title: "Error loading patient data",
        description: "Unable to fetch patient information",
        variant: "destructive",
      });
    }
  }, [patientError, toast]);

  // Fetch anesthesia settings for WHO checklists
  const { data: anesthesiaSettings } = useQuery({
    queryKey: [`/api/anesthesia/settings/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Checklist mutations
  // Auto-save mutations for WHO Checklists
  const signInAutoSave = useAutoSaveMutation({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/signin`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  const timeOutAutoSave = useAutoSaveMutation({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/timeout`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  const signOutAutoSave = useAutoSaveMutation({
    mutationFn: async (data: { checklist: Record<string, boolean>; notes: string; signature: string }) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/signout`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
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

  // Debug: Log medications data
  useEffect(() => {
    console.log('[OP-MEDS] Medications data changed:', {
      recordId: anesthesiaRecord?.id,
      count: medicationsData?.length,
      data: medicationsData,
    });
  }, [medicationsData, anesthesiaRecord?.id]);

  // Fetch events (requires recordId)
  const { data: eventsData = [], isLoading: isEventsLoading } = useQuery({
    queryKey: [`/api/anesthesia/events/${anesthesiaRecord?.id}`],
    enabled: !!anesthesiaRecord?.id,
  });

  // Fetch hospital users for provider dropdown
  const { data: hospitalUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/users`],
    enabled: !!activeHospital?.id,
  });

  // Fetch anesthesia documentation data for status badges
  const { data: installationsData = [] } = useInstallations(anesthesiaRecord?.id || "");
  const { data: generalTechniqueData } = useGeneralTechnique(anesthesiaRecord?.id || "");
  const { data: airwayManagementData } = useAirwayManagement(anesthesiaRecord?.id || "");
  const { data: neuraxialBlocksData = [] } = useNeuraxialBlocks(anesthesiaRecord?.id || "");
  const { data: peripheralBlocksData = [] } = usePeripheralBlocks(anesthesiaRecord?.id || "");

  // If surgery not found or error, redirect back
  useEffect(() => {
    if (surgeryError || (!isSurgeryLoading && !surgery)) {
      setIsOpen(false);
      setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          setLocation('/anesthesia/op');
        }
      }, 100);
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

  // Sync Post-Op data from anesthesia record
  useEffect(() => {
    if (anesthesiaRecord?.postOpData) {
      setPostOpData(anesthesiaRecord.postOpData);
    }
  }, [anesthesiaRecord?.postOpData]);
  
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

  // Extract A2 timestamp (Anesthesia Presence End) for PACU mode filtering
  const a2Timestamp = useMemo(() => {
    if (!isPacuMode || !anesthesiaRecord?.timeMarkers) return null;
    const markers = anesthesiaRecord.timeMarkers as any[];
    const a2Marker = markers.find((m: any) => m.code === 'A2');
    // Ensure we return a number
    return a2Marker?.time ? Number(a2Marker.time) : null;
  }, [isPacuMode, anesthesiaRecord?.timeMarkers]);

  // Filter vitals snapshots for PACU mode (only show vitals after A2 timestamp)
  const filteredVitalsData = useMemo(() => {
    if (!isPacuMode || !a2Timestamp || !vitalsData) return vitalsData;
    
    // Filter vitals snapshots array to only include those recorded after A2 timestamp
    return vitalsData.filter((snapshot: any) => {
      const snapshotTime = new Date(snapshot.timestamp).getTime();
      return snapshotTime > a2Timestamp;
    });
  }, [isPacuMode, a2Timestamp, vitalsData]);

  // Filter medications data for PACU mode (only show medications after A2 timestamp)
  const filteredMedicationsData = useMemo(() => {
    if (!isPacuMode || !a2Timestamp || !medicationsData) return medicationsData;
    
    return medicationsData.filter((med: any) => {
      const medTime = new Date(med.timestamp).getTime();
      return medTime > a2Timestamp;
    });
  }, [isPacuMode, a2Timestamp, medicationsData]);

  // Transform vitals data for timeline
  const timelineData = useMemo((): UnifiedTimelineData => {
    // Use filtered data in PACU mode, regular data in OP mode
    const dataToUse = isPacuMode ? filteredVitalsData : vitalsData;
    const medsToUse = isPacuMode ? filteredMedicationsData : medicationsData;
    
    if (!dataToUse || dataToUse.length === 0) {
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
        medications: medsToUse || [],
        apiEvents: eventsData || [],
      };
    }

    // Convert vitals snapshots to timeline format
    const vitals: TimelineVitals = {
      sysBP: [],
      diaBP: [],
      hr: [],
      spo2: [],
    };

    dataToUse.forEach((snapshot: any) => {
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
    const timestamps = dataToUse.map((s: any) => new Date(s.timestamp).getTime());
    const minTime = timestamps.length > 0 ? Math.min(...timestamps) : new Date().getTime() - 6 * 60 * 60 * 1000;
    const maxTime = timestamps.length > 0 ? Math.max(...timestamps) : new Date().getTime() + 6 * 60 * 60 * 1000;

    // Always extend timeline to at least 6 hours into the future from now
    const now = new Date().getTime();
    const futureExtension = now + 6 * 60 * 60 * 1000;
    const calculatedEndTime = maxTime + 60 * 60 * 1000; // 1 hour after last data point
    
    return {
      startTime: minTime - 60 * 60 * 1000, // 1 hour before first data point
      endTime: Math.max(calculatedEndTime, futureExtension), // At least 6 hours into the future
      vitals,
      events,
      medications: medsToUse || [],
      apiEvents: eventsData || [],
    };
  }, [vitalsData, eventsData, medicationsData, isPacuMode, filteredVitalsData, filteredMedicationsData]);

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

  // WHO Checklist state - controlled with persistence
  const [signInChecklist, setSignInChecklist] = useState<Record<string, boolean>>({});
  const [signInNotes, setSignInNotes] = useState("");
  const [signInSignature, setSignInSignature] = useState("");
  const [timeOutChecklist, setTimeOutChecklist] = useState<Record<string, boolean>>({});
  const [timeOutNotes, setTimeOutNotes] = useState("");
  const [timeOutSignature, setTimeOutSignature] = useState("");
  const [signOutChecklist, setSignOutChecklist] = useState<Record<string, boolean>>({});
  const [signOutNotes, setSignOutNotes] = useState("");
  const [signOutSignature, setSignOutSignature] = useState("");

  // Modal state for signature pads
  const [showSignInSigPad, setShowSignInSigPad] = useState(false);
  const [showTimeOutSigPad, setShowTimeOutSigPad] = useState(false);
  const [showSignOutSigPad, setShowSignOutSigPad] = useState(false);

  // Post-Operative Information state
  type MedicationTime = "Immediately" | "Contraindicated" | string;
  const [postOpData, setPostOpData] = useState<{
    postOpDestination?: string;
    postOpNotes?: string;
    complications?: string;
    paracetamolTime?: MedicationTime;
    nsarTime?: MedicationTime;
    novalginTime?: MedicationTime;
  }>({});

  // Auto-save mutation for Post-Op data
  const postOpAutoSave = useAutoSaveMutation({
    mutationFn: async (data: typeof postOpData) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/postop`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  // Fetch items for inventory tracking - filtered by current unit
  const { data: items = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId && !!activeHospital?.isAnesthesiaModule,
  });

  // Fetch folders - filtered by current unit
  const { data: folders = [] } = useQuery<any[]>({
    queryKey: [`/api/folders/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId && !!activeHospital?.isAnesthesiaModule,
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

  // Calculate folders containing used items to auto-expand them
  const foldersWithUsedItems = useMemo(() => {
    const folderIds: string[] = [];
    
    Object.keys(groupedItems).forEach(folderId => {
      const hasUsedItems = groupedItems[folderId].some((item: any) => 
        (inventoryQuantities[item.id] || 0) > 0
      );
      if (hasUsedItems) {
        folderIds.push(folderId);
      }
    });
    
    return folderIds;
  }, [groupedItems, inventoryQuantities]);

  // Initialize quantities from medication data only once
  useEffect(() => {
    if (!medicationsData || Object.keys(inventoryQuantities).length > 0) return;

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

  // Initialize WHO checklist state from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    if (anesthesiaRecord.signInData) {
      if (anesthesiaRecord.signInData.checklist) {
        setSignInChecklist(anesthesiaRecord.signInData.checklist);
      }
      if (anesthesiaRecord.signInData.notes) {
        setSignInNotes(anesthesiaRecord.signInData.notes);
      }
      if (anesthesiaRecord.signInData.signature) {
        setSignInSignature(anesthesiaRecord.signInData.signature);
      }
    }
    if (anesthesiaRecord.timeOutData) {
      if (anesthesiaRecord.timeOutData.checklist) {
        setTimeOutChecklist(anesthesiaRecord.timeOutData.checklist);
      }
      if (anesthesiaRecord.timeOutData.notes) {
        setTimeOutNotes(anesthesiaRecord.timeOutData.notes);
      }
      if (anesthesiaRecord.timeOutData.signature) {
        setTimeOutSignature(anesthesiaRecord.timeOutData.signature);
      }
    }
    if (anesthesiaRecord.signOutData) {
      if (anesthesiaRecord.signOutData.checklist) {
        setSignOutChecklist(anesthesiaRecord.signOutData.checklist);
      }
      if (anesthesiaRecord.signOutData.notes) {
        setSignOutNotes(anesthesiaRecord.signOutData.notes);
      }
      if (anesthesiaRecord.signOutData.signature) {
        setSignOutSignature(anesthesiaRecord.signOutData.signature);
      }
    }
  }, [anesthesiaRecord]);

  // Initialize Post-Op data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    if (anesthesiaRecord.post_op_data) {
      setPostOpData(anesthesiaRecord.post_op_data);
    }
  }, [anesthesiaRecord]);

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
        if (window.history.length > 1) {
          window.history.back();
        } else {
          setLocation('/anesthesia/op');
        }
      }, 100);
    }
  };

  // Close dialog handler
  const handleClose = () => {
    handleDialogChange(false);
  };

  // Get patient weight from preOp assessment
  const patientWeight = preOpAssessment?.weight ? parseFloat(preOpAssessment.weight) : undefined;

  // Calculate age from birthday
  const calculateAge = (birthday: string | null | undefined): number | null => {
    if (!birthday) return null;
    const birthDate = new Date(birthday);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const patientAge = calculateAge(patient?.birthday);

  // Show loading state while initial data is loading
  // Wait for anesthesia record first, then wait for timeline data to load
  const isLoadingTimeline = anesthesiaRecord?.id && (isVitalsLoading || isMedicationsLoading || isEventsLoading);
  if (isSurgeryLoading || isPreOpLoading || isPatientLoading || isRecordLoading || isLoadingTimeline) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col items-center justify-center [&>button]:hidden">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">Loading anesthesia record...</p>
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
        <h2 className="sr-only" id="op-dialog-title">{isPacuMode ? 'PACU Monitor' : 'Intraoperative Monitoring'} - Patient {surgery.patientId}</h2>
        <p className="sr-only" id="op-dialog-description">{isPacuMode ? 'Post-anesthesia care unit monitoring system' : 'Professional anesthesia monitoring system for tracking vitals, medications, and clinical events during surgery'}</p>
        {/* Fixed Patient Info Header */}
        <div className="shrink-0 bg-background relative">
          {/* PACU Mode Header Banner */}
          {isPacuMode && (
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-6 py-3">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <BedDouble className="h-5 w-5" />
                PACU MONITOR
              </h3>
            </div>
          )}
          
          {/* Close Button - Fixed top-right */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className={`absolute right-2 top-2 md:right-4 md:top-4 z-10 ${isPacuMode ? 'text-white hover:bg-white/20' : ''}`}
            data-testid="button-close-op"
          >
            <X className="h-5 w-5" />
          </Button>

          <div className={`px-4 md:px-6 ${isPacuMode ? 'py-3' : 'py-3 pr-12 md:pr-14'}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4 md:flex-wrap">
              {/* Patient Name & Icon */}
              <div className="flex items-center gap-3">
                <UserCircle className="h-8 w-8 text-blue-500" />
                <div>
                  <h2 className="font-bold text-base md:text-lg">
                    {patient ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() || 'Patient' : 'Loading...'}
                  </h2>
                  <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                    {patient?.birthday && (
                      <p className="text-xs md:text-sm text-muted-foreground">
                        {formatDate(patient.birthday)}{patientAge !== null && ` • ${patientAge} y/o`}
                      </p>
                    )}
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
              {(allergies || cave) && (
                <div 
                  onClick={handleOpenAllergiesDialog}
                  className="flex items-start gap-2 px-3 py-1.5 md:px-4 md:py-2 bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900 transition-colors"
                  data-testid="allergies-cave-warning"
                >
                  <AlertCircle className="h-4 w-4 md:h-5 md:w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <div className="flex gap-4 flex-wrap flex-1">
                    {allergies && (
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">ALLERGIES</p>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : allergies}
                        </p>
                      </div>
                    )}
                    {cave && (
                      <div className="flex-1 min-w-[120px]">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300">CAVE</p>
                        <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                          {isPreOpLoading ? <Skeleton className="h-4 w-20" /> : cave}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
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
                  {isPacuMode && (
                    <TabsTrigger value="pacu" data-testid="tab-pacu" className="text-xs sm:text-sm whitespace-nowrap">
                      PACU
                    </TabsTrigger>
                  )}
                  {!isPacuMode && (
                    <TabsTrigger value="anesthesia" data-testid="tab-anesthesia" className="text-xs sm:text-sm whitespace-nowrap">
                      Anesthesia
                    </TabsTrigger>
                  )}
                  <TabsTrigger value="preop" data-testid="tab-preop" className="text-xs sm:text-sm whitespace-nowrap">
                    Pre-Op
                  </TabsTrigger>
                  <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm whitespace-nowrap">
                    Inventory
                  </TabsTrigger>
                  {!isPacuMode && (
                    <>
                      <TabsTrigger value="checklists" data-testid="tab-checklists" className="text-xs sm:text-sm whitespace-nowrap">
                        Checklists
                      </TabsTrigger>
                      <TabsTrigger value="postop" data-testid="tab-postop" className="text-xs sm:text-sm whitespace-nowrap">
                        Post-op
                      </TabsTrigger>
                    </>
                  )}
                </TabsList>
              </div>
              <Button 
                variant="outline" 
                size="sm"
                className="flex items-center gap-1 sm:gap-2 shrink-0"
                data-testid="button-toggle-events"
                onClick={() => setOpenEventsPanel(true)}
              >
                <MessageSquareText className="h-4 w-4" />
                <span className="hidden sm:inline">Events</span>
              </Button>
            </div>
          </div>

          {/* Vitals & Timeline Tab - forceMount keeps state when switching tabs */}
          <TabsContent value="vitals" forceMount className="data-[state=active]:flex-1 overflow-y-auto flex flex-col mt-0 px-0 data-[state=inactive]:hidden" data-testid="tab-content-vitals">
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
                  anesthesiaRecordId={anesthesiaRecord?.id}
                  anesthesiaRecord={anesthesiaRecord}
                  openEventsPanel={openEventsPanel}
                  onEventsPanelChange={setOpenEventsPanel}
                />
              )}
            </div>
          </TabsContent>

          {/* PACU Documentation Tab - Only visible in PACU mode */}
          {isPacuMode && (
            <TabsContent value="pacu" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-pacu">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BedDouble className="h-5 w-5 text-blue-500" />
                    PACU Documentation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-4 mb-4">
                      <ClipboardList className="h-12 w-12 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">PACU Documentation</h3>
                    <p className="text-muted-foreground max-w-md mb-4">
                      PACU-specific documentation features including Aldrete scoring, discharge criteria, 
                      and post-anesthesia care notes will be available here.
                    </p>
                    <Badge variant="secondary" className="mt-2">
                      Coming Soon
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Anesthesia Documentation Tab */}
          {!isPacuMode && (
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
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">Installations</CardTitle>
                        {installationsData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-installations-status">
                            <CheckCircle className="h-3 w-3" />
                            {installationsData.length} {installationsData.length === 1 ? 'entry' : 'entries'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-installations-status">
                            <MinusCircle className="h-3 w-3" />
                            No data
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <InstallationsSection anesthesiaRecordId={anesthesiaRecord?.id || ''} />
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* General Anesthesia Section */}
                <AccordionItem value="general-anesthesia">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-general-anesthesia">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">General Anesthesia</CardTitle>
                        {(generalTechniqueData || airwayManagementData) ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-general-status">
                            <CheckCircle className="h-3 w-3" />
                            Configured
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-general-status">
                            <MinusCircle className="h-3 w-3" />
                            No data
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <GeneralAnesthesiaSection anesthesiaRecordId={anesthesiaRecord?.id || ''} />
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Neuraxial Anesthesia Section */}
                <AccordionItem value="neuraxial-anesthesia">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-neuraxial">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">Neuraxial Anesthesia</CardTitle>
                        {neuraxialBlocksData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-neuraxial-status">
                            <CheckCircle className="h-3 w-3" />
                            {neuraxialBlocksData.length} {neuraxialBlocksData.length === 1 ? 'block' : 'blocks'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-neuraxial-status">
                            <MinusCircle className="h-3 w-3" />
                            No data
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <NeuraxialAnesthesiaSection anesthesiaRecordId={anesthesiaRecord?.id || ''} />
                    </AccordionContent>
                  </Card>
                </AccordionItem>

                {/* Peripheral Regional Anesthesia Section */}
                <AccordionItem value="peripheral-regional-anesthesia">
                  <Card>
                    <AccordionTrigger className="px-6 py-4 hover:no-underline" data-testid="accordion-peripheral-regional">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">Peripheral Regional Anesthesia</CardTitle>
                        {peripheralBlocksData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-peripheral-status">
                            <CheckCircle className="h-3 w-3" />
                            {peripheralBlocksData.length} {peripheralBlocksData.length === 1 ? 'block' : 'blocks'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-peripheral-status">
                            <MinusCircle className="h-3 w-3" />
                            No data
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <PeripheralBlocksSection anesthesiaRecordId={anesthesiaRecord?.id || ''} />
                    </AccordionContent>
                  </Card>
                </AccordionItem>
              </Accordion>
            )}
          </TabsContent>
          )}

          {/* Pre-Op Tab */}
          <TabsContent value="preop" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-preop">
            {isPreOpLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <PreOpOverview surgeryId={surgeryId!} />
            )}
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-inventory">
            <InventoryUsageTab anesthesiaRecordId={anesthesiaRecord?.id || ''} />
          </TabsContent>

          {/* Checklists Tab - Only shown in OP mode */}
          {!isPacuMode && (
            <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-checklists">
            <div className="space-y-4">
              {/* Sign In */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Sign In (Before Induction)
                  </CardTitle>
                  {signInAutoSave.status !== 'idle' && (
                    <Badge variant={
                      signInAutoSave.status === 'saving' ? 'secondary' :
                      signInAutoSave.status === 'saved' ? 'default' : 'destructive'
                    } data-testid="badge-signin-status">
                      {signInAutoSave.status === 'saving' && 'Saving...'}
                      {signInAutoSave.status === 'saved' && 'Saved'}
                      {signInAutoSave.status === 'error' && 'Error saving'}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaSettings?.checklistItems?.signIn && anesthesiaSettings.checklistItems.signIn.length > 0 ? (
                    <>
                      {anesthesiaSettings.checklistItems.signIn.map((item: string, index: number) => {
                        const itemKey = item.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                        const isChecked = signInChecklist[itemKey] || false;
                        return (
                          <div key={index} className="flex items-center space-x-2">
                            <Checkbox
                              id={`signin-${index}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextChecklist = {
                                  ...signInChecklist,
                                  [itemKey]: checked === true
                                };
                                setSignInChecklist(nextChecklist);
                                signInAutoSave.mutate({
                                  checklist: nextChecklist,
                                  notes: signInNotes,
                                  signature: signInSignature,
                                });
                              }}
                              data-testid={`checkbox-signin-${index}`}
                            />
                            <label
                              htmlFor={`signin-${index}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {item}
                            </label>
                          </div>
                        );
                      })}
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="signin-notes">Additional Notes</Label>
                        <Textarea
                          id="signin-notes"
                          placeholder="Add any additional notes or observations..."
                          value={signInNotes}
                          onChange={(e) => {
                            const nextNotes = e.target.value;
                            setSignInNotes(nextNotes);
                            signInAutoSave.mutate({
                              checklist: signInChecklist,
                              notes: nextNotes,
                              signature: signInSignature,
                            });
                          }}
                          rows={3}
                          data-testid="textarea-signin-notes"
                        />
                      </div>
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="signin-signature">Signature</Label>
                        <div className="space-y-2">
                          {signInSignature ? (
                            <div className="relative border rounded-md p-2">
                              <img src={signInSignature} alt="Signature" className="max-h-24" />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => {
                                  setSignInSignature('');
                                  signInAutoSave.mutate({
                                    checklist: signInChecklist,
                                    notes: signInNotes,
                                    signature: '',
                                  });
                                }}
                                data-testid="button-clear-signin-signature"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => setShowSignInSigPad(true)}
                              data-testid="button-add-signin-signature"
                            >
                              Add Signature
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No checklist items configured. Please configure WHO checklist items in Anesthesia Settings.</p>
                  )}
                </CardContent>
              </Card>

              {/* Time Out */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Time Out (Before Incision)
                  </CardTitle>
                  {timeOutAutoSave.status !== 'idle' && (
                    <Badge variant={
                      timeOutAutoSave.status === 'saving' ? 'secondary' :
                      timeOutAutoSave.status === 'saved' ? 'default' : 'destructive'
                    } data-testid="badge-timeout-status">
                      {timeOutAutoSave.status === 'saving' && 'Saving...'}
                      {timeOutAutoSave.status === 'saved' && 'Saved'}
                      {timeOutAutoSave.status === 'error' && 'Error saving'}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaSettings?.checklistItems?.timeOut && anesthesiaSettings.checklistItems.timeOut.length > 0 ? (
                    <>
                      {anesthesiaSettings.checklistItems.timeOut.map((item: string, index: number) => {
                        const itemKey = item.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                        const isChecked = timeOutChecklist[itemKey] || false;
                        return (
                          <div key={index} className="flex items-center space-x-2">
                            <Checkbox
                              id={`timeout-${index}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextChecklist = {
                                  ...timeOutChecklist,
                                  [itemKey]: checked === true
                                };
                                setTimeOutChecklist(nextChecklist);
                                timeOutAutoSave.mutate({
                                  checklist: nextChecklist,
                                  notes: timeOutNotes,
                                  signature: timeOutSignature,
                                });
                              }}
                              data-testid={`checkbox-timeout-${index}`}
                            />
                            <label
                              htmlFor={`timeout-${index}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {item}
                            </label>
                          </div>
                        );
                      })}
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="timeout-notes">Additional Notes</Label>
                        <Textarea
                          id="timeout-notes"
                          placeholder="Add any additional notes or observations..."
                          value={timeOutNotes}
                          onChange={(e) => {
                            const nextNotes = e.target.value;
                            setTimeOutNotes(nextNotes);
                            timeOutAutoSave.mutate({
                              checklist: timeOutChecklist,
                              notes: nextNotes,
                              signature: timeOutSignature,
                            });
                          }}
                          rows={3}
                          data-testid="textarea-timeout-notes"
                        />
                      </div>
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="timeout-signature">Signature</Label>
                        <div className="space-y-2">
                          {timeOutSignature ? (
                            <div className="relative border rounded-md p-2">
                              <img src={timeOutSignature} alt="Signature" className="max-h-24" />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => {
                                  setTimeOutSignature('');
                                  timeOutAutoSave.mutate({
                                    checklist: timeOutChecklist,
                                    notes: timeOutNotes,
                                    signature: '',
                                  });
                                }}
                                data-testid="button-clear-timeout-signature"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => setShowTimeOutSigPad(true)}
                              data-testid="button-add-timeout-signature"
                            >
                              Add Signature
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No checklist items configured. Please configure WHO checklist items in Anesthesia Settings.</p>
                  )}
                </CardContent>
              </Card>

              {/* Sign Out */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Sign Out (Before Patient Leaves OR)
                  </CardTitle>
                  {signOutAutoSave.status !== 'idle' && (
                    <Badge variant={
                      signOutAutoSave.status === 'saving' ? 'secondary' :
                      signOutAutoSave.status === 'saved' ? 'default' : 'destructive'
                    } data-testid="badge-signout-status">
                      {signOutAutoSave.status === 'saving' && 'Saving...'}
                      {signOutAutoSave.status === 'saved' && 'Saved'}
                      {signOutAutoSave.status === 'error' && 'Error saving'}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  {anesthesiaSettings?.checklistItems?.signOut && anesthesiaSettings.checklistItems.signOut.length > 0 ? (
                    <>
                      {anesthesiaSettings.checklistItems.signOut.map((item: string, index: number) => {
                        const itemKey = item.toLowerCase().replace(/[^a-z0-9]+/g, '_');
                        const isChecked = signOutChecklist[itemKey] || false;
                        return (
                          <div key={index} className="flex items-center space-x-2">
                            <Checkbox
                              id={`signout-${index}`}
                              checked={isChecked}
                              onCheckedChange={(checked) => {
                                const nextChecklist = {
                                  ...signOutChecklist,
                                  [itemKey]: checked === true
                                };
                                setSignOutChecklist(nextChecklist);
                                signOutAutoSave.mutate({
                                  checklist: nextChecklist,
                                  notes: signOutNotes,
                                  signature: signOutSignature,
                                });
                              }}
                              data-testid={`checkbox-signout-${index}`}
                            />
                            <label
                              htmlFor={`signout-${index}`}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {item}
                            </label>
                          </div>
                        );
                      })}
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="signout-notes">Additional Notes</Label>
                        <Textarea
                          id="signout-notes"
                          placeholder="Add any additional notes or observations..."
                          value={signOutNotes}
                          onChange={(e) => {
                            const nextNotes = e.target.value;
                            setSignOutNotes(nextNotes);
                            signOutAutoSave.mutate({
                              checklist: signOutChecklist,
                              notes: nextNotes,
                              signature: signOutSignature,
                            });
                          }}
                          rows={3}
                          data-testid="textarea-signout-notes"
                        />
                      </div>
                      <div className="pt-2 space-y-2">
                        <Label htmlFor="signout-signature">Signature</Label>
                        <div className="space-y-2">
                          {signOutSignature ? (
                            <div className="relative border rounded-md p-2">
                              <img src={signOutSignature} alt="Signature" className="max-h-24" />
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1"
                                onClick={() => {
                                  setSignOutSignature('');
                                  signOutAutoSave.mutate({
                                    checklist: signOutChecklist,
                                    notes: signOutNotes,
                                    signature: '',
                                  });
                                }}
                                data-testid="button-clear-signout-signature"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full"
                              onClick={() => setShowSignOutSigPad(true)}
                              data-testid="button-add-signout-signature"
                            >
                              Add Signature
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No checklist items configured. Please configure WHO checklist items in Anesthesia Settings.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
          )}

          {/* Post-op Tab - Only shown in OP mode */}
          {!isPacuMode && (
            <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-postop">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Post-Operative Information</CardTitle>
                {postOpAutoSave.status !== 'idle' && (
                  <Badge variant={
                    postOpAutoSave.status === 'saving' ? 'secondary' :
                    postOpAutoSave.status === 'saved' ? 'default' : 'destructive'
                  } data-testid="badge-postop-status">
                    {postOpAutoSave.status === 'saving' && 'Saving...'}
                    {postOpAutoSave.status === 'saved' && 'Saved'}
                    {postOpAutoSave.status === 'error' && 'Error saving'}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Destination */}
                <div className="space-y-2">
                  <Label htmlFor="postop-destination">Destination</Label>
                  <Select 
                    value={postOpData.postOpDestination || ""} 
                    onValueChange={(value) => {
                      const updated = { ...postOpData, postOpDestination: value };
                      setPostOpData(updated);
                      postOpAutoSave.mutate(updated);
                    }}
                    disabled={!anesthesiaRecord?.id}
                  >
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

                {/* Post-Operative Notes */}
                <div className="space-y-2">
                  <Label htmlFor="postop-notes">Post-Operative Notes</Label>
                  <Textarea
                    id="postop-notes"
                    rows={4}
                    placeholder="Enter post-operative notes..."
                    value={postOpData.postOpNotes || ""}
                    onChange={(e) => {
                      const updated = { ...postOpData, postOpNotes: e.target.value };
                      setPostOpData(updated);
                      postOpAutoSave.mutate(updated);
                    }}
                    disabled={!anesthesiaRecord?.id}
                    data-testid="textarea-postop-notes"
                  />
                </div>

                {/* Complications */}
                <div className="space-y-2">
                  <Label htmlFor="complications">Complications</Label>
                  <Textarea
                    id="complications"
                    rows={3}
                    placeholder="Document any complications..."
                    value={postOpData.complications || ""}
                    onChange={(e) => {
                      const updated = { ...postOpData, complications: e.target.value };
                      setPostOpData(updated);
                      postOpAutoSave.mutate(updated);
                    }}
                    disabled={!anesthesiaRecord?.id}
                    data-testid="textarea-postop-complications"
                  />
                </div>

                {/* Medication Timing Fields */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">Medication Timing</h4>
                  
                  {/* Paracetamol */}
                  <div className="space-y-2">
                    <Label>Paracetamol</Label>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="paracetamol"
                          value="Immediately"
                          checked={postOpData.paracetamolTime === "Immediately"}
                          onChange={(e) => {
                            const updated = { ...postOpData, paracetamolTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-paracetamol-immediately"
                        />
                        <span className="text-sm">Immediately</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="paracetamol"
                          value="Contraindicated"
                          checked={postOpData.paracetamolTime === "Contraindicated"}
                          onChange={(e) => {
                            const updated = { ...postOpData, paracetamolTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-paracetamol-contraindicated"
                        />
                        <span className="text-sm">Contraindicated</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="paracetamol"
                            value="custom"
                            checked={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" && !!postOpData.paracetamolTime}
                            onChange={() => {}}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-paracetamol-custom"
                          />
                          <span className="text-sm">At:</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder="HH:MM"
                          pattern="^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
                          value={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" ? (postOpData.paracetamolTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
                            if (value === "" || timeRegex.test(value)) {
                              const updated = { ...postOpData, paracetamolTime: value };
                              setPostOpData(updated);
                              postOpAutoSave.mutate(updated);
                            } else {
                              setPostOpData({ ...postOpData, paracetamolTime: value });
                            }
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="input-paracetamol-time"
                        />
                      </div>
                    </div>
                  </div>

                  {/* NSAR */}
                  <div className="space-y-2">
                    <Label>NSAR</Label>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="nsar"
                          value="Immediately"
                          checked={postOpData.nsarTime === "Immediately"}
                          onChange={(e) => {
                            const updated = { ...postOpData, nsarTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-nsar-immediately"
                        />
                        <span className="text-sm">Immediately</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="nsar"
                          value="Contraindicated"
                          checked={postOpData.nsarTime === "Contraindicated"}
                          onChange={(e) => {
                            const updated = { ...postOpData, nsarTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-nsar-contraindicated"
                        />
                        <span className="text-sm">Contraindicated</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="nsar"
                            value="custom"
                            checked={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" && !!postOpData.nsarTime}
                            onChange={() => {}}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-nsar-custom"
                          />
                          <span className="text-sm">At:</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder="HH:MM"
                          pattern="^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
                          value={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" ? (postOpData.nsarTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
                            if (value === "" || timeRegex.test(value)) {
                              const updated = { ...postOpData, nsarTime: value };
                              setPostOpData(updated);
                              postOpAutoSave.mutate(updated);
                            } else {
                              setPostOpData({ ...postOpData, nsarTime: value });
                            }
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="input-nsar-time"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Novalgin */}
                  <div className="space-y-2">
                    <Label>Novalgin</Label>
                    <div className="flex gap-4 flex-wrap">
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="novalgin"
                          value="Immediately"
                          checked={postOpData.novalginTime === "Immediately"}
                          onChange={(e) => {
                            const updated = { ...postOpData, novalginTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-novalgin-immediately"
                        />
                        <span className="text-sm">Immediately</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="radio"
                          name="novalgin"
                          value="Contraindicated"
                          checked={postOpData.novalginTime === "Contraindicated"}
                          onChange={(e) => {
                            const updated = { ...postOpData, novalginTime: e.target.value };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="radio-novalgin-contraindicated"
                        />
                        <span className="text-sm">Contraindicated</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2">
                          <input
                            type="radio"
                            name="novalgin"
                            value="custom"
                            checked={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" && !!postOpData.novalginTime}
                            onChange={() => {}}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-novalgin-custom"
                          />
                          <span className="text-sm">At:</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder="HH:MM"
                          pattern="^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$"
                          value={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" ? (postOpData.novalginTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            const timeRegex = /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/;
                            if (value === "" || timeRegex.test(value)) {
                              const updated = { ...postOpData, novalginTime: value };
                              setPostOpData(updated);
                              postOpAutoSave.mutate(updated);
                            } else {
                              setPostOpData({ ...postOpData, novalginTime: value });
                            }
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="input-novalgin-time"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          )}
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

    {/* SignaturePad Modals */}
    <SignaturePad
      isOpen={showSignInSigPad}
      onClose={() => setShowSignInSigPad(false)}
      onSave={(signature) => {
        setSignInSignature(signature);
        signInAutoSave.mutate({
          checklist: signInChecklist,
          notes: signInNotes,
          signature: signature,
        });
      }}
      title="Sign In Signature"
    />

    <SignaturePad
      isOpen={showTimeOutSigPad}
      onClose={() => setShowTimeOutSigPad(false)}
      onSave={(signature) => {
        setTimeOutSignature(signature);
        timeOutAutoSave.mutate({
          checklist: timeOutChecklist,
          notes: timeOutNotes,
          signature: signature,
        });
      }}
      title="Time Out Signature"
    />

    <SignaturePad
      isOpen={showSignOutSigPad}
      onClose={() => setShowSignOutSigPad(false)}
      onSave={(signature) => {
        setSignOutSignature(signature);
        signOutAutoSave.mutate({
          checklist: signOutChecklist,
          notes: signOutNotes,
          signature: signature,
        });
      }}
      title="Sign Out Signature"
    />
    </>
  );
}
