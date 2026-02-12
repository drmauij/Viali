import { db } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  orders,
  orderLines,
  items,
  vendors,
  units,
  stockLevels,
  supplierCodes,
  itemCodes,
  type Order,
  type OrderLine,
  type Item,
  type Vendor,
  type Unit,
  type StockLevel,
} from "@shared/schema";

export async function getOrders(hospitalId: string, status?: string, unitId?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[] })[]> {
  const conditions = [eq(orders.hospitalId, hospitalId)];
  
  if (status) {
    conditions.push(eq(orders.status, status));
  }
  
  if (unitId) {
    conditions.push(eq(orders.unitId, unitId));
  }

  const ordersResult = await db
    .select()
    .from(orders)
    .where(and(...conditions))
    .orderBy(desc(orders.createdAt));
  
  const ordersWithDetails = await Promise.all(
    ordersResult.map(async (order) => {
      const vendor = order.vendorId 
        ? (await db.select().from(vendors).where(eq(vendors.id, order.vendorId)))[0] || null
        : null;
      const lines = await db
        .select({
          id: orderLines.id,
          orderId: orderLines.orderId,
          itemId: orderLines.itemId,
          qty: orderLines.qty,
          packSize: orderLines.packSize,
          unitPrice: orderLines.unitPrice,
          totalPrice: orderLines.totalPrice,
          received: orderLines.received,
          receivedAt: orderLines.receivedAt,
          receivedBy: orderLines.receivedBy,
          receiveNotes: orderLines.receiveNotes,
          receiveSignature: orderLines.receiveSignature,
          notes: orderLines.notes,
          offlineWorked: orderLines.offlineWorked,
          item: items,
          hospitalUnit: units,
          stockLevel: stockLevels,
        })
        .from(orderLines)
        .innerJoin(items, eq(orderLines.itemId, items.id))
        .innerJoin(units, eq(items.unitId, units.id))
        .leftJoin(stockLevels, and(eq(stockLevels.itemId, items.id), eq(stockLevels.unitId, items.unitId)))
        .where(eq(orderLines.orderId, order.id));

      const itemIds = lines.map(l => l.item.id);
      
      const [allSupplierCodesResult, itemCodesResult] = await Promise.all([
        itemIds.length > 0 
          ? db
              .select()
              .from(supplierCodes)
              .where(inArray(supplierCodes.itemId, itemIds))
          : Promise.resolve([]),
        itemIds.length > 0
          ? db
              .select()
              .from(itemCodes)
              .where(inArray(itemCodes.itemId, itemIds))
          : Promise.resolve([])
      ]);
      
      const supplierCodesByItemId = new Map<string, typeof allSupplierCodesResult[0]>();
      for (const sc of allSupplierCodesResult) {
        const existing = supplierCodesByItemId.get(sc.itemId);
        if (!existing) {
          supplierCodesByItemId.set(sc.itemId, sc);
        } else if (sc.isPreferred && !existing.isPreferred) {
          supplierCodesByItemId.set(sc.itemId, sc);
        } else if (!existing.isPreferred && !sc.isPreferred) {
          const scCreated = sc.createdAt ? new Date(sc.createdAt).getTime() : 0;
          const existingCreated = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
          if (scCreated > existingCreated) {
            supplierCodesByItemId.set(sc.itemId, sc);
          }
        }
      }
      
      const itemCodesByItemId = new Map(
        itemCodesResult.map(ic => [ic.itemId, ic])
      );

      return {
        ...order,
        vendor,
        orderLines: lines.map(line => ({
          id: line.id,
          orderId: line.orderId,
          itemId: line.itemId,
          qty: line.qty,
          packSize: line.packSize,
          unitPrice: line.unitPrice,
          totalPrice: line.totalPrice,
          received: line.received,
          receivedAt: line.receivedAt,
          receivedBy: line.receivedBy,
          receiveNotes: line.receiveNotes,
          receiveSignature: line.receiveSignature,
          notes: line.notes,
          offlineWorked: line.offlineWorked,
          item: {
            ...line.item,
            hospitalUnit: line.hospitalUnit,
            stockLevel: line.stockLevel,
            preferredSupplierCode: supplierCodesByItemId.get(line.item.id) || null,
            itemCodes: itemCodesByItemId.get(line.item.id) || null,
          },
        })),
      };
    })
  );

  return ordersWithDetails;
}

export async function createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
  const [created] = await db.insert(orders).values(order).returning();
  return created;
}

export async function getOrderById(orderId: string): Promise<Order | undefined> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
  return order;
}

export async function getOrderLineById(lineId: string): Promise<OrderLine | undefined> {
  const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
  return line;
}

export async function updateOrderStatus(id: string, status: string): Promise<Order> {
  const updateData: { status: string; updatedAt: Date; sentAt?: Date } = { 
    status, 
    updatedAt: new Date() 
  };
  
  if (status === 'sent') {
    updateData.sentAt = new Date();
  }
  
  const [updated] = await db
    .update(orders)
    .set(updateData)
    .where(eq(orders.id, id))
    .returning();
  return updated;
}

export async function findOrCreateDraftOrder(hospitalId: string, unitId: string, vendorId: string | null, createdBy: string): Promise<Order> {
  const whereConditions = vendorId 
    ? and(
        eq(orders.hospitalId, hospitalId),
        eq(orders.unitId, unitId),
        eq(orders.vendorId, vendorId),
        eq(orders.status, 'draft')
      )
    : and(
        eq(orders.hospitalId, hospitalId),
        eq(orders.unitId, unitId),
        sql`${orders.vendorId} IS NULL`,
        eq(orders.status, 'draft')
      );

  const [existingDraft] = await db
    .select()
    .from(orders)
    .where(whereConditions)
    .limit(1);

  if (existingDraft) {
    return existingDraft;
  }

  const [newOrder] = await db
    .insert(orders)
    .values({
      hospitalId,
      unitId,
      vendorId,
      status: 'draft',
      createdBy,
      totalAmount: '0',
    })
    .returning();

  return newOrder;
}

export async function addItemToOrder(orderId: string, itemId: string, qty: number, packSize: number): Promise<OrderLine> {
  const [existingLine] = await db
    .select()
    .from(orderLines)
    .where(
      and(
        eq(orderLines.orderId, orderId),
        eq(orderLines.itemId, itemId)
      )
    )
    .limit(1);

  if (existingLine) {
    const newQty = existingLine.qty + qty;
    const [updated] = await db
      .update(orderLines)
      .set({ qty: newQty })
      .where(eq(orderLines.id, existingLine.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(orderLines)
    .values({
      orderId,
      itemId,
      qty,
      packSize,
      unitPrice: '0',
      totalPrice: '0',
    })
    .returning();

  return created;
}

export async function updateOrderLine(lineId: string, qty: number): Promise<OrderLine> {
  const [updated] = await db
    .update(orderLines)
    .set({ qty })
    .where(eq(orderLines.id, lineId))
    .returning();
  return updated;
}

export async function removeOrderLine(lineId: string): Promise<void> {
  await db
    .delete(orderLines)
    .where(eq(orderLines.id, lineId));
}

export async function deleteOrder(orderId: string): Promise<void> {
  await db.delete(orderLines).where(eq(orderLines.orderId, orderId));
  await db.delete(orders).where(eq(orders.id, orderId));
}

export async function getVendors(hospitalId: string): Promise<Vendor[]> {
  const result = await db
    .select()
    .from(vendors)
    .where(eq(vendors.hospitalId, hospitalId));
  return result;
}
