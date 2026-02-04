import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useCanWrite } from "@/hooks/useCanWrite";
import { useState, useEffect, useMemo } from "react";
import { Loader2, Archive, Save, X, Eye, ClipboardList, FileEdit, StickyNote, Plus, Pencil, Trash2, ListTodo, UserPlus, Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useCreateTodo } from "@/hooks/useCreateTodo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { SurgeonChecklistTab } from "./SurgeonChecklistTab";
import type { SurgeryContext } from "@shared/checklistPlaceholders";
import { parseFlexibleDate, isoToDisplayDate } from "@/lib/dateUtils";

interface EditSurgeryDialogProps {
  surgeryId: string | null;
  onClose: () => void;
}

export function EditSurgeryDialog({ surgeryId, onClose }: EditSurgeryDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const canWrite = useCanWrite();
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
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
  const [notes, setNotes] = useState("");
  const [implantDetails, setImplantDetails] = useState("");
  const [planningStatus, setPlanningStatus] = useState<"pre-registered" | "confirmed">("pre-registered");
  const [noPreOpRequired, setNoPreOpRequired] = useState(false);
  const [surgerySide, setSurgerySide] = useState<"left" | "right" | "both" | "">("");
  const [antibioseProphylaxe, setAntibioseProphylaxe] = useState(false);
  
  // CHOP procedure selector state
  const [selectedChopCode, setSelectedChopCode] = useState("");
  const [chopSearchTerm, setChopSearchTerm] = useState("");
  const [chopSearchOpen, setChopSearchOpen] = useState(false);

  // New surgeon form state
  const [showNewSurgeonForm, setShowNewSurgeonForm] = useState(false);
  const [surgeonSearchOpen, setSurgeonSearchOpen] = useState(false);
  const [newSurgeonFirstName, setNewSurgeonFirstName] = useState("");
  const [newSurgeonLastName, setNewSurgeonLastName] = useState("");
  const [newSurgeonPhone, setNewSurgeonPhone] = useState("");

  // Fetch surgery details
  const { data: surgery, isLoading } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

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

  // Sort surgeons alphabetically by surname
  const sortedSurgeons = useMemo(() => {
    return [...surgeons].sort((a, b) => {
      const getSurname = (name: string) => {
        const parts = (name || '').trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '';
      };
      return getSurname(a.name).localeCompare(getSurname(b.name));
    });
  }, [surgeons]);

  const selectedSurgeon = sortedSurgeons.find(s => s.id === surgeonId);

  // Debounced CHOP search - only search when user has typed 2+ characters
  const { data: chopProcedures = [], isLoading: isLoadingChop } = useQuery<Array<{
    id: string;
    code: string;
    descriptionDe: string;
    chapter: string | null;
    indentLevel: number | null;
    laterality: string | null;
  }>>({
    queryKey: ['/api/chop-procedures', chopSearchTerm],
    queryFn: async () => {
      if (chopSearchTerm.length < 2) return [];
      const response = await fetch(`/api/chop-procedures?search=${encodeURIComponent(chopSearchTerm)}&limit=30`);
      if (!response.ok) throw new Error('Failed to search procedures');
      return response.json();
    },
    enabled: chopSearchTerm.length >= 2,
    staleTime: 60000,
  });

  // Fetch units to find the surgery unit for creating new surgeons
  const { data: units = [] } = useQuery<Array<{id: string; name: string; type: string | null}>>({
    queryKey: [`/api/admin/${surgery?.hospitalId}/units`],
    enabled: !!surgery?.hospitalId && showNewSurgeonForm,
  });

  const surgeryUnit = units.find(u => u.type === 'or');

  // Create surgeon mutation (creates as staff member with doctor role in surgery unit)
  const createSurgeonMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone?: string }) => {
      if (!surgeryUnit || !surgery?.hospitalId) {
        throw new Error("No surgery unit found");
      }
      const dummyEmail = `surgeon_${crypto.randomUUID()}@internal.local`;
      const dummyPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');
      
      const response = await apiRequest("POST", `/api/admin/${surgery.hospitalId}/users/create`, {
        email: dummyEmail,
        password: dummyPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || undefined,
        unitId: surgeryUnit.id,
        role: "doctor",
        canLogin: false,
      });
      return response.json();
    },
    onSuccess: (newSurgeon) => {
      queryClient.invalidateQueries({ queryKey: [`/api/surgeons`, surgery?.hospitalId] });
      setSurgeonId(newSurgeon.id);
      setShowNewSurgeonForm(false);
      setNewSurgeonFirstName("");
      setNewSurgeonLastName("");
      setNewSurgeonPhone("");
      toast({
        title: t('anesthesia.quickSchedule.surgeonCreated', 'Surgeon created'),
        description: t('anesthesia.quickSchedule.surgeonCreatedDescription', 'New surgeon has been added'),
      });
    },
    onError: () => {
      toast({
        title: t('anesthesia.quickSchedule.creationFailed', 'Creation failed'),
        description: t('anesthesia.quickSchedule.surgeonCreationFailedDescription', 'Failed to create surgeon'),
        variant: "destructive",
      });
    },
  });

  const handleCreateSurgeon = () => {
    if (!newSurgeonFirstName.trim() || !newSurgeonLastName.trim()) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation', 'Missing information'),
        description: t('anesthesia.quickSchedule.missingSurgeonFields', 'First name and last name are required'),
        variant: "destructive",
      });
      return;
    }

    createSurgeonMutation.mutate({
      firstName: newSurgeonFirstName.trim(),
      lastName: newSurgeonLastName.trim(),
      phone: newSurgeonPhone.trim() || undefined,
    });
  };

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
      // Use local timezone methods for display
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
      setChopSearchTerm("");
      setSurgeryRoomId(surgery.surgeryRoomId || "");
      setSurgeonId(surgery.surgeonId || "");
      setNotes(surgery.notes || "");
      setImplantDetails(surgery.implantDetails || "");
      setPlanningStatus(surgery.planningStatus || "pre-registered");
      setNoPreOpRequired(surgery.noPreOpRequired || false);
      setSurgerySide(surgery.surgerySide || "");
      setAntibioseProphylaxe(surgery.antibioseProphylaxe || false);
      
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

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async () => {
      // Parse date and time separately
      const [year, month, day] = surgeryDate.split('-').map(Number);
      const [hour, minute] = startTime.split(':').map(Number);
      const startDate = new Date(year, month - 1, day, hour, minute);

      const endDate = new Date(startDate);
      endDate.setMinutes(endDate.getMinutes() + duration);

      const matchedSurgeon = surgeons.find((s: any) => s.id === surgeonId);
      
      let admissionTimeISO = null;
      if (admissionTime) {
        const [admHour, admMinute] = admissionTime.split(':').map(Number);
        const admissionDate = new Date(year, month - 1, day, admHour, admMinute);
        admissionTimeISO = admissionDate.toISOString();
      }

      const response = await apiRequest("PATCH", `/api/anesthesia/surgeries/${surgeryId}`, {
        plannedDate: startDate.toISOString(),
        actualEndTime: endDate.toISOString(),
        plannedSurgery,
        chopCode: selectedChopCode || null,
        surgeryRoomId,
        surgeon: matchedSurgeon?.name || null,
        surgeonId: surgeonId || null,
        notes: notes || null,
        admissionTime: admissionTimeISO,
        implantDetails: implantDetails || null,
        planningStatus,
        noPreOpRequired,
        surgerySide: surgerySide || null,
        antibioseProphylaxe,
      });
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all surgery queries (including patient-specific ones)
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
    },
    onError: () => {
      toast({
        title: t('common.updateFailed'),
        description: t('anesthesia.editSurgery.failedToUpdate'),
        variant: "destructive",
      });
    },
  });

  // Archive mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/anesthesia/surgeries/${surgeryId}/archive`);
      return response.json();
    },
    onSuccess: () => {
      // Invalidate all surgery queries (including patient-specific ones)
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

  const handleUpdate = () => {
    if (!surgeryDate || !startTime || !plannedSurgery || !surgeryRoomId) {
      toast({
        title: t('common.missingInformation'),
        description: t('common.pleaseFillRequiredFields'),
        variant: "destructive",
      });
      return;
    }
    updateMutation.mutate();
  };

  const handleArchive = () => {
    setShowArchiveConfirm(true);
  };

  const confirmArchive = () => {
    archiveMutation.mutate();
  };

  if (!surgeryId) return null;

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
                {/* Patient Information (Read-only) */}
                {patient && (
                <div className="space-y-2">
                  <Label>{t('anesthesia.editSurgery.patient')}</Label>
                  <div className="rounded-md border border-input bg-muted px-3 py-2 text-sm">
                    <div className="font-medium">
                      {patient.surname}, {patient.firstName}
                    </div>
                    {patient.birthday && (
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('anesthesia.editSurgery.born')}: {new Date(patient.birthday).toLocaleDateString('de-DE', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric' 
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Surgery Room */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgery-room">{t('anesthesia.editSurgery.surgeryRoom')} *</Label>
                <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId} disabled={!canWrite}>
                  <SelectTrigger id="edit-surgery-room" data-testid="select-edit-surgery-room">
                    <SelectValue placeholder="Select room..." />
                  </SelectTrigger>
                  <SelectContent>
                    {surgeryRooms.map((room: any) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Surgery Date */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgery-date">{t('anesthesia.editSurgery.date', 'Date')} *</Label>
                <Input
                  id="edit-surgery-date"
                  type="text"
                  placeholder="dd.MM.yyyy"
                  value={surgeryDate ? isoToDisplayDate(surgeryDate) : ''}
                  onChange={(e) => {
                    const value = e.target.value;
                    const parsed = parseFlexibleDate(value);
                    if (parsed) {
                      setSurgeryDate(parsed.isoDate);
                    } else {
                      setSurgeryDate(value);
                    }
                  }}
                  onBlur={(e) => {
                    const parsed = parseFlexibleDate(e.target.value);
                    if (parsed) {
                      setSurgeryDate(parsed.isoDate);
                    }
                  }}
                  disabled={!canWrite}
                  data-testid="input-edit-surgery-date"
                />
              </div>

              {/* Start Time, Admission Time & Duration */}
              <div className="flex gap-3 min-w-0">
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="edit-start-time">{t('anesthesia.editSurgery.startTime')} *</Label>
                  <Input
                    id="edit-start-time"
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    disabled={!canWrite}
                    data-testid="input-edit-start-time"
                  />
                </div>
                <div className="space-y-2 flex-1 min-w-0">
                  <Label htmlFor="edit-admission-time">{t('anesthesia.editSurgery.admissionTime', 'Admission')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.optional', 'opt.')})</span></Label>
                  <Input
                    id="edit-admission-time"
                    type="time"
                    value={admissionTime}
                    onChange={(e) => setAdmissionTime(e.target.value)}
                    disabled={!canWrite}
                    data-testid="input-edit-admission-time"
                  />
                </div>
                <div className="space-y-2 w-20 shrink-0">
                  <Label htmlFor="edit-duration">{t('anesthesia.editSurgery.duration')} *</Label>
                  <Input
                    id="edit-duration"
                    type="number"
                    min="1"
                    value={duration.toString()}
                    onChange={(e) => setDuration(Number(e.target.value) || 0)}
                    disabled={!canWrite}
                    data-testid="input-edit-duration"
                  />
                </div>
              </div>

              {/* Planned Surgery - CHOP Procedure Selector */}
              <div className="space-y-2">
                <Label>{t('anesthesia.editSurgery.plannedSurgery')} *</Label>
                <Popover open={chopSearchOpen} onOpenChange={(open) => canWrite && setChopSearchOpen(open)}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={chopSearchOpen}
                      className="w-full justify-between h-auto min-h-10 text-left font-normal"
                      disabled={!canWrite}
                      data-testid="select-edit-chop-procedure"
                    >
                      {plannedSurgery ? (
                        <div className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
                          <span className="text-sm whitespace-normal text-left">{plannedSurgery}</span>
                          {selectedChopCode && (
                            <span className="text-xs text-muted-foreground">CHOP: {selectedChopCode}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('anesthesia.quickSchedule.plannedSurgeryPlaceholder', 'Search or enter procedure...')}</span>
                      )}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[450px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder={t('anesthesia.quickSchedule.searchChopProcedure', 'Search CHOP procedures...')}
                        value={chopSearchTerm}
                        onValueChange={(value) => {
                          setChopSearchTerm(value);
                        }}
                        data-testid="input-edit-chop-search"
                      />
                      <CommandList className="max-h-[300px] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {chopSearchTerm.length < 2 ? (
                          <CommandEmpty className="py-4 px-2 text-center text-sm text-muted-foreground">
                            {t('anesthesia.quickSchedule.chopSearchHint', 'Type at least 2 characters to search CHOP procedures')}
                          </CommandEmpty>
                        ) : isLoadingChop ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : chopProcedures.length === 0 ? (
                          <CommandEmpty>
                            <div className="py-2 px-2 space-y-2">
                              <p className="text-sm">{t('anesthesia.quickSchedule.noChopResults', 'No CHOP procedures found')}</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="w-full"
                                onClick={() => {
                                  setPlannedSurgery(chopSearchTerm);
                                  setSelectedChopCode("");
                                  setChopSearchOpen(false);
                                }}
                                data-testid="button-edit-use-custom-surgery"
                              >
                                {t('anesthesia.quickSchedule.useCustomName', 'Use custom name: "{name}"').replace('{name}', chopSearchTerm)}
                              </Button>
                            </div>
                          </CommandEmpty>
                        ) : (
                          <CommandGroup>
                            {chopProcedures.map((proc) => (
                              <CommandItem
                                key={proc.id}
                                value={proc.code}
                                onSelect={() => {
                                  setPlannedSurgery(proc.descriptionDe);
                                  setSelectedChopCode(proc.code);
                                  setChopSearchOpen(false);
                                }}
                                className="flex flex-col items-start gap-0.5 cursor-pointer"
                                data-testid={`edit-chop-option-${proc.code}`}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      selectedChopCode === proc.code ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{proc.code}</span>
                                      {proc.laterality && (
                                        <span className="text-xs text-muted-foreground">({proc.laterality})</span>
                                      )}
                                    </div>
                                    <p className="text-sm whitespace-normal break-words">{proc.descriptionDe}</p>
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                            {chopSearchTerm.length >= 2 && (
                              <CommandItem
                                value="__custom__"
                                onSelect={() => {
                                  setPlannedSurgery(chopSearchTerm);
                                  setSelectedChopCode("");
                                  setChopSearchOpen(false);
                                }}
                                className="border-t mt-1 pt-2"
                                data-testid="edit-chop-option-custom"
                              >
                                <Check className="h-4 w-4 shrink-0 opacity-0" />
                                <span className="text-sm text-muted-foreground">
                                  {t('anesthesia.quickSchedule.useAsCustom', 'Use as custom entry: "{name}"').replace('{name}', chopSearchTerm)}
                                </span>
                              </CommandItem>
                            )}
                          </CommandGroup>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>

              {/* Surgery Side */}
              <div className="space-y-2">
                <Label>{t('anesthesia.surgerySide.label', 'Surgery Side')}</Label>
                <div className="flex gap-2 flex-wrap">
                  <label 
                    className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                      surgerySide === "left" 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-input bg-background hover:bg-accent"
                    } ${!canWrite ? "opacity-50 cursor-not-allowed" : ""}`}
                    data-testid="radio-edit-surgery-side-left"
                  >
                    <input
                      type="radio"
                      name="editSurgerySide"
                      value="left"
                      checked={surgerySide === "left"}
                      onChange={() => setSurgerySide("left")}
                      disabled={!canWrite}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{t('anesthesia.surgerySide.left', 'Left')}</span>
                  </label>
                  <label 
                    className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                      surgerySide === "right" 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-input bg-background hover:bg-accent"
                    } ${!canWrite ? "opacity-50 cursor-not-allowed" : ""}`}
                    data-testid="radio-edit-surgery-side-right"
                  >
                    <input
                      type="radio"
                      name="editSurgerySide"
                      value="right"
                      checked={surgerySide === "right"}
                      onChange={() => setSurgerySide("right")}
                      disabled={!canWrite}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{t('anesthesia.surgerySide.right', 'Right')}</span>
                  </label>
                  <label 
                    className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                      surgerySide === "both" 
                        ? "border-primary bg-primary/10 text-primary" 
                        : "border-input bg-background hover:bg-accent"
                    } ${!canWrite ? "opacity-50 cursor-not-allowed" : ""}`}
                    data-testid="radio-edit-surgery-side-both"
                  >
                    <input
                      type="radio"
                      name="editSurgerySide"
                      value="both"
                      checked={surgerySide === "both"}
                      onChange={() => setSurgerySide("both")}
                      disabled={!canWrite}
                      className="sr-only"
                    />
                    <span className="text-sm font-medium">{t('anesthesia.surgerySide.both', 'Both')}</span>
                  </label>
                  {surgerySide && canWrite && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSurgerySide("")}
                      className="text-xs min-h-[44px] px-3"
                    >
                      {t('common.clear', 'Clear')}
                    </Button>
                  )}
                </div>
              </div>

              {/* Antibiose Prophylaxe */}
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="edit-antibiose-prophylaxe"
                  checked={antibioseProphylaxe}
                  onCheckedChange={(checked) => setAntibioseProphylaxe(checked === true)}
                  disabled={!canWrite}
                  data-testid="checkbox-edit-antibiose-prophylaxe"
                />
                <Label 
                  htmlFor="edit-antibiose-prophylaxe" 
                  className="text-sm font-normal cursor-pointer"
                >
                  {t('anesthesia.antibioseProphylaxe', 'Antibiotic Prophylaxis Required')}
                </Label>
              </div>

              {/* No Anesthesia Pre-Op Required */}
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="edit-no-preop-required"
                  checked={noPreOpRequired}
                  onCheckedChange={(checked) => setNoPreOpRequired(checked === true)}
                  disabled={!canWrite}
                  data-testid="checkbox-edit-no-preop-required"
                />
                <Label 
                  htmlFor="edit-no-preop-required" 
                  className="text-sm font-normal cursor-pointer"
                >
                  {t('anesthesia.surgery.noAnesthesia', 'Without Anesthesia (local anesthesia only)')}
                </Label>
              </div>

              {/* Surgeon */}
              <div className="space-y-2">
                <Label htmlFor="edit-surgeon">{t('anesthesia.editSurgery.surgeon')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.surgeonOptional')})</span></Label>
                {!showNewSurgeonForm ? (
                  <div className="flex gap-2">
                    <Popover open={surgeonSearchOpen} onOpenChange={setSurgeonSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={surgeonSearchOpen}
                          className="flex-1 justify-between"
                          disabled={!canWrite}
                          data-testid="select-edit-surgeon"
                        >
                          {selectedSurgeon
                            ? selectedSurgeon.name
                            : t('anesthesia.editSurgery.noSurgeonSelected')}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[300px] p-0">
                        <Command>
                          <CommandInput placeholder={t('anesthesia.quickSchedule.searchSurgeons', 'Search surgeons...')} />
                          <CommandList>
                            <CommandEmpty>{t('anesthesia.quickSchedule.noSurgeonsAvailable')}</CommandEmpty>
                            <CommandGroup>
                              <CommandItem
                                value="none"
                                onSelect={() => {
                                  setSurgeonId("");
                                  setSurgeonSearchOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    !surgeonId ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <span className="text-muted-foreground italic">{t('anesthesia.editSurgery.noSurgeonSelected')}</span>
                              </CommandItem>
                              {sortedSurgeons.map((s: any) => (
                                <CommandItem
                                  key={s.id}
                                  value={s.name}
                                  onSelect={() => {
                                    setSurgeonId(s.id);
                                    setSurgeonSearchOpen(false);
                                  }}
                                  data-testid={`surgeon-option-${s.id}`}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      surgeonId === s.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {s.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {canWrite && (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setShowNewSurgeonForm(true)}
                        data-testid="button-show-new-surgeon-edit"
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="border rounded-md p-4 space-y-3">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-medium">{t('anesthesia.quickSchedule.newSurgeon', 'New Surgeon')}</h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowNewSurgeonForm(false)}
                        data-testid="button-cancel-new-surgeon-edit"
                      >
                        {t('common.cancel')}
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor="new-surgeon-firstname-edit">{t('anesthesia.quickSchedule.firstName')} *</Label>
                        <Input
                          id="new-surgeon-firstname-edit"
                          value={newSurgeonFirstName}
                          onChange={(e) => setNewSurgeonFirstName(e.target.value)}
                          data-testid="input-new-surgeon-firstname-edit"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="new-surgeon-lastname-edit">{t('anesthesia.quickSchedule.surname')} *</Label>
                        <Input
                          id="new-surgeon-lastname-edit"
                          value={newSurgeonLastName}
                          onChange={(e) => setNewSurgeonLastName(e.target.value)}
                          data-testid="input-new-surgeon-lastname-edit"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <Label htmlFor="new-surgeon-phone-edit">{t('anesthesia.quickSchedule.phone')}</Label>
                        <PhoneInputWithCountry
                          id="new-surgeon-phone-edit"
                          placeholder={t('anesthesia.quickSchedule.phonePlaceholder')}
                          value={newSurgeonPhone}
                          onChange={(value) => setNewSurgeonPhone(value)}
                          data-testid="input-new-surgeon-phone-edit"
                        />
                      </div>
                    </div>
                    <Button
                      onClick={handleCreateSurgeon}
                      disabled={createSurgeonMutation.isPending || !surgeryUnit}
                      className="w-full"
                      data-testid="button-create-surgeon-edit"
                    >
                      {createSurgeonMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('anesthesia.quickSchedule.createSurgeon', 'Create Surgeon')}
                    </Button>
                    {!surgeryUnit && units.length > 0 && (
                      <p className="text-xs text-destructive">{t('anesthesia.quickSchedule.noSurgeryUnit', 'No surgery unit found. Please configure a surgery module first.')}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Planning Status - Hidden for now
              <div className="space-y-2">
                <Label htmlFor="edit-planning-status">{t('anesthesia.editSurgery.planningStatus', 'Planning Status')}</Label>
                <Select 
                  value={planningStatus} 
                  onValueChange={(value) => setPlanningStatus(value as "pre-registered" | "confirmed")}
                  disabled={!canWrite}
                >
                  <SelectTrigger id="edit-planning-status" data-testid="select-edit-planning-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre-registered">{t('surgeryPlanning.planningStatus.pre-registered', 'Pre-Registered')}</SelectItem>
                    <SelectItem value="confirmed">{t('surgeryPlanning.planningStatus.confirmed', 'Confirmed')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              */}

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="edit-notes">{t('anesthesia.editSurgery.notes')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.notesOptional')})</span></Label>
                <Textarea
                  id="edit-notes"
                  placeholder={t('anesthesia.editSurgery.notesPlaceholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={!canWrite}
                  data-testid="textarea-edit-notes"
                  rows={3}
                />
              </div>

              {/* Implant Details */}
              <div className="space-y-2">
                <Label htmlFor="edit-implant-details">{t('anesthesia.editSurgery.implantDetails', 'Implant Details')} <span className="text-xs text-muted-foreground">({t('anesthesia.editSurgery.optional', 'opt.')})</span></Label>
                <Textarea
                  id="edit-implant-details"
                  placeholder={t('anesthesia.editSurgery.implantDetailsPlaceholder', 'e.g., Hip prosthesis model XYZ, Serial #12345')}
                  value={implantDetails}
                  onChange={(e) => setImplantDetails(e.target.value)}
                  disabled={!canWrite}
                  data-testid="textarea-edit-implant-details"
                  rows={3}
                />
              </div>

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
                      patientName: patient ? `${patient.firstName} ${patient.surname}` : undefined,
                      patientDob: patient?.birthday,
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
                                <span className="mx-1">•</span>
                                {note.createdAt && format(new Date(note.createdAt), 'dd.MM.yyyy HH:mm')}
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
                                onClick={() => createTodo(note.content, patient?.id, patient ? `${patient.surname}, ${patient.firstName}` : undefined)}
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
                    disabled={updateMutation.isPending || archiveMutation.isPending}
                    data-testid="button-update-surgery"
                    className="w-full sm:flex-1"
                  >
                    {updateMutation.isPending ? (
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
                    disabled={archiveMutation.isPending || updateMutation.isPending}
                    data-testid="button-cancel-surgery"
                    className="w-full sm:flex-1"
                  >
                    <X className="mr-2 h-4 w-4" />
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleArchive}
                    disabled={archiveMutation.isPending || updateMutation.isPending}
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
      <AlertDialog open={showArchiveConfirm} onOpenChange={setShowArchiveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('anesthesia.editSurgery.confirmArchive', 'Archive Surgery?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('anesthesia.editSurgery.confirmArchiveMessage', 'This surgery will be moved to the archive. All associated records will be preserved.')}
              <br /><br />
              <strong>{t('anesthesia.editSurgery.confirmArchiveInfo', 'Archived surgeries can be restored if needed.')}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-archive">{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmArchive}
              data-testid="button-confirm-archive"
            >
              {t('anesthesia.editSurgery.archiveSurgery', 'Archive')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
