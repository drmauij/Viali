import { useTranslation } from "react-i18next";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Plus } from "lucide-react";

type OptionItem = { id: string; label: string };

interface EditableCheckboxRecordProps {
  /** Current checked record, e.g. { "dentures": true, "crowns": false } */
  data: Record<string, boolean> | undefined;
  /** All available options from hospital settings */
  options: OptionItem[];
  /** Fallback label map for items not in options (patient-submitted legacy keys) */
  fallbackLabels?: Record<string, string>;
  /** Whether "none confirmed" flag is set */
  noneConfirmed: boolean | undefined;
  /** Whether user has write permission */
  canWrite: boolean;
  /** Called when data changes */
  onDataChange: (data: Record<string, boolean>) => void;
  /** Called when noneConfirmed changes */
  onNoneConfirmedChange: (val: boolean) => void;
  /** Custom "none confirmed" label */
  noneLabel?: string;
}

export function EditableCheckboxRecord({
  data,
  options,
  fallbackLabels,
  noneConfirmed,
  canWrite,
  onDataChange,
  onNoneConfirmedChange,
  noneLabel,
}: EditableCheckboxRecordProps) {
  const { t } = useTranslation();

  const checkedEntries = data
    ? Object.entries(data).filter(([, v]) => v)
    : [];

  // Read-only: show badges or none-confirmed
  if (!canWrite) {
    if (noneConfirmed) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>
            {noneLabel || t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}
          </span>
        </div>
      );
    }
    if (checkedEntries.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          {t("questionnaireTab.noData", "No data provided")}
        </p>
      );
    }
    return (
      <div className="flex flex-wrap gap-1">
        {checkedEntries.map(([key]) => {
          const opt = options.find((o) => o.id === key);
          return (
            <Badge key={key} variant="secondary">
              {opt?.label || fallbackLabels?.[key] || key}
            </Badge>
          );
        })}
      </div>
    );
  }

  // Editable: none confirmed state with "Add items" button
  if (noneConfirmed) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>
            {noneLabel || t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onNoneConfirmedChange(false)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("questionnaireTab.addItems", "Add items")}
        </Button>
      </div>
    );
  }

  // Editable: full checkbox grid
  const handleToggle = (itemId: string, checked: boolean) => {
    const current = data || {};
    const updated = { ...current, [itemId]: checked };
    onDataChange(updated);
    // Auto-clear noneConfirmed is already handled by the caller
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {options.map((item) => (
          <div key={item.id} className="flex items-center space-x-2">
            <Checkbox
              id={`cbr-${item.id}`}
              checked={data?.[item.id] || false}
              onCheckedChange={(checked) => handleToggle(item.id, !!checked)}
            />
            <Label htmlFor={`cbr-${item.id}`} className="font-normal text-sm cursor-pointer">
              {item.label}
            </Label>
          </div>
        ))}
      </div>
      {/* Show "None confirmed" checkbox when list is empty */}
      {checkedEntries.length === 0 && (
        <div className="flex items-center space-x-2 pt-1">
          <Checkbox
            id="cbr-none"
            checked={false}
            onCheckedChange={() => onNoneConfirmedChange(true)}
          />
          <Label htmlFor="cbr-none" className="font-normal text-sm text-muted-foreground cursor-pointer">
            {t("questionnaireTab.confirmNone", "Confirm none")}
          </Label>
        </div>
      )}
    </div>
  );
}
