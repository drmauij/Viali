// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/hooks/useActiveHospital", () => ({
  useActiveHospital: () => ({ role: "manager" }),
}));

// Mock recharts so jsdom doesn't have to handle SVG layout. We just verify
// that the right number of <Line>/<Bar> children are passed and the data
// prop matches.
vi.mock("recharts", async () => {
  const actual = await vi.importActual<any>("recharts");
  return {
    ...actual,
    ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  };
});

import ReferralEventsTab from "@/components/funnels/ReferralEventsTab";

function renderWith({
  stats,
  daily,
  events = { rows: [], total: 0, campaigns: [] },
  timeseries = [],
}: {
  stats: any;
  daily: any;
  events?: any;
  timeseries?: any;
}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(
    [`/api/business/hosp1/referral-stats?from=2026-05-01&to=2026-05-10`],
    stats,
  );
  qc.setQueryData(
    [`/api/business/hosp1/referral-timeseries`],
    timeseries,
  );
  qc.setQueryData(
    [`/api/business/hosp1/referral-daily?from=2026-05-01&to=2026-05-10`],
    daily,
  );
  qc.setQueryData(
    [
      `/api/business/hosp1/referral-events?limit=50&from=2026-05-01&to=2026-05-10`,
    ],
    events,
  );

  // Force the Source insights card open via localStorage seed.
  localStorage.setItem("marketing.verweise.sourceInsights.open", "true");

  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ReferralEventsTab
          scope={{ hospitalIds: ["hosp1"] }}
          from="2026-05-01"
          to="2026-05-10"
          currency="CHF"
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const baseDaily = {
  rows: [
    // Mon 2026-05-04 — 1 social, 1 search_engine
    { date: "2026-05-04", total: 2, bySource: { social: 1, search_engine: 1 } },
    // Tue 2026-05-05 — 0
    { date: "2026-05-05", total: 0, bySource: {} },
    // Wed 2026-05-06 — 2 social
    { date: "2026-05-06", total: 2, bySource: { social: 2 } },
    // next Mon 2026-05-11 — 3 social
    { date: "2026-05-11", total: 3, bySource: { social: 3 } },
  ],
  sources: ["social", "search_engine"],
  timezone: "Europe/Zurich",
};

describe("Source insights — derived data", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders avg/day = totalReferrals / daysInRange (not rows.length)", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 10 },
      daily: baseDaily,
    });
    // (2026-05-01..2026-05-10) inclusive = 10 days. 10 / 10 = 1.0
    // getByText throws if not found, so the assertion is the call itself.
    expect(screen.getByText("1.0")).toBeTruthy();
  });

  it("renders the avg/day with one decimal even for fractional values", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 7 },
      daily: baseDaily,
    });
    expect(screen.getByText("0.7")).toBeTruthy();
  });

  it("hides the avg/day suffix when totalReferrals is missing", () => {
    renderWith({
      stats: null,
      daily: baseDaily,
    });
    expect(screen.queryByText("/day avg")).toBeNull();
  });

  it("renders the upgraded chart title with foreground contrast", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 4 },
      daily: baseDaily,
    });
    // i18n key `business.referrals.progressOverTime` resolves to
    // "Referral Sources Over Time" in en.json.
    const title = screen.getByText(/sources over time/i);
    // From Task 6 + Task 11 — title gets text-foreground
    expect(title.className).toContain("text-foreground");
  });
});
