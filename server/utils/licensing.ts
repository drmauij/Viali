import { storage, db } from "../storage";
import { items } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { Response, NextFunction } from "express";
import logger from "../logger";

// Limits removed - all plans now have unlimited access
// Billing is usage-based (per anesthesia record) for "basic" plan
// "free" plan has unlimited access with no billing

export function getLicenseLimit(licenseType: string): number {
  // All plans now have unlimited access
  return Infinity;
}

export function getBulkImportImageLimit(licenseType: string): number {
  // All plans now have unlimited image imports
  return Infinity;
}

export async function checkLicenseLimit(hospitalId: string): Promise<{ 
  allowed: boolean; 
  currentCount: number; 
  limit: number; 
  licenseType: string 
}> {
  const hospital = await storage.getHospital(hospitalId);
  if (!hospital) {
    throw new Error("Hospital not found");
  }
  
  const licenseType = hospital.licenseType || "basic";
  
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.hospitalId, hospitalId));
  
  const currentCount = result?.count || 0;
  
  // Always allowed - no limits
  return {
    allowed: true,
    currentCount,
    limit: Infinity,
    licenseType,
  };
}

// Check if hospital requires payment method (non-free plan without valid payment)
export async function checkBillingRequired(hospitalId: string): Promise<{
  billingRequired: boolean;
  hasPaymentMethod: boolean;
  licenseType: string;
}> {
  const hospital = await storage.getHospital(hospitalId);
  if (!hospital) {
    throw new Error("Hospital not found");
  }
  
  const licenseType = hospital.licenseType || "basic";
  const hasPaymentMethod = !!hospital.stripePaymentMethodId;
  
  // Free plan doesn't require billing
  if (licenseType === "free") {
    return { billingRequired: false, hasPaymentMethod, licenseType };
  }

  // Test plan — allow during 15-day trial
  if (licenseType === "test") {
    const TRIAL_DAYS = 15;
    let trialExpired = true;
    if (hospital.trialStartDate) {
      const trialEndsAt = new Date(hospital.trialStartDate);
      trialEndsAt.setDate(trialEndsAt.getDate() + TRIAL_DAYS);
      trialExpired = new Date() >= trialEndsAt;
    }
    return {
      billingRequired: trialExpired && !hasPaymentMethod,
      hasPaymentMethod,
      licenseType,
    };
  }

  // Basic plan requires payment method
  return {
    billingRequired: !hasPaymentMethod,
    hasPaymentMethod,
    licenseType,
  };
}

// Middleware to enforce billing for basic plan users
// Blocks creating new anesthesia records if payment method is not set up
export function requireBillingSetup(req: any, res: Response, next: NextFunction) {
  const checkBilling = async () => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      // Get the hospital from the request body (for record creation)
      // or from the surgery being referenced
      let hospitalId: string | null = null;
      
      if (req.body?.hospitalId) {
        hospitalId = req.body.hospitalId;
      } else if (req.body?.surgeryId) {
        const surgery = await storage.getSurgery(req.body.surgeryId);
        if (surgery) {
          hospitalId = surgery.hospitalId;
        }
      }
      
      if (!hospitalId) {
        return next();
      }

      const billingStatus = await checkBillingRequired(hospitalId);
      
      if (billingStatus.billingRequired) {
        return res.status(402).json({ 
          message: "Payment required",
          code: "BILLING_REQUIRED",
          details: "A payment method must be set up before creating new anesthesia records. Please go to Admin > Billing to add a payment method."
        });
      }
      
      next();
    } catch (error) {
      logger.error("Error checking billing status:", error);
      next();
    }
  };
  
  checkBilling();
}
