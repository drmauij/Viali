import { db } from "../db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import { loginAuditLog, users, type LoginAuditLog, type InsertLoginAuditLog } from "@shared/schema";

export async function createLoginAuditLog(log: InsertLoginAuditLog): Promise<void> {
  await db.insert(loginAuditLog).values(log);
}

export async function getLoginAuditLogs(
  hospitalId: string,
  filters?: {
    userId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }
): Promise<{ logs: (LoginAuditLog & { userName?: string })[]; total: number }> {
  const conditions = [eq(loginAuditLog.hospitalId, hospitalId)];

  if (filters?.userId) {
    conditions.push(eq(loginAuditLog.userId, filters.userId));
  }
  if (filters?.eventType) {
    conditions.push(eq(loginAuditLog.eventType, filters.eventType as any));
  }
  if (filters?.startDate) {
    conditions.push(gte(loginAuditLog.createdAt, filters.startDate));
  }
  if (filters?.endDate) {
    conditions.push(lte(loginAuditLog.createdAt, filters.endDate));
  }

  const whereClause = and(...conditions);
  const pageLimit = filters?.limit ?? 50;
  const pageOffset = filters?.offset ?? 0;

  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(loginAuditLog)
    .where(whereClause);

  const logs = await db
    .select({
      id: loginAuditLog.id,
      userId: loginAuditLog.userId,
      email: loginAuditLog.email,
      eventType: loginAuditLog.eventType,
      ipAddress: loginAuditLog.ipAddress,
      userAgent: loginAuditLog.userAgent,
      failureReason: loginAuditLog.failureReason,
      hospitalId: loginAuditLog.hospitalId,
      createdAt: loginAuditLog.createdAt,
      userName: sql<string>`concat(${users.firstName}, ' ', ${users.lastName})`,
    })
    .from(loginAuditLog)
    .leftJoin(users, eq(loginAuditLog.userId, users.id))
    .where(whereClause)
    .orderBy(desc(loginAuditLog.createdAt))
    .limit(pageLimit)
    .offset(pageOffset);

  return { logs, total: countResult.count };
}
