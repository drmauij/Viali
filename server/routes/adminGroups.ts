import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/google";
import { requirePlatformAdmin } from "../utils/accessControl";
import * as groupStorage from "../storage/groups";
import logger from "../logger";

const router = Router();

// Every route on this router is platform-admin only. Mount order matters:
// isAuthenticated first (101 -> req.user populated), then requirePlatformAdmin
// (checks users.is_platform_admin for req.user.id). Cross-tenant operations —
// deliberately no X-Active-Hospital-Id requirement.
router.use(isAuthenticated);
router.use(requirePlatformAdmin);

router.get("/api/admin/groups", async (_req, res) => {
  try {
    res.json(await groupStorage.listGroups());
  } catch (err) {
    logger.error("Error listing groups:", err);
    res.status(500).json({ message: "Failed to list groups" });
  }
});

const createSchema = z.object({
  name: z.string().min(1).max(255),
  hospitalIds: z.array(z.string().uuid()).default([]),
});

router.post("/api/admin/groups", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const group = await groupStorage.createGroup(
      parsed.data.name,
      parsed.data.hospitalIds,
    );
    res.status(201).json(group);
  } catch (err) {
    logger.error("Error creating group:", err);
    res.status(500).json({ message: "Failed to create group" });
  }
});

router.get("/api/admin/groups/:id", async (req, res) => {
  try {
    const group = await groupStorage.getGroup(req.params.id);
    if (!group) return res.status(404).json({ error: "not found" });
    const [members, admins] = await Promise.all([
      groupStorage.listGroupMembers(req.params.id),
      groupStorage.listGroupAdmins(req.params.id),
    ]);
    res.json({ group, members, admins });
  } catch (err) {
    logger.error("Error fetching group:", err);
    res.status(500).json({ message: "Failed to fetch group" });
  }
});

const renameSchema = z.object({ name: z.string().min(1).max(255) });
router.patch("/api/admin/groups/:id", async (req, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await groupStorage.renameGroup(
      req.params.id,
      parsed.data.name,
    );
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  } catch (err) {
    logger.error("Error renaming group:", err);
    res.status(500).json({ message: "Failed to rename group" });
  }
});

router.delete("/api/admin/groups/:id", async (req, res) => {
  try {
    await groupStorage.deleteGroup(req.params.id);
    res.status(204).end();
  } catch (err: any) {
    // deleteGroup throws readable errors when refusing.
    const msg: string = err?.message ?? "Failed to delete group";
    if (
      msg.includes("member hospitals") ||
      msg.includes("services")
    ) {
      return res.status(409).json({ error: msg });
    }
    logger.error("Error deleting group:", err);
    res.status(500).json({ message: msg });
  }
});

const memberSchema = z.object({ hospitalId: z.string().uuid() });

router.post("/api/admin/groups/:id/members", async (req, res) => {
  const parsed = memberSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    await groupStorage.addHospitalToGroup(
      req.params.id,
      parsed.data.hospitalId,
    );
    res.status(204).end();
  } catch (err: any) {
    const msg: string = err?.message ?? "Failed to add hospital";
    // "Hospital not found" / "Hospital already in another group" are user errors.
    return res.status(400).json({ error: msg });
  }
});

router.delete(
  "/api/admin/groups/:id/members/:hospitalId",
  async (req, res) => {
    try {
      const homeCount = await groupStorage.countHomePatientsForHospital(
        req.params.hospitalId,
      );
      await groupStorage.removeHospitalFromGroup(req.params.hospitalId);
      if (homeCount > 0) {
        // Degraded state: those patients lose cross-group visibility. Phase 1
        // accepts it and surfaces a warning so the platform admin can act.
        return res.status(200).json({
          warning: `${homeCount} patient(s) still call this hospital home; they lose cross-group visibility.`,
          homePatientCount: homeCount,
        });
      }
      res.status(204).end();
    } catch (err) {
      logger.error("Error removing hospital from group:", err);
      res.status(500).json({ message: "Failed to remove hospital" });
    }
  },
);

const promoteSchema = z.object({
  userId: z.string().min(1),
  hospitalId: z.string().uuid(),
});

router.post("/api/admin/groups/:id/admins", async (req, res) => {
  const parsed = promoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    await groupStorage.promoteGroupAdmin(
      req.params.id,
      parsed.data.userId,
      parsed.data.hospitalId,
    );
    res.status(204).end();
  } catch (err: any) {
    const msg: string = err?.message ?? "Failed to promote user";
    return res.status(400).json({ error: msg });
  }
});

router.delete(
  "/api/admin/groups/:id/admins/:userId/:hospitalId",
  async (req, res) => {
    try {
      await groupStorage.revokeGroupAdmin(
        req.params.userId,
        req.params.hospitalId,
      );
      res.status(204).end();
    } catch (err) {
      logger.error("Error revoking group admin:", err);
      res.status(500).json({ message: "Failed to revoke group admin" });
    }
  },
);

router.post("/api/admin/groups/:id/booking-token", async (req, res) => {
  try {
    const token = await groupStorage.regenerateGroupBookingToken(
      req.params.id,
    );
    res.json({ bookingToken: token });
  } catch (err) {
    logger.error("Error regenerating group booking token:", err);
    res.status(500).json({ message: "Failed to regenerate token" });
  }
});

// Used by the group management UI to list un-grouped hospitals for the
// picker. Deliberately separate from /api/admin/:hospitalId/* (which is
// hospital-admin scoped). Cross-tenant, platform-admin only.
router.get("/api/admin/hospitals", async (_req, res) => {
  try {
    res.json(await groupStorage.listAllHospitalsWithGroup());
  } catch (err) {
    logger.error("Error listing hospitals:", err);
    res.status(500).json({ message: "Failed to list hospitals" });
  }
});

export default router;
