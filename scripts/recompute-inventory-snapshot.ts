/**
 * One-shot helper: delete today's inventory_snapshots rows (which may be
 * inflated by service-only items per the bug fixed in worker.ts) and let
 * the worker re-capture them on its next tick. If the worker is not
 * running, this script also performs the snapshot inline so the dashboard
 * reflects the corrected values immediately.
 *
 * Usage:
 *   npx tsx scripts/recompute-inventory-snapshot.ts                 # all hospitals
 *   RECOMPUTE_HOSPITAL_ID=<id> npx tsx scripts/recompute-inventory-snapshot.ts
 */
import 'dotenv/config';
import { db } from '../server/db';
import { hospitals, units, items, stockLevels, supplierCodes, inventorySnapshots } from '../shared/schema';
import { and, eq, inArray, isNull, or } from 'drizzle-orm';

export interface RecomputeStats {
  hospitalsScanned: number;
  unitsRecomputed: number;
  itemsCounted: number;
  totalValue: number;
}

export async function recomputeToday(opts: { hospitalId?: string } = {}): Promise<RecomputeStats> {
  const today = new Date().toISOString().split('T')[0];

  const allHospitals = opts.hospitalId
    ? await db.select().from(hospitals).where(eq(hospitals.id, opts.hospitalId))
    : await db.select().from(hospitals);

  const stats: RecomputeStats = { hospitalsScanned: 0, unitsRecomputed: 0, itemsCounted: 0, totalValue: 0 };

  for (const hospital of allHospitals) {
    stats.hospitalsScanned += 1;

    const hospitalUnits = await db.select().from(units).where(eq(units.hospitalId, hospital.id));
    const inventoryUnits = hospitalUnits.filter(u =>
      !u.isBusinessModule && !u.isLogisticModule && u.showInventory !== false,
    );

    for (const unit of inventoryUnits) {
      // Drop any existing snapshot for today so the recompute overwrites it.
      await db
        .delete(inventorySnapshots)
        .where(and(
          eq(inventorySnapshots.unitId, unit.id),
          eq(inventorySnapshots.snapshotDate, today),
        ));

      // Match the worker's filter: exclude service items.
      const unitItems = await db.select().from(items).where(and(
        eq(items.unitId, unit.id),
        or(eq(items.isService, false), isNull(items.isService))!,
      ));

      let totalValue = 0;
      let itemCount = 0;

      if (unitItems.length > 0) {
        const itemIds = unitItems.map(i => i.id);
        const stockData = await db.select().from(stockLevels).where(inArray(stockLevels.itemId, itemIds));
        const stockByItemId = new Map(stockData.map(s => [s.itemId, s]));

        const priceData = await db
          .select()
          .from(supplierCodes)
          .where(and(
            inArray(supplierCodes.itemId, itemIds),
            eq(supplierCodes.isPreferred, true),
          ));
        const priceByItemId = new Map(priceData.map(p => [p.itemId, p.basispreis ? parseFloat(p.basispreis) : 0]));

        for (const item of unitItems) {
          const stock = stockByItemId.get(item.id);
          const qtyOnHand = stock?.qtyOnHand ?? 0;
          const price = priceByItemId.get(item.id) ?? 0;
          totalValue += qtyOnHand * price;
          if (qtyOnHand > 0) itemCount += 1;
        }
      }

      await db.insert(inventorySnapshots).values({
        hospitalId: hospital.id,
        unitId: unit.id,
        snapshotDate: today,
        totalValue: totalValue.toFixed(2),
        itemCount,
      });

      stats.unitsRecomputed += 1;
      stats.itemsCounted += itemCount;
      stats.totalValue += totalValue;
    }
  }

  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const hospitalId = process.env.RECOMPUTE_HOSPITAL_ID || undefined;
  recomputeToday({ hospitalId })
    .then((s) => {
      console.log(JSON.stringify({
        ...s,
        totalValue: s.totalValue.toFixed(2),
      }));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
