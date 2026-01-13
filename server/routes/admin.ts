import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, activities } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireWriteAccess, requireResourceAdmin } from "../utils";

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

router.get('/api/admin/:hospitalId', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await storage.getHospital(hospitalId);
    
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    res.json(hospital);
  } catch (error) {
    console.error("Error fetching hospital:", error);
    res.status(500).json({ message: "Failed to fetch hospital" });
  }
});

router.patch('/api/admin/:hospitalId', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { 
      name,
      companyName,
      companyStreet,
      companyPostalCode,
      companyCity,
      companyPhone,
      companyFax,
      companyEmail,
      companyLogoUrl
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Hospital name is required" });
    }

    const updates: Record<string, any> = { name };
    
    if (companyName !== undefined) updates.companyName = companyName;
    if (companyStreet !== undefined) updates.companyStreet = companyStreet;
    if (companyPostalCode !== undefined) updates.companyPostalCode = companyPostalCode;
    if (companyCity !== undefined) updates.companyCity = companyCity;
    if (companyPhone !== undefined) updates.companyPhone = companyPhone;
    if (companyFax !== undefined) updates.companyFax = companyFax;
    if (companyEmail !== undefined) updates.companyEmail = companyEmail;
    if (companyLogoUrl !== undefined) updates.companyLogoUrl = companyLogoUrl;

    const updated = await storage.updateHospital(hospitalId, updates);
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
    const { name, type, parentId, showInventory, showAppointments, questionnairePhone } = req.body;
    
    if (!name) {
      return res.status(400).json({ message: "Unit name is required" });
    }
    
    // Derive module flags from type
    const isAnesthesiaModule = type === 'anesthesia';
    const isSurgeryModule = type === 'or';
    const isBusinessModule = type === 'business';
    const isClinicModule = type === 'clinic';
    const isLogisticModule = type === 'logistic';

    const unit = await storage.createUnit({
      hospitalId,
      name,
      type: type || null,
      parentId: parentId || null,
      isAnesthesiaModule,
      isSurgeryModule,
      isBusinessModule,
      isClinicModule,
      isLogisticModule,
      showInventory: showInventory !== false, // default true
      showAppointments: showAppointments !== false, // default true
      questionnairePhone: questionnairePhone || null,
    });
    res.status(201).json(unit);
  } catch (error) {
    console.error("Error creating unit:", error);
    res.status(500).json({ message: "Failed to create unit" });
  }
});

router.patch('/api/admin/units/:unitId', isAuthenticated, requireResourceAdmin('unitId'), async (req: any, res) => {
  try {
    const { unitId } = req.params;
    const { name, type, parentId, showInventory, showAppointments, questionnairePhone } = req.body;
    
    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (parentId !== undefined) updates.parentId = parentId;
    
    // Derive module flags from type when type is updated
    if (type !== undefined) {
      updates.isAnesthesiaModule = type === 'anesthesia';
      updates.isSurgeryModule = type === 'or';
      updates.isBusinessModule = type === 'business';
      updates.isClinicModule = type === 'clinic';
      updates.isLogisticModule = type === 'logistic';
    }
    
    // Accept UI visibility flags
    if (showInventory !== undefined) updates.showInventory = showInventory;
    if (showAppointments !== undefined) updates.showAppointments = showAppointments;
    
    // Accept questionnaire help phone
    if (questionnairePhone !== undefined) updates.questionnairePhone = questionnairePhone;
    
    const updated = await storage.updateUnit(unitId, updates);
    res.json(updated);
  } catch (error) {
    console.error("Error updating unit:", error);
    res.status(500).json({ message: "Failed to update unit" });
  }
});

router.delete('/api/admin/units/:unitId', isAuthenticated, requireResourceAdmin('unitId'), async (req: any, res) => {
  try {
    const { unitId } = req.params;
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
      isBookable: u.isBookable ?? false,
      user: {
        id: u.user.id,
        email: u.user.email,
        firstName: u.user.firstName,
        lastName: u.user.lastName,
        profileImageUrl: u.user.profileImageUrl,
        canLogin: u.user.canLogin,
        staffType: u.user.staffType,
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
      // Only include users who can log in (not staff-only members)
      if (u.user.canLogin === false) return false;
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
      isBookable: false,
      isDefaultLogin: false,
      calcomUserId: null,
      calcomEventTypeId: null,
    });
    res.status(201).json(userRole);
  } catch (error) {
    console.error("Error creating user role:", error);
    res.status(500).json({ message: "Failed to create user role" });
  }
});

router.patch('/api/admin/users/:roleId', isAuthenticated, requireResourceAdmin('roleId'), async (req: any, res) => {
  try {
    const { roleId } = req.params;
    const { unitId, role } = req.body;
    
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

router.delete('/api/admin/users/:roleId', isAuthenticated, requireResourceAdmin('roleId'), async (req: any, res) => {
  try {
    const { roleId } = req.params;
    await storage.deleteUserHospitalRole(roleId);
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting user role:", error);
    res.status(500).json({ message: "Failed to delete user role" });
  }
});

router.post('/api/admin/:hospitalId/users/add-existing', isAuthenticated, isAdmin, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { userId, unitId, role } = req.body;
    
    if (!userId || !unitId || !role) {
      return res.status(400).json({ message: "userId, unitId, and role are required" });
    }

    const existingUser = await storage.getUser(userId);
    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const units = await storage.getUnits(hospitalId);
    const unitBelongsToHospital = units.some(u => u.id === unitId);
    if (!unitBelongsToHospital) {
      return res.status(400).json({ message: "Selected unit does not belong to this hospital" });
    }

    const userHospitals = await storage.getUserHospitals(userId);
    const alreadyInHospital = userHospitals.some(h => h.id === hospitalId);
    if (alreadyInHospital) {
      return res.status(400).json({ message: "User is already a member of this hospital" });
    }

    await storage.createUserHospitalRole({
      userId,
      hospitalId,
      unitId,
      role,
      isBookable: false,
      isDefaultLogin: false,
      calcomUserId: null,
      calcomEventTypeId: null,
    });

    const hospital = await storage.getHospital(hospitalId);
    const adminUser = req.user;
    const adminName = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email || 'An administrator';
    
    const loginUrl = process.env.PRODUCTION_URL 
      || (process.env.REPLIT_DOMAINS?.split(',')?.[0] 
        ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/` 
        : 'https://use.viali.app/');
    
    try {
      const { sendHospitalAddedNotification } = await import('../resend');
      console.log('[Add Existing User] Sending notification to:', existingUser.email);
      const result = await sendHospitalAddedNotification(
        existingUser.email!,
        existingUser.firstName || 'User',
        hospital?.name || 'a hospital',
        adminName,
        loginUrl
      );
      if (result.success) {
        console.log('[Add Existing User] Notification email sent successfully');
      } else {
        console.error('[Add Existing User] Failed to send notification:', result.error);
      }
    } catch (emailError) {
      console.error('[Add Existing User] Exception sending notification:', emailError);
    }

    const { passwordHash: _, ...sanitizedUser } = existingUser;
    res.status(201).json({ 
      ...sanitizedUser, 
      addedToHospital: true,
      hospitalName: hospital?.name 
    });
  } catch (error) {
    console.error("Error adding existing user:", error);
    res.status(500).json({ message: "Failed to add user to hospital" });
  }
});

router.post('/api/admin/:hospitalId/users/create', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { email, password, firstName, lastName, unitId, role, canLogin } = req.body;
    
    if (!email || !password || !firstName || !lastName || !unitId || !role) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await storage.searchUserByEmail(email);
    if (existingUser) {
      const userHospitals = await storage.getUserHospitals(existingUser.id);
      const alreadyInHospital = userHospitals.some(h => h.id === hospitalId);
      
      // If user already exists in THIS hospital, return error
      if (alreadyInHospital) {
        return res.status(409).json({ 
          code: "USER_ALREADY_IN_HOSPITAL",
          message: "User is already a member of this hospital"
        });
      }
      
      // User exists but NOT in this hospital - silently add them
      await storage.createUserHospitalRole({
        userId: existingUser.id,
        hospitalId,
        unitId,
        role,
        isBookable: false,
        isDefaultLogin: false,
        calcomUserId: null,
        calcomEventTypeId: null,
      });

      const hospital = await storage.getHospital(hospitalId);
      const adminUser = req.user as any;
      const adminName = `${adminUser.firstName || ''} ${adminUser.lastName || ''}`.trim() || adminUser.email || 'An administrator';
      
      const loginUrl = process.env.PRODUCTION_URL 
        || (process.env.REPLIT_DOMAINS?.split(',')?.[0] 
          ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}/` 
          : 'https://use.viali.app/');
      
      // Send notification email to existing user
      try {
        const { sendHospitalAddedNotification } = await import('../resend');
        console.log('[User Creation] User exists, adding to hospital and sending notification:', existingUser.email);
        const result = await sendHospitalAddedNotification(
          existingUser.email!,
          existingUser.firstName || 'User',
          hospital?.name || 'a hospital',
          adminName,
          loginUrl
        );
        if (result.success) {
          console.log('[User Creation] Hospital added notification sent successfully');
        } else {
          console.error('[User Creation] Failed to send notification:', result.error);
        }
      } catch (emailError) {
        console.error('[User Creation] Exception sending notification:', emailError);
      }

      const { passwordHash: _, ...sanitizedUser } = existingUser;
      return res.status(201).json({ 
        ...sanitizedUser, 
        addedToHospital: true,
        hospitalName: hospital?.name 
      });
    }

    const newUser = await storage.createUserWithPassword(email, password, firstName, lastName);

    // Set canLogin if provided (for staff member creation - canLogin: false means staff-only)
    const updateData: any = { mustChangePassword: true };
    if (canLogin !== undefined) {
      updateData.canLogin = canLogin;
    }
    await db.update(users).set(updateData).where(eq(users.id, newUser.id));

    await storage.createUserHospitalRole({
      userId: newUser.id,
      hospitalId,
      unitId,
      role,
      isBookable: false,
      isDefaultLogin: false,
      calcomUserId: null,
      calcomEventTypeId: null,
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

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserHospitals = await storage.getUserHospitals(userId);
    const userBelongsToHospital = targetUserHospitals.some(h => h.id === hospitalId);
    if (!userBelongsToHospital) {
      return res.status(403).json({ message: "User does not belong to this hospital" });
    }

    await storage.updateUser(userId, { firstName, lastName });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating user details:", error);
    res.status(500).json({ message: "Failed to update user details" });
  }
});

router.patch('/api/admin/users/:userId/email', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { email, hospitalId } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserHospitals = await storage.getUserHospitals(userId);
    const userBelongsToHospital = targetUserHospitals.some(h => h.id === hospitalId);
    if (!userBelongsToHospital) {
      return res.status(403).json({ message: "User does not belong to this hospital" });
    }

    if (targetUser.email === email) {
      return res.json({ success: true, email });
    }

    const existingUser = await storage.searchUserByEmail(email);
    if (existingUser && existingUser.id !== userId) {
      return res.status(409).json({ 
        message: "A user with this email already exists",
        code: "EMAIL_EXISTS"
      });
    }

    await db.update(users).set({ email }).where(eq(users.id, userId));

    res.json({ success: true, email });
  } catch (error) {
    console.error("Error updating user email:", error);
    res.status(500).json({ message: "Failed to update user email" });
  }
});

router.post('/api/admin/users/:userId/reset-password', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { newPassword, hospitalId } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ message: "New password is required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    const targetUserHospitals = await storage.getUserHospitals(userId);
    const userBelongsToHospital = targetUserHospitals.some(h => h.id === hospitalId);
    if (!userBelongsToHospital) {
      return res.status(403).json({ message: "User does not belong to this hospital" });
    }

    await storage.updateUserPassword(userId, newPassword);
    await db.update(users).set({ mustChangePassword: true }).where(eq(users.id, userId));

    res.json({ success: true, message: "Password reset successfully" });
  } catch (error) {
    console.error("Error resetting user password:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

// Update user access settings (canLogin, staffType)
router.patch('/api/admin/users/:userId/access', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { userId } = req.params;
    const { canLogin, staffType, hospitalId } = req.body;
    
    // Validate hospitalId is provided
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    // Validate staffType if provided
    if (staffType !== undefined && !['internal', 'external'].includes(staffType)) {
      return res.status(400).json({ message: "Staff type must be 'internal' or 'external'" });
    }

    // Check admin access
    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Check target user exists
    const targetUser = await storage.getUser(userId);
    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check target user belongs to the hospital
    const targetUserHospitals = await storage.getUserHospitals(userId);
    const userBelongsToHospital = targetUserHospitals.some(h => h.id === hospitalId);
    if (!userBelongsToHospital) {
      return res.status(403).json({ message: "User does not belong to this hospital" });
    }

    // Build update object
    const updateData: { canLogin?: boolean; staffType?: 'internal' | 'external' } = {};
    if (canLogin !== undefined) {
      updateData.canLogin = canLogin;
    }
    if (staffType !== undefined) {
      updateData.staffType = staffType as 'internal' | 'external';
    }

    // Update user
    await db.update(users).set(updateData).where(eq(users.id, userId));

    res.json({ 
      success: true, 
      canLogin: canLogin ?? targetUser.canLogin, 
      staffType: staffType ?? targetUser.staffType
    });
  } catch (error) {
    console.error("Error updating user access settings:", error);
    res.status(500).json({ message: "Failed to update user access settings" });
  }
});

// Update user role bookable status
router.patch('/api/admin/user-roles/:roleId/bookable', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roleId } = req.params;
    const { isBookable, hospitalId } = req.body;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    if (typeof isBookable !== 'boolean') {
      return res.status(400).json({ message: "isBookable must be a boolean" });
    }

    // Check admin access
    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Find the role record
    const [roleRecord] = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.id, roleId));
    
    if (!roleRecord) {
      return res.status(404).json({ message: "Role not found" });
    }

    // Verify role belongs to the admin's hospital
    if (roleRecord.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Role does not belong to this hospital" });
    }

    // Update the isBookable field in userHospitalRoles
    await db.update(userHospitalRoles)
      .set({ isBookable })
      .where(eq(userHospitalRoles.id, roleId));

    // Also sync the clinicProviders table so the Appointments page reflects this change
    // This uses the storage method which handles default availability creation for new bookable providers
    await storage.setClinicProviderBookableByUnit(roleRecord.unitId, roleRecord.userId, isBookable);

    res.json({ success: true, isBookable });
  } catch (error) {
    console.error("Error updating role bookable status:", error);
    res.status(500).json({ message: "Failed to update bookable status" });
  }
});

// Update user role default login status
router.patch('/api/admin/user-roles/:roleId/default-login', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roleId } = req.params;
    const { isDefaultLogin, hospitalId } = req.body;
    
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID is required" });
    }
    
    if (typeof isDefaultLogin !== 'boolean') {
      return res.status(400).json({ message: "isDefaultLogin must be a boolean" });
    }

    // Check admin access
    const currentUserId = req.user.id;
    const hospitals = await storage.getUserHospitals(currentUserId);
    const hasAdminRole = hospitals.some(h => h.id === hospitalId && h.role === 'admin');
    if (!hasAdminRole) {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Find the role record
    const [roleRecord] = await db
      .select()
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.id, roleId));
    
    if (!roleRecord) {
      return res.status(404).json({ message: "Role not found" });
    }

    // Verify role belongs to the admin's hospital
    if (roleRecord.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Role does not belong to this hospital" });
    }

    // If setting as default, unset all other defaults for this user in this hospital
    if (isDefaultLogin) {
      await db.update(userHospitalRoles)
        .set({ isDefaultLogin: false })
        .where(
          and(
            eq(userHospitalRoles.userId, roleRecord.userId),
            eq(userHospitalRoles.hospitalId, hospitalId)
          )
        );
    }

    // Update the isDefaultLogin field
    await db.update(userHospitalRoles)
      .set({ isDefaultLogin })
      .where(eq(userHospitalRoles.id, roleId));

    res.json({ success: true, isDefaultLogin });
  } catch (error) {
    console.error("Error updating role default login status:", error);
    res.status(500).json({ message: "Failed to update default login status" });
  }
});

// Check if email exists (for real-time detection during user creation)
router.get('/api/admin/:hospitalId/check-email', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { email } = req.query;
    
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email is required" });
    }

    const existingUser = await storage.searchUserByEmail(email);
    
    if (!existingUser) {
      return res.json({ exists: false });
    }

    // Check if user is already in this hospital
    const userHospitals = await storage.getUserHospitals(existingUser.id);
    const alreadyInHospital = userHospitals.some(h => h.id === hospitalId);

    const { passwordHash: _, ...sanitizedUser } = existingUser;
    res.json({ 
      exists: true, 
      alreadyInHospital,
      user: sanitizedUser
    });
  } catch (error) {
    console.error("Error checking email:", error);
    res.status(500).json({ message: "Failed to check email" });
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

// Questionnaire token management
router.get('/api/admin/:hospitalId/questionnaire-token', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await storage.getHospital(hospitalId);
    
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    
    res.json({ 
      questionnaireToken: hospital.questionnaireToken || null 
    });
  } catch (error) {
    console.error("Error fetching questionnaire token:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire token" });
  }
});

router.post('/api/admin/:hospitalId/questionnaire-token/generate', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { nanoid } = await import('nanoid');
    
    const token = nanoid(24);
    const hospital = await storage.setHospitalQuestionnaireToken(hospitalId, token);
    
    res.json({ 
      questionnaireToken: hospital.questionnaireToken 
    });
  } catch (error) {
    console.error("Error generating questionnaire token:", error);
    res.status(500).json({ message: "Failed to generate questionnaire token" });
  }
});

router.delete('/api/admin/:hospitalId/questionnaire-token', isAuthenticated, isAdmin, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    await storage.setHospitalQuestionnaireToken(hospitalId, null);
    
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting questionnaire token:", error);
    res.status(500).json({ message: "Failed to delete questionnaire token" });
  }
});

export default router;
