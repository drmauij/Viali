import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface QuickCreateSurgeryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  initialDate: Date;
  initialEndDate?: Date;
  initialRoomId?: string;
  surgeryRooms: any[];
}

export default function QuickCreateSurgeryDialog({
  open,
  onOpenChange,
  hospitalId,
  initialDate,
  initialEndDate,
  initialRoomId,
  surgeryRooms,
}: QuickCreateSurgeryDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  
  // Helper to format date for datetime-local input (preserves local timezone)
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Calculate default duration in minutes (3 hours = 180 minutes)
  const getDefaultDuration = () => {
    if (initialEndDate) {
      const diffMs = initialEndDate.getTime() - initialDate.getTime();
      return Math.round(diffMs / (1000 * 60)); // Convert ms to minutes
    }
    return 180; // Default 3 hours
  };

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [surgeryRoomId, setSurgeryRoomId] = useState(initialRoomId || "");
  const [plannedDate, setPlannedDate] = useState(formatDateTimeLocal(initialDate));
  const [duration, setDuration] = useState<number>(getDefaultDuration());
  const [admissionTime, setAdmissionTime] = useState("");
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [surgeonId, setSurgeonId] = useState("");
  const [notes, setNotes] = useState("");
  
  // New patient form state
  const [newPatientFirstName, setNewPatientFirstName] = useState("");
  const [newPatientSurname, setNewPatientSurname] = useState("");
  const [newPatientDOB, setNewPatientDOB] = useState("");
  const [newPatientGender, setNewPatientGender] = useState("m");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");

  // Helper to format date for display (DD/MM/YYYY)
  const formatDate = (isoDate: string): string => {
    const date = new Date(isoDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Parse birthday from various formats (dd.mm.yy, dd.mm.yyyy) to ISO format (yyyy-mm-dd)
  const parseBirthday = (input: string): string | null => {
    const trimmed = input.trim();
    
    // Match dd.mm.yy or dd.mm.yyyy
    const match = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (!match) return null;
    
    let [, day, month, year] = match;
    
    // Convert 2-digit year to 4-digit (yy -> 19yy or 20yy)
    if (year.length === 2) {
      const twoDigitYear = parseInt(year);
      // If year is > 30, assume 19xx, otherwise 20xx
      year = twoDigitYear > 30 ? `19${year}` : `20${year}`;
    }
    
    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);
    
    // Basic range validation
    if (dayNum < 1 || dayNum > 31) return null;
    if (monthNum < 1 || monthNum > 12) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;
    
    // Validate that the date actually exists (e.g., reject 31.02.1995, 29.02.2001)
    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (
      testDate.getFullYear() !== yearNum ||
      testDate.getMonth() !== monthNum - 1 ||
      testDate.getDate() !== dayNum
    ) {
      return null; // Invalid date (e.g., Feb 31, non-leap-year Feb 29)
    }
    
    // Pad day and month with leading zeros for ISO format
    day = day.padStart(2, '0');
    month = month.padStart(2, '0');
    
    // Return ISO format yyyy-mm-dd
    return `${year}-${month}-${day}`;
  };

  const handleBirthdayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    setBirthdayInput(input);
    
    const parsed = parseBirthday(input);
    if (parsed) {
      setNewPatientDOB(parsed);
    } else if (input.trim() === "") {
      setNewPatientDOB("");
    }
  };

  // Update form when props change (e.g., when user drags to select time range)
  useEffect(() => {
    if (open) {
      setPlannedDate(formatDateTimeLocal(initialDate));
      setSurgeryRoomId(initialRoomId || "");
      setDuration(getDefaultDuration());
    }
  }, [open, initialDate, initialEndDate, initialRoomId]);

  // Fetch patients
  const { data: patients = [] } = useQuery<any[]>({
    queryKey: [`/api/patients?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  // Fetch surgeons for the hospital
  const {
    data: surgeons = [],
    isLoading: isLoadingSurgeons
  } = useQuery<Array<{id: string; name: string; email: string | null}>>({
    queryKey: [`/api/surgeons?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

  // Create patient mutation
  const createPatientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: [`/api/patients?hospitalId=${hospitalId}`] });
      setSelectedPatientId(newPatient.id);
      setShowNewPatientForm(false);
      toast({
        title: t('anesthesia.quickSchedule.patientCreated'),
        description: t('anesthesia.quickSchedule.patientCreatedDescription'),
      });
    },
    onError: () => {
      toast({
        title: t('anesthesia.quickSchedule.creationFailed'),
        description: t('anesthesia.quickSchedule.creationFailedDescription'),
        variant: "destructive",
      });
    },
  });

  // Create surgery mutation
  const createSurgeryMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/anesthesia/surgeries", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/anesthesia/surgeries`] });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/anesthesia/preop?hospitalId=${hospitalId}`);
        }
      });
      toast({
        title: t('anesthesia.quickSchedule.surgeryScheduled'),
        description: t('anesthesia.quickSchedule.surgeryScheduledDescription'),
      });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({
        title: t('anesthesia.quickSchedule.schedulingFailed'),
        description: t('anesthesia.quickSchedule.schedulingFailedDescription'),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedPatientId("");
    setSurgeryRoomId(initialRoomId || "");
    setPlannedDate(formatDateTimeLocal(initialDate));
    setDuration(getDefaultDuration());
    setAdmissionTime("");
    setPlannedSurgery("");
    setSurgeonId("");
    setNotes("");
    setShowNewPatientForm(false);
    setNewPatientFirstName("");
    setNewPatientSurname("");
    setNewPatientDOB("");
    setNewPatientGender("m");
    setNewPatientPhone("");
    setBirthdayInput("");
  };

  const handleCreatePatient = () => {
    if (!newPatientFirstName.trim() || !newPatientSurname.trim() || !newPatientDOB) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation'),
        description: t('anesthesia.quickSchedule.missingPatientFields'),
        variant: "destructive",
      });
      return;
    }

    createPatientMutation.mutate({
      hospitalId,
      firstName: newPatientFirstName.trim(),
      surname: newPatientSurname.trim(),
      birthday: newPatientDOB,
      sex: newPatientGender.toUpperCase(),
      phone: newPatientPhone.trim() || undefined,
    });
  };

  const handleCreateSurgery = () => {
    if (!selectedPatientId || !surgeryRoomId || !plannedSurgery.trim()) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation'),
        description: t('anesthesia.quickSchedule.missingFields'),
        variant: "destructive",
      });
      return;
    }

    // Validate duration
    if (!duration || duration <= 0) {
      toast({
        title: t('anesthesia.quickSchedule.invalidDuration'),
        description: t('anesthesia.quickSchedule.invalidDurationDescription'),
        variant: "destructive",
      });
      return;
    }

    // Calculate end time from start time + duration
    // Parse datetime-local input as local time, not UTC
    // Input format: "2025-11-04T12:00"
    const [datePart, timePart] = plannedDate.split('T');
    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);
    
    // Create Date in local timezone
    const startDate = new Date(year, month - 1, day, hour, minute);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const matchedSurgeon = surgeons.find(s => s.id === surgeonId);
    
    let admissionTimeISO = undefined;
    if (admissionTime) {
      const [admDatePart, admTimePart] = admissionTime.split('T');
      const [admYear, admMonth, admDay] = admDatePart.split('-').map(Number);
      const [admHour, admMinute] = admTimePart.split(':').map(Number);
      const admissionDate = new Date(admYear, admMonth - 1, admDay, admHour, admMinute);
      admissionTimeISO = admissionDate.toISOString();
    }

    createSurgeryMutation.mutate({
      hospitalId,
      patientId: selectedPatientId,
      surgeryRoomId,
      plannedDate: startDate.toISOString(),
      actualEndTime: endDate.toISOString(),
      plannedSurgery: plannedSurgery.trim(),
      surgeon: matchedSurgeon?.name || undefined,
      surgeonId: surgeonId || undefined,
      notes: notes.trim() || undefined,
      admissionTime: admissionTimeISO,
      status: "planned",
    });
  };

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] overflow-y-auto p-4 sm:p-6" data-testid="dialog-quick-create-surgery">
        <DialogHeader>
          <DialogTitle>{t('anesthesia.quickSchedule.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Patient Selection */}
          <div className="space-y-2">
            <Label>{t('anesthesia.quickSchedule.patient')} *</Label>
            {!showNewPatientForm ? (
              <div className="flex gap-2">
                <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={patientSearchOpen}
                      className="flex-1 justify-between"
                      data-testid="button-select-patient"
                    >
                      {selectedPatient
                        ? `${selectedPatient.surname}, ${selectedPatient.firstName}`
                        : t('anesthesia.quickSchedule.selectPatient')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder={t('anesthesia.quickSchedule.searchPatients')} />
                      <CommandList>
                        <CommandEmpty>{t('anesthesia.quickSchedule.noPatientsFound')}</CommandEmpty>
                        <CommandGroup>
                          {patients.map((patient) => (
                            <CommandItem
                              key={patient.id}
                              value={`${patient.surname} ${patient.firstName}`}
                              onSelect={() => {
                                setSelectedPatientId(patient.id);
                                setPatientSearchOpen(false);
                              }}
                              data-testid={`patient-option-${patient.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedPatientId === patient.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {patient.surname}, {patient.firstName} ({patient.birthday ? new Date(patient.birthday).toLocaleDateString() : 'N/A'})
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewPatientForm(true)}
                  data-testid="button-show-new-patient"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t('anesthesia.quickSchedule.newPatient')}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewPatientForm(false)}
                    data-testid="button-cancel-new-patient"
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-firstname">{t('anesthesia.quickSchedule.firstName')} *</Label>
                    <Input
                      id="new-patient-firstname"
                      value={newPatientFirstName}
                      onChange={(e) => setNewPatientFirstName(e.target.value)}
                      data-testid="input-new-patient-firstname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-surname">{t('anesthesia.quickSchedule.surname')} *</Label>
                    <Input
                      id="new-patient-surname"
                      value={newPatientSurname}
                      onChange={(e) => setNewPatientSurname(e.target.value)}
                      data-testid="input-new-patient-surname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-dob">{t('anesthesia.quickSchedule.dateOfBirth')} *</Label>
                    <Input
                      id="new-patient-dob"
                      type="text"
                      placeholder={t('anesthesia.quickSchedule.dobPlaceholder')}
                      value={birthdayInput}
                      onChange={handleBirthdayChange}
                      data-testid="input-new-patient-dob"
                      className={birthdayInput && !newPatientDOB ? "border-destructive" : ""}
                    />
                    {birthdayInput && newPatientDOB && (
                      <div className="text-xs text-muted-foreground">
                        {formatDate(newPatientDOB)}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-patient-gender">{t('anesthesia.quickSchedule.gender')}</Label>
                    <Select value={newPatientGender} onValueChange={setNewPatientGender}>
                      <SelectTrigger id="new-patient-gender" data-testid="select-new-patient-gender">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="m">{t('anesthesia.quickSchedule.male')}</SelectItem>
                        <SelectItem value="f">{t('anesthesia.quickSchedule.female')}</SelectItem>
                        <SelectItem value="o">{t('anesthesia.quickSchedule.other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="new-patient-phone">{t('anesthesia.quickSchedule.phone')}</Label>
                    <Input
                      id="new-patient-phone"
                      type="tel"
                      placeholder={t('anesthesia.quickSchedule.phonePlaceholder')}
                      value={newPatientPhone}
                      onChange={(e) => setNewPatientPhone(e.target.value)}
                      data-testid="input-new-patient-phone"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreatePatient}
                  disabled={createPatientMutation.isPending}
                  className="w-full"
                  data-testid="button-create-patient"
                >
                  {createPatientMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('anesthesia.quickSchedule.createPatient')}
                </Button>
              </div>
            )}
          </div>

          {/* Surgery Room */}
          <div className="space-y-2">
            <Label htmlFor="surgery-room">{t('anesthesia.quickSchedule.surgeryRoom')} *</Label>
            <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId}>
              <SelectTrigger id="surgery-room" data-testid="select-surgery-room">
                <SelectValue placeholder={t('anesthesia.quickSchedule.selectRoom')} />
              </SelectTrigger>
              <SelectContent>
                {surgeryRooms.map((room) => (
                  <SelectItem key={room.id} value={room.id}>
                    {room.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Planned Date & Time */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '5fr 3fr' }}>
            <div className="space-y-2">
              <Label htmlFor="planned-date">{t('anesthesia.quickSchedule.startTime')} *</Label>
              <Input
                id="planned-date"
                type="datetime-local"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                data-testid="input-planned-date"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duration">{t('anesthesia.quickSchedule.duration')} *</Label>
              <Input
                id="duration"
                type="number"
                min="1"
                value={duration.toString()}
                onChange={(e) => setDuration(Number(e.target.value) || 0)}
                data-testid="input-duration"
              />
            </div>
          </div>

          {/* Admission Time */}
          <div className="space-y-2">
            <Label htmlFor="admission-time">{t('anesthesia.quickSchedule.admissionTime', 'Admission Time')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'optional')})</span></Label>
            <Input
              id="admission-time"
              type="datetime-local"
              value={admissionTime}
              onChange={(e) => setAdmissionTime(e.target.value)}
              data-testid="input-admission-time"
            />
          </div>

          {/* Planned Surgery */}
          <div className="space-y-2">
            <Label htmlFor="planned-surgery">{t('anesthesia.quickSchedule.plannedSurgery')} *</Label>
            <Input
              id="planned-surgery"
              placeholder={t('anesthesia.quickSchedule.plannedSurgeryPlaceholder')}
              value={plannedSurgery}
              onChange={(e) => setPlannedSurgery(e.target.value)}
              data-testid="input-planned-surgery"
            />
          </div>

          {/* Surgeon */}
          <div className="space-y-2">
            <Label htmlFor="surgeon">{t('anesthesia.quickSchedule.surgeon')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.surgeonOptional')})</span></Label>
            <Select 
              value={surgeonId || "none"} 
              onValueChange={(value) => setSurgeonId(value === "none" ? "" : value)}
              disabled={isLoadingSurgeons}
            >
              <SelectTrigger id="surgeon" data-testid="select-surgeon">
                <SelectValue placeholder={isLoadingSurgeons ? t('anesthesia.quickSchedule.loadingSurgeons') : t('anesthesia.quickSchedule.selectSurgeon')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">
                  <span className="text-muted-foreground italic">{t('anesthesia.quickSchedule.noSurgeonSelected')}</span>
                </SelectItem>
                {isLoadingSurgeons ? (
                  <SelectItem value="loading" disabled>
                    {t('anesthesia.quickSchedule.loadingSurgeons')}
                  </SelectItem>
                ) : surgeons.length === 0 ? (
                  <SelectItem value="no-surgeons" disabled>
                    {t('anesthesia.quickSchedule.noSurgeonsAvailable')}
                  </SelectItem>
                ) : (
                  surgeons.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">{t('anesthesia.quickSchedule.notes')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.notesOptional')})</span></Label>
            <Textarea
              id="notes"
              placeholder={t('anesthesia.quickSchedule.notesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              data-testid="textarea-notes"
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }}
            data-testid="button-cancel-surgery"
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleCreateSurgery}
            disabled={createSurgeryMutation.isPending || !selectedPatientId || !surgeryRoomId || !plannedSurgery.trim()}
            data-testid="button-schedule-surgery"
          >
            {createSurgeryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('anesthesia.quickSchedule.scheduleSurgery')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
