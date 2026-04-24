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
//
// IMPORTANT: we MUST scope the middleware to this router's own paths. Without
// a path prefix, `router.use(fn)` runs `fn` on every request that reaches
// the app (this router is `app.use(adminGroupsRouter)`-mounted at root), which
// would 401 public endpoints like `/api/public/group-booking/:token` and the
// unauthenticated SPA root.
router.use(["/api/admin/groups", "/api/admin/hospitals"], isAuthenticated);
router.use(
  ["/api/admin/groups", "/api/admin/hospitals"],
  requirePlatformAdmin,
);

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
    const { group, skippedHospitalIds } = await groupStorage.createGroup(
      parsed.data.name,
      parsed.data.hospitalIds,
    );
    // Flatten group fields so existing callers (tests, UI) keep their shape,
    // while surfacing which IDs were silently skipped (already in another
    // group) to the platform admin.
    res.status(201).json({ ...group, skippedHospitalIds });
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

// Group billing defaults (platform admin only).
const licenseEnum = z.enum(["free", "basic", "test"]);
const priceSchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v.toFixed(2) : v))
  .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), "Must be a non-negative decimal");
const groupBillingSchema = z
  .object({
    defaultLicenseType: licenseEnum.nullable().optional(),
    defaultPricePerRecord: priceSchema.nullable().optional(),
  })
  .refine(
    (v) =>
      v.defaultLicenseType !== undefined ||
      v.defaultPricePerRecord !== undefined,
    "Body must include at least one of defaultLicenseType or defaultPricePerRecord",
  );
router.patch("/api/admin/groups/:id/billing", async (req, res) => {
  const parsed = groupBillingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await groupStorage.updateGroupBillingDefaults(
      req.params.id,
      parsed.data,
    );
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  } catch (err) {
    logger.error("Error updating group billing defaults:", err);
    res.status(500).json({ message: "Failed to update group billing" });
  }
});

// Cascade group defaults to every member hospital's licenseType + pricePerRecord.
// Null group defaults leave the corresponding clinic field untouched.
router.post("/api/admin/groups/:id/cascade-billing", async (req, res) => {
  try {
    const updatedCount = await groupStorage.cascadeGroupBillingDefaults(
      req.params.id,
    );
    res.json({ updatedCount });
  } catch (err: any) {
    if (err?.message === "Group not found") {
      return res.status(404).json({ error: err.message });
    }
    logger.error("Error cascading group billing:", err);
    res.status(500).json({ message: "Failed to cascade billing" });
  }
});

// Per-clinic billing update (platform admin only — same auth gate as the rest
// of this router). Accepts licenseType and/or pricePerRecord.
const hospitalBillingSchema = z
  .object({
    licenseType: licenseEnum.optional(),
    pricePerRecord: priceSchema.nullable().optional(),
  })
  .refine(
    (v) =>
      v.licenseType !== undefined || v.pricePerRecord !== undefined,
    "Body must include at least one of licenseType or pricePerRecord",
  );
router.patch("/api/admin/hospitals/:hospitalId/billing", async (req, res) => {
  const parsed = hospitalBillingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await groupStorage.updateHospitalBilling(
      req.params.hospitalId,
      parsed.data,
    );
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json(updated);
  } catch (err) {
    logger.error("Error updating hospital billing:", err);
    res.status(500).json({ message: "Failed to update hospital billing" });
  }
});

// Search users for promotion to group_admin. Email prefix match, annotated
// with each candidate's existing roles at hospitals in this group so the UI
// can present one-click promote buttons per eligible hospital.
router.get("/api/admin/groups/:id/user-search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (q.length < 2) {
    return res.json([]); // keep short queries quiet
  }
  try {
    const rows = await groupStorage.searchUsersForGroupPromotion(
      req.params.id,
      q,
      10,
    );
    res.json(rows);
  } catch (err) {
    logger.error("Error searching users for promotion:", err);
    res.status(500).json({ message: "Search failed" });
  }
});

// Logo upload. The client posts a data URL (image/* base64) — we store it
// as-is, same pattern as hospitals.companyLogoUrl. Pass null to clear.
// Cap at 2 MB of base64 (~1.5 MB raw image) for safety; the Settings page
// compresses to 400×400 JPEG before upload which is typically <100 KB.
const logoSchema = z.object({
  logoUrl: z
    .string()
    .max(2 * 1024 * 1024, "Logo too large (max 2 MB as data URL)")
    .nullable(),
});

router.patch("/api/admin/groups/:id/logo", async (req, res) => {
  const parsed = logoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await groupStorage.updateGroupLogo(
      req.params.id,
      parsed.data.logoUrl,
    );
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json({ logoUrl: updated.logoUrl });
  } catch (err) {
    logger.error("Error updating group logo:", err);
    res.status(500).json({ message: "Failed to update group logo" });
  }
});

router.patch("/api/admin/hospitals/:hospitalId/logo", async (req, res) => {
  const parsed = logoSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  try {
    const updated = await groupStorage.updateHospitalLogo(
      req.params.hospitalId,
      parsed.data.logoUrl,
    );
    if (!updated) return res.status(404).json({ error: "not found" });
    res.json({ companyLogoUrl: updated.companyLogoUrl });
  } catch (err) {
    logger.error("Error updating hospital logo:", err);
    res.status(500).json({ message: "Failed to update hospital logo" });
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
      // Count BEFORE the update so we can include the warning on success.
      // The update itself verifies membership (hospital must belong to
      // this specific group) and returns false otherwise — we 404 rather
      // than silently orphan a hospital that sits in a different group.
      const homeCount = await groupStorage.countHomePatientsForHospital(
        req.params.hospitalId,
      );
      const removed = await groupStorage.removeHospitalFromGroup(
        req.params.id,
        req.params.hospitalId,
      );
      if (!removed) {
        return res
          .status(404)
          .json({ error: "Hospital is not a member of this group" });
      }
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
