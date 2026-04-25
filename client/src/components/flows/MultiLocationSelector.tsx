import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export interface MultiLocationSelectorProps {
  groupId: string;
  value: string[];                 // selected hospital IDs
  onChange: (ids: string[]) => void;
}

interface LocationOption {
  hospitalId: string;
  hospitalName: string;
}

export default function MultiLocationSelector({ groupId, value, onChange }: MultiLocationSelectorProps) {
  const { t } = useTranslation();

  const { data: marketingData, isLoading } = useQuery<{ locations: LocationOption[] }>({
    queryKey: [`/api/chain/${groupId}/funnels?range=30d`],
    enabled: !!groupId,
  });

  const options: LocationOption[] = marketingData?.locations ?? [];

  const allSelected = options.length > 0 && value.length === options.length
    && options.every(o => value.includes(o.hospitalId));

  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange(Array.from(new Set([...value, id])));
    else onChange(value.filter(v => v !== id));
  };

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map(o => o.hospitalId));
  };

  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="multi-location-selector-loading">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  if (options.length === 0) {
    return (
      <div className="text-sm text-muted-foreground" data-testid="multi-location-selector-empty">
        {t("flows.audience.noLocations", "No locations available in this chain.")}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="multi-location-selector">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground" data-testid="audience-total">
          {t("flows.audience.total", "Total: {{n}} location(s)", { n: value.length })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleAll}
          data-testid="button-toggle-all-locations"
        >
          {allSelected
            ? t("flows.audience.deselectAll", "Deselect all")
            : t("flows.audience.selectAll", "Select all")}
        </Button>
      </div>

      <div className="border rounded-md divide-y" data-testid="audience-location-list">
        {options.map(opt => {
          const checked = value.includes(opt.hospitalId);
          return (
            <label
              key={opt.hospitalId}
              htmlFor={`audience-hospital-${opt.hospitalId}`}
              className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
            >
              <Checkbox
                id={`audience-hospital-${opt.hospitalId}`}
                checked={checked}
                onCheckedChange={(c) => toggle(opt.hospitalId, c === true)}
                data-testid={`checkbox-audience-${opt.hospitalId}`}
              />
              <span className="text-sm">{opt.hospitalName}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
