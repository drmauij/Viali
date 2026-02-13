import { Router } from "express";
import type { Request, Response } from "express";
import { storage, db } from "../storage";
import { isAuthenticated } from "../auth/google";
import { externalWorklogLinks, externalWorklogEntries, units, workerContracts } from "@shared/schema";
import { getActiveUnitIdFromRequest } from "../utils";
import { eq, and, desc } from "drizzle-orm";
import { ObjectStorageService } from "../objectStorage";
import crypto from "crypto";
import logger from "../logger";

const router = Router();

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
          hospital.name
        );
      }
    }
    
    res.json({ message: "If your email is registered, you will receive the link shortly." });
  } catch (error) {
    logger.error("Error resending worklog link:", error);
    res.status(500).json({ message: "Failed to process request" });
  }
});

// Get pending worklog entries for countersigning (authenticated)
router.get('/api/hospitals/:hospitalId/worklog/pending', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const unitId = getActiveUnitIdFromRequest(req);
    
    const entries = await storage.getPendingWorklogEntries(hospitalId, unitId);
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
    
    // Check if user is assigned to the entry's unit
    const userHospitals = await storage.getUserHospitals(userId);
    const hasUnitAccess = userHospitals.some(h => h.unitId === entry.unitId);
    
    if (!hasUnitAccess) {
      return res.status(403).json({ message: "You do not have permission to countersign entries for this unit" });
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
    
    // Check if user is assigned to the entry's unit
    const userHospitals = await storage.getUserHospitals(userId);
    const hasUnitAccess = userHospitals.some(h => h.unitId === entry.unitId);
    
    if (!hasUnitAccess) {
      return res.status(403).json({ message: "You do not have permission to reject entries for this unit" });
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

// Get all worklog links for the current unit (gets unitId from header)
router.get('/api/hospitals/:hospitalId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const unitId = getActiveUnitIdFromRequest(req);
    if (!unitId) {
      return res.status(400).json({ message: "Unit ID required" });
    }
    const links = await storage.getWorklogLinksByUnit(unitId);
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
    
    // Check if link already exists for this unit+email
    const existing = await storage.getExternalWorklogLinkByEmail(unitId, email);
    if (existing) {
      return res.status(409).json({ 
        message: "A link already exists for this email", 
        link: existing 
      });
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
        await sendWorklogLinkEmail(email, token, unit.name, hospital.name);
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
      await sendWorklogLinkEmail(link.email, link.token, unit.name, hospital.name);
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
    
    // Check if link already exists for this unit+email
    const existing = await storage.getExternalWorklogLinkByEmail(unitId, email);
    if (existing) {
      return res.status(409).json({ 
        message: "A link already exists for this email", 
        link: existing 
      });
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
        await sendWorklogLinkEmail(email, token, unit.name, hospital.name);
      }
    }
    
    res.status(201).json(link);
  } catch (error) {
    logger.error("Error creating worklog link:", error);
    res.status(500).json({ message: "Failed to create link" });
  }
});

// Get all worklog links for a unit (authenticated)
router.get('/api/hospitals/:hospitalId/units/:unitId/worklog/links', isAuthenticated, async (req: any, res) => {
  try {
    const { unitId } = req.params;
    const links = await storage.getWorklogLinksByUnit(unitId);
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

export default router;
