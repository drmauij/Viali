import { describe, it, expect, vi } from "vitest";

vi.mock("../server/db", () => ({ db: {} }));

/** JSON.stringify with circular-reference guard */
function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === "object" && value !== null) {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  });
}

describe("GET /leads — from/to filters", () => {
  it("passes from and to through to the condition builder", async () => {
    const mod = await import("../server/routes/leads");
    const buildLeadsListConditions = (mod as any).buildLeadsListConditions;
    expect(typeof buildLeadsListConditions).toBe("function");

    const conds = buildLeadsListConditions({
      hospitalId: "h1",
      status: "all",
      from: "2026-01-01T00:00:00Z",
      to: "2026-04-01T00:00:00Z",
      before: undefined,
    });

    const serialized = safeStringify(conds);
    expect(serialized).toContain("hospital_id");
    expect(serialized).toContain("2026-01-01");
    expect(serialized).toContain("2026-04-01");
  });

  it("omits the from/to conditions when not provided", async () => {
    const mod = await import("../server/routes/leads");
    const buildLeadsListConditions = (mod as any).buildLeadsListConditions;
    const conds = buildLeadsListConditions({
      hospitalId: "h1",
      status: "all",
      from: undefined,
      to: undefined,
      before: undefined,
    });
    expect(conds).toHaveLength(1);
  });
});
