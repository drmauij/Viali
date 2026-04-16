import { db } from "../db";
import { lots, stockLevels } from "@shared/schema";
import { eq, and } from "drizzle-orm";

export interface CommitUsageEntry {
  itemId: string;
  lotId?: string | null;
  quantity: number;
}

export interface CommitUsageInput {
  hospitalId: string;
  unitId: string;
  entries: CommitUsageEntry[];
}

/**
 * Decrement inventory for a list of usage entries.
 * - When lotId is set: decrements lots.qty AND stockLevels.qtyOnHand for the item.
 * - When lotId is null: decrements only stockLevels.qtyOnHand.
 * - Quantities clamp to zero (no negative stock).
 */
export async function commitUsage(input: CommitUsageInput): Promise<void> {
  for (const entry of input.entries) {
    if (entry.quantity <= 0) continue;

    if (entry.lotId) {
      const [lot] = await db.select().from(lots).where(eq(lots.id, entry.lotId));
      if (!lot) {
        throw new Error(`commitUsage: lot ${entry.lotId} not found for item ${entry.itemId}`);
      }
      const newQty = Math.max(0, (lot.qty ?? 0) - entry.quantity);
      await db.update(lots).set({ qty: newQty }).where(eq(lots.id, entry.lotId));
    }

    const [stock] = await db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.itemId, entry.itemId),
          eq(stockLevels.unitId, input.unitId)
        )
      );
    if (stock) {
      const newQty = Math.max(0, (stock.qtyOnHand ?? 0) - entry.quantity);
      await db
        .update(stockLevels)
        .set({ qtyOnHand: newQty, updatedAt: new Date() })
        .where(eq(stockLevels.id, stock.id));
    } else {
      // No stock row exists; insert with 0 (decrement against 0 clamps to 0)
      await db.insert(stockLevels).values({
        itemId: entry.itemId,
        unitId: input.unitId,
        qtyOnHand: 0,
      });
    }
  }
}
