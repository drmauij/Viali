import { Router } from "express";
import { storage } from "../../storage";
import { insertAnesthesiaInstallationSchema } from "@shared/schema";
import { isAuthenticated } from "../../auth/google";
import logger from "../../logger";

const router = Router();

router.get("/api/anesthesia/installations/:recordId", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const installations = await storage.getAnesthesiaInstallations(recordId);
    res.json(installations);
  } catch (error) {
    logger.error("Error fetching installations:", error);
    res.status(500).json({ error: "Failed to fetch installations" });
  }
});

router.post("/api/anesthesia/installations", isAuthenticated, async (req: any, res) => {
  try {
    const parsed = insertAnesthesiaInstallationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid installation data", details: parsed.error.errors });
    }
    const installation = await storage.createAnesthesiaInstallation(parsed.data);
    res.status(201).json(installation);
  } catch (error) {
    logger.error("Error creating installation:", error);
    res.status(500).json({ error: "Failed to create installation" });
  }
});

router.patch("/api/anesthesia/installations/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const installation = await storage.updateAnesthesiaInstallation(id, req.body);
    res.json(installation);
  } catch (error) {
    logger.error("Error updating installation:", error);
    res.status(500).json({ error: "Failed to update installation" });
  }
});

router.delete("/api/anesthesia/installations/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    await storage.deleteAnesthesiaInstallation(id);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting installation:", error);
    res.status(500).json({ error: "Failed to delete installation" });
  }
});

// ==================== AIRWAY MANAGEMENT ====================

router.get("/api/anesthesia/:recordId/airway", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const airway = await storage.getAirwayManagement(recordId);
    res.json(airway || null);
  } catch (error) {
    logger.error("Error fetching airway management:", error);
    res.status(500).json({ error: "Failed to fetch airway management" });
  }
});

router.post("/api/anesthesia/:recordId/airway", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const airway = await storage.upsertAirwayManagement({
      ...req.body,
      anesthesiaRecordId: recordId,
    });
    res.json(airway);
  } catch (error) {
    logger.error("Error saving airway management:", error);
    res.status(500).json({ error: "Failed to save airway management" });
  }
});

router.delete("/api/anesthesia/:recordId/airway", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    await storage.deleteAirwayManagement(recordId);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting airway management:", error);
    res.status(500).json({ error: "Failed to delete airway management" });
  }
});

// ==================== GENERAL TECHNIQUE ====================

router.get("/api/anesthesia/:recordId/general-technique", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const technique = await storage.getGeneralTechnique(recordId);
    res.json(technique || null);
  } catch (error) {
    logger.error("Error fetching general technique:", error);
    res.status(500).json({ error: "Failed to fetch general technique" });
  }
});

router.post("/api/anesthesia/:recordId/general-technique", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const technique = await storage.upsertGeneralTechnique({
      ...req.body,
      anesthesiaRecordId: recordId,
    });
    res.json(technique);
  } catch (error) {
    logger.error("Error saving general technique:", error);
    res.status(500).json({ error: "Failed to save general technique" });
  }
});

router.delete("/api/anesthesia/:recordId/general-technique", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    await storage.deleteGeneralTechnique(recordId);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting general technique:", error);
    res.status(500).json({ error: "Failed to delete general technique" });
  }
});

// ==================== NEURAXIAL BLOCKS ====================

router.get("/api/anesthesia/:recordId/neuraxial-blocks", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const blocks = await storage.getNeuraxialBlocks(recordId);
    res.json(blocks || []);
  } catch (error) {
    logger.error("Error fetching neuraxial blocks:", error);
    res.status(500).json({ error: "Failed to fetch neuraxial blocks" });
  }
});

router.post("/api/anesthesia/:recordId/neuraxial-blocks", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const block = await storage.createNeuraxialBlock({
      ...req.body,
      anesthesiaRecordId: recordId,
    });
    res.status(201).json(block);
  } catch (error) {
    logger.error("Error creating neuraxial block:", error);
    res.status(500).json({ error: "Failed to create neuraxial block" });
  }
});

router.delete("/api/anesthesia/neuraxial-blocks/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    await storage.deleteNeuraxialBlock(id);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting neuraxial block:", error);
    res.status(500).json({ error: "Failed to delete neuraxial block" });
  }
});

// ==================== PERIPHERAL BLOCKS ====================

router.get("/api/anesthesia/:recordId/peripheral-blocks", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const blocks = await storage.getPeripheralBlocks(recordId);
    res.json(blocks || []);
  } catch (error) {
    logger.error("Error fetching peripheral blocks:", error);
    res.status(500).json({ error: "Failed to fetch peripheral blocks" });
  }
});

router.post("/api/anesthesia/:recordId/peripheral-blocks", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const block = await storage.createPeripheralBlock({
      ...req.body,
      anesthesiaRecordId: recordId,
    });
    res.status(201).json(block);
  } catch (error) {
    logger.error("Error creating peripheral block:", error);
    res.status(500).json({ error: "Failed to create peripheral block" });
  }
});

router.delete("/api/anesthesia/peripheral-blocks/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    await storage.deletePeripheralBlock(id);
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting peripheral block:", error);
    res.status(500).json({ error: "Failed to delete peripheral block" });
  }
});

export default router;
