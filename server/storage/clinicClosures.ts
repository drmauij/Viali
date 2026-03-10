import { db } from "../db";
import { eq, and, lte, gte, sql } from "drizzle-orm";
import { clinicClosures, type InsertClinicClosure, type ClinicClosure } from "@shared/schema";

export async function getClinicClosures(hospitalId: string): Promise<ClinicClosure[]> {
  return db
    .select()
    .from(clinicClosures)
    .where(eq(clinicClosures.hospitalId, hospitalId))
    .orderBy(clinicClosures.startDate);
}

export async function getClinicClosuresInRange(
  hospitalId: string,
  from: string,
  to: string,
): Promise<ClinicClosure[]> {
  return db
    .select()
    .from(clinicClosures)
    .where(
      and(
        eq(clinicClosures.hospitalId, hospitalId),
        lte(clinicClosures.startDate, to),
        gte(clinicClosures.endDate, from),
      ),
    )
    .orderBy(clinicClosures.startDate);
}

export async function isDateInClosure(hospitalId: string, date: string): Promise<boolean> {
  const rows = await db
    .select({ id: clinicClosures.id })
    .from(clinicClosures)
    .where(
      and(
        eq(clinicClosures.hospitalId, hospitalId),
        lte(clinicClosures.startDate, date),
        gte(clinicClosures.endDate, date),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function createClinicClosure(data: InsertClinicClosure): Promise<ClinicClosure> {
  const [closure] = await db.insert(clinicClosures).values(data).returning();
  return closure;
}

export async function updateClinicClosure(
  id: string,
  data: Partial<Pick<InsertClinicClosure, "name" | "startDate" | "endDate" | "notes">>,
): Promise<ClinicClosure> {
  const [closure] = await db
    .update(clinicClosures)
    .set(data)
    .where(eq(clinicClosures.id, id))
    .returning();
  return closure;
}

export async function deleteClinicClosure(id: string): Promise<void> {
  await db.delete(clinicClosures).where(eq(clinicClosures.id, id));
}

export async function getClinicClosure(id: string): Promise<ClinicClosure | undefined> {
  const [closure] = await db
    .select()
    .from(clinicClosures)
    .where(eq(clinicClosures.id, id))
    .limit(1);
  return closure;
}
