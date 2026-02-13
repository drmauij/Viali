import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import { insertPatientSchema } from "@shared/schema";
import { z } from "zod";
import { requireWriteAccess } from "../../utils";
import { sendSms, isSmsConfigured, isSmsConfiguredForHospital } from "../../sms";
import logger from "../../logger";

const router = Router();

router.get('/api/patients', isAuthenticated, async (req: any, res) => {
  try {
    const { hospitalId, search } = req.query;
    const userId = req.user.id;

    if (!hospitalId) {
      return res.status(400).json({ message: "hospitalId is required" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    const patients = await storage.getPatients(hospitalId as string, search as string | undefined);
    
    res.json(patients);
  } catch (error) {
    logger.error("Error fetching patients:", error);
    res.status(500).json({ message: "Failed to fetch patients" });
  }
});

router.get('/api/patients/:id', isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(patient);
  } catch (error) {
    logger.error("Error fetching patient:", error);
    res.status(500).json({ message: "Failed to fetch patient" });
  }
});

router.post('/api/patients', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const userId = req.user.id;

    const validatedData = insertPatientSchema.parse(req.body);

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === validatedData.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied to this hospital" });
    }

    let patientNumber = validatedData.patientNumber;
    if (!patientNumber) {
      patientNumber = await storage.generatePatientNumber(validatedData.hospitalId);
    }

    const patient = await storage.createPatient({
      ...validatedData,
      patientNumber,
      createdBy: userId,
    });
    
    res.status(201).json(patient);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Invalid data", errors: error.errors });
    }
    logger.error("Error creating patient:", error);
    res.status(500).json({ message: "Failed to create patient" });
  }
});

router.patch('/api/patients/:id', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingPatient = await storage.getPatient(id);
    
    if (!existingPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.updatePatient(id, req.body);
    
    res.json(patient);
  } catch (error) {
    logger.error("Error updating patient:", error);
    res.status(500).json({ message: "Failed to update patient" });
  }
});

router.post('/api/patients/:id/archive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingPatient = await storage.getPatient(id);
    
    if (!existingPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.archivePatient(id, userId);
    
    res.json({ message: "Patient archived successfully", patient });
  } catch (error) {
    logger.error("Error archiving patient:", error);
    res.status(500).json({ message: "Failed to archive patient" });
  }
});

router.post('/api/patients/:id/unarchive', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const existingPatient = await storage.getPatient(id);
    
    if (!existingPatient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === existingPatient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const patient = await storage.unarchivePatient(id);
    
    res.json({ message: "Patient restored successfully", patient });
  } catch (error) {
    logger.error("Error restoring patient:", error);
    res.status(500).json({ message: "Failed to restore patient" });
  }
});

// ========== PATIENT CARD IMAGE ROUTES ==========

// Generate upload URL for patient card images (ID card, insurance card)
router.post('/api/patients/:id/card-image/upload-url', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { cardType, side, filename, contentType } = req.body;
    const userId = req.user.id;

    // Validate cardType and side
    if (!['id_card', 'insurance_card'].includes(cardType)) {
      return res.status(400).json({ message: "Invalid card type. Must be 'id_card' or 'insurance_card'" });
    }
    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side. Must be 'front' or 'back'" });
    }

    const patient = await storage.getPatient(id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { randomUUID } = await import("crypto");

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : 'jpg';
    const objectName = `${objectId}.${extension}`;
    const key = `patient-cards/${patient.hospitalId}/${id}/${cardType}_${side}_${objectName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'image/jpeg',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    res.json({
      uploadUrl,
      storageKey: `/objects/${key}`,
      key,
    });
  } catch (error) {
    logger.error("Error generating card image upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

// Update patient card image URL after upload
router.patch('/api/patients/:id/card-image', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { cardType, side, imageUrl } = req.body;
    const userId = req.user.id;

    // Validate cardType and side
    if (!['id_card', 'insurance_card'].includes(cardType)) {
      return res.status(400).json({ message: "Invalid card type. Must be 'id_card' or 'insurance_card'" });
    }
    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side. Must be 'front' or 'back'" });
    }

    const patient = await storage.getPatient(id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Map cardType + side to field name
    const fieldMap: Record<string, string> = {
      'id_card_front': 'idCardFrontUrl',
      'id_card_back': 'idCardBackUrl',
      'insurance_card_front': 'insuranceCardFrontUrl',
      'insurance_card_back': 'insuranceCardBackUrl',
    };
    const fieldName = fieldMap[`${cardType}_${side}`];

    const updatedPatient = await storage.updatePatient(id, { [fieldName]: imageUrl });
    res.json(updatedPatient);
  } catch (error) {
    logger.error("Error updating patient card image:", error);
    res.status(500).json({ message: "Failed to update card image" });
  }
});

// Delete patient card image
router.delete('/api/patients/:id/card-image', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { cardType, side } = req.body;
    const userId = req.user.id;

    // Validate cardType and side
    if (!['id_card', 'insurance_card'].includes(cardType)) {
      return res.status(400).json({ message: "Invalid card type. Must be 'id_card' or 'insurance_card'" });
    }
    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side. Must be 'front' or 'back'" });
    }

    const patient = await storage.getPatient(id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Map cardType + side to field name
    const fieldMap: Record<string, string> = {
      'id_card_front': 'idCardFrontUrl',
      'id_card_back': 'idCardBackUrl',
      'insurance_card_front': 'insuranceCardFrontUrl',
      'insurance_card_back': 'insuranceCardBackUrl',
    };
    const fieldName = fieldMap[`${cardType}_${side}`];
    const currentUrl = (patient as any)[fieldName];

    // Delete from S3 if exists
    if (currentUrl && currentUrl.startsWith('/objects/')) {
      try {
        const { ObjectStorageService } = await import('../../objectStorage');
        const objectStorageService = new ObjectStorageService();
        if (objectStorageService.isConfigured()) {
          await objectStorageService.deleteObject(currentUrl);
        }
      } catch (deleteError) {
        logger.error("Error deleting card image from storage:", deleteError);
        // Continue anyway - clear the reference
      }
    }

    const updatedPatient = await storage.updatePatient(id, { [fieldName]: null });
    res.json(updatedPatient);
  } catch (error) {
    logger.error("Error deleting patient card image:", error);
    res.status(500).json({ message: "Failed to delete card image" });
  }
});

// Get download URL for patient card image
router.get('/api/patients/:id/card-image/:cardType/:side', isAuthenticated, async (req: any, res) => {
  try {
    const { id, cardType, side } = req.params;
    const userId = req.user.id;

    // Validate cardType and side
    if (!['id_card', 'insurance_card'].includes(cardType)) {
      return res.status(400).json({ message: "Invalid card type" });
    }
    if (!['front', 'back'].includes(side)) {
      return res.status(400).json({ message: "Invalid side" });
    }

    const patient = await storage.getPatient(id);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Map cardType + side to field name
    const fieldMap: Record<string, string> = {
      'id_card_front': 'idCardFrontUrl',
      'id_card_back': 'idCardBackUrl',
      'insurance_card_front': 'insuranceCardFrontUrl',
      'insurance_card_back': 'insuranceCardBackUrl',
    };
    const fieldName = fieldMap[`${cardType}_${side}`];
    const storageUrl = (patient as any)[fieldName];

    if (!storageUrl) {
      return res.status(404).json({ message: "Card image not found" });
    }

    // Generate signed download URL
    const { ObjectStorageService } = await import('../../objectStorage');
    const objectStorageService = new ObjectStorageService();
    
    if (!objectStorageService.isConfigured()) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const downloadUrl = await objectStorageService.getObjectDownloadURL(storageUrl, 3600);
    res.json({ downloadUrl, storageUrl });
  } catch (error) {
    logger.error("Error getting card image download URL:", error);
    res.status(500).json({ message: "Failed to get download URL" });
  }
});

// ========== PATIENT DOCUMENT ROUTES (Staff uploads) ==========

router.get('/api/patients/:id/documents', isAuthenticated, async (req: any, res) => {
  const startTime = Date.now();
  const { id } = req.params;
  const userId = req.user?.id;
  
  logger.info(`[Documents] Starting fetch for patient ${id}, user ${userId}`);
  
  try {
    const patient = await storage.getPatient(id);
    logger.info(`[Documents] getPatient took ${Date.now() - startTime}ms`);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    logger.info(`[Documents] getUserHospitals took ${Date.now() - startTime}ms total`);
    
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const staffDocuments = await storage.getPatientDocuments(id);
    logger.info(`[Documents] getPatientDocuments returned ${staffDocuments.length} docs, took ${Date.now() - startTime}ms total`);

    const questionnaireLinks = await storage.getQuestionnaireLinksForPatient(id);
    logger.info(`[Documents] getQuestionnaireLinks returned ${questionnaireLinks.length} links, took ${Date.now() - startTime}ms total`);
    
    const questionnaireDocuments: any[] = [];
    
    const submittedLinks = questionnaireLinks.filter(link => link.response && link.status === 'submitted');
    
    for (const link of submittedLinks) {
      try {
        const response = await storage.getQuestionnaireResponse(link.response!.id);
        if (response) {
          const uploads = await storage.getQuestionnaireUploads(response.id);
          for (const upload of uploads) {
            questionnaireDocuments.push({
              id: `questionnaire-${upload.id}`,
              hospitalId: patient.hospitalId,
              patientId: id,
              category: upload.category || 'other',
              fileName: upload.fileName,
              fileUrl: upload.fileUrl,
              mimeType: upload.mimeType,
              fileSize: upload.fileSize,
              description: upload.description,
              uploadedBy: null,
              source: 'questionnaire',
              reviewed: upload.reviewed || false,
              questionnaireUploadId: upload.id,
              createdAt: upload.createdAt,
            });
          }
        }
      } catch (linkError) {
        logger.error(`[Documents] Error processing questionnaire link ${link.id}:`, linkError);
      }
    }
    
    logger.info(`[Documents] Processed ${submittedLinks.length} questionnaire links, found ${questionnaireDocuments.length} uploads, took ${Date.now() - startTime}ms total`);

    const allDocuments = [...staffDocuments, ...questionnaireDocuments].sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    logger.info(`[Documents] Returning ${allDocuments.length} total documents, took ${Date.now() - startTime}ms total`);
    res.json(allDocuments);
  } catch (error: any) {
    logger.error(`[Documents] Error after ${Date.now() - startTime}ms:`, error);
    logger.error("[Documents] Patient ID:", id, "User ID:", userId);
    res.status(500).json({ 
      message: "Failed to fetch patient documents",
      error: error?.message || String(error)
    });
  }
});

router.post('/api/patients/:id/documents/upload-url', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { filename, contentType } = req.body;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const { randomUUID } = await import("crypto");

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `patient-documents/${patient.hospitalId}/${id}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    res.json({
      uploadUrl,
      storageKey: `/objects/${key}`,
      key,
    });
  } catch (error) {
    logger.error("Error generating upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

router.post('/api/patients/:id/documents', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { category, fileName, fileUrl, mimeType, fileSize, description } = req.body;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const document = await storage.createPatientDocument({
      hospitalId: patient.hospitalId,
      patientId: id,
      category: category || 'other',
      fileName,
      fileUrl,
      mimeType,
      fileSize,
      description,
      uploadedBy: userId,
    });

    res.status(201).json(document);
  } catch (error: any) {
    logger.error("Error creating patient document:", error);
    logger.error("Document data:", { category, fileName, fileUrl, mimeType, fileSize, description });
    res.status(500).json({ 
      message: "Failed to create patient document",
      error: error?.message || String(error)
    });
  }
});

router.patch('/api/patients/:id/documents/:docId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id, docId } = req.params;
    const { description, reviewed } = req.body;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const updateData: { description?: string; reviewed?: boolean } = {};
    if (description !== undefined) updateData.description = description;
    if (reviewed !== undefined) updateData.reviewed = reviewed;

    if (docId.startsWith('questionnaire-')) {
      const uploadId = docId.replace('questionnaire-', '');
      const upload = await storage.getQuestionnaireUploadById(uploadId);
      
      if (!upload) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      const response = await storage.getQuestionnaireResponse(upload.responseId);
      if (!response) {
        return res.status(404).json({ message: "Document not found" });
      }
      const link = await storage.getQuestionnaireLink(response.linkId);
      if (!link || link.patientId !== id) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      const updated = await storage.updateQuestionnaireUpload(uploadId, updateData);
      res.json({
        id: `questionnaire-${updated.id}`,
        hospitalId: patient.hospitalId,
        patientId: id,
        category: updated.category || 'other',
        fileName: updated.fileName,
        fileUrl: updated.fileUrl,
        mimeType: updated.mimeType,
        fileSize: updated.fileSize,
        description: updated.description,
        uploadedBy: null,
        source: 'questionnaire',
        reviewed: updated.reviewed || false,
        questionnaireUploadId: updated.id,
        createdAt: updated.createdAt,
      });
      return;
    }

    const document = await storage.getPatientDocument(docId);
    
    if (!document || document.patientId !== id) {
      return res.status(404).json({ message: "Document not found" });
    }

    const updated = await storage.updatePatientDocument(docId, updateData);
    res.json(updated);
  } catch (error) {
    logger.error("Error updating patient document:", error);
    res.status(500).json({ message: "Failed to update patient document" });
  }
});

router.delete('/api/patients/:id/documents/:docId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id, docId } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const document = await storage.getPatientDocument(docId);
    
    if (!document || document.patientId !== id) {
      return res.status(404).json({ message: "Document not found" });
    }

    try {
      const endpoint = process.env.S3_ENDPOINT;
      const accessKeyId = process.env.S3_ACCESS_KEY;
      const secretAccessKey = process.env.S3_SECRET_KEY;
      const bucket = process.env.S3_BUCKET;
      const region = process.env.S3_REGION || "ch-dk-2";

      if (endpoint && accessKeyId && secretAccessKey && bucket && document.fileUrl) {
        const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
        
        const s3Client = new S3Client({
          endpoint,
          region,
          credentials: { accessKeyId, secretAccessKey },
          forcePathStyle: true,
        });

        let key = document.fileUrl;
        if (key.startsWith("/objects/")) {
          key = key.slice("/objects/".length);
        }

        await s3Client.send(new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }));
      }
    } catch (s3Error) {
      logger.error("Error deleting file from S3:", s3Error);
    }

    await storage.deletePatientDocument(docId);

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    logger.error("Error deleting patient document:", error);
    res.status(500).json({ message: "Failed to delete patient document" });
  }
});

router.get('/api/patients/:id/documents/:docId/file', isAuthenticated, async (req: any, res) => {
  try {
    const { id, docId } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(id);
    
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    let fileUrl: string;
    let mimeType: string | null = null;
    let fileName: string;

    if (docId.startsWith('questionnaire-')) {
      const uploadId = docId.replace('questionnaire-', '');
      const upload = await storage.getQuestionnaireUploadById(uploadId);
      
      if (!upload) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      const response = await storage.getQuestionnaireResponse(upload.responseId);
      if (!response) {
        return res.status(404).json({ message: "Document not found" });
      }
      const link = await storage.getQuestionnaireLink(response.linkId);
      if (!link || link.patientId !== id) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      fileUrl = upload.fileUrl;
      mimeType = upload.mimeType;
      fileName = upload.fileName;
    } else {
      const document = await storage.getPatientDocument(docId);
      
      if (!document || document.patientId !== id) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      fileUrl = document.fileUrl;
      mimeType = document.mimeType || null;
      fileName = document.fileName;
    }

    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY;
    const secretAccessKey = process.env.S3_SECRET_KEY;
    const bucket = process.env.S3_BUCKET;
    const region = process.env.S3_REGION || "ch-dk-2";

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      return res.status(500).json({ message: "Object storage not configured" });
    }

    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { Readable } = await import("stream");

    const s3Client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    let key = fileUrl;
    if (key.startsWith("/objects/")) {
      key = key.slice("/objects/".length);
    }

    const response = await s3Client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    res.set({
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename="${fileName}"`,
      "Cache-Control": "private, max-age=3600",
    });

    if (response.ContentLength) {
      res.set("Content-Length", response.ContentLength.toString());
    }

    if (response.Body instanceof Readable) {
      response.Body.pipe(res);
    } else if (response.Body) {
      const webStream = response.Body as ReadableStream;
      const nodeStream = Readable.fromWeb(webStream as any);
      nodeStream.pipe(res);
    } else {
      res.status(500).json({ message: "Error streaming file" });
    }
  } catch (error: any) {
    logger.error("Error streaming patient document:", error);
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ message: "File not found in storage" });
    } else if (!res.headersSent) {
      res.status(500).json({ message: "Failed to stream document" });
    }
  }
});

router.get('/api/patients/:id/info-flyers', isAuthenticated, async (req: any, res) => {
  try {
    const { id: patientId } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const surgeries = await storage.getSurgeries(patient.hospitalId, { patientId });
    const upcomingSurgery = surgeries.find(s => 
      s.status !== 'completed' && s.status !== 'cancelled' && 
      new Date(s.plannedDate!) > new Date()
    );

    const flyers: Array<{ unitName: string; unitType: string | null; flyerUrl: string; downloadUrl?: string }> = [];

    if (upcomingSurgery && upcomingSurgery.surgeryRoomId) {
      const room = await storage.getSurgeryRoomById(upcomingSurgery.surgeryRoomId);
      if (room && room.unitId) {
        const unit = await storage.getUnit(room.unitId);
        if (unit && unit.infoFlyerUrl) {
          flyers.push({
            unitName: unit.name,
            unitType: unit.type,
            flyerUrl: unit.infoFlyerUrl,
          });
        }
      }
    }

    const hospitalUnits = await storage.getUnits(patient.hospitalId);
    // Check for anesthesia unit by type
    const anesthesiaUnit = hospitalUnits.find(u => u.type === 'anesthesia' && u.infoFlyerUrl);
    if (anesthesiaUnit && !flyers.some(f => f.flyerUrl === anesthesiaUnit.infoFlyerUrl)) {
      flyers.push({
        unitName: anesthesiaUnit.name,
        unitType: anesthesiaUnit.type,
        flyerUrl: anesthesiaUnit.infoFlyerUrl!,
      });
    }

    const { ObjectStorageService } = await import('../../objectStorage');
    const objectStorageService = new ObjectStorageService();

    const flyersWithUrls = await Promise.all(
      flyers.map(async (flyer) => {
        try {
          if (objectStorageService.isConfigured() && flyer.flyerUrl.startsWith('/objects/')) {
            const downloadUrl = await objectStorageService.getObjectDownloadURL(flyer.flyerUrl, 86400);
            return { ...flyer, downloadUrl };
          }
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        } catch (error) {
          logger.error(`Error getting download URL for ${flyer.flyerUrl}:`, error);
          return { ...flyer, downloadUrl: flyer.flyerUrl };
        }
      })
    );

    res.json({ flyers: flyersWithUrls });
  } catch (error) {
    logger.error("Error fetching patient info flyers:", error);
    res.status(500).json({ message: "Failed to fetch info flyers" });
  }
});

// Get patient messages
router.get('/api/patients/:id/messages', isAuthenticated, async (req: any, res) => {
  try {
    const { id: patientId } = req.params;
    const userId = req.user.id;

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await storage.getPatientMessages(patientId, patient.hospitalId);
    res.json(messages);
  } catch (error) {
    logger.error("Error fetching patient messages:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
});

// Send message to patient (SMS or Email)
router.post('/api/patients/:id/messages', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { id: patientId } = req.params;
    const { channel, recipient, message } = req.body;
    const userId = req.user.id;
    const hospitalId = req.headers['x-hospital-id'] as string || req.headers['x-active-hospital-id'] as string;

    if (!hospitalId) {
      return res.status(400).json({ message: "Hospital ID required" });
    }

    if (!channel || !recipient || !message) {
      return res.status(400).json({ message: "Channel, recipient, and message are required" });
    }

    if (channel !== 'sms' && channel !== 'email') {
      return res.status(400).json({ message: "Invalid channel. Must be 'sms' or 'email'" });
    }

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    let sendResult: { success: boolean; error?: string } = { success: false };

    if (channel === 'sms') {
      if (!(await isSmsConfiguredForHospital(hospitalId))) {
        return res.status(503).json({ message: "SMS service is not configured" });
      }
      logger.info(`[Patient Messages] Sending SMS to ${recipient} for patient ${patientId}`);
      sendResult = await sendSms(recipient, message, hospitalId);
      if (!sendResult.success) {
        logger.error(`[Patient Messages] SMS failed: ${sendResult.error}`);
        return res.status(500).json({ message: `Failed to send SMS: ${sendResult.error}` });
      }
      logger.info(`[Patient Messages] SMS sent successfully`);
    } else if (channel === 'email') {
      const hospital = await storage.getHospital(hospitalId);
      logger.info(`[Patient Messages] Sending email to ${recipient} for patient ${patientId}`);
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL || 'noreply@viali.app',
          to: recipient,
          subject: `Message from ${hospital?.name || 'Hospital'}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <p>${message.replace(/\n/g, '<br/>')}</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
              <p style="color: #999; font-size: 12px; text-align: center;">
                This is a message from ${hospital?.name || 'the hospital'}.
              </p>
            </div>
          `,
        });
        sendResult = { success: true };
        logger.info(`[Patient Messages] Email sent successfully`);
      } catch (emailError) {
        logger.error(`[Patient Messages] Email failed:`, emailError);
        return res.status(500).json({ message: `Failed to send email: ${emailError instanceof Error ? emailError.message : 'Unknown error'}` });
      }
    }

    // Save the message to the database
    const savedMessage = await storage.createPatientMessage({
      hospitalId: patient.hospitalId,
      patientId,
      sentBy: userId,
      channel,
      recipient,
      message,
      status: sendResult.success ? 'sent' : 'failed',
    });

    res.json(savedMessage);
  } catch (error) {
    logger.error("Error sending patient message:", error);
    res.status(500).json({ message: "Failed to send message" });
  }
});

export default router;
