import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale, formatDate } from "@/lib/dateUtils";
import { formatMonthTick } from "./types";

interface MonthSurgery {
  id: string;
  plannedSurgery: string | null;
  paymentDate: string;
  price: number;
  surgeonName: string | null;
  patientName: string | null;
}

interface Props {
  hospitalId: string;
  month: string | null;
  onClose: () => void;
}

export default function MonthSurgeriesModal({ hospitalId, month, onClose }: Props) {
  const { t } = useTranslation();
  const open = !!month;

  const query = useQuery<{ month: string; surgeries: MonthSurgery[] }>({
    queryKey: [`/api/business/${hospitalId}/surgeries-in-month?month=${month ?? ''}&limit=200`],
    enabled: open && !!hospitalId && !!month,
  });

  const surgeries = query.data?.surgeries ?? [];
  const total = surgeries.reduce((sum, s) => sum + s.price, 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("business.drilldown.surgeriesInMonthTitle", "Surgeries paid in {{m}}", {
              m: month ? formatMonthTick(month, true) : "",
            })}
          </DialogTitle>
          <DialogDescription>
            {t("business.drilldown.surgeriesInMonthDesc", "{{n}} surgeries · {{total}} total revenue", {
              n: surgeries.length,
              total: formatCurrencyLocale(total),
            })}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : surgeries.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6">
            {t("business.drilldown.noSurgeries", "No surgeries paid in this month.")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("business.drilldown.paidOn", "Paid on")}</TableHead>
                <TableHead>{t("business.drilldown.procedure", "Procedure")}</TableHead>
                <TableHead>{t("business.drilldown.surgeon", "Surgeon")}</TableHead>
                <TableHead>{t("business.drilldown.patient", "Patient")}</TableHead>
                <TableHead className="text-right">{t("business.money.revenueCol", "Revenue")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {surgeries.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{formatDate(s.paymentDate)}</TableCell>
                  <TableCell className="font-medium">{s.plannedSurgery ?? "—"}</TableCell>
                  <TableCell>{s.surgeonName ?? "—"}</TableCell>
                  <TableCell>{s.patientName ?? "—"}</TableCell>
                  <TableCell className="text-right">{formatCurrencyLocale(s.price)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
