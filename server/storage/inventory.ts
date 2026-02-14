import { db } from "../db";
import { eq, and, desc, asc, sql, inArray, lte, gte } from "drizzle-orm";
import {
  folders,
  items,
  itemCodes,
  supplierCodes,
  stockLevels,
  lots,
  orders,
  orderLines,
  activities,
  alerts,
  anesthesiaMedications,
  inventoryUsage,
  medicationConfigs,
  medicationGroups,
  administrationGroups,
  surgeryRooms,
  type Folder,
  type Item,
  type StockLevel,
  type Lot,
  type ItemCode,
  type InsertItemCode,
  type SupplierCode,
  type InsertSupplierCode,
  type InsertFolder,
  type InsertItem,
  type MedicationConfig,
  type InsertMedicationConfig,
  type MedicationGroup,
  type InsertMedicationGroup,
  type AdministrationGroup,
  type InsertAdministrationGroup,
  type SurgeryRoom,
  type InsertSurgeryRoom,
} from "@shared/schema";
import logger from "../logger";

export async function getFolders(hospitalId: string, unitId: string): Promise<Folder[]> {
  return await db
    .select()
    .from(folders)
    .where(and(eq(folders.hospitalId, hospitalId), eq(folders.unitId, unitId)))
    .orderBy(asc(folders.sortOrder), asc(folders.name));
}

export async function getFolder(id: string): Promise<Folder | undefined> {
  const [folder] = await db.select().from(folders).where(eq(folders.id, id));
  return folder;
}

export async function createFolder(folder: InsertFolder): Promise<Folder> {
  const [created] = await db.insert(folders).values(folder).returning();
  return created;
}

export async function updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
  const [updated] = await db
    .update(folders)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(folders.id, id))
    .returning();
  return updated;
}

export async function deleteFolder(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(items)
      .set({ folderId: null })
      .where(eq(items.folderId, id));
    
    await tx.delete(folders).where(eq(folders.id, id));
  });
}

export async function getItems(hospitalId: string, unitId: string, filters?: {
  critical?: boolean;
  controlled?: boolean;
  belowMin?: boolean;
  expiring?: boolean;
  includeArchived?: boolean;
}): Promise<(Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[]> {
  const conditions = [
    eq(items.hospitalId, hospitalId), 
    eq(items.unitId, unitId),
  ];
  
  if (!filters?.includeArchived) {
    conditions.push(eq(items.status, 'active'));
  }
  
  if (filters?.critical) {
    conditions.push(eq(items.critical, true));
  }
  if (filters?.controlled) {
    conditions.push(eq(items.controlled, true));
  }
  
  const query = db
    .select({
      ...items,
      stockLevel: stockLevels,
      soonestExpiry: sql<Date>`MIN(${lots.expiryDate})`.as('soonest_expiry'),
    })
    .from(items)
    .leftJoin(stockLevels, and(eq(items.id, stockLevels.itemId), eq(stockLevels.unitId, unitId)))
    .leftJoin(lots, eq(items.id, lots.itemId))
    .where(and(...conditions))
    .groupBy(items.id, stockLevels.id);

  const result = await query.orderBy(asc(items.sortOrder), asc(items.name));
  return result as (Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[];
}

export async function getItem(id: string): Promise<Item | undefined> {
  const [item] = await db.select().from(items).where(eq(items.id, id));
  return item;
}

export async function createItem(item: InsertItem): Promise<Item> {
  const [created] = await db.insert(items).values(item).returning();
  return created;
}

export async function updateItem(id: string, updates: Partial<Item>): Promise<Item> {
  const [updated] = await db
    .update(items)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning();
  return updated;
}

export async function deleteItem(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(alerts).where(eq(alerts.itemId, id));
    
    await tx.delete(activities).where(eq(activities.itemId, id));
    
    await tx.delete(orderLines).where(eq(orderLines.itemId, id));
    
    await tx.delete(anesthesiaMedications).where(eq(anesthesiaMedications.itemId, id));
    
    await tx.delete(inventoryUsage).where(eq(inventoryUsage.itemId, id));
    
    await tx.delete(medicationConfigs).where(eq(medicationConfigs.itemId, id));
    
    await tx.delete(lots).where(eq(lots.itemId, id));
    
    await tx.delete(stockLevels).where(eq(stockLevels.itemId, id));
    
    await tx.delete(items).where(eq(items.id, id));
  });
}

export async function getStockLevel(itemId: string, unitId: string): Promise<StockLevel | undefined> {
  const [level] = await db
    .select()
    .from(stockLevels)
    .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.unitId, unitId)));
  return level;
}

export async function updateStockLevel(itemId: string, unitId: string, qty: number): Promise<StockLevel> {
  const [updated] = await db
    .insert(stockLevels)
    .values({
      itemId,
      unitId: unitId,
      qtyOnHand: qty,
    })
    .onConflictDoUpdate({
      target: [stockLevels.itemId, stockLevels.unitId],
      set: {
        qtyOnHand: qty,
        updatedAt: new Date(),
      },
    })
    .returning();
  return updated;
}

export async function getLots(itemId: string): Promise<Lot[]> {
  return await db
    .select()
    .from(lots)
    .where(eq(lots.itemId, itemId))
    .orderBy(asc(lots.expiryDate));
}

export async function getLotById(lotId: string): Promise<Lot | undefined> {
  const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
  return lot;
}

export async function createLot(lot: Omit<Lot, 'id' | 'createdAt'>): Promise<Lot> {
  const [created] = await db.insert(lots).values(lot).returning();
  return created;
}

export async function updateLot(id: string, updates: Partial<Lot>): Promise<Lot> {
  const [updated] = await db
    .update(lots)
    .set(updates)
    .where(eq(lots.id, id))
    .returning();
  return updated;
}

export async function deleteLot(id: string): Promise<void> {
  await db.delete(lots).where(eq(lots.id, id));
}

export async function getItemCode(itemId: string): Promise<ItemCode | undefined> {
  const [code] = await db
    .select()
    .from(itemCodes)
    .where(eq(itemCodes.itemId, itemId));
  return code;
}

export async function createItemCode(code: InsertItemCode): Promise<ItemCode> {
  const [created] = await db.insert(itemCodes).values(code).returning();
  return created;
}

export async function updateItemCode(itemId: string, updates: Partial<ItemCode>): Promise<ItemCode> {
  const [existing] = await db
    .select()
    .from(itemCodes)
    .where(eq(itemCodes.itemId, itemId));
  
  const cleanedUpdates: Record<string, any> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      cleanedUpdates[key] = value;
    }
  }
  
  if (existing) {
    logger.info(`[Storage] Updating existing item codes for ${itemId}`);
    const [updated] = await db
      .update(itemCodes)
      .set({ ...cleanedUpdates, updatedAt: new Date() })
      .where(eq(itemCodes.itemId, itemId))
      .returning();
    return updated;
  } else {
    logger.info(`[Storage] Creating new item codes for ${itemId}`);
    const [created] = await db
      .insert(itemCodes)
      .values({ itemId, ...cleanedUpdates } as InsertItemCode)
      .returning();
    return created;
  }
}

export async function deleteItemCode(itemId: string): Promise<void> {
  await db.delete(itemCodes).where(eq(itemCodes.itemId, itemId));
}

export async function getSupplierCodes(itemId: string): Promise<SupplierCode[]> {
  return await db
    .select()
    .from(supplierCodes)
    .where(eq(supplierCodes.itemId, itemId))
    .orderBy(desc(supplierCodes.isPreferred), asc(supplierCodes.supplierName));
}

export async function getSupplierCode(id: string): Promise<SupplierCode | undefined> {
  const [code] = await db
    .select()
    .from(supplierCodes)
    .where(eq(supplierCodes.id, id));
  return code;
}

export async function createSupplierCode(code: InsertSupplierCode): Promise<SupplierCode> {
  if (code.itemId && code.supplierName && code.articleCode) {
    const existing = await db
      .select()
      .from(supplierCodes)
      .where(and(
        eq(supplierCodes.itemId, code.itemId),
        eq(supplierCodes.supplierName, code.supplierName),
        eq(supplierCodes.articleCode, code.articleCode)
      ))
      .limit(1);
    
    if (existing.length > 0) {
      const { itemId, supplierName, articleCode, ...updateFields } = code;
      const [updated] = await db
        .update(supplierCodes)
        .set({ ...updateFields, updatedAt: new Date() })
        .where(eq(supplierCodes.id, existing[0].id))
        .returning();
      return updated;
    }
  }
  
  const [created] = await db.insert(supplierCodes).values(code).returning();
  return created;
}

export async function updateSupplierCode(id: string, updates: Partial<SupplierCode>): Promise<SupplierCode> {
  const [updated] = await db
    .update(supplierCodes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(supplierCodes.id, id))
    .returning();
  return updated;
}

export async function deleteSupplierCode(id: string): Promise<void> {
  await db.delete(supplierCodes).where(eq(supplierCodes.id, id));
}

export async function setPreferredSupplier(itemId: string, supplierId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(supplierCodes)
      .set({ isPreferred: false })
      .where(eq(supplierCodes.itemId, itemId));
    
    await tx
      .update(supplierCodes)
      .set({ isPreferred: true })
      .where(eq(supplierCodes.id, supplierId));
  });
}

export async function getPendingSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]> {
  const matches = await db
    .select({
      supplierCode: supplierCodes,
      item: items
    })
    .from(supplierCodes)
    .innerJoin(items, eq(supplierCodes.itemId, items.id))
    .where(
      and(
        eq(items.hospitalId, hospitalId),
        eq(supplierCodes.matchStatus, 'pending')
      )
    )
    .orderBy(desc(supplierCodes.matchConfidence), asc(items.name));
  
  return matches.map(m => ({
    ...m.supplierCode,
    item: m.item
  }));
}

export async function getConfirmedSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]> {
  const matches = await db
    .select({
      supplierCode: supplierCodes,
      item: items
    })
    .from(supplierCodes)
    .innerJoin(items, eq(supplierCodes.itemId, items.id))
    .where(
      and(
        eq(items.hospitalId, hospitalId),
        eq(supplierCodes.matchStatus, 'confirmed')
      )
    )
    .orderBy(desc(supplierCodes.lastPriceUpdate), asc(items.name));
  
  return matches.map(m => ({
    ...m.supplierCode,
    item: m.item
  }));
}

export async function getSupplierMatchesByJobId(jobId: string): Promise<(SupplierCode & { item: Item })[]> {
  const matches = await db
    .select({
      supplierCode: supplierCodes,
      item: items
    })
    .from(supplierCodes)
    .innerJoin(items, eq(supplierCodes.itemId, items.id))
    .where(eq(supplierCodes.lastSyncJobId, jobId))
    .orderBy(desc(supplierCodes.matchConfidence), asc(items.name));
  
  return matches.map(m => ({
    ...m.supplierCode,
    item: m.item
  }));
}

export async function getDashboardKPIs(hospitalId: string): Promise<{
  belowMin: number;
  expiringSoon: number;
  pendingOrders: number;
  auditDue: number;
}> {
  const belowMinQuery = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .innerJoin(stockLevels, eq(items.id, stockLevels.itemId))
    .where(
      and(
        eq(items.hospitalId, hospitalId),
        sql`${stockLevels.qtyOnHand} <= ${items.minThreshold}`
      )
    );

  const expiringSoonQuery = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${lots.itemId})` })
    .from(lots)
    .innerJoin(items, eq(lots.itemId, items.id))
    .where(
      and(
        eq(items.hospitalId, hospitalId),
        lte(lots.expiryDate, sql`NOW() + INTERVAL '30 days'`),
        gte(lots.expiryDate, sql`NOW()`)
      )
    );

  const pendingOrdersQuery = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(orders)
    .where(
      and(
        eq(orders.hospitalId, hospitalId),
        inArray(orders.status, ['draft', 'sent', 'receiving'])
      )
    );

  const auditDueQuery = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(items)
    .where(and(eq(items.hospitalId, hospitalId), eq(items.controlled, true)));

  const [belowMin] = belowMinQuery;
  const [expiringSoon] = expiringSoonQuery;
  const [pendingOrders] = pendingOrdersQuery;
  const [auditDue] = auditDueQuery;

  return {
    belowMin: belowMin.count || 0,
    expiringSoon: expiringSoon.count || 0,
    pendingOrders: pendingOrders.count || 0,
    auditDue: Math.min(auditDue.count || 0, 15),
  };
}

export async function findItemByBarcode(barcode: string, hospitalId: string, unitId?: string): Promise<(Item & { stockLevel?: StockLevel }) | undefined> {
  const conditions = [
    eq(items.hospitalId, hospitalId),
    sql`${barcode} = ANY(${items.barcodes})`
  ];
  
  if (unitId) {
    conditions.push(eq(items.unitId, unitId));
  }
  
  const [result] = await db
    .select()
    .from(items)
    .leftJoin(
      stockLevels, 
      and(
        eq(items.id, stockLevels.itemId),
        unitId ? eq(stockLevels.unitId, unitId) : undefined
      )
    )
    .where(and(...conditions))
    .limit(1);
  
  if (!result) return undefined;
  
  return {
    ...result.items,
    stockLevel: result.stock_levels || undefined,
  };
}

export async function getMedicationConfig(itemId: string): Promise<MedicationConfig | undefined> {
  const [config] = await db
    .select()
    .from(medicationConfigs)
    .where(eq(medicationConfigs.itemId, itemId));
  return config;
}

export async function getMedicationConfigById(id: string): Promise<MedicationConfig | undefined> {
  const [config] = await db
    .select()
    .from(medicationConfigs)
    .where(eq(medicationConfigs.id, id));
  return config;
}

export async function upsertMedicationConfig(config: InsertMedicationConfig): Promise<MedicationConfig> {
  const [upserted] = await db
    .insert(medicationConfigs)
    .values(config)
    .onConflictDoUpdate({
      target: medicationConfigs.itemId,
      set: {
        medicationGroup: config.medicationGroup,
        administrationGroup: config.administrationGroup,
        ampuleTotalContent: config.ampuleTotalContent,
        defaultDose: config.defaultDose,
        administrationRoute: config.administrationRoute,
        administrationUnit: config.administrationUnit,
        rateUnit: config.rateUnit,
        updatedAt: new Date(),
      },
    })
    .returning();
  return upserted;
}

export async function deleteMedicationConfig(itemId: string): Promise<void> {
  await db
    .delete(medicationConfigs)
    .where(eq(medicationConfigs.itemId, itemId));
}

export async function getMedicationGroups(hospitalId: string): Promise<MedicationGroup[]> {
  const groups = await db
    .select()
    .from(medicationGroups)
    .where(eq(medicationGroups.hospitalId, hospitalId))
    .orderBy(asc(medicationGroups.name));
  return groups;
}

export async function getMedicationGroupById(id: string): Promise<MedicationGroup | undefined> {
  const [group] = await db.select().from(medicationGroups).where(eq(medicationGroups.id, id));
  return group;
}

export async function createMedicationGroup(group: InsertMedicationGroup): Promise<MedicationGroup> {
  const [newGroup] = await db
    .insert(medicationGroups)
    .values(group)
    .returning();
  return newGroup;
}

export async function deleteMedicationGroup(id: string): Promise<void> {
  await db
    .delete(medicationGroups)
    .where(eq(medicationGroups.id, id));
}

export async function getAdministrationGroups(hospitalId: string): Promise<AdministrationGroup[]> {
  const groups = await db
    .select()
    .from(administrationGroups)
    .where(eq(administrationGroups.hospitalId, hospitalId))
    .orderBy(asc(administrationGroups.sortOrder), asc(administrationGroups.name));
  return groups;
}

export async function getAdministrationGroupById(id: string): Promise<AdministrationGroup | undefined> {
  const [group] = await db.select().from(administrationGroups).where(eq(administrationGroups.id, id));
  return group;
}

export async function createAdministrationGroup(group: InsertAdministrationGroup): Promise<AdministrationGroup> {
  const [newGroup] = await db
    .insert(administrationGroups)
    .values(group)
    .returning();
  return newGroup;
}

export async function updateAdministrationGroup(id: string, updates: { name: string }): Promise<AdministrationGroup> {
  const [oldGroup] = await db
    .select()
    .from(administrationGroups)
    .where(eq(administrationGroups.id, id));
  
  const [updatedGroup] = await db
    .update(administrationGroups)
    .set({ name: updates.name })
    .where(eq(administrationGroups.id, id))
    .returning();
  
  if (oldGroup && oldGroup.name !== updates.name) {
    await db
      .update(medicationConfigs)
      .set({ administrationGroup: updates.name })
      .where(eq(medicationConfigs.administrationGroup, oldGroup.name));
  }
  
  return updatedGroup;
}

export async function deleteAdministrationGroup(id: string): Promise<void> {
  const [group] = await db
    .select()
    .from(administrationGroups)
    .where(eq(administrationGroups.id, id));
  
  if (group) {
    await db
      .update(medicationConfigs)
      .set({ administrationGroup: null })
      .where(eq(medicationConfigs.administrationGroup, group.name));
  }
  
  await db
    .delete(administrationGroups)
    .where(eq(administrationGroups.id, id));
}

export async function reorderAdministrationGroups(groupIds: string[]): Promise<void> {
  await Promise.all(
    groupIds.map((id, index) =>
      db
        .update(administrationGroups)
        .set({ sortOrder: index })
        .where(eq(administrationGroups.id, id))
    )
  );
}

export async function getSurgeryRooms(hospitalId: string): Promise<SurgeryRoom[]> {
  const rooms = await db
    .select()
    .from(surgeryRooms)
    .where(eq(surgeryRooms.hospitalId, hospitalId))
    .orderBy(asc(surgeryRooms.sortOrder), asc(surgeryRooms.name));
  return rooms;
}

export async function getSurgeryRoomById(id: string): Promise<SurgeryRoom | undefined> {
  const [room] = await db.select().from(surgeryRooms).where(eq(surgeryRooms.id, id));
  return room;
}

export async function createSurgeryRoom(room: InsertSurgeryRoom): Promise<SurgeryRoom> {
  const [newRoom] = await db
    .insert(surgeryRooms)
    .values(room)
    .returning();
  return newRoom;
}

export async function updateSurgeryRoom(id: string, room: Partial<InsertSurgeryRoom>): Promise<SurgeryRoom> {
  const [updatedRoom] = await db
    .update(surgeryRooms)
    .set(room)
    .where(eq(surgeryRooms.id, id))
    .returning();
  return updatedRoom;
}

export async function deleteSurgeryRoom(id: string): Promise<void> {
  await db
    .delete(surgeryRooms)
    .where(eq(surgeryRooms.id, id));
}

export async function reorderSurgeryRooms(roomIds: string[]): Promise<void> {
  await Promise.all(
    roomIds.map((id, index) =>
      db
        .update(surgeryRooms)
        .set({ sortOrder: index })
        .where(eq(surgeryRooms.id, id))
    )
  );
}

export async function getItemsByIds(itemIds: string[]): Promise<Item[]> {
  if (itemIds.length === 0) return [];
  return db.select().from(items).where(inArray(items.id, itemIds));
}

export async function getMedicationConfigsByItemIds(itemIds: string[]): Promise<any[]> {
  if (itemIds.length === 0) return [];
  return db.select().from(medicationConfigs).where(inArray(medicationConfigs.itemId, itemIds));
}
