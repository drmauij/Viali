import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, userHasHospitalAccess, getUserRole } from "../utils";
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

    const userRole = await getUserRole(userId, hospitalId);
    const isAdmin = userRole === 'admin';
    
    const templates = await storage.getSurgeonChecklistTemplates(hospitalId, isAdmin ? undefined : userId);
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
    } as any);

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

router.put("/api/surgeries/:surgeryId/checklist/entry", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { templateId, itemId, checked, note } = req.body;
    if (!templateId || !itemId) {
      return res.status(400).json({ error: "templateId and itemId are required" });
    }

    const saved = await storage.saveSurgeryPreOpChecklistEntry(
      req.params.surgeryId,
      templateId,
      itemId,
      checked,
      note
    );
    res.json(saved);
  } catch (error) {
    console.error("Error saving surgery checklist entry:", error);
    res.status(500).json({ error: "Failed to save checklist entry" });
  }
});

router.get("/api/surgeries/future", isAuthenticated, async (req: any, res) => {
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

    const surgeries = await storage.getFutureSurgeriesWithPatients(hospitalId);
    res.json(surgeries);
  } catch (error) {
    console.error("Error fetching future surgeries:", error);
    res.status(500).json({ error: "Failed to fetch future surgeries" });
  }
});

router.get("/api/surgeries/past", isAuthenticated, async (req: any, res) => {
  try {
    const hospitalId = req.query.hospitalId as string;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
    const userId = req.user?.id as string;
    
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId is required" });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const surgeries = await storage.getPastSurgeriesWithPatients(hospitalId, limit);
    res.json(surgeries);
  } catch (error) {
    console.error("Error fetching past surgeries:", error);
    res.status(500).json({ error: "Failed to fetch past surgeries" });
  }
});

router.get("/api/surgeon-checklists/matrix", isAuthenticated, async (req: any, res) => {
  try {
    const { templateId, hospitalId } = req.query;
    const userId = req.user?.id as string;
    
    if (!templateId || !hospitalId) {
      return res.status(400).json({ error: "templateId and hospitalId are required" });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId as string);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const entries = await storage.getChecklistMatrixEntries(templateId as string, hospitalId as string);
    res.json({ entries });
  } catch (error) {
    console.error("Error fetching checklist matrix:", error);
    res.status(500).json({ error: "Failed to fetch matrix data" });
  }
});

router.get("/api/surgeon-checklists/matrix/past", isAuthenticated, async (req: any, res) => {
  try {
    const { templateId, hospitalId, limit } = req.query;
    const userId = req.user?.id as string;
    
    if (!templateId || !hospitalId) {
      return res.status(400).json({ error: "templateId and hospitalId are required" });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId as string);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const entries = await storage.getPastChecklistMatrixEntries(
      templateId as string, 
      hospitalId as string,
      limit ? parseInt(limit as string, 10) : 100
    );
    
    // Debug: Get template to compare item IDs
    const template = await storage.getSurgeonChecklistTemplate(templateId as string);
    const templateItemIds = template?.items.map(i => i.id) || [];
    const entryItemIds = [...new Set(entries.map(e => e.itemId))];
    
    console.log('[Past Matrix Debug] Template ID:', templateId);
    console.log('[Past Matrix Debug] Template item IDs:', templateItemIds);
    console.log('[Past Matrix Debug] Entry item IDs (unique):', entryItemIds);
    console.log('[Past Matrix Debug] Total entries:', entries.length);
    console.log('[Past Matrix Debug] Checked entries:', entries.filter(e => e.checked).length);
    
    // Check for mismatched IDs
    const unmatchedEntryIds = entryItemIds.filter(id => !templateItemIds.includes(id));
    const unmatchedTemplateIds = templateItemIds.filter(id => !entryItemIds.includes(id));
    if (unmatchedEntryIds.length > 0) {
      console.log('[Past Matrix Debug] Entry itemIds NOT in template:', unmatchedEntryIds);
    }
    if (unmatchedTemplateIds.length > 0) {
      console.log('[Past Matrix Debug] Template itemIds NOT in entries:', unmatchedTemplateIds);
    }
    
    res.json({ entries });
  } catch (error) {
    console.error("Error fetching past checklist matrix:", error);
    res.status(500).json({ error: "Failed to fetch past matrix data" });
  }
});

router.put("/api/surgeon-checklists/templates/:id/default", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const templateId = req.params.id;
    const userId = req.user?.id as string;
    
    const template = await storage.getSurgeonChecklistTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    if (template.ownerUserId !== userId) {
      return res.status(403).json({ error: "Only the template owner can set it as default" });
    }

    const updated = await storage.toggleSurgeonChecklistTemplateDefault(templateId, userId);
    res.json(updated);
  } catch (error) {
    console.error("Error toggling template default:", error);
    res.status(500).json({ error: "Failed to toggle default" });
  }
});

router.post("/api/surgeon-checklists/templates/:id/apply-to-future", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const templateId = req.params.id;
    const { hospitalId } = req.body;
    const userId = req.user?.id as string;
    
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId is required" });
    }

    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "No access to this hospital" });
    }

    const template = await storage.getSurgeonChecklistTemplate(templateId);
    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const applied = await storage.applyTemplateToFutureSurgeries(templateId, hospitalId);
    res.json({ applied });
  } catch (error) {
    console.error("Error applying template to future surgeries:", error);
    res.status(500).json({ error: "Failed to apply template" });
  }
});

export default router;
