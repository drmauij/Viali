import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Pencil, Trash2,
  Sun, Moon, SunMoon, Phone, BedDouble, Stethoscope,
  Clock, AlarmClock, Calendar, Zap,
  type LucideIcon,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ShiftType {
  id: string;
  hospitalId: string;
  unitId: string | null;
  name: string;
  code: string;
  icon: string | null;
  color: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Unit {
  id: string;
  name: string;
  type: string | null;
}

const ICON_MAP: Record<string, { component: LucideIcon; label: string }> = {
  "sun": { component: Sun, label: "Sun" },
  "moon": { component: Moon, label: "Moon" },
  "sun-moon": { component: SunMoon, label: "Sun/Moon" },
  "phone": { component: Phone, label: "Phone" },
  "bed-double": { component: BedDouble, label: "Bed" },
  "stethoscope": { component: Stethoscope, label: "Stethoscope" },
  "clock": { component: Clock, label: "Clock" },
  "alarm-clock": { component: AlarmClock, label: "Alarm" },
  "calendar": { component: Calendar, label: "Calendar" },
  "zap": { component: Zap, label: "Zap" },
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const DEFAULT_FORM = {
  name: "",
  code: "",
  icon: "",
  color: "#6366f1",
  startTime: "08:00",
  endTime: "16:00",
  unitId: "",
  sortOrder: "0",
};

export default function ClinicShiftTypes() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShiftType, setEditingShiftType] = useState<ShiftType | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [shiftTypeToDelete, setShiftTypeToDelete] = useState<ShiftType | null>(null);

  const [formData, setFormData] = useState({ ...DEFAULT_FORM });

  const activeHospital = useMemo(() => {
    const userHospitals = (user as any)?.hospitals;
    if (!userHospitals || userHospitals.length === 0) return null;

    const savedHospitalKey = localStorage.getItem("activeHospital");
    if (savedHospitalKey) {
      const saved = userHospitals.find(
        (h: any) => `${h.id}-${h.unitId}-${h.role}` === savedHospitalKey
      );
      if (saved) return saved;
    }

    return userHospitals[0];
  }, [user]);

  const hospitalId = activeHospital?.id;

  const { data: shiftTypes = [], isLoading } = useQuery<ShiftType[]>({
    queryKey: ["/api/shift-types", hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/shift-types/${hospitalId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch shift types");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const { data: units = [] } = useQuery<Unit[]>({
    queryKey: ["/api/units", hospitalId],
    queryFn: async () => {
      const res = await fetch(`/api/units/${hospitalId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch units");
      return res.json();
    },
    enabled: !!hospitalId,
  });

  const unitMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of units) {
      map[u.id] = u.name;
    }
    return map;
  }, [units]);

  const createMutation = useMutation({
    mutationFn: async (data: Omit<ShiftType, "id" | "hospitalId" | "createdAt" | "updatedAt">) => {
      return apiRequest("POST", `/api/shift-types/${hospitalId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-types", hospitalId] });
      setDialogOpen(false);
      resetForm();
      toast({ title: t("shifts.settings.created", "Shift type created") });
    },
    onError: () => {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: Partial<Omit<ShiftType, "hospitalId" | "createdAt" | "updatedAt">> & { id: string }) => {
      return apiRequest("PATCH", `/api/shift-types/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-types", hospitalId] });
      setDialogOpen(false);
      setEditingShiftType(null);
      resetForm();
      toast({ title: t("shifts.settings.updated", "Shift type updated") });
    },
    onError: () => {
      toast({ title: t("common.error", "Error"), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/shift-types/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 409) {
        const body = await res.json();
        throw Object.assign(new Error("in_use"), { usageCount: body.usageCount });
      }
      if (!res.ok) {
        throw new Error("Failed to delete shift type");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shift-types", hospitalId] });
      setDeleteDialogOpen(false);
      setShiftTypeToDelete(null);
      toast({ title: t("shifts.settings.deleted", "Shift type deleted") });
    },
    onError: (error: any) => {
      setDeleteDialogOpen(false);
      setShiftTypeToDelete(null);
      if (error.message === "in_use") {
        const count = error.usageCount ?? "some";
        toast({
          title: t("shifts.settings.deleteInUse", "Cannot delete — shift type is in use"),
          description: t(
            "shifts.settings.deleteInUseCount",
            `Used in ${count} shift(s). Remove those shifts first.`,
            { count }
          ),
          variant: "destructive",
        });
      } else {
        toast({ title: t("common.error", "Error"), variant: "destructive" });
      }
    },
  });

  const resetForm = () => {
    setFormData({ ...DEFAULT_FORM });
  };

  const handleOpenCreate = () => {
    setEditingShiftType(null);
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (st: ShiftType) => {
    setEditingShiftType(st);
    setFormData({
      name: st.name,
      code: st.code,
      icon: st.icon ?? "",
      color: st.color,
      startTime: st.startTime,
      endTime: st.endTime,
      unitId: st.unitId ?? "",
      sortOrder: String(st.sortOrder),
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({
        title: t("shifts.settings.nameRequired", "Name is required"),
        variant: "destructive",
      });
      return;
    }
    if (!formData.code.trim()) {
      toast({
        title: t("shifts.settings.codeRequired", "Code is required"),
        variant: "destructive",
      });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      code: formData.code.trim().toUpperCase(),
      icon: formData.icon || null,
      color: formData.color,
      startTime: formData.startTime,
      endTime: formData.endTime,
      unitId: formData.unitId || null,
      sortOrder: parseInt(formData.sortOrder, 10) || 0,
    };

    if (editingShiftType) {
      updateMutation.mutate({ id: editingShiftType.id, ...payload });
    } else {
      createMutation.mutate(payload as any);
    }
  };

  const handleConfirmDelete = () => {
    if (shiftTypeToDelete) {
      deleteMutation.mutate(shiftTypeToDelete.id);
    }
  };

  const sorted = useMemo(
    () => [...shiftTypes].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [shiftTypes]
  );

  if (!hospitalId) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("common.noHospitalSelected", "No hospital selected")}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {t("shifts.settings.title", "Shift Types")}
        </h1>
        <Button onClick={handleOpenCreate} data-testid="button-add-shift-type">
          <Plus className="h-4 w-4 mr-2" />
          {t("shifts.settings.add", "Add")}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("shifts.settings.empty", "No shift types yet. Add one to get started.")}
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2 font-medium text-muted-foreground w-8"></th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                  {t("shifts.settings.colName", "Name")}
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden sm:table-cell">
                  {t("shifts.settings.colCode", "Code")}
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden md:table-cell">
                  {t("shifts.settings.colTime", "Time")}
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell">
                  {t("shifts.settings.colUnit", "Unit")}
                </th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground hidden lg:table-cell w-16">
                  {t("shifts.settings.colOrder", "Order")}
                </th>
                <th className="w-20"></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((st) => (
                <tr
                  key={st.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                  data-testid={`row-shift-type-${st.id}`}
                >
                  {/* Color swatch */}
                  <td className="px-4 py-3">
                    <span
                      className="inline-block w-4 h-4 rounded-sm border border-border/50 shrink-0"
                      style={{ backgroundColor: st.color }}
                    />
                  </td>
                  {/* Name + icon */}
                  <td className="px-4 py-3 font-medium">
                    <span className="flex items-center gap-1.5">
                      {st.icon && ICON_MAP[st.icon] && (
                        (() => { const I = ICON_MAP[st.icon!].component; return <I className="h-4 w-4 text-muted-foreground" />; })()
                      )}
                      {st.name}
                    </span>
                  </td>
                  {/* Code */}
                  <td className="px-4 py-3 hidden sm:table-cell">
                    <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                      {st.code}
                    </span>
                  </td>
                  {/* Time range */}
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {st.startTime} – {st.endTime}
                  </td>
                  {/* Unit */}
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                    {st.unitId ? (unitMap[st.unitId] ?? st.unitId) : t("shifts.settings.allUnits", "All units")}
                  </td>
                  {/* Sort order */}
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell text-center">
                    {st.sortOrder}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(st)}
                        data-testid={`button-edit-shift-type-${st.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setShiftTypeToDelete(st);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`button-delete-shift-type-${st.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editingShiftType
                ? t("shifts.settings.edit", "Edit Shift Type")
                : t("shifts.settings.addTitle", "Add Shift Type")}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto min-h-0 flex-1 pr-2">
            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="st-name">
                {t("shifts.settings.fieldName", "Name")} *
              </Label>
              <Input
                id="st-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t("shifts.settings.namePlaceholder", "e.g. Day Shift")}
                data-testid="input-shift-type-name"
              />
            </div>

            {/* Code */}
            <div className="space-y-2">
              <Label htmlFor="st-code">
                {t("shifts.settings.fieldCode", "Code")} *
              </Label>
              <Input
                id="st-code"
                value={formData.code}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    code: e.target.value.toUpperCase().slice(0, 4),
                  })
                }
                placeholder="DAY"
                maxLength={4}
                data-testid="input-shift-type-code"
              />
              <p className="text-xs text-muted-foreground">
                {t("shifts.settings.codeHint", "Up to 4 characters, shown on the calendar.")}
              </p>
            </div>

            {/* Icon */}
            <div className="space-y-2">
              <Label htmlFor="st-icon">
                {t("shifts.settings.fieldIcon", "Icon")}
              </Label>
              <Select
                value={formData.icon || "__none__"}
                onValueChange={(v) =>
                  setFormData({ ...formData, icon: v === "__none__" ? "" : v })
                }
              >
                <SelectTrigger id="st-icon" data-testid="select-shift-type-icon">
                  <SelectValue placeholder={t("shifts.settings.iconNone", "None")}>
                    {formData.icon && ICON_MAP[formData.icon] ? (
                      <span className="inline-flex items-center gap-2">
                        {(() => { const I = ICON_MAP[formData.icon].component; return <I className="h-4 w-4" />; })()}
                        {ICON_MAP[formData.icon].label}
                      </span>
                    ) : (
                      t("shifts.settings.iconNone", "None")
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("shifts.settings.iconNone", "None")}
                  </SelectItem>
                  {ICON_OPTIONS.map((key) => {
                    const { component: Icon, label } = ICON_MAP[key];
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="inline-flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Color */}
            <div className="space-y-2">
              <Label htmlFor="st-color">
                {t("shifts.settings.fieldColor", "Color")}
              </Label>
              <div className="flex items-center gap-3">
                <input
                  id="st-color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="h-9 w-16 cursor-pointer rounded border border-input bg-background p-0.5"
                  data-testid="input-shift-type-color"
                />
                <span className="text-sm text-muted-foreground font-mono">
                  {formData.color}
                </span>
              </div>
            </div>

            {/* Time range */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="st-start">
                  {t("shifts.settings.fieldStartTime", "Start Time")}
                </Label>
                <Input
                  id="st-start"
                  type="time"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  data-testid="input-shift-type-start-time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="st-end">
                  {t("shifts.settings.fieldEndTime", "End Time")}
                </Label>
                <Input
                  id="st-end"
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  data-testid="input-shift-type-end-time"
                />
              </div>
            </div>

            {/* Unit */}
            <div className="space-y-2">
              <Label htmlFor="st-unit">
                {t("shifts.settings.fieldUnit", "Unit")}
              </Label>
              <Select
                value={formData.unitId || "__all__"}
                onValueChange={(v) =>
                  setFormData({ ...formData, unitId: v === "__all__" ? "" : v })
                }
              >
                <SelectTrigger id="st-unit" data-testid="select-shift-type-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">
                    {t("shifts.settings.allUnits", "All units")}
                  </SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sort order */}
            <div className="space-y-2">
              <Label htmlFor="st-order">
                {t("shifts.settings.fieldSortOrder", "Sort Order")}
              </Label>
              <Input
                id="st-order"
                type="number"
                min="0"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: e.target.value })}
                data-testid="input-shift-type-sort-order"
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-shift-type"
            >
              {editingShiftType ? t("common.save", "Save") : t("common.create", "Create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("shifts.settings.deleteTitle", "Delete Shift Type?")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "shifts.settings.deleteDescription",
                `"${shiftTypeToDelete?.name}" will be permanently deleted.`,
                { name: shiftTypeToDelete?.name }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-shift-type"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
