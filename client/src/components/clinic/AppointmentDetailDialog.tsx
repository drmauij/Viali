import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery } from "@tanstack/react-query";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  UserX,
  Undo2,
  LogIn,
  Megaphone,
  MessageSquare,
  ChevronDown,
  ClipboardPaste,
} from "lucide-react";
import { parseISO } from "date-fns";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatDateLong } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import type { ClinicAppointment, Patient, User as UserType, ClinicService } from "@shared/schema";
import { SendQuestionnaireDialog } from "@/components/anesthesia/SendQuestionnaireDialog";

export type AppointmentWithDetails = ClinicAppointment & {
  patient?: Patient;
  provider?: UserType;
  service?: ClinicService;
  colleague?: UserType;
  creator?: UserType;
};

export const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-800 dark:text-blue-300", border: "border-blue-300 dark:border-blue-700" },
  confirmed: { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-800 dark:text-green-300", border: "border-green-300 dark:border-green-700" },
  arrived: { bg: "bg-teal-100 dark:bg-teal-900/30", text: "text-teal-800 dark:text-teal-300", border: "border-teal-300 dark:border-teal-700" },
  in_progress: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-800 dark:text-orange-300", border: "border-orange-300 dark:border-orange-700" },
  completed: { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-600 dark:text-gray-400", border: "border-gray-300 dark:border-gray-600" },
  cancelled: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-800 dark:text-red-300", border: "border-red-300 dark:border-red-700" },
  no_show: { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-800 dark:text-purple-300", border: "border-purple-300 dark:border-purple-700" },
};

export function getStatusLabel(status: string, t: (key: string, fallback: string) => string) {
  const labels: Record<string, string> = {
    scheduled: t('appointments.status.scheduled', 'Scheduled'),
    confirmed: t('appointments.status.confirmed', 'Confirmed'),
    arrived: t('appointments.status.arrived', 'Arrived'),
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
  const [communicationOpen, setCommunicationOpen] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');
  const [editProviderId, setEditProviderId] = useState('');
  const [editIsVideo, setEditIsVideo] = useState(false);
  const [editVideoLink, setEditVideoLink] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editServiceId, setEditServiceId] = useState('');

  // Referral source state
  const [editReferral, setEditReferral] = useState(false);
  const [referralSource, setReferralSource] = useState('');
  const [referralSourceDetail, setReferralSourceDetail] = useState('');

  // Admin-only paste-from-lead state
  const activeHospital = useActiveHospital();
  const isAdmin = activeHospital?.role === "admin";
  const [pastePreview, setPastePreview] = useState<
    | null
    | { leadId: string; firstName: string; lastName: string; summary: string; source: string }
  >(null);

  const { data: referralEvent } = useQuery<{
    id: string;
    source: string;
    sourceDetail: string | null;
  } | null>({
    queryKey: [`/api/clinic/${hospitalId}/appointments/${appointment?.id}/referral`],
    enabled: !!hospitalId && !!appointment?.id && appointment?.appointmentType !== 'internal',
  });

  // Fetch the hospital's promo codes (cached) so the appointment dialog can
  // resolve `appointment.promoCode` (a string) → full conditions for staff.
  const { data: hospitalPromoCodes = [] } = useQuery<
    Array<{
      id: string;
      code: string;
      discountType: string;
      discountValue: string;
      description: string | null;
      validUntil: string | null;
      maxUses: number | null;
      usedCount: number;
    }>
  >({
    queryKey: [`/api/business/${hospitalId}/promo-codes`],
    enabled: !!hospitalId && !!appointment?.promoCode,
  });
  const promoCodeDetails = appointment?.promoCode
    ? hospitalPromoCodes.find(
        (p) => p.code.toUpperCase() === appointment.promoCode!.toUpperCase(),
      ) ?? null
    : null;

  useEffect(() => {
    if (referralEvent) {
      setReferralSource(referralEvent.source);
      setReferralSourceDetail(referralEvent.sourceDetail || '');
    } else {
      setReferralSource('');
      setReferralSourceDetail('');
    }
  }, [referralEvent]);

  const saveReferralMutation = useMutation({
    mutationFn: async ({ source, sourceDetail }: { source: string; sourceDetail: string }) => {
      return apiRequest("PUT", `/api/clinic/${hospitalId}/appointments/${appointment?.id}/referral`, { source, sourceDetail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/clinic/${hospitalId}/appointments/${appointment?.id}/referral`],
      });
      toast({ title: t('appointments.referralUpdated', 'Referral source updated') });
      setEditReferral(false);
    },
    onError: () => {
      toast({ title: t('appointments.referralUpdateError', 'Failed to update referral source'), variant: "destructive" });
    },
  });

  const importReferralMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return apiRequest(
        "POST",
        `/api/clinic/${hospitalId}/appointments/${appointment?.id}/referral/import-from-lead`,
        { leadId }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/clinic/${hospitalId}/appointments/${appointment?.id}/referral`],
      });
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey[0];
          return typeof key === "string" && key.includes(`/api/clinic/${hospitalId}/appointments`);
        },
      });
      toast({ title: t("appointments.referralImported", "Referral imported from lead") });
      setPastePreview(null);
    },
    onError: (err: any) => {
      const msg = err?.message ?? t("appointments.referralImportError", "Failed to import referral");
      toast({ title: msg, variant: "destructive" });
      setPastePreview(null);
    },
  });

  const handlePasteFromLead = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      if (!raw) {
        toast({ title: t("appointments.noClipboardReferral", "No valid lead referral on the clipboard"), variant: "destructive" });
        return;
      }
      let payload: any;
      try {
        payload = JSON.parse(raw);
      } catch {
        toast({ title: t("appointments.noClipboardReferral", "No valid lead referral on the clipboard"), variant: "destructive" });
        return;
      }
      if (payload?.__viali_payload_type !== "lead_referral_v1" || !payload?.leadId) {
        toast({ title: t("appointments.noClipboardReferral", "No valid lead referral on the clipboard"), variant: "destructive" });
        return;
      }
      if (payload.hospitalId !== hospitalId) {
        toast({ title: t("appointments.referralCrossHospital", "That lead belongs to another hospital"), variant: "destructive" });
        return;
      }
      setPastePreview({
        leadId: payload.leadId,
        firstName: payload.firstName ?? "",
        lastName: payload.lastName ?? "",
        summary: payload.summary ?? "",
        source: payload.source ?? "",
      });
    } catch {
      toast({ title: t("appointments.noClipboardReferral", "No valid lead referral on the clipboard"), variant: "destructive" });
    }
  };

  const { data: services = [] } = useQuery<ClinicService[]>({
    queryKey: [`/api/clinic/${hospitalId}/services?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId && editMode,
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

  const saveAppointmentMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      return apiRequest("PATCH", `/api/clinic/${hospitalId}/appointments/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.includes(`/api/clinic/${hospitalId}/appointments`);
        }
      });
      toast({ title: t('appointments.updated', 'Appointment updated') });
      setEditMode(false);
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: t('appointments.updateError', 'Failed to update appointment'), variant: "destructive" });
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
    setEditNotes(appointment.notes || '');
    setEditServiceId(appointment.serviceId || '');
    setEditMode(true);
  };

  const handleSaveReschedule = () => {
    if (!appointment) return;
    const changes: Record<string, any> = {};
    if (editDate !== appointment.appointmentDate) changes.appointmentDate = editDate;
    if (editStartTime !== appointment.startTime) changes.startTime = editStartTime;
    if (editEndTime !== appointment.endTime) changes.endTime = editEndTime;
    if (editProviderId !== (appointment.providerId || '')) changes.providerId = editProviderId;
    if (editServiceId !== (appointment.serviceId || '')) changes.serviceId = editServiceId || null;
    if (editIsVideo !== (appointment.isVideoAppointment || false)) changes.isVideoAppointment = editIsVideo;
    if (editVideoLink !== (appointment.videoMeetingLink || '')) changes.videoMeetingLink = editVideoLink || null;
    if (editNotes !== (appointment.notes || '')) changes.notes = editNotes || null;
    if (Object.keys(changes).length === 0) {
      setEditMode(false);
      return;
    }
    saveAppointmentMutation.mutate({ id: appointment.id, data: changes });
  };

  const handleOpenChange = (isOpen: boolean) => {
    onOpenChange(isOpen);
    if (!isOpen) {
      setEditMode(false);
      setEditReferral(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            {t('appointments.details', 'Appointment Details')}
          </DialogTitle>
        </DialogHeader>

        {appointment && (
          <>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
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
                  {appointment.patient && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-shrink-0 h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCommunicationOpen(true);
                      }}
                      title={t('messages.dialogTitle', 'Patient Communication')}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Appointment Details Card */}
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-muted-foreground">{t('appointments.details', 'Appointment Details')}</p>
                {!editMode && (appointment.status === 'scheduled' || appointment.status === 'confirmed' || appointment.status === 'arrived') && (
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
                  {editMode && appointment.appointmentType !== 'internal' ? (
                    <Select value={editServiceId} onValueChange={setEditServiceId}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <p className="font-medium">
                      {appointment.appointmentType === 'internal'
                        ? (appointment.internalSubject || '-')
                        : (appointment.service?.name || '-')}
                    </p>
                  )}
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

              {appointment.promoCode && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">
                    {t('appointments.promoCode', 'Promo code')}
                  </p>
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-mono font-semibold text-amber-700 dark:text-amber-300">
                        {appointment.promoCode}
                      </p>
                      {promoCodeDetails && (
                        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
                          {promoCodeDetails.discountType === 'percent'
                            ? `${promoCodeDetails.discountValue}% ${t('appointments.discount', 'Rabatt')}`
                            : `CHF ${promoCodeDetails.discountValue} ${t('appointments.discount', 'Rabatt')}`}
                        </p>
                      )}
                    </div>
                    {promoCodeDetails?.description && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {promoCodeDetails.description}
                      </p>
                    )}
                    {promoCodeDetails && (
                      <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                        {promoCodeDetails.validUntil && (
                          <span>
                            {t('appointments.promoValidUntil', 'Gültig bis')}:{' '}
                            {formatDateLong(new Date(promoCodeDetails.validUntil))}
                          </span>
                        )}
                        {promoCodeDetails.maxUses !== null && (
                          <span>
                            {t('appointments.promoUsage', 'Einlösungen')}:{' '}
                            {promoCodeDetails.usedCount} / {promoCodeDetails.maxUses}
                          </span>
                        )}
                      </div>
                    )}
                    {!promoCodeDetails && hospitalPromoCodes.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1 italic">
                        {t(
                          'appointments.promoNotFound',
                          'Promo-Konditionen nicht mehr verfügbar (gelöscht).',
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {editMode ? (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('appointments.notes', 'Notes')}</p>
                  <Textarea
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder={t('appointments.notesPlaceholder', 'Optional notes...')}
                    rows={2}
                  />
                </div>
              ) : appointment.notes ? (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">{t('appointments.notes', 'Notes')}</p>
                  <p className="text-sm bg-muted/50 p-2 rounded">{appointment.notes}</p>
                </div>
              ) : null}

              {(appointment.creator || appointment.createdAt) && (
                <div className="text-xs text-muted-foreground pt-2 mt-1 border-t">
                  {t('appointments.createdBy', 'Created by')}{' '}
                  {appointment.creator
                    ? `${appointment.creator.firstName ?? ''} ${appointment.creator.lastName ?? ''}`.trim() || appointment.creator.email || t('common.unknown', 'unknown')
                    : t('common.unknown', 'unknown')}
                  {appointment.createdAt && ` · ${formatDateLong(new Date(appointment.createdAt as any))}`}
                </div>
              )}
            </div>

            {/* Referral Source Card */}
            {appointment.appointmentType !== 'internal' && (
              <div className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Megaphone className="h-3.5 w-3.5" />
                    {t('appointments.referralSource', 'Referral Source')}
                  </p>
                  {!editReferral && (
                    <div className="flex items-center gap-1">
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={handlePasteFromLead}
                          disabled={importReferralMutation.isPending}
                          data-testid="button-paste-from-lead"
                        >
                          <ClipboardPaste className="h-3.5 w-3.5 mr-1" />
                          {t("appointments.pasteFromLead", "Paste from lead")}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setEditReferral(true)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>

                {editReferral ? (
                  <div className="space-y-2">
                    <Select value={referralSource} onValueChange={(v) => { setReferralSource(v); setReferralSourceDetail(""); }}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder={t('appointments.selectReferralSource', 'Select...')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="social">{t('referral.social', 'Social Media')}</SelectItem>
                        <SelectItem value="search_engine">{t('referral.searchEngine', 'Search Engine')}</SelectItem>
                        <SelectItem value="llm">{t('referral.llm', 'AI / ChatGPT')}</SelectItem>
                        <SelectItem value="word_of_mouth">{t('referral.wordOfMouth', 'Word of Mouth')}</SelectItem>
                        <SelectItem value="belegarzt">{t('referral.belegarzt', 'Belegarzt')}</SelectItem>
                        <SelectItem value="marketing">{t('referral.marketing', 'Marketing')}</SelectItem>
                        <SelectItem value="other">{t('referral.other', 'Other')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {referralSource === "social" && (
                      <Select value={referralSourceDetail} onValueChange={setReferralSourceDetail}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={t('referral.selectPlatform', 'Select...')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="facebook">{t('referral.facebook', 'Facebook')}</SelectItem>
                          <SelectItem value="instagram">{t('referral.instagram', 'Instagram')}</SelectItem>
                          <SelectItem value="tiktok">{t('referral.tiktok', 'TikTok')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {referralSource === "search_engine" && (
                      <Select value={referralSourceDetail} onValueChange={setReferralSourceDetail}>
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder={t('referral.selectEngine', 'Select...')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google">{t('referral.google', 'Google')}</SelectItem>
                          <SelectItem value="bing">{t('referral.bing', 'Bing')}</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {(referralSource === "word_of_mouth" || referralSource === "marketing" || referralSource === "other") && (
                      <Input
                        value={referralSourceDetail}
                        onChange={(e) => setReferralSourceDetail(e.target.value)}
                        placeholder={referralSource === "word_of_mouth"
                          ? t('referral.wordOfMouthPlaceholder', 'Who referred them?')
                          : t('referral.otherPlaceholder', 'Please specify...')}
                        className="h-8"
                      />
                    )}
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => {
                          setEditReferral(false);
                          setReferralSource(referralEvent?.source || '');
                          setReferralSourceDetail(referralEvent?.sourceDetail || '');
                        }}
                        disabled={saveReferralMutation.isPending}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                      <Button
                        size="sm"
                        className="h-7"
                        onClick={() => saveReferralMutation.mutate({ source: referralSource, sourceDetail: referralSourceDetail })}
                        disabled={!referralSource || saveReferralMutation.isPending}
                      >
                        {saveReferralMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {t('common.save', 'Save')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm font-medium">
                    {referralEvent ? (
                      <>
                        {referralEvent.source === 'social' && t('referral.social', 'Social Media')}
                        {referralEvent.source === 'search_engine' && t('referral.searchEngine', 'Search Engine')}
                        {referralEvent.source === 'llm' && t('referral.llm', 'AI / ChatGPT')}
                        {referralEvent.source === 'word_of_mouth' && t('referral.wordOfMouth', 'Word of Mouth')}
                        {referralEvent.source === 'belegarzt' && t('referral.belegarzt', 'Belegarzt')}
                        {referralEvent.source === 'marketing' && t('referral.marketing', 'Marketing')}
                        {referralEvent.source === 'other' && t('referral.other', 'Other')}
                        {referralEvent.sourceDetail && (
                          <span className="text-muted-foreground font-normal"> — {referralEvent.sourceDetail}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground font-normal">{t('appointments.noReferralSource', 'Not set')}</span>
                    )}
                  </p>
                )}
              </div>
            )}

            </div>
            <DialogFooter className="flex-col gap-2">
              {editMode ? (
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditMode(false)}
                    disabled={saveAppointmentMutation.isPending}
                  >
                    {t('common.cancel', 'Cancel')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveReschedule}
                    disabled={saveAppointmentMutation.isPending}
                  >
                    {saveAppointmentMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    {t('common.save', 'Save')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={updateAppointmentMutation.isPending || deleteAppointmentMutation.isPending}
                        data-testid="button-update-status"
                      >
                        {updateAppointmentMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <ChevronDown className="h-4 w-4 mr-1" />
                        )}
                        {t('appointments.updateStatus', 'Update status')}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {/* Forward-progress actions based on current status */}
                      {appointment.status === 'scheduled' && (
                        <DropdownMenuItem
                          className="text-green-700 focus:text-green-700 dark:text-green-400 dark:focus:text-green-400"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                          data-testid="button-confirm-appointment"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          {t('appointments.confirm', 'Confirm')}
                        </DropdownMenuItem>
                      )}
                      {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                        <DropdownMenuItem
                          className="text-teal-700 focus:text-teal-700 dark:text-teal-400 dark:focus:text-teal-400"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'arrived' })}
                          data-testid="button-arrived-appointment"
                        >
                          <LogIn className="h-4 w-4 mr-2" />
                          {t('appointments.arrived', 'Arrived')}
                        </DropdownMenuItem>
                      )}
                      {appointment.status === 'arrived' && (
                        <DropdownMenuItem
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'in_progress' })}
                          data-testid="button-start-appointment"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          {t('appointments.start', 'Start')}
                        </DropdownMenuItem>
                      )}
                      {appointment.status === 'in_progress' && (
                        <DropdownMenuItem
                          className="text-green-700 focus:text-green-700 dark:text-green-400 dark:focus:text-green-400"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'completed' })}
                          data-testid="button-complete-appointment"
                        >
                          <Check className="h-4 w-4 mr-2" />
                          {t('appointments.complete', 'Complete')}
                        </DropdownMenuItem>
                      )}
                      {/* Undo actions for terminal states */}
                      {appointment.status === 'no_show' && (
                        <DropdownMenuItem
                          className="text-green-700 focus:text-green-700 dark:text-green-400 dark:focus:text-green-400"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'scheduled' })}
                          data-testid="button-undo-no-show"
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          {t('appointments.undoNoShow', 'Undo No-Show')}
                        </DropdownMenuItem>
                      )}
                      {appointment.status === 'cancelled' && (
                        <DropdownMenuItem
                          className="text-green-700 focus:text-green-700 dark:text-green-400 dark:focus:text-green-400"
                          onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'confirmed' })}
                          data-testid="button-reactivate-appointment"
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          {t('appointments.reactivate', 'Reactivate')}
                        </DropdownMenuItem>
                      )}
                      {/* Negative actions for active appointments */}
                      {(appointment.status === 'scheduled' || appointment.status === 'confirmed' || appointment.status === 'arrived') && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-purple-700 focus:text-purple-700 dark:text-purple-400 dark:focus:text-purple-400"
                            onClick={() => {
                              if (window.confirm(t('appointments.noShowConfirm', 'Mark this appointment as No-Show? The patient did not attend.'))) {
                                updateAppointmentMutation.mutate({ id: appointment.id, status: 'no_show' });
                              }
                            }}
                            data-testid="button-no-show-appointment"
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            {t('appointments.noShow', 'No-Show')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => updateAppointmentMutation.mutate({ id: appointment.id, status: 'cancelled' })}
                            data-testid="button-cancel-appointment"
                          >
                            <X className="h-4 w-4 mr-2" />
                            {t('appointments.cancelAppointment', 'Cancel appointment')}
                          </DropdownMenuItem>
                        </>
                      )}
                      {/* Delete — always available */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (window.confirm(t('appointments.deleteConfirm', 'Are you sure you want to permanently delete this appointment? This action cannot be undone.'))) {
                            deleteAppointmentMutation.mutate(appointment.id);
                          }
                        }}
                        data-testid="button-delete-appointment"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {t('appointments.delete', 'Delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenChange(false)}
                  >
                    {t('common.close', 'Close')}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {appointment?.patient && (
        <SendQuestionnaireDialog
          open={communicationOpen}
          onOpenChange={setCommunicationOpen}
          patientId={appointment.patient.id}
          patientName={`${appointment.patient.firstName} ${appointment.patient.surname}`}
          patientEmail={appointment.patient.email}
          patientPhone={appointment.patient.phone}
        />
      )}

      <AlertDialog open={!!pastePreview} onOpenChange={(o) => { if (!o) setPastePreview(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("appointments.confirmImportReferralTitle", "Import referral from lead?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("appointments.confirmImportReferralBody", "Import referral from {{name}} — {{summary}}. This will overwrite the current referral source for this appointment.", {
                name: `${pastePreview?.firstName ?? ""} ${pastePreview?.lastName ?? ""}`.trim(),
                summary: pastePreview?.summary || pastePreview?.source || "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importReferralMutation.isPending}>
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pastePreview) importReferralMutation.mutate(pastePreview.leadId);
              }}
              disabled={importReferralMutation.isPending}
            >
              {importReferralMutation.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {t("appointments.import", "Import")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
