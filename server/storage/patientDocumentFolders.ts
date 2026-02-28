import { eq, and } from "drizzle-orm";
import { db } from "../db";
import {
  patientDocumentFolders,
  patientDocuments,
  type PatientDocumentFolder,
  type InsertPatientDocumentFolder,
  type PatientDocument,
} from "@shared/schema";

// ========== FOLDER CRUD ==========

export async function getPatientDocumentFolders(patientId: string): Promise<PatientDocumentFolder[]> {
  return await db
    .select()
    .from(patientDocumentFolders)
    .where(eq(patientDocumentFolders.patientId, patientId))
    .orderBy(patientDocumentFolders.sortOrder);
}

export async function createPatientDocumentFolder(data: InsertPatientDocumentFolder): Promise<PatientDocumentFolder> {
  const [created] = await db
    .insert(patientDocumentFolders)
    .values(data)
    .returning();
  return created;
}

export async function updatePatientDocumentFolder(id: string, updates: Partial<PatientDocumentFolder>): Promise<PatientDocumentFolder> {
  const [updated] = await db
    .update(patientDocumentFolders)
    .set(updates)
    .where(eq(patientDocumentFolders.id, id))
    .returning();
  return updated;
}

export async function deletePatientDocumentFolder(id: string): Promise<void> {
  // Unassign documents from this folder (they stay as patient documents)
  await db
    .update(patientDocuments)
    .set({ documentFolderId: null })
    .where(eq(patientDocuments.documentFolderId, id));

  await db
    .delete(patientDocumentFolders)
    .where(eq(patientDocumentFolders.id, id));
}

export async function reorderPatientDocumentFolders(patientId: string, folderIds: string[]): Promise<void> {
  for (let i = 0; i < folderIds.length; i++) {
    await db
      .update(patientDocumentFolders)
      .set({ sortOrder: i })
      .where(and(eq(patientDocumentFolders.id, folderIds[i]), eq(patientDocumentFolders.patientId, patientId)));
  }
}

export async function moveDocumentToPatientFolder(docId: string, folderId: string | null): Promise<PatientDocument> {
  const [updated] = await db
    .update(patientDocuments)
    .set({ documentFolderId: folderId })
    .where(eq(patientDocuments.id, docId))
    .returning();
  return updated;
}
