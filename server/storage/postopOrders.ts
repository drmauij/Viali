import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import {
  postopOrderTemplates,
  postopOrderSets,
  postopPlannedEvents,
  type PostopOrderTemplate,
  type PostopOrderSet,
  type PostopPlannedEvent,
} from '@shared/schema';
import type { PostopOrderItem } from '@shared/postopOrderItems';
import type { PlannedEvent } from '@shared/postopOrderPlanning';

export const postopOrdersStorage = {
  // --- Templates ---
  async listTemplates(hospitalId: string): Promise<PostopOrderTemplate[]> {
    return db.select().from(postopOrderTemplates)
      .where(eq(postopOrderTemplates.hospitalId, hospitalId))
      .orderBy(postopOrderTemplates.sortOrder);
  },

  async getTemplate(id: string): Promise<PostopOrderTemplate | null> {
    const rows = await db.select().from(postopOrderTemplates).where(eq(postopOrderTemplates.id, id));
    return rows[0] ?? null;
  },

  async createTemplate(input: {
    hospitalId: string; name: string; description?: string;
    items: PostopOrderItem[]; sortOrder?: number; procedureCode?: string;
  }): Promise<PostopOrderTemplate> {
    const [row] = await db.insert(postopOrderTemplates).values({
      hospitalId: input.hospitalId,
      name: input.name,
      description: input.description,
      items: input.items,
      sortOrder: input.sortOrder ?? 0,
      procedureCode: input.procedureCode,
    }).returning();
    return row;
  },

  async updateTemplate(id: string, patch: Partial<Pick<PostopOrderTemplate, 'name' | 'description' | 'items' | 'sortOrder' | 'procedureCode'>>): Promise<PostopOrderTemplate> {
    const [row] = await db.update(postopOrderTemplates)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(postopOrderTemplates.id, id))
      .returning();
    return row;
  },

  async deleteTemplate(id: string): Promise<void> {
    await db.delete(postopOrderTemplates).where(eq(postopOrderTemplates.id, id));
  },

  // --- Order sets ---
  async getOrderSetByRecord(anesthesiaRecordId: string): Promise<PostopOrderSet | null> {
    const rows = await db.select().from(postopOrderSets)
      .where(eq(postopOrderSets.anesthesiaRecordId, anesthesiaRecordId));
    return rows[0] ?? null;
  },

  async upsertOrderSet(
    anesthesiaRecordId: string,
    input: { items: PostopOrderItem[]; templateId?: string | null; signedBy?: string | null },
  ): Promise<PostopOrderSet> {
    const existing = await this.getOrderSetByRecord(anesthesiaRecordId);
    if (existing) {
      const [row] = await db.update(postopOrderSets)
        .set({
          items: input.items,
          templateId: input.templateId ?? existing.templateId,
          signedBy: input.signedBy ?? existing.signedBy,
          signedAt: input.signedBy ? new Date() : existing.signedAt,
          updatedAt: new Date(),
        })
        .where(eq(postopOrderSets.id, existing.id))
        .returning();
      return row;
    }
    const [row] = await db.insert(postopOrderSets).values({
      anesthesiaRecordId,
      templateId: input.templateId ?? null,
      items: input.items,
      signedBy: input.signedBy ?? null,
      signedAt: input.signedBy ? new Date() : null,
    }).returning();
    return row;
  },

  // --- Planned events ---
  async listPlannedEvents(orderSetId: string): Promise<PostopPlannedEvent[]> {
    return db.select().from(postopPlannedEvents)
      .where(eq(postopPlannedEvents.orderSetId, orderSetId))
      .orderBy(postopPlannedEvents.plannedAt);
  },

  async replacePlannedEvents(orderSetId: string, events: PlannedEvent[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.delete(postopPlannedEvents).where(and(
        eq(postopPlannedEvents.orderSetId, orderSetId),
        eq(postopPlannedEvents.status, 'planned'),
      ));
      if (events.length === 0) return;
      await tx.insert(postopPlannedEvents).values(events.map(e => ({
        orderSetId,
        itemId: e.itemId,
        kind: e.kind,
        plannedAt: new Date(e.plannedAt),
        plannedEndAt: e.plannedEndAt ? new Date(e.plannedEndAt) : null,
        payloadSnapshot: e.payloadSnapshot as object,
      })));
    });
  },

  async markEventDone(eventId: string, userId: string, doneValue?: unknown): Promise<PostopPlannedEvent> {
    const [row] = await db.update(postopPlannedEvents)
      .set({ status: 'done', doneAt: new Date(), doneBy: userId, doneValue: (doneValue ?? null) as object | null })
      .where(eq(postopPlannedEvents.id, eventId))
      .returning();
    return row;
  },
};
