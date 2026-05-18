import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Calendar,
  ChevronRight,
  Clock,
  DollarSign,
  Download,
  FileText,
  HelpCircle,
  Loader2,
  Pill,
  Scissors,
  Search,
  TrendingDown,
  TrendingUp,
  User,
  Users,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatCurrencyLocale, formatDate, getCurrencySymbol } from "@/lib/dateUtils";
import { generateSurgeryCostsPdf, type SurgeryCostsPdfData } from "@/lib/surgeryCostsPdf";

interface SurgeryRow {
  id: string;
  date: string;
  surgeryName: string;
  patientName: string;
  patientId: string | null;
  anesthesiaRecordId: string | null;
  surgeryDurationMinutes: number;
  staffCost: number;
  anesthesiaStaffCost: number;
  surgeryStaffCost: number;
  anesthesiaCost: number;
  surgeryCost: number;
  anesthesiaTotalCost: number;
  surgeryTotalCost: number;
  totalCost: number;
  paidAmount: number;
  difference: number;
  status: string;
}

interface SurgeryDetails {
  surgery: {
    id: string;
    date: string;
    surgeryName: string;
    patientName: string;
    status: string;
  };
  duration: { minutes: number; hours: number; x1Time: number | null; a2Time: number | null };
  staffBreakdown: Array<{ name: string; role: string; durationHours: number; hourlyRate: number; cost: number }>;
  staffTotal: number;
  anesthesiaItems: Array<{ itemId: string; itemName: string; quantity: number; unitPrice: number; cost: number }>;
  anesthesiaTotal: number;
  surgeryItems: Array<{ itemId: string; itemName: string; quantity: number; unitPrice: number; cost: number }>;
  surgeryTotal: number;
  grandTotal: number;
}

interface NurseHoursData {
  months: Array<{ month: string; totalHours: number; surgeryDays: number; isPast: boolean }>;
  hourlyRate: number;
}

interface Props {
  hospitalId: string;
  range: string;
}

function rangeToDateBounds(range: string): { startDate?: string; endDate?: string } {
  if (range === "all" || !range) return {};
  if (/^\d{4}$/.test(range)) {
    return { startDate: `${range}-01-01`, endDate: `${range}-12-31` };
  }
  return {};
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export default function SurgeryCostsCard({ hospitalId, range }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [selectedSurgeryId, setSelectedSurgeryId] = useState<string | null>(null);
  const [showNurseHoursDialog, setShowNurseHoursDialog] = useState(false);
  const [anesthesiaNurseRate, setAnesthesiaNurseRate] = useState(100);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  async function fetchSurgeryDetails(surgeryId: string): Promise<SurgeryCostsPdfData> {
    return queryClient.fetchQuery<SurgeryCostsPdfData>({
      queryKey: [`/api/business/${hospitalId}/surgeries/${surgeryId}/costs`],
    });
  }

  async function handleDownloadPdf(surgeryId: string, existing?: SurgeryCostsPdfData | null) {
    try {
      setDownloadingId(surgeryId);
      const data = existing ?? (await fetchSurgeryDetails(surgeryId));
      await generateSurgeryCostsPdf({
        data,
        hospitalName: activeHospital?.name,
        t: (k, fb) => t(k, fb),
      });
    } catch (err) {
      toast({
        title: t("business.costs.pdfDownloadFailed", "Failed to download PDF"),
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setDownloadingId(null);
    }
  }

  const { startDate, endDate } = rangeToDateBounds(range);
  const dateQs = [
    startDate ? `startDate=${startDate}` : "",
    endDate ? `endDate=${endDate}` : "",
  ]
    .filter(Boolean)
    .join("&");
  const surgeriesUrl = `/api/business/${hospitalId}/surgeries${dateQs ? `?${dateQs}` : ""}`;

  const surgeriesQuery = useQuery<SurgeryRow[]>({
    queryKey: [surgeriesUrl],
    enabled: !!hospitalId,
  });

  const nurseHoursQuery = useQuery<NurseHoursData>({
    queryKey: [`/api/business/${hospitalId}/anesthesia-nurse-hours`],
    enabled: !!hospitalId,
  });

  const detailQuery = useQuery<SurgeryDetails>({
    queryKey: [`/api/business/${hospitalId}/surgeries/${selectedSurgeryId}/costs`],
    enabled: !!hospitalId && !!selectedSurgeryId,
  });

  const surgeries = surgeriesQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return surgeries;
    return surgeries.filter(
      (s) =>
        (s.surgeryName ?? "").toLowerCase().includes(q) ||
        (s.patientName ?? "").toLowerCase().includes(q),
    );
  }, [surgeries, search]);

  const stats = useMemo(() => {
    const withCosts = filtered.filter((s) => (s.totalCost ?? 0) > 0);
    const totalCosts = withCosts.reduce((sum, s) => sum + (s.totalCost ?? 0), 0);
    const totalPaid = withCosts.reduce((sum, s) => sum + (s.paidAmount ?? 0), 0);
    const totalDiff = withCosts.reduce((sum, s) => sum + (s.difference ?? 0), 0);

    const validDur = withCosts.filter((s) => (s.surgeryDurationMinutes ?? 0) > 0);
    const avgDuration = validDur.length > 0
      ? validDur.reduce((sum, s) => sum + (s.surgeryDurationMinutes ?? 0), 0) / validDur.length
      : 0;

    const perHour = (pick: (s: SurgeryRow) => number) => {
      const values = withCosts
        .map((s) => {
          const h = (s.surgeryDurationMinutes ?? 0) / 60;
          return h > 0 ? pick(s) / h : null;
        })
        .filter((v): v is number => v !== null && v > 0);
      return values.length > 0 ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
    };

    return {
      count: withCosts.length,
      totalCosts,
      totalPaid,
      totalDiff,
      avgDuration,
      avgCostPerHour: perHour((s) => s.totalCost ?? 0),
      avgAnesthesiaPerHour: perHour((s) => s.anesthesiaTotalCost ?? 0),
      avgSurgeryPerHour: perHour((s) => s.surgeryTotalCost ?? 0),
      avgPaidPerHour: perHour((s) => s.paidAmount ?? 0),
    };
  }, [filtered]);

  const nurseSummary = useMemo(() => {
    const months = nurseHoursQuery.data?.months ?? [];
    const past = months.filter((m) => m.isPast);
    const totalHours = past.reduce((sum, m) => sum + m.totalHours, 0);
    const avgHoursPerMonth = past.length > 0 ? totalHours / past.length : 0;
    return { past, totalHours, avgHoursPerMonth, avgCostPerMonth: avgHoursPerMonth * anesthesiaNurseRate };
  }, [nurseHoursQuery.data, anesthesiaNurseRate]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-5 w-5" />
              {t("business.costs.surgeryListTitle", "Surgery Cost Details")}
            </CardTitle>
            <CardDescription>
              {t("business.costs.surgeryListDesc", "Per-surgery cost breakdown — staff, anesthesia consumables, and surgery consumables.")}
            </CardDescription>
          </div>
          <div className="relative w-full md:w-[300px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("business.costs.searchSurgeries", "Search by surgery or patient")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-surgeries"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {surgeriesQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : surgeriesQuery.isError ? (
          <div className="text-center text-red-500 py-12">
            {t("common.errorLoadingData", "Error loading data")}
          </div>
        ) : (
          <>
            {filtered.length > 0 && (
              <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 border">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <FileText className="h-3.5 w-3.5" />
                    {t("business.costs.totalSurgeries", "Total surgeries")}
                  </div>
                  <div className="text-xl font-bold">{stats.count}</div>
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    {t("business.costs.totalCosts", "Total Costs")}
                  </div>
                  <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {formatCurrencyLocale(stats.totalCosts)}
                  </div>
                </div>

                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <DollarSign className="h-3.5 w-3.5" />
                    {t("business.costs.totalPaid", "Total Paid")}
                  </div>
                  <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                    {formatCurrencyLocale(stats.totalPaid)}
                  </div>
                </div>

                <div
                  className={`rounded-lg p-3 border ${
                    stats.totalDiff >= 0
                      ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                      : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  }`}
                >
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    {stats.totalDiff >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5" />
                    )}
                    {t("business.costs.totalDifference", "Total Difference")}
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      stats.totalDiff >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatCurrencyLocale(stats.totalDiff)}
                  </div>
                </div>

                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    {t("business.costs.avgDuration", "Avg Duration")}
                  </div>
                  <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {formatDuration(Math.round(stats.avgDuration))}
                  </div>
                </div>

                <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t("business.costs.avgCostPerHour", "Avg Cost/Hour")}
                  </div>
                  <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">
                    {formatCurrencyLocale(stats.avgCostPerHour)}
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-indigo-200 dark:border-indigo-700">
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">
                        {t("business.costs.anesthesia", "Anesthesia")}
                      </div>
                      <div className="text-xs font-semibold text-green-600 dark:text-green-400">
                        {formatCurrencyLocale(stats.avgAnesthesiaPerHour)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-[10px] text-muted-foreground">
                        {t("business.costs.surgery", "Surgery")}
                      </div>
                      <div className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {formatCurrencyLocale(stats.avgSurgeryPerHour)}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                    <TrendingUp className="h-3.5 w-3.5" />
                    {t("business.costs.avgPaidPerHour", "Avg Paid/Hour")}
                  </div>
                  <div className="text-xl font-bold text-amber-600 dark:text-amber-400">
                    {formatCurrencyLocale(stats.avgPaidPerHour)}
                  </div>
                </div>
              </div>
            )}

            {nurseSummary.past.length > 0 && (
              <div
                className="mb-6 bg-teal-50 dark:bg-teal-900/20 rounded-lg p-4 border border-teal-200 dark:border-teal-800 cursor-pointer hover:border-teal-400 dark:hover:border-teal-600 transition-colors"
                onClick={() => setShowNurseHoursDialog(true)}
                data-testid="card-anesthesia-nurse-hours"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    <div>
                      <div className="text-sm font-medium">
                        {t("business.costs.anesthesiaNurseHours", "Anesthesia Nurse Hours")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t(
                          "business.costs.anesthesiaNurseHoursDesc",
                          "Calculated from 07:00 to last surgery end + 1h buffer",
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Avg/Mo</div>
                      <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                        {nurseSummary.avgHoursPerMonth.toFixed(1)}h
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">
                        {t("business.costs.cost", "Cost")}/mo ({anesthesiaNurseRate} {getCurrencySymbol()}/h)
                      </div>
                      <div className="text-lg font-bold text-teal-600 dark:text-teal-400">
                        {formatCurrencyLocale(nurseSummary.avgCostPerMonth)}
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("business.costs.surgeryDate", "Date")}</TableHead>
                    <TableHead>{t("business.costs.surgeryMade", "Surgery")}</TableHead>
                    <TableHead>{t("business.costs.patientData", "Patient")}</TableHead>
                    <TableHead className="text-center">
                      <Tooltip>
                        <TooltipTrigger className="flex items-center gap-1 mx-auto">
                          {t("business.costs.surgeryTime", "Duration")}
                          <HelpCircle className="h-3 w-3 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              "business.costs.surgeryTimeTooltip",
                              "Duration from anesthesia start (X1) to anesthesia presence end (A2)",
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TableHead>
                    <TableHead className="text-right">{t("business.costs.staffCostsCol", "Staff")}</TableHead>
                    <TableHead className="text-right">
                      {t("business.costs.anesthesiaConsumables", "Anesthesia Consumables")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("business.costs.surgeryConsumables", "Surgery Consumables")}
                    </TableHead>
                    <TableHead className="text-right">{t("business.costs.totalCostCol", "Total Costs")}</TableHead>
                    <TableHead className="text-right">{t("business.costs.costPerHour", "Cost/Hour")}</TableHead>
                    <TableHead className="text-right">{t("business.costs.paidCol", "Paid")}</TableHead>
                    <TableHead className="text-right">{t("business.costs.differenceCol", "Difference")}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                        {t("business.costs.noSurgeriesFound", "No surgeries found")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((surgery) => {
                      const hours = (surgery.surgeryDurationMinutes ?? 0) / 60;
                      const costPerHour = hours > 0 ? (surgery.totalCost ?? 0) / hours : 0;
                      return (
                        <TableRow
                          key={surgery.id}
                          data-testid={`row-surgery-${surgery.id}`}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedSurgeryId(surgery.id)}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{formatDate(surgery.date)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{surgery.surgeryName || "-"}</span>
                          </TableCell>
                          <TableCell>
                            <span className="font-medium">{surgery.patientName || "-"}</span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="font-medium">{formatDuration(surgery.surgeryDurationMinutes)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>
                                  {surgery.surgeryDurationMinutes ?? 0} {t("common.minutes", "minutes")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-purple-600 dark:text-purple-400">
                              {formatCurrency(surgery.staffCost ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-green-600 dark:text-green-400">
                              {formatCurrency(surgery.anesthesiaCost ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-blue-600 dark:text-blue-400">
                              {formatCurrency(surgery.surgeryCost ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency(surgery.totalCost ?? 0)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-indigo-600 dark:text-indigo-400 font-medium">
                              {formatCurrency(costPerHour)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-orange-600 dark:text-orange-400">
                              {formatCurrency(surgery.paidAmount ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            <span
                              className={
                                (surgery.difference ?? 0) >= 0
                                  ? "text-green-600 dark:text-green-400"
                                  : "text-red-600 dark:text-red-400"
                              }
                            >
                              {formatCurrency(surgery.difference ?? 0)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right pr-2">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDownloadPdf(surgery.id);
                                  }}
                                  disabled={downloadingId === surgery.id}
                                  data-testid={`button-download-pdf-${surgery.id}`}
                                  aria-label={t("business.costs.downloadPdf", "Download PDF")}
                                >
                                  {downloadingId === surgery.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{t("business.costs.downloadPdf", "Download PDF")}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!selectedSurgeryId} onOpenChange={(open) => !open && setSelectedSurgeryId(null)}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] overflow-y-auto"
          data-testid="dialog-surgery-cost-breakdown"
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-3 pr-8">
              <div className="flex-1 min-w-0">
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  {t("business.costs.costBreakdown", "Cost Breakdown")}
                </DialogTitle>
                <DialogDescription>
                  {detailQuery.data?.surgery?.surgeryName || t("common.loading", "Loading...")}
                </DialogDescription>
              </div>
              {detailQuery.data && (
                <button
                  type="button"
                  className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-sm hover:bg-muted disabled:opacity-50"
                  onClick={() =>
                    detailQuery.data && handleDownloadPdf(detailQuery.data.surgery.id, detailQuery.data)
                  }
                  disabled={downloadingId === detailQuery.data.surgery.id}
                  data-testid="button-download-pdf-dialog"
                >
                  {downloadingId === detailQuery.data.surgery.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {t("business.costs.downloadPdf", "Download PDF")}
                </button>
              )}
            </div>
          </DialogHeader>

          {detailQuery.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detailQuery.isError ? (
            <div className="text-center text-red-500 py-8">
              {t("common.errorLoadingData", "Error loading data")}
            </div>
          ) : detailQuery.data ? (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("business.costs.date", "Date")}:</span>
                  <span className="font-medium">{formatDate(detailQuery.data.surgery.date)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("business.costs.patient", "Patient")}:</span>
                  <span className="font-medium">{detailQuery.data.surgery.patientName || "-"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("business.costs.duration", "Duration")}:</span>
                  <span className="font-medium">{formatDuration(detailQuery.data.duration.minutes)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">{t("common.status", "Status")}:</span>
                  <Badge variant="secondary">{detailQuery.data.surgery.status || "-"}</Badge>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <TrendingUp className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm text-muted-foreground">
                    {t("business.costs.costPerHour", "Cost/Hour")}:
                  </span>
                  {(() => {
                    const h = (detailQuery.data.duration.minutes ?? 0) / 60;
                    const cph = h > 0 ? detailQuery.data.grandTotal / h : 0;
                    return (
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                        {formatCurrency(cph)}
                      </span>
                    );
                  })()}
                </div>
              </div>

              <div>
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Users className="h-4 w-4 text-purple-600" />
                  {t("business.costs.staffCosts", "Staff Costs")}
                </h4>
                {detailQuery.data.staffBreakdown.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.name", "Name")}</TableHead>
                        <TableHead>{t("common.role", "Role")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.hours", "Hours")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.hourlyRate", "Hourly rate")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.cost", "Cost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.staffBreakdown.map((staff, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{staff.name}</TableCell>
                          <TableCell>{staff.role}</TableCell>
                          <TableCell className="text-right">{staff.durationHours.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(staff.hourlyRate)}</TableCell>
                          <TableCell className="text-right text-purple-600">
                            {formatCurrency(staff.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={4}>{t("business.costs.totalStaffCosts", "Total staff costs")}</TableCell>
                        <TableCell className="text-right text-purple-600">
                          {formatCurrency(detailQuery.data.staffTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("business.costs.noStaffData", "No staff data available")}
                  </p>
                )}
              </div>

              <div>
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Pill className="h-4 w-4 text-green-600" />
                  {t("business.costs.anesthesiaCosts", "Anesthesia Costs")}
                </h4>
                {detailQuery.data.anesthesiaItems.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.item", "Item")}</TableHead>
                        <TableHead className="text-right">{t("common.quantity", "Quantity")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.unitPrice", "Unit price")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.cost", "Cost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.anesthesiaItems.map((it) => (
                        <TableRow key={it.itemId}>
                          <TableCell>{it.itemName}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(it.unitPrice)}</TableCell>
                          <TableCell className="text-right text-green-600">{formatCurrency(it.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={3}>
                          {t("business.costs.totalAnesthesiaCosts", "Total anesthesia costs")}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {formatCurrency(detailQuery.data.anesthesiaTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("business.costs.noAnesthesiaItems", "No anesthesia items recorded")}
                  </p>
                )}
              </div>

              <div>
                <h4 className="flex items-center gap-2 font-semibold mb-3">
                  <Scissors className="h-4 w-4 text-blue-600" />
                  {t("business.costs.surgeryCosts", "Surgery Costs")}
                </h4>
                {detailQuery.data.surgeryItems.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("common.item", "Item")}</TableHead>
                        <TableHead className="text-right">{t("common.quantity", "Quantity")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.unitPrice", "Unit price")}</TableHead>
                        <TableHead className="text-right">{t("business.costs.cost", "Cost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailQuery.data.surgeryItems.map((it) => (
                        <TableRow key={it.itemId}>
                          <TableCell>{it.itemName}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right">{formatCurrency(it.unitPrice)}</TableCell>
                          <TableCell className="text-right text-blue-600">{formatCurrency(it.cost)}</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold bg-muted/50">
                        <TableCell colSpan={3}>
                          {t("business.costs.totalSurgeryCosts", "Total surgery costs")}
                        </TableCell>
                        <TableCell className="text-right text-blue-600">
                          {formatCurrency(detailQuery.data.surgeryTotal)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {t("business.costs.noSurgeryItems", "No surgery items recorded")}
                  </p>
                )}
              </div>

              <div className="p-4 bg-primary/10 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-semibold">
                    {t("business.costs.grandTotal", "Grand total")}
                  </span>
                  <span className="text-2xl font-bold">{formatCurrency(detailQuery.data.grandTotal)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={showNurseHoursDialog} onOpenChange={setShowNurseHoursDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              {t("business.costs.anesthesiaNurseHours", "Anesthesia Nurse Hours")}
            </DialogTitle>
            <DialogDescription>
              {t(
                "business.costs.anesthesiaNurseHoursDesc",
                "Calculated from 07:00 to last surgery end + 1h buffer",
              )}
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const months = nurseHoursQuery.data?.months ?? [];
            if (months.length === 0) return null;
            const past = months.filter((m) => m.isPast);
            const future = months.filter((m) => !m.isPast);
            const pastTotal = past.reduce((sum, m) => sum + m.totalHours, 0);
            const futureTotal = future.reduce((sum, m) => sum + m.totalHours, 0);
            const now = new Date();
            const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
            const formatMonth = (ms: string) => {
              const [y, m] = ms.split("-");
              return new Date(parseInt(y), parseInt(m) - 1).toLocaleDateString("en", {
                month: "short",
                year: "numeric",
              });
            };
            return (
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm text-muted-foreground">
                    {t("business.costs.hourlyRate", "Hourly rate")}:
                  </span>
                  <Input
                    type="number"
                    value={anesthesiaNurseRate}
                    onChange={(e) => setAnesthesiaNurseRate(Number(e.target.value) || 0)}
                    className="w-20 h-8 text-right"
                  />
                  <span className="text-sm text-muted-foreground">{getCurrencySymbol()}/h</span>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("business.costs.date", "Date")}</TableHead>
                        <TableHead className="text-right">
                          {t("business.costs.surgeryDays", "Surgery days")}
                        </TableHead>
                        <TableHead className="text-right">{t("business.costs.hours", "Hours")}</TableHead>
                        <TableHead className="text-right">
                          {t("business.costs.avgPerDay", "Avg per day")}
                        </TableHead>
                        <TableHead className="text-right">{t("business.costs.cost", "Cost")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {past.map((m) => (
                        <TableRow key={m.month} className={m.month === currentMonth ? "bg-blue-50 dark:bg-blue-900/20" : ""}>
                          <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays}</TableCell>
                          <TableCell className="text-right">{m.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            {m.surgeryDays > 0 ? (m.totalHours / m.surgeryDays).toFixed(1) : "0.0"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyLocale(m.totalHours * anesthesiaNurseRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {past.length > 0 && (
                        <TableRow className="border-t-2 font-semibold">
                          <TableCell colSpan={4} className="text-right text-muted-foreground">
                            {t("business.costs.pastTotal", "Past total")}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyLocale(pastTotal * anesthesiaNurseRate)}
                          </TableCell>
                        </TableRow>
                      )}
                      {future.length > 0 && (
                        <TableRow className="border-t-2 border-b-0 bg-muted/30">
                          <TableCell colSpan={5} className="text-center text-sm font-semibold text-muted-foreground tracking-wider py-1">
                            {t("business.costs.planned", "Planned")}
                          </TableCell>
                        </TableRow>
                      )}
                      {future.map((m) => (
                        <TableRow key={m.month} className="text-muted-foreground italic">
                          <TableCell className="font-medium">{formatMonth(m.month)}</TableCell>
                          <TableCell className="text-right">{m.surgeryDays}</TableCell>
                          <TableCell className="text-right">{m.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right">
                            {m.surgeryDays > 0 ? (m.totalHours / m.surgeryDays).toFixed(1) : "0.0"}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyLocale(m.totalHours * anesthesiaNurseRate)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {future.length > 0 && (
                        <TableRow className="border-t-2 font-semibold">
                          <TableCell colSpan={4} className="text-right text-muted-foreground">
                            {t("business.costs.plannedTotal", "Planned total")}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrencyLocale(futureTotal * anesthesiaNurseRate)}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
