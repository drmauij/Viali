import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { parseFlexibleDate, isoToDisplayDate } from "@/lib/dateUtils";

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
  const [surgeonSearchOpen, setSurgeonSearchOpen] = useState(false);
  const [chopSearchOpen, setChopSearchOpen] = useState(false);
  const [chopSearchTerm, setChopSearchTerm] = useState("");
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [showNewSurgeonForm, setShowNewSurgeonForm] = useState(false);
  
  // New surgeon form state
  const [newSurgeonFirstName, setNewSurgeonFirstName] = useState("");
  const [newSurgeonLastName, setNewSurgeonLastName] = useState("");
  const [newSurgeonPhone, setNewSurgeonPhone] = useState("");
  
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
      return Math.round(diffMs / (1000 * 60)); // Convert ms to minutes
    }
    return 180; // Default 3 hours
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
  // Supported formats:
  // - dd.mm.yy or dd.mm.yyyy (with dots)
  // - ddmmyyyy (8 digits without dots)
  // - ddmmyy (6 digits without dots)
  // - dmyy (4 digits: single-digit day and month, 2-digit year)
  const parseBirthday = (input: string): string | null => {
    const trimmed = input.trim();
    
    let day: string, month: string, year: string;
    
    // Try format with dots first: dd.mm.yy or dd.mm.yyyy
    const dotMatch = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
    if (dotMatch) {
      [, day, month, year] = dotMatch;
    } else if (/^\d{8}$/.test(trimmed)) {
      // 8 digits: ddmmyyyy (e.g., 03041977)
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 8);
    } else if (/^\d{6}$/.test(trimmed)) {
      // 6 digits: ddmmyy (e.g., 030477)
      day = trimmed.substring(0, 2);
      month = trimmed.substring(2, 4);
      year = trimmed.substring(4, 6);
    } else if (/^\d{4}$/.test(trimmed)) {
      // 4 digits: dmyy (e.g., 3477 = 3rd April 1977)
      day = trimmed.substring(0, 1);
      month = trimmed.substring(1, 2);
      year = trimmed.substring(2, 4);
    } else {
      return null;
    }
    
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
  const {
    data: surgeons = [],
    isLoading: isLoadingSurgeons
  } = useQuery<Array<{id: string; name: string; email: string | null}>>({
    queryKey: [`/api/surgeons?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && open,
  });

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

  // Sort surgeons alphabetically by surname (extract surname from "FirstName LastName" format)
  const sortedSurgeons = useMemo(() => {
    return [...surgeons].sort((a, b) => {
      const getSurname = (name: string) => {
        const parts = name.trim().split(/\s+/);
        return parts.length > 1 ? parts[parts.length - 1] : parts[0];
      };
      return getSurname(a.name).localeCompare(getSurname(b.name));
    });
  }, [surgeons]);

  const selectedSurgeon = sortedSurgeons.find(s => s.id === surgeonId);

  // Fetch units to find the surgery unit for creating new surgeons
  const { data: units = [] } = useQuery<Array<{id: string; name: string; type: string | null}>>({
    queryKey: [`/api/admin/${hospitalId}/units`],
    enabled: !!hospitalId && open && showNewSurgeonForm,
  });

  const surgeryUnit = units.find(u => u.type === 'or');

  // Create surgeon mutation (creates as staff member with doctor role in surgery unit)
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
        title: t('anesthesia.quickSchedule.creationFailed'),
        description: t('anesthesia.quickSchedule.surgeonCreationFailedDescription', 'Failed to create surgeon'),
        variant: "destructive",
      });
    },
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
    setSurgeryDate(formatDateOnly(initialDate));
    setStartTime(formatTimeOnly(initialDate));
    setDuration(getDefaultDuration());
    setAdmissionTime("");
    setPlannedSurgery("");
    setSelectedChopCode("");
    setChopSearchTerm("");
    setSurgeonId("");
    setNotes("");
    setImplantDetails("");
    setNoPreOpRequired(false);
    setShowNewPatientForm(false);
    setNewPatientFirstName("");
    setNewPatientSurname("");
    setNewPatientDOB("");
    setNewPatientGender("m");
    setNewPatientPhone("");
    setBirthdayInput("");
    setShowNewSurgeonForm(false);
    setNewSurgeonFirstName("");
    setNewSurgeonLastName("");
    setNewSurgeonPhone("");
  };

  const handleCreateSurgeon = () => {
    if (!newSurgeonFirstName.trim() || !newSurgeonLastName.trim()) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation'),
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
    // Parse date and time separately
    const [year, month, day] = surgeryDate.split('-').map(Number);
    const [hour, minute] = startTime.split(':').map(Number);
    
    // Create Date in local timezone
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
      patientId: selectedPatientId,
      surgeryRoomId,
      plannedDate: startDate.toISOString(),
      actualEndTime: endDate.toISOString(),
      plannedSurgery: plannedSurgery.trim(),
      chopCode: selectedChopCode || undefined,
      surgeon: matchedSurgeon?.name || undefined,
      surgeonId: surgeonId || undefined,
      notes: notes.trim() || undefined,
      admissionTime: admissionTimeISO,
      implantDetails: implantDetails.trim() || undefined,
      noPreOpRequired: noPreOpRequired,
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

          {/* Surgery Date */}
          <div className="space-y-2">
            <Label htmlFor="surgery-date">{t('anesthesia.quickSchedule.date', 'Date')} *</Label>
            <Input
              id="surgery-date"
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
              data-testid="input-surgery-date"
            />
          </div>

          {/* Start Time, Admission Time & Duration */}
          <div className="flex gap-3 min-w-0">
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor="start-time">{t('anesthesia.quickSchedule.startTime')} *</Label>
              <Input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                data-testid="input-start-time"
              />
            </div>
            <div className="space-y-2 flex-1 min-w-0">
              <Label htmlFor="admission-time">{t('anesthesia.quickSchedule.admissionTime', 'Admission')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
              <Input
                id="admission-time"
                type="time"
                value={admissionTime}
                onChange={(e) => setAdmissionTime(e.target.value)}
                data-testid="input-admission-time"
              />
            </div>
            <div className="space-y-2 w-20 shrink-0">
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

          {/* Planned Surgery - CHOP Procedure Selector */}
          <div className="space-y-2">
            <Label>{t('anesthesia.quickSchedule.plannedSurgery')} *</Label>
            <Popover open={chopSearchOpen} onOpenChange={setChopSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={chopSearchOpen}
                  className="w-full justify-between h-auto min-h-10 text-left font-normal"
                  data-testid="select-chop-procedure"
                >
                  {plannedSurgery ? (
                    <div className="flex flex-col items-start gap-0.5">
                      <span className="text-sm truncate max-w-[280px]">{plannedSurgery}</span>
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
                    data-testid="input-chop-search"
                  />
                  <CommandList className="max-h-[300px] overflow-y-auto">
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
                            data-testid="button-use-custom-surgery"
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
                            data-testid={`chop-option-${proc.code}`}
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
                            data-testid="chop-option-custom"
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

          {/* Surgeon */}
          <div className="space-y-2">
            <Label htmlFor="surgeon">{t('anesthesia.quickSchedule.surgeon')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.surgeonOptional')})</span></Label>
            {!showNewSurgeonForm ? (
              <div className="flex gap-2">
                <Popover open={surgeonSearchOpen} onOpenChange={setSurgeonSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={surgeonSearchOpen}
                      className="flex-1 justify-between"
                      disabled={isLoadingSurgeons}
                      data-testid="select-surgeon"
                    >
                      {isLoadingSurgeons 
                        ? t('anesthesia.quickSchedule.loadingSurgeons')
                        : selectedSurgeon
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
                            <span className="text-muted-foreground italic">{t('anesthesia.quickSchedule.noSurgeonSelected')}</span>
                          </CommandItem>
                          {sortedSurgeons.map((s) => (
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
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowNewSurgeonForm(true)}
                  data-testid="button-show-new-surgeon"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t('anesthesia.quickSchedule.newSurgeon', 'New Surgeon')}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowNewSurgeonForm(false)}
                    data-testid="button-cancel-new-surgeon"
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="new-surgeon-firstname">{t('anesthesia.quickSchedule.firstName')} *</Label>
                    <Input
                      id="new-surgeon-firstname"
                      value={newSurgeonFirstName}
                      onChange={(e) => setNewSurgeonFirstName(e.target.value)}
                      data-testid="input-new-surgeon-firstname"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="new-surgeon-lastname">{t('anesthesia.quickSchedule.surname')} *</Label>
                    <Input
                      id="new-surgeon-lastname"
                      value={newSurgeonLastName}
                      onChange={(e) => setNewSurgeonLastName(e.target.value)}
                      data-testid="input-new-surgeon-lastname"
                    />
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="new-surgeon-phone">{t('anesthesia.quickSchedule.phone')}</Label>
                    <PhoneInputWithCountry
                      id="new-surgeon-phone"
                      placeholder={t('anesthesia.quickSchedule.phonePlaceholder')}
                      value={newSurgeonPhone}
                      onChange={(value) => setNewSurgeonPhone(value)}
                      data-testid="input-new-surgeon-phone"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateSurgeon}
                  disabled={createSurgeonMutation.isPending || !surgeryUnit}
                  className="w-full"
                  data-testid="button-create-surgeon"
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

          {/* Implant Details */}
          <div className="space-y-2">
            <Label htmlFor="implant-details">{t('anesthesia.quickSchedule.implantDetails', 'Implant Details')} <span className="text-xs text-muted-foreground">({t('anesthesia.quickSchedule.optional', 'opt.')})</span></Label>
            <Textarea
              id="implant-details"
              placeholder={t('anesthesia.quickSchedule.implantDetailsPlaceholder', 'e.g., Hip prosthesis model XYZ, Serial #12345')}
              value={implantDetails}
              onChange={(e) => setImplantDetails(e.target.value)}
              data-testid="textarea-implant-details"
              rows={3}
            />
          </div>

          {/* No Anesthesia Pre-Op Required */}
          <div className="flex items-center space-x-2 pt-2">
            <Checkbox
              id="no-preop-required"
              checked={noPreOpRequired}
              onCheckedChange={(checked) => setNoPreOpRequired(checked === true)}
              data-testid="checkbox-no-preop-required"
            />
            <Label 
              htmlFor="no-preop-required" 
              className="text-sm font-normal cursor-pointer"
            >
              {t('anesthesia.surgery.noAnesthesia', 'Without Anesthesia (local anesthesia only)')}
            </Label>
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
