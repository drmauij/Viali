import "dotenv/config";
import { db } from "../server/db";
import { clinicAppointments, recoveryCases } from "@shared/schema";
import { and, eq, gte, inArray } from "drizzle-orm";
import { enqueueRecoveryCase } from "../server/services/recoveryCases";

export interface BackfillStats {
  scanned: number;
  created: number;
  skipped: number;
}

export async function runBackfill(opts: { daysAgo?: number; hospitalId?: string } = {}): Promise<BackfillStats> {
  const daysAgo = opts.daysAgo ?? 90;
  const cutoff = new Date(Date.now() - daysAgo * 86400_000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const filters = [
    eq(clinicAppointments.appointmentType, "external"),
    inArray(clinicAppointments.status, ["no_show", "cancelled"]),
    gte(clinicAppointments.appointmentDate, cutoffStr),
  ];
  if (opts.hospitalId) filters.push(eq(clinicAppointments.hospitalId, opts.hospitalId));

  const candidates = await db
    .select()
    .from(clinicAppointments)
    .where(and(...filters));

  const stats: BackfillStats = { scanned: candidates.length, created: 0, skipped: 0 };

  for (const appt of candidates) {
    // Skip if a case already exists (the unique appointmentId index would
    // make the insert a no-op anyway, but checking here lets us report
    // accurate `created` vs `skipped` counts).
    const existing = await db
      .select({ id: recoveryCases.id })
      .from(recoveryCases)
      .where(eq(recoveryCases.appointmentId, appt.id))
      .limit(1);
    if (existing.length > 0) {
      stats.skipped += 1;
      continue;
    }

    await enqueueRecoveryCase(appt as any, appt.status as "no_show" | "cancelled", db);
    stats.created += 1;
  }

  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const daysAgo = parseInt(process.env.BACKFILL_DAYS_AGO ?? "90", 10);
  const hospitalId = process.env.BACKFILL_HOSPITAL_ID || undefined;
  runBackfill({ daysAgo, hospitalId })
    .then((s) => {
      console.log(JSON.stringify(s));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
