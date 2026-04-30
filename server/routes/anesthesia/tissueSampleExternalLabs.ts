// Internal admin-facing routes. NOT part of the public API surface; no PUBLIC_API_MD update is required.
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/google";
import {
  requireWriteAccess,
  requireStrictHospitalAccess,
  userHasGroupAwareHospitalAccess,
} from "../../utils";
import { storage } from "../../storage";
import {
  listTissueSampleLabs,
  getTissueSampleLab,
  createTissueSampleLab,
  updateTissueSampleLab,
  archiveTissueSampleLab,
} from "../../storage/tissueSampleExternalLabs";
import logger from "../../logger";

const router = Router();

const createBody = z.object({
  name: z.string().min(1),
  applicableSampleTypes: z.array(z.string()).nullable().optional(),
  contact: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

const patchBody = z.object({
  name: z.string().min(1).optional(),
  applicableSampleTypes: z.array(z.string()).nullable().optional(),
  contact: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

/**
 * Returns true if the user has admin (or group_admin) at the given hospital
 * (direct role only — admin scope does not bubble across groups for these
 * mutations). Returns true for platform admins as a courtesy: they can see
 * everything elsewhere; gating mutations differently here would surprise them.
 */
async function userIsAdminOfHospital(
  userId: string,
  hospitalId: string,
): Promise<boolean> {
  const list = await storage.getUserHospitals(userId);
  return list.some(
    (h) => h.id === hospitalId && (h.role === "admin" || h.role === "group_admin"),
  );
}

// LIST — scoped to current hospital
router.get(
  "/api/tissue-sample-external-labs",
  isAuthenticated,
  requireStrictHospitalAccess,
  async (req: any, res) => {
    try {
      const hospitalId = req.verifiedHospitalId as string;
      const sampleType =
        typeof req.query.type === "string" && req.query.type.length > 0
          ? (req.query.type as string)
          : undefined;
      const labs = await listTissueSampleLabs(hospitalId, { sampleType });
      res.json(labs);
    } catch (e) {
      logger.error("List tissue sample external labs failed", e);
      res
        .status(500)
        .json({ message: "Failed to list tissue sample external labs" });
    }
  },
);

// GET single
router.get(
  "/api/tissue-sample-external-labs/:id",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const lab = await getTissueSampleLab(req.params.id);
      if (!lab) return res.status(404).json({ message: "Lab not found" });
      const ok = await userHasGroupAwareHospitalAccess(
        req.user.id,
        lab.hospitalId,
        req,
      );
      if (!ok) {
        return res.status(403).json({
          message: "Access denied.",
          code: "RESOURCE_ACCESS_DENIED",
        });
      }
      res.json(lab);
    } catch (e) {
      logger.error("Get tissue sample external lab failed", e);
      res.status(500).json({ message: "Failed to load lab" });
    }
  },
);

// CREATE — admin only
router.post(
  "/api/tissue-sample-external-labs",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const hospitalId = (req.verifiedHospitalId
        ?? req.headers["x-active-hospital-id"]) as string | undefined;
      if (!hospitalId) {
        return res
          .status(400)
          .json({ message: "Hospital context required.", code: "HOSPITAL_ID_REQUIRED" });
      }
      const isAdmin = await userIsAdminOfHospital(req.user.id, hospitalId);
      if (!isAdmin) {
        return res.status(403).json({
          message: "Admin access required.",
          code: "ADMIN_ACCESS_REQUIRED",
        });
      }
      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      // applicableSampleTypes: null/[] both encode "universal".
      const lab = await createTissueSampleLab({
        hospitalId,
        name: parsed.data.name,
        applicableSampleTypes: parsed.data.applicableSampleTypes ?? null,
        contact: parsed.data.contact ?? null,
        isDefault: parsed.data.isDefault ?? false,
        isArchived: false,
      });
      res.status(201).json(lab);
    } catch (e) {
      logger.error("Create tissue sample external lab failed", e);
      res.status(500).json({ message: "Failed to create lab" });
    }
  },
);

// PATCH — admin only, scoped to lab's hospital
router.patch(
  "/api/tissue-sample-external-labs/:id",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const lab = await getTissueSampleLab(req.params.id);
      if (!lab) return res.status(404).json({ message: "Lab not found" });
      const isAdmin = await userIsAdminOfHospital(req.user.id, lab.hospitalId);
      if (!isAdmin) {
        return res.status(403).json({
          message: "Admin access required.",
          code: "ADMIN_ACCESS_REQUIRED",
        });
      }
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const updated = await updateTissueSampleLab(req.params.id, parsed.data);
      res.json(updated);
    } catch (e) {
      logger.error("Update tissue sample external lab failed", e);
      res.status(500).json({ message: "Failed to update lab" });
    }
  },
);

// ARCHIVE — admin only, scoped to lab's hospital
router.post(
  "/api/tissue-sample-external-labs/:id/archive",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const lab = await getTissueSampleLab(req.params.id);
      if (!lab) return res.status(404).json({ message: "Lab not found" });
      const isAdmin = await userIsAdminOfHospital(req.user.id, lab.hospitalId);
      if (!isAdmin) {
        return res.status(403).json({
          message: "Admin access required.",
          code: "ADMIN_ACCESS_REQUIRED",
        });
      }
      const archived = await archiveTissueSampleLab(req.params.id);
      res.json(archived);
    } catch (e) {
      logger.error("Archive tissue sample external lab failed", e);
      res.status(500).json({ message: "Failed to archive lab" });
    }
  },
);

export default router;
