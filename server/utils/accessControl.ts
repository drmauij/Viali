import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import logger from "../logger";

export const ROLE_HIERARCHY = ['admin', 'manager', 'doctor', 'nurse', 'staff', 'guest'] as const;
export type UserRole = typeof ROLE_HIERARCHY[number];

export const WRITE_ROLES: UserRole[] = ['admin', 'manager', 'doctor', 'nurse', 'staff'];
export const READ_ONLY_ROLES: UserRole[] = ['guest'];

// Helper to get hospitalId from various resource types
export async function getHospitalIdFromResource(params: {
  surgeryId?: string;
  anesthesiaRecordId?: string;
  recordId?: string;
  preOpId?: string;
  itemId?: string;
  orderId?: string;
  orderLineId?: string;
  alertId?: string;
  lotId?: string;
  noteId?: string;
  todoId?: string;
  roomId?: string;
  groupId?: string;
  surgeryRoomId?: string;
  medicationGroupId?: string;
  administrationGroupId?: string;
  unitId?: string;
  roleId?: string;
}): Promise<string | null> {
  // Direct hospitalId resources
  if (params.surgeryId) {
    const surgery = await storage.getSurgery(params.surgeryId);
    return surgery?.hospitalId || null;
  }

  if (params.itemId) {
    const item = await storage.getItem(params.itemId);
    return item?.hospitalId || null;
  }

  if (params.orderId) {
    const order = await storage.getOrderById(params.orderId);
    return order?.hospitalId || null;
  }

  if (params.alertId) {
    const alert = await storage.getAlertById(params.alertId);
    return alert?.hospitalId || null;
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

  // Order line → order → hospital
  if (params.orderLineId) {
    const line = await storage.getOrderLineById(params.orderLineId);
    if (line?.orderId) {
      const order = await storage.getOrderById(line.orderId);
      return order?.hospitalId || null;
    }
    return null;
  }

  // Lot → item → hospital
  if (params.lotId) {
    const lot = await storage.getLotById(params.lotId);
    if (lot?.itemId) {
      const item = await storage.getItem(lot.itemId);
      return item?.hospitalId || null;
    }
    return null;
  }
  
  // Surgery room resolution (roomId or surgeryRoomId)
  if (params.roomId || params.surgeryRoomId) {
    const roomId = params.roomId || params.surgeryRoomId;
    const room = await storage.getSurgeryRoomById(roomId!);
    return room?.hospitalId || null;
  }
  
  // Medication group resolution (groupId might be medication or administration, try both)
  if (params.medicationGroupId) {
    const group = await storage.getMedicationGroupById(params.medicationGroupId);
    return group?.hospitalId || null;
  }
  
  // Administration group resolution
  if (params.administrationGroupId) {
    const group = await storage.getAdministrationGroupById(params.administrationGroupId);
    return group?.hospitalId || null;
  }
  
  // Generic groupId - try medication group first, then administration group
  if (params.groupId) {
    const medGroup = await storage.getMedicationGroupById(params.groupId);
    if (medGroup) return medGroup.hospitalId;
    const adminGroup = await storage.getAdministrationGroupById(params.groupId);
    if (adminGroup) return adminGroup.hospitalId;
    return null;
  }
  
  // Unit resolution
  if (params.unitId) {
    const unit = await storage.getUnit(params.unitId);
    return unit?.hospitalId || null;
  }
  
  // User hospital role resolution
  if (params.roleId) {
    const role = await storage.getUserHospitalRoleById(params.roleId);
    return role?.hospitalId || null;
  }
  
  return null;
}

// Middleware factory for resource-based access control
// Usage: app.get('/api/items/:itemId/codes', isAuthenticated, requireResourceAccess('itemId'), handler)
export function requireResourceAccess(paramName: string, requireWrite: boolean = false) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({ message: `Missing required parameter: ${paramName}` });
      }

      // Build params object for getHospitalIdFromResource
      const params: Record<string, string> = {};
      params[paramName] = resourceId;

      const hospitalId = await getHospitalIdFromResource(params);
      logger.info(`[AccessControl] Resource ${paramName}=${resourceId} -> hospitalId=${hospitalId}`);
      if (!hospitalId) {
        logger.info(`[AccessControl] Resource not found for ${paramName}=${resourceId}`);
        return res.status(404).json({ message: "Resource not found" });
      }

      // Verify user has access to this hospital
      const hasAccess = await userHasHospitalAccess(userId, hospitalId);
      logger.info(`[AccessControl] User ${userId} access to hospital ${hospitalId}: ${hasAccess}`);
      if (!hasAccess) {
        return res.status(403).json({ 
          message: "Access denied. You do not have access to this resource.",
          code: "RESOURCE_ACCESS_DENIED"
        });
      }

      // If write access required, check role
      if (requireWrite) {
        const role = await getUserRole(userId, hospitalId);
        if (!canWrite(role)) {
          return res.status(403).json({ 
            message: "Insufficient permissions. Guest users have read-only access.",
            code: "READ_ONLY_ACCESS"
          });
        }
        req.resolvedRole = role;
      }

      // Store verified hospital info for route handlers
      req.verifiedHospitalId = hospitalId;
      req.resolvedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking resource access for ${paramName}:`, error);
      res.status(500).json({ message: "Error checking resource permissions" });
    }
  };
}

// Middleware factory for admin-only resource access control
// Verifies user is admin for the hospital that owns the resource
export function requireResourceAdmin(paramName: string) {
  return async (req: any, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: "Authentication required" });
      }

      const resourceId = req.params[paramName];
      if (!resourceId) {
        return res.status(400).json({ message: `Missing required parameter: ${paramName}` });
      }

      // Build params object for getHospitalIdFromResource
      const params: Record<string, string> = {};
      params[paramName] = resourceId;

      const hospitalId = await getHospitalIdFromResource(params);
      if (!hospitalId) {
        return res.status(404).json({ message: "Resource not found" });
      }

      // Verify user has admin role for this hospital
      const hospitals = await storage.getUserHospitals(userId);
      const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
      if (!hasAdminRole) {
        return res.status(403).json({ 
          message: "Admin access required for this resource.",
          code: "ADMIN_ACCESS_REQUIRED"
        });
      }

      // Store verified hospital info for route handlers
      req.verifiedHospitalId = hospitalId;
      req.resolvedHospitalId = hospitalId;
      next();
    } catch (error) {
      logger.error(`Error checking admin resource access for ${paramName}:`, error);
      res.status(500).json({ message: "Error checking resource permissions" });
    }
  };
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
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('doctor')) return 'doctor';
  if (roles.includes('nurse')) return 'nurse';
  if (roles.includes('staff')) return 'staff';
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

// Check if user's active unit is a logistics unit (type === 'logistic')
// Logistics users can manage orders from any unit in the hospital
export async function isUserInLogisticUnit(
  userId: string, 
  hospitalId: string, 
  activeUnitId?: string
): Promise<boolean> {
  const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId);
  if (!unitId) return false;
  
  const unit = await storage.getUnit(unitId);
  return unit?.type === 'logistic';
}

// Check if user has logistics access for a hospital (any of their units has type === 'logistic')
// This allows logistic users to manage orders from ALL units in the hospital
export async function hasLogisticsAccess(
  userId: string, 
  hospitalId: string
): Promise<boolean> {
  const userHospitals = await storage.getUserHospitals(userId);
  const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
  
  if (userUnitsForHospital.length === 0) return false;
  
  const unitIds = userUnitsForHospital.map(h => h.unitId).filter(Boolean) as string[];
  
  for (const unitId of unitIds) {
    const unit = await storage.getUnit(unitId);
    if (unit?.type === 'logistic') {
      return true;
    }
  }
  
  return false;
}

// Check if user can access a specific order (either owns the unit or has logistics access)
export async function canAccessOrder(
  userId: string,
  hospitalId: string,
  orderUnitId: string
): Promise<boolean> {
  const userHospitals = await storage.getUserHospitals(userId);
  const userUnitsForHospital = userHospitals.filter(h => h.id === hospitalId);
  
  if (userUnitsForHospital.length === 0) return false;
  
  // Check if user has direct access to the order's unit
  const hasDirectAccess = userUnitsForHospital.some(h => h.unitId === orderUnitId);
  if (hasDirectAccess) return true;
  
  // Check if user has logistics access (any of their units has isLogisticModule)
  return hasLogisticsAccess(userId, hospitalId);
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

// Middleware to verify user has read access to the hospital (lenient - allows if hospitalId not found)
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
      logger.warn(`[Access Control] Could not resolve hospitalId for ${req.method} ${req.path}`);
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
    logger.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware - fails if hospitalId cannot be resolved (use for multi-tenant routes)
export async function requireStrictHospitalAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req);
    
    if (!hospitalId) {
      logger.error(`[Access Control] STRICT: Missing hospitalId for ${req.method} ${req.path}`);
      return res.status(400).json({ 
        message: "Hospital context required. Please select a hospital.",
        code: "HOSPITAL_ID_REQUIRED"
      });
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
    req.verifiedHospitalId = hospitalId; // Alias for clarity
    next();
  } catch (error) {
    logger.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware for admin-only access to hospital
export async function requireHospitalAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req);
    
    if (!hospitalId) {
      return res.status(400).json({ 
        message: "Hospital context required.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }
    
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
    
    if (!hospital) {
      return res.status(403).json({ 
        message: "Admin access required for this operation.",
        code: "ADMIN_ACCESS_REQUIRED"
      });
    }
    
    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = 'admin';
    next();
  } catch (error) {
    logger.error("Error checking admin access:", error);
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
  if (availableRoles.includes('manager')) return 'manager';
  if (availableRoles.includes('doctor')) return 'doctor';
  if (availableRoles.includes('nurse')) return 'nurse';
  if (availableRoles.includes('staff')) return 'staff';
  if (availableRoles.includes('guest')) return 'guest';
  
  return availableRoles[0] || null;
}

// Middleware to verify user has write access (non-guest role) to the hospital (lenient)
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
      
      logger.warn(`[Access Control] Could not resolve hospitalId for write check on ${req.method} ${req.path}`);
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
    logger.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// STRICT middleware for write access - fails if hospitalId cannot be resolved
export async function requireStrictWriteAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Authentication required" });
    }
    
    const hospitalId = await resolveHospitalIdFromRequest(req);
    
    if (!hospitalId) {
      logger.error(`[Access Control] STRICT: Missing hospitalId for write on ${req.method} ${req.path}`);
      return res.status(400).json({ 
        message: "Hospital context required. Please select a hospital.",
        code: "HOSPITAL_ID_REQUIRED"
      });
    }
    
    // Verify user has access to this hospital
    const hasAccess = await userHasHospitalAccess(userId, hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ 
        message: "Access denied. You do not have access to this hospital's data.",
        code: "HOSPITAL_ACCESS_DENIED"
      });
    }
    
    // Get the active role and verify write permission
    const role = await getActiveRoleFromRequest(req, userId, hospitalId);
    
    if (!canWrite(role)) {
      return res.status(403).json({ 
        message: "Insufficient permissions. Guest users have read-only access.",
        code: "READ_ONLY_ACCESS"
      });
    }
    
    // Store the resolved hospitalId and role for use by route handlers
    req.resolvedHospitalId = hospitalId;
    req.verifiedHospitalId = hospitalId;
    req.resolvedRole = role;
    next();
  } catch (error) {
    logger.error("Error checking write access:", error);
    res.status(500).json({ message: "Error checking permissions" });
  }
}

// Helper to verify a record belongs to the expected hospital (for use in route handlers)
export async function verifyRecordBelongsToHospital(
  recordHospitalId: string | null | undefined,
  expectedHospitalId: string,
  recordType: string = 'Record'
): Promise<{ valid: boolean; error?: string }> {
  if (!recordHospitalId) {
    return { valid: false, error: `${recordType} not found` };
  }
  if (recordHospitalId !== expectedHospitalId) {
    logger.error(`[Access Control] Hospital mismatch: ${recordType} belongs to ${recordHospitalId}, user accessing ${expectedHospitalId}`);
    return { valid: false, error: `Access denied to this ${recordType.toLowerCase()}` };
  }
  return { valid: true };
}
