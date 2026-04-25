import { useState } from "react";
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
import { UserPlus, X } from "lucide-react";

interface TeamMember {
  roleId: string;
  userId: string;
  hospitalId: string;
  hospitalName: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
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

export default function ChainTeam() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const queryClient = useQueryClient();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const activeHospitalId = activeHospital?.id;
  const [promoteSearch, setPromoteSearch] = useState("");

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

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-team">
      <h1 className="text-2xl md:text-3xl font-bold">{t("chain.team.title", "Team")}</h1>

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
                  {(data?.admins ?? []).map((m) => (
                    <TableRow key={m.roleId} data-testid={`row-admin-${m.userId}`}>
                      <TableCell className="font-medium">{fullName(m)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{m.hospitalName}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => revoke.mutate({ userId: m.userId, hospitalId: m.hospitalId })}
                          title={t("chain.team.revoke", "Revoke")}
                          data-testid={`revoke-admin-${m.userId}`}
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
                {(searchResults ?? []).length > 0 && (
                  <div className="border rounded-md divide-y">
                    {searchResults!.slice(0, 8).map((u) => (
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
                    <TableHead>{t("chain.team.role", "Role")}</TableHead>
                    <TableHead>{t("chain.team.atHospital", "At hospital")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.staff ?? []).map((m) => (
                    <TableRow key={m.roleId} data-testid={`row-staff-${m.roleId}`}>
                      <TableCell className="font-medium">{fullName(m)}</TableCell>
                      <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                      <TableCell><Badge variant="outline">{m.role}</Badge></TableCell>
                      <TableCell>{m.hospitalName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {(data?.staff ?? []).length === 0 && (
                <div className="text-center text-muted-foreground p-6 text-sm">
                  {t("chain.team.staffEmpty", "No staff yet across the chain.")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
