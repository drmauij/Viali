import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { Plus, Pill, Trash2, Loader2, Check, ChevronsUpDown, AlertTriangle, Package, User, Calendar, X, Search } from "lucide-react";
import SignaturePad from "@/components/SignaturePad";
import { formatDate } from "@/lib/dateUtils";

interface DischargeMedicationsTabProps {
  patientId: string;
  hospitalId: string;
  unitId: string;
  patientName?: string;
  patientBirthday?: string;
  canWrite?: boolean;
}

interface MedicationItemEntry {
  itemId: string;
  itemName: string;
  quantity: number;
  unitType: "pills" | "packs";
  administrationRoute: string;
  frequency: string;
  notes: string;
  endPrice: string;
  isControlled: boolean;
}

const ADMINISTRATION_ROUTES = [
  { value: "p.o.", label: "p.o. (oral)" },
  { value: "s.c.", label: "s.c. (subcutaneous)" },
  { value: "i.v.", label: "i.v. (intravenous)" },
  { value: "i.m.", label: "i.m. (intramuscular)" },
  { value: "rectal", label: "rectal" },
  { value: "topical", label: "topical" },
  { value: "inhalation", label: "inhalation" },
  { value: "sublingual", label: "sublingual" },
  { value: "nasal", label: "nasal" },
];

const FREQUENCY_PRESETS = [
  { value: "1-0-0-0", label: "1-0-0-0 (morning)" },
  { value: "1-0-1-0", label: "1-0-1-0 (morning + evening)" },
  { value: "1-1-1-0", label: "1-1-1-0 (3x daily)" },
  { value: "1-1-1-1", label: "1-1-1-1 (4x daily)" },
  { value: "0-0-0-1", label: "0-0-0-1 (night)" },
  { value: "0-0-1-0", label: "0-0-1-0 (evening)" },
  { value: "1-0-0-1", label: "1-0-0-1 (morning + night)" },
  { value: "0-1-0-0", label: "0-1-0-0 (midday)" },
  { value: "prn", label: "PRN (as needed)" },
];

export function DischargeMedicationsTab({
  patientId,
  hospitalId,
  unitId,
  patientName,
  patientBirthday,
  canWrite = true,
}: DischargeMedicationsTabProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user } = useAuth();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [deleteSlotId, setDeleteSlotId] = useState<string | null>(null);
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [slotNotes, setSlotNotes] = useState("");
  const [medicationItems, setMedicationItems] = useState<MedicationItemEntry[]>([]);
  const [itemSearchOpen, setItemSearchOpen] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [doctorSearchOpen, setDoctorSearchOpen] = useState(false);

  const [showSignaturePad, setShowSignaturePad] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState(false);

  const [routeCustomInput, setRouteCustomInput] = useState<Record<number, boolean>>({});
  const [frequencyCustomInput, setFrequencyCustomInput] = useState<Record<number, boolean>>({});

  const { data: dischargeMedications = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/patients', patientId, 'discharge-medications', hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/patients/${patientId}/discharge-medications?hospitalId=${hospitalId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch discharge medications");
      return res.json();
    },
    enabled: !!patientId && !!hospitalId,
  });

  const { data: inventoryItems = [] } = useQuery<any[]>({
    queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`],
    enabled: !!hospitalId && !!unitId,
  });

  const { data: doctors = [] } = useQuery<any[]>({
    queryKey: ['/api/hospitals', hospitalId, 'doctors'],
    queryFn: async () => {
      const res = await fetch(`/api/hospitals/${hospitalId}/doctors`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch doctors");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const filteredItems = useMemo(() => {
    if (!itemSearchQuery.trim()) return inventoryItems.slice(0, 50);
    const query = itemSearchQuery.toLowerCase();
    return inventoryItems
      .filter((item: any) => 
        item.name?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
      )
      .slice(0, 50);
  }, [inventoryItems, itemSearchQuery]);

  const selectedDoctor = doctors.find((d: any) => d.id === selectedDoctorId);

  const createMutation = useMutation({
    mutationFn: async (data: { signature: string | null }) => {
      return apiRequest("POST", `/api/patients/${patientId}/discharge-medications`, {
        hospitalId,
        doctorId: selectedDoctorId || null,
        notes: slotNotes || null,
        signature: data.signature,
        createdBy: (user as any)?.id || null,
        items: medicationItems.map(item => ({
          itemId: item.itemId,
          quantity: item.quantity,
          unitType: item.unitType,
          administrationRoute: item.administrationRoute || null,
          frequency: item.frequency || null,
          notes: item.notes || null,
          endPrice: item.endPrice ? item.endPrice : null,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.saved', 'Discharge medications saved successfully') });
      resetForm();
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/discharge-medications/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patients', patientId, 'discharge-medications'] });
      queryClient.invalidateQueries({ queryKey: [`/api/items/${hospitalId}?unitId=${unitId}`] });
      toast({ title: t('dischargeMedications.deleted', 'Discharge medication entry deleted and inventory restored') });
      setDeleteSlotId(null);
    },
    onError: (error: any) => {
      toast({ title: t('common.error', 'Error'), description: error.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setSelectedDoctorId("");
    setSlotNotes("");
    setMedicationItems([]);
    setSignature(null);
    setPendingSave(false);
    setRouteCustomInput({});
    setFrequencyCustomInput({});
  };

  const addMedicationItem = (item: any) => {
    if (medicationItems.some(m => m.itemId === item.id)) {
      toast({ title: t('dischargeMedications.alreadyAdded', 'This item is already added'), variant: "destructive" });
      return;
    }
    setMedicationItems(prev => [...prev, {
      itemId: item.id,
      itemName: item.name,
      quantity: 1,
      unitType: "packs",
      administrationRoute: "p.o.",
      frequency: "1-0-1-0",
      notes: "",
      endPrice: item.patientPrice || "",
      isControlled: item.controlled || false,
    }]);
    setItemSearchOpen(false);
    setItemSearchQuery("");
  };

  const updateMedicationItem = (index: number, updates: Partial<MedicationItemEntry>) => {
    setMedicationItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item));
  };

  const removeMedicationItem = (index: number) => {
    setMedicationItems(prev => prev.filter((_, i) => i !== index));
  };

  const hasControlledItems = medicationItems.some(item => item.isControlled);

  const handleSave = () => {
    if (medicationItems.length === 0) {
      toast({ title: t('dischargeMedications.noItems', 'Please add at least one medication'), variant: "destructive" });
      return;
    }

    if (hasControlledItems && !signature) {
      setPendingSave(true);
      setShowSignaturePad(true);
      return;
    }

    createMutation.mutate({ signature });
  };

  const handleSignatureSave = (sig: string) => {
    setSignature(sig);
    setShowSignaturePad(false);
    if (pendingSave) {
      setPendingSave(false);
      createMutation.mutate({ signature: sig });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-discharge-medications" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button
            onClick={() => { resetForm(); setIsCreateDialogOpen(true); }}
            data-testid="button-add-discharge-medication"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t('dischargeMedications.addNew', 'Add Discharge Medications')}
          </Button>
        </div>
      )}

      {dischargeMedications.length > 0 ? (
        <div className="space-y-4">
          {dischargeMedications.map((slot: any) => (
            <Card key={slot.id} data-testid={`discharge-medication-slot-${slot.id}`}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Pill className="h-5 w-5" />
                    {t('dischargeMedications.slotTitle', 'Discharge Medications')}
                    <Badge variant="secondary">{slot.items?.length || 0}</Badge>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {slot.signature && (
                      <Badge variant="outline" className="text-amber-600 border-amber-300">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {t('dischargeMedications.signedControlled', 'Signed (controlled)')}
                      </Badge>
                    )}
                    {canWrite && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteSlotId(slot.id)}
                        data-testid={`button-delete-slot-${slot.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mt-1">
                  {slot.doctor && (
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Dr. {slot.doctor.firstName} {slot.doctor.lastName}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {formatDate(slot.createdAt)}
                  </span>
                </div>
                {slot.notes && (
                  <p className="text-sm text-muted-foreground mt-1 italic">{slot.notes}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {slot.items?.map((medItem: any) => (
                    <div
                      key={medItem.id}
                      className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 bg-muted/50 rounded-lg border"
                      data-testid={`discharge-med-item-${medItem.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{medItem.item?.name || medItem.itemId}</span>
                          {medItem.item?.controlled && (
                            <Badge variant="destructive" className="text-xs shrink-0">
                              {t('dischargeMedications.controlled', 'Controlled')}
                            </Badge>
                          )}
                        </div>
                        {medItem.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{medItem.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-sm shrink-0">
                        <Badge variant="outline">
                          {medItem.quantity} {medItem.unitType === 'pills' ? t('dischargeMedications.pills', 'pills') : t('dischargeMedications.packs', 'packs')}
                        </Badge>
                        {medItem.administrationRoute && (
                          <Badge variant="secondary">{medItem.administrationRoute}</Badge>
                        )}
                        {medItem.frequency && (
                          <Badge variant="secondary">{medItem.frequency}</Badge>
                        )}
                        {medItem.endPrice && (
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            CHF {parseFloat(medItem.endPrice).toFixed(2)}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <Pill className="h-12 w-12 text-muted-foreground" data-testid="icon-no-discharge-medications" />
              <p className="text-foreground font-semibold" data-testid="text-no-discharge-medications">
                {t('dischargeMedications.noMedications', 'No discharge medications')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t('dischargeMedications.noMedicationsDesc', 'Medications given to the patient at discharge will appear here.')}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { if (!open) { resetForm(); } setIsCreateDialogOpen(open); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle data-testid="dialog-title-discharge-medications">
              <Pill className="h-5 w-5 inline mr-2" />
              {t('dischargeMedications.createTitle', 'Add Discharge Medications')}
            </DialogTitle>
            <DialogDescription>
              {t('dischargeMedications.createDesc', 'Select medications to give the patient at discharge. Inventory will be deducted automatically.')}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 max-h-[60vh] pr-4">
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('dischargeMedications.responsibleDoctor', 'Responsible Doctor')}</Label>
                  <Popover open={doctorSearchOpen} onOpenChange={setDoctorSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between"
                        data-testid="select-doctor"
                      >
                        {selectedDoctor
                          ? `Dr. ${selectedDoctor.firstName} ${selectedDoctor.lastName}`
                          : t('dischargeMedications.selectDoctor', 'Select doctor...')
                        }
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t('dischargeMedications.searchDoctor', 'Search doctor...')} />
                        <CommandList>
                          <CommandEmpty>{t('dischargeMedications.noDoctor', 'No doctor found')}</CommandEmpty>
                          <CommandGroup>
                            {doctors.map((doc: any) => (
                              <CommandItem
                                key={doc.id}
                                value={`${doc.firstName} ${doc.lastName}`}
                                onSelect={() => {
                                  setSelectedDoctorId(doc.id);
                                  setDoctorSearchOpen(false);
                                }}
                                data-testid={`doctor-option-${doc.id}`}
                              >
                                <Check className={cn("mr-2 h-4 w-4", selectedDoctorId === doc.id ? "opacity-100" : "opacity-0")} />
                                Dr. {doc.firstName} {doc.lastName}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>{t('dischargeMedications.slotNotes', 'Notes (e.g. practice name)')}</Label>
                  <Input
                    value={slotNotes}
                    onChange={(e) => setSlotNotes(e.target.value)}
                    placeholder={t('dischargeMedications.slotNotesPlaceholder', 'Practice name, additional info...')}
                    data-testid="input-slot-notes"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-base font-semibold">
                    {t('dischargeMedications.medications', 'Medications')}
                    {medicationItems.length > 0 && (
                      <Badge variant="secondary" className="ml-2">{medicationItems.length}</Badge>
                    )}
                  </Label>
                  <Popover open={itemSearchOpen} onOpenChange={setItemSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-add-medication-item">
                        <Plus className="h-4 w-4 mr-1" />
                        {t('dischargeMedications.addMedication', 'Add Medication')}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="end">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder={t('dischargeMedications.searchMedication', 'Search medication...')}
                          value={itemSearchQuery}
                          onValueChange={setItemSearchQuery}
                        />
                        <CommandList>
                          <CommandEmpty>{t('dischargeMedications.noMedicationFound', 'No medication found')}</CommandEmpty>
                          <CommandGroup>
                            {filteredItems.map((item: any) => (
                              <CommandItem
                                key={item.id}
                                value={item.name}
                                onSelect={() => addMedicationItem(item)}
                                data-testid={`medication-option-${item.id}`}
                              >
                                <div className="flex items-center gap-2 w-full">
                                  <div className="flex-1 min-w-0">
                                    <span className="truncate block">{item.name}</span>
                                    {item.description && (
                                      <span className="text-xs text-muted-foreground truncate block">{item.description}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {item.controlled && (
                                      <Badge variant="destructive" className="text-xs">BTM</Badge>
                                    )}
                                    {item.patientPrice && (
                                      <span className="text-xs text-muted-foreground">CHF {parseFloat(item.patientPrice).toFixed(2)}</span>
                                    )}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {medicationItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">{t('dischargeMedications.noItemsYet', 'No medications added yet. Use the button above to search and add.')}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {medicationItems.map((medItem, index) => (
                      <Card key={medItem.itemId} className={cn("relative", medItem.isControlled && "border-amber-300 dark:border-amber-700")} data-testid={`medication-entry-${index}`}>
                        <CardContent className="pt-4 pb-3 px-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{medItem.itemName}</span>
                              {medItem.isControlled && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {t('dischargeMedications.controlled', 'Controlled')}
                                </Badge>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => removeMedicationItem(index)}
                              data-testid={`button-remove-medication-${index}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.quantity', 'Quantity')}</Label>
                              <Input
                                type="number"
                                min={1}
                                value={medItem.quantity}
                                onChange={(e) => updateMedicationItem(index, { quantity: parseInt(e.target.value) || 1 })}
                                data-testid={`input-quantity-${index}`}
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.unitType', 'Unit')}</Label>
                              <Select
                                value={medItem.unitType}
                                onValueChange={(value) => updateMedicationItem(index, { unitType: value as "pills" | "packs" })}
                              >
                                <SelectTrigger data-testid={`select-unit-type-${index}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pills">{t('dischargeMedications.pills', 'Pills')}</SelectItem>
                                  <SelectItem value="packs">{t('dischargeMedications.packs', 'Packs')}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.route', 'Route')}</Label>
                              {routeCustomInput[index] ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={medItem.administrationRoute}
                                    onChange={(e) => updateMedicationItem(index, { administrationRoute: e.target.value })}
                                    placeholder="Custom..."
                                    data-testid={`input-route-custom-${index}`}
                                  />
                                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setRouteCustomInput(prev => ({ ...prev, [index]: false }))}>
                                    <ChevronsUpDown className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Select
                                  value={ADMINISTRATION_ROUTES.some(r => r.value === medItem.administrationRoute) ? medItem.administrationRoute : "__custom__"}
                                  onValueChange={(value) => {
                                    if (value === "__custom__") {
                                      setRouteCustomInput(prev => ({ ...prev, [index]: true }));
                                      updateMedicationItem(index, { administrationRoute: "" });
                                    } else {
                                      updateMedicationItem(index, { administrationRoute: value });
                                    }
                                  }}
                                >
                                  <SelectTrigger data-testid={`select-route-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ADMINISTRATION_ROUTES.map(route => (
                                      <SelectItem key={route.value} value={route.value}>{route.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">{t('dischargeMedications.customRoute', '✏️ Custom...')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.frequency', 'Frequency')}</Label>
                              {frequencyCustomInput[index] ? (
                                <div className="flex gap-1">
                                  <Input
                                    value={medItem.frequency}
                                    onChange={(e) => updateMedicationItem(index, { frequency: e.target.value })}
                                    placeholder="Custom..."
                                    data-testid={`input-frequency-custom-${index}`}
                                  />
                                  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setFrequencyCustomInput(prev => ({ ...prev, [index]: false }))}>
                                    <ChevronsUpDown className="h-3 w-3" />
                                  </Button>
                                </div>
                              ) : (
                                <Select
                                  value={FREQUENCY_PRESETS.some(f => f.value === medItem.frequency) ? medItem.frequency : "__custom__"}
                                  onValueChange={(value) => {
                                    if (value === "__custom__") {
                                      setFrequencyCustomInput(prev => ({ ...prev, [index]: true }));
                                      updateMedicationItem(index, { frequency: "" });
                                    } else {
                                      updateMedicationItem(index, { frequency: value });
                                    }
                                  }}
                                >
                                  <SelectTrigger data-testid={`select-frequency-${index}`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {FREQUENCY_PRESETS.map(freq => (
                                      <SelectItem key={freq.value} value={freq.value}>{freq.label}</SelectItem>
                                    ))}
                                    <SelectItem value="__custom__">{t('dischargeMedications.customFrequency', '✏️ Custom...')}</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.endPrice', 'End Price (CHF)')}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                value={medItem.endPrice}
                                onChange={(e) => updateMedicationItem(index, { endPrice: e.target.value })}
                                placeholder="0.00"
                                data-testid={`input-price-${index}`}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">{t('dischargeMedications.itemNotes', 'Note')}</Label>
                              <Input
                                value={medItem.notes}
                                onChange={(e) => updateMedicationItem(index, { notes: e.target.value })}
                                placeholder={t('dischargeMedications.itemNotesPlaceholder', 'Additional notes...')}
                                data-testid={`input-item-notes-${index}`}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {hasControlledItems && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <Label className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        {t('dischargeMedications.controlledWarning', 'Controlled substances require signature')}
                      </Label>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                      <div className="space-y-1">
                        {medicationItems.filter(m => m.isControlled).map((m, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="font-medium">{m.itemName}</span>
                            <Badge variant="outline">{m.quantity} {m.unitType}</Badge>
                          </div>
                        ))}
                      </div>
                      {(patientName || patientBirthday) && (
                        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-800">
                          <p className="text-xs text-muted-foreground">
                            {t('dischargeMedications.patient', 'Patient')}: <strong>{patientName}</strong>
                            {patientBirthday && ` (${patientBirthday})`}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <span className="text-sm font-medium">
                        {t('dischargeMedications.signatureRequired', 'Signature required for controlled items')}
                      </span>
                      {signature ? (
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-green-600 border-green-300">
                            <Check className="h-3 w-3 mr-1" />
                            {t('dischargeMedications.signed', 'Signed')}
                          </Badge>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowSignaturePad(true)}
                            data-testid="button-change-signature"
                          >
                            {t('common.edit', 'Edit')}
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => setShowSignaturePad(true)}
                          data-testid="button-sign-discharge"
                        >
                          {t('dischargeMedications.signHere', 'Sign here')}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => { resetForm(); setIsCreateDialogOpen(false); }}
              disabled={createMutation.isPending}
              data-testid="button-cancel-discharge"
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || medicationItems.length === 0 || (hasControlledItems && !signature)}
              data-testid="button-save-discharge"
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('common.saving', 'Saving...')}</>
              ) : (
                <><Package className="h-4 w-4 mr-2" />{t('dischargeMedications.save', 'Save & Deduct Inventory')}</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteSlotId} onOpenChange={(open) => !open && setDeleteSlotId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dischargeMedications.deleteTitle', 'Delete Discharge Medications?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('dischargeMedications.deleteDesc', 'This will delete this medication entry and restore the deducted inventory quantities. This action cannot be undone.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteSlotId && deleteMutation.mutate(deleteSlotId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? t('common.deleting', 'Deleting...') : t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SignaturePad
        isOpen={showSignaturePad}
        onClose={() => { setShowSignaturePad(false); setPendingSave(false); }}
        onSave={handleSignatureSave}
        title={t('dischargeMedications.signatureRequired', 'Signature required for controlled items')}
      />
    </div>
  );
}