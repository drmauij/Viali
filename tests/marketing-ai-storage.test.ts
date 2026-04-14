import { describe, it, expect, beforeEach, vi } from "vitest";

const mockRows: any[] = [];

vi.mock("../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => mockRows.slice(0, 1),
        }),
      }),
    }),
    insert: () => ({
      values: (v: any) => ({
        onConflictDoUpdate: ({ set }: any) => ({
          returning: async () => {
            mockRows.length = 0;
            mockRows.push({ ...v, ...set, id: "row-1" });
            return [mockRows[0]];
          },
        }),
      }),
    }),
    delete: () => ({
      where: async () => {
        mockRows.length = 0;
      },
    }),
  },
}));

import {
  getCachedAnalysis,
  upsertAnalysis,
} from "../server/storage/marketingAiAnalyses";

describe("marketingAiAnalyses storage", () => {
  beforeEach(() => {
    mockRows.length = 0;
  });

  it("returns null when no cached row exists", async () => {
    const result = await getCachedAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
    });
    expect(result).toBeNull();
  });

  it("returns cached row when present", async () => {
    mockRows.push({
      id: "row-1",
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      payload: { summary: ["ok"], trends: [], insights: [], suggestedActions: [] },
      inputHash: "abc",
      generatedAt: new Date(),
      generatedBy: "u1",
    });
    const result = await getCachedAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
    });
    expect(result).not.toBeNull();
    expect(result!.payload.summary).toEqual(["ok"]);
  });

  it("upserts a new analysis", async () => {
    const row = await upsertAnalysis({
      hospitalId: "h1",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
      language: "en",
      payload: { summary: ["x"], trends: [], insights: [], suggestedActions: [] },
      inputHash: "hash1",
      generatedBy: "u1",
    });
    expect(row.id).toBe("row-1");
    expect(row.payload.summary).toEqual(["x"]);
  });
});
