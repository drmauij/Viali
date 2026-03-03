import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save, X, Loader2, AlertTriangle, CalendarDays, User } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ==================== Types ====================

interface EligibleSurgery {
  id: string;
  plannedDate: string | null;
  plannedSurgery: string | null;
  chopCode: string | null;
  surgerySide: string | null;
  status: string;
  patientId: string | null;
  patientSurname: string | null;
  patientFirstName: string | null;
  patientBirthday: string | null;
  surgeon: string | null;
  hasInvoice: boolean;
}

interface PrefillData {
  surgeryId: string;
  patientId: string | null;
  surgeryDescription: string;
  chopCode: string;
  surgerySide: string;
  patientSurname: string;
  patientFirstName: string;
  patientBirthday: string;
  patientSex: string;
  patientStreet: string;
  patientPostalCode: string;
  patientCity: string;
  ahvNumber: string;
  insurerGln: string;
  insurerName: string;
  insuranceNumber: string;
  caseDate: string;
  caseDateEnd: string;
  billerGln: string;
  billerZsr: string;
  tpValue: string;
  providerGln: string;
  providerZsr: string;
  surgeonName: string;
  anesthesiaType: string;
  anesthesiologistGln: string;
  anesthesiologistName: string;
  treatmentType: string;
  treatmentCanton: string;
  existingInvoice: { id: string; status: string } | null;
  warnings: string[];
}

interface InvoiceTemplate {
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

interface TardocInvoiceFormProps {
  hospitalId: string;
  onSuccess: () => void;
  onCancel: () => void;
  preSelectedSurgeryId?: string;
}

// ==================== Schema ====================

const tardocInvoiceFormSchema = z.object({
  surgeryId: z.string().min(1, "Surgery is required"),
  patientId: z.string().optional(),
  billingModel: z.enum(["TG", "TP"]),
  treatmentType: z.string().default("ambulatory"),
  treatmentReason: z.string().default("disease"),
  lawType: z.enum(["KVG", "UVG", "IVG", "MVG", "VVG"]),
  caseNumber: z.string().optional(),
  caseDate: z.string().optional(),
  caseDateEnd: z.string().optional(),
  treatmentCanton: z.string().optional(),
  referringPhysicianGln: z.string().optional(),
  tpValue: z.string().min(1, "TP value is required"),
  items: z.array(z.object({
    tardocCode: z.string().min(1, "TARDOC code is required"),
    description: z.string().min(1, "Description is required"),
    treatmentDate: z.string().min(1, "Date is required"),
    session: z.coerce.number().default(1),
    quantity: z.coerce.number().int().positive().default(1),
    taxPoints: z.string().min(1, "Tax points required"),
    tpValue: z.string(),
    scalingFactor: z.string().default("1.00"),
    sideCode: z.string().optional(),
    providerGln: z.string().optional(),
    amountChf: z.string(),
  })).min(1, "At least one service line is required"),
});

type TardocInvoiceFormData = z.infer<typeof tardocInvoiceFormSchema>;

// ==================== Helpers ====================

const SWISS_CANTONS = [
  "AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR",
  "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG",
  "TI", "UR", "VD", "VS", "ZG", "ZH"
];

function calculateLineAmount(taxPoints: string, tpValue: string, quantity: number, scalingFactor: string): string {
  const tp = parseFloat(taxPoints) || 0;
  const tpv = parseFloat(tpValue) || 0;
  const sf = parseFloat(scalingFactor) || 1;
  const q = quantity || 1;
  return (tp * tpv * sf * q).toFixed(2);
}

function formatSurgeryDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ==================== Component ====================

export default function TardocInvoiceForm({ hospitalId, onSuccess, onCancel, preSelectedSurgeryId }: TardocInvoiceFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // State
  const [surgerySearch, setSurgerySearch] = useState("");
  const [isSurgeryPopoverOpen, setIsSurgeryPopoverOpen] = useState(false);
  const [selectedSurgery, setSelectedSurgery] = useState<EligibleSurgery | null>(null);
  const [prefillData, setPrefillData] = useState<PrefillData | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");

  // Form setup
  const today = new Date().toISOString().split('T')[0];
  const form = useForm<TardocInvoiceFormData>({
    resolver: zodResolver(tardocInvoiceFormSchema),
    defaultValues: {
      surgeryId: "",
      patientId: "",
      billingModel: "TG",
      treatmentType: "ambulatory",
      treatmentReason: "disease",
      lawType: "KVG",
      caseNumber: "",
      caseDate: today,
      caseDateEnd: today,
      treatmentCanton: "",
      referringPhysicianGln: "",
      tpValue: "1.0000",
      items: [],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedTpValue = useWatch({ control: form.control, name: "tpValue" });
  const watchedItems = useWatch({ control: form.control, name: "items" });

  // ==================== Apply Prefill ====================

  const applyPrefillToForm = useCallback((data: PrefillData) => {
    form.setValue("surgeryId", data.surgeryId);
    form.setValue("patientId", data.patientId || "");
    form.setValue("caseDate", data.caseDate || today);
    form.setValue("caseDateEnd", data.caseDateEnd || data.caseDate || today);
    form.setValue("treatmentType", data.treatmentType || "ambulatory");
    form.setValue("treatmentCanton", data.treatmentCanton || "");

    if (data.tpValue) {
      form.setValue("tpValue", data.tpValue);
    }
  }, [form, today]);

  // ==================== Data Queries ====================

  // Search eligible surgeries
  const { data: eligibleSurgeries = [], isFetching: isFetchingSurgeries } = useQuery<EligibleSurgery[]>({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-eligible-surgeries`, surgerySearch],
    queryFn: async () => {
      const params = surgerySearch ? `?q=${encodeURIComponent(surgerySearch)}` : "";
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-eligible-surgeries${params}`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // Fetch prefill data when surgery is selected
  const { data: fetchedPrefill, isFetching: isFetchingPrefill } = useQuery<PrefillData>({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-prefill`, selectedSurgery?.id],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-prefill/${selectedSurgery!.id}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch prefill data');
      return res.json();
    },
    enabled: !!selectedSurgery?.id,
  });

  // Apply prefill data when it arrives
  useEffect(() => {
    if (fetchedPrefill && fetchedPrefill.surgeryId !== prefillData?.surgeryId) {
      setPrefillData(fetchedPrefill);
      applyPrefillToForm(fetchedPrefill);
    }
  }, [fetchedPrefill, prefillData?.surgeryId, applyPrefillToForm]);

  // Fetch templates
  const { data: templates = [] } = useQuery<InvoiceTemplate[]>({
    queryKey: [`/api/clinic/${hospitalId}/tardoc-templates`],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/tardoc-templates`, {
        credentials: 'include'
      });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!hospitalId,
  });

  // ==================== Template Application ====================

  const applyTemplate = useCallback((template: InvoiceTemplate) => {
    const currentTpValue = form.getValues("tpValue");
    const caseDate = form.getValues("caseDate") || today;
    const providerGln = prefillData?.providerGln || "";

    // Apply template defaults for billing fields (only if template has them)
    if (template.billingModel) {
      form.setValue("billingModel", template.billingModel as "TG" | "TP");
    }
    if (template.lawType) {
      form.setValue("lawType", template.lawType as "KVG" | "UVG" | "IVG" | "MVG" | "VVG");
    }
    if (template.treatmentType) {
      form.setValue("treatmentType", template.treatmentType);
    }
    if (template.treatmentReason) {
      form.setValue("treatmentReason", template.treatmentReason);
    }

    // Replace line items with template items
    const newItems = template.items.map((item) => {
      const amount = calculateLineAmount(
        item.taxPoints || "0",
        currentTpValue,
        item.quantity || 1,
        item.scalingFactor || "1.00"
      );
      return {
        tardocCode: item.tardocCode,
        description: item.description,
        treatmentDate: caseDate,
        session: 1,
        quantity: item.quantity || 1,
        taxPoints: item.taxPoints || "0",
        tpValue: currentTpValue,
        scalingFactor: item.scalingFactor || "1.00",
        sideCode: item.sideCode || "",
        providerGln,
        amountChf: amount,
      };
    });

    replace(newItems);
  }, [form, replace, today, prefillData]);

  // ==================== Pre-select surgery on mount ====================

  useEffect(() => {
    if (preSelectedSurgeryId && eligibleSurgeries.length > 0 && !selectedSurgery) {
      const surgery = eligibleSurgeries.find(s => s.id === preSelectedSurgeryId);
      if (surgery) {
        setSelectedSurgery(surgery);
      }
    }
  }, [preSelectedSurgeryId, eligibleSurgeries, selectedSurgery]);

  // ==================== Calculate totals ====================

  const totals = useMemo(() => {
    let subtotalTp = 0;
    let subtotalChf = 0;
    for (const item of (watchedItems || [])) {
      const tp = parseFloat(item.taxPoints) || 0;
      const sf = parseFloat(item.scalingFactor) || 1;
      const q = item.quantity || 1;
      subtotalTp += tp * sf * q;
      subtotalChf += parseFloat(item.amountChf) || 0;
    }
    return {
      subtotalTp: subtotalTp.toFixed(2),
      subtotalChf: subtotalChf.toFixed(2),
      totalChf: subtotalChf.toFixed(2),
    };
  }, [watchedItems]);

  // ==================== Recalculate helpers ====================

  const recalcLineAmount = useCallback((index: number) => {
    const items = form.getValues("items");
    const item = items[index];
    if (item) {
      const amount = calculateLineAmount(item.taxPoints, item.tpValue || watchedTpValue, item.quantity, item.scalingFactor);
      form.setValue(`items.${index}.amountChf`, amount);
    }
  }, [form, watchedTpValue]);

  // ==================== Create mutation ====================

  const createMutation = useMutation({
    mutationFn: async (data: TardocInvoiceFormData) => {
      const pf = prefillData;
      const payload = {
        ...data,
        // Snapshot fields from prefill
        billerGln: pf?.billerGln || "",
        billerZsr: pf?.billerZsr || "",
        providerGln: pf?.providerGln || "",
        providerZsr: pf?.providerZsr || "",
        insurerGln: pf?.insurerGln || "",
        insurerName: pf?.insurerName || "",
        insuranceNumber: pf?.insuranceNumber || "",
        ahvNumber: pf?.ahvNumber || "",
        patientSurname: pf?.patientSurname || "",
        patientFirstName: pf?.patientFirstName || "",
        patientBirthday: pf?.patientBirthday || "",
        patientSex: pf?.patientSex || "",
        patientStreet: pf?.patientStreet || "",
        patientPostalCode: pf?.patientPostalCode || "",
        patientCity: pf?.patientCity || "",
      };

      const response = await apiRequest('POST', `/api/clinic/${hospitalId}/tardoc-invoices`, payload);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/clinic/${hospitalId}/tardoc-invoices`] });
      toast({ title: t("common.success"), description: "Insurance invoice created" });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: t("common.error"),
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: TardocInvoiceFormData) => {
    createMutation.mutate(data);
  };

  // ==================== Surgery selection handler ====================

  const handleSelectSurgery = (surgery: EligibleSurgery) => {
    setSelectedSurgery(surgery);
    setIsSurgeryPopoverOpen(false);
    setSurgerySearch("");
    // Clear template selection when switching surgeries
    setSelectedTemplateId("");
  };

  // ==================== Template selection handler ====================

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (templateId) {
      const template = templates.find(t => t.id === templateId);
      if (template) {
        applyTemplate(template);
      }
    }
  };

  // ==================== Render ====================

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

        {/* ====== Section 1: Surgery Selection ====== */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Surgery</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Select Surgery *</Label>
              <Popover open={isSurgeryPopoverOpen} onOpenChange={setIsSurgeryPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-start font-normal"
                    data-testid="select-surgery-tardoc"
                  >
                    {selectedSurgery ? (
                      <span className="flex items-center gap-2 truncate">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span>{formatSurgeryDate(selectedSurgery.plannedDate)}</span>
                        <span className="font-medium">
                          {selectedSurgery.patientSurname} {selectedSurgery.patientFirstName}
                        </span>
                        <span className="text-muted-foreground truncate">
                          {selectedSurgery.plannedSurgery}
                        </span>
                        {selectedSurgery.hasInvoice && (
                          <Badge variant="secondary" className="text-xs shrink-0">invoiced</Badge>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Search surgeries...</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[550px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by patient name, surgery, CHOP code..."
                      value={surgerySearch}
                      onValueChange={setSurgerySearch}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {isFetchingSurgeries ? "Searching..." : "No eligible surgeries found"}
                      </CommandEmpty>
                      <CommandGroup>
                        {eligibleSurgeries.map((surgery) => (
                          <CommandItem
                            key={surgery.id}
                            value={surgery.id}
                            onSelect={() => handleSelectSurgery(surgery)}
                          >
                            <div className="flex flex-col w-full gap-0.5">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">
                                  {formatSurgeryDate(surgery.plannedDate)}
                                </span>
                                <span className="font-medium">
                                  {surgery.patientSurname} {surgery.patientFirstName}
                                </span>
                                {surgery.hasInvoice && (
                                  <Badge variant="secondary" className="text-xs">invoiced</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {surgery.plannedSurgery && (
                                  <span className="truncate">{surgery.plannedSurgery}</span>
                                )}
                                {surgery.chopCode && (
                                  <Badge variant="outline" className="text-xs font-mono">{surgery.chopCode}</Badge>
                                )}
                                {surgery.surgeon && (
                                  <span className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    {surgery.surgeon}
                                  </span>
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
              {form.formState.errors.surgeryId && (
                <p className="text-sm text-destructive mt-1">{form.formState.errors.surgeryId.message}</p>
              )}
            </div>

            {/* Surgery info badges */}
            {selectedSurgery && prefillData && (
              <div className="flex flex-wrap gap-2">
                {prefillData.surgeryDescription && (
                  <Badge variant="outline">{prefillData.surgeryDescription}</Badge>
                )}
                {prefillData.chopCode && (
                  <Badge variant="outline" className="font-mono">CHOP: {prefillData.chopCode}</Badge>
                )}
                {prefillData.surgerySide && (
                  <Badge variant="outline">Side: {prefillData.surgerySide}</Badge>
                )}
              </div>
            )}

            {/* Loading indicator */}
            {isFetchingPrefill && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading surgery data...
              </div>
            )}
          </CardContent>
        </Card>

        {/* ====== Section 2: Patient & Insurance (read-only display) ====== */}
        {prefillData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Patient & Insurance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Existing invoice warning */}
              {prefillData.existingInvoice && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Existing Invoice</AlertTitle>
                  <AlertDescription>
                    This surgery already has an invoice (status: {prefillData.existingInvoice.status}).
                    Creating another will result in a duplicate.
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings from prefill */}
              {prefillData.warnings.length > 0 && (
                <div className="space-y-2">
                  {prefillData.warnings.map((warning, i) => (
                    <Alert key={i} className="border-yellow-300 bg-yellow-50 text-yellow-800">
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Patient details grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm bg-muted/50 rounded p-3">
                <div>
                  <span className="text-muted-foreground block text-xs">Patient</span>
                  <span className="font-medium">{prefillData.patientSurname} {prefillData.patientFirstName}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Date of Birth</span>
                  <span>{prefillData.patientBirthday || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Sex</span>
                  <span>{prefillData.patientSex || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Address</span>
                  <span>
                    {[prefillData.patientStreet, `${prefillData.patientPostalCode} ${prefillData.patientCity}`.trim()]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">AHV Number</span>
                  <span>{prefillData.ahvNumber || <span className="text-yellow-600">missing</span>}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Insurance Provider</span>
                  <span>{prefillData.insurerName || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Policy Number</span>
                  <span>{prefillData.insuranceNumber || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Insurer GLN</span>
                  <span>{prefillData.insurerGln || <span className="text-yellow-600">missing</span>}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== Section 3: Billing Setup ====== */}
        {prefillData && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Billing Setup</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Row 1: Billing model, law type, treatment, reason */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <FormField
                  control={form.control}
                  name="billingModel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Billing Model *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="TG">Tiers Garant</SelectItem>
                          <SelectItem value="TP">Tiers Payant</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="lawType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Law Type *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="KVG">KVG</SelectItem>
                          <SelectItem value="UVG">UVG</SelectItem>
                          <SelectItem value="IVG">IVG</SelectItem>
                          <SelectItem value="MVG">MVG</SelectItem>
                          <SelectItem value="VVG">VVG</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="treatmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Treatment</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ambulatory">Ambulatory</SelectItem>
                          <SelectItem value="stationary">Stationary</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="treatmentReason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Reason</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="disease">Disease</SelectItem>
                          <SelectItem value="accident">Accident</SelectItem>
                          <SelectItem value="maternity">Maternity</SelectItem>
                          <SelectItem value="prevention">Prevention</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              {/* Row 2: Dates, canton, case number */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <FormField
                  control={form.control}
                  name="caseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Treatment Start *</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="caseDateEnd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Treatment End</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="treatmentCanton"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Canton</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SWISS_CANTONS.map(c => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="caseNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Case Number</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Optional" />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              {/* Row 3: TP value (editable) */}
              <div>
                <FormField
                  control={form.control}
                  name="tpValue"
                  render={({ field }) => (
                    <FormItem className="max-w-[200px]">
                      <FormLabel>Tax Point Value (CHF) *</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="1.0000"
                          onChange={(e) => {
                            field.onChange(e);
                            // Update all line items' TP value and recalculate
                            const items = form.getValues("items");
                            items.forEach((_, idx) => {
                              form.setValue(`items.${idx}.tpValue`, e.target.value);
                              setTimeout(() => recalcLineAmount(idx), 0);
                            });
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Row 4: Read-only provider info */}
              <Separator />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <Label className="text-xs text-muted-foreground">Biller GLN</Label>
                  <p className="font-mono text-xs">{prefillData.billerGln || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Biller ZSR</Label>
                  <p className="font-mono text-xs">{prefillData.billerZsr || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Surgeon</Label>
                  <p className="text-xs">{prefillData.surgeonName || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Provider GLN</Label>
                  <p className="font-mono text-xs">{prefillData.providerGln || "-"}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Provider ZSR</Label>
                  <p className="font-mono text-xs">{prefillData.providerZsr || "-"}</p>
                </div>
                {prefillData.anesthesiologistName && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Anesthesiologist</Label>
                    <p className="text-xs">
                      {prefillData.anesthesiologistName}
                      {prefillData.anesthesiologistGln && (
                        <span className="text-muted-foreground ml-1 font-mono">({prefillData.anesthesiologistGln})</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ====== Section 4: Template & Service Lines ====== */}
        {prefillData && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Service Lines</CardTitle>
                <div className="flex items-center gap-2">
                  {/* Template picker */}
                  <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger className="w-[220px] h-8 text-xs">
                      <SelectValue placeholder="Apply template..." />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.map((tmpl) => (
                        <SelectItem key={tmpl.id} value={tmpl.id}>
                          <span className="flex items-center gap-1">
                            {tmpl.name}
                            {tmpl.isDefault && (
                              <Badge variant="secondary" className="text-xs ml-1">default</Badge>
                            )}
                            <span className="text-muted-foreground text-xs">
                              ({tmpl.items.length} items)
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({
                      tardocCode: "",
                      description: "",
                      treatmentDate: form.getValues("caseDate") || today,
                      session: 1,
                      quantity: 1,
                      taxPoints: "",
                      tpValue: watchedTpValue || "1.0000",
                      scalingFactor: "1.00",
                      sideCode: "",
                      providerGln: prefillData?.providerGln || "",
                      amountChf: "0.00",
                    })}
                  >
                    <Plus className="h-4 w-4 mr-1" /> Add Line
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* Header row */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground mb-2 px-1">
                <div className="col-span-2">TARDOC Code</div>
                <div className="col-span-3">Description</div>
                <div className="col-span-1">Date</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-1">TP</div>
                <div className="col-span-1">SF</div>
                <div className="col-span-1">Side</div>
                <div className="col-span-1">Amount</div>
                <div className="col-span-1"></div>
              </div>

              <div className="space-y-2">
                {fields.map((field, index) => (
                  <TardocLineItem
                    key={field.id}
                    index={index}
                    form={form}
                    onRemove={() => remove(index)}
                    canRemove={fields.length > 1}
                    onRecalc={() => recalcLineAmount(index)}
                    tpValue={watchedTpValue}
                  />
                ))}
              </div>

              {fields.length === 0 && (
                <p className="text-center text-muted-foreground py-4">
                  No service lines. Select a template or click "Add Line" to begin.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ====== Section 5: Totals & Actions ====== */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-start">
              <div className="space-y-1 text-sm">
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Total Tax Points:</span>
                  <span className="font-medium">{totals.subtotalTp} TP</span>
                </div>
                <div className="flex gap-8">
                  <span className="text-muted-foreground">Subtotal CHF:</span>
                  <span className="font-medium">CHF {totals.subtotalChf}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex gap-8 text-base font-semibold">
                  <span>Total:</span>
                  <span>CHF {totals.totalChf}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onCancel}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || !prefillData}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-1" />
                  )}
                  Save Draft
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </Form>
  );
}

// ==================== Line Item Component ====================

function TardocLineItem({
  index,
  form,
  onRemove,
  canRemove,
  onRecalc,
  tpValue,
}: {
  index: number;
  form: any;
  onRemove: () => void;
  canRemove: boolean;
  onRecalc: () => void;
  tpValue: string;
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
    form.setValue(`items.${index}.tardocCode`, code.code);
    form.setValue(`items.${index}.description`, code.descriptionDe);
    form.setValue(`items.${index}.taxPoints`, code.taxPoints || "0");
    form.setValue(`items.${index}.sideCode`, code.sideCode || "");
    form.setValue(`items.${index}.tpValue`, tpValue || "1.0000");
    setIsPopoverOpen(false);
    setTimeout(onRecalc, 0);
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
              {form.watch(`items.${index}.tardocCode`) || (
                <span className="text-muted-foreground">Search...</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[450px] p-0" align="start">
            <Command>
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
      <div className="sm:col-span-3">
        <Label className="sm:hidden text-xs">Description</Label>
        <Input
          {...form.register(`items.${index}.description`)}
          className="h-8 text-xs"
          placeholder="Service description"
        />
      </div>

      {/* Date */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Date</Label>
        <Input
          type="date"
          {...form.register(`items.${index}.treatmentDate`)}
          className="h-8 text-xs"
        />
      </div>

      {/* Quantity */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Qty</Label>
        <Input
          type="number"
          min={1}
          {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
          className="h-8 text-xs"
          onChange={(e) => {
            form.setValue(`items.${index}.quantity`, parseInt(e.target.value) || 1);
            setTimeout(onRecalc, 0);
          }}
        />
      </div>

      {/* Tax Points */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">TP</Label>
        <Input
          {...form.register(`items.${index}.taxPoints`)}
          className="h-8 text-xs"
          placeholder="0.00"
          onChange={(e) => {
            form.setValue(`items.${index}.taxPoints`, e.target.value);
            setTimeout(onRecalc, 0);
          }}
        />
      </div>

      {/* Scaling Factor */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">SF</Label>
        <Input
          {...form.register(`items.${index}.scalingFactor`)}
          className="h-8 text-xs"
          placeholder="1.00"
          onChange={(e) => {
            form.setValue(`items.${index}.scalingFactor`, e.target.value);
            setTimeout(onRecalc, 0);
          }}
        />
      </div>

      {/* Side Code */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Side</Label>
        <select
          {...form.register(`items.${index}.sideCode`)}
          className="h-8 text-xs w-full border rounded px-1"
        >
          <option value="">-</option>
          <option value="N">N</option>
          <option value="L">L</option>
          <option value="R">R</option>
          <option value="B">B</option>
        </select>
      </div>

      {/* Amount (calculated) */}
      <div className="sm:col-span-1">
        <Label className="sm:hidden text-xs">Amount</Label>
        <Input
          value={form.watch(`items.${index}.amountChf`) || "0.00"}
          className="h-8 text-xs bg-muted font-medium"
          readOnly
        />
      </div>

      {/* Remove button */}
      <div className="sm:col-span-1 flex justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          onClick={onRemove}
          disabled={!canRemove}
        >
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
