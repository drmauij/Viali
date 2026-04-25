import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

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

  // Phase C uses the marketing endpoint's `locations` array as the option source.
  // (Phase D will add a dedicated /api/chain/:groupId/locations endpoint with
  // richer fields like recipient counts; until then, this is the cheapest source.)
  const { data: marketingData, isLoading } = useQuery<{ locations: LocationOption[] }>({
    queryKey: [`/api/chain/${groupId}/marketing?range=30d`],
    enabled: !!groupId,
  });

  const options: LocationOption[] = marketingData?.locations ?? [];

  // Mode is derived from the current value: "all" if everything is selected, else "selected"
  const isAllSelected = options.length > 0 && value.length === options.length
    && options.every(o => value.includes(o.hospitalId));
  const [mode, setMode] = useState<"all" | "selected">(isAllSelected ? "all" : "selected");

  // When options first load and the parent provided a value matching all options,
  // sync mode → "all". Conversely, if value drifts to a partial set we want
  // "selected" mode reflecting that.
  useEffect(() => {
    if (options.length === 0) return;
    if (value.length === options.length && options.every(o => value.includes(o.hospitalId))) {
      setMode("all");
    } else if (mode === "all") {
      setMode("selected");
    }
    // We deliberately don't re-fire when `mode` changes — that's user-driven below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.length, value]);

  // When user toggles mode → "all", auto-check everything. The "selected" radio
  // never auto-clears (last manual selection is preserved).
  const handleModeChange = (next: string) => {
    if (next !== "all" && next !== "selected") return;
    setMode(next);
    if (next === "all") {
      onChange(options.map(o => o.hospitalId));
    }
  };

  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange(Array.from(new Set([...value, id])));
    else onChange(value.filter(v => v !== id));
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
      <Label className="text-base font-medium">
        {t("flows.audience.label", "Target locations")}
      </Label>
      <RadioGroup value={mode} onValueChange={handleModeChange}>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="all" id="audience-all" data-testid="radio-audience-all" />
          <Label htmlFor="audience-all" className="font-normal cursor-pointer">
            {t("flows.audience.all", "All locations")} ({options.length})
          </Label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="selected" id="audience-selected" data-testid="radio-audience-selected" />
          <Label htmlFor="audience-selected" className="font-normal cursor-pointer">
            {t("flows.audience.selected", "Selected locations")}
          </Label>
        </div>
      </RadioGroup>

      {mode === "selected" && (
        <div className="pl-6 space-y-2 mt-2" data-testid="audience-location-list">
          {options.map(opt => {
            const checked = value.includes(opt.hospitalId);
            return (
              <div key={opt.hospitalId} className="flex items-center space-x-2">
                <Checkbox
                  id={`audience-hospital-${opt.hospitalId}`}
                  checked={checked}
                  onCheckedChange={(c) => toggle(opt.hospitalId, c === true)}
                  data-testid={`checkbox-audience-${opt.hospitalId}`}
                />
                <Label htmlFor={`audience-hospital-${opt.hospitalId}`} className="font-normal cursor-pointer">
                  {opt.hospitalName}
                </Label>
              </div>
            );
          })}
        </div>
      )}

      <div className="text-xs text-muted-foreground" data-testid="audience-total">
        {t("flows.audience.total", "Total: {{n}} location(s)", { n: value.length })}
      </div>
    </div>
  );
}
