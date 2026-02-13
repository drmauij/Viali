import { Router } from "express";
import Stripe from "stripe";
import { storage, db } from "../storage";
import { hospitals, anesthesiaRecords, surgeries, termsAcceptances, users, billingInvoices, scheduledJobs } from "@shared/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { Resend } from "resend";
import { jsPDF } from "jspdf";
import { ObjectStorageService } from "../objectStorage";
import { randomUUID } from "crypto";
import logger from "../logger";

const objectStorageService = new ObjectStorageService();

const router = Router();

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated && req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Unauthorized" });
}

async function requireAdminRoleCheck(req: any, res: any, next: any) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalRoles = userHospitals.filter((h: any) => h.id === hospitalId);
    const hasAdminRole = hospitalRoles.some((h: any) => h.role === "admin");

    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    logger.error("Error checking admin role:", error);
    res.status(500).json({ message: "Failed to verify permissions" });
  }
}

async function countAnesthesiaRecordsForHospital(
  hospitalId: string,
  startDate: Date,
  endDate?: Date
): Promise<number> {
  const conditions = [eq(surgeries.hospitalId, hospitalId), gte(anesthesiaRecords.createdAt, startDate)];
  if (endDate) {
    conditions.push(lt(anesthesiaRecords.createdAt, endDate));
  }

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(anesthesiaRecords)
    .innerJoin(surgeries, eq(anesthesiaRecords.surgeryId, surgeries.id))
    .where(and(...conditions));

  return result?.count || 0;
}

router.get("/api/billing/:hospitalId/status", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const stripe = getStripe();
    let paymentMethod = null;

    if (stripe && hospital.stripeCustomerId && hospital.stripePaymentMethodId) {
      try {
        paymentMethod = await stripe.paymentMethods.retrieve(hospital.stripePaymentMethodId);
      } catch (e) {
        logger.error("Failed to retrieve payment method:", e);
      }
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthRecords = await countAnesthesiaRecordsForHospital(hospitalId, startOfMonth);
    
    // Calculate price per record including base price and per-record add-ons
    // Note: questionnaire and surgery are now included in the base fee (no extra charge)
    const basePrice = hospital.pricePerRecord ? parseFloat(hospital.pricePerRecord) : 6.00;
    const dispocuraAddOn = hospital.addonDispocura ? 1.00 : 0;
    const monitorAddOn = hospital.addonMonitor ? 1.00 : 0;
    const pricePerRecord = basePrice + dispocuraAddOn + monitorAddOn;
    
    // Calculate flat monthly add-ons
    const worktimeAddOn = hospital.addonWorktime ? 5.00 : 0;
    const logisticsAddOn = hospital.addonLogistics ? 5.00 : 0;
    const clinicAddOn = hospital.addonClinic ? 10.00 : 0;
    const retellAddOn = hospital.addonRetell ? 15.00 : 0;
    const monthlyFees = worktimeAddOn + logisticsAddOn + clinicAddOn + retellAddOn;
    
    const estimatedCost = (currentMonthRecords * pricePerRecord) + monthlyFees;

    // Calculate trial status for "test" license type (15 day trial)
    const TRIAL_DAYS = 15;
    let trialInfo: {
      trialEndsAt: string | null;
      trialDaysRemaining: number | null;
      trialExpired: boolean;
    } = {
      trialEndsAt: null,
      trialDaysRemaining: null,
      trialExpired: false,
    };

    if (hospital.licenseType === "test") {
      // If no trialStartDate, consider trial expired (forces payment setup)
      if (!hospital.trialStartDate) {
        trialInfo = {
          trialEndsAt: null,
          trialDaysRemaining: 0,
          trialExpired: true,
        };
      } else {
        const trialStartDate = new Date(hospital.trialStartDate);
        const trialEndsAt = new Date(trialStartDate);
        trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
        
        const msRemaining = trialEndsAt.getTime() - now.getTime();
        const daysRemaining = Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
        
        trialInfo = {
          trialEndsAt: trialEndsAt.toISOString(),
          trialDaysRemaining: daysRemaining,
          trialExpired: msRemaining <= 0,
        };
      }
      
      // Auto-upgrade to basic if trial expired and payment method exists
      if (trialInfo.trialExpired && hospital.stripePaymentMethodId) {
        await db
          .update(hospitals)
          .set({ licenseType: "basic" })
          .where(eq(hospitals.id, hospitalId));
        
        // Return response with updated license type
        res.json({
          licenseType: "basic",
          hasPaymentMethod: true,
          stripeCustomerId: hospital.stripeCustomerId,
          paymentMethod: paymentMethod
            ? {
                brand: paymentMethod.card?.brand,
                last4: paymentMethod.card?.last4,
                expMonth: paymentMethod.card?.exp_month,
                expYear: paymentMethod.card?.exp_year,
              }
            : null,
          pricePerRecord,
          currentMonthRecords,
          estimatedCost,
          billingRequired: false,
          trialEndsAt: null,
          trialDaysRemaining: null,
          trialExpired: false,
          addons: {
            questionnaire: true, // Always included in base fee
            dispocura: hospital.addonDispocura ?? false,
            retell: hospital.addonRetell ?? false,
            monitor: hospital.addonMonitor ?? false,
            surgery: true, // Always included in base fee
            worktime: hospital.addonWorktime ?? false,
            logistics: hospital.addonLogistics ?? false,
            clinic: hospital.addonClinic ?? false,
          },
          questionnaireDisabled: hospital.questionnaireDisabled ?? false,
        });
        return;
      }
    }

    // Determine if billing (payment method) is required
    // - free: never required
    // - test (within trial): not required yet
    // - test (expired without payment): required
    // - basic: required if no payment method
    // Note: if test account has payment method but trial expired, they should have been auto-upgraded to basic
    const billingRequired = 
      hospital.licenseType === "free" ? false :
      hospital.licenseType === "test" ? trialInfo.trialExpired && !hospital.stripePaymentMethodId :
      !hospital.stripePaymentMethodId;

    // Determine addon access:
    // - free: always full access
    // - test (within trial): full access
    // - test (expired) or basic: use database values
    const hasFullAccess = 
      hospital.licenseType === "free" || 
      (hospital.licenseType === "test" && !trialInfo.trialExpired);

    res.json({
      licenseType: hospital.licenseType,
      hasPaymentMethod: !!hospital.stripePaymentMethodId,
      stripeCustomerId: hospital.stripeCustomerId,
      paymentMethod: paymentMethod
        ? {
            brand: paymentMethod.card?.brand,
            last4: paymentMethod.card?.last4,
            expMonth: paymentMethod.card?.exp_month,
            expYear: paymentMethod.card?.exp_year,
          }
        : null,
      pricePerRecord,
      currentMonthRecords,
      estimatedCost,
      billingRequired,
      ...trialInfo,
      addons: hasFullAccess 
        ? {
            questionnaire: true,
            dispocura: true,
            retell: true,
            monitor: true,
            surgery: true,
            worktime: true,
            logistics: true,
            clinic: true,
          }
        : {
            questionnaire: true, // Always included in base fee
            dispocura: hospital.addonDispocura ?? false,
            retell: hospital.addonRetell ?? false,
            monitor: hospital.addonMonitor ?? false,
            surgery: true, // Always included in base fee
            worktime: hospital.addonWorktime ?? false,
            logistics: hospital.addonLogistics ?? false,
            clinic: hospital.addonClinic ?? false,
          },
      questionnaireDisabled: hospital.questionnaireDisabled ?? false,
    });
  } catch (error) {
    logger.error("Error fetching billing status:", error);
    res.status(500).json({ message: "Failed to fetch billing status" });
  }
});

router.patch("/api/billing/:hospitalId/addons", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { addon, enabled } = req.body;

    // Note: questionnaire and surgery are now included in base fee, not toggleable
    const validAddons = ["dispocura", "retell", "monitor", "worktime", "logistics", "clinic"];
    if (!validAddons.includes(addon)) {
      return res.status(400).json({ message: "Invalid addon type" });
    }

    const columnMap: Record<string, any> = {
      dispocura: { addonDispocura: enabled },
      retell: { addonRetell: enabled },
      monitor: { addonMonitor: enabled },
      worktime: { addonWorktime: enabled },
      logistics: { addonLogistics: enabled },
      clinic: { addonClinic: enabled },
    };

    await db
      .update(hospitals)
      .set(columnMap[addon])
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true, addon, enabled });
  } catch (error) {
    logger.error("Error updating addon:", error);
    res.status(500).json({ message: "Failed to update addon" });
  }
});

router.post("/api/billing/:hospitalId/setup-intent", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const stripe = getStripe();

    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Enforce terms acceptance for non-free plans
    if (hospital.licenseType !== "free") {
      const [termsAcceptance] = await db
        .select()
        .from(termsAcceptances)
        .where(and(
          eq(termsAcceptances.hospitalId, hospitalId),
          eq(termsAcceptances.version, CURRENT_TERMS_VERSION)
        ))
        .limit(1);
      
      if (!termsAcceptance) {
        return res.status(400).json({ message: "Terms of Service must be accepted before setting up payment" });
      }
    }

    let stripeCustomerId = hospital.stripeCustomerId;

    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        name: hospital.name,
        email: hospital.companyEmail || undefined,
        metadata: {
          hospitalId: hospital.id,
        },
      });
      stripeCustomerId = customer.id;

      await db
        .update(hospitals)
        .set({ stripeCustomerId })
        .where(eq(hospitals.id, hospitalId));
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      payment_method_types: ["card"],
      metadata: {
        hospitalId,
      },
    });

    res.json({
      clientSecret: setupIntent.client_secret,
      customerId: stripeCustomerId,
    });
  } catch (error) {
    logger.error("Error creating setup intent:", error);
    res.status(500).json({ message: "Failed to create setup intent" });
  }
});

router.post("/api/billing/:hospitalId/confirm-setup", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { paymentMethodId } = req.body;

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    // Enforce terms acceptance for non-free plans
    if (hospital.licenseType !== "free") {
      const [termsAcceptance] = await db
        .select()
        .from(termsAcceptances)
        .where(and(
          eq(termsAcceptances.hospitalId, hospitalId),
          eq(termsAcceptances.version, CURRENT_TERMS_VERSION)
        ))
        .limit(1);
      
      if (!termsAcceptance) {
        return res.status(400).json({ message: "Terms of Service must be accepted before setting up payment" });
      }
    }

    if (!hospital.stripeCustomerId) {
      return res.status(400).json({ message: "No Stripe customer found" });
    }

    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: hospital.stripeCustomerId,
    });

    await stripe.customers.update(hospital.stripeCustomerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Auto-upgrade from "test" to "basic" when payment method is saved (free accounts stay free)
    const updateData: Record<string, any> = { stripePaymentMethodId: paymentMethodId };
    if (hospital.licenseType === "test") {
      updateData.licenseType = "basic";
    }

    await db
      .update(hospitals)
      .set(updateData)
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true, upgraded: hospital.licenseType === "test" });
  } catch (error) {
    logger.error("Error confirming setup:", error);
    res.status(500).json({ message: "Failed to confirm payment setup" });
  }
});

router.delete("/api/billing/:hospitalId/payment-method", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    if (hospital.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(hospital.stripePaymentMethodId);
      } catch (e) {
        logger.error("Failed to detach payment method:", e);
      }
    }

    await db
      .update(hospitals)
      .set({ stripePaymentMethodId: null })
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true });
  } catch (error) {
    logger.error("Error removing payment method:", error);
    res.status(500).json({ message: "Failed to remove payment method" });
  }
});

router.post("/api/billing/:hospitalId/portal-session", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const stripe = getStripe();

    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital || !hospital.stripeCustomerId) {
      return res.status(400).json({ message: "No Stripe customer found" });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: hospital.stripeCustomerId,
      return_url: `${req.protocol}://${req.get("host")}/admin/billing`,
    });

    res.json({ url: session.url });
  } catch (error) {
    logger.error("Error creating portal session:", error);
    res.status(500).json({ message: "Failed to create portal session" });
  }
});

router.get("/api/billing/:hospitalId/usage", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { year, month } = req.query;

    const userId = req.user.id;
    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const targetYear = year ? parseInt(year as string) : new Date().getFullYear();
    const targetMonth = month ? parseInt(month as string) - 1 : new Date().getMonth();

    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 1);

    const recordCount = await countAnesthesiaRecordsForHospital(hospitalId, startOfMonth, endOfMonth);
    const pricePerRecord = hospital.pricePerRecord ? parseFloat(hospital.pricePerRecord) : 0;
    const totalCost = recordCount * pricePerRecord;

    res.json({
      year: targetYear,
      month: targetMonth + 1,
      recordCount,
      pricePerRecord,
      totalCost,
    });
  } catch (error) {
    logger.error("Error fetching usage:", error);
    res.status(500).json({ message: "Failed to fetch usage" });
  }
});

router.post("/api/billing/:hospitalId/charge-month", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { year, month } = req.body;

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    if (!hospital.stripeCustomerId || !hospital.stripePaymentMethodId) {
      return res.status(400).json({ message: "No payment method configured" });
    }

    const pricePerRecord = hospital.pricePerRecord ? parseFloat(hospital.pricePerRecord) : 0;
    if (pricePerRecord <= 0) {
      return res.status(400).json({ message: "No price per record configured" });
    }

    const targetYear = year || new Date().getFullYear();
    const targetMonth = month ? month - 1 : new Date().getMonth() - 1;

    const startOfMonth = new Date(targetYear, targetMonth, 1);
    const endOfMonth = new Date(targetYear, targetMonth + 1, 1);

    const recordCount = await countAnesthesiaRecordsForHospital(hospitalId, startOfMonth, endOfMonth);
    if (recordCount === 0) {
      return res.json({ message: "No records to charge", amount: 0 });
    }

    const totalAmount = Math.round(recordCount * pricePerRecord * 100);

    const monthName = startOfMonth.toLocaleString("default", { month: "long", year: "numeric" });

    const invoice = await stripe.invoices.create({
      customer: hospital.stripeCustomerId,
      collection_method: "charge_automatically",
      auto_advance: true,
      metadata: {
        hospitalId,
        year: targetYear.toString(),
        month: (targetMonth + 1).toString(),
      },
    });

    await stripe.invoiceItems.create({
      customer: hospital.stripeCustomerId,
      invoice: invoice.id,
      amount: totalAmount,
      currency: "chf",
      description: `Anesthesia Records - ${monthName} (${recordCount} records @ CHF ${pricePerRecord.toFixed(2)})`,
    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    const paidInvoice = await stripe.invoices.pay(finalizedInvoice.id);

    res.json({
      success: true,
      invoiceId: paidInvoice.id,
      invoiceNumber: paidInvoice.number,
      amount: totalAmount / 100,
      recordCount,
      status: paidInvoice.status,
    });
  } catch (error: any) {
    logger.error("Error charging month:", error);
    res.status(500).json({ message: error.message || "Failed to charge month" });
  }
});

router.get("/api/billing/:hospitalId/invoices", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const userId = req.user.id;
    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const stripe = getStripe();
    if (!stripe) {
      return res.status(400).json({ message: "Stripe is not configured" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital || !hospital.stripeCustomerId) {
      return res.json({ invoices: [] });
    }

    const invoices = await stripe.invoices.list({
      customer: hospital.stripeCustomerId,
      limit: 24,
    });

    res.json({
      invoices: invoices.data.map((inv) => ({
        id: inv.id,
        number: inv.number,
        status: inv.status,
        amount: (inv.amount_due || 0) / 100,
        currency: inv.currency,
        created: new Date(inv.created * 1000).toISOString(),
        pdfUrl: inv.invoice_pdf,
        hostedUrl: inv.hosted_invoice_url,
      })),
    });
  } catch (error) {
    logger.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// Terms of Service routes
const CURRENT_TERMS_VERSION = "1.0";

// All legal document types that must be signed
const LEGAL_DOCUMENT_TYPES = ["terms", "privacy", "avv"] as const;
type LegalDocumentType = typeof LEGAL_DOCUMENT_TYPES[number];

const DOCUMENT_LABELS: Record<LegalDocumentType, { de: string; en: string }> = {
  terms: { de: "Nutzungsbedingungen", en: "Terms of Service" },
  privacy: { de: "Datenschutzerklärung", en: "Privacy Policy" },
  avv: { de: "Auftragsverarbeitungsvertrag", en: "Data Processing Agreement" },
};

router.get("/api/billing/:hospitalId/terms-status", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Fetch all document acceptances for this hospital
    const acceptances = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.hospitalId, hospitalId),
        eq(termsAcceptances.version, CURRENT_TERMS_VERSION)
      ))
      .orderBy(desc(termsAcceptances.signedAt));

    // Build status for each document type
    const documents: Record<string, any> = {};
    for (const docType of LEGAL_DOCUMENT_TYPES) {
      const acceptance = acceptances.find((a) => a.documentType === docType);
      documents[docType] = {
        hasAccepted: !!acceptance,
        acceptance: acceptance ? {
          id: acceptance.id,
          signedAt: acceptance.signedAt,
          signedByName: acceptance.signedByName,
          signedByEmail: acceptance.signedByEmail,
          countersignedAt: acceptance.countersignedAt,
          countersignedByName: acceptance.countersignedByName,
          hasPdf: !!acceptance.pdfUrl,
        } : null,
      };
    }

    // Check if all documents are signed
    const allAccepted = LEGAL_DOCUMENT_TYPES.every((docType) => documents[docType].hasAccepted);

    // For backward compatibility, also return hasAccepted based on terms document
    const termsAcceptance = acceptances.find((a) => a.documentType === "terms");

    res.json({
      hasAccepted: allAccepted,
      currentVersion: CURRENT_TERMS_VERSION,
      documents,
      documentTypes: LEGAL_DOCUMENT_TYPES,
      documentLabels: DOCUMENT_LABELS,
      acceptance: termsAcceptance ? {
        id: termsAcceptance.id,
        signedAt: termsAcceptance.signedAt,
        signedByName: termsAcceptance.signedByName,
        signedByEmail: termsAcceptance.signedByEmail,
        countersignedAt: termsAcceptance.countersignedAt,
        countersignedByName: termsAcceptance.countersignedByName,
        hasPdf: !!termsAcceptance.pdfUrl,
      } : null,
    });
  } catch (error) {
    logger.error("Error fetching terms status:", error);
    res.status(500).json({ message: "Failed to fetch terms status" });
  }
});

// Generate preview PDF for a document (unsigned, for sharing via WhatsApp etc.)
router.get("/api/billing/preview-pdf/:documentType", async (req: any, res) => {
  try {
    const { documentType } = req.params;
    const lang = (req.query.lang as string) || "de";
    const isGerman = lang === "de";

    if (!LEGAL_DOCUMENT_TYPES.includes(documentType as LegalDocumentType)) {
      return res.status(400).json({ message: "Invalid document type" });
    }

    const docLabel = DOCUMENT_LABELS[documentType as LegalDocumentType];
    const version = "1.0";

    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 20;

    const checkNewPage = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - 20) {
        pdf.addPage();
        y = 20;
      }
    };

    // Title
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${isGerman ? docLabel.de : docLabel.en} - Viali.app`, pageWidth / 2, y, { align: "center" });
    y += 10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Version: ${version}`, pageWidth / 2, y, { align: "center" });
    y += 5;
    pdf.text(isGerman ? "VORSCHAU - NICHT UNTERSCHRIEBEN" : "PREVIEW - NOT SIGNED", pageWidth / 2, y, { align: "center" });
    y += 15;

    // Add document-specific content
    const addSection = (title: string, items: string[]) => {
      checkNewPage(10 + items.length * 6);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, 15, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      items.forEach((item) => {
        const lines = pdf.splitTextToSize(item, pageWidth - 30);
        lines.forEach((line: string) => {
          checkNewPage(6);
          pdf.text(line, 15, y);
          y += 5;
        });
      });
      y += 5;
    };

    // Document-specific content based on type - EXACT match with React components
    if (documentType === "terms") {
      // Terms of Service - matches TermsOfUseContent.tsx
      addSection(isGerman ? "1. Anbieter" : "1. Provider", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "Service: https://use.viali.app",
      ]);
      addSection(isGerman ? "2. Leistungen" : "2. Services", [
        isGerman ? "Digitale Anästhesie-Protokolle (Pre-OP, OP, PACU)" : "Digital anesthesia protocols (Pre-OP, OP, PACU)",
        isGerman ? "Bestandsverwaltungssystem (Medikamente, Material, BTM)" : "Inventory management (medications, materials, controlled substances)",
        isGerman ? "Cloud-Hosting inklusive (Exoscale Shared Server, Schweiz)" : "Cloud hosting included (Exoscale Shared Server, Switzerland)",
        isGerman ? "Backups & Updates" : "Backups & updates",
        isGerman ? "Optionale Zusatzmodule (siehe Preisübersicht im Abrechnungsbereich)" : "Optional add-on modules (see pricing overview in billing section)",
      ]);
      addSection(isGerman ? "3. Abrechnung & Zahlung" : "3. Billing & Payment", [
        isGerman ? "Aktuelle Preise werden im Abrechnungsbereich angezeigt" : "Current pricing is displayed in the billing section",
        isGerman ? "Monatliche Abrechnung nach tatsächlicher Nutzung" : "Monthly billing based on actual usage",
        isGerman ? "Zahlung per Kreditkarte (in-app)" : "Credit card payment (in-app)",
        isGerman ? "Alle Preise verstehen sich netto. MwSt. kann je nach Standort anfallen" : "All prices are net. VAT may apply depending on location",
        isGerman ? "Monatlich kündbar" : "Monthly cancellation possible",
        isGerman ? "Preisänderungen mit 3 Monaten Ankündigungsfrist" : "Price changes with 3 months notice",
      ]);
      addSection(isGerman ? "4. Dateneigentum & Datenschutz" : "4. Data Ownership & Privacy", [
        isGerman ? "Patientendaten bleiben ausschließliches Eigentum der Klinik" : "Patient data remains exclusive property of the clinic",
        isGerman ? "Unterliegt der Schweizer DSGVO-Gesetzgebung" : "Subject to Swiss GDPR legislation",
        isGerman ? "Gehostet auf Exoscale-Servern (Schweiz)" : "Hosted on Exoscale servers (Switzerland)",
      ]);
      addSection(isGerman ? "5. Sicherheit & Haftungsbeschränkung" : "5. Security & Limitation of Liability", [
        isGerman ? "Anbieter implementiert angemessene Sicherheitsmaßnahmen und regelmäßige Backups" : "Provider implements reasonable security measures and regular backups",
        isGerman ? "Keine Haftung für Datenverlust, Sicherheitsverletzungen oder Schäden durch Software-Fehler oder unsachgemäße Kontonutzung" : "No liability for data loss, breaches, or damages from software bugs or improper account use",
        isGerman ? "Maximale Haftung begrenzt auf die in den letzten 12 Monaten gezahlten Gebühren" : "Maximum liability limited to fees paid in prior 12 months",
      ]);
      addSection(isGerman ? "6. Support" : "6. Support", [
        isGerman ? "Kritische Events: 2h erste Reaktion" : "Critical events: 2h initial response",
        isGerman ? "Mo-Fr 8-18 Uhr CET via In-App/E-Mail" : "Mon-Fri 8-18 CET via in-app/email",
      ]);
      addSection(isGerman ? "7. Gerichtsstand" : "7. Jurisdiction", [
        isGerman ? "Für alle Streitigkeiten sind die Gerichte in Konstanz, Deutschland zuständig." : "All disputes are handled by the courts in Konstanz, Germany.",
      ]);
    } else if (documentType === "privacy") {
      // Privacy Policy - matches PrivacyPolicyContent.tsx
      addSection(isGerman ? "1. Verantwortlicher" : "1. Data Controller", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "E-Mail: info@acutiq.com",
      ]);
      addSection(isGerman ? "2. Erhobene Daten" : "2. Data Collected", [
        isGerman ? "Benutzerdaten: Name, E-Mail-Adresse, Rolle, Krankenhauszugehörigkeit" : "User data: Name, email address, role, hospital affiliation",
        isGerman ? "Patientendaten: Gemäß den Anforderungen des medizinischen Dokumentationsbedarfs" : "Patient data: According to medical documentation requirements",
        isGerman ? "Protokolldaten: Zugriffsprotokolle, Aktivitätsprotokolle zur Systemsicherheit" : "Log data: Access logs, activity logs for system security",
        isGerman ? "Medizinische Dokumentation: Anästhesieprotokolle, Vitalzeichen, Medikation" : "Medical documentation: Anesthesia records, vital signs, medication",
      ]);
      addSection(isGerman ? "3. Zweck der Datenverarbeitung" : "3. Purpose of Data Processing", [
        isGerman ? "Bereitstellung der Anästhesie-Dokumentationsdienste" : "Provision of anesthesia documentation services",
        isGerman ? "Benutzerauthentifizierung und Zugangskontrolle" : "User authentication and access control",
        isGerman ? "Abrechnung und Vertragsabwicklung" : "Billing and contract processing",
        isGerman ? "Verbesserung der Servicequalität" : "Service quality improvement",
        isGerman ? "Einhaltung gesetzlicher Aufbewahrungspflichten" : "Compliance with legal retention requirements",
      ]);
      addSection(isGerman ? "4. Datenspeicherung" : "4. Data Storage", [
        isGerman ? "Alle Daten werden auf Servern von Exoscale in der Schweiz gespeichert" : "All data is stored on Exoscale servers in Switzerland",
        isGerman ? "Datenbank: Exoscale PostgreSQL (Schweiz)" : "Database: Exoscale PostgreSQL (Switzerland)",
        isGerman ? "Verschlüsselung: Daten werden im Ruhezustand und bei der Übertragung verschlüsselt" : "Encryption: Data is encrypted at rest and in transit",
        isGerman ? "Regelmäßige automatische Backups" : "Regular automatic backups",
      ]);
      addSection(isGerman ? "5. Betroffenenrechte" : "5. Data Subject Rights", [
        isGerman ? "Auskunftsrecht: Sie haben das Recht zu erfahren, welche Daten über Sie gespeichert sind" : "Right of access: You have the right to know what data is stored about you",
        isGerman ? "Berichtigungsrecht: Sie können die Korrektur unrichtiger Daten verlangen" : "Right to rectification: You can request correction of inaccurate data",
        isGerman ? "Löschungsrecht: Sie können die Löschung Ihrer Daten verlangen (unter Berücksichtigung gesetzlicher Aufbewahrungspflichten)" : "Right to erasure: You can request deletion of your data (subject to legal retention requirements)",
        isGerman ? "Datenübertragbarkeit: Sie können Ihre Daten in einem maschinenlesbaren Format anfordern" : "Data portability: You can request your data in a machine-readable format",
        isGerman ? "Widerspruchsrecht: Sie können der Datenverarbeitung widersprechen" : "Right to object: You can object to data processing",
      ]);
      addSection(isGerman ? "6. Datenweitergabe" : "6. Data Sharing", [
        isGerman ? "Patientendaten werden nicht an Dritte weitergegeben" : "Patient data is not shared with third parties",
        isGerman ? "Auftragsverarbeiter: Stripe (Zahlungsabwicklung), Exoscale (Hosting & Datenbank), Resend (E-Mail-Versand), Vonage (SMS-Kommunikation)" : "Processors: Stripe (payment processing), Exoscale (hosting & database), Resend (email delivery), Vonage (SMS communications)",
        isGerman ? "Alle Auftragsverarbeiter erfüllen die DSGVO-Anforderungen" : "All processors comply with GDPR requirements",
      ]);
      addSection(isGerman ? "7. DSG/DSGVO-Konformität" : "7. DSG/GDPR Compliance", [
        isGerman ? "Viali.app entspricht dem Schweizer Datenschutzgesetz (DSG) und der EU-DSGVO" : "Viali.app complies with Swiss Data Protection Act (DSG) and EU GDPR",
        isGerman ? "Auftragsverarbeitungsverträge (AVV) mit allen Unterauftragsverarbeitern" : "Data Processing Agreements (DPA) with all subprocessors",
        isGerman ? "Privacy by Design und Privacy by Default" : "Privacy by Design and Privacy by Default",
      ]);
      addSection(isGerman ? "8. Kontakt" : "8. Contact", [
        isGerman ? "Bei Fragen zum Datenschutz kontaktieren Sie uns unter: info@acutiq.com" : "For privacy questions, contact us at: info@acutiq.com",
      ]);
    } else if (documentType === "avv") {
      // AVV - matches AVVContent.tsx
      addSection(isGerman ? "1. Gegenstand und Dauer der Verarbeitung" : "1. Subject Matter and Duration of Processing", [
        isGerman ? "Dieser Auftragsverarbeitungsvertrag (AVV) regelt die Verarbeitung personenbezogener Daten durch Acutiq (Auftragsverarbeiter) im Auftrag der Klinik (Verantwortlicher) im Rahmen der Nutzung der Viali.app Plattform. Die Verarbeitung dauert für die gesamte Vertragslaufzeit." : "This Data Processing Agreement (DPA) governs the processing of personal data by Acutiq (Processor) on behalf of the clinic (Controller) in connection with the use of the Viali.app platform. Processing continues for the entire contract term.",
      ]);
      addSection(isGerman ? "2. Art und Zweck der Verarbeitung" : "2. Nature and Purpose of Processing", [
        isGerman ? "Speicherung und Verarbeitung von Anästhesie-Dokumentation" : "Storage and processing of anesthesia documentation",
        isGerman ? "Bereitstellung der webbasierten Anwendung" : "Provision of the web-based application",
        isGerman ? "Durchführung von Backups und Systemwartung" : "Performing backups and system maintenance",
        isGerman ? "Technischer Support und Fehlerbehebung" : "Technical support and troubleshooting",
      ]);
      addSection(isGerman ? "3. Art der personenbezogenen Daten" : "3. Type of Personal Data", [
        isGerman ? "Patientenstammdaten (Name, Geburtsdatum, Gewicht)" : "Patient master data (name, date of birth, weight)",
        isGerman ? "Gesundheitsdaten (Vitalzeichen, Diagnosen, Medikation)" : "Health data (vital signs, diagnoses, medication)",
        isGerman ? "Benutzerdaten (Name, E-Mail, Benutzerrolle)" : "User data (name, email, user role)",
        isGerman ? "Audit-Daten (Zugriffsprotokolle, Änderungshistorie)" : "Audit data (access logs, change history)",
      ]);
      addSection(isGerman ? "4. Kategorien betroffener Personen" : "4. Categories of Data Subjects", [
        isGerman ? "Patienten der Klinik" : "Patients of the clinic",
        isGerman ? "Mitarbeiter der Klinik (Benutzer der Anwendung)" : "Clinic employees (application users)",
      ]);
      addSection(isGerman ? "5. Pflichten des Auftragsverarbeiters" : "5. Obligations of the Processor", [
        isGerman ? "Verarbeitung nur nach dokumentierter Weisung des Verantwortlichen" : "Processing only according to documented instructions from the Controller",
        isGerman ? "Gewährleistung der Vertraulichkeit durch alle Mitarbeiter" : "Ensuring confidentiality by all employees",
        isGerman ? "Ergreifung angemessener technischer und organisatorischer Maßnahmen" : "Implementing appropriate technical and organizational measures",
        isGerman ? "Unterstützung bei der Erfüllung von Betroffenenrechten" : "Support in fulfilling data subject rights",
        isGerman ? "Meldung von Datenschutzverletzungen innerhalb von 24 Stunden" : "Notification of data breaches within 24 hours",
      ]);
      addSection(isGerman ? "6. Technische und organisatorische Maßnahmen" : "6. Technical and Organizational Measures", [
        isGerman ? "Verschlüsselung aller Daten bei Übertragung (TLS 1.3) und Speicherung" : "Encryption of all data in transit (TLS 1.3) and at rest",
        isGerman ? "Zugriffskontrolle durch rollenbasierte Berechtigungen" : "Access control through role-based permissions",
        isGerman ? "Regelmäßige Sicherheitsaudits und Penetrationstests" : "Regular security audits and penetration tests",
        isGerman ? "Automatische Backups mit Geo-Redundanz" : "Automatic backups with geo-redundancy",
        isGerman ? "Audit-Trail für alle sicherheitsrelevanten Aktionen" : "Audit trail for all security-relevant actions",
      ]);
      addSection(isGerman ? "7. Unterauftragsverarbeiter" : "7. Subprocessors", [
        isGerman ? "Folgende Unterauftragsverarbeiter werden eingesetzt:" : "The following subprocessors are used:",
        `Exoscale AG, ${isGerman ? "Schweiz" : "Switzerland"} - ${isGerman ? "Server-Hosting und Objektspeicher" : "Server hosting and object storage"}`,
        `Exoscale (${isGerman ? "Schweiz" : "Switzerland"}) - ${isGerman ? "Datenbank-Hosting" : "Database hosting"}`,
        `Stripe Inc. - ${isGerman ? "Zahlungsabwicklung (keine Patientendaten)" : "Payment processing (no patient data)"}`,
        `Resend Inc. - ${isGerman ? "E-Mail-Versand (nur Systembenachrichtigungen)" : "Email delivery (system notifications only)"}`,
        `Vonage Inc. - ${isGerman ? "SMS-Kommunikation (Terminbenachrichtigungen, keine Patientendaten)" : "SMS communications (appointment notifications, no patient data)"}`,
      ]);
      addSection(isGerman ? "8. Löschung und Rückgabe von Daten" : "8. Deletion and Return of Data", [
        isGerman ? "Nach Vertragsende: Löschung aller Daten innerhalb von 30 Tagen" : "After contract termination: Deletion of all data within 30 days",
        isGerman ? "Auf Wunsch: Export aller Daten vor Löschung" : "Upon request: Export of all data before deletion",
        isGerman ? "Schriftliche Bestätigung der Löschung auf Anfrage" : "Written confirmation of deletion upon request",
      ]);
      addSection(isGerman ? "9. Kontrollrechte" : "9. Audit Rights", [
        isGerman ? "Der Verantwortliche hat das Recht, die Einhaltung dieses Vertrags zu überprüfen. Dies kann durch Einsichtnahme in Zertifizierungen, Berichte oder nach Vereinbarung durch Vor-Ort-Audits erfolgen." : "The Controller has the right to verify compliance with this agreement. This can be done by reviewing certifications, reports, or by on-site audits upon agreement.",
      ]);
    }

    // Footer
    y += 10;
    checkNewPage(30);
    pdf.setFontSize(9);
    pdf.setTextColor(100);
    pdf.text(isGerman ? "VORSCHAU - Dieses Dokument dient nur zur Vorabinformation." : "PREVIEW - This document is for informational purposes only.", pageWidth / 2, y, { align: "center" });
    y += 5;
    pdf.text(isGerman ? "Die rechtsverbindliche Version wird bei Vertragsabschluss digital unterzeichnet." : "The legally binding version will be digitally signed upon contract conclusion.", pageWidth / 2, y, { align: "center" });

    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
    
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${documentType}_preview_${isGerman ? "de" : "en"}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    logger.error("Error generating preview PDF:", error);
    res.status(500).json({ message: "Failed to generate preview PDF" });
  }
});

// Download signed terms PDF
router.get("/api/billing/:hospitalId/terms-pdf/:acceptanceId", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, acceptanceId } = req.params;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [acceptance] = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.id, acceptanceId),
        eq(termsAcceptances.hospitalId, hospitalId)
      ))
      .limit(1);

    if (!acceptance) {
      return res.status(404).json({ message: "Terms acceptance not found" });
    }

    if (!acceptance.pdfUrl) {
      return res.status(404).json({ message: "PDF not available for this acceptance" });
    }

    await objectStorageService.downloadObject(acceptance.pdfUrl, res);
  } catch (error) {
    logger.error("Error downloading terms PDF:", error);
    res.status(500).json({ message: "Failed to download terms PDF" });
  }
});

// Regenerate PDF for existing acceptance that doesn't have one
router.post("/api/billing/:hospitalId/regenerate-pdf/:acceptanceId", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId, acceptanceId } = req.params;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [acceptance] = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.id, acceptanceId),
        eq(termsAcceptances.hospitalId, hospitalId)
      ))
      .limit(1);

    if (!acceptance) {
      return res.status(404).json({ message: "Terms acceptance not found" });
    }

    if (acceptance.pdfUrl) {
      return res.status(400).json({ message: "PDF already exists for this acceptance" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const documentType = acceptance.documentType || "terms";
    const isGerman = true; // Default to German for existing records
    const docLabel = DOCUMENT_LABELS[documentType as LegalDocumentType] || DOCUMENT_LABELS.terms;
    const signedAt = acceptance.signedAt || new Date();

    // Generate PDF
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 20;
    
    const checkNewPage = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - 20) {
        pdf.addPage();
        y = 20;
      }
    };
    
    // Title
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${isGerman ? docLabel.de : docLabel.en} - Viali.app`, pageWidth / 2, y, { align: "center" });
    y += 15;
    
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Version: ${acceptance.version}`, pageWidth / 2, y, { align: "center" });
    y += 15;

    // Add document-specific content
    const addSection = (title: string, items: string[]) => {
      checkNewPage(10 + items.length * 6);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, 15, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      items.forEach((item) => {
        const lines = pdf.splitTextToSize(item, pageWidth - 30);
        lines.forEach((line: string) => {
          checkNewPage(6);
          pdf.text(line, 15, y);
          y += 5;
        });
      });
      y += 5;
    };

    // Full document content - EXACT match with React components
    if (documentType === "terms") {
      addSection(isGerman ? "1. Anbieter" : "1. Provider", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "Service: https://use.viali.app",
      ]);
      addSection(isGerman ? "2. Leistungen" : "2. Services", [
        isGerman ? "- Digitale Anästhesie-Protokolle (Pre-OP, OP, PACU)" : "- Digital anesthesia protocols (Pre-OP, OP, PACU)",
        isGerman ? "- Bestandsverwaltungssystem (Medikamente, Material, BTM)" : "- Inventory management (medications, materials, controlled substances)",
        isGerman ? "- Cloud-Hosting inklusive (Exoscale Shared Server, Schweiz)" : "- Cloud hosting included (Exoscale Shared Server, Switzerland)",
        isGerman ? "- Backups & Updates" : "- Backups & updates",
        isGerman ? "- Optionale Zusatzmodule (siehe Preisübersicht im Abrechnungsbereich)" : "- Optional add-on modules (see pricing overview in billing section)",
      ]);
      addSection(isGerman ? "3. Abrechnung & Zahlung" : "3. Billing & Payment", [
        isGerman ? "- Aktuelle Preise werden im Abrechnungsbereich angezeigt" : "- Current pricing is displayed in the billing section",
        isGerman ? "- Monatliche Abrechnung nach tatsächlicher Nutzung" : "- Monthly billing based on actual usage",
        isGerman ? "- Zahlung per Kreditkarte (in-app)" : "- Credit card payment (in-app)",
        isGerman ? "- Alle Preise verstehen sich netto. MwSt. kann je nach Standort anfallen" : "- All prices are net. VAT may apply depending on location",
        isGerman ? "- Monatlich kündbar" : "- Monthly cancellation possible",
        isGerman ? "- Preisänderungen mit 3 Monaten Ankündigungsfrist" : "- Price changes with 3 months notice",
      ]);
      addSection(isGerman ? "4. Dateneigentum & Datenschutz" : "4. Data Ownership & Privacy", [
        isGerman ? "- Patientendaten bleiben ausschließliches Eigentum der Klinik" : "- Patient data remains exclusive property of the clinic",
        isGerman ? "- Unterliegt der Schweizer DSGVO-Gesetzgebung" : "- Subject to Swiss GDPR legislation",
        isGerman ? "- Gehostet auf Exoscale-Servern (Schweiz)" : "- Hosted on Exoscale servers (Switzerland)",
      ]);
      addSection(isGerman ? "5. Sicherheit & Haftungsbeschränkung" : "5. Security & Limitation of Liability", [
        isGerman ? "- Anbieter implementiert angemessene Sicherheitsmaßnahmen und regelmäßige Backups" : "- Provider implements reasonable security measures and regular backups",
        isGerman ? "- Keine Haftung für Datenverlust, Sicherheitsverletzungen oder Schäden durch Software-Fehler oder unsachgemäße Kontonutzung" : "- No liability for data loss, breaches, or damages from software bugs or improper account use",
        isGerman ? "- Maximale Haftung begrenzt auf die in den letzten 12 Monaten gezahlten Gebühren" : "- Maximum liability limited to fees paid in prior 12 months",
      ]);
      addSection("6. Support", [
        isGerman ? "- Kritische Events: 2h erste Reaktion" : "- Critical events: 2h initial response",
        isGerman ? "- Mo-Fr 8-18 Uhr CET via In-App/E-Mail" : "- Mon-Fri 8-18 CET via in-app/email",
      ]);
      addSection(isGerman ? "7. Gerichtsstand" : "7. Jurisdiction", [
        isGerman ? "- Für alle Streitigkeiten sind die Gerichte in Konstanz, Deutschland zuständig" : "- All disputes are handled by the courts in Konstanz, Germany",
      ]);
    } else if (documentType === "privacy") {
      addSection(isGerman ? "1. Verantwortlicher" : "1. Data Controller", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "E-Mail: info@acutiq.com",
      ]);
      addSection(isGerman ? "2. Erhobene Daten" : "2. Data Collected", [
        isGerman ? "- Benutzerdaten: Name, E-Mail-Adresse, Rolle, Krankenhauszugehörigkeit" : "- User data: Name, email address, role, hospital affiliation",
        isGerman ? "- Patientendaten: Gemäß den Anforderungen des medizinischen Dokumentationsbedarfs" : "- Patient data: According to medical documentation requirements",
        isGerman ? "- Protokolldaten: Zugriffsprotokolle, Aktivitätsprotokolle zur Systemsicherheit" : "- Log data: Access logs, activity logs for system security",
        isGerman ? "- Medizinische Dokumentation: Anästhesieprotokolle, Vitalzeichen, Medikation" : "- Medical documentation: Anesthesia records, vital signs, medication",
      ]);
      addSection(isGerman ? "3. Zweck der Datenverarbeitung" : "3. Purpose of Data Processing", [
        isGerman ? "- Bereitstellung der Anästhesie-Dokumentationsdienste" : "- Provision of anesthesia documentation services",
        isGerman ? "- Benutzerauthentifizierung und Zugangskontrolle" : "- User authentication and access control",
        isGerman ? "- Abrechnung und Vertragsabwicklung" : "- Billing and contract processing",
        isGerman ? "- Verbesserung der Servicequalität" : "- Service quality improvement",
        isGerman ? "- Einhaltung gesetzlicher Aufbewahrungspflichten" : "- Compliance with legal retention requirements",
      ]);
      addSection(isGerman ? "4. Datenspeicherung" : "4. Data Storage", [
        isGerman ? "- Alle Daten werden auf Servern von Exoscale in der Schweiz gespeichert" : "- All data is stored on Exoscale servers in Switzerland",
        isGerman ? "- Datenbank: Exoscale PostgreSQL (Schweiz)" : "- Database: Exoscale PostgreSQL (Switzerland)",
        isGerman ? "- Verschlüsselung: Daten werden im Ruhezustand und bei der Übertragung verschlüsselt" : "- Encryption: Data is encrypted at rest and in transit",
        isGerman ? "- Regelmäßige automatische Backups" : "- Regular automatic backups",
      ]);
      addSection(isGerman ? "5. Betroffenenrechte" : "5. Data Subject Rights", [
        isGerman ? "- Auskunftsrecht: Sie haben das Recht zu erfahren, welche Daten über Sie gespeichert sind" : "- Right of access: You have the right to know what data is stored about you",
        isGerman ? "- Berichtigungsrecht: Sie können die Korrektur unrichtiger Daten verlangen" : "- Right to rectification: You can request correction of inaccurate data",
        isGerman ? "- Löschungsrecht: Sie können die Löschung Ihrer Daten verlangen (unter Berücksichtigung gesetzlicher Aufbewahrungspflichten)" : "- Right to erasure: You can request deletion of your data (subject to legal retention requirements)",
        isGerman ? "- Datenübertragbarkeit: Sie können Ihre Daten in einem maschinenlesbaren Format anfordern" : "- Data portability: You can request your data in a machine-readable format",
        isGerman ? "- Widerspruchsrecht: Sie können der Datenverarbeitung widersprechen" : "- Right to object: You can object to data processing",
      ]);
      addSection(isGerman ? "6. Datenweitergabe" : "6. Data Sharing", [
        isGerman ? "- Patientendaten werden nicht an Dritte weitergegeben" : "- Patient data is not shared with third parties",
        isGerman ? "- Auftragsverarbeiter: Stripe (Zahlungsabwicklung), Exoscale (Hosting & Datenbank), Resend (E-Mail-Versand), Vonage (SMS-Kommunikation)" : "- Processors: Stripe (payment processing), Exoscale (hosting & database), Resend (email delivery), Vonage (SMS communications)",
        isGerman ? "- Alle Auftragsverarbeiter erfüllen die DSGVO-Anforderungen" : "- All processors comply with GDPR requirements",
      ]);
      addSection(isGerman ? "7. DSG/DSGVO-Konformität" : "7. DSG/GDPR Compliance", [
        isGerman ? "- Viali.app entspricht dem Schweizer Datenschutzgesetz (DSG) und der EU-DSGVO" : "- Viali.app complies with Swiss Data Protection Act (DSG) and EU GDPR",
        isGerman ? "- Auftragsverarbeitungsverträge (AVV) mit allen Unterauftragsverarbeitern" : "- Data Processing Agreements (DPA) with all subprocessors",
        isGerman ? "- Privacy by Design und Privacy by Default" : "- Privacy by Design and Privacy by Default",
      ]);
      addSection(isGerman ? "8. Kontakt" : "8. Contact", [
        isGerman ? "Bei Fragen zum Datenschutz kontaktieren Sie uns unter: info@acutiq.com" : "For privacy questions, contact us at: info@acutiq.com",
      ]);
    } else if (documentType === "avv") {
      addSection(isGerman ? "1. Gegenstand und Dauer der Verarbeitung" : "1. Subject Matter and Duration of Processing", [
        isGerman
          ? "Dieser Auftragsverarbeitungsvertrag (AVV) regelt die Verarbeitung personenbezogener Daten durch Acutiq (Auftragsverarbeiter) im Auftrag der Klinik (Verantwortlicher) im Rahmen der Nutzung der Viali.app Plattform. Die Verarbeitung dauert für die gesamte Vertragslaufzeit."
          : "This Data Processing Agreement (DPA) governs the processing of personal data by Acutiq (Processor) on behalf of the clinic (Controller) in connection with the use of the Viali.app platform. Processing continues for the entire contract term.",
      ]);
      addSection(isGerman ? "2. Art und Zweck der Verarbeitung" : "2. Nature and Purpose of Processing", [
        isGerman ? "- Speicherung und Verarbeitung von Anästhesie-Dokumentation" : "- Storage and processing of anesthesia documentation",
        isGerman ? "- Bereitstellung der webbasierten Anwendung" : "- Provision of the web-based application",
        isGerman ? "- Durchführung von Backups und Systemwartung" : "- Performing backups and system maintenance",
        isGerman ? "- Technischer Support und Fehlerbehebung" : "- Technical support and troubleshooting",
      ]);
      addSection(isGerman ? "3. Art der personenbezogenen Daten" : "3. Type of Personal Data", [
        isGerman ? "- Patientenstammdaten (Name, Geburtsdatum, Gewicht)" : "- Patient master data (name, date of birth, weight)",
        isGerman ? "- Gesundheitsdaten (Vitalzeichen, Diagnosen, Medikation)" : "- Health data (vital signs, diagnoses, medication)",
        isGerman ? "- Benutzerdaten (Name, E-Mail, Benutzerrolle)" : "- User data (name, email, user role)",
        isGerman ? "- Audit-Daten (Zugriffsprotokolle, Änderungshistorie)" : "- Audit data (access logs, change history)",
      ]);
      addSection(isGerman ? "4. Kategorien betroffener Personen" : "4. Categories of Data Subjects", [
        isGerman ? "- Patienten der Klinik" : "- Patients of the clinic",
        isGerman ? "- Mitarbeiter der Klinik (Benutzer der Anwendung)" : "- Clinic employees (application users)",
      ]);
      addSection(isGerman ? "5. Pflichten des Auftragsverarbeiters" : "5. Obligations of the Processor", [
        isGerman ? "- Verarbeitung nur nach dokumentierter Weisung des Verantwortlichen" : "- Processing only according to documented instructions from the Controller",
        isGerman ? "- Gewährleistung der Vertraulichkeit durch alle Mitarbeiter" : "- Ensuring confidentiality by all employees",
        isGerman ? "- Ergreifung angemessener technischer und organisatorischer Maßnahmen" : "- Implementing appropriate technical and organizational measures",
        isGerman ? "- Unterstützung bei der Erfüllung von Betroffenenrechten" : "- Support in fulfilling data subject rights",
        isGerman ? "- Meldung von Datenschutzverletzungen innerhalb von 24 Stunden" : "- Notification of data breaches within 24 hours",
      ]);
      addSection(isGerman ? "6. Technische und organisatorische Maßnahmen" : "6. Technical and Organizational Measures", [
        isGerman ? "- Verschlüsselung aller Daten bei Übertragung (TLS 1.3) und Speicherung" : "- Encryption of all data in transit (TLS 1.3) and at rest",
        isGerman ? "- Zugriffskontrolle durch rollenbasierte Berechtigungen" : "- Access control through role-based permissions",
        isGerman ? "- Regelmäßige Sicherheitsaudits und Penetrationstests" : "- Regular security audits and penetration tests",
        isGerman ? "- Automatische Backups mit Geo-Redundanz" : "- Automatic backups with geo-redundancy",
        isGerman ? "- Audit-Trail für alle sicherheitsrelevanten Aktionen" : "- Audit trail for all security-relevant actions",
      ]);
      addSection(isGerman ? "7. Unterauftragsverarbeiter" : "7. Subprocessors", [
        isGerman ? "Folgende Unterauftragsverarbeiter werden eingesetzt:" : "The following subprocessors are used:",
        isGerman ? "- Exoscale AG, Schweiz - Server-Hosting und Objektspeicher" : "- Exoscale AG, Switzerland - Server hosting and object storage",
        isGerman ? "- Exoscale (Schweiz) - Datenbank-Hosting" : "- Exoscale (Switzerland) - Database hosting",
        isGerman ? "- Stripe Inc. - Zahlungsabwicklung (keine Patientendaten)" : "- Stripe Inc. - Payment processing (no patient data)",
        isGerman ? "- Resend Inc. - E-Mail-Versand (nur Systembenachrichtigungen)" : "- Resend Inc. - Email delivery (system notifications only)",
        isGerman ? "- Vonage Inc. - SMS-Kommunikation (Terminbenachrichtigungen, keine Patientendaten)" : "- Vonage Inc. - SMS communications (appointment notifications, no patient data)",
      ]);
      addSection(isGerman ? "8. Löschung und Rückgabe von Daten" : "8. Deletion and Return of Data", [
        isGerman ? "- Nach Vertragsende: Löschung aller Daten innerhalb von 30 Tagen" : "- After contract termination: Deletion of all data within 30 days",
        isGerman ? "- Auf Wunsch: Export aller Daten vor Löschung" : "- Upon request: Export of all data before deletion",
        isGerman ? "- Schriftliche Bestätigung der Löschung auf Anfrage" : "- Written confirmation of deletion upon request",
      ]);
      addSection(isGerman ? "9. Kontrollrechte" : "9. Audit Rights", [
        isGerman
          ? "Der Verantwortliche hat das Recht, die Einhaltung dieses Vertrags zu überprüfen. Dies kann durch Einsichtnahme in Zertifizierungen, Berichte oder nach Vereinbarung durch Vor-Ort-Audits erfolgen."
          : "The Controller has the right to verify compliance with this agreement. This can be done by reviewing certifications, reports, or by on-site audits upon agreement.",
      ]);
    }
    
    y += 10;

    // Signature section
    checkNewPage(70);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(isGerman ? "Akzeptanz" : "Acceptance", 15, y);
    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`${isGerman ? "Klinik" : "Clinic"}: ${hospital.name}`, 15, y); y += 6;
    pdf.text(`${isGerman ? "Unterzeichnet von" : "Signed by"}: ${acceptance.signedByName}`, 15, y); y += 6;
    pdf.text(`E-Mail: ${acceptance.signedByEmail || "N/A"}`, 15, y); y += 6;
    const signedDate = new Date(signedAt);
    pdf.text(`${isGerman ? "Datum" : "Date"}: ${signedDate.toLocaleDateString(isGerman ? "de-DE" : "en-US")} ${signedDate.toLocaleTimeString(isGerman ? "de-DE" : "en-US")}`, 15, y); y += 10;
    
    // Add signature image if available
    if (acceptance.signatureImage) {
      try {
        pdf.addImage(acceptance.signatureImage, "PNG", 15, y, 60, 25);
        y += 30;
      } catch (e) {
        logger.error("Failed to add signature image to PDF:", e);
      }
    }
    
    pdf.text("_________________________________", 15, y); y += 5;
    pdf.text(isGerman ? "Unterschrift Klinikvertreter" : "Clinic Representative Signature", 15, y);

    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    // Upload to object storage
    let pdfStorageKey: string | null = null;
    if (objectStorageService.isConfigured()) {
      try {
        const s3Key = `billing/terms/${documentType}_${hospital.name.replace(/\s+/g, "_")}_${signedDate.toISOString().split("T")[0]}_${randomUUID()}.pdf`;
        await objectStorageService.uploadBase64ToS3(pdfBase64, s3Key, "application/pdf");
        pdfStorageKey = `/objects/${s3Key}`;
        logger.info(`Regenerated ${documentType} PDF uploaded to object storage:`, pdfStorageKey);
      } catch (uploadError) {
        logger.error(`Failed to upload regenerated ${documentType} PDF to object storage:`, uploadError);
        return res.status(500).json({ message: "Failed to upload PDF" });
      }
    } else {
      logger.info("Object storage not configured, skipping PDF upload");
      return res.status(500).json({ message: "Object storage not configured" });
    }

    // Update acceptance record with PDF URL
    await db
      .update(termsAcceptances)
      .set({ pdfUrl: pdfStorageKey })
      .where(eq(termsAcceptances.id, acceptanceId));

    res.json({ success: true, pdfUrl: pdfStorageKey });
  } catch (error) {
    logger.error("Error regenerating PDF:", error);
    res.status(500).json({ message: "Failed to regenerate PDF" });
  }
});

router.post("/api/billing/:hospitalId/accept-terms", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { signatureImage, signerName, language, documentType = "terms" } = req.body;
    const userId = req.user.id;
    const isGerman = language === "de";

    if (!signatureImage || !signerName) {
      return res.status(400).json({ message: "Signature and signer name are required" });
    }

    // Validate document type
    if (!LEGAL_DOCUMENT_TYPES.includes(documentType as LegalDocumentType)) {
      return res.status(400).json({ message: `Invalid document type. Must be one of: ${LEGAL_DOCUMENT_TYPES.join(", ")}` });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already accepted this version and document type
    const [existing] = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.hospitalId, hospitalId),
        eq(termsAcceptances.version, CURRENT_TERMS_VERSION),
        eq(termsAcceptances.documentType, documentType)
      ))
      .limit(1);

    if (existing) {
      const docLabel = DOCUMENT_LABELS[documentType as LegalDocumentType];
      return res.status(400).json({ message: `${isGerman ? docLabel.de : docLabel.en} already accepted for this version` });
    }

    // Get document label for PDF and email
    const docLabel = DOCUMENT_LABELS[documentType as LegalDocumentType];

    const signedAt = new Date();
    
    // Generate PDF with terms and signature
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    let y = 20;
    
    // Helper function to check if we need a new page
    const checkNewPage = (neededSpace: number) => {
      if (y + neededSpace > pageHeight - 20) {
        pdf.addPage();
        y = 20;
      }
    };
    
    // Title - use document-specific label
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text(`${isGerman ? docLabel.de : docLabel.en} - Viali.app`, pageWidth / 2, y, { align: "center" });
    y += 15;
    
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Version: ${CURRENT_TERMS_VERSION}`, pageWidth / 2, y, { align: "center" });
    y += 15;
    
    // Document-specific content based on documentType
    const addSection = (title: string, items: string[]) => {
      checkNewPage(10 + items.length * 6);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text(title, 15, y);
      y += 7;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      items.forEach((item) => {
        const lines = pdf.splitTextToSize(item, pageWidth - 30);
        lines.forEach((line: string) => {
          checkNewPage(6);
          pdf.text(line, 15, y);
          y += 5;
        });
      });
      y += 5;
    };

    if (documentType === "terms") {
      // Terms of Service content
      addSection(isGerman ? "1. Anbieter" : "1. Provider", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "Service: https://use.viali.app",
      ]);
      addSection(isGerman ? "2. Leistungen" : "2. Services", [
        isGerman ? "- Digitale Anästhesie-Protokolle (Pre-OP, OP, PACU)" : "- Digital anesthesia protocols (Pre-OP, OP, PACU)",
        isGerman ? "- Bestandsverwaltungssystem (Medikamente, Material, BTM)" : "- Inventory management (medications, materials, controlled substances)",
        isGerman ? "- Cloud-Hosting inklusive (Exoscale Shared Server, Schweiz)" : "- Cloud hosting included (Exoscale Shared Server, Switzerland)",
        isGerman ? "- Backups & Updates" : "- Backups & updates",
        isGerman ? "- Optionale Zusatzmodule (siehe Preisübersicht im Abrechnungsbereich)" : "- Optional add-on modules (see pricing overview in billing section)",
      ]);
      addSection(isGerman ? "3. Abrechnung & Zahlung" : "3. Billing & Payment", [
        isGerman ? "- Aktuelle Preise werden im Abrechnungsbereich angezeigt" : "- Current pricing is displayed in the billing section",
        isGerman ? "- Monatliche Abrechnung nach tatsächlicher Nutzung" : "- Monthly billing based on actual usage",
        isGerman ? "- Zahlung per Kreditkarte (in-app)" : "- Credit card payment (in-app)",
        isGerman ? "- Alle Preise verstehen sich netto. MwSt. kann je nach Standort anfallen" : "- All prices are net. VAT may apply depending on location",
        isGerman ? "- Monatlich kündbar" : "- Monthly cancellation possible",
        isGerman ? "- Preisänderungen mit 3 Monaten Ankündigungsfrist" : "- Price changes with 3 months notice",
      ]);
      addSection(isGerman ? "4. Dateneigentum & Datenschutz" : "4. Data Ownership & Privacy", [
        isGerman ? "- Patientendaten bleiben ausschließliches Eigentum der Klinik" : "- Patient data remains exclusive property of the clinic",
        isGerman ? "- Unterliegt der Schweizer DSGVO-Gesetzgebung" : "- Subject to Swiss GDPR legislation",
        isGerman ? "- Gehostet auf Exoscale-Servern (Schweiz)" : "- Hosted on Exoscale servers (Switzerland)",
      ]);
      addSection(isGerman ? "5. Sicherheit & Haftungsbeschränkung" : "5. Security & Limitation of Liability", [
        isGerman ? "- Anbieter implementiert angemessene Sicherheitsmaßnahmen und regelmäßige Backups" : "- Provider implements reasonable security measures and regular backups",
        isGerman ? "- Keine Haftung für Datenverlust, Sicherheitsverletzungen oder Schäden durch Software-Fehler oder unsachgemäße Kontonutzung" : "- No liability for data loss, breaches, or damages from software bugs or improper account use",
        isGerman ? "- Maximale Haftung begrenzt auf die in den letzten 12 Monaten gezahlten Gebühren" : "- Maximum liability limited to fees paid in prior 12 months",
      ]);
      addSection("6. Support", [
        isGerman ? "- Kritische Events: 2h erste Reaktion" : "- Critical events: 2h initial response",
        isGerman ? "- Mo-Fr 8-18 Uhr CET via In-App/E-Mail" : "- Mon-Fri 8-18 CET via in-app/email",
      ]);
      addSection(isGerman ? "7. Gerichtsstand" : "7. Jurisdiction", [
        isGerman ? "- Für alle Streitigkeiten sind die Gerichte in Konstanz, Deutschland zuständig" : "- All disputes are handled by the courts in Konstanz, Germany",
      ]);
    } else if (documentType === "privacy") {
      // Privacy Policy content
      addSection(isGerman ? "1. Verantwortlicher" : "1. Data Controller", [
        `Acutiq, ${isGerman ? "Inhaber" : "owned by"} Maurizio Betti`,
        "Bruder-Klaus-Str 18, 78467 Konstanz, Germany",
        "E-Mail: info@acutiq.com",
      ]);
      addSection(isGerman ? "2. Erhobene Daten" : "2. Data Collected", [
        isGerman ? "- Benutzerdaten: Name, E-Mail-Adresse, Rolle, Krankenhauszugehörigkeit" : "- User data: Name, email address, role, hospital affiliation",
        isGerman ? "- Patientendaten: Gemäß den Anforderungen des medizinischen Dokumentationsbedarfs" : "- Patient data: According to medical documentation requirements",
        isGerman ? "- Protokolldaten: Zugriffsprotokolle, Aktivitätsprotokolle zur Systemsicherheit" : "- Log data: Access logs, activity logs for system security",
        isGerman ? "- Medizinische Dokumentation: Anästhesieprotokolle, Vitalzeichen, Medikation" : "- Medical documentation: Anesthesia records, vital signs, medication",
      ]);
      addSection(isGerman ? "3. Zweck der Datenverarbeitung" : "3. Purpose of Data Processing", [
        isGerman ? "- Bereitstellung der Anästhesie-Dokumentationsdienste" : "- Provision of anesthesia documentation services",
        isGerman ? "- Benutzerauthentifizierung und Zugangskontrolle" : "- User authentication and access control",
        isGerman ? "- Abrechnung und Vertragsabwicklung" : "- Billing and contract processing",
        isGerman ? "- Verbesserung der Servicequalität" : "- Service quality improvement",
        isGerman ? "- Einhaltung gesetzlicher Aufbewahrungspflichten" : "- Compliance with legal retention requirements",
      ]);
      addSection(isGerman ? "4. Datenspeicherung" : "4. Data Storage", [
        isGerman ? "- Alle Daten werden auf Servern von Exoscale in der Schweiz gespeichert" : "- All data is stored on Exoscale servers in Switzerland",
        isGerman ? "- Datenbank: Exoscale PostgreSQL (Schweiz)" : "- Database: Exoscale PostgreSQL (Switzerland)",
        isGerman ? "- Verschlüsselung: Daten werden im Ruhezustand und bei der Übertragung verschlüsselt" : "- Encryption: Data is encrypted at rest and in transit",
        isGerman ? "- Regelmäßige automatische Backups" : "- Regular automatic backups",
      ]);
      addSection(isGerman ? "5. Betroffenenrechte" : "5. Data Subject Rights", [
        isGerman ? "- Auskunftsrecht: Sie haben das Recht zu erfahren, welche Daten über Sie gespeichert sind" : "- Right of access: You have the right to know what data is stored about you",
        isGerman ? "- Berichtigungsrecht: Sie können die Korrektur unrichtiger Daten verlangen" : "- Right to rectification: You can request correction of inaccurate data",
        isGerman ? "- Löschungsrecht: Sie können die Löschung Ihrer Daten verlangen (unter Berücksichtigung gesetzlicher Aufbewahrungspflichten)" : "- Right to erasure: You can request deletion of your data (subject to legal retention requirements)",
        isGerman ? "- Datenübertragbarkeit: Sie können Ihre Daten in einem maschinenlesbaren Format anfordern" : "- Data portability: You can request your data in a machine-readable format",
        isGerman ? "- Widerspruchsrecht: Sie können der Datenverarbeitung widersprechen" : "- Right to object: You can object to data processing",
      ]);
      addSection(isGerman ? "6. Datenweitergabe" : "6. Data Sharing", [
        isGerman ? "- Patientendaten werden nicht an Dritte weitergegeben" : "- Patient data is not shared with third parties",
        isGerman ? "- Auftragsverarbeiter: Stripe (Zahlungsabwicklung), Exoscale (Hosting & Datenbank), Resend (E-Mail-Versand), Vonage (SMS-Kommunikation)" : "- Processors: Stripe (payment processing), Exoscale (hosting & database), Resend (email delivery), Vonage (SMS communications)",
        isGerman ? "- Alle Auftragsverarbeiter erfüllen die DSGVO-Anforderungen" : "- All processors comply with GDPR requirements",
      ]);
      addSection(isGerman ? "7. DSG/DSGVO-Konformität" : "7. DSG/GDPR Compliance", [
        isGerman ? "- Viali.app entspricht dem Schweizer Datenschutzgesetz (DSG) und der EU-DSGVO" : "- Viali.app complies with Swiss Data Protection Act (DSG) and EU GDPR",
        isGerman ? "- Auftragsverarbeitungsverträge (AVV) mit allen Unterauftragsverarbeitern" : "- Data Processing Agreements (DPA) with all subprocessors",
        isGerman ? "- Privacy by Design und Privacy by Default" : "- Privacy by Design and Privacy by Default",
      ]);
      addSection(isGerman ? "8. Kontakt" : "8. Contact", [
        isGerman ? "Bei Fragen zum Datenschutz kontaktieren Sie uns unter: info@acutiq.com" : "For privacy questions, contact us at: info@acutiq.com",
      ]);
    } else if (documentType === "avv") {
      // AVV (Data Processing Agreement) content
      addSection(isGerman ? "1. Gegenstand und Dauer der Verarbeitung" : "1. Subject Matter and Duration of Processing", [
        isGerman
          ? "Dieser Auftragsverarbeitungsvertrag (AVV) regelt die Verarbeitung personenbezogener Daten durch Acutiq (Auftragsverarbeiter) im Auftrag der Klinik (Verantwortlicher) im Rahmen der Nutzung der Viali.app Plattform. Die Verarbeitung dauert für die gesamte Vertragslaufzeit."
          : "This Data Processing Agreement (DPA) governs the processing of personal data by Acutiq (Processor) on behalf of the clinic (Controller) in connection with the use of the Viali.app platform. Processing continues for the entire contract term.",
      ]);
      addSection(isGerman ? "2. Art und Zweck der Verarbeitung" : "2. Nature and Purpose of Processing", [
        isGerman ? "- Speicherung und Verarbeitung von Anästhesie-Dokumentation" : "- Storage and processing of anesthesia documentation",
        isGerman ? "- Bereitstellung der webbasierten Anwendung" : "- Provision of the web-based application",
        isGerman ? "- Durchführung von Backups und Systemwartung" : "- Performing backups and system maintenance",
        isGerman ? "- Technischer Support und Fehlerbehebung" : "- Technical support and troubleshooting",
      ]);
      addSection(isGerman ? "3. Art der personenbezogenen Daten" : "3. Type of Personal Data", [
        isGerman ? "- Patientenstammdaten (Name, Geburtsdatum, Gewicht)" : "- Patient master data (name, date of birth, weight)",
        isGerman ? "- Gesundheitsdaten (Vitalzeichen, Diagnosen, Medikation)" : "- Health data (vital signs, diagnoses, medication)",
        isGerman ? "- Benutzerdaten (Name, E-Mail, Benutzerrolle)" : "- User data (name, email, user role)",
        isGerman ? "- Audit-Daten (Zugriffsprotokolle, Änderungshistorie)" : "- Audit data (access logs, change history)",
      ]);
      addSection(isGerman ? "4. Kategorien betroffener Personen" : "4. Categories of Data Subjects", [
        isGerman ? "- Patienten der Klinik" : "- Patients of the clinic",
        isGerman ? "- Mitarbeiter der Klinik (Benutzer der Anwendung)" : "- Clinic employees (application users)",
      ]);
      addSection(isGerman ? "5. Pflichten des Auftragsverarbeiters" : "5. Obligations of the Processor", [
        isGerman ? "- Verarbeitung nur nach dokumentierter Weisung des Verantwortlichen" : "- Processing only according to documented instructions from the Controller",
        isGerman ? "- Gewährleistung der Vertraulichkeit durch alle Mitarbeiter" : "- Ensuring confidentiality by all employees",
        isGerman ? "- Ergreifung angemessener technischer und organisatorischer Maßnahmen" : "- Implementing appropriate technical and organizational measures",
        isGerman ? "- Unterstützung bei der Erfüllung von Betroffenenrechten" : "- Support in fulfilling data subject rights",
        isGerman ? "- Meldung von Datenschutzverletzungen innerhalb von 24 Stunden" : "- Notification of data breaches within 24 hours",
      ]);
      addSection(isGerman ? "6. Technische und organisatorische Maßnahmen" : "6. Technical and Organizational Measures", [
        isGerman ? "- Verschlüsselung aller Daten bei Übertragung (TLS 1.3) und Speicherung" : "- Encryption of all data in transit (TLS 1.3) and at rest",
        isGerman ? "- Zugriffskontrolle durch rollenbasierte Berechtigungen" : "- Access control through role-based permissions",
        isGerman ? "- Regelmäßige Sicherheitsaudits und Penetrationstests" : "- Regular security audits and penetration tests",
        isGerman ? "- Automatische Backups mit Geo-Redundanz" : "- Automatic backups with geo-redundancy",
        isGerman ? "- Audit-Trail für alle sicherheitsrelevanten Aktionen" : "- Audit trail for all security-relevant actions",
      ]);
      addSection(isGerman ? "7. Unterauftragsverarbeiter" : "7. Subprocessors", [
        isGerman ? "Folgende Unterauftragsverarbeiter werden eingesetzt:" : "The following subprocessors are used:",
        isGerman ? "- Exoscale AG, Schweiz - Server-Hosting und Objektspeicher" : "- Exoscale AG, Switzerland - Server hosting and object storage",
        isGerman ? "- Exoscale (Schweiz) - Datenbank-Hosting" : "- Exoscale (Switzerland) - Database hosting",
        isGerman ? "- Stripe Inc. - Zahlungsabwicklung (keine Patientendaten)" : "- Stripe Inc. - Payment processing (no patient data)",
        isGerman ? "- Resend Inc. - E-Mail-Versand (nur Systembenachrichtigungen)" : "- Resend Inc. - Email delivery (system notifications only)",
        isGerman ? "- Vonage Inc. - SMS-Kommunikation (Terminbenachrichtigungen, keine Patientendaten)" : "- Vonage Inc. - SMS communications (appointment notifications, no patient data)",
      ]);
      addSection(isGerman ? "8. Löschung und Rückgabe von Daten" : "8. Deletion and Return of Data", [
        isGerman ? "- Nach Vertragsende: Löschung aller Daten innerhalb von 30 Tagen" : "- After contract termination: Deletion of all data within 30 days",
        isGerman ? "- Auf Wunsch: Export aller Daten vor Löschung" : "- Upon request: Export of all data before deletion",
        isGerman ? "- Schriftliche Bestätigung der Löschung auf Anfrage" : "- Written confirmation of deletion upon request",
      ]);
      addSection(isGerman ? "9. Kontrollrechte" : "9. Audit Rights", [
        isGerman
          ? "Der Verantwortliche hat das Recht, die Einhaltung dieses Vertrags zu überprüfen. Dies kann durch Einsichtnahme in Zertifizierungen, Berichte oder nach Vereinbarung durch Vor-Ort-Audits erfolgen."
          : "The Controller has the right to verify compliance with this agreement. This can be done by reviewing certifications, reports, or by on-site audits upon agreement.",
      ]);
    }
    
    y += 10;
    
    // Signature section - ensure enough space on current page or start new page
    checkNewPage(70);
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(isGerman ? "Akzeptanz" : "Acceptance", 15, y);
    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`${isGerman ? "Klinik" : "Clinic"}: ${hospital.name}`, 15, y); y += 6;
    pdf.text(`${isGerman ? "Unterzeichnet von" : "Signed by"}: ${signerName}`, 15, y); y += 6;
    pdf.text(`E-Mail: ${user.email || "N/A"}`, 15, y); y += 6;
    pdf.text(`${isGerman ? "Datum" : "Date"}: ${signedAt.toLocaleDateString(isGerman ? "de-DE" : "en-US")} ${signedAt.toLocaleTimeString(isGerman ? "de-DE" : "en-US")}`, 15, y); y += 10;
    
    // Add signature image
    try {
      pdf.addImage(signatureImage, "PNG", 15, y, 60, 25);
      y += 30;
    } catch (e) {
      logger.error("Failed to add signature image to PDF:", e);
    }
    
    pdf.text("_________________________________", 15, y); y += 5;
    pdf.text(isGerman ? "Unterschrift Klinikvertreter" : "Clinic Representative Signature", 15, y); y += 15;
    
    // Countersignature placeholder
    pdf.text("Countersignature (Acutiq):", 15, y); y += 10;
    pdf.text("_________________________________", 15, y); y += 5;
    pdf.text("Date: _______________", 15, y);
    
    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    // Upload PDF to object storage
    let pdfStorageKey: string | null = null;
    if (objectStorageService.isConfigured()) {
      try {
        const pdfFilename = `${documentType}_${hospital.name.replace(/\s+/g, "_")}_${signedAt.toISOString().split("T")[0]}_${randomUUID()}.pdf`;
        const s3Key = `billing/terms/${hospitalId}/${pdfFilename}`;
        await objectStorageService.uploadBase64ToS3(pdfBase64, s3Key, "application/pdf");
        pdfStorageKey = `/objects/${s3Key}`;
        logger.info(`${documentType} PDF uploaded to object storage:`, pdfStorageKey);
      } catch (uploadError) {
        logger.error(`Failed to upload ${documentType} PDF to object storage:`, uploadError);
      }
    }

    // Send email with PDF attachment via Resend
    let emailSentAt: Date | null = null;
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "Viali.app <noreply@mail.viali.app>",
          to: ["info@acutiq.com"],
          replyTo: user.email || undefined,
          subject: `${docLabel.en} Signed - ${hospital.name}`,
          html: `
            <h2>${docLabel.en} Acceptance</h2>
            <p>A new ${docLabel.en} agreement has been signed and requires countersigning.</p>
            <p><strong>Document Type:</strong> ${docLabel.en} (${docLabel.de})</p>
            <p><strong>Clinic:</strong> ${hospital.name}</p>
            <p><strong>Signed by:</strong> ${signerName}</p>
            <p><strong>Email:</strong> ${user.email || "N/A"}</p>
            <p><strong>Date:</strong> ${signedAt.toLocaleDateString("de-DE")} ${signedAt.toLocaleTimeString("de-DE")}</p>
            <p><strong>Version:</strong> ${CURRENT_TERMS_VERSION}</p>
            <p>Please review, countersign, and reply to this email to send the countersigned document back to the customer.</p>
          `,
          attachments: [
            {
              filename: `${documentType}_${hospital.name.replace(/\s+/g, "_")}_${signedAt.toISOString().split("T")[0]}.pdf`,
              content: pdfBase64,
            },
          ],
        });
        emailSentAt = new Date();
        logger.info(`${docLabel.en} acceptance email sent successfully`);
      } catch (emailError) {
        logger.error(`Failed to send ${docLabel.en} acceptance email:`, emailError);
      }
    } else {
      logger.info("RESEND_API_KEY not configured, skipping email");
    }

    // Save acceptance record
    const [acceptance] = await db
      .insert(termsAcceptances)
      .values({
        hospitalId,
        version: CURRENT_TERMS_VERSION,
        documentType,
        signedByUserId: userId,
        signedByName: signerName,
        signedByEmail: user.email || "",
        signatureImage,
        emailSentAt,
        pdfUrl: pdfStorageKey,
      })
      .returning();

    res.json({
      success: true,
      acceptance: {
        id: acceptance.id,
        signedAt: acceptance.signedAt,
        emailSent: !!emailSentAt,
      },
    });
  } catch (error) {
    logger.error("Error accepting terms:", error);
    res.status(500).json({ message: "Failed to accept terms" });
  }
});

// Get invoice history for a hospital (from local billing_invoices table)
router.get("/api/billing/:hospitalId/billing-invoices", isAuthenticated, async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId;
    
    const invoices = await db
      .select()
      .from(billingInvoices)
      .where(eq(billingInvoices.hospitalId, hospitalId))
      .orderBy(desc(billingInvoices.periodStart));
    
    res.json({ invoices });
  } catch (error) {
    logger.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// Manual trigger for generating a test invoice (admin only)
router.post("/api/billing/:hospitalId/generate-invoice", isAuthenticated, requireAdminRoleCheck, async (req, res) => {
  try {
    const hospitalId = req.params.hospitalId;
    const stripe = getStripe();
    
    if (!stripe) {
      return res.status(500).json({ message: "Stripe is not configured" });
    }
    
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    if (!hospital.stripeCustomerId || !hospital.stripePaymentMethodId) {
      return res.status(400).json({ message: "No payment method configured" });
    }
    
    // Get billing period from request or use current month
    const { periodStart: startStr, periodEnd: endStr } = req.body;
    
    let periodStart: Date;
    let periodEnd: Date;
    
    if (startStr && endStr) {
      periodStart = new Date(startStr);
      periodEnd = new Date(endStr);
    } else {
      // Default to current month
      const now = new Date();
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    }
    
    // Check if invoice already exists for this period
    const existingInvoice = await db
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.hospitalId, hospitalId),
          eq(billingInvoices.periodStart, periodStart),
          eq(billingInvoices.periodEnd, periodEnd)
        )
      )
      .limit(1);
    
    if (existingInvoice.length > 0) {
      return res.status(400).json({ 
        message: "Invoice already exists for this period",
        invoice: existingInvoice[0]
      });
    }
    
    // Count records for the period
    const recordCount = await countAnesthesiaRecordsForHospital(hospitalId, periodStart, periodEnd);
    
    if (recordCount === 0) {
      return res.status(400).json({ message: "No records found for this billing period" });
    }
    
    // Calculate pricing
    // Note: questionnaire and surgery are now included in the base fee (no extra charge)
    const basePrice = parseFloat(hospital.pricePerRecord || '6.00');
    // Per-record add-ons (questionnaire and surgery no longer charged separately)
    const dispocuraAddOn = hospital.addonDispocura ? 1.00 : 0;
    const monitorAddOn = hospital.addonMonitor ? 1.00 : 0;
    // Flat monthly add-ons
    const worktimeAddOn = hospital.addonWorktime ? 5.00 : 0;
    const logisticsAddOn = hospital.addonLogistics ? 5.00 : 0;
    const clinicAddOn = hospital.addonClinic ? 10.00 : 0;
    
    const pricePerRecord = basePrice + dispocuraAddOn + monitorAddOn;
    // Flat monthly add-on for Retell
    const retellAddOn = hospital.addonRetell ? 15.00 : 0;
    const totalAmount = (recordCount * pricePerRecord) + worktimeAddOn + logisticsAddOn + clinicAddOn + retellAddOn;
    
    // Create Stripe invoice
    const invoice = await stripe.invoices.create({
      customer: hospital.stripeCustomerId,
      collection_method: 'charge_automatically',
      auto_advance: true,
      currency: 'chf',
      description: `Viali Usage - ${periodStart.toLocaleDateString('de-CH', { month: 'long', year: 'numeric' })}`,
      metadata: {
        hospitalId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        recordCount: recordCount.toString(),
      },
    });
    
    // Add line items
    await stripe.invoiceItems.create({
      customer: hospital.stripeCustomerId,
      invoice: invoice.id,
      quantity: recordCount,
      unit_amount_decimal: String(Math.round(basePrice * 100)),
      currency: 'chf',
      description: 'Anesthesia Records (Base)',
    });
    
    // Note: questionnaire is now included in base fee, no separate line item
    
    if (hospital.addonDispocura) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: recordCount,
        unit_amount_decimal: String(Math.round(dispocuraAddOn * 100)),
        currency: 'chf',
        description: 'Dispocura Integration Add-on',
      });
    }
    
    if (hospital.addonRetell) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: 1,
        unit_amount_decimal: String(Math.round(retellAddOn * 100)),
        currency: 'chf',
        description: 'Retell.ai Phone Booking (Monthly)',
      });
    }
    
    if (hospital.addonMonitor) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: recordCount,
        unit_amount_decimal: String(Math.round(monitorAddOn * 100)),
        currency: 'chf',
        description: 'Monitor Camera Connection Add-on',
      });
    }
    
    // Note: surgery is now included in base fee, no separate line item
    
    // Flat monthly add-ons (quantity: 1)
    if (hospital.addonWorktime) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: 1,
        unit_amount_decimal: String(Math.round(worktimeAddOn * 100)),
        currency: 'chf',
        description: 'Work Time Logs Module (Monthly)',
      });
    }
    
    if (hospital.addonLogistics) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: 1,
        unit_amount_decimal: String(Math.round(logisticsAddOn * 100)),
        currency: 'chf',
        description: 'Logistics & Order Management Module (Monthly)',
      });
    }
    
    if (hospital.addonClinic) {
      await stripe.invoiceItems.create({
        customer: hospital.stripeCustomerId,
        invoice: invoice.id,
        quantity: 1,
        unit_amount_decimal: String(Math.round(clinicAddOn * 100)),
        currency: 'chf',
        description: 'Clinic Module with Invoices & Appointments (Monthly)',
      });
    }
    
    // Finalize and pay invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    
    // Store invoice record
    const [billingInvoice] = await db.insert(billingInvoices).values({
      hospitalId,
      periodStart,
      periodEnd,
      recordCount,
      basePrice: (recordCount * basePrice).toFixed(2),
      questionnairePrice: '0.00', // Included in base fee
      dispocuraPrice: (recordCount * dispocuraAddOn).toFixed(2),
      retellPrice: retellAddOn.toFixed(2),
      monitorPrice: (recordCount * monitorAddOn).toFixed(2),
      surgeryPrice: '0.00', // Included in base fee
      worktimePrice: worktimeAddOn.toFixed(2),
      logisticsPrice: logisticsAddOn.toFixed(2),
      clinicPrice: clinicAddOn.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
      currency: 'chf',
      stripeInvoiceId: finalizedInvoice.id,
      stripeInvoiceUrl: finalizedInvoice.hosted_invoice_url || undefined,
      status: finalizedInvoice.status === 'paid' ? 'paid' : 'pending',
      paidAt: finalizedInvoice.status === 'paid' ? new Date() : undefined,
    }).returning();
    
    res.json({
      success: true,
      invoice: billingInvoice,
      stripeInvoice: {
        id: finalizedInvoice.id,
        status: finalizedInvoice.status,
        hostedInvoiceUrl: finalizedInvoice.hosted_invoice_url,
      },
    });
  } catch (error: any) {
    logger.error("Error generating invoice:", error);
    res.status(500).json({ message: error.message || "Failed to generate invoice" });
  }
});

// Stripe webhook endpoint for invoice events
router.post("/api/billing/webhook", async (req, res) => {
  const stripe = getStripe();
  
  if (!stripe) {
    return res.status(500).json({ message: "Stripe is not configured" });
  }
  
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!webhookSecret) {
    logger.info("Stripe webhook secret not configured, accepting all events");
  }
  
  let event: Stripe.Event;
  
  try {
    if (webhookSecret && sig) {
      // req.body is raw Buffer from express.raw() middleware
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // Parse JSON manually when no signature verification
      const body = typeof req.body === 'string' || Buffer.isBuffer(req.body) 
        ? JSON.parse(req.body.toString()) 
        : req.body;
      event = body as Stripe.Event;
    }
  } catch (err: any) {
    logger.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ message: `Webhook Error: ${err.message}` });
  }
  
  try {
    switch (event.type) {
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[Webhook] Invoice paid: ${invoice.id}`);
        
        // Update our billing invoice record
        if (invoice.id) {
          await db
            .update(billingInvoices)
            .set({
              status: 'paid',
              paidAt: new Date(),
              stripePaymentIntentId: typeof invoice.payment_intent === 'string' 
                ? invoice.payment_intent 
                : invoice.payment_intent?.id,
            })
            .where(eq(billingInvoices.stripeInvoiceId, invoice.id));
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[Webhook] Invoice payment failed: ${invoice.id}`);
        
        // Update our billing invoice record
        if (invoice.id) {
          await db
            .update(billingInvoices)
            .set({
              status: 'failed',
              failedAt: new Date(),
              failureReason: invoice.last_finalization_error?.message || 'Payment failed',
            })
            .where(eq(billingInvoices.stripeInvoiceId, invoice.id));
        }
        break;
      }
      
      case 'invoice.finalized': {
        const invoice = event.data.object as Stripe.Invoice;
        logger.info(`[Webhook] Invoice finalized: ${invoice.id}`);
        
        // Update hosted invoice URL if available
        if (invoice.id && invoice.hosted_invoice_url) {
          await db
            .update(billingInvoices)
            .set({
              stripeInvoiceUrl: invoice.hosted_invoice_url,
              status: 'pending',
            })
            .where(eq(billingInvoices.stripeInvoiceId, invoice.id));
        }
        break;
      }
      
      default:
        logger.info(`[Webhook] Unhandled event type: ${event.type}`);
    }
    
    res.json({ received: true });
  } catch (error: any) {
    logger.error("Error processing webhook:", error);
    res.status(500).json({ message: "Webhook processing failed" });
  }
});

export default router;
