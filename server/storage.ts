import {
  users,
  hospitals,
  userHospitalRoles,
  vendors,
  units,
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
  checklistTemplates,
  checklistCompletions,
  medicationConfigs,
  medicationGroups,
  administrationGroups,
  surgeryRooms,
  // Anesthesia module tables
  hospitalAnesthesiaSettings,
  patients,
  cases,
  surgeries,
  anesthesiaRecords,
  preOpAssessments,
  vitalsSnapshots,
  clinicalSnapshots,
  anesthesiaMedications,
  anesthesiaEvents,
  anesthesiaPositions,
  anesthesiaStaff,
  anesthesiaInstallations,
  anesthesiaTechniqueDetails,
  anesthesiaAirwayManagement,
  anesthesiaGeneralTechnique,
  anesthesiaNeuraxialBlocks,
  anesthesiaPeripheralBlocks,
  inventoryUsage,
  auditTrail,
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
  type Unit,
  type InsertFolder,
  type InsertItem,
  type InsertActivity,
  type ControlledCheck,
  type InsertControlledCheck,
  type ImportJob,
  type ChecklistTemplate,
  type InsertChecklistTemplate,
  type ChecklistCompletion,
  type InsertChecklistCompletion,
  type MedicationConfig,
  type InsertMedicationConfig,
  type MedicationGroup,
  type InsertMedicationGroup,
  type AdministrationGroup,
  type InsertAdministrationGroup,
  type SurgeryRoom,
  type InsertSurgeryRoom,
  // Anesthesia module types
  type HospitalAnesthesiaSettings,
  type InsertHospitalAnesthesiaSettings,
  type Patient,
  type InsertPatient,
  type Case,
  type InsertCase,
  type Surgery,
  type InsertSurgery,
  type AnesthesiaRecord,
  type InsertAnesthesiaRecord,
  type PreOpAssessment,
  type InsertPreOpAssessment,
  type VitalsSnapshot,
  type InsertVitalsSnapshot,
  type ClinicalSnapshot,
  type InsertClinicalSnapshot,
  type AnesthesiaMedication,
  type InsertAnesthesiaMedication,
  type AnesthesiaEvent,
  type InsertAnesthesiaEvent,
  type AnesthesiaPosition,
  type InsertAnesthesiaPosition,
  type AnesthesiaStaff,
  type InsertAnesthesiaStaff,
  type AnesthesiaInstallation,
  type InsertAnesthesiaInstallation,
  type AnesthesiaTechniqueDetail,
  type InsertAnesthesiaTechniqueDetail,
  type AnesthesiaAirwayManagement,
  type InsertAnesthesiaAirwayManagement,
  type AnesthesiaGeneralTechnique,
  type InsertAnesthesiaGeneralTechnique,
  type AnesthesiaNeuraxialBlock,
  type InsertAnesthesiaNeuraxialBlock,
  type AnesthesiaPeripheralBlock,
  type InsertAnesthesiaPeripheralBlock,
  type InventoryUsage,
  type InsertInventoryUsage,
  type AuditTrail,
  type InsertAuditTrail,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, lte, gte, or, ilike, isNull } from "drizzle-orm";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Hospital operations
  getHospital(id: string): Promise<Hospital | undefined>;
  getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean })[]>;
  createHospital(name: string): Promise<Hospital>;
  updateHospital(id: string, updates: Partial<Hospital>): Promise<Hospital>;
  
  // Folder operations
  getFolders(hospitalId: string, unitId: string): Promise<Folder[]>;
  getFolder(id: string): Promise<Folder | undefined>;
  createFolder(folder: InsertFolder): Promise<Folder>;
  updateFolder(id: string, updates: Partial<Folder>): Promise<Folder>;
  deleteFolder(id: string): Promise<void>;
  
  // Item operations
  getItems(hospitalId: string, unitId: string, filters?: {
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
  getStockLevel(itemId: string, unitId: string): Promise<StockLevel | undefined>;
  updateStockLevel(itemId: string, unitId: string, qty: number): Promise<StockLevel>;
  
  // Lot operations
  getLots(itemId: string): Promise<Lot[]>;
  createLot(lot: Omit<Lot, 'id' | 'createdAt'>): Promise<Lot>;
  
  // Order operations
  getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[] })[]>;
  createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  updateOrderStatus(id: string, status: string): Promise<Order>;
  findOrCreateDraftOrder(hospitalId: string, unitId: string, vendorId: string | null, createdBy: string): Promise<Order>;
  addItemToOrder(orderId: string, itemId: string, qty: number, packSize: number): Promise<OrderLine>;
  updateOrderLine(lineId: string, qty: number): Promise<OrderLine>;
  removeOrderLine(lineId: string): Promise<void>;
  deleteOrder(orderId: string): Promise<void>;
  getVendors(hospitalId: string): Promise<Vendor[]>;
  
  // Activity operations
  createActivity(activity: InsertActivity): Promise<Activity>;
  getActivities(filters: {
    hospitalId?: string;
    unitId?: string;
    itemId?: string;
    userId?: string;
    controlled?: boolean;
    limit?: number;
  }): Promise<(Activity & { user: User; item?: Item })[]>;
  
  // Alert operations
  getAlerts(hospitalId: string, unitId: string, acknowledged?: boolean): Promise<(Alert & { item?: Item; lot?: Lot })[]>;
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
  findItemByBarcode(barcode: string, hospitalId: string, unitId?: string): Promise<(Item & { stockLevel?: StockLevel }) | undefined>;
  
  // Admin - Unit management
  getUnits(hospitalId: string): Promise<Unit[]>;
  createUnit(unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit>;
  updateUnit(id: string, updates: Partial<Unit>): Promise<Unit>;
  deleteUnit(id: string): Promise<void>;
  
  // Admin - User management
  getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; unit: Unit })[]>;
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
  getControlledChecks(hospitalId: string, unitId: string, limit?: number): Promise<(ControlledCheck & { user: User })[]>;
  
  // Checklist operations
  createChecklistTemplate(template: InsertChecklistTemplate): Promise<ChecklistTemplate>;
  getChecklistTemplates(hospitalId: string, unitId?: string, active?: boolean): Promise<ChecklistTemplate[]>;
  getChecklistTemplate(id: string): Promise<ChecklistTemplate | undefined>;
  updateChecklistTemplate(id: string, updates: Partial<ChecklistTemplate>): Promise<ChecklistTemplate>;
  deleteChecklistTemplate(id: string): Promise<void>;
  getPendingChecklists(hospitalId: string, unitId: string, role?: string): Promise<(ChecklistTemplate & { lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean })[]>;
  completeChecklist(completion: InsertChecklistCompletion): Promise<ChecklistCompletion>;
  getChecklistCompletions(hospitalId: string, unitId?: string, templateId?: string, limit?: number): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[]>;
  getChecklistCompletion(id: string): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined>;
  getPendingChecklistCount(hospitalId: string, unitId: string, role?: string): Promise<number>;
  
  // Import Jobs
  createImportJob(job: Omit<ImportJob, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<ImportJob>;
  getImportJob(id: string): Promise<ImportJob | undefined>;
  getImportJobs(hospitalId: string, userId?: string, status?: string): Promise<ImportJob[]>;
  getNextQueuedJob(): Promise<ImportJob | undefined>;
  getStuckJobs(thresholdMinutes?: number): Promise<ImportJob[]>;
  updateImportJob(id: string, updates: Partial<ImportJob>): Promise<ImportJob>;
  
  // Medication Config operations
  getMedicationConfig(itemId: string): Promise<MedicationConfig | undefined>;
  upsertMedicationConfig(config: InsertMedicationConfig): Promise<MedicationConfig>;
  deleteMedicationConfig(itemId: string): Promise<void>;
  
  // Medication Group operations
  getMedicationGroups(hospitalId: string): Promise<MedicationGroup[]>;
  createMedicationGroup(group: InsertMedicationGroup): Promise<MedicationGroup>;
  deleteMedicationGroup(id: string): Promise<void>;

  // Administration Group operations
  getAdministrationGroups(hospitalId: string): Promise<AdministrationGroup[]>;
  createAdministrationGroup(group: InsertAdministrationGroup): Promise<AdministrationGroup>;
  updateAdministrationGroup(id: string, updates: { name: string }): Promise<AdministrationGroup>;
  deleteAdministrationGroup(id: string): Promise<void>;
  reorderAdministrationGroups(groupIds: string[]): Promise<void>;
  
  // Surgery Room operations
  getSurgeryRooms(hospitalId: string): Promise<SurgeryRoom[]>;
  createSurgeryRoom(room: InsertSurgeryRoom): Promise<SurgeryRoom>;
  updateSurgeryRoom(id: string, room: Partial<InsertSurgeryRoom>): Promise<SurgeryRoom>;
  deleteSurgeryRoom(id: string): Promise<void>;
  reorderSurgeryRooms(roomIds: string[]): Promise<void>;
  
  // ========== ANESTHESIA MODULE OPERATIONS ==========
  
  // Hospital Anesthesia Settings operations
  getHospitalAnesthesiaSettings(hospitalId: string): Promise<HospitalAnesthesiaSettings | undefined>;
  upsertHospitalAnesthesiaSettings(settings: InsertHospitalAnesthesiaSettings): Promise<HospitalAnesthesiaSettings>;
  
  // Patient operations
  getPatients(hospitalId: string, search?: string): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | undefined>;
  createPatient(patient: InsertPatient): Promise<Patient>;
  updatePatient(id: string, updates: Partial<Patient>): Promise<Patient>;
  deletePatient(id: string): Promise<void>;
  generatePatientNumber(hospitalId: string): Promise<string>;
  
  // Case operations
  getCases(hospitalId: string, patientId?: string, status?: string): Promise<Case[]>;
  getCase(id: string): Promise<Case | undefined>;
  createCase(caseData: InsertCase): Promise<Case>;
  updateCase(id: string, updates: Partial<Case>): Promise<Case>;
  
  // Surgery operations
  getSurgeries(hospitalId: string, filters?: {
    caseId?: string;
    patientId?: string;
    status?: string;
    roomId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Surgery[]>;
  getSurgery(id: string): Promise<Surgery | undefined>;
  createSurgery(surgery: InsertSurgery): Promise<Surgery>;
  updateSurgery(id: string, updates: Partial<Surgery>): Promise<Surgery>;
  deleteSurgery(id: string): Promise<void>;
  
  // Anesthesia Record operations
  getAnesthesiaRecord(surgeryId: string): Promise<AnesthesiaRecord | undefined>;
  getAnesthesiaRecordById(id: string): Promise<AnesthesiaRecord | undefined>;
  createAnesthesiaRecord(record: InsertAnesthesiaRecord): Promise<AnesthesiaRecord>;
  updateAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>): Promise<AnesthesiaRecord>;
  closeAnesthesiaRecord(id: string, closedBy: string): Promise<AnesthesiaRecord>;
  amendAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>, reason: string, userId: string): Promise<AnesthesiaRecord>;
  
  // Pre-Op Assessment operations
  getPreOpAssessments(hospitalId: string): Promise<Array<any>>;
  getPreOpAssessment(surgeryId: string): Promise<PreOpAssessment | undefined>;
  getPreOpAssessmentById(id: string): Promise<PreOpAssessment | undefined>;
  getPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<PreOpAssessment[]>;
  createPreOpAssessment(assessment: InsertPreOpAssessment): Promise<PreOpAssessment>;
  updatePreOpAssessment(id: string, updates: Partial<PreOpAssessment>): Promise<PreOpAssessment>;
  
  // Clinical Snapshots operations (NEW: Point-based CRUD)
  getClinicalSnapshot(anesthesiaRecordId: string): Promise<ClinicalSnapshot>;
  addVitalPoint(anesthesiaRecordId: string, vitalType: string, timestamp: string, value: number): Promise<ClinicalSnapshot>;
  addBPPoint(anesthesiaRecordId: string, timestamp: string, sys: number, dia: number, mean?: number): Promise<ClinicalSnapshot>;
  updateVitalPoint(pointId: string, updates: { value?: number; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteVitalPoint(pointId: string): Promise<ClinicalSnapshot | null>;
  addRhythmPoint(anesthesiaRecordId: string, timestamp: string, value: string): Promise<ClinicalSnapshot>;
  updateRhythmPoint(pointId: string, updates: { value?: string; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteRhythmPoint(pointId: string): Promise<ClinicalSnapshot | null>;
  addTOFPoint(anesthesiaRecordId: string, timestamp: string, value: string, percentage?: number): Promise<ClinicalSnapshot>;
  updateTOFPoint(pointId: string, updates: { value?: string; percentage?: number; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteTOFPoint(pointId: string): Promise<ClinicalSnapshot | null>;
  
  // Ventilation Mode operations
  addVentilationModePoint(anesthesiaRecordId: string, timestamp: string, value: string): Promise<ClinicalSnapshot>;
  updateVentilationModePoint(anesthesiaRecordId: string, pointId: string, updates: { value?: string; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteVentilationModePoint(anesthesiaRecordId: string, pointId: string): Promise<ClinicalSnapshot | null>;
  addBulkVentilationParameters(
    anesthesiaRecordId: string,
    timestamp: string,
    ventilationMode: string | null,
    parameters: {
      peep?: number;
      fio2?: number;
      tidalVolume?: number;
      respiratoryRate?: number;
      minuteVolume?: number;
      etco2?: number;
      pip?: number;
    }
  ): Promise<ClinicalSnapshot>;
  
  // Output operations
  addOutputPoint(anesthesiaRecordId: string, paramKey: string, timestamp: string, value: number): Promise<ClinicalSnapshot>;
  updateOutputPoint(anesthesiaRecordId: string, paramKey: string, pointId: string, updates: { value?: number; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteOutputPoint(anesthesiaRecordId: string, paramKey: string, pointId: string): Promise<ClinicalSnapshot | null>;
  
  // Legacy methods for backward compatibility
  getVitalsSnapshots(anesthesiaRecordId: string): Promise<VitalsSnapshot[]>;
  createVitalsSnapshot(snapshot: InsertVitalsSnapshot): Promise<VitalsSnapshot>;
  
  // Anesthesia Medication operations
  getAnesthesiaMedications(anesthesiaRecordId: string): Promise<AnesthesiaMedication[]>;
  createAnesthesiaMedication(medication: InsertAnesthesiaMedication): Promise<AnesthesiaMedication>;
  updateAnesthesiaMedication(id: string, updates: Partial<AnesthesiaMedication>): Promise<AnesthesiaMedication>;
  deleteAnesthesiaMedication(id: string, userId: string): Promise<void>;
  
  // Anesthesia Event operations
  getAnesthesiaEvents(anesthesiaRecordId: string): Promise<AnesthesiaEvent[]>;
  createAnesthesiaEvent(event: InsertAnesthesiaEvent): Promise<AnesthesiaEvent>;
  updateAnesthesiaEvent(id: string, event: Partial<InsertAnesthesiaEvent>, userId: string): Promise<AnesthesiaEvent>;
  deleteAnesthesiaEvent(id: string, userId: string): Promise<void>;
  
  // Anesthesia Position operations
  getAnesthesiaPositions(anesthesiaRecordId: string): Promise<AnesthesiaPosition[]>;
  createAnesthesiaPosition(position: InsertAnesthesiaPosition): Promise<AnesthesiaPosition>;
  updateAnesthesiaPosition(id: string, position: Partial<InsertAnesthesiaPosition>, userId: string): Promise<AnesthesiaPosition>;
  deleteAnesthesiaPosition(id: string, userId: string): Promise<void>;
  
  // Anesthesia Staff operations
  getAnesthesiaStaff(anesthesiaRecordId: string): Promise<AnesthesiaStaff[]>;
  createAnesthesiaStaff(staff: InsertAnesthesiaStaff): Promise<AnesthesiaStaff>;
  updateAnesthesiaStaff(id: string, staff: Partial<InsertAnesthesiaStaff>, userId: string): Promise<AnesthesiaStaff>;
  deleteAnesthesiaStaff(id: string, userId: string): Promise<void>;
  
  // Anesthesia Installation operations
  getAnesthesiaInstallations(anesthesiaRecordId: string): Promise<AnesthesiaInstallation[]>;
  createAnesthesiaInstallation(installation: InsertAnesthesiaInstallation): Promise<AnesthesiaInstallation>;
  updateAnesthesiaInstallation(id: string, updates: Partial<AnesthesiaInstallation>): Promise<AnesthesiaInstallation>;
  deleteAnesthesiaInstallation(id: string): Promise<void>;
  
  // Anesthesia Technique Detail operations
  getAnesthesiaTechniqueDetails(anesthesiaRecordId: string): Promise<AnesthesiaTechniqueDetail[]>;
  getAnesthesiaTechniqueDetail(anesthesiaRecordId: string, technique: string): Promise<AnesthesiaTechniqueDetail | undefined>;
  upsertAnesthesiaTechniqueDetail(detail: InsertAnesthesiaTechniqueDetail): Promise<AnesthesiaTechniqueDetail>;
  deleteAnesthesiaTechniqueDetail(id: string): Promise<void>;
  
  // Anesthesia Airway Management operations
  getAirwayManagement(anesthesiaRecordId: string): Promise<AnesthesiaAirwayManagement | undefined>;
  upsertAirwayManagement(airway: InsertAnesthesiaAirwayManagement): Promise<AnesthesiaAirwayManagement>;
  deleteAirwayManagement(anesthesiaRecordId: string): Promise<void>;
  
  // Anesthesia General Technique operations
  getGeneralTechnique(anesthesiaRecordId: string): Promise<AnesthesiaGeneralTechnique | undefined>;
  upsertGeneralTechnique(technique: InsertAnesthesiaGeneralTechnique): Promise<AnesthesiaGeneralTechnique>;
  deleteGeneralTechnique(anesthesiaRecordId: string): Promise<void>;
  
  // Anesthesia Neuraxial Blocks operations
  getNeuraxialBlocks(anesthesiaRecordId: string): Promise<AnesthesiaNeuraxialBlock[]>;
  createNeuraxialBlock(block: InsertAnesthesiaNeuraxialBlock): Promise<AnesthesiaNeuraxialBlock>;
  updateNeuraxialBlock(id: string, updates: Partial<AnesthesiaNeuraxialBlock>): Promise<AnesthesiaNeuraxialBlock>;
  deleteNeuraxialBlock(id: string): Promise<void>;
  
  // Anesthesia Peripheral Blocks operations
  getPeripheralBlocks(anesthesiaRecordId: string): Promise<AnesthesiaPeripheralBlock[]>;
  createPeripheralBlock(block: InsertAnesthesiaPeripheralBlock): Promise<AnesthesiaPeripheralBlock>;
  updatePeripheralBlock(id: string, updates: Partial<AnesthesiaPeripheralBlock>): Promise<AnesthesiaPeripheralBlock>;
  deletePeripheralBlock(id: string): Promise<void>;
  
  // Inventory Usage operations
  getInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]>;
  calculateInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]>;
  updateInventoryUsage(id: string, quantityUsed: number): Promise<InventoryUsage>;
  
  // Audit Trail operations
  getAuditTrail(recordType: string, recordId: string): Promise<AuditTrail[]>;
  createAuditLog(log: InsertAuditTrail): Promise<void>;
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
        target: users.email, // Use email as conflict target for OIDC re-login
        set: {
          // Don't update id - it's referenced by foreign keys
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

  async getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean })[]> {
    const result = await db
      .select()
      .from(hospitals)
      .innerJoin(userHospitalRoles, eq(hospitals.id, userHospitalRoles.hospitalId))
      .innerJoin(units, eq(userHospitalRoles.unitId, units.id))
      .where(eq(userHospitalRoles.userId, userId));
    
    return result.map(row => ({
      ...row.hospitals,
      role: row.user_hospital_roles.role,
      unitId: row.user_hospital_roles.unitId,
      unitName: row.units.name,
      isAnesthesiaModule: row.units.isAnesthesiaModule ?? false,
      isSurgeryModule: row.units.isSurgeryModule ?? false,
    })) as (Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean })[];
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

  async getFolders(hospitalId: string, unitId: string): Promise<Folder[]> {
    return await db
      .select()
      .from(folders)
      .where(and(eq(folders.hospitalId, hospitalId), eq(folders.unitId, unitId)))
      .orderBy(asc(folders.sortOrder), asc(folders.name));
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

  async getItems(hospitalId: string, unitId: string, filters?: {
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
      .where(and(eq(items.hospitalId, hospitalId), eq(items.unitId, unitId)))
      .groupBy(items.id, stockLevels.id);

    // Apply filters
    if (filters?.critical) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.unitId, unitId), eq(items.critical, true)));
    }
    if (filters?.controlled) {
      query = query.where(and(eq(items.hospitalId, hospitalId), eq(items.unitId, unitId), eq(items.controlled, true)));
    }

    const result = await query.orderBy(asc(items.sortOrder), asc(items.name));
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

  async getStockLevel(itemId: string, unitId: string): Promise<StockLevel | undefined> {
    const [level] = await db
      .select()
      .from(stockLevels)
      .where(and(eq(stockLevels.itemId, itemId), eq(stockLevels.unitId, unitId)));
    return level;
  }

  async updateStockLevel(itemId: string, unitId: string, qty: number): Promise<StockLevel> {
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

  async getOrders(hospitalId: string, status?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[] })[]> {
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

  async findOrCreateDraftOrder(hospitalId: string, unitId: string, vendorId: string | null, createdBy: string): Promise<Order> {
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
    unitId?: string;
    itemId?: string;
    userId?: string;
    controlled?: boolean;
    limit?: number;
  }): Promise<(Activity & { user: User; item?: Item })[]> {
    const conditions = [];
    
    if (filters.itemId) conditions.push(eq(activities.itemId, filters.itemId));
    if (filters.userId) conditions.push(eq(activities.userId, filters.userId));
    
    // For controlled substance filtering, check if the item is controlled
    // This includes both administrations (with patientId) and adjustments (without patientId)
    if (filters.controlled !== undefined) {
      if (filters.controlled) {
        conditions.push(eq(items.controlled, true));
      } else {
        conditions.push(eq(items.controlled, false));
      }
    }

    if (filters.hospitalId) {
      conditions.push(eq(items.hospitalId, filters.hospitalId));
    }

    if (filters.unitId) {
      conditions.push(eq(items.unitId, filters.unitId));
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

    query = query.orderBy(desc(activities.timestamp));

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    return await query;
  }

  async getAlerts(hospitalId: string, unitId: string, acknowledged?: boolean): Promise<(Alert & { item?: Item; lot?: Lot })[]> {
    let query = db
      .select({
        ...alerts,
        item: items,
        lot: lots,
      })
      .from(alerts)
      .leftJoin(items, eq(alerts.itemId, items.id))
      .leftJoin(lots, eq(alerts.lotId, lots.id))
      .where(and(eq(alerts.hospitalId, hospitalId), eq(items.unitId, unitId)));

    if (acknowledged !== undefined) {
      query = query.where(and(eq(alerts.hospitalId, hospitalId), eq(items.unitId, unitId), eq(alerts.acknowledged, acknowledged)));
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

  async findItemByBarcode(barcode: string, hospitalId: string, unitId?: string): Promise<(Item & { stockLevel?: StockLevel }) | undefined> {
    const conditions = [
      eq(items.hospitalId, hospitalId),
      sql`${barcode} = ANY(${items.barcodes})`
    ];
    
    // If unitId is provided, filter items by unit
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

  // Admin - Unit management
  async getUnits(hospitalId: string): Promise<Unit[]> {
    return await db
      .select()
      .from(units)
      .where(eq(units.hospitalId, hospitalId))
      .orderBy(asc(units.name));
  }

  async createUnit(unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit> {
    const [newUnit] = await db
      .insert(units)
      .values(unit)
      .returning();
    return newUnit;
  }

  async updateUnit(id: string, updates: Partial<Unit>): Promise<Unit> {
    const [updated] = await db
      .update(units)
      .set(updates)
      .where(eq(units.id, id))
      .returning();
    return updated;
  }

  async deleteUnit(id: string): Promise<void> {
    await db.delete(units).where(eq(units.id, id));
  }

  // Admin - User management
  async getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; unit: Unit })[]> {
    const results = await db
      .select()
      .from(userHospitalRoles)
      .innerJoin(users, eq(userHospitalRoles.userId, users.id))
      .innerJoin(units, eq(userHospitalRoles.unitId, units.id))
      .where(eq(userHospitalRoles.hospitalId, hospitalId))
      .orderBy(asc(users.email));
    
    return results.map(row => ({
      ...row.user_hospital_roles,
      user: row.users,
      unit: row.units,
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
  
  async getControlledChecks(hospitalId: string, unitId: string, limit: number = 50): Promise<(ControlledCheck & { user: User })[]> {
    const checks = await db
      .select({
        ...controlledChecks,
        user: users,
      })
      .from(controlledChecks)
      .leftJoin(users, eq(controlledChecks.userId, users.id))
      .where(and(
        eq(controlledChecks.hospitalId, hospitalId),
        eq(controlledChecks.unitId, unitId)
      ))
      .orderBy(desc(controlledChecks.timestamp))
      .limit(limit);
    
    return checks as (ControlledCheck & { user: User })[];
  }

  async createImportJob(job: Omit<ImportJob, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<ImportJob> {
    const [created] = await db.insert(importJobs).values(job).returning();
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

  async getNextQueuedJob(): Promise<ImportJob | undefined> {
    const [job] = await db
      .select()
      .from(importJobs)
      .where(eq(importJobs.status, 'queued'))
      .orderBy(asc(importJobs.createdAt))
      .limit(1);
    
    return job;
  }

  async getStuckJobs(thresholdMinutes: number = 30): Promise<ImportJob[]> {
    // Find jobs that have been "processing" for longer than threshold
    const thresholdTime = new Date(Date.now() - thresholdMinutes * 60 * 1000);
    
    const jobs = await db
      .select()
      .from(importJobs)
      .where(
        and(
          eq(importJobs.status, 'processing'),
          sql`${importJobs.startedAt} < ${thresholdTime}`
        )
      )
      .orderBy(asc(importJobs.startedAt));
    
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

  // Checklist implementations
  async createChecklistTemplate(template: InsertChecklistTemplate): Promise<ChecklistTemplate> {
    const [created] = await db.insert(checklistTemplates).values(template).returning();
    return created;
  }

  async getChecklistTemplates(hospitalId: string, unitId?: string, active: boolean = true): Promise<ChecklistTemplate[]> {
    const conditions = [eq(checklistTemplates.hospitalId, hospitalId)];
    if (unitId) conditions.push(eq(checklistTemplates.unitId, unitId));
    if (active !== undefined) conditions.push(eq(checklistTemplates.active, active));

    const templates = await db
      .select()
      .from(checklistTemplates)
      .where(and(...conditions))
      .orderBy(asc(checklistTemplates.name));
    
    return templates;
  }

  async getChecklistTemplate(id: string): Promise<ChecklistTemplate | undefined> {
    const [template] = await db.select().from(checklistTemplates).where(eq(checklistTemplates.id, id));
    return template;
  }

  async updateChecklistTemplate(id: string, updates: Partial<ChecklistTemplate>): Promise<ChecklistTemplate> {
    const [updated] = await db
      .update(checklistTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(checklistTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteChecklistTemplate(id: string): Promise<void> {
    // Delete all associated checklist completions first (cascade delete)
    await db.delete(checklistCompletions).where(eq(checklistCompletions.templateId, id));
    // Then delete the template
    await db.delete(checklistTemplates).where(eq(checklistTemplates.id, id));
  }

  async getPendingChecklists(hospitalId: string, unitId: string, role?: string): Promise<(ChecklistTemplate & { lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean })[]> {
    const conditions = [
      eq(checklistTemplates.hospitalId, hospitalId),
      eq(checklistTemplates.unitId, unitId),
      eq(checklistTemplates.active, true),
    ];
    
    if (role) {
      conditions.push(
        sql`(${checklistTemplates.role} IS NULL OR ${checklistTemplates.role} = ${role})`
      );
    } else {
      conditions.push(sql`${checklistTemplates.role} IS NULL`);
    }

    const templates = await db
      .select()
      .from(checklistTemplates)
      .where(and(...conditions));

    const result = [];
    const now = new Date();

    for (const template of templates) {
      const completions = await db
        .select()
        .from(checklistCompletions)
        .where(eq(checklistCompletions.templateId, template.id))
        .orderBy(desc(checklistCompletions.dueDate))
        .limit(1);

      const lastCompletion = completions[0];
      const nextDueDate = this.calculateNextDueDate(template.startDate, template.recurrency, lastCompletion?.dueDate);
      const isOverdue = nextDueDate <= now;

      if (isOverdue || nextDueDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)) {
        result.push({
          ...template,
          lastCompletion,
          nextDueDate,
          isOverdue,
        });
      }
    }

    return result.sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime());
  }

  private calculateNextDueDate(startDate: Date, recurrency: string, lastDueDate?: Date): Date {
    // If no last completion, the first due date IS the start date
    if (!lastDueDate) {
      return new Date(startDate);
    }
    
    // Otherwise, calculate next due date based on last completion
    const date = new Date(lastDueDate);

    switch (recurrency) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
    }

    return date;
  }

  async completeChecklist(completion: InsertChecklistCompletion): Promise<ChecklistCompletion> {
    const [created] = await db.insert(checklistCompletions).values(completion).returning();
    return created;
  }

  async getChecklistCompletions(hospitalId: string, unitId?: string, templateId?: string, limit: number = 50): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[]> {
    const conditions = [eq(checklistCompletions.hospitalId, hospitalId)];
    if (unitId) conditions.push(eq(checklistCompletions.unitId, unitId));
    if (templateId) conditions.push(eq(checklistCompletions.templateId, templateId));

    const completions = await db
      .select({
        ...checklistCompletions,
        template: checklistTemplates,
        completedByUser: users,
      })
      .from(checklistCompletions)
      .leftJoin(checklistTemplates, eq(checklistCompletions.templateId, checklistTemplates.id))
      .leftJoin(users, eq(checklistCompletions.completedBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(checklistCompletions.completedAt))
      .limit(limit);

    return completions as (ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[];
  }

  async getChecklistCompletion(id: string): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined> {
    const [completion] = await db
      .select({
        ...checklistCompletions,
        template: checklistTemplates,
        completedByUser: users,
      })
      .from(checklistCompletions)
      .leftJoin(checklistTemplates, eq(checklistCompletions.templateId, checklistTemplates.id))
      .leftJoin(users, eq(checklistCompletions.completedBy, users.id))
      .where(eq(checklistCompletions.id, id));

    return completion as (ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined;
  }

  async getPendingChecklistCount(hospitalId: string, unitId: string, role?: string): Promise<number> {
    const pending = await this.getPendingChecklists(hospitalId, unitId, role);
    return pending.filter(c => c.isOverdue).length;
  }

  // Medication Config operations
  async getMedicationConfig(itemId: string): Promise<MedicationConfig | undefined> {
    const [config] = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.itemId, itemId));
    return config;
  }

  async upsertMedicationConfig(config: InsertMedicationConfig): Promise<MedicationConfig> {
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

  async deleteMedicationConfig(itemId: string): Promise<void> {
    await db
      .delete(medicationConfigs)
      .where(eq(medicationConfigs.itemId, itemId));
  }

  async getMedicationGroups(hospitalId: string): Promise<MedicationGroup[]> {
    const groups = await db
      .select()
      .from(medicationGroups)
      .where(eq(medicationGroups.hospitalId, hospitalId))
      .orderBy(asc(medicationGroups.name));
    return groups;
  }

  async createMedicationGroup(group: InsertMedicationGroup): Promise<MedicationGroup> {
    const [newGroup] = await db
      .insert(medicationGroups)
      .values(group)
      .returning();
    return newGroup;
  }

  async deleteMedicationGroup(id: string): Promise<void> {
    await db
      .delete(medicationGroups)
      .where(eq(medicationGroups.id, id));
  }

  async getAdministrationGroups(hospitalId: string): Promise<AdministrationGroup[]> {
    const groups = await db
      .select()
      .from(administrationGroups)
      .where(eq(administrationGroups.hospitalId, hospitalId))
      .orderBy(asc(administrationGroups.sortOrder), asc(administrationGroups.name));
    return groups;
  }

  async createAdministrationGroup(group: InsertAdministrationGroup): Promise<AdministrationGroup> {
    const [newGroup] = await db
      .insert(administrationGroups)
      .values(group)
      .returning();
    return newGroup;
  }

  async updateAdministrationGroup(id: string, updates: { name: string }): Promise<AdministrationGroup> {
    // Get old group name to update medication configs
    const [oldGroup] = await db
      .select()
      .from(administrationGroups)
      .where(eq(administrationGroups.id, id));
    
    // Update the group
    const [updatedGroup] = await db
      .update(administrationGroups)
      .set({ name: updates.name })
      .where(eq(administrationGroups.id, id))
      .returning();
    
    // Update all medication configs that reference the old group name
    if (oldGroup && oldGroup.name !== updates.name) {
      await db
        .update(medicationConfigs)
        .set({ administrationGroup: updates.name })
        .where(eq(medicationConfigs.administrationGroup, oldGroup.name));
    }
    
    return updatedGroup;
  }

  async deleteAdministrationGroup(id: string): Promise<void> {
    // First, get the group name to clear references in medication configs
    const [group] = await db
      .select()
      .from(administrationGroups)
      .where(eq(administrationGroups.id, id));
    
    if (group) {
      // Clear administrationGroup from all medication configs that reference this group
      await db
        .update(medicationConfigs)
        .set({ administrationGroup: null })
        .where(eq(medicationConfigs.administrationGroup, group.name));
    }
    
    // Now delete the group
    await db
      .delete(administrationGroups)
      .where(eq(administrationGroups.id, id));
  }

  async reorderAdministrationGroups(groupIds: string[]): Promise<void> {
    // Update sortOrder for each group based on its position in the array
    await Promise.all(
      groupIds.map((id, index) =>
        db
          .update(administrationGroups)
          .set({ sortOrder: index })
          .where(eq(administrationGroups.id, id))
      )
    );
  }

  async getSurgeryRooms(hospitalId: string): Promise<SurgeryRoom[]> {
    const rooms = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.hospitalId, hospitalId))
      .orderBy(asc(surgeryRooms.sortOrder), asc(surgeryRooms.name));
    return rooms;
  }

  async createSurgeryRoom(room: InsertSurgeryRoom): Promise<SurgeryRoom> {
    const [newRoom] = await db
      .insert(surgeryRooms)
      .values(room)
      .returning();
    return newRoom;
  }

  async updateSurgeryRoom(id: string, room: Partial<InsertSurgeryRoom>): Promise<SurgeryRoom> {
    const [updatedRoom] = await db
      .update(surgeryRooms)
      .set(room)
      .where(eq(surgeryRooms.id, id))
      .returning();
    return updatedRoom;
  }

  async deleteSurgeryRoom(id: string): Promise<void> {
    await db
      .delete(surgeryRooms)
      .where(eq(surgeryRooms.id, id));
  }

  async reorderSurgeryRooms(roomIds: string[]): Promise<void> {
    // Update sortOrder for each room based on its position in the array
    await Promise.all(
      roomIds.map((id, index) =>
        db
          .update(surgeryRooms)
          .set({ sortOrder: index })
          .where(eq(surgeryRooms.id, id))
      )
    );
  }

  // ========== ANESTHESIA MODULE IMPLEMENTATIONS ==========

  // Hospital Anesthesia Settings operations
  async getHospitalAnesthesiaSettings(hospitalId: string): Promise<HospitalAnesthesiaSettings | undefined> {
    const [settings] = await db
      .select()
      .from(hospitalAnesthesiaSettings)
      .where(eq(hospitalAnesthesiaSettings.hospitalId, hospitalId));
    return settings;
  }

  async upsertHospitalAnesthesiaSettings(settings: InsertHospitalAnesthesiaSettings): Promise<HospitalAnesthesiaSettings> {
    const [upserted] = await db
      .insert(hospitalAnesthesiaSettings)
      .values(settings)
      .onConflictDoUpdate({
        target: hospitalAnesthesiaSettings.hospitalId,
        set: {
          allergyList: settings.allergyList,
          medicationLists: settings.medicationLists,
          illnessLists: settings.illnessLists,
          checklistItems: settings.checklistItems,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  // Patient operations
  async getPatients(hospitalId: string, search?: string): Promise<Patient[]> {
    let conditions = [
      eq(patients.hospitalId, hospitalId),
      isNull(patients.deletedAt) // Exclude soft-deleted patients
    ];

    if (search && search.trim()) {
      const searchTerm = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(patients.surname, searchTerm),
          ilike(patients.firstName, searchTerm),
          ilike(patients.patientNumber, searchTerm)
        )!
      );
    }

    const result = await db
      .select()
      .from(patients)
      .where(and(...conditions))
      .orderBy(asc(patients.surname), asc(patients.firstName));
    return result;
  }

  async getPatient(id: string): Promise<Patient | undefined> {
    const [patient] = await db
      .select()
      .from(patients)
      .where(and(eq(patients.id, id), isNull(patients.deletedAt)));
    return patient;
  }

  async createPatient(patient: InsertPatient): Promise<Patient> {
    const [created] = await db.insert(patients).values(patient).returning();
    return created;
  }

  async updatePatient(id: string, updates: Partial<Patient>): Promise<Patient> {
    const [updated] = await db
      .update(patients)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(patients.id, id))
      .returning();
    return updated;
  }

  async deletePatient(id: string): Promise<void> {
    // Soft delete: set deletedAt timestamp instead of hard delete
    await db
      .update(patients)
      .set({ deletedAt: new Date() })
      .where(eq(patients.id, id));
  }

  async generatePatientNumber(hospitalId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `P-${year}-`;
    
    // Get the latest patient number for this hospital and year
    const latestPatient = await db
      .select()
      .from(patients)
      .where(
        and(
          eq(patients.hospitalId, hospitalId),
          ilike(patients.patientNumber, `${prefix}%`)
        )
      )
      .orderBy(desc(patients.patientNumber))
      .limit(1);

    if (latestPatient.length === 0) {
      return `${prefix}001`;
    }

    // Extract the number part and increment
    const lastNumber = latestPatient[0].patientNumber.split('-')[2];
    const nextNumber = (parseInt(lastNumber, 10) + 1).toString().padStart(3, '0');
    return `${prefix}${nextNumber}`;
  }

  // Case operations
  async getCases(hospitalId: string, patientId?: string, status?: string): Promise<Case[]> {
    const conditions = [eq(cases.hospitalId, hospitalId)];
    if (patientId) conditions.push(eq(cases.patientId, patientId));
    if (status) conditions.push(sql`${cases.status} = ${status}`);

    const result = await db
      .select()
      .from(cases)
      .where(and(...conditions))
      .orderBy(desc(cases.admissionDate));
    
    return result;
  }

  async getCase(id: string): Promise<Case | undefined> {
    const [caseRecord] = await db.select().from(cases).where(eq(cases.id, id));
    return caseRecord;
  }

  async createCase(caseData: InsertCase): Promise<Case> {
    const [created] = await db.insert(cases).values(caseData).returning();
    return created;
  }

  async updateCase(id: string, updates: Partial<Case>): Promise<Case> {
    const [updated] = await db
      .update(cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(cases.id, id))
      .returning();
    return updated;
  }

  // Surgery operations
  async getSurgeries(hospitalId: string, filters?: {
    caseId?: string;
    patientId?: string;
    status?: string;
    roomId?: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<Surgery[]> {
    const conditions = [eq(surgeries.hospitalId, hospitalId)];
    
    if (filters?.caseId) conditions.push(eq(surgeries.caseId, filters.caseId));
    if (filters?.patientId) conditions.push(eq(surgeries.patientId, filters.patientId));
    if (filters?.status) conditions.push(sql`${surgeries.status} = ${filters.status}`);
    if (filters?.roomId) conditions.push(eq(surgeries.surgeryRoomId, filters.roomId));
    if (filters?.dateFrom) conditions.push(gte(surgeries.plannedDate, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(surgeries.plannedDate, filters.dateTo));

    const result = await db
      .select()
      .from(surgeries)
      .where(and(...conditions))
      .orderBy(desc(surgeries.plannedDate));
    
    return result;
  }

  async getSurgery(id: string): Promise<Surgery | undefined> {
    const [surgery] = await db.select().from(surgeries).where(eq(surgeries.id, id));
    return surgery;
  }

  async createSurgery(surgery: InsertSurgery): Promise<Surgery> {
    const [created] = await db.insert(surgeries).values(surgery).returning();
    return created;
  }

  async updateSurgery(id: string, updates: Partial<Surgery>): Promise<Surgery> {
    const [updated] = await db
      .update(surgeries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(surgeries.id, id))
      .returning();
    return updated;
  }

  async deleteSurgery(id: string): Promise<void> {
    await db
      .delete(surgeries)
      .where(eq(surgeries.id, id));
  }

  // Anesthesia Record operations
  async getAnesthesiaRecord(surgeryId: string): Promise<AnesthesiaRecord | undefined> {
    const [record] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.surgeryId, surgeryId));
    return record;
  }

  async getAnesthesiaRecordById(id: string): Promise<AnesthesiaRecord | undefined> {
    const [record] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, id));
    return record;
  }

  async createAnesthesiaRecord(record: InsertAnesthesiaRecord): Promise<AnesthesiaRecord> {
    const [created] = await db.insert(anesthesiaRecords).values(record).returning();
    return created;
  }

  async updateAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>): Promise<AnesthesiaRecord> {
    const [updated] = await db
      .update(anesthesiaRecords)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anesthesiaRecords.id, id))
      .returning();
    return updated;
  }

  async closeAnesthesiaRecord(id: string, closedBy: string): Promise<AnesthesiaRecord> {
    const [updated] = await db
      .update(anesthesiaRecords)
      .set({
        caseStatus: 'closed',
        closedAt: new Date(),
        closedBy,
        updatedAt: new Date(),
      })
      .where(eq(anesthesiaRecords.id, id))
      .returning();
    return updated;
  }

  async amendAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>, reason: string, userId: string): Promise<AnesthesiaRecord> {
    // Get current record for audit log
    const [currentRecord] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, id));

    // Update the record
    const [updated] = await db
      .update(anesthesiaRecords)
      .set({
        ...updates,
        caseStatus: 'amended',
        updatedAt: new Date(),
      })
      .where(eq(anesthesiaRecords.id, id))
      .returning();

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_record',
      recordId: id,
      action: 'amend',
      userId,
      oldValue: currentRecord,
      newValue: updated,
      reason,
    });

    return updated;
  }

  // Pre-Op Assessment operations
  async getPreOpAssessments(hospitalId: string): Promise<Array<any>> {
    const results = await db
      .select()
      .from(surgeries)
      .leftJoin(preOpAssessments, eq(surgeries.id, preOpAssessments.surgeryId))
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .where(eq(surgeries.hospitalId, hospitalId))
      .orderBy(desc(surgeries.plannedDate));

    return results.map(row => {
      const patient = row.patients;
      const surgery = row.surgeries;
      
      // Create a combined surgery object with patient data for frontend compatibility
      const surgeryWithPatient = {
        ...surgery,
        patientName: patient ? `${patient.firstName} ${patient.surname}` : 'Unknown Patient',
        patientMRN: patient?.patientNumber || '',
        patientBirthday: patient?.birthday || null,
        patientSex: patient?.sex || null,
        procedureName: surgery.plannedSurgery,
      };

      return {
        surgery: surgeryWithPatient,
        assessment: row.preop_assessments,
        // Status: planned (no assessment), draft (has assessment but not completed), completed (has signature)
        status: !row.preop_assessments ? 'planned' : row.preop_assessments.status || 'draft',
      };
    });
  }

  async getPreOpAssessment(surgeryId: string): Promise<PreOpAssessment | undefined> {
    const [assessment] = await db
      .select()
      .from(preOpAssessments)
      .where(eq(preOpAssessments.surgeryId, surgeryId));
    return assessment;
  }

  async getPreOpAssessmentById(id: string): Promise<PreOpAssessment | undefined> {
    const [assessment] = await db
      .select()
      .from(preOpAssessments)
      .where(eq(preOpAssessments.id, id));
    return assessment;
  }

  async getPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<PreOpAssessment[]> {
    if (surgeryIds.length === 0 || authorizedHospitalIds.length === 0) return [];
    
    // Join with surgeries to verify hospital access
    const results = await db
      .select({
        assessment: preOpAssessments,
      })
      .from(preOpAssessments)
      .innerJoin(surgeries, eq(preOpAssessments.surgeryId, surgeries.id))
      .where(
        and(
          inArray(preOpAssessments.surgeryId, surgeryIds),
          inArray(surgeries.hospitalId, authorizedHospitalIds)
        )
      );
    
    return results.map(r => r.assessment);
  }

  async createPreOpAssessment(assessment: InsertPreOpAssessment): Promise<PreOpAssessment> {
    const [created] = await db.insert(preOpAssessments).values(assessment).returning();
    return created;
  }

  async updatePreOpAssessment(id: string, updates: Partial<PreOpAssessment>): Promise<PreOpAssessment> {
    const [updated] = await db
      .update(preOpAssessments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(preOpAssessments.id, id))
      .returning();
    return updated;
  }

  // Clinical Snapshots operations (NEW: Point-based CRUD)
  
  /**
   * Get or create the clinical snapshot for an anesthesia record
   * NEW: Each record has ONE snapshot containing arrays of points
   */
  async getClinicalSnapshot(anesthesiaRecordId: string): Promise<ClinicalSnapshot> {
    const [snapshot] = await db
      .select()
      .from(clinicalSnapshots)
      .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId));
    
    if (snapshot) {
      return snapshot;
    }
    
    // Create empty snapshot if it doesn't exist
    const [created] = await db
      .insert(clinicalSnapshots)
      .values({
        anesthesiaRecordId,
        data: {},
      })
      .returning();
    
    return created;
  }

  /**
   * Add a vital point (HR, SpO2, Temp, etc.)
   */
  async addVitalPoint(
    anesthesiaRecordId: string,
    vitalType: string,
    timestamp: string,
    value: number
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    const currentPoints = (snapshot.data as any)[vitalType] || [];
    const updatedData = {
      ...snapshot.data,
      [vitalType]: [...currentPoints, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId))
      .returning();
    
    return updated;
  }

  /**
   * Add a BP point (systolic, diastolic, mean)
   */
  async addBPPoint(
    anesthesiaRecordId: string,
    timestamp: string,
    sys: number,
    dia: number,
    mean?: number
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      sys,
      dia,
      mean,
    };
    
    const currentBP = (snapshot.data as any).bp || [];
    const updatedData = {
      ...snapshot.data,
      bp: [...currentBP, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId))
      .returning();
    
    return updated;
  }

  /**
   * Update a vital point by ID
   */
  async updateVitalPoint(
    pointId: string,
    updates: { value?: number; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      let found = false;
      let updatedData = { ...data };
      
      // Check all vital types
      for (const vitalType of Object.keys(data)) {
        if (Array.isArray(data[vitalType])) {
          const pointIndex = data[vitalType].findIndex((p: any) => p.id === pointId);
          if (pointIndex !== -1) {
            found = true;
            const updatedPoints = [...data[vitalType]];
            updatedPoints[pointIndex] = {
              ...updatedPoints[pointIndex],
              ...updates,
            };
            // Re-sort after update
            updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
            updatedData[vitalType] = updatedPoints;
            break;
          }
        }
      }
      
      if (found) {
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Update a BP point by ID (special handling for sys/dia/mean)
   */
  async updateBPPoint(
    pointId: string,
    updates: { sys?: number; dia?: number; mean?: number; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const bpPoints = data.bp || [];
      const pointIndex = bpPoints.findIndex((p: any) => p.id === pointId);
      
      if (pointIndex !== -1) {
        const updatedPoints = [...bpPoints];
        updatedPoints[pointIndex] = {
          ...updatedPoints[pointIndex],
          ...updates,
        };
        // Re-sort after update
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          bp: updatedPoints,
        };
        
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Add a rhythm point (string value like "Sinus", "Atrial Fib")
   */
  async addRhythmPoint(
    anesthesiaRecordId: string,
    timestamp: string,
    value: string
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    const currentRhythm = (snapshot.data as any).heartRhythm || [];
    const updatedData = {
      ...snapshot.data,
      heartRhythm: [...currentRhythm, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId))
      .returning();
    
    return updated;
  }

  /**
   * Update a rhythm point by ID
   */
  async updateRhythmPoint(
    pointId: string,
    updates: { value?: string; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const heartRhythm = data.heartRhythm || [];
      
      const pointIndex = heartRhythm.findIndex((p: any) => p.id === pointId);
      if (pointIndex !== -1) {
        const updatedPoints = [...heartRhythm];
        updatedPoints[pointIndex] = {
          ...updatedPoints[pointIndex],
          ...updates,
        };
        // Re-sort after update
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          heartRhythm: updatedPoints,
        };
        
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Delete a rhythm point by ID
   */
  async deleteRhythmPoint(pointId: string): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const heartRhythm = data.heartRhythm || [];
      
      const filteredPoints = heartRhythm.filter((p: any) => p.id !== pointId);
      if (filteredPoints.length < heartRhythm.length) {
        const updatedData = {
          ...data,
          heartRhythm: filteredPoints,
        };
        
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Add a TOF point (Train of Four value with optional percentage)
   */
  async addTOFPoint(
    anesthesiaRecordId: string,
    timestamp: string,
    value: string,
    percentage?: number
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint: any = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    if (percentage !== undefined) {
      newPoint.percentage = percentage;
    }
    
    const currentTOF = (snapshot.data as any).tof || [];
    const updatedData = {
      ...snapshot.data,
      tof: [...currentTOF, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId))
      .returning();
    
    return updated;
  }

  /**
   * Update a TOF point by ID
   */
  async updateTOFPoint(
    pointId: string,
    updates: { value?: string; percentage?: number; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const tof = data.tof || [];
      
      const pointIndex = tof.findIndex((p: any) => p.id === pointId);
      if (pointIndex !== -1) {
        const updatedPoints = [...tof];
        updatedPoints[pointIndex] = {
          ...updatedPoints[pointIndex],
          ...updates,
        };
        // Re-sort after update
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          tof: updatedPoints,
        };
        
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Delete a TOF point by ID
   */
  async deleteTOFPoint(pointId: string): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const tof = data.tof || [];
      
      const filteredPoints = tof.filter((p: any) => p.id !== pointId);
      if (filteredPoints.length < tof.length) {
        const updatedData = {
          ...data,
          tof: filteredPoints,
        };
        
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  /**
   * Add a ventilation mode point
   */
  async addVentilationModePoint(
    anesthesiaRecordId: string,
    timestamp: string,
    value: string
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    const currentModes = (snapshot.data as any).ventilationModes || [];
    const updatedData = {
      ...snapshot.data,
      ventilationModes: [...currentModes, newPoint],
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Update a ventilation mode point
   */
  async updateVentilationModePoint(
    anesthesiaRecordId: string,
    pointId: string,
    updates: { value?: string; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    const ventilationModes = data.ventilationModes || [];
    
    const pointIndex = ventilationModes.findIndex((p: any) => p.id === pointId);
    if (pointIndex === -1) {
      return null; // Point not found in this snapshot
    }
    
    const updatedPoints = [...ventilationModes];
    updatedPoints[pointIndex] = {
      ...updatedPoints[pointIndex],
      ...updates,
    };
    
    const updatedData = {
      ...data,
      ventilationModes: updatedPoints,
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Delete a ventilation mode point
   */
  async deleteVentilationModePoint(anesthesiaRecordId: string, pointId: string): Promise<ClinicalSnapshot | null> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    const ventilationModes = data.ventilationModes || [];
    
    const filteredPoints = ventilationModes.filter((p: any) => p.id !== pointId);
    if (filteredPoints.length >= ventilationModes.length) {
      return null; // Point not found in this snapshot
    }
    
    const updatedData = {
      ...data,
      ventilationModes: filteredPoints,
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Add bulk ventilation parameters in a single transaction
   * This is optimized for the ventilation bulk entry dialog
   */
  async addBulkVentilationParameters(
    anesthesiaRecordId: string,
    timestamp: string,
    ventilationMode: string | null,
    parameters: {
      peep?: number;
      fio2?: number;
      tidalVolume?: number;
      respiratoryRate?: number;
      minuteVolume?: number;
      etco2?: number;
      pip?: number;
    }
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    
    // Build updated data object
    const updatedData = { ...data };
    
    // Add ventilation mode if provided
    if (ventilationMode) {
      const currentModes = data.ventilationModes || [];
      const newModePoint = {
        id: randomUUID(),
        timestamp,
        value: ventilationMode,
      };
      updatedData.ventilationModes = [...currentModes, newModePoint].sort((a, b) => 
        a.timestamp.localeCompare(b.timestamp)
      );
    }
    
    // Add each parameter that has a value
    const vitalTypeMap = {
      peep: 'peep',
      fio2: 'fio2',
      tidalVolume: 'tidalVolume',
      respiratoryRate: 'respiratoryRate',
      minuteVolume: 'minuteVolume',
      etco2: 'etco2',
      pip: 'pip',
    };
    
    for (const [paramKey, vitalType] of Object.entries(vitalTypeMap)) {
      const value = parameters[paramKey as keyof typeof parameters];
      if (value !== undefined && value !== null) {
        const currentPoints = data[vitalType] || [];
        const newPoint = {
          id: randomUUID(),
          timestamp,
          value,
        };
        updatedData[vitalType] = [...currentPoints, newPoint].sort((a, b) => 
          a.timestamp.localeCompare(b.timestamp)
        );
      }
    }
    
    // Single database update with all changes
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Add an output point
   */
  async addOutputPoint(
    anesthesiaRecordId: string,
    paramKey: string,
    timestamp: string,
    value: number
  ): Promise<ClinicalSnapshot> {
    // Guard against falsy paramKey
    if (!paramKey) {
      throw new Error('paramKey is required for addOutputPoint');
    }
    
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    const currentPoints = (snapshot.data as any)[paramKey] || [];
    const updatedData = {
      ...snapshot.data,
      [paramKey]: [...currentPoints, newPoint],
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Update an output point
   */
  async updateOutputPoint(
    anesthesiaRecordId: string,
    paramKey: string,
    pointId: string,
    updates: { value?: number; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    // Guard against falsy paramKey
    if (!paramKey) {
      throw new Error('paramKey is required for updateOutputPoint');
    }
    
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    const points = data[paramKey] || [];
    
    const pointIndex = points.findIndex((p: any) => p.id === pointId);
    if (pointIndex === -1) {
      return null; // Point not found in this snapshot
    }
    
    const updatedPoints = [...points];
    updatedPoints[pointIndex] = {
      ...updatedPoints[pointIndex],
      ...updates,
    };
    
    const updatedData = {
      ...data,
      [paramKey]: updatedPoints,
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Delete an output point
   */
  async deleteOutputPoint(
    anesthesiaRecordId: string,
    paramKey: string,
    pointId: string
  ): Promise<ClinicalSnapshot | null> {
    // Guard against falsy paramKey
    if (!paramKey) {
      throw new Error('paramKey is required for deleteOutputPoint');
    }
    
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    const points = data[paramKey] || [];
    
    const filteredPoints = points.filter((p: any) => p.id !== pointId);
    if (filteredPoints.length >= points.length) {
      return null; // Point not found in this snapshot
    }
    
    const updatedData = {
      ...data,
      [paramKey]: filteredPoints,
    };
    
    const [updated] = await db
      .update(clinicalSnapshots)
      .set({ 
        data: updatedData,
        updatedAt: new Date(),
      })
      .where(eq(clinicalSnapshots.id, snapshot.id))
      .returning();
    
    return updated;
  }

  /**
   * Delete a vital point by ID
   */
  async deleteVitalPoint(pointId: string): Promise<ClinicalSnapshot | null> {
    // Find which snapshot contains this point
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      let found = false;
      let updatedData = { ...data };
      
      // Check all vital types
      for (const vitalType of Object.keys(data)) {
        if (Array.isArray(data[vitalType])) {
          const filteredPoints = data[vitalType].filter((p: any) => p.id !== pointId);
          if (filteredPoints.length < data[vitalType].length) {
            found = true;
            updatedData[vitalType] = filteredPoints;
            break;
          }
        }
      }
      
      if (found) {
        const [updated] = await db
          .update(clinicalSnapshots)
          .set({ 
            data: updatedData,
            updatedAt: new Date(),
          })
          .where(eq(clinicalSnapshots.id, snapshot.id))
          .returning();
        
        return updated;
      }
    }
    
    return null; // Point not found
  }

  // Legacy methods for backward compatibility (will be removed after migration)
  async getVitalsSnapshots(anesthesiaRecordId: string): Promise<VitalsSnapshot[]> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    // Convert new point-based format to old multi-row snapshot format
    // New format: { data: { hr: [{id, timestamp, value}], bp: [{id, timestamp, sys, dia}], ... } }
    // Old format: [{ timestamp, data: { hr, spo2, sysBP, diaBP } }, ...]
    
    const snapshotData = snapshot.data as any || {};
    const timestampMap = new Map<string, any>();
    
    // Process HR points
    if (snapshotData.hr && Array.isArray(snapshotData.hr)) {
      snapshotData.hr.forEach((point: any) => {
        const existing = timestampMap.get(point.timestamp) || {};
        timestampMap.set(point.timestamp, { ...existing, hr: point.value });
      });
    }
    
    // Process SpO2 points
    if (snapshotData.spo2 && Array.isArray(snapshotData.spo2)) {
      snapshotData.spo2.forEach((point: any) => {
        const existing = timestampMap.get(point.timestamp) || {};
        timestampMap.set(point.timestamp, { ...existing, spo2: point.value });
      });
    }
    
    // Process BP points
    if (snapshotData.bp && Array.isArray(snapshotData.bp)) {
      snapshotData.bp.forEach((point: any) => {
        const existing = timestampMap.get(point.timestamp) || {};
        timestampMap.set(point.timestamp, { 
          ...existing, 
          sysBP: point.sys, 
          diaBP: point.dia,
          meanBP: point.mean,
        });
      });
    }
    
    // Convert map to array of snapshots
    const snapshots = Array.from(timestampMap.entries()).map(([timestamp, data]) => ({
      id: randomUUID(), // Generate temp ID for compatibility
      anesthesiaRecordId,
      timestamp,
      data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    
    // Sort by timestamp
    snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    
    return snapshots;
  }

  async createVitalsSnapshot(snapshot: InsertVitalsSnapshot): Promise<VitalsSnapshot> {
    // Legacy method - redirect to new structure
    // This is a temporary bridge during migration
    return await this.getClinicalSnapshot(snapshot.anesthesiaRecordId) as any;
  }

  // Anesthesia Medication operations
  async getAnesthesiaMedications(anesthesiaRecordId: string): Promise<AnesthesiaMedication[]> {
    const medications = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(asc(anesthesiaMedications.timestamp));
    return medications;
  }

  async createAnesthesiaMedication(medication: InsertAnesthesiaMedication): Promise<AnesthesiaMedication> {
    const [created] = await db.insert(anesthesiaMedications).values(medication).returning();
    return created;
  }

  async updateAnesthesiaMedication(id: string, updates: Partial<AnesthesiaMedication>): Promise<AnesthesiaMedication> {
    const [updated] = await db
      .update(anesthesiaMedications)
      .set(updates)
      .where(eq(anesthesiaMedications.id, id))
      .returning();
    return updated;
  }

  async deleteAnesthesiaMedication(id: string, userId: string): Promise<void> {
    // Get current medication for audit log
    const [currentMedication] = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.id, id));

    // Delete the medication
    await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.id, id));

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_medication',
      recordId: id,
      action: 'delete',
      userId,
      oldValue: currentMedication,
      newValue: null,
    });
  }

  // Anesthesia Event operations
  async getAnesthesiaEvents(anesthesiaRecordId: string): Promise<AnesthesiaEvent[]> {
    const events = await db
      .select()
      .from(anesthesiaEvents)
      .where(eq(anesthesiaEvents.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(asc(anesthesiaEvents.timestamp));
    return events;
  }

  async createAnesthesiaEvent(event: InsertAnesthesiaEvent): Promise<AnesthesiaEvent> {
    const [created] = await db.insert(anesthesiaEvents).values(event).returning();
    return created;
  }

  async updateAnesthesiaEvent(id: string, event: Partial<InsertAnesthesiaEvent>, userId: string): Promise<AnesthesiaEvent> {
    // Get current event for audit log
    const [currentEvent] = await db
      .select()
      .from(anesthesiaEvents)
      .where(eq(anesthesiaEvents.id, id));

    // Guard: Throw error if event doesn't exist
    if (!currentEvent) {
      throw new Error(`Event with id ${id} not found`);
    }

    // Update the event
    const [updated] = await db
      .update(anesthesiaEvents)
      .set(event)
      .where(eq(anesthesiaEvents.id, id))
      .returning();

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_event',
      recordId: id,
      action: 'update',
      userId,
      oldValue: currentEvent,
      newValue: updated,
    });

    return updated;
  }

  async deleteAnesthesiaEvent(id: string, userId: string): Promise<void> {
    // Get current event for audit log
    const [currentEvent] = await db
      .select()
      .from(anesthesiaEvents)
      .where(eq(anesthesiaEvents.id, id));

    // Guard: Throw error if event doesn't exist
    if (!currentEvent) {
      throw new Error(`Event with id ${id} not found`);
    }

    // Delete the event
    await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_event',
      recordId: id,
      action: 'delete',
      userId,
      oldValue: currentEvent,
      newValue: null,
    });
  }

  // Anesthesia Position operations
  async getAnesthesiaPositions(anesthesiaRecordId: string): Promise<AnesthesiaPosition[]> {
    const positions = await db
      .select()
      .from(anesthesiaPositions)
      .where(eq(anesthesiaPositions.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(asc(anesthesiaPositions.timestamp));
    return positions;
  }

  async createAnesthesiaPosition(position: InsertAnesthesiaPosition): Promise<AnesthesiaPosition> {
    const [created] = await db.insert(anesthesiaPositions).values(position).returning();
    return created;
  }

  async updateAnesthesiaPosition(id: string, position: Partial<InsertAnesthesiaPosition>, userId: string): Promise<AnesthesiaPosition> {
    // Get current position for audit log
    const [currentPosition] = await db
      .select()
      .from(anesthesiaPositions)
      .where(eq(anesthesiaPositions.id, id));

    // Guard: Throw error if position doesn't exist
    if (!currentPosition) {
      throw new Error(`Position with id ${id} not found`);
    }

    // Update the position
    const [updated] = await db
      .update(anesthesiaPositions)
      .set(position)
      .where(eq(anesthesiaPositions.id, id))
      .returning();

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_position',
      recordId: id,
      action: 'update',
      userId,
      oldValue: currentPosition,
      newValue: updated,
    });

    return updated;
  }

  async deleteAnesthesiaPosition(id: string, userId: string): Promise<void> {
    // Get current position for audit log
    const [currentPosition] = await db
      .select()
      .from(anesthesiaPositions)
      .where(eq(anesthesiaPositions.id, id));

    // Guard: Throw error if position doesn't exist
    if (!currentPosition) {
      throw new Error(`Position with id ${id} not found`);
    }

    // Delete the position
    await db.delete(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_position',
      recordId: id,
      action: 'delete',
      userId,
      oldValue: currentPosition,
      newValue: null,
    });
  }

  // Anesthesia Staff operations
  async getAnesthesiaStaff(anesthesiaRecordId: string): Promise<AnesthesiaStaff[]> {
    const staff = await db
      .select()
      .from(anesthesiaStaff)
      .where(eq(anesthesiaStaff.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(asc(anesthesiaStaff.timestamp));
    return staff;
  }

  async createAnesthesiaStaff(staff: InsertAnesthesiaStaff): Promise<AnesthesiaStaff> {
    const [created] = await db.insert(anesthesiaStaff).values(staff).returning();
    return created;
  }

  async updateAnesthesiaStaff(id: string, staff: Partial<InsertAnesthesiaStaff>, userId: string): Promise<AnesthesiaStaff> {
    // Get current staff for audit log
    const [currentStaff] = await db
      .select()
      .from(anesthesiaStaff)
      .where(eq(anesthesiaStaff.id, id));

    // Guard: Throw error if staff doesn't exist
    if (!currentStaff) {
      throw new Error(`Staff with id ${id} not found`);
    }

    // Update the staff
    const [updated] = await db
      .update(anesthesiaStaff)
      .set(staff)
      .where(eq(anesthesiaStaff.id, id))
      .returning();

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_staff',
      recordId: id,
      action: 'update',
      userId,
      oldValue: currentStaff,
      newValue: updated,
    });

    return updated;
  }

  async deleteAnesthesiaStaff(id: string, userId: string): Promise<void> {
    // Get current staff for audit log
    const [currentStaff] = await db
      .select()
      .from(anesthesiaStaff)
      .where(eq(anesthesiaStaff.id, id));

    // Guard: Throw error if staff doesn't exist
    if (!currentStaff) {
      throw new Error(`Staff with id ${id} not found`);
    }

    // Delete the staff
    await db.delete(anesthesiaStaff).where(eq(anesthesiaStaff.id, id));

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'anesthesia_staff',
      recordId: id,
      action: 'delete',
      userId,
      oldValue: currentStaff,
      newValue: null,
    });
  }

  // Anesthesia Installation operations
  async getAnesthesiaInstallations(anesthesiaRecordId: string): Promise<AnesthesiaInstallation[]> {
    const installations = await db
      .select()
      .from(anesthesiaInstallations)
      .where(eq(anesthesiaInstallations.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(anesthesiaInstallations.createdAt);
    return installations;
  }

  async createAnesthesiaInstallation(installation: InsertAnesthesiaInstallation): Promise<AnesthesiaInstallation> {
    const [created] = await db.insert(anesthesiaInstallations).values(installation).returning();
    return created;
  }

  async updateAnesthesiaInstallation(id: string, updates: Partial<AnesthesiaInstallation>): Promise<AnesthesiaInstallation> {
    const [updated] = await db
      .update(anesthesiaInstallations)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anesthesiaInstallations.id, id))
      .returning();
    return updated;
  }

  async deleteAnesthesiaInstallation(id: string): Promise<void> {
    await db.delete(anesthesiaInstallations).where(eq(anesthesiaInstallations.id, id));
  }

  // Anesthesia Technique Detail operations
  async getAnesthesiaTechniqueDetails(anesthesiaRecordId: string): Promise<AnesthesiaTechniqueDetail[]> {
    const details = await db
      .select()
      .from(anesthesiaTechniqueDetails)
      .where(eq(anesthesiaTechniqueDetails.anesthesiaRecordId, anesthesiaRecordId));
    return details;
  }

  async getAnesthesiaTechniqueDetail(anesthesiaRecordId: string, technique: string): Promise<AnesthesiaTechniqueDetail | undefined> {
    const [detail] = await db
      .select()
      .from(anesthesiaTechniqueDetails)
      .where(
        and(
          eq(anesthesiaTechniqueDetails.anesthesiaRecordId, anesthesiaRecordId),
          eq(anesthesiaTechniqueDetails.technique, technique)
        )
      );
    return detail;
  }

  async upsertAnesthesiaTechniqueDetail(detail: InsertAnesthesiaTechniqueDetail): Promise<AnesthesiaTechniqueDetail> {
    const [upserted] = await db
      .insert(anesthesiaTechniqueDetails)
      .values(detail)
      .onConflictDoUpdate({
        target: [anesthesiaTechniqueDetails.anesthesiaRecordId, anesthesiaTechniqueDetails.technique],
        set: {
          details: detail.details,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteAnesthesiaTechniqueDetail(id: string): Promise<void> {
    await db.delete(anesthesiaTechniqueDetails).where(eq(anesthesiaTechniqueDetails.id, id));
  }

  // Anesthesia Airway Management operations
  async getAirwayManagement(anesthesiaRecordId: string): Promise<AnesthesiaAirwayManagement | undefined> {
    const [airway] = await db
      .select()
      .from(anesthesiaAirwayManagement)
      .where(eq(anesthesiaAirwayManagement.anesthesiaRecordId, anesthesiaRecordId));
    return airway;
  }

  async upsertAirwayManagement(airway: InsertAnesthesiaAirwayManagement): Promise<AnesthesiaAirwayManagement> {
    const [upserted] = await db
      .insert(anesthesiaAirwayManagement)
      .values(airway)
      .onConflictDoUpdate({
        target: anesthesiaAirwayManagement.anesthesiaRecordId,
        set: {
          airwayDevice: airway.airwayDevice,
          size: airway.size,
          depth: airway.depth,
          cuffPressure: airway.cuffPressure,
          intubationPreExisting: airway.intubationPreExisting,
          notes: airway.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteAirwayManagement(anesthesiaRecordId: string): Promise<void> {
    await db.delete(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.anesthesiaRecordId, anesthesiaRecordId));
  }

  // Anesthesia General Technique operations
  async getGeneralTechnique(anesthesiaRecordId: string): Promise<AnesthesiaGeneralTechnique | undefined> {
    const [technique] = await db
      .select()
      .from(anesthesiaGeneralTechnique)
      .where(eq(anesthesiaGeneralTechnique.anesthesiaRecordId, anesthesiaRecordId));
    return technique;
  }

  async upsertGeneralTechnique(technique: InsertAnesthesiaGeneralTechnique): Promise<AnesthesiaGeneralTechnique> {
    const [upserted] = await db
      .insert(anesthesiaGeneralTechnique)
      .values(technique)
      .onConflictDoUpdate({
        target: anesthesiaGeneralTechnique.anesthesiaRecordId,
        set: {
          approach: technique.approach,
          rsi: technique.rsi,
          sedationLevel: technique.sedationLevel,
          airwaySupport: technique.airwaySupport,
          notes: technique.notes,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteGeneralTechnique(anesthesiaRecordId: string): Promise<void> {
    await db.delete(anesthesiaGeneralTechnique).where(eq(anesthesiaGeneralTechnique.anesthesiaRecordId, anesthesiaRecordId));
  }

  // Anesthesia Neuraxial Blocks operations
  async getNeuraxialBlocks(anesthesiaRecordId: string): Promise<AnesthesiaNeuraxialBlock[]> {
    const blocks = await db
      .select()
      .from(anesthesiaNeuraxialBlocks)
      .where(eq(anesthesiaNeuraxialBlocks.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(anesthesiaNeuraxialBlocks.createdAt);
    return blocks;
  }

  async createNeuraxialBlock(block: InsertAnesthesiaNeuraxialBlock): Promise<AnesthesiaNeuraxialBlock> {
    const [created] = await db.insert(anesthesiaNeuraxialBlocks).values(block).returning();
    return created;
  }

  async updateNeuraxialBlock(id: string, updates: Partial<AnesthesiaNeuraxialBlock>): Promise<AnesthesiaNeuraxialBlock> {
    const [updated] = await db
      .update(anesthesiaNeuraxialBlocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anesthesiaNeuraxialBlocks.id, id))
      .returning();
    return updated;
  }

  async deleteNeuraxialBlock(id: string): Promise<void> {
    await db.delete(anesthesiaNeuraxialBlocks).where(eq(anesthesiaNeuraxialBlocks.id, id));
  }

  // Anesthesia Peripheral Blocks operations
  async getPeripheralBlocks(anesthesiaRecordId: string): Promise<AnesthesiaPeripheralBlock[]> {
    const blocks = await db
      .select()
      .from(anesthesiaPeripheralBlocks)
      .where(eq(anesthesiaPeripheralBlocks.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(anesthesiaPeripheralBlocks.createdAt);
    return blocks;
  }

  async createPeripheralBlock(block: InsertAnesthesiaPeripheralBlock): Promise<AnesthesiaPeripheralBlock> {
    const [created] = await db.insert(anesthesiaPeripheralBlocks).values(block).returning();
    return created;
  }

  async updatePeripheralBlock(id: string, updates: Partial<AnesthesiaPeripheralBlock>): Promise<AnesthesiaPeripheralBlock> {
    const [updated] = await db
      .update(anesthesiaPeripheralBlocks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anesthesiaPeripheralBlocks.id, id))
      .returning();
    return updated;
  }

  async deletePeripheralBlock(id: string): Promise<void> {
    await db.delete(anesthesiaPeripheralBlocks).where(eq(anesthesiaPeripheralBlocks.id, id));
  }

  // Inventory Usage operations
  async getInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]> {
    const usage = await db
      .select()
      .from(inventoryUsage)
      .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
    return usage;
  }

  async getInventoryUsageById(id: string): Promise<InventoryUsage | null> {
    const [usage] = await db
      .select()
      .from(inventoryUsage)
      .where(eq(inventoryUsage.id, id));
    return usage || null;
  }

  async calculateInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]> {
    // Get all medications for this anesthesia record
    const medications = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecordId));

    // Get item details to access ampule content for calculations
    const itemIds = [...new Set(medications.map(m => m.itemId))];
    const itemsData = await db
      .select()
      .from(items)
      .where(sql`${items.id} IN (${sql.join(itemIds.map(id => sql`${id}`), sql`, `)})`);
    
    const itemsMap = new Map(itemsData.map(item => [item.id, item]));

    // Calculate quantity used per item based on administration type
    const usageMap = new Map<string, number>();
    
    for (const med of medications) {
      const item = itemsMap.get(med.itemId);
      if (!item) continue;

      const currentQty = usageMap.get(med.itemId) || 0;
      let calculatedQty = 0;

      // Parse ampule content (e.g., "10 ml" -> 10)
      const ampuleContent = parseFloat(item.ampuleTotalContent || '1');

      if (med.type === 'bolus') {
        // Bolus: ceil(dose / ampule content) + 1 for safety margin
        const dose = parseFloat(med.dose || '0');
        calculatedQty = Math.ceil(dose / ampuleContent) + 1;
      } else if (med.type === 'infusion' && med.infusionType === 'freeFlow') {
        // Free-flow: use dose amount directly (dose is already in ampules)
        calculatedQty = parseFloat(med.dose || '0');
      } else if (med.type === 'infusion' && med.infusionType === 'rate') {
        // Rate-controlled: ceil(rate × duration / ampule content)
        const rate = parseFloat(med.rate || '0');
        const startTime = med.timestamp ? new Date(med.timestamp).getTime() : 0;
        const endTime = med.endTime ? new Date(med.endTime).getTime() : Date.now();
        const durationHours = (endTime - startTime) / (1000 * 60 * 60);
        
        calculatedQty = Math.ceil((rate * durationHours) / ampuleContent);
      }

      usageMap.set(med.itemId, currentQty + calculatedQty);
    }

    // Upsert inventory usage records
    const usageRecords: InventoryUsage[] = [];
    
    for (const [itemId, calculatedQty] of Array.from(usageMap.entries())) {
      const [upserted] = await db
        .insert(inventoryUsage)
        .values({
          anesthesiaRecordId,
          itemId,
          calculatedQty: calculatedQty.toFixed(2),
        })
        .onConflictDoUpdate({
          target: [inventoryUsage.anesthesiaRecordId, inventoryUsage.itemId],
          set: {
            calculatedQty: calculatedQty.toFixed(2),
            updatedAt: new Date(),
          },
          // Only update if not manually overridden (overrideQty is null)
          where: sql`${inventoryUsage.overrideQty} IS NULL`,
        })
        .returning();
      
      if (upserted) {
        usageRecords.push(upserted);
      }
    }

    return usageRecords;
  }

  async updateInventoryUsage(
    id: string,
    overrideQty: number,
    overrideReason: string,
    overriddenBy: string
  ): Promise<InventoryUsage> {
    const [updated] = await db
      .update(inventoryUsage)
      .set({
        overrideQty: overrideQty.toFixed(2),
        overrideReason,
        overriddenBy,
        overriddenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(inventoryUsage.id, id))
      .returning();
    return updated;
  }

  async clearInventoryOverride(id: string): Promise<InventoryUsage> {
    const [updated] = await db
      .update(inventoryUsage)
      .set({
        overrideQty: null,
        overrideReason: null,
        overriddenBy: null,
        overriddenAt: null,
        updatedAt: new Date(),
      })
      .where(eq(inventoryUsage.id, id))
      .returning();
    return updated;
  }

  // Audit Trail operations
  async getAuditTrail(recordType: string, recordId: string): Promise<AuditTrail[]> {
    const trail = await db
      .select()
      .from(auditTrail)
      .where(
        and(
          eq(auditTrail.recordType, recordType),
          eq(auditTrail.recordId, recordId)
        )
      )
      .orderBy(desc(auditTrail.timestamp));
    return trail;
  }

  async createAuditLog(log: InsertAuditTrail): Promise<void> {
    await db.insert(auditTrail).values(log);
  }
}

export const storage = new DatabaseStorage();
export { db };
