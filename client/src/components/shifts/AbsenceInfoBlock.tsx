import { format, parseISO } from "date-fns";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ABSENCE_TYPE_LABEL_KEYS, ABSENCE_ICONS } from "@/lib/absenceConstants";

export interface AbsenceDetail {
  type: string;
  isPartial: boolean;
  approvalStatus?: string;
  startDate: string;
  endDate: string;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
  notes?: string | null;
  creatorName?: string | null;
}

interface Props {
  absence: AbsenceDetail | null;
}

export default function AbsenceInfoBlock({ absence }: Props) {
  const { t } = useTranslation();
  if (!absence) return null;

  const labelConfig = ABSENCE_TYPE_LABEL_KEYS[absence.type] ?? ABSENCE_TYPE_LABEL_KEYS.default;
  const icon = ABSENCE_ICONS[absence.type] ?? ABSENCE_ICONS.default;
  const dateLabel =
    absence.startDate === absence.endDate
      ? format(parseISO(absence.startDate), "d MMM yyyy")
      : `${format(parseISO(absence.startDate), "d MMM")} – ${format(parseISO(absence.endDate), "d MMM yyyy")}`;

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs space-y-1">
      <div className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-200">
        <AlertTriangle className="h-3 w-3" />
        <span>{icon}</span>
        {t(labelConfig.key, labelConfig.fallback)}
        {absence.approvalStatus === "pending" && (
          <span className="text-[10px] uppercase opacity-70">
            ({t("absences.pending", "Pending")})
          </span>
        )}
      </div>
      <div className="text-amber-700 dark:text-amber-300">{dateLabel}</div>
      {absence.isPartial && absence.startTime && absence.endTime && (
        <div className="text-amber-700 dark:text-amber-300">
          {t("absences.partial", "Partial")}: {absence.startTime}–{absence.endTime}
        </div>
      )}
      {(absence.reason || absence.notes) && (
        <div className="italic opacity-80">"{absence.reason || absence.notes}"</div>
      )}
      {absence.creatorName && <div className="opacity-60">— {absence.creatorName}</div>}
    </div>
  );
}
