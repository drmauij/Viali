import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { SurgeryFormFields } from "./SurgeryFormFields";

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
  const [isSlotReservation, setIsSlotReservation] = useState(false);
  const [isRoomBlock, setIsRoomBlock] = useState(false);
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);

  // Helper to format date for date input (preserves local timezone)
  const formatDateOnly = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Helper to format time for time input (preserves local timezone)
  const formatTimeOnly = (date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // Calculate default duration in minutes (3 hours = 180 minutes)
  const getDefaultDuration = () => {
    if (initialEndDate) {
      const diffMs = initialEndDate.getTime() - initialDate.getTime();
      return Math.round(diffMs / (1000 * 60));
    }
    return 180;
  };

  // Form state
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [surgeryRoomId, setSurgeryRoomId] = useState(initialRoomId || "");
  const [surgeryDate, setSurgeryDate] = useState(formatDateOnly(initialDate));
  const [startTime, setStartTime] = useState(formatTimeOnly(initialDate));
  const [duration, setDuration] = useState<number>(getDefaultDuration());
  const [admissionTime, setAdmissionTime] = useState("");
  const [plannedSurgery, setPlannedSurgery] = useState("");
  const [selectedChopCode, setSelectedChopCode] = useState("");
  const [surgeonId, setSurgeonId] = useState("");
  const [notes, setNotes] = useState("");
  const [implantDetails, setImplantDetails] = useState("");
  const [noPreOpRequired, setNoPreOpRequired] = useState(false);
  const [surgerySide, setSurgerySide] = useState<"left" | "right" | "both" | "">("");
  const [antibioseProphylaxe, setAntibioseProphylaxe] = useState(false);
  const [patientPosition, setPatientPosition] = useState<"" | "supine" | "trendelenburg" | "reverse_trendelenburg" | "lithotomy" | "lateral_decubitus" | "prone" | "jackknife" | "sitting" | "kidney" | "lloyd_davies">("");
  const [leftArmPosition, setLeftArmPosition] = useState<"" | "ausgelagert" | "angelagert">("");
  const [rightArmPosition, setRightArmPosition] = useState<"" | "ausgelagert" | "angelagert">("");

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

  // Parse birthday from various formats to ISO format (yyyy-mm-dd)
  const parseBirthday = (input: string): string | null => {
    const trimmed = input.trim();

    let day: string, month: string, year: string;

    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      [, day, month, year] = dotMatch;
    } else if (/^\d{8}$/.test(trimmed)) {
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 8);
    } else if (/^\d{6}$/.test(trimmed)) {
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 6);
    } else if (/^\d{4}$/.test(trimmed)) {
      day = trimmed.substring(0, 1);
      month = trimmed.substring(1, 2);
      year = trimmed.substring(2, 4);
    } else {
      return null;
    }

    if (year.length === 2) {
      const twoDigitYear = parseInt(year);
      year = twoDigitYear > 30 ? `19${year}` : `20${year}`;
    }

    const dayNum = parseInt(day);
    const monthNum = parseInt(month);
    const yearNum = parseInt(year);

    if (dayNum < 1 || dayNum > 31) return null;
    if (monthNum < 1 || monthNum > 12) return null;
    if (yearNum < 1900 || yearNum > 2100) return null;

    const testDate = new Date(yearNum, monthNum - 1, dayNum);
    if (
      testDate.getFullYear() !== yearNum ||
      testDate.getMonth() !== monthNum - 1 ||
      testDate.getDate() !== dayNum
    ) {
      return null;
    }

    day = day.padStart(2, '0');
    month = month.padStart(2, '0');

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
      setSurgeryDate(formatDateOnly(initialDate));
      setStartTime(formatTimeOnly(initialDate));
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
  const { data: surgeons = [] } = useQuery<Array<{id: string; name: string; email: string | null}>>({
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
    setIsSlotReservation(false);
    setIsRoomBlock(false);
    setSelectedPatientId("");
    setSurgeryRoomId(initialRoomId || "");
    setSurgeryDate(formatDateOnly(initialDate));
    setStartTime(formatTimeOnly(initialDate));
    setDuration(getDefaultDuration());
    setAdmissionTime("");
    setPlannedSurgery("");
    setSelectedChopCode("");
    setSurgeonId("");
    setNotes("");
    setImplantDetails("");
    setNoPreOpRequired(false);
    setSurgerySide("");
    setAntibioseProphylaxe(false);
    setPatientPosition("");
    setLeftArmPosition("");
    setRightArmPosition("");
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
    if (!isSlotReservation && (!selectedPatientId || !surgeryRoomId || !plannedSurgery.trim())) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation'),
        description: t('anesthesia.quickSchedule.missingFields'),
        variant: "destructive",
      });
      return;
    }

    if (isSlotReservation && !surgeryRoomId) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation'),
        description: t('anesthesia.quickSchedule.missingRoomForReservation', 'Please select a surgery room.'),
        variant: "destructive",
      });
      return;
    }

    if (!duration || duration <= 0) {
      toast({
        title: t('anesthesia.quickSchedule.invalidDuration'),
        description: t('anesthesia.quickSchedule.invalidDurationDescription'),
        variant: "destructive",
      });
      return;
    }

    const [year, month, day] = surgeryDate.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);

    const startDate = new Date(year, month - 1, day, hour, minute);
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + duration);

    const matchedSurgeon = surgeons.find(s => s.id === surgeonId);

    let admissionTimeISO = undefined;
    if (admissionTime) {
      const [admHour, admMinute] = admissionTime.split(':').map(Number);
      const admissionDate = new Date(year, month - 1, day, admHour, admMinute);
      admissionTimeISO = admissionDate.toISOString();
    }

    createSurgeryMutation.mutate({
      hospitalId,
      patientId: isSlotReservation ? null : selectedPatientId,
      surgeryRoomId,
      plannedDate: startDate.toISOString(),
      actualEndTime: endDate.toISOString(),
      plannedSurgery: isRoomBlock ? '__ROOM_BLOCK__' : (plannedSurgery.trim() || (isSlotReservation ? null : undefined)),
      chopCode: selectedChopCode || undefined,
      surgeon: matchedSurgeon?.name || undefined,
      surgeonId: surgeonId || undefined,
      notes: notes.trim() || undefined,
      admissionTime: admissionTimeISO,
      implantDetails: implantDetails.trim() || undefined,
      noPreOpRequired: noPreOpRequired,
      surgerySide: surgerySide || undefined,
      antibioseProphylaxe: antibioseProphylaxe,
      patientPosition: patientPosition || undefined,
      leftArmPosition: leftArmPosition || undefined,
      rightArmPosition: rightArmPosition || undefined,
      status: "planned",
    });
  };

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0" data-testid="dialog-quick-create-surgery">
        <DialogHeader className="shrink-0 bg-background border-b px-4 sm:px-6 py-4">
          <DialogTitle>{t('anesthesia.quickSchedule.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4 min-h-0">
          {/* Patient Selection - hidden in slot reservation mode */}
          {!isSlotReservation && (
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
                              value={`${patient.surname} ${patient.firstName} ${patient.birthday || ''}`}
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
                    <PhoneInputWithCountry
                      id="new-patient-phone"
                      placeholder={t('anesthesia.quickSchedule.phonePlaceholder')}
                      value={newPatientPhone}
                      onChange={(value) => setNewPatientPhone(value)}
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

          )}

          {/* Slot Reservation & Room Block Toggles */}
          <div className="grid grid-cols-2 gap-1.5">
            <div
              onClick={() => {
                const next = !isSlotReservation;
                setIsSlotReservation(next);
                if (next) {
                  setSelectedPatientId("");
                  setShowNewPatientForm(false);
                } else {
                  setIsRoomBlock(false);
                }
              }}
              className={cn(
                "flex items-center gap-2 py-1.5 px-2.5 rounded-md border cursor-pointer transition-colors",
                isSlotReservation
                  ? "bg-violet-50 border-violet-200 dark:bg-violet-950/20 dark:border-violet-800"
                  : "border-border/40 hover:bg-muted/50"
              )}
            >
              <Switch
                checked={isSlotReservation}
                onCheckedChange={() => {}}
                className="scale-75 pointer-events-none shrink-0"
                data-testid="switch-slot-reservation"
              />
              <span className="text-xs text-muted-foreground select-none leading-tight">
                {t('anesthesia.quickSchedule.slotReservation', 'Slot Reservation')}
              </span>
            </div>

            <div
              onClick={() => {
                const next = !isRoomBlock;
                setIsRoomBlock(next);
                if (next) {
                  setIsSlotReservation(true);
                  setSelectedPatientId("");
                  setShowNewPatientForm(false);
                  setSurgeonId("");
                }
              }}
              className={cn(
                "flex items-center gap-2 py-1.5 px-2.5 rounded-md border cursor-pointer transition-colors",
                isRoomBlock
                  ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800"
                  : "border-border/40 hover:bg-muted/50"
              )}
            >
              <Switch
                checked={isRoomBlock}
                onCheckedChange={() => {}}
                className="scale-75 pointer-events-none shrink-0"
                data-testid="switch-room-block"
              />
              <span className="text-xs text-muted-foreground select-none leading-tight">
                {t('anesthesia.quickSchedule.roomBlock', 'Block Room')}
              </span>
            </div>
          </div>

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
            onImplantDetailsChange={setImplantDetails}
            onSurgerySideChange={(v) => setSurgerySide(v as typeof surgerySide)}
            onNoPreOpRequiredChange={setNoPreOpRequired}
            onAntibioseProphylaxeChange={setAntibioseProphylaxe}
            onPatientPositionChange={(v) => setPatientPosition(v as typeof patientPosition)}
            onLeftArmPositionChange={(v) => setLeftArmPosition(v as typeof leftArmPosition)}
            onRightArmPositionChange={(v) => setRightArmPosition(v as typeof rightArmPosition)}
            surgeryRooms={surgeryRooms}
            surgeons={surgeons}
            hospitalId={hospitalId}
            isSlotReservation={isSlotReservation}
            isRoomBlock={isRoomBlock}
          />
        </div>

        <div className="shrink-0 bg-background border-t px-4 sm:px-6 py-4 flex justify-end gap-2">
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
            disabled={createSurgeryMutation.isPending || !surgeryRoomId || (!isSlotReservation && (!selectedPatientId || !plannedSurgery.trim()))}
            data-testid="button-schedule-surgery"
          >
            {createSurgeryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isRoomBlock
              ? t('anesthesia.quickSchedule.blockRoom', 'Block Room')
              : isSlotReservation
                ? t('anesthesia.quickSchedule.reserveSlot', 'Reserve Slot')
                : t('anesthesia.quickSchedule.scheduleSurgery')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
