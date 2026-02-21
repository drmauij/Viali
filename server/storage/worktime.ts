import { db } from "../db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import {
  worktimeLogs,
  users,
  type WorktimeLog,
  type InsertWorktimeLog,
} from "@shared/schema";

export async function getWorktimeLogs(
  hospitalId: string,
  filters?: { userId?: string; dateFrom?: string; dateTo?: string }
): Promise<WorktimeLog[]> {
  const conditions = [eq(worktimeLogs.hospitalId, hospitalId)];

  if (filters?.userId) {
    conditions.push(eq(worktimeLogs.userId, filters.userId));
  }
  if (filters?.dateFrom) {
    conditions.push(gte(worktimeLogs.workDate, filters.dateFrom));
  }
  if (filters?.dateTo) {
    conditions.push(lte(worktimeLogs.workDate, filters.dateTo));
  }

  return db
    .select()
    .from(worktimeLogs)
    .where(and(...conditions))
    .orderBy(desc(worktimeLogs.workDate), desc(worktimeLogs.timeStart));
}

export async function getWorktimeLogsByUser(
  hospitalId: string,
  userId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<WorktimeLog[]> {
  return getWorktimeLogs(hospitalId, { userId, dateFrom, dateTo });
}

export async function getWorktimeLog(id: string): Promise<WorktimeLog | undefined> {
  const [log] = await db
    .select()
    .from(worktimeLogs)
    .where(eq(worktimeLogs.id, id));
  return log;
}

export async function createWorktimeLog(data: InsertWorktimeLog): Promise<WorktimeLog> {
  const [created] = await db
    .insert(worktimeLogs)
    .values(data)
    .returning();
  return created;
}

export async function updateWorktimeLog(
  id: string,
  updates: Partial<InsertWorktimeLog>
): Promise<WorktimeLog> {
  const [updated] = await db
    .update(worktimeLogs)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(worktimeLogs.id, id))
    .returning();
  return updated;
}

export async function deleteWorktimeLog(id: string): Promise<void> {
  await db.delete(worktimeLogs).where(eq(worktimeLogs.id, id));
}

/**
 * Calculate work time balance for a user.
 *
 * Balance algorithm:
 * 1. Fetch user's weeklyTargetHours (return configured: false if null)
 * 2. Fetch all entries, group by ISO week (only weeks with entries count)
 * 3. Per week: weekOvertime = actualMinutes - (weeklyTargetHours * 60)
 * 4. Sum all week overtime = running balance
 * 5. Separate sums for current week and current month
 */
export async function calculateWorktimeBalance(
  hospitalId: string,
  userId: string
): Promise<{
  configured: boolean;
  weeklyTargetMinutes: number | null;
  thisWeekMinutes: number;
  thisMonthMinutes: number;
  totalOvertimeMinutes: number;
}> {
  // Get user's weekly target
  const [user] = await db
    .select({ weeklyTargetHours: users.weeklyTargetHours })
    .from(users)
    .where(eq(users.id, userId));

  const weeklyTargetHours = user?.weeklyTargetHours
    ? parseFloat(user.weeklyTargetHours)
    : null;

  if (weeklyTargetHours === null) {
    // Still return current week/month totals even without target
    const entries = await getWorktimeLogs(hospitalId, { userId });
    const { thisWeekMinutes, thisMonthMinutes } = computeCurrentPeriodMinutes(entries);
    return {
      configured: false,
      weeklyTargetMinutes: null,
      thisWeekMinutes,
      thisMonthMinutes,
      totalOvertimeMinutes: 0,
    };
  }

  const weeklyTargetMinutes = Math.round(weeklyTargetHours * 60);

  // Fetch all entries for user in this hospital
  const entries = await getWorktimeLogs(hospitalId, { userId });
  const { thisWeekMinutes, thisMonthMinutes } = computeCurrentPeriodMinutes(entries);

  // Group by ISO week and compute overtime
  const weekMap = new Map<string, number>();
  for (const entry of entries) {
    const weekKey = getISOWeekKey(entry.workDate);
    const entryMinutes = computeEntryMinutes(entry);
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + entryMinutes);
  }

  let totalOvertimeMinutes = 0;
  for (const weekMinutes of weekMap.values()) {
    totalOvertimeMinutes += weekMinutes - weeklyTargetMinutes;
  }

  return {
    configured: true,
    weeklyTargetMinutes,
    thisWeekMinutes,
    thisMonthMinutes,
    totalOvertimeMinutes,
  };
}

// --- Helpers ---

function computeEntryMinutes(entry: WorktimeLog): number {
  if (!entry.timeStart || !entry.timeEnd) return 0;
  const [startH, startM] = entry.timeStart.split(":").map(Number);
  const [endH, endM] = entry.timeEnd.split(":").map(Number);
  let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
  if (totalMinutes < 0) totalMinutes += 24 * 60; // overnight
  totalMinutes -= entry.pauseMinutes;
  return Math.max(0, totalMinutes);
}

function getISOWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  // ISO week: Monday is first day. Get the Thursday of the same ISO week.
  const dayOfWeek = d.getDay() || 7; // Sunday = 7
  d.setDate(d.getDate() + 4 - dayOfWeek); // Move to Thursday
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${weekNum.toString().padStart(2, "0")}`;
}

function computeCurrentPeriodMinutes(entries: WorktimeLog[]): {
  thisWeekMinutes: number;
  thisMonthMinutes: number;
} {
  const now = new Date();
  const currentWeekKey = getISOWeekKey(now.toISOString().slice(0, 10));
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  let thisWeekMinutes = 0;
  let thisMonthMinutes = 0;

  for (const entry of entries) {
    const entryMinutes = computeEntryMinutes(entry);
    const entryDate = new Date(entry.workDate + "T00:00:00");

    if (getISOWeekKey(entry.workDate) === currentWeekKey) {
      thisWeekMinutes += entryMinutes;
    }
    if (entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear) {
      thisMonthMinutes += entryMinutes;
    }
  }

  return { thisWeekMinutes, thisMonthMinutes };
}
