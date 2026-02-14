import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getPositionDisplayLabel, getArmDisplayLabel } from "@/components/surgery/PatientPositionFields";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { 
  Calendar, 
  Phone, 
  Mail, 
  User, 
  Clock, 
  Stethoscope,
  FileText,
  Check,
  X,
  Loader2,
  ExternalLink
} from "lucide-react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de, enUS } from "date-fns/locale";
import type { ExternalSurgeryRequest } from "@shared/schema";

interface SurgeryRoom {
  id: string;
  name: string;
}

interface ScheduleDialogProps {
  request: ExternalSurgeryRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScheduled: () => void;
  surgeryRooms: SurgeryRoom[];
}

function ScheduleDialog({ request, open, onOpenChange, onScheduled, surgeryRooms }: ScheduleDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const isGerman = i18n.language === 'de';
  
  const [plannedDate, setPlannedDate] = useState(request.wishedDate);
  const [plannedTime, setPlannedTime] = useState("08:00");
  const [surgeryRoomId, setSurgeryRoomId] = useState<string>("");
  const [sendConfirmation, setSendConfirmation] = useState(true);

  useEffect(() => {
    if (request.wishedDate) {
      setPlannedDate(request.wishedDate);
      setPlannedTime("08:00");
      setSurgeryRoomId("");
    }
  }, [request.id, request.wishedDate]);

  const scheduleMutation = useMutation({
    mutationFn: async () => {
      const dateTime = new Date(`${plannedDate}T${plannedTime}`);
      return apiRequest('POST', `/api/external-surgery-requests/${request.id}/schedule`, {
        plannedDate: dateTime.toISOString(),
        surgeryRoomId: surgeryRoomId || null,
        sendConfirmation,
      });
    },
    onSuccess: () => {
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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('surgery.externalRequests.scheduleSurgery')}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Patient Info */}
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

          {/* Surgery Info */}
          <div className="bg-muted p-3 rounded-lg space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {t('surgery.externalRequests.surgery')}
            </p>
            <p className="font-medium">{request.surgeryName}</p>
            <p className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {request.surgeryDurationMinutes} min
            </p>
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

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('surgery.externalRequests.date')}</Label>
              <Input
                type="date"
                value={plannedDate}
                onChange={(e) => setPlannedDate(e.target.value)}
                data-testid="input-schedule-date"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('surgery.externalRequests.time')}</Label>
              <Input
                type="time"
                value={plannedTime}
                onChange={(e) => setPlannedTime(e.target.value)}
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

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-schedule-cancel">
            {t('common.cancel')}
          </Button>
          <Button data-testid="button-schedule-confirm" 
            onClick={() => scheduleMutation.mutate()}
            disabled={!plannedDate || (surgeryRooms.length > 0 && !surgeryRoomId) || scheduleMutation.isPending}
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
}

export function ExternalReservationsPanel({ trigger, defaultOpen = false }: ExternalReservationsPanelProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const isGerman = i18n.language === 'de';
  const [open, setOpen] = useState(defaultOpen);
  const [selectedRequest, setSelectedRequest] = useState<ExternalSurgeryRequest | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const hospitalId = activeHospital?.id;

  const { data: requests = [], isLoading, refetch } = useQuery<ExternalSurgeryRequest[]>({
    queryKey: [`/api/hospitals/${hospitalId}/external-surgery-requests?status=pending`],
    enabled: !!hospitalId && open,
  });

  const { data: surgeryRooms = [] } = useQuery<SurgeryRoom[]>({
    queryKey: [`/api/surgery-rooms?hospitalId=${hospitalId}`],
    enabled: !!hospitalId,
  });

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

  const handleSchedule = (request: ExternalSurgeryRequest) => {
    setSelectedRequest(request);
    setScheduleDialogOpen(true);
  };

  const handleScheduled = () => {
    refetch();
    queryClient.invalidateQueries({ predicate: (query) => 
      typeof query.queryKey[0] === 'string' && 
      query.queryKey[0].includes('external-surgery-requests')
    });
    queryClient.invalidateQueries({ queryKey: ['/api/surgeries'] });
  };

  const formatWishedDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return format(date, 'PPP', { locale: isGerman ? de : enUS });
  };

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
              {requests.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {requests.length}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-4">
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
              requests.map((request: ExternalSurgeryRequest & { documents?: any[] }) => (
                <Card key={request.id} className="shadow-sm">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-semibold text-lg">
                          {request.patientLastName}, {request.patientFirstName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {request.surgeryName}
                        </p>
                      </div>
                      <Badge variant={request.withAnesthesia ? "default" : "secondary"}>
                        {request.withAnesthesia
                          ? t('surgery.externalRequests.withAnesthesia')
                          : t('surgery.externalRequests.noAnesthesia')}
                      </Badge>
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
                    </div>

                    <div className="bg-muted/50 rounded-lg p-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase">
                        {t('surgery.externalRequests.surgeon')}
                      </p>
                      <p className="text-sm font-medium">
                        Dr. {request.surgeonLastName}, {request.surgeonFirstName}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {request.surgeonPhone}
                        </span>
                        <span className="flex items-center gap-1">
                          <Mail className="h-3 w-3" />
                          {request.surgeonEmail}
                        </span>
                      </div>
                    </div>

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
                            >
                              <FileText className="h-3 w-3" />
                              {doc.fileName}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button 
                        size="sm" 
                        className="flex-1"
                        onClick={() => handleSchedule(request)}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        {t('surgery.externalRequests.schedule')}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        onClick={() => declineMutation.mutate(request.id)}
                        disabled={declineMutation.isPending}
                      >
                        <X className="mr-1 h-4 w-4" />
                        {t('surgery.externalRequests.decline')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
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

  if (!countData?.count) return null;

  return (
    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
      {countData.count > 9 ? '9+' : countData.count}
    </span>
  );
}
