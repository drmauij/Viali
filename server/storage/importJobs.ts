import { db } from "../db";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  importJobs,
  supplierCatalogs,
  priceSyncJobs,
  type ImportJob,
  type SupplierCatalog,
  type PriceSyncJob,
} from "@shared/schema";
import { encryptCredential, decryptCredential } from "../utils/encryption";

export async function createImportJob(job: Omit<ImportJob, 'id' | 'createdAt' | 'startedAt' | 'completedAt'>): Promise<ImportJob> {
  const [created] = await db.insert(importJobs).values(job).returning();
  return created;
}

export async function getImportJob(id: string): Promise<ImportJob | undefined> {
  const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id));
  return job;
}

export async function getImportJobs(hospitalId: string, userId?: string, status?: string): Promise<ImportJob[]> {
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

export async function getNextQueuedJob(): Promise<ImportJob | undefined> {
  const [job] = await db
    .select()
    .from(importJobs)
    .where(eq(importJobs.status, 'queued'))
    .orderBy(asc(importJobs.createdAt))
    .limit(1);
  
  return job;
}

export async function getStuckJobs(thresholdMinutes: number = 30): Promise<ImportJob[]> {
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

export async function updateImportJob(id: string, updates: Partial<ImportJob>): Promise<ImportJob> {
  const [updated] = await db
    .update(importJobs)
    .set(updates)
    .where(eq(importJobs.id, id))
    .returning();
  return updated;
}

export async function createSupplierCatalog(catalog: Partial<SupplierCatalog> & { apiPassword?: string }): Promise<SupplierCatalog> {
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

export async function getSupplierCatalogs(hospitalId: string): Promise<SupplierCatalog[]> {
  const catalogs = await db
    .select()
    .from(supplierCatalogs)
    .where(eq(supplierCatalogs.hospitalId, hospitalId))
    .orderBy(asc(supplierCatalogs.supplierName));
  // Mask encrypted passwords - return '***' if password exists, null otherwise
  return catalogs.map(c => ({ ...c, apiPasswordEncrypted: c.apiPasswordEncrypted ? '***' : null }));
}

export async function getSupplierCatalog(id: string): Promise<SupplierCatalog | undefined> {
  const [catalog] = await db.select().from(supplierCatalogs).where(eq(supplierCatalogs.id, id));
  if (!catalog) return undefined;
  // Mask encrypted password for frontend
  return { ...catalog, apiPasswordEncrypted: catalog.apiPasswordEncrypted ? '***' : null };
}

export async function getSupplierCatalogWithCredentials(id: string): Promise<(SupplierCatalog & { apiPassword: string | null }) | undefined> {
  const [catalog] = await db.select().from(supplierCatalogs).where(eq(supplierCatalogs.id, id));
  if (!catalog) return undefined;
  const apiPassword = catalog.apiPasswordEncrypted ? decryptCredential(catalog.apiPasswordEncrypted) : null;
  return { ...catalog, apiPassword };
}

export async function getSupplierCatalogByName(hospitalId: string, supplierName: string): Promise<SupplierCatalog | undefined> {
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

export async function getGalexisCatalogWithCredentials(hospitalId: string): Promise<(SupplierCatalog & { apiPassword: string | null }) | undefined> {
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

export async function updateSupplierCatalog(id: string, updates: Partial<SupplierCatalog> & { apiPassword?: string }): Promise<SupplierCatalog> {
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

export async function deleteSupplierCatalog(id: string): Promise<void> {
  await db.delete(priceSyncJobs).where(eq(priceSyncJobs.catalogId, id));
  await db.delete(supplierCatalogs).where(eq(supplierCatalogs.id, id));
}

export async function createPriceSyncJob(job: Partial<PriceSyncJob>): Promise<PriceSyncJob> {
  const [created] = await db.insert(priceSyncJobs).values(job as any).returning();
  return created;
}

export async function getPriceSyncJob(id: string): Promise<PriceSyncJob | undefined> {
  const [job] = await db.select().from(priceSyncJobs).where(eq(priceSyncJobs.id, id));
  return job;
}

export async function getPriceSyncJobs(hospitalId: string, limit: number = 20): Promise<PriceSyncJob[]> {
  return db
    .select()
    .from(priceSyncJobs)
    .where(eq(priceSyncJobs.hospitalId, hospitalId))
    .orderBy(desc(priceSyncJobs.createdAt))
    .limit(limit);
}

export async function getNextQueuedPriceSyncJob(): Promise<PriceSyncJob | undefined> {
  const [job] = await db
    .select()
    .from(priceSyncJobs)
    .where(eq(priceSyncJobs.status, 'queued'))
    .orderBy(asc(priceSyncJobs.createdAt))
    .limit(1);
  return job;
}

export async function updatePriceSyncJob(id: string, updates: Partial<PriceSyncJob>): Promise<PriceSyncJob> {
  const [updated] = await db
    .update(priceSyncJobs)
    .set(updates)
    .where(eq(priceSyncJobs.id, id))
    .returning();
  return updated;
}

export async function getLatestPriceSyncJob(catalogId: string): Promise<PriceSyncJob | undefined> {
  const [job] = await db
    .select()
    .from(priceSyncJobs)
    .where(eq(priceSyncJobs.catalogId, catalogId))
    .orderBy(desc(priceSyncJobs.createdAt))
    .limit(1);
  return job;
}
