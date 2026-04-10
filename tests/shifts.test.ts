import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { shiftTypes, staffShifts, users } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  getShiftTypes,
  createShiftType,
  updateShiftType,
  deleteShiftType,
  getStaffShiftsRange,
  upsertStaffShift,
  clearStaffShift,
} from "../server/storage/shifts";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdShiftTypeIds: string[] = [];
const createdStaffShiftIds: string[] = [];

afterAll(async () => {
  for (const id of createdStaffShiftIds) {
    await db.delete(staffShifts).where(eq(staffShifts.id, id)).catch(() => {});
  }
  for (const id of createdShiftTypeIds) {
    await db.delete(shiftTypes).where(eq(shiftTypes.id, id)).catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("Shifts", () => {
  let testUserId: string;
  let shiftTypeId: string;

  // Resolve a real user id before tests run
  it("resolves a test user from the DB", async () => {
    const [testUser] = await db.select({ id: users.id }).from(users).limit(1);
    expect(testUser).toBeDefined();
    testUserId = testUser.id;
  });

  // ── ShiftType CRUD ──────────────────────────────────────────────────────────

  describe("createShiftType", () => {
    it("creates a shift type and returns it with all expected fields", async () => {
      const created = await createShiftType({
        hospitalId: TEST_HOSPITAL_ID,
        name: "Test Early Shift",
        code: "TE",
        color: "#FF0000",
        startTime: "06:00",
        endTime: "14:00",
        sortOrder: 1,
      });

      createdShiftTypeIds.push(created.id);
      shiftTypeId = created.id;

      expect(created.id).toBeTruthy();
      expect(created.hospitalId).toBe(TEST_HOSPITAL_ID);
      expect(created.name).toBe("Test Early Shift");
      expect(created.code).toBe("TE");
      expect(created.color).toBe("#FF0000");
      expect(created.startTime).toBe("06:00");
      expect(created.endTime).toBe("14:00");
      expect(created.sortOrder).toBe(1);
    });
  });

  describe("getShiftTypes", () => {
    it("returns shift types for the hospital ordered by sortOrder", async () => {
      // Create a second type with lower sortOrder so we can verify ordering
      const second = await createShiftType({
        hospitalId: TEST_HOSPITAL_ID,
        name: "Test Late Shift",
        code: "TL",
        color: "#0000FF",
        startTime: "14:00",
        endTime: "22:00",
        sortOrder: 0,
      });
      createdShiftTypeIds.push(second.id);

      const types = await getShiftTypes(TEST_HOSPITAL_ID);
      expect(Array.isArray(types)).toBe(true);

      // Find both test types
      const testTypes = types.filter((t) => createdShiftTypeIds.includes(t.id));
      expect(testTypes.length).toBeGreaterThanOrEqual(2);

      // sortOrder 0 (TL) should come before sortOrder 1 (TE)
      const idxTL = types.findIndex((t) => t.id === second.id);
      const idxTE = types.findIndex((t) => t.id === shiftTypeId);
      expect(idxTL).toBeLessThan(idxTE);
    });
  });

  describe("updateShiftType", () => {
    it("updates the name and returns the updated row", async () => {
      const updated = await updateShiftType(shiftTypeId, { name: "Updated Early Shift" });
      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(shiftTypeId);
      expect(updated!.name).toBe("Updated Early Shift");
    });

    it("returns null for a non-existent id", async () => {
      const result = await updateShiftType("00000000-0000-0000-0000-000000000000", { name: "Ghost" });
      expect(result).toBeNull();
    });
  });

  // ── StaffShifts ─────────────────────────────────────────────────────────────

  describe("upsertStaffShift", () => {
    it("inserts a new staff shift", async () => {
      const shift = await upsertStaffShift({
        hospitalId: TEST_HOSPITAL_ID,
        userId: testUserId,
        date: "2099-01-15",
        shiftTypeId,
        createdBy: testUserId,
      });

      createdStaffShiftIds.push(shift.id);

      expect(shift.id).toBeTruthy();
      expect(shift.hospitalId).toBe(TEST_HOSPITAL_ID);
      expect(shift.userId).toBe(testUserId);
      expect(shift.date).toBe("2099-01-15");
      expect(shift.shiftTypeId).toBe(shiftTypeId);
    });

    it("upserts with a different shiftTypeId for the same user+date (no throw, updates)", async () => {
      // Create a second shift type to switch to
      const second = await createShiftType({
        hospitalId: TEST_HOSPITAL_ID,
        name: "Test Night Shift",
        code: "TN",
        color: "#222222",
        startTime: "22:00",
        endTime: "06:00",
        sortOrder: 99,
      });
      createdShiftTypeIds.push(second.id);

      // Upsert same userId+date with different shiftTypeId
      const upserted = await upsertStaffShift({
        hospitalId: TEST_HOSPITAL_ID,
        userId: testUserId,
        date: "2099-01-15",
        shiftTypeId: second.id,
        createdBy: testUserId,
      });

      // Should still be the same record (same id or new id via upsert)
      expect(upserted.shiftTypeId).toBe(second.id);
      // Track by id in case a new row was returned
      if (!createdStaffShiftIds.includes(upserted.id)) {
        createdStaffShiftIds.push(upserted.id);
      }
    });
  });

  describe("getStaffShiftsRange", () => {
    it("returns shifts within the date range", async () => {
      const shifts = await getStaffShiftsRange(TEST_HOSPITAL_ID, "2099-01-01", "2099-01-31");
      expect(Array.isArray(shifts)).toBe(true);
      const found = shifts.find((s) => s.userId === testUserId && s.date === "2099-01-15");
      expect(found).toBeDefined();
    });

    it("does not return shifts outside the date range", async () => {
      const shifts = await getStaffShiftsRange(TEST_HOSPITAL_ID, "2099-02-01", "2099-02-28");
      const found = shifts.find((s) => s.userId === testUserId && s.date === "2099-01-15");
      expect(found).toBeUndefined();
    });
  });

  describe("clearStaffShift", () => {
    it("deletes the staff shift assignment", async () => {
      await clearStaffShift(TEST_HOSPITAL_ID, testUserId, "2099-01-15");

      const shifts = await getStaffShiftsRange(TEST_HOSPITAL_ID, "2099-01-01", "2099-01-31");
      const found = shifts.find((s) => s.userId === testUserId && s.date === "2099-01-15");
      expect(found).toBeUndefined();
    });
  });

  // ── deleteShiftType ─────────────────────────────────────────────────────────

  describe("deleteShiftType", () => {
    it("blocks deletion when shift type is in use", async () => {
      // Re-assign the shift so the type is in use
      const activeShift = await upsertStaffShift({
        hospitalId: TEST_HOSPITAL_ID,
        userId: testUserId,
        date: "2099-01-20",
        shiftTypeId,
        createdBy: testUserId,
      });
      createdStaffShiftIds.push(activeShift.id);

      const result = await deleteShiftType(shiftTypeId);
      expect(result.deleted).toBe(false);
      expect(result.usageCount).toBeGreaterThanOrEqual(1);
    });

    it("allows deletion after clearing the usage", async () => {
      // Clear the assignment first
      await clearStaffShift(TEST_HOSPITAL_ID, testUserId, "2099-01-20");

      const result = await deleteShiftType(shiftTypeId);
      expect(result.deleted).toBe(true);
      expect(result.usageCount).toBe(0);

      // Remove from cleanup list since it's already gone
      const idx = createdShiftTypeIds.indexOf(shiftTypeId);
      if (idx !== -1) createdShiftTypeIds.splice(idx, 1);
    });
  });

  describe("unique constraint / upsert idempotency", () => {
    it("assigning the same user+date twice upserts without throwing", async () => {
      // Use a fresh shift type
      const type = await createShiftType({
        hospitalId: TEST_HOSPITAL_ID,
        name: "Test Upsert Shift",
        code: "TU",
        color: "#AAAAAA",
        startTime: "08:00",
        endTime: "16:00",
        sortOrder: 50,
      });
      createdShiftTypeIds.push(type.id);

      const first = await upsertStaffShift({
        hospitalId: TEST_HOSPITAL_ID,
        userId: testUserId,
        date: "2099-03-10",
        shiftTypeId: type.id,
        createdBy: testUserId,
      });
      createdStaffShiftIds.push(first.id);

      // Second upsert with same user+date — must not throw
      await expect(
        upsertStaffShift({
          hospitalId: TEST_HOSPITAL_ID,
          userId: testUserId,
          date: "2099-03-10",
          shiftTypeId: type.id,
          createdBy: testUserId,
        }),
      ).resolves.not.toThrow();

      // Clean up
      await clearStaffShift(TEST_HOSPITAL_ID, testUserId, "2099-03-10");
    });
  });
});
