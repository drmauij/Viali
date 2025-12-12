import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, userHasHospitalAccess } from "../utils";
import { 
  insertSurgeonChecklistTemplateSchema, 
  updateSurgeonChecklistTemplateSchema,
  updateSurgeryChecklistSchema 
} from "@shared/schema";

const router = Router();

router.get("/api/surgeon-checklists/templates", isAuthenticated, async (req: any, res) => {
  try {
    const hospitalId = req.query.hospitalId as string;
    const userId = req.user?.id as string;
    
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId is required" });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const templates = await storage.getSurgeonChecklistTemplates(hospitalId, userId);
    res.json(templates);
  } catch (error) {
    console.error("Error fetching surgeon checklist templates:", error);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

router.get("/api/surgeon-checklists/templates/:id", isAuthenticated, async (req: any, res) => {
  try {
    const template = await storage.getSurgeonChecklistTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const hasAccess = await userHasHospitalAccess(req.user?.id as string, template.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this template" });
    }

    res.json(template);
  } catch (error) {
    console.error("Error fetching surgeon checklist template:", error);
    res.status(500).json({ error: "Failed to fetch template" });
  }
});

router.post("/api/surgeon-checklists/templates", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const parsed = insertSurgeonChecklistTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid template data", details: parsed.error });
    }

    const hasAccess = await userHasHospitalAccess(req.user?.id as string, parsed.data.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const template = await storage.createSurgeonChecklistTemplate({
      ...parsed.data,
      ownerUserId: req.user.id,
    });

    if (req.body.items && Array.isArray(req.body.items)) {
      await storage.updateSurgeonChecklistTemplate(template.id, {}, req.body.items);
    }

    const fullTemplate = await storage.getSurgeonChecklistTemplate(template.id);
    res.json(fullTemplate);
  } catch (error) {
    console.error("Error creating surgeon checklist template:", error);
    res.status(500).json({ error: "Failed to create template" });
  }
});

router.patch("/api/surgeon-checklists/templates/:id", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const template = await storage.getSurgeonChecklistTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (template.ownerUserId !== (req.user?.id as string)) {
      return res.status(403).json({ error: "Only the template owner can edit it" });
    }

    const parsed = updateSurgeonChecklistTemplateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid update data", details: parsed.error });
    }

    const { items, ...updates } = parsed.data;
    const updated = await storage.updateSurgeonChecklistTemplate(req.params.id, updates, items);
    const fullTemplate = await storage.getSurgeonChecklistTemplate(updated.id);
    res.json(fullTemplate);
  } catch (error) {
    console.error("Error updating surgeon checklist template:", error);
    res.status(500).json({ error: "Failed to update template" });
  }
});

router.delete("/api/surgeon-checklists/templates/:id", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const template = await storage.getSurgeonChecklistTemplate(req.params.id);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (template.ownerUserId !== (req.user?.id as string)) {
      return res.status(403).json({ error: "Only the template owner can delete it" });
    }

    await storage.deleteSurgeonChecklistTemplate(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting surgeon checklist template:", error);
    res.status(500).json({ error: "Failed to delete template" });
  }
});

router.get("/api/surgeries/:surgeryId/checklist", isAuthenticated, async (req, res) => {
  try {
    const checklist = await storage.getSurgeryPreOpChecklist(req.params.surgeryId);
    res.json(checklist);
  } catch (error) {
    console.error("Error fetching surgery checklist:", error);
    res.status(500).json({ error: "Failed to fetch checklist" });
  }
});

router.put("/api/surgeries/:surgeryId/checklist", isAuthenticated, requireWriteAccess, async (req, res) => {
  try {
    const parsed = updateSurgeryChecklistSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid checklist data", details: parsed.error });
    }

    const { templateId, entries } = parsed.data;
    const saved = await storage.saveSurgeryPreOpChecklist(req.params.surgeryId, templateId, entries);
    res.json({ templateId, entries: saved });
  } catch (error) {
    console.error("Error saving surgery checklist:", error);
    res.status(500).json({ error: "Failed to save checklist" });
  }
});

export default router;
