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

  it("renders avg/day from referralDaily — sum(rows.total) / rows.length", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 999 },
      daily: baseDaily,
    });
    // baseDaily has 4 rows with totals 2 + 0 + 2 + 3 = 7 → 7 / 4 = 1.75 → "1.8" (toFixed(1))
    // The high stats.totalReferrals (999) is intentionally ignored so the metric
    // stays internally consistent regardless of what referral-stats reports.
    expect(screen.getByText("1.8")).toBeTruthy();
  });

  it("renders avg/day with one decimal for clean fractional values", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 0 },
      daily: {
        rows: [
          { date: "2026-05-04", total: 1, bySource: { social: 1 } },
          { date: "2026-05-05", total: 0, bySource: {} },
          { date: "2026-05-06", total: 0, bySource: {} },
          { date: "2026-05-07", total: 0, bySource: {} },
          { date: "2026-05-08", total: 1, bySource: { social: 1 } },
        ],
        sources: ["social"],
        timezone: "Europe/Zurich",
      },
    });
    // 2 / 5 = 0.4
    expect(screen.getByText("0.4")).toBeTruthy();
  });

  it("hides the avg/day suffix when referralDaily has no rows", () => {
    renderWith({
      stats: { breakdown: [], totalReferrals: 5 },
      daily: { rows: [], sources: [], timezone: "UTC" },
    });
    expect(screen.queryByText("/day avg")).toBeNull();
  });

  it("avg/day is independent of stats.totalReferrals (lifetime numerator vs windowed denominator regression)", () => {
    // Reviewer-flagged regression: previously, an empty page filter caused
    // referral-stats (no `from` default) to return lifetime totals while
    // referral-daily defaulted to last 90 days. avg/day was lifetime/91, which
    // is meaningless. After the fix avg/day comes purely from referralDaily.
    renderWith({
      stats: { breakdown: [], totalReferrals: 9000 }, // pretend lifetime total
      daily: {
        // a 91-day window with only the last day having any referrals
        rows: Array.from({ length: 91 }, (_, i) => ({
          date: `2026-0${1 + Math.floor(i / 31)}-${String((i % 31) + 1).padStart(2, "0")}`,
          total: i === 90 ? 9 : 0,
          bySource: i === 90 ? { social: 9 } : {},
        })),
        sources: ["social"],
        timezone: "Europe/Zurich",
      },
    });
    // 9 referrals across 91 days = 0.098… → "0.1"
    // If the old formula were still in place, avg would be 9000/91 ≈ 98.9 → "98.9"
    expect(screen.getByText("0.1")).toBeTruthy();
    expect(screen.queryByText("98.9")).toBeNull();
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
