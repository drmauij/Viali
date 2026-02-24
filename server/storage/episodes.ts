import { eq, and, desc, ilike, sql, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  patientEpisodes,
  episodeFolders,
  patientDocuments,
  surgeries,
  patientNotes,
  users,
  type PatientEpisode,
  type InsertPatientEpisode,
  type EpisodeFolder,
  type InsertEpisodeFolder,
  type PatientDocument,
  type Surgery,
  type PatientNote,
} from "@shared/schema";

// ========== EPISODE NUMBER GENERATION ==========

export async function generateEpisodeNumber(hospitalId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EP-${year}-`;

  const latestEpisode = await db
    .select()
    .from(patientEpisodes)
    .where(
      and(
        eq(patientEpisodes.hospitalId, hospitalId),
        ilike(patientEpisodes.episodeNumber, `${prefix}%`)
      )
    )
    .orderBy(desc(patientEpisodes.episodeNumber))
    .limit(1);

  if (latestEpisode.length === 0) {
    return `${prefix}001`;
  }

  const lastNumber = latestEpisode[0].episodeNumber.split('-')[2];
  const nextNumber = (parseInt(lastNumber, 10) + 1).toString().padStart(3, '0');
  return `${prefix}${nextNumber}`;
}

// ========== EPISODE CRUD ==========

export async function getPatientEpisodes(patientId: string, status?: string): Promise<PatientEpisode[]> {
  const conditions = [eq(patientEpisodes.patientId, patientId)];
  if (status) {
    conditions.push(sql`${patientEpisodes.status} = ${status}`);
  }

  return await db
    .select()
    .from(patientEpisodes)
    .where(and(...conditions))
    .orderBy(desc(patientEpisodes.referenceDate), desc(patientEpisodes.createdAt));
}

export async function getEpisode(id: string): Promise<PatientEpisode | undefined> {
  const [episode] = await db
    .select()
    .from(patientEpisodes)
    .where(eq(patientEpisodes.id, id));
  return episode;
}

export async function getEpisodeWithDetails(id: string): Promise<{
  episode: PatientEpisode;
  folders: EpisodeFolder[];
  documentCount: number;
  surgeryCount: number;
  noteCount: number;
} | undefined> {
  const episode = await getEpisode(id);
  if (!episode) return undefined;

  const [folders, docCountResult, surgeryCountResult, noteCountResult] = await Promise.all([
    getEpisodeFolders(id),
    db.select({ count: sql<number>`count(*)::int` })
      .from(patientDocuments)
      .where(eq(patientDocuments.episodeId, id)),
    db.select({ count: sql<number>`count(*)::int` })
      .from(surgeries)
      .where(eq(surgeries.episodeId, id)),
    db.select({ count: sql<number>`count(*)::int` })
      .from(patientNotes)
      .where(eq(patientNotes.episodeId, id)),
  ]);

  return {
    episode,
    folders,
    documentCount: docCountResult[0]?.count ?? 0,
    surgeryCount: surgeryCountResult[0]?.count ?? 0,
    noteCount: noteCountResult[0]?.count ?? 0,
  };
}

export async function createEpisode(data: InsertPatientEpisode): Promise<PatientEpisode> {
  // Generate episode number in same query flow - unique constraint is safety net
  const episodeNumber = await generateEpisodeNumber(data.hospitalId);

  const [created] = await db
    .insert(patientEpisodes)
    .values({ ...data, episodeNumber })
    .returning();
  return created;
}

export async function updateEpisode(id: string, updates: Partial<PatientEpisode>): Promise<PatientEpisode> {
  const [updated] = await db
    .update(patientEpisodes)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(patientEpisodes.id, id))
    .returning();
  return updated;
}

export async function closeEpisode(id: string, userId: string): Promise<PatientEpisode> {
  const [updated] = await db
    .update(patientEpisodes)
    .set({
      status: "closed",
      closedAt: new Date(),
      closedBy: userId,
      updatedAt: new Date(),
    })
    .where(eq(patientEpisodes.id, id))
    .returning();
  return updated;
}

export async function reopenEpisode(id: string): Promise<PatientEpisode> {
  const [updated] = await db
    .update(patientEpisodes)
    .set({
      status: "open",
      closedAt: null,
      closedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(patientEpisodes.id, id))
    .returning();
  return updated;
}

// ========== FOLDER CRUD ==========

export async function getEpisodeFolders(episodeId: string): Promise<EpisodeFolder[]> {
  return await db
    .select()
    .from(episodeFolders)
    .where(eq(episodeFolders.episodeId, episodeId))
    .orderBy(episodeFolders.sortOrder);
}

export async function createEpisodeFolder(data: InsertEpisodeFolder): Promise<EpisodeFolder> {
  const [created] = await db
    .insert(episodeFolders)
    .values(data)
    .returning();
  return created;
}

export async function updateEpisodeFolder(id: string, updates: Partial<EpisodeFolder>): Promise<EpisodeFolder> {
  const [updated] = await db
    .update(episodeFolders)
    .set(updates)
    .where(eq(episodeFolders.id, id))
    .returning();
  return updated;
}

export async function deleteEpisodeFolder(id: string): Promise<void> {
  // Unassign documents from this folder (they stay in the episode)
  await db
    .update(patientDocuments)
    .set({ episodeFolderId: null })
    .where(eq(patientDocuments.episodeFolderId, id));

  await db
    .delete(episodeFolders)
    .where(eq(episodeFolders.id, id));
}

export async function reorderEpisodeFolders(episodeId: string, folderIds: string[]): Promise<void> {
  for (let i = 0; i < folderIds.length; i++) {
    await db
      .update(episodeFolders)
      .set({ sortOrder: i })
      .where(and(eq(episodeFolders.id, folderIds[i]), eq(episodeFolders.episodeId, episodeId)));
  }
}

// ========== DOCUMENT-EPISODE OPERATIONS ==========

export async function getEpisodeDocuments(episodeId: string): Promise<PatientDocument[]> {
  return await db
    .select()
    .from(patientDocuments)
    .where(eq(patientDocuments.episodeId, episodeId))
    .orderBy(patientDocuments.episodeFolderId, desc(patientDocuments.createdAt));
}

export async function assignDocumentToEpisode(docId: string, episodeId: string, folderId?: string): Promise<PatientDocument> {
  const [updated] = await db
    .update(patientDocuments)
    .set({ episodeId, episodeFolderId: folderId || null })
    .where(eq(patientDocuments.id, docId))
    .returning();
  return updated;
}

export async function unassignDocumentFromEpisode(docId: string): Promise<PatientDocument> {
  const [updated] = await db
    .update(patientDocuments)
    .set({ episodeId: null, episodeFolderId: null })
    .where(eq(patientDocuments.id, docId))
    .returning();
  return updated;
}

export async function moveDocumentToFolder(docId: string, folderId: string | null): Promise<PatientDocument> {
  const [updated] = await db
    .update(patientDocuments)
    .set({ episodeFolderId: folderId })
    .where(eq(patientDocuments.id, docId))
    .returning();
  return updated;
}

// ========== LINKING: SURGERIES ==========

export async function linkSurgeryToEpisode(surgeryId: string, episodeId: string): Promise<Surgery> {
  const [updated] = await db
    .update(surgeries)
    .set({ episodeId, updatedAt: new Date() })
    .where(eq(surgeries.id, surgeryId))
    .returning();
  return updated;
}

export async function unlinkSurgeryFromEpisode(surgeryId: string): Promise<Surgery> {
  const [updated] = await db
    .update(surgeries)
    .set({ episodeId: null, updatedAt: new Date() })
    .where(eq(surgeries.id, surgeryId))
    .returning();
  return updated;
}

export async function getEpisodeSurgeries(episodeId: string): Promise<Surgery[]> {
  return await db
    .select()
    .from(surgeries)
    .where(eq(surgeries.episodeId, episodeId))
    .orderBy(desc(surgeries.plannedDate));
}

// ========== LINKING: NOTES ==========

export async function linkNoteToEpisode(noteId: string, episodeId: string): Promise<PatientNote> {
  const [updated] = await db
    .update(patientNotes)
    .set({ episodeId, updatedAt: new Date() })
    .where(eq(patientNotes.id, noteId))
    .returning();
  return updated;
}

export async function unlinkNoteFromEpisode(noteId: string): Promise<PatientNote> {
  const [updated] = await db
    .update(patientNotes)
    .set({ episodeId: null, updatedAt: new Date() })
    .where(eq(patientNotes.id, noteId))
    .returning();
  return updated;
}

export async function getEpisodeNotes(episodeId: string): Promise<(PatientNote & { author: { id: string; firstName: string | null; lastName: string | null } })[]> {
  return await db
    .select({
      id: patientNotes.id,
      patientId: patientNotes.patientId,
      authorId: patientNotes.authorId,
      content: patientNotes.content,
      episodeId: patientNotes.episodeId,
      createdAt: patientNotes.createdAt,
      updatedAt: patientNotes.updatedAt,
      author: {
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      },
    })
    .from(patientNotes)
    .leftJoin(users, eq(patientNotes.authorId, users.id))
    .where(eq(patientNotes.episodeId, episodeId))
    .orderBy(desc(patientNotes.createdAt)) as any;
}
