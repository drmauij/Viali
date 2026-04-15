import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/google";
import { requireStrictHospitalAccess } from "../../utils";
import { db } from "../../db";
import { postopPlannedEvents, anesthesiaRecords, postopOrderSets } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";

const router = Router();

const adminSchema = z.object({
  anesthesiaRecordId: z.string(),
  itemId: z.string(),              // postop order item id (the PRN item being administered)
  medicationRef: z.string(),
  dose: z.string(),
  route: z.enum(["po", "iv", "sc", "im"]),
  administeredAt: z.string().datetime(),
  note: z.string().optional(),
});

// Recognise these drug names case-insensitively for dual-write to legacy postOpData
const LEGACY_PAIN_MED_MAP: Record<string, "paracetamolTime" | "nsarTime" | "novalginTime"> = {
  paracetamol: "paracetamolTime",
  nsar: "nsarTime",
  ibuprofen: "nsarTime",
  diclofenac: "nsarTime",
  novalgin: "novalginTime",
  metamizol: "novalginTime",
  metamizole: "novalginTime",
};

router.post(
  "/api/anesthesia/postop-orders/prn-admin",
  isAuthenticated,
  requireStrictHospitalAccess,
  async (req: any, res) => {
    try {
      const parsed = adminSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request body", errors: parsed.error.flatten() });
      }
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ message: "User not authenticated" });
      const d = parsed.data;

      // 1. Find the current order set for this anesthesia record
      const [orderSet] = await db.select().from(postopOrderSets)
        .where(eq(postopOrderSets.anesthesiaRecordId, d.anesthesiaRecordId));
      if (!orderSet) {
        return res.status(404).json({ message: "No postop order set for this anesthesia record" });
      }

      // 2. Insert a postop_planned_events row with status='done' representing this PRN admin
      const administeredAt = new Date(d.administeredAt);
      const [planned] = await db.insert(postopPlannedEvents).values({
        orderSetId: orderSet.id,
        itemId: d.itemId,
        kind: "medication",
        plannedAt: administeredAt,
        payloadSnapshot: {
          medicationRef: d.medicationRef,
          dose: d.dose,
          route: d.route,
          scheduleMode: "prn",
          note: d.note,
        },
        status: "done",
        doneAt: administeredAt,
        doneBy: userId,
        doneValue: { dose: d.dose, note: d.note },
      }).returning();

      // 3. Dual-write legacy postOpData.<drug>Time
      // The discharge brief PDF reads paracetamolTime / nsarTime / novalginTime from postOpData.
      // Writing here keeps the PDF working while clinical workflows migrate to the new PRN path.
      const drugKey = d.medicationRef.trim().toLowerCase();
      const legacyField = LEGACY_PAIN_MED_MAP[drugKey];
      let legacyUpdated = false;
      if (legacyField) {
        const [record] = await db.select().from(anesthesiaRecords)
          .where(eq(anesthesiaRecords.id, d.anesthesiaRecordId));
        if (record) {
          const hhmm = administeredAt.toISOString().substring(11, 16);
          const existingPostOpData = (record.postOpData as Record<string, unknown>) ?? {};
          await db.update(anesthesiaRecords)
            .set({ postOpData: { ...existingPostOpData, [legacyField]: hhmm } })
            .where(eq(anesthesiaRecords.id, d.anesthesiaRecordId));
          legacyUpdated = true;
        }
      }

      res.status(201).json({ plannedEvent: planned, legacyFieldUpdated: legacyUpdated, legacyField: legacyField ?? null });
    } catch (error) {
      logger.error("Error administering PRN postop med:", error);
      res.status(500).json({ message: "Failed to administer PRN" });
    }
  }
);

export default router;
