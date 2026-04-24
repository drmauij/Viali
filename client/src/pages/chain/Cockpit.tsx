import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrencyLocale } from "@/lib/dateUtils";

interface ChainOverviewResponse {
  totals: {
    revenue: number;
    treatments: number;
    surgeries: number;
    leads: number;
    conversionPct: number;
    noShowPct: number;
  };
  perLocation: Array<{
    hospitalId: string;
    hospitalName: string;
    clinicKind: "aesthetic" | "surgical" | "mixed";
    revenue: number;
    treatments: number;
    surgeries: number;
    leads: number;
    conversionPct: number;
    noShowPct: number;
    trendPct: number;
  }>;
  topItems: {
    treatments: Array<{ name: string; revenue: number; count: number }>;
    surgeries: Array<{ name: string; revenue: number; count: number }>;
  };
  anomalies: Array<{ hospitalId: string; hospitalName: string; reasons: string[] }>;
}

export default function ChainCockpit() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const [range, setRange] = useState<"30d" | "90d" | "365d">("30d");

  const groupId = (activeHospital as any)?.groupId ?? null;

  const { data, isLoading, isError } = useQuery<ChainOverviewResponse>({
    queryKey: [`/api/chain/${groupId}/overview?range=${range}`],
    enabled: !!groupId,
  });

  // Chain-level clinic kind: if every hospital is aesthetic-only → hide surgery columns;
  // if every hospital is surgical-only → hide treatment columns; else show both.
  const chainKind = useMemo(() => {
    if (!data?.perLocation || data.perLocation.length === 0) return "mixed" as const;
    const anyAesthetic = data.perLocation.some(l => l.clinicKind === "aesthetic" || l.clinicKind === "mixed");
    const anySurgical = data.perLocation.some(l => l.clinicKind === "surgical" || l.clinicKind === "mixed");
    if (anyAesthetic && !anySurgical) return "aesthetic" as const;
    if (anySurgical && !anyAesthetic) return "surgical" as const;
    return "mixed" as const;
  }, [data]);

  const showTreatments = chainKind === "aesthetic" || chainKind === "mixed";
  const showSurgeries = chainKind === "surgical" || chainKind === "mixed";

  const drillInto = (hospitalId: string) => {
    sessionStorage.setItem("chain.drilledInto", "true");
    const userHospitals = (user as any)?.hospitals ?? [];
    const match = userHospitals.find((h: any) => h.id === hospitalId && h.role === "admin")
      ?? userHospitals.find((h: any) => h.id === hospitalId);
    if (match) {
      localStorage.setItem("activeHospital", `${match.id}-${match.unitId}-${match.role}`);
    }
    navigate("/business");
    // Force reload so query cache re-keys against the new active hospital.
    // Phase B shortcut; a future activeHospital context refactor can skip this.
    setTimeout(() => window.location.reload(), 20);
  };

  if (!groupId) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-cockpit-no-group">
        {t("chain.cockpit.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground" data-testid="chain-cockpit-loading">
        {t("common.loading", "Loading...")}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-8 text-center text-destructive" data-testid="chain-cockpit-error">
        {t("common.error", "Error loading chain overview.")}
      </div>
    );
  }

  const hasAnomalies = data.anomalies.length > 0;

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-cockpit">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">
          {t("chain.cockpit.title", "Chain overview")}
        </h1>
        <Select value={range} onValueChange={(v) => setRange(v as any)}>
          <SelectTrigger className="w-[180px]" data-testid="select-range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30d">{t("business.range.30d", "Last 30 days")}</SelectItem>
            <SelectItem value="90d">{t("business.range.90d", "Last 90 days")}</SelectItem>
            <SelectItem value="365d">{t("business.range.365d", "Last year")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Totals KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground">
              {t("chain.cockpit.revenue", "Revenue")}
            </div>
            <div className="text-2xl font-semibold mt-1">
              {formatCurrencyLocale(data.totals.revenue)}
            </div>
          </CardContent>
        </Card>
        {showTreatments && (
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs uppercase text-muted-foreground">
                {t("chain.cockpit.treatments", "Treatments")}
              </div>
              <div className="text-2xl font-semibold mt-1">{data.totals.treatments}</div>
            </CardContent>
          </Card>
        )}
        {showSurgeries && (
          <Card>
            <CardContent className="pt-4">
              <div className="text-xs uppercase text-muted-foreground">
                {t("chain.cockpit.surgeries", "Surgeries")}
              </div>
              <div className="text-2xl font-semibold mt-1">{data.totals.surgeries}</div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground">
              {t("chain.cockpit.leads", "Leads")}
            </div>
            <div className="text-2xl font-semibold mt-1">{data.totals.leads}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs uppercase text-muted-foreground">
              {t("chain.cockpit.conversion", "Conversion")}
            </div>
            <div className="text-2xl font-semibold mt-1">
              {data.totals.conversionPct.toFixed(1)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-location ranked table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("chain.cockpit.locationsRanked", "Locations — ranked by revenue")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>{t("chain.cockpit.location", "Location")}</TableHead>
                <TableHead className="text-right">
                  {t("chain.cockpit.revenue", "Revenue")}
                </TableHead>
                {showTreatments && (
                  <TableHead className="text-right">{t("chain.cockpit.tx", "Tx")}</TableHead>
                )}
                {showSurgeries && (
                  <TableHead className="text-right">{t("chain.cockpit.sx", "Sx")}</TableHead>
                )}
                <TableHead className="text-right">
                  {t("chain.cockpit.leads", "Leads")}
                </TableHead>
                <TableHead className="text-right">
                  {t("chain.cockpit.conversionShort", "Conv")}
                </TableHead>
                <TableHead className="text-right">
                  {t("chain.cockpit.noShow", "No-show")}
                </TableHead>
                <TableHead className="text-right">
                  {t("chain.cockpit.trend", "Trend")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.perLocation.map((loc, i) => {
                const isAnomaly = loc.trendPct < -5;
                return (
                  <TableRow
                    key={loc.hospitalId}
                    className={`cursor-pointer hover:bg-muted/50 ${isAnomaly ? 'bg-amber-500/5' : ''}`}
                    onClick={() => drillInto(loc.hospitalId)}
                    data-testid={`row-location-${loc.hospitalId}`}
                  >
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      {loc.hospitalName}
                      {isAnomaly && <span className="ml-1 text-amber-500">⚠</span>}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrencyLocale(loc.revenue)}
                    </TableCell>
                    {showTreatments && (
                      <TableCell className="text-right">
                        {loc.clinicKind === 'surgical' ? '—' : loc.treatments}
                      </TableCell>
                    )}
                    {showSurgeries && (
                      <TableCell className="text-right">
                        {loc.clinicKind === 'aesthetic' ? '—' : loc.surgeries}
                      </TableCell>
                    )}
                    <TableCell className="text-right">{loc.leads}</TableCell>
                    <TableCell className="text-right">{loc.conversionPct.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">{loc.noShowPct.toFixed(1)}%</TableCell>
                    <TableCell className={`text-right ${loc.trendPct < 0 ? 'text-destructive' : loc.trendPct > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {loc.trendPct > 0 ? '↑' : loc.trendPct < 0 ? '↓' : '→'} {Math.abs(loc.trendPct)}%
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Attention + Top items */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("chain.cockpit.needsAttention", "Needs attention")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!hasAnomalies ? (
              <div className="text-sm text-muted-foreground">
                {t("chain.cockpit.allGood", "All locations performing within expected range.")}
              </div>
            ) : (
              <ul className="space-y-2 text-sm">
                {data.anomalies.map(a => (
                  <li key={a.hospitalId}>
                    <span className="font-medium text-amber-600">⚠ {a.hospitalName}</span>
                    <span className="text-muted-foreground"> — {a.reasons.join('; ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {showTreatments && showSurgeries
                ? t("chain.cockpit.topItems", "Top items")
                : showTreatments
                ? t("chain.cockpit.topTreatments", "Top treatments")
                : t("chain.cockpit.topSurgeries", "Top surgeries")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {[...(showTreatments ? data.topItems.treatments : []), ...(showSurgeries ? data.topItems.surgeries : [])]
              .sort((a, b) => b.revenue - a.revenue)
              .slice(0, 5)
              .map((it, i) => (
                <div key={`${it.name}-${i}`} className="flex justify-between py-1 text-sm">
                  <span>{i + 1}. {it.name}</span>
                  <span className="text-muted-foreground">
                    {formatCurrencyLocale(it.revenue)} · {it.count}
                  </span>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
