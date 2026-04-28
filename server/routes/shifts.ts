import { Router } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, requireAdminWriteAccess } from "../utils";
import { storage } from "../storage";
import { db } from "../db";
import { staffShifts, dailyStaffPool, users } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { isValidWorkerEmail } from "../lib/emailFilter";

const router = Router();

// ── Shift Types ───────────────────────────────────────────────────────────────

const shiftTypeBodySchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(4),
  color: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  icon: z.string().nullable().optional(),
  unitId: z.string().nullable().optional(),
  sortOrder: z.number().int().default(0),
});

// GET /api/shift-types/:hospitalId
router.get("/api/shift-types/:hospitalId", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const types = await storage.getShiftTypes(hospitalId);
    res.json(types);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch shift types" });
  }
});

// POST /api/shift-types/:hospitalId
router.post("/api/shift-types/:hospitalId", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = shiftTypeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", errors: parsed.error.issues });
    }
    const created = await storage.createShiftType({ ...parsed.data, hospitalId });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ message: "Failed to create shift type" });
  }
});

// PATCH /api/shift-types/:id
router.patch("/api/shift-types/:id", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const parsed = shiftTypeBodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", errors: parsed.error.issues });
    }
    const updated = await storage.updateShiftType(id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Shift type not found" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Failed to update shift type" });
  }
});

// DELETE /api/shift-types/:id
router.delete("/api/shift-types/:id", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const result = await storage.deleteShiftType(id);
    if (!result.deleted) {
      return res.status(409).json({ message: "Shift type is in use", usageCount: result.usageCount });
    }
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ message: "Failed to delete shift type" });
  }
});

// ── Staff Shifts ──────────────────────────────────────────────────────────────

// GET /api/staff-shifts/:hospitalId?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get("/api/staff-shifts/:hospitalId", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { from, to } = req.query as { from?: string; to?: string };
    if (!from || !to) {
      return res.status(400).json({ message: "from and to query params are required" });
    }
    const shifts = await storage.getStaffShiftsRange(hospitalId, from, to);
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch staff shifts" });
  }
});

// POST /api/staff-shifts/:hospitalId
router.post("/api/staff-shifts/:hospitalId", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { userId, date, shiftTypeId } = req.body;
    if (!userId || !date || !shiftTypeId) {
      return res.status(400).json({ message: "userId, date and shiftTypeId are required" });
    }
    const shift = await storage.upsertStaffShift({ userId, date, shiftTypeId, hospitalId, createdBy: req.user.id });
    res.status(201).json(shift);
  } catch (err) {
    res.status(500).json({ message: "Failed to upsert staff shift" });
  }
});

// DELETE /api/staff-shifts/:id
router.delete("/api/staff-shifts/:id", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    await storage.deleteStaffShiftById(id);
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ message: "Failed to delete staff shift" });
  }
});

// ── Combined atomic assign ────────────────────────────────────────────────────

const assignBodySchema = z.object({
  userId: z.string(),
  date: z.string(),
  shiftTypeId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});

async function performAssign(
  tx: typeof db,
  hospitalId: string,
  userId: string,
  date: string,
  shiftTypeId: string | null | undefined,
  role: string | null | undefined,
  createdBy: string,
) {
  // Handle staffShifts
  if (!shiftTypeId) {
    await tx.delete(staffShifts).where(
      and(
        eq(staffShifts.hospitalId, hospitalId),
        eq(staffShifts.userId, userId),
        eq(staffShifts.date, date),
      ),
    );
  } else {
    await tx
      .insert(staffShifts)
      .values({ hospitalId, userId, date, shiftTypeId, createdBy })
      .onConflictDoUpdate({
        target: [staffShifts.hospitalId, staffShifts.userId, staffShifts.date],
        set: { shiftTypeId, updatedAt: new Date(), createdBy },
      });
  }

  // Handle dailyStaffPool
  if (!role) {
    await tx.delete(dailyStaffPool).where(
      and(
        eq(dailyStaffPool.hospitalId, hospitalId),
        eq(dailyStaffPool.userId, userId),
        eq(dailyStaffPool.date, date),
      ),
    );
  } else {
    // Look up user name
    const [user] = await tx
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, userId));
    const name = `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || "TBD";

    // Delete existing entry first (no unique constraint on hospitalId+userId+date)
    await tx.delete(dailyStaffPool).where(
      and(
        eq(dailyStaffPool.hospitalId, hospitalId),
        eq(dailyStaffPool.userId, userId),
        eq(dailyStaffPool.date, date),
      ),
    );

    await tx.insert(dailyStaffPool).values({
      hospitalId,
      date,
      userId,
      name,
      role: role as any,
      createdBy,
    });
  }
}

// POST /api/staff-shifts/:hospitalId/assign
router.post("/api/staff-shifts/:hospitalId/assign", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const parsed = assignBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", errors: parsed.error.issues });
    }
    const { userId, date, shiftTypeId, role } = parsed.data;

    await db.transaction(async (tx) => {
      await performAssign(tx as any, hospitalId, userId, date, shiftTypeId, role, req.user.id);
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: "Failed to assign shift" });
  }
});

// POST /api/staff-shifts/:hospitalId/assign/bulk
router.post("/api/staff-shifts/:hospitalId/assign/bulk", isAuthenticated, requireWriteAccess, requireAdminWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const itemsSchema = z.object({
      items: z.array(
        z.object({
          userId: z.string(),
          date: z.string(),
          shiftTypeId: z.string().nullable().optional(),
          role: z.string().nullable().optional(),
        }),
      ),
    });
    const parsed = itemsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid body", errors: parsed.error.issues });
    }

    console.log('[bulk assign]', JSON.stringify(parsed.data.items));
    await db.transaction(async (tx) => {
      for (const item of parsed.data.items) {
        await performAssign(tx as any, hospitalId, item.userId, item.date, item.shiftTypeId, item.role, req.user.id);
      }
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('[bulk assign error]', err);
    res.status(500).json({ message: "Failed to bulk assign shifts" });
  }
});

// ── Month-PDF email distribution ──────────────────────────────────────────────

router.get(
  "/api/staff-shifts/:hospitalId/email-month-pdf/recipients",
  isAuthenticated,
  requireWriteAccess,
  requireAdminWriteAccess,
  async (req: any, res) => {
    try {
      const { hospitalId } = req.params;
      const unitId = req.query.unitId as string | undefined;
      if (!unitId) {
        return res.status(400).json({ message: "unitId query parameter is required" });
      }

      const providers = await storage.getBookableProvidersByUnit(unitId);
      const valid: string[] = [];
      let skipped = 0;
      for (const p of providers) {
        const email = (p as any).user?.email;
        if (isValidWorkerEmail(email)) {
          valid.push(email.trim());
        } else {
          skipped += 1;
        }
      }
      res.json({ valid, skipped });
    } catch (err) {
      res.status(500).json({ message: "Failed to fetch recipients" });
    }
  },
);

export default router;
