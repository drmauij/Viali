import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { TreatmentItemConfig } from "@shared/schema";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hospitalId: string;
  unitId?: string | null;
  initial?: TreatmentItemConfig;
}

export function TreatmentItemConfigDialog({
  open,
  onOpenChange,
  hospitalId,
  unitId,
  initial,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [itemId, setItemId] = useState(initial?.itemId ?? "");
  const [serviceId, setServiceId] = useState(initial?.defaultServiceId ?? "");
  const [dose, setDose] = useState(initial?.defaultDose ?? "");
  const [doseUnit, setDoseUnit] = useState(initial?.defaultDoseUnit ?? "");
  const [zones, setZones] = useState<string[]>(
    (initial?.defaultZones as string[]) ?? [],
  );
  const [onDemandOnly, setOnDemandOnly] = useState(
    initial?.onDemandOnly ?? false,
  );

  // Combobox open states
  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);
  const [servicePopoverOpen, setServicePopoverOpen] = useState(false);

  const { data: items = [] } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: [`/api/items/${hospitalId}?module=treatment`],
    enabled: !!hospitalId && open,
  });

  const { data: services = [] } = useQuery<
    { id: string; name: string }[]
  >({
    queryKey: ["clinic-services", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/clinic/${hospitalId}/services`).then((r) =>
        r.json(),
      ),
    enabled: !!hospitalId && open,
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/treatments/configs", {
        hospitalId,
        unitId: unitId ?? null,
        itemId,
        defaultServiceId: serviceId || null,
        defaultDose: dose || null,
        defaultDoseUnit: doseUnit || null,
        defaultZones: zones,
        sortOrder: initial?.sortOrder ?? 0,
        onDemandOnly,
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["treatment-configs", hospitalId] });
      toast({
        title: initial
          ? t("treatments.configUpdated", "Palette item updated")
          : t("treatments.configAdded", "Palette item added"),
      });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({
        variant: "destructive",
        title: t("treatments.configSaveFailed", "Save failed"),
        description: err.message,
      });
    },
  });

  const selectedItem = items.find((i) => i.id === itemId);
  const selectedService = services.find((s) => s.id === serviceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {initial
              ? t("treatments.editPaletteItem", "Edit Palette Item")
              : t("treatments.addPaletteItem", "Add Palette Item")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Item picker */}
          <div className="space-y-1.5">
            <Label>{t("treatments.fields.item", "Product (Präparat)")}</Label>
            <Popover open={itemPopoverOpen} onOpenChange={setItemPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedItem?.name ?? t("common.select", "Select…")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("common.search", "Search…")} />
                  <CommandList>
                    <CommandEmpty>{t("common.noResults", "No results")}</CommandEmpty>
                    <CommandGroup>
                      {items.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={item.name}
                          onSelect={() => {
                            setItemId(item.id);
                            setItemPopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              itemId === item.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          {item.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Service picker */}
          <div className="space-y-1.5">
            <Label>{t("treatments.fields.service", "Service (Anwendung)")}</Label>
            <Popover
              open={servicePopoverOpen}
              onOpenChange={setServicePopoverOpen}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  {selectedService?.name ?? t("common.none", "None")}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("common.search", "Search…")} />
                  <CommandList>
                    <CommandEmpty>{t("common.noResults", "No results")}</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value=""
                        onSelect={() => {
                          setServiceId("");
                          setServicePopoverOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-4 w-4",
                            !serviceId ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {t("common.none", "None")}
                      </CommandItem>
                      {services.map((svc) => (
                        <CommandItem
                          key={svc.id}
                          value={svc.name}
                          onSelect={() => {
                            setServiceId(svc.id);
                            setServicePopoverOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              serviceId === svc.id
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          {svc.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Dose + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t("treatments.fields.dose", "Dose")}</Label>
              <Input
                value={dose}
                onChange={(e) => setDose(e.target.value)}
                placeholder="e.g. 20"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t("treatments.fields.doseUnit", "Unit")}</Label>
              <Input
                value={doseUnit}
                onChange={(e) => setDoseUnit(e.target.value)}
                placeholder="e.g. units"
              />
            </div>
          </div>

          {/* Zones */}
          <div className="space-y-1.5">
            <Label>{t("treatments.fields.zones", "Zones")}</Label>
            <ZonesChipInput value={zones} onChange={setZones} />
          </div>

          {/* On-demand only */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="onDemandOnly"
              checked={onDemandOnly}
              onCheckedChange={(v) => setOnDemandOnly(!!v)}
            />
            <Label htmlFor="onDemandOnly" className="font-normal cursor-pointer">
              {t(
                "treatments.onDemandOnly",
                "Hide from quick palette (on-demand only)",
              )}
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button
            disabled={!itemId || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {t("common.save", "Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
