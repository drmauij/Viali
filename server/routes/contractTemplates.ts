import { Router, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import { db } from "../db";
import { hospitals } from "@shared/schema";
import { eq } from "drizzle-orm";
import * as contractTemplatesStorage from "../storage/contractTemplatesStorage";
import type { InsertContractTemplate, ContractTemplate } from "@shared/schema";
import logger from "../logger";

// ---------------------------------------------------------------------------
// Ownership helpers — exported so contractInstances.ts can reuse them
// ---------------------------------------------------------------------------

/**
 * Returns true when `hospitalId` is allowed to access `template`.
 * Allowed when the template is directly owned by that hospital, OR when the
 * template is owned by the chain that hospital belongs to.
 */
export async function assertHospitalCanAccessTemplate(
  template: ContractTemplate,
  hospitalId: string,
): Promise<boolean> {
  if (template.ownerHospitalId === hospitalId) return true;
  if (!template.ownerChainId) return false;
  const [hospital] = await db
    .select({ groupId: hospitals.groupId })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));
  return !!hospital && hospital.groupId === template.ownerChainId;
}

/**
 * Returns true when `groupId` is allowed to access `template`.
 * Allowed only when the template is directly owned by that chain.
 */
export function assertChainCanAccessTemplate(
  template: ContractTemplate,
  groupId: string,
): boolean {
  return template.ownerChainId === groupId;
}

const router = Router();

// ---------------------------------------------------------------------------
// Auth middleware helpers (local — mirror the pattern in business.ts)
// ---------------------------------------------------------------------------

/** Hospital-level gate: user must have admin/manager/group_admin at the target hospital. */
async function isBusinessManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user?.id;
    const { hospitalId } = req.params;
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(
      (h) =>
        h.id === hospitalId &&
        (h.role === "admin" || h.role === "manager" || h.role === "group_admin"),
    );
    if (!hasAccess) {
      return res.status(403).json({ message: "Business manager access required" });
    }
    next();
  } catch (error) {
    logger.error("Error checking business manager access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

/**
 * Chain-admin gate for /api/chain/:groupId/* routes.
 * Platform admins bypass. Otherwise: user must have group_admin role on a
 * hospital that belongs to the target group.
 * TODO: tighten with a dedicated isChainAdmin export once one exists project-wide.
 */
async function isChainAdmin(req: any, res: Response, next: any) {
  try {
    const userId = req.user?.id;
    const { groupId } = req.params;

    const user = await storage.getUser(userId);
    if ((user as any)?.isPlatformAdmin) return next();

    const groupHospitals = await db
      .select({ id: hospitals.id })
      .from(hospitals)
      .where(eq(hospitals.groupId, groupId));
    if (groupHospitals.length === 0) {
      return res.status(404).json({ message: "Group not found or empty" });
    }
    const groupHospitalIds = groupHospitals.map((h) => h.id);

    const userRoles = await storage.getUserHospitals(userId);
    const hasGroupAdmin = userRoles.some(
      (r) => r.role === "group_admin" && groupHospitalIds.includes(r.id),
    );
    if (!hasGroupAdmin) {
      return res.status(403).json({ message: "Chain admin access required" });
    }
    next();
  } catch (error) {
    logger.error("Error checking chain admin access:", error);
    res.status(500).json({ message: "Failed to verify chain access" });
  }
}

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

const baseInput = z.object({
  name: z.string().min(1),
  description: z.string().nullish(),
  language: z.enum(["de", "en"]).default("de"),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  blocks: z.array(z.any()).default([]),
  variables: z
    .object({
      simple: z.array(z.any()).default([]),
      selectableLists: z.array(z.any()).default([]),
    })
    .default({ simple: [], selectableLists: [] }),
});

// ---------------------------------------------------------------------------
// Hospital-scoped routes  (/api/business/:hospitalId/contract-templates/...)
// ---------------------------------------------------------------------------

// GET — list templates visible to a hospital (its own + its chain's)
router.get(
  "/api/business/:hospitalId/contract-templates",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    try {
      const list = await contractTemplatesStorage.listForHospital(req.params.hospitalId);
      res.json(list);
    } catch (error) {
      logger.error("Error listing contract templates:", error);
      res.status(500).json({ message: "Failed to list contract templates" });
    }
  },
);

// GET — single template (hospital scope)
router.get(
  "/api/business/:hospitalId/contract-templates/:id",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!await assertHospitalCanAccessTemplate(tmpl, req.params.hospitalId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      res.json(tmpl);
    } catch (error) {
      logger.error("Error fetching contract template:", error);
      res.status(500).json({ message: "Failed to fetch contract template" });
    }
  },
);

// POST — create a hospital-owned template (blank)
router.post(
  "/api/business/:hospitalId/contract-templates",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    try {
      const parsed = baseInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const created = await contractTemplatesStorage.create({
        ownerHospitalId: req.params.hospitalId,
        ownerChainId: null,
        ...parsed.data,
      } as InsertContractTemplate);
      res.status(201).json(created);
    } catch (error) {
      logger.error("Error creating contract template:", error);
      res.status(500).json({ message: "Failed to create contract template" });
    }
  },
);

// POST — clone an existing template into a new hospital-owned row
router.post(
  "/api/business/:hospitalId/contract-templates/:id/clone",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    try {
      const source = await contractTemplatesStorage.getById(req.params.id);
      if (!source) return res.status(404).end();
      if (!await assertHospitalCanAccessTemplate(source, req.params.hospitalId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const cloned = await contractTemplatesStorage.cloneInto(
        source,
        { ownerHospitalId: req.params.hospitalId },
        req.body?.name,
      );
      res.status(201).json(cloned);
    } catch (error) {
      logger.error("Error cloning contract template:", error);
      res.status(500).json({ message: "Failed to clone contract template" });
    }
  },
);

// PATCH — update fields (hospital scope)
router.patch(
  "/api/business/:hospitalId/contract-templates/:id",
  isAuthenticated,
  isBusinessManager,
  async (req: any, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!await assertHospitalCanAccessTemplate(tmpl, req.params.hospitalId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const parsed = baseInput.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const updated = await contractTemplatesStorage.update(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      logger.error("Error updating contract template:", error);
      res.status(500).json({ message: "Failed to update contract template" });
    }
  },
);

// POST — archive (hospital scope)
router.post(
  "/api/business/:hospitalId/contract-templates/:id/archive",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!await assertHospitalCanAccessTemplate(tmpl, req.params.hospitalId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      await contractTemplatesStorage.archive(req.params.id);
      res.status(204).end();
    } catch (error) {
      logger.error("Error archiving contract template:", error);
      res.status(500).json({ message: "Failed to archive contract template" });
    }
  },
);

// ---------------------------------------------------------------------------
// Chain-scoped routes  (/api/chain/:groupId/contract-templates/...)
// Note: param is :groupId to match the rest of the chain routes in chain.ts
// ---------------------------------------------------------------------------

// GET — list chain-owned templates
router.get(
  "/api/chain/:groupId/contract-templates",
  isAuthenticated,
  isChainAdmin,
  async (req, res) => {
    try {
      const list = await contractTemplatesStorage.listForChain(req.params.groupId);
      res.json(list);
    } catch (error) {
      logger.error("Error listing chain contract templates:", error);
      res.status(500).json({ message: "Failed to list chain contract templates" });
    }
  },
);

// GET — single template (chain scope)
router.get(
  "/api/chain/:groupId/contract-templates/:id",
  isAuthenticated,
  isChainAdmin,
  async (req, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!assertChainCanAccessTemplate(tmpl, req.params.groupId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      res.json(tmpl);
    } catch (error) {
      logger.error("Error fetching chain contract template:", error);
      res.status(500).json({ message: "Failed to fetch chain contract template" });
    }
  },
);

// POST — create a chain-owned template
router.post(
  "/api/chain/:groupId/contract-templates",
  isAuthenticated,
  isChainAdmin,
  async (req, res) => {
    try {
      const parsed = baseInput.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const created = await contractTemplatesStorage.create({
        ownerChainId: req.params.groupId,
        ownerHospitalId: null,
        ...parsed.data,
      } as InsertContractTemplate);
      res.status(201).json(created);
    } catch (error) {
      logger.error("Error creating chain contract template:", error);
      res.status(500).json({ message: "Failed to create chain contract template" });
    }
  },
);

// POST — clone for chain
router.post(
  "/api/chain/:groupId/contract-templates/:id/clone",
  isAuthenticated,
  isChainAdmin,
  async (req, res) => {
    try {
      const source = await contractTemplatesStorage.getById(req.params.id);
      if (!source) return res.status(404).end();
      if (!assertChainCanAccessTemplate(source, req.params.groupId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const cloned = await contractTemplatesStorage.cloneInto(
        source,
        { ownerChainId: req.params.groupId },
        req.body?.name,
      );
      res.status(201).json(cloned);
    } catch (error) {
      logger.error("Error cloning chain contract template:", error);
      res.status(500).json({ message: "Failed to clone chain contract template" });
    }
  },
);

// PATCH — update fields (chain scope)
router.patch(
  "/api/chain/:groupId/contract-templates/:id",
  isAuthenticated,
  isChainAdmin,
  async (req: any, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!assertChainCanAccessTemplate(tmpl, req.params.groupId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const parsed = baseInput.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
      }
      const updated = await contractTemplatesStorage.update(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      logger.error("Error updating chain contract template:", error);
      res.status(500).json({ message: "Failed to update chain contract template" });
    }
  },
);

// POST — archive (chain scope)
router.post(
  "/api/chain/:groupId/contract-templates/:id/archive",
  isAuthenticated,
  isChainAdmin,
  async (req, res) => {
    try {
      const tmpl = await contractTemplatesStorage.getById(req.params.id);
      if (!tmpl) return res.status(404).end();
      if (!assertChainCanAccessTemplate(tmpl, req.params.groupId)) {
        return res.status(403).json({ error: "forbidden" });
      }
      await contractTemplatesStorage.archive(req.params.id);
      res.status(204).end();
    } catch (error) {
      logger.error("Error archiving chain contract template:", error);
      res.status(500).json({ message: "Failed to archive chain contract template" });
    }
  },
);

export default router;
