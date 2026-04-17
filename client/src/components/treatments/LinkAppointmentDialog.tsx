import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CalendarIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import {
  filterLinkableAppointments,
  todayLocalDateString,
  type ApiAppointment,
  normalizeApptRow,
} from "./appointmentLinkHelpers";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  hospitalId: string;
  onLink: (appointmentId: string) => void;
}

export function LinkAppointmentDialog({
  open,
  onOpenChange,
  patientId,
  hospitalId,
  onLink,
}: Props) {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date>(() => new Date());
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const dateStr = todayLocalDateString(date);

  const { data: rawAppointments = [], isLoading } = useQuery<ApiAppointment[]>({
    queryKey: ["link-appointment-dialog", hospitalId, patientId, dateStr],
    queryFn: () =>
      apiRequest(
        "GET",
        `/api/clinic/${hospitalId}/appointments?patientId=${patientId}&startDate=${dateStr}&endDate=${dateStr}`,
      ).then((r) => r.json()),
    enabled: open && !!patientId && !!hospitalId,
  });

  const appointments = filterLinkableAppointments(rawAppointments).map(
    normalizeApptRow,
  );

  useEffect(() => {
    if (!open) {
      setSelectedId(null);
      setDate(new Date());
    }
  }, [open]);

  useEffect(() => {
    // reset selection whenever the fetched list changes
    setSelectedId(null);
  }, [dateStr]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("treatments.pickAppointment.title", "Link an appointment")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-sm font-medium">
              {t("treatments.pickAppointment.dateLabel", "Date")}
            </Label>
            <Popover open={datePopoverOpen} onOpenChange={setDatePopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-start text-left"
                >
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {format(date, "dd.MM.yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={(d) => {
                    if (!d) return;
                    setDate(d);
                    setDatePopoverOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {isLoading && (
            <p className="text-sm text-muted-foreground">
              {t("common.loading", "Loading…")}
            </p>
          )}

          {!isLoading && appointments.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t(
                "treatments.pickAppointment.empty",
                "No appointments for this patient on {{date}}.",
                { date: format(date, "dd.MM.yyyy") },
              )}
            </p>
          )}

          {!isLoading && appointments.length > 0 && (
            <RadioGroup
              value={selectedId ?? ""}
              onValueChange={(v) => setSelectedId(v)}
              className="space-y-2"
            >
              {appointments.map((a) => (
                <Label
                  key={a.id}
                  htmlFor={`pick-appt-${a.id}`}
                  className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted"
                >
                  <RadioGroupItem value={a.id} id={`pick-appt-${a.id}`} />
                  <span className="font-medium w-14">{a.startTime}</span>
                  <span className="flex-1 text-sm">
                    {[a.providerName, a.serviceName].filter(Boolean).join(" — ") ||
                      t(
                        "treatments.linkAppointmentDialog.generalAppt",
                        "General",
                      )}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {t(`appointments.status.${a.status}`, a.status)}
                  </Badge>
                </Label>
              ))}
            </RadioGroup>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("treatments.pickAppointment.cancel", "Cancel")}
          </Button>
          <Button
            onClick={() => selectedId && onLink(selectedId)}
            disabled={!selectedId}
          >
            {t("treatments.pickAppointment.link", "Link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
