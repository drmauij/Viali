import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Pencil, Loader2, ArrowLeft, Save, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// ==================== Types ====================

interface TardocTemplate {
  id: string;
  name: string;
  billingModel: string | null;
  lawType: string | null;
  treatmentType: string | null;
  treatmentReason: string | null;
  isDefault: boolean | null;
  items: TemplateItem[];
}

interface TemplateItem {
  tardocCode: string;
  description: string;
  taxPoints: string | null;
  scalingFactor: string | null;
  sideCode: string | null;
  quantity: number;
}

interface TardocCode {
  id: string;
  code: string;
  descriptionDe: string;
  taxPoints: string | null;
  medicalInterpretation: string | null;
  technicalInterpretation: string | null;
  durationMinutes: number | null;
  sideCode: string | null;
}

interface TardocTemplateManagerProps {
  hospitalId: string;
  open: boolean;
  onClose: () => void;
}

// ==================== Editable line item type ====================

interface EditableLineItem {
  key: string; // stable key for React
  tardocCode: string;
  description: string;
  taxPoints: string;
  scalingFactor: string;
  sideCode: string;
  quantity: number;
}

function createEmptyLine(): EditableLineItem {
  return {
    key: crypto.randomUUID(),
    tardocCode: "",
    description: "",
    taxPoints: "",
    scalingFactor: "1.00",
    sideCode: "",
    quantity: 1,
  };
}

// ==================== Component ====================

export default function TardocTemplateManager({ hospitalId, open, onClose }: TardocTemplateManagerProps) {
  const { toast } = useToast();

  // View state: "list" or "form"
  const [view, setView] = useState<"list" | "form">("list");
  const [editingTemplate, setEditingTemplate] = useState<TardocTemplate | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [billingModel, setBillingModel] = useState<string>("");
  const [lawType, setLawType] = useState<string>("");
  const [treatmentType, setTreatmentType] = useState<string>("");
  const [treatmentReason, setTreatmentReason] = useState<string>("");
  const [isDefault, setIsDefault] = useState(false);
  const [lineItems, setLineItems] = useState<EditableLineItem[]>([]);

  // ==================== Data queries ====================

  const { data: templates = [], isLoading } = useQuery<TardocTemplate[]>({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-templates`],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-templates`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: open && !!hospitalId,
  });

  // ==================== Mutations ====================

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', `/api/clinic/${hospitalId}/tardoc-templates`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-templates`] });
      toast({ title: "Template created", description: "Template saved successfully" });
      resetFormAndGoToList();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create template", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiRequest('PATCH', `/api/clinic/${hospitalId}/tardoc-templates/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-templates`] });
      toast({ title: "Template updated", description: "Changes saved successfully" });
      resetFormAndGoToList();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update template", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/clinic/${hospitalId}/tardoc-templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-templates`] });
      toast({ title: "Template deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete template", variant: "destructive" });
    },
  });

  // ==================== Form helpers ====================

  function resetFormAndGoToList() {
    setView("list");
    setEditingTemplate(null);
    setName("");
    setBillingModel("");
    setLawType("");
    setTreatmentType("");
    setTreatmentReason("");
    setIsDefault(false);
    setLineItems([]);
  }

  function openCreateForm() {
    setEditingTemplate(null);
    setName("");
    setBillingModel("");
    setLawType("");
    setTreatmentType("");
    setTreatmentReason("");
    setIsDefault(false);
    setLineItems([createEmptyLine()]);
    setView("form");
  }

  function openEditForm(template: TardocTemplate) {
    setEditingTemplate(template);
    setName(template.name);
    setBillingModel(template.billingModel || "");
    setLawType(template.lawType || "");
    setTreatmentType(template.treatmentType || "");
    setTreatmentReason(template.treatmentReason || "");
    setIsDefault(template.isDefault === true);
    setLineItems(
      template.items.length > 0
        ? template.items.map((item) => ({
            key: crypto.randomUUID(),
            tardocCode: item.tardocCode,
            description: item.description,
            taxPoints: item.taxPoints || "",
            scalingFactor: item.scalingFactor || "1.00",
            sideCode: item.sideCode || "",
            quantity: item.quantity || 1,
          }))
        : [createEmptyLine()]
    );
    setView("form");
  }

  function handleSave() {
    if (!name.trim()) {
      toast({ title: "Validation", description: "Template name is required", variant: "destructive" });
      return;
    }

    // Filter out completely empty lines
    const validItems = lineItems.filter(
      (item) => item.tardocCode.trim() !== "" || item.description.trim() !== ""
    );

    if (validItems.length === 0) {
      toast({ title: "Validation", description: "At least one line item is required", variant: "destructive" });
      return;
    }

    // Check all lines have a code
    const missingCode = validItems.find((item) => !item.tardocCode.trim());
    if (missingCode) {
      toast({ title: "Validation", description: "All line items must have a TARDOC code", variant: "destructive" });
      return;
    }

    // Convert "none" sentinel from Select to null
    const toNullable = (v: string) => (v && v !== "none") ? v : null;

    const payload = {
      name: name.trim(),
      billingModel: toNullable(billingModel),
      lawType: toNullable(lawType),
      treatmentType: toNullable(treatmentType),
      treatmentReason: toNullable(treatmentReason),
      isDefault,
      items: validItems.map(({ tardocCode, description, taxPoints, scalingFactor, sideCode, quantity }) => ({
        tardocCode,
        description,
        taxPoints: taxPoints || null,
        scalingFactor: scalingFactor || null,
        sideCode: sideCode || null,
        quantity,
      })),
    };

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  function handleDelete(template: TardocTemplate) {
    if (confirm(`Delete template "${template.name}"? This cannot be undone.`)) {
      deleteMutation.mutate(template.id);
    }
  }

  // Line item helpers
  function addLine() {
    setLineItems((prev) => [...prev, createEmptyLine()]);
  }

  function removeLine(key: string) {
    setLineItems((prev) => prev.filter((item) => item.key !== key));
  }

  function updateLine(key: string, field: keyof EditableLineItem, value: string | number) {
    setLineItems((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, [field]: value } : item
      )
    );
  }

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ==================== Dialog close handler ====================

  function handleDialogClose(openState: boolean) {
    if (!openState) {
      // Reset to list view when closing dialog
      if (view === "form") {
        resetFormAndGoToList();
      }
      onClose();
    }
  }

  // ==================== Render ====================

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {view === "list" ? (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>Invoice Templates</DialogTitle>
                <Button size="sm" onClick={openCreateForm}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Template
                </Button>
              </div>
            </DialogHeader>

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No templates yet.</p>
                <p className="text-sm mt-1">Create one to speed up invoice creation.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {templates.map((template) => (
                  <Card key={template.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{template.name}</span>
                            {template.isDefault && (
                              <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                                Default
                              </Badge>
                            )}
                            {template.billingModel && (
                              <Badge variant="outline" className="text-xs">
                                {template.billingModel}
                              </Badge>
                            )}
                            {template.lawType && (
                              <Badge variant="outline" className="text-xs">
                                {template.lawType}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {template.items.length} line item{template.items.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditForm(template)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(template)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFormAndGoToList}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>
                  {editingTemplate ? "Edit Template" : "Create Template"}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="space-y-4">
              {/* Template name */}
              <div>
                <Label>Template Name *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Standard Knee Arthroscopy"
                />
              </div>

              {/* Billing settings row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label>Billing Model</Label>
                  <Select value={billingModel} onValueChange={setBillingModel}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      <SelectItem value="TG">Tiers Garant</SelectItem>
                      <SelectItem value="TP">Tiers Payant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Law Type</Label>
                  <Select value={lawType} onValueChange={setLawType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      <SelectItem value="KVG">KVG</SelectItem>
                      <SelectItem value="UVG">UVG</SelectItem>
                      <SelectItem value="IVG">IVG</SelectItem>
                      <SelectItem value="MVG">MVG</SelectItem>
                      <SelectItem value="VVG">VVG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Treatment Type</Label>
                  <Select value={treatmentType} onValueChange={setTreatmentType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      <SelectItem value="ambulatory">Ambulatory</SelectItem>
                      <SelectItem value="stationary">Stationary</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Treatment Reason</Label>
                  <Select value={treatmentReason} onValueChange={setTreatmentReason}>
                    <SelectTrigger>
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- None --</SelectItem>
                      <SelectItem value="disease">Disease</SelectItem>
                      <SelectItem value="accident">Accident</SelectItem>
                      <SelectItem value="maternity">Maternity</SelectItem>
                      <SelectItem value="prevention">Prevention</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Is Default checkbox */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={(checked) => setIsDefault(checked === true)}
                />
                <Label htmlFor="isDefault" className="cursor-pointer">
                  Set as default template (auto-selected when creating new invoices)
                </Label>
              </div>

              {/* Line items section */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Line Items</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addLine}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Line
                  </Button>
                </div>

                {/* Column headers (desktop) */}
                <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground mb-2 px-1">
                  <div className="col-span-2">TARDOC Code</div>
                  <div className="col-span-4">Description</div>
                  <div className="col-span-2">Tax Points</div>
                  <div className="col-span-1">SF</div>
                  <div className="col-span-1">Qty</div>
                  <div className="col-span-1">Side</div>
                  <div className="col-span-1"></div>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item) => (
                    <TemplateLineItemRow
                      key={item.key}
                      item={item}
                      onUpdate={(field, value) => updateLine(item.key, field, value)}
                      onRemove={() => removeLine(item.key)}
                      canRemove={lineItems.length > 1}
                    />
                  ))}
                </div>

                {lineItems.length === 0 && (
                  <p className="text-center text-muted-foreground py-4 text-sm">
                    No line items. Click "Add Line" to begin.
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={resetFormAndGoToList} disabled={isSaving}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  {editingTemplate ? "Save Changes" : "Create Template"}
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ==================== Line Item Row Component ====================

function TemplateLineItemRow({
  item,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: EditableLineItem;
  onUpdate: (field: keyof EditableLineItem, value: string | number) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const { data: searchResults = [] } = useQuery<TardocCode[]>({
    queryKey: ['/api/tardoc/search', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];
      const res = await fetch(`/api/tardoc/search?q=${encodeURIComponent(searchTerm)}&limit=15`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: searchTerm.length >= 2,
  });

  const selectTardocCode = (code: TardocCode) => {
    onUpdate("tardocCode", code.code);
    onUpdate("description", code.descriptionDe);
    onUpdate("taxPoints", code.taxPoints || "0");
    onUpdate("sideCode", code.sideCode || "");
    setIsPopoverOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start border rounded p-2 sm:p-1 sm:border-0">
      {/* TARDOC Code with search */}
      <div className="sm:col-span-2">
        <Label className="sm:hidden text-xs">TARDOC Code</Label>
        <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start font-mono text-xs h-8"
              type="button"
            >
              {item.tardocCode || (
                <span className="text-muted-foreground">Search...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[450px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder="Search TARDOC code or description..."
                value={searchTerm}
                onValueChange={setSearchTerm}
              />
              <CommandList>
                <CommandEmpty>
                  {searchTerm.length < 2 ? "Type at least 2 characters..." : "No codes found"}
                </CommandEmpty>
                <CommandGroup>
                  {searchResults.map((code) => (
                    <CommandItem
                      key={code.id}
                      value={`${code.code} ${code.descriptionDe}`}
                      onSelect={() => selectTardocCode(code)}
                    >
                      <div className="flex flex-col w-full">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-xs">{code.code}</Badge>
                          {code.taxPoints && (
                            <span className="text-xs text-muted-foreground">{code.taxPoints} TP</span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">{code.descriptionDe}</span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Description */}
      <div className="sm:col-span-4">
        <Label className="sm:hidden text-xs">Description</Label>
        <Input
          value={item.description}
          onChange={(e) => onUpdate("description", e.target.value)}
          className="h-8 text-xs"
          placeholder="Service description"
        />
      </div>

      {/* Tax Points */}
      <div className="sm:col-span-2">
        <Label className="sm:hidden text-xs">Tax Points</Label>
        <Input
          value={item.taxPoints}
          onChange={(e) => onUpdate("taxPoints", e.target.value)}
          className="h-8 text-xs"
          placeholder="0.00"
        />
      </div>

      {/* Scaling Factor */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">SF</Label>
        <Input
          value={item.scalingFactor}
          onChange={(e) => onUpdate("scalingFactor", e.target.value)}
          className="h-8 text-xs"
          placeholder="1.00"
        />
      </div>

      {/* Quantity */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Qty</Label>
        <Input
          type="number"
          min={1}
          value={item.quantity}
          onChange={(e) => onUpdate("quantity", parseInt(e.target.value) || 1)}
          className="h-8 text-xs"
        />
      </div>

      {/* Side Code */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Side</Label>
        <Select value={item.sideCode || "none"} onValueChange={(v) => onUpdate("sideCode", v === "none" ? "" : v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="-" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">-</SelectItem>
            <SelectItem value="L">L</SelectItem>
            <SelectItem value="R">R</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Remove */}
      <div className="sm:col-span-1 flex items-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          className="h-8 w-8 p-0"
          type="button"
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
