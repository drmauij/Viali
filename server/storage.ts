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
  surgeryNotes,
  patientNotes,
  noteAttachments,
  anesthesiaRecords,
  preOpAssessments,
  surgeryPreOpAssessments,
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
  // Patient questionnaire tables
  patientQuestionnaireLinks,
  patientQuestionnaireResponses,
  patientQuestionnaireUploads,
  patientQuestionnaireReviews,
  // Patient documents (staff uploads)
  patientDocuments,
  // Patient messages
  patientMessages,
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
  type SurgeryNote,
  type InsertSurgeryNote,
  type PatientNote,
  type InsertPatientNote,
  type NoteAttachment,
  type InsertNoteAttachment,
  type AnesthesiaRecord,
  type InsertAnesthesiaRecord,
  type PreOpAssessment,
  type InsertPreOpAssessment,
  type SurgeryPreOpAssessment,
  type InsertSurgeryPreOpAssessment,
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
  // Patient questionnaire types
  type PatientQuestionnaireLink,
  type InsertPatientQuestionnaireLink,
  type PatientQuestionnaireResponse,
  type InsertPatientQuestionnaireResponse,
  type PatientQuestionnaireUpload,
  type InsertPatientQuestionnaireUpload,
  type PatientQuestionnaireReview,
  type InsertPatientQuestionnaireReview,
  type PatientDocument,
  type InsertPatientDocument,
  // Patient message types
  type PatientMessage,
  type InsertPatientMessage,
  // Personal todo types
  personalTodos,
  type PersonalTodo,
  type InsertPersonalTodo,
  // Clinic appointment scheduling tables
  clinicProviders,
  providerAvailability,
  providerTimeOff,
  providerAbsences,
  clinicAppointments,
  timebutlerConfig,
  clinicServices,
  type ClinicProvider,
  type ProviderAvailability,
  type InsertProviderAvailability,
  type ProviderTimeOff,
  type InsertProviderTimeOff,
  providerAvailabilityWindows,
  type ProviderAvailabilityWindow,
  type InsertProviderAvailabilityWindow,
  type ProviderAbsence,
  type InsertProviderAbsence,
  type ClinicAppointment,
  type InsertClinicAppointment,
  type TimebutlerConfig,
  type InsertTimebutlerConfig,
  type ScheduledJob,
  type InsertScheduledJob,
  scheduledJobs,
  type ClinicService,
  calcomConfig,
  calcomProviderMappings,
  type CalcomConfig,
  type InsertCalcomConfig,
  type CalcomProviderMapping,
  type InsertCalcomProviderMapping,
  hospitalVonageConfigs,
  type HospitalVonageConfig,
  type InsertHospitalVonageConfig,
  externalWorklogLinks,
  externalWorklogEntries,
  type ExternalWorklogLink,
  type InsertExternalWorklogLink,
  type ExternalWorklogEntry,
  type InsertExternalWorklogEntry,
  externalSurgeryRequests,
  externalSurgeryRequestDocuments,
  type ExternalSurgeryRequest,
  type InsertExternalSurgeryRequest,
  type ExternalSurgeryRequestDocument,
  type InsertExternalSurgeryRequestDocument,
  // Anesthesia Sets
  anesthesiaSets,
  anesthesiaSetItems,
  anesthesiaSetMedications,
  anesthesiaSetInventory,
  type AnesthesiaSet,
  type InsertAnesthesiaSet,
  type AnesthesiaSetItem,
  type InsertAnesthesiaSetItem,
  type AnesthesiaSetMedication,
  type InsertAnesthesiaSetMedication,
  type AnesthesiaSetInventoryItem,
  type InsertAnesthesiaSetInventoryItem,
  // Inventory Sets
  inventorySets,
  inventorySetItems,
  type InventorySet,
  type InsertInventorySet,
  type InventorySetItem,
  type InsertInventorySetItem,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { db } from "./db";
import { eq, and, desc, asc, sql, inArray, lte, gte, lt, or, ilike, isNull, isNotNull } from "drizzle-orm";
import { calculateInventoryForMedication, calculateRateControlledAmpules, calculateRateControlledVolume, volumeToAmpules } from "./services/inventoryCalculations";
import { encryptCredential, decryptCredential } from "./utils/encryption";

/**
 * Storage Module Navigation Guide
 * ================================
 * This file contains all database operations organized by domain.
 * 
 * INTERFACE (IStorage): Lines ~271-970
 * - User/Auth operations
 * - Hospital operations
 * - Folder/Item/Stock operations
 * - Order operations
 * - Activity/Alert operations
 * - Unit/User management
 * - Checklist operations
 * - Medication config operations
 * - Anesthesia module operations (largest section)
 * - Chat module operations
 * - Clinic provider operations
 * - External integrations (Cal.com, Timebutler, Worklog)
 * 
 * IMPLEMENTATION (DatabaseStorage): Lines ~975-8875
 * - Same organization as interface
 * - Search for "// ========== SECTION NAME" to navigate
 * 
 * Future refactoring: Consider extracting large sections (Anesthesia ~4700 lines)
 * into separate repository classes with dependency injection.
 */

export interface IStorage {
  // User operations (mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Hospital operations
  getHospital(id: string): Promise<Hospital | undefined>;
  getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean; isLogisticModule: boolean; showControlledMedications: boolean })[]>;
  createHospital(name: string): Promise<Hospital>;
  updateHospital(id: string, updates: Partial<Hospital>): Promise<Hospital>;
  getHospitalByQuestionnaireToken(token: string): Promise<Hospital | undefined>;
  setHospitalQuestionnaireToken(hospitalId: string, token: string | null): Promise<Hospital>;
  
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
  getLotById(lotId: string): Promise<Lot | undefined>;
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
  getConfirmedSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]>;
  getSupplierMatchesByJobId(jobId: string): Promise<(SupplierCode & { item: Item })[]>;
  
  // Order operations
  getOrders(hospitalId: string, status?: string, unitId?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[] })[]>;
  createOrder(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Promise<Order>;
  getOrderById(orderId: string): Promise<Order | undefined>;
  getOrderLineById(lineId: string): Promise<OrderLine | undefined>;
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
  getAlertById(id: string): Promise<Alert | undefined>;
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
  getUnit(id: string): Promise<Unit | undefined>;
  createUnit(unit: Omit<Unit, 'id' | 'createdAt'>): Promise<Unit>;
  updateUnit(id: string, updates: Partial<Unit>): Promise<Unit>;
  deleteUnit(id: string): Promise<void>;
  
  // Admin - User management
  getHospitalUsers(hospitalId: string): Promise<(UserHospitalRole & { user: User; unit: Unit })[]>;
  getUserHospitalRoleById(id: string): Promise<UserHospitalRole | undefined>;
  createUserHospitalRole(data: Omit<UserHospitalRole, 'id' | 'createdAt'>): Promise<UserHospitalRole>;
  updateUserHospitalRole(id: string, updates: Partial<UserHospitalRole>): Promise<UserHospitalRole>;
  deleteUserHospitalRole(id: string): Promise<void>;
  searchUserByEmail(email: string): Promise<User | undefined>;
  findUserByEmailAndName(email: string, firstName: string, lastName: string): Promise<User | undefined>;
  createUser(userData: { email: string; firstName: string; lastName: string; phone?: string; staffType?: 'internal' | 'external'; canLogin?: boolean }): Promise<User>;
  createUserWithPassword(email: string, password: string, firstName: string, lastName: string): Promise<User>;
  updateUser(userId: string, updates: Partial<User>): Promise<User>;
  updateUserPassword(userId: string, newPassword: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  
  // Controlled Checks
  createControlledCheck(check: InsertControlledCheck): Promise<ControlledCheck>;
  getControlledChecks(hospitalId: string, unitId: string, limit?: number): Promise<(ControlledCheck & { user: User })[]>;
  getControlledCheck(id: string): Promise<ControlledCheck | undefined>;
  deleteControlledCheck(id: string): Promise<void>;
  
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
  getMedicationConfigById(id: string): Promise<MedicationConfig | undefined>;
  upsertMedicationConfig(config: InsertMedicationConfig): Promise<MedicationConfig>;
  deleteMedicationConfig(itemId: string): Promise<void>;
  
  // Medication Group operations
  getMedicationGroups(hospitalId: string): Promise<MedicationGroup[]>;
  getMedicationGroupById(id: string): Promise<MedicationGroup | undefined>;
  createMedicationGroup(group: InsertMedicationGroup): Promise<MedicationGroup>;
  deleteMedicationGroup(id: string): Promise<void>;

  // Administration Group operations
  getAdministrationGroups(hospitalId: string): Promise<AdministrationGroup[]>;
  getAdministrationGroupById(id: string): Promise<AdministrationGroup | undefined>;
  createAdministrationGroup(group: InsertAdministrationGroup): Promise<AdministrationGroup>;
  updateAdministrationGroup(id: string, updates: { name: string }): Promise<AdministrationGroup>;
  deleteAdministrationGroup(id: string): Promise<void>;
  reorderAdministrationGroups(groupIds: string[]): Promise<void>;
  
  // Surgery Room operations
  getSurgeryRooms(hospitalId: string): Promise<SurgeryRoom[]>;
  getSurgeryRoomById(id: string): Promise<SurgeryRoom | undefined>;
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
  createPatient(patient: InsertPatient & { patientNumber?: string }): Promise<Patient>;
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
    includeArchived?: boolean;
  }): Promise<Surgery[]>;
  getSurgery(id: string): Promise<Surgery | undefined>;
  createSurgery(surgery: InsertSurgery): Promise<Surgery>;
  updateSurgery(id: string, updates: Partial<Surgery>): Promise<Surgery>;
  archiveSurgery(id: string, userId: string): Promise<Surgery>;
  unarchiveSurgery(id: string): Promise<Surgery>;
  
  // Surgery Notes operations (multi-note thread per surgery)
  getSurgeryNotes(surgeryId: string): Promise<(SurgeryNote & { author: User })[]>;
  getSurgeryNoteById(id: string): Promise<SurgeryNote | undefined>;
  createSurgeryNote(note: InsertSurgeryNote): Promise<SurgeryNote>;
  updateSurgeryNote(id: string, content: string): Promise<SurgeryNote>;
  deleteSurgeryNote(id: string): Promise<void>;
  
  // Patient Notes operations (general notes about a patient - CRM, clinical, communication)
  getPatientNotes(patientId: string): Promise<(PatientNote & { author: User })[]>;
  createPatientNote(note: InsertPatientNote): Promise<PatientNote>;
  updatePatientNote(id: string, content: string): Promise<PatientNote>;
  deletePatientNote(id: string): Promise<void>;
  
  // Note Attachments operations (for both patient notes and surgery notes)
  getNoteAttachments(noteType: 'patient' | 'surgery', noteId: string): Promise<NoteAttachment[]>;
  createNoteAttachment(attachment: InsertNoteAttachment): Promise<NoteAttachment>;
  deleteNoteAttachment(id: string): Promise<void>;
  getNoteAttachment(id: string): Promise<NoteAttachment | undefined>;
  getPatientNoteAttachments(patientId: string): Promise<(NoteAttachment & { noteContent: string | null })[]>;
  
  // Patient Messages operations
  getPatientMessages(patientId: string, hospitalId: string): Promise<PatientMessage[]>;
  createPatientMessage(message: InsertPatientMessage): Promise<PatientMessage>;
  
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
    pacuBedId: string | null;
    pacuBedName: string | null;
  }>>;
  
  // Pre-Op Assessment operations (Anesthesia module)
  getPreOpAssessments(hospitalId: string): Promise<Array<any>>;
  getPreOpAssessment(surgeryId: string): Promise<PreOpAssessment | undefined>;
  getPreOpAssessmentById(id: string): Promise<PreOpAssessment | undefined>;
  getPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<PreOpAssessment[]>;
  createPreOpAssessment(assessment: InsertPreOpAssessment): Promise<PreOpAssessment>;
  updatePreOpAssessment(id: string, updates: Partial<PreOpAssessment>): Promise<PreOpAssessment>;
  
  // Surgery Pre-Op Assessment operations (Surgery module - simpler, file-based consent)
  getSurgeryPreOpAssessments(hospitalId: string): Promise<Array<any>>;
  getSurgeryPreOpAssessment(surgeryId: string): Promise<SurgeryPreOpAssessment | undefined>;
  getSurgeryPreOpAssessmentById(id: string): Promise<SurgeryPreOpAssessment | undefined>;
  createSurgeryPreOpAssessment(assessment: InsertSurgeryPreOpAssessment): Promise<SurgeryPreOpAssessment>;
  updateSurgeryPreOpAssessment(id: string, updates: Partial<SurgeryPreOpAssessment>): Promise<SurgeryPreOpAssessment>;
  
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
  
  // VAS (Visual Analog Scale) Pain Score operations
  addVASPoint(anesthesiaRecordId: string, timestamp: string, value: number): Promise<ClinicalSnapshot>;
  updateVASPoint(pointId: string, updates: { value?: number; timestamp?: string }): Promise<ClinicalSnapshot | null>;
  deleteVASPoint(pointId: string): Promise<ClinicalSnapshot | null>;
  
  // Aldrete Score operations (PACU recovery)
  addAldretePoint(anesthesiaRecordId: string, timestamp: string, value: number, components?: { activity?: number; respiration?: number; circulation?: number; consciousness?: number; oxygenSaturation?: number }): Promise<ClinicalSnapshot>;
  updateAldretePoint(pointId: string, updates: { value?: number; timestamp?: string; components?: { activity?: number; respiration?: number; circulation?: number; consciousness?: number; oxygenSaturation?: number } }): Promise<ClinicalSnapshot | null>;
  deleteAldretePoint(pointId: string): Promise<ClinicalSnapshot | null>;
  
  // Generic Score operations (Aldrete and PARSAP)
  addScorePoint(anesthesiaRecordId: string, timestamp: string, scoreType: 'aldrete' | 'parsap', totalScore: number, aldreteScore?: { activity: number; respiration: number; circulation: number; consciousness: number; oxygenSaturation: number }, parsapScore?: { pulse: number; activity: number; respiration: number; saturations: number; airwayPatency: number; pupil: number }): Promise<ClinicalSnapshot>;
  updateScorePoint(pointId: string, updates: { timestamp?: string; scoreType?: 'aldrete' | 'parsap'; totalScore?: number; aldreteScore?: { activity: number; respiration: number; circulation: number; consciousness: number; oxygenSaturation: number }; parsapScore?: { pulse: number; activity: number; respiration: number; saturations: number; airwayPatency: number; pupil: number } }): Promise<ClinicalSnapshot | null>;
  deleteScorePoint(pointId: string): Promise<ClinicalSnapshot | null>;
  
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
  saveSurgeryPreOpChecklistEntry(surgeryId: string, templateId: string, itemId: string, checked: boolean, note?: string | null): Promise<SurgeryPreOpChecklistEntry>;
  
  // Checklist Matrix operations
  getFutureSurgeriesWithPatients(hospitalId: string): Promise<(Surgery & { patient?: Patient })[]>;
  getPastSurgeriesWithPatients(hospitalId: string, limit?: number): Promise<(Surgery & { patient?: Patient })[]>;
  getChecklistMatrixEntries(templateId: string, hospitalId: string): Promise<SurgeryPreOpChecklistEntry[]>;
  getPastChecklistMatrixEntries(templateId: string, hospitalId: string, limit?: number): Promise<SurgeryPreOpChecklistEntry[]>;
  toggleSurgeonChecklistTemplateDefault(templateId: string, userId: string): Promise<SurgeonChecklistTemplate>;
  applyTemplateToFutureSurgeries(templateId: string, hospitalId: string): Promise<number>;
  
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
  getConversationAttachments(conversationId: string): Promise<ChatAttachment[]>;
  
  // Chat Notification operations
  createNotification(notification: InsertChatNotification): Promise<ChatNotification>;
  getUnreadNotifications(userId: string, hospitalId?: string): Promise<ChatNotification[]>;
  getUserNotificationsForConversation(userId: string, conversationId: string, notificationType?: string): Promise<ChatNotification[]>;
  markNotificationRead(id: string): Promise<ChatNotification>;
  markNotificationEmailSent(id: string): Promise<ChatNotification>;
  getUnsentEmailNotifications(limit?: number): Promise<(ChatNotification & { user: User; conversation: ChatConversation })[]>;
  
  // ========== PATIENT QUESTIONNAIRE OPERATIONS ==========
  
  // Questionnaire Link operations
  createQuestionnaireLink(link: InsertPatientQuestionnaireLink): Promise<PatientQuestionnaireLink>;
  getQuestionnaireLink(id: string): Promise<PatientQuestionnaireLink | undefined>;
  getQuestionnaireLinkByToken(token: string): Promise<PatientQuestionnaireLink | undefined>;
  getQuestionnaireLinksForPatient(patientId: string): Promise<PatientQuestionnaireLink[]>;
  getQuestionnaireLinksForHospital(hospitalId: string): Promise<PatientQuestionnaireLink[]>;
  updateQuestionnaireLink(id: string, updates: Partial<PatientQuestionnaireLink>): Promise<PatientQuestionnaireLink>;
  invalidateQuestionnaireLink(id: string): Promise<void>;
  
  // Questionnaire Response operations
  createQuestionnaireResponse(response: InsertPatientQuestionnaireResponse): Promise<PatientQuestionnaireResponse>;
  getQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse | undefined>;
  getQuestionnaireResponseByLinkId(linkId: string): Promise<PatientQuestionnaireResponse | undefined>;
  updateQuestionnaireResponse(id: string, updates: Partial<PatientQuestionnaireResponse>): Promise<PatientQuestionnaireResponse>;
  submitQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse>;
  getQuestionnaireResponsesForHospital(hospitalId: string, status?: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]>;
  getUnassociatedQuestionnaireResponsesForHospital(hospitalId: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]>;
  associateQuestionnaireWithPatient(linkId: string, patientId: string): Promise<PatientQuestionnaireLink>;
  
  // Questionnaire Upload operations
  addQuestionnaireUpload(upload: InsertPatientQuestionnaireUpload): Promise<PatientQuestionnaireUpload>;
  getQuestionnaireUploads(responseId: string): Promise<PatientQuestionnaireUpload[]>;
  getQuestionnaireUploadById(id: string): Promise<PatientQuestionnaireUpload | undefined>;
  updateQuestionnaireUpload(id: string, updates: Partial<{ description: string; reviewed: boolean }>): Promise<PatientQuestionnaireUpload>;
  deleteQuestionnaireUpload(id: string): Promise<void>;
  
  // Questionnaire Review operations
  createQuestionnaireReview(review: InsertPatientQuestionnaireReview): Promise<PatientQuestionnaireReview>;
  getQuestionnaireReview(responseId: string): Promise<PatientQuestionnaireReview | undefined>;
  updateQuestionnaireReview(id: string, updates: Partial<PatientQuestionnaireReview>): Promise<PatientQuestionnaireReview>;
  
  // ========== PATIENT DOCUMENT OPERATIONS (Staff uploads) ==========
  getPatientDocuments(patientId: string): Promise<PatientDocument[]>;
  getPatientDocument(id: string): Promise<PatientDocument | undefined>;
  createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocument>;
  updatePatientDocument(id: string, updates: Partial<PatientDocument>): Promise<PatientDocument>;
  deletePatientDocument(id: string): Promise<void>;
  
  // ========== PERSONAL TODO OPERATIONS ==========
  getPersonalTodos(userId: string, hospitalId: string): Promise<PersonalTodo[]>;
  getPersonalTodo(id: string): Promise<PersonalTodo | undefined>;
  createPersonalTodo(todo: InsertPersonalTodo): Promise<PersonalTodo>;
  updatePersonalTodo(id: string, updates: Partial<PersonalTodo>): Promise<PersonalTodo>;
  deletePersonalTodo(id: string): Promise<void>;
  reorderPersonalTodos(todoIds: string[], status: string): Promise<void>;
  
  // ========== EXTERNAL SURGERY REQUESTS ==========
  getExternalSurgeryRequests(hospitalId: string, status?: string): Promise<ExternalSurgeryRequest[]>;
  getExternalSurgeryRequest(id: string): Promise<ExternalSurgeryRequest | undefined>;
  getExternalSurgeryRequestByHospitalToken(token: string): Promise<{ hospital: Hospital } | undefined>;
  createExternalSurgeryRequest(request: InsertExternalSurgeryRequest): Promise<ExternalSurgeryRequest>;
  updateExternalSurgeryRequest(id: string, updates: Partial<ExternalSurgeryRequest>): Promise<ExternalSurgeryRequest>;
  getExternalSurgeryRequestDocuments(requestId: string): Promise<ExternalSurgeryRequestDocument[]>;
  createExternalSurgeryRequestDocument(doc: InsertExternalSurgeryRequestDocument): Promise<ExternalSurgeryRequestDocument>;
  getPendingExternalSurgeryRequestsCount(hospitalId: string): Promise<number>;
  
  // ========== CLINIC APPOINTMENT SCHEDULING ==========
  
  // Clinic Providers (now sourced from user_hospital_roles)
  getClinicProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]>;
  getBookableProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]>;
  
  // Provider Availability
  // unitId can be null for hospital-level (shared calendar) availability
  getProviderAvailability(providerId: string, unitId: string | null, hospitalId?: string): Promise<ProviderAvailability[]>;
  setProviderAvailability(providerId: string, unitId: string | null, availability: InsertProviderAvailability[], hospitalId?: string): Promise<ProviderAvailability[]>;
  updateProviderAvailability(id: string, updates: Partial<ProviderAvailability>): Promise<ProviderAvailability>;
  
  // Provider Availability Mode (on userHospitalRoles)
  updateProviderAvailabilityMode(hospitalId: string, userId: string, mode: 'always_available' | 'windows_required'): Promise<ClinicProvider>;
  
  // Provider Availability Windows (date-specific availability)
  // unitId can be null for hospital-level (shared calendar) windows
  getProviderAvailabilityWindows(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderAvailabilityWindow[]>;
  getProviderAvailabilityWindowsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]>;
  getProviderAvailabilityWindowsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]>;
  createProviderAvailabilityWindow(window: InsertProviderAvailabilityWindow): Promise<ProviderAvailabilityWindow>;
  updateProviderAvailabilityWindow(id: string, updates: Partial<ProviderAvailabilityWindow>): Promise<ProviderAvailabilityWindow>;
  deleteProviderAvailabilityWindow(id: string): Promise<void>;
  
  // Provider Time Off
  // unitId can be null for hospital-level (shared calendar) time off
  getProviderTimeOff(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderTimeOff[]>;
  getProviderTimeOffsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]>;
  getProviderTimeOffsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]>;
  createProviderTimeOff(timeOff: InsertProviderTimeOff): Promise<ProviderTimeOff>;
  updateProviderTimeOff(id: string, updates: Partial<ProviderTimeOff>): Promise<ProviderTimeOff>;
  deleteProviderTimeOff(id: string): Promise<void>;
  
  // Provider Absences (Timebutler sync)
  getProviderAbsences(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAbsence[]>;
  syncProviderAbsences(hospitalId: string, absences: InsertProviderAbsence[]): Promise<void>;
  syncProviderAbsencesForUser(hospitalId: string, userId: string, absences: InsertProviderAbsence[]): Promise<void>;
  clearProviderAbsencesForUser(hospitalId: string, userId: string): Promise<void>;
  
  // Timebutler Config
  getTimebutlerConfig(hospitalId: string): Promise<TimebutlerConfig | undefined>;
  upsertTimebutlerConfig(config: InsertTimebutlerConfig): Promise<TimebutlerConfig>;
  
  // Cal.com Integration Config
  getCalcomConfig(hospitalId: string): Promise<CalcomConfig | undefined>;
  upsertCalcomConfig(config: InsertCalcomConfig): Promise<CalcomConfig>;
  getCalcomProviderMappings(hospitalId: string): Promise<CalcomProviderMapping[]>;
  getCalcomProviderMapping(hospitalId: string, providerId: string): Promise<CalcomProviderMapping | undefined>;
  upsertCalcomProviderMapping(mapping: InsertCalcomProviderMapping): Promise<CalcomProviderMapping>;
  deleteCalcomProviderMapping(id: string): Promise<void>;
  updateCalcomProviderMappingBusyBlocks(id: string, busyBlockMapping: Record<string, string>): Promise<CalcomProviderMapping>;
  
  // Hospital Vonage SMS Config
  getHospitalVonageConfig(hospitalId: string): Promise<HospitalVonageConfig | undefined>;
  upsertHospitalVonageConfig(config: InsertHospitalVonageConfig): Promise<HospitalVonageConfig>;
  updateHospitalVonageTestStatus(hospitalId: string, status: 'success' | 'failed', error?: string): Promise<void>;
  
  // Clinic Appointments
  getClinicAppointments(unitId: string, filters?: {
    providerId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService })[]>;
  getClinicAppointmentsByHospital(hospitalId: string, filters?: {
    providerId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    unitId?: string;
  }): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService })[]>;
  getClinicAppointment(id: string): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService }) | undefined>;
  createClinicAppointment(appointment: InsertClinicAppointment): Promise<ClinicAppointment>;
  updateClinicAppointment(id: string, updates: Partial<ClinicAppointment>): Promise<ClinicAppointment>;
  deleteClinicAppointment(id: string): Promise<void>;
  
  // Available Slots Calculator
  getAvailableSlots(providerId: string, unitId: string, date: string, durationMinutes: number): Promise<{ startTime: string; endTime: string }[]>;
  
  // Clinic Services (for appointment booking)
  getClinicServices(unitId: string): Promise<ClinicService[]>;
  
  // ========== SCHEDULED JOBS ==========
  getNextScheduledJob(): Promise<ScheduledJob | undefined>;
  createScheduledJob(job: InsertScheduledJob): Promise<ScheduledJob>;
  updateScheduledJob(id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob>;
  getLastScheduledJobForHospital(hospitalId: string, jobType: string): Promise<ScheduledJob | undefined>;
  getPendingQuestionnaireJobsCount(hospitalId: string): Promise<number>;
  
  // Auto-questionnaire specific
  getSurgeriesForAutoQuestionnaire(hospitalId: string, daysAhead: number): Promise<Array<{
    surgeryId: string;
    patientId: string;
    patientFirstName: string;
    patientLastName: string;
    patientEmail: string | null;
    patientPhone: string | null;
    patientBirthday: Date | null;
    plannedDate: Date;
    plannedSurgery: string;
    surgeryRoomId: string | null;
    hasQuestionnaireSent: boolean;
    hasExistingQuestionnaire: boolean;
  }>>;
  
  // Pre-surgery reminder specific
  getSurgeriesForPreSurgeryReminder(hospitalId: string, hoursAhead: number): Promise<Array<{
    surgeryId: string;
    patientId: string;
    patientFirstName: string;
    patientLastName: string;
    patientEmail: string | null;
    patientPhone: string | null;
    plannedDate: Date;
    admissionTime: Date | null;
    surgeryRoomId: string | null;
    reminderSent: boolean;
  }>>;
  markSurgeryReminderSent(surgeryId: string): Promise<void>;
  
  // Anesthesia Sets operations
  getAnesthesiaSets(hospitalId: string): Promise<AnesthesiaSet[]>;
  getAnesthesiaSet(id: string): Promise<AnesthesiaSet | null>;
  getAnesthesiaSetItems(setId: string): Promise<AnesthesiaSetItem[]>;
  createAnesthesiaSet(set: InsertAnesthesiaSet): Promise<AnesthesiaSet>;
  updateAnesthesiaSet(id: string, updates: Partial<AnesthesiaSet>): Promise<AnesthesiaSet>;
  deleteAnesthesiaSet(id: string): Promise<void>;
  createAnesthesiaSetItem(item: InsertAnesthesiaSetItem): Promise<AnesthesiaSetItem>;
  deleteAnesthesiaSetItems(setId: string): Promise<void>;
  
  // Anesthesia Set Medications (unified sets)
  getAnesthesiaSetMedications(setId: string): Promise<AnesthesiaSetMedication[]>;
  createAnesthesiaSetMedication(item: InsertAnesthesiaSetMedication): Promise<AnesthesiaSetMedication>;
  deleteAnesthesiaSetMedications(setId: string): Promise<void>;
  
  // Anesthesia Set Inventory (unified sets)
  getAnesthesiaSetInventory(setId: string): Promise<AnesthesiaSetInventoryItem[]>;
  createAnesthesiaSetInventoryItem(item: InsertAnesthesiaSetInventoryItem): Promise<AnesthesiaSetInventoryItem>;
  deleteAnesthesiaSetInventory(setId: string): Promise<void>;
  
  // Inventory Sets operations
  getInventorySets(hospitalId: string, unitId?: string): Promise<InventorySet[]>;
  getInventorySet(id: string): Promise<InventorySet | null>;
  getInventorySetItems(setId: string): Promise<InventorySetItem[]>;
  createInventorySet(set: InsertInventorySet): Promise<InventorySet>;
  updateInventorySet(id: string, updates: Partial<InventorySet>): Promise<InventorySet>;
  deleteInventorySet(id: string): Promise<void>;
  createInventorySetItem(item: InsertInventorySetItem): Promise<InventorySetItem>;
  deleteInventorySetItems(setId: string): Promise<void>;
  
  // Additional inventory usage operations for sets
  getInventoryUsageByItem(anesthesiaRecordId: string, itemId: string): Promise<InventoryUsage | null>;
  createInventoryUsage(usage: InsertInventoryUsage): Promise<InventoryUsage>;
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

  async getUserHospitals(userId: string): Promise<(Hospital & { role: string; unitId: string; unitName: string; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean; isLogisticModule: boolean; showControlledMedications: boolean })[]> {
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
      unitType: row.units.type,
      // Deprecated: use unitType instead - these are derived from type for backwards compatibility
      isAnesthesiaModule: row.units.type === 'anesthesia',
      isSurgeryModule: row.units.type === 'or',
      isBusinessModule: row.units.type === 'business',
      isClinicModule: row.units.type === 'clinic',
      isLogisticModule: row.units.type === 'logistic',
      showControlledMedications: row.units.showControlledMedications ?? false,
    })) as (Hospital & { role: string; unitId: string; unitName: string; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean; isBusinessModule: boolean; isClinicModule: boolean; isLogisticModule: boolean; showControlledMedications: boolean })[];
  }

  async createHospital(name: string): Promise<Hospital> {
    const [hospital] = await db
      .insert(hospitals)
      .values({ 
        name,
        trialStartDate: new Date(), // Set trial start date for new hospitals (15-day trial)
      })
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

  async getHospitalByQuestionnaireToken(token: string): Promise<Hospital | undefined> {
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.questionnaireToken, token));
    return hospital;
  }

  async setHospitalQuestionnaireToken(hospitalId: string, token: string | null): Promise<Hospital> {
    const [updated] = await db
      .update(hospitals)
      .set({ questionnaireToken: token, updatedAt: new Date() })
      .where(eq(hospitals.id, hospitalId))
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
    includeArchived?: boolean;
  }): Promise<(Item & { stockLevel?: StockLevel; soonestExpiry?: Date })[]> {
    // Build conditions: hospitalId, unitId, optionally exclude archived items, and optional filters
    const conditions = [
      eq(items.hospitalId, hospitalId), 
      eq(items.unitId, unitId),
    ];
    
    // Only filter to active items if not explicitly including archived
    if (!filters?.includeArchived) {
      conditions.push(eq(items.status, 'active'));
    }
    
    // Apply filters
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

  async getLotById(lotId: string): Promise<Lot | undefined> {
    const [lot] = await db.select().from(lots).where(eq(lots.id, lotId));
    return lot;
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
    
    // Clean the updates object to remove undefined values which can cause issues
    const cleanedUpdates: Record<string, any> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        cleanedUpdates[key] = value;
      }
    }
    
    if (existing) {
      console.log(`[Storage] Updating existing item codes for ${itemId}`);
      const [updated] = await db
        .update(itemCodes)
        .set({ ...cleanedUpdates, updatedAt: new Date() })
        .where(eq(itemCodes.itemId, itemId))
        .returning();
      return updated;
    } else {
      console.log(`[Storage] Creating new item codes for ${itemId}`);
      const [created] = await db
        .insert(itemCodes)
        .values({ itemId, ...cleanedUpdates } as InsertItemCode)
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
    // Check for existing supplier code with same itemId, supplierName, and articleCode to avoid duplicates
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
        // Update existing record instead of creating duplicate
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

  async getConfirmedSupplierMatches(hospitalId: string): Promise<(SupplierCode & { item: Item })[]> {
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

  async getSupplierMatchesByJobId(jobId: string): Promise<(SupplierCode & { item: Item })[]> {
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

  async getOrders(hospitalId: string, status?: string, unitId?: string): Promise<(Order & { vendor: Vendor | null; orderLines: (OrderLine & { item: Item & { hospitalUnit?: Unit; stockLevel?: StockLevel } })[] })[]> {
    const conditions = [eq(orders.hospitalId, hospitalId)];
    
    if (status) {
      conditions.push(eq(orders.status, status));
    }
    
    if (unitId) {
      conditions.push(eq(orders.unitId, unitId));
    }

    const ordersResult = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(desc(orders.createdAt));
    
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

        // Fetch ALL supplier codes and item codes for all items in this order
        // We'll prefer the one marked as isPreferred, otherwise use the first one
        const itemIds = lines.map(l => l.item.id);
        
        const [allSupplierCodesResult, itemCodesResult] = await Promise.all([
          itemIds.length > 0 
            ? db
                .select()
                .from(supplierCodes)
                .where(inArray(supplierCodes.itemId, itemIds))
            : Promise.resolve([]),
          itemIds.length > 0
            ? db
                .select()
                .from(itemCodes)
                .where(inArray(itemCodes.itemId, itemIds))
            : Promise.resolve([])
        ]);
        
        // Group suppliers by itemId: prefer isPreferred, otherwise use the most recently created one
        const supplierCodesByItemId = new Map<string, typeof allSupplierCodesResult[0]>();
        for (const sc of allSupplierCodesResult) {
          const existing = supplierCodesByItemId.get(sc.itemId);
          if (!existing) {
            // First supplier for this item
            supplierCodesByItemId.set(sc.itemId, sc);
          } else if (sc.isPreferred && !existing.isPreferred) {
            // This one is preferred, existing is not
            supplierCodesByItemId.set(sc.itemId, sc);
          } else if (!existing.isPreferred && !sc.isPreferred) {
            // Neither is preferred - use the more recently created one
            const scCreated = sc.createdAt ? new Date(sc.createdAt).getTime() : 0;
            const existingCreated = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
            if (scCreated > existingCreated) {
              supplierCodesByItemId.set(sc.itemId, sc);
            }
          }
        }
        
        const itemCodesByItemId = new Map(
          itemCodesResult.map(ic => [ic.itemId, ic])
        );

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
              preferredSupplierCode: supplierCodesByItemId.get(line.item.id) || null,
              itemCodes: itemCodesByItemId.get(line.item.id) || null,
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

  async getOrderById(orderId: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    return order;
  }

  async getOrderLineById(lineId: string): Promise<OrderLine | undefined> {
    const [line] = await db.select().from(orderLines).where(eq(orderLines.id, lineId));
    return line;
  }

  async updateOrderStatus(id: string, status: string): Promise<Order> {
    const updateData: { status: string; updatedAt: Date; sentAt?: Date } = { 
      status, 
      updatedAt: new Date() 
    };
    
    // Set sentAt when order is first sent
    if (status === 'sent') {
      updateData.sentAt = new Date();
    }
    
    const [updated] = await db
      .update(orders)
      .set(updateData)
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

  async getAlertById(id: string): Promise<Alert | undefined> {
    const [alert] = await db.select().from(alerts).where(eq(alerts.id, id));
    return alert;
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

  async getUnit(id: string): Promise<Unit | undefined> {
    const [unit] = await db
      .select()
      .from(units)
      .where(eq(units.id, id))
      .limit(1);
    return unit;
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
      .where(
        and(
          eq(userHospitalRoles.hospitalId, hospitalId),
          isNull(users.archivedAt) // Filter out archived users
        )
      )
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

  async getUserHospitalRoleById(id: string): Promise<UserHospitalRole | undefined> {
    const [role] = await db.select().from(userHospitalRoles).where(eq(userHospitalRoles.id, id));
    return role;
  }

  async searchUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return user;
  }

  async findUserByEmailAndName(email: string, firstName: string, lastName: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(and(
        eq(users.email, email),
        eq(users.firstName, firstName),
        eq(users.lastName, lastName)
      ))
      .limit(1);
    return user;
  }

  async createUser(userData: { email: string; firstName: string; lastName: string; phone?: string; staffType?: 'internal' | 'external'; canLogin?: boolean }): Promise<User> {
    const nanoid = (await import('nanoid')).nanoid;
    
    const [newUser] = await db
      .insert(users)
      .values({
        id: nanoid(),
        email: userData.email,
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone || null,
        staffType: userData.staffType || 'internal',
        canLogin: userData.canLogin ?? true,
        profileImageUrl: null,
      })
      .returning();
    return newUser;
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

  async getControlledCheck(id: string): Promise<ControlledCheck | undefined> {
    const [check] = await db
      .select()
      .from(controlledChecks)
      .where(eq(controlledChecks.id, id));
    return check;
  }

  async deleteControlledCheck(id: string): Promise<void> {
    await db.delete(controlledChecks).where(eq(controlledChecks.id, id));
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

  async getGalexisCatalogWithCredentials(hospitalId: string): Promise<(SupplierCatalog & { apiPassword: string | null }) | undefined> {
    const [catalog] = await db
      .select()
      .from(supplierCatalogs)
      .where(and(
        eq(supplierCatalogs.hospitalId, hospitalId),
        eq(supplierCatalogs.supplierName, 'Galexis')
      ));
    if (!catalog) return undefined;
    const apiPassword = catalog.apiPasswordEncrypted ? decryptCredential(catalog.apiPasswordEncrypted) : null;
    return { ...catalog, apiPassword };
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

  async getMedicationConfigById(id: string): Promise<MedicationConfig | undefined> {
    const [config] = await db
      .select()
      .from(medicationConfigs)
      .where(eq(medicationConfigs.id, id));
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

  async getMedicationGroupById(id: string): Promise<MedicationGroup | undefined> {
    const [group] = await db.select().from(medicationGroups).where(eq(medicationGroups.id, id));
    return group;
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

  async getAdministrationGroupById(id: string): Promise<AdministrationGroup | undefined> {
    const [group] = await db.select().from(administrationGroups).where(eq(administrationGroups.id, id));
    return group;
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

  async getSurgeryRoomById(id: string): Promise<SurgeryRoom | undefined> {
    const [room] = await db.select().from(surgeryRooms).where(eq(surgeryRooms.id, id));
    return room;
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

  async createPatient(patient: InsertPatient & { patientNumber?: string }): Promise<Patient> {
    const [created] = await db.insert(patients).values(patient as any).returning();
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
    includeArchived?: boolean;
  }): Promise<Surgery[]> {
    const conditions = [
      eq(surgeries.hospitalId, hospitalId),
      isNull(patients.deletedAt)
    ];
    
    if (!filters?.includeArchived) {
      conditions.push(eq(surgeries.isArchived, false));
    }
    
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

  // Surgery Notes operations
  async getSurgeryNotes(surgeryId: string): Promise<(SurgeryNote & { author: User })[]> {
    const results = await db
      .select({
        note: surgeryNotes,
        author: users,
      })
      .from(surgeryNotes)
      .innerJoin(users, eq(surgeryNotes.authorId, users.id))
      .where(eq(surgeryNotes.surgeryId, surgeryId))
      .orderBy(desc(surgeryNotes.createdAt));
    return results.map(r => ({ ...r.note, author: r.author }));
  }

  async getSurgeryNoteById(id: string): Promise<SurgeryNote | undefined> {
    const [note] = await db.select().from(surgeryNotes).where(eq(surgeryNotes.id, id));
    return note;
  }

  async createSurgeryNote(note: InsertSurgeryNote): Promise<SurgeryNote> {
    const [created] = await db
      .insert(surgeryNotes)
      .values(note)
      .returning();
    return created;
  }

  async updateSurgeryNote(id: string, content: string): Promise<SurgeryNote> {
    const [updated] = await db
      .update(surgeryNotes)
      .set({ content, updatedAt: new Date() })
      .where(eq(surgeryNotes.id, id))
      .returning();
    return updated;
  }

  async deleteSurgeryNote(id: string): Promise<void> {
    await db.delete(surgeryNotes).where(eq(surgeryNotes.id, id));
  }

  // Patient Notes operations
  async getPatientNotes(patientId: string): Promise<(PatientNote & { author: User })[]> {
    const results = await db
      .select({
        note: patientNotes,
        author: users,
      })
      .from(patientNotes)
      .innerJoin(users, eq(patientNotes.authorId, users.id))
      .where(eq(patientNotes.patientId, patientId))
      .orderBy(desc(patientNotes.createdAt));
    return results.map(r => ({ ...r.note, author: r.author }));
  }

  async createPatientNote(note: InsertPatientNote): Promise<PatientNote> {
    const [created] = await db
      .insert(patientNotes)
      .values(note)
      .returning();
    return created;
  }

  async updatePatientNote(id: string, content: string): Promise<PatientNote> {
    const [updated] = await db
      .update(patientNotes)
      .set({ content, updatedAt: new Date() })
      .where(eq(patientNotes.id, id))
      .returning();
    return updated;
  }

  async deletePatientNote(id: string): Promise<void> {
    await db.delete(patientNotes).where(eq(patientNotes.id, id));
  }

  // Note Attachments operations
  async getNoteAttachments(noteType: 'patient' | 'surgery', noteId: string): Promise<NoteAttachment[]> {
    return await db
      .select()
      .from(noteAttachments)
      .where(and(
        eq(noteAttachments.noteType, noteType),
        eq(noteAttachments.noteId, noteId)
      ))
      .orderBy(desc(noteAttachments.createdAt));
  }

  async createNoteAttachment(attachment: InsertNoteAttachment): Promise<NoteAttachment> {
    const [created] = await db
      .insert(noteAttachments)
      .values(attachment)
      .returning();
    return created;
  }

  async deleteNoteAttachment(id: string): Promise<void> {
    await db.delete(noteAttachments).where(eq(noteAttachments.id, id));
  }

  async getNoteAttachment(id: string): Promise<NoteAttachment | undefined> {
    const [attachment] = await db
      .select()
      .from(noteAttachments)
      .where(eq(noteAttachments.id, id));
    return attachment;
  }

  async getPatientNoteAttachments(patientId: string): Promise<(NoteAttachment & { noteContent: string | null })[]> {
    // Get attachments from patient notes
    const patientNoteAttachments = await db
      .select({
        id: noteAttachments.id,
        noteType: noteAttachments.noteType,
        noteId: noteAttachments.noteId,
        storageKey: noteAttachments.storageKey,
        fileName: noteAttachments.fileName,
        mimeType: noteAttachments.mimeType,
        fileSize: noteAttachments.fileSize,
        uploadedBy: noteAttachments.uploadedBy,
        createdAt: noteAttachments.createdAt,
        noteContent: patientNotes.content,
      })
      .from(noteAttachments)
      .innerJoin(patientNotes, and(
        eq(noteAttachments.noteType, 'patient'),
        eq(noteAttachments.noteId, patientNotes.id)
      ))
      .where(eq(patientNotes.patientId, patientId));

    // Get attachments from surgery notes (for surgeries belonging to this patient)
    const surgeryNoteAttachments = await db
      .select({
        id: noteAttachments.id,
        noteType: noteAttachments.noteType,
        noteId: noteAttachments.noteId,
        storageKey: noteAttachments.storageKey,
        fileName: noteAttachments.fileName,
        mimeType: noteAttachments.mimeType,
        fileSize: noteAttachments.fileSize,
        uploadedBy: noteAttachments.uploadedBy,
        createdAt: noteAttachments.createdAt,
        noteContent: surgeryNotes.content,
      })
      .from(noteAttachments)
      .innerJoin(surgeryNotes, and(
        eq(noteAttachments.noteType, 'surgery'),
        eq(noteAttachments.noteId, surgeryNotes.id)
      ))
      .innerJoin(surgeries, eq(surgeryNotes.surgeryId, surgeries.id))
      .where(eq(surgeries.patientId, patientId));

    // Combine and sort by creation date descending
    const allAttachments = [...patientNoteAttachments, ...surgeryNoteAttachments];
    allAttachments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    return allAttachments;
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
    dateOfBirth: string | null;
    sex: string | null;
    age: number;
    procedure: string;
    anesthesiaPresenceEndTime: number;
    postOpDestination: string | null;
    status: 'transferring' | 'in_recovery' | 'discharged';
    statusTimestamp: number;
    pacuBedId: string | null;
    pacuBedName: string | null;
  }>> {
    const results = await db
      .select({
        anesthesiaRecord: anesthesiaRecords,
        surgery: surgeries,
        patient: patients,
        pacuBed: surgeryRooms,
      })
      .from(anesthesiaRecords)
      .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .leftJoin(surgeryRooms, eq(surgeries.pacuBedId, surgeryRooms.id))
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
          dateOfBirth: row.patient.birthday || null,
          sex: row.patient.sex || null,
          age,
          procedure: row.surgery.plannedSurgery,
          anesthesiaPresenceEndTime: a2Time || x2Time || statusTimestamp,
          postOpDestination: postOpData?.postOpDestination || null,
          status,
          statusTimestamp,
          pacuBedId: row.surgery.pacuBedId || null,
          pacuBedName: row.pacuBed?.name || null,
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
      .leftJoin(patientQuestionnaireLinks, eq(surgeries.id, patientQuestionnaireLinks.surgeryId))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          isNull(patients.deletedAt),
          eq(surgeries.noPreOpRequired, false),
          eq(surgeries.isArchived, false)
        )
      )
      .orderBy(desc(surgeries.plannedDate));

    // Group results by surgery ID to handle multiple questionnaire links
    const surgeryMap = new Map<string, any>();
    
    for (const row of results) {
      const surgery = row.surgeries;
      const patient = row.patients;
      const questionnaireLink = row.patient_questionnaire_links;
      
      if (!surgeryMap.has(surgery.id)) {
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
          // Include patient email and phone for sending pre-op form
          patientEmail: patient?.email || null,
          patientPhone: patient?.phone || null,
        };

        surgeryMap.set(surgery.id, {
          surgery: surgeryWithPatient,
          assessment: row.preop_assessments,
          // Status: planned (no assessment), draft (has assessment but not completed), completed (has signature)
          status: !row.preop_assessments ? 'planned' : row.preop_assessments.status || 'draft',
          // Track if questionnaire was sent
          questionnaireEmailSent: questionnaireLink?.emailSent || false,
          questionnaireEmailSentAt: questionnaireLink?.emailSentAt || null,
          questionnaireStatus: questionnaireLink?.status || null,
        });
      } else {
        // If we already have this surgery and found another questionnaire link, update if it has email sent
        const existing = surgeryMap.get(surgery.id);
        if (questionnaireLink?.emailSent) {
          existing.questionnaireEmailSent = true;
          existing.questionnaireEmailSentAt = questionnaireLink.emailSentAt || existing.questionnaireEmailSentAt;
          existing.questionnaireStatus = questionnaireLink.status || existing.questionnaireStatus;
        }
      }
    }

    return Array.from(surgeryMap.values());
  }

  async getPreOpAssessment(surgeryId: string): Promise<PreOpAssessment | undefined> {
    // Join with surgeries to exclude assessments for archived surgeries
    const [result] = await db
      .select({ assessment: preOpAssessments })
      .from(preOpAssessments)
      .innerJoin(surgeries, eq(preOpAssessments.surgeryId, surgeries.id))
      .where(
        and(
          eq(preOpAssessments.surgeryId, surgeryId),
          eq(surgeries.isArchived, false)
        )
      );
    return result?.assessment;
  }

  async getPreOpAssessmentById(id: string): Promise<PreOpAssessment | undefined> {
    // Join with surgeries to exclude assessments for archived surgeries
    const [result] = await db
      .select({ assessment: preOpAssessments })
      .from(preOpAssessments)
      .innerJoin(surgeries, eq(preOpAssessments.surgeryId, surgeries.id))
      .where(
        and(
          eq(preOpAssessments.id, id),
          eq(surgeries.isArchived, false)
        )
      );
    return result?.assessment;
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
          inArray(surgeries.hospitalId, authorizedHospitalIds),
          eq(surgeries.isArchived, false)
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

  // Surgery Pre-Op Assessment operations (Surgery module - simpler, file-based consent)
  async getSurgeryPreOpAssessments(hospitalId: string): Promise<Array<any>> {
    const results = await db
      .select()
      .from(surgeries)
      .leftJoin(surgeryPreOpAssessments, eq(surgeries.id, surgeryPreOpAssessments.surgeryId))
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          isNull(patients.deletedAt),
          eq(surgeries.isArchived, false)
        )
      )
      .orderBy(desc(surgeries.plannedDate));

    return results.map(row => {
      const patient = row.patients;
      const surgery = row.surgeries;
      
      const surgeryWithPatient = {
        ...surgery,
        patientName: patient ? `${patient.firstName} ${patient.surname}` : 'Unknown Patient',
        patientMRN: patient?.patientNumber || '',
        patientBirthday: patient?.birthday || null,
        patientSex: patient?.sex || null,
        procedureName: surgery.plannedSurgery,
        patientAllergies: patient?.allergies || [],
        patientOtherAllergies: patient?.otherAllergies || null,
        patientEmail: patient?.email || null,
        patientPhone: patient?.phone || null,
      };

      return {
        surgery: surgeryWithPatient,
        assessment: row.surgery_preop_assessments,
        status: !row.surgery_preop_assessments ? 'planned' : row.surgery_preop_assessments.status || 'draft',
      };
    });
  }

  async getSurgeryPreOpAssessment(surgeryId: string): Promise<SurgeryPreOpAssessment | undefined> {
    const [result] = await db
      .select({ assessment: surgeryPreOpAssessments })
      .from(surgeryPreOpAssessments)
      .innerJoin(surgeries, eq(surgeryPreOpAssessments.surgeryId, surgeries.id))
      .where(
        and(
          eq(surgeryPreOpAssessments.surgeryId, surgeryId),
          eq(surgeries.isArchived, false)
        )
      );
    return result?.assessment;
  }

  async getSurgeryPreOpAssessmentById(id: string): Promise<SurgeryPreOpAssessment | undefined> {
    const [result] = await db
      .select({ assessment: surgeryPreOpAssessments })
      .from(surgeryPreOpAssessments)
      .innerJoin(surgeries, eq(surgeryPreOpAssessments.surgeryId, surgeries.id))
      .where(
        and(
          eq(surgeryPreOpAssessments.id, id),
          eq(surgeries.isArchived, false)
        )
      );
    return result?.assessment;
  }

  async createSurgeryPreOpAssessment(assessment: InsertSurgeryPreOpAssessment): Promise<SurgeryPreOpAssessment> {
    const [created] = await db.insert(surgeryPreOpAssessments).values(assessment).returning();
    return created;
  }

  async updateSurgeryPreOpAssessment(id: string, updates: Partial<SurgeryPreOpAssessment>): Promise<SurgeryPreOpAssessment> {
    const [updated] = await db
      .update(surgeryPreOpAssessments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(surgeryPreOpAssessments.id, id))
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
   * Add a VAS (Visual Analog Scale) pain score point
   */
  async addVASPoint(
    anesthesiaRecordId: string,
    timestamp: string,
    value: number
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    const currentVAS = (snapshot.data as any).vas || [];
    const updatedData = {
      ...snapshot.data,
      vas: [...currentVAS, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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
   * Update a VAS point by ID
   */
  async updateVASPoint(
    pointId: string,
    updates: { value?: number; timestamp?: string }
  ): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const vas = data.vas || [];
      
      const pointIndex = vas.findIndex((p: any) => p.id === pointId);
      if (pointIndex !== -1) {
        const updatedPoints = [...vas];
        updatedPoints[pointIndex] = {
          ...updatedPoints[pointIndex],
          ...updates,
        };
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          vas: updatedPoints,
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
    
    return null;
  }

  /**
   * Delete a VAS point by ID
   */
  async deleteVASPoint(pointId: string): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const vas = data.vas || [];
      
      const filteredPoints = vas.filter((p: any) => p.id !== pointId);
      if (filteredPoints.length < vas.length) {
        const updatedData = {
          ...data,
          vas: filteredPoints,
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
    
    return null;
  }

  /**
   * Add an Aldrete score point (PACU recovery score)
   */
  async addAldretePoint(
    anesthesiaRecordId: string,
    timestamp: string,
    value: number,
    components?: { activity?: number; respiration?: number; circulation?: number; consciousness?: number; oxygenSaturation?: number }
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint: any = {
      id: randomUUID(),
      timestamp,
      value,
    };
    
    if (components) {
      newPoint.components = components;
    }
    
    const currentAldrete = (snapshot.data as any).aldrete || [];
    const updatedData = {
      ...snapshot.data,
      aldrete: [...currentAldrete, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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
   * Update an Aldrete point by ID
   */
  async updateAldretePoint(
    pointId: string,
    updates: { value?: number; timestamp?: string; components?: { activity?: number; respiration?: number; circulation?: number; consciousness?: number; oxygenSaturation?: number } }
  ): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const aldrete = data.aldrete || [];
      
      const pointIndex = aldrete.findIndex((p: any) => p.id === pointId);
      if (pointIndex !== -1) {
        const updatedPoints = [...aldrete];
        updatedPoints[pointIndex] = {
          ...updatedPoints[pointIndex],
          ...updates,
        };
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          aldrete: updatedPoints,
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
    
    return null;
  }

  /**
   * Delete an Aldrete point by ID
   */
  async deleteAldretePoint(pointId: string): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const aldrete = data.aldrete || [];
      
      const filteredPoints = aldrete.filter((p: any) => p.id !== pointId);
      if (filteredPoints.length < aldrete.length) {
        const updatedData = {
          ...data,
          aldrete: filteredPoints,
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
    
    return null;
  }

  /**
   * Add a generic score point (Aldrete or PARSAP)
   */
  async addScorePoint(
    anesthesiaRecordId: string,
    timestamp: string,
    scoreType: 'aldrete' | 'parsap',
    totalScore: number,
    aldreteScore?: { activity: number; respiration: number; circulation: number; consciousness: number; oxygenSaturation: number },
    parsapScore?: { pulse: number; activity: number; respiration: number; saturations: number; airwayPatency: number; pupil: number }
  ): Promise<ClinicalSnapshot> {
    const snapshot = await this.getClinicalSnapshot(anesthesiaRecordId);
    
    const newPoint: any = {
      id: randomUUID(),
      timestamp,
      scoreType,
      totalScore,
    };
    
    if (aldreteScore) {
      newPoint.aldreteScore = aldreteScore;
    }
    if (parsapScore) {
      newPoint.parsapScore = parsapScore;
    }
    
    const currentScores = (snapshot.data as any).scores || [];
    const updatedData = {
      ...snapshot.data,
      scores: [...currentScores, newPoint].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
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
   * Update a score point by ID
   */
  async updateScorePoint(
    pointId: string,
    updates: { timestamp?: string; scoreType?: 'aldrete' | 'parsap'; totalScore?: number; aldreteScore?: { activity: number; respiration: number; circulation: number; consciousness: number; oxygenSaturation: number }; parsapScore?: { pulse: number; activity: number; respiration: number; saturations: number; airwayPatency: number; pupil: number } }
  ): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const scores = data.scores || [];
      
      const pointIndex = scores.findIndex((p: any) => p.id === pointId);
      if (pointIndex !== -1) {
        const updatedPoints = [...scores];
        // Only merge defined fields to avoid overwriting with undefined
        const existingPoint = updatedPoints[pointIndex];
        const mergedPoint = { ...existingPoint };
        
        if (updates.timestamp !== undefined) mergedPoint.timestamp = updates.timestamp;
        if (updates.scoreType !== undefined) mergedPoint.scoreType = updates.scoreType;
        if (updates.totalScore !== undefined) mergedPoint.totalScore = updates.totalScore;
        if (updates.aldreteScore !== undefined) mergedPoint.aldreteScore = updates.aldreteScore;
        if (updates.parsapScore !== undefined) mergedPoint.parsapScore = updates.parsapScore;
        
        updatedPoints[pointIndex] = mergedPoint;
        updatedPoints.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
        
        const updatedData = {
          ...data,
          scores: updatedPoints,
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
    
    return null;
  }

  /**
   * Delete a score point by ID
   */
  async deleteScorePoint(pointId: string): Promise<ClinicalSnapshot | null> {
    const allSnapshots = await db.select().from(clinicalSnapshots);
    
    for (const snapshot of allSnapshots) {
      const data = snapshot.data as any;
      const scores = data.scores || [];
      
      const filteredPoints = scores.filter((p: any) => p.id !== pointId);
      if (filteredPoints.length < scores.length) {
        const updatedData = {
          ...data,
          scores: filteredPoints,
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
    
    return null;
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
      const isTci = item.rateUnit === 'TCI'; // TCI mode: actual amount entered by user when stopping
      const isRateControlled = item.rateUnit && item.rateUnit !== 'free' && item.rateUnit !== 'TCI';

      let totalQty = 0;

      if (isTci) {
        // TCI mode: Use the actual amount from infusion_stop records
        // When TCI infusion is stopped, user enters the actual amount used
        // Only count stop records that have a corresponding completed start record
        
        const startMeds = meds.filter(m => m.type === 'infusion_start');
        const stopMeds = meds.filter(m => m.type === 'infusion_stop');
        
        // Track used start IDs to prevent double-counting
        const usedStartIds = new Set<string>();
        let totalDose = 0;
        
        for (const stopMed of stopMeds) {
          // Find the matching start record by infusionSessionId or by pairing
          const matchingStart = startMeds.find(start => {
            // Skip already matched starts
            if (usedStartIds.has(start.id)) return false;
            
            // If stop has infusionSessionId, it should match the start record's id
            if (stopMed.infusionSessionId && stopMed.infusionSessionId === start.id) {
              return true;
            }
            // Legacy fallback: stop comes after start and start has ended
            if (!stopMed.infusionSessionId) {
              const startTime = new Date(start.timestamp).getTime();
              const stopTime = new Date(stopMed.timestamp).getTime();
              return stopTime > startTime && start.endTimestamp;
            }
            return false;
          });
          
          // Only count dose if there's a matching completed session
          if (matchingStart && matchingStart.endTimestamp) {
            usedStartIds.add(matchingStart.id); // Mark as used to prevent double-counting
            const doseValue = parseFloat(stopMed.dose?.match(/[\d.]+/)?.[0] || '0');
            totalDose += doseValue;
          }
        }
        
        // Calculate ampules from total dose
        const ampuleValue = parseFloat(item.ampuleTotalContent?.match(/[\d.]+/)?.[0] || '0');
        if (ampuleValue > 0 && totalDose > 0) {
          totalQty = Math.ceil(totalDose / ampuleValue);
        }
        
        console.log('[INVENTORY-CALC] TCI infusion usage:', {
          itemId,
          startRecordsCount: startMeds.length,
          stopRecordsCount: stopMeds.length,
          matchedSessions: usedStartIds.size,
          totalDose,
          ampuleValue,
          totalAmpules: totalQty
        });
      } else if (isBolus) {
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
    // Skip service items as they don't have physical stock
    for (const item of itemsToCommit) {
      const itemData = itemsMap.get(item.itemId);
      if (itemData && !itemData.isService && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
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
      // Skip service items as they don't have physical stock
      if (itemData && !itemData.isService && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
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
        // First, delete any surgery checklist entries that reference these items
        // This is necessary because surgery_preop_checklist_entries has a foreign key to template items
        await db
          .delete(surgeryPreOpChecklistEntries)
          .where(inArray(surgeryPreOpChecklistEntries.itemId, idsToDelete));
        
        // Now we can safely delete the template items
        await db
          .delete(surgeonChecklistTemplateItems)
          .where(inArray(surgeonChecklistTemplateItems.id, idsToDelete));
      }

      // Track newly created item IDs for propagation
      const newItemIds: string[] = [];

      for (const item of items) {
        if (item.id && existingIds.includes(item.id)) {
          await db
            .update(surgeonChecklistTemplateItems)
            .set({ label: item.label, sortOrder: item.sortOrder })
            .where(eq(surgeonChecklistTemplateItems.id, item.id));
        } else {
          const [created] = await db
            .insert(surgeonChecklistTemplateItems)
            .values({
              templateId: id,
              label: item.label,
              sortOrder: item.sortOrder,
            })
            .returning();
          newItemIds.push(created.id);
        }
      }

      // Propagate new items to all surgeries that already use this template
      if (newItemIds.length > 0) {
        // Find all unique surgery IDs that have entries for this template
        const existingEntries = await db
          .select({ surgeryId: surgeryPreOpChecklistEntries.surgeryId })
          .from(surgeryPreOpChecklistEntries)
          .where(eq(surgeryPreOpChecklistEntries.templateId, id))
          .groupBy(surgeryPreOpChecklistEntries.surgeryId);

        const surgeryIds = existingEntries.map(e => e.surgeryId);

        // Create unchecked entries for new items in all surgeries using this template
        for (const surgeryId of surgeryIds) {
          for (const newItemId of newItemIds) {
            await db.insert(surgeryPreOpChecklistEntries).values({
              surgeryId,
              templateId: id,
              itemId: newItemId,
              checked: false,
              note: null,
            });
          }
        }
      }
    }

    return updated;
  }

  async deleteSurgeonChecklistTemplate(id: string): Promise<void> {
    // First delete all checklist entries that reference this template
    await db.delete(surgeryPreOpChecklistEntries).where(eq(surgeryPreOpChecklistEntries.templateId, id));
    // Template items will cascade delete automatically due to onDelete: 'cascade'
    // Now delete the template itself
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

  async saveSurgeryPreOpChecklistEntry(
    surgeryId: string,
    templateId: string,
    itemId: string,
    checked: boolean,
    note?: string | null
  ): Promise<SurgeryPreOpChecklistEntry> {
    const [existing] = await db
      .select()
      .from(surgeryPreOpChecklistEntries)
      .where(and(
        eq(surgeryPreOpChecklistEntries.surgeryId, surgeryId),
        eq(surgeryPreOpChecklistEntries.itemId, itemId)
      ));

    if (existing) {
      const [updated] = await db
        .update(surgeryPreOpChecklistEntries)
        .set({ 
          checked, 
          note: note ?? null,
          templateId,
          updatedAt: new Date() 
        })
        .where(eq(surgeryPreOpChecklistEntries.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db
        .insert(surgeryPreOpChecklistEntries)
        .values({
          surgeryId,
          templateId,
          itemId,
          checked,
          note: note ?? null,
        })
        .returning();
      return created;
    }
  }

  async getFutureSurgeriesWithPatients(hospitalId: string): Promise<(Surgery & { patient?: Patient })[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const surgeriesWithPatients = await db
      .select()
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        gte(surgeries.plannedDate, today),
        eq(surgeries.isArchived, false)
      ))
      .orderBy(asc(surgeries.plannedDate));

    return surgeriesWithPatients.map(row => ({
      ...row.surgeries,
      patient: row.patients || undefined,
    }));
  }

  async getPastSurgeriesWithPatients(hospitalId: string, limit: number = 100): Promise<(Surgery & { patient?: Patient })[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const surgeriesWithPatients = await db
      .select()
      .from(surgeries)
      .leftJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        lt(surgeries.plannedDate, today),
        eq(surgeries.isArchived, false)
      ))
      .orderBy(desc(surgeries.plannedDate))
      .limit(limit);

    return surgeriesWithPatients.map(row => ({
      ...row.surgeries,
      patient: row.patients || undefined,
    }));
  }

  async getChecklistMatrixEntries(templateId: string, hospitalId: string): Promise<SurgeryPreOpChecklistEntry[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await db
      .select({
        entry: surgeryPreOpChecklistEntries,
      })
      .from(surgeryPreOpChecklistEntries)
      .innerJoin(surgeries, eq(surgeryPreOpChecklistEntries.surgeryId, surgeries.id))
      .where(and(
        eq(surgeryPreOpChecklistEntries.templateId, templateId),
        eq(surgeries.hospitalId, hospitalId),
        gte(surgeries.plannedDate, today),
        eq(surgeries.isArchived, false)
      ));

    return entries.map(row => row.entry);
  }

  async getPastChecklistMatrixEntries(templateId: string, hospitalId: string, limit: number = 100): Promise<SurgeryPreOpChecklistEntry[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const entries = await db
      .select({
        entry: surgeryPreOpChecklistEntries,
      })
      .from(surgeryPreOpChecklistEntries)
      .innerJoin(surgeries, eq(surgeryPreOpChecklistEntries.surgeryId, surgeries.id))
      .where(and(
        eq(surgeryPreOpChecklistEntries.templateId, templateId),
        eq(surgeries.hospitalId, hospitalId),
        lt(surgeries.plannedDate, today),
        eq(surgeries.isArchived, false)
      ))
      .limit(limit);

    return entries.map(row => row.entry);
  }

  async toggleSurgeonChecklistTemplateDefault(templateId: string, userId: string): Promise<SurgeonChecklistTemplate> {
    const [template] = await db
      .select()
      .from(surgeonChecklistTemplates)
      .where(eq(surgeonChecklistTemplates.id, templateId));

    if (!template) {
      throw new Error("Template not found");
    }

    const newDefaultValue = !template.isDefault;

    // If setting as default, first unset all other defaults for this user
    if (newDefaultValue) {
      await db
        .update(surgeonChecklistTemplates)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(and(
          eq(surgeonChecklistTemplates.ownerUserId, userId),
          eq(surgeonChecklistTemplates.hospitalId, template.hospitalId)
        ));
    }

    const [updated] = await db
      .update(surgeonChecklistTemplates)
      .set({ isDefault: newDefaultValue, updatedAt: new Date() })
      .where(eq(surgeonChecklistTemplates.id, templateId))
      .returning();

    return updated;
  }

  async applyTemplateToFutureSurgeries(templateId: string, hospitalId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get the template with its items
    const template = await this.getSurgeonChecklistTemplate(templateId);
    if (!template || !template.items.length) {
      return 0;
    }

    // Get future surgeries that don't already have entries for this template
    const futureSurgeries = await db
      .select()
      .from(surgeries)
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        gte(surgeries.plannedDate, today),
        isNull(surgeries.deletedAt)
      ));

    let appliedCount = 0;

    for (const surgery of futureSurgeries) {
      // Check if this surgery already has entries for this template
      const existingEntries = await db
        .select()
        .from(surgeryPreOpChecklistEntries)
        .where(and(
          eq(surgeryPreOpChecklistEntries.surgeryId, surgery.id),
          eq(surgeryPreOpChecklistEntries.templateId, templateId)
        ));

      // Only apply if no entries exist for this surgery+template combination
      if (existingEntries.length === 0) {
        // Create empty entries for all template items
        for (const item of template.items) {
          await db.insert(surgeryPreOpChecklistEntries).values({
            surgeryId: surgery.id,
            templateId,
            itemId: item.id,
            checked: false,
            note: null,
          });
        }
        appliedCount++;
      }
    }

    return appliedCount;
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

  async getMentionsForUser(userId: string, hospitalId: string, unreadOnly: boolean = false): Promise<(ChatMention & { message: ChatMessage & { sender?: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null } } })[]> {
    const mentions = await db
      .select()
      .from(chatMentions)
      .innerJoin(chatMessages, eq(chatMentions.messageId, chatMessages.id))
      .innerJoin(chatConversations, eq(chatMessages.conversationId, chatConversations.id))
      .leftJoin(users, eq(chatMessages.senderId, users.id))
      .where(and(
        eq(chatMentions.mentionedUserId, userId),
        eq(chatConversations.hospitalId, hospitalId),
        isNull(chatMessages.deletedAt)
      ))
      .orderBy(desc(chatMentions.createdAt));

    return mentions.map(row => ({
      ...row.chat_mentions,
      message: {
        ...row.chat_messages,
        sender: row.users ? {
          id: row.users.id,
          firstName: row.users.firstName,
          lastName: row.users.lastName,
          email: row.users.email
        } : undefined
      }
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

  async getConversationAttachments(conversationId: string): Promise<ChatAttachment[]> {
    return await db
      .select({
        id: chatAttachments.id,
        messageId: chatAttachments.messageId,
        storageKey: chatAttachments.storageKey,
        filename: chatAttachments.filename,
        mimeType: chatAttachments.mimeType,
        sizeBytes: chatAttachments.sizeBytes,
        thumbnailKey: chatAttachments.thumbnailKey,
        savedToPatientId: chatAttachments.savedToPatientId,
        createdAt: chatAttachments.createdAt,
      })
      .from(chatAttachments)
      .innerJoin(chatMessages, eq(chatAttachments.messageId, chatMessages.id))
      .where(eq(chatMessages.conversationId, conversationId));
  }

  async createNotification(notification: InsertChatNotification): Promise<ChatNotification> {
    const [created] = await db
      .insert(chatNotifications)
      .values(notification)
      .returning();
    return created;
  }

  async getUnreadNotifications(userId: string, hospitalId?: string): Promise<ChatNotification[]> {
    if (hospitalId) {
      return await db
        .select({
          id: chatNotifications.id,
          userId: chatNotifications.userId,
          conversationId: chatNotifications.conversationId,
          messageId: chatNotifications.messageId,
          notificationType: chatNotifications.notificationType,
          emailSent: chatNotifications.emailSent,
          emailSentAt: chatNotifications.emailSentAt,
          read: chatNotifications.read,
          createdAt: chatNotifications.createdAt,
        })
        .from(chatNotifications)
        .innerJoin(chatConversations, eq(chatNotifications.conversationId, chatConversations.id))
        .where(and(
          eq(chatNotifications.userId, userId),
          eq(chatNotifications.read, false),
          eq(chatConversations.hospitalId, hospitalId)
        ))
        .orderBy(desc(chatNotifications.createdAt));
    }
    return await db
      .select()
      .from(chatNotifications)
      .where(and(
        eq(chatNotifications.userId, userId),
        eq(chatNotifications.read, false)
      ))
      .orderBy(desc(chatNotifications.createdAt));
  }

  async getUserNotificationsForConversation(userId: string, conversationId: string, notificationType?: string): Promise<ChatNotification[]> {
    const conditions = [
      eq(chatNotifications.userId, userId),
      eq(chatNotifications.conversationId, conversationId)
    ];
    if (notificationType) {
      conditions.push(eq(chatNotifications.notificationType, notificationType));
    }
    return await db
      .select()
      .from(chatNotifications)
      .where(and(...conditions));
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

  // ========== PATIENT QUESTIONNAIRE OPERATIONS ==========

  async createQuestionnaireLink(link: InsertPatientQuestionnaireLink): Promise<PatientQuestionnaireLink> {
    const [created] = await db
      .insert(patientQuestionnaireLinks)
      .values(link)
      .returning();
    return created;
  }

  async getQuestionnaireLink(id: string): Promise<PatientQuestionnaireLink | undefined> {
    const [link] = await db
      .select()
      .from(patientQuestionnaireLinks)
      .where(eq(patientQuestionnaireLinks.id, id));
    return link;
  }

  async getQuestionnaireLinkByToken(token: string): Promise<PatientQuestionnaireLink | undefined> {
    const [link] = await db
      .select()
      .from(patientQuestionnaireLinks)
      .where(eq(patientQuestionnaireLinks.token, token));
    return link;
  }

  async getQuestionnaireLinksForPatient(patientId: string): Promise<PatientQuestionnaireLink[]> {
    return await db
      .select()
      .from(patientQuestionnaireLinks)
      .where(eq(patientQuestionnaireLinks.patientId, patientId))
      .orderBy(desc(patientQuestionnaireLinks.createdAt));
  }

  async getQuestionnaireLinksForHospital(hospitalId: string): Promise<PatientQuestionnaireLink[]> {
    return await db
      .select()
      .from(patientQuestionnaireLinks)
      .where(eq(patientQuestionnaireLinks.hospitalId, hospitalId))
      .orderBy(desc(patientQuestionnaireLinks.createdAt));
  }

  async updateQuestionnaireLink(id: string, updates: Partial<PatientQuestionnaireLink>): Promise<PatientQuestionnaireLink> {
    const [updated] = await db
      .update(patientQuestionnaireLinks)
      .set(updates)
      .where(eq(patientQuestionnaireLinks.id, id))
      .returning();
    return updated;
  }

  async invalidateQuestionnaireLink(id: string): Promise<void> {
    await db
      .update(patientQuestionnaireLinks)
      .set({ status: 'expired' })
      .where(eq(patientQuestionnaireLinks.id, id));
  }

  async createQuestionnaireResponse(response: InsertPatientQuestionnaireResponse): Promise<PatientQuestionnaireResponse> {
    const [created] = await db
      .insert(patientQuestionnaireResponses)
      .values(response)
      .returning();
    return created;
  }

  async getQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse | undefined> {
    const [response] = await db
      .select()
      .from(patientQuestionnaireResponses)
      .where(eq(patientQuestionnaireResponses.id, id));
    return response;
  }

  async getQuestionnaireResponseByLinkId(linkId: string): Promise<PatientQuestionnaireResponse | undefined> {
    const [response] = await db
      .select()
      .from(patientQuestionnaireResponses)
      .where(eq(patientQuestionnaireResponses.linkId, linkId));
    return response;
  }

  async updateQuestionnaireResponse(id: string, updates: Partial<PatientQuestionnaireResponse>): Promise<PatientQuestionnaireResponse> {
    const [updated] = await db
      .update(patientQuestionnaireResponses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(patientQuestionnaireResponses.id, id))
      .returning();
    return updated;
  }

  async submitQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse> {
    const [submitted] = await db
      .update(patientQuestionnaireResponses)
      .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(patientQuestionnaireResponses.id, id))
      .returning();
    
    // Also update the link status
    const response = await this.getQuestionnaireResponse(id);
    if (response) {
      await db
        .update(patientQuestionnaireLinks)
        .set({ status: 'submitted', submittedAt: new Date() })
        .where(eq(patientQuestionnaireLinks.id, response.linkId));
    }
    
    return submitted;
  }

  async getQuestionnaireResponsesForHospital(hospitalId: string, status?: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]> {
    const conditions = [eq(patientQuestionnaireLinks.hospitalId, hospitalId)];
    if (status) {
      conditions.push(eq(patientQuestionnaireLinks.status, status));
    }
    
    const results = await db
      .select()
      .from(patientQuestionnaireResponses)
      .innerJoin(patientQuestionnaireLinks, eq(patientQuestionnaireResponses.linkId, patientQuestionnaireLinks.id))
      .where(and(...conditions))
      .orderBy(desc(patientQuestionnaireResponses.submittedAt));
    
    return results.map(row => ({
      ...row.patient_questionnaire_responses,
      link: row.patient_questionnaire_links
    }));
  }

  async getUnassociatedQuestionnaireResponsesForHospital(hospitalId: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]> {
    const results = await db
      .select()
      .from(patientQuestionnaireResponses)
      .innerJoin(patientQuestionnaireLinks, eq(patientQuestionnaireResponses.linkId, patientQuestionnaireLinks.id))
      .where(and(
        eq(patientQuestionnaireLinks.hospitalId, hospitalId),
        isNull(patientQuestionnaireLinks.patientId),
        eq(patientQuestionnaireLinks.status, 'submitted')
      ))
      .orderBy(desc(patientQuestionnaireResponses.submittedAt));
    
    return results.map(row => ({
      ...row.patient_questionnaire_responses,
      link: row.patient_questionnaire_links
    }));
  }

  async associateQuestionnaireWithPatient(linkId: string, patientId: string): Promise<PatientQuestionnaireLink> {
    const [updated] = await db
      .update(patientQuestionnaireLinks)
      .set({ patientId })
      .where(eq(patientQuestionnaireLinks.id, linkId))
      .returning();
    return updated;
  }

  async addQuestionnaireUpload(upload: InsertPatientQuestionnaireUpload): Promise<PatientQuestionnaireUpload> {
    const [created] = await db
      .insert(patientQuestionnaireUploads)
      .values(upload)
      .returning();
    return created;
  }

  async getQuestionnaireUploads(responseId: string): Promise<PatientQuestionnaireUpload[]> {
    return await db
      .select()
      .from(patientQuestionnaireUploads)
      .where(eq(patientQuestionnaireUploads.responseId, responseId))
      .orderBy(asc(patientQuestionnaireUploads.createdAt));
  }

  async getQuestionnaireUploadById(id: string): Promise<PatientQuestionnaireUpload | undefined> {
    const [upload] = await db
      .select()
      .from(patientQuestionnaireUploads)
      .where(eq(patientQuestionnaireUploads.id, id));
    return upload;
  }

  async updateQuestionnaireUpload(id: string, updates: Partial<{ description: string; reviewed: boolean }>): Promise<PatientQuestionnaireUpload> {
    const [updated] = await db
      .update(patientQuestionnaireUploads)
      .set(updates)
      .where(eq(patientQuestionnaireUploads.id, id))
      .returning();
    return updated;
  }

  async deleteQuestionnaireUpload(id: string): Promise<void> {
    await db
      .delete(patientQuestionnaireUploads)
      .where(eq(patientQuestionnaireUploads.id, id));
  }

  async createQuestionnaireReview(review: InsertPatientQuestionnaireReview): Promise<PatientQuestionnaireReview> {
    const [created] = await db
      .insert(patientQuestionnaireReviews)
      .values(review)
      .returning();
    
    // Update response status to reviewed
    await db
      .update(patientQuestionnaireResponses)
      .set({ status: 'reviewed', updatedAt: new Date() })
      .where(eq(patientQuestionnaireResponses.id, review.responseId));
    
    // Update link status to reviewed
    const response = await this.getQuestionnaireResponse(review.responseId);
    if (response) {
      await db
        .update(patientQuestionnaireLinks)
        .set({ status: 'reviewed', reviewedAt: new Date() })
        .where(eq(patientQuestionnaireLinks.id, response.linkId));
    }
    
    return created;
  }

  async getQuestionnaireReview(responseId: string): Promise<PatientQuestionnaireReview | undefined> {
    const [review] = await db
      .select()
      .from(patientQuestionnaireReviews)
      .where(eq(patientQuestionnaireReviews.responseId, responseId));
    return review;
  }

  async updateQuestionnaireReview(id: string, updates: Partial<PatientQuestionnaireReview>): Promise<PatientQuestionnaireReview> {
    const [updated] = await db
      .update(patientQuestionnaireReviews)
      .set(updates)
      .where(eq(patientQuestionnaireReviews.id, id))
      .returning();
    return updated;
  }

  // ========== PATIENT DOCUMENT OPERATIONS (Staff uploads) ==========
  
  async getPatientDocuments(patientId: string): Promise<PatientDocument[]> {
    return await db
      .select()
      .from(patientDocuments)
      .where(eq(patientDocuments.patientId, patientId))
      .orderBy(desc(patientDocuments.createdAt));
  }

  async getPatientDocument(id: string): Promise<PatientDocument | undefined> {
    const [doc] = await db
      .select()
      .from(patientDocuments)
      .where(eq(patientDocuments.id, id));
    return doc;
  }

  async createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocument> {
    const [created] = await db
      .insert(patientDocuments)
      .values(doc)
      .returning();
    return created;
  }

  async updatePatientDocument(id: string, updates: Partial<PatientDocument>): Promise<PatientDocument> {
    const [updated] = await db
      .update(patientDocuments)
      .set(updates)
      .where(eq(patientDocuments.id, id))
      .returning();
    return updated;
  }

  async deletePatientDocument(id: string): Promise<void> {
    await db
      .delete(patientDocuments)
      .where(eq(patientDocuments.id, id));
  }

  // ========== PATIENT MESSAGE OPERATIONS ==========
  
  async getPatientMessages(patientId: string, hospitalId: string): Promise<PatientMessage[]> {
    return await db
      .select()
      .from(patientMessages)
      .where(
        and(
          eq(patientMessages.patientId, patientId),
          eq(patientMessages.hospitalId, hospitalId)
        )
      )
      .orderBy(desc(patientMessages.createdAt));
  }

  async createPatientMessage(message: InsertPatientMessage): Promise<PatientMessage> {
    const [created] = await db
      .insert(patientMessages)
      .values(message)
      .returning();
    return created;
  }

  // ========== PERSONAL TODO OPERATIONS ==========
  
  async getPersonalTodos(userId: string, hospitalId: string): Promise<PersonalTodo[]> {
    return await db
      .select()
      .from(personalTodos)
      .where(and(
        eq(personalTodos.userId, userId),
        eq(personalTodos.hospitalId, hospitalId)
      ))
      .orderBy(asc(personalTodos.status), asc(personalTodos.position), desc(personalTodos.createdAt));
  }

  async getPersonalTodo(id: string): Promise<PersonalTodo | undefined> {
    const [todo] = await db
      .select()
      .from(personalTodos)
      .where(eq(personalTodos.id, id));
    return todo;
  }

  async createPersonalTodo(todo: InsertPersonalTodo): Promise<PersonalTodo> {
    // Get the max position for the status to add at the end
    const existingTodos = await db
      .select()
      .from(personalTodos)
      .where(and(
        eq(personalTodos.userId, todo.userId),
        eq(personalTodos.hospitalId, todo.hospitalId),
        eq(personalTodos.status, todo.status || 'todo')
      ));
    
    const maxPosition = existingTodos.reduce((max, t) => Math.max(max, t.position), -1);
    
    const [created] = await db
      .insert(personalTodos)
      .values({ ...todo, position: maxPosition + 1 })
      .returning();
    return created;
  }

  async updatePersonalTodo(id: string, updates: Partial<PersonalTodo>): Promise<PersonalTodo> {
    const [updated] = await db
      .update(personalTodos)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(personalTodos.id, id))
      .returning();
    return updated;
  }

  async deletePersonalTodo(id: string): Promise<void> {
    await db
      .delete(personalTodos)
      .where(eq(personalTodos.id, id));
  }

  async reorderPersonalTodos(todoIds: string[], status: string): Promise<void> {
    // Update position for each todo based on its index in the array
    for (let i = 0; i < todoIds.length; i++) {
      await db
        .update(personalTodos)
        .set({ position: i, status: status as any, updatedAt: new Date() })
        .where(eq(personalTodos.id, todoIds[i]));
    }
  }

  // ========== CLINIC APPOINTMENT SCHEDULING ==========

  // Helper: Map userHospitalRoles to ClinicProvider format for backward compatibility
  private mapRoleToClinicProvider(role: UserHospitalRole): ClinicProvider {
    return {
      id: role.id,
      unitId: role.unitId,
      userId: role.userId,
      isBookable: role.isBookable ?? false,
      availabilityMode: (role.availabilityMode as 'always_available' | 'windows_required') ?? 'always_available',
      createdAt: role.createdAt ?? null,
      updatedAt: null,
    };
  }

  // Clinic Providers (now sourced from user_hospital_roles instead of clinic_providers)
  async getClinicProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]> {
    // Query user_hospital_roles for all providers in this hospital
    const results = await db
      .select({
        role: userHospitalRoles,
        user: users
      })
      .from(userHospitalRoles)
      .innerJoin(users, eq(userHospitalRoles.userId, users.id))
      .where(eq(userHospitalRoles.hospitalId, hospitalId))
      .orderBy(asc(users.lastName), asc(users.firstName));
    
    // Deduplicate by userId with OR aggregation for isBookable
    // User is considered bookable hospital-wide if ANY role is bookable
    const userMap = new Map<string, { role: UserHospitalRole; user: User }>();
    for (const r of results) {
      const existing = userMap.get(r.role.userId);
      if (!existing) {
        userMap.set(r.role.userId, { role: r.role, user: r.user });
      } else if (r.role.isBookable && !existing.role.isBookable) {
        // Found a bookable row - update the aggregated record
        userMap.set(r.role.userId, { 
          role: { ...existing.role, isBookable: true }, 
          user: r.user 
        });
      }
    }
    return Array.from(userMap.values()).map(v => ({ 
      ...this.mapRoleToClinicProvider(v.role), 
      user: v.user 
    }));
  }

  async getBookableProvidersByHospital(hospitalId: string): Promise<(ClinicProvider & { user: User })[]> {
    // Query user_hospital_roles for bookable providers
    const results = await db
      .select({
        role: userHospitalRoles,
        user: users
      })
      .from(userHospitalRoles)
      .innerJoin(users, eq(userHospitalRoles.userId, users.id))
      .where(and(
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.isBookable, true)
      ))
      .orderBy(asc(users.lastName), asc(users.firstName));
    
    // Deduplicate by userId (user may have multiple bookable roles)
    const seen = new Set<string>();
    const unique: (ClinicProvider & { user: User })[] = [];
    for (const r of results) {
      if (!seen.has(r.role.userId)) {
        seen.add(r.role.userId);
        unique.push({ ...this.mapRoleToClinicProvider(r.role), user: r.user });
      }
    }
    return unique;
  }

  async getProviderAvailability(providerId: string, unitId: string | null, hospitalId?: string): Promise<ProviderAvailability[]> {
    // If unitId is null, query hospital-level availability (shared calendar)
    if (unitId === null && hospitalId) {
      return await db
        .select()
        .from(providerAvailability)
        .where(and(
          eq(providerAvailability.providerId, providerId),
          eq(providerAvailability.hospitalId, hospitalId),
          isNull(providerAvailability.unitId)
        ))
        .orderBy(asc(providerAvailability.dayOfWeek));
    }
    
    // Unit-specific availability
    return await db
      .select()
      .from(providerAvailability)
      .where(and(
        eq(providerAvailability.providerId, providerId),
        eq(providerAvailability.unitId, unitId!)
      ))
      .orderBy(asc(providerAvailability.dayOfWeek));
  }

  async setProviderAvailability(providerId: string, unitId: string | null, availability: InsertProviderAvailability[], hospitalId?: string): Promise<ProviderAvailability[]> {
    // Delete existing availability for this provider at appropriate level
    if (unitId === null && hospitalId) {
      // Hospital-level (shared calendar)
      await db
        .delete(providerAvailability)
        .where(and(
          eq(providerAvailability.providerId, providerId),
          eq(providerAvailability.hospitalId, hospitalId),
          isNull(providerAvailability.unitId)
        ));
    } else {
      // Unit-specific
      await db
        .delete(providerAvailability)
        .where(and(
          eq(providerAvailability.providerId, providerId),
          eq(providerAvailability.unitId, unitId!)
        ));
    }
    
    if (availability.length === 0) {
      return [];
    }
    
    // Insert new availability with appropriate scope
    const inserted = await db
      .insert(providerAvailability)
      .values(availability.map(a => ({ 
        ...a, 
        providerId, 
        unitId: unitId ?? undefined,
        hospitalId: unitId === null ? hospitalId : undefined
      })))
      .returning();
    
    return inserted;
  }

  async updateProviderAvailability(id: string, updates: Partial<ProviderAvailability>): Promise<ProviderAvailability> {
    const [updated] = await db
      .update(providerAvailability)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(providerAvailability.id, id))
      .returning();
    return updated;
  }

  async getProviderTimeOff(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderTimeOff[]> {
    let conditions: any[] = [eq(providerTimeOff.providerId, providerId)];
    
    // If unitId is null, query hospital-level time off (shared calendar)
    if (unitId === null && hospitalId) {
      conditions.push(eq(providerTimeOff.hospitalId, hospitalId));
      conditions.push(isNull(providerTimeOff.unitId));
    } else {
      conditions.push(eq(providerTimeOff.unitId, unitId!));
    }
    
    if (startDate) {
      conditions.push(gte(providerTimeOff.endDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerTimeOff.startDate, endDate));
    }
    
    return await db
      .select()
      .from(providerTimeOff)
      .where(and(...conditions))
      .orderBy(asc(providerTimeOff.startDate));
  }

  async createProviderTimeOff(timeOff: InsertProviderTimeOff): Promise<ProviderTimeOff> {
    const [created] = await db
      .insert(providerTimeOff)
      .values(timeOff)
      .returning();
    return created;
  }

  async updateProviderTimeOff(id: string, updates: Partial<ProviderTimeOff>): Promise<ProviderTimeOff> {
    const [updated] = await db
      .update(providerTimeOff)
      .set(updates)
      .where(eq(providerTimeOff.id, id))
      .returning();
    return updated;
  }

  async deleteProviderTimeOff(id: string): Promise<void> {
    await db
      .delete(providerTimeOff)
      .where(eq(providerTimeOff.id, id));
  }

  async getProviderTimeOffsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]> {
    let conditions: any[] = [eq(providerTimeOff.unitId, unitId)];
    
    if (startDate) {
      conditions.push(gte(providerTimeOff.endDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerTimeOff.startDate, endDate));
    }
    
    return await db
      .select()
      .from(providerTimeOff)
      .where(and(...conditions))
      .orderBy(asc(providerTimeOff.startDate));
  }

  async getProviderTimeOffsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderTimeOff[]> {
    let conditions: any[] = [
      eq(providerTimeOff.hospitalId, hospitalId),
      isNull(providerTimeOff.unitId)
    ];
    
    if (startDate) {
      conditions.push(gte(providerTimeOff.endDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerTimeOff.startDate, endDate));
    }
    
    return await db
      .select()
      .from(providerTimeOff)
      .where(and(...conditions))
      .orderBy(asc(providerTimeOff.startDate));
  }

  async updateProviderAvailabilityMode(hospitalId: string, userId: string, mode: 'always_available' | 'windows_required'): Promise<ClinicProvider> {
    // Find any role for this user in this hospital
    const existing = await db
      .select()
      .from(userHospitalRoles)
      .where(
        and(
          eq(userHospitalRoles.hospitalId, hospitalId),
          eq(userHospitalRoles.userId, userId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      throw new Error('Provider not found');
    }
    
    // Update all roles for this user in this hospital with the new availability mode
    await db
      .update(userHospitalRoles)
      .set({ availabilityMode: mode })
      .where(
        and(
          eq(userHospitalRoles.hospitalId, hospitalId),
          eq(userHospitalRoles.userId, userId)
        )
      );
    
    // Return the first updated role mapped to ClinicProvider format
    const [updated] = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.id, existing[0].id));
    
    return this.mapRoleToClinicProvider(updated);
  }

  async getProviderAvailabilityWindows(providerId: string, unitId: string | null, startDate?: string, endDate?: string, hospitalId?: string): Promise<ProviderAvailabilityWindow[]> {
    let conditions: any[] = [eq(providerAvailabilityWindows.providerId, providerId)];
    
    // If unitId is null, query hospital-level windows (shared calendar)
    if (unitId === null && hospitalId) {
      conditions.push(eq(providerAvailabilityWindows.hospitalId, hospitalId));
      conditions.push(isNull(providerAvailabilityWindows.unitId));
    } else {
      conditions.push(eq(providerAvailabilityWindows.unitId, unitId!));
    }
    
    if (startDate) {
      conditions.push(gte(providerAvailabilityWindows.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerAvailabilityWindows.date, endDate));
    }
    
    return await db
      .select()
      .from(providerAvailabilityWindows)
      .where(and(...conditions))
      .orderBy(asc(providerAvailabilityWindows.date));
  }

  async getProviderAvailabilityWindowsForUnit(unitId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]> {
    let conditions: any[] = [eq(providerAvailabilityWindows.unitId, unitId)];
    
    if (startDate) {
      conditions.push(gte(providerAvailabilityWindows.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerAvailabilityWindows.date, endDate));
    }
    
    return await db
      .select()
      .from(providerAvailabilityWindows)
      .where(and(...conditions))
      .orderBy(asc(providerAvailabilityWindows.date));
  }

  async getProviderAvailabilityWindowsForHospital(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAvailabilityWindow[]> {
    let conditions: any[] = [
      eq(providerAvailabilityWindows.hospitalId, hospitalId),
      isNull(providerAvailabilityWindows.unitId)
    ];
    
    if (startDate) {
      conditions.push(gte(providerAvailabilityWindows.date, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerAvailabilityWindows.date, endDate));
    }
    
    return await db
      .select()
      .from(providerAvailabilityWindows)
      .where(and(...conditions))
      .orderBy(asc(providerAvailabilityWindows.date));
  }

  async createProviderAvailabilityWindow(window: InsertProviderAvailabilityWindow): Promise<ProviderAvailabilityWindow> {
    const [created] = await db
      .insert(providerAvailabilityWindows)
      .values(window)
      .returning();
    return created;
  }

  async updateProviderAvailabilityWindow(id: string, updates: Partial<ProviderAvailabilityWindow>): Promise<ProviderAvailabilityWindow> {
    const [updated] = await db
      .update(providerAvailabilityWindows)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(providerAvailabilityWindows.id, id))
      .returning();
    return updated;
  }

  async deleteProviderAvailabilityWindow(id: string): Promise<void> {
    await db
      .delete(providerAvailabilityWindows)
      .where(eq(providerAvailabilityWindows.id, id));
  }

  async getProviderAbsences(hospitalId: string, startDate?: string, endDate?: string): Promise<ProviderAbsence[]> {
    let conditions = [eq(providerAbsences.hospitalId, hospitalId)];
    
    if (startDate) {
      conditions.push(gte(providerAbsences.endDate, startDate));
    }
    if (endDate) {
      conditions.push(lte(providerAbsences.startDate, endDate));
    }
    
    return await db
      .select()
      .from(providerAbsences)
      .where(and(...conditions))
      .orderBy(asc(providerAbsences.startDate));
  }

  async syncProviderAbsences(hospitalId: string, absences: InsertProviderAbsence[]): Promise<void> {
    // Upsert absences based on externalId
    for (const absence of absences) {
      await db
        .insert(providerAbsences)
        .values({ ...absence, hospitalId })
        .onConflictDoUpdate({
          target: [providerAbsences.hospitalId, providerAbsences.externalId],
          set: {
            absenceType: absence.absenceType,
            startDate: absence.startDate,
            endDate: absence.endDate,
            isHalfDayStart: absence.isHalfDayStart,
            isHalfDayEnd: absence.isHalfDayEnd,
            syncedAt: new Date(),
          },
        });
    }
  }

  async syncProviderAbsencesForUser(hospitalId: string, userId: string, absences: InsertProviderAbsence[]): Promise<void> {
    // Delete existing absences for this user from ICS sync (externalId starts with 'ics-')
    await db
      .delete(providerAbsences)
      .where(
        and(
          eq(providerAbsences.hospitalId, hospitalId),
          eq(providerAbsences.providerId, userId),
          sql`${providerAbsences.externalId} LIKE 'ics-%'`
        )
      );
    
    // Insert new absences
    for (const absence of absences) {
      await db
        .insert(providerAbsences)
        .values({ ...absence, hospitalId, syncedAt: new Date() });
    }
  }

  async clearProviderAbsencesForUser(hospitalId: string, userId: string): Promise<void> {
    await db
      .delete(providerAbsences)
      .where(
        and(
          eq(providerAbsences.hospitalId, hospitalId),
          eq(providerAbsences.providerId, userId),
          sql`${providerAbsences.externalId} LIKE 'ics-%'`
        )
      );
  }

  async getTimebutlerConfig(hospitalId: string): Promise<TimebutlerConfig | undefined> {
    const [config] = await db
      .select()
      .from(timebutlerConfig)
      .where(eq(timebutlerConfig.hospitalId, hospitalId));
    return config;
  }

  async upsertTimebutlerConfig(config: InsertTimebutlerConfig): Promise<TimebutlerConfig> {
    const [upserted] = await db
      .insert(timebutlerConfig)
      .values(config)
      .onConflictDoUpdate({
        target: timebutlerConfig.hospitalId,
        set: {
          apiToken: config.apiToken,
          userMapping: config.userMapping,
          isEnabled: config.isEnabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async getCalcomConfig(hospitalId: string): Promise<CalcomConfig | undefined> {
    const [config] = await db
      .select()
      .from(calcomConfig)
      .where(eq(calcomConfig.hospitalId, hospitalId));
    return config;
  }

  async upsertCalcomConfig(config: InsertCalcomConfig): Promise<CalcomConfig> {
    const [upserted] = await db
      .insert(calcomConfig)
      .values(config)
      .onConflictDoUpdate({
        target: calcomConfig.hospitalId,
        set: {
          apiKey: config.apiKey,
          webhookSecret: config.webhookSecret,
          ...(config.feedToken ? { feedToken: config.feedToken } : {}),
          isEnabled: config.isEnabled,
          syncBusyBlocks: config.syncBusyBlocks,
          syncTimebutlerAbsences: config.syncTimebutlerAbsences,
          lastSyncAt: config.lastSyncAt,
          lastSyncError: config.lastSyncError,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async getCalcomProviderMappings(hospitalId: string): Promise<CalcomProviderMapping[]> {
    return db
      .select()
      .from(calcomProviderMappings)
      .where(eq(calcomProviderMappings.hospitalId, hospitalId));
  }

  async getCalcomProviderMapping(hospitalId: string, providerId: string): Promise<CalcomProviderMapping | undefined> {
    const [mapping] = await db
      .select()
      .from(calcomProviderMappings)
      .where(and(
        eq(calcomProviderMappings.hospitalId, hospitalId),
        eq(calcomProviderMappings.providerId, providerId)
      ));
    return mapping;
  }

  async upsertCalcomProviderMapping(mapping: InsertCalcomProviderMapping): Promise<CalcomProviderMapping> {
    const [upserted] = await db
      .insert(calcomProviderMappings)
      .values(mapping)
      .onConflictDoUpdate({
        target: [calcomProviderMappings.hospitalId, calcomProviderMappings.providerId],
        set: {
          calcomEventTypeId: mapping.calcomEventTypeId,
          calcomUserId: mapping.calcomUserId,
          calcomScheduleId: mapping.calcomScheduleId,
          isEnabled: mapping.isEnabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async deleteCalcomProviderMapping(id: string): Promise<void> {
    await db
      .delete(calcomProviderMappings)
      .where(eq(calcomProviderMappings.id, id));
  }

  async updateCalcomProviderMappingBusyBlocks(id: string, busyBlockMapping: Record<string, string>): Promise<CalcomProviderMapping> {
    const [updated] = await db
      .update(calcomProviderMappings)
      .set({ busyBlockMapping, updatedAt: new Date() })
      .where(eq(calcomProviderMappings.id, id))
      .returning();
    return updated;
  }

  async getHospitalVonageConfig(hospitalId: string): Promise<HospitalVonageConfig | undefined> {
    const [config] = await db
      .select()
      .from(hospitalVonageConfigs)
      .where(eq(hospitalVonageConfigs.hospitalId, hospitalId));
    return config;
  }

  async upsertHospitalVonageConfig(config: InsertHospitalVonageConfig): Promise<HospitalVonageConfig> {
    const [upserted] = await db
      .insert(hospitalVonageConfigs)
      .values(config)
      .onConflictDoUpdate({
        target: hospitalVonageConfigs.hospitalId,
        set: {
          encryptedApiKey: config.encryptedApiKey,
          encryptedApiSecret: config.encryptedApiSecret,
          encryptedFromNumber: config.encryptedFromNumber,
          isEnabled: config.isEnabled,
          updatedAt: new Date(),
        },
      })
      .returning();
    return upserted;
  }

  async updateHospitalVonageTestStatus(hospitalId: string, status: 'success' | 'failed', error?: string): Promise<void> {
    await db
      .update(hospitalVonageConfigs)
      .set({
        lastTestedAt: new Date(),
        lastTestStatus: status,
        lastTestError: error || null,
        updatedAt: new Date(),
      })
      .where(eq(hospitalVonageConfigs.hospitalId, hospitalId));
  }

  async getClinicAppointments(unitId: string, filters?: {
    providerId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
  }): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService })[]> {
    let conditions = [eq(clinicAppointments.unitId, unitId)];
    
    if (filters?.providerId) {
      conditions.push(eq(clinicAppointments.providerId, filters.providerId));
    }
    if (filters?.patientId) {
      conditions.push(eq(clinicAppointments.patientId, filters.patientId));
    }
    if (filters?.startDate) {
      conditions.push(gte(clinicAppointments.appointmentDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(clinicAppointments.appointmentDate, filters.endDate));
    }
    if (filters?.status) {
      conditions.push(eq(clinicAppointments.status, filters.status as any));
    }
    
    const results = await db
      .select()
      .from(clinicAppointments)
      .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
      .leftJoin(users, eq(clinicAppointments.providerId, users.id))
      .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
      .where(and(...conditions))
      .orderBy(asc(clinicAppointments.appointmentDate), asc(clinicAppointments.startTime));
    
    return results.map(row => ({
      ...row.clinic_appointments,
      patient: row.patients || undefined,
      provider: row.users || undefined,
      service: row.clinic_services || undefined,
    }));
  }

  async getClinicAppointmentsByHospital(hospitalId: string, filters?: {
    providerId?: string;
    patientId?: string;
    startDate?: string;
    endDate?: string;
    status?: string;
    unitId?: string;
  }): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService })[]> {
    let conditions = [eq(clinicAppointments.hospitalId, hospitalId)];
    
    if (filters?.unitId) {
      conditions.push(eq(clinicAppointments.unitId, filters.unitId));
    }
    if (filters?.providerId) {
      conditions.push(eq(clinicAppointments.providerId, filters.providerId));
    }
    if (filters?.patientId) {
      conditions.push(eq(clinicAppointments.patientId, filters.patientId));
    }
    if (filters?.startDate) {
      conditions.push(gte(clinicAppointments.appointmentDate, filters.startDate));
    }
    if (filters?.endDate) {
      conditions.push(lte(clinicAppointments.appointmentDate, filters.endDate));
    }
    if (filters?.status) {
      conditions.push(eq(clinicAppointments.status, filters.status as any));
    }
    
    const results = await db
      .select()
      .from(clinicAppointments)
      .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
      .leftJoin(users, eq(clinicAppointments.providerId, users.id))
      .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
      .where(and(...conditions))
      .orderBy(asc(clinicAppointments.appointmentDate), asc(clinicAppointments.startTime));
    
    return results.map(row => ({
      ...row.clinic_appointments,
      patient: row.patients || undefined,
      provider: row.users || undefined,
      service: row.clinic_services || undefined,
    }));
  }

  async getClinicAppointment(id: string): Promise<(ClinicAppointment & { patient?: Patient; provider?: User; service?: ClinicService }) | undefined> {
    const [result] = await db
      .select()
      .from(clinicAppointments)
      .leftJoin(patients, eq(clinicAppointments.patientId, patients.id))
      .leftJoin(users, eq(clinicAppointments.providerId, users.id))
      .leftJoin(clinicServices, eq(clinicAppointments.serviceId, clinicServices.id))
      .where(eq(clinicAppointments.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.clinic_appointments,
      patient: result.patients || undefined,
      provider: result.users || undefined,
      service: result.clinic_services || undefined,
    };
  }

  async createClinicAppointment(appointment: InsertClinicAppointment): Promise<ClinicAppointment> {
    const [created] = await db
      .insert(clinicAppointments)
      .values(appointment)
      .returning();
    return created;
  }

  async updateClinicAppointment(id: string, updates: Partial<ClinicAppointment>): Promise<ClinicAppointment> {
    const [updated] = await db
      .update(clinicAppointments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(clinicAppointments.id, id))
      .returning();
    return updated;
  }

  async deleteClinicAppointment(id: string): Promise<void> {
    await db
      .delete(clinicAppointments)
      .where(eq(clinicAppointments.id, id));
  }

  async getAvailableSlots(providerId: string, unitId: string, date: string, durationMinutes: number): Promise<{ startTime: string; endTime: string }[]> {
    const dateObj = new Date(date);
    const dayOfWeek = dateObj.getDay(); // 0-6, Sunday = 0
    
    // 1. Get ALL provider availability entries for this day (supports multiple time slots per day)
    const availabilityList = await db
      .select()
      .from(providerAvailability)
      .where(and(
        eq(providerAvailability.providerId, providerId),
        eq(providerAvailability.unitId, unitId),
        eq(providerAvailability.dayOfWeek, dayOfWeek),
        eq(providerAvailability.isActive, true)
      ))
      .orderBy(providerAvailability.startTime);
    
    if (availabilityList.length === 0) {
      return []; // Provider doesn't work this day
    }
    
    // 2. Check for time off on this date
    const timeOffList = await db
      .select()
      .from(providerTimeOff)
      .where(and(
        eq(providerTimeOff.providerId, providerId),
        eq(providerTimeOff.unitId, unitId),
        lte(providerTimeOff.startDate, date),
        gte(providerTimeOff.endDate, date)
      ));
    
    // 3. Check for Timebutler absences
    const absenceList = await db
      .select()
      .from(providerAbsences)
      .where(and(
        eq(providerAbsences.providerId, providerId),
        lte(providerAbsences.startDate, date),
        gte(providerAbsences.endDate, date)
      ));
    
    // 4. Check for existing surgeries (from OP calendar)
    const surgeryList = await db
      .select()
      .from(surgeries)
      .where(and(
        eq(surgeries.surgeonId, providerId),
        sql`DATE(${surgeries.plannedDate}) = ${date}`
      ));
    
    // 5. Get existing appointments for this day
    const existingAppointments = await db
      .select()
      .from(clinicAppointments)
      .where(and(
        eq(clinicAppointments.providerId, providerId),
        eq(clinicAppointments.appointmentDate, date),
        sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
      ));
    
    // Check if provider has full-day time off
    const hasFullDayOff = timeOffList.some(t => !t.startTime && !t.endTime);
    const hasAbsence = absenceList.length > 0;
    
    if (hasFullDayOff || hasAbsence) {
      return []; // Provider is off this day
    }
    
    // Generate available slots from all availability entries
    const slots: { startTime: string; endTime: string }[] = [];
    
    for (const availability of availabilityList) {
      const startMinutes = this.timeToMinutes(availability.startTime);
      const endMinutes = this.timeToMinutes(availability.endTime);
      const slotDuration = availability.slotDurationMinutes || 30;
      
      // Generate slots based on this availability window
      for (let mins = startMinutes; mins + durationMinutes <= endMinutes; mins += slotDuration) {
        const slotStart = this.minutesToTime(mins);
        const slotEnd = this.minutesToTime(mins + durationMinutes);
        
        // Check if slot conflicts with time off
        const conflictsWithTimeOff = timeOffList.some(t => {
          if (!t.startTime || !t.endTime) return false;
          const offStart = this.timeToMinutes(t.startTime);
          const offEnd = this.timeToMinutes(t.endTime);
          return mins < offEnd && mins + durationMinutes > offStart;
        });
        
        // Check if slot conflicts with existing appointments
        const conflictsWithAppointment = existingAppointments.some(a => {
          const apptStart = this.timeToMinutes(a.startTime);
          const apptEnd = this.timeToMinutes(a.endTime);
          return mins < apptEnd && mins + durationMinutes > apptStart;
        });
        
        // Check if slot conflicts with surgeries (assume surgeries block all day for simplicity)
        const conflictsWithSurgery = surgeryList.length > 0;
        
        if (!conflictsWithTimeOff && !conflictsWithAppointment && !conflictsWithSurgery) {
          slots.push({ startTime: slotStart, endTime: slotEnd });
        }
      }
    }
    
    // Sort slots by start time and remove duplicates (in case of overlapping windows)
    const uniqueSlots = slots
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
      .filter((slot, index, arr) => 
        index === 0 || slot.startTime !== arr[index - 1].startTime
      );
    
    return uniqueSlots;
  }

  private timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }

  async getStaffAvailabilityForDate(
    staffId: string,
    hospitalId: string,
    date: string
  ): Promise<{ busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' }> {
    const WORKDAY_MINUTES = 480; // 8 hours

    // Get clinic appointments for this staff on this date (exclude cancelled/no_show)
    const appointments = await db
      .select({
        durationMinutes: clinicAppointments.durationMinutes,
      })
      .from(clinicAppointments)
      .where(and(
        eq(clinicAppointments.providerId, staffId),
        eq(clinicAppointments.appointmentDate, date),
        sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
      ));

    // Sum up total busy minutes from appointments
    const busyMinutes = appointments.reduce((sum, apt) => sum + (apt.durationMinutes || 0), 0);
    const busyPercentage = Math.min(100, Math.round((busyMinutes / WORKDAY_MINUTES) * 100));

    // Determine status: <80% = available, 80-100% = warning, 100%+ = busy
    let status: 'available' | 'warning' | 'busy' = 'available';
    if (busyPercentage >= 100) {
      status = 'busy';
    } else if (busyPercentage >= 80) {
      status = 'warning';
    }

    return { busyMinutes, busyPercentage, status };
  }

  async getMultipleStaffAvailability(
    staffIds: string[],
    hospitalId: string,
    date: string
  ): Promise<Record<string, { busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' }>> {
    if (staffIds.length === 0) {
      return {};
    }

    const WORKDAY_MINUTES = 480;

    // Get all clinic appointments for these staff on this date in one query
    const appointments = await db
      .select({
        providerId: clinicAppointments.providerId,
        durationMinutes: clinicAppointments.durationMinutes,
      })
      .from(clinicAppointments)
      .where(and(
        sql`${clinicAppointments.providerId} IN ${staffIds}`,
        eq(clinicAppointments.appointmentDate, date),
        sql`${clinicAppointments.status} NOT IN ('cancelled', 'no_show')`
      ));

    // Aggregate by staff
    const result: Record<string, { busyMinutes: number; busyPercentage: number; status: 'available' | 'warning' | 'busy' }> = {};

    // Initialize all staff with 0 minutes
    for (const staffId of staffIds) {
      result[staffId] = { busyMinutes: 0, busyPercentage: 0, status: 'available' };
    }

    // Sum up durations per staff
    for (const apt of appointments) {
      if (apt.providerId && result[apt.providerId]) {
        result[apt.providerId].busyMinutes += apt.durationMinutes || 0;
      }
    }

    // Calculate percentages and status
    for (const staffId of staffIds) {
      const busyMinutes = result[staffId].busyMinutes;
      const busyPercentage = Math.min(100, Math.round((busyMinutes / WORKDAY_MINUTES) * 100));
      let status: 'available' | 'warning' | 'busy' = 'available';
      if (busyPercentage >= 100) {
        status = 'busy';
      } else if (busyPercentage >= 80) {
        status = 'warning';
      }
      result[staffId] = { busyMinutes, busyPercentage, status };
    }

    return result;
  }

  async getClinicServices(unitId: string): Promise<ClinicService[]> {
    return await db
      .select()
      .from(clinicServices)
      .where(eq(clinicServices.unitId, unitId))
      .orderBy(asc(clinicServices.sortOrder), asc(clinicServices.name));
  }

  // ========== SCHEDULED JOBS ==========
  
  async getNextScheduledJob(): Promise<ScheduledJob | undefined> {
    const [job] = await db
      .select()
      .from(scheduledJobs)
      .where(and(
        eq(scheduledJobs.status, 'pending'),
        sql`${scheduledJobs.scheduledFor} <= NOW()`
      ))
      .orderBy(asc(scheduledJobs.scheduledFor))
      .limit(1);
    
    return job;
  }

  async createScheduledJob(job: InsertScheduledJob): Promise<ScheduledJob> {
    const [created] = await db
      .insert(scheduledJobs)
      .values(job)
      .returning();
    return created;
  }

  async updateScheduledJob(id: string, updates: Partial<ScheduledJob>): Promise<ScheduledJob> {
    const [updated] = await db
      .update(scheduledJobs)
      .set(updates)
      .where(eq(scheduledJobs.id, id))
      .returning();
    return updated;
  }

  async getLastScheduledJobForHospital(hospitalId: string, jobType: string): Promise<ScheduledJob | undefined> {
    const [job] = await db
      .select()
      .from(scheduledJobs)
      .where(and(
        eq(scheduledJobs.hospitalId, hospitalId),
        eq(scheduledJobs.jobType, jobType as any)
      ))
      .orderBy(desc(scheduledJobs.scheduledFor))
      .limit(1);
    
    return job;
  }

  async getPendingQuestionnaireJobsCount(hospitalId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(scheduledJobs)
      .where(and(
        eq(scheduledJobs.hospitalId, hospitalId),
        eq(scheduledJobs.jobType, 'auto_questionnaire_dispatch'),
        eq(scheduledJobs.status, 'pending')
      ));
    
    return result?.count || 0;
  }

  async getSurgeriesForAutoQuestionnaire(hospitalId: string, daysAhead: number): Promise<Array<{
    surgeryId: string;
    patientId: string;
    patientFirstName: string;
    patientLastName: string;
    patientEmail: string | null;
    patientPhone: string | null;
    patientBirthday: Date | null;
    plannedDate: Date;
    plannedSurgery: string;
    hasQuestionnaireSent: boolean;
    hasExistingQuestionnaire: boolean;
  }>> {
    // Calculate the date range: surgeries planned for approximately daysAhead days from now
    // We use a 24-hour window: from (daysAhead - 0.5) days to (daysAhead + 0.5) days
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysAhead);
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get surgeries in the date range with patient info and check for existing questionnaire links
    const results = await db
      .select({
        surgeryId: surgeries.id,
        patientId: surgeries.patientId,
        patientFirstName: patients.firstName,
        patientLastName: patients.surname,
        patientEmail: patients.email,
        patientPhone: patients.phone,
        patientBirthday: patients.birthday,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        surgeryRoomId: surgeries.surgeryRoomId,
        // Check if there's any questionnaire link with emailSent=true OR smsSent=true for this surgery OR patient
        hasQuestionnaireSent: sql<boolean>`EXISTS (
          SELECT 1 FROM patient_questionnaire_links pql 
          WHERE (pql.surgery_id = ${surgeries.id} OR pql.patient_id = ${surgeries.patientId})
            AND (pql.email_sent = true OR pql.sms_sent = true)
        )`,
        // Check if there's an existing submitted/reviewed questionnaire for this patient
        // Either: linked directly to the patient, OR filled via tablet with matching name/birthday
        hasExistingQuestionnaire: sql<boolean>`EXISTS (
          SELECT 1 FROM patient_questionnaire_links pql
          LEFT JOIN patient_questionnaire_responses pqr ON pqr.link_id = pql.id
          WHERE pql.hospital_id = ${hospitalId}
            AND pql.status IN ('submitted', 'reviewed')
            AND (
              -- Linked directly to this patient
              pql.patient_id = surgeries.patient_id
              -- OR filled via tablet with matching first name, last name, and birthday
              OR (
                pqr.id IS NOT NULL 
                AND LOWER(pqr.patient_first_name) = LOWER(patients.first_name)
                AND LOWER(pqr.patient_last_name) = LOWER(patients.surname)
                AND pqr.patient_birthday = patients.birthday::date
              )
            )
        )`,
      })
      .from(surgeries)
      .innerJoin(patients, eq(patients.id, surgeries.patientId))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        sql`${surgeries.plannedDate} >= ${startOfDay}`,
        sql`${surgeries.plannedDate} <= ${endOfDay}`,
        sql`${surgeries.status} IN ('planned', 'scheduled', 'confirmed')`,
        isNull(surgeries.archivedAt),
        isNotNull(surgeries.anesthesiaType)
      ));

    return results;
  }

  async getSurgeriesForPreSurgeryReminder(hospitalId: string, hoursAhead: number): Promise<Array<{
    surgeryId: string;
    patientId: string;
    patientFirstName: string;
    patientLastName: string;
    patientEmail: string | null;
    patientPhone: string | null;
    plannedDate: Date;
    admissionTime: Date | null;
    surgeryRoomId: string | null;
    reminderSent: boolean;
  }>> {
    // Calculate the time window: surgeries planned in approximately hoursAhead hours
    // We use a 1-hour window around the target time
    const now = new Date();
    const targetTime = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
    const windowStart = new Date(targetTime.getTime() - 30 * 60 * 1000); // 30 min before
    const windowEnd = new Date(targetTime.getTime() + 30 * 60 * 1000); // 30 min after

    const results = await db
      .select({
        surgeryId: surgeries.id,
        patientId: surgeries.patientId,
        patientFirstName: patients.firstName,
        patientLastName: patients.surname,
        patientEmail: patients.email,
        patientPhone: patients.phone,
        plannedDate: surgeries.plannedDate,
        admissionTime: surgeries.admissionTime,
        surgeryRoomId: surgeries.surgeryRoomId,
        reminderSent: surgeries.reminderSent,
      })
      .from(surgeries)
      .innerJoin(patients, eq(patients.id, surgeries.patientId))
      .where(and(
        eq(surgeries.hospitalId, hospitalId),
        sql`${surgeries.plannedDate} >= ${windowStart}`,
        sql`${surgeries.plannedDate} <= ${windowEnd}`,
        eq(surgeries.reminderSent, false),
        sql`${surgeries.status} IN ('planned', 'scheduled', 'confirmed')`,
        isNull(surgeries.archivedAt),
        isNotNull(surgeries.anesthesiaType)
      ));

    return results.map(r => ({
      ...r,
      reminderSent: r.reminderSent ?? false,
    }));
  }

  async markSurgeryReminderSent(surgeryId: string): Promise<void> {
    await db
      .update(surgeries)
      .set({
        reminderSent: true,
        reminderSentAt: new Date(),
      })
      .where(eq(surgeries.id, surgeryId));
  }

  // ========== EXTERNAL WORKLOG OPERATIONS ==========

  async getExternalWorklogLinkByToken(token: string): Promise<(ExternalWorklogLink & { unit: Unit; hospital: Hospital }) | undefined> {
    const [result] = await db
      .select()
      .from(externalWorklogLinks)
      .innerJoin(units, eq(units.id, externalWorklogLinks.unitId))
      .innerJoin(hospitals, eq(hospitals.id, externalWorklogLinks.hospitalId))
      .where(eq(externalWorklogLinks.token, token));
    
    if (!result) return undefined;
    
    return {
      ...result.external_worklog_links,
      unit: result.units,
      hospital: result.hospitals,
    };
  }

  async getExternalWorklogLinkByEmail(unitId: string, email: string): Promise<ExternalWorklogLink | undefined> {
    const [link] = await db
      .select()
      .from(externalWorklogLinks)
      .where(and(
        eq(externalWorklogLinks.unitId, unitId),
        eq(externalWorklogLinks.email, email.toLowerCase())
      ));
    return link;
  }

  async createExternalWorklogLink(data: InsertExternalWorklogLink): Promise<ExternalWorklogLink> {
    const [link] = await db
      .insert(externalWorklogLinks)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return link;
  }

  async updateExternalWorklogLinkLastAccess(id: string): Promise<void> {
    await db
      .update(externalWorklogLinks)
      .set({ lastAccessedAt: new Date(), updatedAt: new Date() })
      .where(eq(externalWorklogLinks.id, id));
  }

  async getExternalWorklogEntriesByLink(linkId: string): Promise<ExternalWorklogEntry[]> {
    return await db
      .select()
      .from(externalWorklogEntries)
      .where(eq(externalWorklogEntries.linkId, linkId))
      .orderBy(desc(externalWorklogEntries.workDate));
  }

  async getExternalWorklogEntry(id: string): Promise<(ExternalWorklogEntry & { unit: Unit }) | undefined> {
    const [result] = await db
      .select()
      .from(externalWorklogEntries)
      .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
      .where(eq(externalWorklogEntries.id, id));
    
    if (!result) return undefined;
    
    return {
      ...result.external_worklog_entries,
      unit: result.units,
    };
  }

  async createExternalWorklogEntry(data: InsertExternalWorklogEntry): Promise<ExternalWorklogEntry> {
    const [entry] = await db
      .insert(externalWorklogEntries)
      .values({
        ...data,
        email: data.email.toLowerCase(),
      })
      .returning();
    return entry;
  }

  async getPendingWorklogEntries(hospitalId: string, unitId?: string): Promise<(ExternalWorklogEntry & { unit: Unit })[]> {
    const conditions = [
      eq(externalWorklogEntries.hospitalId, hospitalId),
      eq(externalWorklogEntries.status, 'pending')
    ];
    
    if (unitId) {
      conditions.push(eq(externalWorklogEntries.unitId, unitId));
    }
    
    const results = await db
      .select()
      .from(externalWorklogEntries)
      .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
      .where(and(...conditions))
      .orderBy(desc(externalWorklogEntries.workDate));
    
    return results.map(r => ({
      ...r.external_worklog_entries,
      unit: r.units,
    }));
  }

  async getAllWorklogEntries(hospitalId: string, filters?: {
    unitId?: string;
    status?: string;
    email?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<(ExternalWorklogEntry & { unit: Unit; countersigner?: User })[]> {
    const conditions = [eq(externalWorklogEntries.hospitalId, hospitalId)];
    
    if (filters?.unitId) {
      conditions.push(eq(externalWorklogEntries.unitId, filters.unitId));
    }
    if (filters?.status) {
      conditions.push(eq(externalWorklogEntries.status, filters.status as any));
    }
    if (filters?.email) {
      conditions.push(eq(externalWorklogEntries.email, filters.email.toLowerCase()));
    }
    if (filters?.dateFrom) {
      conditions.push(gte(externalWorklogEntries.workDate, filters.dateFrom));
    }
    if (filters?.dateTo) {
      conditions.push(lte(externalWorklogEntries.workDate, filters.dateTo));
    }
    
    const results = await db
      .select()
      .from(externalWorklogEntries)
      .innerJoin(units, eq(units.id, externalWorklogEntries.unitId))
      .leftJoin(users, eq(users.id, externalWorklogEntries.countersignedBy))
      .where(and(...conditions))
      .orderBy(desc(externalWorklogEntries.workDate));
    
    return results.map(r => ({
      ...r.external_worklog_entries,
      unit: r.units,
      countersigner: r.users || undefined,
    }));
  }

  async countersignWorklogEntry(id: string, userId: string, signature: string, signerName: string): Promise<ExternalWorklogEntry> {
    const [updated] = await db
      .update(externalWorklogEntries)
      .set({
        status: 'countersigned',
        countersignature: signature,
        countersignedAt: new Date(),
        countersignedBy: userId,
        countersignerName: signerName,
        updatedAt: new Date(),
      })
      .where(eq(externalWorklogEntries.id, id))
      .returning();
    return updated;
  }

  async rejectWorklogEntry(id: string, userId: string, reason: string, signerName: string): Promise<ExternalWorklogEntry> {
    const [updated] = await db
      .update(externalWorklogEntries)
      .set({
        status: 'rejected',
        countersignedBy: userId,
        countersignerName: signerName,
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(externalWorklogEntries.id, id))
      .returning();
    return updated;
  }

  async getWorklogLinksByUnit(unitId: string): Promise<ExternalWorklogLink[]> {
    return await db
      .select()
      .from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.unitId, unitId))
      .orderBy(desc(externalWorklogLinks.createdAt));
  }

  async getExternalWorklogLink(id: string): Promise<ExternalWorklogLink | undefined> {
    const [link] = await db
      .select()
      .from(externalWorklogLinks)
      .where(eq(externalWorklogLinks.id, id));
    return link;
  }

  async deleteExternalWorklogLink(id: string): Promise<void> {
    await db.delete(externalWorklogLinks).where(eq(externalWorklogLinks.id, id));
  }

  // ========== EXTERNAL SURGERY REQUESTS ==========
  
  async getExternalSurgeryRequests(hospitalId: string, status?: string): Promise<ExternalSurgeryRequest[]> {
    if (status) {
      return await db
        .select()
        .from(externalSurgeryRequests)
        .where(and(
          eq(externalSurgeryRequests.hospitalId, hospitalId),
          eq(externalSurgeryRequests.status, status)
        ))
        .orderBy(desc(externalSurgeryRequests.createdAt));
    }
    return await db
      .select()
      .from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.hospitalId, hospitalId))
      .orderBy(desc(externalSurgeryRequests.createdAt));
  }

  async getExternalSurgeryRequest(id: string): Promise<ExternalSurgeryRequest | undefined> {
    const [request] = await db
      .select()
      .from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.id, id));
    return request;
  }

  async getExternalSurgeryRequestByHospitalToken(token: string): Promise<{ hospital: Hospital } | undefined> {
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.externalSurgeryToken, token));
    if (!hospital) return undefined;
    return { hospital };
  }

  async createExternalSurgeryRequest(request: InsertExternalSurgeryRequest): Promise<ExternalSurgeryRequest> {
    const [created] = await db
      .insert(externalSurgeryRequests)
      .values(request)
      .returning();
    return created;
  }

  async updateExternalSurgeryRequest(id: string, updates: Partial<ExternalSurgeryRequest>): Promise<ExternalSurgeryRequest> {
    const [updated] = await db
      .update(externalSurgeryRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(externalSurgeryRequests.id, id))
      .returning();
    return updated;
  }

  async getExternalSurgeryRequestDocuments(requestId: string): Promise<ExternalSurgeryRequestDocument[]> {
    return await db
      .select()
      .from(externalSurgeryRequestDocuments)
      .where(eq(externalSurgeryRequestDocuments.requestId, requestId))
      .orderBy(asc(externalSurgeryRequestDocuments.createdAt));
  }

  async createExternalSurgeryRequestDocument(doc: InsertExternalSurgeryRequestDocument): Promise<ExternalSurgeryRequestDocument> {
    const [created] = await db
      .insert(externalSurgeryRequestDocuments)
      .values(doc)
      .returning();
    return created;
  }

  async getPendingExternalSurgeryRequestsCount(hospitalId: string): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(externalSurgeryRequests)
      .where(and(
        eq(externalSurgeryRequests.hospitalId, hospitalId),
        eq(externalSurgeryRequests.status, 'pending')
      ));
    return result[0]?.count || 0;
  }

  // ========== ANESTHESIA SETS ==========

  async getAnesthesiaSets(hospitalId: string): Promise<AnesthesiaSet[]> {
    return await db
      .select()
      .from(anesthesiaSets)
      .where(and(
        eq(anesthesiaSets.hospitalId, hospitalId),
        eq(anesthesiaSets.isActive, true)
      ))
      .orderBy(asc(anesthesiaSets.sortOrder), asc(anesthesiaSets.name));
  }

  async getAnesthesiaSet(id: string): Promise<AnesthesiaSet | null> {
    const [set] = await db
      .select()
      .from(anesthesiaSets)
      .where(eq(anesthesiaSets.id, id));
    return set || null;
  }

  async getAnesthesiaSetItems(setId: string): Promise<AnesthesiaSetItem[]> {
    return await db
      .select()
      .from(anesthesiaSetItems)
      .where(eq(anesthesiaSetItems.setId, setId))
      .orderBy(asc(anesthesiaSetItems.sortOrder));
  }

  async createAnesthesiaSet(set: InsertAnesthesiaSet): Promise<AnesthesiaSet> {
    const [created] = await db
      .insert(anesthesiaSets)
      .values(set)
      .returning();
    return created;
  }

  async updateAnesthesiaSet(id: string, updates: Partial<AnesthesiaSet>): Promise<AnesthesiaSet> {
    const [updated] = await db
      .update(anesthesiaSets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(anesthesiaSets.id, id))
      .returning();
    return updated;
  }

  async deleteAnesthesiaSet(id: string): Promise<void> {
    await db.delete(anesthesiaSets).where(eq(anesthesiaSets.id, id));
  }

  async createAnesthesiaSetItem(item: InsertAnesthesiaSetItem): Promise<AnesthesiaSetItem> {
    const [created] = await db
      .insert(anesthesiaSetItems)
      .values(item)
      .returning();
    return created;
  }

  async deleteAnesthesiaSetItems(setId: string): Promise<void> {
    await db.delete(anesthesiaSetItems).where(eq(anesthesiaSetItems.setId, setId));
  }

  // ========== ANESTHESIA SET MEDICATIONS (UNIFIED SETS) ==========

  async getAnesthesiaSetMedications(setId: string): Promise<AnesthesiaSetMedication[]> {
    return await db
      .select()
      .from(anesthesiaSetMedications)
      .where(eq(anesthesiaSetMedications.setId, setId))
      .orderBy(asc(anesthesiaSetMedications.sortOrder));
  }

  async createAnesthesiaSetMedication(item: InsertAnesthesiaSetMedication): Promise<AnesthesiaSetMedication> {
    const [created] = await db
      .insert(anesthesiaSetMedications)
      .values(item)
      .returning();
    return created;
  }

  async deleteAnesthesiaSetMedications(setId: string): Promise<void> {
    await db.delete(anesthesiaSetMedications).where(eq(anesthesiaSetMedications.setId, setId));
  }

  // ========== ANESTHESIA SET INVENTORY (UNIFIED SETS) ==========

  async getAnesthesiaSetInventory(setId: string): Promise<AnesthesiaSetInventoryItem[]> {
    return await db
      .select()
      .from(anesthesiaSetInventory)
      .where(eq(anesthesiaSetInventory.setId, setId))
      .orderBy(asc(anesthesiaSetInventory.sortOrder));
  }

  async createAnesthesiaSetInventoryItem(item: InsertAnesthesiaSetInventoryItem): Promise<AnesthesiaSetInventoryItem> {
    const [created] = await db
      .insert(anesthesiaSetInventory)
      .values(item)
      .returning();
    return created;
  }

  async deleteAnesthesiaSetInventory(setId: string): Promise<void> {
    await db.delete(anesthesiaSetInventory).where(eq(anesthesiaSetInventory.setId, setId));
  }

  // ========== INVENTORY SETS ==========

  async getInventorySets(hospitalId: string, unitId?: string): Promise<InventorySet[]> {
    const conditions = [
      eq(inventorySets.hospitalId, hospitalId),
      eq(inventorySets.isActive, true),
    ];
    
    if (unitId) {
      conditions.push(or(eq(inventorySets.unitId, unitId), isNull(inventorySets.unitId))!);
    }
    
    return await db
      .select()
      .from(inventorySets)
      .where(and(...conditions))
      .orderBy(asc(inventorySets.sortOrder), asc(inventorySets.name));
  }

  async getInventorySet(id: string): Promise<InventorySet | null> {
    const [set] = await db
      .select()
      .from(inventorySets)
      .where(eq(inventorySets.id, id));
    return set || null;
  }

  async getInventorySetItems(setId: string): Promise<InventorySetItem[]> {
    return await db
      .select()
      .from(inventorySetItems)
      .where(eq(inventorySetItems.setId, setId))
      .orderBy(asc(inventorySetItems.sortOrder));
  }

  async createInventorySet(set: InsertInventorySet): Promise<InventorySet> {
    const [created] = await db
      .insert(inventorySets)
      .values(set)
      .returning();
    return created;
  }

  async updateInventorySet(id: string, updates: Partial<InventorySet>): Promise<InventorySet> {
    const [updated] = await db
      .update(inventorySets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(inventorySets.id, id))
      .returning();
    return updated;
  }

  async deleteInventorySet(id: string): Promise<void> {
    await db.delete(inventorySets).where(eq(inventorySets.id, id));
  }

  async createInventorySetItem(item: InsertInventorySetItem): Promise<InventorySetItem> {
    const [created] = await db
      .insert(inventorySetItems)
      .values(item)
      .returning();
    return created;
  }

  async deleteInventorySetItems(setId: string): Promise<void> {
    await db.delete(inventorySetItems).where(eq(inventorySetItems.setId, setId));
  }

  // ========== ADDITIONAL INVENTORY USAGE FOR SETS ==========

  async getInventoryUsageByItem(anesthesiaRecordId: string, itemId: string): Promise<InventoryUsage | null> {
    const [usage] = await db
      .select()
      .from(inventoryUsage)
      .where(and(
        eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId),
        eq(inventoryUsage.itemId, itemId)
      ));
    return usage || null;
  }

  async createInventoryUsage(usage: InsertInventoryUsage): Promise<InventoryUsage> {
    const [created] = await db
      .insert(inventoryUsage)
      .values(usage)
      .returning();
    return created;
  }
}

export const storage = new DatabaseStorage();
export { db };
