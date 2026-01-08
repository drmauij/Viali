import { Router } from "express";
import type { Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess } from "../utils";
import { 
  clinicInvoices, 
  clinicInvoiceItems,
  clinicServices,
  insertClinicInvoiceSchema,
  insertClinicInvoiceItemSchema,
  insertClinicServiceSchema,
  patients,
  items,
  itemCodes,
  units,
  hospitals,
} from "@shared/schema";
import { eq, and, desc, sql, max, inArray, or, gte, lte } from "drizzle-orm";
import { z } from "zod";

const router = Router();

// Middleware to check clinic module access
async function isClinicAccess(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId || req.query.hospitalId;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    next();
  } catch (error) {
    console.error("Error checking clinic access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// ========================================
// Clinic Services CRUD
// ========================================

// List services for a hospital (optionally filtered by unit)
router.get('/api/clinic/:hospitalId/services', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, includeShared } = req.query;
    
    let conditions: any[] = [eq(clinicServices.hospitalId, hospitalId)];
    
    if (unitId && typeof unitId === 'string') {
      if (includeShared === 'true') {
        conditions.push(
          or(
            eq(clinicServices.unitId, unitId),
            eq(clinicServices.isShared, true)
          )
        );
      } else {
        conditions.push(eq(clinicServices.unitId, unitId));
      }
    }
    
    const services = await db
      .select({
        id: clinicServices.id,
        hospitalId: clinicServices.hospitalId,
        unitId: clinicServices.unitId,
        name: clinicServices.name,
        description: clinicServices.description,
        price: clinicServices.price,
        isShared: clinicServices.isShared,
        sortOrder: clinicServices.sortOrder,
        createdAt: clinicServices.createdAt,
        updatedAt: clinicServices.updatedAt,
        unitName: units.name,
      })
      .from(clinicServices)
      .leftJoin(units, eq(clinicServices.unitId, units.id))
      .where(and(...conditions))
      .orderBy(clinicServices.sortOrder, clinicServices.name);
    
    res.json(services);
  } catch (error) {
    console.error("Error fetching services:", error);
    res.status(500).json({ message: "Failed to fetch services" });
  }
});

// Get single service
router.get('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    const result = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (result.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    res.json(result[0]);
  } catch (error) {
    console.error("Error fetching service:", error);
    res.status(500).json({ message: "Failed to fetch service" });
  }
});

// Create service
router.post('/api/clinic/:hospitalId/services', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const validatedData = insertClinicServiceSchema.parse({
      ...req.body,
      hospitalId,
    });
    
    const [service] = await db
      .insert(clinicServices)
      .values(validatedData)
      .returning();
    
    res.status(201).json(service);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating service:", error);
    res.status(500).json({ message: "Failed to create service" });
  }
});

// Update service
router.patch('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    // Verify service belongs to hospital
    const existing = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    const { name, description, price, isShared, sortOrder } = req.body;
    
    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (price !== undefined) updateData.price = price.toString();
    if (isShared !== undefined) updateData.isShared = isShared;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;
    
    const [updated] = await db
      .update(clinicServices)
      .set(updateData)
      .where(eq(clinicServices.id, serviceId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating service:", error);
    res.status(500).json({ message: "Failed to update service" });
  }
});

// Delete service
router.delete('/api/clinic/:hospitalId/services/:serviceId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, serviceId } = req.params;
    
    // Verify service belongs to hospital
    const existing = await db
      .select()
      .from(clinicServices)
      .where(
        and(
          eq(clinicServices.hospitalId, hospitalId),
          eq(clinicServices.id, serviceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Service not found" });
    }
    
    await db
      .delete(clinicServices)
      .where(eq(clinicServices.id, serviceId));
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting service:", error);
    res.status(500).json({ message: "Failed to delete service" });
  }
});

// ========================================
// Invoice Number
// ========================================

// Get next invoice number for a hospital
router.get('/api/clinic/:hospitalId/next-invoice-number', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const result = await db
      .select({ maxNumber: max(clinicInvoices.invoiceNumber) })
      .from(clinicInvoices)
      .where(eq(clinicInvoices.hospitalId, hospitalId));
    
    const nextNumber = (result[0]?.maxNumber || 0) + 1;
    
    res.json({ nextNumber });
  } catch (error) {
    console.error("Error getting next invoice number:", error);
    res.status(500).json({ message: "Failed to get next invoice number" });
  }
});

// List all invoices for a hospital
router.get('/api/clinic/:hospitalId/invoices', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { status, patientId } = req.query;
    
    let query = db
      .select({
        id: clinicInvoices.id,
        hospitalId: clinicInvoices.hospitalId,
        invoiceNumber: clinicInvoices.invoiceNumber,
        date: clinicInvoices.date,
        patientId: clinicInvoices.patientId,
        customerName: clinicInvoices.customerName,
        customerAddress: clinicInvoices.customerAddress,
        subtotal: clinicInvoices.subtotal,
        vatRate: clinicInvoices.vatRate,
        vatAmount: clinicInvoices.vatAmount,
        total: clinicInvoices.total,
        comments: clinicInvoices.comments,
        status: clinicInvoices.status,
        createdBy: clinicInvoices.createdBy,
        createdAt: clinicInvoices.createdAt,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
      })
      .from(clinicInvoices)
      .leftJoin(patients, eq(clinicInvoices.patientId, patients.id))
      .where(eq(clinicInvoices.hospitalId, hospitalId))
      .orderBy(desc(clinicInvoices.date));
    
    const invoices = await query;
    
    // Apply filters in memory for simplicity
    let filtered = invoices;
    if (status && status !== 'all') {
      filtered = filtered.filter(inv => inv.status === status);
    }
    if (patientId) {
      filtered = filtered.filter(inv => inv.patientId === patientId);
    }
    
    res.json(filtered);
  } catch (error) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// Get single invoice with items
router.get('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    // Get invoice
    const invoiceResult = await db
      .select({
        id: clinicInvoices.id,
        hospitalId: clinicInvoices.hospitalId,
        invoiceNumber: clinicInvoices.invoiceNumber,
        date: clinicInvoices.date,
        patientId: clinicInvoices.patientId,
        customerName: clinicInvoices.customerName,
        customerAddress: clinicInvoices.customerAddress,
        subtotal: clinicInvoices.subtotal,
        vatRate: clinicInvoices.vatRate,
        vatAmount: clinicInvoices.vatAmount,
        total: clinicInvoices.total,
        comments: clinicInvoices.comments,
        status: clinicInvoices.status,
        createdBy: clinicInvoices.createdBy,
        createdAt: clinicInvoices.createdAt,
        patientFirstName: patients.firstName,
        patientSurname: patients.surname,
      })
      .from(clinicInvoices)
      .leftJoin(patients, eq(clinicInvoices.patientId, patients.id))
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoiceResult.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    const invoice = invoiceResult[0];
    
    // Get invoice items with item codes (pharmacode, GTIN) and tax data
    const invoiceItems = await db
      .select({
        id: clinicInvoiceItems.id,
        invoiceId: clinicInvoiceItems.invoiceId,
        lineType: clinicInvoiceItems.lineType,
        itemId: clinicInvoiceItems.itemId,
        serviceId: clinicInvoiceItems.serviceId,
        description: clinicInvoiceItems.description,
        quantity: clinicInvoiceItems.quantity,
        unitPrice: clinicInvoiceItems.unitPrice,
        total: clinicInvoiceItems.total,
        taxRate: clinicInvoiceItems.taxRate,
        taxAmount: clinicInvoiceItems.taxAmount,
        itemName: items.name,
        pharmacode: itemCodes.pharmacode,
        gtin: itemCodes.gtin,
      })
      .from(clinicInvoiceItems)
      .leftJoin(items, eq(clinicInvoiceItems.itemId, items.id))
      .leftJoin(itemCodes, eq(items.id, itemCodes.itemId))
      .where(eq(clinicInvoiceItems.invoiceId, invoiceId));
    
    res.json({
      ...invoice,
      items: invoiceItems,
    });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Failed to fetch invoice" });
  }
});

// Create invoice schema with items - supports per-line tax
const createInvoiceWithItemsSchema = z.object({
  hospitalId: z.string(),
  patientId: z.string().nullable().optional(),
  customerName: z.string().min(1),
  customerAddress: z.string().nullable().optional(),
  date: z.coerce.date().optional(),
  vatRate: z.coerce.number().default(2.6),
  comments: z.string().nullable().optional(),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).default("draft"),
  items: z.array(z.object({
    lineType: z.enum(["item", "service"]).default("item"),
    itemId: z.string().nullable().optional(),
    serviceId: z.string().nullable().optional(),
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.coerce.number().min(0),
    taxRate: z.coerce.number().min(0).max(100).default(0),
  })).min(1),
});

// Create invoice with items
router.post('/api/clinic/:hospitalId/invoices', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    // Validate input
    const validatedData = createInvoiceWithItemsSchema.parse({
      ...req.body,
      hospitalId,
    });
    
    // Get next invoice number
    const numberResult = await db
      .select({ maxNumber: max(clinicInvoices.invoiceNumber) })
      .from(clinicInvoices)
      .where(eq(clinicInvoices.hospitalId, hospitalId));
    
    const invoiceNumber = (numberResult[0]?.maxNumber || 0) + 1;
    
    // Calculate totals with per-line tax (services are tax-exempt, items have VAT)
    let subtotal = 0;
    let totalTax = 0;
    const itemsWithTotals = validatedData.items.map(item => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const lineTaxRate = item.taxRate || 0;
      const lineTaxAmount = lineSubtotal * (lineTaxRate / 100);
      subtotal += lineSubtotal;
      totalTax += lineTaxAmount;
      return {
        ...item,
        total: lineSubtotal,
        taxAmount: lineTaxAmount,
      };
    });
    
    const vatAmount = totalTax; // VAT is sum of per-line taxes (only items, not services)
    const total = subtotal + vatAmount;
    
    // Create invoice
    const [invoice] = await db
      .insert(clinicInvoices)
      .values({
        hospitalId,
        invoiceNumber,
        date: validatedData.date || new Date(),
        patientId: validatedData.patientId || null,
        customerName: validatedData.customerName,
        customerAddress: validatedData.customerAddress?.trim() || null,
        subtotal: subtotal.toFixed(2),
        vatRate: validatedData.vatRate.toFixed(2),
        vatAmount: vatAmount.toFixed(2),
        total: total.toFixed(2),
        comments: validatedData.comments || null,
        status: validatedData.status,
        createdBy: userId,
      })
      .returning();
    
    // Create invoice items with per-line tax data
    for (const item of itemsWithTotals) {
      await db
        .insert(clinicInvoiceItems)
        .values({
          invoiceId: invoice.id,
          lineType: item.lineType || 'item',
          itemId: item.itemId || null,
          serviceId: item.serviceId || null,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice.toFixed(2),
          total: item.total.toFixed(2),
          taxRate: (item.taxRate || 0).toFixed(2),
          taxAmount: item.taxAmount.toFixed(2),
        });
    }
    
    res.status(201).json(invoice);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating invoice:", error);
    res.status(500).json({ message: "Failed to create invoice" });
  }
});

// Update invoice status
router.patch('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { status, comments } = req.body;
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    const updateData: any = {};
    if (status) updateData.status = status;
    if (comments !== undefined) updateData.comments = comments;
    
    const [updated] = await db
      .update(clinicInvoices)
      .set(updateData)
      .where(eq(clinicInvoices.id, invoiceId))
      .returning();
    
    res.json(updated);
  } catch (error) {
    console.error("Error updating invoice:", error);
    res.status(500).json({ message: "Failed to update invoice" });
  }
});

// Delete invoice
router.delete('/api/clinic/:hospitalId/invoices/:invoiceId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    // Items are deleted automatically due to onDelete: 'cascade'
    await db
      .delete(clinicInvoices)
      .where(eq(clinicInvoices.id, invoiceId));
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting invoice:", error);
    res.status(500).json({ message: "Failed to delete invoice" });
  }
});

// Update invoice status
router.patch('/api/clinic/:hospitalId/invoices/:invoiceId/status', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { status } = req.body;
    
    if (!status || !['draft', 'paid'].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    
    // Verify invoice belongs to hospital
    const existing = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (existing.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    await db
      .update(clinicInvoices)
      .set({ status })
      .where(eq(clinicInvoices.id, invoiceId));
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating invoice status:", error);
    res.status(500).json({ message: "Failed to update invoice status" });
  }
});

// Get items with patient prices for invoice item picker
router.get('/api/clinic/:hospitalId/items-with-prices', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId } = req.query;
    
    // Build where condition
    const conditions = [eq(items.hospitalId, hospitalId)];
    if (unitId && typeof unitId === 'string') {
      conditions.push(eq(items.unitId, unitId));
    }
    
    const itemsWithPrices = await db
      .select({
        id: items.id,
        name: items.name,
        description: items.description,
        patientPrice: items.patientPrice,
      })
      .from(items)
      .where(and(...conditions))
      .orderBy(items.name);
    
    // Get item codes for all items
    const itemIds = itemsWithPrices.map(item => item.id);
    const codes = itemIds.length > 0 ? await db
      .select({
        itemId: itemCodes.itemId,
        gtin: itemCodes.gtin,
        pharmacode: itemCodes.pharmacode,
      })
      .from(itemCodes)
      .where(inArray(itemCodes.itemId, itemIds)) : [];
    
    // Map codes to items
    const codesMap = new Map(codes.map(c => [c.itemId, c]));
    
    const enrichedItems = itemsWithPrices.map(item => ({
      ...item,
      gtin: codesMap.get(item.id)?.gtin || null,
      pharmacode: codesMap.get(item.id)?.pharmacode || null,
    }));
    
    // Debug log for price issue
    console.log('Items with prices:', enrichedItems.filter(i => i.patientPrice).map(i => ({ name: i.name, patientPrice: i.patientPrice })));
    
    res.json(enrichedItems);
  } catch (error) {
    console.error("Error fetching items with prices:", error);
    res.status(500).json({ message: "Failed to fetch items" });
  }
});

// Get hospital company data for invoices
router.get('/api/clinic/:hospitalId/company-data', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospital = await storage.getHospital(hospitalId);
    
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    res.json({
      companyName: (hospital as any).companyName || hospital.name,
      companyStreet: (hospital as any).companyStreet || '',
      companyPostalCode: (hospital as any).companyPostalCode || '',
      companyCity: (hospital as any).companyCity || '',
      companyPhone: (hospital as any).companyPhone || '',
      companyFax: (hospital as any).companyFax || '',
      companyEmail: (hospital as any).companyEmail || '',
      companyLogoUrl: (hospital as any).companyLogoUrl || '',
    });
  } catch (error) {
    console.error("Error fetching company data:", error);
    res.status(500).json({ message: "Failed to fetch company data" });
  }
});

// Update hospital company data for invoices
router.patch('/api/clinic/:hospitalId/company-data', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    
    // Check if user is admin for this hospital
    const hospitals = await storage.getUserHospitals(userId);
    const userHospital = hospitals.find(h => h.id === hospitalId);
    
    if (!userHospital || userHospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required to update company data" });
    }
    
    const { 
      companyName, 
      companyStreet, 
      companyPostalCode, 
      companyCity, 
      companyPhone, 
      companyFax, 
      companyEmail,
      companyLogoUrl 
    } = req.body;
    
    // Import hospitals table for direct update
    const { hospitals: hospitalsTable } = await import("@shared/schema");
    
    const [updated] = await db
      .update(hospitalsTable)
      .set({
        companyName: companyName || null,
        companyStreet: companyStreet || null,
        companyPostalCode: companyPostalCode || null,
        companyCity: companyCity || null,
        companyPhone: companyPhone || null,
        companyFax: companyFax || null,
        companyEmail: companyEmail || null,
        companyLogoUrl: companyLogoUrl || null,
        updatedAt: new Date(),
      })
      .where(eq(hospitalsTable.id, hospitalId))
      .returning();
    
    res.json({
      companyName: updated.companyName,
      companyStreet: updated.companyStreet,
      companyPostalCode: updated.companyPostalCode,
      companyCity: updated.companyCity,
      companyPhone: updated.companyPhone,
      companyFax: updated.companyFax,
      companyEmail: updated.companyEmail,
      companyLogoUrl: updated.companyLogoUrl,
    });
  } catch (error) {
    console.error("Error updating company data:", error);
    res.status(500).json({ message: "Failed to update company data" });
  }
});

// Send invoice via email
router.post('/api/clinic/:hospitalId/invoices/:invoiceId/send-email', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    const { email, pdfBase64, language, saveEmailToPatient } = req.body;
    
    if (!email || !pdfBase64) {
      return res.status(400).json({ message: "Email and PDF data are required" });
    }
    
    // Strip data URI prefix if present (data:application/pdf;base64,)
    let cleanPdfBase64 = pdfBase64;
    if (typeof pdfBase64 === 'string' && pdfBase64.includes(',')) {
      cleanPdfBase64 = pdfBase64.split(',').pop() || pdfBase64;
    }
    
    // Get invoice details
    const invoice = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoice.length === 0) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    
    // Get hospital/clinic name
    const { hospitals: hospitalsTable } = await import("@shared/schema");
    const hospital = await db
      .select()
      .from(hospitalsTable)
      .where(eq(hospitalsTable.id, hospitalId))
      .limit(1);
    
    const clinicName = hospital[0]?.companyName || hospital[0]?.name || 'Clinic';
    
    // Send email
    const { sendInvoiceEmail } = await import('../resend');
    const result = await sendInvoiceEmail(
      email,
      invoice[0].invoiceNumber,
      invoice[0].customerName,
      invoice[0].total,
      clinicName,
      cleanPdfBase64,
      language || 'de'
    );
    
    if (!result.success) {
      return res.status(500).json({ message: "Failed to send email", error: result.error });
    }
    
    // Update invoice status to 'sent' if it was draft
    if (invoice[0].status === 'draft') {
      await db
        .update(clinicInvoices)
        .set({ status: 'sent' })
        .where(eq(clinicInvoices.id, invoiceId));
    }
    
    // Optionally save email to patient
    if (saveEmailToPatient && invoice[0].patientId) {
      const { patients: patientsTable } = await import("@shared/schema");
      await db
        .update(patientsTable)
        .set({ email })
        .where(eq(patientsTable.id, invoice[0].patientId));
    }
    
    res.json({ success: true, message: "Invoice sent successfully" });
  } catch (error) {
    console.error("Error sending invoice email:", error);
    res.status(500).json({ message: "Failed to send invoice email" });
  }
});

// Get patient email for invoice
router.get('/api/clinic/:hospitalId/invoices/:invoiceId/patient-email', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId, invoiceId } = req.params;
    
    const invoice = await db
      .select()
      .from(clinicInvoices)
      .where(
        and(
          eq(clinicInvoices.hospitalId, hospitalId),
          eq(clinicInvoices.id, invoiceId)
        )
      )
      .limit(1);
    
    if (invoice.length === 0 || !invoice[0].patientId) {
      return res.json({ email: null });
    }
    
    const { patients: patientsTable } = await import("@shared/schema");
    const patient = await db
      .select({ email: patientsTable.email })
      .from(patientsTable)
      .where(eq(patientsTable.id, invoice[0].patientId))
      .limit(1);
    
    res.json({ email: patient[0]?.email || null });
  } catch (error) {
    console.error("Error fetching patient email:", error);
    res.status(500).json({ message: "Failed to fetch patient email" });
  }
});

// ========================================
// Clinic Appointments CRUD
// ========================================

import {
  clinicAppointments,
  providerAvailability,
  providerTimeOff,
  providerAbsences,
  timebutlerConfig,
  insertClinicAppointmentSchema,
  insertProviderAvailabilitySchema,
  insertProviderTimeOffSchema,
  users,
} from "@shared/schema";

// List appointments for a unit
router.get('/api/clinic/:hospitalId/units/:unitId/appointments', isAuthenticated, isClinicAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const { providerId, patientId, startDate, endDate, status } = req.query;
    
    const appointments = await storage.getClinicAppointments(unitId, {
      providerId: providerId as string,
      patientId: patientId as string,
      startDate: startDate as string,
      endDate: endDate as string,
      status: status as string,
    });
    
    res.json(appointments);
  } catch (error) {
    console.error("Error fetching appointments:", error);
    res.status(500).json({ message: "Failed to fetch appointments" });
  }
});

// Get single appointment
router.get('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const appointment = await storage.getClinicAppointment(appointmentId);
    
    if (!appointment) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    res.json(appointment);
  } catch (error) {
    console.error("Error fetching appointment:", error);
    res.status(500).json({ message: "Failed to fetch appointment" });
  }
});

// Create appointment
router.post('/api/clinic/:hospitalId/units/:unitId/appointments', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const userId = req.user.id;
    
    // Calculate duration from start and end time
    const { startTime, endTime } = req.body;
    let durationMinutes = 30; // default
    if (startTime && endTime) {
      const [startHours, startMins] = startTime.split(':').map(Number);
      const [endHours, endMins] = endTime.split(':').map(Number);
      durationMinutes = (endHours * 60 + endMins) - (startHours * 60 + startMins);
      if (durationMinutes <= 0) durationMinutes = 30;
    }
    
    const validatedData = insertClinicAppointmentSchema.parse({
      ...req.body,
      hospitalId,
      unitId,
      durationMinutes,
      createdBy: userId,
    });
    
    const appointment = await storage.createClinicAppointment(validatedData);
    
    res.status(201).json(appointment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating appointment:", error);
    res.status(500).json({ message: "Failed to create appointment" });
  }
});

// Schema for updating appointments - only allow safe fields
const updateAppointmentSchema = z.object({
  status: z.enum(["scheduled", "confirmed", "in_progress", "completed", "cancelled", "no_show"]).optional(),
  appointmentDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  notes: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
});

// Update appointment
router.patch('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    
    const existing = await storage.getClinicAppointment(appointmentId);
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Security: Verify appointment belongs to this hospital
    if (existing.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this appointment" });
    }
    
    // Validate update payload with Zod schema
    const validatedData = updateAppointmentSchema.parse(req.body);
    
    const updated = await storage.updateClinicAppointment(appointmentId, validatedData);
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error updating appointment:", error);
    res.status(500).json({ message: "Failed to update appointment" });
  }
});

// Delete appointment
router.delete('/api/clinic/:hospitalId/appointments/:appointmentId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { hospitalId, appointmentId } = req.params;
    
    const existing = await storage.getClinicAppointment(appointmentId);
    if (!existing) {
      return res.status(404).json({ message: "Appointment not found" });
    }
    
    // Security: Verify appointment belongs to this hospital
    if (existing.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied to this appointment" });
    }
    
    await storage.deleteClinicAppointment(appointmentId);
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting appointment:", error);
    res.status(500).json({ message: "Failed to delete appointment" });
  }
});

// Get available slots for a provider on a specific date
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/available-slots', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { unitId, providerId } = req.params;
    const { date, duration } = req.query;
    
    if (!date) {
      return res.status(400).json({ message: "Date is required" });
    }
    
    const durationMinutes = parseInt(duration as string) || 30;
    
    const slots = await storage.getAvailableSlots(providerId, unitId, date as string, durationMinutes);
    
    res.json(slots);
  } catch (error) {
    console.error("Error fetching available slots:", error);
    res.status(500).json({ message: "Failed to fetch available slots" });
  }
});

// ========================================
// Provider Availability Management
// ========================================

// Get provider availability
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { unitId, providerId } = req.params;
    
    const availability = await storage.getProviderAvailability(providerId, unitId);
    
    res.json(availability);
  } catch (error) {
    console.error("Error fetching provider availability:", error);
    res.status(500).json({ message: "Failed to fetch availability" });
  }
});

// Set provider availability (replaces all for this provider/unit)
router.put('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/availability', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { unitId, providerId } = req.params;
    const { availability } = req.body;
    
    if (!Array.isArray(availability)) {
      return res.status(400).json({ message: "Availability must be an array" });
    }
    
    const result = await storage.setProviderAvailability(providerId, unitId, availability);
    
    res.json(result);
  } catch (error) {
    console.error("Error setting provider availability:", error);
    res.status(500).json({ message: "Failed to set availability" });
  }
});

// ========================================
// Provider Time Off Management
// ========================================

// Get provider time off
router.get('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/time-off', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { unitId, providerId } = req.params;
    const { startDate, endDate } = req.query;
    
    const timeOff = await storage.getProviderTimeOff(
      providerId, 
      unitId, 
      startDate as string, 
      endDate as string
    );
    
    res.json(timeOff);
  } catch (error) {
    console.error("Error fetching provider time off:", error);
    res.status(500).json({ message: "Failed to fetch time off" });
  }
});

// Create time off
router.post('/api/clinic/:hospitalId/units/:unitId/providers/:providerId/time-off', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { unitId, providerId } = req.params;
    const userId = req.user.id;
    
    const validatedData = insertProviderTimeOffSchema.parse({
      ...req.body,
      providerId,
      unitId,
      createdBy: userId,
    });
    
    const timeOff = await storage.createProviderTimeOff(validatedData);
    
    res.status(201).json(timeOff);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating time off:", error);
    res.status(500).json({ message: "Failed to create time off" });
  }
});

// Delete time off
router.delete('/api/clinic/:hospitalId/time-off/:timeOffId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req, res) => {
  try {
    const { timeOffId } = req.params;
    
    await storage.deleteProviderTimeOff(timeOffId);
    
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting time off:", error);
    res.status(500).json({ message: "Failed to delete time off" });
  }
});

// ========================================
// Provider Absences (Timebutler sync)
// ========================================

// Get provider absences
router.get('/api/clinic/:hospitalId/absences', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate } = req.query;
    
    const absences = await storage.getProviderAbsences(
      hospitalId,
      startDate as string,
      endDate as string
    );
    
    res.json(absences);
  } catch (error) {
    console.error("Error fetching absences:", error);
    res.status(500).json({ message: "Failed to fetch absences" });
  }
});

// ========================================
// Timebutler Configuration
// ========================================

// Get Timebutler config
router.get('/api/clinic/:hospitalId/timebutler-config', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getTimebutlerConfig(hospitalId);
    
    // Don't expose the API token in the response
    if (config) {
      res.json({
        ...config,
        apiToken: config.apiToken ? '********' : null,
        hasApiToken: !!config.apiToken,
      });
    } else {
      res.json(null);
    }
  } catch (error) {
    console.error("Error fetching Timebutler config:", error);
    res.status(500).json({ message: "Failed to fetch Timebutler config" });
  }
});

// Update Timebutler config
router.put('/api/clinic/:hospitalId/timebutler-config', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { apiToken, userMapping, isEnabled } = req.body;
    
    // Get existing config to preserve token if not changed
    const existing = await storage.getTimebutlerConfig(hospitalId);
    
    const config = await storage.upsertTimebutlerConfig({
      hospitalId,
      apiToken: apiToken === '********' ? existing?.apiToken : apiToken,
      userMapping: userMapping || existing?.userMapping || {},
      isEnabled: isEnabled ?? existing?.isEnabled ?? false,
    });
    
    res.json({
      ...config,
      apiToken: config.apiToken ? '********' : null,
      hasApiToken: !!config.apiToken,
    });
  } catch (error) {
    console.error("Error updating Timebutler config:", error);
    res.status(500).json({ message: "Failed to update Timebutler config" });
  }
});

// Trigger Timebutler sync
router.post('/api/clinic/:hospitalId/timebutler-sync', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getTimebutlerConfig(hospitalId);
    
    if (!config?.apiToken || !config.isEnabled) {
      return res.status(400).json({ message: "Timebutler is not configured or enabled" });
    }
    
    // Call Timebutler API
    const currentYear = new Date().getFullYear();
    const response = await fetch('https://timebutler.de/api/v1/absences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `auth=${config.apiToken}&year=${currentYear}`,
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Timebutler API error:", errorText);
      
      // Update config with error status
      await storage.upsertTimebutlerConfig({
        hospitalId,
        apiToken: config.apiToken,
        userMapping: config.userMapping,
        isEnabled: config.isEnabled,
        lastSyncAt: new Date(),
        lastSyncStatus: 'failed',
        lastSyncMessage: `API error: ${response.status}`,
      });
      
      return res.status(502).json({ message: "Timebutler API error" });
    }
    
    const csvData = await response.text();
    
    // Parse CSV data
    const lines = csvData.split('\n');
    const headers = lines[0]?.split(';') || [];
    
    // Find column indices - support both English and German headers
    const userIdIdx = headers.findIndex(h => h.toLowerCase() === 'user id' || h.toLowerCase() === 'benutzer id');
    const emailIdx = headers.findIndex(h => h.toLowerCase().includes('email') || h.toLowerCase().includes('e-mail'));
    const startIdx = headers.findIndex(h => 
      h.toLowerCase() === 'from' || 
      h.toLowerCase() === 'von' || 
      h.toLowerCase().includes('start')
    );
    const endIdx = headers.findIndex(h => 
      h.toLowerCase() === 'to' || 
      h.toLowerCase() === 'bis' || 
      h.toLowerCase().includes('end')
    );
    const typeIdx = headers.findIndex(h => h.toLowerCase().includes('type') || h.toLowerCase().includes('art'));
    
    // We need either userId or email for user identification, plus dates
    if ((userIdIdx === -1 && emailIdx === -1) || startIdx === -1 || endIdx === -1) {
      console.error("Could not parse Timebutler CSV headers:", headers);
      return res.status(500).json({ 
        message: "Could not parse Timebutler response. Expected columns: User ID or Email, From/To dates." 
      });
    }
    
    const absences: any[] = [];
    const userMapping = config.userMapping || {};
    let skippedUnmapped = 0;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const cols = line.split(';');
      const timebutlerUserId = userIdIdx !== -1 ? cols[userIdIdx]?.trim() : undefined;
      const email = emailIdx !== -1 ? cols[emailIdx]?.trim() : undefined;
      const startDate = cols[startIdx]?.trim();
      const endDate = cols[endIdx]?.trim();
      const absenceType = cols[typeIdx]?.trim() || 'vacation';
      
      if (!startDate || !endDate) continue;
      if (!timebutlerUserId && !email) continue;
      
      // Map Timebutler User ID or email to provider ID
      // userMapping can have entries like { "123": "provider-uuid", "user@email.com": "provider-uuid" }
      const userKey = timebutlerUserId || email || '';
      const providerId = userMapping[userKey] || (email ? userMapping[email] : undefined);
      
      if (!providerId) {
        skippedUnmapped++;
        continue; // Skip unmapped users
      }
      
      absences.push({
        providerId,
        hospitalId,
        absenceType,
        startDate,
        endDate,
        externalId: `tb-${userKey}-${startDate}-${endDate}`,
      });
    }
    
    if (skippedUnmapped > 0) {
      console.log(`Timebutler sync: Skipped ${skippedUnmapped} unmapped users`);
    }
    
    // Sync absences to database
    if (absences.length > 0) {
      await storage.syncProviderAbsences(hospitalId, absences);
    }
    
    // Update config with success status
    await storage.upsertTimebutlerConfig({
      hospitalId,
      apiToken: config.apiToken,
      userMapping: config.userMapping,
      isEnabled: config.isEnabled,
      lastSyncAt: new Date(),
      lastSyncStatus: 'success',
      lastSyncMessage: `Synced ${absences.length} absences`,
    });
    
    res.json({ 
      success: true, 
      message: `Synced ${absences.length} absences`,
      syncedCount: absences.length,
    });
  } catch (error) {
    console.error("Error syncing Timebutler:", error);
    res.status(500).json({ message: "Failed to sync Timebutler" });
  }
});

// ========================================
// Providers (users who can have appointments)
// ========================================

// Get providers for a hospital (all staff members who can receive appointments)
router.get('/api/clinic/:hospitalId/units/:unitId/providers', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { userHospitalRoles } = await import("@shared/schema");
    
    // Get all users with app access (canLogin=true) at this hospital
    const providers = await db
      .selectDistinct({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        profileImageUrl: users.profileImageUrl,
      })
      .from(users)
      .innerJoin(
        userHospitalRoles,
        and(
          eq(users.id, userHospitalRoles.userId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        )
      )
      .where(eq(users.canLogin, true))
      .orderBy(users.lastName, users.firstName);
    
    res.json(providers);
  } catch (error) {
    console.error("Error fetching providers:", error);
    res.status(500).json({ message: "Failed to fetch providers" });
  }
});

// ========================================
// Provider Surgery Blocks (for blocking calendar time)
// ========================================

// Get all surgeries for a hospital in a date range (for calendar blocking)
router.get('/api/clinic/:hospitalId/all-surgeries', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "startDate and endDate are required" });
    }
    
    const { surgeries, patients: patientsTable } = await import("@shared/schema");
    
    const start = new Date(startDate as string);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    
    // Fetch all non-cancelled surgeries for the hospital in date range
    const result = await db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeonId: surgeries.surgeonId,
        surgeon: surgeries.surgeon,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        actualEndTime: surgeries.actualEndTime,
        status: surgeries.status,
        surgeryRoomId: surgeries.surgeryRoomId,
        patientFirstName: patientsTable.firstName,
        patientSurname: patientsTable.surname,
      })
      .from(surgeries)
      .leftJoin(patientsTable, eq(surgeries.patientId, patientsTable.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          sql`${surgeries.plannedDate} >= ${start}`,
          sql`${surgeries.plannedDate} <= ${end}`,
          sql`(${surgeries.status} IS NULL OR ${surgeries.status} NOT IN ('cancelled', 'archived'))`
        )
      )
      .orderBy(surgeries.plannedDate);
    
    // For surgeries with surgeonId, get surgeon names from users table
    const surgeonIds = result
      .map(s => s.surgeonId)
      .filter((id): id is string => id !== null);
    
    let surgeonMap = new Map<string, { firstName: string; lastName: string }>();
    if (surgeonIds.length > 0) {
      const surgeonData = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(users)
        .where(inArray(users.id, surgeonIds));
      
      surgeonData.forEach(s => {
        surgeonMap.set(s.id, { firstName: s.firstName || '', lastName: s.lastName || '' });
      });
    }
    
    // Enrich result with surgeon names
    const enrichedResult = result.map(surgery => {
      if (surgery.surgeonId && surgeonMap.has(surgery.surgeonId)) {
        const surgeon = surgeonMap.get(surgery.surgeonId)!;
        return {
          ...surgery,
          surgeonFirstName: surgeon.firstName,
          surgeonLastName: surgeon.lastName,
        };
      }
      return {
        ...surgery,
        surgeonFirstName: null,
        surgeonLastName: null,
      };
    });
    
    res.json(enrichedResult);
  } catch (error) {
    console.error("Error fetching all surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

// Get surgeries where providers are assigned as surgeons
router.get('/api/clinic/:hospitalId/provider-surgeries', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerIds, startDate, endDate } = req.query;
    
    if (!providerIds || !startDate || !endDate) {
      return res.status(400).json({ message: "providerIds, startDate, and endDate are required" });
    }
    
    const { surgeries, patients: patientsTable } = await import("@shared/schema");
    
    // Parse provider IDs (comma-separated)
    const ids = (providerIds as string).split(',').filter(Boolean);
    
    if (ids.length === 0) {
      return res.json([]);
    }
    
    const start = new Date(startDate as string);
    start.setHours(0, 0, 0, 0);
    
    const end = new Date(endDate as string);
    end.setHours(23, 59, 59, 999);
    
    // Get provider names for fallback matching (for legacy data without surgeonId)
    const providerData = await db
      .select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
      })
      .from(users)
      .where(inArray(users.id, ids));
    
    // Build array of surgeon name patterns for text matching
    const surgeonNamePatterns = providerData.map(p => 
      `${p.firstName} ${p.lastName}`.trim().toLowerCase()
    );
    
    // Fetch surgeries where surgeonId is in the list OR surgeon name matches (for legacy data)
    const result = await db
      .select({
        id: surgeries.id,
        patientId: surgeries.patientId,
        surgeonId: surgeries.surgeonId,
        surgeon: surgeries.surgeon,
        plannedDate: surgeries.plannedDate,
        plannedSurgery: surgeries.plannedSurgery,
        actualEndTime: surgeries.actualEndTime,
        status: surgeries.status,
        surgeryRoomId: surgeries.surgeryRoomId,
        patientFirstName: patientsTable.firstName,
        patientSurname: patientsTable.surname,
      })
      .from(surgeries)
      .leftJoin(patientsTable, eq(surgeries.patientId, patientsTable.id))
      .where(
        and(
          eq(surgeries.hospitalId, hospitalId),
          sql`${surgeries.plannedDate} >= ${start}`,
          sql`${surgeries.plannedDate} <= ${end}`,
          // Only non-cancelled and non-archived surgeries
          sql`(${surgeries.status} IS NULL OR ${surgeries.status} NOT IN ('cancelled', 'archived'))`,
          // Match by surgeonId OR by surgeon name (for legacy data)
          or(
            inArray(surgeries.surgeonId, ids),
            sql`LOWER(TRIM(${surgeries.surgeon})) = ANY(${surgeonNamePatterns})`
          )
        )
      )
      .orderBy(surgeries.plannedDate);
    
    // Map surgeon names back to provider IDs for legacy entries
    const providerNameToId = new Map<string, string>();
    providerData.forEach(p => {
      providerNameToId.set(`${p.firstName} ${p.lastName}`.trim().toLowerCase(), p.id);
    });
    
    const enrichedResult = result.map(surgery => {
      // If surgeonId is missing but surgeon name matches, add the provider ID
      if (!surgery.surgeonId && surgery.surgeon) {
        const normalizedName = surgery.surgeon.trim().toLowerCase();
        const matchedProviderId = providerNameToId.get(normalizedName);
        if (matchedProviderId) {
          return { ...surgery, surgeonId: matchedProviderId };
        }
      }
      return surgery;
    });
    
    res.json(enrichedResult);
  } catch (error) {
    console.error("Error fetching provider surgeries:", error);
    res.status(500).json({ message: "Failed to fetch provider surgeries" });
  }
});

// ========================================
// Cal.com Integration
// ========================================

// Get Cal.com config
router.get('/api/clinic/:hospitalId/calcom-config', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    
    if (!config) {
      return res.json({
        hospitalId,
        isEnabled: false,
        apiKey: null,
        syncBusyBlocks: true,
        syncTimebutlerAbsences: true,
      });
    }
    
    res.json({
      ...config,
      apiKey: config.apiKey ? '***configured***' : null,
    });
  } catch (error) {
    console.error("Error fetching Cal.com config:", error);
    res.status(500).json({ message: "Failed to fetch Cal.com config" });
  }
});

// Update Cal.com config
router.put('/api/clinic/:hospitalId/calcom-config', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { apiKey, webhookSecret, isEnabled, syncBusyBlocks, syncTimebutlerAbsences } = req.body;
    
    const existing = await storage.getCalcomConfig(hospitalId);
    
    const config = await storage.upsertCalcomConfig({
      hospitalId,
      apiKey: apiKey === '***configured***' ? existing?.apiKey : apiKey,
      webhookSecret: webhookSecret === '***configured***' ? existing?.webhookSecret : webhookSecret,
      isEnabled: isEnabled ?? existing?.isEnabled ?? false,
      syncBusyBlocks: syncBusyBlocks ?? existing?.syncBusyBlocks ?? true,
      syncTimebutlerAbsences: syncTimebutlerAbsences ?? existing?.syncTimebutlerAbsences ?? true,
    });
    
    res.json({
      ...config,
      apiKey: config.apiKey ? '***configured***' : null,
      webhookSecret: config.webhookSecret ? '***configured***' : null,
    });
  } catch (error) {
    console.error("Error updating Cal.com config:", error);
    res.status(500).json({ message: "Failed to update Cal.com config" });
  }
});

// Get Cal.com provider mappings
router.get('/api/clinic/:hospitalId/calcom-mappings', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    res.json(mappings);
  } catch (error) {
    console.error("Error fetching Cal.com mappings:", error);
    res.status(500).json({ message: "Failed to fetch Cal.com mappings" });
  }
});

// Create/update Cal.com provider mapping
router.post('/api/clinic/:hospitalId/calcom-mappings', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { providerId, calcomEventTypeId, calcomUserId, calcomScheduleId, isEnabled } = req.body;
    
    if (!providerId || !calcomEventTypeId) {
      return res.status(400).json({ message: "providerId and calcomEventTypeId are required" });
    }
    
    const mapping = await storage.upsertCalcomProviderMapping({
      hospitalId,
      providerId,
      calcomEventTypeId,
      calcomUserId,
      calcomScheduleId,
      isEnabled: isEnabled ?? true,
    });
    
    res.json(mapping);
  } catch (error) {
    console.error("Error creating Cal.com mapping:", error);
    res.status(500).json({ message: "Failed to create Cal.com mapping" });
  }
});

// Delete Cal.com provider mapping
router.delete('/api/clinic/:hospitalId/calcom-mappings/:mappingId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { mappingId } = req.params;
    await storage.deleteCalcomProviderMapping(mappingId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting Cal.com mapping:", error);
    res.status(500).json({ message: "Failed to delete Cal.com mapping" });
  }
});

// Trigger Cal.com sync for ALL providers with mappings (push appointments + absences as busy blocks)
router.post('/api/clinic/:hospitalId/calcom-sync', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.isEnabled || !config.apiKey) {
      return res.status(400).json({ message: "Cal.com is not configured or enabled" });
    }
    
    const mappings = await storage.getCalcomProviderMappings(hospitalId);
    const enabledMappings = mappings.filter(m => m.isEnabled);
    
    if (enabledMappings.length === 0) {
      return res.status(400).json({ message: "No provider mappings configured" });
    }
    
    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);
    
    const syncStartDate = new Date().toISOString().split('T')[0];
    const syncEndDateObj = new Date();
    syncEndDateObj.setMonth(syncEndDateObj.getMonth() + 3);
    const syncEndDate = syncEndDateObj.toISOString().split('T')[0];
    
    let totalBlocks = 0;
    const allErrors: string[] = [];
    
    for (const mapping of enabledMappings) {
      try {
        if (config.syncBusyBlocks) {
          const { clinicAppointments: appts } = await import("@shared/schema");
          
          const appointments = await db
            .select()
            .from(appts)
            .where(
              and(
                eq(appts.providerId, mapping.providerId),
                gte(appts.appointmentDate, syncStartDate),
                lte(appts.appointmentDate, syncEndDate),
                sql`${appts.status} NOT IN ('cancelled', 'no_show')`
              )
            );
          
          for (const apt of appointments) {
            try {
              const startDateTime = `${apt.appointmentDate}T${apt.startTime}:00`;
              const endDateTime = `${apt.appointmentDate}T${apt.endTime}:00`;
              
              await calcom.createOutOfOffice({
                start: startDateTime,
                end: endDateTime,
                notes: `Clinic appointment: ${apt.id}`,
              });
              totalBlocks++;
            } catch (err: any) {
              if (!err.message?.includes('already exists')) {
                allErrors.push(`Appointment ${apt.id}: ${err.message}`);
              }
            }
          }
        }
        
        if (config.syncTimebutlerAbsences) {
          const absences = await storage.getProviderAbsences(hospitalId, syncStartDate, syncEndDate);
          const providerAbsences = absences.filter(a => a.providerId === mapping.providerId);
          
          for (const absence of providerAbsences) {
            try {
              await calcom.createOutOfOffice({
                start: `${absence.startDate}T00:00:00`,
                end: `${absence.endDate}T23:59:59`,
                notes: `Timebutler: ${absence.absenceType}`,
              });
              totalBlocks++;
            } catch (err: any) {
              if (!err.message?.includes('already exists')) {
                allErrors.push(`Absence ${absence.id}: ${err.message}`);
              }
            }
          }
        }
      } catch (err: any) {
        allErrors.push(`Provider ${mapping.providerId}: ${err.message}`);
      }
    }
    
    await storage.upsertCalcomConfig({
      ...config,
      lastSyncAt: new Date(),
      lastSyncError: allErrors.length > 0 ? allErrors.slice(0, 5).join('; ') : null,
    });
    
    res.json({
      success: true,
      syncedBlocks: totalBlocks,
      providersProcessed: enabledMappings.length,
      errors: allErrors.slice(0, 10),
    });
  } catch (error: any) {
    console.error("Error syncing to Cal.com:", error);
    res.status(500).json({ message: "Failed to sync to Cal.com", error: error.message });
  }
});

// Trigger Cal.com sync for a specific provider (push appointments + absences as busy blocks)
router.post('/api/clinic/:hospitalId/calcom-sync/:providerId', isAuthenticated, isClinicAccess, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, providerId } = req.params;
    const { startDate, endDate } = req.body;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.isEnabled || !config.apiKey) {
      return res.status(400).json({ message: "Cal.com is not configured or enabled" });
    }
    
    const mapping = await storage.getCalcomProviderMapping(hospitalId, providerId);
    if (!mapping || !mapping.isEnabled) {
      return res.status(400).json({ message: "Provider is not mapped to Cal.com" });
    }
    
    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);
    
    const syncStartDate = startDate || new Date().toISOString().split('T')[0];
    const syncEndDateObj = new Date();
    syncEndDateObj.setMonth(syncEndDateObj.getMonth() + 3);
    const syncEndDate = endDate || syncEndDateObj.toISOString().split('T')[0];
    
    const blocksCreated: string[] = [];
    const errors: string[] = [];
    
    if (config.syncBusyBlocks) {
      const { clinicAppointments: appts } = await import("@shared/schema");
      
      const appointments = await db
        .select()
        .from(appts)
        .where(
          and(
            eq(appts.providerId, providerId),
            gte(appts.appointmentDate, syncStartDate),
            lte(appts.appointmentDate, syncEndDate),
            sql`${appts.status} NOT IN ('cancelled', 'no_show')`
          )
        );
      
      for (const apt of appointments) {
        try {
          const startDateTime = `${apt.appointmentDate}T${apt.startTime}:00`;
          const endDateTime = `${apt.appointmentDate}T${apt.endTime}:00`;
          
          await calcom.createOutOfOffice({
            start: startDateTime,
            end: endDateTime,
            notes: `Clinic appointment: ${apt.id}`,
          });
          blocksCreated.push(apt.id);
        } catch (err: any) {
          errors.push(`Appointment ${apt.id}: ${err.message}`);
        }
      }
    }
    
    if (config.syncTimebutlerAbsences) {
      const absences = await storage.getProviderAbsences(hospitalId, syncStartDate, syncEndDate);
      const providerAbsences = absences.filter(a => a.providerId === providerId);
      
      for (const absence of providerAbsences) {
        try {
          await calcom.createOutOfOffice({
            start: `${absence.startDate}T00:00:00`,
            end: `${absence.endDate}T23:59:59`,
            notes: `Timebutler: ${absence.absenceType}`,
          });
          blocksCreated.push(`absence-${absence.id}`);
        } catch (err: any) {
          errors.push(`Absence ${absence.id}: ${err.message}`);
        }
      }
    }
    
    await storage.upsertCalcomConfig({
      ...config,
      lastSyncAt: new Date(),
      lastSyncError: errors.length > 0 ? errors.join('; ') : null,
    });
    
    res.json({
      success: true,
      blocksCreated: blocksCreated.length,
      errors,
    });
  } catch (error: any) {
    console.error("Error syncing to Cal.com:", error);
    res.status(500).json({ message: "Failed to sync to Cal.com", error: error.message });
  }
});

// Cal.com webhook endpoint (receives booking notifications from Cal.com)
router.post('/api/webhooks/calcom/:hospitalId', async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { triggerEvent, payload } = req.body;
    
    console.log(`Cal.com webhook received: ${triggerEvent}`, JSON.stringify(payload, null, 2));
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.isEnabled) {
      return res.status(400).json({ message: "Cal.com integration not enabled" });
    }
    
    if (triggerEvent === 'BOOKING_CREATED') {
      const { startTime, endTime, eventTypeId, attendees, metadata } = payload;
      
      const mappings = await storage.getCalcomProviderMappings(hospitalId);
      const mapping = mappings.find(m => m.calcomEventTypeId === String(eventTypeId));
      
      if (!mapping) {
        console.warn(`No provider mapping found for event type ${eventTypeId}`);
        return res.json({ received: true, processed: false, reason: 'No provider mapping' });
      }
      
      const attendee = attendees?.[0];
      if (!attendee) {
        return res.json({ received: true, processed: false, reason: 'No attendee' });
      }
      
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);
      
      const appointmentDate = startDate.toISOString().split('T')[0];
      const startTimeStr = startDate.toISOString().split('T')[1].substring(0, 5);
      const endTimeStr = endDate.toISOString().split('T')[1].substring(0, 5);
      
      let patientId: string | null = null;
      
      if (attendee.email) {
        const { patients: patientsTable } = await import("@shared/schema");
        const [existingPatient] = await db
          .select()
          .from(patientsTable)
          .where(
            and(
              eq(patientsTable.hospitalId, hospitalId),
              eq(patientsTable.email, attendee.email)
            )
          )
          .limit(1);
        
        if (existingPatient) {
          patientId = existingPatient.id;
        } else {
          const nameParts = (attendee.name || '').split(' ');
          const firstName = nameParts[0] || 'Unknown';
          const surname = nameParts.slice(1).join(' ') || 'Patient';
          
          const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId)).limit(1);
          
          const countResult = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(patients)
            .where(eq(patients.hospitalId, hospitalId));
          const patientCount = countResult[0]?.count || 0;
          
          const [newPatient] = await db
            .insert(patients)
            .values({
              hospitalId,
              firstName,
              surname,
              email: attendee.email,
              patientNumber: `P-${String(patientCount + 1).padStart(5, '0')}`,
              birthday: '1900-01-01',
              sex: 'O',
            })
            .returning();
          
          patientId = newPatient.id;
        }
      }
      
      if (!patientId) {
        return res.json({ received: true, processed: false, reason: 'Could not create/find patient' });
      }
      
      const { clinicAppointments: appts } = await import("@shared/schema");
      const { units: unitsTable } = await import("@shared/schema");
      
      const [clinicUnit] = await db
        .select()
        .from(unitsTable)
        .where(
          and(
            eq(unitsTable.hospitalId, hospitalId),
            eq(unitsTable.isClinicModule, true)
          )
        )
        .limit(1);
      
      if (!clinicUnit) {
        return res.json({ received: true, processed: false, reason: 'No clinic unit found' });
      }
      
      const [appointment] = await db
        .insert(appts)
        .values({
          hospitalId,
          unitId: clinicUnit.id,
          patientId,
          providerId: mapping.providerId,
          appointmentDate,
          startTime: startTimeStr,
          endTime: endTimeStr,
          status: 'scheduled',
          notes: `Booked via Cal.com (RetellAI). Booking ID: ${payload.uid}`,
        })
        .returning();
      
      console.log(`Created appointment ${appointment.id} from Cal.com booking ${payload.uid}`);
      
      res.json({ received: true, processed: true, appointmentId: appointment.id });
    } else if (triggerEvent === 'BOOKING_CANCELLED') {
      res.json({ received: true, processed: false, reason: 'Cancellation handling not implemented' });
    } else {
      res.json({ received: true, processed: false, reason: `Unknown event: ${triggerEvent}` });
    }
  } catch (error: any) {
    console.error("Error processing Cal.com webhook:", error);
    res.status(500).json({ message: "Failed to process webhook", error: error.message });
  }
});

// Test Cal.com API connection
router.post('/api/clinic/:hospitalId/calcom-test', isAuthenticated, isClinicAccess, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const config = await storage.getCalcomConfig(hospitalId);
    if (!config?.apiKey) {
      return res.status(400).json({ message: "Cal.com API key not configured" });
    }
    
    const { createCalcomClient } = await import("../services/calcomClient");
    const calcom = createCalcomClient(config.apiKey);
    
    const eventTypes = await calcom.getEventTypes();
    
    res.json({
      success: true,
      message: "Cal.com API connection successful",
      eventTypes,
    });
  } catch (error: any) {
    console.error("Error testing Cal.com connection:", error);
    res.status(400).json({ 
      success: false, 
      message: "Failed to connect to Cal.com API",
      error: error.message 
    });
  }
});

export default router;
