import { describe, it, expect, afterAll } from "vitest";
import { db, pool } from "../server/db";
import { hospitals, users, surgeries, externalSurgeryRequests, patients, referralPartnerships, surgeryRooms, userHospitalRoles, units } from "@shared/schema";
import { eq, inArray, and } from "drizzle-orm";
import { provisionSourceHospital, backfillReferralHistory } from "../server/storage/praxisMode";

const created = { hospitals: [] as string[], users: [] as string[], surgeries: [] as string[], requests: [] as string[], patients: [] as string[] };
afterAll(async () => {
  // Cleanup in FK-respecting order
  if (created.surgeries.length) await db.delete(surgeries).where(inArray(surgeries.id, created.surgeries));
  if (created.requests.length) await db.delete(externalSurgeryRequests).where(inArray(externalSurgeryRequests.id, created.requests));
  if (created.patients.length) await db.delete(patients).where(inArray(patients.id, created.patients));
  for (const hId of created.hospitals) {
    await db.delete(surgeries).where(eq(surgeries.hospitalId, hId));
    await db.delete(surgeryRooms).where(eq(surgeryRooms.hospitalId, hId));
    await db.delete(patients).where(eq(patients.hospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.sourceHospitalId, hId));
    await db.delete(referralPartnerships).where(eq(referralPartnerships.destinationHospitalId, hId));
    await db.delete(externalSurgeryRequests).where(eq(externalSurgeryRequests.hospitalId, hId));
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.hospitalId, hId));
    await db.delete(units).where(eq(units.hospitalId, hId));
  }
  if (created.hospitals.length) await db.delete(hospitals).where(inArray(hospitals.id, created.hospitals));
  if (created.users.length) await db.delete(users).where(inArray(users.id, created.users));
  await pool.end();
});

describe("backfillReferralHistory", () => {
  it("creates source-side surgeries + patients for each external request, auto-pairs all historical destinations, imports slot reservations, idempotent", async () => {
    const [d1] = await db.insert(hospitals).values({ name: `D1 ${Date.now()}`, tenantType: "clinic" } as any).returning();
    const [d2] = await db.insert(hospitals).values({ name: `D2 ${Date.now()}`, tenantType: "clinic" } as any).returning();
    created.hospitals.push(d1.id, d2.id);
    const [surgeon] = await db.insert(users).values({ email: `bf-${Date.now()}@t.local`, firstName: "X", lastName: "Y" }).returning();
    created.users.push(surgeon.id);

    // seed 2 prior requests in d1, 1 in d2, plus one slot reservation in d1
    const baseDate = new Date();
    const seed = await db.insert(externalSurgeryRequests).values([
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "A", patientLastName: "One",
        surgeryDurationMinutes: 60, status: "scheduled",
        wishedDate: new Date(baseDate.getTime() - 24*3600*1000).toISOString().split('T')[0] },
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "B", patientLastName: "Two",
        surgeryDurationMinutes: 60, status: "pending",
        wishedDate: new Date(baseDate.getTime() + 7*24*3600*1000).toISOString().split('T')[0] },
      { hospitalId: d2.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        patientFirstName: "C", patientLastName: "Three",
        surgeryDurationMinutes: 90, status: "scheduled",
        wishedDate: new Date(baseDate.getTime() + 14*24*3600*1000).toISOString().split('T')[0] },
      // slot reservation (no patient)
      { hospitalId: d1.id, surgeonId: surgeon.id,
        surgeonFirstName: "X", surgeonLastName: "Y", surgeonEmail: surgeon.email!, surgeonPhone: "+41",
        isReservationOnly: true,
        surgeryDurationMinutes: 60, status: "pending",
        wishedDate: new Date(baseDate.getTime() + 21*24*3600*1000).toISOString().split('T')[0] },
    ]).returning();
    created.requests.push(...seed.map(s => s.id));

    // Provision (auto-pairs only d1 — the originating clinic)
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: surgeon.id, originatingDestinationId: d1.id, sourceName: "P",
    });
    created.hospitals.push(sourceHospitalId);

    // Backfill — should auto-pair d2 too + create rooms + import surgeries
    const r1 = await backfillReferralHistory({ sourceHospitalId, surgeonUserId: surgeon.id });
    expect(r1.surgeriesCreated).toBe(4);   // 3 patient surgeries + 1 reservation
    expect(r1.patientsCreated).toBe(3);    // 3 real patients (reservation has no patient)
    expect(r1.destinationsPaired).toBe(1); // d2 auto-paired now (d1 was already paired at provision)

    const pairs = await db.select().from(referralPartnerships)
      .where(eq(referralPartnerships.sourceHospitalId, sourceHospitalId));
    expect(pairs.length).toBe(2);
    const d2Pair = pairs.find(p => p.destinationHospitalId === d2.id);
    expect(d2Pair?.pairingSource).toBe("historical_import");

    const rooms = await db.select().from(surgeryRooms)
      .where(eq(surgeryRooms.hospitalId, sourceHospitalId));
    expect(rooms.length).toBe(2);
    expect(rooms.every(r => r.linkedHospitalId)).toBe(true);

    const surgs = await db.select().from(surgeries).where(eq(surgeries.hospitalId, sourceHospitalId));
    expect(surgs.length).toBe(4);
    expect(surgs.filter(s => s.patientId === null).length).toBe(1); // slot reservation
    expect(surgs.map(s => s.referralStatus).filter(s => s).sort()).toEqual(
      ["confirmed_external", "confirmed_external", "pending_external", "pending_external"]
    );

    const pts = await db.select().from(patients).where(eq(patients.hospitalId, sourceHospitalId));
    expect(pts.length).toBe(3);

    // Idempotency
    const r2 = await backfillReferralHistory({ sourceHospitalId, surgeonUserId: surgeon.id });
    expect(r2.surgeriesCreated).toBe(0);
    expect(r2.patientsCreated).toBe(0);
    expect(r2.destinationsPaired).toBe(0);
  });
});
