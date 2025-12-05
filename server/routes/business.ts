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
    
    // Group by user ID to deduplicate (one entry per user, not per role)
    // Hourly rate is per user, not per role
    const userMap = new Map<string, {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string | null;
      roles: Array<{ role: string; unitId: string | null; unitName: string | null; unitType: string | null; isAnesthesiaModule: boolean; isSurgeryModule: boolean }>;
      staffType: string;
      hourlyRate: number | null;
      canLogin: boolean;
      createdAt: Date | null;
    }>();
    
    for (const u of hospitalUsers) {
      if (u.role === 'admin') continue; // Skip admin roles
      
      const existing = userMap.get(u.user.id);
      const roleInfo = {
        role: u.role,
        unitId: u.unitId,
        unitName: u.unit?.name || null,
        unitType: u.unit?.type || null,
        isAnesthesiaModule: u.unit?.isAnesthesiaModule || false,
        isSurgeryModule: u.unit?.isSurgeryModule || false,
      };
      
      if (existing) {
        // Add role to existing user
        existing.roles.push(roleInfo);
      } else {
        // Create new user entry
        userMap.set(u.user.id, {
          id: u.user.id,
          firstName: u.user.firstName,
          lastName: u.user.lastName,
          email: u.user.email,
          roles: [roleInfo],
          staffType: (u.user as any).staffType || 'internal',
          hourlyRate: (u.user as any).hourlyRate ? parseFloat((u.user as any).hourlyRate) : null,
          canLogin: (u.user as any).canLogin ?? true,
          createdAt: u.user.createdAt,
        });
      }
    }
    
    const staffList = Array.from(userMap.values());
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

// ============= ROLE MANAGEMENT ENDPOINTS =============

// Get all roles for a specific user in a hospital
router.get('/api/business/:hospitalId/staff/:userId/roles', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    
    // Get all roles for this user in this hospital
    const userRoles = await db
      .select({
        id: userHospitalRoles.id,
        role: userHospitalRoles.role,
        unitId: userHospitalRoles.unitId,
        unit: units,
      })
      .from(userHospitalRoles)
      .leftJoin(units, eq(userHospitalRoles.unitId, units.id))
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
        ne(userHospitalRoles.role, 'admin') // Exclude admin roles
      ));
    
    const rolesList = userRoles.map(r => ({
      id: r.id,
      role: r.role,
      unitId: r.unitId,
      unitName: r.unit?.name || null,
      unitType: r.unit?.type || null,
      isAnesthesiaModule: r.unit?.isAnesthesiaModule || false,
      isSurgeryModule: r.unit?.isSurgeryModule || false,
    }));
    
    res.json(rolesList);
  } catch (error) {
    console.error("Error fetching user roles:", error);
    res.status(500).json({ message: "Failed to fetch user roles" });
  }
});

// Add a new role for a user in a hospital
router.post('/api/business/:hospitalId/staff/:userId/roles', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId } = req.params;
    const { role, unitId } = req.body;
    
    // Validate role
    if (!role || role === 'admin') {
      return res.status(400).json({ message: "Valid non-admin role is required" });
    }
    
    if (!['doctor', 'nurse', 'manager'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'doctor', 'nurse', or 'manager'" });
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
    
    // Check if user already has this exact role+unit combination
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId),
        eq(userHospitalRoles.unitId, unitId),
        eq(userHospitalRoles.role, role)
      ));
    
    if (existingRole) {
      return res.status(400).json({ message: "User already has this role in this unit" });
    }
    
    // Create new role assignment
    const [newRole] = await db
      .insert(userHospitalRoles)
      .values({
        userId,
        hospitalId,
        unitId,
        role,
      })
      .returning();
    
    res.status(201).json({
      id: newRole.id,
      role: newRole.role,
      unitId: newRole.unitId,
      unitName: unit.name,
      unitType: unit.type,
    });
  } catch (error) {
    console.error("Error adding user role:", error);
    res.status(500).json({ message: "Failed to add role" });
  }
});

// Update an existing role assignment
router.patch('/api/business/:hospitalId/staff/:userId/roles/:roleId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId, roleId } = req.params;
    const { role, unitId } = req.body;
    
    // Get the existing role assignment
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.id, roleId),
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (!existingRole) {
      return res.status(404).json({ message: "Role assignment not found" });
    }
    
    // Cannot modify admin roles
    if (existingRole.role === 'admin') {
      return res.status(403).json({ message: "Cannot modify admin role from business dashboard" });
    }
    
    // Cannot change to admin role
    if (role === 'admin') {
      return res.status(403).json({ message: "Cannot assign admin role from business dashboard" });
    }
    
    // Validate new role if provided
    if (role && !['doctor', 'nurse', 'manager'].includes(role)) {
      return res.status(400).json({ message: "Invalid role. Must be 'doctor', 'nurse', or 'manager'" });
    }
    
    // Verify unit belongs to hospital if provided
    let unit = null;
    if (unitId) {
      const [foundUnit] = await db
        .select()
        .from(units)
        .where(and(eq(units.id, unitId), eq(units.hospitalId, hospitalId)));
      
      if (!foundUnit) {
        return res.status(400).json({ message: "Invalid unit for this hospital" });
      }
      unit = foundUnit;
    }
    
    // Build update object
    const updates: any = {};
    if (role) updates.role = role;
    if (unitId) updates.unitId = unitId;
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }
    
    // Update the role assignment
    const [updatedRole] = await db
      .update(userHospitalRoles)
      .set(updates)
      .where(eq(userHospitalRoles.id, roleId))
      .returning();
    
    // Get unit info if not already fetched
    if (!unit && updatedRole.unitId) {
      const [unitInfo] = await db
        .select()
        .from(units)
        .where(eq(units.id, updatedRole.unitId));
      unit = unitInfo;
    }
    
    res.json({
      id: updatedRole.id,
      role: updatedRole.role,
      unitId: updatedRole.unitId,
      unitName: unit?.name || null,
      unitType: unit?.type || null,
    });
  } catch (error) {
    console.error("Error updating user role:", error);
    res.status(500).json({ message: "Failed to update role" });
  }
});

// Delete a role assignment
router.delete('/api/business/:hospitalId/staff/:userId/roles/:roleId', isAuthenticated, isBusinessManager, async (req, res) => {
  try {
    const { hospitalId, userId, roleId } = req.params;
    
    // Get the existing role assignment
    const [existingRole] = await db
      .select()
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.id, roleId),
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (!existingRole) {
      return res.status(404).json({ message: "Role assignment not found" });
    }
    
    // Cannot delete admin roles
    if (existingRole.role === 'admin') {
      return res.status(403).json({ message: "Cannot delete admin role from business dashboard" });
    }
    
    // Check if this is the user's only role in this hospital
    const userRolesCount = await db
      .select({ count: userHospitalRoles.id })
      .from(userHospitalRoles)
      .where(and(
        eq(userHospitalRoles.userId, userId),
        eq(userHospitalRoles.hospitalId, hospitalId)
      ));
    
    if (userRolesCount.length <= 1) {
      return res.status(400).json({ message: "Cannot delete the user's only role. Remove the user instead." });
    }
    
    // Delete the role assignment
    await db
      .delete(userHospitalRoles)
      .where(eq(userHospitalRoles.id, roleId));
    
    res.json({ success: true, message: "Role deleted successfully" });
  } catch (error) {
    console.error("Error deleting user role:", error);
    res.status(500).json({ message: "Failed to delete role" });
  }
});

export default router;
