import { useTranslation } from "react-i18next";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { formatDateTime, formatCurrency } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

interface VariantRow {
  variantId: string;
  label: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  bookings: number;
  revenue: number;
}

interface FlowDetail {
  funnel: {
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    bookings: number;
    revenue: number;
  };
  perVariant?: VariantRow[];
  bounces: Array<{ email: string; bounceType: string | null; createdAt: string }>;
  complaints: Array<{ email: string; createdAt: string }>;
  series: Array<{ day: string; opened: number; clicked: number }>;
}

interface FlowSummary {
  id: string;
  name: string;
  status: string;
  channel: string | null;
  sentAt: string | null;
  abTestEnabled: boolean;
  abWinnerVariantId: string | null;
  abWinnerStatus: string | null;
}

export default function FlowMetrics() {
  const { t } = useTranslation();
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const flowId = params.id;

  const { data: flow } = useQuery<FlowSummary>({
    queryKey: ["flow", hospitalId, flowId],
    queryFn: () =>
      apiRequest("GET", `/api/business/${hospitalId}/flows/${flowId}`).then((r) => r.json()),
    enabled: !!hospitalId && !!flowId,
  });

  const { data: metrics, isLoading } = useQuery<FlowDetail>({
    queryKey: ["flow-metrics", hospitalId, flowId],
    queryFn: () =>
      apiRequest("GET", `/api/business/${hospitalId}/flows/${flowId}/metrics`).then((r) =>
        r.json()
      ),
    enabled: !!hospitalId && !!flowId,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const pickWinner = useMutation({
    mutationFn: (variantId: string) =>
      apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/${flowId}/pick-winner`,
        { variantId },
      ).then((r) => r.json()),
    onSuccess: (data) => {
      toast({
        title: t("flows.ab.winnerPicked", "Winner picked"),
        description: t(
          "flows.ab.remainderSent",
          "{{count}} messages sent to the remaining patients.",
          { count: data.sentToRemainder },
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["flow", hospitalId, flowId] });
      queryClient.invalidateQueries({ queryKey: ["flow-metrics", hospitalId, flowId] });
    },
    onError: () => {
      toast({
        title: t("flows.ab.winnerError", "Could not pick winner"),
        variant: "destructive",
      });
    },
  });

  if (isLoading || !metrics) {
    return <div className="p-6">{t("common.loading", "Loading...")}</div>;
  }

  const f = metrics.funnel;

  const FUNNEL = [
    { label: t("flows.funnel.sent", "Sent"), value: String(f.sent), highlight: false },
    { label: t("flows.funnel.delivered", "Delivered"), value: String(f.delivered), highlight: false },
    { label: t("flows.funnel.opened", "Opened"), value: String(f.opened), highlight: false },
    { label: t("flows.funnel.clicked", "Clicked"), value: String(f.clicked), highlight: false },
    { label: t("flows.funnel.booked", "Booked"), value: String(f.bookings), highlight: false },
    { label: t("flows.funnel.revenue", "Revenue"), value: formatCurrency(f.revenue), highlight: true },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/business/flows")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-semibold">
          {flow?.name ?? t("flows.metrics.title", "Campaign Metrics")}
        </h1>
        {flow?.status && <Badge variant="outline">{flow.status}</Badge>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("flows.funnel.title", "Funnel")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {FUNNEL.map((s) => (
              <div key={s.label} className="text-center">
                <div className={`text-3xl font-bold ${s.highlight ? "text-emerald-600" : ""}`}>{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
          {f.bounced + f.complained > 0 && (
            <div className="mt-4 text-sm text-muted-foreground">
              {t("flows.metrics.warnings", "Issues")}:{" "}
              {f.bounced} {t("flows.funnel.bounced", "bounced")}
              {" · "}
              {f.complained} {t("flows.funnel.complained", "complaints")}
            </div>
          )}
        </CardContent>
      </Card>

      {metrics.perVariant && metrics.perVariant.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("flows.ab.comparisonTitle", "Variant Comparison")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`grid gap-4 ${
                metrics.perVariant.length === 3 ? "grid-cols-1 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2"
              }`}
            >
              {metrics.perVariant.map((v) => {
                const isWinner = flow?.abWinnerVariantId === v.variantId;
                return (
                  <div
                    key={v.variantId}
                    className={`border rounded-md p-4 space-y-2 ${
                      isWinner ? "border-emerald-500 bg-emerald-50/40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">
                        {t("flows.ab.variant", "Variant")} {v.label}
                      </h4>
                      {isWinner && (
                        <Badge className="bg-emerald-600">
                          {t("flows.ab.winner", "Winner")}
                        </Badge>
                      )}
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span>{t("flows.funnel.sent", "Sent")}</span>
                        <span className="font-medium">{v.sent}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("flows.funnel.opened", "Opened")}</span>
                        <span className="font-medium">
                          {v.opened}
                          {v.sent > 0 && (
                            <span className="text-muted-foreground text-xs ml-1">
                              ({Math.round((v.opened / v.sent) * 100)}%)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("flows.funnel.clicked", "Clicked")}</span>
                        <span className="font-medium">{v.clicked}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("flows.funnel.booked", "Booked")}</span>
                        <span className="font-medium">{v.bookings}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t("flows.funnel.revenue", "Revenue")}</span>
                        <span className="font-medium text-emerald-600">
                          {formatCurrency(v.revenue)}
                        </span>
                      </div>
                    </div>
                    {flow?.abTestEnabled && !flow?.abWinnerVariantId && (
                      <Button
                        className="w-full mt-2"
                        size="sm"
                        onClick={() => pickWinner.mutate(v.variantId)}
                        disabled={pickWinner.isPending}
                      >
                        {pickWinner.isPending
                          ? t("flows.ab.sending", "Sending...")
                          : t("flows.ab.pickVariant", "Send Variant {{label}} to remainder", { label: v.label })}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            {flow?.abWinnerVariantId && (
              <p className="text-sm text-muted-foreground mt-4">
                {t(
                  "flows.ab.winnerDescription",
                  "Winner was sent to the remaining hold-out patients.",
                )}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("flows.metrics.timeline", "Engagement over time")}</CardTitle>
        </CardHeader>
        <CardContent style={{ width: "100%", height: 300 }}>
          <ResponsiveContainer>
            <AreaChart data={metrics.series}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="opened"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.2}
              />
              <Area
                type="monotone"
                dataKey="clicked"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {metrics.bounces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("flows.metrics.bouncesTitle", "Bounced recipients")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("flows.metrics.email", "Email")}</TableHead>
                  <TableHead>{t("flows.metrics.bounceType", "Type")}</TableHead>
                  <TableHead>{t("flows.metrics.when", "When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.bounces.map((b, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{b.email}</TableCell>
                    <TableCell>{b.bounceType ?? "—"}</TableCell>
                    <TableCell>{formatDateTime(b.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {metrics.complaints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("flows.metrics.complaintsTitle", "Spam complaints (auto-unsubscribed)")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("flows.metrics.email", "Email")}</TableHead>
                  <TableHead>{t("flows.metrics.when", "When")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.complaints.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{c.email}</TableCell>
                    <TableCell>{formatDateTime(c.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
