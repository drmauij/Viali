import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { db } from "../server/db";
import { dischargeMedicationTemplates, dischargeMedicationTemplateItems } from "@shared/schema";
import { eq } from "drizzle-orm";
import {
  getDischargeMedicationTemplates,
  createDischargeMedicationTemplate,
  deleteDischargeMedicationTemplate,
} from "../server/storage/anesthesia";

// Use known test data from the local DB
const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const TEST_ITEM_IDS = [
  "8e7073fd-3281-455f-9f50-a832d4145b7d", // Glucose 5%
  "db9761c8-e289-4ce1-b9d3-93c3534f14e3", // Propofol 1%
];

// Track created template IDs for cleanup
const createdTemplateIds: string[] = [];

afterAll(async () => {
  // Clean up any templates created during tests
  for (const id of createdTemplateIds) {
    await db
      .delete(dischargeMedicationTemplates)
      .where(eq(dischargeMedicationTemplates.id, id))
      .catch(() => {}); // ignore if already deleted
  }
  // Close DB pool
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("Discharge Medication Templates", () => {
  describe("createDischargeMedicationTemplate", () => {
    it("creates a template with items", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Test Template" },
        [
          { itemId: TEST_ITEM_IDS[0], quantity: 2, unitType: "packs" },
          { itemId: TEST_ITEM_IDS[1], quantity: 1, unitType: "pills", frequency: "1-0-1-0" },
        ],
      );
      createdTemplateIds.push(tmpl.id);

      expect(tmpl).toBeDefined();
      expect(tmpl.id).toBeTruthy();
      expect(tmpl.hospitalId).toBe(TEST_HOSPITAL_ID);
      expect(tmpl.name).toBe("Test Template");
      expect(tmpl.createdAt).toBeDefined();

      // Verify items were inserted
      const items = await db
        .select()
        .from(dischargeMedicationTemplateItems)
        .where(eq(dischargeMedicationTemplateItems.templateId, tmpl.id));
      expect(items).toHaveLength(2);
      expect(items[0].quantity).toBe(2);
      expect(items[1].frequency).toBe("1-0-1-0");
    });

    it("creates a template with optional fields null", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Minimal", createdBy: null },
        [{ itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" }],
      );
      createdTemplateIds.push(tmpl.id);

      expect(tmpl.createdBy).toBeNull();
    });

    it("creates a template with all optional item fields", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Full Fields" },
        [
          {
            itemId: TEST_ITEM_IDS[0],
            quantity: 3,
            unitType: "pills",
            administrationRoute: "p.o.",
            frequency: "1-1-1-0",
            notes: "Take with food",
          },
        ],
      );
      createdTemplateIds.push(tmpl.id);

      const items = await db
        .select()
        .from(dischargeMedicationTemplateItems)
        .where(eq(dischargeMedicationTemplateItems.templateId, tmpl.id));
      expect(items).toHaveLength(1);
      expect(items[0].administrationRoute).toBe("p.o.");
      expect(items[0].frequency).toBe("1-1-1-0");
      expect(items[0].notes).toBe("Take with food");
    });
  });

  describe("getDischargeMedicationTemplates", () => {
    let templateId: string;

    beforeAll(async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Lookup Test" },
        [
          { itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" },
          { itemId: TEST_ITEM_IDS[1], quantity: 2, unitType: "pills" },
        ],
      );
      templateId = tmpl.id;
      createdTemplateIds.push(tmpl.id);
    });

    it("returns templates with nested items and item details", async () => {
      const templates = await getDischargeMedicationTemplates(TEST_HOSPITAL_ID);
      const found = templates.find((t) => t.id === templateId);

      expect(found).toBeDefined();
      expect(found!.name).toBe("Lookup Test");
      expect(found!.items).toHaveLength(2);
      // Each item should include the joined `item` record
      expect(found!.items[0].item).toBeDefined();
      expect(found!.items[0].item.name).toBeTruthy();
    });

    it("returns templates sorted by name ascending", async () => {
      const templates = await getDischargeMedicationTemplates(TEST_HOSPITAL_ID);
      const names = templates.map((t) => t.name);
      const sorted = [...names].sort((a, b) => a.localeCompare(b));
      expect(names).toEqual(sorted);
    });

    it("returns empty array for non-existent hospital", async () => {
      const templates = await getDischargeMedicationTemplates("non-existent-id");
      expect(templates).toEqual([]);
    });
  });

  describe("deleteDischargeMedicationTemplate", () => {
    it("deletes template and cascades to items", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "To Delete" },
        [{ itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" }],
      );
      // Don't push to createdTemplateIds — we're about to delete it

      await deleteDischargeMedicationTemplate(tmpl.id);

      // Template should be gone
      const remaining = await db
        .select()
        .from(dischargeMedicationTemplates)
        .where(eq(dischargeMedicationTemplates.id, tmpl.id));
      expect(remaining).toHaveLength(0);

      // Items should also be gone (cascade delete)
      const items = await db
        .select()
        .from(dischargeMedicationTemplateItems)
        .where(eq(dischargeMedicationTemplateItems.templateId, tmpl.id));
      expect(items).toHaveLength(0);
    });

    it("does not throw when deleting non-existent template", async () => {
      // Should complete without error (no-op)
      await expect(
        deleteDischargeMedicationTemplate("non-existent-id"),
      ).resolves.not.toThrow();
    });
  });
});
