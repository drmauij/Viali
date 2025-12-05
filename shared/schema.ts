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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Units
export const units = pgTable("units", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  type: varchar("type"), // OR, ICU, Storage, business, etc.
  parentId: varchar("parent_id"),
  isAnesthesiaModule: boolean("is_anesthesia_module").default(false),
  isSurgeryModule: boolean("is_surgery_module").default(false),
  isBusinessModule: boolean("is_business_module").default(false),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_units_hospital").on(table.hospitalId),
  index("idx_units_parent").on(table.parentId),
]);

// User-Hospital-Role mapping
export const userHospitalRoles = pgTable("user_hospital_roles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  role: varchar("role").notNull(), // doctor, nurse, admin
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_user_hospital_roles_user").on(table.userId),
  index("idx_user_hospital_roles_hospital").on(table.hospitalId),
  index("idx_user_hospital_roles_unit").on(table.unitId),
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

// Medication Groups (for organizing anesthesia medications)
export const medicationGroups = pgTable("medication_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_medication_groups_hospital").on(table.hospitalId),
]);

// Administration Groups (for organizing anesthesia items in charts - sortable)
export const administrationGroups = pgTable("administration_groups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_administration_groups_hospital").on(table.hospitalId),
]);

// Surgery Rooms (for managing operating rooms in anesthesia module)
export const surgeryRooms = pgTable("surgery_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_surgery_rooms_hospital").on(table.hospitalId),
]);

// Folders (for organizing items)
export const folders = pgTable("folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  name: varchar("name").notNull(),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_folders_hospital").on(table.hospitalId),
  index("idx_folders_unit").on(table.unitId),
]);

// Items
export const items = pgTable("items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  folderId: varchar("folder_id").references(() => folders.id),
  name: varchar("name").notNull(),
  description: text("description"),
  unit: varchar("unit").notNull(), // "Pack" or "Single unit"
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
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_items_hospital").on(table.hospitalId),
  index("idx_items_unit").on(table.unitId),
  index("idx_items_vendor").on(table.vendorId),
  index("idx_items_folder").on(table.folderId),
]);

// Item Codes (universal product identifiers - one per item)
export const itemCodes = pgTable("item_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }).unique(),
  
  // Universal identifiers
  gtin: varchar("gtin"), // Global Trade Item Number (EAN) - 13-14 digits
  pharmacode: varchar("pharmacode"), // Swiss pharmacy code - 7 digits
  swissmedicNr: varchar("swissmedic_nr"), // Swiss authorization number
  migel: varchar("migel"), // Swiss medical device list code (e.g., "03.07.02.06.1")
  atc: varchar("atc"), // Anatomical Therapeutic Chemical code (e.g., "C01BD01")
  
  // Manufacturer info
  manufacturer: varchar("manufacturer"), // Producer name (Sintetica, Fresenius Kabi, etc.)
  manufacturerRef: varchar("manufacturer_ref"), // Manufacturer's own reference code (REF)
  
  // Pack content info (for cost calculation)
  packContent: varchar("pack_content"), // Human readable (e.g., "10 Amp. à 5 ml")
  unitsPerPack: integer("units_per_pack"), // Numeric quantity per pack
  contentPerUnit: varchar("content_per_unit"), // Per-unit content (e.g., "5 ml", "50 mg")
  
  // Regulatory
  abgabekategorie: varchar("abgabekategorie"), // Swiss dispensing category (A, B, C, D, E)
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_item_codes_item").on(table.itemId),
  index("idx_item_codes_gtin").on(table.gtin),
  index("idx_item_codes_pharmacode").on(table.pharmacode),
]);

// Supplier Codes (supplier-specific article numbers and pricing - many per item)
export const supplierCodes = pgTable("supplier_codes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  
  // Supplier identification
  supplierName: varchar("supplier_name").notNull(), // "Polymed", "Galexis", "Voigt", etc.
  articleCode: varchar("article_code"), // Supplier's internal article number (PMC-Code, Art.Nr)
  catalogUrl: varchar("catalog_url"), // Direct link to supplier's product page
  
  // Pricing
  basispreis: decimal("basispreis", { precision: 10, scale: 2 }), // Base/wholesale price
  publikumspreis: decimal("publikumspreis", { precision: 10, scale: 2 }), // Public/retail price
  currency: varchar("currency").default("CHF"),
  
  // Status
  isPreferred: boolean("is_preferred").default(false), // Mark as preferred supplier
  isActive: boolean("is_active").default(true), // Supplier still carries this item
  
  // Tracking
  lastPriceUpdate: timestamp("last_price_update"),
  lastChecked: timestamp("last_checked"),
  matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }), // AI matching confidence (0.00-1.00)
  matchStatus: varchar("match_status").default("pending"), // pending, confirmed, rejected
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_supplier_codes_item").on(table.itemId),
  index("idx_supplier_codes_supplier").on(table.supplierName),
  index("idx_supplier_codes_preferred").on(table.isPreferred),
]);

// Supplier Catalogs - Configuration for automated price syncing
export const supplierCatalogs = pgTable("supplier_catalogs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  
  // Supplier identification
  supplierName: varchar("supplier_name").notNull(), // "Galexis", "Voigt", etc.
  supplierType: varchar("supplier_type").notNull().default("api"), // api, browser, manual
  
  // API Configuration (for API-based suppliers like Galexis)
  apiBaseUrl: varchar("api_base_url"), // e.g., "https://xml.e-galexis.com/V2"
  customerNumber: varchar("customer_number"), // Galexis customer/client number
  
  // Encrypted credentials (stored in database, encrypted with ENCRYPTION_SECRET)
  // Uses AES-256-CBC encryption - password is encrypted before storing
  apiPasswordEncrypted: text("api_password_encrypted"),
  
  // Settings
  isEnabled: boolean("is_enabled").default(true),
  syncSchedule: varchar("sync_schedule").default("manual"), // manual, daily, weekly
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // success, failed, partial
  lastSyncMessage: text("last_sync_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_supplier_catalogs_hospital").on(table.hospitalId),
  index("idx_supplier_catalogs_supplier").on(table.supplierName),
]);

// Price Sync Jobs - Track price synchronization jobs
export const priceSyncJobs = pgTable("price_sync_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  catalogId: varchar("catalog_id").notNull().references(() => supplierCatalogs.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  
  // Job status
  status: varchar("status").notNull().default("queued"), // queued, processing, completed, failed
  jobType: varchar("job_type").notNull().default("full_sync"), // full_sync, incremental
  
  // Progress tracking
  totalItems: integer("total_items").default(0),
  processedItems: integer("processed_items").default(0),
  matchedItems: integer("matched_items").default(0),
  updatedItems: integer("updated_items").default(0),
  progressPercent: integer("progress_percent").default(0),
  
  // Timing
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  
  // Results
  error: text("error"),
  summary: text("summary"), // JSON summary of changes
  
  // Audit
  triggeredBy: varchar("triggered_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_price_sync_jobs_catalog").on(table.catalogId),
  index("idx_price_sync_jobs_hospital").on(table.hospitalId),
  index("idx_price_sync_jobs_status").on(table.status),
]);

// Stock Levels
export const stockLevels = pgTable("stock_levels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  qtyOnHand: integer("qty_on_hand").default(0),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_stock_levels_item").on(table.itemId),
  index("idx_stock_levels_unit").on(table.unitId),
  unique("unique_item_unit").on(table.itemId, table.unitId),
]);

// Lots (for expiry tracking)
export const lots = pgTable("lots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id),
  lotNumber: varchar("lot_number").notNull(),
  expiryDate: timestamp("expiry_date"),
  unitId: varchar("unit_id").notNull().references(() => units.id),
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
  unitId: varchar("unit_id").notNull().references(() => units.id),
  vendorId: varchar("vendor_id").references(() => vendors.id),
  status: varchar("status").notNull().default("draft"), // draft, sent, received
  createdBy: varchar("created_by").notNull().references(() => users.id),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_orders_hospital").on(table.hospitalId),
  index("idx_orders_unit").on(table.unitId),
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
  notes: text("notes"),
  offlineWorked: boolean("offline_worked").default(false),
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
  unitId: varchar("unit_id").references(() => units.id),
  delta: integer("delta"), // quantity change
  movementType: varchar("movement_type", { enum: ["IN", "OUT"] }), // IN = stock increase, OUT = stock decrease
  notes: text("notes"),
  patientId: varchar("patient_id"), // for controlled substances
  patientPhoto: text("patient_photo"), // encrypted photo data (base64)
  attachmentPhoto: text("attachment_photo"), // attachment/receipt photo (base64) for adjustments
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
  unitId: varchar("unit_id").notNull().references(() => units.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow(),
  signature: text("signature").notNull(),
  checkItems: jsonb("check_items").notNull(), // array of { itemId, itemName, qtyInApp, qtyActual, match }
  allMatch: boolean("all_match").notNull(),
  notes: text("notes"),
}, (table) => [
  index("idx_controlled_checks_hospital").on(table.hospitalId),
  index("idx_controlled_checks_unit").on(table.unitId),
  index("idx_controlled_checks_timestamp").on(table.timestamp),
]);

// Import Jobs (background bulk import processing)
export const importJobs = pgTable("import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  status: varchar("status").notNull().default("queued"), // queued, processing, completed, failed
  totalImages: integer("total_images").notNull(),
  processedImages: integer("processed_images").default(0),
  currentImage: integer("current_image").default(0), // Current image being processed (for progress tracking)
  progressPercent: integer("progress_percent").default(0), // Percentage of completion (0-100)
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
  unitId: varchar("unit_id").notNull().references(() => units.id),
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
  index("idx_checklist_templates_unit").on(table.unitId),
  index("idx_checklist_templates_active").on(table.active),
]);

// Checklist Completions (record of completed checklists)
export const checklistCompletions = pgTable("checklist_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => checklistTemplates.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  completedBy: varchar("completed_by").notNull().references(() => users.id),
  completedAt: timestamp("completed_at").defaultNow(),
  dueDate: timestamp("due_date").notNull(), // which recurrency period this completion covers
  comment: text("comment"),
  signature: text("signature").notNull(),
  templateSnapshot: jsonb("template_snapshot").notNull(), // snapshot of template at time of completion
}, (table) => [
  index("idx_checklist_completions_template").on(table.templateId),
  index("idx_checklist_completions_hospital").on(table.hospitalId),
  index("idx_checklist_completions_unit").on(table.unitId),
  index("idx_checklist_completions_completed_at").on(table.completedAt),
  index("idx_checklist_completions_due_date").on(table.dueDate),
]);

// Medication Configurations (anesthesia-specific medication data)
export const medicationConfigs = pgTable("medication_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }).unique(), // One-to-one with items
  
  // Classification
  medicationGroup: varchar("medication_group"), // "Hypnotika", "Opioide", "Muskelrelaxantien", etc.
  administrationGroup: varchar("administration_group"), // "Bolus", "KI", "Infusionen", "Perfusoren", etc. - for chart organization
  
  // Ampule/Bag Content (total amount per unit: "50 mg", "1000 ml", "0.1 mg")
  ampuleTotalContent: varchar("ampule_total_content"), // "50 mg", "1000 ml", "0.1 mg"
  
  // Dosing Information
  defaultDose: varchar("default_dose"), // "12" or "25-35-50" for ranges
  
  // Administration
  administrationRoute: varchar("administration_route"), // "i.v.", "s.c.", "p.o.", "spinal", etc.
  administrationUnit: varchar("administration_unit"), // "μg", "mg", "g", "ml"
  
  // Rate control (determines visualization and behavior)
  // null = bolus, "free" = free-running infusion (dashed line), actual unit = rate-controlled pump (solid line)
  rateUnit: varchar("rate_unit"), // null, "free", "ml/h", "μg/kg/min", "mg/kg/h"
  
  // Sort order within administration group (for custom ordering in anesthesia record)
  sortOrder: integer("sort_order").default(0),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_medication_configs_item").on(table.itemId),
  index("idx_medication_configs_group").on(table.medicationGroup),
  index("idx_medication_configs_admin_group").on(table.administrationGroup),
]);

// ==================== ANESTHESIA MODULE TABLES ====================

// Hospital Anesthesia Settings (customizable illness lists and checklist items)
export const hospitalAnesthesiaSettings = pgTable("hospital_anesthesia_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id).unique(),
  
  // Customizable allergy list (each item has stable ID and translatable label)
  allergyList: jsonb("allergy_list").$type<Array<{ id: string; label: string }>>(),
  
  // Customizable medication lists (JSONB for flexibility)
  // Each item has a stable ID and translatable label
  medicationLists: jsonb("medication_lists").$type<{
    anticoagulation?: Array<{ id: string; label: string }>;
    general?: Array<{ id: string; label: string }>;
  }>(),
  
  // Customizable illness lists per medical system (JSONB for flexibility)
  illnessLists: jsonb("illness_lists").$type<{
    cardiovascular?: Array<{ id: string; label: string }>;
    pulmonary?: Array<{ id: string; label: string }>;
    gastrointestinal?: Array<{ id: string; label: string }>;
    kidney?: Array<{ id: string; label: string }>;
    metabolic?: Array<{ id: string; label: string }>;
    neurological?: Array<{ id: string; label: string }>;
    psychiatric?: Array<{ id: string; label: string }>;
    skeletal?: Array<{ id: string; label: string }>;
    coagulation?: Array<{ id: string; label: string }>;
    infectious?: Array<{ id: string; label: string }>;
    woman?: Array<{ id: string; label: string }>;
    noxen?: Array<{ id: string; label: string }>;
    children?: Array<{ id: string; label: string }>;
  }>(),
  
  // Customizable WHO checklist items (JSONB for flexibility)
  // Each item has a stable ID and translatable label
  checklistItems: jsonb("checklist_items").$type<{
    signIn?: Array<{ id: string; label: string }>;
    timeOut?: Array<{ id: string; label: string }>;
    signOut?: Array<{ id: string; label: string }>;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_hospital_anesthesia_settings_hospital").on(table.hospitalId),
]);

// Patients - Patient demographics and core information
export const patients = pgTable("patients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  
  // Demographics
  patientNumber: varchar("patient_number").notNull(), // Hospital-specific patient ID (e.g., "P-2024-001")
  surname: varchar("surname").notNull(),
  firstName: varchar("first_name").notNull(),
  birthday: varchar("birthday").notNull(), // YYYY-MM-DD format
  sex: varchar("sex", { enum: ["M", "F", "O"] }).notNull(),
  
  // Contact Information
  email: varchar("email"),
  phone: varchar("phone"),
  address: text("address"),
  emergencyContact: text("emergency_contact"),
  
  // Insurance & Administrative
  insuranceProvider: varchar("insurance_provider"),
  insuranceNumber: varchar("insurance_number"),
  
  // Medical Information
  allergies: text("allergies").array(),
  otherAllergies: text("other_allergies"),
  internalNotes: text("internal_notes"),
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
}, (table) => [
  index("idx_patients_hospital").on(table.hospitalId),
  index("idx_patients_surname").on(table.surname),
  index("idx_patients_number").on(table.hospitalId, table.patientNumber),
]);

// Cases (Episode of Care) - Container for patient hospital stay
export const cases = pgTable("cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  patientId: varchar("patient_id").notNull(), // External reference (may integrate with patient management later)
  admissionDate: timestamp("admission_date").notNull(),
  dischargeDate: timestamp("discharge_date"),
  status: varchar("status", { enum: ["planned", "active", "finished", "cancelled"] }).notNull().default("active"),
  type: varchar("type", { enum: ["inpatient", "outpatient", "emergency"] }).notNull().default("inpatient"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_cases_hospital").on(table.hospitalId),
  index("idx_cases_patient").on(table.patientId),
  index("idx_cases_status").on(table.status),
]);

// Surgeries (Encounters) - Individual surgical procedures
export const surgeries = pgTable("surgeries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").references(() => cases.id), // Optional: links to case if using episode of care
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  patientId: varchar("patient_id").notNull(), // External reference
  surgeryRoomId: varchar("surgery_room_id").references(() => surgeryRooms.id),
  
  // Planning
  plannedDate: timestamp("planned_date").notNull(),
  plannedSurgery: varchar("planned_surgery").notNull(),
  surgeon: varchar("surgeon"), // Display name / fallback for unmatched surgeons
  surgeonId: varchar("surgeon_id").references(() => users.id), // Foreign key to users table for proper linking
  notes: text("notes"),
  
  // Actual execution
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  status: varchar("status", { enum: ["planned", "in-progress", "completed", "cancelled"] }).notNull().default("planned"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgeries_case").on(table.caseId),
  index("idx_surgeries_hospital").on(table.hospitalId),
  index("idx_surgeries_patient").on(table.patientId),
  index("idx_surgeries_room").on(table.surgeryRoomId),
  index("idx_surgeries_surgeon").on(table.surgeonId),
  index("idx_surgeries_status").on(table.status),
  index("idx_surgeries_planned_date").on(table.plannedDate),
]);

// Anesthesia Records - Main perioperative anesthesia data
export const anesthesiaRecords = pgTable("anesthesia_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id).unique(), // One-to-one with surgery
  
  // Financial/Billing critical fields
  anesthesiaStartTime: timestamp("anesthesia_start_time"), // When prep begins in OR
  anesthesiaEndTime: timestamp("anesthesia_end_time"), // When patient transferred to PACU
  providerId: varchar("provider_id").references(() => users.id), // Anesthesiologist/CRNA
  physicalStatus: varchar("physical_status", { enum: ["P1", "P2", "P3", "P4", "P5", "P6"] }), // ASA status
  emergencyCase: boolean("emergency_case").default(false), // Affects billing
  procedureCode: varchar("procedure_code"), // CPT code
  diagnosisCodes: text("diagnosis_codes").array(), // ICD-10 codes
  
  // Anesthesia details
  anesthesiaType: varchar("anesthesia_type", { 
    enum: ["general", "spinal", "epidural", "regional", "sedation", "combined"] 
  }),
  
  // Case status
  caseStatus: varchar("case_status", { enum: ["open", "closed", "amended"] }).notNull().default("open"),
  closedAt: timestamp("closed_at"),
  closedBy: varchar("closed_by").references(() => users.id),
  
  // Record locking - prevents edits after PACU End until explicitly unlocked
  isLocked: boolean("is_locked").default(false).notNull(),
  lockedAt: timestamp("locked_at"),
  lockedBy: varchar("locked_by").references(() => users.id),
  unlockedAt: timestamp("unlocked_at"),
  unlockedBy: varchar("unlocked_by").references(() => users.id),
  unlockReason: text("unlock_reason"),
  
  // WHO Checklists (stored as JSONB for flexibility)
  signInData: jsonb("sign_in_data").$type<{
    checklist?: Record<string, boolean>;
    notes?: string;
    signature?: string;
    completedAt?: number; // timestamp in milliseconds
    completedBy?: string; // userId
  }>(),
  timeOutData: jsonb("time_out_data").$type<{
    checklist?: Record<string, boolean>;
    notes?: string;
    signature?: string;
    completedAt?: number;
    completedBy?: string;
  }>(),
  signOutData: jsonb("sign_out_data").$type<{
    checklist?: Record<string, boolean>;
    notes?: string;
    signature?: string;
    completedAt?: number;
    completedBy?: string;
  }>(),
  
  // Post-Operative Information
  postOpData: jsonb("post_op_data").$type<{
    postOpDestination?: string; // PACU, ICU, Ward, Home
    postOpNotes?: string;
    complications?: string;
    paracetamolTime?: "Immediately" | "Contraindicated" | string; // HH:MM format for time value
    nsarTime?: "Immediately" | "Contraindicated" | string;
    novalginTime?: "Immediately" | "Contraindicated" | string;
  }>(),
  
  // Time markers (A1, E, X1, I, L, B1, O1, O2, B2, X2, X, A2, P)
  timeMarkers: jsonb("time_markers").$type<Array<{
    id: string;
    code: string;
    label: string;
    time: number | null; // timestamp in milliseconds, null if not set
  }>>(),
  
  // Anesthesia Overview - Track which sections are active
  anesthesiaOverview: jsonb("anesthesia_overview").$type<{
    general?: boolean;
    sedation?: boolean;
    regionalSpinal?: boolean;
    regionalEpidural?: boolean;
    regionalPeripheral?: boolean;
  }>(),
  
  // Surgery Staff - OR team documentation
  surgeryStaff: jsonb("surgery_staff").$type<{
    instrumentNurse?: string;      // Instrumentierende (scrub nurse)
    circulatingNurse?: string;     // Zudienung (circulating nurse)
    surgeon?: string;              // Operateur
    surgicalAssistant?: string;    // Assistenz
    anesthesiologist?: string;     // Anästhesie
    anesthesiaNurse?: string;      // Anä-Pflege
  }>(),
  
  // Surgery Intraoperative Documentation
  intraOpData: jsonb("intra_op_data").$type<{
    positioning?: {
      RL?: boolean;   // Rückenlage (Supine)
      SL?: boolean;   // Seitenlage (Lateral)
      BL?: boolean;   // Bauchlage (Prone)
      SSL?: boolean;  // Steinschnittlage (Lithotomy)
      EXT?: boolean;  // Extension
    };
    disinfection?: {
      kodanColored?: boolean;
      kodanColorless?: boolean;
      octanisept?: boolean;       // New: Octanisept option
      performedBy?: string;
    };
    equipment?: {
      monopolar?: boolean;
      bipolar?: boolean;
      neutralElectrodeLocation?: string; // shoulder, abdomen, thigh, back
      pathology?: {
        histology?: boolean;
        microbiology?: boolean;
      };
      devices?: string;           // New: Free text for Geräte (devices)
      notes?: string;
    };
    // Enhanced: Spülung (Irrigation) section with checkboxes
    irrigation?: {
      nacl?: boolean;
      betadine?: boolean;
      hydrogenPeroxide?: boolean; // Wasserstoffperoxid
      other?: string;             // Free text for custom entries
    };
    // Enhanced: Infiltration section with checkboxes
    infiltration?: {
      tumorSolution?: boolean;    // Tumoressenzlösung
      other?: string;             // Free text for custom entries
    };
    // Enhanced: Medications section with checkboxes
    medications?: {
      ropivacain?: boolean;
      bupivacain?: boolean;
      contrast?: boolean;         // Kontrastmittel
      ointments?: boolean;        // Salben
      other?: string;             // Free text for custom entries
    };
    // Enhanced: Verband (Dressing) section with checkboxes
    dressing?: {
      elasticBandage?: boolean;   // el.Binden
      abdominalBelt?: boolean;    // Bauchgurt
      bra?: boolean;              // BH
      faceLiftMask?: boolean;     // Face-Lift-Maske
      steristrips?: boolean;
      comfeel?: boolean;
      opsite?: boolean;
      compresses?: boolean;       // Kompressen
      mefix?: boolean;
      other?: string;             // Free text for custom entries
    };
    // Enhanced: Drainagen (Drainage) section with checkboxes
    drainage?: {
      redonCH?: string;           // Redon CH size
      redonCount?: number;        // Anzahl (count)
      other?: string;             // Free text for custom entries
    };
    // Legacy fields for backwards compatibility
    irrigationMeds?: {
      irrigation?: string;
      infiltration?: string;
      tumorSolution?: string;
      medications?: string;
      contrast?: string;
      ointments?: string;
    };
    signatures?: {
      circulatingNurse?: string;  // base64 signature
      instrumentNurse?: string;   // base64 signature
    };
  }>(),
  
  // Surgery Counts & Sterile Goods Documentation
  countsSterileData: jsonb("counts_sterile_data").$type<{
    surgicalCounts?: Array<{
      id: string;
      name: string;
      count1?: number | null;
      count2?: number | null;
      countFinal?: number | null;
    }>;
    sterileItems?: Array<{
      id: string;
      name: string;
      lotNumber?: string;
      quantity: number;
    }>;
    sutures?: Record<string, string>; // e.g., { vicryl: "2-0", prolene: "3-0" }
    stickerDocs?: Array<{
      id: string;
      type: 'photo' | 'pdf';
      data: string;  // base64
      filename?: string;
      mimeType?: string;
      createdAt?: number;
      createdBy?: string;
    }>;
    signatures?: {
      instrumenteur?: string;   // base64 signature
      circulating?: string;     // base64 signature
    };
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_records_surgery").on(table.surgeryId),
  index("idx_anesthesia_records_provider").on(table.providerId),
  index("idx_anesthesia_records_status").on(table.caseStatus),
]);

// Anesthesia Installations - Track peripheral/arterial/central line placements
export const anesthesiaInstallations = pgTable("anesthesia_installations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  // Type of installation
  category: varchar("category", { enum: ["peripheral", "arterial", "central", "bladder"] }).notNull(),
  
  // Common fields
  location: varchar("location"), // e.g., "right-hand", "radial-left", "right-ijv"
  attempts: integer("attempts"),
  notes: text("notes"),
  isPreExisting: boolean("is_pre_existing").default(false), // Track pre-existing installations
  
  // Category-specific data stored as JSONB for flexibility
  metadata: jsonb("metadata").$type<{
    // Peripheral venous
    gauge?: string; // "18G", "20G", etc.
    
    // Arterial line
    technique?: string; // "direct", "transfixion", "ultrasound"
    
    // Central venous catheter
    lumens?: number; // 1, 2, 3, 4
    depth?: number; // cm
    cvcTechnique?: string; // "landmark", "ultrasound"
    ekgProof?: boolean;
    rxControl?: boolean;
    
    // Bladder catheter
    bladderType?: string; // "foley", "suprapubic", "three-way"
    bladderSize?: string; // "12", "14", "16", "18", "20", "22"
  }>(),
  
  placementTime: timestamp("placement_time"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_installations_record").on(table.anesthesiaRecordId),
  index("idx_installations_category").on(table.category),
]);

// Anesthesia Technique Details - Store technique-specific documentation
export const anesthesiaTechniqueDetails = pgTable("anesthesia_technique_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  // Which technique section this belongs to
  technique: varchar("technique", { 
    enum: ["general", "sedation", "regional_spinal", "regional_epidural", "regional_peripheral"] 
  }).notNull(),
  
  // Technique-specific data stored as JSONB
  details: jsonb("details").$type<{
    // General Anesthesia
    approach?: "tiva" | "balanced";
    airwayDevice?: string; // "ett", "lma", "facemask", "tracheostomy"
    airwaySize?: string;
    airwayDepth?: number;
    airwayCuffPressure?: number;
    airwayNotes?: string;
    specialEquipment?: {
      doppellumen?: boolean;
      cMac?: boolean;
      bronchoskop?: boolean;
      lmAuragain?: boolean;
    };
    difficultAirway?: {
      encountered?: boolean;
      grade?: string;
      notes?: string;
    };
    
    // Sedation
    sedationLevel?: string;
    sedationMedications?: string;
    sedationMonitoring?: string;
    
    // Regional Spinal
    spinalLocation?: string;
    spinalNiveau?: string;
    spinalNeedle?: string;
    gerinnungskontrolle?: boolean;
    gerinnungsmedikament?: string;
    
    // Regional Epidural
    epiduralLocation?: string;
    lossOfResistance?: string;
    catheterDepth?: number;
    epiduralNeedle?: string;
    
    // Regional Peripheral
    blockTechnique?: string;
    blockSide?: "left" | "right" | "bilateral";
    withCatheter?: boolean;
    ultrasoundUsed?: boolean;
    peripheralNeedle?: string;
  }>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_technique_details_record").on(table.anesthesiaRecordId),
  index("idx_technique_details_technique").on(table.technique),
]);

// Anesthesia Airway Management - Dedicated table for airway device details
export const anesthesiaAirwayManagement = pgTable("anesthesia_airway_management", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().unique().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  airwayDevice: varchar("airway_device"), // "ett", "spiral-tube", "rae-tube", "dlt-left", "dlt-right", "lma", etc.
  size: varchar("size"), // e.g., "7.5"
  depth: integer("depth"), // cm at teeth
  cuffPressure: integer("cuff_pressure"), // cmH2O
  intubationPreExisting: boolean("intubation_pre_existing").default(false),
  notes: text("notes"),
  
  // Laryngoscopy details (for intubated patients)
  laryngoscopeType: varchar("laryngoscope_type"), // "macintosh", "miller", "mccoy", "video", "glidescope", "airtraq", etc.
  laryngoscopeBlade: varchar("laryngoscope_blade"), // "1", "2", "3", "4", "5"
  intubationAttempts: integer("intubation_attempts"), // Number of attempts
  difficultAirway: boolean("difficult_airway").default(false), // Flag for difficult airway
  cormackLehane: varchar("cormack_lehane"), // "I", "IIa", "IIb", "III", "IV" - view during laryngoscopy
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_airway_management_record").on(table.anesthesiaRecordId),
]);

// Difficult Airway Reports - DAS-compliant documentation for difficult airway encounters
export const difficultAirwayReports = pgTable("difficult_airway_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  airwayManagementId: varchar("airway_management_id").notNull().unique().references(() => anesthesiaAirwayManagement.id, { onDelete: "cascade" }),
  
  // DAS Documentation Fields
  description: text("description").notNull(), // What made the airway difficult
  techniquesAttempted: jsonb("techniques_attempted").$type<Array<{
    technique: string;
    outcome: "success" | "failure" | "partial";
    notes?: string;
  }>>().notNull(), // Structured list of attempts
  finalTechnique: text("final_technique").notNull(), // What ultimately worked
  equipmentUsed: text("equipment_used"), // List of equipment
  complications: text("complications"), // Any complications observed
  recommendations: text("recommendations"), // Advice for future anesthetics
  
  // Patient communication tracking
  patientInformed: boolean("patient_informed").default(false),
  patientInformedAt: timestamp("patient_informed_at"),
  patientInformedBy: varchar("patient_informed_by"),
  letterSentToPatient: boolean("letter_sent_to_patient").default(false),
  letterSentAt: timestamp("letter_sent_at"),
  patientEmail: varchar("patient_email"),
  gpNotified: boolean("gp_notified").default(false),
  gpNotifiedAt: timestamp("gp_notified_at"),
  gpEmail: varchar("gp_email"),
  
  // Metadata
  createdBy: varchar("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_difficult_airway_reports_airway").on(table.airwayManagementId),
  index("idx_difficult_airway_reports_created_by").on(table.createdBy),
]);

// Anesthesia General Technique - Dedicated table for general anesthesia approach
export const anesthesiaGeneralTechnique = pgTable("anesthesia_general_technique", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().unique().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  approach: varchar("approach", { enum: ["tiva", "tci", "balanced-gas", "sedation"] }),
  rsi: boolean("rsi").default(false), // Rapid Sequence Intubation
  sedationLevel: varchar("sedation_level"), // "minimal", "moderate", "deep"
  airwaySupport: varchar("airway_support"), // "none", "nasal-cannula", "face-mask", etc.
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_general_technique_record").on(table.anesthesiaRecordId),
]);

// Anesthesia Neuraxial Blocks - Spinal, Epidural, CSE, Caudal
export const anesthesiaNeuraxialBlocks = pgTable("anesthesia_neuraxial_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  blockType: varchar("block_type", { enum: ["spinal", "epidural", "cse", "caudal"] }).notNull(),
  level: varchar("level"), // e.g., "L3-L4", "T10-T11"
  approach: varchar("approach"), // "midline", "paramedian", "needle-through-needle"
  needleGauge: varchar("needle_gauge"), // "22G", "25G Pencil Point", etc.
  testDose: varchar("test_dose"), // e.g., "Lidocaine 3ml"
  attempts: integer("attempts"),
  sensoryLevel: varchar("sensory_level"), // e.g., "T4", "T8"
  catheterPresent: boolean("catheter_present").default(false),
  catheterDepth: varchar("catheter_depth"), // e.g., "10cm at skin"
  guidanceTechnique: varchar("guidance_technique"), // "landmark", "ultrasound"
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_neuraxial_blocks_record").on(table.anesthesiaRecordId),
  index("idx_neuraxial_blocks_type").on(table.blockType),
]);

// Anesthesia Peripheral Blocks - Regional nerve blocks
export const anesthesiaPeripheralBlocks = pgTable("anesthesia_peripheral_blocks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: "cascade" }),
  
  blockType: varchar("block_type").notNull(), // "interscalene", "supraclavicular", "axillary", "femoral", "sciatic", etc.
  laterality: varchar("laterality", { enum: ["left", "right", "bilateral"] }),
  guidanceTechnique: varchar("guidance_technique"), // "ultrasound", "nerve-stimulator", "landmark"
  needleType: varchar("needle_type"), // "50mm stimuplex", "80mm echogenic"
  catheterPlaced: boolean("catheter_placed").default(false),
  attempts: integer("attempts"),
  sensoryAssessment: text("sensory_assessment"), // Free text description
  motorAssessment: text("motor_assessment"), // Free text description
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_peripheral_blocks_record").on(table.anesthesiaRecordId),
]);

// Pre-Op Assessments
export const preOpAssessments = pgTable("preop_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id).unique(), // One-to-one with surgery
  
  // Basic vitals (height/weight now in header, but can store here for history)
  height: varchar("height"),
  weight: varchar("weight"),
  
  // CAVE notes (allergies now managed exclusively in patients table)
  cave: text("cave"),
  
  // Classification
  asa: varchar("asa"),
  specialNotes: text("special_notes"),
  
  // Medications (JSONB arrays for flexibility)
  anticoagulationMeds: text("anticoagulation_meds").array(),
  anticoagulationMedsOther: text("anticoagulation_meds_other"),
  generalMeds: text("general_meds").array(),
  generalMedsOther: text("general_meds_other"),
  medicationsNotes: text("medications_notes"),
  
  // Medical History (JSONB - references hospital's custom illness lists)
  heartIllnesses: jsonb("heart_illnesses").$type<Record<string, boolean>>(),
  heartNotes: text("heart_notes"),
  lungIllnesses: jsonb("lung_illnesses").$type<Record<string, boolean>>(),
  lungNotes: text("lung_notes"),
  giIllnesses: jsonb("gi_illnesses").$type<Record<string, boolean>>(),
  kidneyIllnesses: jsonb("kidney_illnesses").$type<Record<string, boolean>>(),
  metabolicIllnesses: jsonb("metabolic_illnesses").$type<Record<string, boolean>>(),
  giKidneyMetabolicNotes: text("gi_kidney_metabolic_notes"),
  neuroIllnesses: jsonb("neuro_illnesses").$type<Record<string, boolean>>(),
  psychIllnesses: jsonb("psych_illnesses").$type<Record<string, boolean>>(),
  skeletalIllnesses: jsonb("skeletal_illnesses").$type<Record<string, boolean>>(),
  neuroPsychSkeletalNotes: text("neuro_psych_skeletal_notes"),
  womanIssues: jsonb("woman_issues").$type<Record<string, boolean>>(),
  womanNotes: text("woman_notes"),
  noxen: jsonb("noxen").$type<Record<string, boolean>>(),
  noxenNotes: text("noxen_notes"),
  childrenIssues: jsonb("children_issues").$type<Record<string, boolean>>(),
  childrenNotes: text("children_notes"),
  
  // Airway Assessment
  mallampati: varchar("mallampati"),
  mouthOpening: varchar("mouth_opening"),
  dentition: varchar("dentition"),
  airwayDifficult: varchar("airway_difficult"),
  airwayNotes: text("airway_notes"),
  
  // Fasting
  lastSolids: varchar("last_solids"),
  lastClear: varchar("last_clear"),
  
  // Planned Anesthesia
  anesthesiaTechniques: jsonb("anesthesia_techniques").$type<{
    general?: boolean;
    generalOptions?: Record<string, boolean>;
    spinal?: boolean;
    epidural?: boolean;
    epiduralOptions?: Record<string, boolean>;
    regional?: boolean;
    regionalOptions?: Record<string, boolean>;
    sedation?: boolean;
    combined?: boolean;
  }>(),
  postOpICU: boolean("post_op_icu").default(false),
  anesthesiaOther: text("anesthesia_other"),
  
  // Installations
  installations: jsonb("installations").$type<Record<string, boolean>>(),
  installationsOther: text("installations_other"),
  
  // Surgical Approval Status
  surgicalApproval: varchar("surgical_approval"), // 'approved' | 'not-approved' | ''
  
  // Stand-By Status
  standBy: boolean("stand_by").default(false),
  standByReason: varchar("stand_by_reason"), // 'signature_missing' | 'consent_required' | 'waiting_exams' | 'other'
  standByReasonNote: text("stand_by_reason_note"), // Free text when reason is 'other'
  
  // Assessment metadata
  assessmentDate: varchar("assessment_date"),
  doctorName: varchar("doctor_name"),
  doctorSignature: text("doctor_signature"),
  
  // Status tracking: 'draft' (partially filled), 'completed' (signed and finalized)
  status: varchar("status").default("draft"), // draft | completed
  
  // Informed Consent
  consentGiven: boolean("consent_given").default(false),
  consentRegional: boolean("consent_regional").default(false),
  consentInstallations: boolean("consent_installations").default(false),
  consentICU: boolean("consent_icu").default(false),
  consentText: text("consent_text"),
  consentDoctorSignature: text("consent_doctor_signature"),
  patientSignature: text("patient_signature"),
  consentDate: varchar("consent_date"),
  emergencyNoSignature: boolean("emergency_no_signature").default(false),
  sendEmailCopy: boolean("send_email_copy").default(false),
  emailForCopy: varchar("email_for_copy"),
  consentNotes: text("consent_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_preop_assessments_surgery").on(table.surgeryId),
]);

// Types for clinical data points with IDs
export type VitalPointWithId = {
  id: string;
  timestamp: string; // ISO timestamp
  value: number;
};

export type BPPointWithId = {
  id: string;
  timestamp: string;
  sys: number;
  dia: number;
  mean?: number;
};

export type RhythmPointWithId = {
  id: string;
  timestamp: string;
  value: string; // String value (e.g., "Sinus", "Atrial Fib")
};

export type TOFPointWithId = {
  id: string;
  timestamp: string;
  value: string; // Fraction value (e.g., "0/4", "1/4", "2/4", "3/4", "4/4")
  percentage?: number; // Optional T4/T1 ratio percentage
};

// Clinical Snapshots (Vitals, Ventilation, and Output parameters stored as JSONB for efficiency)
// NEW: Each anesthesia record has ONE snapshot row containing all points as arrays
export const clinicalSnapshots = pgTable("clinical_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().unique().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  // All clinical data stored as arrays of points with IDs
  data: jsonb("data").$type<{
    // Vitals (arrays of points)
    hr?: VitalPointWithId[];
    bp?: BPPointWithId[];
    spo2?: VitalPointWithId[];
    temp?: VitalPointWithId[];
    // Heart Rhythm
    heartRhythm?: RhythmPointWithId[];
    // Ventilation
    ventilationModes?: RhythmPointWithId[]; // Ventilation modes (string values like "PCV", "VCV")
    etco2?: VitalPointWithId[];
    pip?: VitalPointWithId[];
    peep?: VitalPointWithId[];
    tidalVolume?: VitalPointWithId[];
    respiratoryRate?: VitalPointWithId[];
    minuteVolume?: VitalPointWithId[];
    fio2?: VitalPointWithId[];
    // Output parameters (fluid balance)
    gastricTube?: VitalPointWithId[];
    drainage?: VitalPointWithId[];
    vomit?: VitalPointWithId[];
    urine?: VitalPointWithId[];
    urine677?: VitalPointWithId[];
    blood?: VitalPointWithId[];
    bloodIrrigation?: VitalPointWithId[];
    // Others (BIS, TOF)
    bis?: VitalPointWithId[];
    tof?: TOFPointWithId[];
  }>().default(sql`'{}'::jsonb`).notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_clinical_snapshots_record").on(table.anesthesiaRecordId),
]);

// Legacy alias for backward compatibility during migration
export const vitalsSnapshots = clinicalSnapshots;

// Anesthesia Medications (Boluses and Infusions) - Links to inventory
export const anesthesiaMedications = pgTable("anesthesia_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id), // Link to inventory
  
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  type: varchar("type", { 
    enum: ["bolus", "infusion_start", "infusion_stop", "rate_change"] 
  }).notNull(),
  
  // Dosing
  dose: varchar("dose"), // For boluses
  unit: varchar("unit"), // mg, ml, μg, etc.
  route: varchar("route"), // i.v., s.c., p.o., spinal
  
  // Rate (for infusions)
  rate: varchar("rate"), // e.g., "5 ml/hr", "0.1 μg/kg/min"
  endTimestamp: timestamp("end_timestamp", { withTimezone: true }), // When infusion stopped
  
  // Session tracking for infusions
  infusionSessionId: varchar("infusion_session_id"), // UUID to group related start/stop/rate_change events
  
  // User tracking
  administeredBy: varchar("administered_by").references(() => users.id),
  
  // Free-text note (displayed in parentheses after dose)
  note: varchar("note"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => [
  index("idx_anesthesia_medications_record").on(table.anesthesiaRecordId),
  index("idx_anesthesia_medications_item").on(table.itemId),
  index("idx_anesthesia_medications_timestamp").on(table.timestamp),
  index("idx_anesthesia_medications_type").on(table.type),
  index("idx_anesthesia_medications_session").on(table.infusionSessionId),
]);

// Anesthesia Events (Timeline markers)
export const anesthesiaEvents = pgTable("anesthesia_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  timestamp: timestamp("timestamp").notNull(),
  eventType: varchar("event_type"), // intubation, incision, extubation, complication, etc.
  description: text("description"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_events_record").on(table.anesthesiaRecordId),
  index("idx_anesthesia_events_timestamp").on(table.timestamp),
  index("idx_anesthesia_events_type").on(table.eventType),
]);

// Anesthesia Positions (Patient positioning during surgery)
export const anesthesiaPositions = pgTable("anesthesia_positions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  timestamp: timestamp("timestamp").notNull(),
  position: varchar("position").notNull(), // supine, prone, lateral, lithotomy, etc.
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_positions_record").on(table.anesthesiaRecordId),
  index("idx_anesthesia_positions_timestamp").on(table.timestamp),
]);

// Anesthesia Staff (Staff assignments during surgery)
export const anesthesiaStaff = pgTable("anesthesia_staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  timestamp: timestamp("timestamp").notNull(),
  role: varchar("role", { enum: ["doctor", "nurse", "assistant"] }).notNull(),
  name: varchar("name").notNull(), // Staff member name
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_staff_record").on(table.anesthesiaRecordId),
  index("idx_anesthesia_staff_timestamp").on(table.timestamp),
  index("idx_anesthesia_staff_role").on(table.role),
]);

// Inventory Usage (Auto-computed from medication records)
export const inventoryUsage = pgTable("inventory_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id),
  
  // Auto-calculated quantity based on dose administration
  calculatedQty: decimal("calculated_qty", { precision: 10, scale: 2 }).notNull().default('0'),
  
  // Manual override fields
  overrideQty: decimal("override_qty", { precision: 10, scale: 2 }),
  overrideReason: text("override_reason"),
  overriddenBy: varchar("overridden_by").references(() => users.id),
  overriddenAt: timestamp("overridden_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_inventory_usage_record").on(table.anesthesiaRecordId),
  index("idx_inventory_usage_item").on(table.itemId),
  unique("idx_inventory_usage_unique").on(table.anesthesiaRecordId, table.itemId),
]);

// Inventory Commits (Track committed inventory deductions)
export const inventoryCommits = pgTable("inventory_commits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  // Module/Unit tracking - which unit created this commit
  unitId: varchar("unit_id").references(() => units.id),
  
  // Commit metadata
  committedAt: timestamp("committed_at", { withTimezone: true }).defaultNow().notNull(),
  committedBy: varchar("committed_by").notNull().references(() => users.id),
  signature: text("signature"), // Base64 signature for controlled items
  
  // Patient info (auto-populated from surgery)
  patientName: varchar("patient_name"),
  patientId: varchar("patient_id"),
  
  // Committed items (JSONB array of {itemId, itemName, quantity, isControlled})
  items: jsonb("items").$type<Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    isControlled: boolean;
  }>>().notNull(),
  
  // Rollback tracking
  rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  rolledBackBy: varchar("rolled_back_by").references(() => users.id),
  rollbackReason: text("rollback_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_inventory_commits_record").on(table.anesthesiaRecordId),
  index("idx_inventory_commits_committed_at").on(table.committedAt),
  index("idx_inventory_commits_committed_by").on(table.committedBy),
  index("idx_inventory_commits_unit").on(table.unitId),
]);

// Audit Trail (Immutable log of all changes for compliance)
export const auditTrail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  recordType: varchar("record_type").notNull(), // anesthesia_record, vitals_snapshot, medication, etc.
  recordId: varchar("record_id").notNull(), // ID of the record being changed
  
  action: varchar("action", { enum: ["create", "update", "delete", "amend", "lock", "unlock"] }).notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  
  oldValue: jsonb("old_value"), // Previous state (for updates/deletes)
  newValue: jsonb("new_value"), // New state (for creates/updates)
  reason: text("reason"), // Required for amendments to closed cases
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_audit_trail_record").on(table.recordType, table.recordId),
  index("idx_audit_trail_user").on(table.userId),
  index("idx_audit_trail_timestamp").on(table.timestamp),
  index("idx_audit_trail_action").on(table.action),
]);

// Notes (Quick notes for users - personal, unit-wide, or hospital-wide)
export const notes = pgTable("notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  content: text("content").notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  isShared: boolean("is_shared").default(false).notNull(), // Deprecated: Use scope instead
  scope: varchar("scope", { length: 20 }).default("personal").notNull(), // 'personal', 'unit', 'hospital'
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_notes_user").on(table.userId),
  index("idx_notes_unit").on(table.unitId),
  index("idx_notes_hospital").on(table.hospitalId),
  index("idx_notes_shared").on(table.isShared),
  index("idx_notes_scope").on(table.scope),
]);

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  userHospitalRoles: many(userHospitalRoles),
  activities: many(activities),
}));

export const hospitalsRelations = relations(hospitals, ({ many }) => ({
  userHospitalRoles: many(userHospitalRoles),
  vendors: many(vendors),
  units: many(units),
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

export const unitsRelations = relations(units, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [units.hospitalId], references: [hospitals.id] }),
  parent: one(units, { fields: [units.parentId], references: [units.id] }),
  children: many(units),
  folders: many(folders),
  stockLevels: many(stockLevels),
  lots: many(lots),
}));

export const foldersRelations = relations(folders, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [folders.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [folders.unitId], references: [units.id] }),
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
  unit: one(units, { fields: [stockLevels.unitId], references: [units.id] }),
}));

export const lotsRelations = relations(lots, ({ one, many }) => ({
  item: one(items, { fields: [lots.itemId], references: [items.id] }),
  unit: one(units, { fields: [lots.unitId], references: [units.id] }),
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
  unit: one(units, { fields: [activities.unitId], references: [units.id] }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  hospital: one(hospitals, { fields: [alerts.hospitalId], references: [hospitals.id] }),
  item: one(items, { fields: [alerts.itemId], references: [items.id] }),
  lot: one(lots, { fields: [alerts.lotId], references: [lots.id] }),
  acknowledgedByUser: one(users, { fields: [alerts.acknowledgedBy], references: [users.id] }),
}));

export const controlledChecksRelations = relations(controlledChecks, ({ one }) => ({
  hospital: one(hospitals, { fields: [controlledChecks.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [controlledChecks.unitId], references: [units.id] }),
  user: one(users, { fields: [controlledChecks.userId], references: [users.id] }),
}));

export const importJobsRelations = relations(importJobs, ({ one }) => ({
  hospital: one(hospitals, { fields: [importJobs.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [importJobs.unitId], references: [units.id] }),
  user: one(users, { fields: [importJobs.userId], references: [users.id] }),
}));

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  hospital: one(hospitals, { fields: [checklistTemplates.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [checklistTemplates.unitId], references: [units.id] }),
  createdByUser: one(users, { fields: [checklistTemplates.createdBy], references: [users.id] }),
  completions: many(checklistCompletions),
}));

export const checklistCompletionsRelations = relations(checklistCompletions, ({ one }) => ({
  template: one(checklistTemplates, { fields: [checklistCompletions.templateId], references: [checklistTemplates.id] }),
  hospital: one(hospitals, { fields: [checklistCompletions.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [checklistCompletions.unitId], references: [units.id] }),
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

export const insertItemCodeSchema = createInsertSchema(itemCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupplierCodeSchema = createInsertSchema(supplierCodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSupplierCatalogSchema = createInsertSchema(supplierCatalogs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncAt: true,
  lastSyncStatus: true,
  lastSyncMessage: true,
});

export const insertPriceSyncJobSchema = createInsertSchema(priceSyncJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export const insertLotSchema = createInsertSchema(lots).omit({
  id: true,
  createdAt: true,
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

export const insertMedicationGroupSchema = createInsertSchema(medicationGroups).omit({
  id: true,
  createdAt: true,
});

export const insertAdministrationGroupSchema = createInsertSchema(administrationGroups).omit({
  id: true,
  createdAt: true,
});

export const insertSurgeryRoomSchema = createInsertSchema(surgeryRooms).omit({
  id: true,
  createdAt: true,
});

// Anesthesia Module Insert Schemas
export const insertHospitalAnesthesiaSettingsSchema = createInsertSchema(hospitalAnesthesiaSettings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPatientSchema = createInsertSchema(patients).omit({
  id: true,
  patientNumber: true, // Auto-generated by backend
  createdAt: true,
  updatedAt: true,
});

export const insertCaseSchema = createInsertSchema(cases).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSurgerySchema = createInsertSchema(surgeries, {
  plannedDate: z.coerce.date(), // Coerce string to Date
  actualEndTime: z.coerce.date().optional(), // Coerce string to Date
  actualStartTime: z.coerce.date().optional(), // Coerce string to Date
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaRecordSchema = createInsertSchema(anesthesiaRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Checklist phase data validation schema (client input - no audit fields)
export const checklistPhaseDataSchema = z.object({
  checklist: z.record(z.boolean()).optional(),
  notes: z.string().optional(),
  signature: z.string().optional(),
});

// Update schemas for each checklist phase (used in PATCH endpoints)
// Note: completedAt and completedBy are added server-side only
export const updateSignInDataSchema = checklistPhaseDataSchema;
export const updateTimeOutDataSchema = checklistPhaseDataSchema;
export const updateSignOutDataSchema = checklistPhaseDataSchema;

// Post-Operative Information validation schema (client input)
const medicationTimeSchema = z.union([
  z.literal("Immediately"),
  z.literal("Contraindicated"),
  z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Must be HH:MM format"), // HH:MM time format
  z.literal(""), // Allow empty string for unset custom time
]);

export const updatePostOpDataSchema = z.object({
  postOpDestination: z.string().optional().nullable(),
  postOpNotes: z.string().optional().nullable(),
  complications: z.string().optional().nullable(),
  paracetamolTime: medicationTimeSchema.optional().nullable(),
  nsarTime: medicationTimeSchema.optional().nullable(),
  novalginTime: medicationTimeSchema.optional().nullable(),
});

// Surgery Staff validation schema (OR team documentation)
export const updateSurgeryStaffSchema = z.object({
  instrumentNurse: z.string().optional().nullable(),      // Instrumentierende (scrub nurse)
  circulatingNurse: z.string().optional().nullable(),     // Zudienung (circulating nurse)
  surgeon: z.string().optional().nullable(),              // Operateur
  surgicalAssistant: z.string().optional().nullable(),    // Assistenz
  anesthesiologist: z.string().optional().nullable(),     // Anästhesie
  anesthesiaNurse: z.string().optional().nullable(),      // Anä-Pflege
});

// Intraoperative Data validation schema (Surgery module)
export const updateIntraOpDataSchema = z.object({
  positioning: z.object({
    RL: z.boolean().optional(),
    SL: z.boolean().optional(),
    BL: z.boolean().optional(),
    SSL: z.boolean().optional(),
    EXT: z.boolean().optional(),
  }).optional(),
  disinfection: z.object({
    kodanColored: z.boolean().optional(),
    kodanColorless: z.boolean().optional(),
    octanisept: z.boolean().optional(),
    performedBy: z.string().optional().nullable(),
  }).optional(),
  equipment: z.object({
    monopolar: z.boolean().optional(),
    bipolar: z.boolean().optional(),
    neutralElectrodeLocation: z.string().optional().nullable(),
    pathology: z.object({
      histology: z.boolean().optional(),
      microbiology: z.boolean().optional(),
    }).optional(),
    devices: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
  }).optional(),
  // New: Spülung (Irrigation) section with checkboxes
  irrigation: z.object({
    nacl: z.boolean().optional(),
    betadine: z.boolean().optional(),
    hydrogenPeroxide: z.boolean().optional(),
    other: z.string().optional().nullable(),
  }).optional(),
  // New: Infiltration section with checkboxes
  infiltration: z.object({
    tumorSolution: z.boolean().optional(),
    other: z.string().optional().nullable(),
  }).optional(),
  // New: Medications section with checkboxes
  medications: z.object({
    ropivacain: z.boolean().optional(),
    bupivacain: z.boolean().optional(),
    contrast: z.boolean().optional(),
    ointments: z.boolean().optional(),
    other: z.string().optional().nullable(),
  }).optional(),
  // New: Verband (Dressing) section with checkboxes
  dressing: z.object({
    elasticBandage: z.boolean().optional(),
    abdominalBelt: z.boolean().optional(),
    bra: z.boolean().optional(),
    faceLiftMask: z.boolean().optional(),
    steristrips: z.boolean().optional(),
    comfeel: z.boolean().optional(),
    opsite: z.boolean().optional(),
    compresses: z.boolean().optional(),
    mefix: z.boolean().optional(),
    other: z.string().optional().nullable(),
  }).optional(),
  // New: Drainagen (Drainage) section with checkboxes
  drainage: z.object({
    redonCH: z.string().optional().nullable(),
    redonCount: z.number().int().min(0).optional().nullable(),
    other: z.string().optional().nullable(),
  }).optional(),
  // Legacy fields for backwards compatibility
  irrigationMeds: z.object({
    irrigation: z.string().optional().nullable(),
    infiltration: z.string().optional().nullable(),
    tumorSolution: z.string().optional().nullable(),
    medications: z.string().optional().nullable(),
    contrast: z.string().optional().nullable(),
    ointments: z.string().optional().nullable(),
  }).optional(),
  signatures: z.object({
    circulatingNurse: z.string().optional().nullable(),
    instrumentNurse: z.string().optional().nullable(),
  }).optional(),
});

// Counts & Sterile Goods Data validation schema (Surgery module)
// Max base64 size: ~7MB (5MB file * 1.37 base64 overhead + data URL prefix)
const MAX_BASE64_SIZE = 7 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

export const updateCountsSterileDataSchema = z.object({
  surgicalCounts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    count1: z.number().int().min(0).optional().nullable(),
    count2: z.number().int().min(0).optional().nullable(),
    countFinal: z.number().int().min(0).optional().nullable(),
  })).optional(),
  sterileItems: z.array(z.object({
    id: z.string(),
    name: z.string(),
    lotNumber: z.string().optional().nullable(),
    quantity: z.number().int().min(1),
  })).optional(),
  sutures: z.record(z.string(), z.string()).optional(),
  stickerDocs: z.array(z.object({
    id: z.string(),
    type: z.enum(['photo', 'pdf']),
    data: z.string().max(MAX_BASE64_SIZE, 'File too large (max 5MB)'), // base64 with size limit
    filename: z.string().optional().nullable(),
    mimeType: z.string().refine(
      (val) => !val || ALLOWED_MIME_TYPES.includes(val),
      { message: 'Invalid file type. Allowed: JPEG, PNG, GIF, PDF' }
    ).optional().nullable(),
    createdAt: z.number().optional(),
    createdBy: z.string().optional().nullable(),
  })).optional(),
  signatures: z.object({
    instrumenteur: z.string().optional().nullable(),
    circulating: z.string().optional().nullable(),
  }).optional(),
});

export const insertPreOpAssessmentSchema = createInsertSchema(preOpAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas for point types
export const vitalPointWithIdSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  value: z.number(),
});

export const bpPointWithIdSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  sys: z.number(),
  dia: z.number(),
  mean: z.number().optional(),
});

export const insertClinicalSnapshotSchema = createInsertSchema(clinicalSnapshots, {
  // Data is now arrays of points with IDs
  data: z.object({
    // Vitals
    hr: z.array(vitalPointWithIdSchema).optional(),
    bp: z.array(bpPointWithIdSchema).optional(),
    spo2: z.array(vitalPointWithIdSchema).optional(),
    temp: z.array(vitalPointWithIdSchema).optional(),
    // Ventilation
    etco2: z.array(vitalPointWithIdSchema).optional(),
    pip: z.array(vitalPointWithIdSchema).optional(),
    peep: z.array(vitalPointWithIdSchema).optional(),
    tidalVolume: z.array(vitalPointWithIdSchema).optional(),
    respiratoryRate: z.array(vitalPointWithIdSchema).optional(),
    minuteVolume: z.array(vitalPointWithIdSchema).optional(),
    fio2: z.array(vitalPointWithIdSchema).optional(),
    // Output parameters
    gastricTube: z.array(vitalPointWithIdSchema).optional(),
    drainage: z.array(vitalPointWithIdSchema).optional(),
    vomit: z.array(vitalPointWithIdSchema).optional(),
    urine: z.array(vitalPointWithIdSchema).optional(),
    urine677: z.array(vitalPointWithIdSchema).optional(),
    blood: z.array(vitalPointWithIdSchema).optional(),
    bloodIrrigation: z.array(vitalPointWithIdSchema).optional(),
  }).optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Legacy alias for backward compatibility
export const insertVitalsSnapshotSchema = insertClinicalSnapshotSchema;

// Schemas for individual point operations
export const addVitalPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  vitalType: z.enum(['hr', 'spo2', 'temp', 'etco2', 'pip', 'peep', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'fio2', 'gastricTube', 'drainage', 'vomit', 'urine', 'urine677', 'blood', 'bloodIrrigation', 'bis']),
  timestamp: z.string(),
  value: z.number(),
});

export const addBPPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  sys: z.number(),
  dia: z.number(),
  mean: z.number().optional(),
});

export const updateVitalPointSchema = z.object({
  pointId: z.string(),
  value: z.number().optional(),
  timestamp: z.string().optional(),
});

export const updateBPPointSchema = z.object({
  pointId: z.string(),
  sys: z.number().optional(),
  dia: z.number().optional(),
  mean: z.number().optional(),
  timestamp: z.string().optional(),
});

export const addRhythmPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  value: z.string(), // String value like "Sinus", "Atrial Fib"
});

export const updateRhythmPointSchema = z.object({
  pointId: z.string(),
  value: z.string().optional(),
  timestamp: z.string().optional(),
});

export const addTOFPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  value: z.enum(['0/4', '1/4', '2/4', '3/4', '4/4']),
  percentage: z.number().optional(), // Optional T4/T1 ratio percentage
});

export const updateTOFPointSchema = z.object({
  pointId: z.string(),
  value: z.enum(['0/4', '1/4', '2/4', '3/4', '4/4']).optional(),
  percentage: z.number().optional(),
  timestamp: z.string().optional(),
});

export const deleteTOFPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  pointId: z.string(),
});

export const addBulkVentilationSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  ventilationMode: z.string().nullable().optional(),
  parameters: z.object({
    peep: z.number().optional(),
    fio2: z.number().optional(),
    tidalVolume: z.number().optional(),
    respiratoryRate: z.number().optional(),
    minuteVolume: z.number().optional(),
    etco2: z.number().optional(),
    pip: z.number().optional(),
  }),
});

export const addVentilationModePointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  value: z.string(), // String value like "PCV", "VCV", "SIMV"
});

export const updateVentilationModePointSchema = z.object({
  anesthesiaRecordId: z.string(),
  pointId: z.string(),
  value: z.string().optional(),
  timestamp: z.string().optional(),
});

export const addOutputPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  paramKey: z.enum(['gastricTube', 'drainage', 'vomit', 'urine', 'urine677', 'blood', 'bloodIrrigation']),
  timestamp: z.string(),
  value: z.number(),
});

export const updateOutputPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  paramKey: z.enum(['gastricTube', 'drainage', 'vomit', 'urine', 'urine677', 'blood', 'bloodIrrigation']),
  pointId: z.string(),
  value: z.number().optional(),
  timestamp: z.string().optional(),
});

export const deleteOutputPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  paramKey: z.enum(['gastricTube', 'drainage', 'vomit', 'urine', 'urine677', 'blood', 'bloodIrrigation']),
  pointId: z.string(),
});

export const deleteVitalPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  pointId: z.string(),
});

export const insertAnesthesiaMedicationSchema = createInsertSchema(anesthesiaMedications, {
  // Coerce timestamp to handle both Date objects and ISO strings
  timestamp: z.coerce.date(),
  endTimestamp: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaEventSchema = createInsertSchema(anesthesiaEvents, {
  // Coerce timestamp to handle both Date objects and ISO strings
  timestamp: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaPositionSchema = createInsertSchema(anesthesiaPositions, {
  // Coerce timestamp to handle both Date objects and ISO strings
  timestamp: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaStaffSchema = createInsertSchema(anesthesiaStaff, {
  // Coerce timestamp to handle both Date objects and ISO strings
  timestamp: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaInstallationSchema = createInsertSchema(anesthesiaInstallations, {
  placementTime: z.coerce.date().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaTechniqueDetailSchema = createInsertSchema(anesthesiaTechniqueDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaAirwayManagementSchema = createInsertSchema(anesthesiaAirwayManagement, {
  // All fields are optional except anesthesiaRecordId which comes from URL params
  airwayDevice: z.string().optional().nullable(),
  size: z.string().optional().nullable(),
  depth: z.number().optional().nullable(),
  cuffPressure: z.number().optional().nullable(),
  intubationPreExisting: z.boolean().optional(),
  notes: z.string().optional().nullable(),
  laryngoscopeType: z.string().optional().nullable(),
  laryngoscopeBlade: z.string().optional().nullable(),
  intubationAttempts: z.number().optional().nullable(),
  difficultAirway: z.boolean().optional(),
  cormackLehane: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDifficultAirwayReportSchema = createInsertSchema(difficultAirwayReports, {
  description: z.string().min(1, "Description is required"),
  techniquesAttempted: z.array(z.object({
    technique: z.string(),
    outcome: z.enum(["success", "failure", "partial"]),
    notes: z.string().optional(),
  })).min(1, "At least one technique must be documented"),
  finalTechnique: z.string().min(1, "Final technique is required"),
  equipmentUsed: z.string().optional().nullable(),
  complications: z.string().optional().nullable(),
  recommendations: z.string().optional().nullable(),
  patientInformed: z.boolean().optional(),
  patientInformedAt: z.coerce.date().optional().nullable(),
  patientInformedBy: z.string().optional().nullable(),
  letterSentToPatient: z.boolean().optional(),
  letterSentAt: z.coerce.date().optional().nullable(),
  patientEmail: z.string().email().optional().nullable(),
  gpNotified: z.boolean().optional(),
  gpNotifiedAt: z.coerce.date().optional().nullable(),
  gpEmail: z.string().email().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaGeneralTechniqueSchema = createInsertSchema(anesthesiaGeneralTechnique, {
  // All fields are optional
  approach: z.enum(["tiva", "tci", "balanced-gas", "sedation"]).optional().nullable(),
  rsi: z.boolean().optional(),
  sedationLevel: z.string().optional().nullable(),
  airwaySupport: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaNeuraxialBlockSchema = createInsertSchema(anesthesiaNeuraxialBlocks, {
  // blockType is required, others are optional
  blockType: z.enum(["spinal", "epidural", "cse", "caudal"]),
  level: z.string().optional().nullable(),
  approach: z.string().optional().nullable(),
  needleGauge: z.string().optional().nullable(),
  testDose: z.string().optional().nullable(),
  attempts: z.number().optional().nullable(),
  sensoryLevel: z.string().optional().nullable(),
  catheterPresent: z.boolean().optional(),
  catheterDepth: z.string().optional().nullable(),
  guidanceTechnique: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaPeripheralBlockSchema = createInsertSchema(anesthesiaPeripheralBlocks, {
  // blockType is required, others are optional
  blockType: z.string(),
  laterality: z.enum(["left", "right", "bilateral"]).optional().nullable(),
  guidanceTechnique: z.string().optional().nullable(),
  needleType: z.string().optional().nullable(),
  catheterPlaced: z.boolean().optional(),
  attempts: z.number().optional().nullable(),
  sensoryAssessment: z.string().optional().nullable(),
  motorAssessment: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventoryUsageSchema = createInsertSchema(inventoryUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventoryCommitSchema = createInsertSchema(inventoryCommits).omit({
  id: true,
  createdAt: true,
  committedAt: true,
});

export const insertAuditTrailSchema = createInsertSchema(auditTrail).omit({
  id: true,
  createdAt: true,
  timestamp: true,
});

export const insertNoteSchema = createInsertSchema(notes).omit({
  id: true,
  userId: true,
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
export type ItemCode = typeof itemCodes.$inferSelect;
export type SupplierCode = typeof supplierCodes.$inferSelect;
export type SupplierCatalog = typeof supplierCatalogs.$inferSelect;
export type PriceSyncJob = typeof priceSyncJobs.$inferSelect;
export type StockLevel = typeof stockLevels.$inferSelect;
export type Lot = typeof lots.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderLine = typeof orderLines.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Alert = typeof alerts.$inferSelect;
export type Vendor = typeof vendors.$inferSelect;
export type Unit = typeof units.$inferSelect;

export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type InsertItem = z.infer<typeof insertItemSchema>;
export type InsertItemCode = z.infer<typeof insertItemCodeSchema>;
export type InsertSupplierCode = z.infer<typeof insertSupplierCodeSchema>;
export type InsertLot = z.infer<typeof insertLotSchema>;
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
export type MedicationGroup = typeof medicationGroups.$inferSelect;
export type InsertMedicationGroup = z.infer<typeof insertMedicationGroupSchema>;
export type AdministrationGroup = typeof administrationGroups.$inferSelect;
export type InsertAdministrationGroup = z.infer<typeof insertAdministrationGroupSchema>;
export type SurgeryRoom = typeof surgeryRooms.$inferSelect;
export type InsertSurgeryRoom = z.infer<typeof insertSurgeryRoomSchema>;

// Anesthesia Module Types
export type HospitalAnesthesiaSettings = typeof hospitalAnesthesiaSettings.$inferSelect;
export type InsertHospitalAnesthesiaSettings = z.infer<typeof insertHospitalAnesthesiaSettingsSchema>;
export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Surgery = typeof surgeries.$inferSelect;
export type InsertSurgery = z.infer<typeof insertSurgerySchema>;
export type AnesthesiaRecord = typeof anesthesiaRecords.$inferSelect;
export type InsertAnesthesiaRecord = z.infer<typeof insertAnesthesiaRecordSchema>;
export type PreOpAssessment = typeof preOpAssessments.$inferSelect;
export type InsertPreOpAssessment = z.infer<typeof insertPreOpAssessmentSchema>;
export type ClinicalSnapshot = typeof clinicalSnapshots.$inferSelect;
export type InsertClinicalSnapshot = z.infer<typeof insertClinicalSnapshotSchema>;

// Legacy aliases for backward compatibility
export type VitalsSnapshot = ClinicalSnapshot;
export type InsertVitalsSnapshot = InsertClinicalSnapshot;
export type AnesthesiaMedication = typeof anesthesiaMedications.$inferSelect;
export type InsertAnesthesiaMedication = z.infer<typeof insertAnesthesiaMedicationSchema>;
export type AnesthesiaEvent = typeof anesthesiaEvents.$inferSelect;
export type InsertAnesthesiaEvent = z.infer<typeof insertAnesthesiaEventSchema>;
export type AnesthesiaPosition = typeof anesthesiaPositions.$inferSelect;
export type InsertAnesthesiaPosition = z.infer<typeof insertAnesthesiaPositionSchema>;
export type AnesthesiaStaff = typeof anesthesiaStaff.$inferSelect;
export type InsertAnesthesiaStaff = z.infer<typeof insertAnesthesiaStaffSchema>;
export type AnesthesiaInstallation = typeof anesthesiaInstallations.$inferSelect;
export type InsertAnesthesiaInstallation = z.infer<typeof insertAnesthesiaInstallationSchema>;
export type AnesthesiaTechniqueDetail = typeof anesthesiaTechniqueDetails.$inferSelect;
export type InsertAnesthesiaTechniqueDetail = z.infer<typeof insertAnesthesiaTechniqueDetailSchema>;
export type AnesthesiaAirwayManagement = typeof anesthesiaAirwayManagement.$inferSelect;
export type InsertAnesthesiaAirwayManagement = z.infer<typeof insertAnesthesiaAirwayManagementSchema>;
export type DifficultAirwayReport = typeof difficultAirwayReports.$inferSelect;
export type InsertDifficultAirwayReport = z.infer<typeof insertDifficultAirwayReportSchema>;
export type AnesthesiaGeneralTechnique = typeof anesthesiaGeneralTechnique.$inferSelect;
export type InsertAnesthesiaGeneralTechnique = z.infer<typeof insertAnesthesiaGeneralTechniqueSchema>;
export type AnesthesiaNeuraxialBlock = typeof anesthesiaNeuraxialBlocks.$inferSelect;
export type InsertAnesthesiaNeuraxialBlock = z.infer<typeof insertAnesthesiaNeuraxialBlockSchema>;
export type AnesthesiaPeripheralBlock = typeof anesthesiaPeripheralBlocks.$inferSelect;
export type InsertAnesthesiaPeripheralBlock = z.infer<typeof insertAnesthesiaPeripheralBlockSchema>;
export type InventoryUsage = typeof inventoryUsage.$inferSelect;
export type InsertInventoryUsage = z.infer<typeof insertInventoryUsageSchema>;
export type InventoryCommit = typeof inventoryCommits.$inferSelect;
export type InsertInventoryCommit = z.infer<typeof insertInventoryCommitSchema>;
export type AuditTrail = typeof auditTrail.$inferSelect;
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// Bulk operations schemas
export const bulkImportItemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  unit: z.string().default("Pack"),
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
