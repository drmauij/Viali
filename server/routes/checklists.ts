import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { 
  insertChecklistTemplateSchema, 
  insertChecklistCompletionSchema,
  insertChecklistDismissalSchema,
  units as locations 
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireWriteAccess,
  verifyUserHospitalUnitAccess
} from "../utils";
import { broadcastChecklistUpdate } from "../socket";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

const router = Router();

router.post('/api/checklists/templates', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { assignments, ...templateData } = req.body;
    
    if (!templateData.hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
      if (!templateData.unitId) {
        return res.status(400).json({ message: "At least one assignment (unit/role) is required" });
      }
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const adminLocations = hospitals.filter(h => h.id === templateData.hospitalId && h.role === 'admin');
    if (adminLocations.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const validated = insertChecklistTemplateSchema.parse({
      ...templateData,
      unitId: templateData.unitId || null,
      role: templateData.role || null,
      createdBy: userId,
    });
    
    const assignmentsList = assignments && Array.isArray(assignments) && assignments.length > 0
      ? assignments.map((a: any) => ({ unitId: a.unitId || null, role: a.role || null }))
      : templateData.unitId 
        ? [{ unitId: templateData.unitId, role: templateData.role || null }]
        : [];
    
    const template = await storage.createChecklistTemplate(validated, assignmentsList);
    res.status(201).json(template);
  } catch (error: any) {
    console.error("Error creating checklist template:", error);
    if (error.name === 'ZodError') {
      console.error("Validation errors:", error.errors);
      return res.status(400).json({ message: "Invalid template data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to create checklist template" });
  }
});

router.get('/api/checklists/templates/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    const active = req.query.active !== 'false';
    
    const hospitals = await storage.getUserHospitals(userId);
    const userLocations = hospitals.filter(h => h.id === hospitalId);
    
    if (userLocations.length === 0) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const templates = await storage.getChecklistTemplates(hospitalId, undefined, active);
    res.json(templates);
  } catch (error) {
    console.error("Error fetching checklist templates:", error);
    res.status(500).json({ message: "Failed to fetch checklist templates" });
  }
});

router.patch('/api/checklists/templates/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { assignments, ...updates } = req.body;
    
    const template = await storage.getChecklistTemplate(id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const adminLocations = hospitals.filter(h => h.id === template.hospitalId && h.role === 'admin');
    if (adminLocations.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const processedUpdates = { ...updates };
    if (processedUpdates.startDate && typeof processedUpdates.startDate === 'string') {
      processedUpdates.startDate = new Date(processedUpdates.startDate);
    }
    
    if (processedUpdates.items && Array.isArray(processedUpdates.items)) {
      processedUpdates.items = processedUpdates.items.map((item: any) => 
        typeof item === 'string' ? { description: item } : item
      );
    }
    
    const assignmentsList = assignments && Array.isArray(assignments)
      ? assignments.map((a: any) => ({ unitId: a.unitId || null, role: a.role || null }))
      : undefined;
    
    const updated = await storage.updateChecklistTemplate(id, processedUpdates, assignmentsList);
    res.json(updated);
  } catch (error: any) {
    console.error("Error updating checklist template:", error);
    res.status(500).json({ message: "Failed to update checklist template" });
  }
});

router.delete('/api/checklists/templates/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const template = await storage.getChecklistTemplate(id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const adminLocations = hospitals.filter(h => h.id === template.hospitalId && h.role === 'admin');
    if (adminLocations.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    await storage.deleteChecklistTemplate(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting checklist template:", error);
    res.status(500).json({ message: "Failed to delete checklist template" });
  }
});

router.get('/api/checklists/room-pending/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { date } = req.query;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    if (!hospitals.some(h => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const queryDate = date ? new Date(date as string) : new Date();
    const pending = await storage.getRoomPendingChecklists(hospitalId, queryDate);
    res.json(pending);
  } catch (error) {
    console.error("Error fetching room pending checklists:", error);
    res.status(500).json({ message: "Failed to fetch room pending checklists" });
  }
});

router.get('/api/checklists/pending/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;
    
    const hospitals = await storage.getUserHospitals(userId);
    let userLocations = hospitals.filter(h => h.id === hospitalId);
    
    if (userLocations.length === 0) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (unitId) {
      userLocations = userLocations.filter(loc => loc.unitId === unitId);
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const allPending = await Promise.all(
      userLocations.map(loc => 
        storage.getPendingChecklists(hospitalId, loc.unitId, loc.role)
      )
    );
    
    const pendingMap = new Map();
    allPending.flat().forEach(checklist => {
      pendingMap.set(checklist.id, checklist);
    });
    const pending = Array.from(pendingMap.values()).sort((a, b) => 
      a.nextDueDate.getTime() - b.nextDueDate.getTime()
    );
    
    res.json(pending);
  } catch (error) {
    console.error("Error fetching pending checklists:", error);
    res.status(500).json({ message: "Failed to fetch pending checklists" });
  }
});

router.get('/api/checklists/count/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    const userId = req.user.id;
    
    const hospitals = await storage.getUserHospitals(userId);
    let userLocations = hospitals.filter(h => h.id === hospitalId);
    
    if (userLocations.length === 0) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (unitId) {
      userLocations = userLocations.filter(loc => loc.unitId === unitId);
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const counts = await Promise.all(
      userLocations.map(loc => 
        storage.getPendingChecklistCount(hospitalId, loc.unitId, loc.role)
      )
    );
    
    const totalCount = counts.reduce((sum, count) => sum + count, 0);
    
    res.json({ count: totalCount });
  } catch (error) {
    console.error("Error fetching pending checklist count:", error);
    res.status(500).json({ message: "Failed to fetch pending checklist count" });
  }
});

router.post('/api/checklists/complete', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const completionData = req.body;
    
    if (!completionData.templateId || !completionData.signature) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    const template = await storage.getChecklistTemplate(completionData.templateId);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    
    const unitId = completionData.unitId || template.unitId;
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required for completion" });
    }
    
    const access = await verifyUserHospitalUnitAccess(userId, template.hospitalId, unitId);
    if (!access.hasAccess) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }
    
    const validated = insertChecklistCompletionSchema.extend({
      dueDate: z.coerce.date(),
    }).parse({
      ...completionData,
      completedBy: userId,
      hospitalId: template.hospitalId,
      unitId: unitId,
      completedAt: new Date(),
    });
    
    const completion = await storage.completeChecklist(validated);
    
    broadcastChecklistUpdate({
      hospitalId: template.hospitalId,
      section: 'checklists',
      data: { completionId: completion.id, templateId: template.id },
      timestamp: Date.now(),
      userId,
    });
    
    res.status(201).json(completion);
  } catch (error: any) {
    console.error("Error completing checklist:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Invalid completion data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to complete checklist" });
  }
});

router.post('/api/checklists/dismiss', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    const dismissalData = req.body;
    
    if (!dismissalData.templateId) {
      return res.status(400).json({ message: "Template ID is required" });
    }
    
    const template = await storage.getChecklistTemplate(dismissalData.templateId);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }
    
    const unitId = dismissalData.unitId || template.unitId;
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID is required for dismissal" });
    }
    
    const access = await verifyUserHospitalUnitAccess(userId, template.hospitalId, unitId);
    if (!access.hasAccess) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }
    
    const validated = insertChecklistDismissalSchema.extend({
      dueDate: z.coerce.date(),
    }).parse({
      ...dismissalData,
      dismissedBy: userId,
      hospitalId: template.hospitalId,
      unitId: unitId,
      dismissedAt: new Date(),
    });
    
    const dismissal = await storage.dismissChecklist(validated);
    
    broadcastChecklistUpdate({
      hospitalId: template.hospitalId,
      section: 'checklists',
      data: { dismissalId: dismissal.id, templateId: template.id },
      timestamp: Date.now(),
      userId,
    });
    
    res.status(201).json(dismissal);
  } catch (error: any) {
    console.error("Error dismissing checklist:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ message: "Invalid dismissal data", errors: error.errors });
    }
    res.status(500).json({ message: "Failed to dismiss checklist" });
  }
});

router.get('/api/checklists/history/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    const { templateId, limit, unitId } = req.query;
    
    const hospitals = await storage.getUserHospitals(userId);
    let userLocations = hospitals.filter(h => h.id === hospitalId);
    
    if (userLocations.length === 0) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (unitId) {
      userLocations = userLocations.filter(loc => loc.unitId === unitId);
      if (userLocations.length === 0) {
        return res.status(403).json({ message: "Access denied to this unit" });
      }
    }
    
    const allCompletions = await Promise.all(
      userLocations.map(loc => 
        storage.getChecklistCompletions(
          hospitalId,
          loc.unitId,
          templateId as string | undefined,
          limit ? parseInt(limit as string) : undefined
        )
      )
    );
    
    const completionsMap = new Map();
    allCompletions.flat().forEach(completion => {
      completionsMap.set(completion.id, completion);
    });
    
    const completions = Array.from(completionsMap.values()).sort((a, b) => 
      new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
    );
    
    res.json(completions);
  } catch (error) {
    console.error("Error fetching checklist history:", error);
    res.status(500).json({ message: "Failed to fetch checklist history" });
  }
});

router.get('/api/checklists/completion/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    
    const completion = await storage.getChecklistCompletion(id);
    if (!completion) {
      return res.status(404).json({ message: "Completion not found" });
    }
    
    const access = await verifyUserHospitalUnitAccess(userId, completion.hospitalId, completion.unitId);
    if (!access.hasAccess) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }
    
    res.json(completion);
  } catch (error) {
    console.error("Error fetching checklist completion:", error);
    res.status(500).json({ message: "Failed to fetch checklist completion" });
  }
});

export default router;
