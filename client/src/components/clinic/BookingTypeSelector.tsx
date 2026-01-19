import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { User, Users, Clock, Scissors, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type BookingType = "external" | "internal" | "off_time" | "surgery";

interface BookingTypeSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: BookingType) => void;
  canAccessSurgery: boolean;
  slotInfo?: {
    providerId?: string;
    date?: Date;
    endDate?: Date;
  };
}

const STORAGE_KEY = "clinic_last_booking_type";

export function BookingTypeSelector({
  open,
  onOpenChange,
  onSelect,
  canAccessSurgery,
  slotInfo,
}: BookingTypeSelectorProps) {
  const { t } = useTranslation();
  
  const getLastUsedType = (): BookingType => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && ["external", "internal", "off_time", "surgery"].includes(stored)) {
      if (stored === "surgery" && !canAccessSurgery) {
        return "external";
      }
      return stored as BookingType;
    }
    return "external";
  };

  const [selectedType, setSelectedType] = useState<BookingType>(getLastUsedType);

  useEffect(() => {
    if (open) {
      setSelectedType(getLastUsedType());
    }
  }, [open, canAccessSurgery]);

  const handleSelect = (type: BookingType) => {
    localStorage.setItem(STORAGE_KEY, type);
    onSelect(type);
    onOpenChange(false);
  };

  const bookingOptions = [
    {
      type: "external" as const,
      icon: User,
      title: t("appointments.bookingType.external", "External Booking"),
      description: t("appointments.bookingType.externalDesc", "Book appointment for a patient"),
      available: true,
    },
    {
      type: "internal" as const,
      icon: Users,
      title: t("appointments.bookingType.internal", "Internal Booking"),
      description: t("appointments.bookingType.internalDesc", "Book time with a colleague"),
      available: true,
    },
    {
      type: "off_time" as const,
      icon: Clock,
      title: t("appointments.bookingType.offTime", "Off-Time Slot"),
      description: t("appointments.bookingType.offTimeDesc", "Block this time as unavailable"),
      available: true,
      quickAction: true,
    },
    {
      type: "surgery" as const,
      icon: Scissors,
      title: t("appointments.bookingType.surgery", "Quick Surgery"),
      description: t("appointments.bookingType.surgeryDesc", "Schedule OR time"),
      available: canAccessSurgery,
      badge: !canAccessSurgery ? t("appointments.bookingType.orOnly", "OR Doctors only") : undefined,
    },
  ];

  const timeDisplay = slotInfo?.date && slotInfo?.endDate
    ? `${slotInfo.date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${slotInfo.endDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : null;

  const dateDisplay = slotInfo?.date
    ? slotInfo.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("appointments.bookingType.title", "What would you like to book?")}
          </DialogTitle>
          {(dateDisplay || timeDisplay) && (
            <DialogDescription className="flex items-center gap-2 text-sm">
              {dateDisplay && <span>{dateDisplay}</span>}
              {timeDisplay && <span className="text-primary font-medium">{timeDisplay}</span>}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-2 py-2">
          {bookingOptions.map((option) => {
            const Icon = option.icon;
            const isSelected = selectedType === option.type;
            const isDisabled = !option.available;
            
            return (
              <button
                key={option.type}
                onClick={() => !isDisabled && handleSelect(option.type)}
                disabled={isDisabled}
                className={cn(
                  "w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all",
                  "border-border hover:border-primary hover:bg-primary/5",
                  isDisabled && "opacity-50 cursor-not-allowed hover:border-border hover:bg-transparent"
                )}
                data-testid={`booking-type-${option.type}`}
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                  <Icon className="w-5 h-5" />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {option.title}
                    </span>
                    {option.badge && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {option.badge}
                      </span>
                    )}
                    {option.quickAction && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {t("appointments.bookingType.quickAction", "Quick")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {option.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
            data-testid="button-cancel-booking-type"
          >
            {t("common.cancel", "Cancel")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
