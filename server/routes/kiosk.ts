import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import logger from "../logger";

const router = Router();

// ========== RATE LIMITING ==========
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter(options: { windowMs: number; maxRequests: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const token = req.params.token;

    if (!token || token.length < 10) {
      return res.status(400).json({ message: "Invalid or missing kiosk token" });
    }

    const key = `${options.keyPrefix}:${ip}:${token}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + options.windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;

    if (entry.count > options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
        retryAfter
      });
    }

    next();
  };
}

const kioskFetchLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'kfetch'
});

const kioskPinLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,     // Brute force protection: 10,000 PIN combos / 5 per min = 33h
  keyPrefix: 'kpin'
});

const kioskSubmitLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'ksubmit'
});

// Validation schemas
const verifyPinSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
});

const logTimeSchema = z.object({
  userId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 digits"),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  timeStart: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  timeEnd: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  pauseMinutes: z.number().int().min(0).default(0),
  notes: z.string().optional().default(""),
});

// GET /api/public/kiosk/:token — validate token, return hospital name + staff list
router.get('/api/public/kiosk/:token', kioskFetchLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const hospital = await storage.getHospitalByKioskToken(token);

    if (!hospital) {
      return res.status(404).json({ message: "This kiosk link is no longer active" });
    }

    const staffList = await storage.getKioskStaffList(hospital.id);

    res.json({
      hospitalName: hospital.name,
      language: hospital.defaultLanguage || "de",
      staff: staffList,
    });
  } catch (error) {
    logger.error("Error fetching kiosk data:", error);
    res.status(500).json({ message: "Failed to load kiosk" });
  }
});

// POST /api/public/kiosk/:token/verify-pin — verify PIN
router.post('/api/public/kiosk/:token/verify-pin', kioskPinLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const hospital = await storage.getHospitalByKioskToken(token);

    if (!hospital) {
      return res.status(404).json({ message: "This kiosk link is no longer active" });
    }

    const parsed = verifyPinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input" });
    }

    const { userId, pin } = parsed.data;
    const valid = await storage.verifyUserKioskPin(userId, pin);

    res.json({ valid });
  } catch (error) {
    logger.error("Error verifying kiosk PIN:", error);
    res.status(500).json({ message: "Failed to verify PIN" });
  }
});

// POST /api/public/kiosk/:token/log-time — re-verify PIN + create worktime entry
router.post('/api/public/kiosk/:token/log-time', kioskSubmitLimiter, async (req, res) => {
  try {
    const { token } = req.params;
    const hospital = await storage.getHospitalByKioskToken(token);

    if (!hospital) {
      return res.status(404).json({ message: "This kiosk link is no longer active" });
    }

    const parsed = logTimeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid input", errors: parsed.error.flatten().fieldErrors });
    }

    const { userId, pin, workDate, timeStart, timeEnd, pauseMinutes, notes } = parsed.data;

    // Re-verify PIN (no session — prevents submission after someone walks away)
    const valid = await storage.verifyUserKioskPin(userId, pin);
    if (!valid) {
      return res.status(403).json({ message: "Invalid PIN" });
    }

    const log = await storage.createWorktimeLog({
      userId,
      hospitalId: hospital.id,
      enteredById: userId, // self-entry via kiosk
      workDate,
      timeStart,
      timeEnd,
      pauseMinutes,
      notes: notes || null,
    });

    res.status(201).json({ success: true, id: log.id });
  } catch (error) {
    logger.error("Error creating kiosk worktime entry:", error);
    res.status(500).json({ message: "Failed to save time entry" });
  }
});

export default router;
