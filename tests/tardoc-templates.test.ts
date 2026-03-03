import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { tardocInvoiceTemplates, tardocInvoiceTemplateItems } from "@shared/schema";
import { eq } from "drizzle-orm";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";
const createdIds: string[] = [];

afterAll(async () => {
  for (const id of createdIds) {
    await db.delete(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.id, id))
      .catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("TARDOC Invoice Templates", () => {
  it("creates a template with items", async () => {
    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Test Day Surgery + GA",
      billingModel: "TG",
      lawType: "KVG",
    }).returning();
    createdIds.push(template.id);

    await db.insert(tardocInvoiceTemplateItems).values([
      {
        templateId: template.id,
        tardocCode: "00.0010",
        description: "Test consultation",
        taxPoints: "20.00",
        quantity: 1,
        sortOrder: 0,
      },
      {
        templateId: template.id,
        tardocCode: "00.0020",
        description: "Test anesthesia base",
        taxPoints: "50.00",
        quantity: 1,
        sortOrder: 1,
      },
    ]);

    const items = await db.select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, template.id));

    expect(template.name).toBe("Test Day Surgery + GA");
    expect(items).toHaveLength(2);
    expect(items[0].tardocCode).toBe("00.0010");
  });

  it("cascade deletes items when template deleted", async () => {
    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId: TEST_HOSPITAL_ID,
      name: "Cascade Test",
    }).returning();

    await db.insert(tardocInvoiceTemplateItems).values({
      templateId: template.id,
      tardocCode: "00.0099",
      description: "Test item",
      quantity: 1,
      sortOrder: 0,
    });

    await db.delete(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.id, template.id));

    const orphanItems = await db.select()
      .from(tardocInvoiceTemplateItems)
      .where(eq(tardocInvoiceTemplateItems.templateId, template.id));
    expect(orphanItems).toHaveLength(0);
  });
});
