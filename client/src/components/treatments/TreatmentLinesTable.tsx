import { useState } from "react";
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
import { ChevronsUpDown, Check, Pencil, Trash2 } from "lucide-react";
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
  onChangeLine: (index: number, patch: Partial<TreatmentLine>) => void;
  onRemoveLine: (index: number) => void;
  onEditFull: (index: number) => void;
  onItemSelect?: (itemId: string | null) => void;
}

export function TreatmentLinesTable({
  lines,
  services,
  items,
  lotsByItem,
  isLocked,
  onChangeLine,
  onRemoveLine,
  onEditFull,
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b">
            <th className="py-2 pr-2 font-medium">
              {t("treatments.service", "Service (Anwendung)")}
            </th>
            <th className="py-2 pr-2 font-medium">
              {t("treatments.product", "Product (Präparat)")}
            </th>
            <th className="py-2 pr-2 font-medium">
              {t("treatments.lot", "Lot / Charge")}
            </th>
            <th className="py-2 pr-2 font-medium w-32">
              {t("treatments.dose", "Dose")}
            </th>
            <th className="py-2 pr-2 font-medium w-28 text-right">
              {t("treatments.price", "Price")}
            </th>
            {!isLocked && <th className="py-2 w-16" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <LineRow
              key={index}
              index={index}
              line={line}
              services={services}
              items={items}
              lotsByItem={lotsByItem}
              isLocked={isLocked}
              onChangeLine={onChangeLine}
              onRemoveLine={onRemoveLine}
              onEditFull={onEditFull}
              onItemSelect={onItemSelect}
            />
          ))}
        </tbody>
      </table>
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
  onChangeLine: (index: number, patch: Partial<TreatmentLine>) => void;
  onRemoveLine: (index: number) => void;
  onEditFull: (index: number) => void;
  onItemSelect?: (itemId: string | null) => void;
}

function LineRow({
  index,
  line,
  services,
  items,
  lotsByItem,
  isLocked,
  onChangeLine,
  onRemoveLine,
  onEditFull,
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
      <>
        <tr className="border-b last:border-b-0">
          <td className="py-2 pr-2">{service?.name ?? "—"}</td>
          <td className="py-2 pr-2">{item?.name ?? "—"}</td>
          <td className="py-2 pr-2">
            {lot ? lot.lotNumber : line.lotNumber || "—"}
          </td>
          <td className="py-2 pr-2">
            {line.dose || "—"}
            {line.doseUnit ? ` ${line.doseUnit}` : ""}
          </td>
          <td className="py-2 pr-2 text-right">
            {line.total ? formatCurrency(line.total as string) : "—"}
          </td>
        </tr>
        {(zones.length > 0 || line.notes) && (
          <PreviewRow zones={zones} notes={line.notes} colSpan={5} />
        )}
      </>
    );
  }

  return (
    <>
      <tr className="border-b last:border-b-0">
        <td className="py-2 pr-2">
          <ServiceCell
            value={line.serviceId ?? null}
            services={services}
            onPick={(s) => onChangeLine(index, pickServicePatch(line, s))}
          />
        </td>
        <td className="py-2 pr-2">
          <ProductCell
            value={line.itemId ?? null}
            items={items}
            onPick={(it) => {
              onChangeLine(index, pickItemPatch(line, it));
              onItemSelect?.(it?.id ?? null);
            }}
          />
        </td>
        <td className="py-2 pr-2">
          <LotCell
            line={line}
            lots={lots}
            onPickLot={(l) =>
              onChangeLine(index, {
                lotId: l.id,
                lotNumber: undefined,
              })
            }
            onClearLot={() =>
              onChangeLine(index, { lotId: undefined, lotNumber: undefined })
            }
            onTypeBatch={(value) =>
              onChangeLine(index, { lotId: undefined, lotNumber: value })
            }
          />
        </td>
        <td className="py-2 pr-2">
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
              onChange={(e) =>
                onChangeLine(index, { doseUnit: e.target.value })
              }
            />
          </div>
        </td>
        <td className="py-2 pr-2">
          <Input
            value={(line.total as string) ?? ""}
            placeholder="0.00"
            className="h-8 w-24 text-right"
            onChange={(e) => onChangeLine(index, { total: e.target.value })}
          />
        </td>
        <td className="py-2">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label={t("treatments.editLineAria", "Edit line in dialog")}
              onClick={() => onEditFull(index)}
            >
              <Pencil className="h-3 w-3" />
            </Button>
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
        </td>
      </tr>
      {(zones.length > 0 || line.notes) && (
        <PreviewRow zones={zones} notes={line.notes} colSpan={6} />
      )}
    </>
  );
}

function PreviewRow({
  zones,
  notes,
  colSpan,
}: {
  zones: string[];
  notes?: string | null;
  colSpan: number;
}) {
  return (
    <tr className="border-b last:border-b-0">
      <td colSpan={colSpan} className="py-1 pr-2 pl-2">
        <div className="flex items-center gap-1 flex-wrap text-xs">
          {zones.map((z) => (
            <Badge key={z} variant="secondary" className="text-xs">
              {z}
            </Badge>
          ))}
          {notes && (
            <span className="text-muted-foreground truncate max-w-[40ch]">
              {notes}
            </span>
          )}
        </div>
      </td>
    </tr>
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
