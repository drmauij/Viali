import { and, eq, lt } from "drizzle-orm";
import { createHash } from "crypto";
import { db } from "../db";
import { bookingIdempotencyKeys } from "@shared/schema";

export function hashBookingRequest(body: unknown): string {
  const canonical = JSON.stringify(sortKeysDeep(body ?? {}));
  return createHash("sha256").update(canonical).digest("hex");
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, sortKeysDeep(v)]),
    );
  }
  return value;
}

export async function findIdempotencyRecord(params: {
  hospitalId: string;
  key: string;
}) {
  const rows = await db
    .select()
    .from(bookingIdempotencyKeys)
    .where(
      and(
        eq(bookingIdempotencyKeys.hospitalId, params.hospitalId),
        eq(bookingIdempotencyKeys.key, params.key),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function recordIdempotencyKey(params: {
  hospitalId: string;
  key: string;
  appointmentId: string;
  requestHash: string;
}) {
  await db.insert(bookingIdempotencyKeys).values(params);
}

export async function cleanupExpiredIdempotencyKeys(
  olderThan: Date = new Date(Date.now() - 24 * 60 * 60 * 1000),
) {
  await db
    .delete(bookingIdempotencyKeys)
    .where(lt(bookingIdempotencyKeys.createdAt, olderThan));
}
