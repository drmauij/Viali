import { useTranslation } from "react-i18next";
import ReferralFunnel from "./ReferralFunnel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import MarketingAiInsights from "./MarketingAiInsights";
import { Redirect } from "wouter";
import {
  HelpCircle,
  List,
  Loader2,
  Pencil,
  Trash2,
  PieChart as PieChartIcon,
  Inbox,
  Activity,
  Megaphone,
  CheckCircle2,
  Phone,
  Download,
} from "lucide-react";
import { SourceIcon, sourceLabel } from "@/components/leads/sourceIcon";
import { LeadsStatsCards } from "./marketing/LeadsStatsCards";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDate } from "@/lib/dateUtils";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface HelpTooltipProps {
  content: string;
}

function HelpTooltip({ content }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help ml-1" />
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-sm">{content}</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface ChartCardProps {
  title: string;
  description?: string;
  helpText: string;
  children: React.ReactNode;
}

function ChartCard({ title, description, helpText, children }: ChartCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center">
          <CardTitle className="text-lg">{title}</CardTitle>
          <HelpTooltip content={helpText} />
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children}
      </CardContent>
    </Card>
  );
}

type LeadStatus = "new" | "in_progress" | "converted" | "closed";

type LeadRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: LeadStatus;
  appointmentId: string | null;
  contactCount: number;
  lastContactAt: string | null;
  createdAt: string;
};

const LEAD_PAGE_SIZE = 50;
const STATUS_FILTERS: Array<"all" | LeadStatus> = ["all", "new", "in_progress", "converted", "closed"];

function LeadStatusPill({ status }: { status: LeadStatus }) {
  const { t } = useTranslation();
  const map: Record<LeadStatus, { label: string; cls: string }> = {
    new: {
      label: t("business.leads.status.new", "New"),
      cls: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/30",
    },
    in_progress: {
      label: t("business.leads.status.in_progress", "In Progress"),
      cls: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    },
    converted: {
      label: t("business.leads.status.converted", "Converted"),
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    },
    closed: {
      label: t("business.leads.status.closed", "Closed"),
      cls: "bg-muted text-muted-foreground ring-border",
    },
  };
  const v = map[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function LeadsReadOnlyCard({
  hospitalId,
  from,
  to,
}: {
  hospitalId: string;
  from: string;
  to: string;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [leadsList, setLeadsList] = useState<LeadRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const params = new URLSearchParams();
  params.set("limit", String(LEAD_PAGE_SIZE));
  if (status !== "all") params.set("status", status);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const listUrl = `/api/business/${hospitalId}/leads?${params.toString()}`;

  useEffect(() => {
    setLeadsList([]);
    setHasMore(true);
  }, [listUrl]);

  const { isLoading } = useQuery<LeadRow[]>({
    queryKey: [listUrl],
    enabled: !!hospitalId,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    queryFn: async () => {
      const res = await fetch(listUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load leads");
      const data: LeadRow[] = await res.json();
      setLeadsList(data);
      setHasMore(data.length === LEAD_PAGE_SIZE);
      return data;
    },
  });

  const loadMore = useCallback(async () => {
    if (!hospitalId || loadingMore || !hasMore) return;
    const last = leadsList[leadsList.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const more = new URLSearchParams(params);
      more.set("before", last.createdAt);
      const res = await fetch(
        `/api/business/${hospitalId}/leads?${more.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Failed to load more leads");
      const page: LeadRow[] = await res.json();
      setLeadsList((prev) => [...prev, ...page]);
      setHasMore(page.length === LEAD_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [hospitalId, leadsList, hasMore, loadingMore, status, from, to]);

  const exportParams = new URLSearchParams();
  if (status !== "all") exportParams.set("status", status);
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const exportUrl = `/api/business/${hospitalId}/leads-export.csv${
    exportParams.toString() ? `?${exportParams.toString()}` : ""
  }`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-lg">
              {t("business.leads.title", "Leads")}
            </CardTitle>
            <CardDescription>
              {t(
                "business.leads.description",
                "Read-only overview of incoming leads with status and conversion.",
              )}
            </CardDescription>
          </div>
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
            data-testid="leads-export-csv"
          >
            <Download className="h-3.5 w-3.5" />
            {t("business.leads.export.csv", "Export CSV")}
          </a>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              aria-pressed={status === f}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                status === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              }`}
              data-testid={`lead-filter-${f}`}
            >
              {f === "all"
                ? t("business.leads.filter.all", "All")
                : t(`business.leads.status.${f}`, f)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : leadsList.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {t("business.leads.empty", "No leads yet.")}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.name", "Name")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.source", "Source")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.status", "Status")}</th>
                    <th className="text-right font-medium px-2 py-2">{t("business.leads.col.contacts", "Contacts")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.converted", "Converted")}</th>
                    <th className="text-left font-medium px-2 py-2">{t("business.leads.col.created", "Received")}</th>
                  </tr>
                </thead>
                <tbody>
                  {leadsList.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="px-2 py-2 font-medium">
                        {`${l.firstName} ${l.lastName}`.trim() || "—"}
                        {(l.email || l.phone) && (
                          <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {l.email || l.phone}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex items-center gap-1 text-muted-foreground"
                          title={sourceLabel(l.source)}
                        >
                          <SourceIcon source={l.source} />
                          <span className="sr-only">{sourceLabel(l.source)}</span>
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <LeadStatusPill status={l.status} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {l.contactCount}
                        {l.contactCount > 0 && (
                          <Phone className="inline-block ml-1 h-3 w-3 text-muted-foreground" />
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {l.appointmentId || l.status === "converted" ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {t("business.leads.yes", "Yes")}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {t("business.leads.no", "No")}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">
                        {formatDate(l.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {t("common.loading", "Loading...")}</>
                  ) : (
                    t("common.loadMore", "Load more")
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const REFERRAL_COLORS: Record<string, string> = {
  social: "#3b82f6",
  search_engine: "#10b981",
  llm: "#8b5cf6",
  word_of_mouth: "#f59e0b",
  belegarzt: "#ec4899",
  marketing: "#14b8a6",
  other: "#6b7280",
};

const REFERRAL_LABELS: Record<string, string> = {
  social: "Social Media",
  search_engine: "Search Engine",
  llm: "AI Assistant",
  word_of_mouth: "Personal Recommendation",
  belegarzt: "Referring Doctor",
  marketing: "Marketing",
  other: "Other",
};

const REFERRAL_DETAIL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  tiktok: "TikTok",
  google: "Google",
  bing: "Bing",
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  "Google Maps": "Google Maps",
  ChatGPT: "ChatGPT",
  Claude: "Claude",
  Perplexity: "Perplexity",
};

type ReferralEvent = {
  id: string;
  source: string;
  sourceDetail: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  // Ad platform campaign attribution (from lead webhook)
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adId: string | null;
  // Unified campaign label: COALESCE(campaignName, utmCampaign), computed server-side
  campaign: string | null;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  ttclid: string | null;
  msclkid: string | null;
  metaLeadId: string | null;
  metaFormId: string | null;
  captureMethod: string;
  createdAt: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  treatmentName: string | null;
};

export default function Marketing() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [referralFrom, setReferralFrom] = useState("");
  const [referralTo, setReferralTo] = useState(new Date().toISOString().slice(0, 10));
  const [selectedReferralSource, setSelectedReferralSource] = useState<string | null>(null);

  const isManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager' || activeHospital?.role === 'marketing';
  const isAdminOrManager = activeHospital?.role === 'admin' || activeHospital?.role === 'manager';
  const isAdmin = activeHospital?.role === 'admin';
  const { toast } = useToast();

  // Edit referral state
  const [editingReferral, setEditingReferral] = useState<ReferralEvent | null>(null);
  const [editSource, setEditSource] = useState('');
  const [editSourceDetail, setEditSourceDetail] = useState('');

  const editReferralMutation = useMutation({
    mutationFn: async ({ eventId, source, sourceDetail }: { eventId: string; source: string; sourceDetail: string }) => {
      const res = await apiRequest('PATCH', `/api/business/${activeHospital?.id}/referral-events/${eventId}`, { source, sourceDetail });
      return res.json();
    },
    onSuccess: () => {
      // Update local state to reflect change immediately
      setReferralEvents(prev => prev.map(ev =>
        ev.id === editingReferral?.id ? { ...ev, source: editSource, sourceDetail: editSourceDetail || null } : ev
      ));
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/referral-stats`] });
      setEditingReferral(null);
      toast({ title: "Referral updated" });
    },
    onError: () => {
      toast({ title: "Failed to update referral", variant: "destructive" });
    },
  });

  const deleteReferralMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const res = await apiRequest('DELETE', `/api/business/${activeHospital?.id}/referral-events/${eventId}`);
      return res.json();
    },
    onSuccess: (_data, eventId) => {
      setReferralEvents(prev => prev.filter(ev => ev.id !== eventId));
      queryClient.invalidateQueries({ queryKey: [`/api/business/${activeHospital?.id}/referral-stats`] });
      toast({ title: "Referral deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete referral", variant: "destructive" });
    },
  });

  const openEditDialog = (ev: ReferralEvent) => {
    setEditSource(ev.source);
    setEditSourceDetail(ev.sourceDetail || '');
    setEditingReferral(ev);
  };

  if (activeHospital && !isManager) {
    return <Redirect to="/business/administration" />;
  }

  // Fetch referral source statistics
  const referralParams = new URLSearchParams();
  if (referralFrom) referralParams.set("from", referralFrom);
  if (referralTo) referralParams.set("to", referralTo);

  const [selectedDetail, setSelectedDetail] = useState<string | null>(null);

  const { data: referralData, isLoading: referralLoading } = useQuery<{
    breakdown: Array<{ referralSource: string; referralSourceDetail: string | null; isPaid: boolean; count: number }>;
    totalReferrals: number;
  }>({
    queryKey: [`/api/business/${activeHospital?.id}/referral-stats?${referralParams.toString()}`],
    enabled: !!activeHospital?.id,
  });

  // Fetch referral time-series (full history, no date filter)
  const { data: referralTimeseries, isLoading: referralTimeseriesLoading } = useQuery<
    Array<{ month: string; referralSource: string; count: number }>
  >({
    queryKey: [`/api/business/${activeHospital?.id}/referral-timeseries`],
    enabled: !!activeHospital?.id,
  });

  // (ReferralEvent type moved above component)

  // Fetch recent referral events with progressive loading
  const [referralEvents, setReferralEvents] = useState<ReferralEvent[]>([]);
  const [referralEventsHasMore, setReferralEventsHasMore] = useState(true);
  const [referralEventsLoadingMore, setReferralEventsLoadingMore] = useState(false);
  const PAGE_SIZE = 50;

  const { isLoading: referralEventsLoading } = useQuery<ReferralEvent[]>({
    queryKey: [`/api/business/${activeHospital?.id}/referral-events?limit=${PAGE_SIZE}`],
    enabled: !!activeHospital?.id,
    queryFn: async () => {
      const res = await fetch(`/api/business/${activeHospital?.id}/referral-events?limit=${PAGE_SIZE}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch referral events');
      const data: ReferralEvent[] = await res.json();
      setReferralEvents(data);
      setReferralEventsHasMore(data.length === PAGE_SIZE);
      return data;
    },
  });

  const loadMoreReferralEvents = useCallback(async () => {
    if (!activeHospital?.id || referralEventsLoadingMore || !referralEventsHasMore) return;
    setReferralEventsLoadingMore(true);
    try {
      const lastEvent = referralEvents[referralEvents.length - 1];
      if (!lastEvent) return;
      const res = await fetch(
        `/api/business/${activeHospital.id}/referral-events?limit=${PAGE_SIZE}&before=${encodeURIComponent(lastEvent.createdAt)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to fetch more referral events');
      const data: ReferralEvent[] = await res.json();
      setReferralEvents(prev => [...prev, ...data]);
      setReferralEventsHasMore(data.length === PAGE_SIZE);
    } finally {
      setReferralEventsLoadingMore(false);
    }
  }, [activeHospital?.id, referralEvents, referralEventsLoadingMore, referralEventsHasMore]);

  // Transform time-series into line chart format: [{ month, social: N, search_engine: N, ... }]
  const referralLineData = useMemo(() => {
    if (!referralTimeseries?.length) return [];
    const monthMap: Record<string, Record<string, number>> = {};
    const allSources = new Set<string>();
    for (const row of referralTimeseries) {
      if (!monthMap[row.month]) monthMap[row.month] = {};
      monthMap[row.month][row.referralSource] = (monthMap[row.month][row.referralSource] || 0) + row.count;
      allSources.add(row.referralSource);
    }
    return Object.keys(monthMap).sort().map((month) => {
      const entry: Record<string, any> = { month };
      for (const src of allSources) {
        entry[src] = monthMap[month][src] || 0;
      }
      return entry;
    });
  }, [referralTimeseries]);

  // Collect unique sources from the time-series data
  const referralLineSources = useMemo(() => {
    if (!referralTimeseries?.length) return [];
    const s = new Set<string>();
    for (const row of referralTimeseries) s.add(row.referralSource);
    return Array.from(s);
  }, [referralTimeseries]);

  const referralPieData = useMemo(() => {
    if (!referralData?.breakdown) return [];
    const grouped: Record<string, number> = {};
    referralData.breakdown.forEach((r) => {
      grouped[r.referralSource] = (grouped[r.referralSource] || 0) + r.count;
    });
    return Object.entries(grouped).map(([source, count]) => ({
      name: REFERRAL_LABELS[source] || source,
      value: count,
      source,
      color: REFERRAL_COLORS[source] || "#6b7280",
    }));
  }, [referralData]);

  const referralDetailData = useMemo(() => {
    if (!referralData?.breakdown || !selectedReferralSource) return [];
    const grouped: Record<string, number> = {};
    referralData.breakdown
      .filter((r) => r.referralSource === selectedReferralSource && r.referralSourceDetail)
      .forEach((r) => {
        const key = r.referralSourceDetail!;
        grouped[key] = (grouped[key] || 0) + r.count;
      });
    return Object.entries(grouped).map(([detail, count]) => ({
      name: REFERRAL_DETAIL_LABELS[detail] || detail,
      detail,
      value: count,
    }));
  }, [referralData, selectedReferralSource]);

  const detailPaidBreakdown = useMemo(() => {
    if (!referralData?.breakdown || !selectedReferralSource || !selectedDetail) return [];
    const rows = referralData.breakdown.filter(
      (r) => r.referralSource === selectedReferralSource && r.referralSourceDetail === selectedDetail
    );
    let paid = 0, organic = 0;
    rows.forEach((r) => { if (r.isPaid) paid += r.count; else organic += r.count; });
    const result = [];
    if (organic > 0) result.push({ name: "Organic", value: organic, color: "#10b981" });
    if (paid > 0) result.push({ name: "Paid", value: paid, color: "#f59e0b" });
    return result;
  }, [referralData, selectedReferralSource, selectedDetail]);

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            Marketing
          </h1>
          <p className="text-muted-foreground mt-1">
            Referral sources, lead conversion, and marketing analytics
          </p>
        </div>
      </div>

      <div className="space-y-4">
          <MarketingAiInsights
            hospitalId={activeHospital?.id ?? ""}
            startDate={referralFrom}
            endDate={referralTo}
          />

          {/* Date range filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">{t('business.referrals.from', 'Von')}</span>
                  <DateInput value={referralFrom} onChange={setReferralFrom} />
                </div>
                <div className="space-y-1.5">
                  <span className="text-sm font-medium">{t('business.referrals.to', 'Bis')}</span>
                  <DateInput value={referralTo} onChange={setReferralTo} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs: Sources | Leads | Referrals | Conversion | Ad Performance */}
          <Tabs defaultValue="sources" className="space-y-4">
            <div className="overflow-x-auto scrollbar-hide">
              <TabsList>
                <TabsTrigger value="sources" data-testid="tab-marketing-sources">
                  <PieChartIcon className="h-4 w-4 mr-1" />
                  {t('business.referrals.sourcesTab', 'Quellen')}
                </TabsTrigger>
                <TabsTrigger value="leads" data-testid="tab-marketing-leads">
                  <Inbox className="h-4 w-4 mr-1" />
                  {t('business.referrals.leadsTab', 'Leads')}
                </TabsTrigger>
                <TabsTrigger value="events" data-testid="tab-marketing-events">
                  <Activity className="h-4 w-4 mr-1" />
                  {t('business.referrals.recentEvents', 'Verweise')}
                </TabsTrigger>
                <TabsTrigger value="conversion" data-testid="tab-marketing-conversion">
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  {t('business.referrals.conversionTab', 'Konversion')}
                </TabsTrigger>
                <TabsTrigger value="ads" data-testid="tab-marketing-ads">
                  <Megaphone className="h-4 w-4 mr-1" />
                  {t('business.referrals.adsTab', 'Werbeleistung')}
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="sources" className="space-y-4">
          {/* Sample size indicator */}
          {referralData && (
            <div className="text-sm text-muted-foreground px-1">
              {referralData.totalReferrals} {t('business.referrals.totalBookingReferrals')}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {/* Main pie chart */}
            <ChartCard
              title={t('business.referrals.sourceBreakdown')}
              helpText={t('business.referrals.sourceBreakdownHelp')}
            >
              {referralLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : referralPieData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.noData')}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={referralPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      onClick={(entry) => {
                        setSelectedReferralSource(
                          selectedReferralSource === entry.source ? null : entry.source
                        );
                        setSelectedDetail(null);
                      }}
                      cursor="pointer"
                    >
                      {referralPieData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.color}
                          opacity={selectedReferralSource && selectedReferralSource !== entry.source ? 0.4 : 1}
                          stroke={selectedReferralSource === entry.source ? entry.color : "transparent"}
                          strokeWidth={selectedReferralSource === entry.source ? 3 : 0}
                        />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number) => [value, t('business.referrals.responses')]}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const entry = referralPieData.find((e) => e.name === value);
                        if (!entry) return value;
                        const total = referralPieData.reduce((s, e) => s + e.value, 0);
                        const pct = total > 0 ? ((entry.value / total) * 100).toFixed(0) : "0";
                        return `${value} ${entry.value} (${pct}%)`;
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            {/* Detail drill-down */}
            <ChartCard
              title={selectedReferralSource
                ? `${REFERRAL_LABELS[selectedReferralSource] || selectedReferralSource} — ${t('business.referrals.detail')}`
                : t('business.referrals.clickToExplore')
              }
              helpText={t('business.referrals.detailHelp')}
            >
              {!selectedReferralSource ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.selectSlice')}
                </div>
              ) : referralDetailData.length === 0 ? (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  {t('business.referrals.noDetail')}
                </div>
              ) : (
                <div className="space-y-3 pt-2">
                  {referralDetailData.map((item, i) => {
                    const total = referralDetailData.reduce((s, d) => s + d.value, 0);
                    const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
                    const isSelected = selectedDetail === item.detail;
                    return (
                      <div key={i}>
                        <div
                          className="space-y-1 cursor-pointer rounded-md px-2 py-1.5 -mx-2 transition-colors hover:bg-muted/50"
                          style={isSelected ? { backgroundColor: 'hsl(var(--muted) / 0.5)' } : undefined}
                          onClick={() => setSelectedDetail(isSelected ? null : item.detail)}
                        >
                          <div className="flex justify-between text-sm">
                            <span>{item.name}</span>
                            <span className="text-muted-foreground">{item.value} ({pct}%)</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: REFERRAL_COLORS[selectedReferralSource] || "#6b7280",
                              }}
                            />
                          </div>
                        </div>
                        {isSelected && detailPaidBreakdown.length > 0 && (
                          <div className="mt-2 mb-1">
                            <div className="flex items-center gap-4 justify-center">
                              {detailPaidBreakdown.map((entry, idx) => {
                                const tot = detailPaidBreakdown.reduce((s, e) => s + e.value, 0);
                                const p = tot > 0 ? ((entry.value / tot) * 100).toFixed(0) : "0";
                                return (
                                  <div key={idx} className="flex items-center gap-1.5 text-xs">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                                    <span>{entry.name} {entry.value} ({p}%)</span>
                                  </div>
                                );
                              })}
                            </div>
                            <ResponsiveContainer width="100%" height={120}>
                              <PieChart>
                                <Pie
                                  data={detailPaidBreakdown}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={25}
                                  outerRadius={45}
                                  paddingAngle={2}
                                  dataKey="value"
                                >
                                  {detailPaidBreakdown.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.color} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                        {isSelected && detailPaidBreakdown.length === 0 && (
                          <div className="text-xs text-muted-foreground text-center py-3">
                            No organic/paid data available
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ChartCard>
          </div>

          {/* Referral progress over time — line chart */}
          <ChartCard
            title={t('business.referrals.progressOverTime')}
            helpText={t('business.referrals.progressOverTimeHelp')}
          >
            {referralTimeseriesLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : referralLineData.length === 0 ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                {t('business.referrals.noData')}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={350}>
                <LineChart data={referralLineData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <RechartsTooltip />
                  <Legend />
                  {referralLineSources.map((src) => (
                    <Line
                      key={src}
                      type="monotone"
                      dataKey={src}
                      name={REFERRAL_LABELS[src] || src}
                      stroke={REFERRAL_COLORS[src] || "#6b7280"}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

            </TabsContent>

            <TabsContent value="leads" className="space-y-4">
              <LeadsStatsCards
                hospitalId={activeHospital?.id ?? ""}
                from={referralFrom}
                to={referralTo}
              />
              <LeadsReadOnlyCard
                hospitalId={activeHospital?.id ?? ""}
                from={referralFrom}
                to={referralTo}
              />
            </TabsContent>

            <TabsContent value="events">
          {/* Recent referral events table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <List className="h-4 w-4" />
                {t('business.referrals.recentEvents', 'Recent Referral Events')}
              </CardTitle>
              <CardDescription>
                {t('business.referrals.recentEventsHelp', 'Booking referrals with ad click IDs for tracking verification')}
                {referralEvents.length > 0 && (
                  <span className="ml-1">({referralEvents.length} loaded)</span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {referralEventsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : !referralEvents.length ? (
                <div className="text-center text-muted-foreground py-8">
                  {t('business.referrals.noData')}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('common.date', 'Date')}</TableHead>
                          <TableHead>{t('common.patient', 'Patient')}</TableHead>
                          <TableHead>{t('business.referrals.source', 'Source')}</TableHead>
                          <TableHead>{t('business.referrals.detail', 'Detail')}</TableHead>
                          <TableHead>{t('business.referrals.treatment', 'Treatment')}</TableHead>
                          <TableHead>{t('business.referrals.campaign', 'Campaign')}</TableHead>
                          <TableHead>{t('business.referrals.keyword', 'Keyword')}</TableHead>
                          <TableHead>{t('business.referrals.clickIds', 'Click IDs')}</TableHead>
                          {isAdminOrManager && <TableHead className="w-20"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {referralEvents.map((ev) => {
                          const hasClickIds = ev.gclid || ev.gbraid || ev.wbraid || ev.fbclid || ev.ttclid || ev.msclkid || ev.metaLeadId || ev.metaFormId || ev.campaignId || ev.adsetId || ev.adId;
                          return (
                            <TableRow key={ev.id}>
                              <TableCell className="whitespace-nowrap text-sm">
                                {new Date(ev.createdAt).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                              </TableCell>
                              <TableCell className="text-sm">
                                {[ev.patientFirstName, ev.patientLastName].filter(Boolean).join(' ') || '—'}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="secondary"
                                  style={{ backgroundColor: `${REFERRAL_COLORS[ev.source] || '#6b7280'}20`, color: REFERRAL_COLORS[ev.source] || '#6b7280' }}
                                >
                                  {REFERRAL_LABELS[ev.source] || ev.source}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {ev.sourceDetail || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {ev.treatmentName || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {ev.campaign || ev.utmCampaign || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {ev.utmTerm || '—'}
                              </TableCell>
                              <TableCell>
                                {hasClickIds ? (
                                  <div className="flex gap-1 flex-wrap">
                                    {ev.gclid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.gclid}>
                                        gclid
                                      </Badge>
                                    )}
                                    {ev.gbraid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.gbraid}>
                                        gbraid
                                      </Badge>
                                    )}
                                    {ev.wbraid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.wbraid}>
                                        wbraid
                                      </Badge>
                                    )}
                                    {ev.fbclid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.fbclid}>
                                        fbclid
                                      </Badge>
                                    )}
                                    {ev.ttclid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.ttclid}>
                                        ttclid
                                      </Badge>
                                    )}
                                    {ev.msclkid && (
                                      <Badge variant="outline" className="text-xs font-mono" title={ev.msclkid}>
                                        msclkid
                                      </Badge>
                                    )}
                                    {ev.metaLeadId && (
                                      <Badge variant="outline" className="text-xs font-mono bg-blue-500/10 text-blue-600 border-blue-300" title={ev.metaLeadId}>
                                        lead
                                      </Badge>
                                    )}
                                    {ev.metaFormId && (
                                      <Badge variant="outline" className="text-xs font-mono bg-blue-500/10 text-blue-600 border-blue-300" title={ev.metaFormId}>
                                        form
                                      </Badge>
                                    )}
                                    {ev.campaignId && (
                                      <Badge variant="outline" className="text-xs font-mono bg-purple-500/10 text-purple-600 border-purple-300" title={ev.campaignId}>
                                        campaign: {ev.campaignId.slice(0, 8)}…
                                      </Badge>
                                    )}
                                    {ev.adsetId && (
                                      <Badge variant="outline" className="text-xs font-mono bg-purple-500/10 text-purple-600 border-purple-300" title={ev.adsetId}>
                                        adset: {ev.adsetId.slice(0, 8)}…
                                      </Badge>
                                    )}
                                    {ev.adId && (
                                      <Badge variant="outline" className="text-xs font-mono bg-purple-500/10 text-purple-600 border-purple-300" title={ev.adId}>
                                        ad: {ev.adId.slice(0, 8)}…
                                      </Badge>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </TableCell>
                              {isAdminOrManager && (
                                <TableCell>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() => openEditDialog(ev)}
                                      title="Edit"
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    {isAdmin && (
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            title="Delete"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>{t('business.referrals.deleteDialogTitle', 'Verweis löschen?')}</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              {t('business.referrals.deleteDialogBody', 'Dies löscht den Verweis-Eintrag für {{name}} dauerhaft. Diese Aktion kann nicht rückgängig gemacht werden.', { name: [ev.patientFirstName, ev.patientLastName].filter(Boolean).join(' ') })}
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>{t('common.cancel', 'Abbrechen')}</AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() => deleteReferralMutation.mutate(ev.id)}
                                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            >
                                              {t('common.delete', 'Löschen')}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    )}
                                  </div>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                  {referralEventsHasMore && (
                    <div className="flex justify-center pt-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadMoreReferralEvents}
                        disabled={referralEventsLoadingMore}
                      >
                        {referralEventsLoadingMore ? (
                          <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading...</>
                        ) : (
                          t('common.loadMore', 'Load more')
                        )}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="conversion">
              <ReferralFunnel
                hospitalId={activeHospital?.id}
                from={referralFrom}
                to={referralTo}
                currency={activeHospital?.currency || "CHF"}
                onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
                view="conversion"
              />
            </TabsContent>

            <TabsContent value="ads">
              <ReferralFunnel
                hospitalId={activeHospital?.id}
                from={referralFrom}
                to={referralTo}
                currency={activeHospital?.currency || "CHF"}
                onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
                view="ads"
              />
            </TabsContent>
          </Tabs>

          {/* Edit Referral Dialog */}
          {editingReferral && (
            <Dialog open={!!editingReferral} onOpenChange={(open) => { if (!open) setEditingReferral(null); }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>{t('business.referrals.editDialogTitle', 'Verweis bearbeiten')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>{t('business.referrals.editSourceLabel', 'Quelle')}</Label>
                    <Select value={editSource} onValueChange={setEditSource}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="social">Social</SelectItem>
                        <SelectItem value="search_engine">Search Engine</SelectItem>
                        <SelectItem value="llm">LLM / AI</SelectItem>
                        <SelectItem value="word_of_mouth">Word of Mouth</SelectItem>
                        <SelectItem value="belegarzt">Belegarzt</SelectItem>
                        <SelectItem value="marketing">Marketing</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('business.referrals.editDetailLabel', 'Detail')}</Label>
                    <Input
                      value={editSourceDetail}
                      onChange={(e) => setEditSourceDetail(e.target.value)}
                      placeholder={t('business.referrals.editDetailPlaceholder', 'z. B. facebook, google, Empfehlung')}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingReferral(null)}>{t('common.cancel', 'Abbrechen')}</Button>
                  <Button
                    disabled={editReferralMutation.isPending}
                    onClick={() => editReferralMutation.mutate({
                      eventId: editingReferral.id,
                      source: editSource,
                      sourceDetail: editSourceDetail,
                    })}
                  >
                    {editReferralMutation.isPending
                      ? t('business.referrals.saving', 'Speichern …')
                      : t('business.referrals.save', 'Speichern')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

      </div>
    </div>
  );
}
