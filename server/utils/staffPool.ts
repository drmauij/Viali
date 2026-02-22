import { db } from "../storage";
import { dailyStaffPool, staffPoolRules, type StaffPoolRule } from "@shared/schema";
import { and, eq, gte, lte, or, isNull } from "drizzle-orm";

export function dateMatchesRule(dateStr: string, rule: StaffPoolRule): boolean {
  const date = new Date(dateStr + 'T12:00:00');
  const start = new Date(rule.startDate + 'T00:00:00');
  if (date < start) return false;
  if (rule.endDate) {
    const end = new Date(rule.endDate + 'T23:59:59');
    if (date > end) return false;
  }
  const dayOfWeek = date.getDay();
  const dayOfMonth = date.getDate();
  switch (rule.recurrencePattern) {
    case 'daily': return true;
    case 'weekly': return (rule.recurrenceDaysOfWeek || []).includes(dayOfWeek);
    case 'monthly': return (rule.recurrenceDaysOfMonth || []).includes(dayOfMonth);
    default: return false;
  }
}

export async function materializeRulesForDate(hospitalId: string, date: string) {
  const activeRules = await db.select().from(staffPoolRules).where(and(
    eq(staffPoolRules.hospitalId, hospitalId),
    eq(staffPoolRules.isActive, true),
    lte(staffPoolRules.startDate, date),
    or(isNull(staffPoolRules.endDate), gte(staffPoolRules.endDate, date))
  ));

  for (const rule of activeRules) {
    if (dateMatchesRule(date, rule)) {
      await db.insert(dailyStaffPool).values({
        hospitalId,
        date,
        userId: rule.userId,
        name: rule.name,
        role: rule.role,
        ruleId: rule.id,
        createdBy: rule.createdBy,
      }).onConflictDoNothing();
    }
  }
}
