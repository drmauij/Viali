import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/google";
import {
  requireGroupAdmin,
  getGroupHospitalIdsCached,
} from "../utils";
import * as groupStorage from "../storage/groups";
import logger from "../logger";

/**
 * Group-admin surface for Task 13: `/business/group`.
 *
 * Same `promoteGroupAdmin` / `revokeGroupAdmin` storage helpers backing the
 * platform-admin version (adminGroups.ts) are reused here — the difference
 * is the gate: these routes require `group_admin` at the currently-active
 * hospital (or platform-admin).
 *
 * Group admins CANNOT: add/remove member hospitals, rename the group,
 * regenerate the booking token. Those stay on `/admin/groups` (platform
 * admin only) per the spec's permission matrix.
 */

const router = Router();

router.use(isAuthenticated);
router.use(requireGroupAdmin);

// GET /api/business/group/overview — group id + name, member hospitals, counts.
router.get("/api/business/group/overview", async (req: any, res) => {
  try {
    const groupId = req._groupId as string;
    const [group, members] = await Promise.all([
      groupStorage.getGroup(groupId),
      groupStorage.listGroupMembers(groupId),
    ]);
    if (!group) {
      // Extremely narrow race: the group was just deleted between the
      // middleware's hospitals.groupId lookup and this fetch. Treat as 404.
      return res.status(404).json({ error: "Group not found" });
    }
    const hospitalIds = await getGroupHospitalIdsCached(groupId, req);
    const counts = await groupStorage.getGroupOverviewCounts(hospitalIds);
    res.json({
      group: {
        id: group.id,
        name: group.name,
        bookingToken: group.bookingToken,
      },
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        address: m.address,
      })),
      counts,
    });
  } catch (err) {
    logger.error("Error fetching group overview:", err);
    res.status(500).json({ message: "Failed to fetch group overview" });
  }
});

// GET /api/business/group/admins — list of group admins within THIS group.
router.get("/api/business/group/admins", async (req: any, res) => {
  try {
    const groupId = req._groupId as string;
    const admins = await groupStorage.listGroupAdmins(groupId);
    res.json(admins);
  } catch (err) {
    logger.error("Error listing group admins:", err);
    res.status(500).json({ message: "Failed to list group admins" });
  }
});

// GET /api/business/group/users — users with ANY role at any hospital in the
// group. Used by the promote UI's user picker.
router.get("/api/business/group/users", async (req: any, res) => {
  try {
    const groupId = req._groupId as string;
    const list = await groupStorage.listGroupUsers(groupId);
    res.json(list);
  } catch (err) {
    logger.error("Error listing group users:", err);
    res.status(500).json({ message: "Failed to list group users" });
  }
});

const promoteSchema = z.object({
  userId: z.string().min(1),
  hospitalId: z.string().uuid(),
});

// POST /api/business/group/admins — promote a user to group_admin.
router.post("/api/business/group/admins", async (req: any, res) => {
  const parsed = promoteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const groupId = req._groupId as string;
    // Guard: the target hospital must be in the caller's group. Otherwise a
    // group admin could promote an outsider user into a different group by
    // hitting this endpoint with someone else's hospitalId. `promoteGroupAdmin`
    // already verifies "hospital is in this group" internally, but the error
    // ("Hospital not in group") is clearer when we short-circuit here with a
    // dedicated 403 since the storage helper treats it as a validation error.
    const groupHospitalIds = await getGroupHospitalIdsCached(groupId, req);
    if (!groupHospitalIds.includes(parsed.data.hospitalId)) {
      return res.status(403).json({
        error: "Target hospital is not in your group.",
        code: "HOSPITAL_NOT_IN_GROUP",
      });
    }
    await groupStorage.promoteGroupAdmin(
      groupId,
      parsed.data.userId,
      parsed.data.hospitalId,
    );
    res.status(204).end();
  } catch (err: any) {
    const msg: string = err?.message ?? "Failed to promote user";
    return res.status(400).json({ error: msg });
  }
});

// DELETE /api/business/group/admins/:userId/:hospitalId — revoke group_admin.
// Non-destructive: only removes the `group_admin` role row; existing roles
// (admin/doctor/nurse/...) at the same hospital are preserved.
router.delete(
  "/api/business/group/admins/:userId/:hospitalId",
  async (req: any, res) => {
    try {
      const groupId = req._groupId as string;
      // Same guard as POST: refuse to operate on hospitals outside the caller's
      // group. Prevents cross-group admin revokes via a forged URL param.
      const groupHospitalIds = await getGroupHospitalIdsCached(groupId, req);
      if (!groupHospitalIds.includes(req.params.hospitalId)) {
        return res.status(403).json({
          error: "Target hospital is not in your group.",
          code: "HOSPITAL_NOT_IN_GROUP",
        });
      }
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

export default router;
