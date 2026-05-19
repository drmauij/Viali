import { useState, useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Users,
  CheckCircle2,
  Clock,
  Mail,
  AlertCircle,
  Send,
  Eye,
  Loader2,
} from "lucide-react";
import { StammblattStatusBadge, type StammblattStatus } from "@/components/stammblatt/StammblattStatusBadge";

// ─── Types (mirror of SimplifiedStaff) ───────────────────────────────────────

interface RoleInfo {
  role: string;
  unitId: string | null;
  unitName: string | null;
  unitType: string | null;
}

interface WorkerPortalData {
  firstName: string | null;
  lastName: string | null;
  profession: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  dateOfBirth: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  religion: string | null;
  mobile: string | null;
  ahvNumber: string | null;
  hasChildBenefits: boolean | null;
  numberOfChildren: number | null;
  childBenefitsRecipient: string | null;
  childBenefitsRegistration: string | null;
  hasResidencePermit: boolean | null;
  residencePermitType: string | null;
  residencePermitValidUntil: string | null;
  bankName: string | null;
  bankAddress: string | null;
  bankAccount: string | null;
  hasOwnVehicle: boolean | null;
  lastAccessedAt: string | null;
}

export interface StaffMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  roles: RoleInfo[];
  staffType: "internal" | "external";
  hourlyRate: number | null;
  weeklyTargetHours: number | null;
  overtimeBalanceMinutes: number | null;
  annualVacationDays: number | null;
  canLogin: boolean;
  createdAt: string | null;
  workerPortal: WorkerPortalData | null;
  stammblatt: StammblattStatus;
}

export interface StammblattTabProps {
  hospitalId: string;
  staffList: StaffMember[];
  isLoadingStaff: boolean;
  onViewStaffDetails: (staff: StaffMember) => void;
}

// ─── Helpers (same logic as SimplifiedStaff) ─────────────────────────────────

function isPlaceholderEmail(email: string | null): boolean {
  if (!email) return true;
  const lower = email.toLowerCase();
  return lower.endsWith("@staff.local") || lower.endsWith("@internal.local");
}

function getDisplayName(staff: StaffMember): string {
  const firstName = staff.firstName || "";
  const lastName = staff.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim();
  if (!fullName) return staff.email || "Unbekannt";
  const isDoctor = staff.roles?.some((r) => r.role === "doctor");
  if (isDoctor) return `Dr. ${fullName}`;
  return fullName;
}

function getRoleLabel(role: string, roleInfo: RoleInfo): string {
  const { unitType, unitName } = roleInfo;
  if (role === "doctor") {
    if (unitType === "anesthesia") return "Anesthesiologist";
    if (unitType === "or") return "Surgeon";
    return "Doctor";
  }
  if (role === "nurse") {
    if (unitType === "anesthesia") return "Anesthesia Nurse";
    if (unitType === "or") return "OR Nurse";
    return "Nurse";
  }
  if (role === "manager") return "Manager";
  const cap = role.charAt(0).toUpperCase() + role.slice(1);
  return unitName ? `${cap} @ ${unitName}` : cap;
}

function getRoleBadgeStyle(role: string, roleInfo: RoleInfo): string {
  const { unitType } = roleInfo;
  if (role === "doctor" && unitType === "or") return "border-red-500/50 text-red-600 dark:text-red-400";
  if (role === "doctor" && unitType === "anesthesia") return "border-blue-500/50 text-blue-600 dark:text-blue-400";
  if (role === "doctor") return "border-blue-500/50 text-blue-600 dark:text-blue-400";
  if (role === "nurse" && unitType === "or") return "border-green-500/50 text-green-600 dark:text-green-400";
  if (role === "nurse" && unitType === "anesthesia") return "border-orange-500/50 text-orange-600 dark:text-orange-400";
  if (role === "nurse") return "border-teal-500/50 text-teal-600 dark:text-teal-400";
  if (role === "manager") return "border-purple-500/50 text-purple-600 dark:text-purple-400";
  return "border-gray-500/50 text-gray-600 dark:text-gray-400";
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "heute";
  if (diffDays === 1) return "vor 1d";
  return `vor ${diffDays}d`;
}

// ─── KPI Tile ────────────────────────────────────────────────────────────────

interface KpiTileProps {
  title: string;
  count: number;
  total: number;
  icon: React.ReactNode;
  colorClass: string;
}

function KpiTile({ title, count, total, icon, colorClass }: KpiTileProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${colorClass}`}>{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground mt-1">/ {total} Mitarbeitende</p>
      </CardContent>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function StammblattTab({
  hospitalId,
  staffList,
  isLoadingStaff,
  onViewStaffDetails,
}: StammblattTabProps) {
  const { toast } = useToast();
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);

  // ── Mutations ───────────────────────────────────────────────────────────────
  const inviteMutation = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", `/api/business/${hospitalId}/staff/${userId}/stammblatt-invite`).then((r) =>
        r.json()
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/staff`] });
      toast({ title: "Einladung verschickt" });
    },
    onError: () => {
      toast({ title: "Fehler beim Versenden", variant: "destructive" });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/business/${hospitalId}/staff/stammblatt-invite/bulk`, {
        scope: "all_incomplete",
      }).then((r) => r.json()),
    onSuccess: (res: { sent: number; skipped: Array<{ userId: string; reason: string }> }) => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${hospitalId}/staff`] });
      toast({
        title: `${res.sent} Einladungen verschickt`,
        description: res.skipped.length > 0 ? `${res.skipped.length} übersprungen` : undefined,
      });
      setIsBulkConfirmOpen(false);
    },
    onError: () => {
      toast({ title: "Fehler beim Massenversand", variant: "destructive" });
      setIsBulkConfirmOpen(false);
    },
  });

  // ── Derived values ──────────────────────────────────────────────────────────
  const total = staffList.length;

  const kpiCounts = useMemo(
    () => ({
      submitted: staffList.filter((s) => s.stammblatt?.status === "submitted").length,
      in_progress: staffList.filter((s) => s.stammblatt?.status === "in_progress").length,
      invited: staffList.filter((s) => s.stammblatt?.status === "invited").length,
      missing: staffList.filter((s) => s.stammblatt?.status === "missing").length,
    }),
    [staffList]
  );

  const eligibleBulkCount = useMemo(
    () =>
      staffList.filter(
        (s) =>
          s.stammblatt?.status !== "submitted" &&
          s.email &&
          !isPlaceholderEmail(s.email)
      ).length,
    [staffList]
  );

  const filteredList = useMemo(() => {
    if (!onlyIncomplete) return staffList;
    return staffList.filter((s) => s.stammblatt?.status !== "submitted");
  }, [staffList, onlyIncomplete]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile
          title="Erhalten"
          count={kpiCounts.submitted}
          total={total}
          icon={<CheckCircle2 className="h-4 w-4" />}
          colorClass="bg-green-500/10 text-green-600"
        />
        <KpiTile
          title="In Bearbeitung"
          count={kpiCounts.in_progress}
          total={total}
          icon={<Clock className="h-4 w-4" />}
          colorClass="bg-blue-500/10 text-blue-600"
        />
        <KpiTile
          title="Eingeladen"
          count={kpiCounts.invited}
          total={total}
          icon={<Mail className="h-4 w-4" />}
          colorClass="bg-amber-500/10 text-amber-600"
        />
        <KpiTile
          title="Fehlt"
          count={kpiCounts.missing}
          total={total}
          icon={<AlertCircle className="h-4 w-4" />}
          colorClass="bg-red-500/10 text-red-600"
        />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <Button
          variant={onlyIncomplete ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyIncomplete((v) => !v)}
        >
          Nur unvollständig anzeigen
        </Button>
        <Button
          size="sm"
          disabled={eligibleBulkCount === 0}
          onClick={() => setIsBulkConfirmOpen(true)}
        >
          <Send className="h-4 w-4 mr-2" />
          Alle einladen ({eligibleBulkCount})
        </Button>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoadingStaff ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">
                {onlyIncomplete
                  ? "Alle Personalstammblätter sind vollständig."
                  : "Keine Mitarbeitenden gefunden."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitarbeiter</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Letzte Einladung</TableHead>
                    <TableHead className="text-right">Aktion</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredList.map((staff) => {
                    const sb = staff.stammblatt;
                    const placeholder = isPlaceholderEmail(staff.email);
                    const isSubmitted = sb?.status === "submitted";

                    return (
                      <TableRow key={staff.id}>
                        {/* Mitarbeiter */}
                        <TableCell className="font-medium">
                          <div>
                            <span>{getDisplayName(staff)}</span>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {staff.roles?.map((role, idx) => (
                                <Badge
                                  key={`${staff.id}-${role.role}-${role.unitId || idx}`}
                                  variant="outline"
                                  className={`text-xs ${getRoleBadgeStyle(role.role, role)}`}
                                >
                                  {getRoleLabel(role.role, role)}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </TableCell>

                        {/* E-Mail */}
                        <TableCell>
                          {placeholder ? (
                            <div>
                              <span className="line-through text-muted-foreground text-sm">
                                {staff.email ?? "—"}
                              </span>
                              <div className="text-xs text-muted-foreground">Keine gültige E-Mail</div>
                            </div>
                          ) : (
                            <span className="text-sm">{staff.email}</span>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell>
                          <StammblattStatusBadge value={sb} />
                        </TableCell>

                        {/* Letzte Einladung */}
                        <TableCell className="text-sm text-muted-foreground">
                          {relativeTime(sb?.lastInvitedAt)}
                        </TableCell>

                        {/* Aktion */}
                        <TableCell className="text-right">
                          {isSubmitted ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => onViewStaffDetails(staff)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Anzeigen
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Stammblatt anzeigen</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={placeholder || inviteMutation.isPending}
                                    onClick={() => inviteMutation.mutate(staff.id)}
                                  >
                                    {inviteMutation.isPending ? (
                                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    ) : (
                                      <Send className="h-4 w-4 mr-1" />
                                    )}
                                    {sb?.status === "missing" ? "Einladen" : "Erneut senden"}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {placeholder
                                    ? "Keine gültige E-Mail-Adresse hinterlegt"
                                    : sb?.status === "missing"
                                    ? "Einladung senden"
                                    : "Einladung erneut senden"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk confirm dialog */}
      <Dialog open={isBulkConfirmOpen} onOpenChange={setIsBulkConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Masseneinladung senden</DialogTitle>
            <DialogDescription>
              Es werden Einladungen an <strong>{eligibleBulkCount}</strong> Mitarbeitende ohne
              vollständiges Stammblatt versandt. Fortfahren?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkConfirmOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={() => bulkMutation.mutate()} disabled={bulkMutation.isPending}>
              {bulkMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Jetzt senden
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
