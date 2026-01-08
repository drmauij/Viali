import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Clock,
  Plus,
  User,
  Phone,
  Mail,
  X,
  Check,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import ClinicCalendar from "@/components/clinic/ClinicCalendar";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";

type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
};

const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  in_progress: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" },
  completed: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", border: "border-gray-300 dark:border-gray-600" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  no_show: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
};

export default function ClinicAppointments() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [bookingDefaults, setBookingDefaults] = useState<{ providerId?: string; date?: Date; endDate?: Date }>({});

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

  const { data: providers = [] } = useQuery<{ id: string; firstName: string; lastName: string }[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers`],
    enabled: !!hospitalId && !!unitId,
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/units/${unitId}/appointments`);
        }
      });
      toast({ title: t('appointments.statusUpdated', 'Appointment status updated') });
      setDetailDialogOpen(false);
    },
    onError: () => {
      toast({ title: t('appointments.updateError', 'Failed to update appointment'), variant: "destructive" });
    },
  });

  const syncTimebutlerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/clinic/${hospitalId}/queue-ics-sync`);
      return response.json();
    },
    onSuccess: () => {
      toast({ 
        title: t('appointments.syncQueued', 'Calendar sync started'),
        description: t('appointments.syncQueuedDesc', 'Absences will be synced in the background')
      });
    },
    onError: () => {
      toast({ title: t('appointments.syncError', 'Failed to start calendar sync'), variant: "destructive" });
    },
  });

  const handleBookAppointment = (data: { providerId: string; date: Date; endDate?: Date }) => {
    setBookingDefaults(data);
    setBookingDialogOpen(true);
  };

  const handleEventClick = (appointment: AppointmentWithDetails) => {
    setSelectedAppointment(appointment);
    setDetailDialogOpen(true);
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      scheduled: t('appointments.status.scheduled', 'Scheduled'),
      confirmed: t('appointments.status.confirmed', 'Confirmed'),
      in_progress: t('appointments.status.inProgress', 'In Progress'),
      completed: t('appointments.status.completed', 'Completed'),
      cancelled: t('appointments.status.cancelled', 'Cancelled'),
      no_show: t('appointments.status.noShow', 'No Show'),
    };
    return labels[status] || status;
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
    <div className="container mx-auto px-0 py-6 pb-24" data-testid="appointments-page">
      <div className="flex items-center justify-between px-4 mb-6">
        <div className="flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            {t('appointments.title', 'Appointments')}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline"
            onClick={() => syncTimebutlerMutation.mutate()}
            disabled={syncTimebutlerMutation.isPending}
            data-testid="button-sync-timebutler"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncTimebutlerMutation.isPending ? 'animate-spin' : ''}`} />
            {t('appointments.syncCalendars', 'Sync Calendars')}
          </Button>
          <Button 
            onClick={() => {
              setBookingDefaults({});
              setBookingDialogOpen(true);
            }}
            data-testid="button-new-appointment"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('appointments.new', 'New Appointment')}
          </Button>
        </div>
      </div>

      <div>
        <ClinicCalendar
          hospitalId={hospitalId}
          unitId={unitId}
          onBookAppointment={handleBookAppointment}
          onEventClick={handleEventClick}
          statusLegend={
            <div className="flex flex-wrap gap-3 p-4 border-t bg-muted/30 text-sm">
              {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${colors.bg} border ${colors.border}`} />
                  <span className="text-muted-foreground">{getStatusLabel(status)}</span>
                </div>
              ))}
            </div>
          }
        />
      </div>

      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('appointments.details', 'Appointment Details')}
            </DialogTitle>
          </DialogHeader>

          {selectedAppointment && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h4 className="font-medium" data-testid="text-patient-name">
                    {selectedAppointment.patient 
                      ? `${selectedAppointment.patient.firstName} ${selectedAppointment.patient.surname}`
                      : t('appointments.unknownPatient', 'Unknown Patient')}
                  </h4>
                  {selectedAppointment.patient?.phone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedAppointment.patient.phone}
                    </p>
                  )}
                  {selectedAppointment.patient?.email && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedAppointment.patient.email}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('appointments.date', 'Date')}</p>
                  <p className="font-medium" data-testid="text-appointment-date">
                    {format(parseISO(selectedAppointment.appointmentDate), 'PPP', { locale: dateLocale })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('appointments.time', 'Time')}</p>
                  <p className="font-medium" data-testid="text-appointment-time">
                    {selectedAppointment.startTime} - {selectedAppointment.endTime}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('appointments.provider', 'Provider')}</p>
                  <p className="font-medium">
                    {selectedAppointment.provider 
                      ? `${selectedAppointment.provider.firstName} ${selectedAppointment.provider.lastName}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{t('appointments.service', 'Service')}</p>
                  <p className="font-medium">
                    {selectedAppointment.service?.name || '-'}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('appointments.status', 'Status')}</p>
                <Badge className={`${STATUS_COLORS[selectedAppointment.status]?.bg} ${STATUS_COLORS[selectedAppointment.status]?.text}`}>
                  {getStatusLabel(selectedAppointment.status)}
                </Badge>
              </div>

              {selectedAppointment.notes && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('appointments.notes', 'Notes')}</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{selectedAppointment.notes}</p>
                </div>
              )}

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                {selectedAppointment.status === 'scheduled' && (
                  <Button
                    variant="outline"
                    onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: 'confirmed' })}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-confirm-appointment"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t('appointments.confirm', 'Confirm')}
                  </Button>
                )}
                {(selectedAppointment.status === 'scheduled' || selectedAppointment.status === 'confirmed') && (
                  <>
                    <Button
                      variant="default"
                      onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: 'in_progress' })}
                      disabled={updateAppointmentMutation.isPending}
                      data-testid="button-start-appointment"
                    >
                      {t('appointments.start', 'Start')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: 'cancelled' })}
                      disabled={updateAppointmentMutation.isPending}
                      data-testid="button-cancel-appointment"
                    >
                      <X className="h-4 w-4 mr-1" />
                      {t('appointments.cancel', 'Cancel')}
                    </Button>
                  </>
                )}
                {selectedAppointment.status === 'in_progress' && (
                  <Button
                    onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: 'completed' })}
                    disabled={updateAppointmentMutation.isPending}
                    data-testid="button-complete-appointment"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t('appointments.complete', 'Complete')}
                  </Button>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BookingDialog 
        open={bookingDialogOpen} 
        onOpenChange={setBookingDialogOpen}
        hospitalId={hospitalId}
        unitId={unitId}
        providers={providers}
        defaults={bookingDefaults}
      />
    </div>
  );
}

function BookingDialog({
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
  providers: { id: string; firstName: string; lastName: string }[];
  defaults?: { providerId?: string; date?: Date; endDate?: Date };
}) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>(defaults?.providerId || "");
  const [selectedServiceId, setSelectedServiceId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    defaults?.date ? format(defaults.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(
    defaults?.date && defaults?.endDate 
      ? `${format(defaults.date, 'HH:mm')}-${format(defaults.endDate, 'HH:mm')}`
      : ""
  );
  const [patientSearch, setPatientSearch] = useState("");
  const [notes, setNotes] = useState("");

  // Update state when defaults change (from calendar slot selection)
  useMemo(() => {
    if (defaults?.providerId) setSelectedProviderId(defaults.providerId);
    if (defaults?.date) {
      setSelectedDate(format(defaults.date, 'yyyy-MM-dd'));
      if (defaults.endDate) {
        setSelectedSlot(`${format(defaults.date, 'HH:mm')}-${format(defaults.endDate, 'HH:mm')}`);
      }
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

  const { data: services = [] } = useQuery<ClinicService[]>({
    queryKey: [`/api/clinic/${hospitalId}/services?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId,
  });

  const selectedService = services.find(s => s.id === selectedServiceId);
  const duration = selectedService?.durationMinutes || 30;

  const { data: availableSlots = [], isLoading: slotsLoading } = useQuery<{ startTime: string; endTime: string }[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/available-slots?date=${selectedDate}&duration=${duration}`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && !!selectedDate,
  });

  const createAppointmentMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/appointments`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/units/${unitId}/appointments`);
        }
      });
      toast({ title: t('appointments.created', 'Appointment created successfully') });
      onOpenChange(false);
      resetForm();
    },
    onError: () => {
      toast({ title: t('appointments.createError', 'Failed to create appointment'), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedPatientId("");
    setSelectedProviderId("");
    setSelectedServiceId("");
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
    setSelectedSlot("");
    setPatientSearch("");
    setNotes("");
  };

  const handleSubmit = () => {
    if (!selectedPatientId || !selectedProviderId || !selectedDate || !selectedSlot) {
      toast({ title: t('appointments.fillRequired', 'Please fill all required fields'), variant: "destructive" });
      return;
    }

    const [startTime, endTime] = selectedSlot.split('-');
    
    createAppointmentMutation.mutate({
      patientId: selectedPatientId,
      providerId: selectedProviderId,
      serviceId: selectedServiceId || null,
      appointmentDate: selectedDate,
      startTime,
      endTime,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('appointments.bookNew', 'Book New Appointment')}</DialogTitle>
          <DialogDescription>
            {t('appointments.bookDescription', 'Select a patient, provider, and available time slot')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('appointments.searchPatient', 'Search Patient')} *</Label>
            <Input
              value={patientSearch}
              onChange={(e) => setPatientSearch(e.target.value)}
              placeholder={t('appointments.searchPatientPlaceholder', 'Type at least 2 characters...')}
              data-testid="input-patient-search"
            />
            {patients.length > 0 && (
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
                    {patient.birthday && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({format(new Date(patient.birthday), 'P', { locale: dateLocale })})
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
                <SelectTrigger data-testid="select-booking-provider">
                  <SelectValue placeholder={t('appointments.selectProvider', 'Select provider')} />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.firstName} {provider.lastName}
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
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              data-testid="input-booking-date"
            />
          </div>

          {selectedProviderId && selectedDate && (
            <div>
              <Label>{t('appointments.timeSlot', 'Time Slot')} *</Label>
              {slotsLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : availableSlots.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {availableSlots.map((slot) => (
                    <Button
                      key={`${slot.startTime}-${slot.endTime}`}
                      variant={selectedSlot === `${slot.startTime}-${slot.endTime}` ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedSlot(`${slot.startTime}-${slot.endTime}`)}
                      data-testid={`slot-${slot.startTime}`}
                    >
                      {slot.startTime}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">
                  {t('appointments.noSlots', 'No available slots for this date')}
                </p>
              )}
            </div>
          )}

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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createAppointmentMutation.isPending || !selectedPatientId || !selectedProviderId || !selectedDate || !selectedSlot}
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
