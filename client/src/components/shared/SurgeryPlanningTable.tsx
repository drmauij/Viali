import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Clock,
  AlertCircle,
  Package,
  FileText,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import type { Surgery, Patient } from "@shared/schema";

export type ModuleContext = "anesthesia" | "surgery" | "business" | "marketing";

export type ColumnGroup = 
  | "clinical" 
  | "scheduling" 
  | "business" 
  | "contracts" 
  | "implants";

interface SurgeryPlanningTableProps {
  moduleContext: ModuleContext;
  visibleColumnGroups?: ColumnGroup[];
  onSurgeryClick?: (surgery: Surgery) => void;
  dateFrom?: Date;
  dateTo?: Date;
  showFilters?: boolean;
}

type SortDirection = "asc" | "desc" | null;
type SortField = keyof Surgery | "patientName" | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  partial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const DEFAULT_COLUMN_GROUPS: Record<ModuleContext, ColumnGroup[]> = {
  anesthesia: ["clinical", "scheduling", "contracts", "implants"],
  surgery: ["clinical", "scheduling", "implants"],
  business: ["clinical", "scheduling", "business"],
  marketing: ["clinical", "business"],
};

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "dd.MM.yyyy");
  } catch {
    return "-";
  }
}

function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "dd.MM.yyyy HH:mm");
  } catch {
    return "-";
  }
}

function formatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "HH:mm");
  } catch {
    return "-";
  }
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(num);
}

interface EditableDateCellProps {
  value: string | Date | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: string | null) => void;
  isPending: boolean;
}

interface EditableCurrencyCellProps {
  value: string | number | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: string | null) => void;
  isPending: boolean;
}

function EditableCurrencyCell({ value, surgeryId, field, onUpdate, isPending }: EditableCurrencyCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleStartEdit = () => {
    const num = value !== null && value !== undefined 
      ? (typeof value === "string" ? parseFloat(value) : value)
      : null;
    setInputValue(num !== null && !isNaN(num) ? num.toString() : "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const num = parseFloat(inputValue);
    onUpdate(surgeryId, field, inputValue && !isNaN(num) ? inputValue : null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-24"
        autoFocus
        data-testid={`input-${field}-${surgeryId}`}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 justify-start font-medium w-full"
      disabled={isPending}
      onClick={handleStartEdit}
      data-testid={`button-edit-${field}-${surgeryId}`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        formatCurrency(value)
      )}
    </Button>
  );
}

function EditableDateCell({ value, surgeryId, field, onUpdate, isPending }: EditableDateCellProps) {
  const [open, setOpen] = useState(false);
  const currentDate = value ? (typeof value === "string" ? parseISO(value) : value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 justify-start font-normal w-full"
          disabled={isPending}
          data-testid={`button-edit-${field}-${surgeryId}`}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            formatDate(value)
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent
          mode="single"
          selected={currentDate}
          onSelect={(date) => {
            onUpdate(surgeryId, field, date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          initialFocus
        />
        {currentDate && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive"
              onClick={() => {
                onUpdate(surgeryId, field, null);
                setOpen(false);
              }}
            >
              Clear Date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface EditableCheckboxCellProps {
  value: boolean | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: boolean) => void;
  isPending: boolean;
}

function EditableCheckboxCell({ value, surgeryId, field, onUpdate, isPending }: EditableCheckboxCellProps) {
  return (
    <div className="flex justify-center">
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Checkbox
          checked={value ?? false}
          onCheckedChange={(checked) => onUpdate(surgeryId, field, checked === true)}
          data-testid={`checkbox-${field}-${surgeryId}`}
        />
      )}
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  sortState: SortState;
  onSort: (field: SortField) => void;
}

function SortableHeader({ label, field, sortState, onSort }: SortableHeaderProps) {
  const isActive = sortState.field === field;
  
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive ? (
        sortState.direction === "asc" ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : (
          <ArrowDown className="ml-2 h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}

export function SurgeryPlanningTable({
  moduleContext,
  visibleColumnGroups,
  onSurgeryClick,
  dateFrom,
  dateTo,
  showFilters = true,
}: SurgeryPlanningTableProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  
  const [sortState, setSortState] = useState<SortState>({ field: "plannedDate", direction: "desc" });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  
  const columnGroups = visibleColumnGroups ?? DEFAULT_COLUMN_GROUPS[moduleContext];
  
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeHospital?.id) params.set("hospitalId", activeHospital.id);
    if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
    if (dateTo) params.set("dateTo", dateTo.toISOString());
    return params.toString();
  }, [activeHospital?.id, dateFrom, dateTo]);
  
  const { data: surgeries = [], isLoading: surgeriesLoading } = useQuery<Surgery[]>({
    queryKey: ["/api/anesthesia/surgeries", queryParams],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch surgeries');
      return response.json();
    },
    enabled: !!activeHospital?.id,
  });
  
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
  
  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
  
  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);
  
  const roomMap = useMemo(() => {
    const map = new Map<string, string>();
    surgeryRooms.forEach((r: any) => map.set(r.id, r.name));
    return map;
  }, [surgeryRooms]);
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Surgery> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia/surgeries"] });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: String(error),
        variant: "destructive",
      });
    },
  });
  
  const handleUpdate = async (surgeryId: string, field: string, value: any) => {
    const updateKey = `${surgeryId}-${field}`;
    setPendingUpdates((prev) => new Set(prev).add(updateKey));
    
    try {
      await updateMutation.mutateAsync({ id: surgeryId, updates: { [field]: value } });
      toast({
        title: t("common.saved"),
        description: t("surgeryPlanning.updateSuccess"),
      });
    } finally {
      setPendingUpdates((prev) => {
        const next = new Set(prev);
        next.delete(updateKey);
        return next;
      });
    }
  };
  
  const isFieldPending = (surgeryId: string, field: string) => {
    return pendingUpdates.has(`${surgeryId}-${field}`);
  };
  
  const handleSort = (field: SortField) => {
    setSortState((prev) => ({
      field,
      direction:
        prev.field === field
          ? prev.direction === "asc"
            ? "desc"
            : prev.direction === "desc"
            ? null
            : "asc"
          : "asc",
    }));
  };
  
  const sortedSurgeries = useMemo(() => {
    if (!sortState.field || !sortState.direction) return surgeries;
    
    return [...surgeries].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      if (sortState.field === "patientName") {
        const patientA = patientMap.get(a.patientId);
        const patientB = patientMap.get(b.patientId);
        aVal = patientA ? `${patientA.surname}, ${patientA.firstName}` : "";
        bVal = patientB ? `${patientB.surname}, ${patientB.firstName}` : "";
      } else {
        aVal = a[sortState.field as keyof Surgery];
        bVal = b[sortState.field as keyof Surgery];
      }
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortState.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return sortState.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortState.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [surgeries, sortState, patientMap]);
  
  const toggleRowExpand = (surgeryId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(surgeryId)) {
        next.delete(surgeryId);
      } else {
        next.add(surgeryId);
      }
      return next;
    });
  };
  
  const showClinical = columnGroups.includes("clinical");
  const showScheduling = columnGroups.includes("scheduling");
  const showBusiness = columnGroups.includes("business");
  const showContracts = columnGroups.includes("contracts");
  const showImplants = columnGroups.includes("implants");
  const hideRoomAndAdmission = moduleContext === "business";
  
  if (surgeriesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  
  if (surgeries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t("surgeryPlanning.noSurgeries")}</p>
      </div>
    );
  }
  
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            
            {showClinical && (
              <>
                <TableHead>
                  <SortableHeader
                    label={t("surgeryPlanning.columns.date")}
                    field="plannedDate"
                    sortState={sortState}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    label={t("surgeryPlanning.columns.patient")}
                    field="patientName"
                    sortState={sortState}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>
                  <SortableHeader
                    label={t("surgeryPlanning.columns.procedure")}
                    field="plannedSurgery"
                    sortState={sortState}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.surgeon")}</TableHead>
                {!hideRoomAndAdmission && <TableHead>{t("surgeryPlanning.columns.room")}</TableHead>}
              </>
            )}
            
            {showScheduling && (
              <>
                {!hideRoomAndAdmission && (
                  <TableHead>
                    <Clock className="h-4 w-4 inline mr-1" />
                    {t("surgeryPlanning.columns.admissionTime")}
                  </TableHead>
                )}
                <TableHead>{t("surgeryPlanning.columns.status")}</TableHead>
              </>
            )}
            
            {showBusiness && (
              <>
                <TableHead>
                  <CreditCard className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.price")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.quoteSent")}</TableHead>
                <TableHead>
                  <FileText className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.contractSent")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.contractReceived")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.invoiceSent")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.paymentDate")}</TableHead>
              </>
            )}
            
            {showContracts && !showBusiness && (
              <>
                <TableHead>
                  <FileText className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.contractSent")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.contractReceived")}</TableHead>
              </>
            )}
            
            {showImplants && (
              <>
                <TableHead>
                  <Package className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.implantOrdered")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.implantReceived")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.implantVendor")}</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedSurgeries.map((surgery) => {
            const patient = patientMap.get(surgery.patientId);
            const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "-";
            const roomName = surgery.surgeryRoomId ? roomMap.get(surgery.surgeryRoomId) ?? "-" : "-";
            const isExpanded = expandedRows.has(surgery.id);
            
            return (
              <Fragment key={surgery.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    onSurgeryClick && "hover:bg-accent"
                  )}
                  onClick={() => onSurgeryClick?.(surgery)}
                  data-testid={`row-surgery-${surgery.id}`}
                >
                  <TableCell className="p-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowExpand(surgery.id);
                      }}
                      data-testid={`button-expand-${surgery.id}`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  
                  {showClinical && (
                    <>
                      <TableCell className="font-medium">
                        {formatDateTime(surgery.plannedDate)}
                      </TableCell>
                      <TableCell>{patientName}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={surgery.plannedSurgery}>
                        {surgery.plannedSurgery}
                      </TableCell>
                      <TableCell>{surgery.surgeon ?? "-"}</TableCell>
                      {!hideRoomAndAdmission && <TableCell>{roomName}</TableCell>}
                    </>
                  )}
                  
                  {showScheduling && (
                    <>
                      {!hideRoomAndAdmission && <TableCell>{formatTime(surgery.admissionTime)}</TableCell>}
                      <TableCell>
                        <Badge
                          variant={
                            surgery.status === "completed"
                              ? "default"
                              : surgery.status === "in-progress"
                              ? "secondary"
                              : surgery.status === "cancelled"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {surgery.status}
                        </Badge>
                      </TableCell>
                    </>
                  )}
                  
                  {showBusiness && (
                    <>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableCurrencyCell
                          value={surgery.price}
                          surgeryId={surgery.id}
                          field="price"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "price")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.quoteSentDate}
                          surgeryId={surgery.id}
                          field="quoteSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "quoteSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractSentDate}
                          surgeryId={surgery.id}
                          field="treatmentContractSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractReceivedDate}
                          surgeryId={surgery.id}
                          field="treatmentContractReceivedDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractReceivedDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.invoiceSentDate}
                          surgeryId={surgery.id}
                          field="invoiceSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "invoiceSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.paymentDate}
                          surgeryId={surgery.id}
                          field="paymentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "paymentDate")}
                        />
                      </TableCell>
                    </>
                  )}
                  
                  {showContracts && !showBusiness && (
                    <>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractSentDate}
                          surgeryId={surgery.id}
                          field="treatmentContractSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractReceivedDate}
                          surgeryId={surgery.id}
                          field="treatmentContractReceivedDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractReceivedDate")}
                        />
                      </TableCell>
                    </>
                  )}
                  
                  {showImplants && (
                    <>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.implantOrderDate}
                          surgeryId={surgery.id}
                          field="implantOrderDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "implantOrderDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.implantReceivedDate}
                          surgeryId={surgery.id}
                          field="implantReceivedDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "implantReceivedDate")}
                        />
                      </TableCell>
                      <TableCell>{surgery.implantVendor ?? "-"}</TableCell>
                    </>
                  )}
                </TableRow>
                
                {isExpanded && (
                  <TableRow key={`${surgery.id}-expanded`}>
                    <TableCell colSpan={100} className="bg-muted/30 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        {patient && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.patientInfo")}</h4>
                            <div className="space-y-1">
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.patientNumber")}:</span> {patient.patientNumber ?? "-"}</p>
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.birthday")}:</span> {patient.birthday ? formatDate(patient.birthday) : "-"}</p>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <h4 className="font-semibold mb-2">{t("surgeryPlanning.surgeryDetails")}</h4>
                          <div className="space-y-1">
                            <p><span className="text-muted-foreground">{t("surgeryPlanning.notes")}:</span> {surgery.notes ?? "-"}</p>
                            {surgery.actualStartTime && (
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.actualStart")}:</span> {formatDateTime(surgery.actualStartTime)}</p>
                            )}
                            {surgery.actualEndTime && (
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.actualEnd")}:</span> {formatDateTime(surgery.actualEndTime)}</p>
                            )}
                          </div>
                        </div>
                        
                        {showBusiness && surgery.paymentNotes && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.paymentInfo")}</h4>
                            <div className="space-y-1">
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.paymentMethod")}:</span> {surgery.paymentMethod ?? "-"}</p>
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.paymentNotes")}:</span> {surgery.paymentNotes}</p>
                            </div>
                          </div>
                        )}
                        
                        {showImplants && surgery.implantDetails && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.implantInfo")}</h4>
                            <p className="text-sm">{surgery.implantDetails}</p>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default SurgeryPlanningTable;
