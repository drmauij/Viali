import crypto from "crypto";
import { eq, and, count, desc, sql } from "drizzle-orm";
import { db } from "../db";
import { hospitals, units, userHospitalRoles, referralPartnerships, externalSurgeryRequests, surgeries, patients, surgeryRooms, users as usersTable, patientQuestionnaireLinks, patientQuestionnaireResponses } from "@shared/schema";
import type { ExternalSurgeryRequest, SurgeonActionRequest } from "@shared/schema";
import { dispatchRescheduleAlert, dispatchCancelAfterAcceptAlert } from "../services/referralAlerts";

export const PRAXIS_ADDON_DEFAULTS = {
  addonClinic: true,
  addonQuestionnaire: true,
  addonAmbulantEligibility: true,
  addonPatientChat: true,
  // Surgery is the primary surface for a praxis — they plan + submit referrals
  // from the OR calendar (rooms with linked_hospital_id). The praxis doesn't
  // execute surgery in-house, but the planning view is the OR calendar.
  addonSurgery: true,
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
  orUnitId: string;
  clinicUnitId: string;
}

export async function provisionSourceHospital(input: ProvisionSourceInput): Promise<ProvisionSourceResult> {
  return await db.transaction(async (tx) => {
    // 1. Create the praxis hospital.
    // Praxis activation is a beta feature — every newly provisioned praxis
    // starts on the `free` license while we stabilise the flow. Bypasses the
    // default 15-day "test" trial that fresh hospitals normally land on so
    // the user isn't surprised by a trial-ending notice during beta.
    // Revisit (move back to "test" / introduce explicit Stripe wiring) when
    // the beta banner / acceptance copy in PraxisActivationModal is removed.
    const [src] = await tx.insert(hospitals).values({
      name: input.sourceName,
      tenantType: "praxis",
      address: input.profile?.address,
      timezone: input.profile?.timezone ?? "Europe/Zurich",
      licenseType: "free",
      trialStartDate: null,
      // Pin the provisioning surgeon as the creator. The activation gate
      // reads this column to decide whether to show the "Activate" banner;
      // having a dedicated FK keeps the answer correct even if the
      // surgeon's role rows are later transferred / revoked.
      createdByUserId: input.surgeonUserId,
      ...PRAXIS_ADDON_DEFAULTS,
    } as any).returning();

    // 2. Create two default units:
    //    - Clinic unit: for clinic-side admin (patients, appointments, settings)
    //    - OR unit: for surgery planning on the OR calendar; required so the
    //      surgeon's activeHospital.unitType resolves to 'or' (gates /surgery/op
    //      via ProtectedRoute.requireSurgery → hasSurgeryAccess).
    const [clinicUnit] = await tx.insert(units).values({
      name: "Clinic",
      hospitalId: src.id,
      type: "clinic",
      isClinicModule: true,
    } as any).returning();
    const [orUnit] = await tx.insert(units).values({
      name: "OR",
      hospitalId: src.id,
      type: "or",
      isSurgeryModule: true,
    } as any).returning();

    // 3. Bind the activating surgeon to BOTH units:
    //    - admin in the Clinic unit (admin access to clinic surfaces)
    //    - admin in the OR unit AND doctor in the OR unit (so they appear in
    //      the bookable surgeon list AND have admin powers; surgeon lists
    //      prefer the 'doctor' row for the Dr. prefix).
    //    isBookable=true marks the user as schedulable for surgeries/appointments.
    //    Passing the surgeonUserId FK intentionally — if the user doesn't exist,
    //    the FK violation rolls back the whole transaction (atomicity test).
    await tx.insert(userHospitalRoles).values([
      {
        userId: input.surgeonUserId,
        hospitalId: src.id,
        unitId: clinicUnit.id,
        role: "admin",
        isBookable: true,
      },
      {
        userId: input.surgeonUserId,
        hospitalId: src.id,
        unitId: orUnit.id,
        role: "admin",
        isBookable: true,
      },
      {
        userId: input.surgeonUserId,
        hospitalId: src.id,
        unitId: orUnit.id,
        role: "doctor",
        isBookable: true,
      },
    ] as any);

    // 3b. If the activating surgeon is a parent-surgeon (users.is_praxis=true), also
    //     bind every child doctor (users.parent_surgeon_id = activating user) to
    //     the new praxis hospital's OR unit as 'doctor' (bookable). Children of
    //     non-praxis users return nothing and this is a no-op for them.
    const childDoctors = await tx
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.parentSurgeonId, input.surgeonUserId));
    if (childDoctors.length > 0) {
      await tx.insert(userHospitalRoles).values(
        childDoctors.map((child) => ({
          userId: child.id,
          hospitalId: src.id,
          unitId: orUnit.id,
          role: "doctor",
          isBookable: true,
        })) as any,
      );
    }

    // 4. Auto-pair with the originating destination clinic
    const [pair] = await tx.insert(referralPartnerships).values({
      sourceHospitalId: src.id,
      destinationHospitalId: input.originatingDestinationId,
      status: "active",
      pairingSource: "auto_on_provision",
    }).returning();

    return {
      sourceHospitalId: src.id,
      partnershipId: pair.id,
      orUnitId: orUnit.id,
      clinicUnitId: clinicUnit.id,
    };
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

  // Pull the most recent questionnaire response for this patient to include
  // clinical intake data in the snapshot (Task 15a).
  let intake: Record<string, any> = {};
  if (input.patientId) {
    // patientQuestionnaireResponses links via linkId → patientQuestionnaireLinks.patientId
    const recentLinks = await db
      .select({ id: patientQuestionnaireLinks.id })
      .from(patientQuestionnaireLinks)
      .where(
        and(
          eq(patientQuestionnaireLinks.patientId, input.patientId),
          eq(patientQuestionnaireLinks.hospitalId, input.sourceHospitalId),
        ),
      )
      .orderBy(desc(patientQuestionnaireLinks.createdAt))
      .limit(1);

    if (recentLinks.length > 0) {
      const [resp] = await db
        .select()
        .from(patientQuestionnaireResponses)
        .where(eq(patientQuestionnaireResponses.linkId, recentLinks[0].id))
        .orderBy(desc(patientQuestionnaireResponses.createdAt))
        .limit(1);

      if (resp) {
        const candidate: Record<string, any> = {
          allergies: resp.allergies,
          allergiesNotes: resp.allergiesNotes,
          medications: resp.medications,
          medicationsNotes: resp.medicationsNotes,
          conditions: resp.conditions,
          smokingStatus: resp.smokingStatus,
          smokingDetails: resp.smokingDetails,
          alcoholStatus: resp.alcoholStatus,
          alcoholDetails: resp.alcoholDetails,
          height: resp.height,
          weight: resp.weight,
          previousSurgeries: resp.previousSurgeries,
          previousAnesthesiaProblems: resp.previousAnesthesiaProblems,
          pregnancyStatus: resp.pregnancyStatus,
          breastfeeding: resp.breastfeeding,
          dentalIssues: resp.dentalIssues,
          dentalNotes: resp.dentalNotes,
          ponvTransfusionIssues: resp.ponvTransfusionIssues,
          ponvTransfusionNotes: resp.ponvTransfusionNotes,
          drugUse: resp.drugUse,
          drugUseDetails: resp.drugUseDetails,
          noAllergies: resp.noAllergies,
          noMedications: resp.noMedications,
          noConditions: resp.noConditions,
          noSmokingAlcohol: resp.noSmokingAlcohol,
          noPreviousSurgeries: resp.noPreviousSurgeries,
          noAnesthesiaProblems: resp.noAnesthesiaProblems,
          noDentalIssues: resp.noDentalIssues,
          noPonvIssues: resp.noPonvIssues,
          noDrugUse: resp.noDrugUse,
          additionalNotes: resp.additionalNotes,
          functionallyDependent: resp.functionallyDependent,
          metAbove4: resp.metAbove4,
        };
        intake = Object.fromEntries(
          Object.entries(candidate).filter(([, v]) => v !== null && v !== undefined),
        );
      }
    }
  }

  const snapshot = {
    demographics,
    intake,
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

  // Fire-and-forget OOB notifications — failures must never break the caller.
  if (input.isReschedule && src) {
    dispatchRescheduleAlert({
      surgeryId: src.id,
      oldDate: src.plannedDate ? new Date(src.plannedDate as any) : null,
      newDate: input.confirmedDate ?? null,
      reason: input.note ?? null,
      destinationHospitalId: input.byHospitalId ?? "",
    }).catch(err => console.error("[pushReferralStatus] reschedule alert dispatch failed", err));
  }
  if (input.newStatus === "cancelled_external" && (src as any)?.referralStatus === "confirmed_external") {
    dispatchCancelAfterAcceptAlert({
      surgeryId: src!.id,
      reason: input.note ?? null,
      destinationHospitalId: input.byHospitalId ?? "",
    }).catch(err => console.error("[pushReferralStatus] cancel-after-accept alert dispatch failed", err));
  }
}

/**
 * Sync an accepted surgeon_action_request back to the source praxis surgery
 * (if one exists). Idempotent — safe to call multiple times. No-op when the
 * external_surgery_request has no sourceSurgeryId (legacy portal flow with
 * no praxis mirror).
 *
 * Mapping:
 *   cancellation → source.referralStatus='cancelled_external', isArchived,
 *                  archivedAt, archivedBy (the surgeon who filed the request)
 *   reschedule   → source.plannedDate = proposed date+time, append to
 *                  rescheduleHistory, set lastClinicRescheduleAt so the
 *                  source-side ack badge fires.
 *   suspension   → source.isSuspended=true, suspendedAt, suspendedBy,
 *                  suspendedReason. referralStatus stays confirmed_external
 *                  (suspension is reversible).
 */
export async function applyAcceptedActionToSource(
  actionRequest: SurgeonActionRequest,
  externalRequest: ExternalSurgeryRequest,
): Promise<void> {
  if (!externalRequest.sourceSurgeryId) return;

  const [surgeonUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(sql`LOWER(${usersTable.email}) = ${actionRequest.surgeonEmail.toLowerCase()}`)
    .limit(1);
  const byUserId = surgeonUser?.id ?? null;
  const byHospitalId = externalRequest.hospitalId;

  if (actionRequest.type === "cancellation") {
    await pushReferralStatus({
      externalRequestId: externalRequest.id,
      newStatus: "cancelled_external",
      note: actionRequest.reason,
      byUserId,
      byHospitalId,
    });
    await db
      .update(surgeries)
      .set({
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: byUserId,
      } as any)
      .where(eq(surgeries.id, externalRequest.sourceSurgeryId));
    return;
  }

  if (actionRequest.type === "suspension") {
    await db
      .update(surgeries)
      .set({
        isSuspended: true,
        suspendedAt: new Date(),
        suspendedBy: byUserId,
        suspendedReason: actionRequest.reason,
      } as any)
      .where(eq(surgeries.id, externalRequest.sourceSurgeryId));
    return;
  }

  if (actionRequest.type === "reschedule" && actionRequest.proposedDate) {
    const [year, month, day] = actionRequest.proposedDate.split("-").map(Number);
    let hour = 12;
    let min = 0;
    if (actionRequest.proposedTimeFrom != null) {
      hour = Math.floor(actionRequest.proposedTimeFrom / 60);
      min = actionRequest.proposedTimeFrom % 60;
    }
    const newStart = new Date(Date.UTC(year, month - 1, day, hour, min));
    await pushReferralStatus({
      externalRequestId: externalRequest.id,
      newStatus: "confirmed_external",
      confirmedDate: newStart,
      note: actionRequest.reason,
      isReschedule: true,
      byUserId,
      byHospitalId,
    });
  }
}

// ---------------------------------------------------------------------------
// Task 21: source-side cancel pending referral
// ---------------------------------------------------------------------------

export async function cancelPendingReferral(input: {
  sourceSurgeryId: string;
  byUserId: string;
}): Promise<void> {
  const [src] = await db.select().from(surgeries).where(eq(surgeries.id, input.sourceSurgeryId));
  if (!src) throw new Error("surgery not found");
  if ((src as any).referralStatus !== "pending_external") {
    throw new Error("not pending — cannot cancel via this path");
  }

  await db.transaction(async (tx) => {
    if ((src as any).externalRequestId) {
      await tx
        .update(externalSurgeryRequests)
        .set({ status: "declined", cancellationReason: "cancelled_by_source" } as any)
        .where(eq(externalSurgeryRequests.id, (src as any).externalRequestId));
    }
    await tx
      .update(surgeries)
      .set({
        referralStatus: "cancelled_external",
        isArchived: true,
        archivedAt: new Date(),
        archivedBy: input.byUserId,
      } as any)
      .where(eq(surgeries.id, input.sourceSurgeryId));
  });
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

  // Import questionnaire intake from snapshot into destination (Task 15b).
  // Only runs when the snapshot carries non-empty intake data.
  const intake = snap?.intake;
  if (intake && Object.keys(intake).length > 0) {
    const token = crypto.randomBytes(16).toString("hex");
    // expiresAt is NOT NULL — use a far-future date for imported/synthetic links
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    const [linkRow] = await db
      .insert(patientQuestionnaireLinks)
      .values({
        token,
        patientId: destPt.id,
        hospitalId: input.destinationHospitalId,
        status: "submitted",
        expiresAt,
        submittedAt: new Date(),
      } as any)
      .returning();

    const fieldSources: Record<string, string> = {};
    for (const key of Object.keys(intake)) fieldSources[key] = "source_referral";

    await db.insert(patientQuestionnaireResponses).values({
      linkId: linkRow.id,
      allergies: intake.allergies,
      allergiesNotes: intake.allergiesNotes,
      medications: intake.medications,
      medicationsNotes: intake.medicationsNotes,
      conditions: intake.conditions,
      smokingStatus: intake.smokingStatus,
      smokingDetails: intake.smokingDetails,
      alcoholStatus: intake.alcoholStatus,
      alcoholDetails: intake.alcoholDetails,
      height: intake.height,
      weight: intake.weight,
      previousSurgeries: intake.previousSurgeries,
      previousAnesthesiaProblems: intake.previousAnesthesiaProblems,
      pregnancyStatus: intake.pregnancyStatus,
      breastfeeding: intake.breastfeeding,
      dentalIssues: intake.dentalIssues,
      dentalNotes: intake.dentalNotes,
      ponvTransfusionIssues: intake.ponvTransfusionIssues,
      ponvTransfusionNotes: intake.ponvTransfusionNotes,
      drugUse: intake.drugUse,
      drugUseDetails: intake.drugUseDetails,
      noAllergies: intake.noAllergies,
      noMedications: intake.noMedications,
      noConditions: intake.noConditions,
      noSmokingAlcohol: intake.noSmokingAlcohol,
      noPreviousSurgeries: intake.noPreviousSurgeries,
      noAnesthesiaProblems: intake.noAnesthesiaProblems,
      noDentalIssues: intake.noDentalIssues,
      noPonvIssues: intake.noPonvIssues,
      noDrugUse: intake.noDrugUse,
      additionalNotes: intake.additionalNotes,
      functionallyDependent: intake.functionallyDependent,
      metAbove4: intake.metAbove4,
      submittedAt: new Date(),
      importedFromPraxis: true,
      importedFromPraxisAt: new Date(),
      importedFieldSources: fieldSources,
    } as any);
  }

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
