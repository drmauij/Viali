import { storage, db } from "../storage";
import { items } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

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
    return {
      billingRequired: false,
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
