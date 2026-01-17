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
  Trash2,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHospitalAddons } from "@/hooks/useHospitalAddons";
import ClinicCalendar from "@/components/clinic/ClinicCalendar";
import { ManageAvailabilityDialog } from "@/components/clinic/ManageAvailabilityDialog";
import { BookingTypeSelector, type BookingType } from "@/components/clinic/BookingTypeSelector";
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
  const { addons } = useHospitalAddons();
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentWithDetails | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [bookingTypeSelectorOpen, setBookingTypeSelectorOpen] = useState(false);
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [internalBookingDialogOpen, setInternalBookingDialogOpen] = useState(false);
  const [bookingDefaults, setBookingDefaults] = useState<{ providerId?: string; date?: Date; endDate?: Date }>({});
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [selectedProviderForAvailability, setSelectedProviderForAvailability] = useState<string | undefined>();

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
  const canAccessSurgery = activeHospital?.role === 'admin' || activeHospital?.role === 'doctor';

  const { data: providers = [] } = useQuery<{ id: string; firstName: string | null; lastName: string | null }[]>({
    queryKey: ['bookable-providers', hospitalId],
    queryFn: async () => {
      const response = await fetch(`/api/clinic/${hospitalId}/bookable-providers`, {
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

  const updateAppointmentMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.statusUpdated', 'Appointment status updated') });
      setDetailDialogOpen(false);
    },
    onError: () => {
      toast({ title: t('appointments.updateError', 'Failed to update appointment'), variant: "destructive" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/clinic/${hospitalId}/appointments/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.deleted', 'Appointment deleted') });
      setDetailDialogOpen(false);
    },
    onError: () => {
      toast({ title: t('appointments.deleteError', 'Failed to delete appointment'), variant: "destructive" });
    },
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

  // Check Cal.com configuration - only query if retell addon is active
  const { data: calcomConfig, isLoading: calcomConfigLoading } = useQuery<{
    isEnabled: boolean;
    apiKey?: string;
  }>({
    queryKey: [`/api/clinic/${hospitalId}/calcom-config`],
    enabled: !!hospitalId && addons.retell,
  });
  // Cal.com is only enabled if both the config is set AND the retell addon is active
  const calcomEnabled = addons.retell && calcomConfig?.isEnabled && calcomConfig?.apiKey === '***configured***';

  // Unified sync mutation - syncs both Timebutler and Cal.com in parallel
  const syncCalendarsMutation = useMutation({
    mutationFn: async () => {
      const results: { timebutler?: any; calcom?: any; calcomError?: string } = {};
      
      // Run both syncs in parallel for better performance
      const syncPromises: Promise<void>[] = [];
      
      // Timebutler/ICS sync
      syncPromises.push(
        apiRequest("POST", `/api/clinic/${hospitalId}/queue-ics-sync`)
          .then(res => res.json())
          .then(data => { results.timebutler = data; })
      );
      
      // Cal.com sync if enabled (check fresh config)
      if (calcomEnabled) {
        syncPromises.push(
          apiRequest("POST", `/api/clinic/${hospitalId}/calcom-sync`)
            .then(res => res.json())
            .then(data => { results.calcom = data; })
            .catch(err => { 
              results.calcomError = err.message || 'Cal.com sync failed';
            })
        );
      }
      
      await Promise.all(syncPromises);
      return results;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/calcom-config`] });
      
      if (data.calcomError) {
        // Partial failure - Timebutler succeeded but Cal.com failed
        toast({ 
          title: t('appointments.syncPartial', 'Calendar sync partially complete'),
          description: `${t('appointments.syncQueuedDesc', 'Absences will be synced in the background')}. Cal.com: ${data.calcomError}`,
          variant: "destructive"
        });
      } else {
        const calcomBlocks = data.calcom?.syncedBlocks || 0;
        toast({ 
          title: t('appointments.syncQueued', 'Calendar sync started'),
          description: calcomEnabled 
            ? t('appointments.syncQueuedDescBoth', `Absences syncing. ${calcomBlocks} blocks synced to Cal.com.`)
            : t('appointments.syncQueuedDesc', 'Absences will be synced in the background')
        });
      }
    },
    onError: () => {
      toast({ title: t('appointments.syncError', 'Failed to start calendar sync'), variant: "destructive" });
    },
  });

  const handleBookAppointment = (data: { providerId: string; date: Date; endDate?: Date }) => {
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
          createOffTimeMutation.mutate({
            providerId: bookingDefaults.providerId,
            date: format(bookingDefaults.date, 'yyyy-MM-dd'),
            startTime: format(bookingDefaults.date, 'HH:mm'),
            endTime: bookingDefaults.endDate ? format(bookingDefaults.endDate, 'HH:mm') : format(new Date(bookingDefaults.date.getTime() + 30 * 60000), 'HH:mm'),
          });
        }
        break;
      case 'surgery':
        if (canAccessSurgery && bookingDefaults.date) {
          const dateStr = format(bookingDefaults.date, 'yyyy-MM-dd');
          const startTimeStr = format(bookingDefaults.date, 'HH:mm');
          const endTimeStr = bookingDefaults.endDate ? format(bookingDefaults.endDate, 'HH:mm') : format(new Date(bookingDefaults.date.getTime() + 60 * 60000), 'HH:mm');
          window.location.href = `/anesthesia/op/new?date=${dateStr}&startTime=${startTimeStr}&endTime=${endTimeStr}${bookingDefaults.providerId ? `&providerId=${bookingDefaults.providerId}` : ''}`;
        }
        break;
    }
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
            onClick={() => syncCalendarsMutation.mutate()}
            disabled={syncCalendarsMutation.isPending || calcomConfigLoading}
            data-testid="button-sync-calendars"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${syncCalendarsMutation.isPending || calcomConfigLoading ? 'animate-spin' : ''}`} />
            {t('appointments.syncCalendars', 'Sync Calendars')}
          </Button>
          <Button 
            size="sm"
            onClick={() => {
              setBookingDefaults({});
              setBookingTypeSelectorOpen(true);
            }}
            data-testid="button-new-appointment"
          >
            <Plus className="h-4 w-4 mr-1" />
            {t('appointments.new', 'New Appointment')}
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
                    disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
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
                      disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                      data-testid="button-start-appointment"
                    >
                      {t('appointments.start', 'Start')}
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() => updateAppointmentMutation.mutate({ id: selectedAppointment.id, status: 'cancelled' })}
                      disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
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
                    disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                    data-testid="button-complete-appointment"
                  >
                    <Check className="h-4 w-4 mr-1" />
                    {t('appointments.complete', 'Complete')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (window.confirm(t('appointments.deleteConfirm', 'Are you sure you want to permanently delete this appointment? This action cannot be undone.'))) {
                      deleteAppointmentMutation.mutate(selectedAppointment.id);
                    }
                  }}
                  disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                  data-testid="button-delete-appointment"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t('appointments.delete', 'Delete')}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <BookingTypeSelector
        open={bookingTypeSelectorOpen}
        onOpenChange={setBookingTypeSelectorOpen}
        onSelect={handleBookingTypeSelect}
        canAccessSurgery={canAccessSurgery}
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
  providers: { id: string; firstName: string | null; lastName: string | null }[];
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
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              min={format(new Date(), 'yyyy-MM-dd')}
              data-testid="input-booking-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.startTime', 'Start Time')} *</Label>
              <Input
                type="time"
                value={selectedSlot.split('-')[0] || ''}
                onChange={(e) => {
                  const endTime = selectedSlot.split('-')[1] || '';
                  setSelectedSlot(`${e.target.value}-${endTime}`);
                }}
                data-testid="input-booking-start-time"
              />
            </div>
            <div>
              <Label>{t('appointments.endTime', 'End Time')} *</Label>
              <Input
                type="time"
                value={selectedSlot.split('-')[1] || ''}
                onChange={(e) => {
                  const startTime = selectedSlot.split('-')[0] || '';
                  setSelectedSlot(`${startTime}-${e.target.value}`);
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
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const dateLocale = i18n.language === 'de' ? de : enUS;

  const [selectedColleagueId, setSelectedColleagueId] = useState<string>("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>(defaults?.providerId || "");
  const [selectedDate, setSelectedDate] = useState<string>(
    defaults?.date ? format(defaults.date, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
  );
  const [selectedSlot, setSelectedSlot] = useState<string>(
    defaults?.date && defaults?.endDate 
      ? `${format(defaults.date, 'HH:mm')}-${format(defaults.endDate, 'HH:mm')}`
      : ""
  );
  const [colleagueSearch, setColleagueSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [subject, setSubject] = useState("");

  useMemo(() => {
    if (defaults?.providerId) setSelectedProviderId(defaults.providerId);
    if (defaults?.date) {
      setSelectedDate(format(defaults.date, 'yyyy-MM-dd'));
      if (defaults.endDate) {
        setSelectedSlot(`${format(defaults.date, 'HH:mm')}-${format(defaults.endDate, 'HH:mm')}`);
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
    onError: () => {
      toast({ title: t('appointments.createError', 'Failed to create appointment'), variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedColleagueId("");
    setSelectedProviderId("");
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'));
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
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={format(new Date(), 'yyyy-MM-dd')}
                data-testid="input-internal-date"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('appointments.startTime', 'Start Time')} *</Label>
              <Input
                type="time"
                value={selectedSlot.split('-')[0] || ''}
                onChange={(e) => {
                  const endTime = selectedSlot.split('-')[1] || '';
                  setSelectedSlot(`${e.target.value}-${endTime}`);
                }}
                data-testid="input-internal-start-time"
              />
            </div>
            <div>
              <Label>{t('appointments.endTime', 'End Time')} *</Label>
              <Input
                type="time"
                value={selectedSlot.split('-')[1] || ''}
                onChange={(e) => {
                  const startTime = selectedSlot.split('-')[0] || '';
                  setSelectedSlot(`${startTime}-${e.target.value}`);
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
