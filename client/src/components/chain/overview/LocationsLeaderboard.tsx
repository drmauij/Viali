import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp } from "lucide-react";

interface Row {
  hospitalId: string;
  hospitalName: string;
  leads: number;
  referrals: number;
  bookingPct: number;
  firstVisitPct: number;
  paidPct: number;
  revenue: number;
  deltaLeadsPct: number;
}
interface Props {
  rows: Row[];
  currency: string | null;
}

type SortKey =
  | "leads"
  | "referrals"
  | "bookingPct"
  | "firstVisitPct"
  | "paidPct"
  | "revenue"
  | "deltaLeadsPct";

export default function LocationsLeaderboard({ rows, currency }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [sortKey, setSortKey] = useState<SortKey>("revenue");

  const sorted = [...rows].sort(
    (a, b) => (b[sortKey] as number) - (a[sortKey] as number),
  );

  // Drill-into-clinic mirrors the pattern from /chain/locations:
  //   sessionStorage flag + activeHospital swap + reload to /business/funnels
  const drillInto = (hospitalId: string) => {
    sessionStorage.setItem("chain.drilledInto", "true");
    const userHospitals = (user as any)?.hospitals ?? [];
    const match =
      userHospitals.find(
        (h: any) => h.id === hospitalId && h.role === "admin",
      ) ?? userHospitals.find((h: any) => h.id === hospitalId);
    if (match) {
      localStorage.setItem(
        "activeHospital",
        `${match.id}-${match.unitId}-${match.role}`,
      );
    }
    navigate("/business/funnels");
    setTimeout(() => window.location.reload(), 20);
  };

  const HeaderCell = ({
    label,
    k,
    align = "right",
  }: {
    label: string;
    k: SortKey;
    align?: "left" | "right";
  }) => (
    <TableHead
      className={`cursor-pointer select-none ${align === "right" ? "text-right" : ""} ${sortKey === k ? "font-semibold" : ""}`}
      onClick={() => setSortKey(k)}
    >
      {label}
    </TableHead>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t("chain.funnels.leaderboard", "Locations leaderboard")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("chain.funnels.col.clinic", "Clinic")}</TableHead>
                <HeaderCell
                  label={t("chain.funnels.col.leads", "Leads")}
                  k="leads"
                />
                <HeaderCell
                  label={t("chain.funnels.col.referrals", "Referrals")}
                  k="referrals"
                />
                <HeaderCell
                  label={t("chain.funnels.col.bookingPct", "Booking%")}
                  k="bookingPct"
                />
                <HeaderCell
                  label={t("chain.funnels.col.firstVisitPct", "First-visit%")}
                  k="firstVisitPct"
                />
                <HeaderCell
                  label={t("chain.funnels.col.paidPct", "Paid%")}
                  k="paidPct"
                />
                <HeaderCell
                  label={t("chain.funnels.col.revenue", "Revenue")}
                  k="revenue"
                />
                <HeaderCell
                  label={t("chain.funnels.col.deltaLeads", "Δ leads")}
                  k="deltaLeadsPct"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((r) => (
                <TableRow
                  key={r.hospitalId}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => drillInto(r.hospitalId)}
                  data-testid={`row-leaderboard-${r.hospitalId}`}
                >
                  <TableCell className="font-medium">
                    {r.hospitalName}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.leads.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.referrals.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {r.bookingPct.toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {r.firstVisitPct.toFixed(0)}%
                  </TableCell>
                  <TableCell className="text-right">
                    {r.paidPct.toFixed(0)}%
                  </TableCell>
                  <TableCell
                    className="text-right"
                    title={currency ? undefined : t("chain.funnels.mixedCurrencies", "Mixed currencies")}
                  >
                    {currency
                      ? `${currency} ${r.revenue.toLocaleString()}`
                      : "—"}
                  </TableCell>
                  <TableCell
                    className={`text-right ${r.deltaLeadsPct >= 0 ? "text-emerald-600" : "text-rose-600"}`}
                  >
                    <span className="inline-flex items-center gap-0.5 justify-end">
                      {r.deltaLeadsPct >= 0 ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {Math.abs(r.deltaLeadsPct).toFixed(0)}%
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {sorted.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground p-6"
                  >
                    {t(
                      "chain.funnels.leaderboardEmpty",
                      "No leaderboard data for the selected scope.",
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
