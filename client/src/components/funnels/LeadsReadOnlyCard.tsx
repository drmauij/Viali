import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Download, Loader2, Phone } from "lucide-react";
import { SourceIcon, sourceLabel } from "@/components/leads/sourceIcon";
import { formatDate } from "@/lib/dateUtils";
import { funnelsUrl, type FunnelsScope } from "@/lib/funnelsApi";

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

interface Props {
  scope: FunnelsScope;
  from: string;
  to: string;
}

export default function LeadsReadOnlyCard({ scope, from, to }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"all" | LeadStatus>("all");
  const [leadsList, setLeadsList] = useState<LeadRow[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const listUrl = funnelsUrl("leads", scope, {
    limit: LEAD_PAGE_SIZE,
    ...(status !== "all" ? { status } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });

  useEffect(() => {
    setLeadsList([]);
    setHasMore(true);
  }, [listUrl]);

  const { data: firstPage, isLoading } = useQuery<LeadRow[]>({
    queryKey: [listUrl],
    enabled: scope.hospitalIds.length > 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (firstPage !== undefined) {
      setLeadsList(firstPage);
      setHasMore(firstPage.length === LEAD_PAGE_SIZE);
    }
  }, [firstPage, listUrl]);

  const loadMore = useCallback(async () => {
    if (scope.hospitalIds.length === 0 || loadingMore || !hasMore) return;
    const last = leadsList[leadsList.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const moreUrl = funnelsUrl("leads", scope, {
        limit: LEAD_PAGE_SIZE,
        ...(status !== "all" ? { status } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        before: last.createdAt,
      });
      if (!moreUrl) return;
      const res = await fetch(moreUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load more leads");
      const page: LeadRow[] = await res.json();
      setLeadsList((prev) => [...prev, ...page]);
      setHasMore(page.length === LEAD_PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  }, [scope, leadsList, hasMore, loadingMore, status, from, to]);

  // CSV export only available in clinic scope (no chain mirror today)
  const exportUrl = !scope.groupId
    ? funnelsUrl("leads-export.csv", scope, {
        ...(status !== "all" ? { status } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      })
    : null;

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
          {exportUrl && (
            <a
              href={exportUrl}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
              data-testid="leads-export-csv"
            >
              <Download className="h-3.5 w-3.5" />
              {t("business.leads.export.csv", "Export CSV")}
            </a>
          )}
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
