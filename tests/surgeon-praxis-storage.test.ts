import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  getChildrenOfPraxis,
  setPraxisChildren,
  togglePraxis,
} from "../server/storage/surgeonPortal";

const createdUserIds: string[] = [];

async function makeUser(email: string, opts: { isPraxis?: boolean } = {}) {
  const [u] = await db.insert(users).values({
    email,
    firstName: "Test",
    lastName: email.split("@")[0],
    isPraxis: opts.isPraxis ?? false,
  }).returning();
  createdUserIds.push(u.id);
  return u;
}

afterAll(async () => {
  if (createdUserIds.length > 0) {
    // Clear parent_surgeon_id first to avoid FK issues during cleanup
    await db.update(users).set({ parentSurgeonId: null })
      .where(inArray(users.id, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("getChildrenOfPraxis", () => {
  it("returns only children whose parent_surgeon_id matches", async () => {
    const praxis = await makeUser(`praxis-${Date.now()}@test.local`, { isPraxis: true });
    const childA = await makeUser(`childA-${Date.now()}@test.local`);
    const childB = await makeUser(`childB-${Date.now()}@test.local`);
    const unrelated = await makeUser(`other-${Date.now()}@test.local`);

    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(inArray(users.id, [childA.id, childB.id]));

    const children = await getChildrenOfPraxis(praxis.id);
    const childIds = children.map((c) => c.id).sort();
    expect(childIds).toEqual([childA.id, childB.id].sort());
    expect(children.find((c) => c.id === unrelated.id)).toBeUndefined();
  });
});

describe("setPraxisChildren", () => {
  it("rewrites parent_surgeon_id to the given set, clearing previous links", async () => {
    const praxis = await makeUser(`praxis2-${Date.now()}@test.local`, { isPraxis: true });
    const a = await makeUser(`a-${Date.now()}@test.local`);
    const b = await makeUser(`b-${Date.now()}@test.local`);
    const c = await makeUser(`c-${Date.now()}@test.local`);

    await setPraxisChildren(praxis.id, [a.id, b.id]);
    let kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id).sort()).toEqual([a.id, b.id].sort());

    // Replace set: now only c
    await setPraxisChildren(praxis.id, [c.id]);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id)).toEqual([c.id]);

    // Empty set clears all
    await setPraxisChildren(praxis.id, []);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids).toEqual([]);
  });

  it("refuses to set a praxis user as a child", async () => {
    const praxis = await makeUser(`praxis3-${Date.now()}@test.local`, { isPraxis: true });
    const otherPraxis = await makeUser(`praxis4-${Date.now()}@test.local`, { isPraxis: true });

    await expect(
      setPraxisChildren(praxis.id, [otherPraxis.id])
    ).rejects.toThrow(/cannot be a child/i);
  });
});

describe("togglePraxis", () => {
  it("turns is_praxis on", async () => {
    const u = await makeUser(`tog-${Date.now()}@test.local`);
    await togglePraxis(u.id, true);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(true);
  });

  it("refuses to turn off if children still linked", async () => {
    const praxis = await makeUser(`tog2-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`tog3-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(eq(users.id, child.id));

    await expect(togglePraxis(praxis.id, false))
      .rejects.toThrow(/still has linked children/i);
  });

  it("turns off cleanly when no children linked", async () => {
    const u = await makeUser(`tog4-${Date.now()}@test.local`, { isPraxis: true });
    await togglePraxis(u.id, false);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(false);
  });
});
