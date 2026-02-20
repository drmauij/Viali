import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { checkVitalsAlerts } from "@/lib/vitalsThresholds";
import type { VitalPointWithId, BPPointWithId } from "@/hooks/useVitalsQuery";

interface PacuVitalsAlertsProps {
  hr: VitalPointWithId[];
  bp: BPPointWithId[];
  spo2: VitalPointWithId[];
}

function getLastValue<T extends { timestamp: string; value: number }>(points: T[]): number | undefined {
  if (points.length === 0) return undefined;
  return points.reduce((latest, p) => p.timestamp > latest.timestamp ? p : latest).value;
}

export function PacuVitalsAlerts({ hr, bp, spo2 }: PacuVitalsAlertsProps) {
  const { t } = useTranslation();

  const lastHr = getLastValue(hr);
  const lastSpo2 = getLastValue(spo2);
  const lastBp = bp.length > 0
    ? bp.reduce((latest, p) => p.timestamp > latest.timestamp ? p : latest)
    : undefined;
  const lastSbp = lastBp?.sys;

  const alerts = checkVitalsAlerts(lastHr, lastSbp, lastSpo2);

  if (alerts.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {alerts.map((alert) => (
        <span
          key={alert.messageKey}
          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            alert.level === 'critical'
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
              : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
          }`}
        >
          <AlertTriangle className="h-3 w-3" />
          {t(alert.messageKey)} ({alert.value})
        </span>
      ))}
    </div>
  );
}
