import {
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
  type ChecklistTemplateAssignment,
  type InsertChecklistTemplateAssignment,
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
  type PatientMessage,
  type InsertPatientMessage,
  type PersonalTodo,
  type InsertPersonalTodo,
  type ClinicProvider,
  type ProviderAvailability,
  type InsertProviderAvailability,
  type ProviderTimeOff,
  type InsertProviderTimeOff,
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
  type ClinicService,
  type CalcomConfig,
  type InsertCalcomConfig,
  type CalcomProviderMapping,
  type InsertCalcomProviderMapping,
  type HospitalVonageConfig,
  type InsertHospitalVonageConfig,
  type ExternalWorklogLink,
  type InsertExternalWorklogLink,
  type ExternalWorklogEntry,
  type InsertExternalWorklogEntry,
  type ExternalSurgeryRequest,
  type InsertExternalSurgeryRequest,
  type ExternalSurgeryRequestDocument,
  type InsertExternalSurgeryRequestDocument,
  type AnesthesiaSet,
  type InsertAnesthesiaSet,
  type AnesthesiaSetItem,
  type InsertAnesthesiaSetItem,
  type AnesthesiaSetMedication,
  type InsertAnesthesiaSetMedication,
  type AnesthesiaSetInventoryItem,
  type InsertAnesthesiaSetInventoryItem,
  type InventorySet,
  type InsertInventorySet,
  type InventorySetItem,
  type InsertInventorySetItem,
  type SurgerySet,
  type InsertSurgerySet,
  type SurgerySetInventoryItem,
  type InsertSurgerySetInventoryItem,
  type PatientDischargeMedication,
  type InsertPatientDischargeMedication,
  type PatientDischargeMedicationItem,
  type InsertPatientDischargeMedicationItem,
} from "@shared/schema";

export { db } from "./db";

import * as userStorage from "./storage/users";
import * as hospitalStorage from "./storage/hospitals";
import * as inventoryStorage from "./storage/inventory";
import * as orderStorage from "./storage/orders";
import * as activityStorage from "./storage/activities";
import * as checklistStorage from "./storage/checklists";
import * as importJobStorage from "./storage/importJobs";
import * as anesthesiaStorage from "./storage/anesthesia";
import * as chatStorage from "./storage/chat";
import * as questionnaireStorage from "./storage/questionnaires";
import * as clinicStorage from "./storage/clinic";

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
  createChecklistTemplate(template: InsertChecklistTemplate, assignments?: { unitId: string | null; role: string | null }[]): Promise<ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }>;
  getChecklistTemplates(hospitalId: string, unitId?: string, active?: boolean): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] })[]>;
  getChecklistTemplate(id: string): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }) | undefined>;
  updateChecklistTemplate(id: string, updates: Partial<ChecklistTemplate>, assignments?: { unitId: string | null; role: string | null }[]): Promise<ChecklistTemplate & { assignments: ChecklistTemplateAssignment[] }>;
  deleteChecklistTemplate(id: string): Promise<void>;
  getPendingChecklists(hospitalId: string, unitId: string, role?: string): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[]; lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean })[]>;
  getRoomPendingChecklists(hospitalId: string, date?: Date): Promise<(ChecklistTemplate & { assignments: ChecklistTemplateAssignment[]; lastCompletion?: ChecklistCompletion; nextDueDate: Date; isOverdue: boolean; roomId: string; completedToday?: boolean; todayCompletion?: { completedBy: string; completedByName?: string; completedAt: Date | null; comment: string | null; signature: string } })[]>;
  completeChecklist(completion: InsertChecklistCompletion): Promise<ChecklistCompletion>;
  dismissChecklist(dismissal: InsertChecklistDismissal): Promise<ChecklistDismissal>;
  getChecklistCompletions(hospitalId: string, unitId?: string, templateId?: string, limit?: number): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User })[]>;
  getChecklistCompletion(id: string): Promise<(ChecklistCompletion & { template: ChecklistTemplate; completedByUser: User }) | undefined>;
  getPendingChecklistCount(hospitalId: string, unitId: string, role?: string): Promise<{ total: number; overdue: number }>;
  
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
  getSurgeryPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<SurgeryPreOpAssessment[]>;
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
  getAvailableSlots(providerId: string, unitId: string, date: string, durationMinutes: number, hospitalId?: string): Promise<{ startTime: string; endTime: string }[]>;
  
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
  
  // Surgery Sets operations
  getSurgerySets(hospitalId: string): Promise<SurgerySet[]>;
  getSurgerySet(id: string): Promise<SurgerySet | null>;
  createSurgerySet(set: InsertSurgerySet): Promise<SurgerySet>;
  updateSurgerySet(id: string, updates: Partial<SurgerySet>): Promise<SurgerySet>;
  deleteSurgerySet(id: string): Promise<void>;
  getSurgerySetInventory(setId: string): Promise<SurgerySetInventoryItem[]>;
  createSurgerySetInventoryItem(item: InsertSurgerySetInventoryItem): Promise<SurgerySetInventoryItem>;
  deleteSurgerySetInventory(setId: string): Promise<void>;

  // Patient Discharge Medications
  getPatientDischargeMedications(patientId: string, hospitalId: string): Promise<(PatientDischargeMedication & { items: (PatientDischargeMedicationItem & { item: Item })[], doctor: User | null })[]>;
  getPatientDischargeMedication(id: string): Promise<(PatientDischargeMedication & { items: (PatientDischargeMedicationItem & { item: Item })[], doctor: User | null }) | undefined>;
  createPatientDischargeMedication(data: InsertPatientDischargeMedication, items: InsertPatientDischargeMedicationItem[]): Promise<PatientDischargeMedication>;
  updatePatientDischargeMedication(id: string, data: Partial<InsertPatientDischargeMedication>, newItems: InsertPatientDischargeMedicationItem[]): Promise<PatientDischargeMedication>;
  deletePatientDischargeMedication(id: string): Promise<PatientDischargeMedicationItem[]>;

  // Batch query methods
  getItemsByIds(itemIds: string[]): Promise<any[]>;
  getMedicationConfigsByItemIds(itemIds: string[]): Promise<any[]>;
  getAnesthesiaRecordsByIds(recordIds: string[]): Promise<any[]>;
  getAnesthesiaRecordsBySurgeryIds(surgeryIds: string[]): Promise<Map<string, any>>;
}

export class DatabaseStorage implements IStorage {
  // ========== USER OPERATIONS ==========
  getUser = userStorage.getUser;
  upsertUser = userStorage.upsertUser;
  getHospitalUsers = userStorage.getHospitalUsers;
  createUserHospitalRole = userStorage.createUserHospitalRole;
  updateUserHospitalRole = userStorage.updateUserHospitalRole;
  deleteUserHospitalRole = userStorage.deleteUserHospitalRole;
  getUserHospitalRoleById = userStorage.getUserHospitalRoleById;
  searchUserByEmail = userStorage.searchUserByEmail;
  findUserByEmailAndName = userStorage.findUserByEmailAndName;
  createUser = userStorage.createUser;
  createUserWithPassword = userStorage.createUserWithPassword;
  updateUser = userStorage.updateUser;
  updateUserPassword = userStorage.updateUserPassword;
  deleteUser = userStorage.deleteUser;

  // ========== HOSPITAL OPERATIONS ==========
  getHospital = hospitalStorage.getHospital;
  getUserHospitals = hospitalStorage.getUserHospitals;
  createHospital = hospitalStorage.createHospital;
  updateHospital = hospitalStorage.updateHospital;
  getHospitalByQuestionnaireToken = hospitalStorage.getHospitalByQuestionnaireToken;
  setHospitalQuestionnaireToken = hospitalStorage.setHospitalQuestionnaireToken;
  getUnits = hospitalStorage.getUnits;
  getUnit = hospitalStorage.getUnit;
  createUnit = hospitalStorage.createUnit;
  updateUnit = hospitalStorage.updateUnit;
  deleteUnit = hospitalStorage.deleteUnit;

  // ========== INVENTORY OPERATIONS ==========
  getFolders = inventoryStorage.getFolders;
  getFolder = inventoryStorage.getFolder;
  createFolder = inventoryStorage.createFolder;
  updateFolder = inventoryStorage.updateFolder;
  deleteFolder = inventoryStorage.deleteFolder;
  getItems = inventoryStorage.getItems;
  getItem = inventoryStorage.getItem;
  createItem = inventoryStorage.createItem;
  updateItem = inventoryStorage.updateItem;
  deleteItem = inventoryStorage.deleteItem;
  getStockLevel = inventoryStorage.getStockLevel;
  updateStockLevel = inventoryStorage.updateStockLevel;
  getLots = inventoryStorage.getLots;
  getLotById = inventoryStorage.getLotById;
  createLot = inventoryStorage.createLot;
  updateLot = inventoryStorage.updateLot;
  deleteLot = inventoryStorage.deleteLot;
  getItemCode = inventoryStorage.getItemCode;
  createItemCode = inventoryStorage.createItemCode;
  updateItemCode = inventoryStorage.updateItemCode;
  deleteItemCode = inventoryStorage.deleteItemCode;
  getSupplierCodes = inventoryStorage.getSupplierCodes;
  getSupplierCode = inventoryStorage.getSupplierCode;
  createSupplierCode = inventoryStorage.createSupplierCode;
  updateSupplierCode = inventoryStorage.updateSupplierCode;
  deleteSupplierCode = inventoryStorage.deleteSupplierCode;
  setPreferredSupplier = inventoryStorage.setPreferredSupplier;
  getPendingSupplierMatches = inventoryStorage.getPendingSupplierMatches;
  getConfirmedSupplierMatches = inventoryStorage.getConfirmedSupplierMatches;
  getSupplierMatchesByJobId = inventoryStorage.getSupplierMatchesByJobId;
  getDashboardKPIs = inventoryStorage.getDashboardKPIs;
  findItemByBarcode = inventoryStorage.findItemByBarcode;
  getMedicationConfig = inventoryStorage.getMedicationConfig;
  getMedicationConfigById = inventoryStorage.getMedicationConfigById;
  upsertMedicationConfig = inventoryStorage.upsertMedicationConfig;
  deleteMedicationConfig = inventoryStorage.deleteMedicationConfig;
  getMedicationGroups = inventoryStorage.getMedicationGroups;
  getMedicationGroupById = inventoryStorage.getMedicationGroupById;
  createMedicationGroup = inventoryStorage.createMedicationGroup;
  deleteMedicationGroup = inventoryStorage.deleteMedicationGroup;
  getAdministrationGroups = inventoryStorage.getAdministrationGroups;
  getAdministrationGroupById = inventoryStorage.getAdministrationGroupById;
  createAdministrationGroup = inventoryStorage.createAdministrationGroup;
  updateAdministrationGroup = inventoryStorage.updateAdministrationGroup;
  deleteAdministrationGroup = inventoryStorage.deleteAdministrationGroup;
  reorderAdministrationGroups = inventoryStorage.reorderAdministrationGroups;
  getSurgeryRooms = inventoryStorage.getSurgeryRooms;
  getSurgeryRoomById = inventoryStorage.getSurgeryRoomById;
  createSurgeryRoom = inventoryStorage.createSurgeryRoom;
  updateSurgeryRoom = inventoryStorage.updateSurgeryRoom;
  deleteSurgeryRoom = inventoryStorage.deleteSurgeryRoom;
  reorderSurgeryRooms = inventoryStorage.reorderSurgeryRooms;

  // ========== ORDER OPERATIONS ==========
  getOrders = orderStorage.getOrders;
  createOrder = orderStorage.createOrder;
  getOrderById = orderStorage.getOrderById;
  getOrderLineById = orderStorage.getOrderLineById;
  updateOrderStatus = orderStorage.updateOrderStatus;
  findOrCreateDraftOrder = orderStorage.findOrCreateDraftOrder;
  addItemToOrder = orderStorage.addItemToOrder;
  updateOrderLine = orderStorage.updateOrderLine;
  removeOrderLine = orderStorage.removeOrderLine;
  deleteOrder = orderStorage.deleteOrder;
  getVendors = orderStorage.getVendors;

  // ========== ACTIVITY OPERATIONS ==========
  createActivity = activityStorage.createActivity;
  getActivityById = activityStorage.getActivityById;
  verifyControlledActivity = activityStorage.verifyControlledActivity;
  getActivities = activityStorage.getActivities;
  getAlerts = activityStorage.getAlerts;
  getAlertById = activityStorage.getAlertById;
  acknowledgeAlert = activityStorage.acknowledgeAlert;
  snoozeAlert = activityStorage.snoozeAlert;
  createControlledCheck = activityStorage.createControlledCheck;
  getControlledChecks = activityStorage.getControlledChecks;
  getControlledCheck = activityStorage.getControlledCheck;
  deleteControlledCheck = activityStorage.deleteControlledCheck;

  // ========== CHECKLIST OPERATIONS ==========
  createChecklistTemplate = checklistStorage.createChecklistTemplate;
  getChecklistTemplates = checklistStorage.getChecklistTemplates;
  getChecklistTemplate = checklistStorage.getChecklistTemplate;
  updateChecklistTemplate = checklistStorage.updateChecklistTemplate;
  deleteChecklistTemplate = checklistStorage.deleteChecklistTemplate;
  getPendingChecklists = checklistStorage.getPendingChecklists;
  getRoomPendingChecklists = checklistStorage.getRoomPendingChecklists;
  completeChecklist = checklistStorage.completeChecklist;
  dismissChecklist = checklistStorage.dismissChecklist;
  getChecklistCompletions = checklistStorage.getChecklistCompletions;
  getChecklistCompletion = checklistStorage.getChecklistCompletion;
  getPendingChecklistCount = checklistStorage.getPendingChecklistCount;

  // ========== IMPORT JOB OPERATIONS ==========
  createImportJob = importJobStorage.createImportJob;
  getImportJob = importJobStorage.getImportJob;
  getImportJobs = importJobStorage.getImportJobs;
  getNextQueuedJob = importJobStorage.getNextQueuedJob;
  getStuckJobs = importJobStorage.getStuckJobs;
  updateImportJob = importJobStorage.updateImportJob;
  createSupplierCatalog = importJobStorage.createSupplierCatalog;
  getSupplierCatalogs = importJobStorage.getSupplierCatalogs;
  getSupplierCatalog = importJobStorage.getSupplierCatalog;
  getSupplierCatalogWithCredentials = importJobStorage.getSupplierCatalogWithCredentials;
  getSupplierCatalogByName = importJobStorage.getSupplierCatalogByName;
  getGalexisCatalogWithCredentials = importJobStorage.getGalexisCatalogWithCredentials;
  updateSupplierCatalog = importJobStorage.updateSupplierCatalog;
  deleteSupplierCatalog = importJobStorage.deleteSupplierCatalog;
  createPriceSyncJob = importJobStorage.createPriceSyncJob;
  getPriceSyncJob = importJobStorage.getPriceSyncJob;
  getPriceSyncJobs = importJobStorage.getPriceSyncJobs;
  getNextQueuedPriceSyncJob = importJobStorage.getNextQueuedPriceSyncJob;
  updatePriceSyncJob = importJobStorage.updatePriceSyncJob;
  getLatestPriceSyncJob = importJobStorage.getLatestPriceSyncJob;

  // ========== ANESTHESIA MODULE OPERATIONS ==========
  getHospitalAnesthesiaSettings = anesthesiaStorage.getHospitalAnesthesiaSettings;
  upsertHospitalAnesthesiaSettings = anesthesiaStorage.upsertHospitalAnesthesiaSettings;
  getPatients = anesthesiaStorage.getPatients;
  getPatient = anesthesiaStorage.getPatient;
  createPatient = anesthesiaStorage.createPatient;
  updatePatient = anesthesiaStorage.updatePatient;
  archivePatient = anesthesiaStorage.archivePatient;
  unarchivePatient = anesthesiaStorage.unarchivePatient;
  generatePatientNumber = anesthesiaStorage.generatePatientNumber;
  getCases = anesthesiaStorage.getCases;
  getCase = anesthesiaStorage.getCase;
  createCase = anesthesiaStorage.createCase;
  updateCase = anesthesiaStorage.updateCase;
  getSurgeries = anesthesiaStorage.getSurgeries;
  getSurgery = anesthesiaStorage.getSurgery;
  createSurgery = anesthesiaStorage.createSurgery;
  updateSurgery = anesthesiaStorage.updateSurgery;
  archiveSurgery = anesthesiaStorage.archiveSurgery;
  unarchiveSurgery = anesthesiaStorage.unarchiveSurgery;
  getSurgeryNotes = anesthesiaStorage.getSurgeryNotes;
  getSurgeryNoteById = anesthesiaStorage.getSurgeryNoteById;
  createSurgeryNote = anesthesiaStorage.createSurgeryNote;
  updateSurgeryNote = anesthesiaStorage.updateSurgeryNote;
  deleteSurgeryNote = anesthesiaStorage.deleteSurgeryNote;
  getPatientNotes = anesthesiaStorage.getPatientNotes;
  createPatientNote = anesthesiaStorage.createPatientNote;
  updatePatientNote = anesthesiaStorage.updatePatientNote;
  deletePatientNote = anesthesiaStorage.deletePatientNote;
  getNoteAttachments = anesthesiaStorage.getNoteAttachments;
  createNoteAttachment = anesthesiaStorage.createNoteAttachment;
  deleteNoteAttachment = anesthesiaStorage.deleteNoteAttachment;
  getNoteAttachment = anesthesiaStorage.getNoteAttachment;
  getPatientNoteAttachments = anesthesiaStorage.getPatientNoteAttachments;
  getAnesthesiaRecord = anesthesiaStorage.getAnesthesiaRecord;
  getAnesthesiaRecordById = anesthesiaStorage.getAnesthesiaRecordById;
  getAllAnesthesiaRecordsForSurgery = anesthesiaStorage.getAllAnesthesiaRecordsForSurgery;
  getAnesthesiaRecordDataCounts = anesthesiaStorage.getAnesthesiaRecordDataCounts;
  createAnesthesiaRecord = anesthesiaStorage.createAnesthesiaRecord;
  updateAnesthesiaRecord = anesthesiaStorage.updateAnesthesiaRecord;
  deleteAnesthesiaRecord = anesthesiaStorage.deleteAnesthesiaRecord;
  closeAnesthesiaRecord = anesthesiaStorage.closeAnesthesiaRecord;
  amendAnesthesiaRecord = anesthesiaStorage.amendAnesthesiaRecord;
  lockAnesthesiaRecord = anesthesiaStorage.lockAnesthesiaRecord;
  unlockAnesthesiaRecord = anesthesiaStorage.unlockAnesthesiaRecord;
  getPacuPatients = anesthesiaStorage.getPacuPatients;
  getPreOpAssessments = anesthesiaStorage.getPreOpAssessments;
  getPreOpAssessment = anesthesiaStorage.getPreOpAssessment;
  getPreOpAssessmentById = anesthesiaStorage.getPreOpAssessmentById;
  getPreOpAssessmentsBySurgeryIds = anesthesiaStorage.getPreOpAssessmentsBySurgeryIds;
  createPreOpAssessment = anesthesiaStorage.createPreOpAssessment;
  updatePreOpAssessment = anesthesiaStorage.updatePreOpAssessment;
  getSurgeryPreOpAssessments = anesthesiaStorage.getSurgeryPreOpAssessments;
  getSurgeryPreOpAssessmentsBySurgeryIds = anesthesiaStorage.getSurgeryPreOpAssessmentsBySurgeryIds;
  getSurgeryPreOpAssessment = anesthesiaStorage.getSurgeryPreOpAssessment;
  getSurgeryPreOpAssessmentById = anesthesiaStorage.getSurgeryPreOpAssessmentById;
  createSurgeryPreOpAssessment = anesthesiaStorage.createSurgeryPreOpAssessment;
  updateSurgeryPreOpAssessment = anesthesiaStorage.updateSurgeryPreOpAssessment;
  getClinicalSnapshot = anesthesiaStorage.getClinicalSnapshot;
  addVitalPoint = anesthesiaStorage.addVitalPoint;
  addBPPoint = anesthesiaStorage.addBPPoint;
  updateBPPoint = anesthesiaStorage.updateBPPoint;
  updateVitalPoint = anesthesiaStorage.updateVitalPoint;
  deleteVitalPoint = anesthesiaStorage.deleteVitalPoint;
  addRhythmPoint = anesthesiaStorage.addRhythmPoint;
  updateRhythmPoint = anesthesiaStorage.updateRhythmPoint;
  deleteRhythmPoint = anesthesiaStorage.deleteRhythmPoint;
  addTOFPoint = anesthesiaStorage.addTOFPoint;
  updateTOFPoint = anesthesiaStorage.updateTOFPoint;
  deleteTOFPoint = anesthesiaStorage.deleteTOFPoint;
  addVASPoint = anesthesiaStorage.addVASPoint;
  updateVASPoint = anesthesiaStorage.updateVASPoint;
  deleteVASPoint = anesthesiaStorage.deleteVASPoint;
  addAldretePoint = anesthesiaStorage.addAldretePoint;
  updateAldretePoint = anesthesiaStorage.updateAldretePoint;
  deleteAldretePoint = anesthesiaStorage.deleteAldretePoint;
  addScorePoint = anesthesiaStorage.addScorePoint;
  updateScorePoint = anesthesiaStorage.updateScorePoint;
  deleteScorePoint = anesthesiaStorage.deleteScorePoint;
  addVentilationModePoint = anesthesiaStorage.addVentilationModePoint;
  updateVentilationModePoint = anesthesiaStorage.updateVentilationModePoint;
  deleteVentilationModePoint = anesthesiaStorage.deleteVentilationModePoint;
  addBulkVentilationParameters = anesthesiaStorage.addBulkVentilationParameters;
  updateBulkVentilationParameters = anesthesiaStorage.updateBulkVentilationParameters;
  deleteBulkVentilationParameters = anesthesiaStorage.deleteBulkVentilationParameters;
  addOutputPoint = anesthesiaStorage.addOutputPoint;
  updateOutputPoint = anesthesiaStorage.updateOutputPoint;
  deleteOutputPoint = anesthesiaStorage.deleteOutputPoint;
  getVitalsSnapshots = anesthesiaStorage.getVitalsSnapshots;
  createVitalsSnapshot = anesthesiaStorage.createVitalsSnapshot;
  getAnesthesiaMedications = anesthesiaStorage.getAnesthesiaMedications;
  createAnesthesiaMedication = anesthesiaStorage.createAnesthesiaMedication;
  updateAnesthesiaMedication = anesthesiaStorage.updateAnesthesiaMedication;
  deleteAnesthesiaMedication = anesthesiaStorage.deleteAnesthesiaMedication;
  getRunningRateControlledInfusions = anesthesiaStorage.getRunningRateControlledInfusions;
  getAnesthesiaEvents = anesthesiaStorage.getAnesthesiaEvents;
  createAnesthesiaEvent = anesthesiaStorage.createAnesthesiaEvent;
  updateAnesthesiaEvent = anesthesiaStorage.updateAnesthesiaEvent;
  deleteAnesthesiaEvent = anesthesiaStorage.deleteAnesthesiaEvent;
  getAnesthesiaPositions = anesthesiaStorage.getAnesthesiaPositions;
  createAnesthesiaPosition = anesthesiaStorage.createAnesthesiaPosition;
  updateAnesthesiaPosition = anesthesiaStorage.updateAnesthesiaPosition;
  deleteAnesthesiaPosition = anesthesiaStorage.deleteAnesthesiaPosition;
  getSurgeryStaff = anesthesiaStorage.getSurgeryStaff;
  createSurgeryStaff = anesthesiaStorage.createSurgeryStaff;
  updateSurgeryStaff = anesthesiaStorage.updateSurgeryStaff;
  deleteSurgeryStaff = anesthesiaStorage.deleteSurgeryStaff;
  getAnesthesiaInstallations = anesthesiaStorage.getAnesthesiaInstallations;
  createAnesthesiaInstallation = anesthesiaStorage.createAnesthesiaInstallation;
  updateAnesthesiaInstallation = anesthesiaStorage.updateAnesthesiaInstallation;
  deleteAnesthesiaInstallation = anesthesiaStorage.deleteAnesthesiaInstallation;
  getAnesthesiaTechniqueDetails = anesthesiaStorage.getAnesthesiaTechniqueDetails;
  getAnesthesiaTechniqueDetail = anesthesiaStorage.getAnesthesiaTechniqueDetail;
  upsertAnesthesiaTechniqueDetail = anesthesiaStorage.upsertAnesthesiaTechniqueDetail;
  deleteAnesthesiaTechniqueDetail = anesthesiaStorage.deleteAnesthesiaTechniqueDetail;
  getAirwayManagement = anesthesiaStorage.getAirwayManagement;
  upsertAirwayManagement = anesthesiaStorage.upsertAirwayManagement;
  deleteAirwayManagement = anesthesiaStorage.deleteAirwayManagement;
  getDifficultAirwayReport = anesthesiaStorage.getDifficultAirwayReport;
  upsertDifficultAirwayReport = anesthesiaStorage.upsertDifficultAirwayReport;
  deleteDifficultAirwayReport = anesthesiaStorage.deleteDifficultAirwayReport;
  getGeneralTechnique = anesthesiaStorage.getGeneralTechnique;
  upsertGeneralTechnique = anesthesiaStorage.upsertGeneralTechnique;
  deleteGeneralTechnique = anesthesiaStorage.deleteGeneralTechnique;
  getNeuraxialBlocks = anesthesiaStorage.getNeuraxialBlocks;
  createNeuraxialBlock = anesthesiaStorage.createNeuraxialBlock;
  updateNeuraxialBlock = anesthesiaStorage.updateNeuraxialBlock;
  deleteNeuraxialBlock = anesthesiaStorage.deleteNeuraxialBlock;
  getPeripheralBlocks = anesthesiaStorage.getPeripheralBlocks;
  createPeripheralBlock = anesthesiaStorage.createPeripheralBlock;
  updatePeripheralBlock = anesthesiaStorage.updatePeripheralBlock;
  deletePeripheralBlock = anesthesiaStorage.deletePeripheralBlock;
  getInventoryUsage = anesthesiaStorage.getInventoryUsage;
  getInventoryUsageById = anesthesiaStorage.getInventoryUsageById;
  calculateInventoryUsage = anesthesiaStorage.calculateInventoryUsage;
  updateInventoryUsage = anesthesiaStorage.updateInventoryUsage;
  clearInventoryOverride = anesthesiaStorage.clearInventoryOverride;
  createManualInventoryUsage = anesthesiaStorage.createManualInventoryUsage;
  commitInventoryUsage = anesthesiaStorage.commitInventoryUsage;
  getInventoryCommits = anesthesiaStorage.getInventoryCommits;
  getInventoryCommitById = anesthesiaStorage.getInventoryCommitById;
  rollbackInventoryCommit = anesthesiaStorage.rollbackInventoryCommit;
  getAuditTrail = anesthesiaStorage.getAuditTrail;
  createAuditLog = anesthesiaStorage.createAuditLog;
  getSurgeonChecklistTemplates = anesthesiaStorage.getSurgeonChecklistTemplates;
  getSurgeonChecklistTemplate = anesthesiaStorage.getSurgeonChecklistTemplate;
  createSurgeonChecklistTemplate = anesthesiaStorage.createSurgeonChecklistTemplate;
  updateSurgeonChecklistTemplate = anesthesiaStorage.updateSurgeonChecklistTemplate;
  deleteSurgeonChecklistTemplate = anesthesiaStorage.deleteSurgeonChecklistTemplate;
  getSurgeryPreOpChecklist = anesthesiaStorage.getSurgeryPreOpChecklist;
  saveSurgeryPreOpChecklist = anesthesiaStorage.saveSurgeryPreOpChecklist;
  saveSurgeryPreOpChecklistEntry = anesthesiaStorage.saveSurgeryPreOpChecklistEntry;
  getFutureSurgeriesWithPatients = anesthesiaStorage.getFutureSurgeriesWithPatients;
  getPastSurgeriesWithPatients = anesthesiaStorage.getPastSurgeriesWithPatients;
  getChecklistMatrixEntries = anesthesiaStorage.getChecklistMatrixEntries;
  getPastChecklistMatrixEntries = anesthesiaStorage.getPastChecklistMatrixEntries;
  toggleSurgeonChecklistTemplateDefault = anesthesiaStorage.toggleSurgeonChecklistTemplateDefault;
  applyTemplateToFutureSurgeries = anesthesiaStorage.applyTemplateToFutureSurgeries;
  getAnesthesiaSets = anesthesiaStorage.getAnesthesiaSets;
  getAnesthesiaSet = anesthesiaStorage.getAnesthesiaSet;
  getAnesthesiaSetItems = anesthesiaStorage.getAnesthesiaSetItems;
  createAnesthesiaSet = anesthesiaStorage.createAnesthesiaSet;
  updateAnesthesiaSet = anesthesiaStorage.updateAnesthesiaSet;
  deleteAnesthesiaSet = anesthesiaStorage.deleteAnesthesiaSet;
  createAnesthesiaSetItem = anesthesiaStorage.createAnesthesiaSetItem;
  deleteAnesthesiaSetItems = anesthesiaStorage.deleteAnesthesiaSetItems;
  getAnesthesiaSetMedications = anesthesiaStorage.getAnesthesiaSetMedications;
  createAnesthesiaSetMedication = anesthesiaStorage.createAnesthesiaSetMedication;
  deleteAnesthesiaSetMedications = anesthesiaStorage.deleteAnesthesiaSetMedications;
  getAnesthesiaSetInventory = anesthesiaStorage.getAnesthesiaSetInventory;
  createAnesthesiaSetInventoryItem = anesthesiaStorage.createAnesthesiaSetInventoryItem;
  deleteAnesthesiaSetInventory = anesthesiaStorage.deleteAnesthesiaSetInventory;
  getInventorySets = anesthesiaStorage.getInventorySets;
  getInventorySet = anesthesiaStorage.getInventorySet;
  getInventorySetItems = anesthesiaStorage.getInventorySetItems;
  createInventorySet = anesthesiaStorage.createInventorySet;
  updateInventorySet = anesthesiaStorage.updateInventorySet;
  deleteInventorySet = anesthesiaStorage.deleteInventorySet;
  createInventorySetItem = anesthesiaStorage.createInventorySetItem;
  deleteInventorySetItems = anesthesiaStorage.deleteInventorySetItems;
  getInventoryUsageByItem = anesthesiaStorage.getInventoryUsageByItem;
  createInventoryUsage = anesthesiaStorage.createInventoryUsage;
  getSurgerySets = anesthesiaStorage.getSurgerySets;
  getSurgerySet = anesthesiaStorage.getSurgerySet;
  createSurgerySet = anesthesiaStorage.createSurgerySet;
  updateSurgerySet = anesthesiaStorage.updateSurgerySet;
  deleteSurgerySet = anesthesiaStorage.deleteSurgerySet;
  getSurgerySetInventory = anesthesiaStorage.getSurgerySetInventory;
  createSurgerySetInventoryItem = anesthesiaStorage.createSurgerySetInventoryItem;
  deleteSurgerySetInventory = anesthesiaStorage.deleteSurgerySetInventory;
  getPatientDischargeMedications = anesthesiaStorage.getPatientDischargeMedications;
  getPatientDischargeMedication = anesthesiaStorage.getPatientDischargeMedication;
  createPatientDischargeMedication = anesthesiaStorage.createPatientDischargeMedication;
  updatePatientDischargeMedication = anesthesiaStorage.updatePatientDischargeMedication;
  deletePatientDischargeMedication = anesthesiaStorage.deletePatientDischargeMedication;

  // ========== BATCH QUERY OPERATIONS ==========
  getItemsByIds = inventoryStorage.getItemsByIds;
  getMedicationConfigsByItemIds = inventoryStorage.getMedicationConfigsByItemIds;
  getAnesthesiaRecordsByIds = anesthesiaStorage.getAnesthesiaRecordsByIds;
  getAnesthesiaRecordsBySurgeryIds = anesthesiaStorage.getAnesthesiaRecordsBySurgeryIds;

  // ========== CHAT OPERATIONS ==========
  getConversations = chatStorage.getConversations;
  getConversation = chatStorage.getConversation;
  createConversation = chatStorage.createConversation;
  updateConversation = chatStorage.updateConversation;
  deleteConversation = chatStorage.deleteConversation;
  getOrCreateSelfConversation = chatStorage.getOrCreateSelfConversation;
  findDirectConversation = chatStorage.findDirectConversation;
  addParticipant = chatStorage.addParticipant;
  removeParticipant = chatStorage.removeParticipant;
  updateParticipant = chatStorage.updateParticipant;
  markConversationRead = chatStorage.markConversationRead;
  getMessages = chatStorage.getMessages;
  getMessage = chatStorage.getMessage;
  createMessage = chatStorage.createMessage;
  updateMessage = chatStorage.updateMessage;
  deleteMessage = chatStorage.deleteMessage;
  createMention = chatStorage.createMention;
  getMentionsForUser = chatStorage.getMentionsForUser;
  createAttachment = chatStorage.createAttachment;
  updateAttachment = chatStorage.updateAttachment;
  getAttachment = chatStorage.getAttachment;
  getConversationAttachments = chatStorage.getConversationAttachments;
  createNotification = chatStorage.createNotification;
  getUnreadNotifications = chatStorage.getUnreadNotifications;
  getUserNotificationsForConversation = chatStorage.getUserNotificationsForConversation;
  markNotificationRead = chatStorage.markNotificationRead;
  markNotificationEmailSent = chatStorage.markNotificationEmailSent;
  getUnsentEmailNotifications = chatStorage.getUnsentEmailNotifications;

  // ========== QUESTIONNAIRE OPERATIONS ==========
  createQuestionnaireLink = questionnaireStorage.createQuestionnaireLink;
  getQuestionnaireLink = questionnaireStorage.getQuestionnaireLink;
  getQuestionnaireLinkByToken = questionnaireStorage.getQuestionnaireLinkByToken;
  getQuestionnaireLinksForPatient = questionnaireStorage.getQuestionnaireLinksForPatient;
  getQuestionnaireLinksForHospital = questionnaireStorage.getQuestionnaireLinksForHospital;
  updateQuestionnaireLink = questionnaireStorage.updateQuestionnaireLink;
  invalidateQuestionnaireLink = questionnaireStorage.invalidateQuestionnaireLink;
  createQuestionnaireResponse = questionnaireStorage.createQuestionnaireResponse;
  getQuestionnaireResponse = questionnaireStorage.getQuestionnaireResponse;
  getQuestionnaireResponseByLinkId = questionnaireStorage.getQuestionnaireResponseByLinkId;
  updateQuestionnaireResponse = questionnaireStorage.updateQuestionnaireResponse;
  submitQuestionnaireResponse = questionnaireStorage.submitQuestionnaireResponse;
  getQuestionnaireResponsesForHospital = questionnaireStorage.getQuestionnaireResponsesForHospital;
  getUnassociatedQuestionnaireResponsesForHospital = questionnaireStorage.getUnassociatedQuestionnaireResponsesForHospital;
  associateQuestionnaireWithPatient = questionnaireStorage.associateQuestionnaireWithPatient;
  addQuestionnaireUpload = questionnaireStorage.addQuestionnaireUpload;
  getQuestionnaireUploads = questionnaireStorage.getQuestionnaireUploads;
  getQuestionnaireUploadById = questionnaireStorage.getQuestionnaireUploadById;
  updateQuestionnaireUpload = questionnaireStorage.updateQuestionnaireUpload;
  deleteQuestionnaireUpload = questionnaireStorage.deleteQuestionnaireUpload;
  createQuestionnaireReview = questionnaireStorage.createQuestionnaireReview;
  getQuestionnaireReview = questionnaireStorage.getQuestionnaireReview;
  updateQuestionnaireReview = questionnaireStorage.updateQuestionnaireReview;
  getPatientDocuments = questionnaireStorage.getPatientDocuments;
  getPatientDocument = questionnaireStorage.getPatientDocument;
  createPatientDocument = questionnaireStorage.createPatientDocument;
  updatePatientDocument = questionnaireStorage.updatePatientDocument;
  deletePatientDocument = questionnaireStorage.deletePatientDocument;
  getPatientMessages = questionnaireStorage.getPatientMessages;
  createPatientMessage = questionnaireStorage.createPatientMessage;
  getPersonalTodos = questionnaireStorage.getPersonalTodos;
  getPersonalTodo = questionnaireStorage.getPersonalTodo;
  createPersonalTodo = questionnaireStorage.createPersonalTodo;
  updatePersonalTodo = questionnaireStorage.updatePersonalTodo;
  deletePersonalTodo = questionnaireStorage.deletePersonalTodo;
  reorderPersonalTodos = questionnaireStorage.reorderPersonalTodos;

  // ========== CLINIC OPERATIONS ==========
  getClinicProvidersByHospital = clinicStorage.getClinicProvidersByHospital;
  getBookableProvidersByHospital = clinicStorage.getBookableProvidersByHospital;
  getProviderAvailability = clinicStorage.getProviderAvailability;
  setProviderAvailability = clinicStorage.setProviderAvailability;
  updateProviderAvailability = clinicStorage.updateProviderAvailability;
  updateProviderAvailabilityMode = clinicStorage.updateProviderAvailabilityMode;
  getProviderAvailabilityWindows = clinicStorage.getProviderAvailabilityWindows;
  getProviderAvailabilityWindowsForUnit = clinicStorage.getProviderAvailabilityWindowsForUnit;
  getProviderAvailabilityWindowsForHospital = clinicStorage.getProviderAvailabilityWindowsForHospital;
  createProviderAvailabilityWindow = clinicStorage.createProviderAvailabilityWindow;
  updateProviderAvailabilityWindow = clinicStorage.updateProviderAvailabilityWindow;
  deleteProviderAvailabilityWindow = clinicStorage.deleteProviderAvailabilityWindow;
  getProviderTimeOff = clinicStorage.getProviderTimeOff;
  getProviderTimeOffsForUnit = clinicStorage.getProviderTimeOffsForUnit;
  getProviderTimeOffsForHospital = clinicStorage.getProviderTimeOffsForHospital;
  createProviderTimeOff = clinicStorage.createProviderTimeOff;
  updateProviderTimeOff = clinicStorage.updateProviderTimeOff;
  deleteProviderTimeOff = clinicStorage.deleteProviderTimeOff;
  getProviderAbsences = clinicStorage.getProviderAbsences;
  syncProviderAbsences = clinicStorage.syncProviderAbsences;
  syncProviderAbsencesForUser = clinicStorage.syncProviderAbsencesForUser;
  clearProviderAbsencesForUser = clinicStorage.clearProviderAbsencesForUser;
  getTimebutlerConfig = clinicStorage.getTimebutlerConfig;
  upsertTimebutlerConfig = clinicStorage.upsertTimebutlerConfig;
  getCalcomConfig = clinicStorage.getCalcomConfig;
  upsertCalcomConfig = clinicStorage.upsertCalcomConfig;
  getCalcomProviderMappings = clinicStorage.getCalcomProviderMappings;
  getCalcomProviderMapping = clinicStorage.getCalcomProviderMapping;
  upsertCalcomProviderMapping = clinicStorage.upsertCalcomProviderMapping;
  deleteCalcomProviderMapping = clinicStorage.deleteCalcomProviderMapping;
  updateCalcomProviderMappingBusyBlocks = clinicStorage.updateCalcomProviderMappingBusyBlocks;
  getHospitalVonageConfig = clinicStorage.getHospitalVonageConfig;
  upsertHospitalVonageConfig = clinicStorage.upsertHospitalVonageConfig;
  updateHospitalVonageTestStatus = clinicStorage.updateHospitalVonageTestStatus;
  getClinicAppointments = clinicStorage.getClinicAppointments;
  getClinicAppointmentsByHospital = clinicStorage.getClinicAppointmentsByHospital;
  getClinicAppointment = clinicStorage.getClinicAppointment;
  createClinicAppointment = clinicStorage.createClinicAppointment;
  updateClinicAppointment = clinicStorage.updateClinicAppointment;
  deleteClinicAppointment = clinicStorage.deleteClinicAppointment;
  getAvailableSlots = clinicStorage.getAvailableSlots;
  getClinicServices = clinicStorage.getClinicServices;
  getNextScheduledJob = clinicStorage.getNextScheduledJob;
  createScheduledJob = clinicStorage.createScheduledJob;
  updateScheduledJob = clinicStorage.updateScheduledJob;
  getLastScheduledJobForHospital = clinicStorage.getLastScheduledJobForHospital;
  getPendingQuestionnaireJobsCount = clinicStorage.getPendingQuestionnaireJobsCount;
  getSurgeriesForAutoQuestionnaire = clinicStorage.getSurgeriesForAutoQuestionnaire;
  getSurgeriesForPreSurgeryReminder = clinicStorage.getSurgeriesForPreSurgeryReminder;
  markSurgeryReminderSent = clinicStorage.markSurgeryReminderSent;
  getStaffAvailabilityForDate = clinicStorage.getStaffAvailabilityForDate;
  getMultipleStaffAvailability = clinicStorage.getMultipleStaffAvailability;
  getExternalWorklogLink = clinicStorage.getExternalWorklogLink;
  getExternalWorklogLinkByToken = clinicStorage.getExternalWorklogLinkByToken;
  getExternalWorklogLinkByEmail = clinicStorage.getExternalWorklogLinkByEmail;
  createExternalWorklogLink = clinicStorage.createExternalWorklogLink;
  updateExternalWorklogLinkLastAccess = clinicStorage.updateExternalWorklogLinkLastAccess;
  getExternalWorklogEntriesByLink = clinicStorage.getExternalWorklogEntriesByLink;
  getExternalWorklogEntry = clinicStorage.getExternalWorklogEntry;
  createExternalWorklogEntry = clinicStorage.createExternalWorklogEntry;
  getPendingWorklogEntries = clinicStorage.getPendingWorklogEntries;
  getAllWorklogEntries = clinicStorage.getAllWorklogEntries;
  countersignWorklogEntry = clinicStorage.countersignWorklogEntry;
  rejectWorklogEntry = clinicStorage.rejectWorklogEntry;
  getWorklogLinksByUnit = clinicStorage.getWorklogLinksByUnit;
  deleteExternalWorklogLink = clinicStorage.deleteExternalWorklogLink;
  getExternalSurgeryRequests = clinicStorage.getExternalSurgeryRequests;
  getExternalSurgeryRequest = clinicStorage.getExternalSurgeryRequest;
  getExternalSurgeryRequestByHospitalToken = clinicStorage.getExternalSurgeryRequestByHospitalToken;
  createExternalSurgeryRequest = clinicStorage.createExternalSurgeryRequest;
  updateExternalSurgeryRequest = clinicStorage.updateExternalSurgeryRequest;
  getExternalSurgeryRequestDocuments = clinicStorage.getExternalSurgeryRequestDocuments;
  createExternalSurgeryRequestDocument = clinicStorage.createExternalSurgeryRequestDocument;
  getPendingExternalSurgeryRequestsCount = clinicStorage.getPendingExternalSurgeryRequestsCount;
}

export const storage = new DatabaseStorage();
