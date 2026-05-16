import crypto from "crypto";
import { eq, and, count } from "drizzle-orm";
import { db } from "../db";
import { hospitals, units, userHospitalRoles, referralPartnerships, externalSurgeryRequests, surgeries, patients, surgeryRooms, users as usersTable } from "@shared/schema";

export const PRAXIS_ADDON_DEFAULTS = {
  addonClinic: true,
  addonQuestionnaire: true,
  addonAmbulantEligibility: true,
  addonPatientChat: true,
  addonSurgery: false,
  addonMonitor: false,
  addonLogistics: false,
  addonWorktime: false,
  addonRetell: false,
  addonDispocura: false,
} as const;

export interface ProvisionSourceInput {
  surgeonUserId: string;
  originatingDestinationId: string;
  sourceName: string;
  profile?: { address?: string; timezone?: string };
}

export interface ProvisionSourceResult {
  sourceHospitalId: string;
  partnershipId: string;
}

export async function provisionSourceHospital(input: ProvisionSourceInput): Promise<ProvisionSourceResult> {
  return await db.transaction(async (tx) => {
    // 1. Create the praxis hospital
    const [src] = await tx.insert(hospitals).values({
      name: input.sourceName,
      tenantType: "praxis",
      address: input.profile?.address,
      timezone: input.profile?.timezone ?? "Europe/Zurich",
      ...PRAXIS_ADDON_DEFAULTS,
    } as any).returning();

    // 2. Create a default clinic unit (required by userHospitalRoles.unitId NOT NULL FK)
    const [defaultUnit] = await tx.insert(units).values({
      name: "Clinic",
      hospitalId: src.id,
      type: "clinic",
      isClinicModule: true,
    } as any).returning();

    // 3. Bind surgeon as admin of the new praxis hospital.
    //    Passing the surgeonUserId FK intentionally — if the user doesn't exist,
    //    the FK violation rolls back the whole transaction (atomicity test).
    await tx.insert(userHospitalRoles).values({
      userId: input.surgeonUserId,
      hospitalId: src.id,
      unitId: defaultUnit.id,
      role: "admin",
    } as any);

    // 4. Auto-pair with the originating destination clinic
    const [pair] = await tx.insert(referralPartnerships).values({
      sourceHospitalId: src.id,
      destinationHospitalId: input.originatingDestinationId,
      status: "active",
      pairingSource: "auto_on_provision",
    }).returning();

    return { sourceHospitalId: src.id, partnershipId: pair.id };
  });
}

// ---------------------------------------------------------------------------
// Referral partnership helpers
// ---------------------------------------------------------------------------

// Short-lived in-memory store for manual pairing codes.
// v2+ can persist these to Redis or a DB table if multi-instance is needed.
const PARTNERSHIP_CODE_TTL_MS = 30 * 60 * 1000;
const partnershipCodes = new Map<string, { destinationHospitalId: string; expiresAt: number }>();

export async function generatePartnershipCode(destinationHospitalId: string): Promise<string> {
  const code = crypto.randomBytes(4).toString("hex").toUpperCase();
  partnershipCodes.set(code, { destinationHospitalId, expiresAt: Date.now() + PARTNERSHIP_CODE_TTL_MS });
  return code;
}

export async function listPartnerships(sourceHospitalId: string) {
  return db
    .select({
      id: referralPartnerships.id,
      destinationHospitalId: referralPartnerships.destinationHospitalId,
      status: referralPartnerships.status,
      pairingSource: referralPartnerships.pairingSource,
      createdAt: referralPartnerships.createdAt,
      destinationName: hospitals.name,
    })
    .from(referralPartnerships)
    .leftJoin(hospitals, eq(referralPartnerships.destinationHospitalId, hospitals.id))
    .where(and(eq(referralPartnerships.sourceHospitalId, sourceHospitalId), eq(referralPartnerships.status, "active")));
}

export async function redeemPartnershipCode(input: { sourceHospitalId: string; code: string }) {
  const entry = partnershipCodes.get(input.code);
  if (!entry || entry.expiresAt < Date.now()) {
    partnershipCodes.delete(input.code);
    throw new Error(`unknown pairing code: ${input.code}`);
  }
  partnershipCodes.delete(input.code);
  const [pair] = await db
    .insert(referralPartnerships)
    .values({
      sourceHospitalId: input.sourceHospitalId,
      destinationHospitalId: entry.destinationHospitalId,
      status: "pending",
      pairingSource: "manual_code",
    })
    .returning();
  return pair;
}

export async function approvePartnership(input: { partnershipId: string; approverDestinationId: string }) {
  const [pair] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, input.partnershipId));
  if (!pair) throw new Error("partnership not found");
  if (pair.destinationHospitalId !== input.approverDestinationId) throw new Error("not authorized to approve");
  await db.update(referralPartnerships).set({ status: "active" }).where(eq(referralPartnerships.id, input.partnershipId));
}

export async function rejectPartnership(input: { partnershipId: string; approverDestinationId: string }) {
  const [pair] = await db.select().from(referralPartnerships).where(eq(referralPartnerships.id, input.partnershipId));
  if (!pair) throw new Error("partnership not found");
  if (pair.destinationHospitalId !== input.approverDestinationId) throw new Error("not authorized to reject");
  await db.update(referralPartnerships).set({ status: "revoked" }).where(eq(referralPartnerships.id, input.partnershipId));
}

export async function revokePartnership(input: { partnershipId: string; actor: "source" | "destination" }) {
  await db.update(referralPartnerships).set({ status: "revoked" }).where(eq(referralPartnerships.id, input.partnershipId));
}

// ---------------------------------------------------------------------------
// Backfill helper — imports historical external_surgery_requests into the
// praxis's own calendar. Run once after provisionSourceHospital.
// ---------------------------------------------------------------------------

function mapRequestStatusToReferralStatus(reqStatus?: string | null): string {
  switch ((reqStatus ?? "").toLowerCase()) {
    case "scheduled": return "confirmed_external";
    case "declined":  return "rejected_external";
    case "pending":
    default:          return "pending_external";
  }
}

export interface BackfillResult {
  surgeriesCreated: number;
  patientsCreated: number;
  destinationsPaired: number;
}

export async function backfillReferralHistory(input: {
  sourceHospitalId: string;
  surgeonUserId: string;
  sinceYears?: number;
}): Promise<BackfillResult> {
  const since = input.sinceYears ?? 5;
  const cutoff = new Date(Date.now() - since * 365 * 24 * 3600 * 1000);

  // Pull all eligible requests by this surgeon
  const reqs = await db.select().from(externalSurgeryRequests).where(
    eq(externalSurgeryRequests.surgeonId, input.surgeonUserId),
  );
  const eligible = reqs.filter(r => !r.wishedDate || new Date(r.wishedDate as string) >= cutoff);

  // Auto-pair every distinct destination hospital + ensure a logical surgery room exists
  const destIds = Array.from(new Set(eligible.map(r => r.hospitalId)));
  let destinationsPaired = 0;

  for (const destId of destIds) {
    const [existingPair] = await db.select().from(referralPartnerships).where(and(
      eq(referralPartnerships.sourceHospitalId, input.sourceHospitalId),
      eq(referralPartnerships.destinationHospitalId, destId),
    ));

    if (!existingPair) {
      // New destination — create partnership + room
      await db.insert(referralPartnerships).values({
        sourceHospitalId: input.sourceHospitalId,
        destinationHospitalId: destId,
        status: "active",
        pairingSource: "historical_import",
      });
      destinationsPaired++;

      const [dest] = await db.select().from(hospitals).where(eq(hospitals.id, destId));
      if (dest) {
        await db.insert(surgeryRooms).values({
          hospitalId: input.sourceHospitalId,
          name: dest.name,
          type: "OP",
          linkedHospitalId: destId,
        } as any);
      }
    } else {
      // Already paired (e.g. originating destination from provisionSourceHospital) — ensure room exists
      const [hasRoom] = await db.select().from(surgeryRooms).where(and(
        eq(surgeryRooms.hospitalId, input.sourceHospitalId),
        eq(surgeryRooms.linkedHospitalId, destId),
      ));
      if (!hasRoom) {
        const [dest] = await db.select().from(hospitals).where(eq(hospitals.id, destId));
        if (dest) {
          await db.insert(surgeryRooms).values({
            hospitalId: input.sourceHospitalId,
            name: dest.name,
            type: "OP",
            linkedHospitalId: destId,
          } as any);
        }
      }
    }
  }

  // Seed surgeries + patients (idempotent via externalRequestId)
  let surgeriesCreated = 0;
  let patientsCreated = 0;

  for (const req of eligible) {
    // Idempotency check — skip if already imported
    const [exists] = await db.select({ id: surgeries.id }).from(surgeries).where(and(
      eq(surgeries.hospitalId, input.sourceHospitalId),
      eq(surgeries.externalRequestId, req.id),
    ));
    if (exists) continue;

    // Find the logical surgery room for this destination
    const [room] = await db.select().from(surgeryRooms).where(and(
      eq(surgeryRooms.hospitalId, input.sourceHospitalId),
      eq(surgeryRooms.linkedHospitalId, req.hospitalId),
    ));
    if (!room) continue; // should not happen, but guard

    // Patient dedup — skip for reservations or missing name
    let patientId: string | null = null;
    if (!req.isReservationOnly && req.patientFirstName && req.patientLastName) {
      const dedupConds: Parameters<typeof and> = [
        eq(patients.hospitalId, input.sourceHospitalId),
        eq(patients.firstName, req.patientFirstName),
        eq(patients.surname, req.patientLastName),
      ];
      if (req.patientBirthday) {
        dedupConds.push(eq(patients.birthday, req.patientBirthday as string));
      }
      const [existingPt] = await db.select().from(patients).where(and(...dedupConds));
      if (existingPt) {
        patientId = existingPt.id;
      } else {
        // Generate a simple patient number scoped to the source hospital
        const ptCountRows = await db.select({ id: patients.id }).from(patients)
          .where(eq(patients.hospitalId, input.sourceHospitalId));
        const ptNumber = `P-${String(ptCountRows.length + 1).padStart(5, "0")}`;

        const [pt] = await db.insert(patients).values({
          hospitalId: input.sourceHospitalId,
          firstName: req.patientFirstName,
          surname: req.patientLastName,
          patientNumber: ptNumber,
          birthday: (req.patientBirthday as string | null) ?? "",
          sex: "O",
          email: req.patientEmail,
          phone: req.patientPhone,
          street: req.patientStreet,
          postalCode: req.patientPostalCode,
          city: req.patientCity,
        } as any).returning();
        patientId = pt.id;
        patientsCreated++;
      }
    }

    // Compose plannedDate from wishedDate + wishedTimeFrom (minutes from midnight)
    const wd = new Date(req.wishedDate as string);
    const minutes = req.wishedTimeFrom ?? 720; // default noon if unset
    wd.setUTCHours(Math.floor(minutes / 60));
    wd.setUTCMinutes(minutes % 60);
    wd.setUTCSeconds(0);
    wd.setUTCMilliseconds(0);

    await db.insert(surgeries).values({
      hospitalId: input.sourceHospitalId,
      patientId,
      surgeryRoomId: room.id,
      plannedDate: wd,
      plannedSurgery: req.surgeryName,
      chopCode: req.chopCode,
      surgerySide: req.surgerySide,
      antibioseProphylaxe: req.antibioseProphylaxe ?? false,
      diagnosis: req.diagnosis,
      anesthesiaNotes: req.anesthesiaNotes,
      notes: req.surgeryNotes,
      coverageType: req.coverageType,
      stayType: req.stayType,
      surgeryRiskClass: req.surgeryRiskClass as any,
      patientPosition: req.patientPosition as any,
      leftArmPosition: req.leftArmPosition as any,
      rightArmPosition: req.rightArmPosition as any,
      noPreOpRequired: !(req.withAnesthesia ?? true),
      surgeonId: input.surgeonUserId,
      externalRequestId: req.id,
      referralStatus: mapRequestStatusToReferralStatus(req.status),
      status: "planned",
      planningStatus: "pre-registered",
    } as any);
    surgeriesCreated++;
  }

  return { surgeriesCreated, patientsCreated, destinationsPaired };
}

// ---------------------------------------------------------------------------
// Cross-tenant referral creation (Task 6: clinic-linked room hook)
// ---------------------------------------------------------------------------

export interface AvailabilityWindow {
  start: Date;
  end: Date;
  roomId: string;
  reason: "booked" | "closed" | "maintenance";
}

export async function getDestinationAvailability(
  destinationHospitalId: string,
  from: Date,
  to: Date,
): Promise<AvailabilityWindow[]> {
  const rows = await db
    .select({ id: surgeries.id, start: surgeries.plannedDate, roomId: surgeries.surgeryRoomId })
    .from(surgeries)
    .where(eq(surgeries.hospitalId, destinationHospitalId));

  // Treat each existing surgery as a 60-minute busy block
  return rows
    .filter((r) => r.start && new Date(r.start as any) <= to)
    .map((r) => ({
      start: new Date(r.start as any),
      end: new Date(new Date(r.start as any).getTime() + 60 * 60 * 1000),
      roomId: r.roomId ?? "",
      reason: "booked" as const,
    }))
    .filter((w) => w.end >= from);
}

export async function checkSlotIsFree(
  destinationHospitalId: string,
  slotStart: Date,
  slotEnd: Date,
): Promise<boolean> {
  const windows = await getDestinationAvailability(destinationHospitalId, slotStart, slotEnd);
  return !windows.some((w) => w.start < slotEnd && w.end > slotStart);
}

export interface CreateReferralInput {
  sourceHospitalId: string;
  surgeonUserId: string;
  surgery: any; // Full source-side surgery row (already inserted)
  destinationHospitalId: string;
  patientId: string | null;
  consentGiven: boolean;
}

export interface CreateReferralResult {
  externalRequestId: string;
}

export async function createCrossTenantReferral(
  input: CreateReferralInput,
): Promise<CreateReferralResult> {
  if (!input.consentGiven) throw new Error("consent required");

  // Verify active partnership
  const [pair] = await db
    .select()
    .from(referralPartnerships)
    .where(
      and(
        eq(referralPartnerships.sourceHospitalId, input.sourceHospitalId),
        eq(referralPartnerships.destinationHospitalId, input.destinationHospitalId),
        eq(referralPartnerships.status, "active"),
      ),
    );
  if (!pair) throw new Error("destination not paired");

  // Race-safe slot check
  const start = new Date(input.surgery.plannedDate);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (!(await checkSlotIsFree(input.destinationHospitalId, start, end))) {
    throw new Error("slot_taken");
  }

  // Build patient snapshot
  let demographics: any = {};
  if (input.patientId) {
    const [pt] = await db.select().from(patients).where(eq(patients.id, input.patientId));
    if (pt) {
      demographics = {
        firstName: pt.firstName,
        lastName: (pt as any).surname ?? (pt as any).lastName,
        birthday: pt.birthday,
        sex: pt.sex,
        email: pt.email,
        phone: pt.phone,
        street: (pt as any).street,
        postalCode: (pt as any).postalCode,
        city: (pt as any).city,
      };
    }
  }
  const snapshot = {
    demographics,
    intake: {},
    ambulant_eligibility: input.surgery.ambulantQuickCheck ?? null,
    consents: {
      given: true,
      scope: "surgery_referral",
      at: new Date().toISOString(),
      userId: input.surgeonUserId,
    },
    shared_at: new Date().toISOString(),
  };

  // Get surgeon details for NOT NULL required fields
  const [surgeon] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, input.surgeonUserId));

  const wishedDate = new Date(input.surgery.plannedDate).toISOString().split("T")[0];
  const wishedMinutes = start.getUTCHours() * 60 + start.getUTCMinutes();

  const [req] = await db
    .insert(externalSurgeryRequests)
    .values({
      hospitalId: input.destinationHospitalId,
      surgeonId: input.surgeonUserId,
      surgeonFirstName: surgeon?.firstName ?? "Source",
      surgeonLastName: surgeon?.lastName ?? "Surgeon",
      surgeonEmail: surgeon?.email ?? "",
      surgeonPhone: (surgeon as any)?.phone ?? "",
      sourceHospitalId: input.sourceHospitalId,
      sourceSurgeryId: input.surgery.id,
      patientSnapshot: snapshot,
      patientFirstName: demographics.firstName,
      patientLastName: demographics.lastName,
      patientBirthday: demographics.birthday,
      patientEmail: demographics.email,
      patientPhone: demographics.phone,
      patientStreet: demographics.street,
      patientPostalCode: demographics.postalCode,
      patientCity: demographics.city,
      surgeryName: input.surgery.plannedSurgery,
      chopCode: input.surgery.chopCode,
      surgerySide: input.surgery.surgerySide,
      antibioseProphylaxe: input.surgery.antibioseProphylaxe ?? false,
      surgeryDurationMinutes: 60,
      withAnesthesia: !(input.surgery.noPreOpRequired ?? false),
      anesthesiaNotes: input.surgery.anesthesiaNotes,
      surgeryNotes: input.surgery.notes,
      diagnosis: input.surgery.diagnosis,
      coverageType: input.surgery.coverageType,
      stayType: input.surgery.stayType,
      surgeryRiskClass: input.surgery.surgeryRiskClass,
      wishedDate,
      wishedTimeFrom: wishedMinutes,
      wishedTimeTo: wishedMinutes,
      patientPosition: input.surgery.patientPosition,
      leftArmPosition: input.surgery.leftArmPosition,
      rightArmPosition: input.surgery.rightArmPosition,
      isReservationOnly: !input.patientId,
      status: "pending",
    } as any)
    .returning();

  return { externalRequestId: req.id };
}

// ---------------------------------------------------------------------------
// Task 7: destination-side accept — push status back + import snapshot
// ---------------------------------------------------------------------------

export async function pushReferralStatus(input: {
  externalRequestId: string;
  newStatus: "confirmed_external" | "rejected_external" | "cancelled_external";
  confirmedDate?: Date | null;
  note?: string | null;
  isReschedule?: boolean;
  byUserId?: string | null;
  byHospitalId?: string | null;
}): Promise<void> {
  const [r] = await db
    .select()
    .from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r?.sourceSurgeryId) return;

  const update: Record<string, unknown> = { referralStatus: input.newStatus };
  if (input.confirmedDate) update.plannedDate = input.confirmedDate;
  if (input.note != null) update.referralNote = input.note;
  if (input.isReschedule) update.lastClinicRescheduleAt = new Date();

  // Append to reschedule_history (tracks all status transitions)
  const [src] = await db
    .select()
    .from(surgeries)
    .where(eq(surgeries.id, r.sourceSurgeryId));
  if (src) {
    const history = Array.isArray((src as any).rescheduleHistory)
      ? [...((src as any).rescheduleHistory as unknown[])]
      : [];
    history.push({
      from_status: (src as any).referralStatus,
      to_status: input.newStatus,
      from_date: src.plannedDate,
      to_date: input.confirmedDate ?? src.plannedDate,
      at: new Date().toISOString(),
      by_user_id: input.byUserId ?? null,
      by_hospital_id: input.byHospitalId ?? null,
      reason: input.note ?? null,
    });
    (update as any).rescheduleHistory = history;
  }

  await db
    .update(surgeries)
    .set(update as any)
    .where(eq(surgeries.id, r.sourceSurgeryId));
}

export async function acceptReferralAndImport(input: {
  destinationHospitalId: string;
  externalRequestId: string;
  confirmedDate?: Date | null;
  byUserId: string;
}): Promise<{ destinationPatientId: string }> {
  const [r] = await db
    .select()
    .from(externalSurgeryRequests)
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));
  if (!r) throw new Error("request not found");

  // Build demographics from snapshot if present, else from request top-level fields
  const snap = (r.patientSnapshot as any) ?? null;
  const dem = snap?.demographics ?? {
    firstName: r.patientFirstName,
    lastName: r.patientLastName,
    birthday: r.patientBirthday,
    sex: "O",
    email: r.patientEmail,
    phone: r.patientPhone,
    street: r.patientStreet,
    postalCode: r.patientPostalCode,
    city: r.patientCity,
  };

  // Generate a unique patientNumber within the destination hospital
  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(patients)
    .where(eq(patients.hospitalId, input.destinationHospitalId));
  const patientNumber = `P-${String(Number(existingCount) + 1).padStart(5, "0")}`;

  const [destPt] = await db
    .insert(patients)
    .values({
      hospitalId: input.destinationHospitalId,
      patientNumber,
      firstName: dem.firstName ?? "Unknown",
      surname: dem.lastName ?? "Patient",
      birthday: dem.birthday ?? "",
      sex: (dem.sex ?? "O") as any,
      email: dem.email ?? null,
      phone: dem.phone ?? null,
      street: dem.street ?? null,
      postalCode: dem.postalCode ?? null,
      city: dem.city ?? null,
    } as any)
    .returning();

  // Mark the external request as scheduled and link to new destination patient
  await db
    .update(externalSurgeryRequests)
    .set({ status: "scheduled", patientId: destPt.id })
    .where(eq(externalSurgeryRequests.id, input.externalRequestId));

  // Push status back to the source-side surgery
  await pushReferralStatus({
    externalRequestId: input.externalRequestId,
    newStatus: "confirmed_external",
    confirmedDate: input.confirmedDate ?? null,
    byUserId: input.byUserId,
    byHospitalId: input.destinationHospitalId,
  });

  return { destinationPatientId: destPt.id };
}
