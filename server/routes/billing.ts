import { Router } from "express";
import Stripe from "stripe";
import { storage, db } from "../storage";
import { hospitals, anesthesiaRecords, surgeries, termsAcceptances, users } from "@shared/schema";
import { eq, and, gte, lt, sql, desc } from "drizzle-orm";
import { Resend } from "resend";
import { jsPDF } from "jspdf";

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
    console.error("Error checking admin role:", error);
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
        console.error("Failed to retrieve payment method:", e);
      }
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthRecords = await countAnesthesiaRecordsForHospital(hospitalId, startOfMonth);
    const pricePerRecord = hospital.pricePerRecord ? parseFloat(hospital.pricePerRecord) : 0;
    const estimatedCost = currentMonthRecords * pricePerRecord;

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
      billingRequired: hospital.licenseType !== "free" && !hospital.stripePaymentMethodId,
      // Free accounts get full access to all addons, otherwise use database values
      addons: hospital.licenseType === "free" 
        ? {
            questionnaire: true,
            dispocura: true,
            retell: true,
            monitor: true,
          }
        : {
            questionnaire: hospital.addonQuestionnaire ?? false,
            dispocura: hospital.addonDispocura ?? false,
            retell: hospital.addonRetell ?? false,
            monitor: hospital.addonMonitor ?? false,
          },
    });
  } catch (error) {
    console.error("Error fetching billing status:", error);
    res.status(500).json({ message: "Failed to fetch billing status" });
  }
});

router.patch("/api/billing/:hospitalId/addons", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { addon, enabled } = req.body;

    const validAddons = ["questionnaire", "dispocura", "retell", "monitor"];
    if (!validAddons.includes(addon)) {
      return res.status(400).json({ message: "Invalid addon type" });
    }

    const columnMap: Record<string, any> = {
      questionnaire: { addonQuestionnaire: enabled },
      dispocura: { addonDispocura: enabled },
      retell: { addonRetell: enabled },
      monitor: { addonMonitor: enabled },
    };

    await db
      .update(hospitals)
      .set(columnMap[addon])
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true, addon, enabled });
  } catch (error) {
    console.error("Error updating addon:", error);
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
        return res.status(400).json({ message: "Terms of use must be accepted before setting up payment" });
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
    console.error("Error creating setup intent:", error);
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
        return res.status(400).json({ message: "Terms of use must be accepted before setting up payment" });
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

    await db
      .update(hospitals)
      .set({ stripePaymentMethodId: paymentMethodId })
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error confirming setup:", error);
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
        console.error("Failed to detach payment method:", e);
      }
    }

    await db
      .update(hospitals)
      .set({ stripePaymentMethodId: null })
      .where(eq(hospitals.id, hospitalId));

    res.json({ success: true });
  } catch (error) {
    console.error("Error removing payment method:", error);
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
    console.error("Error creating portal session:", error);
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
    console.error("Error fetching usage:", error);
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
    console.error("Error charging month:", error);
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
    console.error("Error fetching invoices:", error);
    res.status(500).json({ message: "Failed to fetch invoices" });
  }
});

// Terms of Use routes
const CURRENT_TERMS_VERSION = "1.0";

router.get("/api/billing/:hospitalId/terms-status", isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const userHospitals = await storage.getUserHospitals(userId);
    if (!userHospitals.some((h) => h.id === hospitalId)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [acceptance] = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.hospitalId, hospitalId),
        eq(termsAcceptances.version, CURRENT_TERMS_VERSION)
      ))
      .orderBy(desc(termsAcceptances.signedAt))
      .limit(1);

    res.json({
      hasAccepted: !!acceptance,
      currentVersion: CURRENT_TERMS_VERSION,
      acceptance: acceptance ? {
        signedAt: acceptance.signedAt,
        signedByName: acceptance.signedByName,
        signedByEmail: acceptance.signedByEmail,
        countersignedAt: acceptance.countersignedAt,
        countersignedByName: acceptance.countersignedByName,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching terms status:", error);
    res.status(500).json({ message: "Failed to fetch terms status" });
  }
});

router.post("/api/billing/:hospitalId/accept-terms", isAuthenticated, requireAdminRoleCheck, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { signatureImage, signerName } = req.body;
    const userId = req.user.id;

    if (!signatureImage || !signerName) {
      return res.status(400).json({ message: "Signature and signer name are required" });
    }

    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if already accepted this version
    const [existing] = await db
      .select()
      .from(termsAcceptances)
      .where(and(
        eq(termsAcceptances.hospitalId, hospitalId),
        eq(termsAcceptances.version, CURRENT_TERMS_VERSION)
      ))
      .limit(1);

    if (existing) {
      return res.status(400).json({ message: "Terms already accepted for this version" });
    }

    const signedAt = new Date();
    
    // Generate PDF with terms and signature
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    let y = 20;
    
    // Title
    pdf.setFontSize(18);
    pdf.setFont("helvetica", "bold");
    pdf.text("Terms of Use - Viali.app", pageWidth / 2, y, { align: "center" });
    y += 15;
    
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Version: ${CURRENT_TERMS_VERSION}`, pageWidth / 2, y, { align: "center" });
    y += 15;
    
    // Provider section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("1. Provider", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Acutiq, owned by Maurizio Betti", 15, y); y += 5;
    pdf.text("Bruder-Klaus-Str 18, 78467 Konstanz, Germany", 15, y); y += 5;
    pdf.text("Service: https://use.viali.app", 15, y); y += 10;
    
    // Service & Pricing section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("2. Service & Pricing", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("Basic Package: 3.00 CHF per anesthesia record", 15, y); y += 5;
    pdf.text("  - Digital anesthesia protocols (Pre-OP, OP, PACU)", 15, y); y += 5;
    pdf.text("  - Inventory management (medications, materials, controlled substances)", 15, y); y += 5;
    pdf.text("  - Cloud hosting (Exoscale, Switzerland), backups, updates, support", 15, y); y += 7;
    pdf.text("Premium Package: 4.00 CHF per record (when available)", 15, y); y += 5;
    pdf.text("  - All basic features plus automatic vital parameter data transfer via camera", 15, y); y += 5;
    pdf.text("  - Camera hardware: ~100 CHF per monitor", 15, y); y += 5;
    pdf.text("  - Installation & setup: ~2-4h at 300 CHF/room", 15, y); y += 7;
    pdf.text("Custom Development: 300 CHF/hour (integrations, clinic-specific features)", 15, y); y += 12;
    
    // Billing section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("3. Billing & Payment", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("  - Monthly billing based on actual usage", 15, y); y += 5;
    pdf.text("  - Credit card payment (in-app), invoice from Germany (no VAT)", 15, y); y += 5;
    pdf.text("  - Monthly cancellation possible", 15, y); y += 5;
    pdf.text("  - Price changes with 3 months notice", 15, y); y += 12;
    
    // Data section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("4. Data Ownership & Privacy", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("  - Patient data remains exclusive property of the clinic", 15, y); y += 5;
    pdf.text("  - Subject to Swiss GDPR legislation", 15, y); y += 5;
    pdf.text("  - Hosted on Exoscale servers (Switzerland)", 15, y); y += 12;
    
    // Liability section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("5. Security & Limitation of Liability", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("  - Provider implements reasonable security measures and regular backups", 15, y); y += 5;
    pdf.text("  - No liability for data loss, breaches, or damages from software bugs", 15, y); y += 5;
    pdf.text("    or improper use of accounts", 15, y); y += 5;
    pdf.text("  - Maximum liability limited to fees paid in prior 12 months", 15, y); y += 12;
    
    // Support section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("6. Support", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("  - Critical events: 2h initial response", 15, y); y += 5;
    pdf.text("  - Mon-Fri 8-18 CET via in-app/email", 15, y); y += 12;
    
    // Jurisdiction section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("7. Jurisdiction", 15, y);
    y += 7;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text("  - All disputes handled by courts in Konstanz, Germany", 15, y); y += 15;
    
    // Signature section
    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text("Acceptance", 15, y);
    y += 10;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.text(`Clinic: ${hospital.name}`, 15, y); y += 6;
    pdf.text(`Signed by: ${signerName}`, 15, y); y += 6;
    pdf.text(`Email: ${user.email || "N/A"}`, 15, y); y += 6;
    pdf.text(`Date: ${signedAt.toLocaleDateString("de-DE")} ${signedAt.toLocaleTimeString("de-DE")}`, 15, y); y += 10;
    
    // Add signature image
    try {
      pdf.addImage(signatureImage, "PNG", 15, y, 60, 25);
      y += 30;
    } catch (e) {
      console.error("Failed to add signature image to PDF:", e);
    }
    
    pdf.text("_________________________________", 15, y); y += 5;
    pdf.text("Clinic Representative Signature", 15, y); y += 15;
    
    // Countersignature placeholder
    pdf.text("Countersignature (Acutiq):", 15, y); y += 10;
    pdf.text("_________________________________", 15, y); y += 5;
    pdf.text("Date: _______________", 15, y);
    
    const pdfBuffer = Buffer.from(pdf.output("arraybuffer"));
    const pdfBase64 = pdfBuffer.toString("base64");

    // Send email with PDF attachment via Resend
    let emailSentAt: Date | null = null;
    const resendApiKey = process.env.RESEND_API_KEY;
    
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "Viali.app <noreply@viali.app>",
          to: ["info@acutiq.com"],
          subject: `Terms of Use Signed - ${hospital.name}`,
          html: `
            <h2>Terms of Use Acceptance</h2>
            <p>A new Terms of Use agreement has been signed and requires countersigning.</p>
            <p><strong>Clinic:</strong> ${hospital.name}</p>
            <p><strong>Signed by:</strong> ${signerName}</p>
            <p><strong>Email:</strong> ${user.email || "N/A"}</p>
            <p><strong>Date:</strong> ${signedAt.toLocaleDateString("de-DE")} ${signedAt.toLocaleTimeString("de-DE")}</p>
            <p><strong>Version:</strong> ${CURRENT_TERMS_VERSION}</p>
            <p>Please review and countersign the attached PDF.</p>
          `,
          attachments: [
            {
              filename: `terms_of_use_${hospital.name.replace(/\s+/g, "_")}_${signedAt.toISOString().split("T")[0]}.pdf`,
              content: pdfBase64,
            },
          ],
        });
        emailSentAt = new Date();
        console.log("Terms acceptance email sent successfully");
      } catch (emailError) {
        console.error("Failed to send terms acceptance email:", emailError);
      }
    } else {
      console.log("RESEND_API_KEY not configured, skipping email");
    }

    // Save acceptance record
    const [acceptance] = await db
      .insert(termsAcceptances)
      .values({
        hospitalId,
        version: CURRENT_TERMS_VERSION,
        signedByUserId: userId,
        signedByName: signerName,
        signedByEmail: user.email || "",
        signatureImage,
        emailSentAt,
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
    console.error("Error accepting terms:", error);
    res.status(500).json({ message: "Failed to accept terms" });
  }
});

export default router;
