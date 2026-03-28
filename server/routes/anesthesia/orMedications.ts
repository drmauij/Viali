import { Router } from "express";
import * as storage from "../../storage/anesthesia";
import { isAuthenticated } from "../../auth/google";
import { requireWriteAccess } from "../../utils";
import logger from "../../logger";

const router = Router();

// GET all OR medications for a record
router.get("/api/or-medications/:anesthesiaRecordId", isAuthenticated, async (req: any, res) => {
  try {
    const { anesthesiaRecordId } = req.params;
    const medications = await storage.getOrMedications(anesthesiaRecordId);
    res.json(medications);
  } catch (error) {
    logger.error("Error fetching OR medications:", error);
    res.status(500).json({ message: "Failed to fetch OR medications" });
  }
});

// PUT (upsert) an OR medication entry
router.put("/api/or-medications/:anesthesiaRecordId", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { anesthesiaRecordId } = req.params;
    const { itemId, groupId, quantity, unit, notes } = req.body;
    if (!itemId || !groupId || !quantity || !unit) {
      return res.status(400).json({ message: "itemId, groupId, quantity, and unit are required" });
    }
    const result = await storage.upsertOrMedication({
      anesthesiaRecordId,
      itemId,
      groupId,
      quantity,
      unit,
      notes,
    });
    // Recalculate inventory
    await storage.calculateOrInventoryUsage(anesthesiaRecordId);
    res.json(result);
  } catch (error) {
    logger.error("Error upserting OR medication:", error);
    res.status(500).json({ message: "Failed to save OR medication" });
  }
});

// DELETE an OR medication entry
router.delete("/api/or-medications/:anesthesiaRecordId/:itemId", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { anesthesiaRecordId, itemId } = req.params;
    const groupId = req.query.groupId as string;
    if (!groupId) {
      return res.status(400).json({ message: "groupId query param is required" });
    }
    await storage.deleteOrMedication(anesthesiaRecordId, itemId, groupId);
    // Recalculate inventory (item may still exist in another group)
    await storage.calculateOrInventoryUsage(anesthesiaRecordId);
    res.json({ message: "Deleted" });
  } catch (error) {
    logger.error("Error deleting OR medication:", error);
    res.status(500).json({ message: "Failed to delete OR medication" });
  }
});

export default router;
