import { Router } from "express";
import type { Request } from "express";
import { storage, db } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import {
  insertSurgeryStaffEntrySchema,
  surgeryStaffEntries,
  users,
  userHospitalRoles,
  dailyStaffPool,
  plannedSurgeryStaff,
  dailyRoomStaff,
  surgeryRooms,
} from "@shared/schema";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { requireWriteAccess, requireStrictHospitalAccess } from "../../utils";
import { requireAdminRole } from "../middleware";
import { broadcastAnesthesiaUpdate } from "../../socket";
import logger from "../../logger";

function getClientSessionId(req: Request): string | undefined {
  return req.headers['x-client-session-id'] as string | undefined;
}

const router = Router();

// =====================================
// Staff Endpoints (Anesthesia Record Staff)
// =====================================

router.get('/api/anesthesia/staff/:recordId', isAuthenticated, async (req: any, res) => {
  try {
    const { recordId } = req.params;
    const userId = req.user.id;

    const record = await storage.getAnesthesiaRecordById(recordId);
    
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const staff = await storage.getSurgeryStaff(recordId);
    
    res.json(staff);
  } catch (error) {
    logger.error("Error fetching staff:", error);
    res.status(500).json({ message: "Failed to fetch staff" });
  }
});

router.get('/api/anesthesia/staff-options/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { staffRole } = req.query;
    const userId = req.user.id;

    const allUnits = await storage.getUnits(hospitalId);
    const surgeryUnit = allUnits.find(u => u.type === 'or');
    const anesthesiaUnit = allUnits.find(u => u.type === 'anesthesia');
    
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    let filteredUsers: Array<{ id: string; name: string; email: string | null; role: string; unitName: string }> = [];
    
    const roleToUnitAndUserRole: Record<string, { unitId: string | undefined; userRoles: string[] }> = {
      surgeon: { unitId: surgeryUnit?.id, userRoles: ['doctor'] },
      surgicalAssistant: { unitId: surgeryUnit?.id, userRoles: ['doctor', 'nurse'] },
      instrumentNurse: { unitId: surgeryUnit?.id, userRoles: ['nurse'] },
      circulatingNurse: { unitId: surgeryUnit?.id, userRoles: ['nurse'] },
      anesthesiologist: { unitId: anesthesiaUnit?.id, userRoles: ['doctor'] },
      anesthesiaNurse: { unitId: anesthesiaUnit?.id, userRoles: ['nurse'] },
      pacuNurse: { unitId: anesthesiaUnit?.id, userRoles: ['nurse'] },
    };
    
    if (staffRole && roleToUnitAndUserRole[staffRole as string]) {
      const config = roleToUnitAndUserRole[staffRole as string];
      if (config.unitId) {
        filteredUsers = hospitalUsers
          .filter(hu => hu.unitId === config.unitId && config.userRoles.includes(hu.role))
          .map(hu => ({
            id: hu.user.id,
            name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
            email: hu.user.email,
            role: hu.role,
            unitName: hu.unit?.name || '',
          }));
      }
    } else {
      filteredUsers = hospitalUsers.map(hu => ({
        id: hu.user.id,
        name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
        email: hu.user.email,
        role: hu.role,
        unitName: hu.unit?.name || '',
      }));
    }
    
    const uniqueUsers = Array.from(new Map(filteredUsers.map(u => [u.id, u])).values());
    
    res.json(uniqueUsers);
  } catch (error) {
    logger.error("Error fetching staff options:", error);
    res.status(500).json({ message: "Failed to fetch staff options" });
  }
});

router.get('/api/anesthesia/all-staff-options/:hospitalId', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const allUnits = await storage.getUnits(hospitalId);
    const surgeryUnit = allUnits.find(u => u.type === 'or');
    const anesthesiaUnit = allUnits.find(u => u.type === 'anesthesia');
    
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);
    
    const staffUsers = hospitalUsers
      .filter(hu => {
        const isInSurgeryUnit = surgeryUnit && hu.unitId === surgeryUnit.id;
        const isInAnesthesiaUnit = anesthesiaUnit && hu.unitId === anesthesiaUnit.id;
        const isDoctorOrNurse = hu.role === 'doctor' || hu.role === 'nurse';
        return (isInSurgeryUnit || isInAnesthesiaUnit) && isDoctorOrNurse;
      })
      .map(hu => {
        let staffRole = 'anesthesiaNurse';
        if (surgeryUnit && hu.unitId === surgeryUnit.id) {
          staffRole = hu.role === 'doctor' ? 'surgeon' : 'instrumentNurse';
        } else if (anesthesiaUnit && hu.unitId === anesthesiaUnit.id) {
          staffRole = hu.role === 'doctor' ? 'anesthesiologist' : 'anesthesiaNurse';
        }
        
        return {
          id: hu.user.id,
          name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
          email: hu.user.email,
          staffRole,
          baseRole: hu.role as 'doctor' | 'nurse',
        };
      });
    
    const uniqueUsers = Array.from(new Map(staffUsers.map(u => [u.id, u])).values());
    
    res.json(uniqueUsers);
  } catch (error) {
    logger.error("Error fetching all staff options:", error);
    res.status(500).json({ message: "Failed to fetch staff options" });
  }
});

router.post('/api/anesthesia/staff-user/:hospitalId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { name, staffRole } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!staffRole) {
      return res.status(400).json({ message: "Staff role is required" });
    }

    const nameParts = name.trim().split(' ');
    const firstName = nameParts[0] || name.trim();
    const lastName = nameParts.slice(1).join(' ') || '';

    const { nanoid } = await import('nanoid');
    const newUserId = nanoid();
    const uniqueSuffix = nanoid(8);
    const dummyEmail = `${firstName.toLowerCase().replace(/[^a-z0-9]/g, '')}.${lastName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'staff'}.${uniqueSuffix}@staff.local`;

    const existingUser = await storage.searchUserByEmail(dummyEmail);
    if (existingUser) {
      return res.status(409).json({ message: "A user with this email already exists. Please try again." });
    }

    const roleToUnitAndUserRole: Record<string, { unitType: 'surgery' | 'anesthesia'; userRole: string }> = {
      surgeon: { unitType: 'surgery', userRole: 'doctor' },
      surgicalAssistant: { unitType: 'surgery', userRole: 'nurse' },
      instrumentNurse: { unitType: 'surgery', userRole: 'nurse' },
      circulatingNurse: { unitType: 'surgery', userRole: 'nurse' },
      anesthesiologist: { unitType: 'anesthesia', userRole: 'doctor' },
      anesthesiaNurse: { unitType: 'anesthesia', userRole: 'nurse' },
      pacuNurse: { unitType: 'anesthesia', userRole: 'nurse' },
    };

    const roleConfig = roleToUnitAndUserRole[staffRole];
    if (!roleConfig) {
      return res.status(400).json({ message: "Invalid staff role" });
    }

    const allUnits = await storage.getUnits(hospitalId);
    const targetUnit = allUnits.find(u => 
      roleConfig.unitType === 'surgery' ? u.type === 'or' : u.type === 'anesthesia'
    );

    if (!targetUnit) {
      return res.status(400).json({ message: `No ${roleConfig.unitType} unit found for this hospital` });
    }

    const [newUser] = await db
      .insert(users)
      .values({
        id: newUserId,
        email: dummyEmail,
        firstName,
        lastName: lastName || null,
        canLogin: false,
        staffType: 'internal',
      })
      .returning();

    await db
      .insert(userHospitalRoles)
      .values({
        userId: newUser.id,
        hospitalId,
        unitId: targetUnit.id,
        role: roleConfig.userRole,
      });

    res.status(201).json({
      id: newUser.id,
      name: `${newUser.firstName || ''} ${newUser.lastName || ''}`.trim(),
      email: newUser.email,
      role: roleConfig.userRole,
      unitId: targetUnit.id,
    });
  } catch (error) {
    logger.error("Error creating quick staff user:", error);
    res.status(500).json({ message: "Failed to create staff user" });
  }
});

router.post('/api/anesthesia/staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertSurgeryStaffEntrySchema.parse(req.body);

    const record = await storage.getAnesthesiaRecordById(validatedData.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const newStaff = await storage.createSurgeryStaff({
      ...validatedData,
      createdBy: userId,
    });
    
    broadcastAnesthesiaUpdate({
      recordId: validatedData.anesthesiaRecordId,
      section: 'staff',
      data: newStaff,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(201).json(newStaff);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating staff:", error);
    res.status(500).json({ message: "Failed to create staff" });
  }
});

router.patch('/api/anesthesia/staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const updateSchema = z.object({
      role: z.enum([
        "surgeon", "surgicalAssistant", "instrumentNurse", 
        "circulatingNurse", "anesthesiologist", "anesthesiaNurse"
      ]).optional(),
      userId: z.string().nullable().optional(),
      name: z.string().optional(),
    });
    
    const validatedUpdates = updateSchema.parse(req.body);

    if (Object.keys(validatedUpdates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const [staff] = await db.select().from(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updated = await storage.updateSurgeryStaff(id, validatedUpdates, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: staff.anesthesiaRecordId,
      section: 'staff',
      data: updated,
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error updating staff:", error);
    res.status(500).json({ message: "Failed to update staff" });
  }
});

router.delete('/api/anesthesia/staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [staff] = await db.select().from(surgeryStaffEntries).where(eq(surgeryStaffEntries.id, id));
    if (!staff) {
      return res.status(404).json({ message: "Staff not found" });
    }

    const record = await storage.getAnesthesiaRecordById(staff.anesthesiaRecordId);
    if (!record) {
      return res.status(404).json({ message: "Anesthesia record not found" });
    }

    const surgery = await storage.getSurgery(record.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await storage.deleteSurgeryStaff(id, userId);
    
    broadcastAnesthesiaUpdate({
      recordId: staff.anesthesiaRecordId,
      section: 'staff',
      data: { deleted: id },
      timestamp: Date.now(),
      userId,
      clientSessionId: getClientSessionId(req),
    });
    
    res.status(204).send();
  } catch (error) {
    logger.error("Error deleting staff:", error);
    res.status(500).json({ message: "Failed to delete staff" });
  }
});

// =====================================
// Staff Pool Endpoints (Daily Staff Pool)
// =====================================

router.get('/api/staff-pool/:hospitalId/:date', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, date } = req.params;
    const userId = req.user.id;

    const staffPool = await db
      .select({
        id: dailyStaffPool.id,
        hospitalId: dailyStaffPool.hospitalId,
        date: dailyStaffPool.date,
        userId: dailyStaffPool.userId,
        name: dailyStaffPool.name,
        role: dailyStaffPool.role,
        createdBy: dailyStaffPool.createdBy,
        createdAt: dailyStaffPool.createdAt,
        staffType: users.staffType,
      })
      .from(dailyStaffPool)
      .leftJoin(users, eq(dailyStaffPool.userId, users.id))
      .where(
        and(
          eq(dailyStaffPool.hospitalId, hospitalId),
          eq(dailyStaffPool.date, date)
        )
      );

    const poolWithAssignments = await Promise.all(
      staffPool.map(async (staff) => {
        const surgeryAssignments = await db
          .select({
            surgeryId: plannedSurgeryStaff.surgeryId,
          })
          .from(plannedSurgeryStaff)
          .where(eq(plannedSurgeryStaff.dailyStaffPoolId, staff.id));
        
        const roomAssignments = await db
          .select({
            roomId: dailyRoomStaff.surgeryRoomId,
            roomName: surgeryRooms.name,
          })
          .from(dailyRoomStaff)
          .innerJoin(surgeryRooms, eq(dailyRoomStaff.surgeryRoomId, surgeryRooms.id))
          .where(eq(dailyRoomStaff.dailyStaffPoolId, staff.id));
        
        return {
          ...staff,
          assignedSurgeryIds: surgeryAssignments.map(a => a.surgeryId),
          assignedRooms: roomAssignments.map(r => ({ roomId: r.roomId, roomName: r.roomName })),
          isBooked: surgeryAssignments.length > 0 || roomAssignments.length > 0,
        };
      })
    );

    res.json(poolWithAssignments);
  } catch (error) {
    logger.error("Error fetching staff pool:", error);
    res.status(500).json({ message: "Failed to fetch staff pool" });
  }
});

router.post('/api/staff-pool', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId, date, userId: staffUserId, name, role } = req.body;
    const userId = req.user.id;

    if (!hospitalId || !date || !name || !role) {
      return res.status(400).json({ message: "hospitalId, date, name, and role are required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [newEntry] = await db
      .insert(dailyStaffPool)
      .values({
        hospitalId,
        date,
        userId: staffUserId || null,
        name,
        role,
        createdBy: userId,
      })
      .returning();

    res.status(201).json({ ...newEntry, assignedSurgeryIds: [], isBooked: false });
  } catch (error) {
    logger.error("Error adding staff to pool:", error);
    res.status(500).json({ message: "Failed to add staff to pool" });
  }
});

router.delete('/api/staff-pool/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [entry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, id));

    if (!entry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === entry.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.delete(dailyStaffPool).where(eq(dailyStaffPool.id, id));

    res.status(204).send();
  } catch (error) {
    logger.error("Error removing staff from pool:", error);
    res.status(500).json({ message: "Failed to remove staff from pool" });
  }
});

// =====================================
// Planned Surgery Staff Endpoints
// =====================================

router.get('/api/planned-staff/:surgeryId', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const planned = await db
      .select({
        id: plannedSurgeryStaff.id,
        surgeryId: plannedSurgeryStaff.surgeryId,
        dailyStaffPoolId: plannedSurgeryStaff.dailyStaffPoolId,
        role: plannedSurgeryStaff.role,
        name: plannedSurgeryStaff.name,
        userId: plannedSurgeryStaff.userId,
        createdAt: plannedSurgeryStaff.createdAt,
      })
      .from(plannedSurgeryStaff)
      .where(eq(plannedSurgeryStaff.surgeryId, surgeryId));

    res.json(planned);
  } catch (error) {
    logger.error("Error fetching planned staff:", error);
    res.status(500).json({ message: "Failed to fetch planned staff" });
  }
});

router.post('/api/planned-staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId, dailyStaffPoolId } = req.body;
    const userId = req.user.id;

    if (!surgeryId || !dailyStaffPoolId) {
      return res.status(400).json({ message: "surgeryId and dailyStaffPoolId are required" });
    }

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [staffPoolEntry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, dailyStaffPoolId));

    if (!staffPoolEntry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    const [existing] = await db
      .select()
      .from(plannedSurgeryStaff)
      .where(
        and(
          eq(plannedSurgeryStaff.surgeryId, surgeryId),
          eq(plannedSurgeryStaff.dailyStaffPoolId, dailyStaffPoolId)
        )
      );

    if (existing) {
      return res.status(409).json({ message: "Staff already assigned to this surgery" });
    }

    const [newAssignment] = await db
      .insert(plannedSurgeryStaff)
      .values({
        surgeryId,
        dailyStaffPoolId,
        role: staffPoolEntry.role,
        name: staffPoolEntry.name,
        userId: staffPoolEntry.userId,
        createdBy: userId,
      })
      .returning();

    res.status(201).json(newAssignment);
  } catch (error) {
    logger.error("Error assigning staff to surgery:", error);
    res.status(500).json({ message: "Failed to assign staff to surgery" });
  }
});

router.delete('/api/planned-staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [assignment] = await db
      .select()
      .from(plannedSurgeryStaff)
      .where(eq(plannedSurgeryStaff.id, id));

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const surgery = await storage.getSurgery(assignment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.delete(plannedSurgeryStaff).where(eq(plannedSurgeryStaff.id, id));

    res.status(204).send();
  } catch (error) {
    logger.error("Error removing staff assignment:", error);
    res.status(500).json({ message: "Failed to remove staff assignment" });
  }
});

router.delete('/api/planned-staff/by-pool/:surgeryId/:dailyStaffPoolId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId, dailyStaffPoolId } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db
      .delete(plannedSurgeryStaff)
      .where(
        and(
          eq(plannedSurgeryStaff.surgeryId, surgeryId),
          eq(plannedSurgeryStaff.dailyStaffPoolId, dailyStaffPoolId)
        )
      );

    res.status(204).send();
  } catch (error) {
    logger.error("Error removing staff assignment:", error);
    res.status(500).json({ message: "Failed to remove staff assignment" });
  }
});

// =====================================
// Daily Room Staff Endpoints (Room-based staff assignments)
// =====================================

router.get('/api/room-staff/all/:hospitalId/:date', isAuthenticated, requireStrictHospitalAccess, async (req: any, res) => {
  try {
    const { hospitalId, date } = req.params;
    const userId = req.user.id;

    const roomStaffAssignments = await db
      .select({
        id: dailyRoomStaff.id,
        dailyStaffPoolId: dailyRoomStaff.dailyStaffPoolId,
        surgeryRoomId: dailyRoomStaff.surgeryRoomId,
        date: dailyRoomStaff.date,
        role: dailyRoomStaff.role,
        name: dailyRoomStaff.name,
        userId: dailyRoomStaff.userId,
        createdBy: dailyRoomStaff.createdBy,
        createdAt: dailyRoomStaff.createdAt,
        roomName: surgeryRooms.name,
      })
      .from(dailyRoomStaff)
      .innerJoin(surgeryRooms, eq(dailyRoomStaff.surgeryRoomId, surgeryRooms.id))
      .where(
        and(
          eq(surgeryRooms.hospitalId, hospitalId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.json(roomStaffAssignments);
  } catch (error) {
    logger.error("Error fetching room staff assignments:", error);
    res.status(500).json({ message: "Failed to fetch room staff assignments" });
  }
});

router.get('/api/room-staff/:roomId/:date', isAuthenticated, async (req: any, res) => {
  try {
    const { roomId, date } = req.params;
    const userId = req.user.id;

    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, roomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const roomStaff = await db
      .select({
        id: dailyRoomStaff.id,
        dailyStaffPoolId: dailyRoomStaff.dailyStaffPoolId,
        surgeryRoomId: dailyRoomStaff.surgeryRoomId,
        date: dailyRoomStaff.date,
        role: dailyRoomStaff.role,
        name: dailyRoomStaff.name,
        userId: dailyRoomStaff.userId,
        createdBy: dailyRoomStaff.createdBy,
        createdAt: dailyRoomStaff.createdAt,
      })
      .from(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, roomId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.json(roomStaff);
  } catch (error) {
    logger.error("Error fetching room staff:", error);
    res.status(500).json({ message: "Failed to fetch room staff" });
  }
});

router.post('/api/room-staff', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryRoomId, dailyStaffPoolId, date } = req.body;
    const userId = req.user.id;

    if (!surgeryRoomId || !dailyStaffPoolId || !date) {
      return res.status(400).json({ message: "surgeryRoomId, dailyStaffPoolId, and date are required" });
    }

    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, surgeryRoomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const [staffPoolEntry] = await db
      .select()
      .from(dailyStaffPool)
      .where(eq(dailyStaffPool.id, dailyStaffPoolId));

    if (!staffPoolEntry) {
      return res.status(404).json({ message: "Staff pool entry not found" });
    }

    const [existing] = await db
      .select()
      .from(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, surgeryRoomId),
          eq(dailyRoomStaff.dailyStaffPoolId, dailyStaffPoolId),
          eq(dailyRoomStaff.date, date)
        )
      );

    if (existing) {
      return res.status(409).json({ message: "Staff already assigned to this room on this date" });
    }

    const [newAssignment] = await db
      .insert(dailyRoomStaff)
      .values({
        surgeryRoomId,
        dailyStaffPoolId,
        date,
        role: staffPoolEntry.role,
        name: staffPoolEntry.name,
        userId: staffPoolEntry.userId,
        createdBy: userId,
      })
      .returning();

    res.status(201).json({ ...newAssignment, roomName: room.name });
  } catch (error) {
    logger.error("Error assigning staff to room:", error);
    res.status(500).json({ message: "Failed to assign staff to room" });
  }
});

router.delete('/api/room-staff/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [assignment] = await db
      .select()
      .from(dailyRoomStaff)
      .where(eq(dailyRoomStaff.id, id));

    if (!assignment) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, assignment.surgeryRoomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db.delete(dailyRoomStaff).where(eq(dailyRoomStaff.id, id));

    res.status(204).send();
  } catch (error) {
    logger.error("Error removing room staff assignment:", error);
    res.status(500).json({ message: "Failed to remove room staff assignment" });
  }
});

router.delete('/api/room-staff/by-pool/:roomId/:dailyStaffPoolId/:date', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { roomId, dailyStaffPoolId, date } = req.params;
    const userId = req.user.id;

    const [room] = await db
      .select()
      .from(surgeryRooms)
      .where(eq(surgeryRooms.id, roomId));

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === room.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    await db
      .delete(dailyRoomStaff)
      .where(
        and(
          eq(dailyRoomStaff.surgeryRoomId, roomId),
          eq(dailyRoomStaff.dailyStaffPoolId, dailyStaffPoolId),
          eq(dailyRoomStaff.date, date)
        )
      );

    res.status(204).send();
  } catch (error) {
    logger.error("Error removing room staff assignment:", error);
    res.status(500).json({ message: "Failed to remove room staff assignment" });
  }
});

export default router;
