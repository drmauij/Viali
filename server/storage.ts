import {
  users,
  hospitals,
  userHospitalRoles,
  vendors,
  locations,
  items,
  stockLevels,
  lots,
  orders,
  orderLines,
  activities,
  alerts,
  type User,
  type UpsertUser,
  type Hospital,
  type UserHospitalRole,
  type Item,
  type StockLevel,
  type Lot,
  type Order,
  type Activity,
  type Alert,
  type Vendor,
  type Location,
  type InsertItem,
  type InsertActivity,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, lte, gte } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Hospital operations
  getHospital(id: string): Promise<Hospital | undefined>;
  getUserHospitals(userId: string): Promise<(Hospital & { role: string })[]>;
  
  // Item operations
  getItems(hospitalId: string, filters?: {
    critical?: boolean;
    controlled?: boolean;
    belowMin?: boolean;
    expiring?: boolean;
  }): Promise<(Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[]>;
  getItem(id: string): Promise<Item | undefined>;
  createItem(item: InsertItem): Promise<Item>;
  updateItem(id: string, updates: Partial<Item>): Promise<Item>;
  
  // Stock operations
  getStockLevel(itemId: string, locationId: string): Promise<StockLevel | undefined>;
  updateStockLevel(itemId: string, locationId: string, qty: number): Promise<StockLevel>;
  
  // Lot operations
  getLots(itemId: string): Promise<Lot[]>;
  createLot(lot: Omit<Lot, 'id' | 'createdAt'>): Promise<Lot>;
  
  // Order operations
  getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor; orderLines: (OrderLine & { item: Item })[] })[]>;
  createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getActivities(filters: {
    hospitalId?: string;
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
  findItemByBarcode(barcode: string, hospitalId: string): Promise<Item | undefined>;
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
          ...userData,
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

  async getUserHospitals(userId: string): Promise<(Hospital & { role: string })[]> {
    const result = await db
      .select()
      .from(hospitals)
      .innerJoin(userHospitalRoles, eq(hospitals.id, userHospitalRoles.hospitalId))
      .where(eq(userHospitalRoles.userId, userId));
    
    return result.map(row => ({
      ...row.hospitals,
      role: row.user_hospital_roles.role,
    })) as (Hospital & { role: string })[];
  }

  async getItems(hospitalId: string, filters?: {
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
      .where(eq(items.hospitalId, hospitalId))
      .groupBy(items.id, stockLevels.id);

    // Apply filters
    if (filters?.critical) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.critical, true)));
    }
    if (filters?.controlled) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.controlled, true)));
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

  async getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor; orderLines: (OrderLine & { item: Item })[] })[]> {
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
        const [vendor] = await db.select().from(vendors).where(eq(vendors.id, order.vendorId));
        const lines = await db
          .select({
            ...orderLines,
            item: items,
          })
          .from(orderLines)
          .innerJoin(items, eq(orderLines.itemId, items.id))
          .where(eq(orderLines.orderId, order.id));

        return {
          ...order,
          vendor,
          orderLines: lines,
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

  async createActivity(activity: InsertActivity): Promise<Activity> {
    const [created] = await db.insert(activities).values(activity).returning();
    return created;
  }

  async getActivities(filters: {
    hospitalId?: string;
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
      query = query.where(eq(items.hospitalId, filters.hospitalId));
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

  async findItemByBarcode(barcode: string, hospitalId: string): Promise<Item | undefined> {
    const [item] = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.hospitalId, hospitalId),
          sql`${barcode} = ANY(${items.barcodes})`
        )
      );
    return item;
  }
}

export const storage = new DatabaseStorage();
