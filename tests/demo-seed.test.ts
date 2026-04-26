import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitalGroups, hospitals, referralEvents } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

import { seed } from "../server/scripts/demo";
import { wipeAllDemoGroups } from "../server/scripts/demo/wipe";
import { GROUP_NAME } from "../server/scripts/demo/skew";

beforeAll(async () => {
  // Ensure a clean slate (in case prior test runs left state).
  await wipeAllDemoGroups();
});

afterAll(async () => {
  await wipeAllDemoGroups();
  await pool.end();
});

describe("demo seed", () => {
  it("creates exactly 1 chain group + 8 hospitals", async () => {
    await seed();
    const groups = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    expect(groups).toHaveLength(1);
    const hospRows = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, groups[0].id));
    expect(hospRows).toHaveLength(8);
  });

  it("re-running keeps shape stable (1 group, 8 hospitals — duplicates wiped)", async () => {
    await seed();
    await seed();
    const groups = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    expect(groups).toHaveLength(1);
    const hospRows = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, groups[0].id));
    expect(hospRows).toHaveLength(8);
  });

  it("Zürich has more referrals than Winterthur (skew applied)", async () => {
    await seed();
    const groups = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    const hospRows = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, groups[0].id));
    const zurich = hospRows.find((h) => h.name === "Zürich");
    const winterthur = hospRows.find((h) => h.name === "Winterthur");
    expect(zurich).toBeDefined();
    expect(winterthur).toBeDefined();

    const [zRef] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(referralEvents)
      .where(eq(referralEvents.hospitalId, zurich!.id));
    const [wRef] = await db
      .select({ c: sql<number>`count(*)::int` })
      .from(referralEvents)
      .where(eq(referralEvents.hospitalId, winterthur!.id));

    expect(zRef.c).toBeGreaterThan(0);
    expect(wRef.c).toBeGreaterThan(0);
    // Zürich skew is 1.5/1.4 vs Winterthur 0.4/0.4. Ratio ~3.6.
    // Allow loose factor for window-density math; just assert dominance.
    expect(zRef.c).toBeGreaterThan(wRef.c * 2);
  });

  it("deterministic — two seed runs produce identical referral counts per clinic", async () => {
    await seed();
    const g1 = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    const h1 = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, g1[0].id));
    const counts1 = new Map<string, number>();
    for (const h of h1) {
      const [r] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(referralEvents)
        .where(eq(referralEvents.hospitalId, h.id));
      counts1.set(h.name, r.c);
    }

    await seed();
    const g2 = await db
      .select()
      .from(hospitalGroups)
      .where(eq(hospitalGroups.name, GROUP_NAME));
    const h2 = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.groupId, g2[0].id));
    const counts2 = new Map<string, number>();
    for (const h of h2) {
      const [r] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(referralEvents)
        .where(eq(referralEvents.hospitalId, h.id));
      counts2.set(h.name, r.c);
    }

    for (const [name, c] of counts1) {
      expect(counts2.get(name)).toBe(c);
    }
  });
});
