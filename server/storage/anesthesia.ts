import { db } from "../db";
import {
  eq, and, desc, asc, sql, inArray, lte, gte, lt, or, ilike, isNull, isNotNull,
} from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  calculateInventoryForMedication,
  calculateRateControlledAmpules,
  calculateRateControlledVolume,
  volumeToAmpules,
} from "../services/inventoryCalculations";
import {
  users,
  hospitals,
  items,
  stockLevels,
  activities,
  medicationConfigs,
  surgeryRooms,
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
  patientQuestionnaireLinks,
  anesthesiaSets,
  anesthesiaSetItems,
  anesthesiaSetMedications,
  anesthesiaSetInventory,
  inventorySets,
  inventorySetItems,
  surgerySets,
  surgerySetInventory,
  patientDischargeMedications,
  patientDischargeMedicationItems,
  type User,
  type Hospital,
  type Item,
  type StockLevel,
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
import logger from "../logger";

// ========== HOSPITAL ANESTHESIA SETTINGS ==========

export async function getHospitalAnesthesiaSettings(hospitalId: string): Promise<HospitalAnesthesiaSettings | undefined> {
  const [settings] = await db
    .select()
    .from(hospitalAnesthesiaSettings)
    .where(eq(hospitalAnesthesiaSettings.hospitalId, hospitalId));
  return settings;
}

export async function upsertHospitalAnesthesiaSettings(settings: InsertHospitalAnesthesiaSettings): Promise<HospitalAnesthesiaSettings> {
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

// ========== PATIENT OPERATIONS ==========

export async function getPatients(hospitalId: string, search?: string): Promise<Patient[]> {
  let conditions = [
    eq(patients.hospitalId, hospitalId),
    isNull(patients.deletedAt)
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

export async function getPatient(id: string): Promise<Patient | undefined> {
  const [patient] = await db
    .select()
    .from(patients)
    .where(and(eq(patients.id, id), isNull(patients.deletedAt)));
  return patient;
}

export async function createPatient(patient: InsertPatient & { patientNumber?: string }): Promise<Patient> {
  const [created] = await db.insert(patients).values(patient as any).returning();
  return created;
}

export async function updatePatient(id: string, updates: Partial<Patient>): Promise<Patient> {
  const [updated] = await db
    .update(patients)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(patients.id, id))
    .returning();
  return updated;
}

export async function archivePatient(id: string, userId: string): Promise<Patient> {
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

export async function unarchivePatient(id: string): Promise<Patient> {
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

export async function generatePatientNumber(hospitalId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `P-${year}-`;
  
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

  const lastNumber = latestPatient[0].patientNumber.split('-')[2];
  const nextNumber = (parseInt(lastNumber, 10) + 1).toString().padStart(3, '0');
  return `${prefix}${nextNumber}`;
}

// ========== CASE OPERATIONS ==========

export async function getCases(hospitalId: string, patientId?: string, status?: string): Promise<Case[]> {
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

export async function getCase(id: string): Promise<Case | undefined> {
  const [caseRecord] = await db.select().from(cases).where(eq(cases.id, id));
  return caseRecord;
}

export async function createCase(caseData: InsertCase): Promise<Case> {
  const [created] = await db.insert(cases).values(caseData).returning();
  return created;
}

export async function updateCase(id: string, updates: Partial<Case>): Promise<Case> {
  const [updated] = await db
    .update(cases)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(cases.id, id))
    .returning();
  return updated;
}

// ========== SURGERY OPERATIONS ==========

export async function getSurgeries(hospitalId: string, filters?: {
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

export async function getSurgery(id: string): Promise<Surgery | undefined> {
  const [surgery] = await db.select().from(surgeries).where(eq(surgeries.id, id));
  return surgery;
}

export async function createSurgery(surgery: InsertSurgery): Promise<Surgery> {
  const [created] = await db.insert(surgeries).values(surgery).returning();
  return created;
}

export async function updateSurgery(id: string, updates: Partial<Surgery>): Promise<Surgery> {
  const [updated] = await db
    .update(surgeries)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(surgeries.id, id))
    .returning();
  return updated;
}

export async function archiveSurgery(id: string, userId: string): Promise<Surgery> {
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

export async function unarchiveSurgery(id: string): Promise<Surgery> {
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

// ========== SURGERY NOTES ==========

export async function getSurgeryNotes(surgeryId: string): Promise<(SurgeryNote & { author: User })[]> {
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

export async function getSurgeryNoteById(id: string): Promise<SurgeryNote | undefined> {
  const [note] = await db.select().from(surgeryNotes).where(eq(surgeryNotes.id, id));
  return note;
}

export async function createSurgeryNote(note: InsertSurgeryNote): Promise<SurgeryNote> {
  const [created] = await db
    .insert(surgeryNotes)
    .values(note)
    .returning();
  return created;
}

export async function updateSurgeryNote(id: string, content: string): Promise<SurgeryNote> {
  const [updated] = await db
    .update(surgeryNotes)
    .set({ content, updatedAt: new Date() })
    .where(eq(surgeryNotes.id, id))
    .returning();
  return updated;
}

export async function deleteSurgeryNote(id: string): Promise<void> {
  await db.delete(surgeryNotes).where(eq(surgeryNotes.id, id));
}

// ========== PATIENT NOTES ==========

export async function getPatientNotes(patientId: string): Promise<(PatientNote & { author: User })[]> {
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

export async function createPatientNote(note: InsertPatientNote): Promise<PatientNote> {
  const [created] = await db
    .insert(patientNotes)
    .values(note)
    .returning();
  return created;
}

export async function updatePatientNote(id: string, content: string): Promise<PatientNote> {
  const [updated] = await db
    .update(patientNotes)
    .set({ content, updatedAt: new Date() })
    .where(eq(patientNotes.id, id))
    .returning();
  return updated;
}

export async function deletePatientNote(id: string): Promise<void> {
  await db.delete(patientNotes).where(eq(patientNotes.id, id));
}

// ========== NOTE ATTACHMENTS ==========

export async function getNoteAttachments(noteType: 'patient' | 'surgery', noteId: string): Promise<NoteAttachment[]> {
  return await db
    .select()
    .from(noteAttachments)
    .where(and(
      eq(noteAttachments.noteType, noteType),
      eq(noteAttachments.noteId, noteId)
    ))
    .orderBy(desc(noteAttachments.createdAt));
}

export async function createNoteAttachment(attachment: InsertNoteAttachment): Promise<NoteAttachment> {
  const [created] = await db
    .insert(noteAttachments)
    .values(attachment)
    .returning();
  return created;
}

export async function deleteNoteAttachment(id: string): Promise<void> {
  await db.delete(noteAttachments).where(eq(noteAttachments.id, id));
}

export async function getNoteAttachment(id: string): Promise<NoteAttachment | undefined> {
  const [attachment] = await db
    .select()
    .from(noteAttachments)
    .where(eq(noteAttachments.id, id));
  return attachment;
}

export async function getPatientNoteAttachments(patientId: string): Promise<(NoteAttachment & { noteContent: string | null })[]> {
  const patientNoteAttachmentsResult = await db
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

  const surgeryNoteAttachmentsResult = await db
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

  const allAttachments = [...patientNoteAttachmentsResult, ...surgeryNoteAttachmentsResult];
  allAttachments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  
  return allAttachments;
}

// ========== ANESTHESIA RECORD OPERATIONS ==========

export async function getAnesthesiaRecord(surgeryId: string): Promise<AnesthesiaRecord | undefined> {
  const [record] = await db
    .select()
    .from(anesthesiaRecords)
    .where(eq(anesthesiaRecords.surgeryId, surgeryId));
  return record;
}

export async function getAnesthesiaRecordById(id: string): Promise<AnesthesiaRecord | undefined> {
  const [record] = await db
    .select()
    .from(anesthesiaRecords)
    .where(eq(anesthesiaRecords.id, id));
  return record;
}

export async function getAllAnesthesiaRecordsForSurgery(surgeryId: string): Promise<AnesthesiaRecord[]> {
  const records = await db
    .select()
    .from(anesthesiaRecords)
    .where(eq(anesthesiaRecords.surgeryId, surgeryId))
    .orderBy(anesthesiaRecords.createdAt);
  return records;
}

export async function getAnesthesiaRecordDataCounts(recordId: string): Promise<{ vitals: number; medications: number; events: number }> {
  const [snapshot] = await db
    .select()
    .from(clinicalSnapshots)
    .where(eq(clinicalSnapshots.anesthesiaRecordId, recordId));
  
  let vitalsCount = 0;
  if (snapshot?.data) {
    const data = snapshot.data as Record<string, any>;
    if (data.hr) vitalsCount += Array.isArray(data.hr) ? data.hr.length : 1;
    if (data.bp) vitalsCount += Array.isArray(data.bp) ? data.bp.length : 1;
    if (data.spo2) vitalsCount += Array.isArray(data.spo2) ? data.spo2.length : 1;
    if (data.temp) vitalsCount += Array.isArray(data.temp) ? data.temp.length : 1;
    if (data.etco2) vitalsCount += Array.isArray(data.etco2) ? data.etco2.length : 1;
  }
  
  const medications = await db
    .select({ count: sql<number>`count(*)` })
    .from(anesthesiaMedications)
    .where(eq(anesthesiaMedications.anesthesiaRecordId, recordId));
  
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

export async function createAnesthesiaRecord(record: InsertAnesthesiaRecord): Promise<AnesthesiaRecord> {
  const [created] = await db.insert(anesthesiaRecords).values(record).returning();
  return created;
}

export async function updateAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>): Promise<AnesthesiaRecord> {
  const [updated] = await db
    .update(anesthesiaRecords)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(anesthesiaRecords.id, id))
    .returning();
  return updated;
}

export async function deleteAnesthesiaRecord(id: string): Promise<void> {
  await db.delete(clinicalSnapshots).where(eq(clinicalSnapshots.anesthesiaRecordId, id));
  await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.anesthesiaRecordId, id));
  await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.anesthesiaRecordId, id));
  await db.delete(anesthesiaPositions).where(eq(anesthesiaPositions.anesthesiaRecordId, id));
  await db.delete(surgeryStaffEntries).where(eq(surgeryStaffEntries.anesthesiaRecordId, id));
  await db.delete(anesthesiaRecords).where(eq(anesthesiaRecords.id, id));
}

export async function closeAnesthesiaRecord(id: string, closedBy: string): Promise<AnesthesiaRecord> {
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

export async function amendAnesthesiaRecord(id: string, updates: Partial<AnesthesiaRecord>, reason: string, userId: string): Promise<AnesthesiaRecord> {
  const [currentRecord] = await db
    .select()
    .from(anesthesiaRecords)
    .where(eq(anesthesiaRecords.id, id));

  const [updated] = await db
    .update(anesthesiaRecords)
    .set({
      ...updates,
      caseStatus: 'amended',
      updatedAt: new Date(),
    })
    .where(eq(anesthesiaRecords.id, id))
    .returning();

  await createAuditLog({
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

export async function lockAnesthesiaRecord(id: string, userId: string): Promise<AnesthesiaRecord> {
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

  await createAuditLog({
    recordType: 'anesthesia_record',
    recordId: id,
    action: 'lock',
    userId,
    oldValue: { isLocked: currentRecord?.isLocked },
    newValue: { isLocked: true },
  });

  return updated;
}

export async function unlockAnesthesiaRecord(id: string, userId: string, reason: string): Promise<AnesthesiaRecord> {
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

  await createAuditLog({
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

// ========== PACU PATIENTS ==========

export async function getPacuPatients(hospitalId: string): Promise<Array<{
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

// ========== PRE-OP ASSESSMENTS ==========

export async function getPreOpAssessments(hospitalId: string): Promise<Array<any>> {
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

  const surgeryMap = new Map<string, any>();
  
  for (const row of results) {
    const surgery = row.surgeries;
    const patient = row.patients;
    const questionnaireLink = row.patient_questionnaire_links;
    
    if (!surgeryMap.has(surgery.id)) {
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

      surgeryMap.set(surgery.id, {
        surgery: surgeryWithPatient,
        assessment: row.preop_assessments,
        status: !row.preop_assessments ? 'planned' : row.preop_assessments.status || 'draft',
        questionnaireEmailSent: questionnaireLink?.emailSent || false,
        questionnaireEmailSentAt: questionnaireLink?.emailSentAt || null,
        questionnaireStatus: questionnaireLink?.status || null,
      });
    } else {
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

export async function getPreOpAssessment(surgeryId: string): Promise<PreOpAssessment | undefined> {
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

export async function getPreOpAssessmentById(id: string): Promise<PreOpAssessment | undefined> {
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

export async function getPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<PreOpAssessment[]> {
  if (surgeryIds.length === 0 || authorizedHospitalIds.length === 0) return [];
  
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

export async function createPreOpAssessment(assessment: InsertPreOpAssessment): Promise<PreOpAssessment> {
  const [created] = await db.insert(preOpAssessments).values(assessment).returning();
  return created;
}

export async function updatePreOpAssessment(id: string, updates: Partial<PreOpAssessment>): Promise<PreOpAssessment> {
  const [updated] = await db
    .update(preOpAssessments)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(preOpAssessments.id, id))
    .returning();
  return updated;
}

// ========== SURGERY PRE-OP ASSESSMENTS ==========

export async function getSurgeryPreOpAssessments(hospitalId: string): Promise<Array<any>> {
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

export async function getSurgeryPreOpAssessmentsBySurgeryIds(surgeryIds: string[], authorizedHospitalIds: string[]): Promise<SurgeryPreOpAssessment[]> {
  if (surgeryIds.length === 0 || authorizedHospitalIds.length === 0) return [];
  
  const results = await db
    .select({
      assessment: surgeryPreOpAssessments,
    })
    .from(surgeryPreOpAssessments)
    .innerJoin(surgeries, eq(surgeryPreOpAssessments.surgeryId, surgeries.id))
    .where(
      and(
        inArray(surgeryPreOpAssessments.surgeryId, surgeryIds),
        inArray(surgeries.hospitalId, authorizedHospitalIds),
        eq(surgeries.isArchived, false)
      )
    );
  
  return results.map(r => r.assessment);
}

export async function getSurgeryPreOpAssessment(surgeryId: string): Promise<SurgeryPreOpAssessment | undefined> {
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

export async function getSurgeryPreOpAssessmentById(id: string): Promise<SurgeryPreOpAssessment | undefined> {
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

export async function createSurgeryPreOpAssessment(assessment: InsertSurgeryPreOpAssessment): Promise<SurgeryPreOpAssessment> {
  const [created] = await db.insert(surgeryPreOpAssessments).values(assessment).returning();
  return created;
}

export async function updateSurgeryPreOpAssessment(id: string, updates: Partial<SurgeryPreOpAssessment>): Promise<SurgeryPreOpAssessment> {
  const [updated] = await db
    .update(surgeryPreOpAssessments)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(surgeryPreOpAssessments.id, id))
    .returning();
  return updated;
}

// ========== CLINICAL SNAPSHOTS ==========

export async function getClinicalSnapshot(anesthesiaRecordId: string): Promise<ClinicalSnapshot> {
  const [snapshot] = await db
    .select()
    .from(clinicalSnapshots)
    .where(eq(clinicalSnapshots.anesthesiaRecordId, anesthesiaRecordId));
  
  if (snapshot) {
    return snapshot;
  }
  
  const [created] = await db
    .insert(clinicalSnapshots)
    .values({
      anesthesiaRecordId,
      data: {},
    })
    .returning();
  
  return created;
}

export async function addVitalPoint(
  anesthesiaRecordId: string,
  vitalType: string,
  timestamp: string,
  value: number
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function addBPPoint(
  anesthesiaRecordId: string,
  timestamp: string,
  sys: number,
  dia: number,
  mean?: number
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateBPPoint(
  pointId: string,
  updates: { sys?: number; dia?: number; mean?: number; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
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
  
  return null;
}

export async function updateVitalPoint(
  pointId: string,
  updates: { value?: number; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
  const allSnapshots = await db.select().from(clinicalSnapshots);
  
  for (const snapshot of allSnapshots) {
    const data = snapshot.data as any;
    let found = false;
    let updatedData = { ...data };
    
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
  
  return null;
}

export async function deleteVitalPoint(pointId: string): Promise<ClinicalSnapshot | null> {
  const allSnapshots = await db.select().from(clinicalSnapshots);
  
  for (const snapshot of allSnapshots) {
    const data = snapshot.data as any;
    let found = false;
    let updatedData = { ...data };
    
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
  
  return null;
}

export async function addRhythmPoint(
  anesthesiaRecordId: string,
  timestamp: string,
  value: string
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateRhythmPoint(
  pointId: string,
  updates: { value?: string; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
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
  
  return null;
}

export async function deleteRhythmPoint(pointId: string): Promise<ClinicalSnapshot | null> {
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
  
  return null;
}

export async function addTOFPoint(
  anesthesiaRecordId: string,
  timestamp: string,
  value: string,
  percentage?: number
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateTOFPoint(
  pointId: string,
  updates: { value?: string; percentage?: number; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
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
  
  return null;
}

export async function deleteTOFPoint(pointId: string): Promise<ClinicalSnapshot | null> {
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
  
  return null;
}

export async function addVASPoint(
  anesthesiaRecordId: string,
  timestamp: string,
  value: number
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateVASPoint(
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

export async function deleteVASPoint(pointId: string): Promise<ClinicalSnapshot | null> {
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

export async function addAldretePoint(
  anesthesiaRecordId: string,
  timestamp: string,
  value: number,
  components?: { activity?: number; respiration?: number; circulation?: number; consciousness?: number; oxygenSaturation?: number }
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateAldretePoint(
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

export async function deleteAldretePoint(pointId: string): Promise<ClinicalSnapshot | null> {
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

export async function addScorePoint(
  anesthesiaRecordId: string,
  timestamp: string,
  scoreType: 'aldrete' | 'parsap',
  totalScore: number,
  aldreteScore?: { activity: number; respiration: number; circulation: number; consciousness: number; oxygenSaturation: number },
  parsapScore?: { pulse: number; activity: number; respiration: number; saturations: number; airwayPatency: number; pupil: number }
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateScorePoint(
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

export async function deleteScorePoint(pointId: string): Promise<ClinicalSnapshot | null> {
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

export async function addVentilationModePoint(
  anesthesiaRecordId: string,
  timestamp: string,
  value: string
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateVentilationModePoint(
  anesthesiaRecordId: string,
  pointId: string,
  updates: { value?: string; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  const ventilationModes = data.ventilationModes || [];
  
  const pointIndex = ventilationModes.findIndex((p: any) => p.id === pointId);
  if (pointIndex === -1) {
    return null;
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

export async function deleteVentilationModePoint(anesthesiaRecordId: string, pointId: string): Promise<ClinicalSnapshot | null> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  const ventilationModes = data.ventilationModes || [];
  
  const filteredPoints = ventilationModes.filter((p: any) => p.id !== pointId);
  if (filteredPoints.length >= ventilationModes.length) {
    return null;
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

export async function addBulkVentilationParameters(
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
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  
  const updatedData = { ...data };
  
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

export async function updateBulkVentilationParameters(
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
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  
  const vitalTypes = ['peep', 'fio2', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'etco2', 'pip'];
  
  const updatedData = { ...data };
  
  for (const vitalType of vitalTypes) {
    const currentPoints = data[vitalType] || [];
    
    const originalTs = new Date(originalTimestamp).getTime();
    const filteredPoints = currentPoints.filter((p: any) => {
      const pointTs = new Date(p.timestamp).getTime();
      return Math.abs(pointTs - originalTs) > 1000;
    });
    
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

export async function deleteBulkVentilationParameters(
  anesthesiaRecordId: string,
  timestamp: string
): Promise<ClinicalSnapshot> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  
  const vitalTypes = ['peep', 'fio2', 'tidalVolume', 'respiratoryRate', 'minuteVolume', 'etco2', 'pip'];
  
  const updatedData = { ...data };
  
  const targetTs = new Date(timestamp).getTime();
  
  for (const vitalType of vitalTypes) {
    const currentPoints = data[vitalType] || [];
    
    updatedData[vitalType] = currentPoints.filter((p: any) => {
      const pointTs = new Date(p.timestamp).getTime();
      return Math.abs(pointTs - targetTs) > 1000;
    });
  }
  
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

export async function addOutputPoint(
  anesthesiaRecordId: string,
  paramKey: string,
  timestamp: string,
  value: number
): Promise<ClinicalSnapshot> {
  if (!paramKey) {
    throw new Error('paramKey is required for addOutputPoint');
  }
  
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
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

export async function updateOutputPoint(
  anesthesiaRecordId: string,
  paramKey: string,
  pointId: string,
  updates: { value?: number; timestamp?: string }
): Promise<ClinicalSnapshot | null> {
  if (!paramKey) {
    throw new Error('paramKey is required for updateOutputPoint');
  }
  
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  const points = data[paramKey] || [];
  
  const pointIndex = points.findIndex((p: any) => p.id === pointId);
  if (pointIndex === -1) {
    return null;
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

export async function deleteOutputPoint(
  anesthesiaRecordId: string,
  paramKey: string,
  pointId: string
): Promise<ClinicalSnapshot | null> {
  if (!paramKey) {
    throw new Error('paramKey is required for deleteOutputPoint');
  }
  
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  const data = snapshot.data as any;
  const points = data[paramKey] || [];
  
  const filteredPoints = points.filter((p: any) => p.id !== pointId);
  if (filteredPoints.length >= points.length) {
    return null;
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

export async function getVitalsSnapshots(anesthesiaRecordId: string): Promise<VitalsSnapshot[]> {
  const snapshot = await getClinicalSnapshot(anesthesiaRecordId);
  
  const snapshotData = snapshot.data as any || {};
  const timestampMap = new Map<string, any>();
  
  if (snapshotData.hr && Array.isArray(snapshotData.hr)) {
    snapshotData.hr.forEach((point: any) => {
      const existing = timestampMap.get(point.timestamp) || {};
      timestampMap.set(point.timestamp, { ...existing, hr: point.value });
    });
  }
  
  if (snapshotData.spo2 && Array.isArray(snapshotData.spo2)) {
    snapshotData.spo2.forEach((point: any) => {
      const existing = timestampMap.get(point.timestamp) || {};
      timestampMap.set(point.timestamp, { ...existing, spo2: point.value });
    });
  }
  
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
  
  const snapshots = Array.from(timestampMap.entries()).map(([timestamp, data]) => ({
    id: randomUUID(),
    anesthesiaRecordId,
    timestamp,
    data,
    createdAt: new Date(),
    updatedAt: new Date(),
  }));
  
  snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  
  return snapshots;
}

export async function createVitalsSnapshot(snapshot: InsertVitalsSnapshot): Promise<VitalsSnapshot> {
  return await getClinicalSnapshot(snapshot.anesthesiaRecordId) as any;
}

// ========== ANESTHESIA MEDICATIONS ==========

export async function getAnesthesiaMedications(anesthesiaRecordId: string): Promise<AnesthesiaMedication[]> {
  const medications = await db
    .select()
    .from(anesthesiaMedications)
    .where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(asc(anesthesiaMedications.timestamp));
  return medications;
}

export async function createAnesthesiaMedication(medication: InsertAnesthesiaMedication): Promise<AnesthesiaMedication> {
  const [created] = await db.insert(anesthesiaMedications).values(medication).returning();
  return created;
}

export async function updateAnesthesiaMedication(id: string, updates: Partial<AnesthesiaMedication>): Promise<AnesthesiaMedication> {
  const [updated] = await db
    .update(anesthesiaMedications)
    .set(updates)
    .where(eq(anesthesiaMedications.id, id))
    .returning();
  return updated;
}

export async function deleteAnesthesiaMedication(id: string, userId: string): Promise<void> {
  const [currentMedication] = await db
    .select()
    .from(anesthesiaMedications)
    .where(eq(anesthesiaMedications.id, id));

  await db.delete(anesthesiaMedications).where(eq(anesthesiaMedications.id, id));

  await createAuditLog({
    recordType: 'anesthesia_medication',
    recordId: id,
    action: 'delete',
    userId,
    oldValue: currentMedication,
    newValue: null,
  });
}

export async function getRunningRateControlledInfusions(): Promise<AnesthesiaMedication[]> {
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

// ========== ANESTHESIA EVENTS ==========

export async function getAnesthesiaEvents(anesthesiaRecordId: string): Promise<AnesthesiaEvent[]> {
  const events = await db
    .select()
    .from(anesthesiaEvents)
    .where(eq(anesthesiaEvents.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(asc(anesthesiaEvents.timestamp));
  return events;
}

export async function createAnesthesiaEvent(event: InsertAnesthesiaEvent): Promise<AnesthesiaEvent> {
  const [created] = await db.insert(anesthesiaEvents).values(event).returning();
  return created;
}

export async function updateAnesthesiaEvent(id: string, event: Partial<InsertAnesthesiaEvent>, userId: string): Promise<AnesthesiaEvent> {
  const [currentEvent] = await db
    .select()
    .from(anesthesiaEvents)
    .where(eq(anesthesiaEvents.id, id));

  if (!currentEvent) {
    throw new Error(`Event with id ${id} not found`);
  }

  const [updated] = await db
    .update(anesthesiaEvents)
    .set(event)
    .where(eq(anesthesiaEvents.id, id))
    .returning();

  await createAuditLog({
    recordType: 'anesthesia_event',
    recordId: id,
    action: 'update',
    userId,
    oldValue: currentEvent,
    newValue: updated,
  });

  return updated;
}

export async function deleteAnesthesiaEvent(id: string, userId: string): Promise<void> {
  const [currentEvent] = await db
    .select()
    .from(anesthesiaEvents)
    .where(eq(anesthesiaEvents.id, id));

  if (!currentEvent) {
    throw new Error(`Event with id ${id} not found`);
  }

  await db.delete(anesthesiaEvents).where(eq(anesthesiaEvents.id, id));

  await createAuditLog({
    recordType: 'anesthesia_event',
    recordId: id,
    action: 'delete',
    userId,
    oldValue: currentEvent,
    newValue: null,
  });
}

// ========== ANESTHESIA POSITIONS ==========

export async function getAnesthesiaPositions(anesthesiaRecordId: string): Promise<AnesthesiaPosition[]> {
  const positions = await db
    .select()
    .from(anesthesiaPositions)
    .where(eq(anesthesiaPositions.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(asc(anesthesiaPositions.timestamp));
  return positions;
}

export async function createAnesthesiaPosition(position: InsertAnesthesiaPosition): Promise<AnesthesiaPosition> {
  const [created] = await db.insert(anesthesiaPositions).values(position).returning();
  return created;
}

export async function updateAnesthesiaPosition(id: string, position: Partial<InsertAnesthesiaPosition>, userId: string): Promise<AnesthesiaPosition> {
  const [currentPosition] = await db
    .select()
    .from(anesthesiaPositions)
    .where(eq(anesthesiaPositions.id, id));

  if (!currentPosition) {
    throw new Error(`Position with id ${id} not found`);
  }

  const [updated] = await db
    .update(anesthesiaPositions)
    .set(position)
    .where(eq(anesthesiaPositions.id, id))
    .returning();

  await createAuditLog({
    recordType: 'anesthesia_position',
    recordId: id,
    action: 'update',
    userId,
    oldValue: currentPosition,
    newValue: updated,
  });

  return updated;
}

export async function deleteAnesthesiaPosition(id: string, userId: string): Promise<void> {
  const [currentPosition] = await db
    .select()
    .from(anesthesiaPositions)
    .where(eq(anesthesiaPositions.id, id));

  if (!currentPosition) {
    throw new Error(`Position with id ${id} not found`);
  }

  await db.delete(anesthesiaPositions).where(eq(anesthesiaPositions.id, id));

  await createAuditLog({
    recordType: 'anesthesia_position',
    recordId: id,
    action: 'delete',
    userId,
    oldValue: currentPosition,
    newValue: null,
  });
}

// ========== SURGERY STAFF ==========

export async function getSurgeryStaff(anesthesiaRecordId: string): Promise<SurgeryStaffEntry[]> {
  const staff = await db
    .select()
    .from(surgeryStaffEntries)
    .where(eq(surgeryStaffEntries.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(asc(surgeryStaffEntries.role), asc(surgeryStaffEntries.createdAt));
  return staff;
}

export async function createSurgeryStaff(staff: InsertSurgeryStaffEntry): Promise<SurgeryStaffEntry> {
  const [created] = await db.insert(surgeryStaffEntries).values(staff).returning();
  return created;
}

export async function updateSurgeryStaff(id: string, staff: Partial<InsertSurgeryStaffEntry>, userId: string): Promise<SurgeryStaffEntry> {
  const [currentStaff] = await db
    .select()
    .from(surgeryStaffEntries)
    .where(eq(surgeryStaffEntries.id, id));

  if (!currentStaff) {
    throw new Error(`Staff with id ${id} not found`);
  }

  const [updated] = await db
    .update(surgeryStaffEntries)
    .set(staff)
    .where(eq(surgeryStaffEntries.id, id))
    .returning();

  await createAuditLog({
    recordType: 'surgery_staff',
    recordId: id,
    action: 'update',
    userId,
    oldValue: currentStaff,
    newValue: updated,
  });

  return updated;
}

export async function deleteSurgeryStaff(id: string, userId: string): Promise<void> {
  const [currentStaff] = await db
    .select()
    .from(surgeryStaffEntries)
    .where(eq(surgeryStaffEntries.id, id));

  if (!currentStaff) {
    throw new Error(`Staff with id ${id} not found`);
  }

  await db.delete(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));

  await createAuditLog({
    recordType: 'surgery_staff',
    recordId: id,
    action: 'delete',
    userId,
    oldValue: currentStaff,
    newValue: null,
  });
}

// ========== ANESTHESIA INSTALLATIONS ==========

export async function getAnesthesiaInstallations(anesthesiaRecordId: string): Promise<AnesthesiaInstallation[]> {
  const installations = await db
    .select()
    .from(anesthesiaInstallations)
    .where(eq(anesthesiaInstallations.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(anesthesiaInstallations.createdAt);
  return installations;
}

export async function createAnesthesiaInstallation(installation: InsertAnesthesiaInstallation): Promise<AnesthesiaInstallation> {
  const [created] = await db.insert(anesthesiaInstallations).values(installation).returning();
  return created;
}

export async function updateAnesthesiaInstallation(id: string, updates: Partial<AnesthesiaInstallation>): Promise<AnesthesiaInstallation> {
  const [updated] = await db
    .update(anesthesiaInstallations)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(anesthesiaInstallations.id, id))
    .returning();
  return updated;
}

export async function deleteAnesthesiaInstallation(id: string): Promise<void> {
  await db.delete(anesthesiaInstallations).where(eq(anesthesiaInstallations.id, id));
}

// ========== ANESTHESIA TECHNIQUE DETAILS ==========

export async function getAnesthesiaTechniqueDetails(anesthesiaRecordId: string): Promise<AnesthesiaTechniqueDetail[]> {
  const details = await db
    .select()
    .from(anesthesiaTechniqueDetails)
    .where(eq(anesthesiaTechniqueDetails.anesthesiaRecordId, anesthesiaRecordId));
  return details;
}

export async function getAnesthesiaTechniqueDetail(anesthesiaRecordId: string, technique: string): Promise<AnesthesiaTechniqueDetail | undefined> {
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

export async function upsertAnesthesiaTechniqueDetail(detail: InsertAnesthesiaTechniqueDetail): Promise<AnesthesiaTechniqueDetail> {
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

export async function deleteAnesthesiaTechniqueDetail(id: string): Promise<void> {
  await db.delete(anesthesiaTechniqueDetails).where(eq(anesthesiaTechniqueDetails.id, id));
}

// ========== AIRWAY MANAGEMENT ==========

export async function getAirwayManagement(anesthesiaRecordId: string): Promise<AnesthesiaAirwayManagement | undefined> {
  const [airway] = await db
    .select()
    .from(anesthesiaAirwayManagement)
    .where(eq(anesthesiaAirwayManagement.anesthesiaRecordId, anesthesiaRecordId));
  return airway;
}

export async function upsertAirwayManagement(airway: InsertAnesthesiaAirwayManagement): Promise<AnesthesiaAirwayManagement> {
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

export async function deleteAirwayManagement(anesthesiaRecordId: string): Promise<void> {
  await db.delete(anesthesiaAirwayManagement).where(eq(anesthesiaAirwayManagement.anesthesiaRecordId, anesthesiaRecordId));
}

// ========== DIFFICULT AIRWAY REPORTS ==========

export async function getDifficultAirwayReport(airwayManagementId: string): Promise<DifficultAirwayReport | undefined> {
  const [report] = await db
    .select()
    .from(difficultAirwayReports)
    .where(eq(difficultAirwayReports.airwayManagementId, airwayManagementId));
  return report;
}

export async function upsertDifficultAirwayReport(report: InsertDifficultAirwayReport): Promise<DifficultAirwayReport> {
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

export async function deleteDifficultAirwayReport(airwayManagementId: string): Promise<void> {
  await db.delete(difficultAirwayReports).where(eq(difficultAirwayReports.airwayManagementId, airwayManagementId));
}

// ========== GENERAL TECHNIQUE ==========

export async function getGeneralTechnique(anesthesiaRecordId: string): Promise<AnesthesiaGeneralTechnique | undefined> {
  const [technique] = await db
    .select()
    .from(anesthesiaGeneralTechnique)
    .where(eq(anesthesiaGeneralTechnique.anesthesiaRecordId, anesthesiaRecordId));
  return technique;
}

export async function upsertGeneralTechnique(technique: InsertAnesthesiaGeneralTechnique): Promise<AnesthesiaGeneralTechnique> {
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

export async function deleteGeneralTechnique(anesthesiaRecordId: string): Promise<void> {
  await db.delete(anesthesiaGeneralTechnique).where(eq(anesthesiaGeneralTechnique.anesthesiaRecordId, anesthesiaRecordId));
}

// ========== NEURAXIAL BLOCKS ==========

export async function getNeuraxialBlocks(anesthesiaRecordId: string): Promise<AnesthesiaNeuraxialBlock[]> {
  const blocks = await db
    .select()
    .from(anesthesiaNeuraxialBlocks)
    .where(eq(anesthesiaNeuraxialBlocks.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(anesthesiaNeuraxialBlocks.createdAt);
  return blocks;
}

export async function createNeuraxialBlock(block: InsertAnesthesiaNeuraxialBlock): Promise<AnesthesiaNeuraxialBlock> {
  const [created] = await db.insert(anesthesiaNeuraxialBlocks).values(block).returning();
  return created;
}

export async function updateNeuraxialBlock(id: string, updates: Partial<AnesthesiaNeuraxialBlock>): Promise<AnesthesiaNeuraxialBlock> {
  const [updated] = await db
    .update(anesthesiaNeuraxialBlocks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(anesthesiaNeuraxialBlocks.id, id))
    .returning();
  return updated;
}

export async function deleteNeuraxialBlock(id: string): Promise<void> {
  await db.delete(anesthesiaNeuraxialBlocks).where(eq(anesthesiaNeuraxialBlocks.id, id));
}

// ========== PERIPHERAL BLOCKS ==========

export async function getPeripheralBlocks(anesthesiaRecordId: string): Promise<AnesthesiaPeripheralBlock[]> {
  const blocks = await db
    .select()
    .from(anesthesiaPeripheralBlocks)
    .where(eq(anesthesiaPeripheralBlocks.anesthesiaRecordId, anesthesiaRecordId))
    .orderBy(anesthesiaPeripheralBlocks.createdAt);
  return blocks;
}

export async function createPeripheralBlock(block: InsertAnesthesiaPeripheralBlock): Promise<AnesthesiaPeripheralBlock> {
  const [created] = await db.insert(anesthesiaPeripheralBlocks).values(block).returning();
  return created;
}

export async function updatePeripheralBlock(id: string, updates: Partial<AnesthesiaPeripheralBlock>): Promise<AnesthesiaPeripheralBlock> {
  const [updated] = await db
    .update(anesthesiaPeripheralBlocks)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(anesthesiaPeripheralBlocks.id, id))
    .returning();
  return updated;
}

export async function deletePeripheralBlock(id: string): Promise<void> {
  await db.delete(anesthesiaPeripheralBlocks).where(eq(anesthesiaPeripheralBlocks.id, id));
}

// ========== INVENTORY USAGE ==========

export async function getInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]> {
  const usage = await db
    .select()
    .from(inventoryUsage)
    .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
  return usage;
}

export async function getInventoryUsageById(id: string): Promise<InventoryUsage | null> {
  const [usage] = await db
    .select()
    .from(inventoryUsage)
    .where(eq(inventoryUsage.id, id));
  return usage || null;
}

export async function calculateInventoryUsage(anesthesiaRecordId: string): Promise<InventoryUsage[]> {
  const allMedications = await db
    .select()
    .from(anesthesiaMedications)
    .where(eq(anesthesiaMedications.anesthesiaRecordId, anesthesiaRecordId));

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

  const lastCommitTimeByItem = new Map<string, Date>();
  for (const commit of commits) {
    const commitItems = commit.items as Array<{ itemId: string; quantity: number }>;
    const commitTime = new Date(commit.committedAt);
    
    for (const item of commitItems) {
      const existing = lastCommitTimeByItem.get(item.itemId);
      if (!existing || commitTime > existing) {
        lastCommitTimeByItem.set(item.itemId, commitTime);
      }
    }
  }

  const medications = allMedications.filter(med => {
    const lastCommitTime = lastCommitTimeByItem.get(med.itemId);
    if (!lastCommitTime) {
      return true;
    }
    const medTime = new Date(med.timestamp);
    return medTime > lastCommitTime;
  });

  logger.info('[INVENTORY-CALC] Filtered medications:', {
    totalMedications: allMedications.length,
    filteredMedications: medications.length,
    lastCommitTimes: Array.from(lastCommitTimeByItem.entries()).map(([itemId, time]) => ({
      itemId,
      lastCommitTime: time.toISOString()
    }))
  });

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

  const itemIds = [...new Set(medications.map(m => m.itemId))];
  if (itemIds.length === 0) {
    const existingUsage = await db
      .select()
      .from(inventoryUsage)
      .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
    
    for (const existing of existingUsage) {
      if (existing.overrideQty === null) {
        await db
          .delete(inventoryUsage)
          .where(eq(inventoryUsage.id, existing.id));
      }
    }
    
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

  const medsByItem = new Map<string, any[]>();
  medications.forEach(med => {
    if (!medsByItem.has(med.itemId)) {
      medsByItem.set(med.itemId, []);
    }
    medsByItem.get(med.itemId)!.push(med);
  });

  const usageMap = new Map<string, number>();
  
  for (const [itemId, meds] of medsByItem.entries()) {
    const item = itemsMap.get(itemId);
    if (!item) {
      continue;
    }

    const isBolus = !item.rateUnit || item.rateUnit === null;
    const isFreeFlow = item.rateUnit === 'free';
    const isTci = item.rateUnit === 'TCI';
    const isRateControlled = item.rateUnit && item.rateUnit !== 'free' && item.rateUnit !== 'TCI';

    let totalQty = 0;

    if (isTci) {
      const startMeds = meds.filter(m => m.type === 'infusion_start');
      const stopMeds = meds.filter(m => m.type === 'infusion_stop');
      
      const usedStartIds = new Set<string>();
      let totalDose = 0;
      
      for (const stopMed of stopMeds) {
        const matchingStart = startMeds.find(start => {
          if (usedStartIds.has(start.id)) return false;
          
          if (stopMed.infusionSessionId && stopMed.infusionSessionId === start.id) {
            return true;
          }
          if (!stopMed.infusionSessionId) {
            const startTime = new Date(start.timestamp).getTime();
            const stopTime = new Date(stopMed.timestamp).getTime();
            return stopTime > startTime && start.endTimestamp;
          }
          return false;
        });
        
        if (matchingStart && matchingStart.endTimestamp) {
          usedStartIds.add(matchingStart.id);
          const doseValue = parseFloat(stopMed.dose?.match(/[\d.]+/)?.[0] || '0');
          totalDose += doseValue;
        }
      }
      
      const ampuleValue = parseFloat(item.ampuleTotalContent?.match(/[\d.]+/)?.[0] || '0');
      if (ampuleValue > 0 && totalDose > 0) {
        totalQty = Math.ceil(totalDose / ampuleValue);
      }
      
      logger.info('[INVENTORY-CALC] TCI infusion usage:', {
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
      const totalDose = bolusMeds.reduce((sum, med: any) => {
        const doseValue = parseFloat(med.dose?.match(/[\d.]+/)?.[0] || '0');
        return sum + doseValue;
      }, 0);
      
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
        
        const hasStopTime = stopEvent || (startEvent?.endTimestamp);
        
        if (startEvent && hasStopTime) {
          const rateChanges = sortedEvents
            .filter(e => e.type === 'rate_change')
            .map(e => ({ 
              timestamp: new Date(e.timestamp), 
              rate: e.rate || '0' 
            }));
          
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
          
          const stopEvent = stopEvents.find(s => 
            !usedStops.has(s) && new Date(s.timestamp).getTime() > startTime.getTime()
          );
          
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
        
        for (const segment of segments) {
          const volume = calculateRateControlledVolume(
            segment.rate,
            item.rateUnit,
            segment.start,
            segment.end,
            patientWeight
          );
          logger.info('[INVENTORY-CALC] Rate-controlled segment volume:', {
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
      
      if (totalRawVolume > 0) {
        totalQty = volumeToAmpules(totalRawVolume, item.ampuleTotalContent);
        logger.info('[INVENTORY-CALC] Final ampule calculation:', {
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

  const existingUsage = await db
    .select()
    .from(inventoryUsage)
    .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
  
  for (const existing of existingUsage) {
    if (!usageMap.has(existing.itemId) && existing.overrideQty === null) {
      await db
        .delete(inventoryUsage)
        .where(eq(inventoryUsage.id, existing.id));
    }
  }
  
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
        where: sql`${inventoryUsage.overrideQty} IS NULL`,
      });
  }

  const finalUsage = await db
    .select()
    .from(inventoryUsage)
    .where(eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId));
  
  return finalUsage;
}

export async function updateInventoryUsage(
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

export async function clearInventoryOverride(id: string): Promise<InventoryUsage> {
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

export async function createManualInventoryUsage(
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

// ========== INVENTORY COMMITS ==========

export async function commitInventoryUsage(
  anesthesiaRecordId: string,
  userId: string,
  signature: string | null,
  patientName: string | null,
  patientId: string | null,
  unitId?: string | null
): Promise<InventoryCommit> {
  const usage = await getInventoryUsage(anesthesiaRecordId);
  
  if (usage.length === 0) {
    throw new Error("No inventory items to commit");
  }

  const itemIds = usage.map(u => u.itemId);
  const itemsData = await db
    .select()
    .from(items)
    .where(inArray(items.id, itemIds));

  const itemsMapData = new Map(itemsData.map(item => [item.id, item]));

  const itemsToCommit: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    isControlled: boolean;
  }> = [];

  for (const usageRecord of usage) {
    const item = itemsMapData.get(usageRecord.itemId);
    if (!item) continue;

    if (unitId && item.unitId !== unitId) {
      continue;
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

  const hasControlledItems = itemsToCommit.some(i => i.isControlled);
  if (hasControlledItems && !signature) {
    throw new Error("Signature required for controlled items");
  }

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

  for (const item of itemsToCommit) {
    const itemData = itemsMapData.get(item.itemId);
    
    if (itemData && !itemData.isService && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
      let currentUnits: number;
      let newUnits: number;
      
      if (itemData.unit === "Single unit") {
        const [stockLevel] = await db
          .select()
          .from(stockLevels)
          .where(
            and(
              eq(stockLevels.itemId, item.itemId),
              eq(stockLevels.unitId, itemData.unitId)
            )
          )
          .limit(1);
        
        currentUnits = stockLevel?.qtyOnHand || 0;
        newUnits = Math.max(0, currentUnits - item.quantity);
        
        if (stockLevel) {
          await db
            .update(stockLevels)
            .set({ qtyOnHand: newUnits, updatedAt: new Date() })
            .where(eq(stockLevels.id, stockLevel.id));
        } else {
          await db
            .insert(stockLevels)
            .values({
              itemId: item.itemId,
              unitId: itemData.unitId,
              qtyOnHand: newUnits,
            });
        }
      } else {
        currentUnits = parseInt(String(itemData.currentUnits || 0));
        newUnits = Math.max(0, currentUnits - item.quantity);
        
        await db
          .update(items)
          .set({ currentUnits: newUnits })
          .where(eq(items.id, item.itemId));
      }

      if (item.isControlled) {
        await db.insert(activities).values({
          itemId: item.itemId,
          hospitalId: itemData.hospitalId,
          unitId: itemData.unitId,
          action: 'use',
          delta: -item.quantity,
          movementType: 'OUT',
          userId,
          notes: `Anesthesia commit: ${anesthesiaRecordId}`,
          controlledVerified: false,
          signatures: signature ? [signature] : [],
          patientId,
          metadata: { beforeQty: currentUnits, afterQty: newUnits },
        });
      }
    }
  }

  return commit;
}

export async function getInventoryCommits(anesthesiaRecordId: string, unitId?: string | null): Promise<InventoryCommit[]> {
  const conditions = [eq(inventoryCommits.anesthesiaRecordId, anesthesiaRecordId)];
  
  if (unitId) {
    conditions.push(
      or(
        eq(inventoryCommits.unitId, unitId),
        isNull(inventoryCommits.unitId)
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

export async function getInventoryCommitById(commitId: string): Promise<InventoryCommit | null> {
  const [commit] = await db
    .select()
    .from(inventoryCommits)
    .where(eq(inventoryCommits.id, commitId));

  return commit || null;
}

export async function rollbackInventoryCommit(
  commitId: string,
  userId: string,
  reason: string
): Promise<InventoryCommit> {
  const commit = await getInventoryCommitById(commitId);
  if (!commit) {
    throw new Error("Commit not found");
  }

  if (commit.rolledBackAt) {
    throw new Error("Commit already rolled back");
  }

  const [updated] = await db
    .update(inventoryCommits)
    .set({
      rolledBackAt: new Date(),
      rolledBackBy: userId,
      rollbackReason: reason,
    })
    .where(eq(inventoryCommits.id, commitId))
    .returning();

  const commitItems = commit.items as Array<{
    itemId: string;
    quantity: number;
    isControlled: boolean;
  }>;

  const itemIdsForRollback = commitItems.map(i => i.itemId);
  const itemsData = await db
    .select()
    .from(items)
    .where(inArray(items.id, itemIdsForRollback));

  for (const commitItem of commitItems) {
    const itemData = itemsData.find(i => i.id === commitItem.itemId);
    if (itemData && !itemData.isService && (itemData.trackExactQuantity || itemData.unit === "Single unit")) {
      let currentUnits: number;
      let newUnits: number;
      
      if (itemData.unit === "Single unit") {
        const [stockLevel] = await db
          .select()
          .from(stockLevels)
          .where(
            and(
              eq(stockLevels.itemId, commitItem.itemId),
              eq(stockLevels.unitId, itemData.unitId)
            )
          )
          .limit(1);
        
        currentUnits = stockLevel?.qtyOnHand || 0;
        newUnits = currentUnits + commitItem.quantity;
        
        if (stockLevel) {
          await db
            .update(stockLevels)
            .set({ qtyOnHand: newUnits, updatedAt: new Date() })
            .where(eq(stockLevels.id, stockLevel.id));
        } else {
          await db
            .insert(stockLevels)
            .values({
              itemId: commitItem.itemId,
              unitId: itemData.unitId,
              qtyOnHand: newUnits,
            });
        }
      } else {
        currentUnits = parseInt(String(itemData.currentUnits || 0));
        newUnits = currentUnits + commitItem.quantity;
        
        await db
          .update(items)
          .set({ currentUnits: newUnits })
          .where(eq(items.id, commitItem.itemId));
      }

      if (commitItem.isControlled) {
        await db.insert(activities).values({
          itemId: commitItem.itemId,
          hospitalId: itemData.hospitalId,
          unitId: itemData.unitId,
          action: 'adjust',
          delta: commitItem.quantity,
          userId,
          notes: `Rollback commit: ${reason}`,
          controlledVerified: true,
          metadata: { beforeQty: currentUnits, afterQty: newUnits },
        });
      }
    }
  }

  await calculateInventoryUsage(commit.anesthesiaRecordId);

  return updated;
}

// ========== AUDIT TRAIL ==========

export async function getAuditTrail(recordType: string, recordId: string): Promise<AuditTrail[]> {
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

export async function createAuditLog(log: InsertAuditTrail): Promise<void> {
  await db.insert(auditTrail).values(log);
}

// ========== SURGEON CHECKLIST TEMPLATES ==========

export async function getSurgeonChecklistTemplates(hospitalId: string, userId?: string): Promise<SurgeonChecklistTemplate[]> {
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

export async function getSurgeonChecklistTemplate(id: string): Promise<(SurgeonChecklistTemplate & { items: SurgeonChecklistTemplateItem[] }) | undefined> {
  const [template] = await db
    .select()
    .from(surgeonChecklistTemplates)
    .where(eq(surgeonChecklistTemplates.id, id));
  
  if (!template) return undefined;

  const templateItems = await db
    .select()
    .from(surgeonChecklistTemplateItems)
    .where(eq(surgeonChecklistTemplateItems.templateId, id))
    .orderBy(asc(surgeonChecklistTemplateItems.sortOrder));

  return { ...template, items: templateItems };
}

export async function createSurgeonChecklistTemplate(template: InsertSurgeonChecklistTemplate): Promise<SurgeonChecklistTemplate> {
  const [created] = await db
    .insert(surgeonChecklistTemplates)
    .values(template)
    .returning();
  return created;
}

export async function updateSurgeonChecklistTemplate(
  id: string, 
  updates: Partial<SurgeonChecklistTemplate>, 
  templateItems?: { id?: string; label: string; sortOrder: number }[]
): Promise<SurgeonChecklistTemplate> {
  const [updated] = await db
    .update(surgeonChecklistTemplates)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(surgeonChecklistTemplates.id, id))
    .returning();

  if (templateItems) {
    const existingItems = await db
      .select()
      .from(surgeonChecklistTemplateItems)
      .where(eq(surgeonChecklistTemplateItems.templateId, id));

    const existingIds = existingItems.map(i => i.id);
    const incomingIds = templateItems.filter(i => i.id).map(i => i.id!);
    const idsToDelete = existingIds.filter(eid => !incomingIds.includes(eid));

    if (idsToDelete.length > 0) {
      await db
        .delete(surgeryPreOpChecklistEntries)
        .where(inArray(surgeryPreOpChecklistEntries.itemId, idsToDelete));
      
      await db
        .delete(surgeonChecklistTemplateItems)
        .where(inArray(surgeonChecklistTemplateItems.id, idsToDelete));
    }

    const newItemIds: string[] = [];

    for (const item of templateItems) {
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

    if (newItemIds.length > 0) {
      const existingEntries = await db
        .select({ surgeryId: surgeryPreOpChecklistEntries.surgeryId })
        .from(surgeryPreOpChecklistEntries)
        .where(eq(surgeryPreOpChecklistEntries.templateId, id))
        .groupBy(surgeryPreOpChecklistEntries.surgeryId);

      const surgeryIds = existingEntries.map(e => e.surgeryId);

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

export async function deleteSurgeonChecklistTemplate(id: string): Promise<void> {
  await db.delete(surgeryPreOpChecklistEntries).where(eq(surgeryPreOpChecklistEntries.templateId, id));
  await db.delete(surgeonChecklistTemplates).where(eq(surgeonChecklistTemplates.id, id));
}

// ========== SURGERY PRE-OP CHECKLIST ==========

export async function getSurgeryPreOpChecklist(surgeryId: string): Promise<{ templateId: string | null; entries: SurgeryPreOpChecklistEntry[] }> {
  const entries = await db
    .select()
    .from(surgeryPreOpChecklistEntries)
    .where(eq(surgeryPreOpChecklistEntries.surgeryId, surgeryId));

  const templateId = entries.length > 0 ? entries[0].templateId : null;
  return { templateId, entries };
}

export async function saveSurgeryPreOpChecklist(
  surgeryId: string, 
  templateId: string, 
  entries: { itemId: string; checked: boolean; note?: string | null }[]
): Promise<SurgeryPreOpChecklistEntry[]> {
  const results: SurgeryPreOpChecklistEntry[] = [];
  const incomingItemIds = entries.map(e => e.itemId);

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
          templateId,
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

export async function saveSurgeryPreOpChecklistEntry(
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

// ========== CHECKLIST MATRIX ==========

export async function getFutureSurgeriesWithPatients(hospitalId: string): Promise<(Surgery & { patient?: Patient })[]> {
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

export async function getPastSurgeriesWithPatients(hospitalId: string, limit: number = 100): Promise<(Surgery & { patient?: Patient })[]> {
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

export async function getChecklistMatrixEntries(templateId: string, hospitalId: string): Promise<SurgeryPreOpChecklistEntry[]> {
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

export async function getPastChecklistMatrixEntries(templateId: string, hospitalId: string, limit: number = 100): Promise<(SurgeryPreOpChecklistEntry & { itemLabel?: string })[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const template = await getSurgeonChecklistTemplate(templateId);
  if (!template || !template.items.length) {
    return [];
  }

  const entries = await db
    .select({
      entry: surgeryPreOpChecklistEntries,
      itemLabel: surgeonChecklistTemplateItems.label,
    })
    .from(surgeryPreOpChecklistEntries)
    .innerJoin(surgeries, eq(surgeryPreOpChecklistEntries.surgeryId, surgeries.id))
    .leftJoin(surgeonChecklistTemplateItems, eq(surgeryPreOpChecklistEntries.itemId, surgeonChecklistTemplateItems.id))
    .where(and(
      eq(surgeries.hospitalId, hospitalId),
      lt(surgeries.plannedDate, today),
      eq(surgeries.isArchived, false)
    ))
    .orderBy(desc(surgeries.plannedDate))
    .limit(limit * template.items.length);

  return entries.map(row => ({
    ...row.entry,
    itemLabel: row.itemLabel || undefined,
  }));
}

export async function toggleSurgeonChecklistTemplateDefault(templateId: string, userId: string): Promise<SurgeonChecklistTemplate> {
  const [template] = await db
    .select()
    .from(surgeonChecklistTemplates)
    .where(eq(surgeonChecklistTemplates.id, templateId));

  if (!template) {
    throw new Error("Template not found");
  }

  const newDefaultValue = !template.isDefault;

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

export async function applyTemplateToFutureSurgeries(templateId: string, hospitalId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const template = await getSurgeonChecklistTemplate(templateId);
  if (!template || !template.items.length) {
    return 0;
  }

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
    const existingEntries = await db
      .select()
      .from(surgeryPreOpChecklistEntries)
      .where(and(
        eq(surgeryPreOpChecklistEntries.surgeryId, surgery.id),
        eq(surgeryPreOpChecklistEntries.templateId, templateId)
      ));

    if (existingEntries.length === 0) {
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

// ========== ANESTHESIA SETS ==========

export async function getAnesthesiaSets(hospitalId: string): Promise<AnesthesiaSet[]> {
  return await db
    .select()
    .from(anesthesiaSets)
    .where(and(
      eq(anesthesiaSets.hospitalId, hospitalId),
      eq(anesthesiaSets.isActive, true)
    ))
    .orderBy(asc(anesthesiaSets.sortOrder), asc(anesthesiaSets.name));
}

export async function getAnesthesiaSet(id: string): Promise<AnesthesiaSet | null> {
  const [set] = await db
    .select()
    .from(anesthesiaSets)
    .where(eq(anesthesiaSets.id, id));
  return set || null;
}

export async function createAnesthesiaSet(set: InsertAnesthesiaSet): Promise<AnesthesiaSet> {
  const [created] = await db
    .insert(anesthesiaSets)
    .values(set)
    .returning();
  return created;
}

export async function updateAnesthesiaSet(id: string, updates: Partial<AnesthesiaSet>): Promise<AnesthesiaSet> {
  const [updated] = await db
    .update(anesthesiaSets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(anesthesiaSets.id, id))
    .returning();
  return updated;
}

export async function deleteAnesthesiaSet(id: string): Promise<void> {
  await db.delete(anesthesiaSets).where(eq(anesthesiaSets.id, id));
}

export async function getAnesthesiaSetItems(setId: string): Promise<AnesthesiaSetItem[]> {
  return await db
    .select()
    .from(anesthesiaSetItems)
    .where(eq(anesthesiaSetItems.setId, setId))
    .orderBy(asc(anesthesiaSetItems.sortOrder));
}

export async function createAnesthesiaSetItem(item: InsertAnesthesiaSetItem): Promise<AnesthesiaSetItem> {
  const [created] = await db
    .insert(anesthesiaSetItems)
    .values(item)
    .returning();
  return created;
}

export async function deleteAnesthesiaSetItems(setId: string): Promise<void> {
  await db.delete(anesthesiaSetItems).where(eq(anesthesiaSetItems.setId, setId));
}

// ========== ANESTHESIA SET MEDICATIONS ==========

export async function getAnesthesiaSetMedications(setId: string): Promise<AnesthesiaSetMedication[]> {
  return await db
    .select()
    .from(anesthesiaSetMedications)
    .where(eq(anesthesiaSetMedications.setId, setId))
    .orderBy(asc(anesthesiaSetMedications.sortOrder));
}

export async function createAnesthesiaSetMedication(item: InsertAnesthesiaSetMedication): Promise<AnesthesiaSetMedication> {
  const [created] = await db
    .insert(anesthesiaSetMedications)
    .values(item)
    .returning();
  return created;
}

export async function deleteAnesthesiaSetMedications(setId: string): Promise<void> {
  await db.delete(anesthesiaSetMedications).where(eq(anesthesiaSetMedications.setId, setId));
}

// ========== ANESTHESIA SET INVENTORY ==========

export async function getAnesthesiaSetInventory(setId: string): Promise<AnesthesiaSetInventoryItem[]> {
  return await db
    .select()
    .from(anesthesiaSetInventory)
    .where(eq(anesthesiaSetInventory.setId, setId))
    .orderBy(asc(anesthesiaSetInventory.sortOrder));
}

export async function createAnesthesiaSetInventoryItem(item: InsertAnesthesiaSetInventoryItem): Promise<AnesthesiaSetInventoryItem> {
  const [created] = await db
    .insert(anesthesiaSetInventory)
    .values(item)
    .returning();
  return created;
}

export async function deleteAnesthesiaSetInventory(setId: string): Promise<void> {
  await db.delete(anesthesiaSetInventory).where(eq(anesthesiaSetInventory.setId, setId));
}

// ========== INVENTORY SETS ==========

export async function getInventorySets(hospitalId: string, unitId?: string): Promise<InventorySet[]> {
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

export async function getInventorySet(id: string): Promise<InventorySet | null> {
  const [set] = await db
    .select()
    .from(inventorySets)
    .where(eq(inventorySets.id, id));
  return set || null;
}

export async function getInventorySetItems(setId: string): Promise<InventorySetItem[]> {
  return await db
    .select()
    .from(inventorySetItems)
    .where(eq(inventorySetItems.setId, setId))
    .orderBy(asc(inventorySetItems.sortOrder));
}

export async function createInventorySet(set: InsertInventorySet): Promise<InventorySet> {
  const [created] = await db
    .insert(inventorySets)
    .values(set)
    .returning();
  return created;
}

export async function updateInventorySet(id: string, updates: Partial<InventorySet>): Promise<InventorySet> {
  const [updated] = await db
    .update(inventorySets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(inventorySets.id, id))
    .returning();
  return updated;
}

export async function deleteInventorySet(id: string): Promise<void> {
  await db.delete(inventorySets).where(eq(inventorySets.id, id));
}

export async function createInventorySetItem(item: InsertInventorySetItem): Promise<InventorySetItem> {
  const [created] = await db
    .insert(inventorySetItems)
    .values(item)
    .returning();
  return created;
}

export async function deleteInventorySetItems(setId: string): Promise<void> {
  await db.delete(inventorySetItems).where(eq(inventorySetItems.setId, setId));
}

// ========== ADDITIONAL INVENTORY USAGE FOR SETS ==========

export async function getInventoryUsageByItem(anesthesiaRecordId: string, itemId: string): Promise<InventoryUsage | null> {
  const [usage] = await db
    .select()
    .from(inventoryUsage)
    .where(and(
      eq(inventoryUsage.anesthesiaRecordId, anesthesiaRecordId),
      eq(inventoryUsage.itemId, itemId)
    ));
  return usage || null;
}

export async function createInventoryUsage(usage: InsertInventoryUsage): Promise<InventoryUsage> {
  const [created] = await db
    .insert(inventoryUsage)
    .values(usage)
    .returning();
  return created;
}

// ========== SURGERY SETS ==========

export async function getSurgerySets(hospitalId: string): Promise<SurgerySet[]> {
  return await db
    .select()
    .from(surgerySets)
    .where(and(
      eq(surgerySets.hospitalId, hospitalId),
      eq(surgerySets.isActive, true)
    ))
    .orderBy(asc(surgerySets.sortOrder), asc(surgerySets.name));
}

export async function getSurgerySet(id: string): Promise<SurgerySet | null> {
  const [set] = await db
    .select()
    .from(surgerySets)
    .where(eq(surgerySets.id, id));
  return set || null;
}

export async function createSurgerySet(set: InsertSurgerySet): Promise<SurgerySet> {
  const [created] = await db
    .insert(surgerySets)
    .values(set)
    .returning();
  return created;
}

export async function updateSurgerySet(id: string, updates: Partial<SurgerySet>): Promise<SurgerySet> {
  const [updated] = await db
    .update(surgerySets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(surgerySets.id, id))
    .returning();
  return updated;
}

export async function deleteSurgerySet(id: string): Promise<void> {
  await db.delete(surgerySets).where(eq(surgerySets.id, id));
}

export async function getSurgerySetInventory(setId: string): Promise<SurgerySetInventoryItem[]> {
  return await db
    .select()
    .from(surgerySetInventory)
    .where(eq(surgerySetInventory.setId, setId))
    .orderBy(asc(surgerySetInventory.sortOrder));
}

export async function createSurgerySetInventoryItem(item: InsertSurgerySetInventoryItem): Promise<SurgerySetInventoryItem> {
  const [created] = await db
    .insert(surgerySetInventory)
    .values(item)
    .returning();
  return created;
}

export async function deleteSurgerySetInventory(setId: string): Promise<void> {
  await db.delete(surgerySetInventory).where(eq(surgerySetInventory.setId, setId));
}

// ========== PATIENT DISCHARGE MEDICATIONS ==========

export async function getPatientDischargeMedications(patientId: string, hospitalId: string): Promise<(PatientDischargeMedication & { items: (PatientDischargeMedicationItem & { item: Item })[], doctor: User | null })[]> {
  const slots = await db
    .select()
    .from(patientDischargeMedications)
    .where(and(
      eq(patientDischargeMedications.patientId, patientId),
      eq(patientDischargeMedications.hospitalId, hospitalId)
    ))
    .orderBy(desc(patientDischargeMedications.createdAt));

  const results = [];
  for (const slot of slots) {
    const slotItems = await db
      .select()
      .from(patientDischargeMedicationItems)
      .innerJoin(items, eq(patientDischargeMedicationItems.itemId, items.id))
      .where(eq(patientDischargeMedicationItems.dischargeMedicationId, slot.id));

    let doctor: User | null = null;
    if (slot.doctorId) {
      const [doc] = await db.select().from(users).where(eq(users.id, slot.doctorId));
      doctor = doc || null;
    }

    results.push({
      ...slot,
      items: slotItems.map(si => ({ ...si.patient_discharge_medication_items, item: si.items })),
      doctor,
    });
  }
  return results;
}

export async function getPatientDischargeMedication(id: string): Promise<(PatientDischargeMedication & { items: (PatientDischargeMedicationItem & { item: Item })[], doctor: User | null }) | undefined> {
  const [slot] = await db
    .select()
    .from(patientDischargeMedications)
    .where(eq(patientDischargeMedications.id, id));
  if (!slot) return undefined;

  const slotItems = await db
    .select()
    .from(patientDischargeMedicationItems)
    .innerJoin(items, eq(patientDischargeMedicationItems.itemId, items.id))
    .where(eq(patientDischargeMedicationItems.dischargeMedicationId, slot.id));

  let doctor: User | null = null;
  if (slot.doctorId) {
    const [doc] = await db.select().from(users).where(eq(users.id, slot.doctorId));
    doctor = doc || null;
  }

  return {
    ...slot,
    items: slotItems.map(si => ({ ...si.patient_discharge_medication_items, item: si.items })),
    doctor,
  };
}

export async function createPatientDischargeMedication(data: InsertPatientDischargeMedication, medItems: InsertPatientDischargeMedicationItem[]): Promise<PatientDischargeMedication> {
  const [slot] = await db
    .insert(patientDischargeMedications)
    .values(data)
    .returning();

  for (const medItem of medItems) {
    await db.insert(patientDischargeMedicationItems).values({
      ...medItem,
      dischargeMedicationId: slot.id,
    });

    const [item] = await db.select().from(items).where(eq(items.id, medItem.itemId));
    if (item) {
      if (item.trackExactQuantity) {
        const newUnits = Math.max(0, (item.currentUnits || 0) - (medItem.quantity || 1));
        await db.update(items).set({ currentUnits: newUnits, updatedAt: new Date() }).where(eq(items.id, item.id));
      } else {
        const [stockLevel] = await db.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.unitId, item.unitId)));
        if (stockLevel) {
          const deductQty = medItem.unitType === 'pills'
            ? Math.ceil((medItem.quantity || 1) / (item.packSize || 1))
            : (medItem.quantity || 1);
          const newQty = Math.max(0, (stockLevel.qtyOnHand || 0) - deductQty);
          await db.update(stockLevels).set({ qtyOnHand: newQty }).where(eq(stockLevels.id, stockLevel.id));
        }
      }
    }
  }

  return slot;
}

export async function updatePatientDischargeMedication(id: string, data: Partial<InsertPatientDischargeMedication>, newItems: InsertPatientDischargeMedicationItem[]): Promise<PatientDischargeMedication> {
  const oldItems = await db
    .select()
    .from(patientDischargeMedicationItems)
    .where(eq(patientDischargeMedicationItems.dischargeMedicationId, id));

  for (const medItem of oldItems) {
    const [item] = await db.select().from(items).where(eq(items.id, medItem.itemId));
    if (item) {
      if (item.trackExactQuantity) {
        const newUnits = (item.currentUnits || 0) + (medItem.quantity || 1);
        await db.update(items).set({ currentUnits: newUnits, updatedAt: new Date() }).where(eq(items.id, item.id));
      } else {
        const [stockLevel] = await db.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.unitId, item.unitId)));
        if (stockLevel) {
          const restoreQty = medItem.unitType === 'pills'
            ? Math.ceil((medItem.quantity || 1) / (item.packSize || 1))
            : (medItem.quantity || 1);
          const newQty = (stockLevel.qtyOnHand || 0) + restoreQty;
          await db.update(stockLevels).set({ qtyOnHand: newQty }).where(eq(stockLevels.id, stockLevel.id));
        }
      }
    }
  }

  await db.delete(patientDischargeMedicationItems).where(eq(patientDischargeMedicationItems.dischargeMedicationId, id));

  const updateData: Record<string, any> = {};
  if (data.doctorId !== undefined) updateData.doctorId = data.doctorId;
  if (data.notes !== undefined) updateData.notes = data.notes;
  if (data.signature !== undefined) updateData.signature = data.signature;

  if (Object.keys(updateData).length > 0) {
    await db.update(patientDischargeMedications).set(updateData).where(eq(patientDischargeMedications.id, id));
  }

  for (const medItem of newItems) {
    await db.insert(patientDischargeMedicationItems).values({
      ...medItem,
      dischargeMedicationId: id,
    });

    const [item] = await db.select().from(items).where(eq(items.id, medItem.itemId));
    if (item) {
      if (item.trackExactQuantity) {
        const newUnits = Math.max(0, (item.currentUnits || 0) - (medItem.quantity || 1));
        await db.update(items).set({ currentUnits: newUnits, updatedAt: new Date() }).where(eq(items.id, item.id));
      } else {
        const [stockLevel] = await db.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.unitId, item.unitId)));
        if (stockLevel) {
          const deductQty = medItem.unitType === 'pills'
            ? Math.ceil((medItem.quantity || 1) / (item.packSize || 1))
            : (medItem.quantity || 1);
          const newQty = Math.max(0, (stockLevel.qtyOnHand || 0) - deductQty);
          await db.update(stockLevels).set({ qtyOnHand: newQty }).where(eq(stockLevels.id, stockLevel.id));
        }
      }
    }
  }

  const [updated] = await db.select().from(patientDischargeMedications).where(eq(patientDischargeMedications.id, id));
  return updated;
}

export async function deletePatientDischargeMedication(id: string): Promise<PatientDischargeMedicationItem[]> {
  const deletedItems = await db
    .select()
    .from(patientDischargeMedicationItems)
    .where(eq(patientDischargeMedicationItems.dischargeMedicationId, id));

  for (const medItem of deletedItems) {
    const [item] = await db.select().from(items).where(eq(items.id, medItem.itemId));
    if (item) {
      if (item.trackExactQuantity) {
        const newUnits = (item.currentUnits || 0) + (medItem.quantity || 1);
        await db.update(items).set({ currentUnits: newUnits, updatedAt: new Date() }).where(eq(items.id, item.id));
      } else {
        const [stockLevel] = await db.select().from(stockLevels).where(and(eq(stockLevels.itemId, item.id), eq(stockLevels.unitId, item.unitId)));
        if (stockLevel) {
          const restoreQty = medItem.unitType === 'pills'
            ? Math.ceil((medItem.quantity || 1) / (item.packSize || 1))
            : (medItem.quantity || 1);
          const newQty = (stockLevel.qtyOnHand || 0) + restoreQty;
          await db.update(stockLevels).set({ qtyOnHand: newQty }).where(eq(stockLevels.id, stockLevel.id));
        }
      }
    }
  }

  await db.delete(patientDischargeMedications).where(eq(patientDischargeMedications.id, id));
  return deletedItems;
}

export async function getAnesthesiaRecordsByIds(recordIds: string[]): Promise<any[]> {
  if (recordIds.length === 0) return [];
  return db.select().from(anesthesiaRecords).where(inArray(anesthesiaRecords.id, recordIds));
}

export async function getAnesthesiaRecordsBySurgeryIds(surgeryIds: string[]): Promise<Map<string, any>> {
  if (surgeryIds.length === 0) return new Map();
  const records = await db.select().from(anesthesiaRecords).where(inArray(anesthesiaRecords.surgeryId, surgeryIds));
  const map = new Map<string, any>();
  for (const r of records) {
    if (r.surgeryId) map.set(r.surgeryId, r);
  }
  return map;
}
