import { Router } from "express";
import type { Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, getUserUnitForHospital } from "../utils";
import { z } from "zod";
import { nanoid } from "nanoid";

const router = Router();

const generateLinkSchema = z.object({
  patientId: z.string().min(1, "Patient ID is required"),
  surgeryId: z.string().optional().nullable(),
  expiresInDays: z.number().min(1).max(30).default(7),
  language: z.enum(['en', 'de']).default('de'),
});

const saveProgressSchema = z.object({
  patientFirstName: z.string().optional(),
  patientLastName: z.string().optional(),
  patientBirthday: z.string().optional(),
  patientEmail: z.string().optional(),
  patientPhone: z.string().optional(),
  allergies: z.array(z.string()).optional(),
  allergiesNotes: z.string().optional(),
  medications: z.array(z.object({
    name: z.string(),
    dosage: z.string().optional(),
    frequency: z.string().optional(),
    reason: z.string().optional(),
  })).optional(),
  medicationsNotes: z.string().optional(),
  conditions: z.record(z.object({
    checked: z.boolean(),
    notes: z.string().optional(),
  })).optional(),
  smokingStatus: z.string().optional(),
  smokingDetails: z.string().optional(),
  alcoholStatus: z.string().optional(),
  alcoholDetails: z.string().optional(),
  height: z.string().optional(),
  weight: z.string().optional(),
  previousSurgeries: z.string().optional(),
  previousAnesthesiaProblems: z.string().optional(),
  pregnancyStatus: z.string().optional(),
  breastfeeding: z.boolean().optional(),
  womanHealthNotes: z.string().optional(),
  additionalNotes: z.string().optional(),
  questionsForDoctor: z.string().optional(),
  currentStep: z.number().optional(),
  completedSteps: z.array(z.string()).optional(),
});

const submitQuestionnaireSchema = saveProgressSchema;

const createReviewSchema = z.object({
  mappings: z.record(z.string(), z.object({
    patientValue: z.string(),
    professionalField: z.string(),
    professionalValue: z.any().default(null),
    notes: z.string().optional(),
  })).optional().nullable(),
  reviewNotes: z.string().optional(),
  preOpAssessmentId: z.string().optional().nullable(),
  status: z.enum(['pending', 'partial', 'completed']).optional(),
});

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
}

// ========== AUTHENTICATED ROUTES (for staff) ==========

// Generate a questionnaire link for a patient
router.post('/api/questionnaire/generate-link', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const parsed = generateLinkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { patientId, surgeryId, expiresInDays, language } = parsed.data;

    // Verify patient exists
    const patient = await storage.getPatient(patientId);
    if (!patient || patient.hospitalId !== hospitalId) {
      return res.status(404).json({ message: "Patient not found" });
    }

    // Generate unique token
    const token = nanoid(32);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const link = await storage.createQuestionnaireLink({
      token,
      hospitalId,
      patientId,
      surgeryId: surgeryId || null,
      createdBy: req.user.id,
      expiresAt,
      status: 'pending',
      language,
    });

    // Generate full URL
    const baseUrl = process.env.PUBLIC_URL || `https://${req.headers.host}`;
    const questionnaireUrl = `${baseUrl}/questionnaire/${token}`;

    res.json({ 
      link, 
      url: questionnaireUrl,
      expiresAt,
    });
  } catch (error) {
    console.error("Error generating questionnaire link:", error);
    res.status(500).json({ message: "Failed to generate questionnaire link" });
  }
});

// Get all questionnaire links for a patient
router.get('/api/questionnaire/patient/:patientId/links', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { patientId } = req.params;
    const links = await storage.getQuestionnaireLinksForPatient(patientId);
    
    // Filter to only links for this hospital
    const hospitalLinks = links.filter(l => l.hospitalId === hospitalId);
    
    res.json(hospitalLinks);
  } catch (error) {
    console.error("Error fetching questionnaire links:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire links" });
  }
});

// Get all submitted questionnaire responses for hospital
router.get('/api/questionnaire/responses', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const status = req.query.status as string | undefined;
    const responses = await storage.getQuestionnaireResponsesForHospital(hospitalId, status);
    
    // Enrich with patient data
    const enrichedResponses = await Promise.all(
      responses.map(async (response) => {
        const patient = response.link.patientId 
          ? await storage.getPatient(response.link.patientId)
          : null;
        return {
          ...response,
          patient: patient ? {
            id: patient.id,
            firstName: patient.firstName,
            surname: patient.surname,
            patientNumber: patient.patientNumber,
            birthday: patient.birthday,
          } : null
        };
      })
    );
    
    res.json(enrichedResponses);
  } catch (error) {
    console.error("Error fetching questionnaire responses:", error);
    res.status(500).json({ message: "Failed to fetch questionnaire responses" });
  }
});

// Get response details (for staff review)
router.get('/api/questionnaire/responses/:responseId', isAuthenticated, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { responseId } = req.params;
    const response = await storage.getQuestionnaireResponse(responseId);
    
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    // Get all hospital links to verify access
    const linkData = await storage.getQuestionnaireLinksForHospital(hospitalId);
    const matchingLink = linkData.find(l => l.id === response.linkId);
    
    if (!matchingLink || matchingLink.hospitalId !== hospitalId) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Get uploads
    const uploads = await storage.getQuestionnaireUploads(responseId);
    
    // Get review if exists
    const review = await storage.getQuestionnaireReview(responseId);
    
    // Get patient data
    const patient = matchingLink.patientId 
      ? await storage.getPatient(matchingLink.patientId)
      : null;

    res.json({
      response,
      link: matchingLink,
      uploads,
      review,
      patient: patient ? {
        id: patient.id,
        firstName: patient.firstName,
        surname: patient.surname,
        patientNumber: patient.patientNumber,
        birthday: patient.birthday,
        sex: patient.sex,
      } : null
    });
  } catch (error) {
    console.error("Error fetching response details:", error);
    res.status(500).json({ message: "Failed to fetch response details" });
  }
});

// Save review/mapping of questionnaire data
router.post('/api/questionnaire/responses/:responseId/review', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { responseId } = req.params;
    const response = await storage.getQuestionnaireResponse(responseId);
    
    if (!response) {
      return res.status(404).json({ message: "Response not found" });
    }

    const parsed = createReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
    }

    const { mappings, reviewNotes, preOpAssessmentId, status } = parsed.data;

    // Check if review already exists
    const existingReview = await storage.getQuestionnaireReview(responseId);
    
    // Type for mappings that matches the database schema
    type MappingsType = Record<string, {
      patientValue: string;
      professionalField: string;
      professionalValue: any;
      notes?: string;
    }>;

    if (existingReview) {
      // Update existing review
      const updated = await storage.updateQuestionnaireReview(existingReview.id, {
        mappings: (mappings || undefined) as MappingsType | undefined,
        reviewNotes,
        preOpAssessmentId,
        status: status || existingReview.status,
        completedAt: status === 'completed' ? new Date() : undefined,
      });
      return res.json(updated);
    }

    // Create new review
    const review = await storage.createQuestionnaireReview({
      responseId,
      reviewedBy: req.user.id,
      mappings: (mappings || undefined) as MappingsType | undefined,
      reviewNotes,
      preOpAssessmentId,
      status: status || 'pending',
    });

    res.json(review);
  } catch (error) {
    console.error("Error saving review:", error);
    res.status(500).json({ message: "Failed to save review" });
  }
});

// Invalidate/expire a questionnaire link
router.post('/api/questionnaire/links/:linkId/invalidate', isAuthenticated, requireWriteAccess, async (req: any, res: Response) => {
  try {
    const hospitalId = req.headers['x-hospital-id'] as string;
    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    const unitId = await getUserUnitForHospital(req.user.id, hospitalId);
    if (!unitId) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const { linkId } = req.params;
    await storage.invalidateQuestionnaireLink(linkId);
    
    res.json({ message: "Link invalidated successfully" });
  } catch (error) {
    console.error("Error invalidating link:", error);
    res.status(500).json({ message: "Failed to invalidate link" });
  }
});

// ========== PUBLIC ROUTES (for patients) ==========

// Helper to flatten illness lists into array
function flattenIllnessLists(illnessLists: Record<string, any[]> | null | undefined): any[] {
  if (!illnessLists) return [];
  const result: any[] = [];
  for (const category of Object.keys(illnessLists)) {
    const items = illnessLists[category];
    if (Array.isArray(items)) {
      for (const item of items) {
        result.push({ ...item, category });
      }
    }
  }
  return result;
}

// Get questionnaire form configuration (public)
router.get('/api/public/questionnaire/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    // Check if expired
    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This questionnaire link has expired" });
    }

    // Check status
    if (link.status === 'expired') {
      return res.status(410).json({ message: "This questionnaire link has been expired" });
    }
    
    if (link.status === 'submitted' || link.status === 'reviewed') {
      return res.status(410).json({ message: "This questionnaire has already been submitted" });
    }

    // Get patient basic info (limited fields for privacy) if linked to a patient
    let patient = null;
    if (link.patientId) {
      patient = await storage.getPatient(link.patientId);
    }

    // Get hospital settings for form configuration
    const hospitalSettings = await storage.getHospitalAnesthesiaSettings(link.hospitalId);

    // Get existing response if any (for resume capability)
    const existingResponse = await storage.getQuestionnaireResponseByLinkId(link.id);

    // Flatten illness lists and filter for patient-visible items
    const flatIllnessList = flattenIllnessLists(hospitalSettings?.illnessLists);
    const patientVisibleConditions = flatIllnessList
      .filter((item: any) => item.patientVisible !== false)
      .map((item: any) => ({
        id: item.id,
        label: item.patientLabel || item.label,
        helpText: item.patientHelpText,
        category: item.category,
      }));

    res.json({
      linkId: link.id,
      language: link.language,
      patientFirstName: patient?.firstName || existingResponse?.patientFirstName,
      patientSurname: patient?.surname || existingResponse?.patientLastName,
      patientBirthday: patient?.birthday || existingResponse?.patientBirthday,
      hospitalId: link.hospitalId,
      surgeryId: link.surgeryId,
      existingResponse: existingResponse ? {
        id: existingResponse.id,
        patientFirstName: existingResponse.patientFirstName,
        patientLastName: existingResponse.patientLastName,
        patientBirthday: existingResponse.patientBirthday,
        patientEmail: existingResponse.patientEmail,
        patientPhone: existingResponse.patientPhone,
        allergies: existingResponse.allergies,
        allergiesNotes: existingResponse.allergiesNotes,
        medications: existingResponse.medications,
        medicationsNotes: existingResponse.medicationsNotes,
        conditions: existingResponse.conditions,
        smokingStatus: existingResponse.smokingStatus,
        smokingDetails: existingResponse.smokingDetails,
        alcoholStatus: existingResponse.alcoholStatus,
        alcoholDetails: existingResponse.alcoholDetails,
        height: existingResponse.height,
        weight: existingResponse.weight,
        previousSurgeries: existingResponse.previousSurgeries,
        previousAnesthesiaProblems: existingResponse.previousAnesthesiaProblems,
        pregnancyStatus: existingResponse.pregnancyStatus,
        breastfeeding: existingResponse.breastfeeding,
        womanHealthNotes: existingResponse.womanHealthNotes,
        additionalNotes: existingResponse.additionalNotes,
        questionsForDoctor: existingResponse.questionsForDoctor,
        currentStep: existingResponse.currentStep,
        completedSteps: existingResponse.completedSteps,
      } : null,
      conditionsList: patientVisibleConditions,
      allergyList: hospitalSettings?.allergyList
        ?.filter((item: any) => item.patientVisible !== false)
        .map((item: any) => ({
          id: item.id,
          label: item.patientLabel || item.label,
          helpText: item.patientHelpText,
        })) || [],
    });
  } catch (error) {
    console.error("Error fetching questionnaire config:", error);
    res.status(500).json({ message: "Failed to load questionnaire" });
  }
});

// Save progress (public, auto-save)
router.post('/api/public/questionnaire/:token/save', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    // Check if can still be edited
    if (link.status === 'submitted' || link.status === 'expired' || link.status === 'reviewed') {
      return res.status(410).json({ message: "This questionnaire can no longer be edited" });
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This questionnaire link has expired" });
    }

    const parsed = saveProgressSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const data = parsed.data;

    // Check for existing response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);

    if (response) {
      // Update existing
      response = await storage.updateQuestionnaireResponse(response.id, {
        patientFirstName: data.patientFirstName ?? response.patientFirstName,
        patientLastName: data.patientLastName ?? response.patientLastName,
        patientBirthday: data.patientBirthday ?? response.patientBirthday,
        patientEmail: data.patientEmail ?? response.patientEmail,
        patientPhone: data.patientPhone ?? response.patientPhone,
        allergies: data.allergies ?? response.allergies,
        allergiesNotes: data.allergiesNotes ?? response.allergiesNotes,
        medications: data.medications ?? response.medications,
        medicationsNotes: data.medicationsNotes ?? response.medicationsNotes,
        conditions: data.conditions ?? response.conditions,
        smokingStatus: data.smokingStatus ?? response.smokingStatus,
        smokingDetails: data.smokingDetails ?? response.smokingDetails,
        alcoholStatus: data.alcoholStatus ?? response.alcoholStatus,
        alcoholDetails: data.alcoholDetails ?? response.alcoholDetails,
        height: data.height ?? response.height,
        weight: data.weight ?? response.weight,
        previousSurgeries: data.previousSurgeries ?? response.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems ?? response.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus ?? response.pregnancyStatus,
        breastfeeding: data.breastfeeding ?? response.breastfeeding,
        womanHealthNotes: data.womanHealthNotes ?? response.womanHealthNotes,
        additionalNotes: data.additionalNotes ?? response.additionalNotes,
        questionsForDoctor: data.questionsForDoctor ?? response.questionsForDoctor,
        currentStep: data.currentStep ?? response.currentStep,
        completedSteps: data.completedSteps ?? response.completedSteps,
        lastSavedAt: new Date(),
      });
    } else {
      // Create new response
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        patientFirstName: data.patientFirstName,
        patientLastName: data.patientLastName,
        patientBirthday: data.patientBirthday,
        patientEmail: data.patientEmail,
        patientPhone: data.patientPhone,
        allergies: data.allergies,
        allergiesNotes: data.allergiesNotes,
        medications: data.medications,
        medicationsNotes: data.medicationsNotes,
        conditions: data.conditions,
        smokingStatus: data.smokingStatus,
        smokingDetails: data.smokingDetails,
        alcoholStatus: data.alcoholStatus,
        alcoholDetails: data.alcoholDetails,
        height: data.height,
        weight: data.weight,
        previousSurgeries: data.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus,
        breastfeeding: data.breastfeeding,
        womanHealthNotes: data.womanHealthNotes,
        additionalNotes: data.additionalNotes,
        questionsForDoctor: data.questionsForDoctor,
        currentStep: data.currentStep ?? 0,
        completedSteps: data.completedSteps,
        lastSavedAt: new Date(),
      });
    }

    res.json({ 
      id: response.id,
      savedAt: response.lastSavedAt,
      currentStep: response.currentStep,
    });
  } catch (error) {
    console.error("Error saving progress:", error);
    res.status(500).json({ message: "Failed to save progress" });
  }
});

// Submit questionnaire (public)
router.post('/api/public/questionnaire/:token/submit', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    if (link.status === 'submitted' || link.status === 'reviewed') {
      return res.status(410).json({ message: "This questionnaire has already been submitted" });
    }

    if (link.status === 'expired' || (link.expiresAt && new Date() > new Date(link.expiresAt))) {
      return res.status(410).json({ message: "This questionnaire link has expired" });
    }

    const parsed = submitQuestionnaireSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
    }

    const data = parsed.data;

    // Get or create response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);

    if (response) {
      // Update with final data
      await storage.updateQuestionnaireResponse(response.id, {
        patientFirstName: data.patientFirstName ?? response.patientFirstName,
        patientLastName: data.patientLastName ?? response.patientLastName,
        patientBirthday: data.patientBirthday ?? response.patientBirthday,
        patientEmail: data.patientEmail ?? response.patientEmail,
        patientPhone: data.patientPhone ?? response.patientPhone,
        allergies: data.allergies ?? response.allergies,
        allergiesNotes: data.allergiesNotes ?? response.allergiesNotes,
        medications: data.medications ?? response.medications,
        medicationsNotes: data.medicationsNotes ?? response.medicationsNotes,
        conditions: data.conditions ?? response.conditions,
        smokingStatus: data.smokingStatus ?? response.smokingStatus,
        smokingDetails: data.smokingDetails ?? response.smokingDetails,
        alcoholStatus: data.alcoholStatus ?? response.alcoholStatus,
        alcoholDetails: data.alcoholDetails ?? response.alcoholDetails,
        height: data.height ?? response.height,
        weight: data.weight ?? response.weight,
        previousSurgeries: data.previousSurgeries ?? response.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems ?? response.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus ?? response.pregnancyStatus,
        breastfeeding: data.breastfeeding ?? response.breastfeeding,
        womanHealthNotes: data.womanHealthNotes ?? response.womanHealthNotes,
        additionalNotes: data.additionalNotes ?? response.additionalNotes,
        questionsForDoctor: data.questionsForDoctor ?? response.questionsForDoctor,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
      });
    } else {
      // Create new response with submitted data
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        patientFirstName: data.patientFirstName,
        patientLastName: data.patientLastName,
        patientBirthday: data.patientBirthday,
        patientEmail: data.patientEmail,
        patientPhone: data.patientPhone,
        allergies: data.allergies,
        allergiesNotes: data.allergiesNotes,
        medications: data.medications,
        medicationsNotes: data.medicationsNotes,
        conditions: data.conditions,
        smokingStatus: data.smokingStatus,
        smokingDetails: data.smokingDetails,
        alcoholStatus: data.alcoholStatus,
        alcoholDetails: data.alcoholDetails,
        height: data.height,
        weight: data.weight,
        previousSurgeries: data.previousSurgeries,
        previousAnesthesiaProblems: data.previousAnesthesiaProblems,
        pregnancyStatus: data.pregnancyStatus,
        breastfeeding: data.breastfeeding,
        womanHealthNotes: data.womanHealthNotes,
        additionalNotes: data.additionalNotes,
        questionsForDoctor: data.questionsForDoctor,
        currentStep: 0,
        userAgent: req.headers['user-agent'] || null,
        ipAddress: req.ip || null,
      });
    }

    // Submit the response
    const submitted = await storage.submitQuestionnaireResponse(response.id);

    res.json({ 
      message: "Questionnaire submitted successfully",
      submittedAt: submitted.submittedAt,
    });
  } catch (error) {
    console.error("Error submitting questionnaire:", error);
    res.status(500).json({ message: "Failed to submit questionnaire" });
  }
});

// Upload file attachment (public)
router.post('/api/public/questionnaire/:token/upload', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    if (link.status === 'submitted' || link.status === 'expired' || link.status === 'reviewed') {
      return res.status(410).json({ message: "Cannot upload files to this questionnaire" });
    }

    if (link.expiresAt && new Date() > new Date(link.expiresAt)) {
      return res.status(410).json({ message: "This questionnaire link has expired" });
    }

    // Get or create response
    let response = await storage.getQuestionnaireResponseByLinkId(link.id);
    if (!response) {
      // Create a minimal response to attach files to
      response = await storage.createQuestionnaireResponse({
        linkId: link.id,
        currentStep: 0,
      });
    }

    // Handle file upload (expect file URL from object storage)
    const { fileName, fileUrl, mimeType, fileSize, category, description } = req.body;

    if (!fileName || !fileUrl) {
      return res.status(400).json({ message: "fileName and fileUrl are required" });
    }

    // Validate category
    const validCategories = ['medication_list', 'diagnosis', 'exam_result', 'other'] as const;
    const uploadCategory = validCategories.includes(category) ? category : 'other';

    const upload = await storage.addQuestionnaireUpload({
      responseId: response.id,
      fileName,
      fileUrl,
      mimeType: mimeType || null,
      fileSize: fileSize || null,
      category: uploadCategory,
      description: description || null,
    });

    res.json({ 
      id: upload.id,
      fileName: upload.fileName,
      createdAt: upload.createdAt,
    });
  } catch (error) {
    console.error("Error uploading file:", error);
    res.status(500).json({ message: "Failed to upload file" });
  }
});

// Delete file attachment (public - only before submission)
router.delete('/api/public/questionnaire/:token/upload/:uploadId', async (req: Request, res: Response) => {
  try {
    const { token, uploadId } = req.params;
    
    const link = await storage.getQuestionnaireLinkByToken(token);
    if (!link) {
      return res.status(404).json({ message: "Questionnaire not found" });
    }

    if (link.status === 'submitted' || link.status === 'expired' || link.status === 'reviewed') {
      return res.status(410).json({ message: "Cannot modify this questionnaire" });
    }

    await storage.deleteQuestionnaireUpload(uploadId);

    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({ message: "Failed to delete file" });
  }
});

export default router;
