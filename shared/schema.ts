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
  type: varchar("type"), // OR, ICU, Storage, etc.
  parentId: varchar("parent_id"),
  isAnesthesiaModule: boolean("is_anesthesia_module").default(false),
  isSurgeryModule: boolean("is_surgery_module").default(false),
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
  
  // Customizable allergy list
  allergyList: text("allergy_list").array(),
  
  // Customizable medication lists (JSONB for flexibility)
  medicationLists: jsonb("medication_lists").$type<{
    anticoagulation?: string[];
    general?: string[];
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
    woman?: Array<{ id: string; label: string }>;
    noxen?: Array<{ id: string; label: string }>;
    children?: Array<{ id: string; label: string }>;
  }>(),
  
  // Customizable WHO checklist items (JSONB for flexibility)
  checklistItems: jsonb("checklist_items").$type<{
    signIn?: string[];
    timeOut?: string[];
    signOut?: string[];
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
  allergyNotes: text("allergy_notes"),
  medicalNotes: text("medical_notes"),
  
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
  surgeon: varchar("surgeon"),
  
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
  
  // WHO Checklists (stored as JSONB for flexibility)
  signInChecklist: jsonb("sign_in_checklist").$type<Record<string, boolean>>(),
  timeOutChecklist: jsonb("time_out_checklist").$type<Record<string, boolean>>(),
  signOutChecklist: jsonb("sign_out_checklist").$type<Record<string, boolean>>(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_records_surgery").on(table.surgeryId),
  index("idx_anesthesia_records_provider").on(table.providerId),
  index("idx_anesthesia_records_status").on(table.caseStatus),
]);

// Pre-Op Assessments
export const preOpAssessments = pgTable("preop_assessments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  surgeryId: varchar("surgery_id").notNull().references(() => surgeries.id).unique(), // One-to-one with surgery
  
  // Basic vitals (height/weight now in header, but can store here for history)
  height: varchar("height"),
  weight: varchar("weight"),
  
  // Allergies & CAVE (also in header, but stored for record)
  allergies: text("allergies").array(),
  allergiesOther: text("allergies_other"),
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
  
  // Approval
  surgicalApproval: text("surgical_approval"),
  
  // Assessment metadata
  assessmentDate: varchar("assessment_date"),
  doctorName: varchar("doctor_name"),
  doctorSignature: text("doctor_signature"),
  
  // Status tracking: 'draft' (partially filled), 'completed' (signed and finalized)
  status: varchar("status").default("draft"), // draft | completed
  
  // Informed Consent
  consentGiven: boolean("consent_given").default(false),
  consentText: text("consent_text"),
  patientSignature: text("patient_signature"),
  consentDate: varchar("consent_date"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_preop_assessments_surgery").on(table.surgeryId),
]);

// Vitals Snapshots (Time-series data stored as JSONB for efficiency)
export const vitalsSnapshots = pgTable("vitals_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  timestamp: timestamp("timestamp").notNull(),
  
  // All vitals stored as JSONB for flexibility and efficiency
  data: jsonb("data").$type<{
    hr?: number;
    sysBP?: number;
    diaBP?: number;
    meanBP?: number;
    spo2?: number;
    temp?: number;
    etco2?: number;
    pip?: number;
    peep?: number;
    tidalVolume?: number;
    respiratoryRate?: number;
    minuteVolume?: number;
    fio2?: number;
  }>().notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_vitals_snapshots_record").on(table.anesthesiaRecordId),
  index("idx_vitals_snapshots_timestamp").on(table.timestamp),
]);

// Anesthesia Medications (Boluses and Infusions) - Links to inventory
export const anesthesiaMedications = pgTable("anesthesia_medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id), // Link to inventory
  
  timestamp: timestamp("timestamp").notNull(),
  type: varchar("type", { 
    enum: ["bolus", "infusion_start", "infusion_stop", "rate_change"] 
  }).notNull(),
  
  // Dosing
  dose: varchar("dose"), // For boluses
  unit: varchar("unit"), // mg, ml, μg, etc.
  route: varchar("route"), // i.v., s.c., p.o., spinal
  
  // Rate (for infusions)
  rate: varchar("rate"), // e.g., "5 ml/hr", "0.1 μg/kg/min"
  endTimestamp: timestamp("end_timestamp"), // When infusion stopped
  
  // User tracking
  administeredBy: varchar("administered_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_anesthesia_medications_record").on(table.anesthesiaRecordId),
  index("idx_anesthesia_medications_item").on(table.itemId),
  index("idx_anesthesia_medications_timestamp").on(table.timestamp),
  index("idx_anesthesia_medications_type").on(table.type),
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

// Inventory Usage (Auto-computed from medication records)
export const inventoryUsage = pgTable("inventory_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  anesthesiaRecordId: varchar("anesthesia_record_id").notNull().references(() => anesthesiaRecords.id, { onDelete: 'cascade' }),
  itemId: varchar("item_id").notNull().references(() => items.id),
  
  quantityUsed: integer("quantity_used").notNull(),
  autoComputed: boolean("auto_computed").default(true), // True if calculated from medication records
  manualOverride: boolean("manual_override").default(false), // True if manually adjusted
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_inventory_usage_record").on(table.anesthesiaRecordId),
  index("idx_inventory_usage_item").on(table.itemId),
]);

// Audit Trail (Immutable log of all changes for compliance)
export const auditTrail = pgTable("audit_trail", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  recordType: varchar("record_type").notNull(), // anesthesia_record, vitals_snapshot, medication, etc.
  recordId: varchar("record_id").notNull(), // ID of the record being changed
  
  action: varchar("action", { enum: ["create", "update", "delete", "amend"] }).notNull(),
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

export const insertPreOpAssessmentSchema = createInsertSchema(preOpAssessments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertVitalsSnapshotSchema = createInsertSchema(vitalsSnapshots).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaMedicationSchema = createInsertSchema(anesthesiaMedications).omit({
  id: true,
  createdAt: true,
});

export const insertAnesthesiaEventSchema = createInsertSchema(anesthesiaEvents).omit({
  id: true,
  createdAt: true,
});

export const insertInventoryUsageSchema = createInsertSchema(inventoryUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
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
export type VitalsSnapshot = typeof vitalsSnapshots.$inferSelect;
export type InsertVitalsSnapshot = z.infer<typeof insertVitalsSnapshotSchema>;
export type AnesthesiaMedication = typeof anesthesiaMedications.$inferSelect;
export type InsertAnesthesiaMedication = z.infer<typeof insertAnesthesiaMedicationSchema>;
export type AnesthesiaEvent = typeof anesthesiaEvents.$inferSelect;
export type InsertAnesthesiaEvent = z.infer<typeof insertAnesthesiaEventSchema>;
export type InventoryUsage = typeof inventoryUsage.$inferSelect;
export type InsertInventoryUsage = z.infer<typeof insertInventoryUsageSchema>;
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
