import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TreatmentItemConfig } from "@shared/schema";

interface Props {
  configs: TreatmentItemConfig[];
  itemsMap: Record<string, { name: string }>;
  onPick: (config: TreatmentItemConfig) => void;
  /** Called when the admin gear icon is clicked; only shown when provided */
  onConfigure?: () => void;
}

export function TreatmentPalette({ configs, itemsMap, onPick, onConfigure }: Props) {
  const { t } = useTranslation();
  const visible = configs.filter((c) => !c.onDemandOnly);

  if (!visible.length && !onConfigure) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 p-2 border-y bg-muted/30"
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
      {onConfigure && (
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto h-6 w-6 shrink-0"
          title={t("treatments.configurePalette", "Configure treatment palette")}
          onClick={onConfigure}
        >
          <Settings className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
