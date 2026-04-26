import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { UserPlus, X } from "lucide-react";

interface TeamMember {
  roleId: string;
  userId: string;
  hospitalId: string;
  hospitalName: string;
  unitId: string | null;
  unitName: string | null;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface StaffGroup {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  rows: TeamMember[];
  hospitalCount: number;
}
interface TeamResponse {
  admins: TeamMember[];
  staff: TeamMember[];
}

interface UserSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

/**
 * Inner section (no page wrapper, no h1). Mounted both at the standalone
 * /chain/team route and inside the Team tab of /chain/admin.
 */
export function ChainTeamSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const queryClient = useQueryClient();
  const groupId = activeHospital?.groupId ?? null;
  const activeHospitalId = activeHospital?.id;
  const [promoteSearch, setPromoteSearch] = useState("");
  const [openStaff, setOpenStaff] = useState<StaffGroup | null>(null);

  const { data, isLoading } = useQuery<TeamResponse>({
    queryKey: [`/api/chain/${groupId}/team`],
    enabled: !!groupId,
  });

  const { data: searchResults } = useQuery<UserSearchResult[]>({
    queryKey: ["/api/business/group/users", promoteSearch],
    queryFn: () =>
      apiRequest("GET", `/api/business/group/users?q=${encodeURIComponent(promoteSearch)}`).then((r) => r.json()),
    enabled: !!groupId && promoteSearch.length >= 2,
  });

  // Hide users who are already chain admins from promote-candidate results.
  // Server can do this too; doing it client-side avoids double round-trips
  // and keeps the search endpoint general-purpose.
  const adminUserIds = new Set((data?.admins ?? []).map((a) => a.userId));
  const promotableResults = (searchResults ?? []).filter((u) => !adminUserIds.has(u.id));

  const promote = useMutation({
    mutationFn: (userId: string) =>
      apiRequest("POST", "/api/business/group/admins", {
        userId,
        hospitalId: activeHospitalId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/team`] });
      setPromoteSearch("");
      toast({ title: t("chain.team.promoted", "User promoted to chain admin") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" }),
  });

  const revoke = useMutation({
    mutationFn: ({ userId, hospitalId }: { userId: string; hospitalId: string }) =>
      apiRequest("DELETE", `/api/business/group/admins/${userId}/${hospitalId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/team`] });
      toast({ title: t("chain.team.revoked", "Chain admin revoked") });
    },
    onError: (e: any) =>
      toast({ title: t("common.error", "Error"), description: e?.message, variant: "destructive" }),
  });

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-team-no-group">
        {t("chain.team.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  const fullName = (m: { firstName: string | null; lastName: string | null; email: string | null; userId?: string; id?: string }) =>
    [m.firstName, m.lastName].filter(Boolean).join(" ") || m.email || (m.userId ?? m.id ?? "—");

  // Same idea for chain admins — server returns one row per (userId, hospitalId)
  // group_admin assignment. A user with admin rights at every member clinic
  // appears N times. Group by user so the table shows one row per person with
  // the list of hospitals as compact badges.
  type AdminGroup = {
    userId: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    hospitals: Array<{ hospitalId: string; hospitalName: string; roleId: string }>;
  };
  const adminGroups = useMemo<AdminGroup[]>(() => {
    const map = new Map<string, AdminGroup>();
    for (const m of data?.admins ?? []) {
      const existing = map.get(m.userId);
      const entry = { hospitalId: m.hospitalId, hospitalName: m.hospitalName, roleId: m.roleId };
      if (existing) {
        existing.hospitals.push(entry);
      } else {
        map.set(m.userId, {
          userId: m.userId,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          hospitals: [entry],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => fullName(a).localeCompare(fullName(b)));
  }, [data?.admins]);

  // Collapse the flat staff list (one row per user×hospital×unit×role) into one
  // entry per user, keeping all assignments in `rows` for the dialog.
  const staffGroups = useMemo<StaffGroup[]>(() => {
    const map = new Map<string, StaffGroup>();
    for (const m of data?.staff ?? []) {
      const existing = map.get(m.userId);
      if (existing) {
        existing.rows.push(m);
      } else {
        map.set(m.userId, {
          userId: m.userId,
          firstName: m.firstName,
          lastName: m.lastName,
          email: m.email,
          rows: [m],
          hospitalCount: 0,
        });
      }
    }
    for (const g of map.values()) {
      g.hospitalCount = new Set(g.rows.map(r => r.hospitalId)).size;
    }
    return Array.from(map.values()).sort((a, b) =>
      fullName(a).localeCompare(fullName(b))
    );
  }, [data?.staff]);

  return (
    <div className="space-y-6" data-testid="chain-team">
      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">{t("common.loading", "Loading...")}</div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("chain.team.adminsTitle", "Chain administrators")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("chain.team.name", "Name")}</TableHead>
                    <TableHead>{t("chain.team.email", "Email")}</TableHead>
                    <TableHead>{t("chain.team.atHospital", "Promoted at")}</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminGroups.map((g) => (
                    <TableRow key={g.userId} data-testid={`row-admin-${g.userId}`}>
                      <TableCell className="font-medium">{fullName(g)}</TableCell>
                      <TableCell className="text-muted-foreground">{g.email ?? "—"}</TableCell>
                      <TableCell>
                        {g.hospitals.length === 1 ? (
                          <Badge variant="outline">{g.hospitals[0].hospitalName}</Badge>
                        ) : (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="cursor-help">
                                {t("chain.team.nLocations", "{{n}} locations", { n: g.hospitals.length })}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="flex flex-col gap-1">
                                {g.hospitals.map((h) => (
                                  <span key={h.hospitalId}>{h.hospitalName}</span>
                                ))}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            // Revoke at every member hospital — chain admin
                            // status is conceptually one assignment, even when
                            // it's stored as N rows in user_hospital_roles.
                            for (const h of g.hospitals) {
                              revoke.mutate({ userId: g.userId, hospitalId: h.hospitalId });
                            }
                          }}
                          title={t("chain.team.revoke", "Revoke")}
                          data-testid={`revoke-admin-${g.userId}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="mt-4 space-y-2">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("chain.team.searchPlaceholder", "Search user by name or email…")}
                    value={promoteSearch}
                    onChange={(e) => setPromoteSearch(e.target.value)}
                    data-testid="input-promote-search"
                  />
                </div>
                {promotableResults.length > 0 && (
                  <div className="border rounded-md divide-y">
                    {promotableResults.slice(0, 8).map((u) => (
                      <div key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span>{fullName(u)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => promote.mutate(u.id)}
                          data-testid={`promote-${u.id}`}
                        >
                          {t("chain.team.promote", "Promote")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("chain.team.staffTitle", "Staff across the chain")}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("chain.team.name", "Name")}</TableHead>
                    <TableHead>{t("chain.team.email", "Email")}</TableHead>
                    <TableHead>{t("chain.team.assignments", "Assignments")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffGroups.map((g) => (
                    <TableRow
                      key={g.userId}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setOpenStaff(g)}
                      data-testid={`row-staff-${g.userId}`}
                    >
                      <TableCell className="font-medium">{fullName(g)}</TableCell>
                      <TableCell className="text-muted-foreground">{g.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {g.hospitalCount === 1
                            ? t("chain.team.oneLocation", "1 location")
                            : t("chain.team.nLocations", "{{n}} locations", { n: g.hospitalCount })}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {staffGroups.length === 0 && (
                <div className="text-center text-muted-foreground p-6 text-sm">
                  {t("chain.team.staffEmpty", "No staff yet across the chain.")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!openStaff} onOpenChange={(o) => !o && setOpenStaff(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{openStaff ? fullName(openStaff) : ""}</DialogTitle>
            <DialogDescription>
              {openStaff?.email ?? t("chain.team.assignmentsDescription", "Per-location roles and units")}
            </DialogDescription>
          </DialogHeader>
          {openStaff && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("chain.team.atHospital", "Location")}</TableHead>
                  <TableHead>{t("chain.team.unit", "Unit")}</TableHead>
                  <TableHead>{t("chain.team.role", "Role")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openStaff.rows.map((r) => (
                  <TableRow key={r.roleId} data-testid={`assignment-${r.roleId}`}>
                    <TableCell className="font-medium">{r.hospitalName}</TableCell>
                    <TableCell className="text-muted-foreground">{r.unitName ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{r.role}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Standalone /chain/team page. Wraps the section with the page-level header.
 * The Team tab on /chain/admin renders ChainTeamSection directly.
 */
export default function ChainTeam() {
  const { t } = useTranslation();
  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">{t("chain.team.title", "Team")}</h1>
        <p className="text-muted-foreground mt-1">
          {t(
            "chain.team.subtitle",
            "Chain administrators and staff across every clinic in the chain",
          )}
        </p>
      </div>
      <ChainTeamSection />
    </div>
  );
}
