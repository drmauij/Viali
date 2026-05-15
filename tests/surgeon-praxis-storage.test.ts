import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "../server/db";
import { users, surgeries, hospitals, units, userHospitalRoles } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  getChildrenOfPraxis,
  setPraxisChildren,
  togglePraxis,
  getSurgeriesForSurgeon,
} from "../server/storage/surgeonPortal";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdUserIds: string[] = [];
const createdSurgeryIds: string[] = [];
const createdRoleIds: string[] = [];
const createdHospitalIds: string[] = [];
const createdUnitIds: string[] = [];

// Hospitals + units used by hospital-scoped tests, allocated once for the run.
let hospitalA: string;
let hospitalB: string;
let unitA: string;
let unitB: string;

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

async function attachUserToHospital(userId: string, hospitalId: string, unitId: string) {
  const [r] = await db.insert(userHospitalRoles).values({
    userId,
    hospitalId,
    unitId,
    role: "doctor",
  } as any).returning();
  createdRoleIds.push(r.id);
  return r;
}

beforeAll(async () => {
  const [hA] = await db.insert(hospitals).values({
    name: `PraxisTestHospA-${randomUUID().slice(0, 6)}`,
  } as any).returning();
  hospitalA = hA.id;
  createdHospitalIds.push(hA.id);

  const [hB] = await db.insert(hospitals).values({
    name: `PraxisTestHospB-${randomUUID().slice(0, 6)}`,
  } as any).returning();
  hospitalB = hB.id;
  createdHospitalIds.push(hB.id);

  const [uA] = await db.insert(units).values({
    name: "Unit A",
    hospitalId: hospitalA,
    type: "or",
  } as any).returning();
  unitA = uA.id;
  createdUnitIds.push(uA.id);

  const [uB] = await db.insert(units).values({
    name: "Unit B",
    hospitalId: hospitalB,
    type: "or",
  } as any).returning();
  unitB = uB.id;
  createdUnitIds.push(uB.id);
});

afterAll(async () => {
  if (createdSurgeryIds.length > 0) {
    await db.delete(surgeries).where(inArray(surgeries.id, createdSurgeryIds));
  }
  if (createdRoleIds.length > 0) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds));
  }
  if (createdUserIds.length > 0) {
    // Clear parent_surgeon_id first to avoid FK issues during cleanup
    await db.update(users).set({ parentSurgeonId: null })
      .where(inArray(users.id, createdUserIds));
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  if (createdUnitIds.length > 0) {
    await db.delete(units).where(inArray(units.id, createdUnitIds));
  }
  if (createdHospitalIds.length > 0) {
    await db.delete(hospitals).where(inArray(hospitals.id, createdHospitalIds));
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
  it("rewrites parent_surgeon_id to the given set within the hospital slice", async () => {
    const praxis = await makeUser(`praxis2-${Date.now()}@test.local`, { isPraxis: true });
    const a = await makeUser(`a-${Date.now()}@test.local`);
    const b = await makeUser(`b-${Date.now()}@test.local`);
    const c = await makeUser(`c-${Date.now()}@test.local`);
    await attachUserToHospital(a.id, hospitalA, unitA);
    await attachUserToHospital(b.id, hospitalA, unitA);
    await attachUserToHospital(c.id, hospitalA, unitA);

    await setPraxisChildren(praxis.id, [a.id, b.id], hospitalA);
    let kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id).sort()).toEqual([a.id, b.id].sort());

    // Replace set: now only c
    await setPraxisChildren(praxis.id, [c.id], hospitalA);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids.map((k) => k.id)).toEqual([c.id]);

    // Empty set clears the slice
    await setPraxisChildren(praxis.id, [], hospitalA);
    kids = await getChildrenOfPraxis(praxis.id);
    expect(kids).toEqual([]);
  });

  it("preserves children linked at OTHER hospitals when editing one slice", async () => {
    const praxis = await makeUser(`praxis-multi-${Date.now()}@test.local`, { isPraxis: true });
    const childA = await makeUser(`a-multi-${Date.now()}@test.local`);
    const childB = await makeUser(`b-multi-${Date.now()}@test.local`);
    await attachUserToHospital(childA.id, hospitalA, unitA);
    await attachUserToHospital(childB.id, hospitalB, unitB);

    // Pre-link childB at hospitalB.
    await setPraxisChildren(praxis.id, [childB.id], hospitalB);

    // Editing hospitalA's slice (linking childA, sending no childB) must NOT
    // unlink childB at hospitalB.
    await setPraxisChildren(praxis.id, [childA.id], hospitalA);

    const allKids = await getChildrenOfPraxis(praxis.id);
    expect(allKids.map((k) => k.id).sort()).toEqual([childA.id, childB.id].sort());

    const aSlice = await getChildrenOfPraxis(praxis.id, hospitalA);
    expect(aSlice.map((k) => k.id)).toEqual([childA.id]);

    const bSlice = await getChildrenOfPraxis(praxis.id, hospitalB);
    expect(bSlice.map((k) => k.id)).toEqual([childB.id]);
  });

  it("refuses to link a child that doesn't belong to the hospital", async () => {
    const praxis = await makeUser(`praxis-scope-${Date.now()}@test.local`, { isPraxis: true });
    const stranger = await makeUser(`stranger-${Date.now()}@test.local`);
    // stranger only at hospitalB
    await attachUserToHospital(stranger.id, hospitalB, unitB);

    await expect(
      setPraxisChildren(praxis.id, [stranger.id], hospitalA),
    ).rejects.toThrow(/do not belong to this hospital/i);
  });

  it("refuses to set a praxis user as a child", async () => {
    const praxis = await makeUser(`praxis3-${Date.now()}@test.local`, { isPraxis: true });
    const otherPraxis = await makeUser(`praxis4-${Date.now()}@test.local`, { isPraxis: true });
    await attachUserToHospital(otherPraxis.id, hospitalA, unitA);

    await expect(
      setPraxisChildren(praxis.id, [otherPraxis.id], hospitalA)
    ).rejects.toThrow(/cannot be a child/i);
  });

  it("refuses self-loop (praxis as own child)", async () => {
    const praxis = await makeUser(`praxis-self-${Date.now()}@test.local`, { isPraxis: true });
    await expect(
      setPraxisChildren(praxis.id, [praxis.id], hospitalA)
    ).rejects.toThrow(/cannot be a child of itself/i);
  });

  it("refuses if target user is not flagged as a praxis", async () => {
    const notPraxis = await makeUser(`notpraxis-${Date.now()}@test.local`);
    const child = await makeUser(`childof-notpraxis-${Date.now()}@test.local`);
    await attachUserToHospital(child.id, hospitalA, unitA);
    await expect(
      setPraxisChildren(notPraxis.id, [child.id], hospitalA)
    ).rejects.toThrow(/not flagged as a praxis/i);
  });

  it("refuses to steal a child already linked to another praxis", async () => {
    const praxis1 = await makeUser(`p1-steal-${Date.now()}@test.local`, { isPraxis: true });
    const praxis2 = await makeUser(`p2-steal-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`child-steal-${Date.now()}@test.local`);
    await attachUserToHospital(child.id, hospitalA, unitA);
    await setPraxisChildren(praxis1.id, [child.id], hospitalA);

    await expect(
      setPraxisChildren(praxis2.id, [child.id], hospitalA),
    ).rejects.toThrow(/already linked to a different praxis/i);
  });
});

describe("togglePraxis", () => {
  it("turns is_praxis on", async () => {
    const u = await makeUser(`tog-${Date.now()}@test.local`);
    await togglePraxis(u.id, true);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(true);
  });

  it("refuses to turn off (global) if any children still linked", async () => {
    const praxis = await makeUser(`tog2-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`tog3-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(eq(users.id, child.id));

    await expect(togglePraxis(praxis.id, false))
      .rejects.toThrow(/still has linked children/i);
  });

  it("refuses to turn off (hospital-scoped) if children remain at that hospital", async () => {
    const praxis = await makeUser(`tog-hs-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`tog-hs-c-${Date.now()}@test.local`);
    await attachUserToHospital(child.id, hospitalA, unitA);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(eq(users.id, child.id));

    await expect(togglePraxis(praxis.id, false, hospitalA))
      .rejects.toThrow(/still has linked children at this hospital/i);
  });

  it("allows toggle off (hospital-scoped) when this hospital's slice is empty even if other slices linger", async () => {
    const praxis = await makeUser(`tog-other-${Date.now()}@test.local`, { isPraxis: true });
    const child = await makeUser(`tog-other-c-${Date.now()}@test.local`);
    await attachUserToHospital(child.id, hospitalB, unitB);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(eq(users.id, child.id));

    // Toggle off scoped to hospitalA — hospitalB child shouldn't block.
    await togglePraxis(praxis.id, false, hospitalA);
    const [refetched] = await db.select().from(users).where(eq(users.id, praxis.id));
    expect(refetched.isPraxis).toBe(false);
  });

  it("turns off cleanly when no children linked", async () => {
    const u = await makeUser(`tog4-${Date.now()}@test.local`, { isPraxis: true });
    await togglePraxis(u.id, false);
    const [refetched] = await db.select().from(users).where(eq(users.id, u.id));
    expect(refetched.isPraxis).toBe(false);
  });
});

describe("getSurgeriesForSurgeon — praxis roll-up", () => {
  it("returns surgeries for praxis itself plus all children", async () => {
    const praxis = await makeUser(`rp-${Date.now()}@test.local`, { isPraxis: true });
    const childA = await makeUser(`rcA-${Date.now()}@test.local`);
    const childB = await makeUser(`rcB-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(inArray(users.id, [childA.id, childB.id]));

    const [surgA] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      plannedDate: new Date(),
      surgeonId: childA.id,
    }).returning();
    createdSurgeryIds.push(surgA.id);

    const [surgB] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      plannedDate: new Date(),
      surgeonId: childB.id,
    }).returning();
    createdSurgeryIds.push(surgB.id);

    const results = await getSurgeriesForSurgeon(TEST_HOSPITAL_ID, praxis.email!);
    const ids = results.map((s: any) => s.id);
    expect(ids).toContain(surgA.id);
    expect(ids).toContain(surgB.id);
  });

  it("solo doctor sees only their own surgeries", async () => {
    const solo = await makeUser(`solo-${Date.now()}@test.local`);
    const [surg] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      plannedDate: new Date(),
      surgeonId: solo.id,
    }).returning();
    createdSurgeryIds.push(surg.id);

    const results = await getSurgeriesForSurgeon(TEST_HOSPITAL_ID, solo.email!);
    expect(results.find((s: any) => s.id === surg.id)).toBeDefined();
  });

  it("child logged in directly does NOT see praxis siblings' surgeries", async () => {
    const praxis = await makeUser(`rp2-${Date.now()}@test.local`, { isPraxis: true });
    const childX = await makeUser(`rcX-${Date.now()}@test.local`);
    const childY = await makeUser(`rcY-${Date.now()}@test.local`);
    await db.update(users).set({ parentSurgeonId: praxis.id })
      .where(inArray(users.id, [childX.id, childY.id]));

    const [surgX] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      plannedDate: new Date(),
      surgeonId: childX.id,
    }).returning();
    createdSurgeryIds.push(surgX.id);

    const [surgY] = await db.insert(surgeries).values({
      hospitalId: TEST_HOSPITAL_ID,
      plannedDate: new Date(),
      surgeonId: childY.id,
    }).returning();
    createdSurgeryIds.push(surgY.id);

    const results = await getSurgeriesForSurgeon(TEST_HOSPITAL_ID, childX.email!);
    const ids = results.map((s: any) => s.id);
    expect(ids).toContain(surgX.id);
    expect(ids).not.toContain(surgY.id);
  });
});
