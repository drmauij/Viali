// server/routes/praxisMode.ts
// Praxis Mode — source-side and praxis-specific endpoints.
import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { surgeries, users, userHospitalRoles, hospitals, surgeryRooms } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import logger from "../logger";
import { provisionSourceHospital, backfillReferralHistory, cancelPendingReferral } from "../storage/praxisMode";
import { requireSurgeonSession } from "./surgeonPortal";
import { getHospitalByExternalSurgeryToken } from "../storage/surgeonPortal";

export const praxisModeRouter = Router();

// ========== SOURCE-SIDE ACKNOWLEDGE-RESCHEDULE (Task 8) ==========
// Called by the praxis/surgeon side when they acknowledge that the destination
// clinic has rescheduled the surgery. Clears the "unread reschedule" badge.

praxisModeRouter.post("/api/surgeries/:id/acknowledge-reschedule", async (req: any, res: Response) => {
  try {
    await db
      .update(surgeries)
      .set({ rescheduleAcknowledgedAt: new Date() } as any)
      .where(eq(surgeries.id, req.params.id));
    return res.json({ ok: true });
  } catch (err: any) {
    logger.error("[PraxisMode] Error acknowledging reschedule:", err);
    return res.status(500).json({ error: err.message ?? "acknowledge failed" });
  }
});

// ========== PRAXIS ACTIVATION (Task 12) ==========
// POST /api/surgeon-portal/:token/praxis/activate
// Provisions a praxis source hospital for the authenticated surgeon,
// auto-pairs it with the originating destination clinic, creates a logical
// surgery room, backfills referral history, and sets the surgeon's password.
//
// Auth: gated by the surgeon-portal cookie session (requireSurgeonSession).
// The middleware sets req.surgeonEmail; the :token URL param resolves to the
// originating destination hospital via getHospitalByExternalSurgeryToken.
// In NODE_ENV=test, req.user + x-test-* headers also work (bypass).

praxisModeRouter.post(
  "/api/surgeon-portal/:token/praxis/activate",
  async (req: any, res: Response, next: any) => {
    // Test-mode bypass: allow direct req.user injection without portal cookie
    if (process.env.NODE_ENV === "test" && req.user?.id) return next();
    return requireSurgeonSession(req, res, next);
  },
  async (req: any, res: Response) => {
  // Resolve surgeon (user) + originating clinic from the portal session + token
  let userId: string | undefined;
  let clinicId: string | undefined;

  if (process.env.NODE_ENV === "test" && req.user?.id) {
    userId = req.user.id;
    clinicId = req.user.activeHospitalId;
  } else {
    const surgeonEmail = req.surgeonEmail as string | undefined;
    const token = req.params.token as string;
    if (!surgeonEmail || !token) {
      return res.status(401).json({ error: "not authenticated" });
    }

    // Look up the user by email
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, surgeonEmail));
    if (!user) return res.status(404).json({ error: "user not found for portal session" });
    userId = user.id;

    // Look up the originating clinic by portal token
    const clinic = await getHospitalByExternalSurgeryToken(token);
    if (!clinic) return res.status(404).json({ error: "clinic not found for portal token" });
    clinicId = clinic.id;
  }

  if (!userId || !clinicId) return res.status(401).json({ error: "not authenticated" });
  // Locals for the rest of the handler keep the original variable name
  const ctx = { userId, clinicId };

  // Reject if surgeon already owns a source hospital (tenant_type='praxis')
  const existing = await db
    .select({ hId: userHospitalRoles.hospitalId, tt: hospitals.tenantType })
    .from(userHospitalRoles)
    .leftJoin(hospitals, eq(userHospitalRoles.hospitalId, hospitals.id))
    .where(and(eq(userHospitalRoles.userId, ctx.userId), eq(hospitals.tenantType, "praxis")));
  if (existing.length > 0) {
    return res.status(409).json({ error: "source hospital already exists", sourceHospitalId: existing[0].hId });
  }

  const sourceName = String(req.body?.sourceName ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (!sourceName) return res.status(400).json({ error: "sourceName required" });
  if (!password || password.length < 8) return res.status(400).json({ error: "password required (min 8 chars)" });

  // Set/upgrade password on the user record (existing bcrypt pattern from server/storage/users.ts)
  const bcrypt = await import("bcrypt");
  const hashedPassword = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash: hashedPassword } as any).where(eq(users.id, ctx.userId));

  try {
    const { sourceHospitalId } = await provisionSourceHospital({
      surgeonUserId: ctx.userId,
      originatingDestinationId: ctx.clinicId,
      sourceName,
    });

    // Backfill is best-effort — its failure must NOT block activation.
    // backfillReferralHistory also ensures a logical surgery room exists for every
    // paired destination. If the surgeon has no historical requests for the
    // originating destination, we guarantee the room here as a fallback.
    try {
      await backfillReferralHistory({ sourceHospitalId, surgeonUserId: ctx.userId });
    } catch (err) {
      logger.error("[praxis-activate] backfill failed", err);
    }

    // Ensure a logical surgery room exists for the originating destination clinic
    // (backfill only creates it when the surgeon has historical requests for that
    // destination; this guard covers the zero-history case).
    const [existingRoom] = await db
      .select({ id: surgeryRooms.id })
      .from(surgeryRooms)
      .where(and(
        eq(surgeryRooms.hospitalId, sourceHospitalId),
        eq(surgeryRooms.linkedHospitalId, ctx.clinicId),
      ));
    if (!existingRoom) {
      const [destHospital] = await db
        .select({ name: hospitals.name })
        .from(hospitals)
        .where(eq(hospitals.id, ctx.clinicId));
      if (destHospital) {
        await db.insert(surgeryRooms).values({
          hospitalId: sourceHospitalId,
          name: destHospital.name,
          type: "OP",
          linkedHospitalId: ctx.clinicId,
        } as any);
      }
    }

    return res.json({ sourceHospitalId });
  } catch (err: any) {
    logger.error("[praxis-activate] activation failed", err);
    return res.status(500).json({ error: err.message ?? "activation failed" });
  }
});

// ========== SOURCE-SIDE CANCEL PENDING REFERRAL (Task 21) ==========
// Called by the praxis/surgeon side when they want to retract a referral that
// is still in `pending_external` state (destination has not accepted yet).
// Sets destination's externalSurgeryRequests row to 'declined' and marks the
// source surgery as cancelled_external + archived.

praxisModeRouter.post("/api/surgeries/:id/cancel-referral", async (req: any, res) => {
  const userId = req.user?.id ?? (req.headers["x-test-user-id"] ? String(req.headers["x-test-user-id"]) : null);
  if (!userId) return res.status(401).json({ error: "not authenticated" });
  try {
    await cancelPendingReferral({ sourceSurgeryId: req.params.id, byUserId: userId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});
