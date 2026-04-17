import { db } from "../db";
import {
  treatmentItemConfigs,
  type TreatmentItemConfig,
  type InsertTreatmentItemConfig,
} from "@shared/schema";
import { eq, and } from "drizzle-orm";

export const treatmentItemConfigsStorage = {
  async listByHospital(
    hospitalId: string,
    unitId?: string | null,
  ): Promise<TreatmentItemConfig[]> {
    const where = unitId
      ? and(
          eq(treatmentItemConfigs.hospitalId, hospitalId),
          eq(treatmentItemConfigs.unitId, unitId),
        )
      : eq(treatmentItemConfigs.hospitalId, hospitalId);
    return db
      .select()
      .from(treatmentItemConfigs)
      .where(where)
      .orderBy(treatmentItemConfigs.sortOrder);
  },

  async upsert(input: InsertTreatmentItemConfig): Promise<TreatmentItemConfig> {
    const [existing] = await db
      .select()
      .from(treatmentItemConfigs)
      .where(
        and(
          eq(treatmentItemConfigs.hospitalId, input.hospitalId),
          eq(treatmentItemConfigs.itemId, input.itemId),
        ),
      );
    if (existing) {
      const [updated] = await db
        .update(treatmentItemConfigs)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(treatmentItemConfigs.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await db
      .insert(treatmentItemConfigs)
      .values(input)
      .returning();
    return created;
  },

  async remove(id: string): Promise<void> {
    await db.delete(treatmentItemConfigs).where(eq(treatmentItemConfigs.id, id));
  },
};
