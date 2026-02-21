import { Router } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireStrictHospitalAccess, requireWriteAccess, getUserRole } from "../utils";
import { z } from "zod";
import logger from "../logger";

const router = Router();

const createWorktimeLogSchema = z.object({
  userId: z.string().min(1),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/),
  pauseMinutes: z.number().int().min(0).default(0),
  notes: z.string().nullable().optional(),
  enteredById: z.string().nullable().optional(),
});

const updateWorktimeLogSchema = z.object({
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  pauseMinutes: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/hospitals/:hospitalId/worktime-logs — list entries
router.get('/api/hospitals/:hospitalId/worktime-logs', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    const { userId: filterUserId, dateFrom, dateTo } = req.query;

    // Check if hospital has worktime addon
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital?.addonWorktime) {
      return res.status(403).json({ message: "Worktime feature not enabled" });
    }

    const role = await getUserRole(userId, hospitalId);
    const isAdmin = role === "admin";

    // Non-admins can only see their own entries
    const effectiveUserId = isAdmin && filterUserId ? (filterUserId as string) : userId;

    const logs = await storage.getWorktimeLogs(hospitalId, {
      userId: effectiveUserId,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
    });

    res.json(logs);
  } catch (error) {
    logger.error("Error fetching worktime logs:", error);
    res.status(500).json({ message: "Failed to fetch worktime logs" });
  }
});

// POST /api/hospitals/:hospitalId/worktime-logs — create entry
router.post('/api/hospitals/:hospitalId/worktime-logs', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const currentUserId = req.user.id;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital?.addonWorktime) {
      return res.status(403).json({ message: "Worktime feature not enabled" });
    }

    const body = createWorktimeLogSchema.parse(req.body);
    const role = await getUserRole(currentUserId, hospitalId);
    const isAdmin = role === "admin";

    // Non-admins can only create entries for themselves
    if (!isAdmin && body.userId !== currentUserId) {
      return res.status(403).json({ message: "Cannot create entries for other users" });
    }

    const log = await storage.createWorktimeLog({
      ...body,
      hospitalId,
      enteredById: body.userId !== currentUserId ? currentUserId : null,
    });

    res.status(201).json(log);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    logger.error("Error creating worktime log:", error);
    res.status(500).json({ message: "Failed to create worktime log" });
  }
});

// PATCH /api/hospitals/:hospitalId/worktime-logs/:id — edit entry
router.patch('/api/hospitals/:hospitalId/worktime-logs/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, id } = req.params;
    const currentUserId = req.user.id;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital?.addonWorktime) {
      return res.status(403).json({ message: "Worktime feature not enabled" });
    }

    const existing = await storage.getWorktimeLog(id);
    if (!existing || existing.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Worktime log not found" });
    }

    const role = await getUserRole(currentUserId, hospitalId);
    const isAdmin = role === "admin";

    // Non-admins can only edit their own entries
    if (!isAdmin && existing.userId !== currentUserId) {
      return res.status(403).json({ message: "Cannot edit entries of other users" });
    }

    const body = updateWorktimeLogSchema.parse(req.body);
    const updated = await storage.updateWorktimeLog(id, body);

    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid input", errors: error.errors });
    }
    logger.error("Error updating worktime log:", error);
    res.status(500).json({ message: "Failed to update worktime log" });
  }
});

// DELETE /api/hospitals/:hospitalId/worktime-logs/:id — delete entry
router.delete('/api/hospitals/:hospitalId/worktime-logs/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, id } = req.params;
    const currentUserId = req.user.id;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital?.addonWorktime) {
      return res.status(403).json({ message: "Worktime feature not enabled" });
    }

    const existing = await storage.getWorktimeLog(id);
    if (!existing || existing.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Worktime log not found" });
    }

    const role = await getUserRole(currentUserId, hospitalId);
    const isAdmin = role === "admin";

    if (!isAdmin && existing.userId !== currentUserId) {
      return res.status(403).json({ message: "Cannot delete entries of other users" });
    }

    await storage.deleteWorktimeLog(id);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting worktime log:", error);
    res.status(500).json({ message: "Failed to delete worktime log" });
  }
});

// GET /api/hospitals/:hospitalId/worktime-logs/balance/:userId — get balance
router.get('/api/hospitals/:hospitalId/worktime-logs/balance/:userId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, userId: targetUserId } = req.params;
    const currentUserId = req.user.id;

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital?.addonWorktime) {
      return res.status(403).json({ message: "Worktime feature not enabled" });
    }

    const role = await getUserRole(currentUserId, hospitalId);
    const isAdmin = role === "admin";

    // Non-admins can only view their own balance
    if (!isAdmin && targetUserId !== currentUserId) {
      return res.status(403).json({ message: "Cannot view balance of other users" });
    }

    const balance = await storage.calculateWorktimeBalance(hospitalId, targetUserId);
    res.json(balance);
  } catch (error) {
    logger.error("Error calculating worktime balance:", error);
    res.status(500).json({ message: "Failed to calculate worktime balance" });
  }
});

export default router;
