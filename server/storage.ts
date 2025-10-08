import {
  users,
  hospitals,
  userHospitalRoles,
  vendors,
  locations,
  folders,
  items,
  stockLevels,
  lots,
  orders,
  orderLines,
  activities,
  alerts,
  controlledChecks,
  importJobs,
  importJobImages,
  type User,
  type UpsertUser,
  type Hospital,
  type UserHospitalRole,
  type Folder,
  type Item,
  type StockLevel,
  type Lot,
  type Order,
  type OrderLine,
  type Activity,
  type Alert,
  type Vendor,
  type Location,
  type InsertFolder,
  type InsertItem,
  type InsertActivity,
  type ControlledCheck,
  type InsertControlledCheck,
  type ImportJob,
  type ImportJobImage,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, lte, gte } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Hospital operations
  getHospital(id: string): Promise<Hospital | undefined>;
  getUserHospitals(userId: string): Promise<(Hospital & { role: string; locationId: string; locationName: string })[]>;
  createHospital(name: string): Promise<Hospital>;
  updateHospital(id: string, updates: Partial<Hospital>): Promise<Hospital>;
  
  // Folder operations
  getFolders(hospitalId: string, locationId: string): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: string, updates: Partial<Folder>): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  
  // Item operations
  getItems(hospitalId: string, locationId: string, filters?: {
    critical?: boolean;
    controlled?: boolean;
    belowMin?: boolean;
    expiring?: boolean;
  }): Promise<(Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[]>;
  getItem(id: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, updates: Partial<Item>): Promise<Item>;
  deleteItem(id: string): Promise<void>;
  
  // Stock operations
  getStockLevel(itemId: string, locationId: string): Promise<StockLevel | undefined>;
  updateStockLevel(itemId: string, locationId: string, qty: number): Promise<StockLevel>;
  
  // Lot operations
  getLots(itemId: string): Promise<Lot[]>;
  createLot(lot: Omit<Lot, 'id' | 'createdAt'>): Promise<Lot>;
  
  // Order operations
  getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { location: Location } })[] })[]>;
  createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  findOrCreateDraftOrder(hospitalId: string, vendorId: string | null, createdBy: string): Promise<Order>;
  addItemToOrder(orderId: string, itemId: string, qty: number, packSize: number): Promise<OrderLine>;
  updateOrderLine(lineId: string, qty: number): Promise<OrderLine>;
  removeOrderLine(lineId: string): Promise<void>;
  deleteOrder(orderId: string): Promise<void>;
  getVendors(hospitalId: string): Promise<Vendor[]>;
  
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getActivities(filters: {
    hospitalId?: string;
    locationId?: string;
    itemId?: string;
    userId?: string;
    controlled?: boolean;
    limit?: number;
  }): Promise<(Activity & { user: User; item?: Item })[]>;
  
  // Alert operations
  getAlerts(hospitalId: string, acknowledged?: boolean): Promise<(Alert & { item?: Item; lot?: Lot })[]>;
  acknowledgeAlert(id: string, userId: string): Promise<Alert>;
  snoozeAlert(id: string, until: Date): Promise<Alert>;
  
  // Dashboard KPIs
  getDashboardKPIs(hospitalId: string): Promise<{
    belowMin: number;
    expiringSoon: number;
    pendingOrders: number;
    auditDue: number;
  }>;
  
  // Barcode lookup
  findItemByBarcode(barcode: string, hospitalId: string, locationId?: string): Promise<(Item & { stockLevel?: StockLevel }) | undefined>;
  
  // Admin - Location management
  getLocations(hospitalId: string): Promise<Location[]>;
  createLocation(location: Omit<Location, 'id' | 'createdAt'>): Promise<Location>;
  updateLocation(id: string, updates: Partial<Location>): Promise<Location>;
  deleteLocation(id: string): Promise<void>;
  
  // Admin - User management
  getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; location: Location })[]>;
  createUserHospitalRole(data: Omit<UserHospitalRole, 'id' | 'createdAt'>): Promise<UserHospitalRole>;
  updateUserHospitalRole(id: string, updates: Partial<UserHospitalRole>): Promise<UserHospitalRole>;
  deleteUserHospitalRole(id: string): Promise<void>;
  searchUserByEmail(email: string): Promise<User | undefined>;
  createUserWithPassword(email: string, password: string, firstName: string, lastName: string): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User>;
  updateUserPassword(userId: string, newPassword: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  
  // Controlled Checks
  createControlledCheck(check: InsertControlledCheck): Promise<ControlledCheck>;
  getControlledChecks(hospitalId: string, locationId: string, limit?: number): Promise<(ControlledCheck & { user: User })[]>;
  
  // Import Jobs
  createImportJob(job: Omit<ImportJob, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<ImportJob>;
  createImportJobImage(image: Omit<ImportJobImage, 'id' | 'createdAt'>): Promise<ImportJobImage>;
  getImportJob(id: string): Promise<ImportJob | undefined>;
  getImportJobs(hospitalId: string, userId?: string, status?: string): Promise<ImportJob[]>;
  updateImportJob(id: string, updates: Partial<ImportJob>): Promise<ImportJob>;
  getImportJobImages(jobId: string): Promise<ImportJobImage[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getHospital(id: string): Promise<Hospital | undefined> {
    const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, id));
    return hospital;
  }

  async getUserHospitals(userId: string): Promise<(Hospital & { role: string; locationId: string; locationName: string })[]> {
    const result = await db
      .select()
      .from(hospitals)
      .innerJoin(userHospitalRoles, eq(hospitals.id, userHospitalRoles.hospitalId))
      .innerJoin(locations, eq(userHospitalRoles.locationId, locations.id))
      .where(eq(userHospitalRoles.userId, userId));
    
    return result.map(row => ({
      ...row.hospitals,
      role: row.user_hospital_roles.role,
      locationId: row.user_hospital_roles.locationId,
      locationName: row.locations.name,
    })) as (Hospital & { role: string; locationId: string; locationName: string })[];
  }

  async createHospital(name: string): Promise<Hospital> {
    const [hospital] = await db
      .insert(hospitals)
      .values({ name })
      .returning();
    return hospital;
  }

  async updateHospital(id: string, updates: Partial<Hospital>): Promise<Hospital> {
    const [updated] = await db
      .update(hospitals)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(hospitals.id, id))
      .returning();
    return updated;
  }

  async getFolders(hospitalId: string, locationId: string): Promise<Folder[]> {
    return await db
      .select()
      .from(folders)
      .where(and(eq(folders.hospitalId, hospitalId), eq(folders.locationId, locationId)));
  }

  async getFolder(id: string): Promise<Folder | undefined> {
    const [folder] = await db.select().from(folders).where(eq(folders.id, id));
    return folder;
  }

  async createFolder(folder: InsertFolder): Promise<Folder> {
    const [created] = await db.insert(folders).values(folder).returning();
    return created;
  }

  async updateFolder(id: string, updates: Partial<Folder>): Promise<Folder> {
    const [updated] = await db
      .update(folders)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();
    return updated;
  }

  async deleteFolder(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(items)
        .set({ folderId: null })
        .where(eq(items.folderId, id));
      
      await tx.delete(folders).where(eq(folders.id, id));
    });
  }

  async getItems(hospitalId: string, locationId: string, filters?: {
    critical?: boolean;
    controlled?: boolean;
    belowMin?: boolean;
    expiring?: boolean;
  }): Promise<(Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[]> {
    let query = db
      .select({
        ...items,
        stockLevel: stockLevels,
        soonestExpiry: sql<Date>`MIN(${lots.expiryDate})`.as('soonest_expiry'),
      })
      .from(items)
      .leftJoin(stockLevels, eq(items.id, stockLevels.itemId))
      .leftJoin(lots, eq(items.id, lots.itemId))
      .where(and(eq(items.hospitalId, hospitalId), eq(items.locationId, locationId)))
      .groupBy(items.id, stockLevels.id);

    // Apply filters
    if (filters?.critical) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.locationId, locationId), eq(items.critical, true)));
    }
    if (filters?.controlled) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.locationId, locationId), eq(items.controlled, true)));
    }

    const result = await query;
    return result as (Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[];
  }

  async getItem(id: string): Promise<Item | undefined> {
    const [item] = await db.select().from(items).where(eq(items.id, id));
    return item;
  }

  async createItem(item: InsertItem): Promise<Item> {
    const [created] = await db.insert(items).values(item).returning();
    return created;
  }

  async updateItem(id: string, updates: Partial<Item>): Promise<Item> {
    const [updated] = await db
      .update(items)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(items.id, id))
      .returning();
    return updated;
  }

  async deleteItem(id: string): Promise<void> {
    // Wrap entire cascade deletion in a transaction for atomicity
    // This ensures either all deletions succeed or none do, preventing orphaned data
    await db.transaction(async (tx) => {
      // Delete in order to satisfy foreign key constraints
      // 1. Delete alerts that reference this item
      await tx.delete(alerts).where(eq(alerts.itemId, id));
      
      // 2. Delete activities that reference this item (and its lots)
      await tx.delete(activities).where(eq(activities.itemId, id));
      
      // 3. Delete order lines that reference this item
      await tx.delete(orderLines).where(eq(orderLines.itemId, id));
      
      // 4. Delete lots that belong to this item (must be before stock levels)
      await tx.delete(lots).where(eq(lots.itemId, id));
      
      // 5. Delete stock levels for this item
      await tx.delete(stockLevels).where(eq(stockLevels.itemId, id));
      
      // 6. Finally delete the item itself
      await tx.delete(items).where(eq(items.id, id));
    });
  }

  async getStockLevel(itemId: string, locationId: string): Promise<StockLevel | undefined> {
    const [level] = await db
      .select()
      .from(stockLevels)
      .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.locationId, locationId)));
    return level;
  }

  async updateStockLevel(itemId: string, locationId: string, qty: number): Promise<StockLevel> {
    const [updated] = await db
      .insert(stockLevels)
      .values({
        itemId,
        locationId,
        qtyOnHand: qty,
      })
      .onConflictDoUpdate({
        target: [stockLevels.itemId, stockLevels.locationId],
        set: {
          qtyOnHand: qty,
          updatedAt: new Date(),
        },
      })
      .returning();
    return updated;
  }

  async getLots(itemId: string): Promise<Lot[]> {
    return await db
      .select()
      .from(lots)
      .where(eq(lots.itemId, itemId))
      .orderBy(asc(lots.expiryDate));
  }

  async createLot(lot: Omit<Lot, 'id' | 'createdAt'>): Promise<Lot> {
    const [created] = await db.insert(lots).values(lot).returning();
    return created;
  }

  async getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { location: Location } })[] })[]> {
    let query = db
      .select()
      .from(orders)
      .where(eq(orders.hospitalId, hospitalId));

    if (status) {
      query = query.where(and(eq(orders.hospitalId, hospitalId), eq(orders.status, status)));
    }

    const ordersResult = await query.orderBy(desc(orders.createdAt));
    
    // Fetch related data for each order
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
            item: items,
            location: locations,
            stockLevel: stockLevels,
          })
          .from(orderLines)
          .innerJoin(items, eq(orderLines.itemId, items.id))
          .innerJoin(locations, eq(items.locationId, locations.id))
          .leftJoin(stockLevels, and(eq(stockLevels.itemId, items.id), eq(stockLevels.locationId, items.locationId)))
          .where(eq(orderLines.orderId, order.id));

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
            item: {
              ...line.item,
              location: line.location,
              stockLevel: line.stockLevel,
            },
          })),
        };
      })
    );

    return ordersWithDetails;
  }

  async createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order> {
    const [created] = await db.insert(orders).values(order).returning();
    return created;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const [updated] = await db
      .update(orders)
      .set({ status, updatedAt: new Date() })
      .where(eq(orders.id, id))
      .returning();
    return updated;
  }

  async findOrCreateDraftOrder(hospitalId: string, vendorId: string | null, createdBy: string): Promise<Order> {
    const whereConditions = vendorId 
      ? and(
          eq(orders.hospitalId, hospitalId),
          eq(orders.vendorId, vendorId),
          eq(orders.status, 'draft')
        )
      : and(
          eq(orders.hospitalId, hospitalId),
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
        vendorId,
        status: 'draft',
        createdBy,
        totalAmount: '0',
      })
      .returning();

    return newOrder;
  }

  async addItemToOrder(orderId: string, itemId: string, qty: number, packSize: number): Promise<OrderLine> {
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

  async updateOrderLine(lineId: string, qty: number): Promise<OrderLine> {
    const [updated] = await db
      .update(orderLines)
      .set({ qty })
      .where(eq(orderLines.id, lineId))
      .returning();
    return updated;
  }

  async removeOrderLine(lineId: string): Promise<void> {
    await db
      .delete(orderLines)
      .where(eq(orderLines.id, lineId));
  }

  async deleteOrder(orderId: string): Promise<void> {
    await db.delete(orderLines).where(eq(orderLines.orderId, orderId));
    await db.delete(orders).where(eq(orders.id, orderId));
  }

  async getVendors(hospitalId: string): Promise<Vendor[]> {
    const result = await db
      .select()
      .from(vendors)
      .where(eq(vendors.hospitalId, hospitalId));
    return result;
  }

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [created] = await db.insert(activities).values(activity).returning();
    return created;
  }

  async getActivityById(activityId: string): Promise<Activity | undefined> {
    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId));
    
    return activity;
  }

  async verifyControlledActivity(activityId: string, signature: string, verifiedBy: string): Promise<Activity> {
    const [activity] = await db
      .select()
      .from(activities)
      .where(eq(activities.id, activityId));
    
    if (!activity) {
      throw new Error("Activity not found");
    }

    const currentSignatures = (activity.signatures as string[]) || [];
    const updatedSignatures = [...currentSignatures, signature];

    const [updated] = await db
      .update(activities)
      .set({
        signatures: updatedSignatures,
        controlledVerified: true,
      })
      .where(eq(activities.id, activityId))
      .returning();

    return updated;
  }

  async getActivities(filters: {
    hospitalId?: string;
    locationId?: string;
    itemId?: string;
    userId?: string;
    controlled?: boolean;
    limit?: number;
  }): Promise<(Activity & { user: User; item?: Item })[]> {
    const conditions = [];
    
    if (filters.itemId) conditions.push(eq(activities.itemId, filters.itemId));
    if (filters.userId) conditions.push(eq(activities.userId, filters.userId));
    if (filters.controlled !== undefined) {
      if (filters.controlled) {
        conditions.push(sql`${activities.patientId} IS NOT NULL`);
      } else {
        conditions.push(sql`${activities.patientId} IS NULL`);
      }
    }

    let query = db
      .select({
        ...activities,
        user: users,
        item: items,
      })
      .from(activities)
      .innerJoin(users, eq(activities.userId, users.id))
      .leftJoin(items, eq(activities.itemId, items.id));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (filters.hospitalId) {
      conditions.push(eq(items.hospitalId, filters.hospitalId));
    }

    if (filters.locationId) {
      conditions.push(eq(items.locationId, filters.locationId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(activities.timestamp));

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    return await query;
  }

  async getAlerts(hospitalId: string, acknowledged?: boolean): Promise<(Alert & { item?: Item; lot?: Lot })[]> {
    let query = db
      .select({
        ...alerts,
        item: items,
        lot: lots,
      })
      .from(alerts)
      .leftJoin(items, eq(alerts.itemId, items.id))
      .leftJoin(lots, eq(alerts.lotId, lots.id))
      .where(eq(alerts.hospitalId, hospitalId));

    if (acknowledged !== undefined) {
      query = query.where(and(eq(alerts.hospitalId, hospitalId), eq(alerts.acknowledged, acknowledged)));
    }

    return await query.orderBy(desc(alerts.createdAt));
  }

  async acknowledgeAlert(id: string, userId: string): Promise<Alert> {
    const [updated] = await db
      .update(alerts)
      .set({
        acknowledged: true,
        acknowledgedBy: userId,
        acknowledgedAt: new Date(),
      })
      .where(eq(alerts.id, id))
      .returning();
    return updated;
  }

  async snoozeAlert(id: string, until: Date): Promise<Alert> {
    const [updated] = await db
      .update(alerts)
      .set({ snoozedUntil: until })
      .where(eq(alerts.id, id))
      .returning();
    return updated;
  }

  async getDashboardKPIs(hospitalId: string): Promise<{
    belowMin: number;
    expiringSoon: number;
    pendingOrders: number;
    auditDue: number;
  }> {
    // Below min items
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

    // Expiring soon (30 days)
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

    // Pending orders
    const pendingOrdersQuery = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(orders)
      .where(
        and(
          eq(orders.hospitalId, hospitalId),
          inArray(orders.status, ['draft', 'sent', 'receiving'])
        )
      );

    // Audit due (mock for now - would be based on controlled items and last audit date)
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
      auditDue: Math.min(auditDue.count || 0, 15), // Cap at 15 for demo
    };
  }

  async findItemByBarcode(barcode: string, hospitalId: string, locationId?: string): Promise<(Item & { stockLevel?: StockLevel }) | undefined> {
    const conditions = [
      eq(items.hospitalId, hospitalId),
      sql`${barcode} = ANY(${items.barcodes})`
    ];
    
    // If locationId is provided, filter items by location
    if (locationId) {
      conditions.push(eq(items.locationId, locationId));
    }
    
    const [result] = await db
      .select()
      .from(items)
      .leftJoin(
        stockLevels, 
        and(
          eq(items.id, stockLevels.itemId),
          locationId ? eq(stockLevels.locationId, locationId) : undefined
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

  // Admin - Location management
  async getLocations(hospitalId: string): Promise<Location[]> {
    return await db
      .select()
      .from(locations)
      .where(eq(locations.hospitalId, hospitalId))
      .orderBy(asc(locations.name));
  }

  async createLocation(location: Omit<Location, 'id' | 'createdAt'>): Promise<Location> {
    const [newLocation] = await db
      .insert(locations)
      .values(location)
      .returning();
    return newLocation;
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location> {
    const [updated] = await db
      .update(locations)
      .set(updates)
      .where(eq(locations.id, id))
      .returning();
    return updated;
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locations).where(eq(locations.id, id));
  }

  // Admin - User management
  async getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; location: Location })[]> {
    const results = await db
      .select()
      .from(userHospitalRoles)
      .innerJoin(users, eq(userHospitalRoles.userId, users.id))
      .innerJoin(locations, eq(userHospitalRoles.locationId, locations.id))
      .where(eq(userHospitalRoles.hospitalId, hospitalId))
      .orderBy(asc(users.email));
    
    return results.map(row => ({
      ...row.user_hospital_roles,
      user: row.users,
      location: row.locations,
    }));
  }

  async createUserHospitalRole(data: Omit<UserHospitalRole, 'id' | 'createdAt'>): Promise<UserHospitalRole> {
    const [newRole] = await db
      .insert(userHospitalRoles)
      .values(data)
      .returning();
    return newRole;
  }

  async updateUserHospitalRole(id: string, updates: Partial<UserHospitalRole>): Promise<UserHospitalRole> {
    const [updated] = await db
      .update(userHospitalRoles)
      .set(updates)
      .where(eq(userHospitalRoles.id, id))
      .returning();
    return updated;
  }

  async deleteUserHospitalRole(id: string): Promise<void> {
    await db.delete(userHospitalRoles).where(eq(userHospitalRoles.id, id));
  }

  async searchUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user;
  }

  async createUserWithPassword(email: string, password: string, firstName: string, lastName: string): Promise<User> {
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(password, 10);
    const nanoid = (await import('nanoid')).nanoid;
    
    const [newUser] = await db
      .insert(users)
      .values({
        id: nanoid(),
        email,
        passwordHash: hashedPassword,
        firstName,
        lastName,
        profileImageUrl: null,
      })
      .returning();
    return newUser;
  }

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const [updated] = await db
      .update(users)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async updateUserPassword(userId: string, newPassword: string): Promise<void> {
    const bcrypt = await import('bcrypt');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    await db
      .update(users)
      .set({ passwordHash: hashedPassword, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async deleteUser(userId: string): Promise<void> {
    await db.delete(users).where(eq(users.id, userId));
  }
  
  async createControlledCheck(check: InsertControlledCheck): Promise<ControlledCheck> {
    const [created] = await db.insert(controlledChecks).values(check).returning();
    return created;
  }
  
  async getControlledChecks(hospitalId: string, locationId: string, limit: number = 50): Promise<(ControlledCheck & { user: User })[]> {
    const checks = await db
      .select({
        ...controlledChecks,
        user: users,
      })
      .from(controlledChecks)
      .leftJoin(users, eq(controlledChecks.userId, users.id))
      .where(and(
        eq(controlledChecks.hospitalId, hospitalId),
        eq(controlledChecks.locationId, locationId)
      ))
      .orderBy(desc(controlledChecks.timestamp))
      .limit(limit);
    
    return checks as (ControlledCheck & { user: User })[];
  }

  async createImportJob(job: Omit<ImportJob, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<ImportJob> {
    const [created] = await db.insert(importJobs).values(job).returning();
    return created;
  }

  async createImportJobImage(image: Omit<ImportJobImage, 'id' | 'createdAt'>): Promise<ImportJobImage> {
    const [created] = await db.insert(importJobImages).values(image).returning();
    return created;
  }

  async getImportJob(id: string): Promise<ImportJob | undefined> {
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id));
    return job;
  }

  async getImportJobs(hospitalId: string, userId?: string, status?: string): Promise<ImportJob[]> {
    const conditions = [eq(importJobs.hospitalId, hospitalId)];
    if (userId) conditions.push(eq(importJobs.userId, userId));
    if (status) conditions.push(eq(importJobs.status, status));

    const jobs = await db
      .select()
      .from(importJobs)
      .where(and(...conditions))
      .orderBy(desc(importJobs.createdAt));
    
    return jobs;
  }

  async updateImportJob(id: string, updates: Partial<ImportJob>): Promise<ImportJob> {
    const [updated] = await db
      .update(importJobs)
      .set(updates)
      .where(eq(importJobs.id, id))
      .returning();
    return updated;
  }

  async getImportJobImages(jobId: string): Promise<ImportJobImage[]> {
    const images = await db
      .select()
      .from(importJobImages)
      .where(eq(importJobImages.jobId, jobId))
      .orderBy(asc(importJobImages.imageIndex));
    
    return images;
  }
}

export const storage = new DatabaseStorage();
export { db };
