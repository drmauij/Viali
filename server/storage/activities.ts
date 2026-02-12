import { db } from "../db";
import { eq, and, desc, inArray } from "drizzle-orm";
import {
  activities,
  alerts,
  items,
  users,
  lots,
  controlledChecks,
  type Activity,
  type InsertActivity,
  type Alert,
  type Item,
  type Lot,
  type User,
  type ControlledCheck,
  type InsertControlledCheck,
} from "@shared/schema";

export async function createActivity(activity: InsertActivity): Promise<Activity> {
  const [created] = await db.insert(activities).values(activity).returning();
  return created;
}

export async function getActivityById(activityId: string): Promise<Activity | undefined> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId));
  
  return activity;
}

export async function verifyControlledActivity(activityId: string, signature: string, verifiedBy: string): Promise<Activity> {
  const [activity] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId));
  
  if (!activity) {
    throw new Error("Activity not found");
  }

  const currentSignatures = (activity.signatures as string[]) || [];
  const updatedSignatures = [...currentSignatures, signature];

  const [updated] = await db
    .update(activities)
    .set({
      signatures: updatedSignatures,
      controlledVerified: true,
    })
    .where(eq(activities.id, activityId))
    .returning();

  return updated;
}

export async function getActivities(filters: {
  hospitalId?: string;
  unitId?: string;
  itemId?: string;
  userId?: string;
  controlled?: boolean;
  actions?: string[];
  limit?: number;
}): Promise<(Activity & { user: User; item?: Item })[]> {
  const conditions = [];
  
  if (filters.itemId) conditions.push(eq(activities.itemId, filters.itemId));
  if (filters.userId) conditions.push(eq(activities.userId, filters.userId));
  
  if (filters.actions && filters.actions.length > 0) {
    conditions.push(inArray(activities.action, filters.actions));
  }
  
  if (filters.controlled !== undefined) {
    if (filters.controlled) {
      conditions.push(eq(items.controlled, true));
    } else {
      conditions.push(eq(items.controlled, false));
    }
  }

  if (filters.hospitalId) {
    conditions.push(eq(items.hospitalId, filters.hospitalId));
  }

  if (filters.unitId) {
    conditions.push(eq(items.unitId, filters.unitId));
  }

  let query = db
    .select({
      ...activities,
      user: users,
      item: items,
    })
    .from(activities)
    .innerJoin(users, eq(activities.userId, users.id))
    .leftJoin(items, eq(activities.itemId, items.id));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  query = query.orderBy(desc(activities.timestamp));

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  return await query;
}

export async function getAlerts(hospitalId: string, unitId: string, acknowledged?: boolean): Promise<(Alert & { item?: Item; lot?: Lot })[]> {
  let query = db
    .select({
      ...alerts,
      item: items,
      lot: lots,
    })
    .from(alerts)
    .leftJoin(items, eq(alerts.itemId, items.id))
    .leftJoin(lots, eq(alerts.lotId, lots.id))
    .where(and(eq(alerts.hospitalId, hospitalId), eq(items.unitId, unitId)));

  if (acknowledged !== undefined) {
    query = query.where(and(eq(alerts.hospitalId, hospitalId), eq(items.unitId, unitId), eq(alerts.acknowledged, acknowledged)));
  }

  return await query.orderBy(desc(alerts.createdAt));
}

export async function getAlertById(id: string): Promise<Alert | undefined> {
  const [alert] = await db.select().from(alerts).where(eq(alerts.id, id));
  return alert;
}

export async function acknowledgeAlert(id: string, userId: string): Promise<Alert> {
  const [updated] = await db
    .update(alerts)
    .set({
      acknowledged: true,
      acknowledgedBy: userId,
      acknowledgedAt: new Date(),
    })
    .where(eq(alerts.id, id))
    .returning();
  return updated;
}

export async function snoozeAlert(id: string, until: Date): Promise<Alert> {
  const [updated] = await db
    .update(alerts)
    .set({ snoozedUntil: until })
    .where(eq(alerts.id, id))
    .returning();
  return updated;
}

export async function createControlledCheck(check: InsertControlledCheck): Promise<ControlledCheck> {
  const [created] = await db.insert(controlledChecks).values(check).returning();
  return created;
}

export async function getControlledChecks(hospitalId: string, unitId: string, limit: number = 50): Promise<(ControlledCheck & { user: User })[]> {
  const checks = await db
    .select({
      ...controlledChecks,
      user: users,
    })
    .from(controlledChecks)
    .leftJoin(users, eq(controlledChecks.userId, users.id))
    .where(and(
      eq(controlledChecks.hospitalId, hospitalId),
      eq(controlledChecks.unitId, unitId)
    ))
    .orderBy(desc(controlledChecks.timestamp))
    .limit(limit);
  
  return checks as (ControlledCheck & { user: User })[];
}

export async function getControlledCheck(id: string): Promise<ControlledCheck | undefined> {
  const [check] = await db
    .select()
    .from(controlledChecks)
    .where(eq(controlledChecks.id, id));
  return check;
}

export async function deleteControlledCheck(id: string): Promise<void> {
  await db.delete(controlledChecks).where(eq(controlledChecks.id, id));
}
