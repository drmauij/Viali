import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, BarChart3, CheckCircle2, Inbox, Megaphone } from "lucide-react";
import ChainLocationFilter from "@/components/chain/ChainLocationFilter";
import ChainFunnelsOverview from "@/components/chain/ChainFunnelsOverview";
import { LeadsStatsCards } from "@/pages/business/marketing/LeadsStatsCards";
import LeadsReadOnlyCard from "@/components/funnels/LeadsReadOnlyCard";
import ReferralEventsTab from "@/components/funnels/ReferralEventsTab";
import ReferralFunnel from "@/pages/business/ReferralFunnel";
import { type FunnelsScope } from "@/lib/funnelsApi";

type Tab = "overview" | "leads" | "events" | "conversion" | "ads";
type Range = "30d" | "90d" | "365d";

/**
 * Reads filter state (range, hospitalIds, tab) from the URL query string and
 * exposes a setter that updates the URL via wouter's `navigate(..., { replace })`.
 */
function useUrlState() {
  const [location, navigate] = useLocation();
  // wouter doesn't surface the query string directly; read from window.
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const range = (params.get("range") as Range) || "30d";
  const hospitalIdsRaw = params.get("hospitalIds") || "";
  const hospitalIds = hospitalIdsRaw === "" ? [] : hospitalIdsRaw.split(",").filter(Boolean);
  const tab = (params.get("tab") as Tab) || "overview";

  const setQuery = (
    next: Partial<{ range: Range; hospitalIds: string[]; tab: Tab }>,
  ) => {
    const merged = new URLSearchParams(window.location.search);
    if (next.range !== undefined) merged.set("range", next.range);
    if (next.hospitalIds !== undefined) {
      if (next.hospitalIds.length === 0) merged.delete("hospitalIds");
      else merged.set("hospitalIds", next.hospitalIds.join(","));
    }
    if (next.tab !== undefined) merged.set("tab", next.tab);
    const path = location.split("?")[0];
    navigate(`${path}?${merged.toString()}`, { replace: true });
  };

  return { range, hospitalIds, tab, setQuery };
}

function rangeToDates(range: "30d" | "90d" | "365d"): { from: string; to: string } {
  const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function EmptyLocations() {
  const { t } = useTranslation();
  return (
    <div
      className="text-sm text-muted-foreground p-12 text-center"
      data-testid="empty-no-locations"
    >
      {t("chain.funnels.selectAtLeastOne", "Select at least one clinic to see data.")}
    </div>
  );
}

export default function ChainFunnels() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const { range, hospitalIds, tab, setQuery } = useUrlState();

  // Fetch location list to support auto-populate on first load
  const { data: locationsData } = useQuery<{
    locations: Array<{ hospitalId: string; hospitalName: string }>;
  }>({
    queryKey: [`/api/chain/${groupId}/funnels?range=30d`],
    enabled: !!groupId,
  });

  // Auto-populate hospitalIds on first load when URL has no hospitalIds param yet
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      !params.has("hospitalIds") &&
      locationsData?.locations &&
      locationsData.locations.length > 0
    ) {
      setQuery({ hospitalIds: locationsData.locations.map((l) => l.hospitalId) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationsData]);

  const scope = useMemo<FunnelsScope>(
    () => ({ hospitalIds, groupId }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hospitalIds.join(","), groupId],
  );

  const dateRange = useMemo(() => rangeToDates(range), [range]);

  if (!groupId) {
    return (
      <div
        className="p-8 text-center text-muted-foreground"
        data-testid="chain-funnels-no-group"
      >
        {t("chain.funnels.noGroup", "This clinic is not part of a chain.")}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24" data-testid="chain-funnels">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h1 className="text-2xl md:text-3xl font-bold">
          {t("chain.funnels.title", "Funnels")}
        </h1>
        <div className="flex items-center gap-3">
          <Select
            value={range}
            onValueChange={(v) => setQuery({ range: v as Range })}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-range">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30d">
                {t("business.range.30d", "Last 30 days")}
              </SelectItem>
              <SelectItem value="90d">
                {t("business.range.90d", "Last 90 days")}
              </SelectItem>
              <SelectItem value="365d">
                {t("business.range.365d", "Last year")}
              </SelectItem>
            </SelectContent>
          </Select>
          <ChainLocationFilter
            groupId={groupId}
            value={hospitalIds}
            onChange={(ids) => setQuery({ hospitalIds: ids })}
          />
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setQuery({ tab: v as Tab })}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview" data-testid="tab-overview">
            <BarChart3 className="h-4 w-4 mr-1" />
            {t("chain.funnels.overview", "Overview")}
          </TabsTrigger>
          <TabsTrigger value="leads" data-testid="tab-leads">
            <Inbox className="h-4 w-4 mr-1" />
            {t("business.referrals.leadsTab", "Leads")}
          </TabsTrigger>
          <TabsTrigger value="events" data-testid="tab-events">
            <Activity className="h-4 w-4 mr-1" />
            {t("business.referrals.eventsTab", "Referrals")}
          </TabsTrigger>
          <TabsTrigger value="conversion" data-testid="tab-conversion">
            <CheckCircle2 className="h-4 w-4 mr-1" />
            {t("business.referrals.conversionTab", "Conversion")}
          </TabsTrigger>
          <TabsTrigger value="ads" data-testid="tab-ads">
            <Megaphone className="h-4 w-4 mr-1" />
            {t("business.referrals.adsTab", "Ad performance")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <ChainFunnelsOverview
            groupId={groupId}
            hospitalIds={hospitalIds}
            range={range}
          />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4">
          {hospitalIds.length === 0 ? (
            <EmptyLocations />
          ) : (
            <>
              <LeadsStatsCards scope={scope} from={dateRange.from} to={dateRange.to} />
              <LeadsReadOnlyCard scope={scope} from={dateRange.from} to={dateRange.to} />
            </>
          )}
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          {hospitalIds.length === 0 ? (
            <EmptyLocations />
          ) : (
            <ReferralEventsTab
              scope={scope}
              from={dateRange.from}
              to={dateRange.to}
              // TODO: derive from /funnels-overview response (Task 9)
              currency="CHF"
            />
          )}
        </TabsContent>

        <TabsContent value="conversion">
          {hospitalIds.length === 0 ? (
            <EmptyLocations />
          ) : (
            <ReferralFunnel
              scope={scope}
              from={dateRange.from}
              to={dateRange.to}
              // TODO: derive from /funnels-overview response (Task 9)
              currency="CHF"
              view="conversion"
            />
          )}
        </TabsContent>

        <TabsContent value="ads">
          {hospitalIds.length === 0 ? (
            <EmptyLocations />
          ) : (
            <ReferralFunnel
              scope={scope}
              from={dateRange.from}
              to={dateRange.to}
              // TODO: derive from /funnels-overview response (Task 9)
              currency="CHF"
              view="ads"
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
