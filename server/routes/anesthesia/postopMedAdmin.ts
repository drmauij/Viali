import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../../auth/google";
import { requireStrictHospitalAccess } from "../../utils";
import { db } from "../../db";
import { orMedications, anesthesiaRecords } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../../logger";

const router = Router();

const adminSchema = z.object({
  anesthesiaRecordId: z.string(),
  itemId: z.string(),      // postop order item id (for PRN tracking in client)
  medicationRef: z.string(),
  dose: z.string(),
  route: z.enum(["po", "iv", "sc", "im"]),
  administeredAt: z.string().datetime(),
  itemsId: z.string(),     // inventory items.id — required (FK to items table)
  groupId: z.string(),     // administration_groups.id — required (FK to administrationGroups table)
  unit: z.string(),        // unit of measure (e.g. "mg", "ml") — required
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

      // === 1. Create / update orMedications row ===
      // Uses onConflictDoUpdate because the unique constraint on (anesthesiaRecordId, itemId, groupId)
      // would reject a duplicate insert when the same PRN item is administered more than once
      // during a session. Updating notes with the latest administration details is the right behaviour.
      const [med] = await db
        .insert(orMedications)
        .values({
          anesthesiaRecordId: d.anesthesiaRecordId,
          itemId: d.itemsId,
          groupId: d.groupId,
          quantity: d.dose,
          unit: d.unit,
          notes: `${d.medicationRef} ${d.dose} ${d.unit} ${d.route}${d.note ? " — " + d.note : ""} (PRN postop)`,
        })
        .onConflictDoUpdate({
          target: [orMedications.anesthesiaRecordId, orMedications.itemId, orMedications.groupId],
          set: {
            quantity: d.dose,
            unit: d.unit,
            notes: `${d.medicationRef} ${d.dose} ${d.unit} ${d.route}${d.note ? " — " + d.note : ""} (PRN postop)`,
          },
        })
        .returning();

      // === 2. Dual-write to legacy postOpData.<drug>Time ===
      // The discharge brief PDF reads paracetamolTime / nsarTime / novalginTime from postOpData.
      // Writing here keeps the PDF working while clinical workflows migrate to the new PRN path.
      const drugKey = d.medicationRef.trim().toLowerCase();
      const legacyField = LEGACY_PAIN_MED_MAP[drugKey];
      let legacyUpdated = false;
      if (legacyField) {
        const [record] = await db
          .select()
          .from(anesthesiaRecords)
          .where(eq(anesthesiaRecords.id, d.anesthesiaRecordId));
        if (record) {
          const hhmm = new Date(d.administeredAt).toISOString().substring(11, 16);
          const existingPostOpData = (record.postOpData as Record<string, unknown>) ?? {};
          await db
            .update(anesthesiaRecords)
            .set({ postOpData: { ...existingPostOpData, [legacyField]: hhmm } })
            .where(eq(anesthesiaRecords.id, d.anesthesiaRecordId));
          legacyUpdated = true;
        }
      }

      res.status(201).json({
        orMedication: med,
        legacyFieldUpdated: legacyUpdated,
        legacyField: legacyField ?? null,
      });
    } catch (error) {
      logger.error("Error administering PRN postop med:", error);
      res.status(500).json({ message: "Failed to administer PRN" });
    }
  }
);

export default router;
