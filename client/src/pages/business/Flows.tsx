import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLocation } from "wouter";
import { useMemo } from "react";
import {
  Send, Users, BarChart3, CalendarCheck, Plus, Trash2, Loader2, Tag, Zap, TrendingUp,
} from "lucide-react";
import { formatCurrency } from "@/lib/dateUtils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AutomationsTab } from "@/components/flows/automations/AutomationsTab";
import FlowsTable, { type FlowRow, type FlowsTableMetricsRow } from "@/components/flows/FlowsTable";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Flows() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const hospitalId = activeHospital?.id;

  const { data: metricsSummary } = useQuery<{
    since: string;
    rows: Array<FlowsTableMetricsRow & { flowId: string }>;
  }>({
    queryKey: ["flows-metrics-summary", hospitalId],
    queryFn: () =>
      apiRequest("GET", `/api/business/${hospitalId}/flows/metrics/summary`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const metricsByFlow = useMemo(() => {
    const m: Record<string, FlowsTableMetricsRow> = {};
    (metricsSummary?.rows ?? []).forEach((r) => {
      m[r.flowId] = r;
    });
    return m;
  }, [metricsSummary]);

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

  const { data: campaigns = [], isLoading } = useQuery<FlowRow[]>({
    queryKey: ["flows", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/flows`).then((r) => r.json()),
    enabled: !!hospitalId,
  });

  const deleteMutation = useMutation({
    mutationFn: (flowId: string) =>
      apiRequest("DELETE", `/api/business/${hospitalId}/flows/${flowId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["flows", hospitalId] }),
  });

  // Promo codes
  const { data: promoCodes = [] } = useQuery({
    queryKey: ["promo-codes", hospitalId],
    queryFn: () => apiRequest("GET", `/api/business/${hospitalId}/promo-codes`).then(r => r.json()),
    enabled: !!hospitalId,
  });

  const deletePromoMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("DELETE", `/api/business/${hospitalId}/promo-codes/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["promo-codes", hospitalId] }),
  });

  return (
    <div className="p-4 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Flows</h1>
          <p className="text-sm text-muted-foreground">{t("flows.subtitle", "Manage Marketing Campaigns")}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => navigate("/business/flows/new")}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            {t("flows.newCampaign", "New Campaign")}
          </Button>
        </div>
      </div>

      {/* Dashboard cards */}
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

      {/* Tabs: Campaigns | Promo Codes */}
      <Tabs defaultValue="campaigns">
        <div className="overflow-x-auto scrollbar-hide">
          <TabsList className="inline-flex w-auto min-w-full">
            <TabsTrigger value="campaigns" className="gap-2 whitespace-nowrap">
              <Send className="h-4 w-4" />
              {t("flows.tabs.campaigns", "Campaigns")}
              {campaigns.length > 0 && <Badge variant="secondary" className="ml-1">{campaigns.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="promos" className="gap-2 whitespace-nowrap">
              <Tag className="h-4 w-4" />
              {t("flows.tabs.promoCodes", "Promo Codes")}
              {(promoCodes as any[]).length > 0 && <Badge variant="secondary" className="ml-1">{(promoCodes as any[]).length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="automations" className="gap-2 whitespace-nowrap">
              <Zap className="h-4 w-4" />
              Automatisierungen
              <Badge className="ml-1 bg-purple-600 text-white hover:bg-purple-600">NEU</Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Campaigns Tab */}
        <TabsContent value="campaigns" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : campaigns.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Send className="h-12 w-12 opacity-20 mb-4" />
                <p className="text-lg font-medium mb-1">{t("flows.empty.title", "No campaigns yet")}</p>
                <p className="text-sm opacity-60 mb-4">{t("flows.empty.subtitle", "Create your first marketing campaign")}</p>
                <Button onClick={() => navigate("/business/flows/new")} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" /> {t("flows.empty.createFirst", "Create First Campaign")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <FlowsTable
              flows={campaigns}
              metricsByFlow={metricsByFlow}
              onRowClick={(c) => {
                if (c.status === "draft") {
                  navigate(`/business/flows/${c.id}`);
                }
              }}
              actions={(c) => (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => navigate(`/business/flows/${c.id}/metrics`)}
                    title={t("flows.actions.viewMetrics", "View metrics")}
                  >
                    <BarChart3 className="h-4 w-4" />
                  </Button>
                  {c.status === "draft" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("flows.delete.title", "Delete Campaign?")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("flows.delete.description", "This action cannot be undone.")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteMutation.mutate(c.id);
                            }}
                          >
                            {t("common.delete", "Delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </>
              )}
            />
          )}
        </TabsContent>

        {/* Promo Codes Tab */}
        <TabsContent value="promos" className="mt-4">
          <Card>
            {(promoCodes as any[]).length === 0 ? (
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                {t("flows.promoCodes.empty", "No promo codes yet. Create one inside a campaign.")}
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("flows.promoCodes.code", "Code")}</TableHead>
                    <TableHead>{t("flows.promoCodes.discount", "Discount")}</TableHead>
                    <TableHead>{t("flows.offer.description", "Description")}</TableHead>
                    <TableHead>{t("flows.promoCodes.usage", "Usage")}</TableHead>
                    <TableHead>{t("flows.promoCodes.validUntil", "Valid Until")}</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(promoCodes as any[]).map((pc: any) => {
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
                        <TableCell>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("flows.promoCodes.deleteTitle", "Delete promo code?")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t("flows.promoCodes.deleteDesc", "Code {{code}} will be permanently deleted.", { code: pc.code })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common.cancel", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deletePromoMutation.mutate(pc.id)}>
                                  {t("common.delete", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="automations" className="mt-4">
          <AutomationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
