import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import type { TreatmentItemConfig } from "@shared/schema";

interface Props {
  configs: TreatmentItemConfig[];
  itemsMap: Record<string, { name: string }>;
  onPick: (config: TreatmentItemConfig) => void;
}

export function TreatmentPalette({ configs, itemsMap, onPick }: Props) {
  const { t } = useTranslation();
  const visible = configs.filter((c) => !c.onDemandOnly);
  if (!visible.length) return null;

  return (
    <div
      className="flex flex-wrap gap-2 p-2 border-y bg-muted/30"
      aria-label={t("treatments.quickAdd", "Quick add")}
    >
      {visible.map((c) => (
        <Badge
          key={c.id}
          role="button"
          tabIndex={0}
          className="cursor-pointer select-none"
          onClick={() => onPick(c)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onPick(c);
            }
          }}
        >
          + {itemsMap[c.itemId]?.name ?? t("treatments.unknownItem", "Item")}
          {c.defaultDose
            ? ` (${c.defaultDose}${c.defaultDoseUnit ?? ""})`
            : ""}
        </Badge>
      ))}
    </div>
  );
}
