import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  pickNearestToNow,
  type NormalizedAppointmentRow,
} from "./appointmentLinkHelpers";

export type TodayAppointmentRow = NormalizedAppointmentRow;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointments: TodayAppointmentRow[];
  onLink: (appointmentId: string) => void;
  onSkip: () => void;
}

export function TodayAppointmentDialog({
  open,
  onOpenChange,
  appointments,
  onLink,
  onSkip,
}: Props) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const nearest = pickNearestToNow(appointments, new Date());
    setSelectedId(nearest?.id ?? null);
  }, [open, appointments]);

  const handleLink = () => {
    if (!selectedId) return;
    onLink(selectedId);
  };

  // Dialog close (Esc / backdrop) behaves as Skip
  const handleOpenChange = (next: boolean) => {
    if (!next) onSkip();
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onKeyDown={(e) => {
          if (e.key === "Enter" && selectedId) {
            e.preventDefault();
            handleLink();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              "treatments.linkAppointmentDialog.title",
              "Link today's appointment?",
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              "treatments.linkAppointmentDialog.prompt",
              "This patient has an appointment today. Link this treatment to it?",
            )}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          value={selectedId ?? ""}
          onValueChange={(v) => setSelectedId(v)}
          className="space-y-2"
        >
          {appointments.map((a) => (
            <Label
              key={a.id}
              htmlFor={`today-appt-${a.id}`}
              className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-muted"
            >
              <RadioGroupItem value={a.id} id={`today-appt-${a.id}`} />
              <span className="font-medium w-14">{a.startTime}</span>
              <span className="flex-1 text-sm">
                {[a.providerName, a.serviceName].filter(Boolean).join(" — ") ||
                  t("treatments.linkAppointmentDialog.generalAppt", "General")}
              </span>
              <Badge variant="secondary" className="text-xs">
                {t(`appointments.status.${a.status}`, a.status)}
              </Badge>
            </Label>
          ))}
        </RadioGroup>

        <DialogFooter>
          <Button variant="outline" onClick={onSkip}>
            {t("treatments.linkAppointmentDialog.skip", "Skip")}
          </Button>
          <Button onClick={handleLink} disabled={!selectedId}>
            {t("treatments.linkAppointmentDialog.link", "Link")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
