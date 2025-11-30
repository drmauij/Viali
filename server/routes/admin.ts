import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, activities } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireWriteAccess } from "../utils";

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

const router = Router();

async function isAdmin(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    next();
  } catch (error) {
    console.error("Error checking admin:", error);
    res.status(500).json({ message: "Failed to verify admin access" });
  }
}

router.patch('/api/admin/:hospitalId', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Hospital name is required" });
    }

    const updated = await storage.updateHospital(hospitalId, { name });
    res.json(updated);
  } catch (error) {
    console.error("Error updating hospital:", error);
    res.status(500).json({ message: "Failed to update hospital" });
  }
});

router.patch('/api/admin/:hospitalId/anesthesia-location', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { anesthesiaUnitId } = req.body;

    if (!anesthesiaUnitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const targetUnit = allUnits.find(l => l.id === anesthesiaUnitId);
    if (!targetUnit) {
      return res.status(400).json({ message: "Selected unit does not belong to this hospital" });
    }

    await Promise.all(
      allUnits
        .filter(u => u.isAnesthesiaModule)
        .map(u => storage.updateUnit(u.id, { isAnesthesiaModule: false }))
    );

    const updated = await storage.updateUnit(anesthesiaUnitId, { isAnesthesiaModule: true });
    res.json(updated);
  } catch (error) {
    console.error("Error updating anesthesia location:", error);
    res.status(500).json({ message: "Failed to update anesthesia location" });
  }
});

router.patch('/api/admin/:hospitalId/surgery-location', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { surgeryUnitId } = req.body;

    if (!surgeryUnitId) {
      return res.status(400).json({ message: "Unit ID is required" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const targetUnit = allUnits.find(l => l.id === surgeryUnitId);
    if (!targetUnit) {
      return res.status(400).json({ message: "Selected unit does not belong to this hospital" });
    }

    await Promise.all(
      allUnits
        .filter(u => u.isSurgeryModule)
        .map(u => storage.updateUnit(u.id, { isSurgeryModule: false }))
    );

    const updated = await storage.updateUnit(surgeryUnitId, { isSurgeryModule: true });
    res.json(updated);
  } catch (error) {
    console.error("Error updating surgery location:", error);
    res.status(500).json({ message: "Failed to update surgery location" });
  }
});

router.get('/api/surgeons', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.query;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const userHospitals = await storage.getUserHospitals(req.user.id);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);

    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const surgeryUnit = allUnits.find(u => u.isSurgeryModule);
    
    if (!surgeryUnit) {
      return res.json([]);
    }

    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    const surgeons = hospitalUsers
      .filter(hu => hu.unitId === surgeryUnit.id && hu.role === "doctor")
      .map(hu => ({
        id: hu.user.id,
        name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
        email: hu.user.email,
      }));

    res.json(surgeons);
  } catch (error) {
    console.error("Error fetching surgeons:", error);
    res.status(500).json({ message: "Failed to fetch surgeons" });
  }
});

router.get('/api/admin/:hospitalId/units', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const units = await storage.getUnits(hospitalId);
    res.json(units);
  } catch (error) {
    console.error("Error fetching units:", error);
    res.status(500).json({ message: "Failed to fetch units" });
  }
});

router.post('/api/admin/:hospitalId/units', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { name, type, parentId } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Unit name is required" });
    }
    
    const isAnesthesiaModule = type === 'anesthesia';
    const isSurgeryModule = type === 'or';
    const isBusinessModule = type === 'business';

    const unit = await storage.createUnit({
      hospitalId,
      name,
      type: type || null,
      parentId: parentId || null,
      isAnesthesiaModule,
      isSurgeryModule,
      isBusinessModule,
    });
    res.status(201).json(unit);
  } catch (error) {
    console.error("Error creating unit:", error);
    res.status(500).json({ message: "Failed to create unit" });
  }
});

router.patch('/api/admin/units/:unitId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { unitId } = req.params;
    const { name, type, parentId } = req.body;
    
    const units = await storage.getUnits(req.body.hospitalId);
    const unit = units.find(l => l.id === unitId);
    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }
    
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === unit.hospitalId);
    if (!hospital || hospital.role !== 'admin') {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) {
      updates.type = type;
      updates.isAnesthesiaModule = type === 'anesthesia';
      updates.isSurgeryModule = type === 'or';
      updates.isBusinessModule = type === 'business';
    }
    if (parentId !== undefined) updates.parentId = parentId;
    
    const updated = await storage.updateUnit(unitId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating unit:", error);
    res.status(500).json({ message: "Failed to update unit" });
  }
});

router.delete('/api/admin/units/:unitId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { unitId } = req.params;
    const { hospitalId } = req.query;
    const userId = req.user.id;
    
    const hospitals = await storage.getUserHospitals(userId);
    const adminUnits = hospitals.filter(h => h.id === hospitalId && h.role === 'admin');
    
    if (adminUnits.length === 0) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    await storage.deleteUnit(unitId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting unit:", error);
    res.status(500).json({ message: "Failed to delete unit" });
  }
});

router.get('/api/admin/:hospitalId/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const usersData = await storage.getHospitalUsers(hospitalId);
    
    const sanitizedUsers = usersData.map(u => ({
      ...u,
      units: u.unit,
      user: {
        id: u.user.id,
        email: u.user.email,
        firstName: u.user.firstName,
        lastName: u.user.lastName,
        profileImageUrl: u.user.profileImageUrl,
        createdAt: u.user.createdAt,
        updatedAt: u.user.updatedAt,
      }
    }));
    
    res.json(sanitizedUsers);
  } catch (error) {
    console.error("Error fetching hospital users:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get('/api/hospitals/:hospitalId/users-by-module', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { module, role } = req.query;
    
    const userId = req.user.id;
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }
    
    const allUsers = await storage.getHospitalUsers(hospitalId);
    
    const filteredUsers = allUsers.filter(u => {
      if (module === 'anesthesia' && !u.unit.isAnesthesiaModule) return false;
      if (module === 'surgery' && !u.unit.isSurgeryModule) return false;
      if (role && u.role !== role) return false;
      return true;
    });
    
    const result = filteredUsers.map(u => ({
      id: u.user.id,
      name: `${u.user.lastName || ''} ${u.user.firstName || ''}`.trim() || u.user.email || 'Unknown',
      firstName: u.user.firstName,
      lastName: u.user.lastName,
      email: u.user.email,
      role: u.role,
      unitId: u.unitId,
      unitName: u.unit.name,
    }));
    
    result.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    
    res.json(result);
  } catch (error) {
    console.error("Error fetching users by module:", error);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});

router.get('/api/admin/users/search', isAuthenticated, async (req: any, res) => {
  try {
    const { email, hospitalId } = req.query;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email parameter is required" });
    }
    
    if (!hospitalId || typeof hospitalId !== 'string') {
      return res.status(400).json({ message: "hospitalId parameter is required" });
    }
    
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminAccess = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    
    if (!hasAdminAccess) {
      return res.status(403).json({ message: "Admin access required for this hospital" });
    }
    
    const user = await storage.searchUserByEmail(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const foundUserHospitals = await storage.getUserHospitals(user.id);
    const belongsToHospital = foundUserHospitals.some(h => h.id === hospitalId);
    
    if (!belongsToHospital) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const { passwordHash, ...sanitizedUser } = user;
    res.json(sanitizedUser);
  } catch (error) {
    console.error("Error searching user:", error);
    res.status(500).json({ message: "Failed to search user" });
  }
});

router.post('/api/admin/:hospitalId/users', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { userId, unitId, role } = req.body;
    
    if (!userId || !unitId || !role) {
      return res.status(400).json({ message: "userId, unitId, and role are required" });
    }
    
    const userRole = await storage.createUserHospitalRole({
      userId,
      hospitalId,
      unitId,
      role,
    });
    res.status(201).json(userRole);
  } catch (error) {
    console.error("Error creating user role:", error);
    res.status(500).json({ message: "Failed to create user role" });
  }
});

router.patch('/api/admin/users/:roleId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roleId } = req.params;
    const { unitId, role, hospitalId } = req.body;
    
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    const updates: any = {};
    if (unitId !== undefined) updates.unitId = unitId;
    if (role !== undefined) updates.role = role;
    
    const updated = await storage.updateUserHospitalRole(roleId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ message: "Failed to update user role" });
  }
});

router.delete('/api/admin/users/:roleId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roleId } = req.params;
    const { hospitalId } = req.query;
    
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }
    
    await storage.deleteUserHospitalRole(roleId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting user role:", error);
    res.status(500).json({ message: "Failed to delete user role" });
  }
});

router.post('/api/admin/:hospitalId/users/create', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { email, password, firstName, lastName, unitId, role } = req.body;
    
    if (!email || !password || !firstName || !lastName || !unitId || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await storage.searchUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    const newUser = await storage.createUserWithPassword(email, password, firstName, lastName);

    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, newUser.id));

    await storage.createUserHospitalRole({
      userId: newUser.id,
      hospitalId,
      unitId,
      role,
    });

    const hospital = await storage.getHospital(hospitalId);
    
    const loginUrl = process.env.PRODUCTION_URL 
      || (process.env.REPLIT_DOMAINS?.split(',')?.[0] 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/` 
        : 'https://use.viali.app/');
    
    try {
      const { sendWelcomeEmail } = await import('../resend');
      console.log('[User Creation] Attempting to send welcome email to:', newUser.email);
      const result = await sendWelcomeEmail(
        newUser.email!,
        newUser.firstName!,
        hospital?.name || 'Your Hospital',
        password,
        loginUrl
      );
      if (result.success) {
        console.log('[User Creation] Welcome email sent successfully:', result.data);
      } else {
        console.error('[User Creation] Failed to send welcome email:', result.error);
      }
    } catch (emailError) {
      console.error('[User Creation] Exception sending welcome email:', emailError);
    }

    const { passwordHash: _, ...sanitizedUser } = newUser;
    res.status(201).json({ ...sanitizedUser, mustChangePassword: true });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ message: "Failed to create user" });
  }
});

router.patch('/api/admin/users/:userId/details', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, hospitalId } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First name and last name are required" });
    }

    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    await storage.updateUser(userId, { firstName, lastName });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user details:", error);
    res.status(500).json({ message: "Failed to update user details" });
  }
});

router.delete('/api/admin/users/:userId/delete', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { hospitalId } = req.query;
    
    console.log('[Delete User] Request received:', { userId, hospitalId, query: req.query });
    
    if (!hospitalId) {
      console.log('[Delete User] ERROR: No hospitalId provided in query');
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    console.log('[Delete User] User hospitals:', hospitals.map(h => ({ id: h.id, role: h.role })));
    
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      console.log('[Delete User] Admin check failed - no admin role found for hospital:', hospitalId);
      return res.status(403).json({ message: "Admin access required" });
    }

    const userHospitalsData = await storage.getUserHospitals(userId);
    
    const hospitalRoles = userHospitalsData.filter(h => h.id === hospitalId);
    for (const role of hospitalRoles) {
      const [roleRecord] = await db
        .select()
        .from(userHospitalRoles)
        .where(
          and(
            eq(userHospitalRoles.userId, userId),
            eq(userHospitalRoles.hospitalId, hospitalId as string),
            eq(userHospitalRoles.unitId, role.unitId),
            eq(userHospitalRoles.role, role.role)
          )
        );
      
      if (roleRecord) {
        await storage.deleteUserHospitalRole(roleRecord.id);
      }
    }
    
    const remainingHospitals = userHospitalsData.filter(h => h.id !== hospitalId);
    
    const [activityCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(activities)
      .where(eq(activities.userId, userId));
    
    const hasActivities = activityCount?.count > 0;
    
    if (remainingHospitals.length === 0 && !hasActivities) {
      await storage.deleteUser(userId);
      res.json({ 
        success: true, 
        deleted: true,
        message: "User completely removed from system"
      });
    } else {
      res.json({ 
        success: true, 
        deleted: false,
        message: hasActivities 
          ? "User removed from hospital but preserved for audit trail"
          : "User removed from hospital but has access to other hospitals"
      });
    }
  } catch (error) {
    console.error("Error deleting user:", error);
    res.status(500).json({ message: "Failed to delete user" });
  }
});

export default router;
