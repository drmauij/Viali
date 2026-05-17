import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale } from "@/lib/dateUtils";
import type { TopProc } from "./types";

interface Props {
  hospitalId: string;
}

export function TopProceduresBody({ hospitalId }: Props) {
  const { t } = useTranslation();
  // Range argument is intentionally ignored on the backend — top procedures
  // is an all-time, past-only view. We still pass "all" so the cache key is
  // predictable across the dashboard.
  const query = useQuery<TopProc[]>({
    queryKey: [`/api/business/${hospitalId}/top-procedures-by-margin?range=all&limit=8`],
    enabled: !!hospitalId,
  });

  if (query.isLoading) {
    return <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("business.money.procedure", "Procedure")}</TableHead>
          <TableHead className="text-right">{t("business.money.count", "Count")}</TableHead>
          <TableHead className="text-right">{t("business.money.revenueCol", "Revenue")}</TableHead>
          <TableHead className="text-right">{t("business.money.marginCol", "Margin")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {(query.data ?? []).map((row) => (
          <TableRow key={row.procedure}>
            <TableCell className="font-medium">{row.procedure}</TableCell>
            <TableCell className="text-right">{row.count}</TableCell>
            <TableCell className="text-right">{formatCurrencyLocale(row.revenue)}</TableCell>
            <TableCell className={`text-right ${row.margin >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {formatCurrencyLocale(row.margin)} ({(row.marginPercent * 100).toFixed(0)}%)
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function TopProceduresCard(props: Props) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("business.money.topProceduresTitle", "Top procedures by margin")}</CardTitle>
        <CardDescription>
          {t("business.money.topProceduresDesc", "All-time, past surgeries only. Procedures with no recorded cost are excluded.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <TopProceduresBody {...props} />
      </CardContent>
    </Card>
  );
}
