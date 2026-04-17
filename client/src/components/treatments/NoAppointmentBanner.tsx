import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canActOnBanner } from "./appointmentLinkHelpers";

interface Props {
  treatmentStatus?: string;
  onLinkClick: () => void;
}

export function NoAppointmentBanner({ treatmentStatus, onLinkClick }: Props) {
  const { t } = useTranslation();
  const showAction = canActOnBanner(treatmentStatus);

  return (
    <div
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
      role="status"
    >
      <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">
          {t(
            "treatments.noAppointmentBanner.title",
            "No appointment linked to this treatment.",
          )}
        </p>
        <p className="text-sm opacity-90">
          {t(
            "treatments.noAppointmentBanner.hint",
            "Conversion tracking works best with an appointment.",
          )}
        </p>
      </div>
      {showAction && (
        <Button size="sm" variant="outline" onClick={onLinkClick}>
          {t("treatments.noAppointmentBanner.linkButton", "Link appointment")}
        </Button>
      )}
    </div>
  );
}
