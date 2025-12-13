import {
  users,
  hospitals,
  userHospitalRoles,
  vendors,
  units,
  folders,
  items,
  itemCodes,
  supplierCodes,
  supplierCatalogs,
  priceSyncJobs,
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
  checklistDismissals,
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
  surgeryStaffEntries,
  anesthesiaInstallations,
  anesthesiaTechniqueDetails,
  anesthesiaAirwayManagement,
  difficultAirwayReports,
  anesthesiaGeneralTechnique,
  anesthesiaNeuraxialBlocks,
  anesthesiaPeripheralBlocks,
  inventoryUsage,
  inventoryCommits,
  auditTrail,
  surgeonChecklistTemplates,
  surgeonChecklistTemplateItems,
  surgeryPreOpChecklistEntries,
  // Chat module tables
  chatConversations,
  chatParticipants,
  chatMessages,
  chatMentions,
  chatAttachments,
  chatNotifications,
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
  type ItemCode,
  type InsertItemCode,
  type SupplierCode,
  type InsertSupplierCode,
  type SupplierCatalog,
  type PriceSyncJob,
  type InsertLot,
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
  type ChecklistDismissal,
  type InsertChecklistDismissal,
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
  type SurgeryStaffEntry,
  type InsertSurgeryStaffEntry,
  type AnesthesiaInstallation,
  type InsertAnesthesiaInstallation,
  type AnesthesiaTechniqueDetail,
  type InsertAnesthesiaTechniqueDetail,
  type AnesthesiaAirwayManagement,
  type InsertAnesthesiaAirwayManagement,
  type DifficultAirwayReport,
  type InsertDifficultAirwayReport,
  type AnesthesiaGeneralTechnique,
  type InsertAnesthesiaGeneralTechnique,
  type AnesthesiaNeuraxialBlock,
  type InsertAnesthesiaNeuraxialBlock,
  type AnesthesiaPeripheralBlock,
  type InsertAnesthesiaPeripheralBlock,
  type InventoryUsage,
  type InsertInventoryUsage,
  type InventoryCommit,
  type InsertInventoryCommit,
  type AuditTrail,
  type InsertAuditTrail,
  type SurgeonChecklistTemplate,
  type InsertSurgeonChecklistTemplate,
  type SurgeonChecklistTemplateItem,
  type SurgeryPreOpChecklistEntry,
  // Chat module types
  type ChatConversation,
  type InsertChatConversation,
  type ChatParticipant,
  type InsertChatParticipant,
  type ChatMessage,
  type InsertChatMessage,
  type ChatMention,
  type InsertChatMention,
  type ChatAttachment,
  type InsertChatAttachment,
  type ChatNotification,
  type InsertChatNotification,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, lte, gte, or, ilike, isNull } from "drizzle-orm";
import { calculateInventoryForMedication, calculateRateControlledAmpules, calculateRateControlledVolume, volumeToAmpules } from "./services/inventoryCalculations";
import { encryptCredential, decryptCredential } from "./utils/encryption";

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Hospital operations
  getHospital(id: string): Promise<Hospital | undefined>;
  getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean })[]>;
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
  updateLot(id: string, updates: Partial<Lot>): Promise<Lot>;
  deleteLot(id: string): Promise<void>;
  
  // Item Code operations (universal product identifiers)
  getItemCode(itemId: string): Promise<ItemCode | undefined>;
  createItemCode(code: InsertItemCode): Promise<ItemCode>;
  updateItemCode(itemId: string, updates: Partial<ItemCode>): Promise<ItemCode>;
  deleteItemCode(itemId: string): Promise<void>;
  
  // Supplier Code operations (supplier-specific article numbers)
  getSupplierCodes(itemId: string): Promise<SupplierCode[]>;
  getSupplierCode(id: string): Promise<SupplierCode | undefined>;
  createSupplierCode(code: InsertSupplierCode): Promise<SupplierCode>;
  updateSupplierCode(id: string, updates: Partial<SupplierCode>): Promise<SupplierCode>;
  deleteSupplierCode(id: string): Promise<void>;
  setPreferredSupplier(itemId: string, supplierId: string): Promise<void>;
  getPendingSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]>;
  
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
  dismissChecklist(dismissal: InsertChecklistDismissal): Promise<ChecklistDismissal>;
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
  archivePatient(id: string, userId: string): Promise<Patient>;
  unarchivePatient(id: string): Promise<Patient>;
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
  archiveSurgery(id: string, userId: string): Promise<Surgery>;
  unarchiveSurgery(id: string): Promise<Surgery>;
  
  // Anesthesia Record operations
  getAnesthesiaRecord(surgeryId: string): Promise<AnesthesiaRecord | undefined>;
  getAnesthesiaRecordById(id: string): Promise<AnesthesiaRecord | undefined>;
  getAllAnesthesiaRecordsForSurgery(surgeryId: string): Promise<AnesthesiaRecord[]>;
  getAnesthesiaRecordDataCounts(recordId: string): Promise<{ vitals: number; medications: number; events: number }>;
  createAnesthesiaRecord(record: InsertAnesthesiaRecord): Promise<AnesthesiaRecord>;
  updateAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>): Promise<AnesthesiaRecord>;
  deleteAnesthesiaRecord(id: string): Promise<void>;
  closeAnesthesiaRecord(id: string, closedBy: string): Promise<AnesthesiaRecord>;
  amendAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>, reason: string, userId: string): Promise<AnesthesiaRecord>;
  lockAnesthesiaRecord(id: string, userId: string): Promise<AnesthesiaRecord>;
  unlockAnesthesiaRecord(id: string, userId: string, reason: string): Promise<AnesthesiaRecord>;
  getPacuPatients(hospitalId: string): Promise<Array<{
    anesthesiaRecordId: string;
    surgeryId: string;
    patientId: string;
    patientName: string;
    patientNumber: string;
    age: number;
    procedure: string;
    anesthesiaPresenceEndTime: number;
    postOpDestination: string | null;
    status: 'transferring' | 'in_recovery' | 'discharged';
    statusTimestamp: number;
  }>>;
  
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
  updateBulkVentilationParameters(
    anesthesiaRecordId: string,
    originalTimestamp: string,
    newTimestamp: string,
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
  deleteBulkVentilationParameters(
    anesthesiaRecordId: string,
    timestamp: string
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
  getRunningRateControlledInfusions(): Promise<AnesthesiaMedication[]>;
  
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
  
  // Surgery Staff operations (unified for both anesthesia and surgery modules)
  getSurgeryStaff(anesthesiaRecordId: string): Promise<SurgeryStaffEntry[]>;
  createSurgeryStaff(staff: InsertSurgeryStaffEntry): Promise<SurgeryStaffEntry>;
  updateSurgeryStaff(id: string, staff: Partial<InsertSurgeryStaffEntry>, userId: string): Promise<SurgeryStaffEntry>;
  deleteSurgeryStaff(id: string, userId: string): Promise<void>;
  
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
  
  // Difficult Airway Report operations
  getDifficultAirwayReport(airwayManagementId: string): Promise<DifficultAirwayReport | undefined>;
  upsertDifficultAirwayReport(report: InsertDifficultAirwayReport): Promise<DifficultAirwayReport>;
  deleteDifficultAirwayReport(airwayManagementId: string): Promise<void>;
  
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
  
  // Inventory Commit operations
  commitInventoryUsage(anesthesiaRecordId: string, userId: string, signature: string | null, patientName: string | null, patientId: string | null, unitId?: string | null): Promise<any>;
  getInventoryCommits(anesthesiaRecordId: string, unitId?: string | null): Promise<any[]>;
  getInventoryCommitById(commitId: string): Promise<any | null>;
  rollbackInventoryCommit(commitId: string, userId: string, reason: string): Promise<any>;
  
  // Audit Trail operations
  getAuditTrail(recordType: string, recordId: string): Promise<AuditTrail[]>;
  createAuditLog(log: InsertAuditTrail): Promise<void>;
  
  // Surgeon Checklist Template operations
  getSurgeonChecklistTemplates(hospitalId: string, userId?: string): Promise<SurgeonChecklistTemplate[]>;
  getSurgeonChecklistTemplate(id: string): Promise<(SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }) | undefined>;
  createSurgeonChecklistTemplate(template: InsertSurgeonChecklistTemplate): Promise<SurgeonChecklistTemplate>;
  updateSurgeonChecklistTemplate(id: string, updates: Partial<SurgeonChecklistTemplate>, items?: { id?: string; label: string; sortOrder: number }[]): Promise<SurgeonChecklistTemplate>;
  deleteSurgeonChecklistTemplate(id: string): Promise<void>;
  
  // Surgery Pre-Op Checklist operations
  getSurgeryPreOpChecklist(surgeryId: string): Promise<{ templateId: string | null; entries: SurgeryPreOpChecklistEntry[] }>;
  saveSurgeryPreOpChecklist(surgeryId: string, templateId: string, entries: { itemId: string; checked: boolean; note?: string | null }[]): Promise<SurgeryPreOpChecklistEntry[]>;
  
  // ========== CHAT MODULE OPERATIONS ==========
  
  // Chat Conversation operations
  getConversations(userId: string, hospitalId: string): Promise<(ChatConversation & { 
    participants: (ChatParticipant & { user: User })[]; 
    lastMessage?: ChatMessage; 
    unreadCount: number 
  })[]>;
  getConversation(id: string): Promise<(ChatConversation & { 
    participants: (ChatParticipant & { user: User })[] 
  }) | undefined>;
  createConversation(conversation: InsertChatConversation & { creatorId: string }): Promise<ChatConversation>;
  updateConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation>;
  deleteConversation(id: string): Promise<void>;
  getOrCreateSelfConversation(userId: string, hospitalId: string): Promise<ChatConversation>;
  findDirectConversation(userId1: string, userId2: string, hospitalId: string): Promise<ChatConversation | undefined>;
  
  // Chat Participant operations
  addParticipant(conversationId: string, userId: string, role?: string): Promise<ChatParticipant>;
  removeParticipant(conversationId: string, userId: string): Promise<void>;
  updateParticipant(id: string, updates: Partial<ChatParticipant>): Promise<ChatParticipant>;
  markConversationRead(conversationId: string, userId: string): Promise<void>;
  
  // Chat Message operations
  getMessages(conversationId: string, limit?: number, before?: Date): Promise<(ChatMessage & { 
    sender: User; 
    mentions: ChatMention[]; 
    attachments: ChatAttachment[] 
  })[]>;
  getMessage(id: string): Promise<ChatMessage | undefined>;
  createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage>;
  updateMessage(id: string, content: string): Promise<ChatMessage>;
  deleteMessage(id: string): Promise<ChatMessage>;
  
  // Chat Mention operations
  createMention(mention: InsertChatMention): Promise<ChatMention>;
  getMentionsForUser(userId: string, hospitalId: string, unreadOnly?: boolean): Promise<(ChatMention & { message: ChatMessage })[]>;
  
  // Chat Attachment operations
  createAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment>;
  updateAttachment(id: string, updates: Partial<ChatAttachment>): Promise<ChatAttachment>;
  getAttachment(id: string): Promise<ChatAttachment | undefined>;
  
  // Chat Notification operations
  createNotification(notification: InsertChatNotification): Promise<ChatNotification>;
  getUnreadNotifications(userId: string): Promise<ChatNotification[]>;
  markNotificationRead(id: string): Promise<ChatNotification>;
  markNotificationEmailSent(id: string): Promise<ChatNotification>;
  getUnsentEmailNotifications(limit?: number): Promise<(ChatNotification & { user: User; conversation: ChatConversation })[]>;
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

  async getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean })[]> {
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
      isBusinessModule: row.units.isBusinessModule ?? false,
      isClinicModule: row.units.isClinicModule ?? false,
    })) as (Hospital & { role: string; unitId: string; unitName: string; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean })[];
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
      .leftJoin(stockLevels, and(eq(items.id, stockLevels.itemId), eq(stockLevels.unitId, unitId)))
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
      
      // 4. Delete anesthesia medications that reference this item
      await tx.delete(anesthesiaMedications).where(eq(anesthesiaMedications.itemId, id));
      
      // 5. Delete inventory usage records that reference this item
      await tx.delete(inventoryUsage).where(eq(inventoryUsage.itemId, id));
      
      // 6. Delete medication configs that reference this item
      await tx.delete(medicationConfigs).where(eq(medicationConfigs.itemId, id));
      
      // 7. Delete lots that belong to this item (must be before stock levels)
      await tx.delete(lots).where(eq(lots.itemId, id));
      
      // 8. Delete stock levels for this item
      await tx.delete(stockLevels).where(eq(stockLevels.itemId, id));
      
      // 9. Finally delete the item itself
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

  async updateLot(id: string, updates: Partial<Lot>): Promise<Lot> {
    const [updated] = await db
      .update(lots)
      .set(updates)
      .where(eq(lots.id, id))
      .returning();
    return updated;
  }

  async deleteLot(id: string): Promise<void> {
    await db.delete(lots).where(eq(lots.id, id));
  }

  // Item Code operations (universal product identifiers)
  async getItemCode(itemId: string): Promise<ItemCode | undefined> {
    const [code] = await db
      .select()
      .from(itemCodes)
      .where(eq(itemCodes.itemId, itemId));
    return code;
  }

  async createItemCode(code: InsertItemCode): Promise<ItemCode> {
    const [created] = await db.insert(itemCodes).values(code).returning();
    return created;
  }

  async updateItemCode(itemId: string, updates: Partial<ItemCode>): Promise<ItemCode> {
    const [existing] = await db
      .select()
      .from(itemCodes)
      .where(eq(itemCodes.itemId, itemId));
    
    if (existing) {
      const [updated] = await db
        .update(itemCodes)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(itemCodes.itemId, itemId))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(itemCodes)
        .values({ itemId, ...updates } as InsertItemCode)
        .returning();
      return created;
    }
  }

  async deleteItemCode(itemId: string): Promise<void> {
    await db.delete(itemCodes).where(eq(itemCodes.itemId, itemId));
  }

  // Supplier Code operations (supplier-specific article numbers)
  async getSupplierCodes(itemId: string): Promise<SupplierCode[]> {
    return await db
      .select()
      .from(supplierCodes)
      .where(eq(supplierCodes.itemId, itemId))
      .orderBy(desc(supplierCodes.isPreferred), asc(supplierCodes.supplierName));
  }

  async getSupplierCode(id: string): Promise<SupplierCode | undefined> {
    const [code] = await db
      .select()
      .from(supplierCodes)
      .where(eq(supplierCodes.id, id));
    return code;
  }

  async createSupplierCode(code: InsertSupplierCode): Promise<SupplierCode> {
    const [created] = await db.insert(supplierCodes).values(code).returning();
    return created;
  }

  async updateSupplierCode(id: string, updates: Partial<SupplierCode>): Promise<SupplierCode> {
    const [updated] = await db
      .update(supplierCodes)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(supplierCodes.id, id))
      .returning();
    return updated;
  }

  async deleteSupplierCode(id: string): Promise<void> {
    await db.delete(supplierCodes).where(eq(supplierCodes.id, id));
  }

  async setPreferredSupplier(itemId: string, supplierId: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Clear all preferred flags for this item
      await tx
        .update(supplierCodes)
        .set({ isPreferred: false })
        .where(eq(supplierCodes.itemId, itemId));
      
      // Set the selected supplier as preferred
      await tx
        .update(supplierCodes)
        .set({ isPreferred: true })
        .where(eq(supplierCodes.id, supplierId));
    });
  }

  async getPendingSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]> {
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
    actions?: string[];
    limit?: number;
  }): Promise<(Activity & { user: User; item?: Item })[]> {
    const conditions = [];
    
    if (filters.itemId) conditions.push(eq(activities.itemId, filters.itemId));
    if (filters.userId) conditions.push(eq(activities.userId, filters.userId));
    
    // Filter by specific action types (e.g., 'use', 'adjust' for controlled substances)
    if (filters.actions && filters.actions.length > 0) {
      conditions.push(inArray(activities.action, filters.actions));
    }
    
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

  // Supplier Catalog implementations
  async createSupplierCatalog(catalog: Partial<SupplierCatalog> & { apiPassword?: string }): Promise<SupplierCatalog> {
    // Encrypt password if provided
    const { apiPassword, ...rest } = catalog;
    const toInsert = {
      ...rest,
      apiPasswordEncrypted: apiPassword ? encryptCredential(apiPassword) : null,
    };
    const [created] = await db.insert(supplierCatalogs).values(toInsert as any).returning();
    // Don't return the encrypted password to the frontend
    return { ...created, apiPasswordEncrypted: created.apiPasswordEncrypted ? '***' : null };
  }

  async getSupplierCatalogs(hospitalId: string): Promise<SupplierCatalog[]> {
    const catalogs = await db
      .select()
      .from(supplierCatalogs)
      .where(eq(supplierCatalogs.hospitalId, hospitalId))
      .orderBy(asc(supplierCatalogs.supplierName));
    // Mask encrypted passwords - return '***' if password exists, null otherwise
    return catalogs.map(c => ({ ...c, apiPasswordEncrypted: c.apiPasswordEncrypted ? '***' : null }));
  }

  async getSupplierCatalog(id: string): Promise<SupplierCatalog | undefined> {
    const [catalog] = await db.select().from(supplierCatalogs).where(eq(supplierCatalogs.id, id));
    if (!catalog) return undefined;
    // Mask encrypted password for frontend
    return { ...catalog, apiPasswordEncrypted: catalog.apiPasswordEncrypted ? '***' : null };
  }

  // Internal method for worker - returns decrypted password
  async getSupplierCatalogWithCredentials(id: string): Promise<(SupplierCatalog & { apiPassword: string | null }) | undefined> {
    const [catalog] = await db.select().from(supplierCatalogs).where(eq(supplierCatalogs.id, id));
    if (!catalog) return undefined;
    const apiPassword = catalog.apiPasswordEncrypted ? decryptCredential(catalog.apiPasswordEncrypted) : null;
    return { ...catalog, apiPassword };
  }

  async getSupplierCatalogByName(hospitalId: string, supplierName: string): Promise<SupplierCatalog | undefined> {
    const [catalog] = await db
      .select()
      .from(supplierCatalogs)
      .where(and(
        eq(supplierCatalogs.hospitalId, hospitalId),
        eq(supplierCatalogs.supplierName, supplierName)
      ));
    if (!catalog) return undefined;
    // Mask encrypted password for frontend
    return { ...catalog, apiPasswordEncrypted: catalog.apiPasswordEncrypted ? '***' : null };
  }

  async updateSupplierCatalog(id: string, updates: Partial<SupplierCatalog> & { apiPassword?: string }): Promise<SupplierCatalog> {
    // Encrypt password if provided
    const { apiPassword, ...rest } = updates as any;
    const toUpdate: any = { ...rest, updatedAt: new Date() };
    
    // Only update password if explicitly provided
    if (apiPassword !== undefined) {
      toUpdate.apiPasswordEncrypted = apiPassword ? encryptCredential(apiPassword) : null;
    }
    
    const [updated] = await db
      .update(supplierCatalogs)
      .set(toUpdate)
      .where(eq(supplierCatalogs.id, id))
      .returning();
    // Don't return the encrypted password to the frontend
    return { ...updated, apiPasswordEncrypted: updated.apiPasswordEncrypted ? '***' : null };
  }

  async deleteSupplierCatalog(id: string): Promise<void> {
    await db.delete(priceSyncJobs).where(eq(priceSyncJobs.catalogId, id));
    await db.delete(supplierCatalogs).where(eq(supplierCatalogs.id, id));
  }

  // Price Sync Job implementations
  async createPriceSyncJob(job: Partial<PriceSyncJob>): Promise<PriceSyncJob> {
    const [created] = await db.insert(priceSyncJobs).values(job as any).returning();
    return created;
  }

  async getPriceSyncJob(id: string): Promise<PriceSyncJob | undefined> {
    const [job] = await db.select().from(priceSyncJobs).where(eq(priceSyncJobs.id, id));
    return job;
  }

  async getPriceSyncJobs(hospitalId: string, limit: number = 20): Promise<PriceSyncJob[]> {
    return db
      .select()
      .from(priceSyncJobs)
      .where(eq(priceSyncJobs.hospitalId, hospitalId))
      .orderBy(desc(priceSyncJobs.createdAt))
      .limit(limit);
  }

  async getNextQueuedPriceSyncJob(): Promise<PriceSyncJob | undefined> {
    const [job] = await db
      .select()
      .from(priceSyncJobs)
      .where(eq(priceSyncJobs.status, 'queued'))
      .orderBy(asc(priceSyncJobs.createdAt))
      .limit(1);
    return job;
  }

  async updatePriceSyncJob(id: string, updates: Partial<PriceSyncJob>): Promise<PriceSyncJob> {
    const [updated] = await db
      .update(priceSyncJobs)
      .set(updates)
      .where(eq(priceSyncJobs.id, id))
      .returning();
    return updated;
  }

  async getLatestPriceSyncJob(catalogId: string): Promise<PriceSyncJob | undefined> {
    const [job] = await db
      .select()
      .from(priceSyncJobs)
      .where(eq(priceSyncJobs.catalogId, catalogId))
      .orderBy(desc(priceSyncJobs.createdAt))
      .limit(1);
    return job;
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
    // Delete all associated checklist completions and dismissals first (cascade delete)
    await db.delete(checklistCompletions).where(eq(checklistCompletions.templateId, id));
    await db.delete(checklistDismissals).where(eq(checklistDismissals.templateId, id));
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

      const dismissals = await db
        .select()
        .from(checklistDismissals)
        .where(and(
          eq(checklistDismissals.templateId, template.id),
          eq(checklistDismissals.hospitalId, hospitalId),
          eq(checklistDismissals.unitId, unitId)
        ))
        .orderBy(desc(checklistDismissals.dueDate))
        .limit(1);

      const lastCompletion = completions[0];
      const lastDismissal = dismissals[0];
      
      // Use the latest due date from either completion or dismissal
      let lastHandledDueDate: Date | undefined;
      if (lastCompletion && lastDismissal) {
        lastHandledDueDate = new Date(lastCompletion.dueDate) > new Date(lastDismissal.dueDate) 
          ? lastCompletion.dueDate 
          : lastDismissal.dueDate;
      } else if (lastCompletion) {
        lastHandledDueDate = lastCompletion.dueDate;
      } else if (lastDismissal) {
        lastHandledDueDate = lastDismissal.dueDate;
      }
      
      const nextDueDate = this.calculateNextDueDate(template.startDate, template.recurrency, lastHandledDueDate);
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

  async dismissChecklist(dismissal: InsertChecklistDismissal): Promise<ChecklistDismissal> {
    const [created] = await db.insert(checklistDismissals).values(dismissal).returning();
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

  async archivePatient(id: string, userId: string): Promise<Patient> {
    const [archived] = await db
      .update(patients)
      .set({ 
        isArchived: true, 
        archivedAt: new Date(), 
        archivedBy: userId,
        updatedAt: new Date() 
      })
      .where(eq(patients.id, id))
      .returning();
    return archived;
  }

  async unarchivePatient(id: string): Promise<Patient> {
    const [restored] = await db
      .update(patients)
      .set({ 
        isArchived: false, 
        archivedAt: null, 
        archivedBy: null,
        updatedAt: new Date() 
      })
      .where(eq(patients.id, id))
      .returning();
    return restored;
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
    const conditions = [
      eq(surgeries.hospitalId, hospitalId),
      isNull(patients.deletedAt)
    ];
    
    if (filters?.caseId) conditions.push(eq(surgeries.caseId, filters.caseId));
    if (filters?.patientId) conditions.push(eq(surgeries.patientId, filters.patientId));
    if (filters?.status) conditions.push(sql`${surgeries.status} = ${filters.status}`);
    if (filters?.roomId) conditions.push(eq(surgeries.surgeryRoomId, filters.roomId));
    if (filters?.dateFrom) conditions.push(gte(surgeries.plannedDate, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(surgeries.plannedDate, filters.dateTo));

    const result = await db
      .select({ surgery: surgeries })
      .from(surgeries)
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(...conditions))
      .orderBy(desc(surgeries.plannedDate));
    
    return result.map(r => r.surgery);
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

  async archiveSurgery(id: string, userId: string): Promise<Surgery> {
    const [archived] = await db
      .update(surgeries)
      .set({ 
        isArchived: true, 
        archivedAt: new Date(), 
        archivedBy: userId,
        updatedAt: new Date() 
      })
      .where(eq(surgeries.id, id))
      .returning();
    return archived;
  }

  async unarchiveSurgery(id: string): Promise<Surgery> {
    const [restored] = await db
      .update(surgeries)
      .set({ 
        isArchived: false, 
        archivedAt: null, 
        archivedBy: null,
        updatedAt: new Date() 
      })
      .where(eq(surgeries.id, id))
      .returning();
    return restored;
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

  async getAllAnesthesiaRecordsForSurgery(surgeryId: string): Promise<AnesthesiaRecord[]> {
    const records = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.surgeryId, surgeryId))
      .orderBy(anesthesiaRecords.createdAt);
    return records;
  }

  async getAnesthesiaRecordDataCounts(recordId: string): Promise<{ vitals: number; medications: number; events: number }> {
    // Count vitals points from clinical snapshot
    const [snapshot] = await db
      .select()
      .from(clinicalSnapshots)
      .where(eq(clinicalSnapshots.anesthesiaRecordId, recordId));
    
    let vitalsCount = 0;
    if (snapshot?.data) {
      const data = snapshot.data as Record<string, any>;
      // Count various vital types
      if (data.hr) vitalsCount += Array.isArray(data.hr) ? data.hr.length : 1;
      if (data.bp) vitalsCount += Array.isArray(data.bp) ? data.bp.length : 1;
      if (data.spo2) vitalsCount += Array.isArray(data.spo2) ? data.spo2.length : 1;
      if (data.temp) vitalsCount += Array.isArray(data.temp) ? data.temp.length : 1;
      if (data.etco2) vitalsCount += Array.isArray(data.etco2) ? data.etco2.length : 1;
    }
    
    // Count medications
    const medications = await db
      .select({ count: sql<number>`count(*)` })
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.anesthesiaRecordId, recordId));
    
    // Count events
    const events = await db
      .select({ count: sql<number>`count(*)` })
      .from(anesthesiaEvents)
      .where(eq(anesthesiaEvents.anesthesiaRecordId, recordId));
    
    return {
      vitals: vitalsCount,
      medications: Number(medications[0]?.count) || 0,
      events: Number(events[0]?.count) || 0,
    };
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

  async deleteAnesthesiaRecord(id: string): Promise<void> {
    // Delete related data first (cascade manually since we need explicit control)
    await db.delete(clinicalSnapshots).where(eq(clinicalSnapshots.anesthesiaRecordId, id));
    await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.anesthesiaRecordId, id));
    await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.anesthesiaRecordId, id));
    await db.delete(anesthesiaPositions).where(eq(anesthesiaPositions.anesthesiaRecordId, id));
    await db.delete(surgeryStaffEntries).where(eq(surgeryStaffEntries.anesthesiaRecordId, id));
    // Finally delete the record itself
    await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, id));
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

  async lockAnesthesiaRecord(id: string, userId: string): Promise<AnesthesiaRecord> {
    const [currentRecord] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, id));

    const [updated] = await db
      .update(anesthesiaRecords)
      .set({
        isLocked: true,
        lockedAt: new Date(),
        lockedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(anesthesiaRecords.id, id))
      .returning();

    await this.createAuditLog({
      recordType: 'anesthesia_record',
      recordId: id,
      action: 'lock',
      userId,
      oldValue: { isLocked: currentRecord?.isLocked },
      newValue: { isLocked: true },
    });

    return updated;
  }

  async unlockAnesthesiaRecord(id: string, userId: string, reason: string): Promise<AnesthesiaRecord> {
    const [currentRecord] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, id));

    const [updated] = await db
      .update(anesthesiaRecords)
      .set({
        isLocked: false,
        unlockedAt: new Date(),
        unlockedBy: userId,
        unlockReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(anesthesiaRecords.id, id))
      .returning();

    await this.createAuditLog({
      recordType: 'anesthesia_record',
      recordId: id,
      action: 'unlock',
      userId,
      oldValue: { isLocked: currentRecord?.isLocked },
      newValue: { isLocked: false },
      reason,
    });

    return updated;
  }

  async getPacuPatients(hospitalId: string): Promise<Array<{
    anesthesiaRecordId: string;
    surgeryId: string;
    patientId: string;
    patientName: string;
    patientNumber: string;
    age: number;
    procedure: string;
    anesthesiaPresenceEndTime: number;
    postOpDestination: string | null;
    status: 'transferring' | 'in_recovery' | 'discharged';
    statusTimestamp: number;
  }>> {
    const results = await db
      .select({
        anesthesiaRecord: anesthesiaRecords,
        surgery: surgeries,
        patient: patients,
      })
      .from(anesthesiaRecords)
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        sql`(${anesthesiaRecords.timeMarkers} @> '[{"code": "X2"}]'::jsonb 
            OR ${anesthesiaRecords.timeMarkers} @> '[{"code": "A2"}]'::jsonb 
            OR ${anesthesiaRecords.timeMarkers} @> '[{"code": "P"}]'::jsonb)`
      ))
      .orderBy(desc(anesthesiaRecords.updatedAt));

    return results
      .map(row => {
        const timeMarkers = row.anesthesiaRecord.timeMarkers as any[] || [];
        
        const parseMarkerTime = (marker: any): number | null => {
          if (!marker || marker.time == null) return null;
          let timeValue: number;
          if (typeof marker.time === 'number') {
            timeValue = marker.time;
          } else if (typeof marker.time === 'string') {
            const numericValue = Number(marker.time);
            if (!isNaN(numericValue) && numericValue > 0) {
              timeValue = numericValue;
            } else {
              timeValue = new Date(marker.time).getTime();
            }
          } else {
            return null;
          }
          return isNaN(timeValue) || timeValue <= 0 ? null : timeValue;
        };
        
        const x2Marker = timeMarkers.find((m: any) => m.code === 'X2');
        const a2Marker = timeMarkers.find((m: any) => m.code === 'A2');
        const pMarker = timeMarkers.find((m: any) => m.code === 'P');
        
        const x2Time = parseMarkerTime(x2Marker);
        const a2Time = parseMarkerTime(a2Marker);
        const pTime = parseMarkerTime(pMarker);
        
        let status: 'transferring' | 'in_recovery' | 'discharged';
        let statusTimestamp: number;
        
        if (pTime) {
          status = 'discharged';
          statusTimestamp = pTime;
        } else if (a2Time) {
          status = 'in_recovery';
          statusTimestamp = a2Time;
        } else if (x2Time) {
          status = 'transferring';
          statusTimestamp = x2Time;
        } else {
          return null;
        }

        let age = 0;
        if (row.patient.birthday) {
          const birthDate = new Date(row.patient.birthday);
          if (!isNaN(birthDate.getTime())) {
            age = Math.floor((Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
          }
        }

        const postOpData = row.anesthesiaRecord.postOpData as any;
        
        return {
          anesthesiaRecordId: row.anesthesiaRecord.id,
          surgeryId: row.surgery.id,
          patientId: row.patient.id,
          patientName: `${row.patient.firstName} ${row.patient.surname}`,
          patientNumber: row.patient.patientNumber || '',
          age,
          procedure: row.surgery.plannedSurgery,
          anesthesiaPresenceEndTime: a2Time || x2Time || statusTimestamp,
          postOpDestination: postOpData?.postOpDestination || null,
          status,
          statusTimestamp,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  // Pre-Op Assessment operations
  async getPreOpAssessments(hospitalId: string): Promise<Array<any>> {
    const results = await db
      .select()
      .from(surgeries)
      .leftJoin(preOpAssessments, eq(surgeries.id, preOpAssessments.surgeryId))
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          isNull(patients.deletedAt)
        )
      )
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
        // Include patient allergies for pre-op summary display
        patientAllergies: patient?.allergies || [],
        patientOtherAllergies: patient?.otherAllergies || null,
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
   * Update bulk ventilation parameters at a specific timestamp
   * Removes existing values at originalTimestamp and adds new values at newTimestamp
   */
  async updateBulkVentilationParameters(
    anesthesiaRecordId: string,
    originalTimestamp: string,
    newTimestamp: string,
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
    
    // Parameter keys to update
    const vitalTypes = ['peep', 'fio2', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'etco2', 'pip'];
    
    // Build updated data object
    const updatedData = { ...data };
    
    // For each parameter type, remove the point at originalTimestamp and add new one if provided
    for (const vitalType of vitalTypes) {
      const currentPoints = data[vitalType] || [];
      
      // Remove any points at the original timestamp (within 1 second tolerance for timestamp matching)
      const originalTs = new Date(originalTimestamp).getTime();
      const filteredPoints = currentPoints.filter((p: any) => {
        const pointTs = new Date(p.timestamp).getTime();
        return Math.abs(pointTs - originalTs) > 1000; // Keep points not within 1 second of original
      });
      
      // Add new point if value is provided
      const value = parameters[vitalType as keyof typeof parameters];
      if (value !== undefined && value !== null) {
        const newPoint = {
          id: randomUUID(),
          timestamp: newTimestamp,
          value,
        };
        updatedData[vitalType] = [...filteredPoints, newPoint].sort((a, b) => 
          a.timestamp.localeCompare(b.timestamp)
        );
      } else {
        updatedData[vitalType] = filteredPoints;
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
   * Delete bulk ventilation parameters at a specific timestamp
   * Removes all ventilation parameter values at the given timestamp
   */
  async deleteBulkVentilationParameters(
    anesthesiaRecordId: string,
    timestamp: string
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    const data = snapshot.data as any;
    
    // Parameter keys to delete
    const vitalTypes = ['peep', 'fio2', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'etco2', 'pip'];
    
    // Build updated data object
    const updatedData = { ...data };
    
    // For each parameter type, remove any points at the timestamp
    const targetTs = new Date(timestamp).getTime();
    
    for (const vitalType of vitalTypes) {
      const currentPoints = data[vitalType] || [];
      
      // Remove any points within 1 second of the target timestamp
      updatedData[vitalType] = currentPoints.filter((p: any) => {
        const pointTs = new Date(p.timestamp).getTime();
        return Math.abs(pointTs - targetTs) > 1000;
      });
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

  async getRunningRateControlledInfusions(): Promise<AnesthesiaMedication[]> {
    // Find all infusion_start records without endTimestamp
    const runningInfusions = await db
      .select()
      .from(anesthesiaMedications)
      .where(
        and(
          eq(anesthesiaMedications.type, 'infusion_start'),
          isNull(anesthesiaMedications.endTimestamp)
        )
      );

    return runningInfusions;
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

  // Surgery Staff operations (unified staff for both anesthesia and surgery modules)
  async getSurgeryStaff(anesthesiaRecordId: string): Promise<SurgeryStaffEntry[]> {
    const staff = await db
      .select()
      .from(surgeryStaffEntries)
      .where(eq(surgeryStaffEntries.anesthesiaRecordId, anesthesiaRecordId))
      .orderBy(asc(surgeryStaffEntries.role), asc(surgeryStaffEntries.createdAt));
    return staff;
  }

  async createSurgeryStaff(staff: InsertSurgeryStaffEntry): Promise<SurgeryStaffEntry> {
    const [created] = await db.insert(surgeryStaffEntries).values(staff).returning();
    return created;
  }

  async updateSurgeryStaff(id: string, staff: Partial<InsertSurgeryStaffEntry>, userId: string): Promise<SurgeryStaffEntry> {
    // Get current staff for audit log
    const [currentStaff] = await db
      .select()
      .from(surgeryStaffEntries)
      .where(eq(surgeryStaffEntries.id, id));

    // Guard: Throw error if staff doesn't exist
    if (!currentStaff) {
      throw new Error(`Staff with id ${id} not found`);
    }

    // Update the staff
    const [updated] = await db
      .update(surgeryStaffEntries)
      .set(staff)
      .where(eq(surgeryStaffEntries.id, id))
      .returning();

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'surgery_staff',
      recordId: id,
      action: 'update',
      userId,
      oldValue: currentStaff,
      newValue: updated,
    });

    return updated;
  }

  async deleteSurgeryStaff(id: string, userId: string): Promise<void> {
    // Get current staff for audit log
    const [currentStaff] = await db
      .select()
      .from(surgeryStaffEntries)
      .where(eq(surgeryStaffEntries.id, id));

    // Guard: Throw error if staff doesn't exist
    if (!currentStaff) {
      throw new Error(`Staff with id ${id} not found`);
    }

    // Delete the staff
    await db.delete(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));

    // Create audit log entry
    await this.createAuditLog({
      recordType: 'surgery_staff',
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
          laryngoscopeType: airway.laryngoscopeType,
          laryngoscopeBlade: airway.laryngoscopeBlade,
          intubationAttempts: airway.intubationAttempts,
          difficultAirway: airway.difficultAirway,
          cormackLehane: airway.cormackLehane,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteAirwayManagement(anesthesiaRecordId: string): Promise<void> {
    await db.delete(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.anesthesiaRecordId, anesthesiaRecordId));
  }

  // Difficult Airway Report operations
  async getDifficultAirwayReport(airwayManagementId: string): Promise<DifficultAirwayReport | undefined> {
    const [report] = await db
      .select()
      .from(difficultAirwayReports)
      .where(eq(difficultAirwayReports.airwayManagementId, airwayManagementId));
    return report;
  }

  async upsertDifficultAirwayReport(report: InsertDifficultAirwayReport): Promise<DifficultAirwayReport> {
    const [upserted] = await db
      .insert(difficultAirwayReports)
      .values(report)
      .onConflictDoUpdate({
        target: difficultAirwayReports.airwayManagementId,
        set: {
          description: report.description,
          techniquesAttempted: report.techniquesAttempted,
          finalTechnique: report.finalTechnique,
          equipmentUsed: report.equipmentUsed,
          complications: report.complications,
          recommendations: report.recommendations,
          patientInformed: report.patientInformed,
          patientInformedAt: report.patientInformedAt,
          patientInformedBy: report.patientInformedBy,
          letterSentToPatient: report.letterSentToPatient,
          letterSentAt: report.letterSentAt,
          patientEmail: report.patientEmail,
          gpNotified: report.gpNotified,
          gpNotifiedAt: report.gpNotifiedAt,
          gpEmail: report.gpEmail,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteDifficultAirwayReport(airwayManagementId: string): Promise<void> {
    await db.delete(difficultAirwayReports).where(eq(difficultAirwayReports.airwayManagementId, airwayManagementId));
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
    const allMedications = await db
      .select()
      .from(anesthesiaMedications)
      .where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecordId));

    // Get all non-rolled-back commits to find the latest commit timestamp per item
    const commits = await db
      .select()
      .from(inventoryCommits)
      .where(
        and(
          eq(inventoryCommits.anesthesiaRecordId, anesthesiaRecordId),
          isNull(inventoryCommits.rolledBackAt)
        )
      )
      .orderBy(inventoryCommits.committedAt);

    // Build a map of itemId -> latest commit timestamp
    const lastCommitTimeByItem = new Map<string, Date>();
    for (const commit of commits) {
      const commitItems = commit.items as Array<{ itemId: string; quantity: number }>;
      const commitTime = new Date(commit.committedAt);
      
      for (const item of commitItems) {
        // Keep track of the latest commit time for each item
        const existing = lastCommitTimeByItem.get(item.itemId);
        if (!existing || commitTime > existing) {
          lastCommitTimeByItem.set(item.itemId, commitTime);
        }
      }
    }

    // Filter medications to only include those AFTER the last commit for each item
    const medications = allMedications.filter(med => {
      const lastCommitTime = lastCommitTimeByItem.get(med.itemId);
      if (!lastCommitTime) {
        // No commit yet for this item, include all medications
        return true;
      }
      // Only include medications after the last commit
      const medTime = new Date(med.timestamp);
      return medTime > lastCommitTime;
    });

    console.log('[INVENTORY-CALC] Filtered medications:', {
      totalMedications: allMedications.length,
      filteredMedications: medications.length,
      lastCommitTimes: Array.from(lastCommitTimeByItem.entries()).map(([itemId, time]) => ({
        itemId,
        lastCommitTime: time.toISOString()
      }))
    });

    // Get anesthesia record and surgery to access patient weight from preOpAssessment
    const [anesthesiaRecord] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.id, anesthesiaRecordId));
    
    let patientWeight: number | undefined = undefined;
    if (anesthesiaRecord?.surgeryId) {
      const [preOpAssessment] = await db
        .select()
        .from(preOpAssessments)
        .where(eq(preOpAssessments.surgeryId, anesthesiaRecord.surgeryId));
      
      patientWeight = preOpAssessment?.weight ? parseFloat(preOpAssessment.weight) : undefined;
    }

    // Get item details and medication configs
    const itemIds = [...new Set(medications.map(m => m.itemId))];
    if (itemIds.length === 0) {
      // No medications remaining - clean up all non-overridden inventory usage records
      const existingUsage = await db
        .select()
        .from(inventoryUsage)
        .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
      
      for (const existing of existingUsage) {
        if (existing.overrideQty === null) {
          // Item no longer has any usage - delete the record
          await db
            .delete(inventoryUsage)
            .where(eq(inventoryUsage.id, existing.id));
        }
      }
      
      // Return any remaining records that have manual overrides
      const remainingUsage = await db
        .select()
        .from(inventoryUsage)
        .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
      
      return remainingUsage;
    }

    const itemsWithConfigs = await db
      .select({
        id: items.id,
        rateUnit: medicationConfigs.rateUnit,
        ampuleTotalContent: medicationConfigs.ampuleTotalContent,
        administrationUnit: medicationConfigs.administrationUnit,
      })
      .from(items)
      .leftJoin(medicationConfigs, eq(items.id, medicationConfigs.itemId))
      .where(inArray(items.id, itemIds));
    
    const itemsMap = new Map(itemsWithConfigs.map(item => [item.id, item]));

    // Group medications by itemId and type for proper pairing
    const medsByItem = new Map<string, any[]>();
    medications.forEach(med => {
      if (!medsByItem.has(med.itemId)) {
        medsByItem.set(med.itemId, []);
      }
      medsByItem.get(med.itemId)!.push(med);
    });

    // Calculate quantity used per item based on administration type
    const usageMap = new Map<string, number>();
    
    for (const [itemId, meds] of medsByItem.entries()) {
      const item = itemsMap.get(itemId);
      if (!item) {
        continue;
      }

      const isBolus = !item.rateUnit || item.rateUnit === null;
      const isFreeFlow = item.rateUnit === 'free';
      const isRateControlled = item.rateUnit && item.rateUnit !== 'free';

      let totalQty = 0;

      if (isBolus) {
        const bolusMeds = meds.filter(m => m.type === 'bolus');
        // CRITICAL FIX: Sum all doses first, THEN calculate ampules
        // Wrong: ceil(10/50) + ceil(10/50) + ceil(10/50) = 3 ampules
        // Correct: ceil((10+10+10)/50) = ceil(30/50) = 1 ampule
        const totalDose = bolusMeds.reduce((sum, med: any) => {
          const doseValue = parseFloat(med.dose?.match(/[\d.]+/)?.[0] || '0');
          return sum + doseValue;
        }, 0);
        
        // Calculate ampules from total dose
        const ampuleValue = parseFloat(item.ampuleTotalContent?.match(/[\d.]+/)?.[0] || '0');
        if (ampuleValue > 0 && totalDose > 0) {
          totalQty = Math.ceil(totalDose / ampuleValue);
        }
      } else if (isFreeFlow) {
        const startEvents = meds.filter(m => m.type === 'infusion_start');
        totalQty = startEvents.length;
      } else if (isRateControlled) {
        const sessionMap = new Map<string, Array<typeof meds[0]>>();
        const legacyEvents: Array<typeof meds[0]> = [];
        
        for (const med of meds) {
          if (med.infusionSessionId) {
            if (!sessionMap.has(med.infusionSessionId)) {
              sessionMap.set(med.infusionSessionId, []);
            }
            sessionMap.get(med.infusionSessionId)!.push(med);
          } else {
            legacyEvents.push(med);
          }
        }
        
        type InfusionSession = {
          start: { timestamp: Date; rate: string };
          stop: Date;
          rateChanges: Array<{ timestamp: Date; rate: string }>;
        };
        
        const sessions: InfusionSession[] = [];
        
        for (const [sessionId, events] of sessionMap.entries()) {
          const sortedEvents = events.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          const startEvent = sortedEvents.find(e => e.type === 'infusion_start');
          const stopEvent = sortedEvents.find(e => e.type === 'infusion_stop');
          
          // Check if infusion has stopped either via separate stop event OR via endTimestamp on start event
          const hasStopTime = stopEvent || (startEvent?.endTimestamp);
          
          if (startEvent && hasStopTime) {
            const rateChanges = sortedEvents
              .filter(e => e.type === 'rate_change')
              .map(e => ({ 
                timestamp: new Date(e.timestamp), 
                rate: e.rate || '0' 
              }));
            
            // Use stopEvent timestamp if available, otherwise use endTimestamp from startEvent
            const stopTime = stopEvent 
              ? new Date(stopEvent.timestamp)
              : new Date(startEvent.endTimestamp!);
            
            sessions.push({
              start: { timestamp: new Date(startEvent.timestamp), rate: startEvent.rate || '0' },
              stop: stopTime,
              rateChanges
            });
          }
        }
        
        if (legacyEvents.length > 0) {
          const sortedLegacy = legacyEvents.sort((a, b) => 
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
          
          const startEvents = sortedLegacy.filter(e => e.type === 'infusion_start');
          const stopEvents = sortedLegacy.filter(e => e.type === 'infusion_stop');
          const rateChangeEvents = sortedLegacy.filter(e => e.type === 'rate_change');
          
          const usedStops = new Set<typeof stopEvents[0]>();
          const usedRateChanges = new Set<typeof rateChangeEvents[0]>();
          
          for (const startEvent of startEvents) {
            const startTime = new Date(startEvent.timestamp);
            
            // Try to find a separate stop event first
            const stopEvent = stopEvents.find(s => 
              !usedStops.has(s) && new Date(s.timestamp).getTime() > startTime.getTime()
            );
            
            // If no separate stop event, check if start event has endTimestamp
            const stopTime = stopEvent 
              ? new Date(stopEvent.timestamp)
              : (startEvent.endTimestamp ? new Date(startEvent.endTimestamp) : null);
            
            if (stopTime) {
              if (stopEvent) {
                usedStops.add(stopEvent);
              }
              
              const relevantRateChanges = rateChangeEvents
                .filter(rc => {
                  if (usedRateChanges.has(rc)) return false;
                  const rcTime = new Date(rc.timestamp).getTime();
                  return rcTime > startTime.getTime() && rcTime < stopTime.getTime();
                })
                .map(e => {
                  usedRateChanges.add(e);
                  return { 
                    timestamp: new Date(e.timestamp), 
                    rate: e.rate || '0' 
                  };
                });
              
              sessions.push({
                start: { timestamp: startTime, rate: startEvent.rate || '0' },
                stop: stopTime,
                rateChanges: relevantRateChanges
              });
            }
          }
        }
        
        // CRITICAL FIX: Sum raw volumes across all sessions and segments FIRST,
        // then apply Math.ceil only at the end to get correct ampule count
        let totalRawVolume = 0;
        
        for (const session of sessions) {
          type Segment = { rate: string; start: Date; end: Date };
          const segments: Segment[] = [];
          
          if (session.rateChanges.length === 0) {
            segments.push({
              rate: session.start.rate,
              start: session.start.timestamp,
              end: session.stop
            });
          } else {
            let segmentStart = session.start.timestamp;
            let currentRate = session.start.rate;
            
            for (const rateChange of session.rateChanges) {
              segments.push({
                rate: currentRate,
                start: new Date(segmentStart.getTime()),
                end: new Date(rateChange.timestamp.getTime())
              });
              segmentStart = rateChange.timestamp;
              currentRate = rateChange.rate;
            }
            
            segments.push({
              rate: currentRate,
              start: new Date(segmentStart.getTime()),
              end: new Date(session.stop.getTime())
            });
          }
          
          // Sum raw volumes for each segment (without rounding)
          for (const segment of segments) {
            const volume = calculateRateControlledVolume(
              segment.rate,
              item.rateUnit,
              segment.start,
              segment.end,
              patientWeight
            );
            console.log('[INVENTORY-CALC] Rate-controlled segment volume:', {
              itemId,
              rate: segment.rate,
              rateUnit: item.rateUnit,
              start: segment.start,
              end: segment.end,
              calculatedVolume: volume
            });
            totalRawVolume += volume;
          }
        }
        
        // Apply Math.ceil only at the end on the total volume
        if (totalRawVolume > 0) {
          totalQty = volumeToAmpules(totalRawVolume, item.ampuleTotalContent);
          console.log('[INVENTORY-CALC] Final ampule calculation:', {
            itemId,
            totalRawVolume,
            ampuleTotalContent: item.ampuleTotalContent,
            totalAmpules: totalQty
          });
        }
      }

      if (totalQty > 0) {
        usageMap.set(itemId, totalQty);
      }
    }

    // Get all existing usage records for this anesthesia record
    const existingUsage = await db
      .select()
      .from(inventoryUsage)
      .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
    
    // Delete records for items that are no longer used (unless manually overridden)
    for (const existing of existingUsage) {
      if (!usageMap.has(existing.itemId) && existing.overrideQty === null) {
        // Item no longer has any usage - delete the record
        await db
          .delete(inventoryUsage)
          .where(eq(inventoryUsage.id, existing.id));
      }
    }
    
    // Upsert inventory usage records
    for (const [itemId, calculatedQty] of Array.from(usageMap.entries())) {
      await db
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
        });
    }

    // Return all remaining usage records (including manual overrides)
    const finalUsage = await db
      .select()
      .from(inventoryUsage)
      .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
    
    return finalUsage;
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

  async createManualInventoryUsage(
    anesthesiaRecordId: string,
    itemId: string,
    qty: number,
    reason: string,
    userId: string
  ): Promise<InventoryUsage> {
    const [created] = await db
      .insert(inventoryUsage)
      .values({
        anesthesiaRecordId,
        itemId,
        calculatedQty: '0',
        overrideQty: qty.toFixed(2),
        overrideReason: reason,
        overriddenBy: userId,
        overriddenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [inventoryUsage.anesthesiaRecordId, inventoryUsage.itemId],
        set: {
          overrideQty: qty.toFixed(2),
          overrideReason: reason,
          overriddenBy: userId,
          overriddenAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    return created;
  }

  // Inventory Commit operations (unit-scoped)
  async commitInventoryUsage(
    anesthesiaRecordId: string,
    userId: string,
    signature: string | null,
    patientName: string | null,
    patientId: string | null,
    unitId?: string | null
  ): Promise<InventoryCommit> {
    // Get all current inventory usage (calculated + overrides)
    // Note: calculateInventoryUsage already filters to only include post-commit usage
    const usage = await this.getInventoryUsage(anesthesiaRecordId);
    
    if (usage.length === 0) {
      throw new Error("No inventory items to commit");
    }

    // Get item details for all items
    const itemIds = usage.map(u => u.itemId);
    const itemsData = await db
      .select()
      .from(items)
      .where(inArray(items.id, itemIds));

    const itemsMap = new Map(itemsData.map(item => [item.id, item]));

    // Build items to commit - since calculateInventoryUsage filters by timestamp,
    // the current quantities already represent uncommitted items only
    // Also filter by unitId if provided to ensure unit-scoped commits
    const itemsToCommit: Array<{
      itemId: string;
      itemName: string;
      quantity: number;
      isControlled: boolean;
    }> = [];

    for (const usageRecord of usage) {
      const item = itemsMap.get(usageRecord.itemId);
      if (!item) continue;

      // Filter by unitId if provided - only commit items from the user's unit
      if (unitId && item.unitId !== unitId) {
        continue; // Skip items that don't belong to the user's unit
      }

      const currentQty = parseFloat(String(usageRecord.overrideQty || usageRecord.calculatedQty));
      const qtyToCommit = Math.max(0, Math.round(currentQty));

      if (qtyToCommit > 0) {
        itemsToCommit.push({
          itemId: usageRecord.itemId,
          itemName: item.name,
          quantity: qtyToCommit,
          isControlled: item.controlled || false,
        });
      }
    }

    if (itemsToCommit.length === 0) {
      throw new Error("No new items to commit (all items already committed)");
    }

    // Check if there are controlled items
    const hasControlledItems = itemsToCommit.some(i => i.isControlled);
    if (hasControlledItems && !signature) {
      throw new Error("Signature required for controlled items");
    }

    // Create commit record with unitId for module-scoped filtering
    const [commit] = await db
      .insert(inventoryCommits)
      .values({
        anesthesiaRecordId,
        unitId: unitId || null,
        committedBy: userId,
        signature,
        patientName,
        patientId,
        items: itemsToCommit,
      })
      .returning();

    // Clear inventory_usage records for committed items
    // This ensures that the next calculation starts fresh and only counts post-commit usage
    const committedItemIds = itemsToCommit.map(i => i.itemId);
    if (committedItemIds.length > 0) {
      await db
        .delete(inventoryUsage)
        .where(
          and(
            eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId),
            inArray(inventoryUsage.itemId, committedItemIds)
          )
        );
    }

    // Deduct from inventory for items with trackExactQuantity enabled or "Single unit" type
    for (const item of itemsToCommit) {
      const itemData = itemsMap.get(item.itemId);
      if (itemData && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
        const currentUnits = parseInt(String(itemData.currentUnits || 0));
        const newUnits = Math.max(0, currentUnits - item.quantity);

        await db
          .update(items)
          .set({ currentUnits: newUnits })
          .where(eq(items.id, item.itemId));

        // Log controlled item administration
        if (item.isControlled) {
          await db.insert(activities).values({
            itemId: item.itemId,
            hospitalId: itemData.hospitalId,
            unitId: itemData.unitId,
            action: 'use',
            delta: -item.quantity, // CRITICAL FIX: Use 'delta' field, not 'qty'
            movementType: 'OUT',
            userId,
            notes: `Anesthesia commit: ${anesthesiaRecordId}`,
            controlledVerified: false, // CRITICAL FIX: Requires verification
            signatures: signature ? [signature] : [], // CRITICAL FIX: Store signature
            patientId,
            metadata: { beforeQty: currentUnits, afterQty: newUnits },
          });
        }
      }
    }

    return commit;
  }

  async getInventoryCommits(anesthesiaRecordId: string, unitId?: string | null): Promise<InventoryCommit[]> {
    // Build conditions array for filtering
    const conditions = [eq(inventoryCommits.anesthesiaRecordId, anesthesiaRecordId)];
    
    // If unitId is provided, filter to show commits from that unit OR legacy commits with null unitId
    // This ensures backward compatibility with commits made before unit_id was introduced
    if (unitId) {
      conditions.push(
        or(
          eq(inventoryCommits.unitId, unitId),
          isNull(inventoryCommits.unitId) // Include legacy commits without unit_id
        )!
      );
    }
    
    const commits = await db
      .select()
      .from(inventoryCommits)
      .where(and(...conditions))
      .orderBy(desc(inventoryCommits.committedAt));

    return commits;
  }

  async getInventoryCommitById(commitId: string): Promise<InventoryCommit | null> {
    const [commit] = await db
      .select()
      .from(inventoryCommits)
      .where(eq(inventoryCommits.id, commitId));

    return commit || null;
  }

  async rollbackInventoryCommit(
    commitId: string,
    userId: string,
    reason: string
  ): Promise<InventoryCommit> {
    const commit = await this.getInventoryCommitById(commitId);
    if (!commit) {
      throw new Error("Commit not found");
    }

    if (commit.rolledBackAt) {
      throw new Error("Commit already rolled back");
    }

    // Mark commit as rolled back
    const [updated] = await db
      .update(inventoryCommits)
      .set({
        rolledBackAt: new Date(),
        rolledBackBy: userId,
        rollbackReason: reason,
      })
      .where(eq(inventoryCommits.id, commitId))
      .returning();

    // Restore inventory quantities for items with trackExactQuantity or "Single unit" type
    const commitItems = commit.items as Array<{
      itemId: string;
      quantity: number;
      isControlled: boolean;
    }>;

    const itemIds = commitItems.map(i => i.itemId);
    const itemsData = await db
      .select()
      .from(items)
      .where(inArray(items.id, itemIds));

    for (const commitItem of commitItems) {
      const itemData = itemsData.find(i => i.id === commitItem.itemId);
      if (itemData && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
        const currentUnits = parseInt(String(itemData.currentUnits || 0));
        const newUnits = currentUnits + commitItem.quantity;

        await db
          .update(items)
          .set({ currentUnits: newUnits })
          .where(eq(items.id, commitItem.itemId));

        // Log controlled item rollback
        if (commitItem.isControlled) {
          await db.insert(activities).values({
            itemId: commitItem.itemId,
            hospitalId: itemData.hospitalId,
            unitId: itemData.unitId,
            action: 'adjust',
            qty: commitItem.quantity,
            userId,
            notes: `Rollback commit: ${reason}`,
            controlledVerified: true,
          });
        }
      }
    }

    // Recalculate inventory usage to restore previously committed items
    // This is critical because the commit process deleted the inventory_usage records
    await this.calculateInventoryUsage(commit.anesthesiaRecordId);

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

  // Surgeon Checklist Template operations
  async getSurgeonChecklistTemplates(hospitalId: string, userId?: string): Promise<SurgeonChecklistTemplate[]> {
    const templates = await db
      .select()
      .from(surgeonChecklistTemplates)
      .where(
        and(
          eq(surgeonChecklistTemplates.hospitalId, hospitalId),
          userId 
            ? or(
                eq(surgeonChecklistTemplates.ownerUserId, userId),
                eq(surgeonChecklistTemplates.isShared, true)
              )
            : undefined
        )
      )
      .orderBy(desc(surgeonChecklistTemplates.createdAt));
    return templates;
  }

  async getSurgeonChecklistTemplate(id: string): Promise<(SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }) | undefined> {
    const [template] = await db
      .select()
      .from(surgeonChecklistTemplates)
      .where(eq(surgeonChecklistTemplates.id, id));
    
    if (!template) return undefined;

    const items = await db
      .select()
      .from(surgeonChecklistTemplateItems)
      .where(eq(surgeonChecklistTemplateItems.templateId, id))
      .orderBy(asc(surgeonChecklistTemplateItems.sortOrder));

    return { ...template, items };
  }

  async createSurgeonChecklistTemplate(template: InsertSurgeonChecklistTemplate): Promise<SurgeonChecklistTemplate> {
    const [created] = await db
      .insert(surgeonChecklistTemplates)
      .values(template)
      .returning();
    return created;
  }

  async updateSurgeonChecklistTemplate(
    id: string, 
    updates: Partial<SurgeonChecklistTemplate>, 
    items?: { id?: string; label: string; sortOrder: number }[]
  ): Promise<SurgeonChecklistTemplate> {
    const [updated] = await db
      .update(surgeonChecklistTemplates)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(surgeonChecklistTemplates.id, id))
      .returning();

    if (items) {
      const existingItems = await db
        .select()
        .from(surgeonChecklistTemplateItems)
        .where(eq(surgeonChecklistTemplateItems.templateId, id));

      const existingIds = existingItems.map(i => i.id);
      const incomingIds = items.filter(i => i.id).map(i => i.id!);
      const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid));

      if (idsToDelete.length > 0) {
        await db
          .delete(surgeonChecklistTemplateItems)
          .where(inArray(surgeonChecklistTemplateItems.id, idsToDelete));
      }

      for (const item of items) {
        if (item.id && existingIds.includes(item.id)) {
          await db
            .update(surgeonChecklistTemplateItems)
            .set({ label: item.label, sortOrder: item.sortOrder })
            .where(eq(surgeonChecklistTemplateItems.id, item.id));
        } else {
          await db
            .insert(surgeonChecklistTemplateItems)
            .values({
              templateId: id,
              label: item.label,
              sortOrder: item.sortOrder,
            });
        }
      }
    }

    return updated;
  }

  async deleteSurgeonChecklistTemplate(id: string): Promise<void> {
    await db.delete(surgeonChecklistTemplates).where(eq(surgeonChecklistTemplates.id, id));
  }

  // Surgery Pre-Op Checklist operations
  async getSurgeryPreOpChecklist(surgeryId: string): Promise<{ templateId: string | null; entries: SurgeryPreOpChecklistEntry[] }> {
    const entries = await db
      .select()
      .from(surgeryPreOpChecklistEntries)
      .where(eq(surgeryPreOpChecklistEntries.surgeryId, surgeryId));

    const templateId = entries.length > 0 ? entries[0].templateId : null;
    return { templateId, entries };
  }

  async saveSurgeryPreOpChecklist(
    surgeryId: string, 
    templateId: string, 
    entries: { itemId: string; checked: boolean; note?: string | null }[]
  ): Promise<SurgeryPreOpChecklistEntry[]> {
    const results: SurgeryPreOpChecklistEntry[] = [];
    const incomingItemIds = entries.map(e => e.itemId);

    // Delete any existing entries for this surgery that are not in the incoming list
    // This handles template changes or items being removed from the template
    const existingEntries = await db
      .select()
      .from(surgeryPreOpChecklistEntries)
      .where(eq(surgeryPreOpChecklistEntries.surgeryId, surgeryId));

    const orphanedIds = existingEntries
      .filter(e => !incomingItemIds.includes(e.itemId))
      .map(e => e.id);

    if (orphanedIds.length > 0) {
      await db
        .delete(surgeryPreOpChecklistEntries)
        .where(inArray(surgeryPreOpChecklistEntries.id, orphanedIds));
    }

    for (const entry of entries) {
      const existing = existingEntries.find(e => e.itemId === entry.itemId);

      if (existing) {
        const [updated] = await db
          .update(surgeryPreOpChecklistEntries)
          .set({ 
            checked: entry.checked, 
            note: entry.note ?? null,
            templateId, // Update templateId in case it changed
            updatedAt: new Date() 
          })
          .where(eq(surgeryPreOpChecklistEntries.id, existing.id))
          .returning();
        results.push(updated);
      } else {
        const [created] = await db
          .insert(surgeryPreOpChecklistEntries)
          .values({
            surgeryId,
            templateId,
            itemId: entry.itemId,
            checked: entry.checked,
            note: entry.note ?? null,
          })
          .returning();
        results.push(created);
      }
    }

    return results;
  }

  // ========== CHAT MODULE OPERATIONS ==========

  async getConversations(userId: string, hospitalId: string): Promise<(ChatConversation & { 
    participants: (ChatParticipant & { user: User })[]; 
    lastMessage?: ChatMessage; 
    unreadCount: number 
  })[]> {
    const userParticipations = await db
      .select()
      .from(chatParticipants)
      .innerJoin(chatConversations, eq(chatParticipants.conversationId, chatConversations.id))
      .where(and(
        eq(chatParticipants.userId, userId),
        eq(chatConversations.hospitalId, hospitalId)
      ))
      .orderBy(desc(chatConversations.lastMessageAt));

    const results = [];
    for (const row of userParticipations) {
      const conversation = row.chat_conversations;
      const userParticipant = row.chat_participants;

      const allParticipants = await db
        .select()
        .from(chatParticipants)
        .innerJoin(users, eq(chatParticipants.userId, users.id))
        .where(eq(chatParticipants.conversationId, conversation.id));

      const [lastMessage] = await db
        .select()
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversation.id),
          isNull(chatMessages.deletedAt)
        ))
        .orderBy(desc(chatMessages.createdAt))
        .limit(1);

      const unreadMessages = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatMessages)
        .where(and(
          eq(chatMessages.conversationId, conversation.id),
          isNull(chatMessages.deletedAt),
          userParticipant.lastReadAt 
            ? sql`${chatMessages.createdAt} > ${userParticipant.lastReadAt}`
            : sql`1=1`
        ));

      results.push({
        ...conversation,
        participants: allParticipants.map(p => ({
          ...p.chat_participants,
          user: p.users
        })),
        lastMessage,
        unreadCount: unreadMessages[0]?.count || 0
      });
    }

    return results;
  }

  async getConversation(id: string): Promise<(ChatConversation & { 
    participants: (ChatParticipant & { user: User })[] 
  }) | undefined> {
    const [conversation] = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, id));

    if (!conversation) return undefined;

    const participants = await db
      .select()
      .from(chatParticipants)
      .innerJoin(users, eq(chatParticipants.userId, users.id))
      .where(eq(chatParticipants.conversationId, id));

    return {
      ...conversation,
      participants: participants.map(p => ({
        ...p.chat_participants,
        user: p.users
      }))
    };
  }

  async createConversation(conversation: InsertChatConversation & { creatorId: string }): Promise<ChatConversation> {
    const [created] = await db
      .insert(chatConversations)
      .values(conversation)
      .returning();

    await db.insert(chatParticipants).values({
      conversationId: created.id,
      userId: conversation.creatorId,
      role: "owner"
    });

    return created;
  }

  async updateConversation(id: string, updates: Partial<ChatConversation>): Promise<ChatConversation> {
    const [updated] = await db
      .update(chatConversations)
      .set(updates)
      .where(eq(chatConversations.id, id))
      .returning();
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    await db.delete(chatConversations).where(eq(chatConversations.id, id));
  }

  async getOrCreateSelfConversation(userId: string, hospitalId: string): Promise<ChatConversation> {
    const [existing] = await db
      .select()
      .from(chatConversations)
      .innerJoin(chatParticipants, eq(chatConversations.id, chatParticipants.conversationId))
      .where(and(
        eq(chatConversations.hospitalId, hospitalId),
        eq(chatConversations.scopeType, "self"),
        eq(chatConversations.creatorId, userId),
        eq(chatParticipants.userId, userId)
      ));

    if (existing) {
      return existing.chat_conversations;
    }

    return this.createConversation({
      hospitalId,
      creatorId: userId,
      scopeType: "self",
      title: null,
      unitId: null,
      patientId: null
    });
  }

  async findDirectConversation(userId1: string, userId2: string, hospitalId: string): Promise<ChatConversation | undefined> {
    const user1Convos = await db
      .select({ conversationId: chatParticipants.conversationId })
      .from(chatParticipants)
      .innerJoin(chatConversations, eq(chatParticipants.conversationId, chatConversations.id))
      .where(and(
        eq(chatParticipants.userId, userId1),
        eq(chatConversations.hospitalId, hospitalId),
        eq(chatConversations.scopeType, "direct")
      ));

    for (const { conversationId } of user1Convos) {
      const participants = await db
        .select()
        .from(chatParticipants)
        .where(eq(chatParticipants.conversationId, conversationId));

      if (participants.length === 2 && 
          participants.some(p => p.userId === userId1) && 
          participants.some(p => p.userId === userId2)) {
        const [conv] = await db
          .select()
          .from(chatConversations)
          .where(eq(chatConversations.id, conversationId));
        return conv;
      }
    }
    return undefined;
  }

  async addParticipant(conversationId: string, userId: string, role: string = "member"): Promise<ChatParticipant> {
    const [created] = await db
      .insert(chatParticipants)
      .values({ conversationId, userId, role: role as "owner" | "admin" | "member" })
      .onConflictDoNothing()
      .returning();
    
    if (!created) {
      const [existing] = await db
        .select()
        .from(chatParticipants)
        .where(and(
          eq(chatParticipants.conversationId, conversationId),
          eq(chatParticipants.userId, userId)
        ));
      return existing;
    }
    return created;
  }

  async removeParticipant(conversationId: string, userId: string): Promise<void> {
    await db
      .delete(chatParticipants)
      .where(and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.userId, userId)
      ));
  }

  async updateParticipant(id: string, updates: Partial<ChatParticipant>): Promise<ChatParticipant> {
    const [updated] = await db
      .update(chatParticipants)
      .set(updates)
      .where(eq(chatParticipants.id, id))
      .returning();
    return updated;
  }

  async markConversationRead(conversationId: string, userId: string): Promise<void> {
    await db
      .update(chatParticipants)
      .set({ lastReadAt: new Date() })
      .where(and(
        eq(chatParticipants.conversationId, conversationId),
        eq(chatParticipants.userId, userId)
      ));
  }

  async getMessages(conversationId: string, limit: number = 50, before?: Date): Promise<(ChatMessage & { 
    sender: User; 
    mentions: ChatMention[]; 
    attachments: ChatAttachment[] 
  })[]> {
    let query = db
      .select()
      .from(chatMessages)
      .innerJoin(users, eq(chatMessages.senderId, users.id))
      .where(and(
        eq(chatMessages.conversationId, conversationId),
        isNull(chatMessages.deletedAt),
        before ? sql`${chatMessages.createdAt} < ${before}` : sql`1=1`
      ))
      .orderBy(desc(chatMessages.createdAt))
      .limit(limit);

    const messages = await query;

    const results = [];
    for (const row of messages) {
      const mentions = await db
        .select()
        .from(chatMentions)
        .where(eq(chatMentions.messageId, row.chat_messages.id));

      const attachments = await db
        .select()
        .from(chatAttachments)
        .where(eq(chatAttachments.messageId, row.chat_messages.id));

      results.push({
        ...row.chat_messages,
        sender: row.users,
        mentions,
        attachments
      });
    }

    return results.reverse();
  }

  async getMessage(id: string): Promise<ChatMessage | undefined> {
    const [message] = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.id, id));
    return message;
  }

  async createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage> {
    const [created] = await db
      .insert(chatMessages)
      .values(message)
      .returning();

    await db
      .update(chatConversations)
      .set({ lastMessageAt: new Date() })
      .where(eq(chatConversations.id, message.conversationId));

    return created;
  }

  async updateMessage(id: string, content: string): Promise<ChatMessage> {
    const [updated] = await db
      .update(chatMessages)
      .set({ content, editedAt: new Date() })
      .where(eq(chatMessages.id, id))
      .returning();
    return updated;
  }

  async deleteMessage(id: string): Promise<ChatMessage> {
    const [deleted] = await db
      .update(chatMessages)
      .set({ deletedAt: new Date() })
      .where(eq(chatMessages.id, id))
      .returning();
    return deleted;
  }

  async createMention(mention: InsertChatMention): Promise<ChatMention> {
    const [created] = await db
      .insert(chatMentions)
      .values(mention)
      .returning();
    return created;
  }

  async getMentionsForUser(userId: string, hospitalId: string, unreadOnly: boolean = false): Promise<(ChatMention & { message: ChatMessage })[]> {
    const mentions = await db
      .select()
      .from(chatMentions)
      .innerJoin(chatMessages, eq(chatMentions.messageId, chatMessages.id))
      .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
      .where(and(
        eq(chatMentions.mentionedUserId, userId),
        eq(chatConversations.hospitalId, hospitalId),
        isNull(chatMessages.deletedAt)
      ))
      .orderBy(desc(chatMentions.createdAt));

    return mentions.map(row => ({
      ...row.chat_mentions,
      message: row.chat_messages
    }));
  }

  async createAttachment(attachment: InsertChatAttachment): Promise<ChatAttachment> {
    const [created] = await db
      .insert(chatAttachments)
      .values(attachment)
      .returning();
    return created;
  }

  async updateAttachment(id: string, updates: Partial<ChatAttachment>): Promise<ChatAttachment> {
    const [updated] = await db
      .update(chatAttachments)
      .set(updates)
      .where(eq(chatAttachments.id, id))
      .returning();
    return updated;
  }

  async getAttachment(id: string): Promise<ChatAttachment | undefined> {
    const [attachment] = await db
      .select()
      .from(chatAttachments)
      .where(eq(chatAttachments.id, id));
    return attachment;
  }

  async createNotification(notification: InsertChatNotification): Promise<ChatNotification> {
    const [created] = await db
      .insert(chatNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getUnreadNotifications(userId: string): Promise<ChatNotification[]> {
    return await db
      .select()
      .from(chatNotifications)
      .where(and(
        eq(chatNotifications.userId, userId),
        eq(chatNotifications.read, false)
      ))
      .orderBy(desc(chatNotifications.createdAt));
  }

  async markNotificationRead(id: string): Promise<ChatNotification> {
    const [updated] = await db
      .update(chatNotifications)
      .set({ read: true })
      .where(eq(chatNotifications.id, id))
      .returning();
    return updated;
  }

  async markNotificationEmailSent(id: string): Promise<ChatNotification> {
    const [updated] = await db
      .update(chatNotifications)
      .set({ emailSent: true, emailSentAt: new Date() })
      .where(eq(chatNotifications.id, id))
      .returning();
    return updated;
  }

  async getUnsentEmailNotifications(limit: number = 50): Promise<(ChatNotification & { user: User; conversation: ChatConversation })[]> {
    const notifications = await db
      .select()
      .from(chatNotifications)
      .innerJoin(users, eq(chatNotifications.userId, users.id))
      .innerJoin(chatConversations, eq(chatNotifications.conversationId, chatConversations.id))
      .where(eq(chatNotifications.emailSent, false))
      .orderBy(asc(chatNotifications.createdAt))
      .limit(limit);

    return notifications.map(row => ({
      ...row.chat_notifications,
      user: row.users,
      conversation: row.chat_conversations
    }));
  }
}

export const storage = new DatabaseStorage();
export { db };
