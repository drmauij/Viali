import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  AlertCircle,
  RefreshCw,
  ToggleRight,
  ToggleLeft,
  UserPlus,
  Loader2,
  Video,
  ClipboardPaste,
  MessageSquare,
} from "lucide-react";
import { PhoneInputWithCountry } from "@/components/ui/phone-input-with-country";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDateForInput, formatTime, isBirthdayUnknown } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import ClinicCalendar from "@/components/clinic/ClinicCalendar";
import { ManageAvailabilityDialog, TimeOffDialog } from "@/components/clinic/ManageAvailabilityDialog";
import { BookingTypeSelector, type BookingType } from "@/components/clinic/BookingTypeSelector";
import QuickCreateSurgeryDialog from "@/components/anesthesia/QuickCreateSurgeryDialog";
import { useCanPlanSurgery } from "@/hooks/useCanPlanSurgery";
import { useLocation } from "wouter";
import AppointmentDetailDialog, { STATUS_COLORS, getStatusLabel, type AppointmentWithDetails } from "@/components/clinic/AppointmentDetailDialog";
import type { Patient, ClinicService } from "@shared/schema";

export default function ClinicAppointments() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { addons } = useHospitalAddons();
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [bookingTypeSelectorOpen, setBookingTypeSelectorOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [internalBookingDialogOpen, setInternalBookingDialogOpen] = useState(false);
  const [quickSurgeryDialogOpen, setQuickSurgeryDialogOpen] = useState(false);
  const [bookingDefaults, setBookingDefaults] = useState<{ providerId?: string; date?: Date; endDate?: Date; source?: 'day' | 'week-month' }>({});
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [selectedProviderForAvailability, setSelectedProviderForAvailability] = useState<string | undefined>();
  const [extendedTimeOffOpen, setExtendedTimeOffOpen] = useState(false);
  const [timeOffDefaults, setTimeOffDefaults] = useState<{
    providerId: string; startDate: string; endDate: string;
  } | null>(null);
  const handleProviderClick = (providerId: string) => {
    setSelectedProviderForAvailability(providerId);
    setAvailabilityDialogOpen(true);
  };

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;
    
    const savedHospitalKey = localStorage.getItem('activeHospital');
    if (savedHospitalKey) {
      const saved = userHospitals.find((h: any) => 
        `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }
    
    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;
  const unitId = activeHospital?.unitId;
  const dateLocale = i18n.language === 'de' ? de : enUS;
  const canPlanSurgery = useCanPlanSurgery();

  const { data: providers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null }[]>({
    queryKey: ['bookable-providers', hospitalId, unitId],
    queryFn: async () => {
      const url = unitId
        ? `/api/clinic/${hospitalId}/bookable-providers?unitId=${unitId}`
        : `/api/clinic/${hospitalId}/bookable-providers`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch providers');
      const data = await response.json();
      // Map the nested user data to flat structure expected by components
      return data.map((p: any) => ({
        id: p.userId,
        firstName: p.user?.firstName || null,
        lastName: p.user?.lastName || null,
      }));
    },
    enabled: !!hospitalId,
    staleTime: 0,
  });

  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${hospitalId}`],
    enabled: !!hospitalId && canPlanSurgery,
  });

  const createOffTimeMutation = useMutation({
    mutationFn: async (data: { providerId: string; date: string; startTime: string; endTime: string }) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/providers/${data.providerId}/time-off`, {
        startDate: data.date,
        endDate: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        reason: 'blocked',
        isRecurring: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}`);
        }
      });
      toast({ title: t('appointments.offTimeCreated', 'Time blocked successfully') });
    },
    onError: () => {
      toast({ title: t('appointments.offTimeError', 'Failed to block time'), variant: "destructive" });
    },
  });

  // Sync absences from Timebutler/ICS feeds
  const syncAbsencesMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/clinic/${hospitalId}/queue-ics-sync`)
        .then(res => res.json()),
    onSuccess: () => {
      toast({
        title: t('appointments.syncQueued', 'Absence sync started'),
        description: t('appointments.syncQueuedDesc', 'Absences will be synced in the background')
      });
    },
    onError: () => {
      toast({ title: t('appointments.syncError', 'Failed to start absence sync'), variant: "destructive" });
    },
  });

  const createExtendedTimeOffMutation = useMutation({
    mutationFn: async (data: { providerId: string; payload: any }) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/providers/${data.providerId}/time-off`, data.payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}`);
        }
      });
      toast({ title: t('appointments.timeOffCreated', 'Time off created') });
      setExtendedTimeOffOpen(false);
      setTimeOffDefaults(null);
    },
    onError: () => {
      toast({ title: t('appointments.offTimeError', 'Failed to create time off'), variant: "destructive" });
    },
  });

  const handleDragSelectRange = (providerId: string, startDate: Date, endDate: Date) => {
    setTimeOffDefaults({
      providerId,
      startDate: formatDateForInput(startDate),
      endDate: formatDateForInput(endDate),
    });
    setExtendedTimeOffOpen(true);
  };

  const handleBookAppointment = (data: { providerId: string; date: Date; endDate?: Date; source?: 'day' | 'week-month' }) => {
    setBookingDefaults(data);
    setBookingTypeSelectorOpen(true);
  };

  const handleBookingTypeSelect = (type: BookingType) => {
    switch (type) {
      case 'external':
        setBookingDialogOpen(true);
        break;
      case 'internal':
        setInternalBookingDialogOpen(true);
        break;
      case 'off_time':
        if (bookingDefaults.providerId && bookingDefaults.date) {
          if (bookingDefaults.source === 'week-month') {
            // Week/month view: open TimeOffDialog to let user pick full-day or time range
            setTimeOffDefaults({
              providerId: bookingDefaults.providerId,
              startDate: formatDateForInput(bookingDefaults.date),
              endDate: formatDateForInput(bookingDefaults.date),
            });
            setExtendedTimeOffOpen(true);
          } else {
            // Day view: precise time selection, create immediately
            createOffTimeMutation.mutate({
              providerId: bookingDefaults.providerId,
              date: formatDateForInput(bookingDefaults.date),
              startTime: formatTime(bookingDefaults.date),
              endTime: bookingDefaults.endDate ? formatTime(bookingDefaults.endDate) : formatTime(new Date(bookingDefaults.date.getTime() + 30 * 60000)),
            });
          }
        }
        break;
      case 'surgery':
        if (canPlanSurgery && bookingDefaults.date) {
          setQuickSurgeryDialogOpen(true);
        }
        break;
    }
  };

  const handleEventClick = (appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    setDetailDialogOpen(true);
  };

  const handleSearchSelect = async (appointmentId: string, _date: Date) => {
    try {
      const response = await fetch(`/api/clinic/${hospitalId}/appointments/${appointmentId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const appointment = await response.json();
        setSelectedAppointment(appointment);
        setDetailDialogOpen(true);
      }
    } catch (error) {
      console.error("Failed to fetch appointment:", error);
    }
  };

  if (!hospitalId || !unitId) {
    return (
      <div className="container mx-auto p-4" data-testid="appointments-no-hospital">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">{t('appointments.noHospital', 'Please select a hospital to view appointments')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" data-testid="appointments-page">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-4 gap-3 border-b bg-background">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            {t('appointments.title', 'Appointments')}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncAbsencesMutation.mutate()}
            disabled={syncAbsencesMutation.isPending}
            data-testid="button-sync-absences"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncAbsencesMutation.isPending ? 'animate-spin' : ''}`} />
            {t('appointments.syncAbsences', 'Sync Absences')}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        <ClinicCalendar
          hospitalId={hospitalId}
          unitId={unitId}
          onBookAppointment={handleBookAppointment}
          onEventClick={handleEventClick}
          onProviderClick={handleProviderClick}
          onDragSelectRange={handleDragSelectRange}
          onSearchSelect={handleSearchSelect}
          statusLegend={
            <div className="flex flex-wrap gap-3 p-4 border-t bg-muted/30 text-sm">
              {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`} />
                  <span className="text-muted-foreground">{getStatusLabel(status, t)}</span>
                </div>
              ))}
              <div className="flex items-center gap-1.5">
                <ToggleRight className="h-4 w-4 text-green-600" />
                <span className="text-muted-foreground">{t('appointments.legendSaalPlanned', 'Saal planned')}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <ToggleLeft className="h-4 w-4 text-muted-foreground/40" />
                <span className="text-muted-foreground">{t('appointments.legendSaalAdd', 'Click to add to Saal')}</span>
              </div>
            </div>
          }
        />
      </div>

      <AppointmentDetailDialog
        open={detailDialogOpen}
        onOpenChange={(open) => { setDetailDialogOpen(open); }}
        appointment={selectedAppointment}
        hospitalId={hospitalId}
        unitId={unitId}
        providers={providers}
        onNavigateToPatient={(patientId) => {
          const moduleBase = activeHospital?.unitType === 'or' ? '/surgery'
            : activeHospital?.unitType === 'anesthesia' ? '/anesthesia'
            : '/clinic';
          setDetailDialogOpen(false);
          setTimeout(() => setLocation(`${moduleBase}/patients/${patientId}`), 150);
        }}
      />

      <BookingTypeSelector
        open={bookingTypeSelectorOpen}
        onOpenChange={setBookingTypeSelectorOpen}
        onSelect={handleBookingTypeSelect}
        canAccessSurgery={canPlanSurgery}
        slotInfo={bookingDefaults}
      />

      <BookingDialog 
        open={bookingDialogOpen} 
        onOpenChange={setBookingDialogOpen}
        hospitalId={hospitalId}
        unitId={unitId}
        providers={providers}
        defaults={bookingDefaults}
      />

      <InternalBookingDialog
        open={internalBookingDialogOpen}
        onOpenChange={setInternalBookingDialogOpen}
        hospitalId={hospitalId}
        unitId={unitId}
        providers={providers}
        defaults={bookingDefaults}
      />

      {bookingDefaults.date && (
        <QuickCreateSurgeryDialog
          open={quickSurgeryDialogOpen}
          onOpenChange={setQuickSurgeryDialogOpen}
          hospitalId={hospitalId}
          initialDate={bookingDefaults.date}
          initialEndDate={bookingDefaults.endDate}
          surgeryRooms={surgeryRooms}
        />
      )}

      <ManageAvailabilityDialog
        open={availabilityDialogOpen}
        onOpenChange={(open) => {
          setAvailabilityDialogOpen(open);
          if (!open) setSelectedProviderForAvailability(undefined);
        }}
        hospitalId={hospitalId}
        unitId={unitId}
        providers={providers}
        initialProviderId={selectedProviderForAvailability}
      />

      {timeOffDefaults && (
        <TimeOffDialog
          open={extendedTimeOffOpen}
          onOpenChange={(open) => {
            setExtendedTimeOffOpen(open);
            if (!open) setTimeOffDefaults(null);
          }}
          onSubmit={(data) => {
            if (timeOffDefaults) {
              createExtendedTimeOffMutation.mutate({
                providerId: timeOffDefaults.providerId,
                payload: data,
              });
            }
          }}
          isPending={createExtendedTimeOffMutation.isPending}
          defaultStartDate={timeOffDefaults.startDate}
          defaultEndDate={timeOffDefaults.endDate}
        />
      )}
    </div>
  );
}

export function BookingDialog({
  open,
  onOpenChange,
  hospitalId,
  unitId,
  providers,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId: string;
  providers: { id: string; firstName: string | null; lastName: string | null }[];
  defaults?: { providerId?: string; date?: Date; endDate?: Date; patientId?: string; patientName?: string };
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>(defaults?.providerId || "");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    defaults?.date ? formatDateForInput(defaults.date) : formatDateForInput(new Date())
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(
    defaults?.date && defaults?.endDate
      ? `${formatTime(defaults.date)}-${formatTime(defaults.endDate)}`
      : ""
  );
  const [patientSearch, setPatientSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [isVideoAppointment, setIsVideoAppointment] = useState(false);
  const [videoMeetingLink, setVideoMeetingLink] = useState("");
  const [showNewPatientForm, setShowNewPatientForm] = useState(false);
  const [newPatientFirstName, setNewPatientFirstName] = useState("");
  const [newPatientSurname, setNewPatientSurname] = useState("");
  const [newPatientDOB, setNewPatientDOB] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");
  const [referralSource, setReferralSource] = useState<string>("");
  const [referralSourceDetail, setReferralSourceDetail] = useState<string>("");
  const [showLeadImport, setShowLeadImport] = useState(false);
  const [leadPasteText, setLeadPasteText] = useState("");
  const [leadImportPending, setLeadImportPending] = useState(false);
  const [referralCreatedAt, setReferralCreatedAt] = useState<string | null>(null);
  const [referralMetaLeadId, setReferralMetaLeadId] = useState<string | null>(null);
  const [referralMetaFormId, setReferralMetaFormId] = useState<string | null>(null);
  const [sendConfirmation, setSendConfirmation] = useState(true);

  // Update state when defaults change (from calendar slot selection or patient pre-fill)
  useMemo(() => {
    if (defaults?.providerId) setSelectedProviderId(defaults.providerId);
    if (defaults?.date) {
      setSelectedDate(formatDateForInput(defaults.date));
      if (defaults.endDate) {
        setSelectedSlot(`${formatTime(defaults.date)}-${formatTime(defaults.endDate)}`);
      }
    }
    if (defaults?.patientId) {
      setSelectedPatientId(defaults.patientId);
      if (defaults.patientName) setPatientSearch(defaults.patientName);
    }
  }, [defaults]);

  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: ['/api/patients', hospitalId, patientSearch],
    queryFn: async () => {
      const response = await fetch(`/api/patients?hospitalId=${hospitalId}&search=${encodeURIComponent(patientSearch)}`);
      if (!response.ok) throw new Error('Failed to fetch patients');
      return response.json();
    },
    enabled: !!hospitalId && patientSearch.length >= 2,
  });

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

  const { data: services = [] } = useQuery<ClinicService[]>({
    queryKey: [`/api/clinic/${hospitalId}/services?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId,
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/appointments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.created', 'Appointment created successfully') });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: t('appointments.createError', 'Failed to create appointment'), description: error?.message || undefined, variant: "destructive" });
    },
  });

  const createPatientMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/patients", data);
      return response.json();
    },
    onSuccess: (newPatient) => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', hospitalId] });
      setSelectedPatientId(newPatient.id);
      setPatientSearch(`${newPatient.firstName} ${newPatient.surname}`);
      setShowNewPatientForm(false);
      setShowLeadImport(false);
      setLeadPasteText("");
      toast({
        title: t('anesthesia.quickSchedule.patientCreated', 'Patient created'),
        description: t('anesthesia.quickSchedule.patientCreatedDescription', 'Patient has been created and selected'),
      });
    },
    onError: () => {
      toast({
        title: t('anesthesia.quickSchedule.creationFailed', 'Failed to create patient'),
        description: t('anesthesia.quickSchedule.creationFailedDescription', 'Could not create patient. Please try again.'),
        variant: "destructive",
      });
    },
  });

  const handleCreatePatient = () => {
    if (!newPatientFirstName.trim() || !newPatientSurname.trim() || !newPatientDOB) {
      toast({
        title: t('anesthesia.quickSchedule.missingInformation', 'Missing information'),
        description: t('anesthesia.quickSchedule.missingPatientFields', 'Please fill in first name, surname, and date of birth'),
        variant: "destructive",
      });
      return;
    }
    createPatientMutation.mutate({
      hospitalId,
      firstName: newPatientFirstName.trim(),
      surname: newPatientSurname.trim(),
      birthday: newPatientDOB,
      sex: "M",
      phone: newPatientPhone.trim() || undefined,
    });
  };

  const parseLeadRow = (text: string): {
    leadDate: string | null;
    operation: string | null;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    source: string | null;
    metaLeadId: string | null;
    metaFormId: string | null;
  } | null => {
    const trimmed = text.trim();
    // Split by tab; if only 1 part, try semicolon
    let parts = trimmed.split('\t').map(p => p.trim());
    if (parts.length < 3) {
      parts = trimmed.split(';').map(p => p.trim());
    }
    if (parts.length < 3) return null;

    // Fixed column order: F, Operation, E-mail, Telefonnummer, Vorname, Nachname, Source
    const [leadDate, operation, email, phone, firstName, lastName, source] = parts;

    // Detect Meta Lead ID and Form ID: long numeric strings (15+ digits), position-independent
    // First match = Lead ID, second = Form ID
    const metaIds = parts.slice(7).filter(p => /^\d{15,}$/.test(p));

    return {
      leadDate: leadDate || null,
      operation: operation || null,
      email: email && email.includes('@') ? email : null,
      phone: phone || null,
      firstName: firstName || null,
      lastName: lastName || null,
      source: source?.toLowerCase().trim() || null,
      metaLeadId: metaIds[0] || null,
      metaFormId: metaIds[1] || null,
    };
  };

  const handleLeadImport = async () => {
    const parsed = parseLeadRow(leadPasteText);
    if (!parsed || (!parsed.firstName && !parsed.email)) {
      toast({
        title: t('appointments.importFailed', 'Could not parse lead'),
        description: t('appointments.importFailedDesc', 'Please paste a tab-separated row from the leads Excel (Lead ID and Form ID are detected automatically)'),
        variant: "destructive",
      });
      return;
    }

    // Auto-fill notes from Operation
    if (parsed.operation) {
      setNotes(parsed.operation);
    }

    // Auto-fill referral source from Source column (fb/ig)
    if (parsed.source === 'fb' || parsed.source === 'ig') {
      setReferralSource("social");
      setReferralSourceDetail(parsed.source === 'fb' ? "facebook" : "instagram");
    }

    // Store lead date and Meta IDs for referral event
    if (parsed.leadDate) {
      setReferralCreatedAt(parsed.leadDate);
    }
    if (parsed.metaLeadId) setReferralMetaLeadId(parsed.metaLeadId);
    if (parsed.metaFormId) setReferralMetaFormId(parsed.metaFormId);

    // Try to find existing patient by searching name or email
    setLeadImportPending(true);
    try {
      const searchTerm = parsed.email || `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim();
      const response = await fetch(`/api/patients?hospitalId=${hospitalId}&search=${encodeURIComponent(searchTerm)}`);
      if (response.ok) {
        const existingPatients: Patient[] = await response.json();
        // Check for match by email or name
        const match = existingPatients.find(p =>
          (parsed.email && p.email?.toLowerCase() === parsed.email.toLowerCase()) ||
          (parsed.firstName && parsed.lastName &&
            p.firstName.toLowerCase() === parsed.firstName.toLowerCase() &&
            p.surname.toLowerCase() === parsed.lastName.toLowerCase())
        );

        if (match) {
          // Patient exists — select them, close panel
          setSelectedPatientId(match.id);
          setPatientSearch(`${match.firstName} ${match.surname}`);
          setShowLeadImport(false);
          setLeadPasteText("");
          toast({
            title: t('appointments.patientFound', 'Existing patient found'),
            description: `${match.firstName} ${match.surname}`,
          });
        } else {
          // No match — create new patient (panel closes via createPatientMutation.onSuccess)
          createPatientMutation.mutate({
            hospitalId,
            firstName: (parsed.firstName || '').trim(),
            surname: (parsed.lastName || '').trim(),
            birthday: "1900-01-01", // Unknown — lead Excel doesn't include DOB
            sex: "O",
            email: parsed.email || undefined,
            phone: parsed.phone || undefined,
          });
        }
      } else {
        toast({
          title: t('appointments.importFailed', 'Could not parse lead'),
          description: t('appointments.patientSearchFailed', 'Could not search for existing patients'),
          variant: "destructive",
        });
      }
    } catch (err) {
      toast({
        title: t('appointments.importFailed', 'Could not parse lead'),
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setLeadImportPending(false);
    }
  };

  const resetForm = () => {
    setSelectedPatientId("");
    setSelectedProviderId("");
    setSelectedServiceId("");
    setSelectedDate(formatDateForInput(new Date()));
    setSelectedSlot("");
    setPatientSearch("");
    setNotes("");
    setIsVideoAppointment(false);
    setVideoMeetingLink("");
    setShowNewPatientForm(false);
    setNewPatientFirstName("");
    setNewPatientSurname("");
    setNewPatientDOB("");
    setNewPatientPhone("");
    setBirthdayInput("");
    setReferralSource("");
    setReferralSourceDetail("");
    setReferralMetaLeadId(null);
    setReferralMetaFormId(null);
    setSendConfirmation(true);
    setShowLeadImport(false);
    setLeadPasteText("");
    setLeadImportPending(false);
    setReferralCreatedAt(null);
  };

  const handleSubmit = () => {
    const [startTime, endTime] = selectedSlot.split('-');
    if (!selectedPatientId || !selectedProviderId || !selectedDate || !startTime || !endTime) {
      toast({ title: t('appointments.fillRequired', 'Please fill all required fields'), variant: "destructive" });
      return;
    }
    
    createAppointmentMutation.mutate({
      patientId: selectedPatientId,
      providerId: selectedProviderId,
      serviceId: selectedServiceId || null,
      appointmentDate: selectedDate,
      startTime,
      endTime,
      notes: notes || null,
      isVideoAppointment,
      videoMeetingLink: videoMeetingLink || null,
      ...(referralSource ? { referralSource, referralSourceDetail: referralSourceDetail || null } : {}),
      ...(referralCreatedAt ? { referralCreatedAt } : {}),
      ...(referralMetaLeadId ? { metaLeadId: referralMetaLeadId } : {}),
      ...(referralMetaFormId ? { metaFormId: referralMetaFormId } : {}),
      sendConfirmation,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('appointments.bookNew', 'Book New Appointment')}</DialogTitle>
          <DialogDescription>
            {t('appointments.bookDescription', 'Select a patient, provider, and available time slot')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div>
            <Label>{t('appointments.searchPatient', 'Search Patient')} *</Label>
            {showLeadImport ? (
              <div className="border rounded-md p-4 space-y-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t('appointments.importLead', 'Import from Lead')}</h4>
                  <Button variant="ghost" size="sm" onClick={() => { setShowLeadImport(false); setLeadPasteText(""); }}
                    data-testid="button-cancel-lead-import">
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
                <Textarea
                  value={leadPasteText}
                  onChange={(e) => setLeadPasteText(e.target.value)}
                  placeholder="F → Operation → E-mail → Telefonnummer → Vorname → Nachname → Source"
                  rows={2}
                  data-testid="textarea-lead-paste"
                />
                <p className="text-xs text-muted-foreground">
                  {t('appointments.leadPasteHint', 'Paste one row from the leads Excel: F, Operation, E-mail, Phone, Vorname, Nachname, Source, ... Lead ID, Form ID (tab-separated)')}
                </p>
                <Button onClick={handleLeadImport} disabled={leadImportPending || !leadPasteText.trim()}
                  className="w-full" data-testid="button-import-lead">
                  {leadImportPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('appointments.importAndCreate', 'Import & Create Patient')}
                </Button>
              </div>
            ) : !showNewPatientForm ? (
              <div>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={patientSearch}
                    onChange={(e) => {
                      setPatientSearch(e.target.value);
                      if (selectedPatientId) setSelectedPatientId("");
                    }}
                    placeholder={t('appointments.searchPatientPlaceholder', 'Type at least 2 characters...')}
                    data-testid="input-patient-search"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowNewPatientForm(true)}
                    title={t('anesthesia.quickSchedule.newPatient', 'New Patient')}
                    data-testid="button-show-new-patient"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setShowLeadImport(true);
                      setShowNewPatientForm(false);
                    }}
                    title={t('appointments.importLead', 'Import from Lead')}
                    data-testid="button-show-lead-import"
                  >
                    <ClipboardPaste className="h-4 w-4" />
                  </Button>
                </div>
                {patients.length > 0 && !selectedPatientId && (
                  <div className="mt-1 border rounded-md max-h-32 overflow-y-auto">
                    {patients.map((patient) => (
                      <button
                        key={patient.id}
                        onClick={() => {
                          setSelectedPatientId(patient.id);
                          setPatientSearch(`${patient.firstName} ${patient.surname}`);
                        }}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${
                          selectedPatientId === patient.id ? 'bg-primary/10' : ''
                        }`}
                        data-testid={`patient-option-${patient.id}`}
                      >
                        {patient.firstName} {patient.surname}
                        {patient.birthday && !isBirthdayUnknown(patient.birthday) ? (
                          <span className="text-muted-foreground ml-2 text-xs">
                            ({format(new Date(patient.birthday), 'P', { locale: dateLocale })})
                          </span>
                        ) : patient.birthday && isBirthdayUnknown(patient.birthday) ? (
                          <span className="text-amber-500 ml-2 text-xs font-medium">
                            (Birthday not provided)
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border rounded-md p-4 space-y-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">{t('anesthesia.quickSchedule.newPatient', 'New Patient')}</h4>
                  <Button variant="ghost" size="sm" onClick={() => setShowNewPatientForm(false)}
                    data-testid="button-cancel-new-patient">
                    {t('common.cancel', 'Cancel')}
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-firstname">{t('anesthesia.quickSchedule.firstName', 'First Name')} *</Label>
                    <Input id="booking-new-patient-firstname" value={newPatientFirstName}
                      onChange={(e) => setNewPatientFirstName(e.target.value)}
                      data-testid="input-new-patient-firstname" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-surname">{t('anesthesia.quickSchedule.surname', 'Surname')} *</Label>
                    <Input id="booking-new-patient-surname" value={newPatientSurname}
                      onChange={(e) => setNewPatientSurname(e.target.value)}
                      data-testid="input-new-patient-surname" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-dob">{t('anesthesia.quickSchedule.dateOfBirth', 'Date of Birth')} *</Label>
                    <Input id="booking-new-patient-dob" type="text"
                      placeholder={t('anesthesia.quickSchedule.dobPlaceholder', 'dd.mm.yyyy')}
                      value={birthdayInput} onChange={handleBirthdayChange}
                      data-testid="input-new-patient-dob"
                      className={birthdayInput && !newPatientDOB ? "border-destructive" : ""} />
                    {birthdayInput && newPatientDOB && (
                      <div className="text-xs text-muted-foreground">{format(new Date(newPatientDOB), 'P', { locale: dateLocale })}</div>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="booking-new-patient-phone">{t('anesthesia.quickSchedule.phone', 'Phone')}</Label>
                    <PhoneInputWithCountry
                      id="booking-new-patient-phone"
                      placeholder={t('anesthesia.quickSchedule.phonePlaceholder', '+41...')}
                      value={newPatientPhone}
                      onChange={(value) => setNewPatientPhone(value)}
                      data-testid="input-new-patient-phone" />
                  </div>
                </div>
                <Button onClick={handleCreatePatient} disabled={createPatientMutation.isPending}
                  className="w-full" data-testid="button-create-patient">
                  {createPatientMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('anesthesia.quickSchedule.createPatient', 'Create Patient')}
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.provider', 'Provider')} *</Label>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger data-testid="select-booking-provider">
                  <SelectValue placeholder={t('appointments.selectProvider', 'Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.firstName || ''} {provider.lastName || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('appointments.service', 'Service')}</Label>
              <Select value={selectedServiceId} onValueChange={setSelectedServiceId}>
                <SelectTrigger data-testid="select-booking-service">
                  <SelectValue placeholder={t('appointments.selectService', 'Select service')} />
                </SelectTrigger>
                <SelectContent>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name} ({service.durationMinutes || 30} min)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('appointments.date', 'Date')} *</Label>
            <DateInput
              value={selectedDate}
              onChange={(v) => setSelectedDate(v)}
              min={formatDateForInput(new Date())}
              data-testid="input-booking-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.startTime', 'Start Time')} *</Label>
              <TimeInput
                value={selectedSlot.split('-')[0] || ''}
                onChange={(v) => {
                  const endTime = selectedSlot.split('-')[1] || '';
                  setSelectedSlot(`${v}-${endTime}`);
                }}
                data-testid="input-booking-start-time"
              />
            </div>
            <div>
              <Label>{t('appointments.endTime', 'End Time')} *</Label>
              <TimeInput
                value={selectedSlot.split('-')[1] || ''}
                onChange={(v) => {
                  const startTime = selectedSlot.split('-')[0] || '';
                  setSelectedSlot(`${startTime}-${v}`);
                }}
                data-testid="input-booking-end-time"
              />
            </div>
          </div>

          <div>
            <Label>{t('appointments.notes', 'Notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('appointments.notesPlaceholder', 'Optional notes...')}
              rows={2}
              data-testid="input-booking-notes"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.referralSource', 'Referral Source')}</Label>
              <Select value={referralSource} onValueChange={(v) => { setReferralSource(v); setReferralSourceDetail(""); }}>
                <SelectTrigger data-testid="select-referral-source">
                  <SelectValue placeholder={t('appointments.selectReferralSource', 'None')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="social">{t('referral.social', 'Social Media')}</SelectItem>
                  <SelectItem value="search_engine">{t('referral.searchEngine', 'Search Engine')}</SelectItem>
                  <SelectItem value="llm">{t('referral.llm', 'AI / ChatGPT')}</SelectItem>
                  <SelectItem value="word_of_mouth">{t('referral.wordOfMouth', 'Word of Mouth')}</SelectItem>
                  <SelectItem value="belegarzt">{t('referral.belegarzt', 'Belegarzt')}</SelectItem>
                  <SelectItem value="other">{t('referral.other', 'Other')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {referralSource === "social" && (
              <div>
                <Label>{t('referral.whichOne', 'Which one?')}</Label>
                <Select value={referralSourceDetail} onValueChange={setReferralSourceDetail}>
                  <SelectTrigger data-testid="select-referral-detail">
                    <SelectValue placeholder={t('referral.selectPlatform', 'Select...')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="facebook">{t('referral.facebook', 'Facebook')}</SelectItem>
                    <SelectItem value="instagram">{t('referral.instagram', 'Instagram')}</SelectItem>
                    <SelectItem value="tiktok">{t('referral.tiktok', 'TikTok')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {referralSource === "search_engine" && (
              <div>
                <Label>{t('referral.whichOne', 'Which one?')}</Label>
                <Select value={referralSourceDetail} onValueChange={setReferralSourceDetail}>
                  <SelectTrigger data-testid="select-referral-detail">
                    <SelectValue placeholder={t('referral.selectEngine', 'Select...')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="google">{t('referral.google', 'Google')}</SelectItem>
                    <SelectItem value="bing">{t('referral.bing', 'Bing')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {(referralSource === "word_of_mouth" || referralSource === "other") && (
              <div>
                <Label>{t('referral.detail', 'Detail')}</Label>
                <Input
                  value={referralSourceDetail}
                  onChange={(e) => setReferralSourceDetail(e.target.value)}
                  placeholder={referralSource === "word_of_mouth"
                    ? t('referral.wordOfMouthPlaceholder', 'Who referred them?')
                    : t('referral.otherPlaceholder', 'Please specify...')}
                  data-testid="input-referral-detail"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Video className="h-4 w-4" />
              {t('appointments.videoAppointment', 'Video Appointment')}
            </Label>
            <Switch checked={isVideoAppointment} onCheckedChange={setIsVideoAppointment} />
          </div>
          {isVideoAppointment && (
            <div>
              <Label>{t('appointments.videoMeetingLink', 'Meeting Link')}</Label>
              <Input
                value={videoMeetingLink}
                onChange={(e) => setVideoMeetingLink(e.target.value)}
                placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                data-testid="input-booking-video-link"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              {t('appointments.sendConfirmation', 'Send Confirmation SMS')}
            </Label>
            <Switch checked={sendConfirmation} onCheckedChange={setSendConfirmation} data-testid="toggle-send-confirmation" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createAppointmentMutation.isPending || !selectedPatientId || !selectedProviderId || !selectedDate || !selectedSlot.split('-')[0] || !selectedSlot.split('-')[1]}
            data-testid="button-book-appointment"
          >
            {createAppointmentMutation.isPending ? (
              <>{t('common.saving', 'Saving...')}</>
            ) : (
              <>{t('appointments.book', 'Book Appointment')}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InternalBookingDialog({
  open,
  onOpenChange,
  hospitalId,
  unitId,
  providers,
  defaults,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId: string;
  providers: { id: string; firstName: string | null; lastName: string | null }[];
  defaults?: { providerId?: string; date?: Date; endDate?: Date };
}) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [selectedColleagueId, setSelectedColleagueId] = useState<string>("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>(defaults?.providerId || "");
  const [selectedDate, setSelectedDate] = useState<string>(
    defaults?.date ? formatDateForInput(defaults.date) : formatDateForInput(new Date())
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(
    defaults?.date && defaults?.endDate
      ? `${formatTime(defaults.date)}-${formatTime(defaults.endDate)}`
      : ""
  );
  const [colleagueSearch, setColleagueSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState("");

  useMemo(() => {
    if (defaults?.providerId) setSelectedProviderId(defaults.providerId);
    if (defaults?.date) {
      setSelectedDate(formatDateForInput(defaults.date));
      if (defaults.endDate) {
        setSelectedSlot(`${formatTime(defaults.date)}-${formatTime(defaults.endDate)}`);
      }
    }
  }, [defaults]);

  const { data: colleagues = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null; email: string | null }[]>({
    queryKey: [`/api/hospitals/${hospitalId}/users`, colleagueSearch],
    queryFn: async () => {
      const response = await fetch(`/api/hospitals/${hospitalId}/users?search=${encodeURIComponent(colleagueSearch)}`);
      if (!response.ok) throw new Error('Failed to fetch colleagues');
      return response.json();
    },
    enabled: !!hospitalId && colleagueSearch.length >= 2,
  });

  const createInternalAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/appointments`, {
        ...data,
        appointmentType: 'internal',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.internalCreated', 'Internal appointment created successfully') });
      onOpenChange(false);
      resetForm();
    },
    onError: (error: any) => {
      toast({ title: t('appointments.createError', 'Failed to create appointment'), description: error?.message || undefined, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedColleagueId("");
    setSelectedProviderId("");
    setSelectedDate(formatDateForInput(new Date()));
    setSelectedSlot("");
    setColleagueSearch("");
    setNotes("");
    setSubject("");
  };

  const handleSubmit = () => {
    const [startTime, endTime] = selectedSlot.split('-');
    if (!selectedColleagueId || !selectedProviderId || !selectedDate || !startTime || !endTime) {
      toast({ title: t('appointments.fillRequired', 'Please fill all required fields'), variant: "destructive" });
      return;
    }
    
    createInternalAppointmentMutation.mutate({
      internalColleagueId: selectedColleagueId,
      providerId: selectedProviderId,
      appointmentDate: selectedDate,
      startTime,
      endTime,
      notes: notes || null,
      internalSubject: subject || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('appointments.bookInternal', 'Book Internal Meeting')}</DialogTitle>
          <DialogDescription>
            {t('appointments.bookInternalDescription', 'Schedule time with a colleague')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('appointments.subject', 'Subject')} *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('appointments.subjectPlaceholder', 'Meeting topic...')}
              data-testid="input-internal-subject"
            />
          </div>

          <div>
            <Label>{t('appointments.searchColleague', 'Search Colleague')} *</Label>
            <Input
              value={colleagueSearch}
              onChange={(e) => setColleagueSearch(e.target.value)}
              placeholder={t('appointments.searchColleaguePlaceholder', 'Type at least 2 characters...')}
              data-testid="input-colleague-search"
            />
            {colleagues.length > 0 && (
              <div className="mt-1 border rounded-md max-h-32 overflow-y-auto">
                {colleagues.map((colleague) => (
                  <button
                    key={colleague.id}
                    onClick={() => {
                      setSelectedColleagueId(colleague.id);
                      setColleagueSearch(`${colleague.firstName || ''} ${colleague.lastName || ''}`);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 ${
                      selectedColleagueId === colleague.id ? 'bg-primary/10' : ''
                    }`}
                    data-testid={`colleague-option-${colleague.id}`}
                  >
                    {colleague.firstName || ''} {colleague.lastName || ''}
                    {colleague.email && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({colleague.email})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.provider', 'Provider')} *</Label>
              <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
                <SelectTrigger data-testid="select-internal-provider">
                  <SelectValue placeholder={t('appointments.selectProvider', 'Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.firstName || ''} {provider.lastName || ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('appointments.date', 'Date')} *</Label>
              <DateInput
                value={selectedDate}
                onChange={(v) => setSelectedDate(v)}
                min={formatDateForInput(new Date())}
                data-testid="input-internal-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.startTime', 'Start Time')} *</Label>
              <TimeInput
                value={selectedSlot.split('-')[0] || ''}
                onChange={(v) => {
                  const endTime = selectedSlot.split('-')[1] || '';
                  setSelectedSlot(`${v}-${endTime}`);
                }}
                data-testid="input-internal-start-time"
              />
            </div>
            <div>
              <Label>{t('appointments.endTime', 'End Time')} *</Label>
              <TimeInput
                value={selectedSlot.split('-')[1] || ''}
                onChange={(v) => {
                  const startTime = selectedSlot.split('-')[0] || '';
                  setSelectedSlot(`${startTime}-${v}`);
                }}
                data-testid="input-internal-end-time"
              />
            </div>
          </div>

          <div>
            <Label>{t('appointments.notes', 'Notes')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('appointments.notesPlaceholder', 'Optional notes...')}
              rows={2}
              data-testid="input-internal-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createInternalAppointmentMutation.isPending || !selectedColleagueId || !selectedProviderId || !selectedDate || !selectedSlot.split('-')[0] || !selectedSlot.split('-')[1]}
            data-testid="button-book-internal"
          >
            {createInternalAppointmentMutation.isPending ? (
              <>{t('common.saving', 'Saving...')}</>
            ) : (
              <>{t('appointments.bookMeeting', 'Book Meeting')}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
