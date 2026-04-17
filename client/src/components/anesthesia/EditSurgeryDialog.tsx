import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useState, useEffect, useMemo } from "react";
import { Loader2, Archive, Save, X, Eye, ClipboardList, FileEdit, StickyNote, Plus, Pencil, Trash2, ListTodo, Check, ChevronsUpDown, Ban, RotateCcw } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateTodo } from "@/hooks/useCreateTodo";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime } from "@/lib/dateUtils";
import { SurgeonChecklistTab } from "./SurgeonChecklistTab";
import type { SurgeryContext } from "@shared/checklistPlaceholders";
import { SurgeryFormFields } from "./SurgeryFormFields";
import { checkAdmissionCongruence } from "@shared/admissionCongruence";
import { AdmissionCongruenceDialog, type AdmissionCongruenceChoice } from "./AdmissionCongruenceDialog";

interface EditSurgeryDialogProps {
  surgeryId: string | null;
  onClose: () => void;
}

export function EditSurgeryDialog({ surgeryId, onClose }: EditSurgeryDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");
  const activeHospital = useActiveHospital();
  const isAdmin = activeHospital?.role === "admin";
  const canPlanOps = isAdmin || activeHospital?.canPlanOps === true;
  const [showSuspendDialog, setShowSuspendDialog] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");
  const [activeTab, setActiveTab] = useState("details");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");

  // Form state
  const [surgeryDate, setSurgeryDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState(90);
  const [admissionTime, setAdmissionTime] = useState("");
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [surgeryRoomId, setSurgeryRoomId] = useState("");
  const [surgeonId, setSurgeonId] = useState("");
  const [assistantIds, setAssistantIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [coverageType, setCoverageType] = useState("");
  const [stayType, setStayType] = useState("");
  const [implantDetails, setImplantDetails] = useState("");
  const [planningStatus, setPlanningStatus] = useState<"pre-registered" | "confirmed">("pre-registered");
  const [surgeryStatus, setSurgeryStatus] = useState<"planned" | "in-progress" | "completed" | "cancelled">("planned");
  const [noPreOpRequired, setNoPreOpRequired] = useState(false);
  const [surgerySide, setSurgerySide] = useState<"left" | "right" | "both" | "">("");
  const [antibioseProphylaxe, setAntibioseProphylaxe] = useState(false);
  const [patientPosition, setPatientPosition] = useState<"" | "supine" | "trendelenburg" | "reverse_trendelenburg" | "lithotomy" | "lateral_decubitus" | "prone" | "jackknife" | "sitting" | "kidney" | "lloyd_davies">("");
  const [leftArmPosition, setLeftArmPosition] = useState<"" | "ausgelagert" | "angelagert">("");
  const [rightArmPosition, setRightArmPosition] = useState<"" | "ausgelagert" | "angelagert">("");
  const [selectedChopCode, setSelectedChopCode] = useState("");

  // Patient assignment state (for slot reservations)
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);

  // Fetch surgery details
  const { data: surgery, isLoading } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

  // Fetch hospital for timezone + defaultAdmissionOffsetMinutes
  const { data: hospital } = useQuery<{ timezone?: string; defaultAdmissionOffsetMinutes?: number }>({
    queryKey: [`/api/admin/${surgery?.hospitalId}`],
    enabled: !!surgery?.hospitalId,
  });
  const hospitalTimeZone = hospital?.timezone || "Europe/Zurich";
  const defaultOffsetMinutes = hospital?.defaultAdmissionOffsetMinutes ?? 60;

  // Congruence dialog state
  const [congruencePending, setCongruencePending] = useState<null | {
    newPlannedDate: Date;
    result: ReturnType<typeof checkAdmissionCongruence>;
  }>(null);

  // Saving state (replaces updateMutation.isPending in the UI)
  const [isSaving, setIsSaving] = useState(false);

  // Fetch surgery rooms (only OP type for surgery room assignment)
  const { data: allSurgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${surgery?.hospitalId}`],
    enabled: !!surgery?.hospitalId,
  });

  // Filter to only show OP rooms for surgery assignment (PACU rooms are for post-op tracking)
  const surgeryRooms = useMemo(() => {
    return allSurgeryRooms.filter((room: any) => !room.type || room.type === 'OP');
  }, [allSurgeryRooms]);

  // Fetch patient details
  const { data: patient } = useQuery<any>({
    queryKey: [`/api/patients/${surgery?.patientId}`],
    enabled: !!surgery?.patientId,
  });

  // Fetch patients list (for assigning patient to slot reservations)
  const { data: patients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${surgery?.hospitalId}`],
    enabled: !!surgery?.hospitalId && !surgery?.patientId,
  });

  const selectedPatient = patients.find((p: any) => p.id === selectedPatientId);

  // Fetch surgeons
  const { data: surgeons = [] } = useQuery<any[]>({
    queryKey: [`/api/surgeons`, surgery?.hospitalId],
    queryFn: async () => {
      if (!surgery?.hospitalId) return [];
      const response = await fetch(`/api/surgeons?hospitalId=${surgery.hospitalId}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!surgery?.hospitalId,
  });

  // Fetch case notes
  const { data: caseNotes = [], isLoading: isNotesLoading } = useQuery<any[]>({
    queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries/${surgeryId}/notes`, { credentials: 'include' });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!surgeryId,
  });

  // Create todo hook
  const { createTodo, isPending: isTodoPending } = useCreateTodo(surgery?.hospitalId);

  // Create case note mutation
  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/notes`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      setNewNoteContent("");
      toast({ title: t('anesthesia.caseNotes.noteAdded', 'Note added') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('anesthesia.caseNotes.errorCreating', 'Failed to add note'), variant: "destructive" });
    },
  });

  // Update case note mutation
  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, content }: { noteId: string; content: string }) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/surgery-notes/${noteId}`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      setEditingNoteId(null);
      setEditingNoteContent("");
      toast({ title: t('anesthesia.caseNotes.noteUpdated', 'Note updated') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('anesthesia.caseNotes.errorUpdating', 'Failed to update note'), variant: "destructive" });
    },
  });

  // Delete case note mutation
  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const response = await apiRequest("DELETE", `/api/anesthesia/surgery-notes/${noteId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      toast({ title: t('anesthesia.caseNotes.noteDeleted', 'Note deleted') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('anesthesia.caseNotes.errorDeleting', 'Failed to delete note'), variant: "destructive" });
    },
  });

  const getInitials = (firstName?: string, lastName?: string) => {
    const first = firstName?.charAt(0)?.toUpperCase() || '';
    const last = lastName?.charAt(0)?.toUpperCase() || '';
    return first + last || '?';
  };

  // Initialize form when surgery data loads
  useEffect(() => {
    if (surgery) {
      const plannedDateObj = new Date(surgery.plannedDate);
      const year = plannedDateObj.getFullYear();
      const month = String(plannedDateObj.getMonth() + 1).padStart(2, '0');
      const day = String(plannedDateObj.getDate()).padStart(2, '0');
      const hours = String(plannedDateObj.getHours()).padStart(2, '0');
      const minutes = String(plannedDateObj.getMinutes()).padStart(2, '0');
      setSurgeryDate(`${year}-${month}-${day}`);
      setStartTime(`${hours}:${minutes}`);

      if (surgery.actualEndTime) {
        const endDateObj = new Date(surgery.actualEndTime);
        const durationMinutes = Math.round((endDateObj.getTime() - plannedDateObj.getTime()) / (1000 * 60));
        setDuration(durationMinutes);
      }

      setPlannedSurgery(surgery.plannedSurgery || "");
      setSelectedChopCode(surgery.chopCode || "");
      setSurgeryRoomId(surgery.surgeryRoomId || "");
      setSurgeonId(surgery.surgeonId || "");
      setNotes(surgery.notes || "");
      setDiagnosis(surgery.diagnosis || "");
      setCoverageType(surgery.coverageType || "");
      setStayType(surgery.stayType || "");
      setImplantDetails(surgery.implantDetails || "");
      setPlanningStatus(surgery.planningStatus || "pre-registered");
      setSurgeryStatus(surgery.status || "planned");
      setNoPreOpRequired(surgery.noPreOpRequired || false);
      setSurgerySide(surgery.surgerySide || "");
      setAntibioseProphylaxe(surgery.antibioseProphylaxe || false);
      setPatientPosition(surgery.patientPosition || "");
      setLeftArmPosition(surgery.leftArmPosition || "");
      setRightArmPosition(surgery.rightArmPosition || "");
      setSelectedPatientId(surgery.patientId || "");
      setAssistantIds((surgery.assistants ?? []).map((a: any) => a.userId));

      if (surgery.admissionTime) {
        const admissionDateObj = new Date(surgery.admissionTime);
        const aHours = String(admissionDateObj.getHours()).padStart(2, '0');
        const aMinutes = String(admissionDateObj.getMinutes()).padStart(2, '0');
        setAdmissionTime(`${aHours}:${aMinutes}`);
      } else {
        setAdmissionTime("");
      }
    }
  }, [surgery]);

  // Build the PATCH payload. If overrideAdmissionISO is provided (including null),
  // it is used as-is; otherwise the admission time is derived from form state.
  function buildPayload(overrideAdmissionISO?: string | null): { body: Record<string, unknown>; newPlannedDate: Date } {
    const [year, month, day] = surgeryDate.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    const newPlannedDate = new Date(year, month - 1, day, hour, minute);

    const endDate = new Date(newPlannedDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const matchedSurgeon = surgeons.find((s: any) => s.id === surgeonId);

    let admissionTimeISO: string | null;
    if (overrideAdmissionISO !== undefined) {
      admissionTimeISO = overrideAdmissionISO;
    } else if (admissionTime) {
      const [admHour, admMinute] = admissionTime.split(':').map(Number);
      admissionTimeISO = new Date(year, month - 1, day, admHour, admMinute).toISOString();
    } else {
      admissionTimeISO = null;
    }

    const body: Record<string, unknown> = {
      plannedDate: newPlannedDate.toISOString(),
      actualEndTime: endDate.toISOString(),
      plannedSurgery,
      chopCode: selectedChopCode || null,
      surgeryRoomId,
      surgeon: matchedSurgeon?.name || null,
      surgeonId: surgeonId || null,
      notes: notes || null,
      diagnosis: diagnosis || null,
      coverageType: coverageType || null,
      stayType: stayType || null,
      admissionTime: admissionTimeISO,
      implantDetails: implantDetails || null,
      status: surgeryStatus,
      planningStatus,
      noPreOpRequired,
      surgerySide: surgerySide || null,
      antibioseProphylaxe,
      patientId: selectedPatientId || null,
      patientPosition: patientPosition || null,
      leftArmPosition: leftArmPosition || null,
      rightArmPosition: rightArmPosition || null,
      assistantIds,
    };
    return { body, newPlannedDate };
  }

  async function performPatch(body: Record<string, unknown>) {
    const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, body);
    return response.json();
  }

  async function runSave(overrideISO?: string | null) {
    setIsSaving(true);
    try {
      const { body } = buildPayload(overrideISO);
      await performPatch(body);
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/anesthesia/surgeries');
        }
      });
      if (surgery?.hospitalId) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${surgery.hospitalId}`);
          }
        });
      }
      toast({
        title: t('anesthesia.editSurgery.surgeryUpdated'),
        description: t('anesthesia.editSurgery.surgeryUpdatedDescription'),
      });
      onClose();
    } catch {
      toast({
        title: t('common.updateFailed'),
        description: t('anesthesia.editSurgery.failedToUpdate'),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/archive`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/anesthesia/surgeries');
        }
      });
      if (surgery?.hospitalId) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${surgery.hospitalId}`);
          }
        });
      }
      toast({
        title: t('anesthesia.editSurgery.surgeryArchived', 'Surgery archived'),
        description: t('anesthesia.editSurgery.surgeryArchivedDescription', 'Surgery has been moved to archive'),
      });
      onClose();
    },
    onError: () => {
      toast({
        title: t('anesthesia.editSurgery.archiveFailed', 'Archive Failed'),
        description: t('anesthesia.editSurgery.archiveFailedDescription', 'Failed to archive surgery. Please try again.'),
        variant: "destructive",
      });
    },
  });

  const suspendMutation = useMutation({
    mutationFn: async (data: { isSuspended: boolean; suspendedReason: string | null }) => {
      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes('/api/anesthesia/surgeries');
        }
      });
      if (surgery?.hospitalId) {
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${surgery.hospitalId}`);
          }
        });
      }
      toast({
        title: surgery?.isSuspended
          ? t('anesthesia.editSurgery.suspendReactivated', 'Surgery reactivated')
          : t('anesthesia.editSurgery.suspendSuspended', 'Surgery suspended'),
        description: surgery?.isSuspended
          ? t('anesthesia.editSurgery.suspendReactivatedDescription', 'The surgery has been reactivated successfully.')
          : t('anesthesia.editSurgery.suspendSuspendedDescription', 'The surgery has been marked as suspended.'),
      });
      setShowSuspendDialog(false);
      setSuspendReason("");
      onClose();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('anesthesia.editSurgery.suspendFailed', 'Failed to update surgery suspension status.'),
        variant: "destructive",
      });
    },
  });

  const handleUpdate = () => {
    const isSlotReservation = !surgery?.patientId && !selectedPatientId;
    if (!surgeryDate || !startTime || !surgeryRoomId || (!isSlotReservation && !plannedSurgery)) {
      toast({
        title: t('common.missingInformation'),
        description: t('common.pleaseFillRequiredFields'),
        variant: "destructive",
      });
      return;
    }

    const { newPlannedDate } = buildPayload();
    const oldAdmissionTime = surgery?.admissionTime ? new Date(surgery.admissionTime) : null;
    const oldPlannedDate = surgery?.plannedDate ? new Date(surgery.plannedDate) : null;

    const result = checkAdmissionCongruence({
      oldPlannedDate,
      oldAdmissionTime,
      newPlannedDate,
      defaultOffsetMinutes,
      hospitalTimeZone,
    });

    if (result.severity === "invalid") {
      setCongruencePending({ newPlannedDate, result });
      return;
    }

    runSave();
  };

  const handleArchive = () => {
    setShowArchiveConfirm(true);
  };

  const confirmArchive = () => {
    archiveMutation.mutate();
  };

  if (!surgeryId) return null;

  const isSlotReservation = !surgery?.patientId && !selectedPatientId;
  const isRoomBlock = surgery?.plannedSurgery === '__ROOM_BLOCK__';

  return (
    <>
      <Dialog open={!!surgeryId} onOpenChange={() => onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 overflow-hidden" data-testid="dialog-edit-surgery">
          <div className="p-6 border-b shrink-0">
            <DialogHeader>
              <DialogTitle>{t('anesthesia.editSurgery.title')}</DialogTitle>
            </DialogHeader>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
              <div className="px-6 border-b shrink-0">
                <TabsList className="w-full justify-start h-auto p-0 bg-transparent">
                  <TabsTrigger
                    value="details"
                    className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2"
                    data-testid="tab-details"
                  >
                    <FileEdit className="h-4 w-4" />
                    {t('anesthesia.editSurgery.details', 'Details')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="checklist"
                    className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2"
                    data-testid="tab-checklist"
                  >
                    <ClipboardList className="h-4 w-4" />
                    {t('anesthesia.editSurgery.checklist', 'Checklist')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="casenotes"
                    className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none pb-2"
                    data-testid="tab-casenotes"
                  >
                    <StickyNote className="h-4 w-4" />
                    {t('anesthesia.caseNotes.title', 'Case Notes')}
                    {caseNotes.length > 0 && (
                      <span className="ml-1 text-xs bg-muted rounded-full px-1.5 py-0.5">{caseNotes.length}</span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="details" className="space-y-4 px-6 py-4 overflow-y-auto overflow-x-hidden flex-1 min-h-0 mt-0">
                {/* Read-only banner for guests */}
                {!canWrite && (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
                    <Eye className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">{t('common.viewOnlyMode')}</p>
                      <p className="text-sm text-amber-600 dark:text-amber-400">{t('common.readOnlyAccess')}</p>
                    </div>
                  </div>
                )}
                {/* Suspended banner */}
                {surgery?.isSuspended && (
                  <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-700 rounded-lg p-4 flex items-start gap-3" data-testid="banner-surgery-suspended">
                    <Ban className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-amber-800 dark:text-amber-200 uppercase tracking-wide text-sm">
                        {t('anesthesia.editSurgery.suspendBannerTitle', 'ABGESETZT')}
                      </p>
                      {surgery.suspendedReason && (
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">{surgery.suspendedReason}</p>
                      )}
                    </div>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
                        onClick={() => suspendMutation.mutate({ isSuspended: false, suspendedReason: null })}
                        disabled={suspendMutation.isPending}
                        data-testid="button-unsuspend-banner"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                        {t('anesthesia.editSurgery.suspendReactivate', 'Reaktivieren')}
                      </Button>
                    )}
                  </div>
                )}
                {/* Patient Information (Read-only) or Slot Reserved banner */}
                {!surgery?.patientId ? (
                  <div className="space-y-2">
                    <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-950/20 p-3">
                      <span className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                        {t('opCalendar.slotReserved', 'SLOT RESERVED')}
                      </span>
                    </div>
                    {canWrite && (
                      <div>
                        <Label>{t('anesthesia.surgerySummary.assignPatient', 'Assign Patient')}</Label>
                        <div className="flex gap-2 mt-1">
                          <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={patientSearchOpen}
                                className="flex-1 justify-between"
                                data-testid="button-select-patient-edit"
                              >
                                {selectedPatient
                                  ? `${selectedPatient.surname}, ${selectedPatient.firstName}`
                                  : t('anesthesia.quickSchedule.selectPatient', 'Select patient...')}
                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0">
                              <Command>
                                <CommandInput placeholder={t('anesthesia.quickSchedule.searchPatients', 'Search patients...')} />
                                <CommandList>
                                  <CommandEmpty>{t('anesthesia.quickSchedule.noPatientsFound', 'No patients found')}</CommandEmpty>
                                  <CommandGroup>
                                    {patients.map((p: any) => (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.surname} ${p.firstName} ${p.birthday || ''}`}
                                        onSelect={() => {
                                          setSelectedPatientId(p.id);
                                          setPatientSearchOpen(false);
                                        }}
                                        data-testid={`patient-option-${p.id}`}
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-4 w-4",
                                            selectedPatientId === p.id ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {p.surname}, {p.firstName} ({p.birthday ? formatDate(new Date(p.birthday)) : 'N/A'})
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                    )}
                  </div>
                ) : patient ? (
                <div className="space-y-2">
                  <Label>{t('anesthesia.editSurgery.patient')}</Label>
                  <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
                    <div className="font-medium">
                      {patient.surname}, {patient.firstName}
                    </div>
                    {patient.birthday && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('anesthesia.editSurgery.born')}: {formatDate(new Date(patient.birthday))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {/* Surgery Status */}
              {surgery?.status === 'cancelled' || surgeryStatus !== surgery?.status ? (
                <div className="space-y-2">
                  <Label>{t('anesthesia.editSurgery.status', 'Status')}</Label>
                  <Select value={surgeryStatus} onValueChange={(v) => setSurgeryStatus(v as typeof surgeryStatus)}>
                    <SelectTrigger data-testid="select-surgery-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planned">{t('anesthesia.editSurgery.statusPlanned', 'Planned')}</SelectItem>
                      <SelectItem value="cancelled">{t('anesthesia.editSurgery.statusCancelled', 'Cancelled')}</SelectItem>
                      <SelectItem value="in-progress">{t('anesthesia.editSurgery.statusInProgress', 'In Progress')}</SelectItem>
                      <SelectItem value="completed">{t('anesthesia.editSurgery.statusCompleted', 'Completed')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {/* Shared Surgery Form Fields */}
              <SurgeryFormFields
                surgeryRoomId={surgeryRoomId}
                surgeryDate={surgeryDate}
                startTime={startTime}
                duration={duration}
                admissionTime={admissionTime}
                plannedSurgery={plannedSurgery}
                selectedChopCode={selectedChopCode}
                surgeonId={surgeonId}
                notes={notes}
                diagnosis={diagnosis}
                coverageType={coverageType}
                stayType={stayType}
                implantDetails={implantDetails}
                surgerySide={surgerySide}
                noPreOpRequired={noPreOpRequired}
                antibioseProphylaxe={antibioseProphylaxe}
                patientPosition={patientPosition}
                leftArmPosition={leftArmPosition}
                rightArmPosition={rightArmPosition}
                onSurgeryRoomIdChange={setSurgeryRoomId}
                onSurgeryDateChange={setSurgeryDate}
                onStartTimeChange={setStartTime}
                onDurationChange={setDuration}
                onAdmissionTimeChange={setAdmissionTime}
                onPlannedSurgeryChange={setPlannedSurgery}
                onSelectedChopCodeChange={setSelectedChopCode}
                onSurgeonIdChange={setSurgeonId}
                onNotesChange={setNotes}
                onDiagnosisChange={setDiagnosis}
                onCoverageTypeChange={setCoverageType}
                onStayTypeChange={setStayType}
                onImplantDetailsChange={setImplantDetails}
                onSurgerySideChange={(v) => setSurgerySide(v as typeof surgerySide)}
                onNoPreOpRequiredChange={setNoPreOpRequired}
                onAntibioseProphylaxeChange={setAntibioseProphylaxe}
                onPatientPositionChange={(v) => setPatientPosition(v as typeof patientPosition)}
                onLeftArmPositionChange={(v) => setLeftArmPosition(v as typeof leftArmPosition)}
                onRightArmPositionChange={(v) => setRightArmPosition(v as typeof rightArmPosition)}
                surgeryRooms={surgeryRooms}
                surgeons={surgeons}
                hospitalId={surgery?.hospitalId || ""}
                isSlotReservation={isSlotReservation}
                isRoomBlock={isRoomBlock}
                assistantIds={assistantIds}
                onAssistantIdsChange={setAssistantIds}
                disabled={!canWrite}
                testIdPrefix="edit-"
              />

              </TabsContent>

              <TabsContent value="checklist" className="px-6 py-4 overflow-y-auto flex-1 min-h-0 mt-0">
                {surgery && (
                  <SurgeonChecklistTab
                    surgeryId={surgeryId!}
                    hospitalId={surgery.hospitalId}
                    surgeryContext={{
                      price: surgery.price,
                      admissionTime: surgery.admissionTime,
                      plannedDate: surgery.plannedDate,
                      plannedSurgery: surgery.plannedSurgery,
                      surgeonName: surgery.surgeon || surgeons.find((s: any) => s.id === surgery.surgeonId)?.name,
                      patientName: patient ? `${patient.firstName} ${patient.surname}` : (surgery.patientId ? undefined : t('opCalendar.slotReserved', 'SLOT RESERVED')),
                      patientDob: patient?.birthday ?? undefined,
                      surgeryRoom: surgeryRooms.find((r: any) => r.id === surgery.surgeryRoomId)?.name,
                      notes: surgery.notes,
                      implantDetails: surgery.implantDetails,
                    } as SurgeryContext}
                    canWrite={canWrite}
                  />
                )}
              </TabsContent>

              <TabsContent value="casenotes" className="px-6 py-4 overflow-y-auto flex-1 min-h-0 mt-0">
                <div className="space-y-4">
                  {/* Add new note */}
                  {canWrite && (
                    <div className="space-y-2">
                      <Textarea
                        placeholder={t('anesthesia.caseNotes.placeholder', 'Add a case note...')}
                        value={newNoteContent}
                        onChange={(e) => setNewNoteContent(e.target.value)}
                        rows={3}
                        data-testid="textarea-new-case-note"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (newNoteContent.trim()) {
                            createNoteMutation.mutate(newNoteContent.trim());
                          }
                        }}
                        disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                        data-testid="button-add-case-note"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        {t('anesthesia.caseNotes.addNote', 'Add Note')}
                      </Button>
                    </div>
                  )}

                  {/* Notes list */}
                  {isNotesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : caseNotes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>{t('anesthesia.caseNotes.noNotes', 'No case notes yet')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {caseNotes.map((note: any) => (
                        <div
                          key={note.id}
                          className="border rounded-lg p-3 space-y-2 group"
                          data-testid={`case-note-${note.id}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Avatar className="h-6 w-6">
                                <AvatarFallback className="text-xs">
                                  {getInitials(note.author?.firstName, note.author?.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                  {note.author?.firstName} {note.author?.lastName}
                                </span>
                                <span className="mx-1">&bull;</span>
                                {note.createdAt && formatDateTime(new Date(note.createdAt))}
                                {note.updatedAt && note.updatedAt !== note.createdAt && (
                                  <span className="ml-1 italic">({t('common.edited', 'edited')})</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => createTodo(note.content, patient?.id ?? undefined, patient ? `${patient.surname}, ${patient.firstName}` : undefined)}
                                disabled={isTodoPending}
                                title={t('anesthesia.caseNotes.addToTodo', 'Add to To-Do')}
                                data-testid={`button-note-to-todo-${note.id}`}
                              >
                                <ListTodo className="h-3.5 w-3.5" />
                              </Button>
                              {canWrite && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => {
                                      setEditingNoteId(note.id);
                                      setEditingNoteContent(note.content);
                                    }}
                                    title={t('common.edit', 'Edit')}
                                    data-testid={`button-edit-note-${note.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteNoteMutation.mutate(note.id)}
                                    disabled={deleteNoteMutation.isPending}
                                    title={t('common.delete', 'Delete')}
                                    data-testid={`button-delete-note-${note.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          {editingNoteId === note.id ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingNoteContent}
                                onChange={(e) => setEditingNoteContent(e.target.value)}
                                rows={3}
                                data-testid="textarea-edit-case-note"
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (editingNoteContent.trim()) {
                                      updateNoteMutation.mutate({ noteId: note.id, content: editingNoteContent.trim() });
                                    }
                                  }}
                                  disabled={!editingNoteContent.trim() || updateNoteMutation.isPending}
                                  data-testid="button-save-note-edit"
                                >
                                  <Save className="h-4 w-4 mr-2" />
                                  {t('common.save', 'Save')}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingNoteId(null);
                                    setEditingNoteContent("");
                                  }}
                                  data-testid="button-cancel-note-edit"
                                >
                                  {t('common.cancel', 'Cancel')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Sticky Action Buttons Footer */}
          {!isLoading && (
            <div className="sticky bottom-0 bg-background border-t p-4 shrink-0 flex flex-col sm:flex-row gap-2">
              {canWrite ? (
                <>
                  <Button
                    onClick={handleUpdate}
                    disabled={isSaving || archiveMutation.isPending}
                    data-testid="button-update-surgery"
                    className="w-full sm:flex-1"
                  >
                    {isSaving ? (
                      <>{t('anesthesia.editSurgery.updating')}</>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t('anesthesia.editSurgery.update')}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={onClose}
                    disabled={archiveMutation.isPending || isSaving || suspendMutation.isPending}
                    data-testid="button-cancel-surgery"
                    className="w-full sm:flex-1"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('common.cancel')}
                  </Button>
                  {surgery?.isSuspended ? (
                    <Button
                      variant="outline"
                      onClick={() => suspendMutation.mutate({ isSuspended: false, suspendedReason: null })}
                      disabled={archiveMutation.isPending || isSaving || suspendMutation.isPending}
                      data-testid="button-unsuspend-surgery"
                      className="w-full sm:flex-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-950"
                    >
                      {suspendMutation.isPending ? (
                        <>{t('anesthesia.editSurgery.suspendReactivating', 'Reactivating...')}</>
                      ) : (
                        <>
                          <RotateCcw className="mr-2 h-4 w-4" />
                          {t('anesthesia.editSurgery.suspendReactivate', 'Reaktivieren')}
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setShowSuspendDialog(true)}
                      disabled={archiveMutation.isPending || isSaving || suspendMutation.isPending}
                      data-testid="button-suspend-surgery"
                      className="w-full sm:flex-1 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950"
                    >
                      <Ban className="mr-2 h-4 w-4" />
                      {t('anesthesia.editSurgery.suspendButton', 'Absetzen')}
                    </Button>
                  )}
                  {canPlanOps && (
                    <Button
                      variant="outline"
                      onClick={handleArchive}
                      disabled={archiveMutation.isPending || isSaving || suspendMutation.isPending}
                      data-testid="button-archive-surgery"
                      className="w-full sm:flex-1"
                    >
                      {archiveMutation.isPending ? (
                        <>{t('anesthesia.editSurgery.archiving', 'Archiving...')}</>
                      ) : (
                        <>
                          <Archive className="mr-2 h-4 w-4" />
                          {t('anesthesia.editSurgery.archiveSurgery', 'Archive')}
                        </>
                      )}
                    </Button>
                  )}
                </>
              ) : (
                <Button
                  variant="outline"
                  onClick={onClose}
                  data-testid="button-close-surgery"
                  className="w-full"
                >
                  <X className="mr-2 h-4 w-4" />
                  {t('common.close')}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveConfirm} onOpenChange={(open) => {
        setShowArchiveConfirm(open);
        if (!open) setArchiveConfirmText("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.editSurgery.confirmArchive', 'Archive Surgery?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.editSurgery.confirmArchiveMessage', 'This surgery will be moved to the archive. All associated records will be preserved.')}
              <br /><br />
              <strong>{t('anesthesia.editSurgery.typeArchiveToConfirm', 'Type ARCHIVE to confirm:')}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2">
            <Input
              value={archiveConfirmText}
              onChange={(e) => setArchiveConfirmText(e.target.value)}
              placeholder="ARCHIVE"
              data-testid="input-archive-confirm"
              autoComplete="off"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchive}
              disabled={archiveConfirmText !== "ARCHIVE"}
              data-testid="button-confirm-archive"
            >
              {t('anesthesia.editSurgery.archiveSurgery', 'Archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admission Congruence Dialog */}
      <AdmissionCongruenceDialog
        open={!!congruencePending}
        result={congruencePending?.result ?? null}
        currentAdmission={surgery?.admissionTime ? new Date(surgery.admissionTime) : null}
        newPlannedDate={congruencePending?.newPlannedDate ?? new Date()}
        hospitalTimeZone={hospitalTimeZone}
        onResolve={(choice: AdmissionCongruenceChoice) => {
          const pending = congruencePending;
          setCongruencePending(null);
          if (!pending) return;
          if (choice.kind === "cancel") return;
          if (choice.kind === "useSuggested") {
            runSave(pending.result.suggestedAdmission.toISOString());
          } else if (choice.kind === "custom") {
            runSave(choice.admissionTime.toISOString());
          } else if (choice.kind === "keepCurrent") {
            runSave();
          }
        }}
      />

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={showSuspendDialog} onOpenChange={(open) => {
        setShowSuspendDialog(open);
        if (!open) setSuspendReason("");
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.editSurgery.suspendConfirmTitle', 'OP absetzen?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.editSurgery.suspendConfirmDescription', 'The surgery will stay on the plan but will be marked as suspended. No SMS reminder will be sent for suspended surgeries.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label htmlFor="suspend-reason" className="text-sm font-medium">
              {t('anesthesia.editSurgery.suspendReasonLabel', 'Reason (optional)')}
            </Label>
            <Textarea
              id="suspend-reason"
              placeholder={t('anesthesia.editSurgery.suspendReasonPlaceholder', 'Enter reason for suspension...')}
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              className="mt-2"
              data-testid="textarea-suspend-reason"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-suspend">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => suspendMutation.mutate({ isSuspended: true, suspendedReason: suspendReason || null })}
              disabled={suspendMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              data-testid="button-confirm-suspend"
            >
              {suspendMutation.isPending
                ? t('anesthesia.editSurgery.suspendSuspending', 'Suspending...')
                : t('anesthesia.editSurgery.suspendConfirmAction', 'Absetzen')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
