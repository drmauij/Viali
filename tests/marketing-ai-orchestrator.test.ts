import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../server/storage/marketingAiAnalyses", () => ({
  getCachedAnalysis: vi.fn(),
  upsertAnalysis: vi.fn(),
  isFresh: vi.fn(),
}));

vi.mock("../server/db", () => ({
  db: { execute: vi.fn() },
}));

import {
  getCachedAnalysis,
  upsertAnalysis,
  isFresh,
} from "../server/storage/marketingAiAnalyses";
import * as analyzer from "../server/services/marketingAiAnalyzer";

const { getOrCreateAnalysis } = analyzer;

const basePayload = {
  summary: ["ok"],
  trends: [],
  insights: [],
  suggestedActions: [],
};

describe("getOrCreateAnalysis", () => {
  let buildStatsSpy: ReturnType<typeof vi.spyOn>;
  let runAnalysisSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.mocked(getCachedAnalysis).mockReset();
    vi.mocked(upsertAnalysis).mockReset();
    vi.mocked(isFresh).mockReset();
    buildStatsSpy = vi
      .spyOn(analyzer, "buildAggregatedStats")
      .mockReset();
    runAnalysisSpy = vi
      .spyOn(analyzer, "runAnalysis")
      .mockReset();
  });

  it("returns fresh cache without calling Claude", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue({
      id: "r1",
      payload: basePayload,
      generatedAt: new Date(),
      generatedBy: "u1",
    } as any);
    vi.mocked(isFresh).mockReturnValue(true);

    const result = await getOrCreateAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      userId: "u2",
      force: false,
    });

    expect(result.cached).toBe(true);
    expect(result.stale).toBe(false);
    expect(buildStatsSpy).not.toHaveBeenCalled();
    expect(runAnalysisSpy).not.toHaveBeenCalled();
  });

  it("regenerates when cache is stale", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue({
      id: "r1",
      payload: basePayload,
      generatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      generatedBy: "u1",
    } as any);
    vi.mocked(isFresh).mockReturnValue(false);
    buildStatsSpy.mockResolvedValue({ funnel: { leads: 1 }, totals: { adSpend: 100 } } as any);
    runAnalysisSpy.mockResolvedValue(basePayload);
    vi.mocked(upsertAnalysis).mockResolvedValue({
      id: "r2",
      payload: basePayload,
      generatedAt: new Date(),
      generatedBy: "u2",
    } as any);

    const result = await getOrCreateAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      userId: "u2",
      force: false,
    });

    expect(buildStatsSpy).toHaveBeenCalledOnce();
    expect(runAnalysisSpy).toHaveBeenCalledOnce();
    expect(upsertAnalysis).toHaveBeenCalledOnce();
    expect(result.cached).toBe(false);
  });

  it("bypasses fresh cache when force=true", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue({
      id: "r1",
      payload: basePayload,
      generatedAt: new Date(),
      generatedBy: "u1",
    } as any);
    vi.mocked(isFresh).mockReturnValue(true);
    buildStatsSpy.mockResolvedValue({ funnel: { leads: 1 }, totals: { adSpend: 100 } } as any);
    runAnalysisSpy.mockResolvedValue(basePayload);
    vi.mocked(upsertAnalysis).mockResolvedValue({
      id: "r2",
      payload: basePayload,
      generatedAt: new Date(),
      generatedBy: "u2",
    } as any);

    await getOrCreateAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      userId: "u2",
      force: true,
    });

    expect(runAnalysisSpy).toHaveBeenCalledOnce();
    expect(upsertAnalysis).toHaveBeenCalledOnce();
  });

  it("returns stub without calling Claude when no leads", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue(null);
    buildStatsSpy.mockResolvedValue({
      funnel: { leads: 0 },
      adPerformance: [],
      totals: { adSpend: 0 },
    } as any);
    vi.mocked(upsertAnalysis).mockResolvedValue({
      id: "r3",
      payload: basePayload,
      generatedAt: new Date(),
      generatedBy: "u1",
    } as any);

    await getOrCreateAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      userId: "u1",
      force: false,
    });

    expect(runAnalysisSpy).not.toHaveBeenCalled();
    expect(upsertAnalysis).toHaveBeenCalled();
    const arg = vi.mocked(upsertAnalysis).mock.calls[0][0] as any;
    expect(arg.payload.summary[0]).toMatch(/no data|insufficient/i);
  });
});
