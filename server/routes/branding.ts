import { Router } from "express";
import type { Response, NextFunction } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { hospitalGroups, hospitals, users } from "@shared/schema";
import { isAuthenticated } from "../auth/google";
import { userIsGroupAdminForHospital, getGroupHospitalIdsCached } from "../utils";
import logger from "../logger";
import { extractThemeFromUrl } from "../services/brandingExtractor";

/**
 * Booking-theme save endpoints. Spec:
 *   docs/superpowers/specs/2026-04-26-booking-page-theming-design.md
 *
 *   PATCH /api/branding/group/:id      → group admin (or platform admin)
 *   PATCH /api/branding/hospital/:id   → hospital admin (or platform admin)
 *                                        AND target hospital must NOT belong
 *                                        to a chain — chain themes are managed
 *                                        from /api/branding/group/:id only.
 *
 * Auth differs from `requireGroupAdmin` / `requireHospitalAdmin` in
 * `server/utils/accessControl.ts`: those resolve the target via the
 * `X-Active-Hospital-Id` header. Here the target is in the URL params, so we
 * authorize against the URL id directly.
 */

const router = Router();

// Hex colour: 3- or 6-character form (e.g. #fff or #ffffff). Anchored.
const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// Body schema: every field nullable so the UI can clear individual values.
// Font names capped at 60 chars to keep the rendered <link> URL bounded.
const themeSchema = z.object({
  bgColor: z.string().regex(HEX_RE).nullable(),
  primaryColor: z.string().regex(HEX_RE).nullable(),
  secondaryColor: z.string().regex(HEX_RE).nullable(),
  headingFont: z.string().min(1).max(60).nullable(),
  bodyFont: z.string().min(1).max(60).nullable(),
});

async function isPlatformAdmin(userId: string): Promise<boolean> {
  const [u] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, userId));
  return u?.isPlatformAdmin === true;
}

router.patch(
  "/api/branding/group/:id",
  isAuthenticated,
  async (req: any, res: Response, _next: NextFunction) => {
    try {
      const userId = req.user?.id as string;
      const groupId = req.params.id;

      // Confirm the group exists before doing auth work — avoids leaking
      // membership info via differing 403/404 timings, but more importantly
      // saves a needless permission probe.
      const [group] = await db
        .select({ id: hospitalGroups.id })
        .from(hospitalGroups)
        .where(eq(hospitalGroups.id, groupId));
      if (!group) {
        return res.status(404).json({ error: "Group not found" });
      }

      // Authorisation: platform admin OR group_admin at any hospital in the
      // target group.
      let authorised = await isPlatformAdmin(userId);
      if (!authorised) {
        const groupHospitalIds = await getGroupHospitalIdsCached(groupId, req);
        if (groupHospitalIds.length > 0) {
          // userIsGroupAdminForHospital cross-walks via group, so any member
          // hospital is a valid probe target.
          authorised = await userIsGroupAdminForHospital(
            userId,
            groupHospitalIds[0],
            req,
          );
        }
      }
      if (!authorised) {
        return res.status(403).json({
          error: "Group admin access required",
          code: "GROUP_ADMIN_REQUIRED",
        });
      }

      const parsed = themeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid theme",
          details: parsed.error.flatten(),
        });
      }

      await db
        .update(hospitalGroups)
        .set({ bookingTheme: parsed.data, updatedAt: new Date() })
        .where(eq(hospitalGroups.id, groupId));

      res.json({ ok: true, bookingTheme: parsed.data });
    } catch (err) {
      logger.error("Error saving group booking theme:", err);
      res.status(500).json({ message: "Failed to save group booking theme" });
    }
  },
);

router.patch(
  "/api/branding/hospital/:id",
  isAuthenticated,
  async (req: any, res: Response, _next: NextFunction) => {
    try {
      const userId = req.user?.id as string;
      const hospitalId = req.params.id;

      const [h] = await db
        .select({ id: hospitals.id, groupId: hospitals.groupId })
        .from(hospitals)
        .where(eq(hospitals.id, hospitalId));
      if (!h) {
        return res.status(404).json({ error: "Hospital not found" });
      }

      // Reject early if hospital belongs to a chain — chain admin owns the
      // theme via /api/branding/group/:id, and the public booking endpoint
      // ignores the per-hospital theme for grouped hospitals (see Task 2).
      // Saving here would silently no-op; surface that explicitly.
      if (h.groupId) {
        return res.status(403).json({
          error:
            "Booking theme for chain member hospitals is managed by chain admin",
          code: "MANAGED_BY_CHAIN_ADMIN",
        });
      }

      // Authorisation: platform admin OR `admin` role at this hospital.
      let authorised = await isPlatformAdmin(userId);
      if (!authorised) {
        const userHospitals = await storage.getUserHospitals(userId);
        authorised = userHospitals.some(
          (uh) => uh.id === hospitalId && uh.role === "admin",
        );
      }
      if (!authorised) {
        return res.status(403).json({
          error: "Hospital admin access required",
          code: "HOSPITAL_ADMIN_REQUIRED",
        });
      }

      const parsed = themeSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Invalid theme",
          details: parsed.error.flatten(),
        });
      }

      await db
        .update(hospitals)
        .set({ bookingTheme: parsed.data })
        .where(eq(hospitals.id, hospitalId));

      res.json({ ok: true, bookingTheme: parsed.data });
    } catch (err) {
      logger.error("Error saving hospital booking theme:", err);
      res.status(500).json({ message: "Failed to save hospital booking theme" });
    }
  },
);

// Naive in-memory rate limit: 5 calls per user per hour. Fine for a single
// process; if we ever scale to multiple workers this needs a shared store.
const rateBuckets = new Map<string, number[]>();
function rateLimit(key: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (bucket.length >= 5) return false;
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

router.post(
  "/api/branding/extract-from-url",
  isAuthenticated,
  async (req: any, res: Response) => {
    const url = z.string().url().max(2048).safeParse(req.body?.url);
    if (!url.success) return res.status(400).json({ error: "invalid url" });

    if (!rateLimit((req as any).user?.id ?? "anon")) {
      return res
        .status(429)
        .json({ error: "Too many extractions; try again in an hour." });
    }

    try {
      const result = await extractThemeFromUrl(url.data);
      res.json(result);
    } catch (err: any) {
      logger.warn(
        { err: err?.message, url: url.data },
        "branding extract failed",
      );
      res.status(502).json({
        error:
          "Couldn't load that page. Try a direct URL or fill the fields manually.",
      });
    }
  },
);

export default router;
