import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/google";
import { requireStrictHospitalAccess } from "../../utils";
import * as storage from "../../storage/postopDeviationAcks";
import logger from "../../logger";

const router = Router();

const createSchema = z.object({
  anesthesiaRecordId: z.string(),
  parameter: z.enum(["pulse", "BP", "spo2"]),
  recordedAt: z.string().datetime(),
  recordedValue: z.number().int(),
  boundKind: z.enum(["low", "high"]),
  note: z.string().optional(),
});

router.get("/api/anesthesia/postop-deviation-acks/:anesthesiaRecordId", isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { anesthesiaRecordId } = req.params;
    const rows = await storage.listAcks(anesthesiaRecordId);
    res.json(rows);
  } catch (error) {
    logger.error("Error listing postop deviation acks:", error);
    res.status(500).json({ message: "Failed to list deviation acknowledgments" });
  }
});

router.post("/api/anesthesia/postop-deviation-acks", isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
    }
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const row = await storage.createAck({
      anesthesiaRecordId: parsed.data.anesthesiaRecordId,
      parameter: parsed.data.parameter,
      recordedAt: new Date(parsed.data.recordedAt),
      recordedValue: parsed.data.recordedValue,
      boundKind: parsed.data.boundKind,
      note: parsed.data.note,
      resolvedBy: userId,
    });
    res.status(201).json(row);
  } catch (error) {
    logger.error("Error creating postop deviation ack:", error);
    res.status(500).json({ message: "Failed to create deviation acknowledgment" });
  }
});

export default router;
