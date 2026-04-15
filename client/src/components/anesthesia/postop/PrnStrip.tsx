import { useTranslation } from "react-i18next";
import { isPrnCapReached, countPrnAdminsInWindow, type PrnItemLike, type PrnAdminLike } from "@shared/postopMedicationExecution";

export interface PrnItem {
  id: string;
  medicationRef: string;
  dose: string;
  route: "po" | "iv" | "sc" | "im";
  prnMaxPerDay?: number;
  prnMaxPerInterval?: { intervalH: number; count: number };
}

interface Props {
  items: PrnItem[];
  admins: PrnAdminLike[];
  onTap: (item: PrnItem) => void;
}

export function PrnStrip({ items, admins, onTap }: Props) {
  const { t } = useTranslation();
  const now = Date.now();
  const DAY_MS = 24 * 3_600_000;
  if (items.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap px-2 py-1 border-t border-border bg-card/30">
      <span className="text-[10px] uppercase font-semibold text-muted-foreground self-center pr-1">
        {t("postopOrders.medExecution.prnStripLabel")}
      </span>
      {items.map(item => {
        const capReached = isPrnCapReached(item as PrnItemLike, admins, now);
        const dailyCount = item.prnMaxPerDay !== undefined
          ? countPrnAdminsInWindow(admins, item.id, DAY_MS, now)
          : null;
        return (
          <button
            key={item.id}
            type="button"
            disabled={capReached}
            onClick={() => onTap(item)}
            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
              capReached
                ? "bg-muted text-muted-foreground border-muted cursor-not-allowed"
                : "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 cursor-pointer"
            }`}
            title={capReached ? t("postopOrders.medExecution.capReached") : undefined}
          >
            {item.medicationRef} · {item.dose} {item.route.toUpperCase()}
            {dailyCount !== null && (
              <span className="ml-1 opacity-70">({dailyCount}/{item.prnMaxPerDay})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
