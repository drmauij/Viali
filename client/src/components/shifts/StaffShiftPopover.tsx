import { useState, useEffect, useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import AbsenceInfoBlock, { type AbsenceDetail } from "./AbsenceInfoBlock";
import { shiftOverlapsAbsence } from "@/lib/absenceConstants";
import { ROLE_CONFIG } from "@/components/anesthesia/PlannedStaffBox";
import type { ShiftType } from "@shared/schema";

type StaffRole =
  | "surgeon"
  | "surgicalAssistant"
  | "instrumentNurse"
  | "circulatingNurse"
  | "anesthesiologist"
  | "anesthesiaNurse"
  | "pacuNurse";

const STAFF_ROLES: StaffRole[] = [
  "surgeon",
  "surgicalAssistant",
  "instrumentNurse",
  "circulatingNurse",
  "anesthesiologist",
  "anesthesiaNurse",
  "pacuNurse",
];

const NONE_VALUE = "__none__";

interface Props {
  hospitalId: string;
  userId: string;
  userName: string;
  date: string;
  currentShiftTypeId?: string | null;
  currentRole?: StaffRole | string | null;
  absence?: AbsenceDetail | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  children: React.ReactNode;
  /** When true, the popover operates in bulk mode */
  bulk?: boolean;
  /** The list of dates to assign when in bulk mode */
  bulkDates?: string[];
}

export default function StaffShiftPopover({
  hospitalId,
  userId,
  userName,
  date,
  currentShiftTypeId,
  currentRole,
  absence,
  open,
  onOpenChange,
  onSaved,
  children,
  bulk = false,
  bulkDates,
}: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [role, setRole] = useState<string>(currentRole ?? NONE_VALUE);
  const [shiftTypeId, setShiftTypeId] = useState<string>(currentShiftTypeId ?? NONE_VALUE);
  const [saving, setSaving] = useState(false);
  // Snapshot bulk state internally so it can't be lost if parent re-renders
  const [isBulk, setIsBulk] = useState(false);
  const [bulkDatesInternal, setBulkDatesInternal] = useState<string[]>([]);

  // Snapshot all state once when popover opens — deps intentionally
  // limited to `open` so later prop changes (caused by parent
  // re-renders from Radix interactions) don't overwrite the snapshot.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setRole(currentRole ?? NONE_VALUE);
      setShiftTypeId(currentShiftTypeId ?? NONE_VALUE);
      setIsBulk(bulk);
      setBulkDatesInternal(bulkDates ?? []);
    }
    prevOpenRef.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: shiftTypes = [], isLoading: loadingShiftTypes } = useQuery<ShiftType[]>({
    queryKey: ["shift-types", hospitalId],
    queryFn: () => apiRequest("GET", `/api/shift-types/${hospitalId}`).then((r) => r.json()),
    enabled: open,
  });

  // Fetch allowed staff roles for this user (based on unit/permission assignments)
  const { data: allowedRoles } = useQuery<string[]>({
    queryKey: [`/api/anesthesia/allowed-staff-roles/${hospitalId}/${userId}`],
    enabled: open && !!userId,
  });

  async function save(clearAll = false) {
    setSaving(true);
    try {
      const resolvedShiftTypeId = clearAll ? null : shiftTypeId === NONE_VALUE ? null : shiftTypeId;
      const resolvedRole = clearAll ? null : role === NONE_VALUE ? null : role;

      console.log('[StaffShiftPopover save]', { isBulk, bulkDatesInternal, resolvedShiftTypeId, resolvedRole, userId, date });

      if (isBulk && bulkDatesInternal.length > 0) {
        const items = bulkDatesInternal.map((d) => ({
          userId,
          date: d,
          shiftTypeId: resolvedShiftTypeId,
          role: resolvedRole,
        }));
        await apiRequest("POST", `/api/staff-shifts/${hospitalId}/assign/bulk`, { items });
      } else {
        const body = {
          userId,
          date,
          shiftTypeId: resolvedShiftTypeId,
          role: resolvedRole,
        };
        await apiRequest("POST", `/api/staff-shifts/${hospitalId}/assign`, body);
      }

      await queryClient.invalidateQueries({ queryKey: ["staff-shifts"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-pool"] });
      await queryClient.invalidateQueries({ queryKey: ["staff-pool-range"] });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: t("common.error", "Error"),
        description: err instanceof Error ? err.message : t("common.unknownError", "Something went wrong"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-80"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-3">
          {/* Header */}
          <div>
            <p className="font-medium text-sm">{userName}</p>
            {isBulk && bulkDatesInternal.length > 1 ? (
              <p className="text-xs text-muted-foreground">
                {t("shifts.assignToDays", "Assign to {{count}} days", { count: bulkDatesInternal.length })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{date}</p>
            )}
          </div>

          {/* Absence info (single-cell mode only) */}
          {!isBulk && <AbsenceInfoBlock absence={absence ?? null} />}

          {/* Role select */}
          <div className="space-y-1">
            <Label className="text-xs">{t("shifts.role", "Role")}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={t("shifts.noRole", "Not in Saal")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <span className="text-muted-foreground">{t("shifts.noRole", "Not in Saal")}</span>
                </SelectItem>
                {STAFF_ROLES
                  .filter((r) => !allowedRoles || allowedRoles.includes(r))
                  .map((r) => {
                    const config = ROLE_CONFIG[r];
                    return (
                      <SelectItem key={r} value={r}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded-sm inline-block ${config?.bgClass}`} />
                          {t(config?.labelKey || r)}
                        </span>
                      </SelectItem>
                    );
                  })}
              </SelectContent>
            </Select>
          </div>

          {/* Shift select */}
          <div className="space-y-1">
            <Label className="text-xs">{t("shifts.shift", "Shift")}</Label>
            <Select value={shiftTypeId} onValueChange={setShiftTypeId} disabled={loadingShiftTypes}>
              <SelectTrigger className="h-8 text-xs">
                {loadingShiftTypes ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <SelectValue placeholder={t("shifts.noShift", "No shift")} />
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>
                  <span className="text-muted-foreground">{t("shifts.noShift", "No shift")}</span>
                </SelectItem>
                {shiftTypes.map((st) => {
                  const overlaps = absence ? shiftOverlapsAbsence(st, absence) : false;
                  return (
                    <SelectItem key={st.id} value={st.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-sm flex-shrink-0"
                          style={{ backgroundColor: st.color }}
                        />
                        <span>{st.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">
                          {st.startTime}–{st.endTime}
                        </span>
                        {overlaps && (
                          <AlertCircle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              className="flex-1"
              onClick={() => save(false)}
              disabled={saving}
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              {t("common.save", "Save")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => save(true)}
              disabled={saving}
            >
              {t("shifts.clearAll", "Clear all")}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
