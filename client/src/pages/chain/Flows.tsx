import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Trash2, Send, Users, BarChart3, CalendarCheck, TrendingUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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
import FlowsTable, { type FlowsTableMetricsRow } from "@/components/flows/FlowsTable";
import { formatCurrency } from "@/lib/dateUtils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tag } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ChainFlows() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const { data, isLoading } = useQuery<{ flows: any[] }>({
    queryKey: [`/api/chain/${groupId}/flows`],
    enabled: !!groupId,
  });

  const { data: metricsSummary } = useQuery<{
    since: string;
    rows: Array<FlowsTableMetricsRow & { flowId: string }>;
  }>({
    queryKey: [`/api/chain/${groupId}/flows/metrics/summary`],
    enabled: !!groupId,
  });

  const { data: promoCodes = [] } = useQuery<any[]>({
    queryKey: [`/api/chain/${groupId}/promo-codes`],
    enabled: !!groupId,
  });

  const STATS = useMemo(() => {
    const rows = metricsSummary?.rows ?? [];
    const totals = rows.reduce(
      (acc, r) => ({
        sent: acc.sent + r.sent,
        opened: acc.opened + r.opened,
        bookings: acc.bookings + r.bookings,
        revenue: acc.revenue + r.revenue,
      }),
      { sent: 0, opened: 0, bookings: 0, revenue: 0 },
    );
    const openRate = totals.sent > 0 ? Math.round((totals.opened / totals.sent) * 100) : 0;
    return [
      { label: t("flows.dashboard.campaigns", "Campaigns This Month"), value: String(rows.length), icon: Send, color: "text-purple-400" },
      { label: t("flows.dashboard.reached", "Recipients Reached"), value: String(totals.sent), icon: Users, color: "text-blue-400" },
      { label: t("flows.dashboard.openRate", "Avg. Open Rate"), value: `${openRate}%`, icon: BarChart3, color: "text-green-400" },
      { label: t("flows.dashboard.bookings", "Bookings"), value: String(totals.bookings), icon: CalendarCheck, color: "text-orange-400" },
      { label: t("flows.dashboard.revenue", "Revenue"), value: formatCurrency(totals.revenue), icon: TrendingUp, color: "text-emerald-400" },
    ];
  }, [metricsSummary, t]);

  const deleteMutation = useMutation({
    mutationFn: async (flowId: string) => {
      await apiRequest("DELETE", `/api/chain/${groupId}/flows/${flowId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/chain/${groupId}/flows`] });
      toast({
        title: t("chain.flows.deleted", "Campaign deleted"),
      });
      setPendingDelete(null);
    },
    onError: (e: any) => {
      toast({
        title: t("common.error", "Error"),
        description: e?.message ?? t("chain.flows.deleteFailed", "Could not delete campaign."),
        variant: "destructive",
      });
    },
  });

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-flows-no-group">
        {t("chain.flows.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-flows">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{t("chain.flows.title", "Flows")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("chain.flows.subtitle", "Outbound email and SMS campaigns — across the chain")}
          </p>
        </div>
        <Button onClick={() => navigate("/chain/flows/new")} data-testid="button-new-campaign">
          <Plus className="h-4 w-4 mr-2" />
          {t("chain.flows.new", "New campaign")}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <stat.icon className={`h-8 w-8 ${stat.color} opacity-80`} />
                <div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <div className="text-xs text-muted-foreground">{stat.label}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList>
          <TabsTrigger value="campaigns" className="gap-2">
            <Send className="h-4 w-4" />
            {t("flows.tabs.campaigns", "Campaigns")}
            {(data?.flows ?? []).length > 0 && <Badge variant="secondary" className="ml-1">{(data?.flows ?? []).length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="promos" className="gap-2">
            <Tag className="h-4 w-4" />
            {t("flows.tabs.promoCodes", "Promo Codes")}
            {promoCodes.length > 0 && <Badge variant="secondary" className="ml-1">{promoCodes.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-4">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">{t("common.loading", "Loading...")}</div>
          ) : (data?.flows ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground" data-testid="chain-flows-empty">
              {t("chain.flows.empty", "No campaigns yet.")}
            </div>
          ) : (
            <FlowsTable
              flows={data?.flows ?? []}
              onRowClick={(row) => navigate(`/chain/flows/${row.id}`)}
              audienceColumn={{
                header: t("chain.flows.audience", "Audience"),
                cell: (row) => {
                  const list = (row as any).audienceHospitals ?? [];
                  if (list.length === 0) return <Badge variant="outline">—</Badge>;
                  if (list.length === 1) return <Badge variant="outline">{list[0].hospitalName}</Badge>;
                  return (
                    <Badge variant="outline">
                      {t("chain.flows.nLocations", "{{n}} locations", { n: list.length })}
                    </Badge>
                  );
                },
              }}
              actions={(row) => {
                if ((row as any).sentAt) return null;
                return (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete({ id: row.id, name: row.name })}
                    data-testid={`button-delete-campaign-${row.id}`}
                    title={t("chain.flows.delete", "Delete")}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                );
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="promos" className="mt-4">
          <Card>
            {promoCodes.length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("flows.promoCodes.empty", "No promo codes yet. Create one inside a campaign.")}
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("flows.promoCodes.code", "Code")}</TableHead>
                    <TableHead>{t("flows.promoCodes.discount", "Discount")}</TableHead>
                    <TableHead>{t("chain.flows.scope", "Scope")}</TableHead>
                    <TableHead>{t("flows.offer.description", "Description")}</TableHead>
                    <TableHead>{t("flows.promoCodes.usage", "Usage")}</TableHead>
                    <TableHead>{t("flows.promoCodes.validUntil", "Valid Until")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promoCodes.map((pc: any) => {
                    const isExpired = pc.validUntil && new Date(pc.validUntil) < new Date();
                    const isMaxed = pc.maxUses && pc.usedCount >= pc.maxUses;
                    return (
                      <TableRow key={pc.id} className={isExpired || isMaxed ? "opacity-50" : ""}>
                        <TableCell>
                          <Badge variant="outline" className="font-mono">{pc.code}</Badge>
                        </TableCell>
                        <TableCell>
                          {pc.discountType === "percent" ? `${pc.discountValue}%` : `CHF ${pc.discountValue}`}
                        </TableCell>
                        <TableCell>
                          {pc.groupWide ? (
                            <Badge>{t("chain.flows.scopeChainWide", "Chain-wide")}</Badge>
                          ) : (
                            <Badge variant="outline">{pc.hospitalName ?? "—"}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{pc.description || "—"}</TableCell>
                        <TableCell>
                          {pc.usedCount}{pc.maxUses ? ` / ${pc.maxUses}` : ""}
                        </TableCell>
                        <TableCell>
                          {pc.validUntil ? (
                            <span className={isExpired ? "text-destructive" : ""}>
                              {new Date(pc.validUntil).toLocaleDateString("de-CH")}
                              {isExpired && ` (${t("flows.promoCodes.expired", "expired")})`}
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("chain.flows.deleteTitle", "Delete campaign?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "chain.flows.deleteBody",
                "{{name}} will be permanently deleted. This action cannot be undone.",
                { name: pendingDelete?.name ?? "" }
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="confirm-delete-campaign"
            >
              {t("common.delete", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
