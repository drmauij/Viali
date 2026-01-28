import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { getUserUnitForHospital, canWrite, getActiveUnitIdFromRequest } from "../utils";

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    profileImageUrl?: string;
    expires_at?: number;
  };
}

export async function requireHospitalAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some((h) => h.id === hospitalId);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    next();
  } catch (error) {
    console.error("Error checking hospital access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

export async function requireUnitAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId;
    const unitId = req.params.unitId || req.body.unitId;

    if (!hospitalId || !unitId) {
      return res.status(400).json({ message: "Hospital ID and Unit ID are required" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(
      (h) => h.id === hospitalId && h.unitId === unitId
    );

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this unit" });
    }

    next();
  } catch (error) {
    console.error("Error checking unit access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

export async function requireWritePermission(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    const hospital = userHospitals.find((h) => h.id === hospitalId);
    const hasWrite = canWrite(hospital?.role || null);

    if (!hasWrite) {
      return res.status(403).json({ message: "Write access required" });
    }

    next();
  } catch (error) {
    console.error("Error checking write permission:", error);
    res.status(500).json({ message: "Failed to verify permissions" });
  }
}

export async function requireAdminRole(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = req.user.id;
    const hospitalId = req.params.hospitalId || req.body.hospitalId;

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    // Check if ANY of the user's role entries for this hospital has admin access
    const hasAdminAccess = userHospitals.some((h) => h.id === hospitalId && h.role === "admin");

    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required" });
    }

    next();
  } catch (error) {
    console.error("Error checking admin role:", error);
    res.status(500).json({ message: "Failed to verify permissions" });
  }
}

export function getClientSessionId(req: Request): string | undefined {
  return req.headers["x-client-session-id"] as string | undefined;
}

export async function getEffectiveUnitId(
  userId: string,
  hospitalId: string,
  moduleType?: string,
  directUnitId?: string,
  activeUnitId?: string
): Promise<string | undefined> {
  if (moduleType) {
    const units = await storage.getUnits(hospitalId);
    if (moduleType === "anesthesia") {
      const anesthesiaUnit = units.find((u) => u.type === 'anesthesia');
      if (anesthesiaUnit) return anesthesiaUnit.id;
    } else if (moduleType === "surgery") {
      const surgeryUnit = units.find((u) => u.type === 'or');
      if (surgeryUnit) return surgeryUnit.id;
    }
  }

  if (directUnitId) return directUnitId;

  const unitId = await getUserUnitForHospital(userId, hospitalId, activeUnitId);
  return unitId || undefined;
}
