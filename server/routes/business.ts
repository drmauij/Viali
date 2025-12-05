import { Router } from "express";
import type { Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { users, userHospitalRoles, units } from "@shared/schema";
import { eq, and, inArray, ne } from "drizzle-orm";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";

const router = Router();

// Middleware to check business module access (manager role in business unit)
async function isBusinessManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user.id;
    const { hospitalId } = req.params;
    
    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => 
      h.id === hospitalId && 
      (h.role === 'admin' || h.role === 'manager')
    );
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Business manager access required" });
    }
    
    next();
  } catch (error) {
    console.error("Error checking business access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

// Get all staff members for a hospital (for business dashboard)
router.get('/api/business/:hospitalId/staff', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    // Get all users associated with this hospital, excluding admin roles
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    // Filter out admin-only users and format response
    const staffList = hospitalUsers
      .filter(u => u.role !== 'admin') // Exclude admin roles
      .map(u => ({
        id: u.user.id,
        firstName: u.user.firstName,
        lastName: u.user.lastName,
        email: u.user.email,
        role: u.role,
        unitId: u.unitId,
        unitName: u.unit?.name,
        unitType: u.unit?.type,
        staffType: (u.user as any).staffType || 'internal',
        hourlyRate: (u.user as any).hourlyRate ? parseFloat((u.user as any).hourlyRate) : null,
        canLogin: (u.user as any).canLogin ?? true,
        createdAt: u.user.createdAt,
      }));
    
    res.json(staffList);
  } catch (error) {
    console.error("Error fetching staff:", error);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
});

// Create a new staff member (without app access by default)
router.post('/api/business/:hospitalId/staff', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    const { firstName, lastName, email, role, unitId, hourlyRate, staffType } = req.body;
    
    if (!firstName || !lastName) {
      return res.status(400).json({ message: "First name and last name are required" });
    }
    
    if (!role || role === 'admin') {
      return res.status(400).json({ message: "Valid non-admin role is required" });
    }
    
    if (!unitId) {
      return res.status(400).json({ message: "Unit is required" });
    }
    
    // Verify unit belongs to this hospital
    const [unit] = await db
      .select()
      .from(units)
      .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
    
    if (!unit) {
      return res.status(400).json({ message: "Invalid unit for this hospital" });
    }
    
    // Generate email if not provided
    const userEmail = email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}.${nanoid(6)}@staff.local`;
    
    // Check if email already exists
    const existingUser = await storage.searchUserByEmail(userEmail);
    if (existingUser) {
      return res.status(400).json({ message: "A user with this email already exists" });
    }
    
    // Create user with canLogin = false by default (staff without app access)
    const [newUser] = await db
      .insert(users)
      .values({
        email: userEmail,
        firstName,
        lastName,
        canLogin: false,
        staffType: staffType || 'internal',
        hourlyRate: hourlyRate ? String(hourlyRate) : null,
      })
      .returning();
    
    // Create hospital role assignment
    await db
      .insert(userHospitalRoles)
      .values({
        userId: newUser.id,
        hospitalId,
        unitId,
        role,
      });
    
    res.status(201).json({
      id: newUser.id,
      firstName: newUser.firstName,
      lastName: newUser.lastName,
      email: newUser.email,
      role,
      unitId,
      unitName: unit.name,
      staffType: newUser.staffType,
      hourlyRate: newUser.hourlyRate ? parseFloat(newUser.hourlyRate) : null,
      canLogin: newUser.canLogin,
    });
  } catch (error) {
    console.error("Error creating staff:", error);
    res.status(500).json({ message: "Failed to create staff member" });
  }
});

// Update staff member
router.patch('/api/business/:hospitalId/staff/:userId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { firstName, lastName, email, role, unitId, hourlyRate, staffType } = req.body;
    
    // Verify user belongs to this hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalRole = userHospitals.find(h => h.id === hospitalId);
    
    if (!hospitalRole) {
      return res.status(404).json({ message: "Staff member not found in this hospital" });
    }
    
    // Prevent editing admin users
    if (hospitalRole.role === 'admin') {
      return res.status(403).json({ message: "Cannot edit admin users from business dashboard" });
    }
    
    // Prevent changing to admin role
    if (role === 'admin') {
      return res.status(403).json({ message: "Cannot assign admin role from business dashboard" });
    }
    
    // Build user update object
    const userUpdates: any = {};
    if (firstName !== undefined) userUpdates.firstName = firstName;
    if (lastName !== undefined) userUpdates.lastName = lastName;
    if (email !== undefined) userUpdates.email = email;
    if (hourlyRate !== undefined) userUpdates.hourlyRate = hourlyRate ? String(hourlyRate) : null;
    if (staffType !== undefined) userUpdates.staffType = staffType;
    
    // Update user if there are changes
    if (Object.keys(userUpdates).length > 0) {
      userUpdates.updatedAt = new Date();
      await db
        .update(users)
        .set(userUpdates)
        .where(eq(users.id, userId));
    }
    
    // Update role/unit if provided
    if (role !== undefined || unitId !== undefined) {
      // Verify unit belongs to hospital if unitId is provided
      if (unitId) {
        const [unit] = await db
          .select()
          .from(units)
          .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
        
        if (!unit) {
          return res.status(400).json({ message: "Invalid unit for this hospital" });
        }
      }
      
      // Get the user's role record for this hospital
      const [existingRole] = await db
        .select()
        .from(userHospitalRoles)
        .where(and(
          eq(userHospitalRoles.userId, userId),
          eq(userHospitalRoles.hospitalId, hospitalId)
        ));
      
      if (existingRole) {
        const roleUpdates: any = {};
        if (role !== undefined) roleUpdates.role = role;
        if (unitId !== undefined) roleUpdates.unitId = unitId;
        
        await db
          .update(userHospitalRoles)
          .set(roleUpdates)
          .where(eq(userHospitalRoles.id, existingRole.id));
      }
    }
    
    // Fetch updated user data
    const [updatedUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    const updatedHospitals = await storage.getUserHospitals(userId);
    const updatedRole = updatedHospitals.find(h => h.id === hospitalId);
    
    res.json({
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      role: updatedRole?.role,
      unitId: updatedRole?.unitId,
      staffType: updatedUser.staffType,
      hourlyRate: updatedUser.hourlyRate ? parseFloat(updatedUser.hourlyRate) : null,
      canLogin: updatedUser.canLogin,
    });
  } catch (error) {
    console.error("Error updating staff:", error);
    res.status(500).json({ message: "Failed to update staff member" });
  }
});

// Toggle staff type (internal/external)
router.patch('/api/business/:hospitalId/staff/:userId/type', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { staffType } = req.body;
    
    if (!staffType || !['internal', 'external'].includes(staffType)) {
      return res.status(400).json({ message: "Invalid staff type. Must be 'internal' or 'external'" });
    }
    
    // Verify user belongs to this hospital
    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalRole = userHospitals.find(h => h.id === hospitalId);
    
    if (!hospitalRole) {
      return res.status(404).json({ message: "Staff member not found in this hospital" });
    }
    
    // Update staff type
    await db
      .update(users)
      .set({ staffType, updatedAt: new Date() })
      .where(eq(users.id, userId));
    
    res.json({ success: true, staffType });
  } catch (error) {
    console.error("Error updating staff type:", error);
    res.status(500).json({ message: "Failed to update staff type" });
  }
});

// Get available units for staff assignment (non-admin units)
router.get('/api/business/:hospitalId/units', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId } = req.params;
    
    const hospitalUnits = await db
      .select()
      .from(units)
      .where(eq(units.hospitalId, hospitalId));
    
    res.json(hospitalUnits);
  } catch (error) {
    console.error("Error fetching units:", error);
    res.status(500).json({ message: "Failed to fetch units" });
  }
});

// Get available roles for staff assignment (excluding admin)
router.get('/api/business/roles', isAuthenticated, async (req, res) => {
  const roles = [
    { id: 'doctor', label: 'Doctor', description: 'Surgeon or Anesthesiologist' },
    { id: 'nurse', label: 'Nurse', description: 'Surgery or Anesthesia Nurse' },
    { id: 'manager', label: 'Manager', description: 'Business or Department Manager' },
  ];
  
  res.json(roles);
});

export default router;
