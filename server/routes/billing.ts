import { Router } from "express";
import Stripe from "stripe";
import { storage, db } from "../storage";
import { hospitals, anesthesiaRecords, surgeries } from "@shared/schema";
import { eq, and, gte, lt, sql } from "drizzle-orm";

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
    const hospital = userHospitals.find((h: any) => h.id === hospitalId);

    if (!hospital || hospital.role !== "admin") {
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
    });
  } catch (error) {
    console.error("Error fetching billing status:", error);
    res.status(500).json({ message: "Failed to fetch billing status" });
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

export default router;
