import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export const ROLE_HIERARCHY = ['admin', 'doctor', 'nurse', 'guest'] as const;
export type UserRole = typeof ROLE_HIERARCHY[number];

export const WRITE_ROLES: UserRole[] = ['admin', 'doctor', 'nurse'];
export const READ_ONLY_ROLES: UserRole[] = ['guest'];

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
  if (roles.includes('guest')) return 'guest';
  
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

export function canWrite(role: string | null): boolean {
  if (!role) return false;
  return WRITE_ROLES.includes(role as UserRole);
}

export function isGuest(role: string | null): boolean {
  return role === 'guest';
}

export async function requireWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    // Try to get hospitalId from various sources:
    // 1. X-Active-Hospital-Id header (most reliable for anesthesia module)
    // 2. URL params (hospitalId or id that might be a hospitalId)
    // 3. Request body
    // 4. Query params
    const headerHospitalId = req.headers['x-active-hospital-id'];
    const hospitalId = headerHospitalId || 
                       req.params.hospitalId || 
                       req.body?.hospitalId || 
                       req.query?.hospitalId;
    
    if (!hospitalId) {
      // If we still can't find hospitalId, check if user has write access to ANY hospital
      // This is a fallback for routes that don't pass hospitalId
      const hospitals = await storage.getUserHospitals(userId);
      const hasAnyWriteAccess = hospitals.some(h => canWrite(h.role));
      
      if (!hasAnyWriteAccess) {
        return res.status(403).json({ 
          message: "Insufficient permissions. Guest users have read-only access.",
          code: "READ_ONLY_ACCESS"
        });
      }
      
      return next();
    }
    
    const role = await getUserRole(userId, hospitalId);
    
    if (!canWrite(role)) {
      return res.status(403).json({ 
        message: "Insufficient permissions. Guest users have read-only access.",
        code: "READ_ONLY_ACCESS"
      });
    }
    
    next();
  } catch (error) {
    console.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}
