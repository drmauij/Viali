import type { Request } from "express";
import { storage } from "../storage";

export async function getUserUnitForHospital(
  userId: string, 
  hospitalId: string, 
  activeUnitId?: string
): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  
  if (activeUnitId) {
    const hasAccess = hospitals.some(h => h.id === hospitalId && h.unitId === activeUnitId);
    if (hasAccess) {
      return activeUnitId;
    }
  }
  
  const hospital = hospitals.find(h => h.id === hospitalId);
  return hospital?.unitId || null;
}

export function getActiveUnitIdFromRequest(req: Request): string | null {
  return (req.headers as any)['x-active-unit-id'] || null;
}

export async function getUserRole(userId: string, hospitalId: string): Promise<string | null> {
  const hospitals = await storage.getUserHospitals(userId);
  const matchingHospitals = hospitals.filter(h => h.id === hospitalId);
  
  if (matchingHospitals.length === 0) {
    return null;
  }
  
  const roles = matchingHospitals.map(h => h.role).filter(Boolean);
  
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('doctor')) return 'doctor';
  if (roles.includes('nurse')) return 'nurse';
  
  return roles[0] || null;
}

export async function verifyUserHospitalUnitAccess(
  userId: string, 
  hospitalId: string, 
  unitId: string
): Promise<{ hasAccess: boolean; role: string | null }> {
  const hospitals = await storage.getUserHospitals(userId);
  const match = hospitals.find(h => h.id === hospitalId && h.unitId === unitId);
  return {
    hasAccess: !!match,
    role: match?.role || null
  };
}
