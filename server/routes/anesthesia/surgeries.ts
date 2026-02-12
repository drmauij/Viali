import { Router } from "express";
import type { Request } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import { sendSurgeryNoteMentionEmail } from "../../email";
import { sendSurgerySummaryEmail } from "../../resend";
import {
  insertCaseSchema,
  insertSurgerySchema,
  insertSurgeryPreOpAssessmentSchema,
} from "@shared/schema";
import { z } from "zod";
import { requireWriteAccess } from "../../utils";

const router = Router();

// ========== CASES ROUTES ==========

router.get('/api/anesthesia/cases', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, patientId, status } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const cases = await storage.getCases(hospitalId, patientId, status);
    
    res.json(cases);
  } catch (error) {
    console.error("Error fetching cases:", error);
    res.status(500).json({ message: "Failed to fetch cases" });
  }
});

router.get('/api/anesthesia/cases/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ message: "Case not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(caseData);
  } catch (error) {
    console.error("Error fetching case:", error);
    res.status(500).json({ message: "Failed to fetch case" });
  }
});

router.post('/api/anesthesia/cases', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertCaseSchema.parse(req.body);

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const newCase = await storage.createCase(validatedData);
    
    res.status(201).json(newCase);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating case:", error);
    res.status(500).json({ message: "Failed to create case" });
  }
});

router.patch('/api/anesthesia/cases/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const caseData = await storage.getCase(id);
    
    if (!caseData) {
      return res.status(404).json({ message: "Case not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === caseData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedCase = await storage.updateCase(id, req.body);
    
    res.json(updatedCase);
  } catch (error) {
    console.error("Error updating case:", error);
    res.status(500).json({ message: "Failed to update case" });
  }
});

// ========== SURGERIES ROUTES ==========

router.get('/api/anesthesia/surgeries', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, caseId, patientId, status, roomId, dateFrom, dateTo } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const filters: any = {};
    if (caseId) filters.caseId = caseId;
    if (patientId) filters.patientId = patientId;
    if (status) filters.status = status;
    if (roomId) filters.roomId = roomId;
    if (dateFrom) filters.dateFrom = new Date(dateFrom as string);
    if (dateTo) filters.dateTo = new Date(dateTo as string);

    const surgeries = await storage.getSurgeries(hospitalId as string, filters);
    
    const enrichedSurgeries = await Promise.all(
      surgeries.map(async (surgery) => {
        const anesthesiaRecord = await storage.getAnesthesiaRecord(surgery.id);
        return {
          ...surgery,
          timeMarkers: anesthesiaRecord?.timeMarkers || null,
        };
      })
    );
    
    res.json(enrichedSurgeries);
  } catch (error) {
    console.error("Error fetching surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

router.get('/api/anesthesia/surgeries/today/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));
    const endOfDay = new Date(today.setHours(23, 59, 59, 999));

    const surgeries = await storage.getSurgeries({
      hospitalId,
      dateFrom: startOfDay,
      dateTo: endOfDay,
    });

    const simpleSurgeries = surgeries.map(s => ({
      id: s.id,
      pacuBedId: s.pacuBedId,
      patientId: s.patientId,
      status: s.status,
    }));

    res.json(simpleSurgeries);
  } catch (error) {
    console.error("Error fetching today's surgeries:", error);
    res.status(500).json({ message: "Failed to fetch today's surgeries" });
  }
});

router.get('/api/anesthesia/surgeries/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Fetch surgeon details if surgeonId is present
    let surgeonPhone: string | null = null;
    if (surgery.surgeonId) {
      const surgeonUser = await storage.getUser(surgery.surgeonId);
      if (surgeonUser) {
        surgeonPhone = surgeonUser.phone || null;
      }
    }

    res.json({ ...surgery, surgeonPhone });
  } catch (error) {
    console.error("Error fetching surgery:", error);
    res.status(500).json({ message: "Failed to fetch surgery" });
  }
});

router.post('/api/anesthesia/surgeries', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;
    
    console.log("Received surgery creation request:", JSON.stringify(req.body, null, 2));

    const validatedData = insertSurgerySchema.parse(req.body);
    
    console.log("Validated surgery data:", JSON.stringify(validatedData, null, 2));

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const newSurgery = await storage.createSurgery(validatedData);
    
    (async () => {
      try {
        const { syncSingleSurgery } = await import("../../services/calcomSync");
        await syncSingleSurgery(newSurgery.id);
      } catch (err) {
        console.error(`Failed to sync surgery ${newSurgery.id} to Cal.com:`, err);
      }
    })();
    
    res.status(201).json(newSurgery);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error("Zod validation error:", JSON.stringify(error.errors, null, 2));
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating surgery:", error);
    res.status(500).json({ message: "Failed to create surgery" });
  }
});

router.patch('/api/anesthesia/surgeries/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updateData = { ...req.body };
    if (updateData.plannedDate && typeof updateData.plannedDate === 'string') {
      updateData.plannedDate = new Date(updateData.plannedDate);
    }
    if (updateData.actualEndTime && typeof updateData.actualEndTime === 'string') {
      updateData.actualEndTime = new Date(updateData.actualEndTime);
    }
    if (updateData.actualStartTime && typeof updateData.actualStartTime === 'string') {
      updateData.actualStartTime = new Date(updateData.actualStartTime);
    }
    if (updateData.admissionTime && typeof updateData.admissionTime === 'string') {
      updateData.admissionTime = new Date(updateData.admissionTime);
    }

    if (updateData.isSuspended === true && !surgery.isSuspended) {
      updateData.suspendedAt = new Date();
      updateData.suspendedBy = userId;
    } else if (updateData.isSuspended === false) {
      updateData.suspendedAt = null;
      updateData.suspendedBy = null;
      updateData.suspendedReason = null;
    }

    const updatedSurgery = await storage.updateSurgery(id, updateData);
    
    (async () => {
      try {
        const { syncSingleSurgery, deleteCalcomBlock } = await import("../../services/calcomSync");
        if (updatedSurgery.status === 'cancelled' || updatedSurgery.isArchived || updatedSurgery.isSuspended) {
          if (updatedSurgery.calcomBusyBlockUid) {
            await deleteCalcomBlock(updatedSurgery.calcomBusyBlockUid, updatedSurgery.hospitalId);
          }
        } else {
          await syncSingleSurgery(updatedSurgery.id);
        }
      } catch (err) {
        console.error(`Failed to sync surgery ${updatedSurgery.id} to Cal.com:`, err);
      }
    })();
    
    res.json(updatedSurgery);
  } catch (error) {
    console.error("Error updating surgery:", error);
    res.status(500).json({ message: "Failed to update surgery" });
  }
});

router.post('/api/anesthesia/surgeries/:id/archive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const archivedSurgery = await storage.archiveSurgery(id, userId);
    
    if (archivedSurgery.calcomBusyBlockUid) {
      (async () => {
        try {
          const { deleteCalcomBlock } = await import("../../services/calcomSync");
          await deleteCalcomBlock(archivedSurgery.calcomBusyBlockUid!, archivedSurgery.hospitalId);
        } catch (err) {
          console.error(`Failed to delete Cal.com block for archived surgery ${id}:`, err);
        }
      })();
    }
    
    res.json({ message: "Surgery archived successfully", surgery: archivedSurgery });
  } catch (error) {
    console.error("Error archiving surgery:", error);
    res.status(500).json({ message: "Failed to archive surgery" });
  }
});

router.post('/api/anesthesia/surgeries/:id/unarchive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const surgery = await storage.getSurgery(id);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const restoredSurgery = await storage.unarchiveSurgery(id);
    
    (async () => {
      try {
        const { syncSingleSurgery } = await import("../../services/calcomSync");
        await syncSingleSurgery(restoredSurgery.id);
      } catch (err) {
        console.error(`Failed to sync restored surgery ${id} to Cal.com:`, err);
      }
    })();
    
    res.json({ message: "Surgery restored successfully", surgery: restoredSurgery });
  } catch (error) {
    console.error("Error restoring surgery:", error);
    res.status(500).json({ message: "Failed to restore surgery" });
  }
});

// ========== SURGERY NOTES ROUTES ==========

router.get('/api/anesthesia/surgeries/:surgeryId/notes', isAuthenticated, async (req: any, res) => {
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

    const notes = await storage.getSurgeryNotes(surgeryId);
    res.json(notes);
  } catch (error) {
    console.error("Error fetching surgery notes:", error);
    res.status(500).json({ message: "Failed to fetch surgery notes" });
  }
});

router.post('/api/anesthesia/surgeries/:surgeryId/notes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: "Note content is required" });
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

    const newNote = await storage.createSurgeryNote({
      surgeryId,
      authorId: userId,
      content: content.trim(),
    });

    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentions: string[] = [];
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[2]);
    }

    if (mentions.length > 0) {
      const author = await storage.getUser(userId);
      const authorName = author?.firstName && author?.lastName 
        ? `${author.firstName} ${author.lastName}` 
        : author?.email || 'A team member';

      const patient = surgery.patientId ? await storage.getPatient(surgery.patientId) : null;
      const patientName = patient 
        ? `${patient.firstName || ''} ${patient.surname || ''}`.trim() || patient.patientNumber || 'Unknown'
        : 'Unknown Patient';

      for (const mentionedUserId of mentions) {
        if (mentionedUserId !== userId) {
          const mentionedUser = await storage.getUser(mentionedUserId);
          if (mentionedUser?.email) {
            sendSurgeryNoteMentionEmail(
              mentionedUser.email,
              authorName,
              content.trim(),
              patientName,
              surgery.plannedSurgery || 'Surgery'
            ).catch(err => console.error('[Email] Failed to send surgery note mention:', err));
          }
        }
      }
    }

    const notes = await storage.getSurgeryNotes(surgeryId);
    const noteWithAuthor = notes.find(n => n.id === newNote.id);
    
    res.status(201).json(noteWithAuthor || newNote);
  } catch (error) {
    console.error("Error creating surgery note:", error);
    res.status(500).json({ message: "Failed to create surgery note" });
  }
});

router.patch('/api/anesthesia/surgery-notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ message: "Note content is required" });
    }

    const updatedNote = await storage.updateSurgeryNote(noteId, content.trim());
    res.json(updatedNote);
  } catch (error) {
    console.error("Error updating surgery note:", error);
    res.status(500).json({ message: "Failed to update surgery note" });
  }
});

router.delete('/api/anesthesia/surgery-notes/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { noteId } = req.params;
    await storage.deleteSurgeryNote(noteId);
    res.json({ message: "Note deleted successfully" });
  } catch (error) {
    console.error("Error deleting surgery note:", error);
    res.status(500).json({ message: "Failed to delete surgery note" });
  }
});

// ========== PACU ROUTES ==========

router.get('/api/anesthesia/pacu/:hospitalId', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.params;
    const userId = req.user.id;

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const pacuPatients = await storage.getPacuPatients(hospitalId);
    
    res.json(pacuPatients);
  } catch (error) {
    console.error("Error fetching PACU patients:", error);
    res.status(500).json({ message: "Failed to fetch PACU patients" });
  }
});

// ========== SURGERY PRE-OP ASSESSMENT ROUTES (Surgery Module) ==========

router.get('/api/surgery/preop-assessments/bulk', isAuthenticated, async (req: any, res) => {
  try {
    const { surgeryIds } = req.query;
    const userId = req.user.id;

    if (!surgeryIds) {
      return res.json([]);
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hospitalIds = hospitals.map(h => h.id);

    const surgeryIdArray = (surgeryIds as string).split(',');
    
    const assessments = await storage.getSurgeryPreOpAssessmentsBySurgeryIds(surgeryIdArray, hospitalIds);
    
    res.json(assessments);
  } catch (error) {
    console.error("Error fetching bulk surgery pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch surgery pre-op assessments" });
  }
});

router.get('/api/surgery/preop', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const assessments = await storage.getSurgeryPreOpAssessments(hospitalId as string);
    
    res.json(assessments);
  } catch (error) {
    console.error("Error fetching surgery pre-op assessments:", error);
    res.status(500).json({ message: "Failed to fetch surgery pre-op assessments" });
  }
});

router.get('/api/surgery/preop/surgery/:surgeryId', isAuthenticated, async (req: any, res) => {
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

    const assessment = await storage.getSurgeryPreOpAssessment(surgeryId);
    
    res.json(assessment || null);
  } catch (error) {
    console.error("Error fetching surgery pre-op assessment:", error);
    res.status(500).json({ message: "Failed to fetch surgery pre-op assessment" });
  }
});

router.post('/api/surgery/preop', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertSurgeryPreOpAssessmentSchema.parse(req.body);

    const surgery = await storage.getSurgery(validatedData.surgeryId);
    
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const newAssessment = await storage.createSurgeryPreOpAssessment(validatedData);
    
    res.status(201).json(newAssessment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    console.error("Error creating surgery pre-op assessment:", error);
    res.status(500).json({ message: "Failed to create surgery pre-op assessment" });
  }
});

router.patch('/api/surgery/preop/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const assessment = await storage.getSurgeryPreOpAssessmentById(id);
    
    if (!assessment) {
      return res.status(404).json({ message: "Surgery pre-op assessment not found" });
    }

    const surgery = await storage.getSurgery(assessment.surgeryId);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updatedAssessment = await storage.updateSurgeryPreOpAssessment(id, req.body);
    
    res.json(updatedAssessment);
  } catch (error) {
    console.error("Error updating surgery pre-op assessment:", error);
    res.status(500).json({ message: "Failed to update surgery pre-op assessment" });
  }
});

router.post('/api/anesthesia/surgeries/:id/send-summary', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    const bodySchema = z.object({
      toEmail: z.string().email(),
      pdfBase64: z.string().min(1),
      patientName: z.string(),
      procedureName: z.string(),
      surgeryDate: z.string(),
      language: z.enum(['de', 'en']).optional().default('en'),
    });

    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request body", errors: parsed.error.errors });
    }

    const surgery = await storage.getSurgery(id);
    if (!surgery) {
      return res.status(404).json({ message: "Surgery not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === surgery.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const { toEmail, pdfBase64, patientName, procedureName, surgeryDate, language } = parsed.data;

    const result = await sendSurgerySummaryEmail(
      toEmail,
      patientName,
      procedureName,
      surgeryDate,
      pdfBase64,
      language,
    );

    if (result.success) {
      res.json({ success: true, message: "Surgery summary sent successfully" });
    } else {
      res.status(500).json({ success: false, message: "Failed to send email", error: result.error });
    }
  } catch (error) {
    console.error("Error sending surgery summary email:", error);
    res.status(500).json({ message: "Failed to send surgery summary email" });
  }
});

export default router;
