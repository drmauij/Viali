import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPositionDisplayLabel, getArmDisplayLabel } from "@/components/surgery/PatientPositionFields";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Calendar,
  Phone,
  Mail,
  Clock,
  FileText,
  Check,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  User,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatDateLong, formatDate, formatDateTime } from "@/lib/dateUtils";
import { setDraggedRequest } from "@/components/surgery/useExternalRequestDrag";
import type { ExternalSurgeryRequest } from "@shared/schema";

export interface SurgeryRoom {
  id: string;
  name: string;
  type?: 'OP' | 'PACU';
}

export interface SurgeonActionRequestView {
  id: string;
  hospitalId: string;
  surgeryId: string;
  surgeonEmail: string;
  type: 'cancellation' | 'reschedule' | 'suspension';
  reason: string;
  proposedDate: string | null;
  proposedTimeFrom: number | null;
  proposedTimeTo: number | null;
  status: 'pending' | 'accepted' | 'refused';
  responseNote: string | null;
  respondedBy: string | null;
  respondedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Joined surgery details
  plannedDate: string;
  plannedSurgery: string;
  surgeonName: string;
  patientFirstName: string;
  patientLastName: string;
  roomName: string;
}

type PanelTab = 'surgery-requests' | 'surgeon-requests';

export interface ScheduleDialogProps {
  request: ExternalSurgeryRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: () => void;
  surgeryRooms: SurgeryRoom[];
  initialDate?: string;
  initialTime?: string;
  initialRoomId?: string;
}

export function ScheduleDialog({ request, open, onOpenChange, onScheduled, surgeryRooms: allRooms, initialDate, initialTime, initialRoomId }: ScheduleDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const isGerman = i18n.language === 'de';
  // Only show OR rooms, not PACU rooms
  const surgeryRooms = allRooms.filter(r => !r.type || r.type === 'OP');

  const [plannedDate, setPlannedDate] = useState(initialDate ?? request.wishedDate);
  const [plannedTime, setPlannedTime] = useState(initialTime ?? "08:00");
  const [surgeryRoomId, setSurgeryRoomId] = useState<string>(initialRoomId ?? "");
  const [sendConfirmation, setSendConfirmation] = useState(true);
  // "email" = use the existing user who owns the email, "request" = create new from request name,
  // or a specific user ID selected from the doctor dropdown
  const [surgeonChoice, setSurgeonChoice] = useState<"email" | "request" | string>("email");

  // Patient match selection: "new" = create new patient, or an existing patient ID
  const [selectedPatientId, setSelectedPatientId] = useState<string | "new">("new");

  useEffect(() => {
    setPlannedDate(initialDate ?? request.wishedDate);
    setPlannedTime(initialTime ?? "08:00");
    setSurgeryRoomId(initialRoomId ?? "");
  }, [request.id, request.wishedDate, initialDate, initialTime, initialRoomId]);

  // Check for surgeon name/email mismatch
  const { data: surgeonMatch } = useQuery<{
    matched: boolean;
    emailUser: { id: string; firstName: string; lastName: string; email: string } | null;
    nameMatch: { id: string; firstName: string; lastName: string } | null;
    requestSurgeonName?: string;
    willCreate: boolean;
  }>({
    queryKey: [`/api/external-surgery-requests/${request.id}/surgeon-match`],
    enabled: open,
  });

  // Find fuzzy patient matches to prevent duplicates
  const { data: patientMatches } = useQuery<Array<{
    id: string;
    firstName: string;
    surname: string;
    birthday: string | null;
    patientNumber: string | null;
    email: string | null;
    phone: string | null;
    confidence: number;
    reasons: string[];
  }>>({
    queryKey: [`/api/external-surgery-requests/${request.id}/patient-matches`],
    enabled: open && !request.isReservationOnly && !request.patientId,
  });

  // Fetch hospital doctors for the "choose different surgeon" dropdown
  const { data: hospitalUsers = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/${activeHospital?.id}/users`],
    enabled: !!activeHospital?.id && open && surgeonMatch?.matched === false,
  });

  const hospitalDoctors = hospitalUsers.filter((u: any) => u.role === 'doctor');

  const hasMismatch = surgeonMatch && !surgeonMatch.matched && surgeonMatch.emailUser;

  // Default to name match if found, otherwise "create new"
  useEffect(() => {
    if (surgeonMatch && !surgeonMatch.matched) {
      if (surgeonMatch.nameMatch) {
        setSurgeonChoice(surgeonMatch.nameMatch.id);
      } else {
        setSurgeonChoice("request");
      }
    } else {
      setSurgeonChoice("email");
    }
  }, [request.id, surgeonMatch?.matched, surgeonMatch?.nameMatch?.id]);

  // Pre-select the existing patient if there's exactly one high-confidence match
  useEffect(() => {
    if (patientMatches && patientMatches.length === 1 && patientMatches[0].confidence >= 0.9) {
      setSelectedPatientId(patientMatches[0].id);
    } else {
      setSelectedPatientId("new");
    }
  }, [patientMatches]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const dateTime = new Date(`${plannedDate}T${plannedTime}`);
      // Determine surgeonId override based on mismatch choice
      let surgeonId: string | undefined;
      let createNew = false;
      if (hasMismatch) {
        if (surgeonChoice === "email") {
          surgeonId = surgeonMatch.emailUser!.id;
        } else if (surgeonChoice === "request") {
          createNew = true;
        } else if (surgeonChoice) {
          // A specific doctor was selected (name match or from dropdown)
          surgeonId = surgeonChoice;
        }
      }
      return apiRequest('POST', `/api/external-surgery-requests/${request.id}/schedule`, {
        plannedDate: dateTime.toISOString(),
        surgeryRoomId: surgeryRoomId || null,
        surgeryDurationMinutes: request.surgeryDurationMinutes || null,
        sendConfirmation,
        ...(surgeonId ? { surgeonId } : {}),
        ...(createNew ? { createNewSurgeon: true } : {}),
        ...(selectedPatientId !== "new" ? { existingPatientId: selectedPatientId } : {}),
      });
    },
    onSuccess: () => {
      // Invalidate all relevant caches so the request disappears from lists
      // and the new surgery appears on the calendar immediately
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('external-surgery-requests')
      });
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        (query.queryKey[0].includes('/api/surgeries') || query.queryKey[0].includes('/api/anesthesia/surgeries'))
      });
      toast({
        title: t('surgery.externalRequests.surgeryScheduled'),
        description: t('surgery.externalRequests.surgeryScheduledDesc'),
      });
      onScheduled();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden gap-0">
        <DialogHeader className="shrink-0 bg-background border-b px-6 py-4">
          <DialogTitle>
            {t('surgery.externalRequests.scheduleSurgery')}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 min-h-0">
          {/* Patient Info or Slot Reservation banner */}
          {request.isReservationOnly ? (
            <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 p-3 rounded-lg space-y-1">
              <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                {t('opCalendar.slotReserved', 'SLOT RESERVED')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('surgery.externalRequests.noPatientAssigned', 'No patient details — slot reservation only')}
              </p>
            </div>
          ) : (
            <div className="bg-muted p-3 rounded-lg space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                {t('surgery.externalRequests.patient')}
              </p>
              <p className="font-medium">
                {request.patientLastName}, {request.patientFirstName}
              </p>
              {request.patientPhone && (
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {request.patientPhone}
                </p>
              )}
            </div>
          )}

          {/* Fuzzy patient matches */}
          {patientMatches && patientMatches.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {t('surgery.externalRequests.possibleExistingPatients')}
                </p>
              </div>
              <div className="space-y-1.5 pl-6">
                {patientMatches.map((match) => {
                  const badgeVariant = match.confidence >= 0.9 ? "destructive" as const : match.confidence >= 0.7 ? "default" as const : "secondary" as const;
                  const badgeText = match.confidence >= 0.9
                    ? t('surgery.externalRequests.matchHigh')
                    : match.confidence >= 0.7
                      ? t('surgery.externalRequests.matchMedium')
                      : t('surgery.externalRequests.matchLow');
                  return (
                    <label key={match.id} className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="patient-match"
                        checked={selectedPatientId === match.id}
                        onChange={() => setSelectedPatientId(match.id)}
                        className="accent-amber-600 mt-1"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {match.surname}, {match.firstName}
                          </span>
                          {match.birthday && (
                            <span className="text-xs text-muted-foreground">
                              {formatDate(match.birthday)}
                            </span>
                          )}
                          {match.patientNumber && (
                            <span className="text-xs text-muted-foreground">
                              #{match.patientNumber}
                            </span>
                          )}
                          <Badge variant={badgeVariant} className="text-[10px] px-1.5 py-0">
                            {badgeText}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {match.reasons.join(", ")}
                        </p>
                      </div>
                    </label>
                  );
                })}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="patient-match"
                    checked={selectedPatientId === "new"}
                    onChange={() => setSelectedPatientId("new")}
                    className="accent-amber-600"
                  />
                  <span className="text-sm">
                    {t('surgery.externalRequests.createNewPatient')}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Surgery Info */}
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t('surgery.externalRequests.surgery')}
            </p>
            <p className="font-medium">{request.surgeryName || t('surgery.externalRequests.notSpecified', 'Not specified')}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {request.surgeryDurationMinutes} min
            </p>
            {request.diagnosis && (
              <p className="text-sm text-muted-foreground">
                {t('surgery.externalRequests.diagnosis')}: {request.diagnosis}
              </p>
            )}
            {request.coverageType && (
              <p className="text-sm text-muted-foreground">
                {t('surgery.externalRequests.coverageType')}: {request.coverageType}
              </p>
            )}
            {request.stayType && (
              <p className="text-sm">
                {t('anesthesia.stayType', 'Stay Type')}: {request.stayType === 'overnight' ? t('anesthesia.stayTypeOvernight', 'Overnight Stay') : t('anesthesia.stayTypeAmbulant', 'Outpatient')}
              </p>
            )}
            {request.surgeryNotes && (
              <p className="text-sm text-muted-foreground">{request.surgeryNotes}</p>
            )}
            {request.patientPosition && (
              <p className="text-sm text-muted-foreground">
                {t('surgery.externalRequests.position')}: {getPositionDisplayLabel(request.patientPosition, isGerman)}
              </p>
            )}
            {(request.leftArmPosition || request.rightArmPosition) && (
              <p className="text-sm text-muted-foreground">
                {request.leftArmPosition && `${t('surgery.externalRequests.leftArm')}: ${getArmDisplayLabel(request.leftArmPosition, isGerman)}`}
                {request.leftArmPosition && request.rightArmPosition && ' | '}
                {request.rightArmPosition && `${t('surgery.externalRequests.rightArm')}: ${getArmDisplayLabel(request.rightArmPosition, isGerman)}`}
              </p>
            )}
          </div>

          {/* Surgeon Info */}
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t('surgery.externalRequests.requestingSurgeon')}
            </p>
            <p className="font-medium">
              Dr. {request.surgeonLastName}, {request.surgeonFirstName}
            </p>
            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {request.surgeonPhone}
              </span>
              <span className="flex items-center gap-1">
                <Mail className="h-3 w-3" /> {request.surgeonEmail}
              </span>
            </div>
          </div>

          {/* Surgeon name/email mismatch warning */}
          {hasMismatch && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 rounded-lg space-y-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  {isGerman
                    ? `Die E-Mail ${request.surgeonEmail} gehört zu ${surgeonMatch.emailUser!.firstName} ${surgeonMatch.emailUser!.lastName}, aber die Anfrage kommt von ${surgeonMatch.requestSurgeonName}.`
                    : `The email ${request.surgeonEmail} belongs to ${surgeonMatch.emailUser!.firstName} ${surgeonMatch.emailUser!.lastName}, but the request is from ${surgeonMatch.requestSurgeonName}.`
                  }
                </p>
              </div>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-300 pl-6">
                {isGerman ? 'Chirurg zuweisen:' : 'Assign surgeon:'}
              </p>
              <div className="space-y-2 pl-6">
                {/* Option 1: Name match (recommended if found) */}
                {surgeonMatch.nameMatch && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="surgeon-choice"
                      checked={surgeonChoice === surgeonMatch.nameMatch.id}
                      onChange={() => setSurgeonChoice(surgeonMatch.nameMatch!.id)}
                      className="accent-amber-600"
                    />
                    <span className="text-sm">
                      {surgeonMatch.nameMatch.firstName} {surgeonMatch.nameMatch.lastName}
                      <span className="text-emerald-600 dark:text-emerald-400 ml-1 text-xs font-medium">
                        ({isGerman ? 'Namensübereinstimmung' : 'name match'})
                      </span>
                    </span>
                  </label>
                )}
                {/* Option 2: Email owner */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="surgeon-choice"
                    checked={surgeonChoice === "email"}
                    onChange={() => setSurgeonChoice("email")}
                    className="accent-amber-600"
                  />
                  <span className="text-sm">
                    {surgeonMatch.emailUser!.firstName} {surgeonMatch.emailUser!.lastName}
                    <span className="text-muted-foreground ml-1 text-xs">({isGerman ? 'E-Mail-Inhaber' : 'email owner'})</span>
                  </span>
                </label>
                {/* Option 3: Create new surgeon */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="surgeon-choice"
                    checked={surgeonChoice === "request"}
                    onChange={() => setSurgeonChoice("request")}
                    className="accent-amber-600"
                  />
                  <span className="text-sm">
                    {surgeonMatch.requestSurgeonName}
                    <span className="text-muted-foreground ml-1 text-xs">({isGerman ? 'neuen Chirurgen erstellen' : 'create new surgeon'})</span>
                  </span>
                </label>
                {/* Option 4: Pick from hospital doctors */}
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="surgeon-choice"
                    checked={surgeonChoice !== "email" && surgeonChoice !== "request" && (!surgeonMatch.nameMatch || surgeonChoice !== surgeonMatch.nameMatch.id)}
                    onChange={() => setSurgeonChoice("")}
                    className="accent-amber-600"
                  />
                  <span className="text-sm">{isGerman ? 'Anderen Chirurgen wählen' : 'Choose a different surgeon'}</span>
                </label>
                {surgeonChoice !== "email" && surgeonChoice !== "request" && (!surgeonMatch.nameMatch || surgeonChoice !== surgeonMatch.nameMatch.id) && (
                  <Select value={surgeonChoice} onValueChange={setSurgeonChoice}>
                    <SelectTrigger className="ml-6">
                      <SelectValue placeholder={isGerman ? 'Chirurg auswählen...' : 'Select surgeon...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {hospitalDoctors.map((doc: any) => (
                        <SelectItem key={doc.userId || doc.id} value={doc.userId || doc.id}>
                          {doc.firstName} {doc.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('surgery.externalRequests.date')}</Label>
              <DateInput
                value={plannedDate}
                onChange={(v) => setPlannedDate(v)}
                data-testid="input-schedule-date"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('surgery.externalRequests.time')}</Label>
              <TimeInput
                value={plannedTime}
                onChange={(v) => setPlannedTime(v)}
                data-testid="input-schedule-time"
              />
            </div>
          </div>

          {surgeryRooms.length > 0 && (
            <div className="space-y-2">
              <Label>{t('surgery.externalRequests.surgeryRoom')} *</Label>
              <Select value={surgeryRoomId} onValueChange={setSurgeryRoomId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('surgery.externalRequests.selectRoom')} />
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
          )}

          <div className="flex items-center gap-2">
            <Checkbox
              id="sendConfirmation"
              checked={sendConfirmation}
              onCheckedChange={(checked) => setSendConfirmation(!!checked)}
            />
            <Label htmlFor="sendConfirmation" className="cursor-pointer text-sm">
              {t('surgery.externalRequests.sendConfirmation')}
            </Label>
          </div>
        </div>

        <DialogFooter className="shrink-0 bg-background border-t px-6 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-schedule-cancel">
            {t('common.cancel')}
          </Button>
          <Button data-testid="button-schedule-confirm"
            onClick={() => scheduleMutation.mutate()}
            disabled={!plannedDate || (surgeryRooms.length > 0 && !surgeryRoomId) || scheduleMutation.isPending || !!(hasMismatch && surgeonChoice !== "email" && surgeonChoice !== "request" && !surgeonChoice)}
          >
            {scheduleMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('surgery.externalRequests.schedule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExternalReservationsPanelProps {
  trigger?: React.ReactNode;
  defaultOpen?: boolean;
  mode?: "sheet" | "inline";
  surgeryRooms?: SurgeryRoom[];
  onScheduleRequest?: (request: ExternalSurgeryRequest) => void;
  selectedRequestId?: string | null;
  onRequestTap?: (request: ExternalSurgeryRequest | null) => void;
}

export function ExternalReservationsPanel({
  trigger,
  defaultOpen = false,
  mode = "sheet",
  surgeryRooms: surgeryRoomsProp,
  onScheduleRequest,
  selectedRequestId,
  onRequestTap,
}: ExternalReservationsPanelProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const isGerman = i18n.language === 'de';
  const [open, setOpen] = useState(defaultOpen);
  const [selectedRequest, setSelectedRequest] = useState<ExternalSurgeryRequest | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('surgery-requests');
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);
  const [refusingRequestId, setRefusingRequestId] = useState<string | null>(null);
  const [refuseNote, setRefuseNote] = useState('');
  const [acceptingRequestId, setAcceptingRequestId] = useState<string | null>(null);

  const hospitalId = activeHospital?.id;

  // --- External surgery requests (existing) ---
  const { data: requests = [], isLoading, refetch } = useQuery<ExternalSurgeryRequest[]>({
    queryKey: [`/api/hospitals/${hospitalId}/external-surgery-requests?status=pending`],
    enabled: !!hospitalId && (mode === 'inline' || open),
  });

  // --- Surgeon action requests (new) ---
  const { data: actionRequests = [], isLoading: isLoadingActions } = useQuery<SurgeonActionRequestView[]>({
    queryKey: [`/api/hospitals/${hospitalId}/surgeon-action-requests?status=pending`],
    enabled: !!hospitalId && (mode === 'inline' || open),
  });

  const { data: actionRequestCount } = useQuery<{ count: number }>({
    queryKey: [`/api/hospitals/${hospitalId}/surgeon-action-requests/count`],
    enabled: !!hospitalId,
    refetchInterval: 60000,
  });

  // Auto-select tab: default to surgery requests if any, otherwise surgeon requests
  const [tabInitialized, setTabInitialized] = useState(false);
  useEffect(() => {
    if (tabInitialized) return;
    if (isLoading || isLoadingActions) return;
    if (requests.length > 0) {
      setActiveTab('surgery-requests');
    } else if (actionRequests.length > 0) {
      setActiveTab('surgeon-requests');
    }
    setTabInitialized(true);
  }, [isLoading, isLoadingActions, requests.length, actionRequests.length, tabInitialized]);

  const { data: internalSurgeryRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms?hospitalId=${hospitalId}`],
    enabled: !!hospitalId && !surgeryRoomsProp,
  });

  const surgeryRooms = surgeryRoomsProp ?? internalSurgeryRooms;

  const declineMutation = useMutation({
    mutationFn: async (requestId: string) => {
      return apiRequest('PATCH', `/api/external-surgery-requests/${requestId}`, { status: 'declined' });
    },
    onSuccess: () => {
      toast({
        title: t('surgery.externalRequests.declined'),
        description: t('surgery.externalRequests.declinedDesc'),
      });
      refetch();
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('external-surgery-requests')
      });
    },
  });

  // --- Surgeon action request mutations ---
  const acceptActionMutation = useMutation({
    mutationFn: async (reqId: string) => {
      setAcceptingRequestId(reqId);
      return apiRequest('POST', `/api/hospitals/${hospitalId}/surgeon-action-requests/${reqId}/accept`);
    },
    onSuccess: () => {
      setAcceptingRequestId(null);
      toast({
        title: isGerman ? 'Anfrage akzeptiert' : 'Request accepted',
        description: isGerman ? 'Die Anfrage wurde erfolgreich bearbeitet.' : 'The request has been processed successfully.',
      });
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('surgeon-action-requests')
      });
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        (query.queryKey[0].includes('/api/surgeries') || query.queryKey[0].includes('/api/anesthesia/surgeries'))
      });
    },
    onError: (error: any) => {
      setAcceptingRequestId(null);
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const refuseActionMutation = useMutation({
    mutationFn: async ({ reqId, responseNote }: { reqId: string; responseNote?: string }) => {
      return apiRequest('POST', `/api/hospitals/${hospitalId}/surgeon-action-requests/${reqId}/refuse`, {
        responseNote: responseNote || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: isGerman ? 'Anfrage abgelehnt' : 'Request refused',
        description: isGerman ? 'Die Anfrage wurde abgelehnt.' : 'The request has been refused.',
      });
      setRefuseDialogOpen(false);
      setRefusingRequestId(null);
      setRefuseNote('');
      queryClient.invalidateQueries({ predicate: (query) =>
        typeof query.queryKey[0] === 'string' &&
        query.queryKey[0].includes('surgeon-action-requests')
      });
    },
    onError: (error: any) => {
      toast({
        title: t('common.error'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRefuse = (reqId: string) => {
    setRefusingRequestId(reqId);
    setRefuseNote('');
    setRefuseDialogOpen(true);
  };

  const handleConfirmRefuse = () => {
    if (!refusingRequestId) return;
    refuseActionMutation.mutate({ reqId: refusingRequestId, responseNote: refuseNote || undefined });
  };

  const handleSchedule = (request: ExternalSurgeryRequest) => {
    if (mode === 'inline' && onScheduleRequest) {
      onScheduleRequest(request);
    } else {
      setSelectedRequest(request);
      setScheduleDialogOpen(true);
    }
  };

  const handleScheduled = () => {
    // Cache invalidation is now handled inside ScheduleDialog itself
    refetch();
  };

  const formatWishedDate = (dateStr: string) => {
    return formatDateLong(dateStr);
  };

  const formatMinutesToTime = (minutes: number) => {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };

  const actionTypeLabels: Record<SurgeonActionRequestView['type'], { de: string; en: string }> = {
    cancellation: { de: 'Stornierung', en: 'Cancellation' },
    reschedule: { de: 'Umplanung', en: 'Reschedule' },
    suspension: { de: 'Aussetzung', en: 'Suspension' },
  };

  const actionTypeBadgeClasses: Record<SurgeonActionRequestView['type'], string> = {
    cancellation: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-200 dark:border-red-800',
    reschedule: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    suspension: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  };

  // --- Tab bar component (reused in both modes) ---
  const tabBar = (
    <div className="flex border-b">
      <button
        className={cn(
          "flex-1 px-3 py-2 text-sm font-medium text-center transition-colors relative",
          activeTab === 'surgery-requests'
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setActiveTab('surgery-requests')}
      >
        {isGerman ? 'OP-Anfragen' : 'Surgery Requests'}
        {requests.length > 0 && (
          <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] px-1 text-[10px]">
            {requests.length}
          </Badge>
        )}
      </button>
      <button
        className={cn(
          "flex-1 px-3 py-2 text-sm font-medium text-center transition-colors relative",
          activeTab === 'surgeon-requests'
            ? "text-primary border-b-2 border-primary"
            : "text-muted-foreground hover:text-foreground"
        )}
        onClick={() => setActiveTab('surgeon-requests')}
      >
        {isGerman ? 'Chirurg-Anfragen' : 'Surgeon Requests'}
        {actionRequests.length > 0 && (
          <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] px-1 text-[10px]">
            {actionRequests.length}
          </Badge>
        )}
      </button>
    </div>
  );

  // --- Surgeon action request cards ---
  const surgeonActionCardList = (
    <div className={mode === 'inline' ? "space-y-3" : "mt-4 space-y-4"}>
      {isLoadingActions ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : actionRequests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{isGerman ? 'Keine ausstehenden Chirurg-Anfragen' : 'No pending surgeon requests'}</p>
        </div>
      ) : (
        actionRequests.map((req) => (
          <Card key={req.id} className="shadow-sm overflow-hidden">
            <CardContent className="pt-4 space-y-3">
              {/* Type badge + patient name */}
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-lg">
                    {req.patientLastName}, {req.patientFirstName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {req.plannedSurgery}
                  </p>
                </div>
                <Badge variant="outline" className={cn("shrink-0", actionTypeBadgeClasses[req.type])}>
                  {isGerman ? actionTypeLabels[req.type].de : actionTypeLabels[req.type].en}
                </Badge>
              </div>

              <Separator />

              {/* Surgery details */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{formatDateLong(req.plannedDate)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>{req.roomName}</span>
                </div>
              </div>

              {/* Surgeon info */}
              <div className="bg-muted/50 rounded-lg p-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">
                  {isGerman ? 'Chirurg' : 'Surgeon'}
                </p>
                <p className="text-sm font-medium">{req.surgeonName}</p>
                <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{req.surgeonEmail}</span>
                </span>
              </div>

              {/* Reason */}
              <div className="text-sm">
                <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                  {isGerman ? 'Begründung' : 'Reason'}
                </p>
                <p className="text-muted-foreground">{req.reason}</p>
              </div>

              {/* Proposed date/time for reschedule */}
              {req.type === 'reschedule' && req.proposedDate && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2 rounded-lg text-sm">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-300 uppercase mb-1">
                    {isGerman ? 'Vorgeschlagener Termin' : 'Proposed date'}
                  </p>
                  <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{formatDateLong(req.proposedDate)}</span>
                    {req.proposedTimeFrom != null && req.proposedTimeTo != null && (
                      <>
                        <Clock className="h-3.5 w-3.5 ml-1" />
                        <span>
                          {formatMinutesToTime(req.proposedTimeFrom)} – {formatMinutesToTime(req.proposedTimeTo)}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Timestamp */}
              <p className="text-xs text-muted-foreground">
                {isGerman ? 'Eingereicht: ' : 'Submitted: '}
                {formatDateTime(req.createdAt)}
              </p>

              {/* Accept / Refuse buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => acceptActionMutation.mutate(req.id)}
                  disabled={acceptingRequestId === req.id && acceptActionMutation.isPending}
                >
                  {acceptingRequestId === req.id && acceptActionMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  <Check className="mr-1 h-4 w-4" />
                  {isGerman ? 'Akzeptieren' : 'Accept'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  onClick={() => handleRefuse(req.id)}
                  disabled={refuseActionMutation.isPending}
                >
                  <X className="mr-1 h-4 w-4" />
                  {isGerman ? 'Ablehnen' : 'Refuse'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );

  // --- Refuse confirmation dialog ---
  const refuseDialog = (
    <Dialog open={refuseDialogOpen} onOpenChange={(o) => { setRefuseDialogOpen(o); if (!o) setRefusingRequestId(null); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isGerman ? 'Anfrage ablehnen' : 'Refuse request'}</DialogTitle>
          <DialogDescription>
            {isGerman
              ? 'Möchten Sie diese Anfrage ablehnen? Sie können optional eine Begründung angeben.'
              : 'Do you want to refuse this request? You can optionally provide a reason.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>{isGerman ? 'Begründung (optional)' : 'Note (optional)'}</Label>
            <Textarea
              value={refuseNote}
              onChange={(e) => setRefuseNote(e.target.value)}
              placeholder={isGerman ? 'Grund für die Ablehnung...' : 'Reason for refusal...'}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRefuseDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmRefuse}
            disabled={refuseActionMutation.isPending}
          >
            {refuseActionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isGerman ? 'Ablehnen' : 'Refuse'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const cardList = (
    <div className={mode === 'inline' ? "space-y-3" : "mt-6 space-y-4"}>
      {mode === 'inline' && selectedRequestId && (
        <div className="p-2 bg-primary/10 border-b text-xs text-primary flex justify-between items-center">
          <span>{t('surgery.externalRequests.tapSlotToSchedule', 'Tap a calendar slot to schedule')}</span>
          <button onClick={() => onRequestTap?.(null)} className="ml-2 p-0.5 rounded hover:bg-primary/20">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : requests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{t('surgery.externalRequests.noPendingRequests')}</p>
        </div>
      ) : (
        requests.map((request: ExternalSurgeryRequest & { documents?: any[] }) => {
          const isSelected = selectedRequestId === request.id;
          return (
            <Card
              key={request.id}
              className={cn(
                "shadow-sm overflow-hidden",
                mode === 'inline' && "cursor-grab active:cursor-grabbing select-none",
                isSelected && "ring-2 ring-primary ring-offset-1"
              )}
              draggable={mode === 'inline'}
              onDragStart={mode === 'inline' ? (e) => {
                setDraggedRequest(request);
                e.dataTransfer.setData('text/plain', request.id);
                e.dataTransfer.effectAllowed = 'move';
              } : undefined}
              onDragEnd={mode === 'inline' ? () => setDraggedRequest(null) : undefined}
              onClick={mode === 'inline' ? () => onRequestTap?.(request) : undefined}
            >
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    {request.isReservationOnly ? (
                      <>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-lg text-violet-700 dark:text-violet-300">
                            {t('opCalendar.slotReserved', 'SLOT RESERVED')}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Dr. {request.surgeonLastName}, {request.surgeonFirstName}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-lg">
                          {request.patientLastName}, {request.patientFirstName}
                        </p>
                        {request.patientBirthday && (
                          <p className="text-xs text-muted-foreground">
                            *{formatDate(request.patientBirthday)}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {request.surgeryName}
                        </p>
                      </>
                    )}
                  </div>
                  {request.isReservationOnly && (
                    <Badge variant="outline" className="border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
                      <Calendar className="h-3 w-3 mr-1" />
                      {request.surgeryDurationMinutes} min
                    </Badge>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{formatWishedDate(request.wishedDate)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{request.surgeryDurationMinutes} min</span>
                  </div>
                  {request.wishedTimeFrom != null && request.wishedTimeTo != null && (
                    <div className="col-span-2 flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {t('surgery.externalRequests.wishedTime', 'Preferred time')}:{' '}
                        <span className="text-foreground font-medium">
                          {String(Math.floor(request.wishedTimeFrom / 60)).padStart(2, '0')}:{String(request.wishedTimeFrom % 60).padStart(2, '0')}
                          {' – '}
                          {String(Math.floor(request.wishedTimeTo / 60)).padStart(2, '0')}:{String(request.wishedTimeTo % 60).padStart(2, '0')}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                <div className="bg-muted/50 rounded-lg p-2 space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase">
                    {t('surgery.externalRequests.surgeon')}
                  </p>
                  <p className="text-sm font-medium">
                    Dr. {request.surgeonLastName}, {request.surgeonFirstName}
                  </p>
                  <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 truncate">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{request.surgeonPhone}</span>
                    </span>
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{request.surgeonEmail}</span>
                    </span>
                  </div>
                </div>

                {request.diagnosis && (
                  <div className="text-sm">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {t('surgery.externalRequests.diagnosis')}
                    </p>
                    <p className="text-muted-foreground">{request.diagnosis}</p>
                  </div>
                )}

                {request.stayType && (
                  <p className="text-sm">
                    {t('anesthesia.stayType', 'Stay Type')}: {request.stayType === 'overnight' ? t('anesthesia.stayTypeOvernight', 'Overnight Stay') : t('anesthesia.stayTypeAmbulant', 'Outpatient')}
                  </p>
                )}

                {request.surgeryNotes && (
                  <div className="text-sm">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {t('surgery.externalRequests.notes')}
                    </p>
                    <p className="text-muted-foreground">{request.surgeryNotes}</p>
                  </div>
                )}

                {request.documents && request.documents.length > 0 && (
                  <div className="text-sm">
                    <p className="text-xs font-medium text-muted-foreground uppercase mb-1">
                      {t('surgery.externalRequests.documents')} ({request.documents.length})
                    </p>
                    <div className="space-y-1">
                      {request.documents.map((doc: { id: string; fileName: string; fileUrl: string }) => (
                        <a
                          key={doc.id}
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 text-sm text-primary hover:underline"
                          data-testid={`document-link-${doc.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <FileText className="h-3 w-3" />
                          {doc.fileName}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => handleSchedule(request)}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    {t('surgery.externalRequests.schedule')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive"
                    onClick={() => declineMutation.mutate(request.id)}
                    disabled={declineMutation.isPending}
                  >
                    <X className="mr-1 h-4 w-4" />
                    {t('surgery.externalRequests.decline')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );

  if (mode === 'inline') {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 py-3 border-b flex items-center gap-2 shrink-0">
          <Calendar className="h-5 w-5" />
          <span className="font-semibold text-sm">
            {t('surgery.externalRequests.externalSurgeryRequests')}
          </span>
          {(requests.length + actionRequests.length) > 0 && (
            <Badge variant="destructive" className="ml-auto">
              {requests.length + actionRequests.length}
            </Badge>
          )}
        </div>
        {tabBar}
        <div className="flex-1 overflow-y-auto px-4 py-2">
          {activeTab === 'surgery-requests' ? cardList : surgeonActionCardList}
        </div>
        {refuseDialog}
      </div>
    );
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          {trigger || (
            <Button variant="outline" className="relative" data-testid="button-external-requests">
              <Calendar className="mr-2 h-4 w-4" />
              {t('surgery.externalRequests.requests')}
            </Button>
          )}
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              {t('surgery.externalRequests.externalSurgeryRequests')}
              {(requests.length + actionRequests.length) > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {requests.length + actionRequests.length}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>
          {tabBar}
          {activeTab === 'surgery-requests' ? cardList : surgeonActionCardList}
        </SheetContent>
      </Sheet>

      {selectedRequest && (
        <ScheduleDialog
          request={selectedRequest}
          open={scheduleDialogOpen}
          onOpenChange={setScheduleDialogOpen}
          onScheduled={handleScheduled}
          surgeryRooms={surgeryRooms}
        />
      )}

      {refuseDialog}
    </>
  );
}

export function ExternalRequestsBadge() {
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;

  const { data: countData } = useQuery<{ count: number }>({
    queryKey: [`/api/hospitals/${hospitalId}/external-surgery-requests/count`],
    enabled: !!hospitalId,
    refetchInterval: 60000,
  });

  const { data: actionCountData } = useQuery<{ count: number }>({
    queryKey: [`/api/hospitals/${hospitalId}/surgeon-action-requests/count`],
    enabled: !!hospitalId,
    refetchInterval: 60000,
  });

  const totalCount = Number(countData?.count || 0) + Number(actionCountData?.count || 0);

  if (!totalCount) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
      {totalCount > 9 ? '9+' : totalCount}
    </span>
  );
}
