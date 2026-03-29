import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  tardocCatalog,
  tardocServiceMappings,
  tardocInvoices,
  tardocInvoiceItems,
  tardocInvoiceTemplates,
  tardocInvoiceTemplateItems,
  tpwRates,
  ambulantePauschalenCatalog,
  tardocCumulationRules,
  clinicServices,
  patients,
  hospitals,
  users,
  surgeries,
  anesthesiaRecords,
} from "@shared/schema";
import { importTardocFromExcel, importTardocFromCsv, importCumulationRulesFromExcel } from "../scripts/importTardoc";
import { importApFromExcel } from "../scripts/importAmbulantePauschalen";
import { requireWriteAccess, requireStrictHospitalAccess, userHasPermission } from "../utils";
import { eq, and, or, sql, asc, desc, max, inArray } from "drizzle-orm";
import { z } from "zod";
import logger from "../logger";
import { generateXmlForInvoice } from "../services/tardocXmlGenerator";
import { generatePdfForInvoice } from "../services/tardocPdfGenerator";

const router = Router();

// ==================== TARDOC CATALOG ====================

// Search TARDOC catalog (public-ish — requires auth only)
router.get('/api/tardoc/search', isAuthenticated, async (req: any, res: Response) => {
  try {
    const search = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    if (!search || search.length < 2) {
      return res.json([]);
    }

    const results = await db
      .select({
        id: tardocCatalog.id,
        code: tardocCatalog.code,
        descriptionDe: tardocCatalog.descriptionDe,
        descriptionFr: tardocCatalog.descriptionFr,
        chapter: tardocCatalog.chapter,
        chapterDescription: tardocCatalog.chapterDescription,
        taxPoints: tardocCatalog.taxPoints,
        medicalInterpretation: tardocCatalog.medicalInterpretation,
        technicalInterpretation: tardocCatalog.technicalInterpretation,
        durationMinutes: tardocCatalog.durationMinutes,
        sideCode: tardocCatalog.sideCode,
        maxQuantityPerSession: tardocCatalog.maxQuantityPerSession,
        maxQuantityPerCase: tardocCatalog.maxQuantityPerCase,
      })
      .from(tardocCatalog)
      .where(
        or(
          sql`${tardocCatalog.code} ILIKE ${search + '%'}`,
          sql`${tardocCatalog.descriptionDe} ILIKE ${'%' + search + '%'}`,
          sql`to_tsvector('german', ${tardocCatalog.descriptionDe}) @@ plainto_tsquery('german', ${search})`
        )
      )
      .orderBy(
        sql`CASE
          WHEN ${tardocCatalog.code} ILIKE ${search + '%'} THEN 0
          WHEN ${tardocCatalog.descriptionDe} ILIKE ${search + '%'} THEN 1
          ELSE 2
        END`,
        asc(tardocCatalog.code)
      )
      .limit(limit);

    res.json(results);
  } catch (error: any) {
    logger.error("Error searching TARDOC catalog:", error);
    res.status(500).json({ message: "Failed to search TARDOC catalog" });
  }
});

// Import TARDOC catalog (admin only, file upload)
router.post('/api/admin/:hospitalId/import-tardoc', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;

    // Check if user is admin of this hospital
    const hasPermission = await userHasPermission(userId, req.params.hospitalId, 'canConfigure');
    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    // Expect base64 file content in body
    const { fileContent, fileName, version } = req.body;
    if (!fileContent) {
      return res.status(400).json({ message: "File content is required" });
    }

    // Default to 1.4c if no version specified
    const catalogVersion = version || '1.4c';

    const buffer = Buffer.from(fileContent, 'base64');

    // Count before import
    const [countBefore] = await db.select({ count: sql<number>`count(*)` }).from(tardocCatalog);
    const existingCount = Number(countBefore?.count || 0);

    let result;
    if (fileName?.endsWith('.csv')) {
      result = await importTardocFromCsv(buffer.toString('utf-8'), catalogVersion);
    } else {
      result = await importTardocFromExcel(buffer, catalogVersion);
    }

    logger.info(`[Admin] TARDOC import complete: ${result.imported} processed, ${result.skipped} skipped`);

    // Count after import
    const [countAfter] = await db.select({ count: sql<number>`count(*)` }).from(tardocCatalog);
    const finalCount = Number(countAfter?.count || 0);
    const newRecords = finalCount - existingCount;

    const message = existingCount > 0
      ? `TARDOC catalog updated (${newRecords} new, ${existingCount} updated)`
      : `Successfully imported ${result.imported} TARDOC positions`;

    res.json({
      success: true,
      message,
      imported: result.imported,
      skipped: result.skipped,
      newRecords,
      updated: existingCount > 0 ? existingCount : 0,
      version: result.version,
    });
  } catch (error: any) {
    logger.error("[Admin] TARDOC import error:", error);
    res.status(500).json({
      message: "Failed to import TARDOC catalog",
      error: error.message,
    });
  }
});

// Import TARDOC catalog directly from oaat-otma.ch (admin only)
router.post('/api/admin/:hospitalId/import-tardoc-remote', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const hasPermission = await userHasPermission(userId, req.params.hospitalId, 'canConfigure');
    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const version = req.body.version || '1.4c';
    const url = `https://oaat-otma.ch/fileadmin/redaktion/dokumente/DE/Gesamt-Tarifsystem/Vertraege_und_Anhaenge/Anhang_A2_Katalog_des_TARDOC_${version}.xlsx`;

    logger.info(`[Admin] Fetching TARDOC catalog from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download TARDOC catalog: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info(`[Admin] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    const [countBefore] = await db.select({ count: sql<number>`count(*)` }).from(tardocCatalog);
    const existingCount = Number(countBefore?.count || 0);

    const result = await importTardocFromExcel(buffer, version);

    const [countAfter] = await db.select({ count: sql<number>`count(*)` }).from(tardocCatalog);
    const finalCount = Number(countAfter?.count || 0);
    const newRecords = finalCount - existingCount;

    const message = existingCount > 0
      ? `TARDOC catalog updated (${newRecords} new, ${existingCount} updated)`
      : `Successfully imported ${result.imported} TARDOC positions`;

    res.json({
      success: true,
      message,
      imported: result.imported,
      skipped: result.skipped,
      newRecords,
      version: result.version,
    });
  } catch (error: any) {
    logger.error("[Admin] TARDOC remote import error:", error);
    res.status(500).json({
      message: "Failed to import TARDOC catalog from oaat-otma.ch",
      error: error.message,
    });
  }
});

// TARDOC catalog status — no auth needed, just a count query
router.get('/api/tardoc/catalog-status', async (req: any, res: Response) => {
  try {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(tardocCatalog);
    // Get the version from the latest imported entry
    const [versionResult] = await db.select({ version: tardocCatalog.version })
      .from(tardocCatalog)
      .limit(1);
    const response = {
      count: Number(result?.count || 0),
      version: versionResult?.version || null,
    };
    console.log('[DEBUG] TARDOC status response:', JSON.stringify(response));
    res.json(response);
  } catch (error: any) {
    console.log('[DEBUG] TARDOC status ERROR:', error.message);
    logger.error("Error getting TARDOC status:", error);
    res.status(500).json({ message: "Failed to get TARDOC status" });
  }
});

// ==================== AMBULANTE PAUSCHALEN CATALOG ====================

// Search AP catalog
router.get('/api/ambulante-pauschalen/search', isAuthenticated, async (req: any, res: Response) => {
  try {
    const search = (req.query.q as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    if (!search || search.length < 2) {
      return res.json([]);
    }

    const results = await db
      .select({
        id: ambulantePauschalenCatalog.id,
        code: ambulantePauschalenCatalog.code,
        descriptionDe: ambulantePauschalenCatalog.descriptionDe,
        descriptionFr: ambulantePauschalenCatalog.descriptionFr,
        category: ambulantePauschalenCatalog.category,
        basePrice: ambulantePauschalenCatalog.basePrice,
      })
      .from(ambulantePauschalenCatalog)
      .where(
        or(
          sql`${ambulantePauschalenCatalog.code} ILIKE ${search + '%'}`,
          sql`${ambulantePauschalenCatalog.descriptionDe} ILIKE ${'%' + search + '%'}`,
        )
      )
      .orderBy(
        sql`CASE
          WHEN ${ambulantePauschalenCatalog.code} ILIKE ${search + '%'} THEN 0
          ELSE 1
        END`,
        asc(ambulantePauschalenCatalog.code)
      )
      .limit(limit);

    res.json(results);
  } catch (error: any) {
    logger.error("Error searching AP catalog:", error);
    res.status(500).json({ message: "Failed to search AP catalog" });
  }
});

// Import AP catalog (admin only)
router.post('/api/admin/:hospitalId/import-ambulante-pauschalen', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const hasPermission = await userHasPermission(userId, req.params.hospitalId, 'canConfigure');
    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const { fileContent, version } = req.body;
    if (!fileContent) {
      return res.status(400).json({ message: "File content is required" });
    }

    const buffer = Buffer.from(fileContent, 'base64');
    const catalogVersion = version || '1.1c';

    const [countBefore] = await db.select({ count: sql<number>`count(*)` }).from(ambulantePauschalenCatalog);
    const existingCount = Number(countBefore?.count || 0);

    const result = await importApFromExcel(buffer, catalogVersion);

    const [countAfter] = await db.select({ count: sql<number>`count(*)` }).from(ambulantePauschalenCatalog);
    const finalCount = Number(countAfter?.count || 0);
    const newRecords = finalCount - existingCount;

    const message = existingCount > 0
      ? `AP catalog updated (${newRecords} new, ${existingCount} updated)`
      : `Successfully imported ${result.imported} Ambulante Pauschalen`;

    res.json({
      success: true,
      message,
      imported: result.imported,
      skipped: result.skipped,
      newRecords,
      version: result.version,
    });
  } catch (error: any) {
    logger.error("[Admin] AP import error:", error);
    res.status(500).json({
      message: "Failed to import AP catalog",
      error: error.message,
    });
  }
});

// Import AP catalog directly from oaat-otma.ch (admin only)
router.post('/api/admin/:hospitalId/import-ap-remote', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const hasPermission = await userHasPermission(userId, req.params.hospitalId, 'canConfigure');
    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const version = req.body.version || '1.1c';
    const url = `https://oaat-otma.ch/fileadmin/redaktion/dokumente/DE/Gesamt-Tarifsystem/Vertraege_und_Anhaenge/Anhang_A1_Katalog_der_Ambulanten_Pauschalen_v${version}.xlsx`;

    logger.info(`[Admin] Fetching AP catalog from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download AP catalog: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    logger.info(`[Admin] Downloaded ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);

    const [countBefore] = await db.select({ count: sql<number>`count(*)` }).from(ambulantePauschalenCatalog);
    const existingCount = Number(countBefore?.count || 0);

    const result = await importApFromExcel(buffer, version);

    const [countAfter] = await db.select({ count: sql<number>`count(*)` }).from(ambulantePauschalenCatalog);
    const finalCount = Number(countAfter?.count || 0);
    const newRecords = finalCount - existingCount;

    const message = existingCount > 0
      ? `AP catalog updated (${newRecords} new, ${existingCount} updated)`
      : `Successfully imported ${result.imported} Ambulante Pauschalen`;

    res.json({
      success: true,
      message,
      imported: result.imported,
      skipped: result.skipped,
      newRecords,
      version: result.version,
    });
  } catch (error: any) {
    logger.error("[Admin] AP remote import error:", error);
    res.status(500).json({
      message: "Failed to import AP catalog from oaat-otma.ch",
      error: error.message,
    });
  }
});

// AP catalog status
router.get('/api/tardoc/ap-catalog-status', async (req: any, res: Response) => {
  try {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(ambulantePauschalenCatalog);
    const [versionResult] = await db.select({ version: ambulantePauschalenCatalog.version })
      .from(ambulantePauschalenCatalog)
      .limit(1);
    res.json({
      count: Number(result?.count || 0),
      version: versionResult?.version || null,
    });
  } catch (error: any) {
    logger.error("Error getting AP status:", error);
    res.status(500).json({ message: "Failed to get AP status" });
  }
});

// Import cumulation/exclusion rules (admin only)
router.post('/api/admin/:hospitalId/import-cumulation-rules', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const hasPermission = await userHasPermission(userId, req.params.hospitalId, 'canConfigure');
    if (!hasPermission) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    const { fileContent, version } = req.body;
    if (!fileContent) {
      return res.status(400).json({ message: "File content is required" });
    }

    const buffer = Buffer.from(fileContent, 'base64');
    const result = await importCumulationRulesFromExcel(buffer, version || '1.4c');

    res.json({
      success: true,
      message: `Imported ${result.imported} cumulation/exclusion rules`,
      imported: result.imported,
      skipped: result.skipped,
    });
  } catch (error: any) {
    logger.error("[Admin] Cumulation rules import error:", error);
    res.status(500).json({ message: "Failed to import rules", error: error.message });
  }
});

// Cumulation rules status
router.get('/api/tardoc/cumulation-rules-status', async (req: any, res: Response) => {
  try {
    const [result] = await db.select({ count: sql<number>`count(*)` }).from(tardocCumulationRules);
    res.json({ count: Number(result?.count || 0) });
  } catch (error: any) {
    logger.error("Error getting cumulation rules status:", error);
    res.status(500).json({ message: "Failed to get rules status" });
  }
});

// ==================== TARDOC SERVICE MAPPINGS ====================

// List mappings for a hospital
router.get('/api/clinic/:hospitalId/tardoc-mappings', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const mappings = await db
      .select({
        id: tardocServiceMappings.id,
        hospitalId: tardocServiceMappings.hospitalId,
        clinicServiceId: tardocServiceMappings.clinicServiceId,
        tardocCode: tardocServiceMappings.tardocCode,
        taxPoints: tardocServiceMappings.taxPoints,
        scalingFactor: tardocServiceMappings.scalingFactor,
        sideCode: tardocServiceMappings.sideCode,
        notes: tardocServiceMappings.notes,
        serviceName: clinicServices.name,
      })
      .from(tardocServiceMappings)
      .leftJoin(clinicServices, eq(tardocServiceMappings.clinicServiceId, clinicServices.id))
      .where(eq(tardocServiceMappings.hospitalId, hospitalId));

    res.json(mappings);
  } catch (error: any) {
    logger.error("Error listing TARDOC mappings:", error);
    res.status(500).json({ message: "Failed to list TARDOC mappings" });
  }
});

// Create a mapping
router.post('/api/clinic/:hospitalId/tardoc-mappings', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const schema = z.object({
      clinicServiceId: z.string(),
      tardocCode: z.string(),
      taxPoints: z.string().optional(),
      scalingFactor: z.string().optional(),
      sideCode: z.string().optional(),
      notes: z.string().optional(),
    });

    const data = schema.parse(req.body);

    const [mapping] = await db.insert(tardocServiceMappings).values({
      hospitalId,
      ...data,
    }).returning();

    res.status(201).json(mapping);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    // Unique constraint violation
    if (error.code === '23505') {
      return res.status(409).json({ message: "This TARDOC code is already mapped to this service" });
    }
    logger.error("Error creating TARDOC mapping:", error);
    res.status(500).json({ message: "Failed to create TARDOC mapping" });
  }
});

// Delete a mapping
router.delete('/api/clinic/:hospitalId/tardoc-mappings/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, id } = req.params;

    await db.delete(tardocServiceMappings).where(
      and(
        eq(tardocServiceMappings.id, id),
        eq(tardocServiceMappings.hospitalId, hospitalId)
      )
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting TARDOC mapping:", error);
    res.status(500).json({ message: "Failed to delete TARDOC mapping" });
  }
});

// ==================== TARDOC INVOICE TEMPLATES ====================

// List templates with items
router.get('/api/clinic/:hospitalId/tardoc-templates', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const templates = await db
      .select()
      .from(tardocInvoiceTemplates)
      .where(eq(tardocInvoiceTemplates.hospitalId, hospitalId))
      .orderBy(desc(tardocInvoiceTemplates.isDefault), asc(tardocInvoiceTemplates.name));

    if (templates.length === 0) {
      return res.json([]);
    }

    // Batch-fetch all items for these templates (avoid N+1)
    const templateIds = templates.map(t => t.id);
    const allItems = await db
      .select()
      .from(tardocInvoiceTemplateItems)
      .where(inArray(tardocInvoiceTemplateItems.templateId, templateIds))
      .orderBy(asc(tardocInvoiceTemplateItems.sortOrder));

    // Group items by templateId
    const itemsByTemplate = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByTemplate.get(item.templateId) || [];
      list.push(item);
      itemsByTemplate.set(item.templateId, list);
    }

    const result = templates.map(t => ({
      ...t,
      items: itemsByTemplate.get(t.id) || [],
    }));

    res.json(result);
  } catch (error: any) {
    logger.error("Error listing TARDOC templates:", error);
    res.status(500).json({ message: "Failed to list TARDOC templates" });
  }
});

const createTemplateSchema = z.object({
  name: z.string().min(1),
  billingModel: z.enum(["TG", "TP"]).optional(),
  lawType: z.enum(["KVG", "UVG", "IVG", "MVG", "VVG"]).optional(),
  treatmentType: z.string().optional(),
  treatmentReason: z.string().optional(),
  isDefault: z.boolean().optional(),
  items: z.array(z.object({
    tardocCode: z.string(),
    description: z.string(),
    taxPoints: z.string().optional(),
    scalingFactor: z.string().optional(),
    sideCode: z.string().optional(),
    quantity: z.number().default(1),
  })).default([]),
});

// Create template with items
router.post('/api/clinic/:hospitalId/tardoc-templates', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const data = createTemplateSchema.parse(req.body);

    const { items, ...templateData } = data;

    // If setting as default, unset other defaults for this hospital
    if (templateData.isDefault) {
      await db
        .update(tardocInvoiceTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(tardocInvoiceTemplates.hospitalId, hospitalId),
          eq(tardocInvoiceTemplates.isDefault, true)
        ));
    }

    const [template] = await db.insert(tardocInvoiceTemplates).values({
      hospitalId,
      ...templateData,
    }).returning();

    // Insert items with sortOrder
    let insertedItems: (typeof tardocInvoiceTemplateItems.$inferSelect)[] = [];
    if (items.length > 0) {
      insertedItems = await db.insert(tardocInvoiceTemplateItems).values(
        items.map((item, idx) => ({
          templateId: template.id,
          tardocCode: item.tardocCode,
          description: item.description,
          taxPoints: item.taxPoints,
          scalingFactor: item.scalingFactor,
          sideCode: item.sideCode,
          quantity: item.quantity,
          sortOrder: idx,
        }))
      ).returning();
    }

    res.status(201).json({ ...template, items: insertedItems });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating TARDOC template:", error);
    res.status(500).json({ message: "Failed to create TARDOC template" });
  }
});

// Update template
router.patch('/api/clinic/:hospitalId/tardoc-templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, id } = req.params;

    const [existing] = await db
      .select()
      .from(tardocInvoiceTemplates)
      .where(and(
        eq(tardocInvoiceTemplates.id, id),
        eq(tardocInvoiceTemplates.hospitalId, hospitalId)
      ));

    if (!existing) {
      return res.status(404).json({ message: "Template not found" });
    }

    const { items, ...updateData } = req.body;

    // If setting as default, unset other defaults for this hospital
    if (updateData.isDefault) {
      await db
        .update(tardocInvoiceTemplates)
        .set({ isDefault: false })
        .where(and(
          eq(tardocInvoiceTemplates.hospitalId, hospitalId),
          eq(tardocInvoiceTemplates.isDefault, true)
        ));
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(tardocInvoiceTemplates)
      .set(updateData)
      .where(eq(tardocInvoiceTemplates.id, id))
      .returning();

    // If items provided, replace all existing items
    let templateItems: (typeof tardocInvoiceTemplateItems.$inferSelect)[];
    if (items && Array.isArray(items)) {
      await db.delete(tardocInvoiceTemplateItems)
        .where(eq(tardocInvoiceTemplateItems.templateId, id));

      if (items.length > 0) {
        templateItems = await db.insert(tardocInvoiceTemplateItems).values(
          items.map((item: any, idx: number) => ({
            templateId: id,
            tardocCode: item.tardocCode,
            description: item.description,
            taxPoints: item.taxPoints,
            scalingFactor: item.scalingFactor,
            sideCode: item.sideCode,
            quantity: item.quantity || 1,
            sortOrder: idx,
          }))
        ).returning();
      } else {
        templateItems = [];
      }
    } else {
      // Fetch existing items
      templateItems = await db
        .select()
        .from(tardocInvoiceTemplateItems)
        .where(eq(tardocInvoiceTemplateItems.templateId, id))
        .orderBy(asc(tardocInvoiceTemplateItems.sortOrder));
    }

    res.json({ ...updated, items: templateItems });
  } catch (error: any) {
    logger.error("Error updating TARDOC template:", error);
    res.status(500).json({ message: "Failed to update TARDOC template" });
  }
});

// Delete template (items cascade-delete via FK)
router.delete('/api/clinic/:hospitalId/tardoc-templates/:id', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, id } = req.params;

    await db.delete(tardocInvoiceTemplates).where(
      and(
        eq(tardocInvoiceTemplates.id, id),
        eq(tardocInvoiceTemplates.hospitalId, hospitalId)
      )
    );

    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting TARDOC template:", error);
    res.status(500).json({ message: "Failed to delete TARDOC template" });
  }
});

// ==================== SURGERY PREFILL & ELIGIBLE SURGERIES ====================

// Pre-fill invoice data from a surgery
router.get('/api/clinic/:hospitalId/tardoc-prefill/:surgeryId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, surgeryId } = req.params;

    // Fetch surgery
    const [surgery] = await db
      .select()
      .from(surgeries)
      .where(and(
        eq(surgeries.id, surgeryId),
        eq(surgeries.hospitalId, hospitalId)
      ));

    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const warnings: string[] = [];

    // Fetch patient (if linked)
    let patient: typeof patients.$inferSelect | null = null;
    if (surgery.patientId) {
      const [p] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, surgery.patientId));
      patient = p || null;
    } else {
      warnings.push("No patient linked to this surgery");
    }

    // Fetch hospital billing info
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId));

    // Fetch surgeon
    let surgeon: typeof users.$inferSelect | null = null;
    if (surgery.surgeonId) {
      const [s] = await db
        .select()
        .from(users)
        .where(eq(users.id, surgery.surgeonId));
      surgeon = s || null;
    }

    // Fetch anesthesia record
    const [anesthesiaRecord] = await db
      .select()
      .from(anesthesiaRecords)
      .where(eq(anesthesiaRecords.surgeryId, surgeryId));

    // Fetch anesthesiologist (if anesthesia record exists)
    let anesthesiologist: typeof users.$inferSelect | null = null;
    if (anesthesiaRecord?.providerId) {
      const [a] = await db
        .select()
        .from(users)
        .where(eq(users.id, anesthesiaRecord.providerId));
      anesthesiologist = a || null;
    }

    // Check for existing invoice
    const [existingInvoice] = await db
      .select({
        id: tardocInvoices.id,
        status: tardocInvoices.status,
      })
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.surgeryId, surgeryId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    // Build warnings for missing critical data
    if (patient) {
      if (!patient.healthInsuranceNumber) warnings.push("Patient has no AHV number");
      if (!patient.insurerGln) warnings.push("Patient has no insurer GLN");
      if (!patient.insuranceNumber) warnings.push("Patient has no insurance number");
    }

    if (!hospital?.companyGln) warnings.push("Hospital has no GLN");
    if (!hospital?.companyZsr) warnings.push("Hospital has no ZSR number");
    if (!hospital?.defaultTpValue) warnings.push("Hospital has no default TP value");
    if (!hospital?.companyBankIban) warnings.push("Hospital has no bank IBAN");

    if (surgeon && !surgeon.gln) warnings.push("Surgeon has no GLN");

    // Format dates as YYYY-MM-DD
    const formatDate = (d: Date | null | undefined): string => {
      if (!d) return "";
      return d.toISOString().split("T")[0];
    };

    const caseDate = formatDate(surgery.plannedDate);
    const caseDateEnd = formatDate(surgery.actualEndTime || surgery.plannedDate);

    const surgeonName = surgeon
      ? [surgeon.firstName, surgeon.lastName].filter(Boolean).join(" ")
      : surgery.surgeon || "";

    const anesthesiologistName = anesthesiologist
      ? [anesthesiologist.firstName, anesthesiologist.lastName].filter(Boolean).join(" ")
      : "";

    res.json({
      surgeryId: surgery.id,
      patientId: surgery.patientId || null,
      surgeryDescription: surgery.plannedSurgery || "",
      chopCode: surgery.chopCode || "",
      surgerySide: surgery.surgerySide || "",

      patientSurname: patient?.surname || "",
      patientFirstName: patient?.firstName || "",
      patientBirthday: patient?.birthday || "",
      patientSex: patient?.sex || "",
      patientStreet: patient?.street || "",
      patientPostalCode: patient?.postalCode || "",
      patientCity: patient?.city || "",

      ahvNumber: patient?.healthInsuranceNumber || "",
      insurerGln: patient?.insurerGln || "",
      insurerName: patient?.insuranceProvider || "",
      insuranceNumber: patient?.insuranceNumber || "",

      caseDate,
      caseDateEnd,

      billerGln: hospital?.companyGln || "",
      billerZsr: hospital?.companyZsr || "",
      tpValue: hospital?.defaultTpValue ? String(hospital.defaultTpValue) : "",

      providerGln: surgeon?.gln || "",
      providerZsr: surgeon?.zsrNumber || "",
      surgeonName,

      anesthesiaType: anesthesiaRecord?.anesthesiaType || "",
      anesthesiaStartTime: anesthesiaRecord?.anesthesiaStartTime?.toISOString() || "",
      anesthesiaEndTime: anesthesiaRecord?.anesthesiaEndTime?.toISOString() || "",
      anesthesiologistGln: anesthesiologist?.gln || "",
      anesthesiologistName,
      physicalStatus: anesthesiaRecord?.physicalStatus || "",
      emergencyCase: anesthesiaRecord?.emergencyCase || false,

      treatmentType: "ambulatory",
      treatmentCanton: "",

      existingInvoice: existingInvoice || null,
      warnings,
    });
  } catch (error: any) {
    logger.error("Error fetching surgery prefill data:", error);
    res.status(500).json({ message: "Failed to fetch surgery prefill data" });
  }
});

// List surgeries eligible for invoicing
router.get('/api/clinic/:hospitalId/tardoc-eligible-surgeries', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const search = ((req.query.q as string) || "").trim();

    // A surgery is "completed" when its anesthesia record has an O2 (Surgical Suture) time set
    const conditions = [
      eq(surgeries.hospitalId, hospitalId),
      sql`${surgeries.patientId} IS NOT NULL`,
      eq(surgeries.isArchived, false),
      sql`EXISTS (
        SELECT 1 FROM anesthesia_records ar
        WHERE ar.surgery_id = ${surgeries.id}
        AND ar.time_markers IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(ar.time_markers) elem
          WHERE elem->>'code' = 'O2'
          AND elem->>'time' IS NOT NULL
          AND (elem->>'time')::bigint > 0
        )
      )`,
    ];

    if (search) {
      conditions.push(
        sql`(
          ${patients.surname} ILIKE ${'%' + search + '%'}
          OR ${patients.firstName} ILIKE ${'%' + search + '%'}
          OR ${surgeries.plannedSurgery} ILIKE ${'%' + search + '%'}
          OR ${surgeries.chopCode} ILIKE ${'%' + search + '%'}
        )`
      );
    }

    const results = await db
      .select({
        id: surgeries.id,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        chopCode: surgeries.chopCode,
        surgerySide: surgeries.surgerySide,
        status: surgeries.status,
        patientId: surgeries.patientId,
        patientSurname: patients.surname,
        patientFirstName: patients.firstName,
        patientBirthday: patients.birthday,
        surgeon: surgeries.surgeon,
        hasInvoice: sql<boolean>`EXISTS (
          SELECT 1 FROM tardoc_invoices ti
          WHERE ti.surgery_id = ${surgeries.id}
          AND ti.status != 'cancelled'
        )`.as("has_invoice"),
      })
      .from(surgeries)
      .innerJoin(patients, eq(surgeries.patientId, patients.id))
      .where(and(...conditions))
      .orderBy(desc(surgeries.plannedDate))
      .limit(50);

    res.json(results);
  } catch (error: any) {
    logger.error("Error listing eligible surgeries:", error);
    res.status(500).json({ message: "Failed to list eligible surgeries" });
  }
});

// ==================== TARDOC INVOICES ====================

const createTardocInvoiceSchema = z.object({
  patientId: z.string().optional(),
  surgeryId: z.string().optional(),
  tariffSystem: z.string().default("tardoc"),
  billingModel: z.enum(["TG", "TP"]),
  treatmentType: z.string().default("ambulatory"),
  treatmentReason: z.string().default("disease"),
  lawType: z.enum(["KVG", "UVG", "IVG", "MVG", "VVG"]),
  caseNumber: z.string().optional(),
  caseDate: z.string().optional(),
  caseDateEnd: z.string().optional(),
  treatmentCanton: z.string().optional(),
  billerGln: z.string().optional(),
  billerZsr: z.string().optional(),
  providerGln: z.string().optional(),
  providerZsr: z.string().optional(),
  referringPhysicianGln: z.string().optional(),
  insurerGln: z.string().optional(),
  insurerName: z.string().optional(),
  insuranceNumber: z.string().optional(),
  ahvNumber: z.string().optional(),
  patientSurname: z.string().optional(),
  patientFirstName: z.string().optional(),
  patientBirthday: z.string().optional(),
  patientSex: z.enum(["M", "F", "O"]).optional(),
  patientStreet: z.string().optional(),
  patientPostalCode: z.string().optional(),
  patientCity: z.string().optional(),
  tpValue: z.string().optional(),
  items: z.array(z.object({
    tariffType: z.string().default("590"),
    tardocCode: z.string(),
    description: z.string(),
    treatmentDate: z.string(),
    session: z.number().optional(),
    quantity: z.number().default(1),
    taxPoints: z.string(),
    tpValue: z.string(),
    scalingFactor: z.string().optional(),
    sideCode: z.string().optional(),
    providerGln: z.string().optional(),
    amountAl: z.string().optional(),
    amountTl: z.string().optional(),
    amountChf: z.string(),
    vatRate: z.string().optional(),
    vatAmount: z.string().optional(),
  })).min(1),
});

// List invoices
router.get('/api/clinic/:hospitalId/tardoc-invoices', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;

    const invoices = await db
      .select()
      .from(tardocInvoices)
      .where(eq(tardocInvoices.hospitalId, hospitalId))
      .orderBy(desc(tardocInvoices.createdAt));

    res.json(invoices);
  } catch (error: any) {
    logger.error("Error listing TARDOC invoices:", error);
    res.status(500).json({ message: "Failed to list TARDOC invoices" });
  }
});

// Get single invoice with items
router.get('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;

    const [invoice] = await db
      .select()
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.id, invoiceId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const items = await db
      .select()
      .from(tardocInvoiceItems)
      .where(eq(tardocInvoiceItems.invoiceId, invoiceId))
      .orderBy(asc(tardocInvoiceItems.sortOrder));

    res.json({ ...invoice, items });
  } catch (error: any) {
    logger.error("Error getting TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to get TARDOC invoice" });
  }
});

// Create invoice
router.post('/api/clinic/:hospitalId/tardoc-invoices', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const data = createTardocInvoiceSchema.parse(req.body);

    // Auto-increment invoice number per hospital
    const [maxResult] = await db
      .select({ maxNum: max(tardocInvoices.invoiceNumber) })
      .from(tardocInvoices)
      .where(eq(tardocInvoices.hospitalId, hospitalId));

    const nextNumber = (maxResult?.maxNum || 0) + 1;

    // Calculate totals from items
    let subtotalTp = 0;
    let subtotalChf = 0;
    let vatAmount = 0;

    for (const item of data.items) {
      subtotalTp += parseFloat(item.taxPoints) * item.quantity * parseFloat(item.scalingFactor || '1');
      subtotalChf += parseFloat(item.amountChf);
      vatAmount += parseFloat(item.vatAmount || '0');
    }

    const totalChf = subtotalChf + vatAmount;

    const { items, ...invoiceData } = data;

    const [invoice] = await db.insert(tardocInvoices).values({
      hospitalId,
      invoiceNumber: nextNumber,
      ...invoiceData,
      subtotalTp: String(subtotalTp.toFixed(2)),
      subtotalChf: String(subtotalChf.toFixed(2)),
      vatAmount: String(vatAmount.toFixed(2)),
      totalChf: String(totalChf.toFixed(2)),
      createdBy: req.user.id,
    }).returning();

    // Insert items
    if (items.length > 0) {
      await db.insert(tardocInvoiceItems).values(
        items.map((item, idx) => ({
          invoiceId: invoice.id,
          ...item,
          sortOrder: idx,
        }))
      );
    }

    // Fetch back with items
    const invoiceItems = await db
      .select()
      .from(tardocInvoiceItems)
      .where(eq(tardocInvoiceItems.invoiceId, invoice.id))
      .orderBy(asc(tardocInvoiceItems.sortOrder));

    res.status(201).json({ ...invoice, items: invoiceItems });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to create TARDOC invoice" });
  }
});

// Update invoice
router.patch('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;

    // Verify invoice exists and belongs to this hospital
    const [existing] = await db
      .select()
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.id, invoiceId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ message: "Only draft invoices can be edited" });
    }

    const { items, ...updateData } = req.body;

    // If items are provided, recalculate totals
    if (items && Array.isArray(items)) {
      let subtotalTp = 0;
      let subtotalChf = 0;
      let vatAmount = 0;

      for (const item of items) {
        subtotalTp += parseFloat(item.taxPoints) * (item.quantity || 1) * parseFloat(item.scalingFactor || '1');
        subtotalChf += parseFloat(item.amountChf);
        vatAmount += parseFloat(item.vatAmount || '0');
      }

      updateData.subtotalTp = String(subtotalTp.toFixed(2));
      updateData.subtotalChf = String(subtotalChf.toFixed(2));
      updateData.vatAmount = String(vatAmount.toFixed(2));
      updateData.totalChf = String((subtotalChf + vatAmount).toFixed(2));

      // Replace items: delete existing and insert new
      await db.delete(tardocInvoiceItems).where(eq(tardocInvoiceItems.invoiceId, invoiceId));
      if (items.length > 0) {
        await db.insert(tardocInvoiceItems).values(
          items.map((item: any, idx: number) => ({
            invoiceId,
            tariffType: item.tariffType || '590',
            tardocCode: item.tardocCode,
            description: item.description,
            treatmentDate: item.treatmentDate,
            session: item.session,
            quantity: item.quantity || 1,
            taxPoints: item.taxPoints,
            tpValue: item.tpValue,
            scalingFactor: item.scalingFactor,
            sideCode: item.sideCode,
            providerGln: item.providerGln,
            amountAl: item.amountAl,
            amountTl: item.amountTl,
            amountChf: item.amountChf,
            vatRate: item.vatRate,
            vatAmount: item.vatAmount,
            sortOrder: idx,
          }))
        );
      }
    }

    updateData.updatedAt = new Date();

    const [updated] = await db
      .update(tardocInvoices)
      .set(updateData)
      .where(eq(tardocInvoices.id, invoiceId))
      .returning();

    // Fetch items
    const updatedItems = await db
      .select()
      .from(tardocInvoiceItems)
      .where(eq(tardocInvoiceItems.invoiceId, invoiceId))
      .orderBy(asc(tardocInvoiceItems.sortOrder));

    res.json({ ...updated, items: updatedItems });
  } catch (error: any) {
    logger.error("Error updating TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to update TARDOC invoice" });
  }
});

// Delete invoice
router.delete('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;

    const [existing] = await db
      .select()
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.id, invoiceId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    if (existing.status !== 'draft') {
      return res.status(400).json({ message: "Only draft invoices can be deleted" });
    }

    // Items cascade-delete via FK
    await db.delete(tardocInvoices).where(eq(tardocInvoices.id, invoiceId));

    res.status(204).send();
  } catch (error: any) {
    logger.error("Error deleting TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to delete TARDOC invoice" });
  }
});

// Change invoice status
router.patch('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId/status', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { status } = z.object({
      status: z.enum(["draft", "validated", "exported", "sent", "paid", "rejected", "cancelled"]),
    }).parse(req.body);

    const [existing] = await db
      .select()
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.id, invoiceId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    if (!existing) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Status transition validation
    const validTransitions: Record<string, string[]> = {
      draft: ['validated', 'cancelled'],
      validated: ['exported', 'draft', 'cancelled'],
      exported: ['sent', 'validated', 'cancelled'],
      sent: ['paid', 'rejected', 'cancelled'],
      paid: [],
      rejected: ['draft'],
      cancelled: [],
    };

    const allowed = validTransitions[existing.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from "${existing.status}" to "${status}"`,
      });
    }

    const [updated] = await db
      .update(tardocInvoices)
      .set({ status, updatedAt: new Date() })
      .where(eq(tardocInvoices.id, invoiceId))
      .returning();

    res.json(updated);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating TARDOC invoice status:", error);
    res.status(500).json({ message: "Failed to update invoice status" });
  }
});

// ==================== VALIDATION ====================

router.post('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId/validate', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;

    const [invoice] = await db
      .select()
      .from(tardocInvoices)
      .where(and(
        eq(tardocInvoices.id, invoiceId),
        eq(tardocInvoices.hospitalId, hospitalId)
      ));

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const items = await db
      .select()
      .from(tardocInvoiceItems)
      .where(eq(tardocInvoiceItems.invoiceId, invoiceId));

    const errors: string[] = [];

    // Required fields
    if (!invoice.billerGln) errors.push("Biller GLN is required");
    if (!invoice.providerGln) errors.push("Provider GLN is required");
    if (!invoice.insurerGln) errors.push("Insurer GLN is required");
    if (!invoice.patientSurname) errors.push("Patient surname is required");
    if (!invoice.patientFirstName) errors.push("Patient first name is required");
    if (!invoice.patientBirthday) errors.push("Patient birthday is required");
    if (!invoice.caseDate) errors.push("Case date is required");
    if (!invoice.tpValue) errors.push("Tax point value is required");
    if (!invoice.lawType) errors.push("Law type is required");

    // GLN format validation (13 digits)
    const glnRegex = /^\d{13}$/;
    if (invoice.billerGln && !glnRegex.test(invoice.billerGln)) {
      errors.push("Biller GLN must be exactly 13 digits");
    }
    if (invoice.providerGln && !glnRegex.test(invoice.providerGln)) {
      errors.push("Provider GLN must be exactly 13 digits");
    }
    if (invoice.insurerGln && !glnRegex.test(invoice.insurerGln)) {
      errors.push("Insurer GLN must be exactly 13 digits");
    }

    // Service lines
    if (items.length === 0) {
      errors.push("At least one service line is required");
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.tardocCode) errors.push(`Line ${i + 1}: TARDOC code is required`);
      if (!item.treatmentDate) errors.push(`Line ${i + 1}: Treatment date is required`);
      if (!item.taxPoints) errors.push(`Line ${i + 1}: Tax points are required`);
      if (!item.tpValue) errors.push(`Line ${i + 1}: TP value is required`);
    }

    // TG requires bank details
    if (invoice.billingModel === 'TG') {
      const [hospital] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, hospitalId));

      if (!hospital?.companyBankIban) {
        errors.push("Tiers Garant requires bank IBAN (set in hospital settings)");
      }
    }

    // Advisory warnings (soft — cumulation/exclusion rules + quantity limits)
    const warnings: string[] = [];

    if (invoice.tariffSystem !== 'pauschale') {
      const codes = items.map(i => i.tardocCode);
      if (codes.length > 0) {
        // Check cumulation/exclusion rules
        const rules = await db.select().from(tardocCumulationRules)
          .where(inArray(tardocCumulationRules.code, codes));

        for (const rule of rules) {
          if (codes.includes(rule.relatedCode)) {
            const label = rule.ruleType === 'exclusion' ? 'Exclusion' : rule.ruleType === 'limitation' ? 'Limitation' : 'Cumulation';
            warnings.push(`${label}: ${rule.code} + ${rule.relatedCode}${rule.description ? ` — ${rule.description}` : ''}`);
          }
        }

        // Check quantity limits
        const catalogEntries = await db.select({
          code: tardocCatalog.code,
          maxQuantityPerSession: tardocCatalog.maxQuantityPerSession,
          maxQuantityPerCase: tardocCatalog.maxQuantityPerCase,
        }).from(tardocCatalog)
          .where(inArray(tardocCatalog.code, codes));

        const catalogMap = new Map(catalogEntries.map(c => [c.code, c]));

        for (const item of items) {
          const cat = catalogMap.get(item.tardocCode);
          if (cat?.maxQuantityPerSession && item.quantity > cat.maxQuantityPerSession) {
            warnings.push(`Quantity limit: ${item.tardocCode} — max ${cat.maxQuantityPerSession}/session, used ${item.quantity}`);
          }
          if (cat?.maxQuantityPerCase) {
            // Sum total quantity for this code across all items
            const totalQty = items.filter(i => i.tardocCode === item.tardocCode).reduce((sum, i) => sum + i.quantity, 0);
            if (totalQty > cat.maxQuantityPerCase) {
              warnings.push(`Quantity limit: ${item.tardocCode} — max ${cat.maxQuantityPerCase}/case, total used ${totalQty}`);
            }
          }
        }
      }
    }

    if (errors.length > 0) {
      return res.json({ valid: false, errors, warnings });
    }

    // Mark as validated if currently draft
    if (invoice.status === 'draft') {
      await db
        .update(tardocInvoices)
        .set({ status: 'validated', updatedAt: new Date() })
        .where(eq(tardocInvoices.id, invoiceId));
    }

    res.json({ valid: true, errors: [], warnings });
  } catch (error: any) {
    logger.error("Error validating TARDOC invoice:", error);
    res.status(500).json({ message: "Failed to validate invoice" });
  }
});

// Check cumulation rules for a set of codes (real-time advisory)
router.post('/api/tardoc/check-rules', isAuthenticated, async (req: any, res: Response) => {
  try {
    const { codes } = req.body;
    if (!codes || !Array.isArray(codes) || codes.length === 0) {
      return res.json({ warnings: [] });
    }

    const warnings: string[] = [];

    // Check cumulation/exclusion rules
    const rules = await db.select().from(tardocCumulationRules)
      .where(inArray(tardocCumulationRules.code, codes));

    for (const rule of rules) {
      if (codes.includes(rule.relatedCode)) {
        const label = rule.ruleType === 'exclusion' ? 'Exclusion' : rule.ruleType === 'limitation' ? 'Limitation' : 'Cumulation';
        warnings.push(`${label}: ${rule.code} + ${rule.relatedCode}${rule.description ? ` — ${rule.description}` : ''}`);
      }
    }

    // Check quantity limits
    const catalogEntries = await db.select({
      code: tardocCatalog.code,
      maxQuantityPerSession: tardocCatalog.maxQuantityPerSession,
      maxQuantityPerCase: tardocCatalog.maxQuantityPerCase,
    }).from(tardocCatalog)
      .where(inArray(tardocCatalog.code, codes));

    // Return limit info for frontend to validate against quantities
    const limits = catalogEntries
      .filter(c => c.maxQuantityPerSession || c.maxQuantityPerCase)
      .map(c => ({
        code: c.code,
        maxPerSession: c.maxQuantityPerSession,
        maxPerCase: c.maxQuantityPerCase,
      }));

    res.json({ warnings, limits });
  } catch (error: any) {
    logger.error("Error checking TARDOC rules:", error);
    res.status(500).json({ message: "Failed to check rules" });
  }
});

// ==================== EXPORT ====================

// Export XML
router.get('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId/xml', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const xml = await generateXmlForInvoice(invoiceId, hospitalId);

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.xml"`);
    res.send(xml);
  } catch (error: any) {
    logger.error("Error generating TARDOC XML:", error);
    res.status(500).json({ message: error.message || "Failed to generate XML" });
  }
});

// Export PDF
router.get('/api/clinic/:hospitalId/tardoc-invoices/:invoiceId/pdf', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const pdfBuffer = await generatePdfForInvoice(invoiceId, hospitalId);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${invoiceId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    logger.error("Error generating TARDOC PDF:", error);
    res.status(500).json({ message: error.message || "Failed to generate PDF" });
  }
});

// ==================== TPW RATES ====================

// List TPW rates for a hospital
router.get('/api/clinic/:hospitalId/tpw-rates', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const rates = await db
      .select()
      .from(tpwRates)
      .where(eq(tpwRates.hospitalId, hospitalId))
      .orderBy(asc(tpwRates.canton), asc(tpwRates.validFrom));
    res.json(rates);
  } catch (error: any) {
    logger.error("Error listing TPW rates:", error);
    res.status(500).json({ message: "Failed to list TPW rates" });
  }
});

// Create TPW rate
router.post('/api/clinic/:hospitalId/tpw-rates', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const data = z.object({
      canton: z.string().length(2),
      insurerGln: z.string().nullable().optional(),
      lawType: z.string().nullable().optional(),
      tpValueAl: z.string().nullable().optional(),
      tpValueTl: z.string().nullable().optional(),
      tpValue: z.string(),
      validFrom: z.string(),
      validTo: z.string().nullable().optional(),
      notes: z.string().nullable().optional(),
    }).parse(req.body);

    const [rate] = await db.insert(tpwRates).values({
      hospitalId,
      ...data,
    }).returning();

    res.status(201).json(rate);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating TPW rate:", error);
    res.status(500).json({ message: "Failed to create TPW rate" });
  }
});

// Update TPW rate
router.patch('/api/clinic/:hospitalId/tpw-rates/:rateId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, rateId } = req.params;

    const [existing] = await db.select().from(tpwRates)
      .where(and(eq(tpwRates.id, rateId), eq(tpwRates.hospitalId, hospitalId)));

    if (!existing) {
      return res.status(404).json({ message: "TPW rate not found" });
    }

    const [updated] = await db.update(tpwRates)
      .set(req.body)
      .where(eq(tpwRates.id, rateId))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error("Error updating TPW rate:", error);
    res.status(500).json({ message: "Failed to update TPW rate" });
  }
});

// Delete TPW rate
router.delete('/api/clinic/:hospitalId/tpw-rates/:rateId', isAuthenticated, requireStrictHospitalAccess, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId, rateId } = req.params;

    const [existing] = await db.select().from(tpwRates)
      .where(and(eq(tpwRates.id, rateId), eq(tpwRates.hospitalId, hospitalId)));

    if (!existing) {
      return res.status(404).json({ message: "TPW rate not found" });
    }

    await db.delete(tpwRates).where(eq(tpwRates.id, rateId));
    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting TPW rate:", error);
    res.status(500).json({ message: "Failed to delete TPW rate" });
  }
});

// Lookup TPW rate with fallback chain
router.get('/api/clinic/:hospitalId/tpw-lookup', isAuthenticated, requireStrictHospitalAccess, async (req: any, res: Response) => {
  try {
    const { hospitalId } = req.params;
    const canton = (req.query.canton as string || '').toUpperCase();
    const insurerGln = req.query.insurerGln as string || null;
    const lawType = req.query.lawType as string || null;
    const dateStr = req.query.date as string || new Date().toISOString().split('T')[0];

    if (!canton) {
      return res.status(400).json({ message: "Canton is required" });
    }

    // Fallback chain: exact → canton+lawType → canton only → hospital default
    const allRates = await db.select().from(tpwRates)
      .where(and(
        eq(tpwRates.hospitalId, hospitalId),
        eq(tpwRates.canton, canton),
        sql`${tpwRates.validFrom} <= ${dateStr}`,
        or(
          sql`${tpwRates.validTo} IS NULL`,
          sql`${tpwRates.validTo} >= ${dateStr}`
        )
      ));

    // 1. Exact match: canton + insurer + lawType
    let match = allRates.find(r =>
      r.insurerGln === insurerGln && r.lawType === lawType && insurerGln && lawType
    );
    let source = 'exact';

    // 2. Canton + lawType
    if (!match && lawType) {
      match = allRates.find(r => r.lawType === lawType && !r.insurerGln);
      source = 'canton+lawType';
    }

    // 3. Canton only
    if (!match) {
      match = allRates.find(r => !r.insurerGln && !r.lawType);
      source = 'canton';
    }

    if (match) {
      return res.json({
        tpValue: match.tpValue,
        tpValueAl: match.tpValueAl,
        tpValueTl: match.tpValueTl,
        source,
        rateId: match.id,
        notes: match.notes,
      });
    }

    // 4. Hospital default
    const [hospital] = await db.select({ defaultTpValue: hospitals.defaultTpValue })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId));

    res.json({
      tpValue: hospital?.defaultTpValue || '1.0000',
      tpValueAl: null,
      tpValueTl: null,
      source: 'hospital_default',
      rateId: null,
      notes: null,
    });
  } catch (error: any) {
    logger.error("Error looking up TPW rate:", error);
    res.status(500).json({ message: "Failed to look up TPW rate" });
  }
});

export default router;
