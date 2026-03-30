import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requirePortalVerification } from "../auth/portalAuth";
import { revokePortalSessionsByToken } from "../storage/portalOtp";
import { externalWorklogLinks, externalWorklogEntries, units, workerContracts, dailyStaffPool, dailyRoomStaff, surgeryRooms, surgeries, hospitals } from "@shared/schema";
import { getActiveUnitIdFromRequest } from "../utils";
import { eq, and, desc, gte, lte, inArray, ne, min, max, count, sql } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";
import crypto from "crypto";
import logger from "../logger";
import { searchUserByEmail } from "../storage/users";
import { materializeRulesForDate } from "../utils/staffPool";

const router = Router();

// Portal verification for all public worklog routes
router.use('/api/worklog/:token', requirePortalVerification("worklog"));

// Public route: Get worklog link info by token (no auth required)
router.get('/api/worklog/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    if (!link.isActive) {
      return res.status(410).json({ message: "This link has been deactivated" });
    }
    
    // Update last accessed timestamp
    await storage.updateExternalWorklogLinkLastAccess(link.id);
    
    // Get existing entries for this link
    const entries = await storage.getExternalWorklogEntriesByLink(link.id);
    
    res.json({
      email: link.email,
      unitName: link.unit.name,
      hospitalName: link.hospital.name,
      linkId: link.id,
      unitId: link.unitId,
      hospitalId: link.hospitalId,
      entries,
      personalData: {
        firstName: link.firstName || '',
        lastName: link.lastName || '',
        profession: link.profession || '',
        address: link.address || '',
        city: link.city || '',
        zip: link.zip || '',
        dateOfBirth: link.dateOfBirth || '',
        maritalStatus: link.maritalStatus || '',
        nationality: link.nationality || '',
        religion: link.religion || '',
        mobile: link.mobile || '',
        ahvNumber: link.ahvNumber || '',
        hasChildBenefits: link.hasChildBenefits || false,
        numberOfChildren: link.numberOfChildren || 0,
        childBenefitsRecipient: link.childBenefitsRecipient || '',
        childBenefitsRegistration: link.childBenefitsRegistration || '',
        hasResidencePermit: link.hasResidencePermit || false,
        residencePermitType: link.residencePermitType || '',
        residencePermitValidUntil: link.residencePermitValidUntil || '',
        residencePermitFrontImage: link.residencePermitFrontImage || '',
        residencePermitBackImage: link.residencePermitBackImage || '',
        bankName: link.bankName || '',
        bankAddress: link.bankAddress || '',
        bankAccount: link.bankAccount || '',
        hasOwnVehicle: link.hasOwnVehicle || false,
      },
    });
  } catch (error) {
    logger.error("Error fetching worklog link:", error);
    res.status(500).json({ message: "Failed to fetch worklog data" });
  }
});

// Public route: Save personal data (no auth required, uses token)
router.patch('/api/worklog/:token/personal-data', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const { 
      firstName, lastName, profession, address, city, zip, dateOfBirth,
      maritalStatus, nationality, religion, mobile, ahvNumber,
      hasChildBenefits, numberOfChildren, childBenefitsRecipient, childBenefitsRegistration,
      hasResidencePermit, residencePermitType, residencePermitValidUntil,
      residencePermitFrontImage, residencePermitBackImage,
      bankName, bankAddress, bankAccount, hasOwnVehicle
    } = req.body;
    
    await db.update(externalWorklogLinks)
      .set({
        firstName: firstName || null,
        lastName: lastName || null,
        profession: profession || null,
        address: address || null,
        city: city || null,
        zip: zip || null,
        dateOfBirth: dateOfBirth || null,
        maritalStatus: maritalStatus || null,
        nationality: nationality || null,
        religion: religion || null,
        mobile: mobile || null,
        ahvNumber: ahvNumber || null,
        hasChildBenefits: hasChildBenefits ?? null,
        numberOfChildren: numberOfChildren ?? null,
        childBenefitsRecipient: childBenefitsRecipient || null,
        childBenefitsRegistration: childBenefitsRegistration || null,
        hasResidencePermit: hasResidencePermit ?? null,
        residencePermitType: residencePermitType || null,
        residencePermitValidUntil: residencePermitValidUntil || null,
        residencePermitFrontImage: residencePermitFrontImage || null,
        residencePermitBackImage: residencePermitBackImage || null,
        bankName: bankName || null,
        bankAddress: bankAddress || null,
        bankAccount: bankAccount || null,
        hasOwnVehicle: hasOwnVehicle ?? null,
        updatedAt: new Date(),
      })
      .where(eq(externalWorklogLinks.id, link.id));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error saving personal data:", error);
    res.status(500).json({ message: "Failed to save personal data" });
  }
});

// Public route: Get upload URL for residence permit image (no auth required, uses token)
router.post('/api/worklog/:token/permit-image-upload', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const { side, filename } = req.body;
    
    if (!side || !['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side specified. Must be 'front' or 'back'." });
    }
    
    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }
    
    const folder = `worklog-permits/${link.id}`;
    const { uploadURL, storageKey } = await objectStorageService.getUploadURLForFolder(folder, filename || `permit-${side}.jpg`);
    
    res.json({ uploadURL, storageKey });
  } catch (error) {
    logger.error("Error getting permit image upload URL:", error);
    res.status(500).json({ message: "Failed to get upload URL" });
  }
});

// Public route: Get download URL for residence permit image (no auth required, uses token)
router.get('/api/worklog/:token/permit-image/:side', async (req, res) => {
  try {
    const { token, side } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side specified. Must be 'front' or 'back'." });
    }
    
    const storageKey = side === 'front' ? link.residencePermitFrontImage : link.residencePermitBackImage;
    
    if (!storageKey) {
      return res.status(404).json({ message: "Image not found" });
    }
    
    const objectStorageService = new ObjectStorageService();
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }
    
    const downloadURL = await objectStorageService.getObjectDownloadURL(storageKey, 3600);
    res.json({ downloadURL });
  } catch (error) {
    logger.error("Error getting permit image download URL:", error);
    res.status(500).json({ message: "Failed to get download URL" });
  }
});

// Public route: Submit a time entry (no auth required)
router.post('/api/worklog/:token/entries', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const { firstName, lastName, workDate, timeStart, timeEnd, pauseMinutes, activityType, workerSignature, notes } = req.body;
    
    const validActivityTypes = ["anesthesia_nurse", "op_nurse", "springer_nurse", "anesthesia_doctor", "other"];
    if (!firstName || !lastName || !workDate || !timeStart || !timeEnd || !activityType || !workerSignature) {
      return res.status(400).json({ message: "Missing required fields" });
    }
    
    if (!validActivityTypes.includes(activityType)) {
      return res.status(400).json({ message: "Invalid activity type" });
    }
    
    const entry = await storage.createExternalWorklogEntry({
      linkId: link.id,
      unitId: link.unitId,
      hospitalId: link.hospitalId,
      email: link.email,
      firstName,
      lastName,
      workDate,
      timeStart,
      timeEnd,
      pauseMinutes: pauseMinutes || 0,
      activityType,
      workerSignature,
      notes: notes || null,
    });
    
    res.status(201).json(entry);
  } catch (error) {
    logger.error("Error creating worklog entry:", error);
    res.status(500).json({ message: "Failed to create entry" });
  }
});

// Public route: Resend worklog link to email
router.post('/api/worklog/resend', async (req, res) => {
  try {
    const { email, hospitalId } = req.body;
    
    if (!email || !hospitalId) {
      return res.status(400).json({ message: "Email and hospital ID are required" });
    }
    
    // Find any active links for this email across all units in the hospital
    const { sendWorklogLinkEmail } = await import('../email');
    const allLinks = await db.select()
      .from(externalWorklogLinks)
      .innerJoin(units, eq(units.id, externalWorklogLinks.unitId))
      .where(and(
        eq(externalWorklogLinks.hospitalId, hospitalId),
        eq(externalWorklogLinks.email, email.toLowerCase()),
        eq(externalWorklogLinks.isActive, true)
      ));
    
    if (allLinks.length === 0) {
      return res.json({ message: "If your email is registered, you will receive the link shortly." });
    }
    
    // Send email for each link
    for (const linkData of allLinks) {
      const link = linkData.external_worklog_links;
      const unit = linkData.units;
      const hospital = await storage.getHospital(link.hospitalId);
      
      if (hospital) {
        await sendWorklogLinkEmail(
          email,
          link.token,
          unit.name,
          hospital.name,
          (hospital.defaultLanguage as 'de' | 'en') || 'de'
        );
      }
    }
    
    res.json({ message: "If your email is registered, you will receive the link shortly." });
  } catch (error) {
    logger.error("Error resending worklog link:", error);
    res.status(500).json({ message: "Failed to process request" });
  }
});

// Get staff-only users (canLogin=false) for a hospital — used to pick existing staff when creating worklog links
router.get('/api/hospitals/:hospitalId/worklog/staff-users', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const hospitalUsers = await storage.getHospitalUsers(hospitalId);

    const staffUsers = hospitalUsers
      .filter(hu => hu.user.canLogin === false)
      .map(hu => ({
        id: hu.user.id,
        name: `${hu.user.firstName || ''} ${hu.user.lastName || ''}`.trim() || hu.user.email || 'Unknown',
        email: hu.user.email,
        canLogin: hu.user.canLogin,
      }));

    // Deduplicate by user id (a user may appear in multiple units)
    const unique = Array.from(new Map(staffUsers.map(u => [u.id, u])).values());
    res.json(unique);
  } catch (error) {
    logger.error("Error fetching staff users for worklog:", error);
    res.status(500).json({ message: "Failed to fetch staff users" });
  }
});

// Lookup worklog links by email for a hospital (authenticated)
router.get('/api/hospitals/:hospitalId/worklog/links/by-email', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { email } = req.query;

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ message: "Email query parameter is required" });
    }

    const links = await db
      .select({
        id: externalWorklogLinks.id,
        unitId: externalWorklogLinks.unitId,
        hospitalId: externalWorklogLinks.hospitalId,
        email: externalWorklogLinks.email,
        token: externalWorklogLinks.token,
        isActive: externalWorklogLinks.isActive,
        unitName: units.name,
      })
      .from(externalWorklogLinks)
      .innerJoin(units, eq(externalWorklogLinks.unitId, units.id))
      .where(and(
        eq(externalWorklogLinks.hospitalId, hospitalId),
        eq(externalWorklogLinks.email, email.toLowerCase())
      ));

    res.json(links);
  } catch (error) {
    logger.error("Error fetching worklog links by email:", error);
    res.status(500).json({ message: "Failed to fetch worklog links" });
  }
});

// Get distinct workers who have worklog links for this hospital (authenticated)
router.get('/api/hospitals/:hospitalId/worklog/workers', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const workers = await storage.getWorklogWorkers(hospitalId);
    res.json(workers);
  } catch (error) {
    logger.error("Error fetching worklog workers:", error);
    res.status(500).json({ message: "Failed to fetch workers" });
  }
});

// Get pending worklog entries for countersigning (authenticated)
router.get('/api/hospitals/:hospitalId/worklog/pending', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;

    const entries = await storage.getPendingWorklogEntries(hospitalId);
    res.json(entries);
  } catch (error) {
    logger.error("Error fetching pending worklogs:", error);
    res.status(500).json({ message: "Failed to fetch pending entries" });
  }
});

// Get all worklog entries with filters (authenticated, manager/business view)
router.get('/api/hospitals/:hospitalId/worklog/entries', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const { unitId, status, email, dateFrom, dateTo } = req.query;
    
    const entries = await storage.getAllWorklogEntries(hospitalId, {
      unitId: unitId as string,
      status: status as string,
      email: email as string,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
    });
    
    res.json(entries);
  } catch (error) {
    logger.error("Error fetching worklog entries:", error);
    res.status(500).json({ message: "Failed to fetch entries" });
  }
});

// Countersign a worklog entry (authenticated, requires user to be assigned to entry's unit)
router.post('/api/hospitals/:hospitalId/worklog/entries/:entryId/countersign', isAuthenticated, async (req: any, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.id;
    const { signature } = req.body;
    
    if (!signature) {
      return res.status(400).json({ message: "Signature is required" });
    }
    
    // Fetch the entry to check unit assignment
    const entry = await storage.getExternalWorklogEntry(entryId);
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    // Check if user belongs to this hospital (any unit)
    const userHospitals = await storage.getUserHospitals(userId);
    const hasHospitalAccess = userHospitals.some(h => h.id === entry.hospitalId);

    if (!hasHospitalAccess) {
      return res.status(403).json({ message: "You do not have permission to countersign entries for this hospital" });
    }

    const user = await storage.getUser(userId);
    const signerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';

    const updated = await storage.countersignWorklogEntry(entryId, userId, signature, signerName);
    res.json(updated);
  } catch (error) {
    logger.error("Error countersigning entry:", error);
    res.status(500).json({ message: "Failed to countersign entry" });
  }
});

// Reject a worklog entry (authenticated, requires user to be assigned to entry's unit)
router.post('/api/hospitals/:hospitalId/worklog/entries/:entryId/reject', isAuthenticated, async (req: any, res) => {
  try {
    const { entryId } = req.params;
    const userId = req.user.id;
    const { reason } = req.body;
    
    // Fetch the entry to check unit assignment
    const entry = await storage.getExternalWorklogEntry(entryId);
    if (!entry) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    // Check if user belongs to this hospital (any unit)
    const userHospitals = await storage.getUserHospitals(userId);
    const hasHospitalAccess = userHospitals.some(h => h.id === entry.hospitalId);

    if (!hasHospitalAccess) {
      return res.status(403).json({ message: "You do not have permission to reject entries for this hospital" });
    }
    
    const user = await storage.getUser(userId);
    const signerName = user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : 'Unknown';
    
    const updated = await storage.rejectWorklogEntry(entryId, userId, reason || '', signerName);
    res.json(updated);
  } catch (error) {
    logger.error("Error rejecting entry:", error);
    res.status(500).json({ message: "Failed to reject entry" });
  }
});

// Get all worklog links for the hospital
router.get('/api/hospitals/:hospitalId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const links = await storage.getWorklogLinksByHospital(hospitalId);
    res.json(links);
  } catch (error) {
    logger.error("Error fetching worklog links:", error);
    res.status(500).json({ message: "Failed to fetch links" });
  }
});

// Create a new worklog link (gets unitId from header)
router.post('/api/hospitals/:hospitalId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const unitId = getActiveUnitIdFromRequest(req);
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID required" });
    }
    const { email, name, sendEmail = false } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    // Check if link already exists for this hospital+email
    const existing = await storage.getExternalWorklogLinkByEmail(hospitalId, email);
    if (existing) {
      return res.json(existing);
    }

    const token = crypto.randomUUID();
    const link = await storage.createExternalWorklogLink({
      unitId,
      hospitalId,
      email,
      token,
      isActive: true,
    });

    if (sendEmail) {
      const { sendWorklogLinkEmail } = await import('../email');
      const unit = await storage.getUnit(unitId);
      const hospital = await storage.getHospital(hospitalId);

      if (unit && hospital) {
        await sendWorklogLinkEmail(email, token, unit.name, hospital.name, (hospital.defaultLanguage as 'de' | 'en') || 'de');
      }
    }

    res.status(201).json(link);
  } catch (error) {
    logger.error("Error creating worklog link:", error);
    res.status(500).json({ message: "Failed to create link" });
  }
});

// Send worklog link email (authenticated)
router.post('/api/hospitals/:hospitalId/worklog/links/:linkId/send', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, linkId } = req.params;
    const link = await storage.getExternalWorklogLink(linkId);
    
    if (!link) {
      return res.status(404).json({ message: "Link not found" });
    }
    
    const { sendWorklogLinkEmail } = await import('../email');
    const unit = await storage.getUnit(link.unitId);
    const hospital = await storage.getHospital(hospitalId);
    
    if (unit && hospital) {
      await sendWorklogLinkEmail(link.email, link.token, unit.name, hospital.name, (hospital.defaultLanguage as 'de' | 'en') || 'de');
      res.json({ success: true, message: "Email sent" });
    } else {
      res.status(400).json({ message: "Unit or hospital not found" });
    }
  } catch (error) {
    logger.error("Error sending worklog link:", error);
    res.status(500).json({ message: "Failed to send email" });
  }
});

// Delete worklog link (authenticated)
router.delete('/api/hospitals/:hospitalId/worklog/links/:linkId', isAuthenticated, async (req: any, res) => {
  try {
    const { linkId } = req.params;
    // Revoke portal sessions before deleting the link
    const link = await storage.getExternalWorklogLink(linkId);
    if (link?.token) {
      await revokePortalSessionsByToken(link.token);
    }
    await storage.deleteExternalWorklogLink(linkId);
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting worklog link:", error);
    res.status(500).json({ message: "Failed to delete link" });
  }
});

// Generate a new worklog link for a unit+email (authenticated, admin/manager)
router.post('/api/hospitals/:hospitalId/units/:unitId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, unitId } = req.params;
    const { email, sendEmail = true } = req.body;
    
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    
    // Check if link already exists for this hospital+email
    const existing = await storage.getExternalWorklogLinkByEmail(hospitalId, email);
    if (existing) {
      return res.json(existing);
    }
    
    const token = crypto.randomUUID();
    const link = await storage.createExternalWorklogLink({
      unitId,
      hospitalId,
      email,
      token,
      isActive: true,
    });
    
    if (sendEmail) {
      const { sendWorklogLinkEmail } = await import('../email');
      const unit = await storage.getUnit(unitId);
      const hospital = await storage.getHospital(hospitalId);
      
      if (unit && hospital) {
        await sendWorklogLinkEmail(email, token, unit.name, hospital.name, (hospital.defaultLanguage as 'de' | 'en') || 'de');
      }
    }

    res.status(201).json(link);
  } catch (error) {
    logger.error("Error creating worklog link:", error);
    res.status(500).json({ message: "Failed to create link" });
  }
});

// Get all worklog links for the hospital (unit route kept for backward compat)
router.get('/api/hospitals/:hospitalId/units/:unitId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const links = await storage.getWorklogLinksByHospital(hospitalId);
    res.json(links);
  } catch (error) {
    logger.error("Error fetching worklog links:", error);
    res.status(500).json({ message: "Failed to fetch links" });
  }
});

// Get worklog entry for PDF generation (public with token validation)
router.get('/api/worklog/:token/entries/:entryId', async (req, res) => {
  try {
    const { token, entryId } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const entry = await storage.getExternalWorklogEntry(entryId);
    
    if (!entry || entry.linkId !== link.id) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    res.json({
      ...entry,
      hospitalName: link.hospital.name,
      unitName: link.unit.name,
    });
  } catch (error) {
    logger.error("Error fetching entry:", error);
    res.status(500).json({ message: "Failed to fetch entry" });
  }
});

// Delete worklog entry (public with token validation, only pending entries)
router.delete('/api/worklog/:token/entries/:entryId', async (req, res) => {
  try {
    const { token, entryId } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const entry = await storage.getExternalWorklogEntry(entryId);
    
    if (!entry || entry.linkId !== link.id) {
      return res.status(404).json({ message: "Entry not found" });
    }
    
    if (entry.status !== "pending") {
      return res.status(400).json({ message: "Only pending entries can be deleted" });
    }
    
    await db.delete(externalWorklogEntries).where(eq(externalWorklogEntries.id, entryId));
    
    res.json({ success: true });
  } catch (error) {
    logger.error("Error deleting entry:", error);
    res.status(500).json({ message: "Failed to delete entry" });
  }
});

// Get contracts linked to this worklog email
router.get('/api/worklog/:token/contracts', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);
    
    if (!link || !link.isActive) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }
    
    const contracts = await db.select({
      id: workerContracts.id,
      firstName: workerContracts.firstName,
      lastName: workerContracts.lastName,
      email: workerContracts.email,
      role: workerContracts.role,
      status: workerContracts.status,
      workerSignedAt: workerContracts.workerSignedAt,
      managerSignedAt: workerContracts.managerSignedAt,
      archivedAt: workerContracts.archivedAt,
    })
      .from(workerContracts)
      .where(and(
        eq(workerContracts.email, link.email),
        eq(workerContracts.hospitalId, link.hospitalId)
      ))
      .orderBy(desc(workerContracts.createdAt));
    
    res.json(contracts);
  } catch (error) {
    logger.error("Error fetching contracts:", error);
    res.status(500).json({ message: "Failed to fetch contracts" });
  }
});

// Public route: Get planned shifts for a month (no auth required, uses token)
router.get('/api/worklog/:token/planned-shifts', async (req, res) => {
  try {
    const { token } = req.params;
    const link = await storage.getExternalWorklogLinkByToken(token);

    if (!link) {
      return res.status(404).json({ message: "Invalid or expired link" });
    }

    if (!link.isActive) {
      return res.status(410).json({ message: "This link has been deactivated" });
    }

    // Validate month param (YYYY-MM)
    const month = req.query.month as string;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ message: "month query param required (format: YYYY-MM)" });
    }

    // Get hospital timezone
    const [hospital] = await db.select({ timezone: hospitals.timezone }).from(hospitals).where(eq(hospitals.id, link.hospitalId)).limit(1);
    const tz = hospital?.timezone || "Europe/Zurich";

    // Look up user by email
    const user = await searchUserByEmail(link.email.toLowerCase());
    if (!user) {
      return res.json({ shifts: [], userLinked: false });
    }

    // Compute date range for the month
    const [yearStr, monthStr] = month.split('-');
    const year = parseInt(yearStr, 10);
    const mon = parseInt(monthStr, 10);
    const firstDay = `${year}-${String(mon).padStart(2, '0')}-01`;
    const lastDayDate = new Date(year, mon, 0); // last day of month
    const lastDay = `${year}-${String(mon).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;

    // Materialize rules for each day in the month
    for (let d = 1; d <= lastDayDate.getDate(); d++) {
      const dateStr = `${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      await materializeRulesForDate(link.hospitalId, dateStr);
    }

    // Query shifts for this user in the date range
    const poolEntries = await db
      .select({
        id: dailyStaffPool.id,
        date: dailyStaffPool.date,
        role: dailyStaffPool.role,
      })
      .from(dailyStaffPool)
      .where(
        and(
          eq(dailyStaffPool.hospitalId, link.hospitalId),
          eq(dailyStaffPool.userId, user.id),
          gte(dailyStaffPool.date, firstDay),
          lte(dailyStaffPool.date, lastDay)
        )
      );

    // Batch fetch room assignments for all pool entries
    let shifts: {
      date: string;
      role: string;
      roomAssignments: { roomName: string; saalBegin: string | null; saalEnd: string | null }[];
    }[] = [];

    if (poolEntries.length > 0) {
      const poolIds = poolEntries.map(e => e.id);

      const allRoomAssignments = await db
        .select({
          dailyStaffPoolId: dailyRoomStaff.dailyStaffPoolId,
          surgeryRoomId: dailyRoomStaff.surgeryRoomId,
          roomName: surgeryRooms.name,
          date: dailyRoomStaff.date,
        })
        .from(dailyRoomStaff)
        .innerJoin(surgeryRooms, eq(dailyRoomStaff.surgeryRoomId, surgeryRooms.id))
        .where(inArray(dailyRoomStaff.dailyStaffPoolId, poolIds));

      // Aggregate surgery times per room+date for Saal begin/end
      const uniqueRoomIds = [...new Set(allRoomAssignments.map(r => r.surgeryRoomId))];
      const saalTimesMap = new Map<string, { saalBegin: string | null; saalEnd: string | null }>();

      if (uniqueRoomIds.length > 0) {
        const saalRows = await db
          .select({
            surgeryRoomId: surgeries.surgeryRoomId,
            dateStr: sql<string>`DATE(${surgeries.plannedDate} AT TIME ZONE ${tz})`.as("date_str"),
            firstStart: min(surgeries.plannedDate).as("first_start"),
            lastEnd: max(surgeries.actualEndTime).as("last_end"),
            missingEndCount: sql<number>`COUNT(*) FILTER (WHERE ${surgeries.actualEndTime} IS NULL)`.as("missing_end_count"),
          })
          .from(surgeries)
          .where(
            and(
              eq(surgeries.hospitalId, link.hospitalId),
              eq(surgeries.isArchived, false),
              eq(surgeries.isSuspended, false),
              ne(surgeries.status, "cancelled"),
              gte(surgeries.plannedDate, new Date(firstDay)),
              lte(surgeries.plannedDate, new Date(lastDay + "T23:59:59")),
              inArray(surgeries.surgeryRoomId, uniqueRoomIds)
            )
          )
          .groupBy(surgeries.surgeryRoomId, sql`2`);

        for (const row of saalRows) {
          const key = `${row.dateStr}|${row.surgeryRoomId}`;
          const firstStart = row.firstStart ? new Date(row.firstStart) : null;
          const lastEnd = row.lastEnd ? new Date(row.lastEnd) : null;

          let saalBegin: string | null = null;
          let saalEnd: string | null = null;

          if (firstStart) {
            const begin = new Date(firstStart.getTime() - 60 * 60 * 1000);
            saalBegin = begin.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
          }
          if (lastEnd && Number(row.missingEndCount) === 0) {
            const end = new Date(lastEnd.getTime() + 60 * 60 * 1000);
            saalEnd = end.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
          }

          saalTimesMap.set(key, { saalBegin, saalEnd });
        }
      }

      // Group room assignments by pool entry ID
      const roomsByPoolId = new Map<string, typeof allRoomAssignments>();
      for (const ra of allRoomAssignments) {
        const list = roomsByPoolId.get(ra.dailyStaffPoolId) || [];
        list.push(ra);
        roomsByPoolId.set(ra.dailyStaffPoolId, list);
      }

      shifts = poolEntries.map(entry => {
        const rooms = roomsByPoolId.get(entry.id) || [];
        return {
          date: entry.date,
          role: entry.role,
          roomAssignments: rooms.map(r => {
            const times = saalTimesMap.get(`${r.date}|${r.surgeryRoomId}`);
            return {
              roomName: r.roomName,
              saalBegin: times?.saalBegin ?? null,
              saalEnd: times?.saalEnd ?? null,
            };
          }),
        };
      });
    }

    res.json({ shifts, userLinked: true });
  } catch (error) {
    logger.error("Error fetching planned shifts:", error);
    res.status(500).json({ message: "Failed to fetch planned shifts" });
  }
});

export default router;
