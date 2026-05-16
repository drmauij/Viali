// server/routes/praxisMode.ts
// Praxis Mode — source-side and praxis-specific endpoints.
import { Router } from "express";
import type { Response } from "express";
import { db } from "../db";
import { surgeries } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

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
