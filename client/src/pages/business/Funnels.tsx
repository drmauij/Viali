import { useTranslation } from "react-i18next";
import ReferralFunnel from "./ReferralFunnel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useState } from "react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import MarketingAiInsights from "./MarketingAiInsights";
import { Redirect } from "wouter";
import {
  PieChart as PieChartIcon,
  Inbox,
  Activity,
  Megaphone,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { LeadsStatsCards } from "./marketing/LeadsStatsCards";
import LeadsReadOnlyCard from "@/components/funnels/LeadsReadOnlyCard";
import ReferralEventsTab from "@/components/funnels/ReferralEventsTab";


export default function Funnels() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [referralFrom, setReferralFrom] = useState("");
  const [referralTo, setReferralTo] = useState(new Date().toISOString().slice(0, 10));

  const [leadInsightsOpen, setLeadInsightsOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("marketing.leads.insights.open");
      return saved === null ? false : saved === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("marketing.leads.insights.open", String(leadInsightsOpen));
    } catch {
      // storage disabled — silently ignore
    }
  }, [leadInsightsOpen]);

  // group_admin is admin-equivalent for the funnels page — a chain group
  // admin's job spans this surface just like a hospital admin's does.
  const isManager =
    activeHospital?.role === 'admin' ||
    activeHospital?.role === 'group_admin' ||
    activeHospital?.role === 'manager' ||
    activeHospital?.role === 'marketing';

  if (activeHospital && !isManager) {
    return <Redirect to="/business/administration" />;
  }

  const scope = useMemo(
    () => ({ hospitalIds: [activeHospital?.id ?? ""] }),
    [activeHospital?.id],
  );

  return (
    <div className="p-4 md:p-6 space-y-6 pb-24">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">
            {t("business.funnels.title", "Funnels")}
          </h1>
          <p className="text-muted-foreground mt-1">
            {t("business.funnels.subtitle", "Referral sources, lead conversion, and ad performance")}
          </p>
        </div>
      </div>

      <div className="space-y-4">
          <MarketingAiInsights
            scope={scope}
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

          {/* Tabs: Leads | Referrals | Conversion | Ad Performance */}
          <Tabs defaultValue="leads" className="space-y-4">
            <div className="overflow-x-auto scrollbar-hide">
              <TabsList>
                <TabsTrigger value="leads" data-testid="tab-marketing-leads">
                  <Inbox className="h-4 w-4 mr-1" />
                  {t('business.referrals.leadsTab', 'Leads')}
                </TabsTrigger>
                <TabsTrigger value="events" data-testid="tab-marketing-events">
                  <Activity className="h-4 w-4 mr-1" />
                  {t('business.referrals.eventsTab', 'Referrals')}
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

            <TabsContent value="leads" className="space-y-4">
              <Card>
                <CardHeader
                  role="button"
                  tabIndex={0}
                  aria-expanded={leadInsightsOpen}
                  aria-controls="lead-insights-content"
                  onClick={() => setLeadInsightsOpen((o) => !o)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setLeadInsightsOpen((o) => !o);
                    }
                  }}
                  className="cursor-pointer flex flex-row items-center justify-between py-3"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChartIcon className="h-4 w-4" />
                    {t("business.leads.stats.title", "Lead insights")}
                  </CardTitle>
                  {leadInsightsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </CardHeader>
                {leadInsightsOpen && (
                  <CardContent id="lead-insights-content" className="space-y-4">
                    <LeadsStatsCards
                      scope={scope}
                      from={referralFrom}
                      to={referralTo}
                    />
                  </CardContent>
                )}
              </Card>
              <LeadsReadOnlyCard
                scope={scope}
                from={referralFrom}
                to={referralTo}
              />
            </TabsContent>

            <TabsContent value="events" className="space-y-4">
              <ReferralEventsTab
                scope={scope}
                from={referralFrom}
                to={referralTo}
                currency={activeHospital?.currency || "CHF"}
              />
            </TabsContent>

            <TabsContent value="conversion">
              <ReferralFunnel
                scope={scope}
                from={referralFrom}
                to={referralTo}
                currency={activeHospital?.currency || "CHF"}
                onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
                view="conversion"
              />
            </TabsContent>

            <TabsContent value="ads">
              <ReferralFunnel
                scope={scope}
                from={referralFrom}
                to={referralTo}
                currency={activeHospital?.currency || "CHF"}
                onEarliestDate={(d) => { if (!referralFrom) setReferralFrom(d); }}
                view="ads"
              />
            </TabsContent>
          </Tabs>

      </div>
    </div>
  );
}
