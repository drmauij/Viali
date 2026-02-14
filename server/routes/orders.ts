import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  orderLines,
  orders,
  orderAttachments,
  items,
  stockLevels,
  activities,
} from "@shared/schema";
import { eq, and, inArray, sql, asc, desc } from "drizzle-orm";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  requireWriteAccess,
  requireStrictHospitalAccess,
  hasLogisticsAccess,
  canAccessOrder,
} from "../utils";
import { ObjectStorageService } from "../objectStorage";
import logger from "../logger";

const router = Router();

router.get('/api/logistic/orders/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { status } = req.query;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
    const unitIds = userUnitsForHospital.map(h => h.unitId).filter(Boolean) as string[];
    let hasLogisticAccess = false;
    
    for (const unitId of unitIds) {
      const unit = await storage.getUnit(unitId);
      if (unit?.type === 'logistic') {
        hasLogisticAccess = true;
        break;
      }
    }
    
    if (!hasLogisticAccess) {
      return res.status(403).json({ message: "Access denied - logistics module required" });
    }
    
    const ordersResult = await storage.getOrders(hospitalId, status as string);
    res.json(ordersResult);
  } catch (error) {
    logger.error("Error fetching logistic orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get('/api/orders/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { status, unitId: queryUnitId } = req.query;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);

    const activeUnitId = getActiveUnitIdFromRequest(req);
    const filterUnitId = (queryUnitId as string) || activeUnitId;
    
    if (filterUnitId) {
      const hasAccessToUnit = userUnitsForHospital.some(h => h.unitId === filterUnitId);
      if (!hasAccessToUnit) {
        const userHasLogisticsAccess = await hasLogisticsAccess(userId, hospitalId);
        if (!userHasLogisticsAccess) {
          return res.status(403).json({ message: "Access denied to this unit" });
        }
      }
      const ordersResult = await storage.getOrders(hospitalId, status as string, filterUnitId);
      return res.json(ordersResult);
    }
    
    const defaultUnitId = userUnitsForHospital[0]?.unitId;
    if (!defaultUnitId) {
      return res.status(403).json({ message: "No unit access found" });
    }
    
    const ordersResult = await storage.getOrders(hospitalId, status as string, defaultUnitId);
    res.json(ordersResult);
  } catch (error) {
    logger.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
});

router.get('/api/orders/open-items/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const results = await db
      .select({
        itemId: orderLines.itemId,
        totalQty: sql<number>`CAST(SUM(${orderLines.qty}) AS INTEGER)`,
      })
      .from(orders)
      .innerJoin(orderLines, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(orders.hospitalId, hospitalId),
          inArray(orders.status, ['draft', 'sent'])
        )
      )
      .groupBy(orderLines.itemId);
    
    const itemsMap: Record<string, { totalQty: number }> = {};
    for (const result of results) {
      itemsMap[result.itemId] = { totalQty: result.totalQty };
    }
    
    res.json(itemsMap);
  } catch (error) {
    logger.error("Error fetching open order items:", error);
    res.status(500).json({ message: "Failed to fetch open order items" });
  }
});

router.post('/api/orders', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, vendorId, orderLines: lines } = req.body;
    const userId = req.user.id;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId || undefined);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const order = await storage.createOrder({
      hospitalId,
      unitId,
      vendorId: vendorId || null,
      status: 'draft',
      createdBy: userId,
      totalAmount: '0',
    });

    if (lines && Array.isArray(lines)) {
      for (const line of lines) {
        await storage.addItemToOrder(order.id, line.itemId, line.qty, line.packSize || 1);
      }
    }

    res.status(201).json(order);
  } catch (error) {
    logger.error("Error creating order:", error);
    res.status(500).json({ message: "Failed to create order" });
  }
});

router.post('/api/orders/:hospitalId/merge', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { orderIds } = req.body;
    const userId = req.user.id;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length < 2) {
      return res.status(400).json({ message: "At least 2 order IDs are required" });
    }
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const ordersToMerge = await Promise.all(
      orderIds.map(async (id: string) => {
        const [order] = await db.select().from(orders).where(eq(orders.id, id));
        return order;
      })
    );
    
    const firstOrderUnitId = ordersToMerge[0]?.unitId;
    const firstOrderStatus = ordersToMerge[0]?.status;
    for (const order of ordersToMerge) {
      if (!order) {
        return res.status(404).json({ message: "One or more orders not found" });
      }
      if (order.status === 'received') {
        return res.status(400).json({ message: "Received orders cannot be merged" });
      }
      if (order.status !== firstOrderStatus) {
        return res.status(400).json({ message: "All orders must have the same status to merge" });
      }
      if (order.hospitalId !== hospitalId) {
        return res.status(400).json({ message: "All orders must be from the same hospital" });
      }
      if (order.unitId !== firstOrderUnitId) {
        return res.status(400).json({ message: "All orders must be from the same unit to merge" });
      }
    }
    
    if (firstOrderUnitId !== unitId) {
      const userHasLogisticsAccess = await hasLogisticsAccess(userId, hospitalId);
      if (!userHasLogisticsAccess) {
        return res.status(403).json({ message: "Access denied: you can only merge orders from your unit" });
      }
    }
    
    const targetOrder = ordersToMerge[0];
    const otherOrderIds = orderIds.slice(1);
    
    for (const otherId of otherOrderIds) {
      await db.update(orderLines)
        .set({ orderId: targetOrder.id })
        .where(eq(orderLines.orderId, otherId));
    }
    
    for (const otherId of otherOrderIds) {
      await db.delete(orders).where(eq(orders.id, otherId));
    }
    
    res.json({ 
      success: true, 
      mergedOrderId: targetOrder.id,
      mergedCount: otherOrderIds.length + 1
    });
  } catch (error: any) {
    logger.error("Error merging orders:", error);
    logger.error("Error stack:", error?.stack);
    res.status(500).json({ message: "Failed to merge orders", error: error?.message || String(error) });
  }
});

router.post('/api/orders/:orderId/split', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { lineIds } = req.body;
    const userId = req.user.id;
    
    if (!lineIds || !Array.isArray(lineIds) || lineIds.length === 0) {
      return res.status(400).json({ message: "At least one line ID is required to split" });
    }
    
    const [sourceOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!sourceOrder) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (sourceOrder.status === 'received') {
      return res.status(400).json({ message: "Received orders cannot be split" });
    }
    
    const activeUnitId = getActiveUnitIdFromRequest(req);
    const unitId = await getUserUnitForHospital(userId, sourceOrder.hospitalId, activeUnitId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    if (sourceOrder.unitId !== unitId) {
      const userHasLogisticsAccess = await hasLogisticsAccess(userId, sourceOrder.hospitalId);
      if (!userHasLogisticsAccess) {
        return res.status(403).json({ message: "Access denied: you can only split orders from your unit" });
      }
    }
    
    const linesToMove = await db.select().from(orderLines).where(
      and(
        eq(orderLines.orderId, orderId),
        inArray(orderLines.id, lineIds)
      )
    );
    
    if (linesToMove.length !== lineIds.length) {
      return res.status(400).json({ message: "Some line IDs do not belong to this order" });
    }
    
    const newOrder = await storage.createOrder({
      hospitalId: sourceOrder.hospitalId,
      unitId: sourceOrder.unitId,
      vendorId: sourceOrder.vendorId,
      status: 'draft',
      createdBy: userId,
    });
    
    await db.update(orderLines)
      .set({ orderId: newOrder.id })
      .where(inArray(orderLines.id, lineIds));
    
    res.json({ 
      success: true, 
      newOrderId: newOrder.id,
      movedCount: linesToMove.length
    });
  } catch (error: any) {
    logger.error("Error splitting order:", error);
    logger.error("Error stack:", error?.stack);
    res.status(500).json({ message: "Failed to split order", error: error?.message || String(error) });
  }
});

router.post('/api/orders/quick-add', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId, itemId, vendorId, qty, packSize } = req.body;
    const userId = req.user.id;
    
    if (!hospitalId || !itemId || !unitId) {
      return res.status(400).json({ message: "Hospital ID, Unit ID, and Item ID are required" });
    }
    
    const userHospitals = await storage.getUserHospitals(userId);
    const hasUnitAccess = userHospitals.some(h => h.id === hospitalId && h.unitId === unitId);
    if (!hasUnitAccess) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }

    const order = await storage.findOrCreateDraftOrder(hospitalId, unitId, vendorId || null, userId);
    const orderLine = await storage.addItemToOrder(order.id, itemId, qty || 1, packSize || 1);

    res.json({ order, orderLine });
  } catch (error) {
    logger.error("Error adding item to order:", error);
    res.status(500).json({ message: "Failed to add item to order" });
  }
});

router.post('/api/orders/:orderId/status', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;
    const userId = req.user.id;
    
    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }
    
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    const updatedOrder = await storage.updateOrderStatus(orderId, status);
    res.json(updatedOrder);
  } catch (error) {
    logger.error("Error updating order status:", error);
    res.status(500).json({ message: "Failed to update order status" });
  }
});

router.patch('/api/orders/:orderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { highPriority, notes } = req.body;
    const userId = req.user.id;
    
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    const updateData: any = { updatedAt: new Date() };
    if (typeof highPriority === 'boolean') {
      updateData.highPriority = highPriority;
    }
    if (typeof notes === 'string') {
      updateData.notes = notes;
    }
    
    await db.update(orders).set(updateData).where(eq(orders.id, orderId));
    
    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    res.json(updatedOrder);
  } catch (error) {
    logger.error("Error updating order:", error);
    res.status(500).json({ message: "Failed to update order" });
  }
});

router.patch('/api/orders/:orderId/notes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { notes } = req.body;
    const userId = req.user.id;
    
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    await db.update(orders).set({ notes }).where(eq(orders.id, orderId));
    
    const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));
    res.json(updatedOrder);
  } catch (error) {
    logger.error("Error updating order notes:", error);
    res.status(500).json({ message: "Failed to update order notes" });
  }
});

router.patch('/api/order-lines/:lineId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { lineId } = req.params;
    const { qty, notes } = req.body;
    const userId = req.user.id;
    
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    if (!line) {
      return res.status(404).json({ message: "Order line not found" });
    }
    
    const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    const updates: any = {};
    if (qty !== undefined) {
      if (qty < 1) {
        return res.status(400).json({ message: "Valid quantity is required" });
      }
      updates.qty = qty;
    }
    if (notes !== undefined) {
      updates.notes = notes;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }
    
    await db.update(orderLines).set(updates).where(eq(orderLines.id, lineId));
    
    const [updatedLine] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    res.json(updatedLine);
  } catch (error) {
    logger.error("Error updating order line:", error);
    res.status(500).json({ message: "Failed to update order line" });
  }
});

router.post('/api/order-lines/:lineId/move-to-secondary', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { lineId } = req.params;
    const userId = req.user.id;
    
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    if (!line) {
      return res.status(404).json({ message: "Order line not found" });
    }
    
    const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.status !== 'draft') {
      return res.status(400).json({ message: "Can only move items from draft orders" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    const draftOrders = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.hospitalId, order.hospitalId),
          eq(orders.unitId, order.unitId),
          eq(orders.status, 'draft')
        )
      )
      .orderBy(asc(orders.createdAt));
    
    if (draftOrders.length === 0) {
      return res.status(400).json({ message: "No draft orders found" });
    }
    
    const mainOrder = draftOrders[0];
    
    if (line.orderId !== mainOrder.id) {
      return res.status(400).json({ message: "This item is not in the main draft order" });
    }
    
    let secondaryOrder;
    if (draftOrders.length > 1) {
      secondaryOrder = draftOrders[1];
    } else {
      const [newOrder] = await db
        .insert(orders)
        .values({
          hospitalId: order.hospitalId,
          unitId: order.unitId,
          vendorId: order.vendorId,
          status: 'draft',
          createdBy: userId,
        })
        .returning();
      secondaryOrder = newOrder;
    }
    
    await db
      .update(orderLines)
      .set({ orderId: secondaryOrder.id })
      .where(eq(orderLines.id, lineId));
    
    const remainingLines = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, mainOrder.id));
    
    if (remainingLines.length === 0) {
      await db.delete(orders).where(eq(orders.id, mainOrder.id));
    }
    
    res.json({ 
      success: true, 
      message: "Item moved to secondary order",
      mainOrderDeleted: remainingLines.length === 0
    });
  } catch (error) {
    logger.error("Error moving order line to secondary:", error);
    res.status(500).json({ message: "Failed to move order line" });
  }
});

router.patch('/api/order-lines/:lineId/offline-worked', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { lineId } = req.params;
    const { offlineWorked } = req.body;
    const userId = req.user.id;
    
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    if (!line) {
      return res.status(404).json({ message: "Order line not found" });
    }
    
    const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.status !== 'draft' && order.status !== 'sent') {
      return res.status(400).json({ message: "Can only toggle offline worked for draft or sent orders" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    await db
      .update(orderLines)
      .set({ offlineWorked })
      .where(eq(orderLines.id, lineId));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error updating offline worked status:", error);
    res.status(500).json({ message: "Failed to update offline worked status" });
  }
});

router.post('/api/order-lines/:lineId/receive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { lineId } = req.params;
    const { notes, signature } = req.body;
    const userId = req.user.id;
    
    const [lineWithItem] = await db
      .select({
        line: orderLines,
        item: items,
        order: orders,
      })
      .from(orderLines)
      .innerJoin(items, eq(orderLines.itemId, items.id))
      .innerJoin(orders, eq(orderLines.orderId, orders.id))
      .where(eq(orderLines.id, lineId));
    
    if (!lineWithItem) {
      return res.status(404).json({ message: "Order line not found" });
    }
    
    const { line, item, order } = lineWithItem;
    
    if (line.received) {
      return res.status(400).json({ message: "Item already received" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only receive items for orders from your unit" });
    }
    
    if (item.controlled) {
      if (!signature) {
        return res.status(400).json({ message: "Signature required for controlled substances" });
      }
      if (!notes || notes.trim() === '') {
        return res.status(400).json({ message: "Notes are required for controlled substances" });
      }
    }
    
    const [currentStock] = await db
      .select()
      .from(stockLevels)
      .where(
        and(
          eq(stockLevels.itemId, item.id),
          eq(stockLevels.unitId, order.unitId)
        )
      );
    
    const currentQty = currentStock?.qtyOnHand || 0;
    const newQty = currentQty + line.qty;
    
    logger.info('[Order Line Receive] Stock update: item', item.id, 'unit', order.unitId, 'current', currentQty, '+ received', line.qty, '= new', newQty);
    
    await storage.updateStockLevel(item.id, order.unitId, newQty);
    
    let addedUnits = 0;
    if (item.trackExactQuantity) {
      const [currentItem] = await db
        .select({ currentUnits: items.currentUnits })
        .from(items)
        .where(eq(items.id, item.id));
      
      const currentCurrentUnits = currentItem?.currentUnits || 0;
      addedUnits = line.qty * (line.packSize || 1);
      await db
        .update(items)
        .set({ 
          currentUnits: currentCurrentUnits + addedUnits 
        })
        .where(eq(items.id, item.id));
    }
    
    await db
      .update(orderLines)
      .set({
        received: true,
        receivedAt: new Date(),
        receivedBy: userId,
        receiveNotes: notes || null,
        receiveSignature: signature || null,
      })
      .where(eq(orderLines.id, lineId));
    
    if (item.controlled) {
      await db.insert(activities).values({
        timestamp: new Date(),
        userId,
        action: 'receive',
        itemId: item.id,
        unitId: order.unitId,
        delta: addedUnits || line.qty,
        movementType: 'IN',
        notes: notes || 'Order received',
        signatures: signature ? [signature] : null,
        controlledVerified: true,
      });
    }
    
    const allLines = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id));
    
    const allReceived = allLines.every(l => l.id === lineId || l.received);
    
    if (allReceived && order.status !== 'received') {
      await storage.updateOrderStatus(order.id, 'received');
    }
    
    res.json({ success: true, allReceived });
  } catch (error) {
    logger.error("Error receiving order line:", error);
    res.status(500).json({ message: "Failed to receive order line" });
  }
});

router.delete('/api/order-lines/:lineId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { lineId } = req.params;
    const userId = req.user.id;
    
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    if (!line) {
      return res.status(404).json({ message: "Order line not found" });
    }
    
    const [order] = await db.select().from(orders).where(eq(orders.id, line.orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only modify orders from your unit" });
    }
    
    await storage.removeOrderLine(lineId);
    
    const remainingLines = await db
      .select()
      .from(orderLines)
      .where(eq(orderLines.orderId, order.id));
    
    if (remainingLines.length > 0 && remainingLines.every(l => l.received) && order.status !== 'received') {
      await storage.updateOrderStatus(order.id, 'received');
    }
    
    if (remainingLines.length === 0 && order.status !== 'draft') {
      await storage.updateOrderStatus(order.id, 'draft');
    }
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error removing order line:", error);
    res.status(500).json({ message: "Failed to remove order line" });
  }
});

router.delete('/api/orders/:orderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.user.id;
    
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    const canAccess = await canAccessOrder(userId, order.hospitalId, order.unitId);
    if (!canAccess) {
      return res.status(403).json({ message: "Access denied: you can only delete orders from your unit" });
    }
    
    await storage.deleteOrder(orderId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting order:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
});

router.post('/api/orders/:orderId/attachments/upload-url', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { filename, contentType } = req.body;

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { uploadURL, storageKey } = await objectStorageService.getOrderAttachmentUploadURL(
      orderId,
      filename,
      contentType
    );

    res.json({ uploadURL, storageKey });
  } catch (error) {
    logger.error("Error getting upload URL for order attachment:", error);
    res.status(500).json({ message: "Failed to get upload URL" });
  }
});

router.post('/api/orders/:orderId/attachments', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const { filename, contentType, storageKey } = req.body;
    const userId = req.user.id;

    if (!filename || !storageKey) {
      return res.status(400).json({ message: "Filename and storageKey are required" });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [attachment] = await db.insert(orderAttachments).values({
      orderId,
      filename,
      contentType: contentType || 'application/octet-stream',
      storageKey,
      uploadedBy: userId,
    }).returning();

    res.json(attachment);
  } catch (error) {
    logger.error("Error creating order attachment:", error);
    res.status(500).json({ message: "Failed to create attachment" });
  }
});

router.get('/api/orders/:orderId/attachments', isAuthenticated, async (req: any, res) => {
  try {
    const { orderId } = req.params;

    const attachments = await db
      .select()
      .from(orderAttachments)
      .where(eq(orderAttachments.orderId, orderId))
      .orderBy(desc(orderAttachments.createdAt));

    res.json(attachments);
  } catch (error) {
    logger.error("Error fetching order attachments:", error);
    res.status(500).json({ message: "Failed to fetch attachments" });
  }
});

router.get('/api/orders/attachments/:attachmentId/download-url', isAuthenticated, async (req: any, res) => {
  try {
    const { attachmentId } = req.params;

    const [attachment] = await db
      .select()
      .from(orderAttachments)
      .where(eq(orderAttachments.id, attachmentId));

    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const downloadURL = await objectStorageService.getObjectDownloadURL(attachment.storageKey, 3600);
    res.json({ downloadURL, filename: attachment.filename, contentType: attachment.contentType });
  } catch (error) {
    logger.error("Error getting download URL for order attachment:", error);
    res.status(500).json({ message: "Failed to get download URL" });
  }
});

router.delete('/api/orders/attachments/:attachmentId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { attachmentId } = req.params;

    const [attachment] = await db
      .select()
      .from(orderAttachments)
      .where(eq(orderAttachments.id, attachmentId));

    if (!attachment) {
      return res.status(404).json({ message: "Attachment not found" });
    }

    const objectStorageService = new ObjectStorageService();
    if (objectStorageService.isConfigured()) {
      try {
        await objectStorageService.deleteObject(attachment.storageKey);
      } catch (deleteError) {
        logger.warn(`Failed to delete attachment from S3 ${attachment.storageKey}:`, deleteError);
      }
    }

    await db.delete(orderAttachments).where(eq(orderAttachments.id, attachmentId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting order attachment:", error);
    res.status(500).json({ message: "Failed to delete attachment" });
  }
});

router.get('/api/vendors/:hospitalId', isAuthenticated, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const vendors = await storage.getVendors(hospitalId);
    res.json(vendors);
  } catch (error) {
    logger.error("Error fetching vendors:", error);
    res.status(500).json({ message: "Failed to fetch vendors" });
  }
});

export default router;
