import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, MapPin } from "lucide-react";

interface LocationOption {
  hospitalId: string;
  hospitalName: string;
}

interface Props {
  groupId: string;
  value: string[];           // currently selected hospital IDs
  onChange: (ids: string[]) => void;
}

/**
 * Trigger = small button with summary ("All (N)" or "K of N locations").
 * Body    = bordered checkbox list + Select-all/Deselect-all toggle.
 *
 * Pulls the location list from the existing `/api/chain/:groupId/funnels`
 * heatmap endpoint, which already returns `locations: [{ hospitalId, hospitalName }]`.
 */
export default function ChainLocationFilter({ groupId, value, onChange }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data } = useQuery<{ locations: LocationOption[] }>({
    queryKey: [`/api/chain/${groupId}/funnels?range=30d`],
    enabled: !!groupId,
  });

  const options = data?.locations ?? [];
  const allSelected =
    options.length > 0 &&
    value.length === options.length &&
    options.every((o) => value.includes(o.hospitalId));

  const toggle = (id: string, checked: boolean) => {
    if (checked) onChange(Array.from(new Set([...value, id])));
    else onChange(value.filter((v) => v !== id));
  };

  const toggleAll = () => {
    if (allSelected) onChange([]);
    else onChange(options.map((o) => o.hospitalId));
  };

  const summary = allSelected
    ? t("chain.funnels.allLocations", "All locations ({{n}})", { n: options.length })
    : value.length === 0
      ? t("chain.funnels.noLocations", "No locations selected")
      : t("chain.funnels.kOfN", "{{k}} of {{n}} locations", {
          k: value.length,
          n: options.length,
        });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="min-w-[200px] justify-between"
          data-testid="button-location-filter"
        >
          <span className="flex items-center gap-2 truncate">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{summary}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-60 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{summary}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleAll}
            data-testid="button-toggle-all-filter"
          >
            {allSelected
              ? t("flows.audience.deselectAll", "Deselect all")
              : t("flows.audience.selectAll", "Select all")}
          </Button>
        </div>
        <div className="border rounded-md divide-y max-h-72 overflow-auto">
          {options.map((opt) => {
            const checked = value.includes(opt.hospitalId);
            return (
              <label
                key={opt.hospitalId}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(c) => toggle(opt.hospitalId, c === true)}
                  data-testid={`filter-checkbox-${opt.hospitalId}`}
                />
                <span className="text-sm">{opt.hospitalName}</span>
              </label>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
