import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
  Clock,
  Save,
  Plus,
  Trash2,
  CalendarOff,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProviderAvailability, ProviderTimeOff } from "@shared/schema";

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

interface ManageAvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId: string;
  providers: { id: string; firstName: string | null; lastName: string | null }[];
  initialProviderId?: string;
}

export function ManageAvailabilityDialog({
  open,
  onOpenChange,
  hospitalId,
  unitId,
  providers,
  initialProviderId,
}: ManageAvailabilityDialogProps) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const [selectedProviderId, setSelectedProviderId] = useState<string>(initialProviderId || "");
  const [editAvailability, setEditAvailability] = useState<Partial<ProviderAvailability>[]>([]);
  const [timeOffDialogOpen, setTimeOffDialogOpen] = useState(false);
  const dateLocale = i18n.language === 'de' ? de : enUS;

  useEffect(() => {
    if (open && initialProviderId) {
      setSelectedProviderId(initialProviderId);
    }
  }, [open, initialProviderId]);

  const { data: availability = [], isLoading: availabilityLoading } = useQuery<ProviderAvailability[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && open,
  });

  const { data: timeOff = [] } = useQuery<ProviderTimeOff[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && open,
  });

  useEffect(() => {
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('availability.title', 'Manage Availability')}</DialogTitle>
            <DialogDescription>
              {t('availability.dialogDescription', 'Configure working hours and time off for providers')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Select value={selectedProviderId} onValueChange={setSelectedProviderId}>
              <SelectTrigger className="w-full" data-testid="select-provider-dialog">
                <SelectValue placeholder={t('availability.selectProvider', 'Select a provider')} />
              </SelectTrigger>
              <SelectContent>
                {providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.firstName || ''} {provider.lastName || ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {selectedProviderId && (
              <Tabs defaultValue="schedule" className="space-y-4">
                <TabsList className="w-full">
                  <TabsTrigger value="schedule" className="flex-1" data-testid="tab-schedule-dialog">
                    <Clock className="h-4 w-4 mr-1" />
                    {t('availability.weeklySchedule', 'Weekly Schedule')}
                  </TabsTrigger>
                  <TabsTrigger value="timeoff" className="flex-1" data-testid="tab-timeoff-dialog">
                    <CalendarOff className="h-4 w-4 mr-1" />
                    {t('availability.timeOff', 'Time Off')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="schedule" className="space-y-4">
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
                            className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border ${isActive ? 'bg-background' : 'bg-muted/50'}`}
                            data-testid={`day-dialog-${day.value}`}
                          >
                            <div className="flex items-center min-w-[100px]">
                              <Switch
                                checked={isActive}
                                onCheckedChange={() => toggleDay(day.value)}
                                data-testid={`switch-day-dialog-${day.value}`}
                              />
                              <span className={`ml-2 text-sm ${isActive ? 'font-medium' : 'text-muted-foreground'}`}>
                                {t(`availability.days.${day.label.toLowerCase()}`, day.label)}
                              </span>
                            </div>

                            {isActive && (
                              <div className="flex flex-wrap items-center gap-2">
                                <Input
                                  type="time"
                                  value={dayAvail?.startTime || "08:00"}
                                  onChange={(e) => updateAvailabilityDay(day.value, 'startTime', e.target.value)}
                                  className="w-24"
                                  data-testid={`input-start-dialog-${day.value}`}
                                />
                                <span className="text-muted-foreground">-</span>
                                <Input
                                  type="time"
                                  value={dayAvail?.endTime || "17:00"}
                                  onChange={(e) => updateAvailabilityDay(day.value, 'endTime', e.target.value)}
                                  className="w-24"
                                  data-testid={`input-end-dialog-${day.value}`}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <Button
                        onClick={() => saveAvailabilityMutation.mutate(editAvailability.filter(a => a.isActive))}
                        disabled={saveAvailabilityMutation.isPending}
                        className="w-full"
                        data-testid="button-save-availability-dialog"
                      >
                        <Save className="h-4 w-4 mr-1" />
                        {saveAvailabilityMutation.isPending 
                          ? t('common.saving', 'Saving...') 
                          : t('availability.saveSchedule', 'Save Schedule')}
                      </Button>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="timeoff" className="space-y-4">
                  <div className="flex justify-end">
                    <Button onClick={() => setTimeOffDialogOpen(true)} size="sm" data-testid="button-add-timeoff-dialog">
                      <Plus className="h-4 w-4 mr-1" />
                      {t('availability.addTimeOff', 'Add Time Off')}
                    </Button>
                  </div>

                  {timeOff.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      {t('availability.noTimeOff', 'No time off scheduled')}
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {timeOff.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between p-2 rounded-lg border"
                          data-testid={`timeoff-dialog-${item.id}`}
                        >
                          <div className="text-sm">
                            <div className="font-medium">
                              {format(parseISO(item.startDate), 'PP', { locale: dateLocale })}
                              {item.startDate !== item.endDate && (
                                <> - {format(parseISO(item.endDate), 'PP', { locale: dateLocale })}</>
                              )}
                            </div>
                            {item.reason && (
                              <p className="text-muted-foreground">{item.reason}</p>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTimeOffMutation.mutate(item.id)}
                            disabled={deleteTimeOffMutation.isPending}
                            data-testid={`button-delete-timeoff-dialog-${item.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TimeOffDialog
        open={timeOffDialogOpen}
        onOpenChange={setTimeOffDialogOpen}
        onSubmit={(data) => createTimeOffMutation.mutate(data)}
        isPending={createTimeOffMutation.isPending}
      />
    </>
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
                data-testid="input-timeoff-start-nested"
              />
            </div>
            <div>
              <Label>{t('availability.endDate', 'End Date')}</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                data-testid="input-timeoff-end-nested"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              checked={isFullDay}
              onCheckedChange={setIsFullDay}
              data-testid="switch-fullday-nested"
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
                  data-testid="input-timeoff-start-time-nested"
                />
              </div>
              <div>
                <Label>{t('availability.endTime', 'End Time')}</Label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  data-testid="input-timeoff-end-time-nested"
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
              data-testid="input-timeoff-reason-nested"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-timeoff-nested">
            {isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
