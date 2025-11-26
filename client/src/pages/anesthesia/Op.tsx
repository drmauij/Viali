import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useTranslation } from 'react-i18next';
import { useModule } from "@/contexts/ModuleContext";
import { UnifiedTimeline, type UnifiedTimelineRef, type UnifiedTimelineData, type TimelineVitals, type TimelineEvent, type VitalPoint } from "@/components/anesthesia/UnifiedTimeline";
import { HiddenChartExporter, type HiddenChartExporterRef } from "@/components/anesthesia/HiddenChartExporter";
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
import { MedicationScheduleCard } from "@/components/anesthesia/MedicationScheduleCard";
import { WHOChecklistCard } from "@/components/anesthesia/WHOChecklistCard";
import { PatientWeightDialog } from "@/components/anesthesia/dialogs/PatientWeightDialog";
import { useOpData } from "@/hooks/useOpData";
import { useChecklistState } from "@/hooks/useChecklistState";
import { usePacuDataFiltering } from "@/hooks/usePacuDataFiltering";
import { usePdfExport } from "@/hooks/usePdfExport";
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
import { Minus, Folder, Package, Loader2, MapPin, FileText, AlertTriangle, Pill } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Check, ChevronsUpDown } from "lucide-react";
import { formatDate } from "@/lib/dateUtils";
import { generateAnesthesiaRecordPDF } from "@/lib/anesthesiaRecordPdf";
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
  Camera,
  Image
} from "lucide-react";

export default function Op() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [location, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(true);
  const [openEventsPanel, setOpenEventsPanel] = useState(false);
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const { activeModule } = useModule();
  
  // Check if in surgery module mode
  const isSurgeryMode = activeModule === "surgery" || location.startsWith("/surgery");
  const hasAttemptedCreate = useRef(false);
  const timelineRef = useRef<UnifiedTimelineRef>(null);
  const hiddenChartRef = useRef<HiddenChartExporterRef>(null);

  // Determine mode based on route (PACU mode if URL contains /pacu)
  const isPacuMode = location.includes('/pacu');
  
  // Active tab state - default based on module
  const getDefaultTab = () => {
    if (isSurgeryMode) return "intraop";
    if (isPacuMode) return "pacu";
    return "vitals";
  };
  const [activeTab, setActiveTab] = useState(getDefaultTab());
  
  // Weight dialog state
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  
  // Staff role popover state (tracks which combobox is open)
  const [openStaffPopover, setOpenStaffPopover] = useState<string | null>(null);

  // Get surgeryId from params
  const surgeryId = params.id;

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
  });

  const signOutState = useChecklistState({
    checklistType: 'signOut',
    anesthesiaRecordId: anesthesiaRecord?.id,
    surgeryId: surgeryId || '',
    initialData: anesthesiaRecord?.signOutData,
  });

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
        if (window.history.length > 1) {
          window.history.back();
        } else {
          setLocation(isSurgeryMode ? '/surgery/op' : '/anesthesia/op');
        }
      }, 100);
    }
  }, [surgery, surgeryError, isSurgeryLoading, setLocation, isSurgeryMode]);

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
  const [newSterileItemName, setNewSterileItemName] = useState("");
  const [newSterileItemLot, setNewSterileItemLot] = useState("");
  const [newSterileItemQty, setNewSterileItemQty] = useState(1);
  const [sterileDocMode, setSterileDocMode] = useState<'items' | 'photo'>('items');

  const handleAddSterileItem = () => {
    if (!newSterileItemName.trim()) return;
    
    setSterileItems(prev => [...prev, {
      id: `sterile-${Date.now()}`,
      name: newSterileItemName.trim(),
      lotNumber: newSterileItemLot.trim(),
      quantity: newSterileItemQty
    }]);
    
    setNewSterileItemName("");
    setNewSterileItemLot("");
    setNewSterileItemQty(1);
    setShowAddSterileItemDialog(false);
  };

  const handleRemoveSterileItem = (id: string) => {
    setSterileItems(prev => prev.filter(item => item.id !== id));
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
  }>({});

  // Auto-save mutation for Post-Op data
  const postOpAutoSave = useAutoSaveMutation({
    mutationFn: async (data: typeof postOpData) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/postop`, data);
    },
    queryKey: [`/api/anesthesia/records/surgery/${surgeryId}`],
  });

  // Surgery Staff state (OR team documentation)
  const [surgeryStaff, setSurgeryStaff] = useState<{
    instrumentNurse?: string;
    circulatingNurse?: string;
    surgeon?: string;
    surgicalAssistant?: string;
    anesthesiologist?: string;
    anesthesiaNurse?: string;
  }>({});

  // Auto-save mutation for Surgery Staff data
  const surgeryStaffAutoSave = useAutoSaveMutation({
    mutationFn: async (data: typeof surgeryStaff) => {
      if (!anesthesiaRecord?.id) throw new Error("No anesthesia record");
      return apiRequest('PATCH', `/api/anesthesia/records/${anesthesiaRecord.id}/surgery-staff`, data);
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

  // Initialize Surgery Staff data from anesthesia record
  useEffect(() => {
    if (!anesthesiaRecord) return;
    
    // Handle both camelCase (from Drizzle) and snake_case (if transformed)
    const surgeryStaffValue = (anesthesiaRecord as any).surgeryStaff || (anesthesiaRecord as any).surgery_staff;
    if (surgeryStaffValue) {
      setSurgeryStaff(surgeryStaffValue);
    }
  }, [anesthesiaRecord]);

  // PDF export hook
  const { handleDownloadPDF } = usePdfExport({
    patient,
    surgery,
    activeHospital,
    anesthesiaRecord,
    preOpAssessment,
    clinicalSnapshot,
    eventsData,
    medicationsData,
    anesthesiaItems,
    staffMembers,
    positions,
    anesthesiaSettings,
    timelineRef,
    hiddenChartRef,
    isRecordLoading,
    isVitalsLoading,
    isMedicationsLoading,
    isEventsLoading,
    isAnesthesiaItemsLoading,
    isClinicalSnapshotLoading,
    isStaffLoading,
    isPositionsLoading,
    vitalsStatus,
    medicationsStatus,
    eventsStatus,
    anesthesiaItemsStatus,
    staffStatus,
    positionsStatus,
    isAnesthesiaItemsError,
    isMedicationsError,
    isEventsError,
    isVitalsError,
    isClinicalSnapshotError,
    isStaffError,
    isPositionsError,
  });

  // Handle dialog close and navigation
  const handleDialogChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          setLocation(isSurgeryMode ? '/surgery/op' : '/anesthesia/op');
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
      // Show if no preOp assessment OR preOp assessment exists without weight
      const shouldShow = !preOpAssessment || (preOpAssessment && !patientWeight);
      if (shouldShow) {
        console.log('[WEIGHT-DIALOG] Opening weight dialog - preOp missing or weight missing');
        setShowWeightDialog(true);
        hasShownWeightDialogRef.current = true; // Mark as shown
      }
    }
  }, [isPreOpLoading, isPatientLoading, preOpAssessment, patientWeight, showWeightDialog, surgeryId]);
  
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

  // Show loading state while initial data is loading
  // Wait for anesthesia record first, then wait for timeline data to load
  const isLoadingTimeline = anesthesiaRecord?.id && (isVitalsLoading || isMedicationsLoading || isEventsLoading);
  if (isSurgeryLoading || isPreOpLoading || isPatientLoading || isRecordLoading || isLoadingTimeline) {
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
    {/* Patient Weight Dialog - shown on load if weight is missing */}
    <PatientWeightDialog
      open={showWeightDialog}
      patientName={patient ? `${patient.surname}, ${patient.firstname}` : undefined}
      onSave={handleWeightSave}
    />
    
    <Dialog open={isOpen && !showWeightDialog} onOpenChange={handleDialogChange}>
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
        />

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 shrink-0">
            <div className="flex items-center gap-2 sm:gap-4 mb-4">
              <div className="flex-1 overflow-x-auto">
                <TabsList className="inline-flex w-auto min-w-full">
                  {/* Surgery Module Specific Tabs */}
                  {isSurgeryMode && (
                    <>
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
                    </>
                  )}

                  {/* Shared Tabs - Visible in Both Modules */}
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

                  {/* Anesthesia Module Only - Post-Op */}
                  {!isSurgeryMode && !isPacuMode && (
                    <TabsTrigger value="postop" data-testid="tab-postop" className="text-xs sm:text-sm whitespace-nowrap">
                      {t('anesthesia.op.postOp')}
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>
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
              {isVitalsLoading ? (
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
                />
              )}
            </div>
          </TabsContent>

          {/* PACU Documentation Tab - Only visible in PACU mode */}
          {isPacuMode && (
            <TabsContent value="pacu" className="flex-1 overflow-y-auto px-6 pb-6 mt-0 space-y-4" data-testid="tab-content-pacu">
              <PostOpInfoCard postOpData={postOpData} />
              <MedicationScheduleCard postOpData={postOpData} />
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
              <PreOpOverview surgeryId={surgeryId!} />
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

                {/* Complications */}
                <div className="space-y-2">
                  <Label htmlFor="complications">{t('anesthesia.op.complications')}</Label>
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
                          <span className="text-sm">{t('anesthesia.op.at')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
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
                          <span className="text-sm">{t('anesthesia.op.at')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
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
                          <span className="text-sm">{t('anesthesia.op.at')}</span>
                        </label>
                        <Input
                          type="text"
                          className="w-32"
                          placeholder={t('anesthesia.op.hhMM')}
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

          {/* Surgery Module Tab Contents */}
          {isSurgeryMode && (
            <>
              {/* Intraoperative Tab */}
              <TabsContent value="intraop" className="flex-1 overflow-y-auto px-6 pb-6 space-y-4 mt-0" data-testid="tab-content-intraop">
                {/* Staff Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {t('surgery.intraop.staff')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[
                        { key: 'instrumentNurse', label: t('surgery.intraop.staffRoles.instrumentNurse') },
                        { key: 'circulatingNurse', label: t('surgery.intraop.staffRoles.circulatingNurse') },
                        { key: 'surgeon', label: t('surgery.intraop.staffRoles.surgeon') },
                        { key: 'surgicalAssistant', label: t('surgery.intraop.staffRoles.surgicalAssistant') },
                        { key: 'anesthesiologist', label: t('surgery.intraop.staffRoles.anesthesiologist') },
                        { key: 'anesthesiaNurse', label: t('surgery.intraop.staffRoles.anesthesiaNurse') },
                      ].map((role) => (
                        <div key={role.key} className="space-y-2">
                          <Label htmlFor={`staff-${role.key}`}>{role.label}</Label>
                          <Popover 
                            open={openStaffPopover === role.key} 
                            onOpenChange={(open) => setOpenStaffPopover(open ? role.key : null)}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={openStaffPopover === role.key}
                                className="w-full justify-between font-normal"
                                disabled={!anesthesiaRecord?.id}
                                data-testid={`combobox-staff-${role.key}`}
                              >
                                {surgeryStaff[role.key as keyof typeof surgeryStaff] || t('surgery.intraop.selectStaff')}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[250px] p-0" align="start">
                              <Command>
                                <CommandInput 
                                  placeholder={t('surgery.intraop.typeOrSelect')} 
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const input = e.currentTarget.value.trim();
                                      if (input) {
                                        const updated = { ...surgeryStaff, [role.key]: input };
                                        setSurgeryStaff(updated);
                                        surgeryStaffAutoSave.mutate(updated);
                                        setOpenStaffPopover(null);
                                      }
                                    }
                                  }}
                                />
                                <CommandList>
                                  <CommandEmpty>
                                    <span className="text-sm text-muted-foreground">{t('surgery.intraop.typeOrSelect')}</span>
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {hospitalUsers?.map((user: any) => (
                                      <CommandItem
                                        key={user.id}
                                        value={user.name}
                                        onSelect={(value) => {
                                          const updated = { ...surgeryStaff, [role.key]: value };
                                          setSurgeryStaff(updated);
                                          surgeryStaffAutoSave.mutate(updated);
                                          setOpenStaffPopover(null);
                                        }}
                                        data-testid={`staff-option-${role.key}-${user.id}`}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            surgeryStaff[role.key as keyof typeof surgeryStaff] === user.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {user.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

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
                          <Checkbox id={`pos-${pos.id}`} data-testid={`checkbox-position-${pos.id}`} />
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="kodan-colored" data-testid="checkbox-kodan-colored" />
                        <Label htmlFor="kodan-colored">{t('surgery.intraop.kodanColored')}</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="kodan-colorless" data-testid="checkbox-kodan-colorless" />
                        <Label htmlFor="kodan-colorless">{t('surgery.intraop.kodanColorless')}</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.performedBy')}</Label>
                      <Input placeholder={t('surgery.intraop.performedByPlaceholder')} data-testid="input-disinfection-by" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>{t('surgery.intraop.equipment')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox id="koag-mono" data-testid="checkbox-koag-mono" />
                        <Label htmlFor="koag-mono">Monopolar</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox id="koag-bi" data-testid="checkbox-koag-bi" />
                        <Label htmlFor="koag-bi">Bipolar</Label>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.neutralElectrode')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {["shoulder", "abdomen", "thigh", "back"].map((loc) => (
                          <div key={loc} className="flex items-center space-x-2">
                            <Checkbox id={`electrode-${loc}`} data-testid={`checkbox-electrode-${loc}`} />
                            <Label htmlFor={`electrode-${loc}`}>{t(`surgery.intraop.${loc}`)}</Label>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.pathology')}</Label>
                      <div className="flex gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox id="path-histo" data-testid="checkbox-path-histo" />
                          <Label htmlFor="path-histo">{t('surgery.intraop.histologie')}</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox id="path-mikro" data-testid="checkbox-path-mikro" />
                          <Label htmlFor="path-mikro">{t('surgery.intraop.mikrobio')}</Label>
                        </div>
                      </div>
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
                      <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50" data-testid="signature-pad-zudienung">
                        {t('surgery.intraop.tapToSign')}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureInstrum')}</Label>
                      <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50" data-testid="signature-pad-instrum">
                        {t('surgery.intraop.tapToSign')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                          {["Bauchtücher", "Kompressen", "Tupfer", "Tupferli", "Gummibändli", "Nadeln"].map((item, idx) => (
                            <tr key={item} className="border-b">
                              <td className="py-2 px-3 font-medium">{item}</td>
                              <td className="py-1 px-3 text-center"><Input className="w-16 text-center mx-auto" data-testid={`input-count1-${idx}`} /></td>
                              <td className="py-1 px-3 text-center"><Input className="w-16 text-center mx-auto" data-testid={`input-count2-${idx}`} /></td>
                              <td className="py-1 px-3 text-center"><Input className="w-16 text-center mx-auto" data-testid={`input-countfinal-${idx}`} /></td>
                            </tr>
                          ))}
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
                          <Button variant="outline" className="flex items-center gap-2" data-testid="button-take-sticker-photo">
                            <Camera className="h-4 w-4" />
                            {t('surgery.sterile.takePhoto')}
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <div className="relative aspect-[4/3] border-2 border-dashed rounded-lg flex flex-col items-center justify-center text-muted-foreground bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors" data-testid="sticker-photo-placeholder">
                            <Image className="h-8 w-8 mb-2 opacity-50" />
                            <span className="text-xs">{t('surgery.sterile.noPhotos')}</span>
                          </div>
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
                          {["Vicryl", "V-Lock", "Prolene", "Ethilon", "Monocryl", "Stratafix"].map((type) => (
                            <tr key={type} className="border-b">
                              <td className="py-2 px-3 font-medium">{type}</td>
                              <td className="py-1 px-3">
                                <Input placeholder={t('surgery.sterile.sizePlaceholder')} data-testid={`input-suture-${type.toLowerCase()}`} />
                              </td>
                            </tr>
                          ))}
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
                      <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50" data-testid="signature-pad-sterile-zudienung">
                        {t('surgery.intraop.tapToSign')}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>{t('surgery.intraop.signatureInstrum')}</Label>
                      <div className="h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground cursor-pointer hover:bg-accent/50" data-testid="signature-pad-sterile-instrum">
                        {t('surgery.intraop.tapToSign')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
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

    {/* Hidden Chart Exporter for PDF export fallback */}
    <HiddenChartExporter ref={hiddenChartRef} />
    </>
  );
}
