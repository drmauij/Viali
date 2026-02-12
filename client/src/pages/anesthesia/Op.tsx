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
import { PostOpInfoCard } from "@/components/anesthesia/PostOpInfoCard";
import { PacuBedSelector, PacuBedSquare } from "@/components/anesthesia/PacuBedSelector";
import { StaffTab } from "@/components/anesthesia/StaffTab";
import { MedicationScheduleCard } from "@/components/anesthesia/MedicationScheduleCard";
import { IntraoperativeMedicationsCard } from "@/components/anesthesia/IntraoperativeMedicationsCard";
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
import SignaturePad from "@/components/SignaturePad";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAutoSaveMutation } from "@/hooks/useAutoSaveMutation";
import { useDebouncedAutoSave } from "@/hooks/useDebouncedAutoSave";
import { useSocket } from "@/contexts/SocketContext";
import { Minus, Folder, Package, Loader2, MapPin, FileText, AlertTriangle, Pill, Upload } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
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
  BedDouble,
  Layers,
  Camera,
  Image,
  ToggleLeft,
  ToggleRight
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
  
  // Staff popover state for performedBy field
  const [openStaffPopover, setOpenStaffPopover] = useState<string | null>(null);
  const [staffSearchInput, setStaffSearchInput] = useState("");
  
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
  
  // Fetch surgery nurses and doctors for performedBy disinfection field
  // Surgeons sometimes perform disinfection themselves, so include both roles
  const { data: disinfectionStaff = [] } = useQuery<{ id: string; name: string; role: string }[]>({
    queryKey: [`/api/hospitals/${activeHospital?.id}/users-by-module`, 'surgery', 'disinfection-staff'],
    queryFn: async () => {
      // Fetch both nurses and doctors in parallel
      const [nursesRes, doctorsRes] = await Promise.all([
        fetch(`/api/hospitals/${activeHospital?.id}/users-by-module?module=surgery&role=nurse`, { credentials: 'include' }),
        fetch(`/api/hospitals/${activeHospital?.id}/users-by-module?module=surgery&role=doctor`, { credentials: 'include' }),
      ]);
      
      const nurses = nursesRes.ok ? await nursesRes.json() : [];
      const doctors = doctorsRes.ok ? await doctorsRes.json() : [];
      
      // Combine and deduplicate by id
      const combined = [...nurses, ...doctors];
      const seen = new Set<string>();
      return combined.filter((u: any) => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      }).sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));
    },
    enabled: !!activeHospital?.id && isSurgeryMode,
  });

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
            await apiRequest("POST", "/api/anesthesia/records", {
              surgeryId: surgeryId,
            });
            
            // Invalidate to refetch the newly created record
            queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
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
            timestamp: new Date().toISOString(),
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
  
  // Temporary state for dialog editing
  const [tempSelectedAllergies, setTempSelectedAllergies] = useState<string[]>([]);
  const [tempOtherAllergies, setTempOtherAllergies] = useState("");
  const [tempCave, setTempCave] = useState("");

  // Sterile items state
  const [showAddSterileItemDialog, setShowAddSterileItemDialog] = useState(false);
  const [sterileItems, setSterileItems] = useState<Array<{id: string; name: string; lotNumber: string; quantity: number}>>([]);
  
  // Signature pad dialogs for surgery module
  const [showIntraOpSignaturePad, setShowIntraOpSignaturePad] = useState<'circulating' | 'instrument' | null>(null);
  const [showCountsSterileSignaturePad, setShowCountsSterileSignaturePad] = useState<'instrumenteur' | 'circulating' | null>(null);
  
  // Sticker documentation state
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const stickerFileInputRef = useRef<HTMLInputElement>(null);
  const [newSterileItemName, setNewSterileItemName] = useState("");
  const [newSterileItemLot, setNewSterileItemLot] = useState("");
  const [newSterileItemQty, setNewSterileItemQty] = useState(1);
  const [sterileDocMode, setSterileDocMode] = useState<'items' | 'photo'>('items');

  const handleAddSterileItem = () => {
    if (!newSterileItemName.trim()) return;
    
    const newItem = {
      id: `sterile-${Date.now()}`,
      name: newSterileItemName.trim(),
      lotNumber: newSterileItemLot.trim(),
      quantity: newSterileItemQty
    };
    
    const updatedItems = [...sterileItems, newItem];
    setSterileItems(updatedItems);
    
    // Also update countsSterileData and auto-save
    const updated = {
      ...countsSterileData,
      sterileItems: updatedItems
    };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);
    
    setNewSterileItemName("");
    setNewSterileItemLot("");
    setNewSterileItemQty(1);
    setShowAddSterileItemDialog(false);
  };

  const handleRemoveSterileItem = (id: string) => {
    const updatedItems = sterileItems.filter(item => item.id !== id);
    setSterileItems(updatedItems);
    
    // Also update countsSterileData and auto-save
    const updated = {
      ...countsSterileData,
      sterileItems: updatedItems
    };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);
  };

  // State for sticker doc upload progress
  const [stickerUploadProgress, setStickerUploadProgress] = useState<string | null>(null);

  // Handle sticker documentation file upload - uses object storage
  const handleStickerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !anesthesiaRecord?.id) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: t('surgery.sterile.invalidFileType'),
        description: t('surgery.sterile.allowedFormats'),
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 20MB for object storage)
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: t('surgery.sterile.fileTooLarge'),
        description: t('surgery.sterile.maxFileSize'),
        variant: 'destructive',
      });
      return;
    }

    // Reset input early
    if (event.target) {
      event.target.value = '';
    }

    try {
      setStickerUploadProgress('uploading');
      
      // Step 1: Get presigned upload URL from backend
      const urlRes = await fetch(`/api/anesthesia/records/${anesthesiaRecord.id}/sticker-doc/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });

      if (!urlRes.ok) {
        const err = await urlRes.json();
        // Fall back to base64 if object storage not configured
        if (urlRes.status === 503) {
          console.log('Object storage not configured, falling back to base64');
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result as string;
            const newDoc = {
              id: `sticker-${Date.now()}`,
              type: (file.type === 'application/pdf' ? 'pdf' : 'photo') as 'photo' | 'pdf',
              data: base64,
              filename: file.name,
              mimeType: file.type,
              size: file.size,
              createdAt: Date.now(),
              createdBy: user ? getUserDisplayName(user) : undefined,
            };
            const updatedDocs = [...(countsSterileData.stickerDocs || []), newDoc];
            const updated = { ...countsSterileData, stickerDocs: updatedDocs };
            setCountsSterileData(updated);
            countsSterileAutoSave.mutate(updated);
            setStickerUploadProgress(null);
          };
          reader.readAsDataURL(file);
          return;
        }
        throw new Error(err.message || 'Failed to get upload URL');
      }

      const { uploadURL, storageKey } = await urlRes.json();

      // Step 2: Upload file directly to S3
      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });

      if (!uploadRes.ok) {
        throw new Error('Failed to upload file to storage');
      }

      // Step 3: Save metadata with storageKey
      const newDoc = {
        id: `sticker-${Date.now()}`,
        type: (file.type === 'application/pdf' ? 'pdf' : 'photo') as 'photo' | 'pdf',
        storageKey,
        filename: file.name,
        mimeType: file.type,
        size: file.size,
        createdAt: Date.now(),
        createdBy: user ? getUserDisplayName(user) : undefined,
      };

      const updatedDocs = [...(countsSterileData.stickerDocs || []), newDoc];
      const updated = { ...countsSterileData, stickerDocs: updatedDocs };
      setCountsSterileData(updated);
      countsSterileAutoSave.mutate(updated);
      setStickerUploadProgress(null);

      toast({
        title: t('common.success'),
        description: t('surgery.sterile.docUploaded'),
      });
    } catch (error: any) {
      console.error('Sticker doc upload error:', error);
      setStickerUploadProgress(null);
      toast({
        title: t('common.error'),
        description: error.message || t('surgery.sterile.uploadFailed'),
        variant: 'destructive',
      });
    }
  };

  // Handle removing a sticker document
  const handleRemoveStickerDoc = (id: string) => {
    const updatedDocs = (countsSterileData.stickerDocs || []).filter(doc => doc.id !== id);
    const updated = { ...countsSterileData, stickerDocs: updatedDocs };
    setCountsSterileData(updated);
    countsSterileAutoSave.mutate(updated);
  };

  // State for cached sticker doc URLs (for storage-backed docs)
  const [stickerDocUrls, setStickerDocUrls] = useState<Record<string, string>>({});

  // Fetch download URL for storage-backed sticker doc
  const fetchStickerDocUrl = async (docId: string) => {
    if (!anesthesiaRecord?.id || stickerDocUrls[docId]) return;
    
    try {
      const res = await fetch(`/api/anesthesia/records/${anesthesiaRecord.id}/sticker-doc/${docId}/download-url`, {
        credentials: 'include',
      });
      if (res.ok) {
        const { downloadURL } = await res.json();
        setStickerDocUrls(prev => ({ ...prev, [docId]: downloadURL }));
      }
    } catch (error) {
      console.error('Error fetching sticker doc URL:', error);
    }
  };

  // Get display URL for a sticker doc (handles both legacy and storage-backed)
  const getStickerDocSrc = (doc: { id: string; data?: string | null; storageKey?: string | null }) => {
    if (doc.data) return doc.data; // Legacy base64
    if (doc.storageKey && stickerDocUrls[doc.id]) return stickerDocUrls[doc.id]; // Cached storage URL
    return null; // Need to fetch
  };

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
  
  const handleOpenAllergiesDialog = () => {
    setTempSelectedAllergies([...selectedAllergies]);
    setTempOtherAllergies(otherAllergies);
    setTempCave(cave);
    setIsAllergiesDialogOpen(true);
  };
  
  const handleSaveAllergies = async () => {
    try {
      // Update local state
      setSelectedAllergies(tempSelectedAllergies);
      setOtherAllergies(tempOtherAllergies);
      setCave(tempCave);
      
      // Save allergies to patient
      if (patient?.id) {
        await apiRequest('PATCH', `/api/patients/${patient.id}`, {
          allergies: tempSelectedAllergies,
          otherAllergies: tempOtherAllergies,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/patients/${patient.id}`] });
      }
      
      // Save CAVE to preOp assessment
      if (preOpAssessment?.id) {
        await apiRequest('PATCH', `/api/anesthesia/preop/${preOpAssessment.id}`, {
          cave: tempCave,
        });
        queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/preop/${surgeryId}`] });
      }
      
      setIsAllergiesDialogOpen(false);
      toast({
        title: t('common.saved'),
        description: t('anesthesia.op.allergiesSaved'),
      });
    } catch (error) {
      console.error('Error saving allergies/CAVE:', error);
      toast({
        title: t('anesthesia.op.error'),
        description: t('anesthesia.op.errorSaving'),
        variant: 'destructive',
      });
    }
  };

  // Toggle allergy selection in dialog
  const handleToggleAllergy = (allergyId: string) => {
    setTempSelectedAllergies(prev => 
      prev.includes(allergyId) 
        ? prev.filter(id => id !== allergyId)
        : [...prev, allergyId]
    );
  };

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


  // Intraoperative Data state (Surgery module)
  const [intraOpData, setIntraOpData] = useState<{
    positioning?: { RL?: boolean; SL?: boolean; BL?: boolean; SSL?: boolean; EXT?: boolean };
    disinfection?: { kodanColored?: boolean; kodanColorless?: boolean; octanisept?: boolean; betadine?: boolean; performedBy?: string };
    equipment?: { 
      monopolar?: boolean; 
      bipolar?: boolean; 
      neutralElectrodeLocation?: string;
      neutralElectrodeSide?: string;
      pathology?: { histology?: boolean; microbiology?: boolean };
      notes?: string;
      devices?: string;
    };
    irrigationMeds?: {
      irrigation?: string;
      infiltration?: string;
      tumorSolution?: string;
      medications?: string;
      contrast?: string;
      ointments?: string;
    };
    irrigation?: { nacl?: boolean; ringerSolution?: boolean; other?: string };
    infiltration?: { tumorSolution?: boolean; other?: string };
    medications?: { medication?: string; other?: string };
    dressing?: { type?: string; other?: string; redon?: boolean };
    drainage?: { type?: string; count?: number; redonCH?: string; redonCount?: number; other?: string; redon?: boolean };
    signatures?: { circulatingNurse?: string; instrumentNurse?: string };
  }>({});

  // Auto-save mutation for Intra-Op data (debounced to reduce lag)
  const intraOpAutoSave = useDebouncedAutoSave({
    mutationFn: async (data: typeof intraOpData) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/intra-op`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    debounceMs: 800,
  });

  // Counts & Sterile Goods Data state (Surgery module)
  const [countsSterileData, setCountsSterileData] = useState<{
    surgicalCounts?: Array<{ id: string; name: string; count1?: number | null; count2?: number | null; countFinal?: number | null }>;
    sterileItems?: Array<{ id: string; name: string; lotNumber?: string; quantity: number }>;
    sutures?: Record<string, string>;
    stickerDocs?: Array<{ id: string; type: 'photo' | 'pdf'; data?: string | null; storageKey?: string | null; filename?: string; mimeType?: string; size?: number | null; createdAt?: number; createdBy?: string }>;
    signatures?: { instrumenteur?: string; circulating?: string };
  }>({});

  // Auto-save mutation for Counts & Sterile data (debounced to reduce lag)
  const countsSterileAutoSave = useDebouncedAutoSave({
    mutationFn: async (data: typeof countsSterileData) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/counts-sterile`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
    debounceMs: 800,
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

  // Initialize Intra-Op data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    const intraOpValue = (anesthesiaRecord as any).intraOpData || (anesthesiaRecord as any).intra_op_data;
    if (intraOpValue) {
      setIntraOpData(intraOpValue);
    }
  }, [anesthesiaRecord]);

  // Initialize Counts & Sterile data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    const countsSterileValue = (anesthesiaRecord as any).countsSterileData || (anesthesiaRecord as any).counts_sterile_data;
    if (countsSterileValue) {
      setCountsSterileData(countsSterileValue);
      // Sync sterileItems state with data from backend
      if (countsSterileValue.sterileItems) {
        setSterileItems(countsSterileValue.sterileItems);
      }
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
        isAdmin={activeHospital?.role === 'admin'}
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
        isAdmin={activeHospital?.role === 'admin'}
        onSetApplied={() => {
          queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/inventory', anesthesiaRecord?.id] });
          queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`] });
        }}
      />
    )}
    
    <Dialog open={isOpen && !showWeightDialog && !showDuplicatesDialog} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-full h-[100dvh] m-0 p-0 gap-0 flex flex-col [&>button]:hidden" aria-describedby="op-dialog-description">
        <h2 className="sr-only" id="op-dialog-title">{isPacuMode ? t('anesthesia.op.pacuMonitor') : t('anesthesia.op.intraoperativeMonitoring')} - {t('anesthesia.op.patient')} {surgery.patientId}</h2>
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
          onOpenAllergiesDialog={handleOpenAllergiesDialog}
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
              <div className="flex-1 overflow-x-auto">
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
                      <span className="hidden sm:inline">{pacuBedName || 'PACU'}</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="h-4 w-4" />
                      <span className="hidden sm:inline">OP</span>
                    </>
                  )}
                </Button>
              )}
              {!isSurgeryMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex items-center gap-1 sm:gap-2 shrink-0"
                  data-testid="button-open-sets"
                  onClick={() => setShowSetsDialog(true)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('anesthesia.sets.title', 'Sets')}</span>
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
                />
              )}
            </div>
          </TabsContent>

          {/* PACU Documentation Tab - Only visible in PACU mode */}
          {isPacuMode && (
            <TabsContent value="pacu" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 space-y-4" data-testid="tab-content-pacu">
              {/* Two-column layout: Bed square on left, PostOpInfoCard on right */}
              <div className="flex gap-4 items-start">
                {/* Floating bed square on the left */}
                <PacuBedSquare 
                  surgeryId={surgeryId}
                  pacuBedName={pacuBedName}
                  pacuBedId={surgery?.pacuBedId}
                />
                {/* Post-operative information card on the right */}
                <div className="flex-1">
                  <PostOpInfoCard postOpData={postOpData} pacuBedName={pacuBedName} pacuBedId={surgery?.pacuBedId} surgeryId={surgeryId} hideBedSquare />
                </div>
              </div>
              {/* Two-column responsive layout for medication cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MedicationScheduleCard postOpData={postOpData} />
                <IntraoperativeMedicationsCard 
                  medications={medicationsData || []} 
                  items={inventoryItems || []}
                  patientWeight={patientWeight}
                />
              </div>
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
          </TabsContent>
          )}

          {/* Surgery Module Tab Contents */}
          {isSurgeryMode && (
            <>
              {/* Intraoperative Tab */}
              <TabsContent value="intraop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-intraop">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.positioning')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      {[
                        { id: "RL", label: t('surgery.intraop.positions.supine') },
                        { id: "SL", label: t('surgery.intraop.positions.lateral') },
                        { id: "BL", label: t('surgery.intraop.positions.prone') },
                        { id: "SSL", label: t('surgery.intraop.positions.lithotomy') },
                        { id: "EXT", label: t('surgery.intraop.positions.extension') }
                      ].map((pos) => (
                        <div key={pos.id} className="flex items-center space-x-2">
                          <Checkbox 
                            id={`pos-${pos.id}`} 
                            data-testid={`checkbox-position-${pos.id}`}
                            checked={intraOpData.positioning?.[pos.id as keyof typeof intraOpData.positioning] ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                positioning: {
                                  ...intraOpData.positioning,
                                  [pos.id]: checked === true
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor={`pos-${pos.id}`}>{pos.label}</Label>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.disinfection')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="kodan-colored" 
                          data-testid="checkbox-kodan-colored"
                          checked={intraOpData.disinfection?.kodanColored ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                kodanColored: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="kodan-colored">{t('surgery.intraop.kodanColored')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="kodan-colorless" 
                          data-testid="checkbox-kodan-colorless"
                          checked={intraOpData.disinfection?.kodanColorless ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                kodanColorless: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="kodan-colorless">{t('surgery.intraop.kodanColorless')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="octanisept" 
                          data-testid="checkbox-octanisept"
                          checked={intraOpData.disinfection?.octanisept ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                octanisept: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="octanisept">{t('surgery.intraop.octanisept')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="disinfection-betadine" 
                          data-testid="checkbox-disinfection-betadine"
                          checked={intraOpData.disinfection?.betadine ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              disinfection: {
                                ...intraOpData.disinfection,
                                betadine: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="disinfection-betadine">{t('surgery.intraop.betadine')}</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.performedBy')}</Label>
                      <Popover 
                        open={openStaffPopover === 'performedBy'} 
                        onOpenChange={(open) => {
                          setOpenStaffPopover(open ? 'performedBy' : null);
                          if (!open) setStaffSearchInput("");
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={openStaffPopover === 'performedBy'}
                            className="w-full justify-between font-normal"
                            disabled={!anesthesiaRecord?.id}
                            data-testid="combobox-disinfection-by"
                          >
                            {intraOpData.disinfection?.performedBy || t('surgery.intraop.selectStaff')}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-0" align="start">
                          <Command shouldFilter={true}>
                            <CommandInput 
                              placeholder={t('surgery.intraop.typeOrSelect')} 
                              value={staffSearchInput}
                              onValueChange={setStaffSearchInput}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && staffSearchInput.trim()) {
                                  e.preventDefault();
                                  const updated = {
                                    ...intraOpData,
                                    disinfection: {
                                      ...intraOpData.disinfection,
                                      performedBy: staffSearchInput.trim()
                                    }
                                  };
                                  setIntraOpData(updated);
                                  intraOpAutoSave.mutate(updated);
                                  setOpenStaffPopover(null);
                                  setStaffSearchInput("");
                                }
                              }}
                            />
                            <CommandList>
                              <CommandEmpty>
                                {staffSearchInput.trim() ? (
                                  <button
                                    className="w-full px-2 py-3 text-left text-sm hover:bg-accent rounded cursor-pointer flex items-center gap-2"
                                    onClick={() => {
                                      const updated = {
                                        ...intraOpData,
                                        disinfection: {
                                          ...intraOpData.disinfection,
                                          performedBy: staffSearchInput.trim()
                                        }
                                      };
                                      setIntraOpData(updated);
                                      intraOpAutoSave.mutate(updated);
                                      setOpenStaffPopover(null);
                                      setStaffSearchInput("");
                                    }}
                                    data-testid="add-custom-disinfection-by"
                                  >
                                    <Plus className="h-4 w-4" />
                                    {t('surgery.intraop.useCustomName', { name: staffSearchInput.trim() })}
                                  </button>
                                ) : (
                                  <span className="text-sm text-muted-foreground">{t('surgery.intraop.noStaffFound')}</span>
                                )}
                              </CommandEmpty>
                              <CommandGroup>
                                {intraOpData.disinfection?.performedBy && !staffSearchInput.trim() && (
                                  <CommandItem
                                    value="__clear__"
                                    onSelect={() => {
                                      const updated = {
                                        ...intraOpData,
                                        disinfection: {
                                          ...intraOpData.disinfection,
                                          performedBy: ""
                                        }
                                      };
                                      setIntraOpData(updated);
                                      intraOpAutoSave.mutate(updated);
                                      setOpenStaffPopover(null);
                                      setStaffSearchInput("");
                                    }}
                                    className="text-destructive"
                                    data-testid="clear-disinfection-by"
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    {t('surgery.intraop.clearSelection')}
                                  </CommandItem>
                                )}
                                {staffSearchInput.trim() && !disinfectionStaff.some(s => s.name.toLowerCase() === staffSearchInput.trim().toLowerCase()) && (
                                  <CommandItem
                                    value={`__custom__${staffSearchInput.trim()}`}
                                    onSelect={() => {
                                      const updated = {
                                        ...intraOpData,
                                        disinfection: {
                                          ...intraOpData.disinfection,
                                          performedBy: staffSearchInput.trim()
                                        }
                                      };
                                      setIntraOpData(updated);
                                      intraOpAutoSave.mutate(updated);
                                      setOpenStaffPopover(null);
                                      setStaffSearchInput("");
                                    }}
                                    className="text-primary"
                                    data-testid="add-custom-disinfection-by"
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t('surgery.intraop.useCustomName', { name: staffSearchInput.trim() })}
                                  </CommandItem>
                                )}
                                {disinfectionStaff.map((staff) => (
                                  <CommandItem
                                    key={staff.id}
                                    value={staff.name}
                                    onSelect={() => {
                                      const updated = {
                                        ...intraOpData,
                                        disinfection: {
                                          ...intraOpData.disinfection,
                                          performedBy: staff.name
                                        }
                                      };
                                      setIntraOpData(updated);
                                      intraOpAutoSave.mutate(updated);
                                      setOpenStaffPopover(null);
                                      setStaffSearchInput("");
                                    }}
                                    data-testid={`disinfection-by-option-${staff.id}`}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        intraOpData.disinfection?.performedBy === staff.name ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {staff.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.equipment')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Coagulation Subsection */}
                    <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                      <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.koagulation')}</Label>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center space-x-2 min-h-[44px]">
                          <Checkbox 
                            id="koag-mono" 
                            data-testid="checkbox-koag-mono"
                            className="h-5 w-5"
                            checked={intraOpData.equipment?.monopolar ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                equipment: {
                                  ...intraOpData.equipment,
                                  monopolar: checked === true
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor="koag-mono" className="text-base">Monopolar</Label>
                        </div>
                        <div className="flex items-center space-x-2 min-h-[44px]">
                          <Checkbox 
                            id="koag-bi" 
                            data-testid="checkbox-koag-bi"
                            className="h-5 w-5"
                            checked={intraOpData.equipment?.bipolar ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                equipment: {
                                  ...intraOpData.equipment,
                                  bipolar: checked === true
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor="koag-bi" className="text-base">Bipolar</Label>
                        </div>
                      </div>
                    </div>

                    {/* Neutral Electrode Subsection */}
                    <div className="rounded-lg bg-muted/30 p-4 space-y-4">
                      <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.neutralElectrode')}</Label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {["shoulder", "abdomen", "thigh", "back", "forearm"].map((loc) => (
                          <div key={loc} className="flex items-center space-x-2 min-h-[44px]">
                            <Checkbox 
                              id={`electrode-${loc}`} 
                              data-testid={`checkbox-electrode-${loc}`}
                              className="h-5 w-5"
                              checked={intraOpData.equipment?.neutralElectrodeLocation === loc}
                              onCheckedChange={(checked) => {
                                const updated = {
                                  ...intraOpData,
                                  equipment: {
                                    ...intraOpData.equipment,
                                    neutralElectrodeLocation: checked ? loc : undefined
                                  }
                                };
                                setIntraOpData(updated);
                                intraOpAutoSave.mutate(updated);
                              }}
                            />
                            <Label htmlFor={`electrode-${loc}`} className="text-base">{t(`surgery.intraop.${loc}`)}</Label>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border/50 pt-3 mt-3">
                        <Label className="text-sm font-medium mb-2 block">{t('surgery.intraop.bodySide')}</Label>
                        <div className="flex gap-6">
                          {["left", "right"].map((side) => (
                            <div key={side} className="flex items-center space-x-2 min-h-[44px]">
                              <Checkbox 
                                id={`electrode-side-${side}`} 
                                data-testid={`checkbox-electrode-side-${side}`}
                                className="h-5 w-5"
                                checked={intraOpData.equipment?.neutralElectrodeSide === side}
                                onCheckedChange={(checked) => {
                                  const updated = {
                                    ...intraOpData,
                                    equipment: {
                                      ...intraOpData.equipment,
                                      neutralElectrodeSide: checked ? side : undefined
                                    }
                                  };
                                  setIntraOpData(updated);
                                  intraOpAutoSave.mutate(updated);
                                }}
                              />
                              <Label htmlFor={`electrode-side-${side}`} className="text-base">{t(`surgery.intraop.${side}`)}</Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Pathology Subsection */}
                    <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                      <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.pathology')}</Label>
                      <div className="flex flex-wrap gap-4">
                        <div className="flex items-center space-x-2 min-h-[44px]">
                          <Checkbox 
                            id="path-histo" 
                            data-testid="checkbox-path-histo"
                            className="h-5 w-5"
                            checked={intraOpData.equipment?.pathology?.histology ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                equipment: {
                                  ...intraOpData.equipment,
                                  pathology: {
                                    ...intraOpData.equipment?.pathology,
                                    histology: checked === true
                                  }
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor="path-histo" className="text-base">{t('surgery.intraop.histologie')}</Label>
                        </div>
                        <div className="flex items-center space-x-2 min-h-[44px]">
                          <Checkbox 
                            id="path-mikro" 
                            data-testid="checkbox-path-mikro"
                            className="h-5 w-5"
                            checked={intraOpData.equipment?.pathology?.microbiology ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                equipment: {
                                  ...intraOpData.equipment,
                                  pathology: {
                                    ...intraOpData.equipment?.pathology,
                                    microbiology: checked === true
                                  }
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor="path-mikro" className="text-base">{t('surgery.intraop.mikrobio')}</Label>
                        </div>
                      </div>
                    </div>

                    {/* Devices Subsection */}
                    <div className="rounded-lg bg-muted/30 p-4 space-y-3">
                      <Label className="text-sm font-semibold text-muted-foreground">{t('surgery.intraop.devices')}</Label>
                      <Input
                        id="equipment-devices"
                        data-testid="input-equipment-devices"
                        className="h-12 text-base"
                        placeholder={t('surgery.intraop.devicesPlaceholder')}
                        value={intraOpData.equipment?.devices ?? ''}
                        onChange={(e) => {
                          const updated = {
                            ...intraOpData,
                            equipment: {
                              ...intraOpData.equipment,
                              devices: e.target.value
                            }
                          };
                          setIntraOpData(updated);
                        }}
                        onBlur={(e) => {
                          const updated = {
                            ...intraOpData,
                            equipment: {
                              ...intraOpData.equipment,
                              devices: e.target.value
                            }
                          };
                          intraOpAutoSave.mutate(updated);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Irrigation Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.irrigation')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2 min-h-[44px]">
                        <Checkbox 
                          id="irrigation-nacl" 
                          data-testid="checkbox-irrigation-nacl"
                          className="h-5 w-5"
                          checked={intraOpData.irrigation?.nacl ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              irrigation: {
                                ...intraOpData.irrigation,
                                nacl: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="irrigation-nacl" className="text-base">{t('surgery.intraop.irrigationOptions.nacl')}</Label>
                      </div>
                      <div className="flex items-center space-x-2 min-h-[44px]">
                        <Checkbox 
                          id="irrigation-ringer" 
                          data-testid="checkbox-irrigation-ringer"
                          className="h-5 w-5"
                          checked={intraOpData.irrigation?.ringerSolution ?? false}
                          onCheckedChange={(checked) => {
                            const updated = {
                              ...intraOpData,
                              irrigation: {
                                ...intraOpData.irrigation,
                                ringerSolution: checked === true
                              }
                            };
                            setIntraOpData(updated);
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                        <Label htmlFor="irrigation-ringer" className="text-base">{t('surgery.intraop.irrigationOptions.ringerSolution')}</Label>
                      </div>
                    </div>
                    <Input
                      id="irrigation-other"
                      data-testid="input-irrigation-other"
                      className="h-12 text-base"
                      placeholder={t('surgery.intraop.irrigationOther')}
                      value={intraOpData.irrigation?.other ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...intraOpData,
                          irrigation: {
                            ...intraOpData.irrigation,
                            other: e.target.value
                          }
                        };
                        setIntraOpData(updated);
                      }}
                      onBlur={(e) => {
                        const updated = {
                          ...intraOpData,
                          irrigation: {
                            ...intraOpData.irrigation,
                            other: e.target.value
                          }
                        };
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Infiltration Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.infiltration')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="infiltration-tumor" 
                        data-testid="checkbox-infiltration-tumor"
                        checked={intraOpData.infiltration?.tumorSolution ?? false}
                        onCheckedChange={(checked) => {
                          const updated = {
                            ...intraOpData,
                            infiltration: {
                              ...intraOpData.infiltration,
                              tumorSolution: checked === true
                            }
                          };
                          setIntraOpData(updated);
                          intraOpAutoSave.mutate(updated);
                        }}
                      />
                      <Label htmlFor="infiltration-tumor">{t('surgery.intraop.infiltrationOptions.tumorSolution')}</Label>
                    </div>
                    <div className="space-y-2">
                      <Input
                        id="infiltration-other"
                        data-testid="input-infiltration-other"
                        placeholder={t('surgery.intraop.infiltrationOther')}
                        value={intraOpData.infiltration?.other ?? ''}
                        onChange={(e) => {
                          const updated = {
                            ...intraOpData,
                            infiltration: {
                              ...intraOpData.infiltration,
                              other: e.target.value
                            }
                          };
                          setIntraOpData(updated);
                        }}
                        onBlur={(e) => {
                          const updated = {
                            ...intraOpData,
                            infiltration: {
                              ...intraOpData.infiltration,
                              other: e.target.value
                            }
                          };
                          intraOpAutoSave.mutate(updated);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Medications Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.medications')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {["rapidocain1", "ropivacainEpinephrine", "ropivacain05", "ropivacain075", "ropivacain1", "bupivacain", "vancomycinImplant", "contrast", "ointments"].map((med) => (
                        <div key={med} className="flex items-center space-x-2 min-h-[44px] py-1">
                          <Checkbox 
                            id={`meds-${med}`} 
                            data-testid={`checkbox-meds-${med}`}
                            className="h-5 w-5"
                            checked={(intraOpData.medications as Record<string, boolean>)?.[med] ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                medications: {
                                  ...intraOpData.medications,
                                  [med]: checked === true
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor={`meds-${med}`} className="text-base">{t(`surgery.intraop.medicationOptions.${med}`)}</Label>
                        </div>
                      ))}
                    </div>
                    <Input
                      id="medications-other"
                      data-testid="input-medications-other"
                      className="h-12 text-base"
                      placeholder={t('surgery.intraop.medicationsOther')}
                      value={intraOpData.medications?.other ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...intraOpData,
                          medications: {
                            ...intraOpData.medications,
                            other: e.target.value
                          }
                        };
                        setIntraOpData(updated);
                      }}
                      onBlur={(e) => {
                        const updated = {
                          ...intraOpData,
                          medications: {
                            ...intraOpData.medications,
                            other: e.target.value
                          }
                        };
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Dressing Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.dressing')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[
                        { id: 'elasticBandage', key: 'elasticBandage' },
                        { id: 'abdominalBelt', key: 'abdominalBelt' },
                        { id: 'bra', key: 'bra' },
                        { id: 'faceLiftMask', key: 'faceLiftMask' },
                        { id: 'steristrips', key: 'steristrips' },
                        { id: 'comfeel', key: 'comfeel' },
                        { id: 'opsite', key: 'opsite' },
                        { id: 'compresses', key: 'compresses' },
                        { id: 'mefix', key: 'mefix' }
                      ].map((item) => (
                        <div key={item.id} className="flex items-center space-x-2 min-h-[44px]">
                          <Checkbox 
                            id={`dressing-${item.id}`} 
                            data-testid={`checkbox-dressing-${item.id}`}
                            className="h-5 w-5"
                            checked={intraOpData.dressing?.[item.key as keyof typeof intraOpData.dressing] ?? false}
                            onCheckedChange={(checked) => {
                              const updated = {
                                ...intraOpData,
                                dressing: {
                                  ...intraOpData.dressing,
                                  [item.key]: checked === true
                                }
                              };
                              setIntraOpData(updated);
                              intraOpAutoSave.mutate(updated);
                            }}
                          />
                          <Label htmlFor={`dressing-${item.id}`} className="text-base">{t(`surgery.intraop.dressingOptions.${item.key}`)}</Label>
                        </div>
                      ))}
                    </div>
                    <Input
                      id="dressing-other"
                      data-testid="input-dressing-other"
                      className="h-12 text-base"
                      placeholder={t('surgery.intraop.dressingOther')}
                      value={intraOpData.dressing?.other ?? ''}
                      onChange={(e) => {
                        const updated = {
                          ...intraOpData,
                          dressing: {
                            ...intraOpData.dressing,
                            other: e.target.value
                          }
                        };
                        setIntraOpData(updated);
                      }}
                      onBlur={(e) => {
                        const updated = {
                          ...intraOpData,
                          dressing: {
                            ...intraOpData.dressing,
                            other: e.target.value
                          }
                        };
                        intraOpAutoSave.mutate(updated);
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Drainage Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.drainage')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('surgery.intraop.drainageOptions.redonCH')}</Label>
                        <Input
                          id="drainage-redon-ch"
                          data-testid="input-drainage-redon-ch"
                          placeholder="e.g., CH 10, CH 12..."
                          value={intraOpData.drainage?.redonCH ?? ''}
                          onChange={(e) => {
                            const updated = {
                              ...intraOpData,
                              drainage: {
                                ...intraOpData.drainage,
                                redonCH: e.target.value
                              }
                            };
                            setIntraOpData(updated);
                          }}
                          onBlur={(e) => {
                            const updated = {
                              ...intraOpData,
                              drainage: {
                                ...intraOpData.drainage,
                                redonCH: e.target.value
                              }
                            };
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('surgery.intraop.drainageOptions.redonCount')}</Label>
                        <Input
                          id="drainage-redon-count"
                          data-testid="input-drainage-redon-count"
                          type="number"
                          min="0"
                          placeholder="0"
                          value={intraOpData.drainage?.redonCount ?? ''}
                          onChange={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                            const updated = {
                              ...intraOpData,
                              drainage: {
                                ...intraOpData.drainage,
                                redonCount: value
                              }
                            };
                            setIntraOpData(updated);
                          }}
                          onBlur={(e) => {
                            const value = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                            const updated = {
                              ...intraOpData,
                              drainage: {
                                ...intraOpData.drainage,
                                redonCount: value
                              }
                            };
                            intraOpAutoSave.mutate(updated);
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Input
                        id="drainage-other"
                        data-testid="input-drainage-other"
                        placeholder={t('surgery.intraop.drainageOther')}
                        value={intraOpData.drainage?.other ?? ''}
                        onChange={(e) => {
                          const updated = {
                            ...intraOpData,
                            drainage: {
                              ...intraOpData.drainage,
                              other: e.target.value
                            }
                          };
                          setIntraOpData(updated);
                        }}
                        onBlur={(e) => {
                          const updated = {
                            ...intraOpData,
                            drainage: {
                              ...intraOpData.drainage,
                              other: e.target.value
                            }
                          };
                          intraOpAutoSave.mutate(updated);
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.signatures')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureZudienung')}</Label>
                      <div 
                        className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
                        onClick={() => setShowIntraOpSignaturePad('circulating')}
                        data-testid="signature-pad-zudienung"
                      >
                        {intraOpData.signatures?.circulatingNurse ? (
                          <img src={intraOpData.signatures.circulatingNurse} alt="Signature" className="h-full w-full object-contain" />
                        ) : (
                          t('surgery.intraop.tapToSign')
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureInstrum')}</Label>
                      <div 
                        className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
                        onClick={() => setShowIntraOpSignaturePad('instrument')}
                        data-testid="signature-pad-instrum"
                      >
                        {intraOpData.signatures?.instrumentNurse ? (
                          <img src={intraOpData.signatures.instrumentNurse} alt="Signature" className="h-full w-full object-contain" />
                        ) : (
                          t('surgery.intraop.tapToSign')
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Intra-Op Signature Pad Dialogs */}
                <SignaturePad
                  isOpen={showIntraOpSignaturePad === 'circulating'}
                  onClose={() => setShowIntraOpSignaturePad(null)}
                  onSave={(signature) => {
                    const updated = {
                      ...intraOpData,
                      signatures: {
                        ...intraOpData.signatures,
                        circulatingNurse: signature
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                  title={t('surgery.intraop.signatureZudienung')}
                />
                <SignaturePad
                  isOpen={showIntraOpSignaturePad === 'instrument'}
                  onClose={() => setShowIntraOpSignaturePad(null)}
                  onSave={(signature) => {
                    const updated = {
                      ...intraOpData,
                      signatures: {
                        ...intraOpData.signatures,
                        instrumentNurse: signature
                      }
                    };
                    setIntraOpData(updated);
                    intraOpAutoSave.mutate(updated);
                  }}
                  title={t('surgery.intraop.signatureInstrum')}
                />
              </TabsContent>

              {/* Counts & Sterile Goods Tab (Combined) */}
              <TabsContent value="countsSterile" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-counts-sterile">
                {/* Surgical Counts Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.counts.title')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">{t('surgery.counts.item')}</th>
                            <th className="text-center py-2 px-3">{t('surgery.counts.count1')}</th>
                            <th className="text-center py-2 px-3">{t('surgery.counts.count2')}</th>
                            <th className="text-center py-2 px-3">{t('surgery.counts.countFinal')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const defaultItems = ["Bauchtücher", "Kompressen", "Tupfer", "Tupferli", "Gummibändli", "Nadeln"];
                            const existingCounts = countsSterileData.surgicalCounts || [];
                            
                            return defaultItems.map((itemName, idx) => {
                              const itemId = `count-${idx}`;
                              const existing = existingCounts.find(c => c.id === itemId);
                              const count1 = existing?.count1 ?? null;
                              const count2 = existing?.count2 ?? null;
                              const countFinal = existing?.countFinal ?? null;
                              
                              const updateCount = (field: 'count1' | 'count2' | 'countFinal', value: string) => {
                                const numValue = value === '' ? null : parseInt(value, 10);
                                if (value !== '' && isNaN(numValue as number)) return;
                                
                                const newCounts = [...(countsSterileData.surgicalCounts || [])];
                                const existingIdx = newCounts.findIndex(c => c.id === itemId);
                                
                                if (existingIdx >= 0) {
                                  newCounts[existingIdx] = { ...newCounts[existingIdx], [field]: numValue };
                                } else {
                                  newCounts.push({ id: itemId, name: itemName, [field]: numValue });
                                }
                                
                                const updated = { ...countsSterileData, surgicalCounts: newCounts };
                                setCountsSterileData(updated);
                              };
                              
                              return (
                                <tr key={itemName} className="border-b">
                                  <td className="py-2 px-3 font-medium">{itemName}</td>
                                  <td className="py-1 px-3 text-center">
                                    <Input 
                                      className="w-16 text-center mx-auto" 
                                      data-testid={`input-count1-${idx}`}
                                      value={count1 ?? ''}
                                      onChange={(e) => updateCount('count1', e.target.value)}
                                      onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                                    />
                                  </td>
                                  <td className="py-1 px-3 text-center">
                                    <Input 
                                      className="w-16 text-center mx-auto" 
                                      data-testid={`input-count2-${idx}`}
                                      value={count2 ?? ''}
                                      onChange={(e) => updateCount('count2', e.target.value)}
                                      onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                                    />
                                  </td>
                                  <td className="py-1 px-3 text-center">
                                    <Input 
                                      className="w-16 text-center mx-auto" 
                                      data-testid={`input-countfinal-${idx}`}
                                      value={countFinal ?? ''}
                                      onChange={(e) => updateCount('countFinal', e.target.value)}
                                      onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                                    />
                                  </td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* Sterile Items Section */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
                      <Button
                        size="sm"
                        variant={sterileDocMode === 'items' ? 'default' : 'ghost'}
                        className="flex items-center gap-2"
                        onClick={() => setSterileDocMode('items')}
                        data-testid="button-sterile-items-tab"
                      >
                        <Package className="h-4 w-4" />
                        {t('surgery.sterile.items')}
                      </Button>
                      <Button
                        size="sm"
                        variant={sterileDocMode === 'photo' ? 'default' : 'ghost'}
                        className="flex items-center gap-2"
                        onClick={() => setSterileDocMode('photo')}
                        data-testid="button-sticker-photo-tab"
                      >
                        <Camera className="h-4 w-4" />
                        {t('surgery.sterile.stickerDocumentation')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {sterileDocMode === 'items' ? (
                      <>
                        <div className="flex justify-end mb-4">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setShowAddSterileItemDialog(true)}
                            data-testid="button-add-sterile-item"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            {t('surgery.sterile.addItem')}
                          </Button>
                        </div>
                        {sterileItems.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <Package className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>{t('surgery.sterile.noItems')}</p>
                            <p className="text-sm">{t('surgery.sterile.scanOrAdd')}</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {sterileItems.map((item) => (
                              <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                                <div className="flex-1">
                                  <div className="font-medium">{item.name}</div>
                                  {item.lotNumber && (
                                    <div className="text-sm text-muted-foreground">Lot: {item.lotNumber}</div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge variant="secondary">{item.quantity}x</Badge>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                    onClick={() => handleRemoveSterileItem(item.id)}
                                    data-testid={`button-remove-sterile-${item.id}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-muted-foreground mb-4">
                          {t('surgery.sterile.stickerDocumentationDesc')}
                        </p>
                        <div className="flex items-center gap-3 mb-4">
                          <input
                            type="file"
                            ref={stickerFileInputRef}
                            onChange={handleStickerFileUpload}
                            accept="image/jpeg,image/png,image/gif,application/pdf"
                            className="hidden"
                            data-testid="input-sticker-file"
                          />
                          <Button 
                            variant="outline" 
                            className="flex items-center gap-2" 
                            onClick={() => {
                              // Use capture attribute for camera
                              if (stickerFileInputRef.current) {
                                stickerFileInputRef.current.setAttribute('capture', 'environment');
                                stickerFileInputRef.current.click();
                              }
                            }}
                            data-testid="button-take-sticker-photo"
                          >
                            <Camera className="h-4 w-4" />
                            {t('surgery.sterile.takePhoto')}
                          </Button>
                          <Button 
                            variant="outline" 
                            className="flex items-center gap-2" 
                            onClick={() => {
                              // Remove capture attribute for gallery
                              if (stickerFileInputRef.current) {
                                stickerFileInputRef.current.removeAttribute('capture');
                                stickerFileInputRef.current.click();
                              }
                            }}
                            data-testid="button-upload-sticker-file"
                          >
                            <Upload className="h-4 w-4" />
                            {t('surgery.sterile.uploadFile')}
                          </Button>
                        </div>
                        {stickerUploadProgress && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
                            {t('common.uploading')}...
                          </div>
                        )}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {(countsSterileData.stickerDocs || []).map((doc) => {
                            const imgSrc = getStickerDocSrc(doc);
                            // Fetch URL for storage-backed docs that aren't cached yet
                            if (doc.storageKey && !doc.data && !stickerDocUrls[doc.id]) {
                              fetchStickerDocUrl(doc.id);
                            }
                            
                            return (
                              <div key={doc.id} className="relative aspect-[4/3] border rounded-lg overflow-hidden group">
                                {doc.type === 'photo' ? (
                                  imgSrc ? (
                                    <img src={imgSrc} alt={doc.filename || 'Sticker'} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-muted">
                                      <div className="animate-pulse h-4 w-4 border-2 border-muted-foreground border-t-transparent rounded-full" />
                                    </div>
                                  )
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-muted">
                                    <FileText className="h-8 w-8 mb-2 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground truncate max-w-full px-2">{doc.filename || 'PDF'}</span>
                                  </div>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleRemoveStickerDoc(doc.id)}
                                  data-testid={`button-remove-sticker-${doc.id}`}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            );
                          })}
                          {(!countsSterileData.stickerDocs || countsSterileData.stickerDocs.length === 0) && (
                            <div 
                              className="relative aspect-[4/3] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                if (stickerFileInputRef.current) {
                                  stickerFileInputRef.current.removeAttribute('capture');
                                  stickerFileInputRef.current.click();
                                }
                              }}
                              data-testid="sticker-photo-placeholder"
                            >
                              <Image className="h-8 w-8 mb-2 opacity-50" />
                              <span className="text-xs">{t('surgery.sterile.noPhotos')}</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.sterile.sutures')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 px-3">{t('surgery.sterile.sutureType')}</th>
                            <th className="text-left py-2 px-3">{t('surgery.sterile.sizes')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {["Vicryl", "V-Lock", "Prolene", "Ethilon", "Monocryl", "Stratafix"].map((type) => {
                            const key = type.toLowerCase().replace('-', '');
                            return (
                              <tr key={type} className="border-b">
                                <td className="py-2 px-3 font-medium">{type}</td>
                                <td className="py-1 px-3">
                                  <Input 
                                    placeholder={t('surgery.sterile.sizePlaceholder')} 
                                    data-testid={`input-suture-${type.toLowerCase()}`}
                                    value={countsSterileData.sutures?.[key] ?? ''}
                                    onChange={(e) => {
                                      const updated = {
                                        ...countsSterileData,
                                        sutures: {
                                          ...countsSterileData.sutures,
                                          [key]: e.target.value
                                        }
                                      };
                                      setCountsSterileData(updated);
                                    }}
                                    onBlur={() => countsSterileAutoSave.mutate(countsSterileData)}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.sterile.signatures')}</CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureZudienung')}</Label>
                      <div 
                        className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
                        onClick={() => setShowCountsSterileSignaturePad('circulating')}
                        data-testid="signature-pad-sterile-zudienung"
                      >
                        {countsSterileData.signatures?.circulating ? (
                          <img src={countsSterileData.signatures.circulating} alt="Signature" className="h-full w-full object-contain" />
                        ) : (
                          t('surgery.intraop.tapToSign')
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureInstrum')}</Label>
                      <div 
                        className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50 overflow-hidden"
                        onClick={() => setShowCountsSterileSignaturePad('instrumenteur')}
                        data-testid="signature-pad-sterile-instrum"
                      >
                        {countsSterileData.signatures?.instrumenteur ? (
                          <img src={countsSterileData.signatures.instrumenteur} alt="Signature" className="h-full w-full object-contain" />
                        ) : (
                          t('surgery.intraop.tapToSign')
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Counts & Sterile Signature Pad Dialogs */}
                <SignaturePad
                  isOpen={showCountsSterileSignaturePad === 'circulating'}
                  onClose={() => setShowCountsSterileSignaturePad(null)}
                  onSave={(signature) => {
                    const updated = {
                      ...countsSterileData,
                      signatures: {
                        ...countsSterileData.signatures,
                        circulating: signature
                      }
                    };
                    setCountsSterileData(updated);
                    countsSterileAutoSave.mutate(updated);
                  }}
                  title={t('surgery.intraop.signatureZudienung')}
                />
                <SignaturePad
                  isOpen={showCountsSterileSignaturePad === 'instrumenteur'}
                  onClose={() => setShowCountsSterileSignaturePad(null)}
                  onSave={(signature) => {
                    const updated = {
                      ...countsSterileData,
                      signatures: {
                        ...countsSterileData.signatures,
                        instrumenteur: signature
                      }
                    };
                    setCountsSterileData(updated);
                    countsSterileAutoSave.mutate(updated);
                  }}
                  title={t('surgery.intraop.signatureInstrum')}
                />
              </TabsContent>
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Allergies & CAVE Edit Dialog */}
    <Dialog open={isAllergiesDialogOpen} onOpenChange={setIsAllergiesDialogOpen}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('anesthesia.op.editAllergiesCave')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Allergies List - Checkboxes from Anesthesia Settings */}
          <div className="space-y-2">
            <Label>{t('anesthesia.op.allergies')}</Label>
            <div className="border rounded-lg p-3 space-y-2 max-h-[200px] overflow-y-auto">
              {anesthesiaSettings?.allergyList && anesthesiaSettings.allergyList.length > 0 ? (
                anesthesiaSettings.allergyList.map((allergy: { id: string; label: string }) => (
                  <div key={allergy.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`allergy-${allergy.id}`}
                      checked={tempSelectedAllergies.includes(allergy.id)}
                      onCheckedChange={() => handleToggleAllergy(allergy.id)}
                      data-testid={`checkbox-allergy-${allergy.id}`}
                    />
                    <Label 
                      htmlFor={`allergy-${allergy.id}`}
                      className="text-sm font-normal cursor-pointer"
                    >
                      {allergy.label}
                    </Label>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t('anesthesia.op.noAllergyOptionsConfigured')}</p>
              )}
            </div>
          </div>

          {/* Other Allergies - Free Text */}
          <div className="space-y-2">
            <Label htmlFor="otherAllergies">{t('anesthesia.op.otherAllergies')}</Label>
            <Textarea
              id="otherAllergies"
              rows={2}
              placeholder={t('anesthesia.op.enterOtherAllergies')}
              value={tempOtherAllergies}
              onChange={(e) => setTempOtherAllergies(e.target.value)}
              data-testid="textarea-edit-other-allergies"
            />
          </div>

          {/* CAVE - Free Text */}
          <div className="space-y-2">
            <Label htmlFor="cave">{t('anesthesia.op.cave')}</Label>
            <Textarea
              id="cave"
              rows={2}
              placeholder={t('anesthesia.op.enterContraindications')}
              value={tempCave}
              onChange={(e) => setTempCave(e.target.value)}
              data-testid="textarea-edit-cave"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setIsAllergiesDialogOpen(false)}
              data-testid="button-cancel-allergies"
            >
              {t('anesthesia.op.cancel')}
            </Button>
            <Button
              onClick={handleSaveAllergies}
              data-testid="button-save-allergies"
            >
              {t('anesthesia.op.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Add Sterile Item Dialog */}
    <Dialog open={showAddSterileItemDialog} onOpenChange={setShowAddSterileItemDialog}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t('surgery.sterile.addItem')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sterile-item-name">{t('surgery.sterile.itemName')}</Label>
            <Input
              id="sterile-item-name"
              placeholder={t('surgery.sterile.itemNamePlaceholder')}
              value={newSterileItemName}
              onChange={(e) => setNewSterileItemName(e.target.value)}
              data-testid="input-sterile-item-name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sterile-item-lot">{t('surgery.sterile.lotNumber')}</Label>
            <Input
              id="sterile-item-lot"
              placeholder={t('surgery.sterile.lotNumberPlaceholder')}
              value={newSterileItemLot}
              onChange={(e) => setNewSterileItemLot(e.target.value)}
              data-testid="input-sterile-item-lot"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sterile-item-qty">{t('surgery.sterile.quantity')}</Label>
            <Input
              id="sterile-item-qty"
              type="number"
              min={1}
              value={newSterileItemQty}
              onChange={(e) => setNewSterileItemQty(parseInt(e.target.value) || 1)}
              data-testid="input-sterile-item-qty"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => setShowAddSterileItemDialog(false)}
            data-testid="button-cancel-sterile-item"
          >
            {t('anesthesia.op.cancel')}
          </Button>
          <Button
            onClick={handleAddSterileItem}
            disabled={!newSterileItemName.trim()}
            data-testid="button-confirm-sterile-item"
          >
            {t('surgery.sterile.addItem')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

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
