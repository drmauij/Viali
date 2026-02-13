import { Router } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import {
  patients,
  surgeries,
  externalSurgeryRequests,
  users,
  userHospitalRoles,
  preOpAssessments,
  chopProcedures,
} from "@shared/schema";
import {
  getUserUnitForHospital,
  getActiveUnitIdFromRequest,
  getBulkImportImageLimit,
  requireWriteAccess,
} from "../utils";
import { z, ZodError } from "zod";
import { eq, and, or, inArray, sql, asc } from "drizzle-orm";
import type { Request, Response } from "express";

const router = Router();

router.get('/api/chop-procedures', async (req: Request, res: Response) => {
  try {
    const search = (req.query.search as string || '').trim();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    if (!search || search.length < 2) {
      return res.json([]);
    }
    const results = await db
      .select({
        id: chopProcedures.id,
        code: chopProcedures.code,
        descriptionDe: chopProcedures.descriptionDe,
        chapter: chopProcedures.chapter,
        indentLevel: chopProcedures.indentLevel,
        laterality: chopProcedures.laterality,
      })
      .from(chopProcedures)
      .where(
        or(
          sql`${chopProcedures.code} ILIKE ${search + '%'}`,
          sql`${chopProcedures.descriptionDe} ILIKE ${'%' + search + '%'}`,
          sql`to_tsvector('german', ${chopProcedures.descriptionDe}) @@ plainto_tsquery('german', ${search})`
        )
      )
      .orderBy(
        sql`CASE 
          WHEN ${chopProcedures.code} ILIKE ${search + '%'} THEN 0 
          WHEN ${chopProcedures.descriptionDe} ILIKE ${search + '%'} THEN 1 
          ELSE 2 
        END`,
        asc(chopProcedures.code)
      )
      .limit(limit);
    res.json(results);
  } catch (error: any) {
    console.error("Error searching CHOP procedures:", error);
    res.status(500).json({ message: "Failed to search procedures" });
  }
});

router.get('/api/hospitals/:hospitalId/bulk-import-limit', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const hospital = await storage.getHospital(hospitalId);
    if (!hospital) {
      return res.status(404).json({ message: "Hospital not found" });
    }
    const licenseType = hospital.licenseType || "free";
    const imageLimit = getBulkImportImageLimit(licenseType);
    res.json({ limit: imageLimit, licenseType });
  } catch (error: any) {
    console.error("Error getting bulk import limit:", error);
    res.status(500).json({ message: "Failed to get bulk import limit" });
  }
});

router.patch('/api/hospitals/:hospitalId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;
    const userHospitals = await storage.getUserHospitals(userId);
    const hospitalAccess = userHospitals.find(h => h.id === hospitalId && h.role === 'admin');
    if (!hospitalAccess) {
      return res.status(403).json({ message: "Admin access required to update hospital settings" });
    }
    const hospitalUpdateSchema = z.object({
      visionAiProvider: z.enum(['openai', 'pixtral']).optional(),
    });
    let parsedHospitalUpdate;
    try {
      parsedHospitalUpdate = hospitalUpdateSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { visionAiProvider } = parsedHospitalUpdate;
    const updates: any = {};
    if (visionAiProvider !== undefined) {
      updates.visionAiProvider = visionAiProvider;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }
    const updatedHospital = await storage.updateHospital(hospitalId, updates);
    res.json(updatedHospital);
  } catch (error: any) {
    console.error("Error updating hospital:", error);
    res.status(500).json({ message: "Failed to update hospital settings" });
  }
});

router.post('/api/hospitals/:id/seed', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id: hospitalId } = req.params;
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
    if (!hospital) {
      return res.status(403).json({ message: "Admin access required to seed hospital data" });
    }
    const { seedHospitalData } = await import('../seed-hospital');
    const result = await seedHospitalData(hospitalId);
    res.json({
      message: "Hospital seeded successfully",
      result: {
        locationsCreated: result.locationsCreated,
        surgeryRoomsCreated: result.surgeryRoomsCreated,
        adminGroupsCreated: result.adminGroupsCreated,
        medicationsCreated: result.medicationsCreated,
      }
    });
  } catch (error) {
    console.error("Error seeding hospital:", error);
    res.status(500).json({ message: "Failed to seed hospital data" });
  }
});

router.post('/api/hospitals/:id/reset-lists', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id: hospitalId } = req.params;
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
    if (!hospital) {
      return res.status(403).json({ message: "Admin access required to reset lists" });
    }
    const { resetListsToDefaults } = await import('../seed-hospital');
    const result = await resetListsToDefaults(hospitalId);
    res.json({ message: "Lists reset to defaults successfully", result });
  } catch (error) {
    console.error("Error resetting lists:", error);
    res.status(500).json({ message: "Failed to reset lists to defaults" });
  }
});

router.post('/api/hospitals/:id/normalize-phones', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id: hospitalId } = req.params;
    const userId = req.user.id;
    const hospitals = await storage.getUserHospitals(userId);
    const hospital = hospitals.find(h => h.id === hospitalId && h.role === 'admin');
    if (!hospital) {
      return res.status(403).json({ message: "Admin access required to normalize phone numbers" });
    }

    const normalizePhone = (phone: string | null): string | null => {
      if (!phone) return phone;
      let cleaned = phone.trim();
      if (cleaned.startsWith('+')) return cleaned;
      if (cleaned.startsWith('00')) return '+' + cleaned.slice(2);
      if (cleaned.startsWith('0')) cleaned = cleaned.slice(1);
      return '+41 ' + cleaned;
    };

    let patientsUpdated = 0;
    let usersUpdated = 0;
    let externalRequestsUpdated = 0;

    const patientsData = await db
      .select({ id: patients.id, phone: patients.phone })
      .from(patients)
      .where(eq(patients.hospitalId, hospitalId));
    for (const patient of patientsData) {
      if (patient.phone) {
        const normalized = normalizePhone(patient.phone);
        if (normalized !== patient.phone) {
          await db.update(patients).set({ phone: normalized }).where(eq(patients.id, patient.id));
          patientsUpdated++;
        }
      }
    }

    const hospitalRoles = await db
      .select({ userId: userHospitalRoles.userId })
      .from(userHospitalRoles)
      .where(eq(userHospitalRoles.hospitalId, hospitalId));
    const userIds = hospitalRoles.map(r => r.userId);
    if (userIds.length > 0) {
      const usersData = await db
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(inArray(users.id, userIds));
      for (const user of usersData) {
        if (user.phone) {
          const normalized = normalizePhone(user.phone);
          if (normalized !== user.phone) {
            await db.update(users).set({ phone: normalized }).where(eq(users.id, user.id));
            usersUpdated++;
          }
        }
      }
    }

    let preOpUpdated = 0;
    const preOpData = await db
      .select({
        id: preOpAssessments.id,
        outpatientCaregiverPhone: preOpAssessments.outpatientCaregiverPhone
      })
      .from(preOpAssessments)
      .innerJoin(surgeries, eq(preOpAssessments.surgeryId, surgeries.id))
      .where(eq(surgeries.hospitalId, hospitalId));
    for (const p of preOpData) {
      if (p.outpatientCaregiverPhone) {
        const normalized = normalizePhone(p.outpatientCaregiverPhone);
        if (normalized !== p.outpatientCaregiverPhone) {
          await db.update(preOpAssessments)
            .set({ outpatientCaregiverPhone: normalized })
            .where(eq(preOpAssessments.id, p.id));
          preOpUpdated++;
        }
      }
    }

    const externalRequests = await db
      .select({
        id: externalSurgeryRequests.id,
        surgeonPhone: externalSurgeryRequests.surgeonPhone,
        patientPhone: externalSurgeryRequests.patientPhone
      })
      .from(externalSurgeryRequests)
      .where(eq(externalSurgeryRequests.hospitalId, hospitalId));
    for (const r of externalRequests) {
      const updates: Record<string, string | null> = {};
      if (r.surgeonPhone) {
        const normalized = normalizePhone(r.surgeonPhone);
        if (normalized !== r.surgeonPhone) updates.surgeonPhone = normalized;
      }
      if (r.patientPhone) {
        const normalized = normalizePhone(r.patientPhone);
        if (normalized !== r.patientPhone) updates.patientPhone = normalized;
      }
      if (Object.keys(updates).length > 0) {
        await db.update(externalSurgeryRequests)
          .set(updates)
          .where(eq(externalSurgeryRequests.id, r.id));
        externalRequestsUpdated++;
      }
    }

    res.json({
      message: "Phone numbers normalized successfully",
      result: {
        patientsUpdated,
        usersUpdated,
        preOpUpdated,
        externalRequestsUpdated,
        totalUpdated: patientsUpdated + usersUpdated + preOpUpdated + externalRequestsUpdated
      }
    });
  } catch (error) {
    console.error("Error normalizing phone numbers:", error);
    res.status(500).json({ message: "Failed to normalize phone numbers" });
  }
});

router.get("/api/patients/:patientId/discharge-medications", isAuthenticated, async (req: any, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.query.hospitalId as string;
    if (!hospitalId) return res.status(400).json({ error: "hospitalId required" });
    const slots = await storage.getPatientDischargeMedications(patientId, hospitalId);
    res.json(slots);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/discharge-medications/:id", isAuthenticated, async (req: any, res) => {
  try {
    const slot = await storage.getPatientDischargeMedication(req.params.id);
    if (!slot) return res.status(404).json({ error: "Not found" });
    res.json(slot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/api/patients/:patientId/discharge-medications", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId } = req.params;
    const { hospitalId, doctorId, notes, signature, createdBy, items: medItems } = req.body;
    if (!hospitalId) return res.status(400).json({ error: "hospitalId required" });

    if (medItems && medItems.length > 0) {
      const itemIds = medItems.map((m: any) => m.itemId);
      let hasControlled = false;
      for (const itemId of itemIds) {
        const item = await storage.getItem(itemId);
        if (item?.controlled) {
          hasControlled = true;
          break;
        }
      }
      if (hasControlled && !signature) {
        return res.status(400).json({ error: "Signature required for controlled substances" });
      }
    }

    const slot = await storage.createPatientDischargeMedication(
      { patientId, hospitalId, doctorId, notes, signature, createdBy },
      medItems || []
    );
    const fullSlot = await storage.getPatientDischargeMedication(slot.id);
    res.json(fullSlot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/api/discharge-medications/:id", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { doctorId, notes, signature, items: medItems } = req.body;
    if (!medItems || !Array.isArray(medItems) || medItems.length === 0) {
      return res.status(400).json({ error: "At least one medication item is required" });
    }
    const existing = await storage.getPatientDischargeMedication(id);
    if (!existing) return res.status(404).json({ error: "Not found" });

    if (medItems && medItems.length > 0) {
      const itemIds = medItems.map((m: any) => m.itemId);
      let hasControlled = false;
      for (const itemId of itemIds) {
        const item = await storage.getItem(itemId);
        if (item?.controlled) {
          hasControlled = true;
          break;
        }
      }
      if (hasControlled && !signature) {
        return res.status(400).json({ error: "Signature required for controlled substances" });
      }
    }

    await storage.updatePatientDischargeMedication(
      id,
      { doctorId, notes, signature },
      medItems || []
    );
    const fullSlot = await storage.getPatientDischargeMedication(id);
    res.json(fullSlot);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/api/discharge-medications/:id", isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    await storage.deletePatientDischargeMedication(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/api/hospitals/:hospitalId/doctors", isAuthenticated, async (req: any, res) => {
  try {
    const hospitalUsers = await storage.getHospitalUsers(req.params.hospitalId);
    const seenIds = new Set<string>();
    const seenNames = new Set<string>();
    const doctors = hospitalUsers
      .filter(hu => hu.role.toLowerCase() === 'doctor')
      .filter(hu => {
        if (seenIds.has(hu.user.id)) return false;
        seenIds.add(hu.user.id);
        const fullName = `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim().toLowerCase();
        if (seenNames.has(fullName)) return false;
        seenNames.add(fullName);
        return true;
      })
      .map(hu => ({
        id: hu.user.id,
        firstName: hu.user.firstName,
        lastName: hu.user.lastName,
        email: hu.user.email,
      }));
    res.json(doctors);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
