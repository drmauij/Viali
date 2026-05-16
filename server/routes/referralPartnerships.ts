import { Router } from "express";
import { db } from "../db";
import { referralPartnerships, hospitals as hospitalsTable } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  getDestinationAvailability,
  listPartnerships,
  generatePartnershipCode,
  redeemPartnershipCode,
  approvePartnership,
  rejectPartnership,
  revokePartnership,
} from "../storage/praxisMode";

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

// --- Partner management endpoints ---

referralPartnershipsRouter.get("/api/referral-partnerships", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  return res.json(await listPartnerships(ctx.hospitalId));
});

referralPartnershipsRouter.post("/api/referral-partnerships/codes", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  const code = await generatePartnershipCode(ctx.hospitalId);
  return res.json({ code });
});

referralPartnershipsRouter.post("/api/referral-partnerships/redeem", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    const pair = await redeemPartnershipCode({ sourceHospitalId: ctx.hospitalId, code: String(req.body?.code ?? "") });
    return res.json(pair);
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/approve", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    await approvePartnership({ partnershipId: req.params.id, approverDestinationId: ctx.hospitalId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/reject", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  try {
    await rejectPartnership({ partnershipId: req.params.id, approverDestinationId: ctx.hospitalId });
    return res.json({ ok: true });
  } catch (err: any) {
    return res.status(403).json({ error: err.message });
  }
});

referralPartnershipsRouter.post("/api/referral-partnerships/:id/revoke", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  await revokePartnership({ partnershipId: req.params.id, actor: "source" });
  return res.json({ ok: true });
});

// Destination side — list incoming pending partnership requests
referralPartnershipsRouter.get("/api/referral-partnerships/incoming", async (req: any, res) => {
  const ctx = getCtx(req);
  if (!ctx.hospitalId) return res.status(401).json({ error: "not authenticated" });
  const rows = await db.select({
    id: referralPartnerships.id,
    sourceHospitalId: referralPartnerships.sourceHospitalId,
    pairingSource: referralPartnerships.pairingSource,
    createdAt: referralPartnerships.createdAt,
    sourceName: hospitalsTable.name,
  })
  .from(referralPartnerships)
  .leftJoin(hospitalsTable, eq(referralPartnerships.sourceHospitalId, hospitalsTable.id))
  .where(and(eq(referralPartnerships.destinationHospitalId, ctx.hospitalId), eq(referralPartnerships.status, "pending")));
  return res.json(rows);
});
