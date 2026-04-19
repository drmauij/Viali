import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

vi.mock("../server/services/marketingAiAnalyzer", () => ({
  getOrCreateAnalysis: vi.fn(),
}));

vi.mock("../server/storage/marketingAiAnalyses", () => ({
  getCachedAnalysis: vi.fn(),
  isFresh: vi.fn(),
}));

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => next(),
}));

import { getOrCreateAnalysis } from "../server/services/marketingAiAnalyzer";
import {
  getCachedAnalysis,
  isFresh,
} from "../server/storage/marketingAiAnalyses";
import { storage } from "../server/storage";
import { registerMarketingAiRoutes } from "../server/routes/marketingAi";

function buildApp(role: "admin" | "manager" | "marketing" | "staff") {
  vi.spyOn(storage, "getUserHospitals").mockResolvedValue([
    { id: "h1", role } as any,
  ]);
  const app = express();
  app.use(express.json());
  app.use((req: any, _res, next) => {
    req.user = { id: "u1" };
    req.i18n = { language: "en" };
    next();
  });
  registerMarketingAiRoutes(app);
  return app;
}

describe("GET /api/business/:hospitalId/ai-analysis", () => {
  beforeEach(() => {
    vi.mocked(getCachedAnalysis).mockReset();
    vi.mocked(isFresh).mockReset();
  });

  it("returns 200 with null body when no cache row exists", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue(null);
    const app = buildApp("marketing");
    const res = await request(app).get(
      "/api/business/h1/ai-analysis?startDate=2026-03-01&endDate=2026-03-31",
    );
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it("returns cached row with stale=false when fresh", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue({
      payload: { summary: ["ok"], trends: [], insights: [], suggestedActions: [] },
      generatedAt: new Date(),
      generatedBy: "u1",
    } as any);
    vi.mocked(isFresh).mockReturnValue(true);
    const app = buildApp("marketing");
    const res = await request(app).get(
      "/api/business/h1/ai-analysis?startDate=2026-03-01&endDate=2026-03-31",
    );
    expect(res.status).toBe(200);
    expect(res.body.stale).toBe(false);
    expect(res.body.payload.summary).toEqual(["ok"]);
  });

  it("returns cached row with stale=true when old", async () => {
    vi.mocked(getCachedAnalysis).mockResolvedValue({
      payload: { summary: ["ok"], trends: [], insights: [], suggestedActions: [] },
      generatedAt: new Date(Date.now() - 10 * 86400000),
      generatedBy: "u1",
    } as any);
    vi.mocked(isFresh).mockReturnValue(false);
    const app = buildApp("marketing");
    const res = await request(app).get(
      "/api/business/h1/ai-analysis?startDate=2026-03-01&endDate=2026-03-31",
    );
    expect(res.body.stale).toBe(true);
  });
});

describe("POST /api/business/:hospitalId/ai-analysis", () => {
  beforeEach(() => {
    vi.mocked(getOrCreateAnalysis).mockReset();
  });

  it("403s when non-admin sends force=true", async () => {
    const app = buildApp("marketing");
    const res = await request(app)
      .post("/api/business/h1/ai-analysis")
      .send({ startDate: "2026-03-01", endDate: "2026-03-31", force: true });
    expect(res.status).toBe(403);
  });

  it("allows non-admin without force", async () => {
    vi.mocked(getOrCreateAnalysis).mockResolvedValue({
      payload: { summary: ["x"], trends: [], insights: [], suggestedActions: [] },
      generatedAt: new Date(),
      generatedBy: "u1",
      cached: false,
      stale: false,
    });
    const app = buildApp("marketing");
    const res = await request(app)
      .post("/api/business/h1/ai-analysis")
      .send({ startDate: "2026-03-01", endDate: "2026-03-31" });
    expect(res.status).toBe(200);
    expect(res.body.payload.summary).toEqual(["x"]);
  });

  it("allows admin with force", async () => {
    vi.mocked(getOrCreateAnalysis).mockResolvedValue({
      payload: { summary: ["x"], trends: [], insights: [], suggestedActions: [] },
      generatedAt: new Date(),
      generatedBy: "u1",
      cached: false,
      stale: false,
    });
    const app = buildApp("admin");
    const res = await request(app)
      .post("/api/business/h1/ai-analysis")
      .send({ startDate: "2026-03-01", endDate: "2026-03-31", force: true });
    expect(res.status).toBe(200);
  });

  it("400s on invalid date range", async () => {
    const app = buildApp("marketing");
    const res = await request(app)
      .post("/api/business/h1/ai-analysis")
      .send({ startDate: "2026-03-31", endDate: "2026-03-01" });
    expect(res.status).toBe(400);
  });
});
