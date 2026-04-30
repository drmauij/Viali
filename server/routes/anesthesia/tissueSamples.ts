// Internal staff-facing routes. NOT part of the public API surface; no PUBLIC_API_MD update is required (see CLAUDE.md → Public API documentation).
import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/google";
import {
  requireWriteAccess,
  userHasGroupAwareHospitalAccess,
} from "../../utils";
import {
  createTissueSample,
  updateTissueSample,
  transitionTissueSampleStatus,
  getTissueSamplesByPatient,
  getTissueSamplesBySurgery,
  getTissueSampleWithHistory,
} from "../../storage/tissueSamples";
import { storage } from "../../storage";
import { db } from "../../db";
import { tissueSamples, surgeries } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  TISSUE_SAMPLE_TYPES,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";
import {
  MissingSampleCodePrefixError,
  TissueSampleCodeRetryExhaustedError,
} from "../../lib/tissueSampleCode";
import logger from "../../logger";

const router = Router();

const createBody = z.object({
  sampleType: z.string(),
  notes: z.string().nullable().optional(),
  extractionSurgeryId: z.string().nullable().optional(),
  externalLab: z.string().nullable().optional(),
});

const patchBody = z.object({
  notes: z.string().nullable().optional(),
  externalLab: z.string().nullable().optional(),
  reimplantSurgeryId: z.string().nullable().optional(),
});

const statusBody = z.object({
  toStatus: z.string(),
  note: z.string().nullable().optional(),
});

async function loadSampleAndCheckAccess(
  req: any,
  res: any,
  sampleId: string,
) {
  const [sample] = await db
    .select()
    .from(tissueSamples)
    .where(eq(tissueSamples.id, sampleId));
  if (!sample) {
    res.status(404).json({ message: "Sample not found" });
    return null;
  }
  const ok = await userHasGroupAwareHospitalAccess(
    req.user.id,
    sample.hospitalId,
    req,
  );
  if (!ok) {
    res.status(403).json({
      message: "Access denied.",
      code: "RESOURCE_ACCESS_DENIED",
    });
    return null;
  }
  return sample;
}

// LIST per patient
router.get(
  "/api/patients/:patientId/tissue-samples",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const { patientId } = req.params;
      const patient = await storage.getPatient(patientId);
      if (!patient)
        return res.status(404).json({ message: "Patient not found" });
      const ok = await userHasGroupAwareHospitalAccess(
        req.user.id,
        patient.hospitalId,
        req,
      );
      if (!ok) {
        return res.status(403).json({
          message: "Access denied.",
          code: "RESOURCE_ACCESS_DENIED",
        });
      }
      const samples = await getTissueSamplesByPatient(patientId);
      res.json(samples);
    } catch (e) {
      logger.error("List tissue samples by patient failed", e);
      res.status(500).json({ message: "Failed to list tissue samples" });
    }
  },
);

// LIST per surgery (extraction OR reimplant)
router.get(
  "/api/surgeries/:surgeryId/tissue-samples",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const { surgeryId } = req.params;
      const [surgery] = await db
        .select()
        .from(surgeries)
        .where(eq(surgeries.id, surgeryId));
      if (!surgery)
        return res.status(404).json({ message: "Surgery not found" });
      const ok = await userHasGroupAwareHospitalAccess(
        req.user.id,
        surgery.hospitalId,
        req,
      );
      if (!ok) {
        return res.status(403).json({
          message: "Access denied.",
          code: "RESOURCE_ACCESS_DENIED",
        });
      }
      const samples = await getTissueSamplesBySurgery(surgeryId);
      res.json(samples);
    } catch (e) {
      logger.error("List tissue samples by surgery failed", e);
      res.status(500).json({ message: "Failed to list tissue samples" });
    }
  },
);

// GET one with full status history
router.get(
  "/api/tissue-samples/:id",
  isAuthenticated,
  async (req: any, res) => {
    try {
      const sample = await loadSampleAndCheckAccess(req, res, req.params.id);
      if (!sample) return;
      const result = await getTissueSampleWithHistory(req.params.id);
      res.json(result);
    } catch (e) {
      logger.error("Get tissue sample with history failed", e);
      res.status(500).json({ message: "Failed to load tissue sample" });
    }
  },
);

// CREATE — mints code, writes initial history
router.post(
  "/api/patients/:patientId/tissue-samples",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const { patientId } = req.params;
      const patient = await storage.getPatient(patientId);
      if (!patient)
        return res.status(404).json({ message: "Patient not found" });
      const ok = await userHasGroupAwareHospitalAccess(
        req.user.id,
        patient.hospitalId,
        req,
      );
      if (!ok) {
        return res.status(403).json({
          message: "Access denied.",
          code: "RESOURCE_ACCESS_DENIED",
        });
      }

      const parsed = createBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ message: "Invalid body", errors: parsed.error.flatten() });
      }

      const typeConfig =
        TISSUE_SAMPLE_TYPES[parsed.data.sampleType as TissueSampleType];
      if (!typeConfig) {
        return res.status(422).json({
          message: `Unknown sample type: ${parsed.data.sampleType}`,
          code: "UNKNOWN_SAMPLE_TYPE",
        });
      }
      if (!typeConfig.enabledInUI) {
        return res.status(422).json({
          message: `Sample type "${parsed.data.sampleType}" is not enabled in v1.`,
          code: "TYPE_NOT_ENABLED",
        });
      }

      const sample = await createTissueSample({
        hospitalId: patient.hospitalId,
        patientId,
        sampleType: parsed.data.sampleType,
        notes: parsed.data.notes ?? null,
        extractionSurgeryId: parsed.data.extractionSurgeryId ?? null,
        externalLab: parsed.data.externalLab ?? null,
        createdBy: req.user.id,
      });
      res.status(201).json(sample);
    } catch (e: any) {
      if (e instanceof MissingSampleCodePrefixError) {
        return res.status(422).json({
          message: e.message,
          code: "MISSING_SAMPLE_CODE_PREFIX",
        });
      }
      if (e instanceof TissueSampleCodeRetryExhaustedError) {
        logger.error("Tissue sample code retry exhausted", e);
        return res.status(500).json({ message: e.message });
      }
      logger.error("Create tissue sample failed", e);
      res.status(500).json({ message: "Failed to create tissue sample" });
    }
  },
);

// PATCH — notes, externalLab, reimplantSurgeryId
router.patch(
  "/api/tissue-samples/:id",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const sample = await loadSampleAndCheckAccess(req, res, req.params.id);
      if (!sample) return;
      const parsed = patchBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const updated = await updateTissueSample(req.params.id, parsed.data);
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "REIMPLANT_NOT_SUPPORTED") {
        return res
          .status(422)
          .json({ message: e.message, code: "REIMPLANT_NOT_SUPPORTED" });
      }
      logger.error("Update tissue sample failed", e);
      res.status(500).json({ message: "Failed to update tissue sample" });
    }
  },
);

// Status transition (no DELETE — destruction is a status transition).
router.post(
  "/api/tissue-samples/:id/status",
  isAuthenticated,
  requireWriteAccess,
  async (req: any, res) => {
    try {
      const sample = await loadSampleAndCheckAccess(req, res, req.params.id);
      if (!sample) return;
      const parsed = statusBody.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(422)
          .json({ message: "Invalid body", errors: parsed.error.flatten() });
      }
      const updated = await transitionTissueSampleStatus({
        sampleId: req.params.id,
        toStatus: parsed.data.toStatus,
        changedBy: req.user.id,
        note: parsed.data.note ?? null,
      });
      res.json(updated);
    } catch (e: any) {
      if (e?.code === "INVALID_STATUS") {
        return res
          .status(422)
          .json({ message: e.message, code: "INVALID_STATUS" });
      }
      logger.error("Transition tissue sample status failed", e);
      res.status(500).json({ message: "Failed to transition status" });
    }
  },
);

export default router;
