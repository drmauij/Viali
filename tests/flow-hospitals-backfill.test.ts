import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { flowHospitals, flows, hospitals, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const uniq = () => randomUUID().slice(0, 8);

let hospId: string;
let userId: string;
let flowId: string;

beforeAll(async () => {
  const [h] = await db.insert(hospitals).values({ name: `Test-${uniq()}` } as any).returning();
  hospId = h.id;
  const [u] = await db.insert(users).values({ email: `u-${uniq()}@test.test` } as any).returning();
  userId = u.id;
  const [f] = await db.insert(flows).values({
    hospitalId: hospId,
    name: `Flow-${uniq()}`,
    status: "draft",
    createdBy: userId,
  } as any).returning();
  flowId = f.id;
});

afterAll(async () => {
  await db.delete(flowHospitals).where(eq(flowHospitals.flowId, flowId));
  await db.delete(flows).where(eq(flows.id, flowId));
  await db.delete(users).where(eq(users.id, userId));
  await db.delete(hospitals).where(eq(hospitals.id, hospId));
  await pool.end();
});

describe("flow_hospitals schema + backfill", () => {
  it("supports inserting a flow_hospitals row", async () => {
    await db.insert(flowHospitals).values([
      { flowId, hospitalId: hospId },
    ]).onConflictDoNothing();

    const rows = await db
      .select()
      .from(flowHospitals)
      .where(eq(flowHospitals.flowId, flowId));
    expect(rows.length).toBe(1);
    expect(rows[0].hospitalId).toBe(hospId);
  });

  it("cascades delete when parent flow is removed", async () => {
    const before = await db.select().from(flowHospitals).where(eq(flowHospitals.flowId, flowId));
    expect(before.length).toBe(1);

    await db.delete(flows).where(eq(flows.id, flowId));

    const after = await db.select().from(flowHospitals).where(eq(flowHospitals.flowId, flowId));
    expect(after.length).toBe(0);

    // Re-insert the flow for afterAll cleanup idempotency
    await db.insert(flows).values({
      id: flowId,
      hospitalId: hospId,
      name: `ResurrectedFlow-${uniq()}`,
      status: "draft",
      createdBy: userId,
    } as any);
  });
});
