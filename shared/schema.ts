import { sql } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgTable,
  pgEnum,
  timestamp,
  varchar,
  text,
  integer,
  decimal,
  boolean,
  primaryKey,
  unique,
  date,
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
  phone: varchar("phone"), // Optional phone number for app users
  profileImageUrl: varchar("profile_image_url"),
  passwordHash: varchar("password_hash"), // For local auth users
  mustChangePassword: boolean("must_change_password").default(false), // Force password change on first login
  resetToken: varchar("reset_token"), // Password reset token
  resetTokenExpiry: timestamp("reset_token_expiry"), // Token expiration time
  canLogin: boolean("can_login").default(true).notNull(), // Whether user can log into the app (false = staff-only member)
  staffType: varchar("staff_type", { enum: ["internal", "external"] }).default("internal").notNull(), // Internal (clinic) or external (rented/temp)
  hourlyRate: decimal("hourly_rate", { precision: 10, scale: 2 }), // Hourly pay rate for cost calculations
  preferences: jsonb("preferences"), // User preferences including clinic provider filter
  timebutlerIcsUrl: varchar("timebutler_ics_url"), // Personal Timebutler iCal export URL for syncing absences
  adminNotes: text("admin_notes"),
  archivedAt: timestamp("archived_at"), // Soft delete - archived users are hidden from lists but preserved for audit
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
  licenseType: varchar("license_type", { enum: ["free", "basic", "test"] }).default("test").notNull(),
  trialStartDate: timestamp("trial_start_date"), // When trial started (for "test" license type)
  // Stripe billing fields
  stripeCustomerId: varchar("stripe_customer_id"),
  stripePaymentMethodId: varchar("stripe_payment_method_id"),
  pricePerRecord: decimal("price_per_record", { precision: 10, scale: 2 }), // Custom price per anesthesia record
  // Invoice company data
  companyName: varchar("company_name"),
  companyStreet: varchar("company_street"),
  companyPostalCode: varchar("company_postal_code"),
  companyCity: varchar("company_city"),
  companyPhone: varchar("company_phone"),
  companyFax: varchar("company_fax"),
  companyEmail: varchar("company_email"),
  companyLogoUrl: varchar("company_logo_url"),
  questionnaireToken: varchar("questionnaire_token").unique(),
  contractToken: varchar("contract_token").unique(), // Token for public contract form links
  externalSurgeryToken: varchar("external_surgery_token").unique(), // Token for external surgery reservation links
  // Stock runway alert configuration
  runwayTargetDays: integer("runway_target_days").default(14), // Target stock runway in days
  runwayWarningDays: integer("runway_warning_days").default(7), // Warning threshold (critical below this)
  runwayLookbackDays: integer("runway_lookback_days").default(30), // Days to look back for usage calculation
  // Billing add-on services - per-record fees
  addonQuestionnaire: boolean("addon_questionnaire").default(true), // Patient questionnaires (+0.5 CHF/record)
  addonDispocura: boolean("addon_dispocura").default(false), // Dispocura integration for cost calculation (+1 CHF/record)
  addonRetell: boolean("addon_retell").default(false), // Retell.ai phone booking system (+1 CHF/record)
  addonMonitor: boolean("addon_monitor").default(false), // Camera monitor connection (+1 CHF/record)
  addonSurgery: boolean("addon_surgery").default(false), // Surgery module (+0.5 CHF/record)
  // Billing add-on services - flat monthly fees
  addonWorktime: boolean("addon_worktime").default(false), // Work time logs (+5 CHF/month)
  addonLogistics: boolean("addon_logistics").default(false), // Centralized order management (+5 CHF/month)
  addonClinic: boolean("addon_clinic").default(false), // Clinic module with invoices & appointments (+10 CHF/month)
  questionnaireDisabled: boolean("questionnaire_disabled").default(false), // Manual override to disable questionnaire functionality
  preSurgeryReminderDisabled: boolean("pre_surgery_reminder_disabled").default(false), // Manual override to disable pre-surgery SMS reminders
  // Vision AI provider selection for image analysis (inventory items, monitor OCR)
  visionAiProvider: varchar("vision_ai_provider", { enum: ["openai", "pixtral"] }).default("openai"),
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
  isClinicModule: boolean("is_clinic_module").default(false),
  isLogisticModule: boolean("is_logistic_module").default(false), // Logistic module: cross-unit inventory & orders view
  showInventory: boolean("show_inventory").default(true), // UI control: show Inventory module for this unit
  showAppointments: boolean("show_appointments").default(true), // UI control: show Appointments tab for this unit
  showControlledMedications: boolean("show_controlled_medications").default(false), // UI control: show Controlled (BTM) tab for this unit
  questionnairePhone: varchar("questionnaire_phone"), // Help line phone for patient questionnaire emails
  infoFlyerUrl: varchar("info_flyer_url"), // URL to unit info flyer PDF
  hasOwnCalendar: boolean("has_own_calendar").default(false), // When false: uses hospital-level shared calendar. When true: has unit-specific providers/availability
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
  isBookable: boolean("is_bookable").default(false), // Whether user can be booked for appointments in this unit
  isDefaultLogin: boolean("is_default_login").default(false), // Default unit/role to load on login
  // Availability Mode (migrated from clinic_providers):
  // - "always_available" (default): Provider is bookable 24/7 except when blocked
  // - "windows_required": Provider is ONLY bookable during defined availability windows
  availabilityMode: varchar("availability_mode", { 
    enum: ["always_available", "windows_required"] 
  }).default("always_available"),
  calcomUserId: integer("calcom_user_id"), // Cal.com user ID for bi-directional sync
  calcomEventTypeId: integer("calcom_event_type_id"), // Cal.com event type ID for creating bookings
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

// Room types: OP = Operating Room (default), PACU = Post-Anesthesia Care Unit
export const roomTypeEnum = pgEnum("room_type", ["OP", "PACU"]);

// Surgery Rooms (for managing operating rooms in anesthesia module)
export const surgeryRooms = pgTable("surgery_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  name: varchar("name").notNull(),
  type: roomTypeEnum("type").default("OP").notNull(), // OP = Operating Room, PACU = Post-Anesthesia Care Unit
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_surgery_rooms_hospital").on(table.hospitalId),
  index("idx_surgery_rooms_type").on(table.type),
]);

// Camera Devices (Raspberry Pi cameras for automated vital signs capture)
export const cameraDevices = pgTable("camera_devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  cameraId: varchar("camera_id").notNull(), // Unique identifier set on the Raspberry Pi (e.g., "cam-or-1")
  name: varchar("name").notNull(), // Display name (e.g., "OR 1 Vitals Camera")
  surgeryRoomId: varchar("surgery_room_id").references(() => surgeryRooms.id), // Optional: link to specific OR
  captureIntervalSeconds: integer("capture_interval_seconds").default(300), // Default 5 minutes
  isActive: boolean("is_active").default(true),
  lastSeenAt: timestamp("last_seen_at"), // Last time an image was uploaded
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_camera_devices_hospital").on(table.hospitalId),
  index("idx_camera_devices_camera_id").on(table.cameraId),
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
  patientPrice: decimal("patient_price", { precision: 10, scale: 2 }), // Final patient dispensing price for ambulatory invoices
  dailyUsageEstimate: decimal("daily_usage_estimate", { precision: 10, scale: 2 }), // Manual fallback for runway calculation when no consumption history
  isInvoiceable: boolean("is_invoiceable").default(false), // Whether item appears in invoice item picker across all units
  isService: boolean("is_service").default(false), // Service items (e.g., sterilization fees) excluded from inventory value calculations
  status: varchar("status").default("active").notNull(), // 'active' | 'archived' - archived items hidden from lists but searchable
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_items_hospital").on(table.hospitalId),
  index("idx_items_unit").on(table.unitId),
  index("idx_items_vendor").on(table.vendorId),
  index("idx_items_folder").on(table.folderId),
  index("idx_items_status").on(table.status),
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
  lastSyncJobId: varchar("last_sync_job_id"), // Reference to the sync job that created/updated this record
  matchReason: text("match_reason"), // Explanation of how the match was made (e.g., "pharmacode match", "fuzzy name match")
  searchedName: text("searched_name"), // The original item name that was searched
  matchedProductName: text("matched_product_name"), // The product name from the supplier catalog that was matched
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_supplier_codes_item").on(table.itemId),
  index("idx_supplier_codes_supplier").on(table.supplierName),
  index("idx_supplier_codes_preferred").on(table.isPreferred),
  index("idx_supplier_codes_sync_job").on(table.lastSyncJobId),
  index("idx_supplier_codes_match_status").on(table.matchStatus),
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
  
  // Browser Configuration (for browser-based suppliers like Polymed)
  browserLoginUrl: varchar("browser_login_url"), // e.g., "https://shop.polymed.ch/de"
  browserUsername: varchar("browser_username"), // Login username/email
  browserSessionEncrypted: text("browser_session_encrypted"), // Encrypted cookie/session data (JSON)
  browserLastLogin: timestamp("browser_last_login"), // When session was last refreshed
  
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
  status: varchar("status").notNull().default("draft"), // draft, ready_to_send, sent, received
  createdBy: varchar("created_by").notNull().references(() => users.id),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }),
  notes: text("notes"),
  highPriority: boolean("high_priority").default(false),
  sentAt: timestamp("sent_at"),
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

// Order Attachments (delivery receipts, Lieferscheine)
export const orderAttachments = pgTable("order_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  filename: varchar("filename").notNull(),
  contentType: varchar("content_type"),
  storageKey: varchar("storage_key").notNull(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_order_attachments_order").on(table.orderId),
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
  unitId: varchar("unit_id").references(() => units.id),
  role: varchar("role"),
  name: varchar("name").notNull(),
  description: text("description"),
  recurrency: varchar("recurrency").notNull(), // daily, weekly, monthly, bimonthly, quarterly, triannual, biannual, yearly
  startDate: timestamp("start_date").notNull(),
  items: jsonb("items").notNull(), // array of { description: string }
  active: boolean("active").default(true),
  roomIds: text("room_ids").array().default([]),
  excludeWeekends: boolean("exclude_weekends").default(false),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_checklist_templates_hospital").on(table.hospitalId),
  index("idx_checklist_templates_unit").on(table.unitId),
  index("idx_checklist_templates_active").on(table.active),
]);

export const checklistTemplateAssignments = pgTable("checklist_template_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => checklistTemplates.id, { onDelete: 'cascade' }),
  unitId: varchar("unit_id").references(() => units.id),
  role: varchar("role"),
}, (table) => [
  index("idx_checklist_template_assignments_template").on(table.templateId),
  index("idx_checklist_template_assignments_unit").on(table.unitId),
]);

// Checklist Completions (record of completed checklists)
export const checklistCompletions = pgTable("checklist_completions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => checklistTemplates.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  roomId: varchar("room_id").references(() => surgeryRooms.id),
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

// Checklist Dismissals (record of skipped/dismissed checklists)
export const checklistDismissals = pgTable("checklist_dismissals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => checklistTemplates.id),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  roomId: varchar("room_id").references(() => surgeryRooms.id),
  dismissedBy: varchar("dismissed_by").notNull().references(() => users.id),
  dismissedAt: timestamp("dismissed_at").defaultNow(),
  dueDate: timestamp("due_date").notNull(), // which recurrency period this dismissal covers
  reason: text("reason"), // optional reason for dismissal (e.g., "Weekend", "Holiday", "Not needed")
}, (table) => [
  index("idx_checklist_dismissals_template").on(table.templateId),
  index("idx_checklist_dismissals_hospital").on(table.hospitalId),
  index("idx_checklist_dismissals_unit").on(table.unitId),
  index("idx_checklist_dismissals_dismissed_at").on(table.dismissedAt),
  index("idx_checklist_dismissals_due_date").on(table.dueDate),
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
  
  // On-demand medications: not shown by default, but can be imported to individual records
  onDemandOnly: boolean("on_demand_only").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_medication_configs_item").on(table.itemId),
  index("idx_medication_configs_group").on(table.medicationGroup),
  index("idx_medication_configs_admin_group").on(table.administrationGroup),
]);

// ==================== ANESTHESIA MODULE TABLES ====================

// Type for illness list items with optional patient-facing metadata
export type IllnessListItem = {
  id: string;
  label: string; // Professional label (shown to doctors)
  patientVisible?: boolean; // Whether to show in patient questionnaire
  patientLabel?: string; // Patient-friendly label for questionnaire
  patientHelpText?: string; // Explanation/tooltip for patients
};

// Hospital Anesthesia Settings (customizable illness lists and checklist items)
export const hospitalAnesthesiaSettings = pgTable("hospital_anesthesia_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id).unique(),
  
  // Customizable allergy list (each item has stable ID and translatable label)
  // Can include patient-facing metadata for questionnaire system
  allergyList: jsonb("allergy_list").$type<Array<IllnessListItem>>(),
  
  // Customizable medication lists (JSONB for flexibility)
  // Each item has a stable ID and translatable label
  medicationLists: jsonb("medication_lists").$type<{
    anticoagulation?: Array<{ id: string; label: string }>;
    general?: Array<{ id: string; label: string }>;
  }>(),
  
  // Customizable illness lists per medical system (JSONB for flexibility)
  // Each item can include patient-facing metadata for questionnaire system
  illnessLists: jsonb("illness_lists").$type<{
    cardiovascular?: Array<IllnessListItem>;
    pulmonary?: Array<IllnessListItem>;
    gastrointestinal?: Array<IllnessListItem>;
    kidney?: Array<IllnessListItem>;
    metabolic?: Array<IllnessListItem>;
    neurological?: Array<IllnessListItem>;
    psychiatric?: Array<IllnessListItem>;
    skeletal?: Array<IllnessListItem>;
    coagulation?: Array<IllnessListItem>;
    infectious?: Array<IllnessListItem>;
    woman?: Array<IllnessListItem>;
    noxen?: Array<IllnessListItem>;
    children?: Array<IllnessListItem>;
    // Anesthesia & Surgical History section
    anesthesiaHistory?: Array<IllnessListItem>;
    dental?: Array<IllnessListItem>;
    ponvTransfusion?: Array<IllnessListItem>;
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
  street: varchar("street"), // Straße, Nr
  postalCode: varchar("postal_code"), // PLZ
  city: varchar("city"), // Ort
  emergencyContact: text("emergency_contact"),
  
  // Insurance & Administrative
  insuranceProvider: varchar("insurance_provider"),
  insuranceNumber: varchar("insurance_number"),
  healthInsuranceNumber: varchar("health_insurance_number"), // Swiss AHV/Versichertennummer
  
  // Identity & Insurance Card Images
  idCardFrontUrl: varchar("id_card_front_url"),
  idCardBackUrl: varchar("id_card_back_url"),
  insuranceCardFrontUrl: varchar("insurance_card_front_url"),
  insuranceCardBackUrl: varchar("insurance_card_back_url"),
  
  // Medical Information
  allergies: text("allergies").array(),
  otherAllergies: text("other_allergies"),
  internalNotes: text("internal_notes"),
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  deletedAt: timestamp("deleted_at"),
  
  // Archive (soft delete - patients should never be fully deleted)
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by").references(() => users.id),
}, (table) => [
  index("idx_patients_hospital").on(table.hospitalId),
  index("idx_patients_surname").on(table.surname),
  index("idx_patients_number").on(table.hospitalId, table.patientNumber),
  index("idx_patients_archived").on(table.isArchived),
]);

// Patient Documents - Staff-uploaded files for patients (separate from questionnaire uploads)
export const patientDocuments = pgTable("patient_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  category: varchar("category", { enum: ["medication_list", "diagnosis", "exam_result", "consent", "lab_result", "imaging", "referral", "other"] }).notNull(),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"),
  description: text("description"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  source: varchar("source", { enum: ["questionnaire", "staff_upload", "import"] }).default("staff_upload"),
  reviewed: boolean("reviewed").default(false),
  questionnaireUploadId: varchar("questionnaire_upload_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_patient_documents_hospital").on(table.hospitalId),
  index("idx_patient_documents_patient").on(table.patientId),
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
  pacuBedId: varchar("pacu_bed_id").references(() => surgeryRooms.id), // PACU bed/room assignment for post-op
  
  // Planning
  plannedDate: timestamp("planned_date").notNull(),
  plannedSurgery: varchar("planned_surgery").notNull(),
  chopCode: varchar("chop_code"), // Optional CHOP procedure code for structured surgery naming
  surgerySide: varchar("surgery_side", { enum: ["left", "right", "both"] }), // Surgery laterality
  antibioseProphylaxe: boolean("antibiose_prophylaxe").default(false), // Antibiotic prophylaxis required
  surgeon: varchar("surgeon"), // Display name / fallback for unmatched surgeons
  surgeonId: varchar("surgeon_id").references(() => users.id), // Foreign key to users table for proper linking
  notes: text("notes"),
  
  // Scheduling
  admissionTime: timestamp("admission_time"), // Patient arrival time (Eintritt)
  
  // Business/Billing
  price: decimal("price", { precision: 10, scale: 2 }), // Surgery price
  quoteSentDate: date("quote_sent_date"), // Offerte verschickt
  invoiceSentDate: date("invoice_sent_date"), // Rechnung verschickt
  paymentStatus: varchar("payment_status", { enum: ["pending", "partial", "paid", "overdue", "cancelled"] }), // Payment state
  paymentDate: date("payment_date"), // Rechnung bezahlt
  paymentMethod: varchar("payment_method"), // MFG / PLIM etc.
  paymentNotes: text("payment_notes"), // Additional payment info
  
  // Contracts/Administrative
  treatmentContractSentDate: date("treatment_contract_sent_date"), // Behandlungsvertrag verschickt
  treatmentContractReceivedDate: date("treatment_contract_received_date"), // Behandlungsvertrag erhalten
  anesthesiaConsentSent: boolean("anesthesia_consent_sent").default(false), // Anästhesie-Aufklärung gesendet
  
  // Implants/Equipment
  implantOrderDate: date("implant_order_date"), // Implantate bestellt
  implantReceivedDate: date("implant_received_date"), // Implantate erhalten
  implantVendor: varchar("implant_vendor"), // Motiva, Albin Group, Polytech, etc.
  implantDetails: text("implant_details"), // Free text for specifics
  
  // Administrative notes (for business tracking - e.g., payment issues, patient contact status)
  administrativeNote: text("administrative_note"),
  
  // Patient positioning
  patientPosition: varchar("patient_position", { enum: [
    "supine", "trendelenburg", "reverse_trendelenburg", "lithotomy",
    "lateral_decubitus", "prone", "jackknife", "sitting", "kidney", "lloyd_davies"
  ] }),
  leftArmPosition: varchar("left_arm_position", { enum: ["ausgelagert", "angelagert"] }),
  rightArmPosition: varchar("right_arm_position", { enum: ["ausgelagert", "angelagert"] }),

  // Actual execution
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  status: varchar("status", { enum: ["planned", "in-progress", "completed", "cancelled"] }).notNull().default("planned"),
  
  // Planning status - used for administrative tracking (vorgemeldet/bestätigt)
  planningStatus: varchar("planning_status", { enum: ["pre-registered", "confirmed"] }).notNull().default("pre-registered"),
  
  // Pre-op assessment flag - surgeries with local anesthesia only (done by surgeon) don't need anesthesia pre-op
  noPreOpRequired: boolean("no_pre_op_required").default(false).notNull(),
  
  // Suspended (soft cancel - surgery stays on plan but marked as "will not take place")
  isSuspended: boolean("is_suspended").default(false).notNull(),
  suspendedReason: text("suspended_reason"),
  suspendedAt: timestamp("suspended_at"),
  suspendedBy: varchar("suspended_by").references(() => users.id),

  // Archive (soft delete - surgeries should never be fully deleted)
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  archivedBy: varchar("archived_by").references(() => users.id),
  
  // Cal.com sync tracking (surgeries push as busy blocks to surgeon's Cal.com)
  calcomBusyBlockUid: varchar("calcom_busy_block_uid"), // Cal.com busy block UID for sync
  calcomSyncedAt: timestamp("calcom_synced_at"), // When last synced to Cal.com
  
  // Pre-surgery reminder tracking
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgeries_case").on(table.caseId),
  index("idx_surgeries_hospital").on(table.hospitalId),
  index("idx_surgeries_patient").on(table.patientId),
  index("idx_surgeries_room").on(table.surgeryRoomId),
  index("idx_surgeries_pacu_bed").on(table.pacuBedId),
  index("idx_surgeries_surgeon").on(table.surgeonId),
  index("idx_surgeries_status").on(table.status),
  index("idx_surgeries_planned_date").on(table.plannedDate),
  index("idx_surgeries_payment_status").on(table.paymentStatus),
  index("idx_surgeries_archived").on(table.isArchived),
  index("idx_surgeries_calcom").on(table.calcomBusyBlockUid),
]);

// Surgery Notes - Multiple notes per surgery with author tracking
export const surgeryNotes = pgTable("surgery_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgery_notes_surgery").on(table.surgeryId),
  index("idx_surgery_notes_author").on(table.authorId),
  index("idx_surgery_notes_created").on(table.createdAt),
]);

export const insertSurgeryNoteSchema = createInsertSchema(surgeryNotes).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertSurgeryNote = z.infer<typeof insertSurgeryNoteSchema>;
export type SurgeryNote = typeof surgeryNotes.$inferSelect;

// Patient Notes - General notes about a patient (CRM, clinical, communication tracking)
export const patientNotes = pgTable("patient_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  authorId: varchar("author_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_patient_notes_patient").on(table.patientId),
  index("idx_patient_notes_author").on(table.authorId),
  index("idx_patient_notes_created").on(table.createdAt),
]);

export const insertPatientNoteSchema = createInsertSchema(patientNotes).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});
export type InsertPatientNote = z.infer<typeof insertPatientNoteSchema>;
export type PatientNote = typeof patientNotes.$inferSelect;

// Note Attachments - Images/files attached to patient notes or surgery notes
export const noteAttachments = pgTable("note_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  noteType: varchar("note_type", { enum: ["patient", "surgery"] }).notNull(),
  noteId: varchar("note_id").notNull(),
  storageKey: varchar("storage_key").notNull(),
  fileName: varchar("file_name").notNull(),
  mimeType: varchar("mime_type").notNull(),
  fileSize: integer("file_size"),
  uploadedBy: varchar("uploaded_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_note_attachments_note").on(table.noteType, table.noteId),
  index("idx_note_attachments_uploaded_by").on(table.uploadedBy),
]);

export const insertNoteAttachmentSchema = createInsertSchema(noteAttachments).omit({ 
  id: true, 
  createdAt: true 
});
export type InsertNoteAttachment = z.infer<typeof insertNoteAttachmentSchema>;
export type NoteAttachment = typeof noteAttachments.$inferSelect;

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
  
  // Camera device for automated vitals capture
  cameraDeviceId: varchar("camera_device_id").references(() => cameraDevices.id),
  autoCaptureEnabled: boolean("auto_capture_enabled").default(false), // Enable automatic vitals capture from camera
  
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
      betadine?: boolean;         // Betadine disinfectant
      performedBy?: string;
    };
    equipment?: {
      monopolar?: boolean;
      bipolar?: boolean;
      neutralElectrodeLocation?: string; // shoulder, abdomen, thigh, back
      neutralElectrodeSide?: string;     // left, right (body side for neutral electrode)
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
      ringerSolution?: boolean;   // Ringer's solution
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
      data?: string | null;  // Legacy: base64 (optional for backward compatibility)
      storageKey?: string | null;  // New: object storage key
      filename?: string;
      mimeType?: string;
      size?: number | null;  // File size in bytes
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

// Imported On-Demand Medications - Junction table for tracking which on-demand medications
// have been imported/attached to a specific anesthesia record
export const anesthesiaRecordMedications = pgTable("anesthesia_record_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  medicationConfigId: varchar("medication_config_id").notNull().references(() => medicationConfigs.id, { onDelete: 'cascade' }),
  importedAt: timestamp("imported_at").defaultNow(),
  importedBy: varchar("imported_by").references(() => users.id),
}, (table) => [
  index("idx_record_medications_record").on(table.anesthesiaRecordId),
  index("idx_record_medications_config").on(table.medicationConfigId),
  unique("uq_record_medication").on(table.anesthesiaRecordId, table.medicationConfigId),
]);

// Medication Couplings - Define medications that should be automatically added together
// Example: When Kefzol is given, NaCl 0.9% 100ml is automatically added as the diluent
export const medicationCouplings = pgTable("medication_couplings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primaryMedicationConfigId: varchar("primary_medication_config_id").notNull().references(() => medicationConfigs.id, { onDelete: 'cascade' }),
  coupledMedicationConfigId: varchar("coupled_medication_config_id").notNull().references(() => medicationConfigs.id, { onDelete: 'cascade' }),
  
  // Optional: default dose/quantity for the coupled medication
  defaultDose: varchar("default_dose"),
  notes: text("notes"),
  
  // Scope: hospital-level or unit-level coupling
  hospitalId: varchar("hospital_id").references(() => hospitals.id, { onDelete: 'cascade' }),
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }),
  
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("idx_medication_couplings_primary").on(table.primaryMedicationConfigId),
  index("idx_medication_couplings_coupled").on(table.coupledMedicationConfigId),
  unique("uq_medication_coupling").on(table.primaryMedicationConfigId, table.coupledMedicationConfigId),
]);

// Medication Sets - Predefined bundles of medications for quick import
export const medicationSets = pgTable("medication_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name").notNull(),
  description: text("description"),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }), // Optional: unit-specific sets
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: varchar("created_by").references(() => users.id),
}, (table) => [
  index("idx_medication_sets_hospital").on(table.hospitalId),
  index("idx_medication_sets_unit").on(table.unitId),
]);

// Medication Set Items - Medications included in a set
export const medicationSetItems = pgTable("medication_set_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => medicationSets.id, { onDelete: 'cascade' }),
  medicationConfigId: varchar("medication_config_id").notNull().references(() => medicationConfigs.id, { onDelete: 'cascade' }),
  customDose: varchar("custom_dose"), // Optional: override the medication's default dose
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_medication_set_items_set").on(table.setId),
  index("idx_medication_set_items_config").on(table.medicationConfigId),
  unique("uq_medication_set_item").on(table.setId, table.medicationConfigId),
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
  coagulationIllnesses: jsonb("coagulation_illnesses").$type<Record<string, boolean>>(),
  infectiousIllnesses: jsonb("infectious_illnesses").$type<Record<string, boolean>>(),
  coagulationInfectiousNotes: text("coagulation_infectious_notes"),
  womanIssues: jsonb("woman_issues").$type<Record<string, boolean>>(),
  womanNotes: text("woman_notes"),
  noxen: jsonb("noxen").$type<Record<string, boolean>>(),
  noxenNotes: text("noxen_notes"),
  childrenIssues: jsonb("children_issues").$type<Record<string, boolean>>(),
  childrenNotes: text("children_notes"),
  
  // Anesthesia & Surgical History section
  anesthesiaHistoryIssues: jsonb("anesthesia_history_issues").$type<Record<string, boolean>>(),
  dentalIssues: jsonb("dental_issues").$type<Record<string, boolean>>(),
  ponvTransfusionIssues: jsonb("ponv_transfusion_issues").$type<Record<string, boolean>>(),
  previousSurgeries: text("previous_surgeries"),
  anesthesiaSurgicalHistoryNotes: text("anesthesia_surgical_history_notes"),
  
  // Outpatient Care section
  outpatientCaregiverFirstName: varchar("outpatient_caregiver_first_name"),
  outpatientCaregiverLastName: varchar("outpatient_caregiver_last_name"),
  outpatientCaregiverPhone: varchar("outpatient_caregiver_phone"),
  
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
  consentAnalgosedation: boolean("consent_analgosedation").default(false),
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
  emailLanguage: varchar("email_language").default("de"), // 'en' | 'de'
  emailSentAt: timestamp("email_sent_at"),
  consentNotes: text("consent_notes"),
  
  consentSignedByProxy: boolean("consent_signed_by_proxy").default(false),
  consentProxySignerName: varchar("consent_proxy_signer_name"),
  consentProxySignerRelation: varchar("consent_proxy_signer_relation"),
  consentSignerIdFrontUrl: text("consent_signer_id_front_url"),
  consentSignerIdBackUrl: text("consent_signer_id_back_url"),
  consentRemoteSignedAt: timestamp("consent_remote_signed_at"),
  consentInvitationSentAt: timestamp("consent_invitation_sent_at"),
  consentInvitationMethod: varchar("consent_invitation_method"), // 'sms' | 'email'
  
  // Callback Appointment (for consent_required stand-by)
  callbackAppointmentSlots: jsonb("callback_appointment_slots"), // Array of { date: string, fromTime: string, toTime: string }
  callbackPhoneNumber: varchar("callback_phone_number"),
  callbackInvitationSentAt: timestamp("callback_invitation_sent_at"),
  callbackInvitationMethod: varchar("callback_invitation_method"), // 'sms' | 'email'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_preop_assessments_surgery").on(table.surgeryId),
]);

// Surgery Pre-Op Assessments (for surgery module - simpler than anesthesia, file-based consent)
export const surgeryPreOpAssessments = pgTable("surgery_preop_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id).unique(),
  
  // Basic vitals
  height: varchar("height"),
  weight: varchar("weight"),
  heartRate: varchar("heart_rate"),
  bloodPressureSystolic: varchar("blood_pressure_systolic"),
  bloodPressureDiastolic: varchar("blood_pressure_diastolic"),
  
  // CAVE notes
  cave: text("cave"),
  specialNotes: text("special_notes"),
  
  // Allergies (from hospital's anesthesia settings allergyList)
  allergies: text("allergies").array(),
  otherAllergies: text("other_allergies"),
  
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
  
  // Anesthesia & Surgical History section
  anesthesiaHistoryIssues: jsonb("anesthesia_history_issues").$type<Record<string, boolean>>(),
  dentalIssues: jsonb("dental_issues").$type<Record<string, boolean>>(),
  ponvTransfusionIssues: jsonb("ponv_transfusion_issues").$type<Record<string, boolean>>(),
  previousSurgeries: text("previous_surgeries"),
  anesthesiaSurgicalHistoryNotes: text("anesthesia_surgical_history_notes"),
  
  // Outpatient Care section
  outpatientCaregiverFirstName: varchar("outpatient_caregiver_first_name"),
  outpatientCaregiverLastName: varchar("outpatient_caregiver_last_name"),
  outpatientCaregiverPhone: varchar("outpatient_caregiver_phone"),
  
  // Fasting
  lastSolids: varchar("last_solids"),
  lastClear: varchar("last_clear"),
  
  // Surgical Approval Status (matching anesthesia form)
  surgicalApprovalStatus: varchar("surgical_approval_status"), // 'approved' | 'not-approved' | ''
  
  // Stand-By Status
  standBy: boolean("stand_by").default(false),
  standByReason: varchar("stand_by_reason"), // 'signature_missing' | 'consent_required' | 'waiting_exams' | 'other'
  standByReasonNote: text("stand_by_reason_note"),
  
  // Assessment metadata
  assessmentDate: varchar("assessment_date"),
  doctorName: varchar("doctor_name"),
  doctorSignature: text("doctor_signature"),
  
  // Status tracking: 'draft' (partially filled), 'completed' (signed and finalized)
  status: varchar("status").default("draft"), // draft | completed
  
  // File-based Informed Consent (upload paper consent photo/scan)
  consentFileUrl: varchar("consent_file_url"),
  consentFileName: varchar("consent_file_name"),
  consentUploadedAt: timestamp("consent_uploaded_at"),
  consentNotes: text("consent_notes"),
  consentDate: varchar("consent_date"),
  patientSignature: text("patient_signature"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgery_preop_assessments_surgery").on(table.surgeryId),
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
    enum: ["bolus", "infusion_start", "infusion_stop", "rate_change", "manual_total"] 
  }).notNull(),
  
  // Dosing
  dose: varchar("dose"), // For boluses
  unit: varchar("unit"), // mg, ml, μg, etc.
  route: varchar("route"), // i.v., s.c., p.o., spinal
  
  // Rate (for infusions)
  rate: varchar("rate"), // e.g., "5 ml/hr", "0.1 μg/kg/min"
  endTimestamp: timestamp("end_timestamp", { withTimezone: true }), // When infusion stopped
  
  // Initial bolus (for rate-controlled infusions - administered at start)
  initialBolus: varchar("initial_bolus"), // e.g., "150" (in administration unit, typically mg)
  
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

// Surgery Staff (Unified staff assignments shared between anesthesia and surgery modules)
export const surgeryStaffEntries = pgTable("surgery_staff_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  
  role: varchar("role", { enum: [
    "surgeon",           // Operateur
    "surgicalAssistant", // Assistenz
    "instrumentNurse",   // Instrumentierende (scrub nurse)
    "circulatingNurse",  // Zudienung (circulating nurse)
    "anesthesiologist",  // Anästhesie
    "anesthesiaNurse",   // Anä-Pflege
    "pacuNurse",         // AWR-Pflege (PACU nurse)
  ] }).notNull(),
  
  userId: varchar("user_id").references(() => users.id), // Nullable - for system users (cost calculation)
  name: varchar("name").notNull(), // Always required - display name (or custom entry for non-system staff)
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_surgery_staff_entries_record").on(table.anesthesiaRecordId),
  index("idx_surgery_staff_entries_role").on(table.role),
  index("idx_surgery_staff_entries_user").on(table.userId),
]);

// Daily Staff Pool (Staff available for scheduling on a specific day)
export const dailyStaffPool = pgTable("daily_staff_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  date: date("date").notNull(), // The day this staff member is available
  
  userId: varchar("user_id").references(() => users.id), // Nullable - for system users
  name: varchar("name").notNull(), // Display name (or custom entry for non-system staff)
  role: varchar("role", { enum: [
    "surgeon",
    "surgicalAssistant", 
    "instrumentNurse",
    "circulatingNurse",
    "anesthesiologist",
    "anesthesiaNurse",
    "pacuNurse",
  ] }).notNull(),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_daily_staff_pool_hospital").on(table.hospitalId),
  index("idx_daily_staff_pool_date").on(table.date),
  index("idx_daily_staff_pool_user").on(table.userId),
]);

// Planned Surgery Staff (Staff assigned to a specific surgery before the anesthesia record is created)
export const plannedSurgeryStaff = pgTable("planned_surgery_staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id, { onDelete: 'cascade' }),
  dailyStaffPoolId: varchar("daily_staff_pool_id").notNull().references(() => dailyStaffPool.id, { onDelete: 'cascade' }),
  
  // Denormalized for quick display
  role: varchar("role", { enum: [
    "surgeon",
    "surgicalAssistant", 
    "instrumentNurse",
    "circulatingNurse",
    "anesthesiologist",
    "anesthesiaNurse",
    "pacuNurse",
  ] }).notNull(),
  name: varchar("name").notNull(),
  userId: varchar("user_id").references(() => users.id),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_planned_surgery_staff_surgery").on(table.surgeryId),
  index("idx_planned_surgery_staff_pool").on(table.dailyStaffPoolId),
  unique("idx_planned_surgery_staff_unique").on(table.surgeryId, table.dailyStaffPoolId),
]);

// Daily Room Staff (Staff assigned to a surgery room for a specific day - replaces surgery-level assignments)
export const dailyRoomStaff = pgTable("daily_room_staff", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dailyStaffPoolId: varchar("daily_staff_pool_id").notNull().references(() => dailyStaffPool.id, { onDelete: 'cascade' }),
  surgeryRoomId: varchar("surgery_room_id").notNull().references(() => surgeryRooms.id, { onDelete: 'cascade' }),
  date: date("date").notNull(),
  
  // Denormalized for quick display
  role: varchar("role", { enum: [
    "surgeon",
    "surgicalAssistant", 
    "instrumentNurse",
    "circulatingNurse",
    "anesthesiologist",
    "anesthesiaNurse",
    "pacuNurse",
  ] }).notNull(),
  name: varchar("name").notNull(),
  userId: varchar("user_id").references(() => users.id),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_daily_room_staff_pool").on(table.dailyStaffPoolId),
  index("idx_daily_room_staff_room").on(table.surgeryRoomId),
  index("idx_daily_room_staff_date").on(table.date),
  unique("idx_daily_room_staff_unique").on(table.dailyStaffPoolId, table.surgeryRoomId, table.date),
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

// ========== CHAT SYSTEM ==========

// Chat Conversations
export const chatConversations = pgTable("chat_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  creatorId: varchar("creator_id").notNull().references(() => users.id),
  title: varchar("title"), // Optional title for group chats
  scopeType: varchar("scope_type", { enum: ["self", "direct", "unit", "hospital"] }).notNull(),
  unitId: varchar("unit_id").references(() => units.id), // For unit broadcasts
  patientId: varchar("patient_id").references(() => patients.id), // Optional patient context
  lastMessageAt: timestamp("last_message_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_conversations_hospital").on(table.hospitalId),
  index("idx_chat_conversations_creator").on(table.creatorId),
  index("idx_chat_conversations_scope").on(table.scopeType),
  index("idx_chat_conversations_unit").on(table.unitId),
  index("idx_chat_conversations_patient").on(table.patientId),
  index("idx_chat_conversations_last_message").on(table.lastMessageAt),
]);

// Chat Conversation Participants
export const chatParticipants = pgTable("chat_participants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().references(() => users.id),
  role: varchar("role", { enum: ["owner", "admin", "member"] }).default("member").notNull(),
  isMuted: boolean("is_muted").default(false).notNull(),
  lastReadAt: timestamp("last_read_at"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_chat_participants_conversation").on(table.conversationId),
  index("idx_chat_participants_user").on(table.userId),
  unique("unique_conversation_participant").on(table.conversationId, table.userId),
]);

// Chat Messages
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  content: text("content").notNull(), // Encrypted message content
  messageType: varchar("message_type", { enum: ["text", "file", "image", "system"] }).default("text").notNull(),
  replyToMessageId: varchar("reply_to_message_id"), // For threading
  editedAt: timestamp("edited_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_messages_conversation").on(table.conversationId),
  index("idx_chat_messages_sender").on(table.senderId),
  index("idx_chat_messages_created").on(table.createdAt),
  index("idx_chat_messages_reply").on(table.replyToMessageId),
]);

// Chat Message Mentions (for @user and #patient references)
export const chatMentions = pgTable("chat_mentions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  mentionType: varchar("mention_type", { enum: ["user", "unit", "hospital", "patient"] }).notNull(),
  mentionedUserId: varchar("mentioned_user_id").references(() => users.id),
  mentionedUnitId: varchar("mentioned_unit_id").references(() => units.id),
  mentionedPatientId: varchar("mentioned_patient_id").references(() => patients.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_mentions_message").on(table.messageId),
  index("idx_chat_mentions_user").on(table.mentionedUserId),
  index("idx_chat_mentions_patient").on(table.mentionedPatientId),
]);

// Chat Message Attachments
export const chatAttachments = pgTable("chat_attachments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  messageId: varchar("message_id").notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),
  storageKey: varchar("storage_key").notNull(), // Object storage key
  filename: varchar("filename").notNull(),
  mimeType: varchar("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  thumbnailKey: varchar("thumbnail_key"), // For image previews
  savedToPatientId: varchar("saved_to_patient_id").references(() => patients.id), // If saved to patient record
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_attachments_message").on(table.messageId),
  index("idx_chat_attachments_patient").on(table.savedToPatientId),
]);

// Chat Notifications (for email notifications tracking)
export const chatNotifications = pgTable("chat_notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  conversationId: varchar("conversation_id").notNull().references(() => chatConversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").references(() => chatMessages.id, { onDelete: 'cascade' }),
  notificationType: varchar("notification_type", { enum: ["new_conversation", "mention", "new_message"] }).notNull(),
  emailSent: boolean("email_sent").default(false).notNull(),
  emailSentAt: timestamp("email_sent_at"),
  read: boolean("read").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chat_notifications_user").on(table.userId),
  index("idx_chat_notifications_conversation").on(table.conversationId),
  index("idx_chat_notifications_read").on(table.read),
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
  attachments: many(orderAttachments),
}));

export const orderLinesRelations = relations(orderLines, ({ one }) => ({
  order: one(orders, { fields: [orderLines.orderId], references: [orders.id] }),
  item: one(items, { fields: [orderLines.itemId], references: [items.id] }),
}));

export const orderAttachmentsRelations = relations(orderAttachments, ({ one }) => ({
  order: one(orders, { fields: [orderAttachments.orderId], references: [orders.id] }),
  uploadedByUser: one(users, { fields: [orderAttachments.uploadedBy], references: [users.id] }),
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
  assignments: many(checklistTemplateAssignments),
}));

export const checklistTemplateAssignmentsRelations = relations(checklistTemplateAssignments, ({ one }) => ({
  template: one(checklistTemplates, { fields: [checklistTemplateAssignments.templateId], references: [checklistTemplates.id] }),
  unit: one(units, { fields: [checklistTemplateAssignments.unitId], references: [units.id] }),
}));

export const checklistCompletionsRelations = relations(checklistCompletions, ({ one }) => ({
  template: one(checklistTemplates, { fields: [checklistCompletions.templateId], references: [checklistTemplates.id] }),
  hospital: one(hospitals, { fields: [checklistCompletions.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [checklistCompletions.unitId], references: [units.id] }),
  room: one(surgeryRooms, { fields: [checklistCompletions.roomId], references: [surgeryRooms.id] }),
  completedByUser: one(users, { fields: [checklistCompletions.completedBy], references: [users.id] }),
}));

export const medicationConfigsRelations = relations(medicationConfigs, ({ one, many }) => ({
  item: one(items, { fields: [medicationConfigs.itemId], references: [items.id] }),
  couplings: many(medicationCouplings, { relationName: 'primaryMedication' }),
  coupledTo: many(medicationCouplings, { relationName: 'coupledMedication' }),
}));

export const medicationCouplingsRelations = relations(medicationCouplings, ({ one }) => ({
  primaryMedication: one(medicationConfigs, { 
    fields: [medicationCouplings.primaryMedicationConfigId], 
    references: [medicationConfigs.id],
    relationName: 'primaryMedication'
  }),
  coupledMedication: one(medicationConfigs, { 
    fields: [medicationCouplings.coupledMedicationConfigId], 
    references: [medicationConfigs.id],
    relationName: 'coupledMedication'
  }),
  hospital: one(hospitals, { fields: [medicationCouplings.hospitalId], references: [hospitals.id] }),
  unit: one(units, { fields: [medicationCouplings.unitId], references: [units.id] }),
  createdByUser: one(users, { fields: [medicationCouplings.createdBy], references: [users.id] }),
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
  unitId: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  roomIds: z.array(z.string()).optional(),
  excludeWeekends: z.boolean().optional(),
});

export const insertChecklistTemplateAssignmentSchema = createInsertSchema(checklistTemplateAssignments).omit({
  id: true,
});

export const insertChecklistCompletionSchema = createInsertSchema(checklistCompletions).omit({
  id: true,
  completedAt: true,
});

export const insertChecklistDismissalSchema = createInsertSchema(checklistDismissals).omit({
  id: true,
  dismissedAt: true,
});

export const insertMedicationConfigSchema = createInsertSchema(medicationConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaRecordMedicationSchema = createInsertSchema(anesthesiaRecordMedications).omit({
  id: true,
  importedAt: true,
});

export const insertMedicationCouplingSchema = createInsertSchema(medicationCouplings).omit({
  id: true,
  createdAt: true,
});

export const insertMedicationSetSchema = createInsertSchema(medicationSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertMedicationSetItemSchema = createInsertSchema(medicationSetItems).omit({
  id: true,
  createdAt: true,
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

export const insertCameraDeviceSchema = createInsertSchema(cameraDevices).omit({
  id: true,
  lastSeenAt: true,
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

export const insertPatientDocumentSchema = createInsertSchema(patientDocuments).omit({
  id: true,
  createdAt: true,
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
  admissionTime: z.coerce.date().optional(), // Coerce string to Date
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
  ponvProphylaxis: z.object({
    ondansetron: z.boolean().optional(),
    droperidol: z.boolean().optional(),
    haloperidol: z.boolean().optional(),
    dexamethasone: z.boolean().optional(),
  }).optional().nullable(),
  ambulatoryCare: z.object({
    repeatAntibioticAfter4h: z.boolean().optional(),
    osasObservation: z.boolean().optional(),
    escortRequired: z.boolean().optional(),
    postBlockMotorCheck: z.boolean().optional(),
    extendedObservation: z.boolean().optional(),
    noOralAnticoagulants24h: z.boolean().optional(),
    notes: z.string().optional(),
  }).optional().nullable(),
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
    betadine: z.boolean().optional(),
    performedBy: z.string().optional().nullable(),
  }).optional(),
  equipment: z.object({
    monopolar: z.boolean().optional(),
    bipolar: z.boolean().optional(),
    neutralElectrodeLocation: z.string().optional().nullable(),
    neutralElectrodeSide: z.string().optional().nullable(),
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
    ringerSolution: z.boolean().optional(),
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
    rapidocain1: z.boolean().optional(),
    ropivacainEpinephrine: z.boolean().optional(),
    ropivacain05: z.boolean().optional(),
    ropivacain075: z.boolean().optional(),
    ropivacain1: z.boolean().optional(),
    bupivacain: z.boolean().optional(),
    vancomycinImplant: z.boolean().optional(),
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
    // Legacy: base64 data (optional - for backward compatibility)
    data: z.string().max(MAX_BASE64_SIZE, 'File too large (max 5MB)').optional().nullable(),
    // New: object storage key (optional - for new uploads)
    storageKey: z.string().optional().nullable(),
    filename: z.string().optional().nullable(),
    mimeType: z.string().refine(
      (val) => !val || ALLOWED_MIME_TYPES.includes(val),
      { message: 'Invalid file type. Allowed: JPEG, PNG, GIF, PDF' }
    ).optional().nullable(),
    size: z.number().optional().nullable(), // File size in bytes
    createdAt: z.number().optional(),
    createdBy: z.string().optional().nullable(),
  }).refine(
    (doc) => doc.data || doc.storageKey,
    { message: 'Either data (base64) or storageKey must be provided' }
  )).optional(),
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

export const insertSurgeryPreOpAssessmentSchema = createInsertSchema(surgeryPreOpAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  consentUploadedAt: true,
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

// VAS (Visual Analog Scale) Pain Score schemas
export const addVASPointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  value: z.number().min(0).max(10),
});

export const updateVASPointSchema = z.object({
  pointId: z.string(),
  value: z.number().min(0).max(10).optional(),
  timestamp: z.string().optional(),
});

export const deleteVASPointSchema = z.object({
  pointId: z.string(),
});

// Aldrete Score schemas (PACU recovery score)
export const addAldretePointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  value: z.number().min(0).max(10), // Aldrete score 0-10
  components: z.object({
    activity: z.number().min(0).max(2).optional(),
    respiration: z.number().min(0).max(2).optional(),
    circulation: z.number().min(0).max(2).optional(),
    consciousness: z.number().min(0).max(2).optional(),
    oxygenSaturation: z.number().min(0).max(2).optional(),
  }).optional(),
});

export const updateAldretePointSchema = z.object({
  pointId: z.string(),
  value: z.number().min(0).max(10).optional(),
  timestamp: z.string().optional(),
  components: z.object({
    activity: z.number().min(0).max(2).optional(),
    respiration: z.number().min(0).max(2).optional(),
    circulation: z.number().min(0).max(2).optional(),
    consciousness: z.number().min(0).max(2).optional(),
    oxygenSaturation: z.number().min(0).max(2).optional(),
  }).optional(),
});

export const deleteAldretePointSchema = z.object({
  pointId: z.string(),
});

// Generic Score schemas (Aldrete and PARSAP)
export const addScorePointSchema = z.object({
  anesthesiaRecordId: z.string(),
  timestamp: z.string(),
  scoreType: z.enum(['aldrete', 'parsap']),
  totalScore: z.number().min(0).max(12),
  aldreteScore: z.object({
    activity: z.number().min(0).max(2),
    respiration: z.number().min(0).max(2),
    circulation: z.number().min(0).max(2),
    consciousness: z.number().min(0).max(2),
    oxygenSaturation: z.number().min(0).max(2),
  }).optional(),
  parsapScore: z.object({
    pulse: z.number().min(0).max(2),
    activity: z.number().min(0).max(2),
    respiration: z.number().min(0).max(2),
    saturations: z.number().min(0).max(2),
    airwayPatency: z.number().min(0).max(2),
    pupil: z.number().min(0).max(2),
  }).optional(),
});

export const updateScorePointSchema = z.object({
  pointId: z.string(),
  timestamp: z.string().optional(),
  scoreType: z.enum(['aldrete', 'parsap']).optional(),
  totalScore: z.number().min(0).max(12).optional(),
  aldreteScore: z.object({
    activity: z.number().min(0).max(2),
    respiration: z.number().min(0).max(2),
    circulation: z.number().min(0).max(2),
    consciousness: z.number().min(0).max(2),
    oxygenSaturation: z.number().min(0).max(2),
  }).optional(),
  parsapScore: z.object({
    pulse: z.number().min(0).max(2),
    activity: z.number().min(0).max(2),
    respiration: z.number().min(0).max(2),
    saturations: z.number().min(0).max(2),
    airwayPatency: z.number().min(0).max(2),
    pupil: z.number().min(0).max(2),
  }).optional(),
});

export const deleteScorePointSchema = z.object({
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

export const insertSurgeryStaffEntrySchema = createInsertSchema(surgeryStaffEntries).omit({
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

// Chat Insert Schemas
export const insertChatConversationSchema = createInsertSchema(chatConversations).omit({
  id: true,
  creatorId: true,
  lastMessageAt: true,
  createdAt: true,
});

export const insertChatParticipantSchema = createInsertSchema(chatParticipants).omit({
  id: true,
  joinedAt: true,
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({
  id: true,
  senderId: true,
  editedAt: true,
  deletedAt: true,
  createdAt: true,
});

export const insertChatMentionSchema = createInsertSchema(chatMentions).omit({
  id: true,
  createdAt: true,
});

export const insertChatAttachmentSchema = createInsertSchema(chatAttachments).omit({
  id: true,
  createdAt: true,
});

export const insertChatNotificationSchema = createInsertSchema(chatNotifications).omit({
  id: true,
  emailSentAt: true,
  createdAt: true,
});

export const insertDailyStaffPoolSchema = createInsertSchema(dailyStaffPool).omit({
  id: true,
  createdAt: true,
});

export const insertPlannedSurgeryStaffSchema = createInsertSchema(plannedSurgeryStaff).omit({
  id: true,
  createdAt: true,
});

export const insertDailyRoomStaffSchema = createInsertSchema(dailyRoomStaff).omit({
  id: true,
  createdAt: true,
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
export type OrderAttachment = typeof orderAttachments.$inferSelect;
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
export type ChecklistTemplateAssignment = typeof checklistTemplateAssignments.$inferSelect;
export type InsertChecklistTemplateAssignment = z.infer<typeof insertChecklistTemplateAssignmentSchema>;
export type ChecklistCompletion = typeof checklistCompletions.$inferSelect;
export type InsertChecklistCompletion = z.infer<typeof insertChecklistCompletionSchema>;
export type ChecklistDismissal = typeof checklistDismissals.$inferSelect;
export type InsertChecklistDismissal = z.infer<typeof insertChecklistDismissalSchema>;
export type MedicationConfig = typeof medicationConfigs.$inferSelect;
export type InsertMedicationConfig = z.infer<typeof insertMedicationConfigSchema>;
export type AnesthesiaRecordMedication = typeof anesthesiaRecordMedications.$inferSelect;
export type InsertAnesthesiaRecordMedication = z.infer<typeof insertAnesthesiaRecordMedicationSchema>;
export type MedicationCoupling = typeof medicationCouplings.$inferSelect;
export type InsertMedicationCoupling = z.infer<typeof insertMedicationCouplingSchema>;
export type MedicationSet = typeof medicationSets.$inferSelect;
export type InsertMedicationSet = z.infer<typeof insertMedicationSetSchema>;
export type MedicationSetItem = typeof medicationSetItems.$inferSelect;
export type InsertMedicationSetItem = z.infer<typeof insertMedicationSetItemSchema>;
export type MedicationGroup = typeof medicationGroups.$inferSelect;
export type InsertMedicationGroup = z.infer<typeof insertMedicationGroupSchema>;
export type AdministrationGroup = typeof administrationGroups.$inferSelect;
export type InsertAdministrationGroup = z.infer<typeof insertAdministrationGroupSchema>;
export type SurgeryRoom = typeof surgeryRooms.$inferSelect;
export type InsertSurgeryRoom = z.infer<typeof insertSurgeryRoomSchema>;
export type CameraDevice = typeof cameraDevices.$inferSelect;
export type InsertCameraDevice = z.infer<typeof insertCameraDeviceSchema>;

// Anesthesia Module Types
export type HospitalAnesthesiaSettings = typeof hospitalAnesthesiaSettings.$inferSelect;
export type InsertHospitalAnesthesiaSettings = z.infer<typeof insertHospitalAnesthesiaSettingsSchema>;
export type Patient = typeof patients.$inferSelect;
export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type PatientDocument = typeof patientDocuments.$inferSelect;
export type InsertPatientDocument = z.infer<typeof insertPatientDocumentSchema>;
export type Case = typeof cases.$inferSelect;
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Surgery = typeof surgeries.$inferSelect;
export type InsertSurgery = z.infer<typeof insertSurgerySchema>;
export type AnesthesiaRecord = typeof anesthesiaRecords.$inferSelect;
export type InsertAnesthesiaRecord = z.infer<typeof insertAnesthesiaRecordSchema>;
export type PreOpAssessment = typeof preOpAssessments.$inferSelect;
export type InsertPreOpAssessment = z.infer<typeof insertPreOpAssessmentSchema>;
export type SurgeryPreOpAssessment = typeof surgeryPreOpAssessments.$inferSelect;
export type InsertSurgeryPreOpAssessment = z.infer<typeof insertSurgeryPreOpAssessmentSchema>;
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
export type SurgeryStaffEntry = typeof surgeryStaffEntries.$inferSelect;
export type InsertSurgeryStaffEntry = z.infer<typeof insertSurgeryStaffEntrySchema>;
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
export type DailyStaffPool = typeof dailyStaffPool.$inferSelect;
export type InsertDailyStaffPool = z.infer<typeof insertDailyStaffPoolSchema>;
export type PlannedSurgeryStaff = typeof plannedSurgeryStaff.$inferSelect;
export type InsertPlannedSurgeryStaff = z.infer<typeof insertPlannedSurgeryStaffSchema>;
export type DailyRoomStaff = typeof dailyRoomStaff.$inferSelect;
export type InsertDailyRoomStaff = z.infer<typeof insertDailyRoomStaffSchema>;
export type InventoryUsage = typeof inventoryUsage.$inferSelect;
export type InsertInventoryUsage = z.infer<typeof insertInventoryUsageSchema>;
export type InventoryCommit = typeof inventoryCommits.$inferSelect;
export type InsertInventoryCommit = z.infer<typeof insertInventoryCommitSchema>;
export type AuditTrail = typeof auditTrail.$inferSelect;
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type Note = typeof notes.$inferSelect;
export type InsertNote = z.infer<typeof insertNoteSchema>;

// Chat Types
export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = z.infer<typeof insertChatConversationSchema>;
export type ChatParticipant = typeof chatParticipants.$inferSelect;
export type InsertChatParticipant = z.infer<typeof insertChatParticipantSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMention = typeof chatMentions.$inferSelect;
export type InsertChatMention = z.infer<typeof insertChatMentionSchema>;
export type ChatAttachment = typeof chatAttachments.$inferSelect;
export type InsertChatAttachment = z.infer<typeof insertChatAttachmentSchema>;
export type ChatNotification = typeof chatNotifications.$inferSelect;
export type InsertChatNotification = z.infer<typeof insertChatNotificationSchema>;

// ========================================
// Clinic Module (Outpatient/Medical Clinic)
// ========================================

// Clinic Invoices - Invoices for outpatient services
export const clinicInvoices = pgTable("clinic_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  invoiceNumber: integer("invoice_number").notNull(),
  date: timestamp("date").notNull().defaultNow(),
  patientId: varchar("patient_id").references(() => patients.id),
  customerName: text("customer_name").notNull(),
  customerAddress: text("customer_address"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  vatRate: decimal("vat_rate", { precision: 5, scale: 2 }).notNull().default("7.7"),
  vatAmount: decimal("vat_amount", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  comments: text("comments"),
  status: varchar("status", { enum: ["draft", "sent", "paid", "cancelled"] }).default("draft"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_clinic_invoices_hospital").on(table.hospitalId),
  index("idx_clinic_invoices_patient").on(table.patientId),
  index("idx_clinic_invoices_status").on(table.status),
  index("idx_clinic_invoices_date").on(table.date),
]);

// Clinic Services - Billable services (not physical inventory items)
export const clinicServices = pgTable("clinic_services", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }),
  durationMinutes: integer("duration_minutes"),
  isShared: boolean("is_shared").default(false).notNull(),
  isInvoiceable: boolean("is_invoiceable").default(false), // Whether service appears in invoice service picker
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_clinic_services_hospital").on(table.hospitalId),
  index("idx_clinic_services_unit").on(table.unitId),
]);

// Clinic Invoice Items - Line items for each invoice (supports both items and services)
export const clinicInvoiceItems = pgTable("clinic_invoice_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: varchar("invoice_id").notNull().references(() => clinicInvoices.id, { onDelete: 'cascade' }),
  lineType: varchar("line_type", { enum: ["item", "service"] }).default("item").notNull(),
  itemId: varchar("item_id").references(() => items.id),
  serviceId: varchar("service_id").references(() => clinicServices.id),
  description: text("description").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  taxAmount: decimal("tax_amount", { precision: 10, scale: 2 }).notNull().default("0"),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
}, (table) => [
  index("idx_clinic_invoice_items_invoice").on(table.invoiceId),
  index("idx_clinic_invoice_items_item").on(table.itemId),
  index("idx_clinic_invoice_items_service").on(table.serviceId),
]);

// Clinic Services Insert Schema
export const insertClinicServiceSchema = createInsertSchema(clinicServices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Clinic Invoice Insert Schemas
export const insertClinicInvoiceSchema = createInsertSchema(clinicInvoices, {
  date: z.coerce.date(),
}).omit({
  id: true,
  createdAt: true,
});

export const insertClinicInvoiceItemSchema = createInsertSchema(clinicInvoiceItems).omit({
  id: true,
});

// Clinic Services Types
export type ClinicService = typeof clinicServices.$inferSelect;
export type InsertClinicService = z.infer<typeof insertClinicServiceSchema>;

// Clinic Invoice Types
export type ClinicInvoice = typeof clinicInvoices.$inferSelect;
export type InsertClinicInvoice = z.infer<typeof insertClinicInvoiceSchema>;
export type ClinicInvoiceItem = typeof clinicInvoiceItems.$inferSelect;
export type InsertClinicInvoiceItem = z.infer<typeof insertClinicInvoiceItemSchema>;

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

// ============================================
// Surgeon Pre-Op Checklist Templates
// ============================================

// Available placeholder tokens that can be used in checklist templates
export const checklistPlaceholderTokens = [
  'price',
  'admissionTime',
  'plannedDate',
  'plannedSurgery',
  'surgeonName',
  'patientName',
  'patientDob',
  'surgeryRoom',
  'notes',
  'implantDetails',
] as const;

export type ChecklistPlaceholderToken = typeof checklistPlaceholderTokens[number];

// Surgeon Checklist Templates - Reusable templates created by surgeons
export const surgeonChecklistTemplates = pgTable("surgeon_checklist_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  ownerUserId: varchar("owner_user_id").notNull().references(() => users.id),
  title: varchar("title").notNull(),
  isShared: boolean("is_shared").default(false).notNull(),
  isDefault: boolean("is_default").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgeon_checklist_templates_hospital").on(table.hospitalId),
  index("idx_surgeon_checklist_templates_owner").on(table.ownerUserId),
]);

// Surgeon Checklist Template Items - Individual items within a template
export const surgeonChecklistTemplateItems = pgTable("surgeon_checklist_template_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  templateId: varchar("template_id").notNull().references(() => surgeonChecklistTemplates.id, { onDelete: 'cascade' }),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_surgeon_checklist_items_template").on(table.templateId),
]);

// Surgery Pre-Op Checklist Entries - Actual checklist data for a surgery
export const surgeryPreOpChecklistEntries = pgTable("surgery_preop_checklist_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id, { onDelete: 'cascade' }),
  templateId: varchar("template_id").notNull().references(() => surgeonChecklistTemplates.id),
  itemId: varchar("item_id").notNull().references(() => surgeonChecklistTemplateItems.id),
  checked: boolean("checked").default(false).notNull(),
  note: text("note"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgery_checklist_entries_surgery").on(table.surgeryId),
  index("idx_surgery_checklist_entries_template").on(table.templateId),
  unique("unique_surgery_item").on(table.surgeryId, table.itemId),
]);

// Insert schemas
export const insertSurgeonChecklistTemplateSchema = createInsertSchema(surgeonChecklistTemplates).omit({
  id: true,
  ownerUserId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSurgeonChecklistTemplateItemSchema = createInsertSchema(surgeonChecklistTemplateItems).omit({
  id: true,
  createdAt: true,
});

export const insertSurgeryPreOpChecklistEntrySchema = createInsertSchema(surgeryPreOpChecklistEntries).omit({
  id: true,
  updatedAt: true,
});

// Types
export type SurgeonChecklistTemplate = typeof surgeonChecklistTemplates.$inferSelect;
export type InsertSurgeonChecklistTemplate = z.infer<typeof insertSurgeonChecklistTemplateSchema>;
export type SurgeonChecklistTemplateItem = typeof surgeonChecklistTemplateItems.$inferSelect;
export type InsertSurgeonChecklistTemplateItem = z.infer<typeof insertSurgeonChecklistTemplateItemSchema>;
export type SurgeryPreOpChecklistEntry = typeof surgeryPreOpChecklistEntries.$inferSelect;
export type InsertSurgeryPreOpChecklistEntry = z.infer<typeof insertSurgeryPreOpChecklistEntrySchema>;

// Update schemas for API
export const updateSurgeonChecklistTemplateSchema = z.object({
  title: z.string().optional(),
  isShared: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  items: z.array(z.object({
    id: z.string().optional(),
    label: z.string(),
    sortOrder: z.number(),
  })).optional(),
});

export const updateSurgeryChecklistSchema = z.object({
  templateId: z.string(),
  entries: z.array(z.object({
    itemId: z.string(),
    checked: z.boolean(),
    note: z.string().optional().nullable(),
  })),
});

// ==================== PATIENT QUESTIONNAIRE SYSTEM ====================

// Patient Questionnaire Links - Unique links sent to patients for online form completion
export const patientQuestionnaireLinks = pgTable("patient_questionnaire_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  patientId: varchar("patient_id").references(() => patients.id), // null for general/anonymous forms
  surgeryId: varchar("surgery_id").references(() => surgeries.id), // null if not yet associated
  token: varchar("token").notNull().unique(), // Cryptographically secure token
  status: varchar("status", { enum: ["pending", "started", "submitted", "expired", "reviewed"] }).default("pending").notNull(),
  language: varchar("language").default("de"), // Default language for the form
  expiresAt: timestamp("expires_at").notNull(), // Link expiration
  createdBy: varchar("created_by").references(() => users.id), // Staff who generated link
  createdAt: timestamp("created_at").defaultNow(),
  submittedAt: timestamp("submitted_at"), // When patient submitted
  reviewedAt: timestamp("reviewed_at"), // When doctor reviewed
  reviewedBy: varchar("reviewed_by").references(() => users.id), // Doctor who reviewed
  emailSent: boolean("email_sent").default(false).notNull(), // Track if questionnaire was emailed
  emailSentAt: timestamp("email_sent_at"), // When email was sent
  emailSentTo: varchar("email_sent_to"), // Email address it was sent to
  emailSentBy: varchar("email_sent_by").references(() => users.id), // User who sent the email
  smsSent: boolean("sms_sent").default(false).notNull(), // Track if questionnaire was sent via SMS
  smsSentAt: timestamp("sms_sent_at"), // When SMS was sent
  smsSentTo: varchar("sms_sent_to"), // Phone number it was sent to
  smsSentBy: varchar("sms_sent_by").references(() => users.id), // User who sent the SMS
}, (table) => [
  index("idx_questionnaire_links_hospital").on(table.hospitalId),
  index("idx_questionnaire_links_patient").on(table.patientId),
  index("idx_questionnaire_links_surgery").on(table.surgeryId),
  index("idx_questionnaire_links_token").on(table.token),
  index("idx_questionnaire_links_status").on(table.status),
]);

// Patient Questionnaire Responses - Stores patient-submitted data
export const patientQuestionnaireResponses = pgTable("patient_questionnaire_responses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  linkId: varchar("link_id").notNull().references(() => patientQuestionnaireLinks.id, { onDelete: 'cascade' }),
  
  // Patient identification (for general forms where patient may not exist yet)
  patientFirstName: varchar("patient_first_name"),
  patientLastName: varchar("patient_last_name"),
  patientBirthday: date("patient_birthday"),
  patientEmail: varchar("patient_email"),
  patientPhone: varchar("patient_phone"),
  
  // Medical history - patient's own words
  allergies: jsonb("allergies").$type<string[]>(),
  allergiesNotes: text("allergies_notes"),
  
  // Current medications - patient-provided
  medications: jsonb("medications").$type<Array<{
    name: string;
    dosage?: string;
    frequency?: string;
    reason?: string;
  }>>(),
  medicationsNotes: text("medications_notes"),
  
  // Medical conditions - patient-friendly checkboxes with notes
  conditions: jsonb("conditions").$type<Record<string, {
    checked: boolean;
    notes?: string;
  }>>(),
  
  // Lifestyle factors
  smokingStatus: varchar("smoking_status"), // 'never', 'former', 'current'
  smokingDetails: text("smoking_details"),
  alcoholStatus: varchar("alcohol_status"), // 'never', 'occasional', 'regular', 'daily'
  alcoholDetails: text("alcohol_details"),
  
  // Physical measurements (patient-provided)
  height: varchar("height"),
  weight: varchar("weight"),
  
  // Previous surgeries/anesthesia
  previousSurgeries: text("previous_surgeries"),
  previousAnesthesiaProblems: text("previous_anesthesia_problems"),
  
  // Women's health
  pregnancyStatus: varchar("pregnancy_status"), // 'not_applicable', 'no', 'possible', 'yes'
  breastfeeding: boolean("breastfeeding"),
  womanHealthNotes: text("woman_health_notes"),
  
  // Dental status
  dentalIssues: jsonb("dental_issues").$type<Record<string, boolean>>(),
  dentalNotes: text("dental_notes"),
  
  // PONV & Transfusion history
  ponvTransfusionIssues: jsonb("ponv_transfusion_issues").$type<Record<string, boolean>>(),
  ponvTransfusionNotes: text("ponv_transfusion_notes"),
  
  // Drug use
  drugUse: jsonb("drug_use").$type<Record<string, boolean>>(),
  drugUseDetails: text("drug_use_details"),
  
  // Explicit "none" confirmation flags
  noAllergies: boolean("no_allergies").default(false),
  noMedications: boolean("no_medications").default(false),
  noConditions: boolean("no_conditions").default(false),
  noSmokingAlcohol: boolean("no_smoking_alcohol").default(false),
  noPreviousSurgeries: boolean("no_previous_surgeries").default(false),
  noAnesthesiaProblems: boolean("no_anesthesia_problems").default(false),
  noDentalIssues: boolean("no_dental_issues").default(false),
  noPonvIssues: boolean("no_ponv_issues").default(false),
  noDrugUse: boolean("no_drug_use").default(false),
  
  // Outpatient caregiver contact
  outpatientCaregiverFirstName: varchar("outpatient_caregiver_first_name"),
  outpatientCaregiverLastName: varchar("outpatient_caregiver_last_name"),
  outpatientCaregiverPhone: varchar("outpatient_caregiver_phone"),
  
  // General notes
  additionalNotes: text("additional_notes"),
  questionsForDoctor: text("questions_for_doctor"),
  
  // Consent fields
  smsConsent: boolean("sms_consent").default(false), // Consent to receive SMS notifications
  
  // Form progress tracking
  currentStep: integer("current_step").default(0),
  completedSteps: jsonb("completed_steps").$type<string[]>(),
  
  // Submission metadata
  userAgent: text("user_agent"), // Browser info
  ipAddress: varchar("ip_address"), // For audit
  lastSavedAt: timestamp("last_saved_at"),
  submittedAt: timestamp("submitted_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_questionnaire_responses_link").on(table.linkId),
]);

// Patient Questionnaire Uploads - File attachments from patients
export const patientQuestionnaireUploads = pgTable("patient_questionnaire_uploads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  responseId: varchar("response_id").notNull().references(() => patientQuestionnaireResponses.id, { onDelete: 'cascade' }),
  category: varchar("category", { enum: ["medication_list", "diagnosis", "exam_result", "other"] }).notNull(),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(), // Object storage URL
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"), // bytes
  description: text("description"), // Patient's description of the file
  reviewed: boolean("reviewed").default(false), // Staff has reviewed this upload
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_questionnaire_uploads_response").on(table.responseId),
]);

// Patient Questionnaire Review - Doctor's review/mapping of patient data
export const patientQuestionnaireReviews = pgTable("patient_questionnaire_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  responseId: varchar("response_id").notNull().references(() => patientQuestionnaireResponses.id, { onDelete: 'cascade' }),
  reviewedBy: varchar("reviewed_by").notNull().references(() => users.id),
  
  // Mapping decisions - which patient answers were mapped to which professional fields
  mappings: jsonb("mappings").$type<Record<string, {
    patientValue: string;
    professionalField: string;
    professionalValue: any;
    notes?: string;
  }>>(),
  
  // Overall review notes
  reviewNotes: text("review_notes"),
  
  // Link to pre-op assessment if merged
  preOpAssessmentId: varchar("preop_assessment_id").references(() => preOpAssessments.id),
  
  status: varchar("status", { enum: ["pending", "partial", "completed"] }).default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
}, (table) => [
  index("idx_questionnaire_reviews_response").on(table.responseId),
  index("idx_questionnaire_reviews_assessment").on(table.preOpAssessmentId),
]);

// Insert schemas for questionnaire system
export const insertPatientQuestionnaireLinkSchema = createInsertSchema(patientQuestionnaireLinks).omit({
  id: true,
  createdAt: true,
  submittedAt: true,
  reviewedAt: true,
});

export const insertPatientQuestionnaireResponseSchema = createInsertSchema(patientQuestionnaireResponses).omit({
  id: true,
  createdAt: true,
});

export const insertPatientQuestionnaireUploadSchema = createInsertSchema(patientQuestionnaireUploads).omit({
  id: true,
  createdAt: true,
});

export const insertPatientQuestionnaireReviewSchema = createInsertSchema(patientQuestionnaireReviews).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

// Types for questionnaire system
export type PatientQuestionnaireLink = typeof patientQuestionnaireLinks.$inferSelect;
export type InsertPatientQuestionnaireLink = z.infer<typeof insertPatientQuestionnaireLinkSchema>;
export type PatientQuestionnaireResponse = typeof patientQuestionnaireResponses.$inferSelect;
export type InsertPatientQuestionnaireResponse = z.infer<typeof insertPatientQuestionnaireResponseSchema>;
export type PatientQuestionnaireUpload = typeof patientQuestionnaireUploads.$inferSelect;
export type InsertPatientQuestionnaireUpload = z.infer<typeof insertPatientQuestionnaireUploadSchema>;
export type PatientQuestionnaireReview = typeof patientQuestionnaireReviews.$inferSelect;
export type InsertPatientQuestionnaireReview = z.infer<typeof insertPatientQuestionnaireReviewSchema>;

// Extended illness list type with patient visibility metadata (alias for IllnessListItem)
export type IllnessItemWithPatientMetadata = IllnessListItem;

// Personal To-Do Items (Kanban style)
export const personalTodos = pgTable("personal_todos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  status: varchar("status", { enum: ["todo", "running", "completed"] }).default("todo").notNull(),
  position: integer("position").default(0).notNull(), // For ordering within status column
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_personal_todos_user").on(table.userId),
  index("idx_personal_todos_hospital").on(table.hospitalId),
  index("idx_personal_todos_status").on(table.status),
]);

export const insertPersonalTodoSchema = createInsertSchema(personalTodos).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PersonalTodo = typeof personalTodos.$inferSelect;
export type InsertPersonalTodo = z.infer<typeof insertPersonalTodoSchema>;

// ============================================
// CLINIC APPOINTMENT SCHEDULING
// ============================================

// Clinic Providers - Controls which users appear as bookable providers in the calendar
// When unitId is NULL and hospitalId is set, this is a hospital-level provider (shared across all units without hasOwnCalendar)
export const clinicProviders = pgTable("clinic_providers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").references(() => hospitals.id, { onDelete: 'cascade' }), // Hospital-level providers when unitId is null
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }), // Unit-specific providers when set
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  isBookable: boolean("is_bookable").default(true).notNull(),
  
  // Availability Mode: 
  // - "always_available" (default): Provider is bookable 24/7 except when blocked (surgeries, time-off, absences)
  // - "windows_required": Provider is ONLY bookable during defined availability windows
  availabilityMode: varchar("availability_mode", { 
    enum: ["always_available", "windows_required"] 
  }).default("always_available").notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_clinic_providers_hospital").on(table.hospitalId),
  index("idx_clinic_providers_unit").on(table.unitId),
  index("idx_clinic_providers_user").on(table.userId),
]);

export const insertClinicProviderSchema = createInsertSchema(clinicProviders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClinicProvider = z.infer<typeof insertClinicProviderSchema>;
export type ClinicProvider = typeof clinicProviders.$inferSelect;

// Provider Availability - Weekly schedule patterns
// When unitId is NULL and hospitalId is set, this is hospital-level availability
export const providerAvailability = pgTable("provider_availability", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").references(() => hospitals.id, { onDelete: 'cascade' }), // Hospital-level when unitId is null
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }), // Unit-specific when set
  
  // Day of week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
  dayOfWeek: integer("day_of_week").notNull(),
  
  // Time slots (stored as HH:MM strings for simplicity)
  startTime: varchar("start_time").notNull(), // e.g., "08:00"
  endTime: varchar("end_time").notNull(), // e.g., "17:00"
  
  // Slot configuration
  slotDurationMinutes: integer("slot_duration_minutes").default(30).notNull(), // 30, 60, or 90
  
  // Whether this day is active
  isActive: boolean("is_active").default(true).notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_provider_availability_provider").on(table.providerId),
  index("idx_provider_availability_hospital").on(table.hospitalId),
  index("idx_provider_availability_unit").on(table.unitId),
  index("idx_provider_availability_day").on(table.dayOfWeek),
]);

// Provider Time Off - Manual holidays and blocked dates with optional recurrence
// When unitId is NULL and hospitalId is set, this is hospital-level time off
export const providerTimeOff = pgTable("provider_time_off", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").references(() => hospitals.id, { onDelete: 'cascade' }), // Hospital-level when unitId is null
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }), // Unit-specific when set
  
  // Date range (inclusive) - for non-recurring, this is the actual date
  // For recurring, startDate is the first occurrence
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  
  // Optional time range for partial day blocks (null = full day)
  startTime: varchar("start_time"), // e.g., "14:00"
  endTime: varchar("end_time"), // e.g., "17:00"
  
  reason: varchar("reason"), // holiday, personal, training, etc.
  notes: text("notes"),
  
  // Recurrence settings
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurrencePattern: varchar("recurrence_pattern"), // 'weekly', 'biweekly', 'monthly'
  recurrenceDaysOfWeek: integer("recurrence_days_of_week").array(), // [0,1,2,3,4,5,6] for Sun-Sat
  recurrenceEndDate: date("recurrence_end_date"), // null = indefinite
  recurrenceCount: integer("recurrence_count"), // alternative to end date
  
  // Parent reference for generated instances (null for parent rules)
  parentRuleId: varchar("parent_rule_id"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_provider_time_off_provider").on(table.providerId),
  index("idx_provider_time_off_hospital").on(table.hospitalId),
  index("idx_provider_time_off_dates").on(table.startDate, table.endDate),
  index("idx_provider_time_off_recurring").on(table.isRecurring),
]);

// Provider Availability Windows - Date-specific availability overrides
// Used for:
// 1. On-demand providers who only come on specific days (add windows when available)
// 2. Overriding recurring schedule for specific dates (e.g., working an extra Saturday)
// When unitId is NULL and hospitalId is set, this is hospital-level window
export const providerAvailabilityWindows = pgTable("provider_availability_windows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").references(() => hospitals.id, { onDelete: 'cascade' }), // Hospital-level when unitId is null
  unitId: varchar("unit_id").references(() => units.id, { onDelete: 'cascade' }), // Unit-specific when set
  
  // Specific date for this availability window
  date: date("date").notNull(),
  
  // Time range when provider IS available
  startTime: varchar("start_time").notNull(), // e.g., "10:00"
  endTime: varchar("end_time").notNull(), // e.g., "16:00"
  
  // Slot configuration (inherits from weekly schedule if null)
  slotDurationMinutes: integer("slot_duration_minutes").default(30),
  
  notes: text("notes"),
  
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_provider_avail_windows_provider").on(table.providerId),
  index("idx_provider_avail_windows_hospital").on(table.hospitalId),
  index("idx_provider_avail_windows_unit").on(table.unitId),
  index("idx_provider_avail_windows_date").on(table.date),
]);

// Provider Absences - Synced from Timebutler
export const providerAbsences = pgTable("provider_absences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  // Timebutler sync data
  timebutlerUserId: varchar("timebutler_user_id"), // External ID from Timebutler
  absenceType: varchar("absence_type").notNull(), // vacation, sick, training, etc.
  
  // Date range
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  
  // Half-day indicators
  isHalfDayStart: boolean("is_half_day_start").default(false),
  isHalfDayEnd: boolean("is_half_day_end").default(false),
  
  // Sync metadata
  syncedAt: timestamp("synced_at").defaultNow(),
  externalId: varchar("external_id"), // Original ID from Timebutler for deduplication
  notes: text("notes"), // Original label/summary from Timebutler ICS
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_provider_absences_provider").on(table.providerId),
  index("idx_provider_absences_hospital").on(table.hospitalId),
  index("idx_provider_absences_dates").on(table.startDate, table.endDate),
  unique("unique_external_absence").on(table.hospitalId, table.externalId),
]);

// Clinic Appointments - The main appointments table
export const clinicAppointments = pgTable("clinic_appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  
  // Appointment type
  appointmentType: varchar("appointment_type", { 
    enum: ["external", "internal"] 
  }).default("external").notNull(),
  
  // Who - for external appointments
  patientId: varchar("patient_id").references(() => patients.id), // Optional for internal appointments
  providerId: varchar("provider_id").notNull().references(() => users.id),
  
  // Who - for internal appointments (colleague meetings)
  internalColleagueId: varchar("internal_colleague_id").references(() => users.id),
  internalSubject: varchar("internal_subject"),
  
  // What
  serviceId: varchar("service_id").references(() => clinicServices.id), // Optional - can be general appointment
  
  // When
  appointmentDate: date("appointment_date").notNull(),
  startTime: varchar("start_time").notNull(), // e.g., "09:00"
  endTime: varchar("end_time").notNull(), // e.g., "09:30"
  durationMinutes: integer("duration_minutes").notNull(),
  
  // Status workflow
  status: varchar("status", { 
    enum: ["scheduled", "confirmed", "arrived", "in_progress", "completed", "cancelled", "no_show"] 
  }).default("scheduled").notNull(),
  
  // Actual times (set when appointment starts/completes)
  actualStartTime: timestamp("actual_start_time"),
  actualEndTime: timestamp("actual_end_time"),
  
  // Notes
  notes: text("notes"),
  cancellationReason: text("cancellation_reason"),
  
  // Reminders
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  
  // Cal.com sync tracking
  calcomBookingUid: varchar("calcom_booking_uid"), // Cal.com booking UID for sync
  calcomSyncedAt: timestamp("calcom_synced_at"), // When last synced to Cal.com
  calcomSource: varchar("calcom_source", { enum: ["local", "calcom"] }).default("local"), // Origin: created locally or from Cal.com webhook
  
  // Audit
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_clinic_appointments_hospital").on(table.hospitalId),
  index("idx_clinic_appointments_unit").on(table.unitId),
  index("idx_clinic_appointments_patient").on(table.patientId),
  index("idx_clinic_appointments_provider").on(table.providerId),
  index("idx_clinic_appointments_date").on(table.appointmentDate),
  index("idx_clinic_appointments_status").on(table.status),
  index("idx_clinic_appointments_calcom").on(table.calcomBookingUid),
]);

// Timebutler Sync Configuration - Per hospital settings
export const timebutlerConfig = pgTable("timebutler_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }).unique(),
  
  // API credentials (token stored encrypted or as secret)
  apiToken: varchar("api_token"), // Consider storing in secrets instead
  
  // User mapping - maps Timebutler user emails to local user IDs
  userMapping: jsonb("user_mapping").$type<Record<string, string>>(), // { "timebutler_email": "local_user_id" }
  
  // Sync settings
  isEnabled: boolean("is_enabled").default(false).notNull(),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: varchar("last_sync_status"), // success, failed
  lastSyncMessage: text("last_sync_message"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_timebutler_config_hospital").on(table.hospitalId),
]);

// Insert schemas for appointment scheduling
export const insertProviderAvailabilitySchema = createInsertSchema(providerAvailability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProviderTimeOffSchema = createInsertSchema(providerTimeOff).omit({
  id: true,
  createdAt: true,
});

export const insertProviderAvailabilityWindowSchema = createInsertSchema(providerAvailabilityWindows).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProviderAbsenceSchema = createInsertSchema(providerAbsences).omit({
  id: true,
  createdAt: true,
  syncedAt: true,
});

export const insertClinicAppointmentSchema = createInsertSchema(clinicAppointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertTimebutlerConfigSchema = createInsertSchema(timebutlerConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for appointment scheduling
export type ProviderAvailability = typeof providerAvailability.$inferSelect;
export type InsertProviderAvailability = z.infer<typeof insertProviderAvailabilitySchema>;
export type ProviderTimeOff = typeof providerTimeOff.$inferSelect;
export type InsertProviderTimeOff = z.infer<typeof insertProviderTimeOffSchema>;
export type ProviderAvailabilityWindow = typeof providerAvailabilityWindows.$inferSelect;
export type InsertProviderAvailabilityWindow = z.infer<typeof insertProviderAvailabilityWindowSchema>;
export type ProviderAbsence = typeof providerAbsences.$inferSelect;
export type InsertProviderAbsence = z.infer<typeof insertProviderAbsenceSchema>;
export type ClinicAppointment = typeof clinicAppointments.$inferSelect;
export type InsertClinicAppointment = z.infer<typeof insertClinicAppointmentSchema>;
export type TimebutlerConfig = typeof timebutlerConfig.$inferSelect;
export type InsertTimebutlerConfig = z.infer<typeof insertTimebutlerConfigSchema>;

// Scheduled Jobs - For recurring tasks like auto-sending questionnaires
export const scheduledJobs = pgTable("scheduled_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: varchar("job_type", { 
    enum: ["auto_questionnaire_dispatch", "sync_timebutler_ics", "monthly_billing"] 
  }).notNull(),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  // Scheduling
  scheduledFor: timestamp("scheduled_for").notNull(), // When job should run
  status: varchar("status", { 
    enum: ["pending", "processing", "completed", "failed"] 
  }).default("pending").notNull(),
  
  // Processing info
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  error: text("error"),
  
  // Results
  processedCount: integer("processed_count").default(0),
  successCount: integer("success_count").default(0),
  failedCount: integer("failed_count").default(0),
  results: jsonb("results"), // Detailed results per surgery
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scheduled_jobs_type").on(table.jobType),
  index("idx_scheduled_jobs_hospital").on(table.hospitalId),
  index("idx_scheduled_jobs_status").on(table.status),
  index("idx_scheduled_jobs_scheduled_for").on(table.scheduledFor),
]);

export const insertScheduledJobSchema = createInsertSchema(scheduledJobs).omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
});

export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type InsertScheduledJob = z.infer<typeof insertScheduledJobSchema>;

// Cal.com Integration Configuration - Per hospital settings for RetellAI booking
export const calcomConfig = pgTable("calcom_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }).unique(),
  
  // API credentials
  apiKey: varchar("api_key"), // Cal.com API key
  
  // Webhook secret for verifying incoming webhooks from Cal.com
  webhookSecret: varchar("webhook_secret"),
  
  // ICS feed token for secure calendar feed access
  feedToken: varchar("feed_token"),
  
  // Sync settings
  isEnabled: boolean("is_enabled").default(false),
  syncBusyBlocks: boolean("sync_busy_blocks").default(true), // Push appointments as busy blocks
  syncTimebutlerAbsences: boolean("sync_timebutler_absences").default(true), // Push absences as busy blocks
  
  // Status tracking
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_calcom_config_hospital").on(table.hospitalId),
]);

// Cal.com Provider Mapping - Maps local providers to Cal.com event types
export const calcomProviderMappings = pgTable("calcom_provider_mappings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  providerId: varchar("provider_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Cal.com identifiers
  calcomEventTypeId: varchar("calcom_event_type_id").notNull(), // The event type ID in Cal.com
  calcomUserId: varchar("calcom_user_id"), // Cal.com user ID if provider has their own Cal.com account
  calcomScheduleId: varchar("calcom_schedule_id"), // Optional: specific schedule to use
  
  // Sync tracking
  isEnabled: boolean("is_enabled").default(true),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncError: text("last_sync_error"),
  
  // Mapping for busy blocks (to delete them when appointments change)
  busyBlockMapping: jsonb("busy_block_mapping").$type<Record<string, string>>(), // { "appointmentId": "calcomBookingId" }
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_calcom_provider_mappings_hospital").on(table.hospitalId),
  index("idx_calcom_provider_mappings_provider").on(table.providerId),
  unique("idx_calcom_provider_mappings_unique").on(table.hospitalId, table.providerId),
]);

export const insertCalcomConfigSchema = createInsertSchema(calcomConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCalcomProviderMappingSchema = createInsertSchema(calcomProviderMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CalcomConfig = typeof calcomConfig.$inferSelect;
export type InsertCalcomConfig = z.infer<typeof insertCalcomConfigSchema>;
export type CalcomProviderMapping = typeof calcomProviderMappings.$inferSelect;
export type InsertCalcomProviderMapping = z.infer<typeof insertCalcomProviderMappingSchema>;

// Hospital Vonage SMS Config - Per-hospital Vonage credentials
export const hospitalVonageConfigs = pgTable("hospital_vonage_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }).unique(),
  
  encryptedApiKey: varchar("encrypted_api_key"),
  encryptedApiSecret: varchar("encrypted_api_secret"),
  encryptedFromNumber: varchar("encrypted_from_number"),
  
  isEnabled: boolean("is_enabled").default(true),
  lastTestedAt: timestamp("last_tested_at"),
  lastTestStatus: varchar("last_test_status"), // 'success' | 'failed'
  lastTestError: text("last_test_error"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_hospital_vonage_configs_hospital").on(table.hospitalId),
]);

export const insertHospitalVonageConfigSchema = createInsertSchema(hospitalVonageConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastTestedAt: true,
  lastTestStatus: true,
  lastTestError: true,
});

export type HospitalVonageConfig = typeof hospitalVonageConfigs.$inferSelect;
export type InsertHospitalVonageConfig = z.infer<typeof insertHospitalVonageConfigSchema>;

// Temporary Worker Contracts - For external staff signing employment contracts
export const workerContracts = pgTable("worker_contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  // Worker personal information
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  street: varchar("street").notNull(),
  postalCode: varchar("postal_code").notNull(),
  city: varchar("city").notNull(),
  phone: varchar("phone"),
  email: varchar("email").notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  
  // Bank information
  iban: varchar("iban").notNull(),
  
  // Role/Tariff selection
  role: varchar("role", { 
    enum: ["awr_nurse", "anesthesia_nurse", "anesthesia_doctor"] 
  }).notNull(),
  
  // Status tracking
  status: varchar("status", { 
    enum: ["pending_manager_signature", "signed", "rejected"] 
  }).default("pending_manager_signature").notNull(),
  
  // Worker signature
  workerSignature: text("worker_signature"), // Base64 signature image
  workerSignedAt: timestamp("worker_signed_at"),
  workerSignatureLocation: varchar("worker_signature_location"), // City where worker signed
  
  // Manager signature
  managerSignature: text("manager_signature"), // Base64 signature image
  managerSignedAt: timestamp("manager_signed_at"),
  managerId: varchar("manager_id").references(() => users.id),
  managerName: varchar("manager_name"),
  
  // Archive support
  archivedAt: timestamp("archived_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_worker_contracts_hospital").on(table.hospitalId),
  index("idx_worker_contracts_status").on(table.status),
]);

export const insertWorkerContractSchema = createInsertSchema(workerContracts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  managerSignature: true,
  managerSignedAt: true,
  managerId: true,
  managerName: true,
  workerSignedAt: true,
}).extend({
  workerSignature: z.string().min(1, "Worker signature is required"),
  workerSignatureLocation: z.string().min(1, "Signature location is required"),
});

export type WorkerContract = typeof workerContracts.$inferSelect;
export type InsertWorkerContract = z.infer<typeof insertWorkerContractSchema>;

// External Worklog Links - Personalized links for external workers to submit time entries
export const externalWorklogLinks = pgTable("external_worklog_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  unitId: varchar("unit_id").notNull().references(() => units.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  email: varchar("email").notNull(),
  token: varchar("token").notNull().unique(),
  
  // Personalien (Personal Information)
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profession: varchar("profession"),
  address: varchar("address"),
  city: varchar("city"),
  zip: varchar("zip"),
  dateOfBirth: varchar("date_of_birth"),
  maritalStatus: varchar("marital_status", {
    enum: ["single", "married", "divorced", "widowed", "separated", "registered_partnership"]
  }),
  nationality: varchar("nationality"),
  religion: varchar("religion", {
    enum: ["none", "roman_catholic", "protestant", "other"]
  }),
  mobile: varchar("mobile"),
  ahvNumber: varchar("ahv_number"),
  
  // Kinderzulagen (Child Benefits)
  hasChildBenefits: boolean("has_child_benefits"),
  numberOfChildren: integer("number_of_children"),
  childBenefitsRecipient: varchar("child_benefits_recipient"),
  childBenefitsRegistration: varchar("child_benefits_registration"),
  
  // Aufenthaltsbewilligung (Residence Permit)
  hasResidencePermit: boolean("has_residence_permit"),
  residencePermitType: varchar("residence_permit_type", {
    enum: ["L", "B", "C", "G"]
  }),
  residencePermitValidUntil: varchar("residence_permit_valid_until"),
  residencePermitFrontImage: varchar("residence_permit_front_image"),
  residencePermitBackImage: varchar("residence_permit_back_image"),
  
  // Bankangaben (Bank Details) - excluding clearing number per user request
  bankName: varchar("bank_name"),
  bankAddress: varchar("bank_address"),
  bankAccount: varchar("bank_account"),
  
  // Mobilität (Mobility)
  hasOwnVehicle: boolean("has_own_vehicle"),
  
  isActive: boolean("is_active").default(true).notNull(),
  lastAccessedAt: timestamp("last_accessed_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_external_worklog_links_unit").on(table.unitId),
  index("idx_external_worklog_links_hospital").on(table.hospitalId),
  index("idx_external_worklog_links_email").on(table.email),
  index("idx_external_worklog_links_token").on(table.token),
  unique("idx_external_worklog_links_unit_email").on(table.unitId, table.email),
]);

export const insertExternalWorklogLinkSchema = createInsertSchema(externalWorklogLinks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAccessedAt: true,
});

export type ExternalWorklogLink = typeof externalWorklogLinks.$inferSelect;
export type InsertExternalWorklogLink = z.infer<typeof insertExternalWorklogLinkSchema>;

// External Worklog Entries - Time entries submitted by external workers
export const externalWorklogEntries = pgTable("external_worklog_entries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  linkId: varchar("link_id").notNull().references(() => externalWorklogLinks.id, { onDelete: 'cascade' }),
  unitId: varchar("unit_id").notNull().references(() => units.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  email: varchar("email").notNull(),
  firstName: varchar("first_name").notNull(),
  lastName: varchar("last_name").notNull(),
  
  workDate: date("work_date").notNull(),
  timeStart: varchar("time_start").notNull(),
  timeEnd: varchar("time_end").notNull(),
  pauseMinutes: integer("pause_minutes").default(0).notNull(),
  activityType: varchar("activity_type", {
    enum: ["anesthesia_nurse", "op_nurse", "springer_nurse", "anesthesia_doctor", "other"]
  }).notNull(),
  
  workerSignature: text("worker_signature").notNull(),
  workerSignedAt: timestamp("worker_signed_at").defaultNow(),
  
  status: varchar("status", { 
    enum: ["pending", "countersigned", "rejected"] 
  }).default("pending").notNull(),
  
  countersignature: text("countersignature"),
  countersignedAt: timestamp("countersigned_at"),
  countersignedBy: varchar("countersigned_by").references(() => users.id),
  countersignerName: varchar("countersigner_name"),
  rejectionReason: text("rejection_reason"),
  
  notes: text("notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_external_worklog_entries_link").on(table.linkId),
  index("idx_external_worklog_entries_unit").on(table.unitId),
  index("idx_external_worklog_entries_hospital").on(table.hospitalId),
  index("idx_external_worklog_entries_email").on(table.email),
  index("idx_external_worklog_entries_status").on(table.status),
  index("idx_external_worklog_entries_work_date").on(table.workDate),
]);

export const insertExternalWorklogEntrySchema = createInsertSchema(externalWorklogEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  workerSignedAt: true,
  status: true,
  countersignature: true,
  countersignedAt: true,
  countersignedBy: true,
  countersignerName: true,
  rejectionReason: true,
});

export type ExternalWorklogEntry = typeof externalWorklogEntries.$inferSelect;
export type InsertExternalWorklogEntry = z.infer<typeof insertExternalWorklogEntrySchema>;

// Legal document types for terms acceptances
export const legalDocumentTypes = ["terms", "agb", "privacy", "avv"] as const;
export type LegalDocumentType = typeof legalDocumentTypes[number];

// Terms of Use Acceptances - Track signed terms per hospital
export const termsAcceptances = pgTable("terms_acceptances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  version: varchar("version").notNull().default("1.0"),
  documentType: varchar("document_type").notNull().default("terms"), // terms, agb, privacy, avv
  
  signedByUserId: varchar("signed_by_user_id").notNull().references(() => users.id),
  signedByName: varchar("signed_by_name").notNull(),
  signedByEmail: varchar("signed_by_email").notNull(),
  
  signatureImage: text("signature_image").notNull(),
  signedAt: timestamp("signed_at").defaultNow().notNull(),
  
  pdfUrl: varchar("pdf_url"),
  emailSentAt: timestamp("email_sent_at"),
  
  countersignedAt: timestamp("countersigned_at"),
  countersignedByName: varchar("countersigned_by_name"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_terms_acceptances_hospital").on(table.hospitalId),
  index("idx_terms_acceptances_version").on(table.version),
  index("idx_terms_acceptances_document_type").on(table.documentType),
  unique("idx_terms_acceptances_hospital_version_doctype").on(table.hospitalId, table.version, table.documentType),
]);

export const insertTermsAcceptanceSchema = createInsertSchema(termsAcceptances).omit({
  id: true,
  createdAt: true,
  signedAt: true,
  emailSentAt: true,
  countersignedAt: true,
  countersignedByName: true,
  pdfUrl: true,
});

export type TermsAcceptance = typeof termsAcceptances.$inferSelect;
export type InsertTermsAcceptance = z.infer<typeof insertTermsAcceptanceSchema>;

// Billing Invoices - Track monthly billing invoices per hospital
export const billingInvoices = pgTable("billing_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  // Billing period
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  
  // Usage counts
  recordCount: integer("record_count").notNull().default(0),
  
  // Pricing breakdown (stored for historical accuracy)
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  questionnairePrice: decimal("questionnaire_price", { precision: 10, scale: 2 }).default("0"),
  dispocuraPrice: decimal("dispocura_price", { precision: 10, scale: 2 }).default("0"),
  retellPrice: decimal("retell_price", { precision: 10, scale: 2 }).default("0"),
  monitorPrice: decimal("monitor_price", { precision: 10, scale: 2 }).default("0"),
  surgeryPrice: decimal("surgery_price", { precision: 10, scale: 2 }).default("0"), // Surgery module per-record
  worktimePrice: decimal("worktime_price", { precision: 10, scale: 2 }).default("0"), // Work time logs flat monthly
  logisticsPrice: decimal("logistics_price", { precision: 10, scale: 2 }).default("0"), // Logistics flat monthly
  clinicPrice: decimal("clinic_price", { precision: 10, scale: 2 }).default("0"), // Clinic flat monthly
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency").notNull().default("chf"),
  
  // Stripe invoice details
  stripeInvoiceId: varchar("stripe_invoice_id"),
  stripeInvoiceUrl: varchar("stripe_invoice_url"),
  stripePaymentIntentId: varchar("stripe_payment_intent_id"),
  
  // Status
  status: varchar("status", {
    enum: ["draft", "pending", "paid", "failed", "void"]
  }).notNull().default("draft"),
  
  paidAt: timestamp("paid_at"),
  failedAt: timestamp("failed_at"),
  failureReason: text("failure_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_billing_invoices_hospital").on(table.hospitalId),
  index("idx_billing_invoices_period").on(table.periodStart, table.periodEnd),
  index("idx_billing_invoices_status").on(table.status),
  index("idx_billing_invoices_stripe").on(table.stripeInvoiceId),
]);

export const insertBillingInvoiceSchema = createInsertSchema(billingInvoices).omit({
  id: true,
  createdAt: true,
  paidAt: true,
  failedAt: true,
});

export type BillingInvoice = typeof billingInvoices.$inferSelect;
export type InsertBillingInvoice = z.infer<typeof insertBillingInvoiceSchema>;

// ========== EXTERNAL SURGERY REQUESTS ==========
// Requests from external doctors to reserve surgery slots

export const externalSurgeryRequests = pgTable("external_surgery_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  
  // Surgeon (external doctor) info
  surgeonFirstName: varchar("surgeon_first_name").notNull(),
  surgeonLastName: varchar("surgeon_last_name").notNull(),
  surgeonEmail: varchar("surgeon_email").notNull(),
  surgeonPhone: varchar("surgeon_phone").notNull(),
  
  // Surgery details
  surgeryName: varchar("surgery_name").notNull(),
  surgeryDurationMinutes: integer("surgery_duration_minutes").notNull(),
  withAnesthesia: boolean("with_anesthesia").default(true).notNull(),
  surgeryNotes: text("surgery_notes"),
  wishedDate: date("wished_date").notNull(),
  
  // Patient positioning (preference from external surgeon)
  patientPosition: varchar("patient_position", { enum: [
    "supine", "trendelenburg", "reverse_trendelenburg", "lithotomy",
    "lateral_decubitus", "prone", "jackknife", "sitting", "kidney", "lloyd_davies"
  ] }),
  leftArmPosition: varchar("left_arm_position", { enum: ["ausgelagert", "angelagert"] }),
  rightArmPosition: varchar("right_arm_position", { enum: ["ausgelagert", "angelagert"] }),
  
  // Patient info
  patientFirstName: varchar("patient_first_name").notNull(),
  patientLastName: varchar("patient_last_name").notNull(),
  patientBirthday: date("patient_birthday").notNull(),
  patientEmail: varchar("patient_email"),
  patientPhone: varchar("patient_phone").notNull(),
  
  // Status and linking
  status: varchar("status", { enum: ["pending", "scheduled", "declined"] }).default("pending").notNull(),
  surgeryId: varchar("surgery_id").references(() => surgeries.id), // Linked surgery once scheduled
  patientId: varchar("patient_id").references(() => patients.id), // Linked patient once created
  
  // Notification tracking
  confirmationEmailSent: boolean("confirmation_email_sent").default(false),
  confirmationSmsSent: boolean("confirmation_sms_sent").default(false),
  
  // Admin notes
  internalNotes: text("internal_notes"),
  declineReason: text("decline_reason"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  scheduledAt: timestamp("scheduled_at"),
  scheduledBy: varchar("scheduled_by").references(() => users.id),
}, (table) => [
  index("idx_external_surgery_requests_hospital").on(table.hospitalId),
  index("idx_external_surgery_requests_status").on(table.status),
  index("idx_external_surgery_requests_wished_date").on(table.wishedDate),
]);

export const insertExternalSurgeryRequestSchema = createInsertSchema(externalSurgeryRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  scheduledAt: true,
  scheduledBy: true,
  surgeryId: true,
  patientId: true,
  confirmationEmailSent: true,
  confirmationSmsSent: true,
});

export type ExternalSurgeryRequest = typeof externalSurgeryRequests.$inferSelect;
export type InsertExternalSurgeryRequest = z.infer<typeof insertExternalSurgeryRequestSchema>;

// External Surgery Request Documents - uploaded by external doctors
export const externalSurgeryRequestDocuments = pgTable("external_surgery_request_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => externalSurgeryRequests.id, { onDelete: 'cascade' }),
  fileName: varchar("file_name").notNull(),
  fileUrl: varchar("file_url").notNull(),
  mimeType: varchar("mime_type"),
  fileSize: integer("file_size"),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_external_surgery_docs_request").on(table.requestId),
]);

export const insertExternalSurgeryRequestDocumentSchema = createInsertSchema(externalSurgeryRequestDocuments).omit({
  id: true,
  createdAt: true,
});

export type ExternalSurgeryRequestDocument = typeof externalSurgeryRequestDocuments.$inferSelect;
export type InsertExternalSurgeryRequestDocument = z.infer<typeof insertExternalSurgeryRequestDocumentSchema>;

// Patient Messages - custom messages sent to patients via SMS/email
// messageType: 'manual' = user-sent, 'auto_questionnaire' = 14-day questionnaire, 'auto_reminder' = 24-hour pre-surgery reminder
export const patientMessages = pgTable("patient_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  sentBy: varchar("sent_by").references(() => users.id), // nullable for automatic messages
  channel: varchar("channel", { length: 10 }).notNull(), // 'sms' or 'email'
  recipient: varchar("recipient").notNull(), // phone number or email address
  message: text("message").notNull(),
  status: varchar("status", { length: 20 }).default("sent"), // 'sent', 'delivered', 'failed'
  isAutomatic: boolean("is_automatic").default(false), // true for system-generated messages
  messageType: varchar("message_type", { length: 30 }).default("manual"), // 'manual', 'auto_questionnaire', 'auto_reminder'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_patient_messages_hospital").on(table.hospitalId),
  index("idx_patient_messages_patient").on(table.patientId),
]);

export const insertPatientMessageSchema = createInsertSchema(patientMessages).omit({
  id: true,
  createdAt: true,
});

export type PatientMessage = typeof patientMessages.$inferSelect;
export type InsertPatientMessage = z.infer<typeof insertPatientMessageSchema>;

// ========== ANESTHESIA SETS ==========
// Predefined sets of anesthesia options (installations, techniques) for quick entry

export const anesthesiaSets = pgTable("anesthesia_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  name: varchar("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_sets_hospital").on(table.hospitalId),
]);

// Items within an anesthesia set (installations, airway, technique, etc.)
export const anesthesiaSetItems = pgTable("anesthesia_set_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => anesthesiaSets.id, { onDelete: 'cascade' }),
  
  // Type of item in the set
  itemType: varchar("item_type", { 
    enum: ["peripheral_iv", "arterial_line", "central_line", "bladder_catheter", "ett", "lma", "mask", "general", "sedation", "regional_spinal", "regional_epidural", "regional_peripheral"] 
  }).notNull(),
  
  // Configuration stored as JSONB - varies by itemType
  config: jsonb("config").$type<{
    // For installations (peripheral, arterial, central, bladder)
    category?: "peripheral" | "arterial" | "central" | "bladder";
    location?: string;
    gauge?: string;
    lumens?: number;
    technique?: string;
    bladderType?: string;
    bladderSize?: string;
    
    // For airway
    airwayDevice?: string;
    size?: string;
    depth?: number;
    cuffPressure?: number;
    laryngoscopeType?: string;
    laryngoscopeBlade?: string;
    
    // For technique
    technique?: "general" | "sedation" | "regional_spinal" | "regional_epidural" | "regional_peripheral";
    approach?: "tiva" | "balanced";
    spinalLocation?: string;
    epiduralLocation?: string;
    blockTechnique?: string;
    blockSide?: "left" | "right" | "bilateral";
  }>().notNull(),
  
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_set_items_set").on(table.setId),
]);

export const insertAnesthesiaSetSchema = createInsertSchema(anesthesiaSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAnesthesiaSetItemSchema = createInsertSchema(anesthesiaSetItems).omit({
  id: true,
  createdAt: true,
});

export type AnesthesiaSet = typeof anesthesiaSets.$inferSelect;
export type InsertAnesthesiaSet = z.infer<typeof insertAnesthesiaSetSchema>;
export type AnesthesiaSetItem = typeof anesthesiaSetItems.$inferSelect;
export type InsertAnesthesiaSetItem = z.infer<typeof insertAnesthesiaSetItemSchema>;

// Medications within an anesthesia set
export const anesthesiaSetMedications = pgTable("anesthesia_set_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => anesthesiaSets.id, { onDelete: 'cascade' }),
  medicationConfigId: varchar("medication_config_id").notNull().references(() => medicationConfigs.id, { onDelete: 'cascade' }),
  customDose: varchar("custom_dose"), // Optional: override the medication's default dose
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_set_medications_set").on(table.setId),
  index("idx_anesthesia_set_medications_config").on(table.medicationConfigId),
  unique("uq_anesthesia_set_medication").on(table.setId, table.medicationConfigId),
]);

// Inventory items within an anesthesia set
export const anesthesiaSetInventory = pgTable("anesthesia_set_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => anesthesiaSets.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_set_inventory_set").on(table.setId),
  index("idx_anesthesia_set_inventory_item").on(table.itemId),
  unique("uq_anesthesia_set_inventory").on(table.setId, table.itemId),
]);

export const insertAnesthesiaSetMedicationSchema = createInsertSchema(anesthesiaSetMedications).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaSetInventorySchema = createInsertSchema(anesthesiaSetInventory).omit({
  id: true,
  createdAt: true,
});

export type AnesthesiaSetMedication = typeof anesthesiaSetMedications.$inferSelect;
export type InsertAnesthesiaSetMedication = z.infer<typeof insertAnesthesiaSetMedicationSchema>;
export type AnesthesiaSetInventoryItem = typeof anesthesiaSetInventory.$inferSelect;
export type InsertAnesthesiaSetInventoryItem = z.infer<typeof insertAnesthesiaSetInventorySchema>;

// ========== INVENTORY SETS ==========
// Predefined sets of inventory items with quantities for quick entry

export const inventorySets = pgTable("inventory_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  unitId: varchar("unit_id").references(() => units.id), // Optional: scope to specific unit
  name: varchar("name").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_inventory_sets_hospital").on(table.hospitalId),
  index("idx_inventory_sets_unit").on(table.unitId),
]);

// Items within an inventory set with quantities
export const inventorySetItems = pgTable("inventory_set_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => inventorySets.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_inventory_set_items_set").on(table.setId),
  index("idx_inventory_set_items_item").on(table.itemId),
]);

export const insertInventorySetSchema = createInsertSchema(inventorySets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertInventorySetItemSchema = createInsertSchema(inventorySetItems).omit({
  id: true,
  createdAt: true,
});

export type InventorySet = typeof inventorySets.$inferSelect;
export type InsertInventorySet = z.infer<typeof insertInventorySetSchema>;
export type InventorySetItem = typeof inventorySetItems.$inferSelect;
export type InsertInventorySetItem = z.infer<typeof insertInventorySetItemSchema>;

// ========== SURGERY SETS ==========
// Predefined sets of intraoperative data + inventory items for quick surgery documentation

export const surgerySets = pgTable("surgery_sets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id, { onDelete: 'cascade' }),
  name: varchar("name").notNull(),
  description: text("description"),
  intraOpData: jsonb("intra_op_data").$type<Record<string, any>>(),
  sortOrder: integer("sort_order").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_surgery_sets_hospital").on(table.hospitalId),
]);

export const surgerySetInventory = pgTable("surgery_set_inventory", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  setId: varchar("set_id").notNull().references(() => surgerySets.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_surgery_set_inventory_set").on(table.setId),
  index("idx_surgery_set_inventory_item").on(table.itemId),
  unique("uq_surgery_set_inventory").on(table.setId, table.itemId),
]);

export const insertSurgerySetSchema = createInsertSchema(surgerySets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSurgerySetInventorySchema = createInsertSchema(surgerySetInventory).omit({
  id: true,
  createdAt: true,
});

export type SurgerySet = typeof surgerySets.$inferSelect;
export type InsertSurgerySet = z.infer<typeof insertSurgerySetSchema>;
export type SurgerySetInventoryItem = typeof surgerySetInventory.$inferSelect;
export type InsertSurgerySetInventoryItem = z.infer<typeof insertSurgerySetInventorySchema>;

// ========== HIN MEDIUPDATE ARTICLES ==========
// Swiss medication/product database from HIN MediUpdate XML (free public data)
// Used as fallback when Dispocura/Galexis integration is not available

export const hinArticles = pgTable("hin_articles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pharmacode: varchar("pharmacode"), // Swiss pharmacy code (7 digits)
  gtin: varchar("gtin"), // EAN-13 barcode
  swissmedicNo: varchar("swissmedic_no"), // Swissmedic authorization number
  productNo: varchar("product_no"), // Product group number
  descriptionDe: text("description_de").notNull(), // German product name
  descriptionFr: text("description_fr"), // French product name
  pexf: decimal("pexf", { precision: 10, scale: 2 }), // Ex-factory price (Fabrikabgabepreis)
  ppub: decimal("ppub", { precision: 10, scale: 2 }), // Public price (Publikumspreis)
  priceValidFrom: date("price_valid_from"), // Price validity start date
  smcat: varchar("smcat"), // Swissmedic category (A, B, C, D, E)
  saleCode: varchar("sale_code"), // Sale status (A=active, I=inactive)
  vat: varchar("vat"), // VAT category
  isRefdata: boolean("is_refdata").default(false), // Is in Refdata (Swiss article database)
  companyGln: varchar("company_gln"), // Company GLN (Global Location Number)
  lastUpdated: timestamp("last_updated").defaultNow(),
}, (table) => [
  index("idx_hin_articles_pharmacode").on(table.pharmacode),
  index("idx_hin_articles_gtin").on(table.gtin),
  index("idx_hin_articles_swissmedic").on(table.swissmedicNo),
]);

// Track HIN sync status
export const hinSyncStatus = pgTable("hin_sync_status", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  lastSyncAt: timestamp("last_sync_at"),
  articlesCount: integer("articles_count").default(0),
  syncDurationMs: integer("sync_duration_ms"),
  status: varchar("status", { enum: ["idle", "syncing", "success", "error"] }).default("idle"),
  errorMessage: text("error_message"),
  processedItems: integer("processed_items").default(0),
  totalItems: integer("total_items").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertHinArticleSchema = createInsertSchema(hinArticles).omit({
  id: true,
  lastUpdated: true,
});

export type HinArticle = typeof hinArticles.$inferSelect;
export type InsertHinArticle = z.infer<typeof insertHinArticleSchema>;
export type HinSyncStatus = typeof hinSyncStatus.$inferSelect;

// Inventory snapshots for historical tracking
export const inventorySnapshots = pgTable("inventory_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  unitId: varchar("unit_id").notNull().references(() => units.id),
  snapshotDate: date("snapshot_date").notNull(),
  totalValue: decimal("total_value", { precision: 14, scale: 2 }).notNull(),
  itemCount: integer("item_count").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_inventory_snapshots_hospital_date").on(table.hospitalId, table.snapshotDate),
  index("idx_inventory_snapshots_unit_date").on(table.unitId, table.snapshotDate),
]);

export const insertInventorySnapshotSchema = createInsertSchema(inventorySnapshots).omit({
  id: true,
  createdAt: true,
});

export type InventorySnapshot = typeof inventorySnapshots.$inferSelect;
export type InsertInventorySnapshot = z.infer<typeof insertInventorySnapshotSchema>;

// Item HIN Matches - Track HIN database matching attempts for inventory items
export const itemHinMatches = pgTable("item_hin_matches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  itemId: varchar("item_id").notNull().references(() => items.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  
  // Match status: pending (never tried), matched (exact match), to_verify (fuzzy match needs confirmation), unmatched (no match found), rejected (user rejected fuzzy match)
  matchStatus: varchar("match_status", { enum: ["pending", "matched", "to_verify", "unmatched", "rejected"] }).default("pending"),
  
  // How the match was made
  matchMethod: varchar("match_method"), // pharmacode, gtin, pharmacode_as_gtin, gtin_as_pharmacode, fuzzy_name
  matchConfidence: decimal("match_confidence", { precision: 3, scale: 2 }), // 0.00-1.00 for fuzzy matches
  matchReason: text("match_reason"), // Human-readable explanation
  
  // Matched HIN article data (stored to allow review before applying)
  hinArticleId: varchar("hin_article_id"),
  hinPharmacode: varchar("hin_pharmacode"),
  hinGtin: varchar("hin_gtin"),
  hinDescriptionDe: text("hin_description_de"),
  hinPexf: decimal("hin_pexf", { precision: 10, scale: 2 }), // Ex-factory price
  hinPpub: decimal("hin_ppub", { precision: 10, scale: 2 }), // Public price
  hinSmcat: varchar("hin_smcat"), // Swissmedic category
  hinSwissmedicNo: varchar("hin_swissmedic_no"),
  
  // Original item data (for reference)
  originalPharmacode: varchar("original_pharmacode"),
  originalGtin: varchar("original_gtin"),
  itemName: varchar("item_name"), // Snapshot of item name at match time
  
  // Tracking
  lastMatchAttempt: timestamp("last_match_attempt").defaultNow(),
  verifiedAt: timestamp("verified_at"), // When user approved/rejected
  verifiedBy: varchar("verified_by").references(() => users.id),
  appliedAt: timestamp("applied_at"), // When HIN data was applied to item
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_item_hin_matches_item").on(table.itemId),
  index("idx_item_hin_matches_hospital").on(table.hospitalId),
  index("idx_item_hin_matches_status").on(table.matchStatus),
]);

export const insertItemHinMatchSchema = createInsertSchema(itemHinMatches).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ItemHinMatch = typeof itemHinMatches.$inferSelect;
export type InsertItemHinMatch = z.infer<typeof insertItemHinMatchSchema>;

// CHOP Procedures - Swiss Classification of Surgical Interventions (Schweizerische Operationsklassifikation)
// Reference: https://www.bfs.admin.ch - CHOP 2026
export const chopProcedures = pgTable("chop_procedures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: varchar("code").notNull().unique(), // CHOP code e.g., "Z00.66.21"
  descriptionDe: text("description_de").notNull(), // German description
  descriptionFr: text("description_fr"), // French description (optional, for future)
  chapter: varchar("chapter"), // Main chapter/category
  indentLevel: integer("indent_level"), // Hierarchy level (3-6 typically)
  isCodeable: boolean("is_codeable").default(true).notNull(), // Whether this is a billable procedure
  laterality: varchar("laterality"), // "Lateral" if applies to left/right
  version: varchar("version").default("2026").notNull(), // CHOP version
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_chop_procedures_code").on(table.code),
  index("idx_chop_procedures_description").using("gin", sql`to_tsvector('german', ${table.descriptionDe})`),
]);

export const insertChopProcedureSchema = createInsertSchema(chopProcedures).omit({
  id: true,
  createdAt: true,
});

export type ChopProcedure = typeof chopProcedures.$inferSelect;
export type InsertChopProcedure = z.infer<typeof insertChopProcedureSchema>;

// ========== USER MESSAGE TEMPLATES ==========
// Reusable message snippets created per user for patient communication

export const userMessageTemplates = pgTable("user_message_templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 100 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_message_templates_user").on(table.userId),
]);

export const insertUserMessageTemplateSchema = createInsertSchema(userMessageTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type UserMessageTemplate = typeof userMessageTemplates.$inferSelect;
export type InsertUserMessageTemplate = z.infer<typeof insertUserMessageTemplateSchema>;

// ========== PATIENT DISCHARGE MEDICATIONS ==========
// Medication slots given to patients at discharge (day-surgery)

export const patientDischargeMedications = pgTable("patient_discharge_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  patientId: varchar("patient_id").notNull().references(() => patients.id, { onDelete: 'cascade' }),
  hospitalId: varchar("hospital_id").notNull().references(() => hospitals.id),
  doctorId: varchar("doctor_id").references(() => users.id),
  notes: text("notes"),
  signature: text("signature"),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_discharge_meds_patient").on(table.patientId),
  index("idx_discharge_meds_hospital").on(table.hospitalId),
  index("idx_discharge_meds_doctor").on(table.doctorId),
]);

export const patientDischargeMedicationItems = pgTable("patient_discharge_medication_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dischargeMedicationId: varchar("discharge_medication_id").notNull().references(() => patientDischargeMedications.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id),
  quantity: integer("quantity").notNull().default(1),
  unitType: varchar("unit_type").notNull().default("packs"),
  administrationRoute: varchar("administration_route"),
  frequency: varchar("frequency"),
  notes: text("notes"),
  endPrice: decimal("end_price", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_discharge_med_items_slot").on(table.dischargeMedicationId),
  index("idx_discharge_med_items_item").on(table.itemId),
]);

export const insertPatientDischargeMedicationSchema = createInsertSchema(patientDischargeMedications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPatientDischargeMedicationItemSchema = createInsertSchema(patientDischargeMedicationItems).omit({
  id: true,
  createdAt: true,
});

export type PatientDischargeMedication = typeof patientDischargeMedications.$inferSelect;
export type InsertPatientDischargeMedication = z.infer<typeof insertPatientDischargeMedicationSchema>;
export type PatientDischargeMedicationItem = typeof patientDischargeMedicationItems.$inferSelect;
export type InsertPatientDischargeMedicationItem = z.infer<typeof insertPatientDischargeMedicationItemSchema>;
