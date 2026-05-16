import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, userHospitalRoles, referralPartnerships, units } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import {
  provisionSourceHospital,
  listPartnerships,
  generatePartnershipCode,
  redeemPartnershipCode,
  approvePartnership,
  rejectPartnership,
  revokePartnership,
} from "../server/storage/praxisMode";

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
    // Surgeon gets 3 rows: admin in Clinic unit + admin in OR unit + doctor in OR unit
    expect(roles.length).toBe(3);
    expect(roles.every((r) => r.userId === surgeon.id)).toBe(true);
    expect(roles.filter((r) => r.role === "admin").length).toBe(2);
    expect(roles.filter((r) => r.role === "doctor").length).toBe(1);
    expect(roles.every((r) => r.isBookable === true)).toBe(true);

    const pair = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, result.sourceHospitalId));
    expect(pair.length).toBe(1);
    expect(pair[0].destinationHospitalId).toBe(dest.id);
    expect(pair[0].status).toBe("active");
    expect(pair[0].pairingSource).toBe("auto_on_provision");
  });

  it("applies praxis addon defaults — addonClinic + addonSurgery on, addonMonitor + addonLogistics off", async () => {
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
    // Surgery is ON — the praxis plans surgeries on the OR calendar and submits
    // referrals via clinic-linked rooms. They don't perform surgery in-house, but
    // the planning surface is the OR calendar.
    expect(src.addonSurgery).toBe(true);
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

describe("referral partnership helpers", () => {
  it("listPartnerships returns active partnerships only, joined with destination hospital data", async () => {
    const d1 = await makeDestination(`A ${Date.now()}`);
    const d2 = await makeDestination(`B ${Date.now()}`);
    const s = await makeSurgeon(`p-list-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: d1.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    await db.insert(referralPartnerships).values({
      sourceHospitalId, destinationHospitalId: d2.id, status: "revoked", pairingSource: "manual_code",
    });

    const list = await listPartnerships(sourceHospitalId);
    expect(list.length).toBe(1);
    expect(list[0].destinationHospitalId).toBe(d1.id);
    expect(list[0].destinationName).toBe(d1.name);
  });

  it("generate -> redeem -> approve completes a manual pairing", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-code-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const newDest = await makeDestination(`NewDest ${Date.now()}`);
    const code = await generatePartnershipCode(newDest.id);
    expect(code).toMatch(/^[A-Z0-9]{8}$/);

    const pending = await redeemPartnershipCode({ sourceHospitalId, code });
    expect(pending.status).toBe("pending");

    await approvePartnership({ partnershipId: pending.id, approverDestinationId: newDest.id });

    const list = await listPartnerships(sourceHospitalId);
    expect(list.map(p => p.destinationHospitalId).sort()).toEqual([dest.id, newDest.id].sort());
  });

  it("redeem rejects an unknown code", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-bad-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);
    await expect(redeemPartnershipCode({ sourceHospitalId, code: "ZZZZZZZZ" }))
      .rejects.toThrow(/unknown pairing code/i);
  });

  it("rejectPartnership marks status revoked", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-rej-${Date.now()}@t.local`);
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    const newDest = await makeDestination(`Other ${Date.now()}`);
    const code = await generatePartnershipCode(newDest.id);
    const pending = await redeemPartnershipCode({ sourceHospitalId, code });
    await rejectPartnership({ partnershipId: pending.id, approverDestinationId: newDest.id });

    const [row] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, pending.id));
    expect(row.status).toBe("revoked");
  });

  it("revokePartnership flips status to revoked but keeps the row", async () => {
    const dest = await makeDestination(`Dest ${Date.now()}`);
    const s = await makeSurgeon(`p-rev-${Date.now()}@t.local`);
    const { sourceHospitalId, partnershipId } = await provisionSourceHospital({
      surgeonUserId: s.id, originatingDestinationId: dest.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    await revokePartnership({ partnershipId, actor: "source" });
    const [row] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, partnershipId));
    expect(row.status).toBe("revoked");
  });
});
