import { db } from "../db";
import { eq, and, desc, asc, isNull } from "drizzle-orm";
import {
  patientQuestionnaireLinks,
  patientQuestionnaireResponses,
  patientQuestionnaireUploads,
  patientQuestionnaireReviews,
  patientDocuments,
  patientMessages,
  personalTodos,
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
} from "@shared/schema";

// ========== QUESTIONNAIRE LINK OPERATIONS ==========

export async function createQuestionnaireLink(link: InsertPatientQuestionnaireLink): Promise<PatientQuestionnaireLink> {
  const [created] = await db
    .insert(patientQuestionnaireLinks)
    .values(link)
    .returning();
  return created;
}

export async function getQuestionnaireLink(id: string): Promise<PatientQuestionnaireLink | undefined> {
  const [link] = await db
    .select()
    .from(patientQuestionnaireLinks)
    .where(eq(patientQuestionnaireLinks.id, id));
  return link;
}

export async function getQuestionnaireLinkByToken(token: string): Promise<PatientQuestionnaireLink | undefined> {
  const [link] = await db
    .select()
    .from(patientQuestionnaireLinks)
    .where(eq(patientQuestionnaireLinks.token, token));
  return link;
}

export async function getQuestionnaireLinksForPatient(patientId: string): Promise<PatientQuestionnaireLink[]> {
  return await db
    .select()
    .from(patientQuestionnaireLinks)
    .where(eq(patientQuestionnaireLinks.patientId, patientId))
    .orderBy(desc(patientQuestionnaireLinks.createdAt));
}

export async function getQuestionnaireLinksForHospital(hospitalId: string): Promise<PatientQuestionnaireLink[]> {
  return await db
    .select()
    .from(patientQuestionnaireLinks)
    .where(eq(patientQuestionnaireLinks.hospitalId, hospitalId))
    .orderBy(desc(patientQuestionnaireLinks.createdAt));
}

export async function updateQuestionnaireLink(id: string, updates: Partial<PatientQuestionnaireLink>): Promise<PatientQuestionnaireLink> {
  const [updated] = await db
    .update(patientQuestionnaireLinks)
    .set(updates)
    .where(eq(patientQuestionnaireLinks.id, id))
    .returning();
  return updated;
}

export async function invalidateQuestionnaireLink(id: string): Promise<void> {
  await db
    .update(patientQuestionnaireLinks)
    .set({ status: 'expired' })
    .where(eq(patientQuestionnaireLinks.id, id));
}

// ========== QUESTIONNAIRE RESPONSE OPERATIONS ==========

export async function createQuestionnaireResponse(response: InsertPatientQuestionnaireResponse): Promise<PatientQuestionnaireResponse> {
  const [created] = await db
    .insert(patientQuestionnaireResponses)
    .values(response)
    .returning();
  return created;
}

export async function getQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse | undefined> {
  const [response] = await db
    .select()
    .from(patientQuestionnaireResponses)
    .where(eq(patientQuestionnaireResponses.id, id));
  return response;
}

export async function getQuestionnaireResponseByLinkId(linkId: string): Promise<PatientQuestionnaireResponse | undefined> {
  const [response] = await db
    .select()
    .from(patientQuestionnaireResponses)
    .where(eq(patientQuestionnaireResponses.linkId, linkId));
  return response;
}

export async function updateQuestionnaireResponse(id: string, updates: Partial<PatientQuestionnaireResponse>): Promise<PatientQuestionnaireResponse> {
  const [updated] = await db
    .update(patientQuestionnaireResponses)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(patientQuestionnaireResponses.id, id))
    .returning();
  return updated;
}

export async function submitQuestionnaireResponse(id: string): Promise<PatientQuestionnaireResponse> {
  const [submitted] = await db
    .update(patientQuestionnaireResponses)
    .set({ status: 'submitted', submittedAt: new Date(), updatedAt: new Date() })
    .where(eq(patientQuestionnaireResponses.id, id))
    .returning();
  
  const response = await getQuestionnaireResponse(id);
  if (response) {
    await db
      .update(patientQuestionnaireLinks)
      .set({ status: 'submitted', submittedAt: new Date() })
      .where(eq(patientQuestionnaireLinks.id, response.linkId));
  }
  
  return submitted;
}

export async function getQuestionnaireResponsesForHospital(hospitalId: string, status?: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]> {
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

export async function getUnassociatedQuestionnaireResponsesForHospital(hospitalId: string): Promise<(PatientQuestionnaireResponse & { link: PatientQuestionnaireLink })[]> {
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

export async function associateQuestionnaireWithPatient(linkId: string, patientId: string): Promise<PatientQuestionnaireLink> {
  const [updated] = await db
    .update(patientQuestionnaireLinks)
    .set({ patientId })
    .where(eq(patientQuestionnaireLinks.id, linkId))
    .returning();
  return updated;
}

// ========== QUESTIONNAIRE UPLOAD OPERATIONS ==========

export async function addQuestionnaireUpload(upload: InsertPatientQuestionnaireUpload): Promise<PatientQuestionnaireUpload> {
  const [created] = await db
    .insert(patientQuestionnaireUploads)
    .values(upload)
    .returning();
  return created;
}

export async function getQuestionnaireUploads(responseId: string): Promise<PatientQuestionnaireUpload[]> {
  return await db
    .select()
    .from(patientQuestionnaireUploads)
    .where(eq(patientQuestionnaireUploads.responseId, responseId))
    .orderBy(asc(patientQuestionnaireUploads.createdAt));
}

export async function getQuestionnaireUploadById(id: string): Promise<PatientQuestionnaireUpload | undefined> {
  const [upload] = await db
    .select()
    .from(patientQuestionnaireUploads)
    .where(eq(patientQuestionnaireUploads.id, id));
  return upload;
}

export async function updateQuestionnaireUpload(id: string, updates: Partial<{ description: string; reviewed: boolean }>): Promise<PatientQuestionnaireUpload> {
  const [updated] = await db
    .update(patientQuestionnaireUploads)
    .set(updates)
    .where(eq(patientQuestionnaireUploads.id, id))
    .returning();
  return updated;
}

export async function deleteQuestionnaireUpload(id: string): Promise<void> {
  await db
    .delete(patientQuestionnaireUploads)
    .where(eq(patientQuestionnaireUploads.id, id));
}

// ========== QUESTIONNAIRE REVIEW OPERATIONS ==========

export async function createQuestionnaireReview(review: InsertPatientQuestionnaireReview): Promise<PatientQuestionnaireReview> {
  const [created] = await db
    .insert(patientQuestionnaireReviews)
    .values(review)
    .returning();
  
  await db
    .update(patientQuestionnaireResponses)
    .set({ status: 'reviewed', updatedAt: new Date() })
    .where(eq(patientQuestionnaireResponses.id, review.responseId));
  
  const response = await getQuestionnaireResponse(review.responseId);
  if (response) {
    await db
      .update(patientQuestionnaireLinks)
      .set({ status: 'reviewed', reviewedAt: new Date() })
      .where(eq(patientQuestionnaireLinks.id, response.linkId));
  }
  
  return created;
}

export async function getQuestionnaireReview(responseId: string): Promise<PatientQuestionnaireReview | undefined> {
  const [review] = await db
    .select()
    .from(patientQuestionnaireReviews)
    .where(eq(patientQuestionnaireReviews.responseId, responseId));
  return review;
}

export async function updateQuestionnaireReview(id: string, updates: Partial<PatientQuestionnaireReview>): Promise<PatientQuestionnaireReview> {
  const [updated] = await db
    .update(patientQuestionnaireReviews)
    .set(updates)
    .where(eq(patientQuestionnaireReviews.id, id))
    .returning();
  return updated;
}

// ========== PATIENT DOCUMENT OPERATIONS (Staff uploads) ==========

export async function getPatientDocuments(patientId: string): Promise<PatientDocument[]> {
  return await db
    .select()
    .from(patientDocuments)
    .where(eq(patientDocuments.patientId, patientId))
    .orderBy(desc(patientDocuments.createdAt));
}

export async function getPatientDocument(id: string): Promise<PatientDocument | undefined> {
  const [doc] = await db
    .select()
    .from(patientDocuments)
    .where(eq(patientDocuments.id, id));
  return doc;
}

export async function createPatientDocument(doc: InsertPatientDocument): Promise<PatientDocument> {
  const [created] = await db
    .insert(patientDocuments)
    .values(doc)
    .returning();
  return created;
}

export async function updatePatientDocument(id: string, updates: Partial<PatientDocument>): Promise<PatientDocument> {
  const [updated] = await db
    .update(patientDocuments)
    .set(updates)
    .where(eq(patientDocuments.id, id))
    .returning();
  return updated;
}

export async function deletePatientDocument(id: string): Promise<void> {
  await db
    .delete(patientDocuments)
    .where(eq(patientDocuments.id, id));
}

// ========== PATIENT MESSAGE OPERATIONS ==========

export async function getPatientMessages(patientId: string, hospitalId: string): Promise<PatientMessage[]> {
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

export async function createPatientMessage(message: InsertPatientMessage): Promise<PatientMessage> {
  const [created] = await db
    .insert(patientMessages)
    .values(message)
    .returning();
  return created;
}

// ========== PERSONAL TODO OPERATIONS ==========

export async function getPersonalTodos(userId: string, hospitalId: string): Promise<PersonalTodo[]> {
  return await db
    .select()
    .from(personalTodos)
    .where(and(
      eq(personalTodos.userId, userId),
      eq(personalTodos.hospitalId, hospitalId)
    ))
    .orderBy(asc(personalTodos.status), asc(personalTodos.position), desc(personalTodos.createdAt));
}

export async function getPersonalTodo(id: string): Promise<PersonalTodo | undefined> {
  const [todo] = await db
    .select()
    .from(personalTodos)
    .where(eq(personalTodos.id, id));
  return todo;
}

export async function createPersonalTodo(todo: InsertPersonalTodo): Promise<PersonalTodo> {
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

export async function updatePersonalTodo(id: string, updates: Partial<PersonalTodo>): Promise<PersonalTodo> {
  const [updated] = await db
    .update(personalTodos)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(personalTodos.id, id))
    .returning();
  return updated;
}

export async function deletePersonalTodo(id: string): Promise<void> {
  await db
    .delete(personalTodos)
    .where(eq(personalTodos.id, id));
}

export async function reorderPersonalTodos(todoIds: string[], status: string): Promise<void> {
  for (let i = 0; i < todoIds.length; i++) {
    await db
      .update(personalTodos)
      .set({ position: i, status: status as any, updatedAt: new Date() })
      .where(eq(personalTodos.id, todoIds[i]));
  }
}
