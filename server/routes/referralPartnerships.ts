import { Router } from "express";
import { db } from "../db";
import { referralPartnerships } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getDestinationAvailability } from "../storage/praxisMode";

export const referralPartnershipsRouter = Router();

function getCtx(req: any) {
  return { userId: req.user?.id, hospitalId: req.user?.activeHospitalId };
}

referralPartnershipsRouter.get("/api/referral-partnerships/:destinationHospitalId/availability", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });

  const [pair] = await db.select().from(referralPartnerships).where(and(
    eq(referralPartnerships.sourceHospitalId, ctx.hospitalId),
    eq(referralPartnerships.destinationHospitalId, req.params.destinationHospitalId),
    eq(referralPartnerships.status, "active"),
  ));
  if (!pair) return res.status(403).json({ error: "no active partnership" });

  const from = req.query.from ? new Date(String(req.query.from)) : new Date();
  const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + 7 * 24 * 3600 * 1000);

  const windows = await getDestinationAvailability(req.params.destinationHospitalId, from, to);
  return res.json({
    busyWindows: windows.map(w => ({
      start: w.start.toISOString(),
      end: w.end.toISOString(),
      room_id: w.roomId,
      reason: w.reason,
    })),
  });
});
