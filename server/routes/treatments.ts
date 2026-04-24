import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/google";
import { treatmentsStorage } from "../storage/treatments";
import { treatmentItemConfigsStorage } from "../storage/treatmentItemConfigs";
import {
  insertTreatmentSchema,
  insertTreatmentLineSchema,
  insertTreatmentItemConfigSchema,
} from "@shared/schema";

const router = Router();

// Line refinement: each line must have serviceId OR itemId
const lineSchema = insertTreatmentLineSchema
  .omit({ treatmentId: true })
  .refine((l) => !!l.serviceId || !!l.itemId, {
    message: "Each line must reference a service or an item",
  });

const createSchema = insertTreatmentSchema
  .extend({
    lines: z.array(lineSchema).default([]),
    // Accept ISO date strings from JSON bodies; coerce to Date for storage
    performedAt: z.coerce.date(),
  });

const updateSchema = createSchema.partial();

// ==================== CONFIG PALETTE ROUTES ====================
// IMPORTANT: these routes must come BEFORE /:id routes to avoid
// Express matching "configs" as an :id parameter.

// All unique zone tags ever used at this hospital — powers the zone
// autocomplete in TreatmentLineDialog so nurses can reuse zones entered
// in prior treatments (not just the current patient's history).
router.get(
  "/api/treatments/zones",
  isAuthenticated,
  async (req: any, res: Response) => {
    const { hospitalId } = req.query as Record<string, string | undefined>;
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId required" });
    }
    try {
      const zones = await treatmentsStorage.listUniqueZones(hospitalId);
      res.json(zones);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  },
);

router.get(
  "/api/treatments/configs/list",
  isAuthenticated,
  async (req: any, res: Response) => {
    const { hospitalId, unitId } = req.query as Record<
      string,
      string | undefined
    >;
    if (!hospitalId)
      return res.status(400).json({ error: "hospitalId required" });
    try {
      const list = await treatmentItemConfigsStorage.listByHospital(
        hospitalId,
        unitId,
      );
      res.json(list);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  "/api/treatments/configs",
  isAuthenticated,
  async (req: any, res: Response) => {
    const parsed = insertTreatmentItemConfigSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ error: parsed.error.flatten() });
    try {
      const result = await treatmentItemConfigsStorage.upsert(parsed.data);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.delete(
  "/api/treatments/configs/:id",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      await treatmentItemConfigsStorage.remove(req.params.id);
      res.status(204).end();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

// ==================== TREATMENT ACTION ROUTES ====================
// Action routes before /:id GET/PUT/DELETE to avoid conflicts.

router.post(
  "/api/treatments/:id/sign",
  isAuthenticated,
  async (req: any, res: Response) => {
    const { signature } = req.body;
    if (!signature || typeof signature !== "string")
      return res.status(400).json({ error: "signature required" });
    try {
      const t = await treatmentsStorage.sign(
        req.params.id,
        req.user?.id,
        signature,
      );
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  "/api/treatments/:id/amend",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      const t = await treatmentsStorage.amend(req.params.id, req.user?.id);
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  "/api/treatments/:id/invoice-draft",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      const result = await treatmentsStorage.createInvoiceDraft(req.params.id);
      res.status(201).json(result);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

// ==================== TREATMENT CRUD ROUTES ====================

router.get(
  "/api/treatments",
  isAuthenticated,
  async (req: any, res: Response) => {
    const { patientId } = req.query;
    if (!patientId || typeof patientId !== "string")
      return res.status(400).json({ error: "patientId required" });
    try {
      const list = await treatmentsStorage.listByPatient(patientId);
      res.json(list);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.get(
  "/api/treatments/:id",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      const t = await treatmentsStorage.getById(req.params.id);
      if (!t) return res.status(404).json({ error: "Not found" });
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.post(
  "/api/treatments",
  isAuthenticated,
  async (req: any, res: Response) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ error: parsed.error.flatten() });
    try {
      const { lines, ...header } = parsed.data;
      const t = await treatmentsStorage.create({
        ...header,
        lines: lines as any,
      });
      res.status(201).json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.put(
  "/api/treatments/:id",
  isAuthenticated,
  async (req: any, res: Response) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ error: parsed.error.flatten() });
    try {
      const { lines, ...header } = parsed.data;
      const t = await treatmentsStorage.update(
        req.params.id,
        header as any,
        lines as any,
      );
      res.json(t);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

router.delete(
  "/api/treatments/:id",
  isAuthenticated,
  async (req: any, res: Response) => {
    try {
      await treatmentsStorage.remove(req.params.id);
      res.status(204).end();
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  },
);

export default router;
