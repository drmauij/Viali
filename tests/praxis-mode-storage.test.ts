import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, referralPartnerships, units } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { provisionSourceHospital } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[] };
afterAll(async () => {
  // Must delete units before hospitals (units.hospital_id FK has no cascade)
  if (created.hospitals.length) {
    await db.delete(userHospitalRoles).where(inArray(userHospitalRoles.hospitalId, created.hospitals));
    await db.delete(referralPartnerships).where(inArray(referralPartnerships.sourceHospitalId, created.hospitals));
    await db.delete(units).where(inArray(units.hospitalId, created.hospitals));
    await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  }
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

async function makeDestination(name: string) {
  const [h] = await db.insert(hospitals).values({ name, tenantType: "clinic" } as any).returning();
  created.hospitals.push(h.id);
  return h;
}
async function makeSurgeon(email: string) {
  const [u] = await db.insert(users).values({ email, firstName: "Test", lastName: "Surg" }).returning();
  created.users.push(u.id);
  return u;
}

describe("provisionSourceHospital", () => {
  it("creates a source hospital with tenant_type='praxis', binds surgeon as admin, auto-pairs originating destination", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const surgeon = await makeSurgeon(`s-${Date.now()}@t.local`);

    const result = await provisionSourceHospital({
      surgeonUserId: surgeon.id,
      originatingDestinationId: dest.id,
      sourceName: "Praxis Mueller",
    });
    created.hospitals.push(result.sourceHospitalId);

    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, result.sourceHospitalId));
    expect(src.tenantType).toBe("praxis");
    expect(src.name).toBe("Praxis Mueller");

    const roles = await db.select().from(userHospitalRoles)
      .where(eq(userHospitalRoles.hospitalId, result.sourceHospitalId));
    expect(roles.length).toBe(1);
    expect(roles[0].userId).toBe(surgeon.id);
    expect(roles[0].role).toBe("admin");

    const pair = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, result.sourceHospitalId));
    expect(pair.length).toBe(1);
    expect(pair[0].destinationHospitalId).toBe(dest.id);
    expect(pair[0].status).toBe("active");
    expect(pair[0].pairingSource).toBe("auto_on_provision");
  });

  it("applies lean addon defaults — addonSurgery off, addonClinic on, addonAmbulantEligibility on", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}-b`);
    const surgeon = await makeSurgeon(`s-${Date.now()}-b@t.local`);
    const result = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: dest.id, sourceName: "P2",
    });
    created.hospitals.push(result.sourceHospitalId);
    const [src] = await db.select().from(hospitals).where(eq(hospitals.id, result.sourceHospitalId));
    expect(src.addonClinic).toBe(true);
    expect(src.addonQuestionnaire).toBe(true);
    expect(src.addonAmbulantEligibility).toBe(true);
    expect(src.addonSurgery).toBe(false);
    expect(src.addonMonitor).toBe(false);
    expect(src.addonLogistics).toBe(false);
  });

  it("is atomic — failure leaves no orphan hospital", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}-c`);
    await expect(provisionSourceHospital({
      surgeonUserId: "non-existent-user-id",
      originatingDestinationId: dest.id,
      sourceName: "Will Fail",
    })).rejects.toThrow();
    const orphan = await db.select().from(hospitals).where(eq(hospitals.name, "Will Fail"));
    expect(orphan.length).toBe(0);
  });
});
