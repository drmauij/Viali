import { db } from "../db";
import { eq, and, asc } from "drizzle-orm";
import {
  hospitals,
  userHospitalRoles,
  units,
  type Hospital,
  type Unit,
} from "@shared/schema";

export async function getHospital(id: string): Promise<Hospital | undefined> {
  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, id));
  return hospital;
}

export async function getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean; isLogisticModule: boolean; showControlledMedications: boolean })[]> {
  const result = await db
    .select()
    .from(hospitals)
    .innerJoin(userHospitalRoles, eq(hospitals.id, userHospitalRoles.hospitalId))
    .innerJoin(units, eq(userHospitalRoles.unitId, units.id))
    .where(eq(userHospitalRoles.userId, userId));
  
  return result.map(row => ({
    ...row.hospitals,
    role: row.user_hospital_roles.role,
    unitId: row.user_hospital_roles.unitId,
    unitName: row.units.name,
    unitType: row.units.type,
    // Deprecated: use unitType instead - these are derived from type for backwards compatibility
    isAnesthesiaModule: row.units.type === 'anesthesia',
    isSurgeryModule: row.units.type === 'or',
    isBusinessModule: row.units.type === 'business',
    isClinicModule: row.units.type === 'clinic',
    isLogisticModule: row.units.type === 'logistic',
    showControlledMedications: row.units.showControlledMedications ?? false,
  })) as (Hospital & { role: string; unitId: string; unitName: string; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean; isLogisticModule: boolean; showControlledMedications: boolean })[];
}

export async function createHospital(name: string): Promise<Hospital> {
  const [hospital] = await db
    .insert(hospitals)
    .values({ 
      name,
      trialStartDate: new Date(), // Set trial start date for new hospitals (15-day trial)
    })
    .returning();
  return hospital;
}

export async function updateHospital(id: string, updates: Partial<Hospital>): Promise<Hospital> {
  const [updated] = await db
    .update(hospitals)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(hospitals.id, id))
    .returning();
  return updated;
}

export async function getHospitalByQuestionnaireToken(token: string): Promise<Hospital | undefined> {
  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.questionnaireToken, token));
  return hospital;
}

export async function setHospitalQuestionnaireToken(hospitalId: string, token: string | null): Promise<Hospital> {
  const [updated] = await db
    .update(hospitals)
    .set({ questionnaireToken: token, updatedAt: new Date() })
    .where(eq(hospitals.id, hospitalId))
    .returning();
  return updated;
}

export async function getUnits(hospitalId: string): Promise<Unit[]> {
  return await db
    .select()
    .from(units)
    .where(eq(units.hospitalId, hospitalId))
    .orderBy(asc(units.name));
}

export async function getUnit(id: string): Promise<Unit | undefined> {
  const [unit] = await db
    .select()
    .from(units)
    .where(eq(units.id, id))
    .limit(1);
  return unit;
}

export async function createUnit(unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit> {
  const [newUnit] = await db
    .insert(units)
    .values(unit)
    .returning();
  return newUnit;
}

export async function updateUnit(id: string, updates: Partial<Unit>): Promise<Unit> {
  const [updated] = await db
    .update(units)
    .set(updates)
    .where(eq(units.id, id))
    .returning();
  return updated;
}

export async function deleteUnit(id: string): Promise<void> {
  await db.delete(units).where(eq(units.id, id));
}
