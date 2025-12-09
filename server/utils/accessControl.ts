import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

export const ROLE_HIERARCHY = ['admin', 'manager', 'doctor', 'nurse', 'guest'] as const;
export type UserRole = typeof ROLE_HIERARCHY[number];

export const WRITE_ROLES: UserRole[] = ['admin', 'manager', 'doctor', 'nurse'];
export const READ_ONLY_ROLES: UserRole[] = ['guest'];

// Helper to get hospitalId from various resource types
export async function getHospitalIdFromResource(params: {
  surgeryId?: string;
  anesthesiaRecordId?: string;
  recordId?: string;
  preOpId?: string;
}): Promise<string | null> {
  // Try surgery ID first
  if (params.surgeryId) {
    const surgery = await storage.getSurgery(params.surgeryId);
    return surgery?.hospitalId || null;
  }
  
  // Try anesthesia record ID (need to get surgeryId first, then hospitalId)
  if (params.anesthesiaRecordId || params.recordId) {
    const recordId = params.anesthesiaRecordId || params.recordId;
    const record = await storage.getAnesthesiaRecordById(recordId!);
    if (record?.surgeryId) {
      const surgery = await storage.getSurgery(record.surgeryId);
      return surgery?.hospitalId || null;
    }
    return null;
  }
  
  // Try preop assessment ID (need to get surgeryId first, then hospitalId)
  if (params.preOpId) {
    const assessment = await storage.getPreOpAssessmentById(params.preOpId);
    if (assessment?.surgeryId) {
      const surgery = await storage.getSurgery(assessment.surgeryId);
      return surgery?.hospitalId || null;
    }
    return null;
  }
  
  return null;
}

// Check if user has any access (read or write) to a hospital
export async function userHasHospitalAccess(userId: string, hospitalId: string): Promise<boolean> {
  const hospitals = await storage.getUserHospitals(userId);
  return hospitals.some(h => h.id === hospitalId);
}

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

// Helper to resolve hospitalId from request parameters
async function resolveHospitalIdFromRequest(req: any): Promise<string | null> {
  // 1. Try X-Active-Hospital-Id header (most reliable)
  const headerHospitalId = req.headers['x-active-hospital-id'];
  if (headerHospitalId) return headerHospitalId;
  
  // 2. Try explicit hospitalId from params, body, or query
  const explicitHospitalId = req.params.hospitalId || req.body?.hospitalId || req.query?.hospitalId;
  if (explicitHospitalId) return explicitHospitalId;
  
  // 3. Try to resolve from resource IDs (surgery, anesthesia record, etc.)
  const resourceHospitalId = await getHospitalIdFromResource({
    surgeryId: req.params.surgeryId || req.body?.surgeryId,
    anesthesiaRecordId: req.params.anesthesiaRecordId || req.body?.anesthesiaRecordId,
    recordId: req.params.recordId || req.params.id, // Many routes use :id for record ID
    preOpId: req.params.preOpId || req.params.assessmentId,
  });
  if (resourceHospitalId) return resourceHospitalId;
  
  return null;
}

// Middleware to verify user has read access to the hospital
export async function requireHospitalAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req);
    
    if (!hospitalId) {
      // If we can't determine hospitalId, allow the request but log it
      // The route handler should handle data isolation
      console.warn(`[Access Control] Could not resolve hospitalId for ${req.method} ${req.path}`);
      return next();
    }
    
    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ 
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }
    
    // Store the resolved hospitalId for use by route handlers
    req.resolvedHospitalId = hospitalId;
    next();
  } catch (error) {
    console.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Helper to get the active role from request headers, validated against database
async function getActiveRoleFromRequest(req: any, userId: string, hospitalId: string): Promise<string | null> {
  const headerRole = req.headers['x-active-role'] as string | undefined;
  
  // Get the user's actual roles for this hospital from the database
  const hospitals = await storage.getUserHospitals(userId);
  const matchingHospitals = hospitals.filter(h => h.id === hospitalId);
  
  if (matchingHospitals.length === 0) {
    return null;
  }
  
  // Get all roles user has for this hospital
  const availableRoles = matchingHospitals.map(h => h.role).filter(Boolean);
  
  // If header specifies a role, verify user actually has it
  if (headerRole && availableRoles.includes(headerRole)) {
    return headerRole;
  }
  
  // Fall back to highest role if header role is invalid or not provided
  if (availableRoles.includes('admin')) return 'admin';
  if (availableRoles.includes('doctor')) return 'doctor';
  if (availableRoles.includes('nurse')) return 'nurse';
  if (availableRoles.includes('guest')) return 'guest';
  
  return availableRoles[0] || null;
}

// Middleware to verify user has write access (non-guest role) to the hospital
export async function requireWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req);
    
    if (!hospitalId) {
      // If we can't determine hospitalId, check if the active role from header allows writes
      const headerRole = req.headers['x-active-role'] as string | undefined;
      
      if (headerRole && !canWrite(headerRole)) {
        return res.status(403).json({ 
          message: "Insufficient permissions. Guest users have read-only access.",
          code: "READ_ONLY_ACCESS"
        });
      }
      
      // If no header role, fall back to checking if user has write access to any hospital
      if (!headerRole) {
        const hospitals = await storage.getUserHospitals(userId);
        const hasAnyWriteAccess = hospitals.some(h => canWrite(h.role));
        
        if (!hasAnyWriteAccess) {
          return res.status(403).json({ 
            message: "Insufficient permissions. Guest users have read-only access.",
            code: "READ_ONLY_ACCESS"
          });
        }
      }
      
      console.warn(`[Access Control] Could not resolve hospitalId for write check on ${req.method} ${req.path}`);
      return next();
    }
    
    // First verify user has access to this hospital
    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }
    
    // Get the active role (from header if valid, otherwise highest role)
    const role = await getActiveRoleFromRequest(req, userId, hospitalId);
    
    if (!canWrite(role)) {
      return res.status(403).json({ 
        message: "Insufficient permissions. Guest users have read-only access.",
        code: "READ_ONLY_ACCESS"
      });
    }
    
    // Store the resolved hospitalId and role for use by route handlers
    req.resolvedHospitalId = hospitalId;
    req.resolvedRole = role;
    next();
  } catch (error) {
    console.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}
