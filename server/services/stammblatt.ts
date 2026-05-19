import { db } from "../db";
import { externalWorklogLinks, hospitals, users, type ExternalWorklogLink } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function isPersonalstammblattEnabled(hospitalId: string): Promise<boolean> {
  const [h] = await db
    .select({ flag: hospitals.addonPersonalstammblatt })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  return !!h?.flag;
}

const TOKEN_VALIDITY_DAYS = 30;

const REQUIRED_FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "address",
  "city",
  "zip",
  "ahvNumber",
  "bankAccount",
] as const satisfies readonly (keyof ExternalWorklogLink)[];

function expiryFromNow(): Date {
  return new Date(Date.now() + TOKEN_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
}

export function isValidStaffEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.toLowerCase();
  if (lower.endsWith("@staff.local") || lower.endsWith("@internal.local")) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function ensureStammblattLink(
  userId: string,
  hospitalId: string,
): Promise<ExternalWorklogLink> {
  // Primary lookup: exact userId match
  const existing = await db
    .select()
    .from(externalWorklogLinks)
    .where(and(
      eq(externalWorklogLinks.userId, userId),
      eq(externalWorklogLinks.hospitalId, hospitalId),
    ))
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error(`User ${userId} not found`);
  const email = user.email || `${userId}@staff.local`;

  // Secondary lookup: same (email, hospitalId) — catches legacy external links
  // that were created without a userId and could cause a unique-constraint collision.
  const byEmail = await db
    .select()
    .from(externalWorklogLinks)
    .where(and(
      eq(externalWorklogLinks.email, email),
      eq(externalWorklogLinks.hospitalId, hospitalId),
    ))
    .limit(1);

  if (byEmail.length > 0) {
    const row = byEmail[0];
    if (!row.userId) {
      // Adopt the legacy row by assigning this userId to it.
      const [adopted] = await db
        .update(externalWorklogLinks)
        .set({ userId, updatedAt: new Date() })
        .where(eq(externalWorklogLinks.id, row.id))
        .returning();
      return adopted;
    }
    if (row.userId !== userId) {
      // Another user already owns this email at this hospital — surface as a 409.
      throw new Error("STAMMBLATT_EMAIL_COLLISION");
    }
    // row.userId === userId (shouldn't happen after the first lookup, but safe)
    return row;
  }

  const [created] = await db
    .insert(externalWorklogLinks)
    .values({
      userId,
      hospitalId,
      email,
      token: randomUUID(),
      personalDataOnly: true,
      tokenExpiresAt: expiryFromNow(),
      isActive: true,
    })
    .returning();
  return created;
}

export async function rotateStammblattToken(
  linkId: string,
): Promise<ExternalWorklogLink> {
  const [updated] = await db
    .update(externalWorklogLinks)
    .set({
      token: randomUUID(),
      tokenExpiresAt: expiryFromNow(),
      isActive: true,
      updatedAt: new Date(),
    })
    .where(eq(externalWorklogLinks.id, linkId))
    .returning();
  return updated;
}

export async function markSubmittedIfComplete(
  linkId: string,
): Promise<ExternalWorklogLink> {
  const [link] = await db
    .select()
    .from(externalWorklogLinks)
    .where(eq(externalWorklogLinks.id, linkId))
    .limit(1);
  if (!link) throw new Error(`Link ${linkId} not found`);
  if (link.submittedAt) return link;

  const allPresent = REQUIRED_FIELDS.every((f) => {
    const v = (link as any)[f];
    return v !== null && v !== undefined && v !== "";
  });
  if (!allPresent) return link;

  const [updated] = await db
    .update(externalWorklogLinks)
    .set({ submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(externalWorklogLinks.id, linkId))
    .returning();
  return updated;
}
