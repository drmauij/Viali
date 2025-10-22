import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  primaryKey,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from 'drizzle-orm';
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (mandatory for Replit Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"), // For local auth users
  mustChangePassword: boolean("must_change_password").default(false), // Force password change on first login
  resetToken: varchar("reset_token"), // Password reset token
  resetTokenExpiry: timestamp("reset_token_expiry"), // Token expiration time
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Hospital table
export const hospitals = pgTable("hospitals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  address: text("address"),
  timezone: varchar("timezone").default("UTC"),
  googleAuthEnabled: boolean("google_auth_enabled").default(true),
  localAuthEnabled: boolean("local_auth_enabled").default(true),
  licenseType: varchar("license_type", { enum: ["free", "basic"] }).default("free").notNull(),
  anesthesiaLocationId: varchar("anesthesia_location_id").references(() => locations.id), // Designates which location's inventory is used for anesthesia module
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// User-Hospital-Role mapping
export const userHospitalRoles = pgTable("user_hospital_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  role: varchar("role").notNull(), // doctor, nurse, admin
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_hospital_roles_user").on(table.userId),
  index("idx_user_hospital_roles_hospital").on(table.hospitalId),
  index("idx_user_hospital_roles_location").on(table.locationId),
]);

// Vendors
export const vendors = pgTable("vendors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  contact: text("contact"),
  leadTime: integer("lead_time").default(7), // days
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_vendors_hospital").on(table.hospitalId),
]);

// Locations
export const locations: any = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  type: varchar("type"), // OR, ICU, Storage, etc.
  parentId: varchar("parent_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_locations_hospital").on(table.hospitalId),
  index("idx_locations_parent").on(table.parentId),
]);

// Folders (for organizing items)
export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  name: varchar("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_folders_hospital").on(table.hospitalId),
  index("idx_folders_location").on(table.locationId),
]);

// Items
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  folderId: varchar("folder_id").references(() => folders.id),
  name: varchar("name").notNull(),
  description: text("description"),
  unit: varchar("unit").notNull(), // vial, amp, ml, etc.
  packSize: integer("pack_size").default(1),
  minThreshold: integer("min_threshold"),
  maxThreshold: integer("max_threshold"),
  defaultOrderQty: integer("default_order_qty").default(0),
  critical: boolean("critical").default(false),
  controlled: boolean("controlled").default(false),
  trackExactQuantity: boolean("track_exact_quantity").default(false),
  currentUnits: integer("current_units").default(0),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  barcodes: text("barcodes").array(), // Multiple barcodes per item
  imageUrl: varchar("image_url"),
  sortOrder: integer("sort_order").default(0),
  // Anesthesia type flag (detailed config in medicationConfigs table)
  anesthesiaType: varchar("anesthesia_type", { enum: ["none", "medication", "infusion"] }).default("none").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_items_hospital").on(table.hospitalId),
  index("idx_items_location").on(table.locationId),
  index("idx_items_vendor").on(table.vendorId),
  index("idx_items_folder").on(table.folderId),
  index("idx_items_anesthesia_type").on(table.anesthesiaType),
]);

// Stock Levels
export const stockLevels = pgTable("stock_levels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  qtyOnHand: integer("qty_on_hand").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_stock_levels_item").on(table.itemId),
  index("idx_stock_levels_location").on(table.locationId),
  unique("unique_item_location").on(table.itemId, table.locationId),
]);

// Lots (for expiry tracking)
export const lots = pgTable("lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id),
  lotNumber: varchar("lot_number").notNull(),
  expiryDate: timestamp("expiry_date"),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  qty: integer("qty").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_lots_item").on(table.itemId),
  index("idx_lots_expiry").on(table.expiryDate),
]);

// Orders
export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  status: varchar("status").notNull().default("draft"), // draft, sent, received
  createdBy: varchar("created_by").notNull().references(() => users.id),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_orders_hospital").on(table.hospitalId),
  index("idx_orders_vendor").on(table.vendorId),
  index("idx_orders_status").on(table.status),
]);

// Order Lines
export const orderLines = pgTable("order_lines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  itemId: varchar("item_id").notNull().references(() => items.id),
  qty: integer("qty").notNull(),
  packSize: integer("pack_size").default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }),
  received: boolean("received").default(false),
  receivedAt: timestamp("received_at"),
  receivedBy: varchar("received_by").references(() => users.id),
  receiveNotes: text("receive_notes"),
  receiveSignature: text("receive_signature"),
}, (table) => [
  index("idx_order_lines_order").on(table.orderId),
  index("idx_order_lines_item").on(table.itemId),
]);

// Activity Log (immutable audit trail)
export const activities = pgTable("activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  timestamp: timestamp("timestamp").defaultNow(),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: varchar("action").notNull(), // count, receive, dispense, adjust, etc.
  itemId: varchar("item_id").references(() => items.id),
  lotId: varchar("lot_id").references(() => lots.id),
  locationId: varchar("location_id").references(() => locations.id),
  delta: integer("delta"), // quantity change
  movementType: varchar("movement_type", { enum: ["IN", "OUT"] }), // IN = stock increase, OUT = stock decrease
  notes: text("notes"),
  patientId: varchar("patient_id"), // for controlled substances
  patientPhoto: text("patient_photo"), // encrypted photo data (base64)
  signatures: jsonb("signatures"), // array of e-signatures
  controlledVerified: boolean("controlled_verified").default(false),
  metadata: jsonb("metadata"), // additional data
}, (table) => [
  index("idx_activities_timestamp").on(table.timestamp),
  index("idx_activities_user").on(table.userId),
  index("idx_activities_item").on(table.itemId),
  index("idx_activities_controlled").on(table.controlledVerified),
]);

// Alerts
export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  type: varchar("type").notNull(), // below_min, expiring, audit_due, recall
  itemId: varchar("item_id").references(() => items.id),
  lotId: varchar("lot_id").references(() => lots.id),
  title: varchar("title").notNull(),
  description: text("description"),
  severity: varchar("severity").default("medium"), // low, medium, high, critical
  acknowledged: boolean("acknowledged").default(false),
  acknowledgedBy: varchar("acknowledged_by").references(() => users.id),
  acknowledgedAt: timestamp("acknowledged_at"),
  snoozedUntil: timestamp("snoozed_until"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_alerts_hospital").on(table.hospitalId),
  index("idx_alerts_type").on(table.type),
  index("idx_alerts_acknowledged").on(table.acknowledged),
]);

// Controlled Checks (routine inventory verification)
export const controlledChecks = pgTable("controlled_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow(),
  signature: text("signature").notNull(),
  checkItems: jsonb("check_items").notNull(), // array of { itemId, itemName, qtyInApp, qtyActual, match }
  allMatch: boolean("all_match").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_controlled_checks_hospital").on(table.hospitalId),
  index("idx_controlled_checks_location").on(table.locationId),
  index("idx_controlled_checks_timestamp").on(table.timestamp),
]);

// Import Jobs (background bulk import processing)
export const importJobs = pgTable("import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: varchar("status").notNull().default("queued"), // queued, processing, completed, failed
  totalImages: integer("total_images").notNull(),
  processedImages: integer("processed_images").default(0),
  extractedItems: integer("extracted_items").default(0),
  imagesData: jsonb("images_data"), // temporary storage for base64 images
  results: jsonb("results"), // array of extracted items
  error: text("error"),
  notificationSent: boolean("notification_sent").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_import_jobs_hospital").on(table.hospitalId),
  index("idx_import_jobs_user").on(table.userId),
  index("idx_import_jobs_status").on(table.status),
  index("idx_import_jobs_created").on(table.createdAt),
]);


// Checklist Templates (recurring checks for equipment/machinery)
export const checklistTemplates = pgTable("checklist_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  role: varchar("role"), // null = any role, otherwise specific role required
  name: varchar("name").notNull(), // e.g., "Emergency Backpack", "Ventilator"
  description: text("description"),
  recurrency: varchar("recurrency").notNull(), // daily, weekly, monthly, yearly
  startDate: timestamp("start_date").notNull(), // when the recurrency starts
  items: jsonb("items").notNull(), // array of { description: string } - items to check
  active: boolean("active").default(true), // allow templates to be archived
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_checklist_templates_hospital").on(table.hospitalId),
  index("idx_checklist_templates_location").on(table.locationId),
  index("idx_checklist_templates_active").on(table.active),
]);

// Checklist Completions (record of completed checklists)
export const checklistCompletions = pgTable("checklist_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => checklistTemplates.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  locationId: varchar("location_id").notNull().references(() => locations.id),
  completedBy: varchar("completed_by").notNull().references(() => users.id),
  completedAt: timestamp("completed_at").defaultNow(),
  dueDate: timestamp("due_date").notNull(), // which recurrency period this completion covers
  comment: text("comment"),
  signature: text("signature").notNull(),
  templateSnapshot: jsonb("template_snapshot").notNull(), // snapshot of template at time of completion
}, (table) => [
  index("idx_checklist_completions_template").on(table.templateId),
  index("idx_checklist_completions_hospital").on(table.hospitalId),
  index("idx_checklist_completions_location").on(table.locationId),
  index("idx_checklist_completions_completed_at").on(table.completedAt),
  index("idx_checklist_completions_due_date").on(table.dueDate),
]);

// Medication Configurations (anesthesia-specific medication data)
export const medicationConfigs = pgTable("medication_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }).unique(), // One-to-one with items
  
  // Classification
  medicationGroup: varchar("medication_group"), // "Hypnotika", "Opioide", "Muskelrelaxantien", etc.
  
  // Ampule Information
  ampuleSize: varchar("ampule_size"), // "5ml", "10ml", "2ml"
  ampuleTotalContent: varchar("ampule_total_content"), // "20mg", "150µg" (total drug in one ampule)
  
  // Dosing Information
  defaultDose: varchar("default_dose"), // "12" or "25-35-50" for ranges
  
  // Administration
  administrationRoute: varchar("administration_route"), // "i.v.", "s.c.", "p.o.", "spinal", etc.
  administrationUnit: varchar("administration_unit"), // "μg", "mg", "g", "ml"
  
  // Infusion-specific
  isRateControlled: boolean("is_rate_controlled").default(false), // For perfusor/continuous infusions
  rateUnit: varchar("rate_unit"), // "ml/h", "μg/kg/min", "mg/kg/h"
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_medication_configs_item").on(table.itemId),
  index("idx_medication_configs_group").on(table.medicationGroup),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userHospitalRoles: many(userHospitalRoles),
  activities: many(activities),
}));

export const hospitalsRelations = relations(hospitals, ({ many }) => ({
  userHospitalRoles: many(userHospitalRoles),
  vendors: many(vendors),
  locations: many(locations),
  folders: many(folders),
  items: many(items),
  orders: many(orders),
  alerts: many(alerts),
}));

export const userHospitalRolesRelations = relations(userHospitalRoles, ({ one }) => ({
  user: one(users, { fields: [userHospitalRoles.userId], references: [users.id] }),
  hospital: one(hospitals, { fields: [userHospitalRoles.hospitalId], references: [hospitals.id] }),
}));

export const vendorsRelations = relations(vendors, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [vendors.hospitalId], references: [hospitals.id] }),
  items: many(items),
  orders: many(orders),
}));

export const locationsRelations = relations(locations, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [locations.hospitalId], references: [hospitals.id] }),
  parent: one(locations, { fields: [locations.parentId], references: [locations.id] }),
  children: many(locations),
  folders: many(folders),
  stockLevels: many(stockLevels),
  lots: many(lots),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [folders.hospitalId], references: [hospitals.id] }),
  location: one(locations, { fields: [folders.locationId], references: [locations.id] }),
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [items.hospitalId], references: [hospitals.id] }),
  folder: one(folders, { fields: [items.folderId], references: [folders.id] }),
  vendor: one(vendors, { fields: [items.vendorId], references: [vendors.id] }),
  medicationConfig: one(medicationConfigs, { fields: [items.id], references: [medicationConfigs.itemId] }),
  stockLevels: many(stockLevels),
  lots: many(lots),
  orderLines: many(orderLines),
  activities: many(activities),
  alerts: many(alerts),
}));

export const stockLevelsRelations = relations(stockLevels, ({ one }) => ({
  item: one(items, { fields: [stockLevels.itemId], references: [items.id] }),
  location: one(locations, { fields: [stockLevels.locationId], references: [locations.id] }),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  item: one(items, { fields: [lots.itemId], references: [items.id] }),
  location: one(locations, { fields: [lots.locationId], references: [locations.id] }),
  activities: many(activities),
  alerts: many(alerts),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [orders.hospitalId], references: [hospitals.id] }),
  vendor: one(vendors, { fields: [orders.vendorId], references: [vendors.id] }),
  createdByUser: one(users, { fields: [orders.createdBy], references: [users.id] }),
  orderLines: many(orderLines),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  item: one(items, { fields: [orderLines.itemId], references: [items.id] }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  user: one(users, { fields: [activities.userId], references: [users.id] }),
  item: one(items, { fields: [activities.itemId], references: [items.id] }),
  lot: one(lots, { fields: [activities.lotId], references: [lots.id] }),
  location: one(locations, { fields: [activities.locationId], references: [locations.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  hospital: one(hospitals, { fields: [alerts.hospitalId], references: [hospitals.id] }),
  item: one(items, { fields: [alerts.itemId], references: [items.id] }),
  lot: one(lots, { fields: [alerts.lotId], references: [lots.id] }),
  acknowledgedByUser: one(users, { fields: [alerts.acknowledgedBy], references: [users.id] }),
}));

export const controlledChecksRelations = relations(controlledChecks, ({ one }) => ({
  hospital: one(hospitals, { fields: [controlledChecks.hospitalId], references: [hospitals.id] }),
  location: one(locations, { fields: [controlledChecks.locationId], references: [locations.id] }),
  user: one(users, { fields: [controlledChecks.userId], references: [users.id] }),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  hospital: one(hospitals, { fields: [importJobs.hospitalId], references: [hospitals.id] }),
  location: one(locations, { fields: [importJobs.locationId], references: [locations.id] }),
  user: one(users, { fields: [importJobs.userId], references: [users.id] }),
}));

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [checklistTemplates.hospitalId], references: [hospitals.id] }),
  location: one(locations, { fields: [checklistTemplates.locationId], references: [locations.id] }),
  createdByUser: one(users, { fields: [checklistTemplates.createdBy], references: [users.id] }),
  completions: many(checklistCompletions),
}));

export const checklistCompletionsRelations = relations(checklistCompletions, ({ one }) => ({
  template: one(checklistTemplates, { fields: [checklistCompletions.templateId], references: [checklistTemplates.id] }),
  hospital: one(hospitals, { fields: [checklistCompletions.hospitalId], references: [hospitals.id] }),
  location: one(locations, { fields: [checklistCompletions.locationId], references: [locations.id] }),
  completedByUser: one(users, { fields: [checklistCompletions.completedBy], references: [users.id] }),
}));

export const medicationConfigsRelations = relations(medicationConfigs, ({ one }) => ({
  item: one(items, { fields: [medicationConfigs.itemId], references: [items.id] }),
}));

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertHospitalSchema = createInsertSchema(hospitals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertUserHospitalRoleSchema = createInsertSchema(userHospitalRoles).omit({
  id: true,
  createdAt: true,
});

export const insertFolderSchema = createInsertSchema(folders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertItemSchema = createInsertSchema(items).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  timestamp: true,
});

export const insertControlledCheckSchema = createInsertSchema(controlledChecks).omit({
  id: true,
  timestamp: true,
});

export const insertImportJobSchema = createInsertSchema(importJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export const insertChecklistTemplateSchema = createInsertSchema(checklistTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  items: z.array(z.object({
    description: z.string().trim().min(1, "Item description cannot be empty"),
  })).min(1, "At least one checklist item is required"),
  startDate: z.coerce.date(),
});

export const insertChecklistCompletionSchema = createInsertSchema(checklistCompletions).omit({
  id: true,
  completedAt: true,
});

export const insertMedicationConfigSchema = createInsertSchema(medicationConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;
export type Hospital = typeof hospitals.$inferSelect;
export type UserHospitalRole = typeof userHospitalRoles.$inferSelect;
export type Folder = typeof folders.$inferSelect;
export type Item = typeof items.$inferSelect;
export type StockLevel = typeof stockLevels.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Location = typeof locations.$inferSelect;

export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;
export type InsertUserHospitalRole = z.infer<typeof insertUserHospitalRoleSchema>;
export type ControlledCheck = typeof controlledChecks.$inferSelect;
export type InsertControlledCheck = z.infer<typeof insertControlledCheckSchema>;
export type ImportJob = typeof importJobs.$inferSelect;
export type InsertImportJob = z.infer<typeof insertImportJobSchema>;
export type ChecklistTemplate = typeof checklistTemplates.$inferSelect;
export type InsertChecklistTemplate = z.infer<typeof insertChecklistTemplateSchema>;
export type ChecklistCompletion = typeof checklistCompletions.$inferSelect;
export type InsertChecklistCompletion = z.infer<typeof insertChecklistCompletionSchema>;
export type MedicationConfig = typeof medicationConfigs.$inferSelect;
export type InsertMedicationConfig = z.infer<typeof insertMedicationConfigSchema>;

// Bulk operations schemas
export const bulkImportItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("pack"),
  packSize: z.number().int().positive().default(1),
  minThreshold: z.number().int().min(0).optional(),
  maxThreshold: z.number().int().min(0).optional(),
  initialStock: z.number().int().min(0).default(0),
  critical: z.boolean().default(false),
  controlled: z.boolean().default(false),
});

export const bulkImportSchema = z.object({
  items: z.array(bulkImportItemSchema),
});

export const bulkUpdateItemSchema = z.object({
  id: z.string(),
  minThreshold: z.number().int().min(0).optional(),
  maxThreshold: z.number().int().min(0).optional(),
  actualStock: z.number().int().min(0).optional(),
});

export const bulkUpdateSchema = z.object({
  items: z.array(bulkUpdateItemSchema),
});

export type BulkImportItem = z.infer<typeof bulkImportItemSchema>;
export type BulkImport = z.infer<typeof bulkImportSchema>;
export type BulkUpdateItem = z.infer<typeof bulkUpdateItemSchema>;
export type BulkUpdate = z.infer<typeof bulkUpdateSchema>;
