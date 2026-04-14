import { Router } from "express";
import { isAuthenticated } from "../../auth/google";
import { requireWriteAccess, requireStrictHospitalAccess } from "../../utils";
import { postopOrdersStorage } from "../../storage/postopOrders";
import { createAuditLog } from "../../storage/anesthesia";
import { parsePostopOrders } from "../../services/postopOrderAIParser";
import { planEvents } from "@shared/postopOrderPlanning";
import logger from "../../logger";

const AUDIT_RECORD_TYPE = "postop_order_template";

const HORIZON_HOURS = 24;

const router = Router();

// --- Templates ---

router.get('/api/anesthesia/postop-orders/templates', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const hospitalId = req.query.hospitalId as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }
    const templates = await postopOrdersStorage.listTemplates(hospitalId);
    res.json(templates);
  } catch (error) {
    logger.error("Error listing postop order templates:", error);
    res.status(500).json({ message: "Failed to list templates" });
  }
});

router.post('/api/anesthesia/postop-orders/templates', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, name, description, items, sortOrder, procedureCode } = req.body;
    if (!hospitalId || !name || !items) {
      return res.status(400).json({ message: "hospitalId, name, and items are required" });
    }
    const template = await postopOrdersStorage.createTemplate({
      hospitalId, name, description, items, sortOrder, procedureCode,
    });
    if (req.user?.id) {
      await createAuditLog({
        recordType: AUDIT_RECORD_TYPE,
        recordId: template.id,
        action: "create",
        userId: req.user.id,
        oldValue: null,
        newValue: { hospitalId, name, description, items, sortOrder, procedureCode },
      });
    }
    res.status(201).json(template);
  } catch (error) {
    logger.error("Error creating postop order template:", error);
    res.status(500).json({ message: "Failed to create template" });
  }
});

router.patch('/api/anesthesia/postop-orders/templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const existing = await postopOrdersStorage.getTemplate(id);
    if (!existing) {
      return res.status(404).json({ message: "Template not found" });
    }
    const { name, description, items, sortOrder, procedureCode } = req.body;
    const template = await postopOrdersStorage.updateTemplate(id, {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(items !== undefined && { items }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(procedureCode !== undefined && { procedureCode }),
    });
    if (req.user?.id) {
      await createAuditLog({
        recordType: AUDIT_RECORD_TYPE,
        recordId: id,
        action: "update",
        userId: req.user.id,
        oldValue: {
          name: existing.name, description: existing.description, items: existing.items,
          sortOrder: existing.sortOrder, procedureCode: existing.procedureCode,
        },
        newValue: {
          name: template.name, description: template.description, items: template.items,
          sortOrder: template.sortOrder, procedureCode: template.procedureCode,
        },
      });
    }
    res.json(template);
  } catch (error) {
    logger.error("Error updating postop order template:", error);
    res.status(500).json({ message: "Failed to update template" });
  }
});

router.delete('/api/anesthesia/postop-orders/templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const existing = await postopOrdersStorage.getTemplate(id);
    if (!existing) {
      return res.status(404).json({ message: "Template not found" });
    }
    await postopOrdersStorage.deleteTemplate(id);
    if (req.user?.id) {
      await createAuditLog({
        recordType: AUDIT_RECORD_TYPE,
        recordId: id,
        action: "delete",
        userId: req.user.id,
        oldValue: {
          hospitalId: existing.hospitalId, name: existing.name, description: existing.description,
          items: existing.items, sortOrder: existing.sortOrder, procedureCode: existing.procedureCode,
        },
        newValue: null,
      });
    }
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting postop order template:", error);
    res.status(500).json({ message: "Failed to delete template" });
  }
});

// --- AI parse (no audit; preview only until user saves template) ---

router.post('/api/anesthesia/postop-orders/ai-parse', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId, text } = req.body ?? {};
    if (!hospitalId || !unitId || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: "hospitalId, unitId, and non-empty text are required" });
    }
    if (text.length > 4000) {
      return res.status(400).json({ message: "text too long (max 4000 chars)" });
    }
    const result = await parsePostopOrders(text, hospitalId, unitId);
    res.json(result);
  } catch (error: any) {
    logger.error("Error parsing postop orders with AI:", error);
    res.status(500).json({ message: error?.message || "Failed to parse orders" });
  }
});

// --- Order sets (scoped to anesthesia records) ---

router.get('/api/anesthesia/records/:recordId/postop-orders', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const orderSet = await postopOrdersStorage.getOrderSetByRecord(recordId);
    if (!orderSet) {
      return res.json(null);
    }
    const plannedEvents = await postopOrdersStorage.listPlannedEvents(orderSet.id);
    res.json({ orderSet, plannedEvents });
  } catch (error) {
    logger.error("Error fetching postop order set:", error);
    res.status(500).json({ message: "Failed to fetch order set" });
  }
});

router.put('/api/anesthesia/records/:recordId/postop-orders', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const { items, templateId, sign } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ message: "items array is required" });
    }
    const userId = req.user?.id ?? null;
    const orderSet = await postopOrdersStorage.upsertOrderSet(recordId, {
      items,
      templateId: templateId ?? null,
      signedBy: sign ? userId : null,
    });

    // Plan events and replace
    const planned = planEvents(items, Date.now(), HORIZON_HOURS);
    await postopOrdersStorage.replacePlannedEvents(orderSet.id, planned);

    const plannedEvents = await postopOrdersStorage.listPlannedEvents(orderSet.id);
    res.json({ orderSet, plannedEvents });
  } catch (error) {
    logger.error("Error upserting postop order set:", error);
    res.status(500).json({ message: "Failed to upsert order set" });
  }
});

// --- Planned event actions ---

router.post('/api/anesthesia/postop-orders/events/:eventId/done', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { eventId } = req.params;
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    const { doneValue } = req.body ?? {};
    const event = await postopOrdersStorage.markEventDone(eventId, userId, doneValue);
    res.json(event);
  } catch (error) {
    logger.error("Error marking postop event as done:", error);
    res.status(500).json({ message: "Failed to mark event as done" });
  }
});

export default router;
