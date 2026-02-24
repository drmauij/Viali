import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CheckCircle, Plus, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HospitalAnesthesiaSettings } from "@/hooks/useHospitalAnesthesiaSettings";

type ConditionValue = { checked: boolean; notes?: string };
type ConditionsRecord = Record<string, ConditionValue>;

type ConditionLabelEntry = {
  label: string;
  category: string;
  categoryLabel: string;
};

type ConditionLabelMap = Record<string, ConditionLabelEntry>;

const CATEGORY_ORDER: string[] = [
  "cardiovascular",
  "pulmonary",
  "gastrointestinal",
  "kidney",
  "metabolic",
  "neurological",
  "psychiatric",
  "skeletal",
  "coagulation",
  "infectious",
  "woman",
  "noxen",
  "children",
  "anesthesiaHistory",
];

interface EditableConditionsProps {
  conditions: ConditionsRecord | undefined;
  noConditions: boolean | undefined;
  canWrite: boolean;
  conditionLabelMap: ConditionLabelMap;
  illnessLists: HospitalAnesthesiaSettings["illnessLists"];
  onConditionsChange: (conditions: ConditionsRecord) => void;
  onNoConditionsChange: (val: boolean) => void;
}

export function EditableConditions({
  conditions,
  noConditions,
  canWrite,
  conditionLabelMap,
  illnessLists,
  onConditionsChange,
  onNoConditionsChange,
}: EditableConditionsProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);

  const current = conditions || {};

  // Group checked conditions by category for display
  const grouped = useMemo(() => {
    const groups: Record<
      string,
      { categoryLabel: string; items: Array<{ id: string; label: string; notes?: string }> }
    > = {};

    const checked = Object.entries(current).filter(([, v]) => v.checked);
    if (checked.length === 0) return [];

    for (const [id, val] of checked) {
      const info = conditionLabelMap[id];
      const category = info?.category || "uncategorized";
      const categoryLabel =
        info?.categoryLabel ||
        (category === "uncategorized"
          ? t("questionnaireTab.summary.uncategorized", "Other")
          : category);

      if (!groups[category]) {
        groups[category] = { categoryLabel, items: [] };
      }
      groups[category].items.push({
        id,
        label: info?.label || id,
        notes: val.notes,
      });
    }

    return Object.entries(groups).sort(([a], [b]) => {
      const aIdx = CATEGORY_ORDER.indexOf(a);
      const bIdx = CATEGORY_ORDER.indexOf(b);
      if (aIdx === -1 && bIdx === -1) return 0;
      if (aIdx === -1) return 1;
      if (bIdx === -1) return -1;
      return aIdx - bIdx;
    });
  }, [current, conditionLabelMap, t]);

  const checkedCount = Object.values(current).filter((v) => v.checked).length;

  const toggleCondition = (id: string) => {
    const existing = current[id];
    if (existing?.checked) {
      // Uncheck
      const updated = { ...current, [id]: { ...existing, checked: false } };
      onConditionsChange(updated);
    } else {
      // Check
      const updated = { ...current, [id]: { checked: true, notes: existing?.notes } };
      onConditionsChange(updated);
    }
  };

  const updateNotes = (id: string, notes: string) => {
    const existing = current[id] || { checked: true };
    onConditionsChange({ ...current, [id]: { ...existing, notes: notes || undefined } });
  };

  const removeCondition = (id: string) => {
    const updated = { ...current, [id]: { checked: false } };
    onConditionsChange(updated);
  };

  // Read-only mode
  if (!canWrite) {
    if (noConditions) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
      );
    }
    if (grouped.length === 0) {
      return (
        <p className="text-sm text-muted-foreground italic">
          {t("questionnaireTab.noData", "No data provided")}
        </p>
      );
    }
    return <ConditionDisplay grouped={grouped} />;
  }

  // None confirmed + add button
  if (noConditions) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span>{t("questionnaireTab.noneConfirmed", "None (confirmed by patient)")}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={() => onNoConditionsChange(false)}
        >
          <Plus className="h-3 w-3 mr-1" />
          {t("questionnaireTab.addItems", "Add items")}
        </Button>
      </div>
    );
  }

  // Editable: display + add button + dialog
  return (
    <div className="space-y-3">
      {grouped.length > 0 && (
        <div className="space-y-4">
          {grouped.map(([category, { categoryLabel, items }]) => (
            <div key={category}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {categoryLabel}
              </h4>
              <div className="space-y-1.5">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2 text-sm py-1.5 px-2.5 border rounded-md bg-muted/30 group"
                  >
                    <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.label}</span>
                        <button
                          onClick={() => removeCondition(item.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {/* Inline editable notes */}
                      <Input
                        value={item.notes || ""}
                        onChange={(e) => updateNotes(item.id, e.target.value)}
                        placeholder={t("questionnaireTab.conditionNotes", "Notes...")}
                        className="h-6 text-xs mt-1 border-0 border-b rounded-none px-0 focus-visible:ring-0 bg-transparent placeholder:text-muted-foreground/50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            <Plus className="h-3 w-3 mr-1" />
            {t("questionnaireTab.addConditions", "Add conditions")}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {t("questionnaireTab.addConditions", "Add conditions")}
            </DialogTitle>
          </DialogHeader>
          <ConditionPicker
            illnessLists={illnessLists}
            current={current}
            onToggle={toggleCondition}
            t={t}
          />
        </DialogContent>
      </Dialog>

      {/* Confirm none checkbox when empty */}
      {checkedCount === 0 && (
        <div className="flex items-center space-x-2 pt-1">
          <input
            type="checkbox"
            id="cond-none"
            checked={false}
            onChange={() => onNoConditionsChange(true)}
            className="rounded border-input"
          />
          <label htmlFor="cond-none" className="text-sm text-muted-foreground cursor-pointer">
            {t("questionnaireTab.confirmNone", "Confirm none")}
          </label>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────

function ConditionDisplay({
  grouped,
}: {
  grouped: Array<[string, { categoryLabel: string; items: Array<{ id: string; label: string; notes?: string }> }]>;
}) {
  return (
    <div className="space-y-4">
      {grouped.map(([category, { categoryLabel, items }]) => (
        <div key={category}>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {categoryLabel}
          </h4>
          <div className="space-y-1.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 text-sm py-1.5 px-2.5 border rounded-md bg-muted/30"
              >
                <CheckCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <span className="font-medium">{item.label}</span>
                  {item.notes && (
                    <span className="text-muted-foreground ml-2">— {item.notes}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  cardiovascular: "Cardiovascular",
  pulmonary: "Pulmonary",
  gastrointestinal: "Gastrointestinal",
  kidney: "Kidney",
  metabolic: "Metabolic",
  neurological: "Neurological",
  psychiatric: "Psychiatric",
  skeletal: "Skeletal",
  coagulation: "Coagulation",
  infectious: "Infectious Diseases",
  woman: "Gynecology",
  noxen: "Substance Use",
  children: "Pediatric",
  anesthesiaHistory: "Anesthesia & Surgical History",
};

function ConditionPicker({
  illnessLists,
  current,
  onToggle,
  t,
}: {
  illnessLists: HospitalAnesthesiaSettings["illnessLists"];
  current: ConditionsRecord;
  onToggle: (id: string) => void;
  t: any;
}) {
  if (!illnessLists) {
    return (
      <p className="text-sm text-muted-foreground p-4">
        {t("questionnaireTab.noSettingsAvailable", "No hospital settings available")}
      </p>
    );
  }

  // Build category groups excluding dental and ponvTransfusion (those have their own sections)
  const categories = CATEGORY_ORDER
    .filter((cat) => {
      const items = illnessLists[cat as keyof typeof illnessLists];
      return Array.isArray(items) && items.length > 0;
    })
    .map((cat) => ({
      key: cat,
      label: t(`anesthesia.settings.${cat}`, CATEGORY_LABELS[cat] || cat),
      items: illnessLists[cat as keyof typeof illnessLists] as Array<{ id: string; label: string }>,
    }));

  return (
    <Command className="flex-1 overflow-hidden">
      <CommandInput placeholder={t("questionnaireTab.searchConditions", "Search conditions...")} />
      <CommandList className="max-h-[60vh]">
        <CommandEmpty>{t("questionnaireTab.noResults", "No results")}</CommandEmpty>
        {categories.map((cat) => (
          <CommandGroup key={cat.key} heading={cat.label}>
            {cat.items.map((item) => {
              const isChecked = current[item.id]?.checked || false;
              return (
                <CommandItem
                  key={item.id}
                  value={`${cat.label} ${item.label}`}
                  onSelect={() => onToggle(item.id)}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isChecked ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {item.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}
