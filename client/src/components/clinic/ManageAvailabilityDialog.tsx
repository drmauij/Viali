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
import { DateInput } from "@/components/ui/date-input";
import { TimeInput } from "@/components/ui/time-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Clock,
  Save,
  Plus,
  Trash2,
  CalendarOff,
  CalendarCheck,
  Settings,
  Info,
  Repeat,
  Globe,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { de, enUS } from "date-fns/locale";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { ProviderAvailability, ProviderTimeOff, ProviderAvailabilityWindow, ClinicProvider } from "@shared/schema";

const DAYS_OF_WEEK = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 0, label: "Sunday" },
];

export const TIME_OFF_TYPE_OPTIONS = [
  { value: 'vacation', icon: '🏖️', labelKey: 'availability.timeOffTypes.vacation', fallback: 'Vacation' },
  { value: 'sick', icon: '🤒', labelKey: 'availability.timeOffTypes.sick', fallback: 'Sick Leave' },
  { value: 'training', icon: '📚', labelKey: 'availability.timeOffTypes.training', fallback: 'Training' },
  { value: 'parental', icon: '👶', labelKey: 'availability.timeOffTypes.parental', fallback: 'Parental Leave' },
  { value: 'overtime', icon: '⏱️', labelKey: 'availability.timeOffTypes.overtime', fallback: 'Overtime Reduction' },
  { value: 'blocked', icon: '🚫', labelKey: 'availability.timeOffTypes.blocked', fallback: 'Blocked / Other' },
] as const;

export const TIME_OFF_TYPE_ICONS: Record<string, string> = Object.fromEntries(
  TIME_OFF_TYPE_OPTIONS.map(o => [o.value, o.icon])
);

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
  const [windowDialogOpen, setWindowDialogOpen] = useState(false);
  const dateLocale = i18n.language === 'de' ? de : enUS;

  useEffect(() => {
    if (open && initialProviderId) {
      setSelectedProviderId(initialProviderId);
    }
  }, [open, initialProviderId]);

  const { data: clinicProviders = [] } = useQuery<(ClinicProvider & { user: any })[]>({
    queryKey: [`/api/clinic/${hospitalId}/bookable-providers`, unitId],
    queryFn: async () => {
      const url = unitId
        ? `/api/clinic/${hospitalId}/bookable-providers?unitId=${unitId}`
        : `/api/clinic/${hospitalId}/bookable-providers`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch bookable providers');
      return res.json();
    },
    enabled: !!hospitalId && open,
  });

  const selectedProviderData = clinicProviders.find(p => p.userId === selectedProviderId);
  const availabilityMode = selectedProviderData?.availabilityMode || 'always_available';

  // Public Calendar tab: all providers (including non-bookable) + booking token
  const { data: allClinicProviders = [] } = useQuery<any[]>({
    queryKey: [`/api/clinic/${hospitalId}/clinic-providers`],
    enabled: !!hospitalId && open,
  });
  const selectedFullProvider = allClinicProviders.find((p: any) => p.userId === selectedProviderId);

  const { data: bookingTokenData } = useQuery<{ bookingToken: string | null }>({
    queryKey: [`/api/admin/${hospitalId}/booking-token`],
    enabled: !!hospitalId && open,
  });

  const [copiedLink, setCopiedLink] = useState(false);

  const updateProviderBookingMutation = useMutation({
    mutationFn: async (data: { isBookable: boolean; bookingServiceName?: string; bookingLocation?: string }) => {
      return apiRequest('PUT', `/api/clinic/${hospitalId}/clinic-providers/${selectedProviderId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey[0];
        return typeof k === 'string' && (k.includes('/clinic-providers') || k.includes('/bookable-providers'));
      }});
    },
    onError: () => {
      toast({ title: t('common.error', 'Error'), description: t('availability.bookingUpdateError', 'Failed to update booking settings'), variant: 'destructive' });
    },
  });

  const { data: availability = [], isLoading: availabilityLoading } = useQuery<ProviderAvailability[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && open,
  });

  const { data: timeOff = [] } = useQuery<ProviderTimeOff[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/time-off`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && open,
  });

  const { data: availabilityWindows = [] } = useQuery<ProviderAvailabilityWindow[]>({
    queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability-windows`],
    enabled: !!hospitalId && !!unitId && !!selectedProviderId && open,
  });

  useEffect(() => {
    if (availability.length > 0) {
      setEditAvailability(availability.map((a, idx) => ({
        id: a.id || `legacy-${a.dayOfWeek}-${idx}-${a.startTime}`,
        dayOfWeek: a.dayOfWeek,
        startTime: a.startTime,
        endTime: a.endTime,
        slotDurationMinutes: a.slotDurationMinutes,
        isActive: a.isActive,
      })));
    } else if (selectedProviderId) {
      setEditAvailability(DAYS_OF_WEEK.slice(0, 5).map((d, idx) => ({
        id: `new-${idx}`,
        dayOfWeek: d.value,
        startTime: "08:00",
        endTime: "17:00",
        slotDurationMinutes: 30,
        isActive: true,
      })));
    }
  }, [availability, selectedProviderId]);

  const updateAvailabilityModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      return apiRequest("PUT", `/api/clinic/${hospitalId}/providers/${selectedProviderId}/availability-mode`, { mode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/bookable-providers`, unitId] });
      toast({ title: t('availability.modeUpdated', 'Availability mode updated') });
    },
    onError: () => {
      toast({ title: t('availability.modeError', 'Failed to update availability mode'), variant: "destructive" });
    },
  });

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
      // Also invalidate the calendar's unit-level time-off query and business module
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/time-off`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/time-off`] });
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
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/time-off`] });
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/time-off`] });
      toast({ title: t('availability.timeOffDeleted', 'Time off deleted') });
    },
  });

  const createWindowMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", `/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability-windows`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability-windows`] });
      toast({ title: t('availability.windowCreated', 'Availability window created') });
      setWindowDialogOpen(false);
    },
    onError: () => {
      toast({ title: t('availability.windowError', 'Failed to create availability window'), variant: "destructive" });
    },
  });

  const deleteWindowMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/clinic/${hospitalId}/availability-windows/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability-windows`] });
      toast({ title: t('availability.windowDeleted', 'Availability window deleted') });
    },
  });

  const updateWindowMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      return apiRequest("PUT", `/api/clinic/${hospitalId}/availability-windows/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/units/${unitId}/providers/${selectedProviderId}/availability-windows`] });
    },
  });

  const updateAvailabilitySlot = (slotId: string, field: string, value: any) => {
    setEditAvailability(prev => 
      prev.map(a => (a.id === slotId ? { ...a, [field]: value } : a))
    );
  };

  const toggleDay = (dayOfWeek: number) => {
    setEditAvailability(prev => {
      const daySlots = prev.filter(a => a.dayOfWeek === dayOfWeek);
      if (daySlots.length > 0) {
        const currentActive = daySlots.some(a => a.isActive);
        return prev.map(a => a.dayOfWeek === dayOfWeek ? { ...a, isActive: !currentActive } : a);
      } else {
        return [...prev, { id: `new-${Date.now()}`, dayOfWeek, startTime: "08:00", endTime: "17:00", slotDurationMinutes: 30, isActive: true }];
      }
    });
  };

  const addTimeSlot = (dayOfWeek: number) => {
    const newSlot = {
      id: `new-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      dayOfWeek,
      startTime: "09:00",
      endTime: "12:00",
      slotDurationMinutes: 30,
      isActive: true,
    };
    setEditAvailability(prev => [...prev, newSlot]);
  };

  const removeTimeSlot = (slotId: string, dayOfWeek: number) => {
    setEditAvailability(prev => {
      const daySlots = prev.filter(a => a.dayOfWeek === dayOfWeek && a.isActive);
      if (daySlots.length <= 1) {
        return prev.map(a => a.id === slotId ? { ...a, isActive: false } : a);
      }
      return prev.filter(a => a.id !== slotId);
    });
  };

  const getSlotsForDay = (dayOfWeek: number) => {
    return editAvailability
      .filter(a => a.dayOfWeek === dayOfWeek)
      .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));
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
              <Tabs defaultValue="mode" className="space-y-4">
                <TabsList className="w-full grid grid-cols-5">
                  <TabsTrigger value="mode" className="text-xs" data-testid="tab-mode-dialog">
                    <Settings className="h-4 w-4 mr-1 hidden sm:block" />
                    {t('availability.mode', 'Mode')}
                  </TabsTrigger>
                  <TabsTrigger value="schedule" className="text-xs" data-testid="tab-schedule-dialog">
                    <Clock className="h-4 w-4 mr-1 hidden sm:block" />
                    {t('availability.schedule', 'Schedule')}
                  </TabsTrigger>
                  <TabsTrigger value="windows" className="text-xs" data-testid="tab-windows-dialog">
                    <CalendarCheck className="h-4 w-4 mr-1 hidden sm:block" />
                    {t('availability.windows', 'Windows')}
                  </TabsTrigger>
                  <TabsTrigger value="timeoff" className="text-xs" data-testid="tab-timeoff-dialog">
                    <CalendarOff className="h-4 w-4 mr-1 hidden sm:block" />
                    {t('availability.timeOff', 'Time Off')}
                  </TabsTrigger>
                  <TabsTrigger value="booking" className="text-xs" data-testid="tab-booking-dialog">
                    <Globe className="h-4 w-4 mr-1 hidden sm:block" />
                    {t('availability.publicCalendar', 'Public Calendar')}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="mode" className="space-y-4">
                  <div className="p-4 border rounded-lg bg-muted/30">
                    <div className="flex items-start gap-2 mb-4">
                      <Info className="h-4 w-4 mt-1 text-blue-500" />
                      <p className="text-sm text-muted-foreground">
                        {t('availability.modeDescription', 'Choose how this provider\'s availability is determined. This affects when patients can book appointments.')}
                      </p>
                    </div>
                    
                    <RadioGroup
                      value={availabilityMode}
                      onValueChange={(value) => updateAvailabilityModeMutation.mutate(value)}
                      className="space-y-4"
                    >
                      <div className="flex items-start space-x-3 p-3 border rounded-lg bg-background">
                        <RadioGroupItem value="always_available" id="always_available" data-testid="radio-always-available" />
                        <div className="flex-1">
                          <Label htmlFor="always_available" className="font-medium cursor-pointer">
                            {t('availability.alwaysAvailable', 'Always Available')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('availability.alwaysAvailableDesc', 'Provider is bookable during weekly schedule hours, except when blocked by surgeries, time-off, or absences.')}
                          </p>
                          <Badge variant="secondary" className="mt-2">
                            {t('availability.default', 'Default')}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-start space-x-3 p-3 border rounded-lg bg-background">
                        <RadioGroupItem value="windows_required" id="windows_required" data-testid="radio-windows-required" />
                        <div className="flex-1">
                          <Label htmlFor="windows_required" className="font-medium cursor-pointer">
                            {t('availability.windowsRequired', 'Windows Required')}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {t('availability.windowsRequiredDesc', 'Provider is ONLY bookable during explicitly defined weekly schedule OR specific availability windows. Use this for surgeons who are only available after certain hours, or on-demand providers.')}
                          </p>
                          <Badge variant="outline" className="mt-2">
                            {t('availability.restrictive', 'Restrictive')}
                          </Badge>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </TabsContent>

                <TabsContent value="schedule" className="space-y-4">
                  <div className="p-3 border rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm">
                    <p className="text-blue-800 dark:text-blue-300">
                      {availabilityMode === 'windows_required' 
                        ? t('availability.scheduleInfoRestricted', 'This provider uses Windows Required mode. They will ONLY be bookable during these hours.')
                        : t('availability.scheduleInfoDefault', 'This provider is bookable during these hours unless blocked by surgeries or time-off.')}
                    </p>
                  </div>

                  {availabilityLoading ? (
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full" />
                      ))}
                    </div>
                  ) : (
                    <>
                      {DAYS_OF_WEEK.map((day) => {
                        const daySlots = getSlotsForDay(day.value);
                        const isActive = daySlots.length > 0 && daySlots.some(s => s.isActive);

                        return (
                          <div
                            key={day.value}
                            className={`p-3 rounded-lg border ${isActive ? 'bg-background' : 'bg-muted/50'}`}
                            data-testid={`day-dialog-${day.value}`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center">
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
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => addTimeSlot(day.value)}
                                  className="h-7 px-2 text-xs"
                                  data-testid={`button-add-slot-${day.value}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  {t('availability.addSlot', 'Add Slot')}
                                </Button>
                              )}
                            </div>

                            {isActive && daySlots.length > 0 && (
                              <div className="space-y-2 ml-8">
                                {daySlots.filter(s => s.isActive).map((slot, idx) => (
                                  <div key={slot.id} className="flex items-center gap-2">
                                    <TimeInput
                                      value={slot.startTime || "08:00"}
                                      onChange={(v) => updateAvailabilitySlot(slot.id!, 'startTime', v)}
                                      className="w-28"
                                      data-testid={`input-start-dialog-${day.value}-${idx}`}
                                    />
                                    <span className="text-muted-foreground">-</span>
                                    <TimeInput
                                      value={slot.endTime || "17:00"}
                                      onChange={(v) => updateAvailabilitySlot(slot.id!, 'endTime', v)}
                                      className="w-28"
                                      data-testid={`input-end-dialog-${day.value}-${idx}`}
                                    />
                                    {daySlots.filter(s => s.isActive).length > 1 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeTimeSlot(slot.id!, day.value)}
                                        className="h-8 w-8 text-destructive hover:text-destructive"
                                        data-testid={`button-remove-slot-${day.value}-${idx}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
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

                <TabsContent value="windows" className="space-y-4">
                  <div className="p-3 border rounded-lg bg-green-50 dark:bg-green-950/30 text-sm">
                    <p className="text-green-800 dark:text-green-300">
                      {t('availability.windowsDescription', 'Add specific dates and times when the provider is available. These are one-time availability slots that override or add to the weekly schedule.')}
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={() => setWindowDialogOpen(true)} size="sm" data-testid="button-add-window-dialog">
                      <Plus className="h-4 w-4 mr-1" />
                      {t('availability.addWindow', 'Add Availability Window')}
                    </Button>
                  </div>

                  {availabilityWindows.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <CalendarCheck className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>{t('availability.noWindows', 'No availability windows defined')}</p>
                      <p className="text-sm mt-1">
                        {availabilityMode === 'windows_required' 
                          ? t('availability.noWindowsHintRestricted', 'Add windows to make this provider bookable on specific dates.')
                          : t('availability.noWindowsHint', 'Windows are optional. Add them to open extra slots outside the regular schedule.')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {availabilityWindows.map((window) => (
                        <div
                          key={window.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-green-50/50 dark:bg-green-950/20"
                          data-testid={`window-dialog-${window.id}`}
                        >
                          <div className="text-sm">
                            <div className="font-medium text-green-800 dark:text-green-300">
                              {format(parseISO(window.date), 'EEEE, PP', { locale: dateLocale })}
                            </div>
                            <div className="text-muted-foreground">
                              {window.startTime} - {window.endTime}
                              {window.notes && <span className="ml-2">({window.notes})</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1.5" title={t('availability.showOnPublicCalendar', 'Show on public calendar')}>
                              <span className="text-xs text-muted-foreground">{t('availability.public', 'Public')}</span>
                              <Switch
                                checked={window.isPublic !== false}
                                onCheckedChange={(checked) => updateWindowMutation.mutate({ id: window.id, data: { isPublic: checked } })}
                                disabled={updateWindowMutation.isPending}
                                data-testid={`switch-window-public-${window.id}`}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteWindowMutation.mutate(window.id)}
                              disabled={deleteWindowMutation.isPending}
                              data-testid={`button-delete-window-dialog-${window.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
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
                          <div className="text-sm flex-1">
                            <div className="font-medium flex items-center gap-2">
                              {item.isRecurring && (
                                <Repeat className="h-4 w-4 text-blue-500" />
                              )}
                              {format(parseISO(item.startDate), 'PP', { locale: dateLocale })}
                              {!item.isRecurring && item.startDate !== item.endDate && (
                                <> - {format(parseISO(item.endDate), 'PP', { locale: dateLocale })}</>
                              )}
                            </div>
                            {item.isRecurring && (
                              <p className="text-xs text-blue-600">
                                {item.recurrencePattern === 'weekly' && t('availability.weekly', 'Weekly')}
                                {item.recurrencePattern === 'biweekly' && t('availability.biweekly', 'Every 2 Weeks')}
                                {item.recurrencePattern === 'monthly' && t('availability.monthly', 'Monthly')}
                                {item.recurrenceDaysOfWeek && item.recurrenceDaysOfWeek.length > 0 && (
                                  <> ({item.recurrenceDaysOfWeek.map(d => t(DAY_NAME_KEYS[d].key, DAY_NAME_KEYS[d].fallback)).join(', ')})</>
                                )}
                                {item.recurrenceEndDate && (
                                  <> {t('availability.until', 'until')} {format(parseISO(item.recurrenceEndDate), 'PP', { locale: dateLocale })}</>
                                )}
                                {item.recurrenceCount && (
                                  <> ({t('availability.times', '{{count}} times', { count: item.recurrenceCount })})</>
                                )}
                              </p>
                            )}
                            {item.reason && (
                              <p className="text-muted-foreground">
                                {TIME_OFF_TYPE_ICONS[item.reason] || '🚫'}{' '}
                                {TIME_OFF_TYPE_OPTIONS.find(o => o.value === item.reason)
                                  ? t(TIME_OFF_TYPE_OPTIONS.find(o => o.value === item.reason)!.labelKey, TIME_OFF_TYPE_OPTIONS.find(o => o.value === item.reason)!.fallback)
                                  : item.reason}
                              </p>
                            )}
                            {item.notes && (
                              <p className="text-xs text-muted-foreground/70">{item.notes}</p>
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

                {/* Public Calendar Tab */}
                <TabsContent value="booking" className="space-y-4">
                  {(() => {
                    const isBookable = selectedFullProvider?.isBookable ?? false;
                    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                    const bookingUrl = bookingTokenData?.bookingToken ? `${baseUrl}/book/${bookingTokenData.bookingToken}` : null;
                    const providerUrl = bookingUrl ? `${bookingUrl}?provider=${selectedProviderId}` : null;

                    return (
                      <div className="space-y-4">
                        {/* Enable/Disable toggle */}
                        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                          <div className="flex-1">
                            <Label className="font-medium">
                              {t('availability.publicCalendarEnabled', 'Public Calendar Enabled')}
                            </Label>
                            <p className="text-sm text-muted-foreground mt-1">
                              {t('availability.publicCalendarDescription', 'Allow patients to book appointments with this provider through the public booking page.')}
                            </p>
                          </div>
                          <Switch
                            checked={isBookable}
                            onCheckedChange={(checked) => {
                              updateProviderBookingMutation.mutate({
                                isBookable: checked,
                                bookingServiceName: selectedFullProvider?.bookingServiceName || undefined,
                                bookingLocation: selectedFullProvider?.bookingLocation || undefined,
                              });
                            }}
                            disabled={updateProviderBookingMutation.isPending}
                          />
                        </div>

                        {/* Booking settings — always visible when enabled */}
                        {isBookable && (
                          <>
                            {/* Direct booking link */}
                            {providerUrl ? (
                              <div className="space-y-2">
                                <Label className="text-sm">{t('availability.directLink', 'Direct Booking Link')}</Label>
                                <div className="flex items-center gap-2">
                                  <Input
                                    value={providerUrl}
                                    readOnly
                                    className="flex-1 bg-muted text-sm font-mono"
                                  />
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(providerUrl);
                                        setCopiedLink(true);
                                        setTimeout(() => setCopiedLink(false), 2000);
                                      } catch { /* ignore */ }
                                    }}
                                  >
                                    {copiedLink ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() => window.open(providerUrl, '_blank')}
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                                <p className="text-sm text-amber-700 dark:text-amber-300">
                                  <i className="fas fa-info-circle mr-2"></i>
                                  {t('availability.noBookingLink', 'No booking link has been generated yet. Generate one in Admin → Settings → Links.')}
                                </p>
                              </div>
                            )}

                            {/* Service and Location */}
                            <div className="space-y-3">
                              <div>
                                <Label className="text-sm">{t('availability.bookingService', 'Service')}</Label>
                                <Input
                                  placeholder={t('availability.bookingServicePlaceholder', 'e.g. Plastische Chirurgie Beratung')}
                                  defaultValue={selectedFullProvider?.bookingServiceName || ''}
                                  key={`service-${selectedProviderId}`}
                                  className="mt-1"
                                  onBlur={(e) => {
                                    if (e.target.value !== (selectedFullProvider?.bookingServiceName || '')) {
                                      updateProviderBookingMutation.mutate({
                                        isBookable: true,
                                        bookingServiceName: e.target.value,
                                        bookingLocation: selectedFullProvider?.bookingLocation || undefined,
                                      });
                                    }
                                  }}
                                />
                                <p className="text-xs text-muted-foreground mt-1">{t('availability.bookingServiceHint', 'Displayed on the public booking page for this provider')}</p>
                              </div>
                              <div>
                                <Label className="text-sm">{t('availability.bookingLocation', 'Location')}</Label>
                                <Input
                                  placeholder={t('availability.bookingLocationPlaceholder', 'e.g. Gaissbergstr. 45')}
                                  defaultValue={selectedFullProvider?.bookingLocation || ''}
                                  key={`location-${selectedProviderId}`}
                                  className="mt-1"
                                  onBlur={(e) => {
                                    if (e.target.value !== (selectedFullProvider?.bookingLocation || '')) {
                                      updateProviderBookingMutation.mutate({
                                        isBookable: true,
                                        bookingServiceName: selectedFullProvider?.bookingServiceName || undefined,
                                        bookingLocation: e.target.value,
                                      });
                                    }
                                  }}
                                />
                                <p className="text-xs text-muted-foreground mt-1">{t('availability.bookingLocationHint', 'Address shown to patients when booking')}</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
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

      <AvailabilityWindowDialog
        open={windowDialogOpen}
        onOpenChange={setWindowDialogOpen}
        onSubmit={(data) => createWindowMutation.mutate(data)}
        isPending={createWindowMutation.isPending}
      />
    </>
  );
}

const DAY_NAME_KEYS = [
  { key: 'availability.daysShort.sun', fallback: 'Sun' },
  { key: 'availability.daysShort.mon', fallback: 'Mon' },
  { key: 'availability.daysShort.tue', fallback: 'Tue' },
  { key: 'availability.daysShort.wed', fallback: 'Wed' },
  { key: 'availability.daysShort.thu', fallback: 'Thu' },
  { key: 'availability.daysShort.fri', fallback: 'Fri' },
  { key: 'availability.daysShort.sat', fallback: 'Sat' },
];

export function TimeOffDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  defaultStartDate,
  defaultEndDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
  defaultStartDate?: string;
  defaultEndDate?: string;
}) {
  const { t } = useTranslation();
  const [startDate, setStartDate] = useState(defaultStartDate || format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(defaultEndDate || format(new Date(), 'yyyy-MM-dd'));

  // Reset form when dialog opens or defaults change
  useEffect(() => {
    if (defaultStartDate) setStartDate(defaultStartDate);
    if (defaultEndDate) setEndDate(defaultEndDate);
  }, [defaultStartDate, defaultEndDate]);
  useEffect(() => {
    if (open) {
      setReason("blocked");
      setNotes("");
    }
  }, [open]);
  const [reason, setReason] = useState("blocked");
  const [notes, setNotes] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");
  
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState<string>('weekly');
  const [recurrenceDaysOfWeek, setRecurrenceDaysOfWeek] = useState<number[]>([]);
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'date' | 'count'>('never');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(10);

  const toggleDayOfWeek = (day: number) => {
    if (recurrenceDaysOfWeek.includes(day)) {
      setRecurrenceDaysOfWeek(recurrenceDaysOfWeek.filter(d => d !== day));
    } else {
      setRecurrenceDaysOfWeek([...recurrenceDaysOfWeek, day]);
    }
  };

  const handleSubmit = () => {
    onSubmit({
      startDate,
      endDate: isRecurring ? startDate : endDate,
      reason: reason || 'blocked',
      notes: notes || null,
      startTime: isFullDay ? null : startTime,
      endTime: isFullDay ? null : endTime,
      isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      recurrenceDaysOfWeek: isRecurring && recurrenceDaysOfWeek.length > 0 ? recurrenceDaysOfWeek : null,
      recurrenceEndDate: isRecurring && recurrenceEndType === 'date' ? recurrenceEndDate : null,
      recurrenceCount: isRecurring && recurrenceEndType === 'count' ? recurrenceCount : null,
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
              <DateInput
                value={startDate}
                onChange={(v) => setStartDate(v)}
                data-testid="input-timeoff-start-nested"
              />
            </div>
            <div>
              <Label>{t('availability.endDate', 'End Date')}</Label>
              <DateInput
                value={endDate}
                onChange={(v) => setEndDate(v)}
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
                <TimeInput
                  value={startTime}
                  onChange={(v) => setStartTime(v)}
                  data-testid="input-timeoff-start-time-nested"
                />
              </div>
              <div>
                <Label>{t('availability.endTime', 'End Time')}</Label>
                <TimeInput
                  value={endTime}
                  onChange={(v) => setEndTime(v)}
                  data-testid="input-timeoff-end-time-nested"
                />
              </div>
            </div>
          )}

          <div>
            <Label>{t('availability.timeOffTypeLabel', 'Type')}</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger data-testid="select-timeoff-type-nested">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OFF_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.icon} {t(opt.labelKey, opt.fallback)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{t('availability.notes', 'Notes (optional)')}</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('availability.timeOffNotesPlaceholder', 'Additional details...')}
              rows={2}
              data-testid="input-timeoff-notes-nested"
            />
          </div>

          <div className="border-t pt-4 space-y-4">
            <div className="flex items-center gap-2">
              <Switch
                checked={isRecurring}
                onCheckedChange={setIsRecurring}
                data-testid="switch-recurring-nested"
              />
              <Label className="font-medium">{t('availability.recurring', 'Recurring Time Off')}</Label>
            </div>

            {isRecurring && (
              <>
                <div>
                  <Label>{t('availability.pattern', 'Repeat Pattern')}</Label>
                  <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                    <SelectTrigger data-testid="select-pattern-nested">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">{t('availability.weekly', 'Weekly')}</SelectItem>
                      <SelectItem value="biweekly">{t('availability.biweekly', 'Every 2 Weeks')}</SelectItem>
                      <SelectItem value="monthly">{t('availability.monthly', 'Monthly')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(recurrencePattern === 'weekly' || recurrencePattern === 'biweekly') && (
                  <div>
                    <Label className="mb-2 block">{t('availability.daysOfWeek', 'Days of Week')}</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAY_NAME_KEYS.map((dayKey, index) => (
                        <Button
                          key={index}
                          type="button"
                          variant={recurrenceDaysOfWeek.includes(index) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleDayOfWeek(index)}
                          data-testid={`button-day-${index}-nested`}
                        >
                          {t(dayKey.key, dayKey.fallback)}
                        </Button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('availability.daysHint', 'Leave empty to repeat on the same day each week')}
                    </p>
                  </div>
                )}

                <div>
                  <Label>{t('availability.ends', 'Ends')}</Label>
                  <Select value={recurrenceEndType} onValueChange={(v) => setRecurrenceEndType(v as any)}>
                    <SelectTrigger data-testid="select-end-type-nested">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">{t('availability.never', 'Never')}</SelectItem>
                      <SelectItem value="date">{t('availability.onDate', 'On Date')}</SelectItem>
                      <SelectItem value="count">{t('availability.afterOccurrences', 'After X Occurrences')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {recurrenceEndType === 'date' && (
                  <div>
                    <Label>{t('availability.endDate', 'End Date')}</Label>
                    <DateInput
                      value={recurrenceEndDate}
                      onChange={(v) => setRecurrenceEndDate(v)}
                      min={startDate}
                      data-testid="input-recurrence-end-date-nested"
                    />
                  </div>
                )}

                {recurrenceEndType === 'count' && (
                  <div>
                    <Label>{t('availability.occurrences', 'Number of Occurrences')}</Label>
                    <Input
                      type="number"
                      value={recurrenceCount}
                      onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 10)}
                      min={1}
                      max={365}
                      data-testid="input-recurrence-count-nested"
                    />
                  </div>
                )}
              </>
            )}
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

function AvailabilityWindowDialog({
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
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(true);

  const handleSubmit = () => {
    onSubmit({
      date,
      startTime,
      endTime,
      notes: notes || null,
      isPublic,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('availability.addWindow', 'Add Availability Window')}</DialogTitle>
          <DialogDescription>
            {t('availability.windowFormDescription', 'Define when the provider is available on a specific date')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('availability.date', 'Date')}</Label>
            <DateInput
              value={date}
              onChange={(v) => setDate(v)}
              min={format(new Date(), 'yyyy-MM-dd')}
              data-testid="input-window-date"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('availability.startTime', 'Start Time')}</Label>
              <TimeInput
                value={startTime}
                onChange={(v) => setStartTime(v)}
                data-testid="input-window-start-time"
              />
            </div>
            <div>
              <Label>{t('availability.endTime', 'End Time')}</Label>
              <TimeInput
                value={endTime}
                onChange={(v) => setEndTime(v)}
                data-testid="input-window-end-time"
              />
            </div>
          </div>

          <div>
            <Label>{t('availability.notes', 'Notes (optional)')}</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('availability.windowNotesPlaceholder', 'e.g., Morning consultations only')}
              data-testid="input-window-notes"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="window-public-toggle">
                {t('availability.showOnPublicCalendar', 'Show on public calendar')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t('availability.publicCalendarHint', 'When off, only staff can book appointments in this window')}
              </p>
            </div>
            <Switch
              id="window-public-toggle"
              checked={isPublic}
              onCheckedChange={setIsPublic}
              data-testid="switch-window-public"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending} data-testid="button-save-window">
            {isPending ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
