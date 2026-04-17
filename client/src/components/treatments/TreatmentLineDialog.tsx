import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { ZonesChipInput } from "./ZonesChipInput";
import { useTranslation } from "react-i18next";
import type { TreatmentLine } from "@shared/schema";

interface Service {
  id: string;
  name: string;
  price?: string | null;
}
interface Item {
  id: string;
  name: string;
  patientPrice?: string | null;
}
interface Lot {
  id: string;
  lotNumber: string;
  expiryDate?: string | null;
  qty?: number | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: Partial<TreatmentLine>;
  services: Service[];
  items: Item[];
  lotsByItem: Record<string, Lot[]>;
  zoneSuggestions: string[];
  onSave: (line: Partial<TreatmentLine>) => void;
}

export function TreatmentLineDialog({
  open,
  onOpenChange,
  initial,
  services,
  items,
  lotsByItem,
  zoneSuggestions,
  onSave,
}: Props) {
  const { t } = useTranslation();

  const [serviceId, setServiceId] = useState<string | null>(
    initial?.serviceId ?? null,
  );
  const [itemId, setItemId] = useState<string | null>(initial?.itemId ?? null);
  const [lotId, setLotId] = useState<string | null>(initial?.lotId ?? null);
  const [lotNumber, setLotNumber] = useState(initial?.lotNumber ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [doseUnit, setDoseUnit] = useState(initial?.doseUnit ?? "");
  const [zones, setZones] = useState<string[]>(
    (initial?.zones as string[]) ?? [],
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [unitPrice, setUnitPrice] = useState<string>(
    (initial?.unitPrice as string) ?? "",
  );
  const [total, setTotal] = useState<string>((initial?.total as string) ?? "");

  // Combobox open states
  const [serviceOpen, setServiceOpen] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [lotOpen, setLotOpen] = useState(false);

  // Auto-compute total when dose × unitPrice changes
  useEffect(() => {
    const n = parseFloat(dose);
    const p = parseFloat(unitPrice);
    if (Number.isFinite(n) && Number.isFinite(p)) {
      setTotal((n * p).toFixed(2));
    }
  }, [dose, unitPrice]);

  // Auto-fill price from item
  useEffect(() => {
    if (!itemId) return;
    const it = items.find((i) => i.id === itemId);
    if (it?.patientPrice && !unitPrice) setUnitPrice(it.patientPrice);
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill price from service (only if item hasn't set it)
  useEffect(() => {
    if (!serviceId || itemId) return;
    const s = services.find((x) => x.id === serviceId);
    if (s?.price && !unitPrice) setUnitPrice(s.price);
  }, [serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset state when dialog closes or initial changes
  useEffect(() => {
    if (open) {
      setServiceId(initial?.serviceId ?? null);
      setItemId(initial?.itemId ?? null);
      setLotId(initial?.lotId ?? null);
      setLotNumber(initial?.lotNumber ?? "");
      setDose(initial?.dose ?? "");
      setDoseUnit(initial?.doseUnit ?? "");
      setZones((initial?.zones as string[]) ?? []);
      setNotes(initial?.notes ?? "");
      setUnitPrice((initial?.unitPrice as string) ?? "");
      setTotal((initial?.total as string) ?? "");
    }
  }, [open, initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lotOptions = itemId ? (lotsByItem[itemId] ?? []) : [];

  const selectedService = services.find((s) => s.id === serviceId);
  const selectedItem = items.find((i) => i.id === itemId);
  const selectedLot = lotOptions.find((l) => l.id === lotId);

  const save = () => {
    if (!serviceId && !itemId) return;
    onSave({
      serviceId: serviceId ?? undefined,
      itemId: itemId ?? undefined,
      lotId: lotId ?? undefined,
      lotNumber: lotId ? undefined : lotNumber || undefined,
      dose: dose || undefined,
      doseUnit: doseUnit || undefined,
      zones,
      notes: notes || undefined,
      unitPrice: unitPrice as any,
      total: total as any,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initial?.id
              ? t("treatments.editLine", "Edit Line")
              : t("treatments.addLine", "Add Line")}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          {/* Service picker */}
          <div>
            <Label>{t("treatments.service", "Service (Anwendung)")}</Label>
            <Popover open={serviceOpen} onOpenChange={setServiceOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={serviceOpen}
                  className="w-full justify-between"
                >
                  {selectedService?.name ??
                    t("treatments.pickService", "Pick a service…")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search services…" />
                  <CommandList>
                    <CommandEmpty>No services found.</CommandEmpty>
                    <CommandGroup>
                      {serviceId && (
                        <CommandItem
                          onSelect={() => {
                            setServiceId(null);
                            setServiceOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          Clear selection
                        </CommandItem>
                      )}
                      {services.map((s) => (
                        <CommandItem
                          key={s.id}
                          value={s.name}
                          onSelect={() => {
                            setServiceId(s.id);
                            setServiceOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              serviceId === s.id
                                ? "opacity-100"
                                : "opacity-0",
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
          </div>

          {/* Item/product picker */}
          <div>
            <Label>{t("treatments.product", "Product (Präparat)")}</Label>
            <Popover open={itemOpen} onOpenChange={setItemOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={itemOpen}
                  className="w-full justify-between"
                >
                  {selectedItem?.name ??
                    t("treatments.pickProduct", "Pick a product…")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[300px] p-0">
                <Command>
                  <CommandInput placeholder="Search products…" />
                  <CommandList>
                    <CommandEmpty>No products found.</CommandEmpty>
                    <CommandGroup>
                      {itemId && (
                        <CommandItem
                          onSelect={() => {
                            setItemId(null);
                            setLotId(null);
                            setItemOpen(false);
                          }}
                          className="text-muted-foreground"
                        >
                          Clear selection
                        </CommandItem>
                      )}
                      {items.map((i) => (
                        <CommandItem
                          key={i.id}
                          value={i.name}
                          onSelect={() => {
                            setItemId(i.id);
                            setLotId(null);
                            setItemOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              itemId === i.id ? "opacity-100" : "opacity-0",
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
          </div>

          {/* Lot picker + free-text fallback */}
          <div className="space-y-1">
            <Label>{t("treatments.lot", "Lot / Charge")}</Label>
            {lotOptions.length > 0 && (
              <Popover open={lotOpen} onOpenChange={setLotOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={lotOpen}
                    className="w-full justify-between"
                    disabled={!itemId}
                  >
                    {selectedLot
                      ? `${selectedLot.lotNumber}${selectedLot.expiryDate ? ` — exp ${selectedLot.expiryDate.slice(0, 10)}` : ""}`
                      : t("treatments.pickLot", "Pick a lot…")}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0">
                  <Command>
                    <CommandInput placeholder="Search lots…" />
                    <CommandList>
                      <CommandEmpty>No lots found.</CommandEmpty>
                      <CommandGroup>
                        {lotId && (
                          <CommandItem
                            onSelect={() => {
                              setLotId(null);
                              setLotOpen(false);
                            }}
                            className="text-muted-foreground"
                          >
                            Clear lot
                          </CommandItem>
                        )}
                        {lotOptions.map((l) => (
                          <CommandItem
                            key={l.id}
                            value={l.lotNumber}
                            onSelect={() => {
                              setLotId(l.id);
                              setLotNumber("");
                              setLotOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                lotId === l.id ? "opacity-100" : "opacity-0",
                              )}
                            />
                            {l.lotNumber}
                            {l.expiryDate && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                exp {l.expiryDate.slice(0, 10)}
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
            )}
            <Input
              value={lotId ? (selectedLot?.lotNumber ?? "") : lotNumber}
              onChange={(e) => {
                setLotNumber(e.target.value);
                setLotId(null);
              }}
              placeholder={
                lotOptions.length > 0
                  ? t("treatments.orTypeBatchNumber", "Or type batch number…")
                  : t("treatments.typeBatchNumber", "Batch number (optional)")
              }
              disabled={!!lotId}
            />
          </div>

          {/* Dose + unit */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t("treatments.dose", "Dose")}</Label>
              <Input
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="15"
              />
            </div>
            <div>
              <Label>{t("treatments.unit", "Unit")}</Label>
              <Input
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value)}
                placeholder={t("treatments.unitPlaceholder", "units")}
              />
            </div>
          </div>

          {/* Zones */}
          <div className="col-span-2">
            <Label>{t("treatments.zones", "Zones")}</Label>
            <ZonesChipInput
              value={zones}
              onChange={setZones}
              suggestions={zoneSuggestions}
            />
          </div>

          {/* Unit price + total */}
          <div>
            <Label>{t("treatments.unitPrice", "Unit price")}</Label>
            <Input
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label>{t("treatments.total", "Total")}</Label>
            <Input
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div className="col-span-2">
            <Label>
              {t("treatments.notes", "Notes (Besonderheiten)")}
            </Label>
            <Textarea
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={save} disabled={!serviceId && !itemId}>
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
