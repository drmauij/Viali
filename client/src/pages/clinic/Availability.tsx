import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Calendar,
  Clock,
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Settings,
  User,
  CalendarOff,
} from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProviderAvailability, ProviderTimeOff, TimebutlerConfig } from "@shared/schema";

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

const SLOT_DURATIONS = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "60 min" },
  { value: 90, label: "90 min" },
];

export default function ClinicAvailability() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [editAvailability, setEditAvailability] = useState<Partial<ProviderAvailability>[]>([]);
  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);

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

  const { data: availability = [], isLoading: availabilityLoading } = useQuery<ProviderAvailability[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId,
  });

  const { data: timeOff = [] } = useQuery<ProviderTimeOff[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId,
  });

  const { data: timebutlerConfig } = useQuery<TimebutlerConfig & { hasApiToken?: boolean }>({
    queryKey: [`/api/clinic/${hospitalId}/timebutler-config`],
    enabled: !!hospitalId,
  });

  useMemo(() => {
    if (availability.length > 0) {
      setEditAvailability(availability.map(a => ({
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        slotDurationMinutes: a.slotDurationMinutes,
        isActive: a.isActive,
      })));
    } else if (selectedProviderId) {
      setEditAvailability(DAYS_OF_WEEK.slice(0, 5).map(d => ({
        dayOfWeek: d.value,
        startTime: "08:00",
        endTime: "17:00",
        slotDurationMinutes: 30,
        isActive: true,
      })));
    }
  }, [availability, selectedProviderId]);

  const saveAvailabilityMutation = useMutation({
    mutationFn: async (data: Partial<ProviderAvailability>[]) => {
      return apiRequest("PUT", `/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability`, {
        availability: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability`] });
      toast({ title: t('availability.saved', 'Availability saved successfully') });
    },
    onError: () => {
      toast({ title: t('availability.saveError', 'Failed to save availability'), variant: "destructive" });
    },
  });

  const createTimeOffMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`] });
      toast({ title: t('availability.timeOffCreated', 'Time off created') });
      setTimeOffDialogOpen(false);
    },
    onError: () => {
      toast({ title: t('availability.timeOffError', 'Failed to create time off'), variant: "destructive" });
    },
  });

  const deleteTimeOffMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/clinic/${hospitalId}/time-off/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`] });
      toast({ title: t('availability.timeOffDeleted', 'Time off deleted') });
    },
  });

  const syncTimebutlerMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/timebutler-sync`);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/absences`] });
      toast({ title: t('availability.timebutlerSynced', 'Timebutler absences synced') });
    },
    onError: () => {
      toast({ title: t('availability.timebutlerError', 'Failed to sync Timebutler'), variant: "destructive" });
    },
  });

  const updateAvailabilityDay = (dayOfWeek: number, field: string, value: any) => {
    setEditAvailability(prev => {
      const existing = prev.find(a => a.dayOfWeek === dayOfWeek);
      if (existing) {
        return prev.map(a => a.dayOfWeek === dayOfWeek ? { ...a, [field]: value } : a);
      } else {
        return [...prev, { dayOfWeek, [field]: value, startTime: "08:00", endTime: "17:00", slotDurationMinutes: 30, isActive: true }];
      }
    });
  };

  const toggleDay = (dayOfWeek: number) => {
    setEditAvailability(prev => {
      const existing = prev.find(a => a.dayOfWeek === dayOfWeek);
      if (existing) {
        return prev.map(a => a.dayOfWeek === dayOfWeek ? { ...a, isActive: !a.isActive } : a);
      } else {
        return [...prev, { dayOfWeek, startTime: "08:00", endTime: "17:00", slotDurationMinutes: 30, isActive: true }];
      }
    });
  };

  if (!hospitalId || !unitId) {
    return (
      <div className="container mx-auto p-4" data-testid="availability-no-hospital">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">{t('availability.noHospital', 'Please select a hospital to manage availability')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-4" data-testid="availability-page">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation('/clinic/appointments')} data-testid="button-back">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">
            {t('availability.title', 'Manage Availability')}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
          <SelectTrigger className="w-[250px]" data-testid="select-provider">
            <SelectValue placeholder={t('availability.selectProvider', 'Select a provider')} />
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

      {selectedProviderId && (
        <Tabs defaultValue="schedule" className="space-y-4">
          <TabsList>
            <TabsTrigger value="schedule" data-testid="tab-schedule">
              <Clock className="h-4 w-4 mr-1" />
              {t('availability.weeklySchedule', 'Weekly Schedule')}
            </TabsTrigger>
            <TabsTrigger value="timeoff" data-testid="tab-timeoff">
              <CalendarOff className="h-4 w-4 mr-1" />
              {t('availability.timeOff', 'Time Off')}
            </TabsTrigger>
            <TabsTrigger value="timebutler" data-testid="tab-timebutler">
              <RefreshCw className="h-4 w-4 mr-1" />
              Timebutler
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule">
            <Card>
              <CardHeader>
                <CardTitle>{t('availability.weeklySchedule', 'Weekly Schedule')}</CardTitle>
                <CardDescription>
                  {t('availability.scheduleDescription', 'Set working hours for each day of the week')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {availabilityLoading ? (
                  <div className="space-y-2">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <>
                    {DAYS_OF_WEEK.map((day) => {
                      const dayAvail = editAvailability.find(a => a.dayOfWeek === day.value);
                      const isActive = dayAvail?.isActive ?? false;

                      return (
                        <div
                          key={day.value}
                          className={`flex items-center gap-4 p-3 rounded-lg border ${isActive ? 'bg-background' : 'bg-muted/50'}`}
                          data-testid={`day-${day.value}`}
                        >
                          <div className="w-24">
                            <Switch
                              checked={isActive}
                              onCheckedChange={() => toggleDay(day.value)}
                              data-testid={`switch-day-${day.value}`}
                            />
                            <span className={`ml-2 ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                              {t(`availability.days.${day.label.toLowerCase()}`, day.label)}
                            </span>
                          </div>

                          {isActive && (
                            <>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">{t('availability.from', 'From')}</Label>
                                <Input
                                  type="time"
                                  value={dayAvail?.startTime || "08:00"}
                                  onChange={(e) => updateAvailabilityDay(day.value, 'startTime', e.target.value)}
                                  className="w-28"
                                  data-testid={`input-start-${day.value}`}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">{t('availability.to', 'To')}</Label>
                                <Input
                                  type="time"
                                  value={dayAvail?.endTime || "17:00"}
                                  onChange={(e) => updateAvailabilityDay(day.value, 'endTime', e.target.value)}
                                  className="w-28"
                                  data-testid={`input-end-${day.value}`}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <Label className="text-sm text-muted-foreground">{t('availability.slotDuration', 'Slot')}</Label>
                                <Select
                                  value={String(dayAvail?.slotDurationMinutes || 30)}
                                  onValueChange={(v) => updateAvailabilityDay(day.value, 'slotDurationMinutes', parseInt(v))}
                                >
                                  <SelectTrigger className="w-24" data-testid={`select-duration-${day.value}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SLOT_DURATIONS.map((d) => (
                                      <SelectItem key={d.value} value={String(d.value)}>
                                        {d.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}

                    <Button
                      onClick={() => saveAvailabilityMutation.mutate(editAvailability.filter(a => a.isActive))}
                      disabled={saveAvailabilityMutation.isPending}
                      data-testid="button-save-availability"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      {saveAvailabilityMutation.isPending 
                        ? t('common.saving', 'Saving...') 
                        : t('availability.saveSchedule', 'Save Schedule')}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeoff">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('availability.timeOff', 'Time Off')}</CardTitle>
                  <CardDescription>
                    {t('availability.timeOffDescription', 'Manage vacations, holidays, and blocked time')}
                  </CardDescription>
                </div>
                <Button onClick={() => setTimeOffDialogOpen(true)} data-testid="button-add-timeoff">
                  <Plus className="h-4 w-4 mr-1" />
                  {t('availability.addTimeOff', 'Add Time Off')}
                </Button>
              </CardHeader>
              <CardContent>
                {timeOff.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    {t('availability.noTimeOff', 'No time off scheduled')}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {timeOff.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-lg border"
                        data-testid={`timeoff-${item.id}`}
                      >
                        <div>
                          <div className="font-medium">
                            {format(parseISO(item.startDate), 'PPP', { locale: dateLocale })}
                            {item.startDate !== item.endDate && (
                              <> - {format(parseISO(item.endDate), 'PPP', { locale: dateLocale })}</>
                            )}
                          </div>
                          {item.reason && (
                            <p className="text-sm text-muted-foreground">{item.reason}</p>
                          )}
                          {(item.startTime || item.endTime) && (
                            <p className="text-sm text-muted-foreground">
                              {item.startTime} - {item.endTime}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteTimeOffMutation.mutate(item.id)}
                          disabled={deleteTimeOffMutation.isPending}
                          data-testid={`button-delete-timeoff-${item.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timebutler">
            <Card>
              <CardHeader>
                <CardTitle>Timebutler {t('availability.integration', 'Integration')}</CardTitle>
                <CardDescription>
                  {t('availability.timebutlerDescription', 'Sync staff absences from Timebutler HR system')}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('availability.status', 'Status')}</p>
                    {timebutlerConfig?.isEnabled ? (
                      <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                        {t('availability.enabled', 'Enabled')}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="bg-gray-100 text-gray-600">
                        {t('availability.disabled', 'Disabled')}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t('availability.lastSync', 'Last Sync')}</p>
                    <p className="text-sm text-muted-foreground">
                      {timebutlerConfig?.lastSyncAt
                        ? format(new Date(timebutlerConfig.lastSyncAt), 'PPpp', { locale: dateLocale })
                        : t('availability.never', 'Never')}
                    </p>
                  </div>
                </div>

                {timebutlerConfig?.lastSyncMessage && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-sm">{timebutlerConfig.lastSyncMessage}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={() => syncTimebutlerMutation.mutate()}
                    disabled={!timebutlerConfig?.isEnabled || syncTimebutlerMutation.isPending}
                    data-testid="button-sync-timebutler"
                  >
                    <RefreshCw className={`h-4 w-4 mr-1 ${syncTimebutlerMutation.isPending ? 'animate-spin' : ''}`} />
                    {syncTimebutlerMutation.isPending 
                      ? t('availability.syncing', 'Syncing...') 
                      : t('availability.syncNow', 'Sync Now')}
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('availability.timebutlerNote', 'Note: Timebutler API allows 12 syncs per day. Syncs happen automatically once daily.')}
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <TimeOffDialog
        open={timeOffDialogOpen}
        onOpenChange={setTimeOffDialogOpen}
        onSubmit={(data) => createTimeOffMutation.mutate(data)}
        isPending={createTimeOffMutation.isPending}
      />
    </div>
  );
}

function TimeOffDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  const handleSubmit = () => {
    onSubmit({
      startDate,
      endDate,
      reason: reason || null,
      startTime: isFullDay ? null : startTime,
      endTime: isFullDay ? null : endTime,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('availability.addTimeOff', 'Add Time Off')}</DialogTitle>
          <DialogDescription>
            {t('availability.timeOffFormDescription', 'Block time when the provider is not available')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('availability.startDate', 'Start Date')}</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                data-testid="input-timeoff-start"
              />
            </div>
            <div>
              <Label>{t('availability.endDate', 'End Date')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                data-testid="input-timeoff-end"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={isFullDay}
              onCheckedChange={setIsFullDay}
              data-testid="switch-fullday"
            />
            <Label>{t('availability.fullDay', 'Full Day')}</Label>
          </div>

          {!isFullDay && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('availability.startTime', 'Start Time')}</Label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  data-testid="input-timeoff-start-time"
                />
              </div>
              <div>
                <Label>{t('availability.endTime', 'End Time')}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-timeoff-end-time"
                />
              </div>
            </div>
          )}

          <div>
            <Label>{t('availability.reason', 'Reason (optional)')}</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('availability.reasonPlaceholder', 'e.g., Vacation, Conference')}
              data-testid="input-timeoff-reason"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-timeoff">
            {isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
