import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import {
  patients,
  patientDischargeMedications,
  patientDischargeMedicationItems,
  dischargeMedicationTemplates,
  dischargeMedicationTemplateItems,
  items,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  createPatientDischargeMedication,
  updatePatientDischargeMedication,
  getPatientDischargeMedication,
  createDischargeMedicationTemplate,
  getDischargeMedicationTemplates,
} from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const TEST_ITEM_IDS = [
  "8e7073fd-3281-455f-9f50-a832d4145b7d", // Glucose 5%
];

// Track IDs for cleanup
const createdPatientIds: string[] = [];
const createdSlotIds: string[] = [];
const createdTemplateIds: string[] = [];

async function createTestPatient() {
  const [p] = await db
    .insert(patients)
    .values({
      hospitalId: TEST_HOSPITAL_ID,
      patientNumber: `TEST-${nanoid(8)}`,
      surname: "CustomMedTest",
      firstName: "Patient",
      birthday: "2000-01-01",
      sex: "M",
    })
    .returning();
  createdPatientIds.push(p.id);
  return p;
}

afterAll(async () => {
  // Clean up in reverse dependency order
  for (const id of createdSlotIds) {
    await db.delete(patientDischargeMedications).where(eq(patientDischargeMedications.id, id)).catch(() => {});
  }
  for (const id of createdTemplateIds) {
    await db.delete(dischargeMedicationTemplates).where(eq(dischargeMedicationTemplates.id, id)).catch(() => {});
  }
  for (const id of createdPatientIds) {
    await db.delete(patients).where(eq(patients.id, id)).catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("Custom (free-text) Medications", () => {
  describe("createPatientDischargeMedication", () => {
    it("creates a discharge medication with a custom (no itemId) item", async () => {
      const patient = await createTestPatient();
      const slot = await createPatientDischargeMedication(
        { patientId: patient.id, hospitalId: TEST_HOSPITAL_ID },
        [
          { itemId: null, customName: "Ibuprofen 400mg", quantity: 2, unitType: "packs" },
        ],
      );
      createdSlotIds.push(slot.id);

      expect(slot).toBeDefined();
      expect(slot.id).toBeTruthy();

      const dbItems = await db
        .select()
        .from(patientDischargeMedicationItems)
        .where(eq(patientDischargeMedicationItems.dischargeMedicationId, slot.id));
      expect(dbItems).toHaveLength(1);
      expect(dbItems[0].itemId).toBeNull();
      expect(dbItems[0].customName).toBe("Ibuprofen 400mg");
      expect(dbItems[0].quantity).toBe(2);
    });

    it("does not deduct inventory for custom items", async () => {
      const patient = await createTestPatient();
      // Get current stock level of the test item for comparison
      const [itemBefore] = await db.select().from(items).where(eq(items.id, TEST_ITEM_IDS[0]));

      const slot = await createPatientDischargeMedication(
        { patientId: patient.id, hospitalId: TEST_HOSPITAL_ID },
        [
          { itemId: null, customName: "Custom Med No Deduction", quantity: 5, unitType: "packs" },
        ],
      );
      createdSlotIds.push(slot.id);

      // Stock should be unchanged since custom items skip inventory
      const [itemAfter] = await db.select().from(items).where(eq(items.id, TEST_ITEM_IDS[0]));
      expect(itemAfter.currentUnits).toBe(itemBefore.currentUnits);
    });

    it("creates a mix of inventory and custom items", async () => {
      const patient = await createTestPatient();
      const slot = await createPatientDischargeMedication(
        { patientId: patient.id, hospitalId: TEST_HOSPITAL_ID },
        [
          { itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" },
          { itemId: null, customName: "Aspirin 100mg", quantity: 3, unitType: "pills" },
        ],
      );
      createdSlotIds.push(slot.id);

      const dbItems = await db
        .select()
        .from(patientDischargeMedicationItems)
        .where(eq(patientDischargeMedicationItems.dischargeMedicationId, slot.id));
      expect(dbItems).toHaveLength(2);

      const inventoryItem = dbItems.find(i => i.itemId !== null);
      const customItem = dbItems.find(i => i.itemId === null);
      expect(inventoryItem).toBeDefined();
      expect(inventoryItem!.itemId).toBe(TEST_ITEM_IDS[0]);
      expect(customItem).toBeDefined();
      expect(customItem!.customName).toBe("Aspirin 100mg");
    });
  });

  describe("getPatientDischargeMedication", () => {
    it("returns custom items with null item join", async () => {
      const patient = await createTestPatient();
      const slot = await createPatientDischargeMedication(
        { patientId: patient.id, hospitalId: TEST_HOSPITAL_ID },
        [
          { itemId: null, customName: "Free Text Med", quantity: 1, unitType: "packs" },
          { itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" },
        ],
      );
      createdSlotIds.push(slot.id);

      const fetched = await getPatientDischargeMedication(slot.id);
      expect(fetched).toBeDefined();
      expect(fetched!.items).toHaveLength(2);

      const customItem = fetched!.items.find(i => i.itemId === null);
      const inventoryItem = fetched!.items.find(i => i.itemId !== null);

      expect(customItem).toBeDefined();
      expect(customItem!.customName).toBe("Free Text Med");
      expect(customItem!.item).toBeNull();

      expect(inventoryItem).toBeDefined();
      expect(inventoryItem!.item).not.toBeNull();
      expect(inventoryItem!.item!.name).toBeTruthy();
    });
  });

  describe("updatePatientDischargeMedication", () => {
    it("handles update with mix of inventory and custom items", async () => {
      const patient = await createTestPatient();
      // Create with one inventory item
      const slot = await createPatientDischargeMedication(
        { patientId: patient.id, hospitalId: TEST_HOSPITAL_ID },
        [{ itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" }],
      );
      createdSlotIds.push(slot.id);

      // Update: replace with one custom item
      await updatePatientDischargeMedication(
        slot.id,
        {},
        [{ itemId: null, customName: "Replaced With Custom", quantity: 2, unitType: "packs" }],
      );

      const fetched = await getPatientDischargeMedication(slot.id);
      expect(fetched!.items).toHaveLength(1);
      expect(fetched!.items[0].itemId).toBeNull();
      expect(fetched!.items[0].customName).toBe("Replaced With Custom");
    });
  });

  describe("Discharge Medication Templates with custom items", () => {
    it("creates a template with custom items", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Custom Items Template" },
        [
          { itemId: TEST_ITEM_IDS[0], quantity: 1, unitType: "packs" },
          { itemId: null, customName: "Homeopathic Remedy", quantity: 1, unitType: "packs" },
        ],
      );
      createdTemplateIds.push(tmpl.id);
      expect(tmpl.id).toBeTruthy();

      const dbItems = await db
        .select()
        .from(dischargeMedicationTemplateItems)
        .where(eq(dischargeMedicationTemplateItems.templateId, tmpl.id));
      expect(dbItems).toHaveLength(2);

      const customItem = dbItems.find(i => i.itemId === null);
      expect(customItem).toBeDefined();
      expect(customItem!.customName).toBe("Homeopathic Remedy");
    });

    it("getDischargeMedicationTemplates returns custom items via left join", async () => {
      const tmpl = await createDischargeMedicationTemplate(
        { hospitalId: TEST_HOSPITAL_ID, name: "Lookup Custom Template" },
        [
          { itemId: null, customName: "Custom Only Item", quantity: 2, unitType: "pills" },
        ],
      );
      createdTemplateIds.push(tmpl.id);

      const templates = await getDischargeMedicationTemplates(TEST_HOSPITAL_ID);
      const found = templates.find(t => t.id === tmpl.id);

      expect(found).toBeDefined();
      expect(found!.items).toHaveLength(1);
      expect(found!.items[0].customName).toBe("Custom Only Item");
      expect(found!.items[0].item).toBeNull();
    });
  });
});
