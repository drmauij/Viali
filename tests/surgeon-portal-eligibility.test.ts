import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db, pool } from "../server/db";
import {
  users,
  hospitals,
  units,
  userHospitalRoles,
} from "@shared/schema";
import { inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { isUserEligibleForSurgeonPortal } from "../server/storage/surgeonPortal";

const createdUserIds: string[] = [];
const createdRoleIds: string[] = [];
let createdHospitalId: string;
let secondHospitalId: string;
let unitId: string;
let secondUnitId: string;

async function makeUser(overrides: Partial<{
  email: string;
  isPraxis: boolean;
  parentSurgeonId: string | null;
  archivedAt: Date | null;
}> = {}): Promise<{ id: string; email: string }> {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  const [u] = await db
    .insert(users)
    .values({
      email,
      firstName: "Test",
      lastName: "User",
      isPraxis: overrides.isPraxis ?? false,
      parentSurgeonId: overrides.parentSurgeonId ?? null,
      archivedAt: overrides.archivedAt ?? null,
    })
    .returning();
  createdUserIds.push(u.id);
  return { id: u.id, email: u.email! };
}

async function grantRole(
  userId: string,
  hospitalId: string,
  unit: string,
  role: string,
) {
  const [r] = await db
    .insert(userHospitalRoles)
    .values({
      userId,
      hospitalId,
      unitId: unit,
      role,
    })
    .returning();
  createdRoleIds.push(r.id);
}

beforeAll(async () => {
  const [h1] = await db
    .insert(hospitals)
    .values({
      name: `EligibilityHospA-${randomUUID().slice(0, 6)}`,
      timezone: "Europe/Zurich",
    })
    .returning();
  createdHospitalId = h1.id;

  const [h2] = await db
    .insert(hospitals)
    .values({
      name: `EligibilityHospB-${randomUUID().slice(0, 6)}`,
      timezone: "Europe/Zurich",
    })
    .returning();
  secondHospitalId = h2.id;

  const [u1] = await db
    .insert(units)
    .values({
      hospitalId: createdHospitalId,
      name: "Default unit",
    })
    .returning();
  unitId = u1.id;

  const [u2] = await db
    .insert(units)
    .values({
      hospitalId: secondHospitalId,
      name: "Default unit",
    })
    .returning();
  secondUnitId = u2.id;
});

afterAll(async () => {
  if (createdRoleIds.length > 0) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.id, createdRoleIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdUserIds));
  }
  await db.delete(units).where(inArray(units.id, [unitId, secondUnitId]));
  await db.delete(hospitals).where(inArray(hospitals.id, [createdHospitalId, secondHospitalId]));
  await pool.end();
});

describe("isUserEligibleForSurgeonPortal", () => {
  it("returns false for an unknown email", async () => {
    expect(
      await isUserEligibleForSurgeonPortal(
        "no-such-user@example.com",
        createdHospitalId,
      ),
    ).toBe(false);
  });

  it("returns true for a solo doctor at the clinic", async () => {
    const u = await makeUser();
    await grantRole(u.id, createdHospitalId, unitId, "doctor");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      true,
    );
  });

  it("returns true for an admin at the clinic", async () => {
    const u = await makeUser();
    await grantRole(u.id, createdHospitalId, unitId, "admin");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      true,
    );
  });

  it("returns false for a nurse-only user at the clinic", async () => {
    const u = await makeUser();
    await grantRole(u.id, createdHospitalId, unitId, "nurse");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      false,
    );
  });

  it("returns true for a praxis user with any role at the clinic", async () => {
    const u = await makeUser({ isPraxis: true });
    // praxis is typically given a role at the clinic for context — even nurse counts here.
    await grantRole(u.id, createdHospitalId, unitId, "nurse");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      true,
    );
  });

  it("returns false for a praxis user with no role at the clinic", async () => {
    const u = await makeUser({ isPraxis: true });
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      false,
    );
  });

  it("returns true for a praxis child whose parent has a role at the clinic", async () => {
    const parent = await makeUser({ isPraxis: true });
    await grantRole(parent.id, createdHospitalId, unitId, "doctor");
    const child = await makeUser({ parentSurgeonId: parent.id });
    expect(await isUserEligibleForSurgeonPortal(child.email, createdHospitalId)).toBe(
      true,
    );
  });

  it("returns false for a praxis child whose parent has no role at the clinic", async () => {
    const parent = await makeUser({ isPraxis: true });
    const child = await makeUser({ parentSurgeonId: parent.id });
    expect(await isUserEligibleForSurgeonPortal(child.email, createdHospitalId)).toBe(
      false,
    );
  });

  it("scopes role checks to the requesting clinic — doctor at hospital B is not eligible at hospital A", async () => {
    const u = await makeUser();
    await grantRole(u.id, secondHospitalId, secondUnitId, "doctor");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      false,
    );
    expect(await isUserEligibleForSurgeonPortal(u.email, secondHospitalId)).toBe(
      true,
    );
  });

  it("returns false for an archived user even with a doctor role", async () => {
    const u = await makeUser({ archivedAt: new Date() });
    await grantRole(u.id, createdHospitalId, unitId, "doctor");
    expect(await isUserEligibleForSurgeonPortal(u.email, createdHospitalId)).toBe(
      false,
    );
  });

  it("matches email case-insensitively", async () => {
    const upper = `MIXED-${randomUUID().slice(0, 6)}@Example.COM`;
    const u = await makeUser({ email: upper });
    await grantRole(u.id, createdHospitalId, unitId, "doctor");
    expect(
      await isUserEligibleForSurgeonPortal(upper.toLowerCase(), createdHospitalId),
    ).toBe(true);
    expect(
      await isUserEligibleForSurgeonPortal(upper.toUpperCase(), createdHospitalId),
    ).toBe(true);
  });
});
