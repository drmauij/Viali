import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ChevronsUpDown, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { TimeInput } from "@/components/ui/time-input";
import { DateInput } from "@/components/ui/date-input";
import { PatientPositionFields } from "@/components/surgery/PatientPositionFields";

export interface SurgeryFormFieldsProps {
  // Values
  surgeryRoomId: string;
  surgeryDate: string;
  startTime: string;
  duration: number;
  admissionTime: string;
  plannedSurgery: string;
  selectedChopCode: string;
  surgeonId: string;
  notes: string;
  diagnosis: string;
  implantDetails: string;
  surgerySide: string;
  noPreOpRequired: boolean;
  antibioseProphylaxe: boolean;
  patientPosition: string;
  leftArmPosition: string;
  rightArmPosition: string;

  // Change handlers
  onSurgeryRoomIdChange: (v: string) => void;
  onSurgeryDateChange: (v: string) => void;
  onStartTimeChange: (v: string) => void;
  onDurationChange: (v: number) => void;
  onAdmissionTimeChange: (v: string) => void;
  onPlannedSurgeryChange: (v: string) => void;
  onSelectedChopCodeChange: (v: string) => void;
  onSurgeonIdChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onDiagnosisChange: (v: string) => void;
  onImplantDetailsChange: (v: string) => void;
  onSurgerySideChange: (v: string) => void;
  onNoPreOpRequiredChange: (v: boolean) => void;
  onAntibioseProphylaxeChange: (v: boolean) => void;
  onPatientPositionChange: (v: string) => void;
  onLeftArmPositionChange: (v: string) => void;
  onRightArmPositionChange: (v: string) => void;
  assistantIds: string[];
  onAssistantIdsChange: (ids: string[]) => void;

  // Config
  surgeryRooms: any[];
  surgeons: any[];
  hospitalId: string;
  isSlotReservation?: boolean;
  isRoomBlock?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
}

export function SurgeryFormFields({
  surgeryRoomId, surgeryDate, startTime, duration, admissionTime,
  plannedSurgery, selectedChopCode, surgeonId, notes, diagnosis, implantDetails,
  surgerySide, noPreOpRequired, antibioseProphylaxe,
  patientPosition, leftArmPosition, rightArmPosition,
  onSurgeryRoomIdChange, onSurgeryDateChange, onStartTimeChange,
  onDurationChange, onAdmissionTimeChange, onPlannedSurgeryChange,
  onSelectedChopCodeChange, onSurgeonIdChange, onNotesChange, onDiagnosisChange,
  onImplantDetailsChange, onSurgerySideChange, onNoPreOpRequiredChange,
  onAntibioseProphylaxeChange, onPatientPositionChange,
  onLeftArmPositionChange, onRightArmPositionChange,
  assistantIds, onAssistantIdsChange,
  surgeryRooms, surgeons, hospitalId,
  isSlotReservation = false, isRoomBlock = false,
  disabled = false, testIdPrefix = "",
}: SurgeryFormFieldsProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // CHOP search state
  const [chopSearchOpen, setChopSearchOpen] = useState(false);
  const [chopSearchTerm, setChopSearchTerm] = useState("");

  // Surgeon search state
  const [surgeonSearchOpen, setSurgeonSearchOpen] = useState(false);

  // Assistant search state
  const [assistantSearchOpen, setAssistantSearchOpen] = useState(false);
  const [showNewSurgeonForm, setShowNewSurgeonForm] = useState(false);
  const [newSurgeonFirstName, setNewSurgeonFirstName] = useState("");
  const [newSurgeonLastName, setNewSurgeonLastName] = useState("");
  const [newSurgeonPhone, setNewSurgeonPhone] = useState("");

  const tid = (base: string) => `${testIdPrefix}${base}`;

  // CHOP procedure search query
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
  const availableAssistants = sortedSurgeons.filter(s => s.id !== surgeonId);

  // Fetch units for creating new surgeons
  const { data: units = [] } = useQuery<Array<{id: string; name: string; type: string | null}>>({
    queryKey: [`/api/admin/${hospitalId}/units`],
    enabled: !!hospitalId && showNewSurgeonForm,
  });

  const surgeryUnit = units.find(u => u.type === 'or');

  // Create surgeon mutation
  const createSurgeonMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; phone?: string }) => {
      if (!surgeryUnit) {
        throw new Error("No surgery unit found");
      }
      const dummyEmail = `surgeon_${crypto.randomUUID()}@internal.local`;
      const dummyPassword = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map(b => b.toString(16).padStart(2, '0')).join('');

      const response = await apiRequest("POST", `/api/admin/${hospitalId}/users/create`, {
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
      queryClient.invalidateQueries({ queryKey: [`/api/surgeons?hospitalId=${hospitalId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/surgeons`, hospitalId] });
      onSurgeonIdChange(newSurgeon.id);
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

  return (
    <>
      {/* Section Divider: Scheduling */}
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px bg-border flex-1" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.sections.scheduling', 'Scheduling')}</span>
        <div className="h-px bg-border flex-1" />
      </div>

      {/* Room & Date */}
      <div className="grid grid-cols-[1fr_2fr] gap-3">
        <div className="space-y-1">
          <Label>{t('anesthesia.quickSchedule.surgeryRoom')} *</Label>
          <Select value={surgeryRoomId} onValueChange={onSurgeryRoomIdChange} disabled={disabled}>
            <SelectTrigger data-testid={tid("select-surgery-room")}>
              <SelectValue placeholder={t('anesthesia.quickSchedule.selectRoom')} />
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
        <div className="space-y-1">
          <Label>{t('anesthesia.quickSchedule.date', 'Date')} *</Label>
          <DateInput
            value={surgeryDate}
            onChange={onSurgeryDateChange}
            disabled={disabled}
            data-testid={tid("input-surgery-date")}
          />
        </div>
      </div>

      {/* Start Time, Duration & Admission */}
      <div className={cn("grid gap-3", isSlotReservation ? "grid-cols-2" : "grid-cols-3")}>
        <div className="space-y-1">
          <Label>{t('anesthesia.quickSchedule.startTime')} *</Label>
          <TimeInput
            value={startTime}
            onChange={(v) => onStartTimeChange(v)}
            disabled={disabled}
            data-testid={tid("input-start-time")}
          />
        </div>
        <div className="space-y-1">
          <Label>{t('anesthesia.quickSchedule.durationMin', 'Min.')} *</Label>
          <Input
            type="number"
            min="1"
            value={duration.toString()}
            onChange={(e) => onDurationChange(Number(e.target.value) || 0)}
            disabled={disabled}
            data-testid={tid("input-duration")}
          />
        </div>
        {!isSlotReservation && (
          <div className="space-y-1">
            <Label>{t('anesthesia.quickSchedule.admissionTime', 'Admission')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
            <TimeInput
              value={admissionTime}
              onChange={(v) => onAdmissionTimeChange(v)}
              disabled={disabled}
              data-testid={tid("input-admission-time")}
            />
          </div>
        )}
      </div>

      {!isSlotReservation && (
        <>
          {/* Section Divider: Procedure */}
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.sections.procedure', 'Procedure')}</span>
            <div className="h-px bg-border flex-1" />
          </div>

          {/* Planned Surgery - CHOP Procedure Selector */}
          <div className="space-y-2">
            <Label>{t('anesthesia.quickSchedule.plannedSurgery')} *</Label>
            <Popover open={chopSearchOpen} onOpenChange={(open) => !disabled && setChopSearchOpen(open)}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={chopSearchOpen}
                  className="w-full justify-between h-auto min-h-10 text-left font-normal"
                  disabled={disabled}
                  data-testid={tid("select-chop-procedure")}
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
                    onValueChange={setChopSearchTerm}
                    data-testid={tid("input-chop-search")}
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
                              onPlannedSurgeryChange(chopSearchTerm);
                              onSelectedChopCodeChange("");
                              setChopSearchOpen(false);
                            }}
                            data-testid={tid("button-use-custom-surgery")}
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
                              onPlannedSurgeryChange(proc.descriptionDe);
                              onSelectedChopCodeChange(proc.code);
                              setChopSearchOpen(false);
                            }}
                            className="flex flex-col items-start gap-0.5 cursor-pointer"
                            data-testid={tid(`chop-option-${proc.code}`)}
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
                      </CommandGroup>
                    )}
                  </CommandList>
                  {chopSearchTerm.length >= 2 && chopProcedures.length > 0 && (
                    <div className="sticky bottom-0 border-t bg-popover p-1">
                      <CommandItem
                        value="__custom__"
                        onSelect={() => {
                          onPlannedSurgeryChange(chopSearchTerm);
                          onSelectedChopCodeChange("");
                          setChopSearchOpen(false);
                        }}
                        className="cursor-pointer"
                        data-testid={tid("chop-option-custom")}
                      >
                        <Check className="h-4 w-4 shrink-0 opacity-0" />
                        <span className="text-sm text-muted-foreground">
                          {t('anesthesia.quickSchedule.useAsCustom', 'Use as custom entry: "{name}"').replace('{name}', chopSearchTerm)}
                        </span>
                      </CommandItem>
                    </div>
                  )}
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Surgery Side */}
          <div className="space-y-2">
            <Label>{t('anesthesia.surgerySide.label', 'Surgery Side')}</Label>
            <div className="flex gap-2 flex-wrap">
              {(["left", "right", "both"] as const).map((side) => (
                <label
                  key={side}
                  className={`flex items-center justify-center cursor-pointer px-4 py-2.5 rounded-lg border transition-colors min-h-[44px] ${
                    surgerySide === side
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-input bg-background hover:bg-accent"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                  data-testid={tid(`radio-surgery-side-${side}`)}
                >
                  <input
                    type="radio"
                    name={`${testIdPrefix}surgerySide`}
                    value={side}
                    checked={surgerySide === side}
                    onChange={() => onSurgerySideChange(side)}
                    disabled={disabled}
                    className="sr-only"
                  />
                  <span className="text-sm font-medium">{t(`anesthesia.surgerySide.${side}`, side.charAt(0).toUpperCase() + side.slice(1))}</span>
                </label>
              ))}
              {surgerySide && !disabled && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onSurgerySideChange("")}
                  className="text-xs min-h-[44px] px-3"
                >
                  {t('common.clear', 'Clear')}
                </Button>
              )}
            </div>
          </div>

          {/* Patient Positioning */}
          <PatientPositionFields
            patientPosition={patientPosition as any}
            leftArmPosition={leftArmPosition as any}
            rightArmPosition={rightArmPosition as any}
            onPatientPositionChange={onPatientPositionChange as any}
            onLeftArmPositionChange={onLeftArmPositionChange as any}
            onRightArmPositionChange={onRightArmPositionChange as any}
            disabled={disabled}
            testIdPrefix={testIdPrefix || "quick-"}
          />

          {/* Section Divider: Requirements */}
          <div className="flex items-center gap-2 pt-2">
            <div className="h-px bg-border flex-1" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('anesthesia.sections.requirements', 'Requirements')}</span>
            <div className="h-px bg-border flex-1" />
          </div>

          {/* Antibiose Prophylaxe */}
          <div className="flex items-center gap-3">
            <Checkbox
              id={`${testIdPrefix}antibiose-prophylaxe`}
              checked={antibioseProphylaxe}
              onCheckedChange={(checked) => onAntibioseProphylaxeChange(checked === true)}
              disabled={disabled}
              data-testid={tid("checkbox-antibiose-prophylaxe")}
            />
            <Label htmlFor={`${testIdPrefix}antibiose-prophylaxe`} className="font-normal cursor-pointer">
              {t('anesthesia.antibioseProphylaxe', 'Antibiotic Prophylaxis Required')}
            </Label>
          </div>

          {/* No Anesthesia Pre-Op Required */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id={`${testIdPrefix}no-preop-required`}
              checked={noPreOpRequired}
              onCheckedChange={(checked) => onNoPreOpRequiredChange(checked === true)}
              disabled={disabled}
              data-testid={tid("checkbox-no-preop-required")}
            />
            <Label
              htmlFor={`${testIdPrefix}no-preop-required`}
              className="text-sm font-normal cursor-pointer"
            >
              {t('anesthesia.surgery.noAnesthesia', 'Without Anesthesia (local anesthesia only)')}
            </Label>
          </div>
        </>
      )}

      {/* Section Divider: Team & Notes */}
      <div className="flex items-center gap-2 pt-2">
        <div className="h-px bg-border flex-1" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {isRoomBlock ? t('anesthesia.sections.notes', 'Notes') : t('anesthesia.sections.teamNotes', 'Team & Notes')}
        </span>
        <div className="h-px bg-border flex-1" />
      </div>

      {/* Surgeon - hidden in room block mode */}
      {!isRoomBlock && (
        <div className="space-y-2">
          <Label>{t('anesthesia.quickSchedule.surgeon')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.surgeonOptional')})</span></Label>
          {!showNewSurgeonForm ? (
            <div className="flex gap-2">
              <Popover open={surgeonSearchOpen} onOpenChange={setSurgeonSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={surgeonSearchOpen}
                    className="flex-1 justify-between"
                    disabled={disabled}
                    data-testid={tid("select-surgeon")}
                  >
                    {selectedSurgeon
                      ? selectedSurgeon.name
                      : t('anesthesia.quickSchedule.noSurgeonSelected')}
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
                            onSurgeonIdChange("");
                            setSurgeonSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              !surgeonId ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="text-muted-foreground italic">{t('anesthesia.quickSchedule.noSurgeonSelected')}</span>
                        </CommandItem>
                        {sortedSurgeons.map((s: any) => (
                          <CommandItem
                            key={s.id}
                            value={`${s.name}__${s.id}`}
                            onSelect={() => {
                              onSurgeonIdChange(s.id);
                              setSurgeonSearchOpen(false);
                            }}
                            data-testid={tid(`surgeon-option-${s.id}`)}
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
              {!disabled && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewSurgeonForm(true)}
                  data-testid={tid("button-show-new-surgeon")}
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
                  data-testid={tid("button-cancel-new-surgeon")}
                >
                  {t('common.cancel')}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t('anesthesia.quickSchedule.firstName')} *</Label>
                  <Input
                    value={newSurgeonFirstName}
                    onChange={(e) => setNewSurgeonFirstName(e.target.value)}
                    data-testid={tid("input-new-surgeon-firstname")}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('anesthesia.quickSchedule.surname')} *</Label>
                  <Input
                    value={newSurgeonLastName}
                    onChange={(e) => setNewSurgeonLastName(e.target.value)}
                    data-testid={tid("input-new-surgeon-lastname")}
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>{t('anesthesia.quickSchedule.phone')}</Label>
                  <PhoneInputWithCountry
                    placeholder={t('anesthesia.quickSchedule.phonePlaceholder')}
                    value={newSurgeonPhone}
                    onChange={(value) => setNewSurgeonPhone(value)}
                    data-testid={tid("input-new-surgeon-phone")}
                  />
                </div>
              </div>
              <Button
                onClick={handleCreateSurgeon}
                disabled={createSurgeonMutation.isPending || !surgeryUnit}
                className="w-full"
                data-testid={tid("button-create-surgeon")}
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
      )}

      {/* Assistants - hidden in room block mode */}
      {!isRoomBlock && (
        <div className="space-y-2">
          <Label>{t('anesthesia.surgery.assistants', 'Assistants')} <span className="text-xs text-muted-foreground">({t('anesthesia.surgery.optional', 'optional')})</span></Label>
          <Popover open={assistantSearchOpen} onOpenChange={setAssistantSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-auto min-h-10"
                disabled={disabled}
                data-testid={tid("select-assistants")}
              >
                <div className="flex flex-wrap gap-1 flex-1 text-left">
                  {assistantIds.length === 0 ? (
                    <span className="text-muted-foreground">{t('anesthesia.surgery.noAssistantsSelected', 'No assistants selected')}</span>
                  ) : (
                    assistantIds.map(id => {
                      const s = sortedSurgeons.find(s => s.id === id);
                      return s ? (
                        <Badge key={id} variant="secondary" className="text-xs gap-1">
                          {s.name}
                          <button
                            type="button"
                            className="hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAssistantIdsChange(assistantIds.filter(a => a !== id));
                            }}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ) : null;
                    })
                  )}
                </div>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0">
              <Command>
                <CommandInput placeholder={t('anesthesia.surgery.searchAssistants', 'Search assistants...')} />
                <CommandList>
                  <CommandEmpty>{t('anesthesia.quickSchedule.noSurgeonsAvailable')}</CommandEmpty>
                  <CommandGroup>
                    {availableAssistants.map((s: any) => (
                      <CommandItem
                        key={s.id}
                        value={`${s.name}__${s.id}`}
                        onSelect={() => {
                          const newIds = assistantIds.includes(s.id)
                            ? assistantIds.filter(a => a !== s.id)
                            : [...assistantIds, s.id];
                          onAssistantIdsChange(newIds);
                        }}
                        data-testid={tid(`assistant-option-${s.id}`)}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            assistantIds.includes(s.id) ? "opacity-100" : "opacity-0"
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
        </div>
      )}

      {/* Notes */}
      <div className="space-y-2">
        <Label>{t('anesthesia.quickSchedule.notes')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.notesOptional')})</span></Label>
        <Textarea
          placeholder={t('anesthesia.quickSchedule.notesPlaceholder')}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          disabled={disabled}
          data-testid={tid("textarea-notes")}
          rows={3}
        />
      </div>

      {/* Diagnosis - hidden in slot reservation mode */}
      {!isSlotReservation && (
        <div className="space-y-2">
          <Label>{t('anesthesia.quickSchedule.diagnosis', 'Diagnosis')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
          <Input
            placeholder={t('anesthesia.quickSchedule.diagnosisPlaceholder', 'e.g. ICD-10 code or description')}
            value={diagnosis}
            onChange={(e) => onDiagnosisChange(e.target.value)}
            disabled={disabled}
            data-testid={tid("input-diagnosis")}
          />
        </div>
      )}

      {/* Implant Details - hidden in slot reservation mode */}
      {!isSlotReservation && (
        <div className="space-y-2">
          <Label>{t('anesthesia.quickSchedule.implantDetails', 'Implant Details')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
          <Textarea
            placeholder={t('anesthesia.quickSchedule.implantDetailsPlaceholder', 'e.g., Hip prosthesis model XYZ, Serial #12345')}
            value={implantDetails}
            onChange={(e) => onImplantDetailsChange(e.target.value)}
            disabled={disabled}
            data-testid={tid("textarea-implant-details")}
            rows={3}
          />
        </div>
      )}
    </>
  );
}
