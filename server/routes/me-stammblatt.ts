import { Router } from "express";
import { db } from "../db";
import { hospitals, externalWorklogLinks } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth/google";
import logger from "../logger";
import {
  ensureStammblattLink,
  markSubmittedIfComplete,
} from "../services/stammblatt";

const router = Router();

/** Read the active hospital from the X-Active-Hospital-Id header. */
function getActiveHospitalId(req: any): string | null {
  const header = req.headers["x-active-hospital-id"];
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

async function isAddonEnabled(hospitalId: string): Promise<boolean> {
  const [h] = await db
    .select({ flag: hospitals.addonPersonalstammblatt })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);
  return !!h?.flag;
}

/**
 * GET /api/me/stammblatt
 * Returns (or creates) the authenticated user's own Personalstammblatt link
 * for the active hospital. Requires the addonPersonalstammblatt flag.
 */
router.get("/api/me/stammblatt", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const hospitalId = getActiveHospitalId(req);
    if (!hospitalId) return res.status(400).json({ message: "Active hospital required (X-Active-Hospital-Id header)" });

    if (!(await isAddonEnabled(hospitalId))) {
      return res.status(403).json({ message: "Personalstammblatt addon not enabled for this hospital" });
    }

    const link = await ensureStammblattLink(userId, hospitalId);
    res.json(link);
  } catch (e) {
    logger.error("GET /api/me/stammblatt failed", e);
    res.status(500).json({ message: "Failed to load Stammblatt" });
  }
});

/**
 * PATCH /api/me/stammblatt
 * Saves Personalstammblatt fields for the authenticated user's own record.
 * Marks the record submitted once all required minimums are present.
 */
router.patch("/api/me/stammblatt", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const hospitalId = getActiveHospitalId(req);
    if (!hospitalId) return res.status(400).json({ message: "Active hospital required (X-Active-Hospital-Id header)" });

    if (!(await isAddonEnabled(hospitalId))) {
      return res.status(403).json({ message: "Personalstammblatt addon not enabled for this hospital" });
    }

    const link = await ensureStammblattLink(userId, hospitalId);

    const allowed = [
      "firstName",
      "lastName",
      "profession",
      "address",
      "city",
      "zip",
      "dateOfBirth",
      "maritalStatus",
      "nationality",
      "religion",
      "mobile",
      "ahvNumber",
      "hasChildBenefits",
      "numberOfChildren",
      "childBenefitsRecipient",
      "childBenefitsRegistration",
      "hasResidencePermit",
      "residencePermitType",
      "residencePermitValidUntil",
      "residencePermitFrontImage",
      "residencePermitBackImage",
      "bankName",
      "bankAddress",
      "bankAccount",
      "hasOwnVehicle",
    ] as const;

    const patch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (k in req.body) {
        patch[k] = req.body[k] === "" ? null : req.body[k];
      }
    }
    patch.lastAccessedAt = new Date();
    patch.updatedAt = new Date();

    await db
      .update(externalWorklogLinks)
      .set(patch as any)
      .where(eq(externalWorklogLinks.id, link.id));

    const final = await markSubmittedIfComplete(link.id);
    res.json(final);
  } catch (e) {
    logger.error("PATCH /api/me/stammblatt failed", e);
    res.status(500).json({ message: "Failed to save Stammblatt" });
  }
});

export default router;
