import { storage, db } from "../storage";
import { items } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

export function getLicenseLimit(licenseType: string): number {
  switch (licenseType) {
    case "free":
      return 10;
    case "basic":
      return 500;
    default:
      return 10;
  }
}

export function getBulkImportImageLimit(licenseType: string): number {
  switch (licenseType) {
    case "basic":
      return 50;
    case "free":
    default:
      return 10;
  }
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
  
  const licenseType = hospital.licenseType || "free";
  const limit = getLicenseLimit(licenseType);
  
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(eq(items.hospitalId, hospitalId));
  
  const currentCount = result?.count || 0;
  
  return {
    allowed: currentCount < limit,
    currentCount,
    limit,
    licenseType,
  };
}
