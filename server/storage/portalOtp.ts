import { db } from "../db";
import { eq, and, isNull, lt, desc, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";
import {
  portalVerificationCodes,
  portalAccessSessions,
  type PortalVerificationCode,
  type PortalAccessSession,
} from "@shared/schema";

type PortalType = "patient" | "worklog" | "surgeon";

// ========== VERIFICATION CODES ==========

export async function createVerificationCode(
  portalType: PortalType,
  portalToken: string,
  plainCode: string,
  verificationToken: string,
  method: "email" | "sms",
  deliveredTo: string,
): Promise<PortalVerificationCode> {
  const bcrypt = await import("bcrypt");
  const codeHash = await bcrypt.hash(plainCode, 10);

  const [created] = await db
    .insert(portalVerificationCodes)
    .values({
      portalType,
      portalToken,
      verificationToken,
      codeHash,
      deliveryMethod: method,
      deliveredTo,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    })
    .returning();

  return created;
}

export async function findActiveVerificationCode(
  portalType: PortalType,
  portalToken: string,
  deliveredTo?: string,
): Promise<PortalVerificationCode | null> {
  const conditions = [
    eq(portalVerificationCodes.portalType, portalType),
    eq(portalVerificationCodes.portalToken, portalToken),
    isNull(portalVerificationCodes.usedAt),
  ];

  // For surgeon portal, multiple users share the same portalToken (hospital-wide).
  // Filter by deliveredTo to avoid one user's code shadowing another's.
  if (deliveredTo) {
    conditions.push(eq(portalVerificationCodes.deliveredTo, deliveredTo));
  }

  const [code] = await db
    .select()
    .from(portalVerificationCodes)
    .where(and(...conditions))
    .orderBy(desc(portalVerificationCodes.createdAt))
    .limit(1);

  if (!code || new Date(code.expiresAt) < new Date()) return null;
  return code;
}

export async function findByVerificationToken(
  verificationToken: string,
): Promise<PortalVerificationCode | null> {
  const [code] = await db
    .select()
    .from(portalVerificationCodes)
    .where(eq(portalVerificationCodes.verificationToken, verificationToken))
    .limit(1);

  return code || null;
}

export async function incrementVerificationAttempt(
  codeId: string,
): Promise<void> {
  await db
    .update(portalVerificationCodes)
    .set({ attemptCount: sql`${portalVerificationCodes.attemptCount} + 1` })
    .where(eq(portalVerificationCodes.id, codeId));
}

export async function markCodeUsed(codeId: string): Promise<void> {
  await db
    .update(portalVerificationCodes)
    .set({ usedAt: new Date() })
    .where(eq(portalVerificationCodes.id, codeId));
}

// ========== PORTAL SESSIONS ==========

const SESSION_DURATIONS: Record<PortalType, number> = {
  worklog: 30 * 24 * 60 * 60 * 1000,  // 30 days
  patient: 90 * 24 * 60 * 60 * 1000,  // 90 days (link expiry handles the real bound)
  surgeon: 30 * 24 * 60 * 60 * 1000,  // 30 days
};

export async function createPortalSession(
  portalType: PortalType,
  portalToken: string,
  surgeonEmail?: string,
): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex"); // 64-char hex

  await db.insert(portalAccessSessions).values({
    sessionToken,
    portalType,
    portalToken,
    surgeonEmail: surgeonEmail || null,
    expiresAt: new Date(Date.now() + SESSION_DURATIONS[portalType]),
  });

  return sessionToken;
}

export async function findPortalSession(
  sessionToken: string,
  portalType: PortalType,
  portalToken: string,
): Promise<boolean> {
  const [session] = await db
    .select()
    .from(portalAccessSessions)
    .where(
      and(
        eq(portalAccessSessions.sessionToken, sessionToken),
        eq(portalAccessSessions.portalType, portalType),
        eq(portalAccessSessions.portalToken, portalToken),
      ),
    )
    .limit(1);

  if (!session) return false;
  return new Date(session.expiresAt) > new Date();
}

export async function revokePortalSessionsByToken(
  portalToken: string,
): Promise<void> {
  await db
    .delete(portalAccessSessions)
    .where(eq(portalAccessSessions.portalToken, portalToken));
}

export async function revokePortalSessionBySessionToken(
  sessionToken: string,
): Promise<void> {
  await db
    .delete(portalAccessSessions)
    .where(eq(portalAccessSessions.sessionToken, sessionToken));
}

// ========== CLEANUP ==========

export async function cleanupExpiredPortalData(): Promise<void> {
  const now = new Date();
  await db
    .delete(portalVerificationCodes)
    .where(lt(portalVerificationCodes.expiresAt, now));
  await db
    .delete(portalAccessSessions)
    .where(lt(portalAccessSessions.expiresAt, now));
}

// ========== HELPERS ==========

export function generateOtpCode(): string {
  // Cryptographically random 6-digit code
  const buffer = randomBytes(4);
  const num = buffer.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, "0");
}

export function generateVerificationToken(): string {
  return randomUUID();
}
