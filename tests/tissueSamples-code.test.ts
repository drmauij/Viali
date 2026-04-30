import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildTissueSampleCode,
  generateTissueSampleCode,
  MissingSampleCodePrefixError,
  TissueSampleCodeRetryExhaustedError,
} from "../server/lib/tissueSampleCode";

describe("buildTissueSampleCode (pure formatter)", () => {
  it("formats <prefix>-<typeCode>-<YYYYMMDD>-<NNN>", () => {
    expect(
      buildTissueSampleCode({
        prefix: "PKK",
        typeCode: "FAT",
        date: new Date("2026-05-12T08:00:00Z"),
        timezone: "Europe/Zurich",
        sequence: 1,
      }),
    ).toBe("PKK-FAT-20260512-001");
  });

  it("zero-pads sequence to 3 digits", () => {
    expect(
      buildTissueSampleCode({
        prefix: "B2G",
        typeCode: "HIST",
        date: new Date("2026-06-03T08:00:00Z"),
        timezone: "Europe/Zurich",
        sequence: 42,
      }),
    ).toBe("B2G-HIST-20260603-042");
  });

  it("formats date in the hospital timezone (not UTC)", () => {
    // 2026-05-12 23:30 UTC = 2026-05-13 01:30 in Europe/Zurich
    expect(
      buildTissueSampleCode({
        prefix: "PKK",
        typeCode: "FAT",
        date: new Date("2026-05-12T23:30:00Z"),
        timezone: "Europe/Zurich",
        sequence: 1,
      }),
    ).toBe("PKK-FAT-20260513-001");
  });

  it("throws if sequence does not fit in 3 digits", () => {
    expect(() =>
      buildTissueSampleCode({
        prefix: "PKK",
        typeCode: "FAT",
        date: new Date("2026-05-12T08:00:00Z"),
        timezone: "Europe/Zurich",
        sequence: 1000,
      }),
    ).toThrow(/sequence overflow/i);
  });
});

describe("generateTissueSampleCode (DB-bound)", () => {
  // The function takes a DB executor + retry budget. We hand it a fake executor
  // so the test is hermetic — no real DB needed for the unit suite.
  function makeFakeDeps(opts: {
    prefix: string | null;
    timezone: string;
    nextSeq: () => Promise<number>;
    insertCode: (code: string) => Promise<void>;
  }) {
    return {
      readHospitalConfig: vi.fn(async () => ({
        sampleCodePrefix: opts.prefix,
        timezone: opts.timezone,
      })),
      readNextSequence: vi.fn(opts.nextSeq),
      tryInsertCode: vi.fn(opts.insertCode),
      now: () => new Date("2026-05-12T08:00:00Z"),
    };
  }

  it("throws MissingSampleCodePrefixError if hospital has no prefix", async () => {
    const deps = makeFakeDeps({
      prefix: null,
      timezone: "Europe/Zurich",
      nextSeq: async () => 1,
      insertCode: async () => undefined,
    });
    await expect(
      generateTissueSampleCode({ hospitalId: "h1", sampleType: "fat" }, deps),
    ).rejects.toBeInstanceOf(MissingSampleCodePrefixError);
  });

  it("returns a code on first try when no collision", async () => {
    const deps = makeFakeDeps({
      prefix: "PKK",
      timezone: "Europe/Zurich",
      nextSeq: async () => 1,
      insertCode: async () => undefined,
    });
    const code = await generateTissueSampleCode(
      { hospitalId: "h1", sampleType: "fat" },
      deps,
    );
    expect(code).toBe("PKK-FAT-20260512-001");
    expect(deps.tryInsertCode).toHaveBeenCalledTimes(1);
  });

  it("retries on unique-violation and succeeds with the next sequence", async () => {
    let calls = 0;
    const deps = makeFakeDeps({
      prefix: "PKK",
      timezone: "Europe/Zurich",
      nextSeq: async () => {
        calls += 1;
        return calls; // first call → 1, second → 2
      },
      insertCode: async (code) => {
        if (code === "PKK-FAT-20260512-001") {
          const err: any = new Error("duplicate key");
          err.code = "23505";
          throw err;
        }
      },
    });
    const code = await generateTissueSampleCode(
      { hospitalId: "h1", sampleType: "fat" },
      deps,
    );
    expect(code).toBe("PKK-FAT-20260512-002");
    expect(deps.tryInsertCode).toHaveBeenCalledTimes(2);
  });

  it("throws TissueSampleCodeRetryExhaustedError after 5 retries", async () => {
    const deps = makeFakeDeps({
      prefix: "PKK",
      timezone: "Europe/Zurich",
      nextSeq: async () => 1,
      insertCode: async () => {
        const err: any = new Error("duplicate key");
        err.code = "23505";
        throw err;
      },
    });
    await expect(
      generateTissueSampleCode({ hospitalId: "h1", sampleType: "fat" }, deps),
    ).rejects.toBeInstanceOf(TissueSampleCodeRetryExhaustedError);
    expect(deps.tryInsertCode).toHaveBeenCalledTimes(5);
  });
});
