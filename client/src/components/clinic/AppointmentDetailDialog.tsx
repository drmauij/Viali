import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import {
  Calendar,
  User,
  Users,
  Phone,
  Mail,
  X,
  Check,
  Trash2,
  Loader2,
  Pencil,
  Video,
} from "lucide-react";
import { parseISO } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDateLong } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";

export type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
  colleague?: UserType;
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  in_progress: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" },
  completed: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", border: "border-gray-300 dark:border-gray-600" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  no_show: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
};

export function getStatusLabel(status: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    scheduled: t('appointments.status.scheduled', 'Scheduled'),
    confirmed: t('appointments.status.confirmed', 'Confirmed'),
    in_progress: t('appointments.status.inProgress', 'In Progress'),
    completed: t('appointments.status.completed', 'Completed'),
    cancelled: t('appointments.status.cancelled', 'Cancelled'),
    no_show: t('appointments.status.noShow', 'No Show'),
  };
  return labels[status] || status;
}

interface AppointmentDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment: AppointmentWithDetails | null;
  hospitalId: string;
  unitId: string;
  providers: { id: string; firstName: string | null; lastName: string | null }[];
  onNavigateToPatient?: (patientId: string) => void;
}

export default function AppointmentDetailDialog({
  open,
  onOpenChange,
  appointment,
  hospitalId,
  unitId,
  providers,
  onNavigateToPatient,
}: AppointmentDetailDialogProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editIsVideo, setEditIsVideo] = useState(false);
  const [editVideoLink, setEditVideoLink] = useState('');

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
      onOpenChange(false);
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
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t('appointments.deleteError', 'Failed to delete appointment'), variant: "destructive" });
    },
  });

  const rescheduleAppointmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { appointmentDate?: string; startTime?: string; endTime?: string; providerId?: string } }) => {
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.rescheduled', 'Appointment rescheduled') });
      setEditMode(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t('appointments.rescheduleError', 'Failed to reschedule appointment'), variant: "destructive" });
    },
  });

  const enterEditMode = () => {
    if (!appointment) return;
    setEditDate(appointment.appointmentDate);
    setEditStartTime(appointment.startTime);
    setEditEndTime(appointment.endTime);
    setEditProviderId(appointment.providerId || '');
    setEditIsVideo(appointment.isVideoAppointment || false);
    setEditVideoLink(appointment.videoMeetingLink || '');
    setEditMode(true);
  };

  const handleSaveReschedule = () => {
    if (!appointment) return;
    const changes: Record<string, any> = {};
    if (editDate !== appointment.appointmentDate) changes.appointmentDate = editDate;
    if (editStartTime !== appointment.startTime) changes.startTime = editStartTime;
    if (editEndTime !== appointment.endTime) changes.endTime = editEndTime;
    if (editProviderId !== (appointment.providerId || '')) changes.providerId = editProviderId;
    if (editIsVideo !== (appointment.isVideoAppointment || false)) changes.isVideoAppointment = editIsVideo;
    if (editVideoLink !== (appointment.videoMeetingLink || '')) changes.videoMeetingLink = editVideoLink || null;
    if (Object.keys(changes).length === 0) {
      setEditMode(false);
      return;
    }
    rescheduleAppointmentMutation.mutate({ id: appointment.id, data: changes });
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) setEditMode(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('appointments.details', 'Appointment Details')}
          </DialogTitle>
        </DialogHeader>

        {appointment && (
          <div className="space-y-3">
            {/* Patient / Colleague Card */}
            {appointment.appointmentType === 'internal' ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium" data-testid="text-patient-name">
                      {appointment.colleague
                        ? `${appointment.colleague.firstName} ${appointment.colleague.lastName}`
                        : t('appointments.internalMeeting', 'Internal Meeting')}
                    </h4>
                    {appointment.internalSubject && (
                      <p className="text-sm text-muted-foreground">
                        {appointment.internalSubject}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`rounded-lg border bg-muted/30 p-3 ${onNavigateToPatient ? 'cursor-pointer transition-colors hover:bg-muted/60' : ''}`}
                onClick={() => {
                  if (onNavigateToPatient && appointment.patient?.id) {
                    onNavigateToPatient(appointment.patient.id);
                  }
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-medium" data-testid="text-patient-name">
                      {appointment.patient
                        ? `${appointment.patient.firstName} ${appointment.patient.surname}`
                        : t('appointments.unknownPatient', 'Unknown Patient')}
                    </h4>
                    {appointment.patient?.phone && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {appointment.patient.phone}
                      </p>
                    )}
                    {appointment.patient?.email && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {appointment.patient.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Appointment Details Card */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t('appointments.details', 'Appointment Details')}</p>
                {!editMode && (appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={enterEditMode}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">{t('appointments.date', 'Date')}</p>
                  {editMode ? (
                    <DateInput
                      value={editDate}
                      onChange={(val) => setEditDate(val)}
                    />
                  ) : (
                    <p className="font-medium" data-testid="text-appointment-date">
                      {formatDateLong(parseISO(appointment.appointmentDate))}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">{t('appointments.time', 'Time')}</p>
                  {editMode ? (
                    <div className="flex items-center gap-1">
                      <TimeInput
                        value={editStartTime}
                        onChange={(val) => setEditStartTime(val)}
                        className="w-20"
                      />
                      <span>-</span>
                      <TimeInput
                        value={editEndTime}
                        onChange={(val) => setEditEndTime(val)}
                        className="w-20"
                      />
                    </div>
                  ) : (
                    <p className="font-medium" data-testid="text-appointment-time">
                      {appointment.startTime} - {appointment.endTime}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">{t('appointments.provider', 'Provider')}</p>
                  {editMode ? (
                    <Select value={editProviderId} onValueChange={setEditProviderId}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {providers.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">
                      {appointment.provider
                        ? `${appointment.provider.firstName} ${appointment.provider.lastName}`
                        : '-'}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">
                    {appointment.appointmentType === 'internal'
                      ? t('appointments.subject', 'Subject')
                      : t('appointments.service', 'Service')}
                  </p>
                  <p className="font-medium">
                    {appointment.appointmentType === 'internal'
                      ? (appointment.internalSubject || '-')
                      : (appointment.service?.name || '-')}
                  </p>
                </div>
              </div>

              {editMode && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      {t('appointments.videoAppointment', 'Video Appointment')}
                    </Label>
                    <Switch checked={editIsVideo} onCheckedChange={setEditIsVideo} />
                  </div>
                  {editIsVideo && (
                    <div>
                      <Label>{t('appointments.videoMeetingLink', 'Meeting Link')}</Label>
                      <Input
                        value={editVideoLink}
                        onChange={(e) => setEditVideoLink(e.target.value)}
                        placeholder="https://zoom.us/j/... or https://meet.google.com/..."
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <p className="text-muted-foreground text-sm mb-1">{t('appointments.statusLabel', 'Status')}</p>
                <Badge className={`${STATUS_COLORS[appointment.status]?.bg} ${STATUS_COLORS[appointment.status]?.text}`}>
                  {getStatusLabel(appointment.status, t)}
                </Badge>
              </div>

              {appointment.isVideoAppointment && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1 flex items-center gap-1">
                    <Video className="h-3 w-3" />
                    {t('appointments.videoAppointment', 'Video Appointment')}
                  </p>
                  {appointment.videoMeetingLink && (
                    <a
                      href={appointment.videoMeetingLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary underline break-all"
                    >
                      {appointment.videoMeetingLink}
                    </a>
                  )}
                </div>
              )}

              {appointment.notes && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('appointments.notes', 'Notes')}</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{appointment.notes}</p>
                </div>
              )}
            </div>

            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {editMode ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(false)}
                    disabled={rescheduleAppointmentMutation.isPending}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveReschedule}
                    disabled={rescheduleAppointmentMutation.isPending}
                  >
                    {rescheduleAppointmentMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {t('common.save', 'Save')}
                  </Button>
                </>
              ) : (
                <>
                  {appointment.status === 'scheduled' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                      disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                      data-testid="button-confirm-appointment"
                    >
                      <Check className="h-4 w-4 mr-1" />
                      {t('appointments.confirm', 'Confirm')}
                    </Button>
                  )}
                  {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'in_progress' })}
                        disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                        data-testid="button-start-appointment"
                      >
                        {t('appointments.start', 'Start')}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'cancelled' })}
                        disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                        data-testid="button-cancel-appointment"
                      >
                        <X className="h-4 w-4 mr-1" />
                        {t('appointments.cancel', 'Cancel')}
                      </Button>
                    </>
                  )}
                  {appointment.status === 'in_progress' && (
                    <Button
                      size="sm"
                      onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'completed' })}
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
                        deleteAppointmentMutation.mutate(appointment.id);
                      }
                    }}
                    disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                    data-testid="button-delete-appointment"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    {t('appointments.delete', 'Delete')}
                  </Button>
                </>
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
