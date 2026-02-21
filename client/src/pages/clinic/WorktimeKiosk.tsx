import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { calculateWorkHours } from "@/lib/worktimeUtils";
import { format } from "date-fns";
import { ArrowLeft, Search, Clock, User } from "lucide-react";
import { useLocation } from "wouter";

interface StaffUser {
  id: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    profileImageUrl: string | null;
    canLogin: boolean;
    staffType: string;
  };
  role: string;
  unitId: string;
  units: {
    id: string;
    name: string;
    type: string | null;
  };
}

export default function WorktimeKiosk() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const { user: currentUser } = useAuth();
  const [, setLocation] = useLocation();

  const [search, setSearch] = useState("");
  const [unitFilter, setUnitFilter] = useState<string>("all");
  const [selectedStaff, setSelectedStaff] = useState<StaffUser | null>(null);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const today = format(new Date(), "yyyy-MM-dd");
  const [formData, setFormData] = useState({
    workDate: today,
    timeStart: "08:00",
    timeEnd: "17:00",
    pauseMinutes: 30,
    notes: "",
  });

  const hospitalId = activeHospital?.id;

  // Fetch staff list
  const { data: staffList = [], isLoading } = useQuery<StaffUser[]>({
    queryKey: [`/api/admin/${hospitalId}/users`],
    enabled: !!hospitalId,
  });

  // Get unique units for filter
  const units = useMemo(() => {
    const unitMap = new Map<string, string>();
    staffList.forEach((s) => {
      if (s.units?.id && s.units?.name) {
        unitMap.set(s.units.id, s.units.name);
      }
    });
    return Array.from(unitMap.entries()).map(([id, name]) => ({ id, name }));
  }, [staffList]);

  // Deduplicate staff by user ID and apply filters
  const filteredStaff = useMemo(() => {
    const seen = new Map<string, StaffUser>();
    staffList.forEach((s) => {
      if (!seen.has(s.user.id)) {
        seen.set(s.user.id, s);
      }
    });
    let result = Array.from(seen.values());

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          (s.user.firstName || "").toLowerCase().includes(q) ||
          (s.user.lastName || "").toLowerCase().includes(q)
      );
    }

    if (unitFilter !== "all") {
      result = result.filter((s) => s.units?.id === unitFilter);
    }

    result.sort((a, b) => {
      const nameA = `${a.user.lastName || ""} ${a.user.firstName || ""}`.toLowerCase();
      const nameB = `${b.user.lastName || ""} ${b.user.firstName || ""}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });

    return result;
  }, [staffList, search, unitFilter]);

  const createMutation = useMutation({
    mutationFn: async (staffUserId: string) => {
      const res = await apiRequest("POST", `/api/hospitals/${hospitalId}/worktime-logs`, {
        userId: staffUserId,
        ...formData,
        pauseMinutes: Number(formData.pauseMinutes),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: t("worktime.entrySaved", "Entry saved") });
      setEntryDialogOpen(false);
      setSelectedStaff(null);
      setFormData({
        workDate: today,
        timeStart: "08:00",
        timeEnd: "17:00",
        pauseMinutes: 30,
        notes: "",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/hospitals", hospitalId, "worktime-logs"] });
    },
    onError: () => {
      toast({ title: t("common.error"), variant: "destructive" });
    },
  });

  const handleStaffClick = (staff: StaffUser) => {
    setSelectedStaff(staff);
    setFormData({
      workDate: today,
      timeStart: "08:00",
      timeEnd: "17:00",
      pauseMinutes: 30,
      notes: "",
    });
    setEntryDialogOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    createMutation.mutate(selectedStaff.user.id);
  };

  const getInitials = (firstName?: string | null, lastName?: string | null) => {
    if (!firstName && !lastName) return "?";
    return `${firstName?.[0] || ""}${lastName?.[0] || ""}`.toUpperCase();
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      admin: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      doctor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      nurse: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      staff: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
      manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    };
    return (
      <Badge variant="outline" className={`text-xs ${colors[role] || colors.staff}`}>
        {t(`admin.role_${role}`, role)}
      </Badge>
    );
  };

  const netHours = calculateWorkHours(formData.timeStart, formData.timeEnd, Number(formData.pauseMinutes) || 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">{t("worktime.kioskTitle", "Staff Work Time")}</h1>
        </div>
      </div>

      {/* Filter bar */}
      <div className="px-4 py-3 border-b bg-card flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("worktime.searchStaff", "Search staff...")}
            className="pl-9"
          />
        </div>
        {units.length > 1 && (
          <Select value={unitFilter} onValueChange={setUnitFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder={t("worktime.allUnits", "All units")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("worktime.allUnits", "All units")}</SelectItem>
              {units.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Staff grid */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("common.loading", "Loading...")}
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            {t("worktime.noStaffFound", "No staff found")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {filteredStaff.map((staff) => (
              <Card
                key={staff.user.id}
                className="cursor-pointer hover:border-primary/50 hover:shadow-md transition-all active:scale-[0.98]"
                onClick={() => handleStaffClick(staff)}
              >
                <CardContent className="p-4 flex flex-col items-center text-center gap-2">
                  <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center text-lg font-semibold">
                    {staff.user.profileImageUrl ? (
                      <img
                        src={staff.user.profileImageUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      getInitials(staff.user.firstName, staff.user.lastName)
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-sm leading-tight">
                      {staff.user.firstName} {staff.user.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {staff.units?.name}
                    </div>
                  </div>
                  {getRoleBadge(staff.role)}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Entry Dialog */}
      <Dialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              {selectedStaff?.user.firstName} {selectedStaff?.user.lastName}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-sm">{t("worktime.date", "Date")}</Label>
                <Input
                  type="date"
                  value={formData.workDate}
                  onChange={(e) => setFormData({ ...formData, workDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label className="text-sm">{t("worktime.start", "Start")}</Label>
                <Input
                  type="time"
                  value={formData.timeStart}
                  onChange={(e) => setFormData({ ...formData, timeStart: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label className="text-sm">{t("worktime.end", "End")}</Label>
                <Input
                  type="time"
                  value={formData.timeEnd}
                  onChange={(e) => setFormData({ ...formData, timeEnd: e.target.value })}
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-sm">{t("worktime.pause", "Pause (min)")}</Label>
              <Input
                type="number"
                min="0"
                value={formData.pauseMinutes}
                onChange={(e) => setFormData({ ...formData, pauseMinutes: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div>
              <Label className="text-sm">{t("worktime.notes", "Notes")}</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder={t("worktime.notesPlaceholder", "Optional notes...")}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {t("worktime.netHours", "Net")}: <strong>{netHours}h</strong>
              </span>
              <Button type="submit" disabled={createMutation.isPending}>
                {t("worktime.logTime", "Log Time")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
