import { Router } from "express";
import { storage } from "../../storage";
import { insertAnesthesiaInstallationSchema } from "@shared/schema";
import { isAuthenticated } from "../../auth/google";

const router = Router();

router.get("/api/anesthesia/installations/:recordId", isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const installations = await storage.getAnesthesiaInstallations(recordId);
    res.json(installations);
  } catch (error) {
    console.error("Error fetching installations:", error);
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
    console.error("Error creating installation:", error);
    res.status(500).json({ error: "Failed to create installation" });
  }
});

router.patch("/api/anesthesia/installations/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const installation = await storage.updateAnesthesiaInstallation(id, req.body);
    res.json(installation);
  } catch (error) {
    console.error("Error updating installation:", error);
    res.status(500).json({ error: "Failed to update installation" });
  }
});

router.delete("/api/anesthesia/installations/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    await storage.deleteAnesthesiaInstallation(id);
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting installation:", error);
    res.status(500).json({ error: "Failed to delete installation" });
  }
});

export default router;
