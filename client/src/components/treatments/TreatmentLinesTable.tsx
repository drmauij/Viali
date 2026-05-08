import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { ChevronsUpDown, Check, Trash2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { formatDate, formatCurrency } from "@/lib/dateUtils";
import {
  pickItemPatch,
  pickServicePatch,
  recomputeTotalPatch,
} from "./lineAutoFill";
import type { TreatmentLine } from "@shared/schema";

type Service = { id: string; name: string; price?: string | null };
type Item = { id: string; name: string; patientPrice?: string | null };
type Lot = {
  id: string;
  lotNumber: string;
  expiryDate?: string | null;
  qty?: number | null;
};

interface Props {
  lines: Partial<TreatmentLine>[];
  services: Service[];
  items: Item[];
  lotsByItem: Record<string, Lot[]>;
  isLocked: boolean;
  zoneSuggestions?: string[];
  onChangeLine: (index: number, patch: Partial<TreatmentLine>) => void;
  onRemoveLine: (index: number) => void;
  onItemSelect?: (itemId: string | null) => void;
}

export function TreatmentLinesTable({
  lines,
  services,
  items,
  lotsByItem,
  isLocked,
  zoneSuggestions = [],
  onChangeLine,
  onRemoveLine,
  onItemSelect,
}: Props) {
  const { t } = useTranslation();

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        {t("treatments.noLines", "No lines yet. Use the palette or Add line button.")}
      </p>
    );
  }

  // Shared grid template — header labels and every card's inner row stay
  // aligned vertically. Last column for actions is hidden on locked view.
  const gridCols = isLocked
    ? "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_8.5rem_7rem]"
    : "grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_8.5rem_7rem_2.5rem]";

  return (
    <div className="space-y-2">
      {/* Column labels — sit above the cards so the grid stays consistent */}
      <div
        className={cn(
          "grid gap-2 text-xs text-muted-foreground font-medium px-3",
          gridCols,
        )}
      >
        <span>{t("treatments.service", "Service (Anwendung)")}</span>
        <span>{t("treatments.product", "Product (Präparat)")}</span>
        <span>{t("treatments.lot", "Lot / Charge")}</span>
        <span>{t("treatments.dose", "Dose")}</span>
        <span className="text-right">{t("treatments.price", "Price")}</span>
        {!isLocked && <span />}
      </div>

      {/* Each line is its own card with a tinted background (no border) so
          columns stay aligned across lines while the contrast against the
          surrounding Card makes it obvious where one line ends and the
          next begins. */}
      {lines.map((line, index) => (
        <LineCard
          key={index}
          index={index}
          line={line}
          services={services}
          items={items}
          lotsByItem={lotsByItem}
          isLocked={isLocked}
          zoneSuggestions={zoneSuggestions}
          gridCols={gridCols}
          onChangeLine={onChangeLine}
          onRemoveLine={onRemoveLine}
          onItemSelect={onItemSelect}
        />
      ))}
    </div>
  );
}

interface RowProps {
  index: number;
  line: Partial<TreatmentLine>;
  services: Service[];
  items: Item[];
  lotsByItem: Record<string, Lot[]>;
  isLocked: boolean;
  zoneSuggestions: string[];
  gridCols: string;
  onChangeLine: (index: number, patch: Partial<TreatmentLine>) => void;
  onRemoveLine: (index: number) => void;
  onItemSelect?: (itemId: string | null) => void;
}

function LineCard({
  index,
  line,
  services,
  items,
  lotsByItem,
  isLocked,
  zoneSuggestions,
  gridCols,
  onChangeLine,
  onRemoveLine,
  onItemSelect,
}: RowProps) {
  const { t } = useTranslation();

  const service = line.serviceId
    ? services.find((s) => s.id === line.serviceId) ?? null
    : null;
  const item = line.itemId
    ? items.find((i) => i.id === line.itemId) ?? null
    : null;
  const lots = line.itemId ? lotsByItem[line.itemId] ?? [] : [];
  const lot = line.lotId ? lots.find((l) => l.id === line.lotId) ?? null : null;
  const zones = (line.zones as string[]) ?? [];

  // Read-only / locked rendering
  if (isLocked) {
    return (
      <div className="rounded-lg bg-muted px-3 py-3 space-y-2 text-sm">
        <div className={cn("grid gap-2 items-center", gridCols)}>
          <span className="truncate">{service?.name ?? "—"}</span>
          <span className="truncate">{item?.name ?? "—"}</span>
          <span className="truncate">{lot ? lot.lotNumber : line.lotNumber || "—"}</span>
          <span>
            {line.dose || "—"}
            {line.doseUnit ? ` ${line.doseUnit}` : ""}
          </span>
          <span className="text-right">
            {line.total ? formatCurrency(line.total as string) : "—"}
          </span>
        </div>
        {(zones.length > 0 || line.notes) && (
          <div className="flex items-center gap-1 flex-wrap text-xs">
            {zones.map((z) => (
              <Badge key={z} variant="secondary" className="text-xs">
                {z}
              </Badge>
            ))}
            {line.notes && (
              <span className="text-muted-foreground truncate max-w-[40ch]">
                {line.notes}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="rounded-lg bg-muted px-3 py-3 space-y-2"
      data-testid={`treatment-line-card-${index}`}
    >
      <div className={cn("grid gap-2 items-start", gridCols)}>
        <ServiceCell
          value={line.serviceId ?? null}
          services={services}
          onPick={(s) => onChangeLine(index, pickServicePatch(line, s))}
        />
        <ProductCell
          value={line.itemId ?? null}
          items={items}
          onPick={(it) => {
            onChangeLine(index, pickItemPatch(line, it));
            onItemSelect?.(it?.id ?? null);
          }}
        />
        <LotCell
          line={line}
          lots={lots}
          onPickLot={(l) =>
            onChangeLine(index, { lotId: l.id, lotNumber: undefined })
          }
          onClearLot={() =>
            onChangeLine(index, { lotId: undefined, lotNumber: undefined })
          }
          onTypeBatch={(value) =>
            onChangeLine(index, { lotId: undefined, lotNumber: value })
          }
        />
        <div className="flex gap-1">
          <Input
            value={line.dose ?? ""}
            placeholder={t("treatments.dose", "Dose")}
            className="h-8 w-16"
            onChange={(e) => {
              const dose = e.target.value;
              const totalPatch = recomputeTotalPatch({ ...line, dose });
              onChangeLine(index, { dose, ...totalPatch });
            }}
          />
          <Input
            value={line.doseUnit ?? ""}
            placeholder={t("treatments.unitPlaceholder", "units")}
            className="h-8 w-16"
            onChange={(e) => onChangeLine(index, { doseUnit: e.target.value })}
          />
        </div>
        <Input
          value={(line.total as string) ?? ""}
          placeholder="0.00"
          className="h-8 w-full text-right"
          onChange={(e) => onChangeLine(index, { total: e.target.value })}
        />
        <div className="flex items-center justify-end">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-destructive"
            aria-label={t("treatments.removeLineAria", "Remove line")}
            onClick={() => onRemoveLine(index)}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <InlineZoneEditor
        zones={zones}
        notes={line.notes}
        suggestions={zoneSuggestions}
        onChange={(next) => onChangeLine(index, { zones: next })}
      />
    </div>
  );
}

// Editable zones strip rendered under each line. Chips removable on click,
// a "+ Zone" popover at the end opens a Command list of suggestions with a
// free-text fallback (Enter to add). Avoids the round-trip through the full
// line dialog for the common case of jotting down where the product went.
function InlineZoneEditor({
  zones,
  notes,
  suggestions,
  onChange,
}: {
  zones: string[];
  notes?: string | null;
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const filtered = useMemo(
    () =>
      suggestions
        .filter(
          (s) =>
            s.toLowerCase().includes(text.toLowerCase()) && !zones.includes(s),
        )
        .slice(0, 8),
    [suggestions, text, zones],
  );

  const addZone = (z: string) => {
    const trimmed = z.trim();
    if (!trimmed || zones.includes(trimmed)) return;
    onChange([...zones, trimmed]);
    setText("");
  };

  const removeZone = (z: string) => onChange(zones.filter((v) => v !== z));

  return (
    <div className="flex items-center gap-1.5 flex-wrap text-xs">
      {zones.map((z) => (
        <Badge
          key={z}
          variant="secondary"
          className="text-xs gap-1 pl-2 pr-1"
        >
          {z}
          <button
            type="button"
            aria-label={`Remove ${z}`}
            onClick={() => removeZone(z)}
            className="hover:bg-background/50 rounded-sm"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setText(""); }}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
          >
            <Plus className="h-3 w-3 mr-1" />
            {t("treatments.addZone", "Add zone")}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[260px] p-0" align="start">
          <Command>
            <CommandInput
              placeholder={t("treatments.searchOrAddZone", "Search or add…")}
              value={text}
              onValueChange={setText}
              onKeyDown={(e) => {
                if (e.key === "Enter" && text.trim()) {
                  e.preventDefault();
                  addZone(text);
                  setOpen(false);
                }
              }}
            />
            <CommandList>
              {filtered.length === 0 && text && (
                <CommandItem onSelect={() => { addZone(text); setOpen(false); }}>
                  {t("treatments.addValue", 'Add "{{value}}"', { value: text })}
                </CommandItem>
              )}
              {filtered.map((s) => (
                <CommandItem key={s} onSelect={() => { addZone(s); setOpen(false); }}>
                  {s}
                </CommandItem>
              ))}
              {filtered.length === 0 && !text && (
                <CommandEmpty>
                  {t("treatments.typeToSearchOrAdd", "Type to search or add…")}
                </CommandEmpty>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {notes && (
        <span className="text-muted-foreground truncate max-w-[40ch] ml-2">
          {notes}
        </span>
      )}
    </div>
  );
}

function ServiceCell({
  value,
  services,
  onPick,
}: {
  value: string | null;
  services: Service[];
  onPick: (s: Service | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? services.find((s) => s.id === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between"
        >
          <span className="truncate">
            {selected?.name ?? t("treatments.pickService", "Pick a service…")}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={t("treatments.pickService", "Pick a service…")}
          />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  onSelect={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  {t("common.clear", "Clear")}
                </CommandItem>
              )}
              {services.map((s) => (
                <CommandItem
                  key={s.id}
                  value={s.name}
                  onSelect={() => {
                    onPick(s);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === s.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {s.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ProductCell({
  value,
  items,
  onPick,
}: {
  value: string | null;
  items: Item[];
  onPick: (it: Item | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = value ? items.find((i) => i.id === value) : null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between"
        >
          <span className="truncate">
            {selected?.name ?? t("treatments.pickProduct", "Pick a product…")}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={t("treatments.pickProduct", "Pick a product…")}
          />
          <CommandList>
            <CommandEmpty>—</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  onSelect={() => {
                    onPick(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  {t("common.clear", "Clear")}
                </CommandItem>
              )}
              {items.map((i) => (
                <CommandItem
                  key={i.id}
                  value={i.name}
                  onSelect={() => {
                    onPick(i);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === i.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {i.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function LotCell({
  line,
  lots,
  onPickLot,
  onClearLot,
  onTypeBatch,
}: {
  line: Partial<TreatmentLine>;
  lots: Lot[];
  onPickLot: (l: Lot) => void;
  onClearLot: () => void;
  onTypeBatch: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = line.lotId ? lots.find((l) => l.id === line.lotId) : null;
  const itemPicked = !!line.itemId;

  // No item picked yet → disabled placeholder
  if (!itemPicked) {
    return (
      <Input
        disabled
        value=""
        placeholder={t("treatments.pickProductFirst", "Pick product first")}
        className="h-8"
      />
    );
  }

  // No known lots → free text only
  if (lots.length === 0) {
    return (
      <Input
        value={line.lotNumber ?? ""}
        placeholder={t("treatments.typeBatchNumber", "Batch number (optional)")}
        className="h-8"
        onChange={(e) => onTypeBatch(e.target.value)}
      />
    );
  }

  // Known lots → combobox + free-text fallback as a CommandItem
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-8 w-full justify-between"
        >
          <span className="truncate">
            {selected
              ? `${selected.lotNumber}${
                  selected.expiryDate ? ` — ${formatDate(selected.expiryDate)}` : ""
                }`
              : line.lotNumber ||
                t("treatments.pickLot", "Pick a lot…")}
          </span>
          <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={t(
              "treatments.searchLots",
              "Search lots or type batch…",
            )}
            value={line.lotNumber ?? ""}
            onValueChange={onTypeBatch}
          />
          <CommandList>
            <CommandEmpty>{t("treatments.noLot", "No lots found.")}</CommandEmpty>
            <CommandGroup>
              {line.lotId && (
                <CommandItem
                  onSelect={() => {
                    onClearLot();
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  {t("common.clear", "Clear")}
                </CommandItem>
              )}
              {lots.map((l) => (
                <CommandItem
                  key={l.id}
                  value={l.lotNumber}
                  onSelect={() => {
                    onPickLot(l);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      line.lotId === l.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {l.lotNumber}
                  {l.expiryDate && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {formatDate(l.expiryDate)}
                    </span>
                  )}
                  {l.qty != null && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      qty {l.qty}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
