import crypto from "crypto";
import { eq, and } from "drizzle-orm";
import { db } from "../db";
import { hospitals, units, userHospitalRoles, referralPartnerships } from "@shared/schema";

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
