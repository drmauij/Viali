import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Loader2, Users } from "lucide-react";

export interface SegmentFilter {
  field: "sex" | "treatment" | "lastAppointment" | "appointmentStatus";
  operator: string;
  value: string;
  logic?: "and" | "or";
}

interface Props {
  filters: SegmentFilter[];
  onChange: (filters: SegmentFilter[]) => void;
  patientCount: number | null;
  onCountChange: (count: number | null) => void;
}

export default function SegmentBuilder({ filters, onChange, patientCount, onCountChange }: Props) {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [counting, setCounting] = useState(false);

  const FIELDS = [
    { value: "sex", label: t("flows.fields.sex", "Gender") },
    { value: "treatment", label: t("flows.fields.treatment", "Treatment") },
    { value: "lastAppointment", label: t("flows.fields.lastAppointment", "Last Appointment") },
    { value: "appointmentStatus", label: t("flows.fields.appointmentStatus", "Appointment Status") },
  ];

  const OPERATORS: Record<string, Array<{ value: string; label: string }>> = {
    sex: [
      { value: "is", label: t("flows.operators.is", "is") },
      { value: "isNot", label: t("flows.operators.isNot", "is not") },
    ],
    treatment: [
      { value: "is", label: t("flows.operators.was", "was") },
      { value: "isNot", label: t("flows.operators.wasNot", "was not") },
    ],
    lastAppointment: [
      { value: "moreThan", label: t("flows.operators.moreThan", "more than ago") },
      { value: "lessThan", label: t("flows.operators.lessThan", "less than ago") },
    ],
    appointmentStatus: [{ value: "is", label: t("flows.operators.is", "is") }],
  };

  const SEX_VALUES = [
    { value: "F", label: t("flows.values.female", "Female") },
    { value: "M", label: t("flows.values.male", "Male") },
    { value: "O", label: t("flows.values.other", "Other") },
  ];

  const STATUS_VALUES = [
    { value: "completed", label: t("flows.values.completed", "Completed") },
    { value: "cancelled", label: t("flows.values.cancelled", "Cancelled") },
    { value: "no_show", label: t("flows.values.noShow", "No-Show") },
  ];

  // Fetch services for treatment dropdown
  const { data: services = [] } = useQuery({
    queryKey: ["clinic-services", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/clinic/${hospitalId}/services`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  // Debounced count query
  const fetchCount = useCallback(async () => {
    if (!hospitalId || filters.length === 0) {
      onCountChange(null);
      return;
    }
    // Skip if any filter has incomplete values
    if (filters.some((f) => !f.field || !f.operator || !f.value)) return;

    setCounting(true);
    try {
      const res = await apiRequest("POST", `/api/business/${hospitalId}/flows/segment-count`, {
        filters,
      });
      const data = await res.json();
      onCountChange(data.count);
    } catch {
      onCountChange(null);
    } finally {
      setCounting(false);
    }
  }, [hospitalId, filters, onCountChange]);

  useEffect(() => {
    const timer = setTimeout(fetchCount, 500);
    return () => clearTimeout(timer);
  }, [fetchCount]);

  const addFilter = () => {
    onChange([...filters, { field: "sex", operator: "is", value: "", logic: "and" }]);
  };

  const toggleLogic = (index: number) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], logic: updated[index].logic === "or" ? "and" : "or" };
    onChange(updated);
  };

  const updateFilter = (index: number, updates: Partial<SegmentFilter>) => {
    const updated = [...filters];
    updated[index] = { ...updated[index], ...updates };
    // Reset operator and value when field changes
    if (updates.field) {
      updated[index].operator = OPERATORS[updates.field]?.[0]?.value || "is";
      updated[index].value = "";
    }
    onChange(updated);
  };

  const removeFilter = (index: number) => {
    onChange(filters.filter((_, i) => i !== index));
  };

  const renderValueInput = (filter: SegmentFilter, index: number) => {
    switch (filter.field) {
      case "sex":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("flows.segment.choose", "Choose...")} />
            </SelectTrigger>
            <SelectContent>
              {SEX_VALUES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "treatment":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder={t("flows.fields.treatment", "Treatment") + "..."} />
            </SelectTrigger>
            <SelectContent>
              {(services as any[]).map((s: any) => (
                <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "lastAppointment": {
        const [numVal, unitVal] = (filter.value || ":months").split(":");
        return (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-[80px]"
              value={numVal}
              onChange={(e) => updateFilter(index, { value: `${e.target.value}:${unitVal || "months"}` })}
              placeholder="3"
            />
            <Select value={unitVal || "months"} onValueChange={(v) => updateFilter(index, { value: `${numVal}:${v}` })}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="weeks">{t("flows.values.weeks", "Weeks")}</SelectItem>
                <SelectItem value="months">{t("flows.values.months", "Months")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        );
      }
      case "appointmentStatus":
        return (
          <Select value={filter.value} onValueChange={(v) => updateFilter(index, { value: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={t("common.status", "Status") + "..."} />
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      {filters.map((filter, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          {i === 0 ? (
            <Badge variant="secondary" className="shrink-0 text-xs">IF</Badge>
          ) : (
            <Badge
              variant="secondary"
              className="shrink-0 text-xs cursor-pointer hover:bg-primary/20 select-none"
              onClick={() => toggleLogic(i)}
              title={t("flows.segment.toggleLogic", "Click to toggle")}
            >
              {filter.logic === "or" ? "OR" : "AND"}
            </Badge>
          )}
          <Select
            value={filter.field}
            onValueChange={(v) => updateFilter(i, { field: v as SegmentFilter["field"] })}
          >
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filter.operator}
            onValueChange={(v) => updateFilter(i, { operator: v })}
          >
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(OPERATORS[filter.field] || []).map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {renderValueInput(filter, i)}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => removeFilter(i)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex items-center gap-3 pt-1">
        <Button variant="outline" size="sm" onClick={addFilter} className="gap-1">
          <Plus className="h-3.5 w-3.5" /> {t("flows.segment.addRule", "Add Rule")}
        </Button>
        {filters.length > 0 && (
          <div className="flex items-center gap-2">
            {counting ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : patientCount !== null ? (
              <Badge className="bg-primary gap-1">
                <Users className="h-3 w-3" />
                {patientCount} {t("flows.segment.patients", "Patients")}
              </Badge>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
