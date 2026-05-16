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
