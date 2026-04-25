import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
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

export default function ChainFunnels() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const groupId = (activeHospital as any)?.groupId ?? null;
  const { range, hospitalIds, tab, setQuery } = useUrlState();

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

        {/* Tabs 2–5 wired in Task 8 */}
        <TabsContent value="leads">
          <div
            className="text-sm text-muted-foreground p-12 text-center"
            data-testid="placeholder-leads"
          >
            {t(
              "chain.funnels.placeholderTab",
              "This tab is wired in the next implementation step.",
            )}
          </div>
        </TabsContent>
        <TabsContent value="events">
          <div
            className="text-sm text-muted-foreground p-12 text-center"
            data-testid="placeholder-events"
          >
            {t(
              "chain.funnels.placeholderTab",
              "This tab is wired in the next implementation step.",
            )}
          </div>
        </TabsContent>
        <TabsContent value="conversion">
          <div
            className="text-sm text-muted-foreground p-12 text-center"
            data-testid="placeholder-conversion"
          >
            {t(
              "chain.funnels.placeholderTab",
              "This tab is wired in the next implementation step.",
            )}
          </div>
        </TabsContent>
        <TabsContent value="ads">
          <div
            className="text-sm text-muted-foreground p-12 text-center"
            data-testid="placeholder-ads"
          >
            {t(
              "chain.funnels.placeholderTab",
              "This tab is wired in the next implementation step.",
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
