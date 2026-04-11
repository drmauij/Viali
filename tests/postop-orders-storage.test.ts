import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import {
  postopOrderTemplates,
  postopOrderSets,
  postopPlannedEvents,
  anesthesiaRecords,
  users,
} from "@shared/schema";
import { eq, inArray } from "drizzle-orm";
import { postopOrdersStorage } from "../server/storage/postopOrders";
import type { PostopOrderItem } from "@shared/postopOrderItems";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

// Track IDs for cleanup
const createdTemplateIds: string[] = [];
const createdOrderSetIds: string[] = [];

// Fetch a real anesthesia record for order-set tests
let testAnesthesiaRecordId: string | null = null;
let testUserId: string | null = null;

afterAll(async () => {
  // Clean up planned events (cascade from order sets, but be explicit)
  if (createdOrderSetIds.length > 0) {
    await db
      .delete(postopPlannedEvents)
      .where(inArray(postopPlannedEvents.orderSetId, createdOrderSetIds))
      .catch(() => {});
    await db
      .delete(postopOrderSets)
      .where(inArray(postopOrderSets.id, createdOrderSetIds))
      .catch(() => {});
  }
  for (const id of createdTemplateIds) {
    await db
      .delete(postopOrderTemplates)
      .where(eq(postopOrderTemplates.id, id))
      .catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

const sampleItems: PostopOrderItem[] = [
  { id: "item-1", type: "mobilization", value: "bedrest" },
  {
    id: "item-2",
    type: "vitals_monitoring",
    parameter: "BP",
    frequency: "q1h",
  },
];

describe("Postop Orders Storage", () => {
  // --- Templates ---
  describe("createTemplate", () => {
    it("creates a template and returns correct data", async () => {
      const tmpl = await postopOrdersStorage.createTemplate({
        hospitalId: TEST_HOSPITAL_ID,
        name: "Test Postop Template",
        description: "A test template",
        items: sampleItems,
        sortOrder: 5,
        procedureCode: "KNEE-R",
      });
      createdTemplateIds.push(tmpl.id);

      expect(tmpl).toBeDefined();
      expect(tmpl.id).toBeTruthy();
      expect(tmpl.hospitalId).toBe(TEST_HOSPITAL_ID);
      expect(tmpl.name).toBe("Test Postop Template");
      expect(tmpl.description).toBe("A test template");
      expect(tmpl.items).toHaveLength(2);
      expect(tmpl.sortOrder).toBe(5);
      expect(tmpl.procedureCode).toBe("KNEE-R");
      expect(tmpl.createdAt).toBeDefined();
    });
  });

  describe("listTemplates", () => {
    it("returns templates filtered by hospitalId", async () => {
      const list = await postopOrdersStorage.listTemplates(TEST_HOSPITAL_ID);
      expect(list.length).toBeGreaterThanOrEqual(1);
      for (const t of list) {
        expect(t.hospitalId).toBe(TEST_HOSPITAL_ID);
      }
    });

    it("returns empty for unknown hospitalId", async () => {
      const list = await postopOrdersStorage.listTemplates(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(list).toHaveLength(0);
    });
  });

  describe("getTemplate", () => {
    it("retrieves a template by ID", async () => {
      const id = createdTemplateIds[0];
      const tmpl = await postopOrdersStorage.getTemplate(id);
      expect(tmpl).not.toBeNull();
      expect(tmpl!.id).toBe(id);
      expect(tmpl!.name).toBe("Test Postop Template");
    });

    it("returns null for non-existent ID", async () => {
      const tmpl = await postopOrdersStorage.getTemplate(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(tmpl).toBeNull();
    });
  });

  describe("updateTemplate", () => {
    it("patches the template name", async () => {
      const id = createdTemplateIds[0];
      const updated = await postopOrdersStorage.updateTemplate(id, {
        name: "Updated Postop Template",
      });
      expect(updated.name).toBe("Updated Postop Template");
      expect(updated.id).toBe(id);
      // description should be unchanged
      expect(updated.description).toBe("A test template");
    });
  });

  describe("deleteTemplate", () => {
    it("deletes a template", async () => {
      // Create a throwaway template to delete
      const tmpl = await postopOrdersStorage.createTemplate({
        hospitalId: TEST_HOSPITAL_ID,
        name: "To Delete",
        items: [],
      });

      await postopOrdersStorage.deleteTemplate(tmpl.id);
      const gone = await postopOrdersStorage.getTemplate(tmpl.id);
      expect(gone).toBeNull();
      // No need to track for cleanup since it's already deleted
    });
  });

  // --- Order sets & planned events (need a real anesthesia record) ---
  describe("upsertOrderSet", () => {
    it("creates an order set on first call and updates on second", async () => {
      // Fetch a real anesthesia record and user
      const [[rec], [user]] = await Promise.all([
        db.select({ id: anesthesiaRecords.id }).from(anesthesiaRecords).limit(1),
        db.select({ id: users.id }).from(users).limit(1),
      ]);

      if (!rec) {
        console.warn(
          "No anesthesia records in dev DB — skipping order set tests",
        );
        return;
      }
      testAnesthesiaRecordId = rec.id;
      testUserId = user?.id ?? null;

      // First call: creates
      const os1 = await postopOrdersStorage.upsertOrderSet(rec.id, {
        items: sampleItems,
      });
      createdOrderSetIds.push(os1.id);

      expect(os1).toBeDefined();
      expect(os1.anesthesiaRecordId).toBe(rec.id);
      expect(os1.items).toHaveLength(2);
      expect(os1.signedBy).toBeNull();

      // Second call: updates (same ID returned)
      const updatedItems: PostopOrderItem[] = [
        { id: "item-1", type: "mobilization", value: "assisted" },
      ];
      const os2 = await postopOrdersStorage.upsertOrderSet(rec.id, {
        items: updatedItems,
      });

      expect(os2.id).toBe(os1.id);
      expect(os2.items).toHaveLength(1);
      expect((os2.items as PostopOrderItem[])[0].type).toBe("mobilization");
    });
  });

  describe("replacePlannedEvents", () => {
    it("replaces planned events idempotently", async () => {
      if (!testAnesthesiaRecordId) {
        console.warn(
          "No anesthesia record — skipping planned events tests",
        );
        return;
      }

      const os = await postopOrdersStorage.getOrderSetByRecord(
        testAnesthesiaRecordId,
      );
      expect(os).not.toBeNull();
      const orderSetId = os!.id;

      const now = Date.now();
      const events = [
        {
          itemId: "item-2",
          kind: "vitals_check" as const,
          plannedAt: now,
          payloadSnapshot: { parameter: "BP", frequency: "q1h" },
        },
        {
          itemId: "item-2",
          kind: "vitals_check" as const,
          plannedAt: now + 3600_000,
          payloadSnapshot: { parameter: "BP", frequency: "q1h" },
        },
      ];

      // First call
      await postopOrdersStorage.replacePlannedEvents(orderSetId, events);
      const list1 = await postopOrdersStorage.listPlannedEvents(orderSetId);
      expect(list1).toHaveLength(2);

      // Second call (idempotent — should still be 2, not 4)
      await postopOrdersStorage.replacePlannedEvents(orderSetId, events);
      const list2 = await postopOrdersStorage.listPlannedEvents(orderSetId);
      expect(list2).toHaveLength(2);
    });
  });

  describe("markEventDone", () => {
    it("changes status from planned to done", async () => {
      if (!testAnesthesiaRecordId || !testUserId) {
        console.warn("No anesthesia record or user — skipping markEventDone test");
        return;
      }

      const os = await postopOrdersStorage.getOrderSetByRecord(
        testAnesthesiaRecordId,
      );
      const list = await postopOrdersStorage.listPlannedEvents(os!.id);
      expect(list.length).toBeGreaterThanOrEqual(1);

      const eventToMark = list[0];
      expect(eventToMark.status).toBe("planned");

      const done = await postopOrdersStorage.markEventDone(
        eventToMark.id,
        testUserId,
        { notes: "Checked BP" },
      );

      expect(done.status).toBe("done");
      expect(done.doneAt).toBeDefined();
      expect(done.doneBy).toBe(testUserId);
      expect(done.doneValue).toEqual({ notes: "Checked BP" });
    });
  });
});
