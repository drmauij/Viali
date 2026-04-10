import { db } from "../db";
import { eq, and, asc, gte, lte, sql } from "drizzle-orm";
import {
  shiftTypes, staffShifts,
  type ShiftType, type InsertShiftType,
  type StaffShift, type InsertStaffShift,
} from "@shared/schema";

export async function getShiftTypes(hospitalId: string): Promise<ShiftType[]> {
  return db.select().from(shiftTypes)
    .where(eq(shiftTypes.hospitalId, hospitalId))
    .orderBy(asc(shiftTypes.sortOrder), asc(shiftTypes.name));
}

export async function createShiftType(data: InsertShiftType): Promise<ShiftType> {
  const [row] = await db.insert(shiftTypes).values(data).returning();
  return row;
}

export async function updateShiftType(id: string, data: Partial<InsertShiftType>): Promise<ShiftType | null> {
  const [row] = await db.update(shiftTypes)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(shiftTypes.id, id))
    .returning();
  return row ?? null;
}

export async function deleteShiftType(id: string): Promise<{ deleted: boolean; usageCount: number }> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(staffShifts).where(eq(staffShifts.shiftTypeId, id));
  if (count > 0) return { deleted: false, usageCount: count };
  await db.delete(shiftTypes).where(eq(shiftTypes.id, id));
  return { deleted: true, usageCount: 0 };
}

export async function getStaffShiftsRange(hospitalId: string, from: string, to: string): Promise<StaffShift[]> {
  return db.select().from(staffShifts)
    .where(and(
      eq(staffShifts.hospitalId, hospitalId),
      gte(staffShifts.date, from),
      lte(staffShifts.date, to),
    ));
}

export async function upsertStaffShift(data: InsertStaffShift): Promise<StaffShift> {
  const [row] = await db.insert(staffShifts)
    .values(data)
    .onConflictDoUpdate({
      target: [staffShifts.hospitalId, staffShifts.userId, staffShifts.date],
      set: { shiftTypeId: data.shiftTypeId, updatedAt: new Date(), createdBy: data.createdBy },
    })
    .returning();
  return row;
}

export async function clearStaffShift(hospitalId: string, userId: string, date: string): Promise<void> {
  await db.delete(staffShifts).where(and(
    eq(staffShifts.hospitalId, hospitalId),
    eq(staffShifts.userId, userId),
    eq(staffShifts.date, date),
  ));
}

export async function deleteStaffShiftById(id: string): Promise<void> {
  await db.delete(staffShifts).where(eq(staffShifts.id, id));
}
