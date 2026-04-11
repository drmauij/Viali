import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from 'react-i18next';
import { useModule } from "@/contexts/ModuleContext";
import { UnifiedTimeline, type UnifiedTimelineRef, type UnifiedTimelineData, type TimelineVitals, type TimelineEvent, type VitalPoint } from "@/components/anesthesia/UnifiedTimeline";
import { PreOpOverview } from "@/components/anesthesia/PreOpOverview";
import { 
  InstallationsSection,
  GeneralAnesthesiaSection,
  NeuraxialAnesthesiaSection,
  PeripheralBlocksSection
} from "@/components/anesthesia/AnesthesiaDocumentation";
import { OpInventory } from "@/components/anesthesia/OpInventory";
import { PatientInfoHeader } from "@/components/anesthesia/PatientInfoHeader";
import { PacuBedSelector, PacuBedSquare } from "@/components/anesthesia/PacuBedSelector";
import { StaffTab } from "@/components/anesthesia/StaffTab";
import { IntraOpTab } from "@/pages/anesthesia/op/IntraOpTab";
import { CountsSterileTab } from "@/pages/anesthesia/op/CountsSterileTab";
import { AllergiesDialog } from "@/pages/anesthesia/op/AllergiesDialog";
import { IntraoperativeMedicationsCard } from "@/components/anesthesia/IntraoperativeMedicationsCard";
import { OrdersGlanceCard } from "@/components/anesthesia/postop/OrdersGlanceCard";
import { PostopTasksPanel } from "@/components/anesthesia/postop/PostopTasksPanel";
import { OrderSetEditorDialog } from "@/components/anesthesia/postop/OrderSetEditorDialog";
import { usePostopOrderSet } from "@/hooks/usePostopOrderSet";
import { usePostopOrderTemplates } from "@/hooks/usePostopOrderTemplates";
import { WHOChecklistCard } from "@/components/anesthesia/WHOChecklistCard";
import { PatientWeightDialog } from "@/components/anesthesia/dialogs/PatientWeightDialog";
import { DuplicateRecordsDialog } from "@/components/anesthesia/DuplicateRecordsDialog";
import { CameraConnectionDialog } from "@/components/anesthesia/dialogs/CameraConnectionDialog";
import { UnifiedAnesthesiaSetsDialog } from "@/components/anesthesia/dialogs/UnifiedAnesthesiaSetsDialog";
import { SurgerySetsDialog } from "@/components/anesthesia/dialogs/SurgerySetsDialog";
import { useOpData } from "@/hooks/useOpData";
import { useChecklistState } from "@/hooks/useChecklistState";
import { usePacuDataFiltering } from "@/hooks/usePacuDataFiltering";
import { downloadAnesthesiaRecordPdf } from "@/lib/downloadAnesthesiaRecordPdf";
import { saveEvent } from "@/services/timelinePersistence";
import { useInventoryTracking } from "@/hooks/useInventoryTracking";
import { useTimelineData } from "@/hooks/useTimelineData";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SignaturePad from "@/components/SignaturePad";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { useDebouncedAutoSave } from "@/hooks/useDebouncedAutoSave";
import { useSocket } from "@/contexts/SocketContext";
import { Minus, Folder, Package, Loader2, MapPin, FileText, AlertTriangle, Pill, Upload } from "lucide-react";
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
  Droplet,
  Download,
  CheckCircle,
  MinusCircle,
  MessageSquareText,
  BedDouble,
  Layers,
  Camera,
  Image,
  ToggleLeft,
  ToggleRight,
  Trash2
} from "lucide-react";

export default function Op() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [openEventsPanel, setOpenEventsPanel] = useState(false);
  const [showSetsDialog, setShowSetsDialog] = useState(false);
  const [showSurgerySetsDialog, setShowSurgerySetsDialog] = useState(false);
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const { activeModule } = useModule();
  const { user } = useAuth();
  const { joinSurgery, leaveSurgery, isConnected, connectionState, forceReconnect, viewers } = useSocket();
  
  // Check if in surgery module mode
  const isSurgeryMode = activeModule === "surgery" || location.startsWith("/surgery");
  const hasAttemptedCreate = useRef(false);
  const timelineRef = useRef<UnifiedTimelineRef>(null);

  // Determine mode based on route (PACU mode if URL contains /pacu)
  const isPacuMode = location.includes('/pacu');
  
  // Active tab state - default based on module
  const getDefaultTab = () => {
    if (isSurgeryMode) return "staff";
    if (isPacuMode) return "pacu";
    return "vitals";
  };
  const [activeTab, setActiveTab] = useState(getDefaultTab());
  
  // Weight dialog state
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  
  
  // Duplicate records detection state
  const [duplicateRecords, setDuplicateRecords] = useState<any[]>([]);
  const [showDuplicatesDialog, setShowDuplicatesDialog] = useState(false);
  const [duplicateCheckComplete, setDuplicateCheckComplete] = useState(false);
  
  // Camera connection dialog state
  const [showCameraDialog, setShowCameraDialog] = useState(false);
  const [isSavingCamera, setIsSavingCamera] = useState(false);

  // Get surgeryId from params
  const surgeryId = params.id;
  
  // Parse recordId from query parameter (for opening specific record when duplicates exist)
  // Re-read on every render to catch URL changes
  const urlRecordId = useMemo(() => {
    return new URLSearchParams(window.location.search).get('recordId') || undefined;
  }, [location]);
  
  const [selectedRecordId, setSelectedRecordId] = useState<string | undefined>(urlRecordId);
  
  // Sync selectedRecordId with URL changes
  useEffect(() => {
    if (urlRecordId && urlRecordId !== selectedRecordId) {
      setSelectedRecordId(urlRecordId);
      setDuplicateCheckComplete(true); // URL has recordId, so skip duplicate check
    }
  }, [urlRecordId]);
  
  // If URL has recordId, duplicate check is not needed
  const needsDuplicateCheck = !urlRecordId;

  // Centralized data fetching
  const {
    surgery,
    anesthesiaRecord,
    preOpAssessment,
    patient,
    anesthesiaSettings,
    hospitalUsers,
    vitalsData,
    medicationsData,
    eventsData,
    anesthesiaItems,
    clinicalSnapshot,
    staffMembers,
    positions,
    installationsData,
    generalTechniqueData,
    airwayManagementData,
    neuraxialBlocksData,
    peripheralBlocksData,
    inventoryUsage,
    inventoryCommits,
    inventoryItems,
    isSurgeryLoading,
    isRecordLoading,
    isPreOpLoading,
    isPatientLoading,
    isVitalsLoading,
    isMedicationsLoading,
    isEventsLoading,
    isAnesthesiaItemsLoading,
    isClinicalSnapshotLoading,
    isStaffLoading,
    isPositionsLoading,
    surgeryError,
    patientError,
    isVitalsError,
    isMedicationsError,
    isEventsError,
    isAnesthesiaItemsError,
    isClinicalSnapshotError,
    isStaffError,
    isPositionsError,
    vitalsStatus,
    medicationsStatus,
    eventsStatus,
    anesthesiaItemsStatus,
    clinicalSnapshotStatus,
    staffStatus,
    positionsStatus,
  } = useOpData({
    surgeryId: surgeryId || "",
    activeHospitalId: activeHospital?.id || "",
    recordId: selectedRecordId,
    waitForRecordId: needsDuplicateCheck,
  });

  // Fetch surgery rooms to look up PACU bed name
  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  // Look up PACU bed name from surgery.pacuBedId
  const pacuBedName = useMemo(() => {
    if (!surgery?.pacuBedId || surgeryRooms.length === 0) return null;
    const pacuBed = surgeryRooms.find((room: any) => room.id === surgery.pacuBedId);
    return pacuBed?.name || null;
  }, [surgery?.pacuBedId, surgeryRooms]);

  // Postoperative order set hooks
  const postopOrderSet = usePostopOrderSet(anesthesiaRecord?.id);
  const postopTemplates = usePostopOrderTemplates(activeHospital?.id);
  const [orderEditorOpen, setOrderEditorOpen] = useState(false);

  // Check if X2 marker is set (enables mode toggle)
  const hasX2Marker = useMemo(() => {
    if (!anesthesiaRecord?.timeMarkers) return false;
    const markers = anesthesiaRecord.timeMarkers as any[];
    const x2Marker = markers.find((m: any) => m.code === 'X2');
    return x2Marker?.time != null;
  }, [anesthesiaRecord?.timeMarkers]);

  // Check if P marker is set (PACU end - record complete)
  const hasPMarker = useMemo(() => {
    if (!anesthesiaRecord?.timeMarkers) return false;
    const markers = anesthesiaRecord.timeMarkers as any[];
    const pMarker = markers.find((m: any) => m.code === 'P');
    return pMarker?.time != null;
  }, [anesthesiaRecord?.timeMarkers]);

  // Toggle between OP and PACU modes while preserving all query parameters
  const handleModeToggle = () => {
    if (!surgeryId) return;
    const newMode = isPacuMode ? 'op' : 'pacu';
    
    // Switch to appropriate default tab for the new mode
    const newDefaultTab = newMode === 'pacu' ? 'pacu' : 'vitals';
    setActiveTab(newDefaultTab);
    
    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams;
    
    if (selectedRecordId && !searchParams.has('recordId')) {
      searchParams.set('recordId', selectedRecordId);
    }
    
    const queryString = searchParams.toString();
    const hash = currentUrl.hash;
    const fullPath = `/anesthesia/cases/${surgeryId}/${newMode}${queryString ? `?${queryString}` : ''}${hash}`;
    
    setLocation(fullPath);
  };

  // Track current room for cleanup
  const currentRoomIdRef = useRef<string | null>(null);
  
  // Join/leave surgery room for real-time sync
  useEffect(() => {
    const recordId = anesthesiaRecord?.id;
    
    if (recordId && recordId !== currentRoomIdRef.current) {
      // Leave previous room if different
      if (currentRoomIdRef.current) {
        leaveSurgery(currentRoomIdRef.current);
        console.log('[Op] Left previous surgery room:', currentRoomIdRef.current);
      }
      
      // Join new room
      joinSurgery(recordId);
      currentRoomIdRef.current = recordId;
      console.log('[Op] Joined surgery room:', recordId);
    }
    
    return () => {
      if (currentRoomIdRef.current) {
        leaveSurgery(currentRoomIdRef.current);
        console.log('[Op] Left surgery room on unmount:', currentRoomIdRef.current);
        currentRoomIdRef.current = null;
      }
    };
  }, [anesthesiaRecord?.id, joinSurgery, leaveSurgery]);

  // Reset duplicate check state when surgeryId changes
  useEffect(() => {
    setDuplicateCheckComplete(false);
    setShowDuplicatesDialog(false);
    setDuplicateRecords([]);
  }, [surgeryId]);

  // Check for duplicate records when page loads (only if no specific recordId was requested)
  useEffect(() => {
    const checkForDuplicates = async () => {
      // Skip if no surgeryId or a specific recordId was already in URL
      if (!surgeryId || !needsDuplicateCheck) {
        setDuplicateCheckComplete(true);
        return;
      }
      
      console.log('[Op] Starting duplicate check for surgery:', surgeryId);
      
      try {
        const response = await apiRequest("GET", `/api/anesthesia/records/surgery/${surgeryId}/all`);
        if (response.ok) {
          const records = await response.json();
          console.log('[Op] Duplicate check found', records.length, 'record(s)');
          
          if (records.length > 1) {
            // Multiple records found - show dialog and wait for user selection
            setDuplicateRecords(records);
            setShowDuplicatesDialog(true);
            // Don't mark complete yet - wait for user selection
          } else if (records.length === 1) {
            // Single record - auto-select it and update URL
            const singleRecordId = records[0].id;
            setSelectedRecordId(singleRecordId);
            // Update URL for stable navigation
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('recordId', singleRecordId);
            window.history.replaceState({}, '', currentUrl.toString());
            setDuplicateCheckComplete(true);
          } else {
            // No records exist yet - let normal flow create one
            setDuplicateCheckComplete(true);
          }
        } else {
          // API error - proceed with normal flow
          console.error('[Op] API error in duplicate check, proceeding');
          setDuplicateCheckComplete(true);
        }
      } catch (error) {
        console.error('[Op] Error checking for duplicate records:', error);
        setDuplicateCheckComplete(true);
      }
    };
    
    checkForDuplicates();
  }, [surgeryId, needsDuplicateCheck]);

  // Handle selecting a specific record from duplicate dialog
  const handleSelectDuplicateRecord = (recordId: string) => {
    setSelectedRecordId(recordId);
    setShowDuplicatesDialog(false);
    setDuplicateCheckComplete(true);
    // Update URL with recordId for proper navigation
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.set('recordId', recordId);
    window.history.replaceState({}, '', currentUrl.toString());
  };

  // Handle refreshing duplicate records list
  const handleRefreshDuplicates = async () => {
    if (!surgeryId) return;
    try {
      const response = await apiRequest("GET", `/api/anesthesia/records/surgery/${surgeryId}/all`);
      if (response.ok) {
        const records = await response.json();
        setDuplicateRecords(records);
        // If only one record remains, auto-select and close dialog
        if (records.length === 1) {
          const singleRecordId = records[0].id;
          setSelectedRecordId(singleRecordId);
          setShowDuplicatesDialog(false);
          setDuplicateCheckComplete(true);
          // Update URL for stable navigation
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('recordId', singleRecordId);
          window.history.replaceState({}, '', currentUrl.toString());
        } else if (records.length === 0) {
          // All records deleted - close dialog and proceed
          setShowDuplicatesDialog(false);
          setDuplicateCheckComplete(true);
        }
      }
    } catch (error) {
      console.error('[Op] Error refreshing duplicate records:', error);
    }
  };

  // Helper to get user display name from various possible fields
  const getUserDisplayName = (user: any): string => {
    if (!user) return "";
    // Try various combinations of name fields
    if (user.displayName) return user.displayName;
    if (user.name) return user.name;
    const firstName = user.firstName || user.firstname || "";
    const lastName = user.lastName || user.surname || user.lastname || "";
    if (firstName || lastName) return `${firstName} ${lastName}`.trim();
    if (user.email) return user.email;
    return "";
  };
  

  // Fetch camera devices for the hospital (for camera connection dialog)
  const { data: cameraDevices = [], isLoading: isCameraDevicesLoading } = useQuery<any[]>({
    queryKey: ['/api/camera-devices', activeHospital?.id],
    queryFn: async () => {
      const res = await fetch(`/api/camera-devices?hospitalId=${activeHospital?.id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!activeHospital?.id && !isSurgeryMode,
  });

  // Get the connected camera device name
  const connectedCameraDevice = useMemo(() => {
    if (!anesthesiaRecord?.cameraDeviceId || !cameraDevices.length) return null;
    return cameraDevices.find((d: any) => d.id === anesthesiaRecord.cameraDeviceId);
  }, [anesthesiaRecord?.cameraDeviceId, cameraDevices]);

  // Handle saving camera connection settings
  const handleSaveCameraSettings = async (cameraDeviceId: string | null, autoCaptureEnabled: boolean) => {
    if (!anesthesiaRecord?.id) return;
    
    setIsSavingCamera(true);
    try {
      const response = await apiRequest("PATCH", `/api/anesthesia/records/${anesthesiaRecord.id}`, {
        cameraDeviceId,
        autoCaptureEnabled,
      });
      
      if (response.ok) {
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
        toast({
          title: cameraDeviceId 
            ? t('anesthesia.op.cameraDialog.connected', 'Camera connected')
            : t('anesthesia.op.cameraDialog.disconnected', 'Camera disconnected'),
          description: cameraDeviceId && autoCaptureEnabled
            ? t('anesthesia.op.cameraDialog.autoCaptureEnabled', 'Auto-capture is enabled')
            : undefined,
        });
        setShowCameraDialog(false);
      } else {
        toast({
          title: t('common.error', 'Error'),
          description: t('anesthesia.op.cameraDialog.saveFailed', 'Failed to update camera settings'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving camera settings:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('anesthesia.op.cameraDialog.saveFailed', 'Failed to update camera settings'),
        variant: 'destructive',
      });
    } finally {
      setIsSavingCamera(false);
    }
  };

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
          try {
            const createRes = await apiRequest("POST", "/api/anesthesia/records", {
              surgeryId: surgeryId,
            });
            const newRecord = await createRes.json();

            // Set the record ID so useOpData enables the record query
            setSelectedRecordId(newRecord.id);

            // Update URL for stable navigation (same pattern as duplicate check)
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('recordId', newRecord.id);
            window.history.replaceState({}, '', currentUrl.toString());

            // Seed the query cache to avoid an extra GET
            queryClient.setQueryData([`/api/anesthesia/records/${newRecord.id}`], newRecord);
          } catch (createError: any) {
            // Check for billing required error (402)
            if (createError.message?.includes("Payment required") || createError.message?.includes("BILLING_REQUIRED")) {
              // Keep hasAttemptedCreate true to prevent retry spam for billing errors
              toast({
                title: t('billing.paymentRequired', 'Payment Required'),
                description: t('billing.setupPaymentMethodFirst', 'Please set up a payment method in Admin > Billing before creating new anesthesia records.'),
                variant: "destructive",
              });
            } else {
              // For other errors, allow retry
              hasAttemptedCreate.current = false;
              toast({
                title: t('anesthesia.op.error'),
                description: createError.message || t('anesthesia.op.errorCreatingRecord'),
                variant: "destructive",
              });
            }
          }
        } else if (!response.ok) {
          // Other errors (401, 403, 500, etc.) - reset flag and log
          hasAttemptedCreate.current = false;
          console.error(`Failed to fetch anesthesia record: ${response.status}`);
        }
        // If 200, the record exists - keep flag to prevent re-checking
      } catch (error: any) {
        // Network error - reset flag to allow retry
        hasAttemptedCreate.current = false;
        console.error("Error checking anesthesia record:", error);
        toast({
          title: t('anesthesia.op.error'),
          description: error.message || t('anesthesia.op.errorCreatingRecord'),
          variant: "destructive",
        });
      }
    };

    checkAndCreateRecord();
  }, [surgery, anesthesiaRecord, surgeryId, isRecordLoading, toast]);

  // Show error toast if patient fetch fails
  useEffect(() => {
    if (patientError) {
      toast({
        title: t('anesthesia.op.error'),
        description: t('anesthesia.op.errorFetchingPatient'),
        variant: "destructive",
      });
    }
  }, [patientError, toast, t]);

  // WHO Checklist state management using custom hooks
  const signInState = useChecklistState({
    checklistType: 'signIn',
    anesthesiaRecordId: anesthesiaRecord?.id,
    surgeryId: surgeryId || '',
    initialData: anesthesiaRecord?.signInData,
  });

  const timeOutState = useChecklistState({
    checklistType: 'timeOut',
    anesthesiaRecordId: anesthesiaRecord?.id,
    surgeryId: surgeryId || '',
    initialData: anesthesiaRecord?.timeOutData,
    onSignatureAdded: async () => {
      if (anesthesiaRecord?.id) {
        try {
          await saveEvent({
            anesthesiaRecordId: anesthesiaRecord.id,
            timestamp: new Date(),
            eventType: 'team_timeout',
            description: 'Team Time Out',
          });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/events/${anesthesiaRecord.id}`] });
        } catch (error) {
          console.error('[TIME_OUT] Failed to save Team Timeout event:', error);
        }
      }
    },
  });

  const signOutState = useChecklistState({
    checklistType: 'signOut',
    anesthesiaRecordId: anesthesiaRecord?.id,
    surgeryId: surgeryId || '',
    initialData: anesthesiaRecord?.signOutData,
  });

  // Refetch anesthesia record when visiting checklists tab to get latest data
  useEffect(() => {
    if (activeTab === 'checklists' && surgeryId) {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
    }
  }, [activeTab, surgeryId]);

  // Debug: Log medications data
  useEffect(() => {
    console.log('[OP-MEDS] Medications data changed:', {
      recordId: anesthesiaRecord?.id,
      count: medicationsData?.length,
      data: medicationsData,
    });
  }, [medicationsData, anesthesiaRecord?.id]);

  // Handler to clear A3 time marker (called from OpInventory when blocking)
  const handleClearA3Marker = async () => {
    if (!anesthesiaRecord?.timeMarkers) return;
    
    const markers = anesthesiaRecord.timeMarkers as any[];
    const updatedMarkers = markers.map((m: any) => 
      m.code === 'A3' ? { ...m, time: null } : m
    );

    await apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}`, {
      timeMarkers: updatedMarkers,
    });
    
    queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
  };

  // If surgery not found or error, redirect back
  useEffect(() => {
    if (surgeryError || (!isSurgeryLoading && !surgery)) {
      setIsOpen(false);
      setTimeout(() => {
        // Determine the appropriate list page based on current mode
        let fallbackPath = '/anesthesia/op';
        if (isSurgeryMode) {
          fallbackPath = '/surgery/op';
        } else if (isPacuMode) {
          fallbackPath = '/anesthesia/pacu';
        }
        setLocation(fallbackPath);
      }, 100);
    }
  }, [surgery, surgeryError, isSurgeryLoading, setLocation, isSurgeryMode, isPacuMode]);

  // Dialog state for editing allergies and CAVE
  const [isAllergiesDialogOpen, setIsAllergiesDialogOpen] = useState(false);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [otherAllergies, setOtherAllergies] = useState("");
  const [cave, setCave] = useState("");
  



  // Update allergies from patient table and CAVE from preOp assessment
  useEffect(() => {
    // Allergies come from patient table (single source of truth)
    if (patient) {
      setSelectedAllergies((patient as any).allergies || []);
      setOtherAllergies((patient as any).otherAllergies || "");
    }
    // CAVE comes from preOp assessment
    if (preOpAssessment) {
      setCave(preOpAssessment.cave || "");
    }
  }, [patient, preOpAssessment]);

  // Sync Post-Op data from anesthesia record
  useEffect(() => {
    if (anesthesiaRecord?.postOpData) {
      setPostOpData(anesthesiaRecord.postOpData);
    }
  }, [anesthesiaRecord?.postOpData]);
  

  // PACU mode data filtering
  const { a2Timestamp, filteredVitalsData, filteredMedicationsData } = usePacuDataFiltering({
    isPacuMode,
    anesthesiaRecord,
    vitalsData,
    medicationsData,
  });

  // Transform vitals data for timeline
  const timelineData = useTimelineData({
    vitalsData,
    eventsData,
    medicationsData,
    isPacuMode,
    filteredVitalsData,
    filteredMedicationsData,
  });

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

  // Post-Operative Information state
  type MedicationTime = "Immediately" | "Contraindicated" | string;
  const [postOpData, setPostOpData] = useState<{
    postOpDestination?: string;
    postOpNotes?: string;
    complications?: string;
    paracetamolTime?: MedicationTime;
    nsarTime?: MedicationTime;
    novalginTime?: MedicationTime;
    ponvProphylaxis?: {
      ondansetron?: boolean;
      droperidol?: boolean;
      haloperidol?: boolean;
      dexamethasone?: boolean;
    };
    ambulatoryCare?: {
      repeatAntibioticAfter4h?: boolean;
      osasObservation?: boolean;
      escortRequired?: boolean;
      postBlockMotorCheck?: boolean;
      extendedObservation?: boolean;
      noOralAnticoagulants24h?: boolean;
      notes?: string;
    };
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
    enabled: !!activeHospital?.id && !!activeHospital?.unitId && activeHospital?.unitType === 'anesthesia',
  });

  // Fetch folders - filtered by current unit
  const { data: folders = [] } = useQuery<any[]>({
    queryKey: [`/api/folders/${activeHospital?.id}?unitId=${activeHospital?.unitId}`, activeHospital?.unitId],
    enabled: !!activeHospital?.id && !!activeHospital?.unitId && activeHospital?.unitType === 'anesthesia',
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

  // Inventory tracking (must be after groupedItems is defined)
  const { inventoryQuantities, usedFolderIds, handleQuantityChange } = useInventoryTracking({
    medicationsData,
    groupedItems,
  });

  // Get folder name by id
  const getFolderName = (folderId: string) => {
    if (folderId === 'no-folder') return 'Uncategorized';
    const folder = folders.find((f: any) => f.id === folderId);
    return folder?.name || 'Unknown Folder';
  };

  // Initialize Post-Op data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    // Handle both camelCase (from Drizzle) and snake_case (if transformed)
    const postOpDataValue = (anesthesiaRecord as any).postOpData || (anesthesiaRecord as any).post_op_data;
    if (postOpDataValue) {
      setPostOpData(postOpDataValue);
    }
  }, [anesthesiaRecord]);


  // PDF download handler using centralized utility
  const handleDownloadPDF = async () => {
    if (!patient || !surgery) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfMissingData'),
        variant: "destructive",
      });
      return;
    }

    if (!activeHospital?.id) {
      toast({
        title: t('anesthesia.op.pdfCannotGenerate'),
        description: t('anesthesia.op.pdfHospitalNotSelected'),
        variant: "destructive",
      });
      return;
    }

    const result = await downloadAnesthesiaRecordPdf({
      surgery,
      patient,
      hospitalId: activeHospital.id,
      anesthesiaSettings,
    });

    if (result.success) {
      toast({
        title: t('anesthesia.patientDetail.pdfGenerated'),
        description: result.hasWarnings 
          ? t('anesthesia.patientDetail.pdfGeneratedWithWarnings')
          : t('anesthesia.patientDetail.pdfGeneratedSuccess'),
      });
    } else {
      toast({
        title: t('anesthesia.patientDetail.errorGeneratingPDF'),
        description: result.error || t('anesthesia.patientDetail.errorGeneratingPDFDesc'),
        variant: "destructive",
      });
    }
  };

  // Handle dialog close and navigation
  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        // Determine the appropriate list page based on current mode
        let fallbackPath = '/anesthesia/op';
        if (isSurgeryMode) {
          fallbackPath = '/surgery/op';
        } else if (isPacuMode) {
          fallbackPath = '/anesthesia/pacu';
        }
        
        // Always use direct navigation instead of history.back() to avoid
        // navigation issues when switching between modes (PACU <-> Anesthesia)
        setLocation(fallbackPath);
      }, 100);
    }
  };

  // Close dialog handler
  const handleClose = () => {
    handleDialogChange(false);
  };

  // Get patient weight from preOp assessment
  const patientWeight = preOpAssessment?.weight ? parseFloat(preOpAssessment.weight) : undefined;
  
  // Show weight dialog when data is loaded but weight is missing
  // Show dialog if: (1) no preOp assessment exists, OR (2) preOp assessment exists but has no weight
  // Use ref to track if we've already shown the dialog to prevent reopening after save
  const hasShownWeightDialogRef = useRef(false);
  
  // Reset the ref whenever surgeryId changes (switching between surgeries)
  useEffect(() => {
    hasShownWeightDialogRef.current = false;
  }, [surgeryId]);
  
  useEffect(() => {
    // Only show once per surgery load, and only if we haven't already shown it
    if (!isPreOpLoading && !isPatientLoading && !showWeightDialog && surgeryId && !hasShownWeightDialogRef.current) {
      // Skip weight dialog entirely in surgery mode - weight is only needed for anesthesia
      // (medication dosing calculations, tidal volume, etc.)
      if (isSurgeryMode) {
        console.log('[WEIGHT-DIALOG] Skipping weight dialog - surgery mode does not require weight');
        return;
      }
      // Show if no preOp assessment OR preOp assessment exists without weight
      const shouldShow = !preOpAssessment || (preOpAssessment && !patientWeight);
      if (shouldShow) {
        console.log('[WEIGHT-DIALOG] Opening weight dialog - preOp missing or weight missing');
        setShowWeightDialog(true);
        hasShownWeightDialogRef.current = true; // Mark as shown
      }
    }
  }, [isPreOpLoading, isPatientLoading, preOpAssessment, patientWeight, showWeightDialog, surgeryId, isSurgeryMode]);
  
  // Handle weight save - create preOp assessment if it doesn't exist
  const handleWeightSave = async (weight: string) => {
    if (!surgeryId) return;
    
    try {
      if (preOpAssessment?.id) {
        // Update existing preOp assessment
        await apiRequest('PATCH', `/api/anesthesia/preop/${preOpAssessment.id}`, { weight });
      } else {
        // Create new preOp assessment with weight
        await apiRequest('POST', '/api/anesthesia/preop', {
          surgeryId,
          weight
        });
      }
      
      // Invalidate the preOp assessment query to refetch with new weight
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`] });
      
      setShowWeightDialog(false);
      toast({
        title: t('common.success'),
        description: t('anesthesia.preop.lastSaved'),
      });
    } catch (error) {
      console.error('Failed to save weight:', error);
      toast({
        variant: "destructive",
        title: t('common.error'),
        description: t('anesthesia.op.errorSaving'),
      });
    }
  };

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

  // Show loading state while initial data is loading or duplicate check is pending
  // Wait for duplicate check to complete first, then load record data
  const isWaitingForDuplicateCheck = needsDuplicateCheck && !duplicateCheckComplete && !showDuplicatesDialog;
  const isLoadingTimeline = anesthesiaRecord?.id && (isVitalsLoading || isMedicationsLoading || isEventsLoading);
  
  if (isWaitingForDuplicateCheck || isSurgeryLoading || isPreOpLoading || isPatientLoading || isRecordLoading || isLoadingTimeline) {
    return (
      <Dialog open={isOpen} onOpenChange={handleDialogChange}>
        <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col items-center justify-center [&>button]:hidden">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-lg font-medium">{t('anesthesia.op.loading')}</p>
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
    {/* Duplicate Records Dialog - shown if multiple anesthesia records exist for this surgery */}
    <DuplicateRecordsDialog
      open={showDuplicatesDialog}
      onOpenChange={setShowDuplicatesDialog}
      records={duplicateRecords}
      surgeryId={surgeryId || ""}
      onSelectRecord={handleSelectDuplicateRecord}
      onRefresh={handleRefreshDuplicates}
    />
    
    {/* Patient Weight Dialog - shown on load if weight is missing */}
    <PatientWeightDialog
      open={showWeightDialog}
      patientName={patient ? `${patient.surname}, ${patient.firstName}` : undefined}
      onSave={handleWeightSave}
    />
    
    {/* Camera Connection Dialog */}
    <CameraConnectionDialog
      open={showCameraDialog}
      onOpenChange={setShowCameraDialog}
      cameraDevices={cameraDevices}
      isLoadingDevices={isCameraDevicesLoading}
      currentCameraDeviceId={anesthesiaRecord?.cameraDeviceId || null}
      autoCaptureEnabled={anesthesiaRecord?.autoCaptureEnabled || false}
      onSave={handleSaveCameraSettings}
      isSaving={isSavingCamera}
    />
    
    {/* Unified Anesthesia Sets Dialog */}
    {activeHospital?.id && (
      <UnifiedAnesthesiaSetsDialog
        open={showSetsDialog}
        onOpenChange={setShowSetsDialog}
        hospitalId={activeHospital.id}
        recordId={anesthesiaRecord?.id}
        isAdmin={activeHospital?.role === 'admin' || activeHospital?.canConfigure === true}
        onSetApplied={() => {
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/medications/${anesthesiaRecord?.id}`] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecord?.id, 'imported-medications'] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecord?.id] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecord?.id] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/installations', anesthesiaRecord?.id] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${anesthesiaRecord?.id}/airway`] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${anesthesiaRecord?.id}/general-technique`] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${anesthesiaRecord?.id}/neuraxial-blocks`] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/${anesthesiaRecord?.id}/peripheral-blocks`] });
        }}
      />
    )}

    {/* Surgery Sets Dialog */}
    {activeHospital?.id && isSurgeryMode && (
      <SurgerySetsDialog
        open={showSurgerySetsDialog}
        onOpenChange={setShowSurgerySetsDialog}
        hospitalId={activeHospital.id}
        recordId={anesthesiaRecord?.id}
        isAdmin={activeHospital?.role === 'admin' || activeHospital?.canConfigure === true}
        onSetApplied={async () => {
          await queryClient.refetchQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecord?.id] });
        }}
      />
    )}
    
    <Dialog open={isOpen && !showWeightDialog && !showDuplicatesDialog} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden" aria-describedby="op-dialog-description">
        <h2 className="sr-only" id="op-dialog-title">{isPacuMode ? t('anesthesia.op.pacuMonitor') : t('anesthesia.op.intraoperativeMonitoring')} - {t('anesthesia.op.patient')} {surgery.patientId || t('opCalendar.slotReserved', 'SLOT RESERVED')}</h2>
        <p className="sr-only" id="op-dialog-description">{isPacuMode ? 'Post-anesthesia care unit monitoring system' : 'Professional anesthesia monitoring system for tracking vitals, medications, and clinical events during surgery'}</p>
        
        {/* Fixed Patient Info Header */}
        <PatientInfoHeader
          patient={patient}
          surgery={surgery}
          preOpAssessment={preOpAssessment}
          selectedAllergies={selectedAllergies}
          otherAllergies={otherAllergies}
          cave={cave}
          allergyList={anesthesiaSettings?.allergyList || []}
          patientAge={patientAge}
          isPreOpLoading={isPreOpLoading}
          onDownloadPDF={handleDownloadPDF}
          onClose={handleClose}
          onOpenAllergiesDialog={() => setIsAllergiesDialogOpen(true)}
          connectionState={connectionState}
          viewers={viewers}
          onForceReconnect={forceReconnect}
          cameraDeviceName={connectedCameraDevice?.name}
          isCameraConnected={!!anesthesiaRecord?.cameraDeviceId}
          onOpenCameraDialog={!isSurgeryMode ? () => setShowCameraDialog(true) : undefined}
        />

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 mb-4">
              <div className="flex-1 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none' }}>
                <TabsList className="inline-flex w-auto min-w-full">
                  {/* Surgery Module Specific Tabs - Staff first */}
                  {isSurgeryMode && (
                    <>
                      <TabsTrigger value="staff" data-testid="tab-staff" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('surgery.staff.title')}
                      </TabsTrigger>
                      <TabsTrigger value="intraop" data-testid="tab-intraop" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('surgery.opDetail.tabs.intraop')}
                      </TabsTrigger>
                      <TabsTrigger value="countsSterile" data-testid="tab-counts-sterile" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('surgery.opDetail.tabs.countsSterile')}
                      </TabsTrigger>
                    </>
                  )}

                  {/* Anesthesia Module Specific Tabs */}
                  {!isSurgeryMode && (
                    <>
                      <TabsTrigger value="vitals" data-testid="tab-vitals" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.vitals')}
                      </TabsTrigger>
                      {isPacuMode && (
                        <TabsTrigger value="pacu" data-testid="tab-pacu" className="text-xs sm:text-sm whitespace-nowrap">
                          {t('anesthesia.op.pacu')}
                        </TabsTrigger>
                      )}
                      {!isPacuMode && (
                        <TabsTrigger value="anesthesia" data-testid="tab-anesthesia" className="text-xs sm:text-sm whitespace-nowrap">
                          {t('anesthesia.op.anesthesia')}
                        </TabsTrigger>
                      )}
                      {/* Staff Tab - In anesthesia module after main tabs */}
                      <TabsTrigger value="staff" data-testid="tab-staff" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('surgery.staff.title')}
                      </TabsTrigger>
                    </>
                  )}

                  {/* Surgery Module: Inventory before Checklists */}
                  {isSurgeryMode && (
                    <>
                      <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.inventory')}
                      </TabsTrigger>
                      <TabsTrigger value="checklists" data-testid="tab-checklists" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.checklists')}
                      </TabsTrigger>
                      <TabsTrigger value="preop" data-testid="tab-preop" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.preOp')}
                      </TabsTrigger>
                    </>
                  )}

                  {/* Anesthesia Module: Checklists before Inventory (original order) */}
                  {!isSurgeryMode && (
                    <>
                      {!isPacuMode && (
                        <TabsTrigger value="checklists" data-testid="tab-checklists" className="text-xs sm:text-sm whitespace-nowrap">
                          {t('anesthesia.op.checklists')}
                        </TabsTrigger>
                      )}
                      <TabsTrigger value="preop" data-testid="tab-preop" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.preOp')}
                      </TabsTrigger>
                      <TabsTrigger value="inventory" data-testid="tab-inventory" className="text-xs sm:text-sm whitespace-nowrap">
                        {t('anesthesia.op.inventory')}
                      </TabsTrigger>
                      {!isPacuMode && (
                        <TabsTrigger value="postop" data-testid="tab-postop" className="text-xs sm:text-sm whitespace-nowrap">
                          {t('anesthesia.op.postOp')}
                        </TabsTrigger>
                      )}
                    </>
                  )}
                </TabsList>
              </div>
              {/* Mode Toggle - Only visible in anesthesia module when X2 is set */}
              {!isSurgeryMode && hasX2Marker && !hasPMarker && (
                <Button 
                  variant={isPacuMode ? "default" : "outline"}
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                  data-testid="button-toggle-mode"
                  onClick={handleModeToggle}
                >
                  {isPacuMode ? (
                    <>
                      <ToggleRight className="h-4 w-4" />
                      <span className="hidden sm:inline">{pacuBedName || t('anesthesia.timeline.pacuDividerLabel', 'PACU')}</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">OP</span>
                    </>
                  )}
                </Button>
              )}
              {!isSurgeryMode && !isPacuMode && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                  data-testid="button-open-sets"
                  onClick={() => setShowSetsDialog(true)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('anesthesia.sets.buttonLabel', 'Sets')}</span>
                </Button>
              )}
              {isSurgeryMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                  data-testid="button-open-surgery-sets"
                  onClick={() => setShowSurgerySetsDialog(true)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('surgery.sets.title', 'Sets')}</span>
                </Button>
              )}
              {!isSurgeryMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                  data-testid="button-toggle-events"
                  onClick={() => {
                    setActiveTab("vitals");
                    setOpenEventsPanel(true);
                  }}
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('anesthesia.op.events')}</span>
                </Button>
              )}
            </div>
          </div>

          {/* Vitals & Timeline Tab - forceMount keeps state when switching tabs */}
          <TabsContent value="vitals" forceMount className="data-[state=active]:flex-1 overflow-y-auto flex flex-col mt-0 px-0 data-[state=inactive]:hidden" data-testid="tab-content-vitals">
            <div className="border-t bg-card">
              {(isVitalsLoading || isMedicationsLoading || isEventsLoading) ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <UnifiedTimeline
                  ref={timelineRef}
                  data={timelineData}
                  now={new Date().getTime()}
                  patientWeight={patientWeight}
                  anesthesiaRecordId={anesthesiaRecord?.id}
                  anesthesiaRecord={anesthesiaRecord}
                  openEventsPanel={openEventsPanel}
                  onEventsPanelChange={setOpenEventsPanel}
                  isPacuMode={isPacuMode}
                  patientData={patient ? { birthday: (patient as any).birthday, sex: (patient as any).sex } : null}
                  patientCovariateData={{ weight: (preOpAssessment as any)?.weight ?? null, height: (preOpAssessment as any)?.height ?? null }}
                  plannedTaskEvents={
                    (postopOrderSet.data?.plannedEvents ?? [])
                      .filter(e => e.kind === 'task' || e.kind === 'iv_fluid')
                      .map(e => ({
                        id: e.id,
                        plannedAt: new Date(e.plannedAt).getTime(),
                        plannedEndAt: e.plannedEndAt ? new Date(e.plannedEndAt).getTime() : null,
                        title: (() => {
                          const snap = e.payloadSnapshot as any;
                          if (snap?.title) return snap.title as string;
                          if (snap?.type === 'lab') return `Labor \u2014 ${(snap.panel || []).join(', ')}`;
                          if (snap?.type === 'iv_fluid') return `${snap.solution} ${snap.volumeMl}ml`;
                          return (snap?.type as string) ?? 'Task';
                        })(),
                        status: e.status,
                      }))
                  }
                  onSaveCovariates={async (data) => {
                    if (!surgeryId) return;
                    const payload: Record<string, string> = {};
                    if (data.weight) payload.weight = data.weight;
                    if (data.height) payload.height = data.height;
                    if (preOpAssessment?.id) {
                      await apiRequest('PATCH', `/api/anesthesia/preop/${preOpAssessment.id}`, payload);
                    } else {
                      await apiRequest('POST', '/api/anesthesia/preop', { surgeryId, ...payload });
                    }
                    queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/surgery/${surgeryId}`] });
                  }}
                />
              )}
            </div>
          </TabsContent>

          {/* PACU Documentation Tab - Only visible in PACU mode */}
          {isPacuMode && (
            <TabsContent value="pacu" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 space-y-4" data-testid="tab-content-pacu">
              {/* Top row: Bed square + Orders at a glance */}
              <div className="flex gap-4 items-start">
                <PacuBedSquare
                  surgeryId={surgeryId}
                  pacuBedName={pacuBedName}
                  pacuBedId={surgery?.pacuBedId}
                />
                <div className="flex-1">
                  <OrdersGlanceCard
                    items={postopOrderSet.data?.orderSet.items ?? []}
                    templateName={postopTemplates.data?.find(t => t.id === postopOrderSet.data?.orderSet.templateId)?.name ?? null}
                    onEdit={() => setOrderEditorOpen(true)}
                    canEdit={!anesthesiaRecord?.isLocked}
                  />
                </div>
              </div>

              {/* Legacy postop info from anesthesia record */}
              {(postOpData.postOpDestination || postOpData.postOpNotes || postOpData.complications) && (
                <Card>
                  <CardContent className="py-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-sm">
                    {postOpData.postOpDestination && (
                      <div><span className="text-muted-foreground">Destination: </span><span className="font-medium">{postOpData.postOpDestination.toUpperCase()}</span></div>
                    )}
                    {postOpData.postOpNotes && (
                      <div className="col-span-2"><span className="text-muted-foreground">Notes: </span><span>{postOpData.postOpNotes}</span></div>
                    )}
                    {postOpData.complications && (
                      <div className="col-span-2"><span className="text-muted-foreground">Complications: </span><span className="text-destructive">{postOpData.complications}</span></div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Bottom row: Tasks panel + Intraop meds */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <PostopTasksPanel
                  items={postopOrderSet.data?.orderSet.items ?? []}
                  plannedEvents={postopOrderSet.data?.plannedEvents ?? []}
                  now={Date.now()}
                  onMarkDone={(eventId) => postopOrderSet.markDone.mutate(eventId)}
                />
                <IntraoperativeMedicationsCard
                  medications={medicationsData || []}
                  items={inventoryItems || []}
                  patientWeight={patientWeight}
                />
              </div>

              {/* Order set editor dialog */}
              <OrderSetEditorDialog
                open={orderEditorOpen}
                onOpenChange={setOrderEditorOpen}
                initial={{
                  items: postopOrderSet.data?.orderSet.items ?? [],
                  templateId: postopOrderSet.data?.orderSet.templateId ?? null,
                }}
                templates={postopTemplates.data ?? []}
                onSave={(payload) => postopOrderSet.save.mutate(payload)}
              />
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
                        <CardTitle className="text-lg">{t('anesthesia.op.installations')}</CardTitle>
                        {installationsData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-installations-status">
                            <CheckCircle className="h-3 w-3" />
                            {installationsData.length} {installationsData.length === 1 ? t('anesthesia.op.entry') : t('anesthesia.op.entries')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-installations-status">
                            <MinusCircle className="h-3 w-3" />
                            {t('anesthesia.op.noData')}
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
                        <CardTitle className="text-lg">{t('anesthesia.op.generalAnesthesia')}</CardTitle>
                        {(() => {
                          // Check if there's meaningful data
                          const hasGeneralData = generalTechniqueData?.approach || generalTechniqueData?.rsi;
                          const hasAirwayData = airwayManagementData?.airwayDevice || 
                                              airwayManagementData?.size || 
                                              airwayManagementData?.depth || 
                                              airwayManagementData?.cuffPressure ||
                                              airwayManagementData?.laryngoscopeType ||
                                              airwayManagementData?.difficultAirway;
                          
                          if (hasGeneralData || hasAirwayData) {
                            return (
                              <Badge variant="default" className="ml-2 gap-1" data-testid="badge-general-status">
                                <CheckCircle className="h-3 w-3" />
                                {t('anesthesia.op.configured')}
                              </Badge>
                            );
                          }
                          
                          return (
                            <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-general-status">
                              <MinusCircle className="h-3 w-3" />
                              {t('anesthesia.op.noData')}
                            </Badge>
                          );
                        })()}
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
                        <CardTitle className="text-lg">{t('anesthesia.op.neuraxialAnesthesia')}</CardTitle>
                        {neuraxialBlocksData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-neuraxial-status">
                            <CheckCircle className="h-3 w-3" />
                            {neuraxialBlocksData.length} {neuraxialBlocksData.length === 1 ? t('anesthesia.op.block') : t('anesthesia.op.blocks')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-neuraxial-status">
                            <MinusCircle className="h-3 w-3" />
                            {t('anesthesia.op.noData')}
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
                        <CardTitle className="text-lg">{t('anesthesia.op.peripheralRegionalAnesthesia')}</CardTitle>
                        {peripheralBlocksData.length > 0 ? (
                          <Badge variant="default" className="ml-2 gap-1" data-testid="badge-peripheral-status">
                            <CheckCircle className="h-3 w-3" />
                            {peripheralBlocksData.length} {peripheralBlocksData.length === 1 ? t('anesthesia.op.block') : t('anesthesia.op.blocks')}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="ml-2 gap-1" data-testid="badge-peripheral-status">
                            <MinusCircle className="h-3 w-3" />
                            {t('anesthesia.op.noData')}
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
              <PreOpOverview 
                surgeryId={surgeryId!} 
                hospitalId={activeHospital?.id}
                patientId={patient?.id}
                patientName={patient ? `${patient.surname}, ${patient.firstName}` : undefined}
                patientEmail={patient?.email}
                patientPhone={patient?.phone}
              />
            )}
          </TabsContent>

          {/* Inventory Tab - Shared between modules, shows unit-specific items */}
          <TabsContent value="inventory" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-inventory">
            <OpInventory 
              anesthesiaRecord={anesthesiaRecord}
              inventoryUsage={inventoryUsage}
              inventoryCommits={inventoryCommits}
              inventoryItems={inventoryItems}
              onNavigateToInventoryTab={() => setActiveTab("inventory")}
              onClearA3Marker={handleClearA3Marker}
              activeModule={activeModule}
            />
          </TabsContent>

          {/* Staff Tab - Shared between modules (visible in all modes including PACU) */}
          <TabsContent value="staff" className="flex-1 overflow-y-auto px-6 pb-6 mt-0" data-testid="tab-content-staff">
            <StaffTab
              anesthesiaRecordId={anesthesiaRecord?.id}
              hospitalId={activeHospital?.id}
              anesthesiaUnitId={anesthesiaRecord?.anesthesiaUnitId}
              surgeryId={surgeryId}
              readOnly={!!anesthesiaRecord?.isLocked}
            />
          </TabsContent>

          {/* Checklists Tab - Only shown in OP mode */}
          {!isPacuMode && (
            <TabsContent value="checklists" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-checklists">
              <div className="space-y-4">
                <WHOChecklistCard
                  title={t('anesthesia.op.signIn')}
                  icon={ClipboardList}
                  checklistType="signIn"
                  items={anesthesiaSettings?.checklistItems?.signIn || []}
                  checklist={signInState.checklist}
                  notes={signInState.notes}
                  signature={signInState.signature}
                  saveStatus={signInState.saveStatus}
                  onChecklistChange={signInState.setChecklist}
                  onNotesChange={signInState.setNotes}
                  onSignatureChange={signInState.setSignature}
                  onShowSignaturePad={() => signInState.setShowSignaturePad(true)}
                />
                
                <WHOChecklistCard
                  title={t('anesthesia.op.timeOut')}
                  icon={Clock}
                  checklistType="timeOut"
                  items={anesthesiaSettings?.checklistItems?.timeOut || []}
                  checklist={timeOutState.checklist}
                  notes={timeOutState.notes}
                  signature={timeOutState.signature}
                  saveStatus={timeOutState.saveStatus}
                  onChecklistChange={timeOutState.setChecklist}
                  onNotesChange={timeOutState.setNotes}
                  onSignatureChange={timeOutState.setSignature}
                  onShowSignaturePad={() => timeOutState.setShowSignaturePad(true)}
                />
                
                <WHOChecklistCard
                  title={t('anesthesia.op.signOut')}
                  icon={FileCheck}
                  checklistType="signOut"
                  items={anesthesiaSettings?.checklistItems?.signOut || []}
                  checklist={signOutState.checklist}
                  notes={signOutState.notes}
                  signature={signOutState.signature}
                  saveStatus={signOutState.saveStatus}
                  onChecklistChange={signOutState.setChecklist}
                  onNotesChange={signOutState.setNotes}
                  onSignatureChange={signOutState.setSignature}
                  onShowSignaturePad={() => signOutState.setShowSignaturePad(true)}
                />
              </div>
            </TabsContent>
          )}

          {/* Post-op Tab - Only shown in OP mode */}
          {!isPacuMode && (
            <TabsContent value="postop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-postop">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('anesthesia.op.postOperativeInformation')}</CardTitle>
                {postOpAutoSave.status !== 'idle' && (
                  <Badge variant={
                    postOpAutoSave.status === 'saving' ? 'secondary' :
                    postOpAutoSave.status === 'saved' ? 'default' : 'destructive'
                  } data-testid="badge-postop-status">
                    {postOpAutoSave.status === 'saving' && t('anesthesia.op.saving')}
                    {postOpAutoSave.status === 'saved' && t('anesthesia.op.saved')}
                    {postOpAutoSave.status === 'error' && t('anesthesia.op.errorSaving')}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Destination */}
                <div className="space-y-2">
                  <Label htmlFor="postop-destination">{t('anesthesia.op.destination')}</Label>
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
                      <SelectValue placeholder={t('anesthesia.op.selectDestination')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pacu">{t('anesthesia.op.destinationPacu')}</SelectItem>
                      <SelectItem value="icu">{t('anesthesia.op.destinationIcu')}</SelectItem>
                      <SelectItem value="ward">{t('anesthesia.op.destinationWard')}</SelectItem>
                      <SelectItem value="home">{t('anesthesia.op.destinationHome')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Post-Operative Notes */}
                <div className="space-y-2">
                  <Label htmlFor="postop-notes">{t('anesthesia.op.postOperativeNotes')}</Label>
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

                {/* Legacy fields — collapsed by default, superseded by order-set system */}
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-1">
                    <ChevronRight className="w-4 h-4 transition-transform [[data-state=open]>&]:rotate-90" />
                    {t('postopOrders.legacyFields', 'Medication Timing / PONV / Ambulatory (legacy)')}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-2">

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
                        <span className="text-sm">{t('anesthesia.op.immediately')}</span>
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
                        <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="paracetamol"
                            value="custom"
                            checked={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" && !!postOpData.paracetamolTime}
                            onChange={() => {
                              const inputEl = document.querySelector('[data-testid="input-paracetamol-time"]') as HTMLInputElement;
                              if (inputEl) {
                                inputEl.focus();
                                if (!postOpData.paracetamolTime || postOpData.paracetamolTime === "Immediately" || postOpData.paracetamolTime === "Contraindicated") {
                                  const updated = { ...postOpData, paracetamolTime: "" };
                                  setPostOpData(updated);
                                }
                              }
                            }}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-paracetamol-custom"
                          />
                          <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
                          value={postOpData.paracetamolTime !== "Immediately" && postOpData.paracetamolTime !== "Contraindicated" ? (postOpData.paracetamolTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPostOpData({ ...postOpData, paracetamolTime: value });
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            let formatted = value;
                            
                            if (value && value !== "Immediately" && value !== "Contraindicated") {
                              const digitsOnly = value.replace(/\D/g, '');
                              
                              if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                                const hours = parseInt(digitsOnly, 10);
                                if (hours >= 0 && hours <= 23) {
                                  formatted = `${hours.toString().padStart(2, '0')}:00`;
                                }
                              } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                                const hours = parseInt(digitsOnly.slice(0, -2), 10);
                                const minutes = parseInt(digitsOnly.slice(-2), 10);
                                if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                                  formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                }
                              }
                            }
                            
                            const updated = { ...postOpData, paracetamolTime: formatted };
                            setPostOpData(updated);
                            if (formatted) {
                              postOpAutoSave.mutate(updated);
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
                        <span className="text-sm">{t('anesthesia.op.immediately')}</span>
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
                        <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="nsar"
                            value="custom"
                            checked={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" && !!postOpData.nsarTime}
                            onChange={() => {
                              const inputEl = document.querySelector('[data-testid="input-nsar-time"]') as HTMLInputElement;
                              if (inputEl) {
                                inputEl.focus();
                                if (!postOpData.nsarTime || postOpData.nsarTime === "Immediately" || postOpData.nsarTime === "Contraindicated") {
                                  const updated = { ...postOpData, nsarTime: "" };
                                  setPostOpData(updated);
                                }
                              }
                            }}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-nsar-custom"
                          />
                          <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
                          value={postOpData.nsarTime !== "Immediately" && postOpData.nsarTime !== "Contraindicated" ? (postOpData.nsarTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPostOpData({ ...postOpData, nsarTime: value });
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            let formatted = value;
                            
                            if (value && value !== "Immediately" && value !== "Contraindicated") {
                              const digitsOnly = value.replace(/\D/g, '');
                              
                              if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                                const hours = parseInt(digitsOnly, 10);
                                if (hours >= 0 && hours <= 23) {
                                  formatted = `${hours.toString().padStart(2, '0')}:00`;
                                }
                              } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                                const hours = parseInt(digitsOnly.slice(0, -2), 10);
                                const minutes = parseInt(digitsOnly.slice(-2), 10);
                                if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                                  formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                }
                              }
                            }
                            
                            const updated = { ...postOpData, nsarTime: formatted };
                            setPostOpData(updated);
                            if (formatted) {
                              postOpAutoSave.mutate(updated);
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
                        <span className="text-sm">{t('anesthesia.op.immediately')}</span>
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
                        <span className="text-sm">{t('anesthesia.op.contraindicated')}</span>
                      </label>
                      <div className="flex items-center space-x-2">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="radio"
                            name="novalgin"
                            value="custom"
                            checked={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" && !!postOpData.novalginTime}
                            onChange={() => {
                              const inputEl = document.querySelector('[data-testid="input-novalgin-time"]') as HTMLInputElement;
                              if (inputEl) {
                                inputEl.focus();
                                if (!postOpData.novalginTime || postOpData.novalginTime === "Immediately" || postOpData.novalginTime === "Contraindicated") {
                                  const updated = { ...postOpData, novalginTime: "" };
                                  setPostOpData(updated);
                                }
                              }
                            }}
                            disabled={!anesthesiaRecord?.id}
                            data-testid="radio-novalgin-custom"
                          />
                          <span className="text-sm">{t('anesthesia.op.startingFrom')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
                          value={postOpData.novalginTime !== "Immediately" && postOpData.novalginTime !== "Contraindicated" ? (postOpData.novalginTime || "") : ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPostOpData({ ...postOpData, novalginTime: value });
                          }}
                          onBlur={(e) => {
                            const value = e.target.value.trim();
                            let formatted = value;
                            
                            if (value && value !== "Immediately" && value !== "Contraindicated") {
                              const digitsOnly = value.replace(/\D/g, '');
                              
                              if (digitsOnly.length === 1 || digitsOnly.length === 2) {
                                const hours = parseInt(digitsOnly, 10);
                                if (hours >= 0 && hours <= 23) {
                                  formatted = `${hours.toString().padStart(2, '0')}:00`;
                                }
                              } else if (digitsOnly.length === 3 || digitsOnly.length === 4) {
                                const hours = parseInt(digitsOnly.slice(0, -2), 10);
                                const minutes = parseInt(digitsOnly.slice(-2), 10);
                                if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                                  formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                                }
                              }
                            }
                            
                            const updated = { ...postOpData, novalginTime: formatted };
                            setPostOpData(updated);
                            if (formatted) {
                              postOpAutoSave.mutate(updated);
                            }
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid="input-novalgin-time"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* PONV Prophylaxis */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">{t('anesthesia.op.ponvProphylaxis')}</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { id: 'ondansetron', label: t('anesthesia.op.ondansetron') },
                      { id: 'droperidol', label: t('anesthesia.op.droperidol') },
                      { id: 'haloperidol', label: t('anesthesia.op.haloperidol') },
                      { id: 'dexamethasone', label: t('anesthesia.op.dexamethasone') },
                    ].map((med) => (
                      <div key={med.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ponv-${med.id}`}
                          checked={postOpData.ponvProphylaxis?.[med.id as keyof typeof postOpData.ponvProphylaxis] ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...postOpData,
                              ponvProphylaxis: {
                                ...postOpData.ponvProphylaxis,
                                [med.id]: checked === true
                              }
                            };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid={`checkbox-ponv-${med.id}`}
                        />
                        <Label htmlFor={`ponv-${med.id}`} className="text-sm">{med.label}</Label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Ambulatory Care Instructions */}
                <div className="space-y-4">
                  <h4 className="text-sm font-medium">{t('anesthesia.op.ambulatoryCareInstructions')}</h4>
                  <div className="space-y-3">
                    {([
                      { id: 'repeatAntibioticAfter4h' as const, label: t('anesthesia.op.repeatAntibioticAfter4h') },
                      { id: 'osasObservation' as const, label: t('anesthesia.op.osasObservation') },
                      { id: 'escortRequired' as const, label: t('anesthesia.op.escortRequired') },
                      { id: 'postBlockMotorCheck' as const, label: t('anesthesia.op.postBlockMotorCheck') },
                      { id: 'extendedObservation' as const, label: t('anesthesia.op.extendedObservation') },
                      { id: 'noOralAnticoagulants24h' as const, label: t('anesthesia.op.noOralAnticoagulants24h') },
                    ] as const).map((item) => (
                      <div key={item.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`ambulatory-${item.id}`}
                          checked={postOpData.ambulatoryCare?.[item.id] === true}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...postOpData,
                              ambulatoryCare: {
                                ...postOpData.ambulatoryCare,
                                [item.id]: checked === true
                              }
                            };
                            setPostOpData(updated);
                            postOpAutoSave.mutate(updated);
                          }}
                          disabled={!anesthesiaRecord?.id}
                          data-testid={`checkbox-ambulatory-${item.id}`}
                        />
                        <Label htmlFor={`ambulatory-${item.id}`} className="text-sm">{item.label}</Label>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ambulatory-notes">{t('anesthesia.op.ambulatoryCareNotes')}</Label>
                    <Textarea
                      id="ambulatory-notes"
                      rows={2}
                      placeholder=""
                      value={postOpData.ambulatoryCare?.notes || ""}
                      onChange={(e) => {
                        const updated = {
                          ...postOpData,
                          ambulatoryCare: {
                            ...postOpData.ambulatoryCare,
                            notes: e.target.value
                          }
                        };
                        setPostOpData(updated);
                        postOpAutoSave.mutate(updated);
                      }}
                      disabled={!anesthesiaRecord?.id}
                      data-testid="textarea-ambulatory-notes"
                    />
                  </div>
                </div>

                  </CollapsibleContent>
                </Collapsible>

                {/* Intraoperative Complications - moved to end */}
                <div className="space-y-2">
                  <Label htmlFor="complications">{t('anesthesia.op.intraoperativeComplications')}</Label>
                  <Textarea
                    id="complications"
                    rows={3}
                    placeholder=""
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
              </CardContent>
            </Card>

            {/* Postoperative Orders (order-set editor) */}
            <OrdersGlanceCard
              items={postopOrderSet.data?.orderSet.items ?? []}
              templateName={postopTemplates.data?.find(tp => tp.id === postopOrderSet.data?.orderSet.templateId)?.name ?? null}
              onEdit={() => setOrderEditorOpen(true)}
              canEdit={!anesthesiaRecord?.isLocked}
            />
            <OrderSetEditorDialog
              open={orderEditorOpen}
              onOpenChange={setOrderEditorOpen}
              initial={{
                items: postopOrderSet.data?.orderSet.items ?? [],
                templateId: postopOrderSet.data?.orderSet.templateId ?? null,
              }}
              templates={postopTemplates.data ?? []}
              onSave={(payload) => postopOrderSet.save.mutate(payload)}
            />
          </TabsContent>
          )}

          {/* Surgery Module Tab Contents */}
          {isSurgeryMode && (
            <>
              {/* Intraoperative Tab */}
              <TabsContent value="intraop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-3 mt-0" data-testid="tab-content-intraop">
                <IntraOpTab
                  surgeryId={surgeryId!}
                  anesthesiaRecordId={anesthesiaRecord?.id}
                  surgery={surgery}
                  anesthesiaRecord={anesthesiaRecord}
                  t={t}
                />
              </TabsContent>
              
              {/* Counts & Sterile Goods Tab (Combined) */}
              <TabsContent value="countsSterile" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-counts-sterile">
                <CountsSterileTab
                  surgeryId={surgeryId || ""}
                  anesthesiaRecordId={anesthesiaRecord?.id}
                  anesthesiaRecord={anesthesiaRecord}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Allergies & CAVE Edit Dialog */}
    {isAllergiesDialogOpen && (
      <AllergiesDialog
        open={isAllergiesDialogOpen}
        onOpenChange={setIsAllergiesDialogOpen}
        patientId={patient?.id}
        currentAllergies={selectedAllergies}
        currentOtherAllergies={otherAllergies}
        currentCave={cave}
        allergyOptions={anesthesiaSettings?.allergyList || []}
        preOpAssessmentId={preOpAssessment?.id}
        surgeryId={surgeryId}
        onSaved={(data) => {
          setSelectedAllergies(data.allergies);
          setOtherAllergies(data.otherAllergies);
          setCave(data.cave);
        }}
      />
    )}

    {/* SignaturePad Modals */}
    <SignaturePad
      isOpen={signInState.showSignaturePad}
      onClose={() => signInState.setShowSignaturePad(false)}
      onSave={(signature) => {
        signInState.setSignature(signature);
        signInState.setShowSignaturePad(false);
      }}
      title="Sign In Signature"
    />

    <SignaturePad
      isOpen={timeOutState.showSignaturePad}
      onClose={() => timeOutState.setShowSignaturePad(false)}
      onSave={(signature) => {
        timeOutState.setSignature(signature);
        timeOutState.setShowSignaturePad(false);
      }}
      title="Time Out Signature"
    />

    <SignaturePad
      isOpen={signOutState.showSignaturePad}
      onClose={() => signOutState.setShowSignaturePad(false)}
      onSave={(signature) => {
        signOutState.setSignature(signature);
        signOutState.setShowSignaturePad(false);
      }}
      title="Sign Out Signature"
    />
    </>
  );
}
