import { Router } from "express";
import { storage } from "../../storage";
import { isAuthenticated } from "../../auth/google";
import { requireWriteAccess } from "../../utils";
import logger from "../../logger";

const router = Router();

// ========== EPISODE ROUTES ==========

router.get('/api/patients/:patientId/episodes', isAuthenticated, async (req: any, res) => {
  try {
    const { patientId } = req.params;
    const { status } = req.query;
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

    const episodes = await storage.getPatientEpisodes(patientId, status as string | undefined);
    res.json(episodes);
  } catch (error) {
    logger.error("Error fetching patient episodes:", error);
    res.status(500).json({ message: "Failed to fetch episodes" });
  }
});

router.get('/api/patients/:patientId/episodes/:episodeId', isAuthenticated, async (req: any, res) => {
  try {
    const { patientId, episodeId } = req.params;
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

    const details = await storage.getEpisodeWithDetails(episodeId);
    if (!details) {
      return res.status(404).json({ message: "Episode not found" });
    }

    res.json(details);
  } catch (error) {
    logger.error("Error fetching episode details:", error);
    res.status(500).json({ message: "Failed to fetch episode details" });
  }
});

router.post('/api/patients/:patientId/episodes', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId } = req.params;
    const userId = req.user.id;
    const { title, description, referenceDate } = req.body;

    if (!title) {
      return res.status(400).json({ message: "Title is required" });
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

    const episode = await storage.createEpisode({
      hospitalId: patient.hospitalId,
      patientId,
      episodeNumber: "", // Will be auto-generated
      title,
      description: description || null,
      referenceDate: referenceDate ? new Date(referenceDate) : null,
      status: "open",
      createdBy: userId,
    });

    res.status(201).json(episode);
  } catch (error) {
    logger.error("Error creating episode:", error);
    res.status(500).json({ message: "Failed to create episode" });
  }
});

router.patch('/api/patients/:patientId/episodes/:episodeId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId, episodeId } = req.params;
    const userId = req.user.id;
    const { title, description, referenceDate } = req.body;

    const patient = await storage.getPatient(patientId);
    if (!patient) {
      return res.status(404).json({ message: "Patient not found" });
    }

    const hospitals = await storage.getUserHospitals(userId);
    const hasAccess = hospitals.some(h => h.id === patient.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ message: "Access denied" });
    }

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }

    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (referenceDate !== undefined) updates.referenceDate = referenceDate ? new Date(referenceDate) : null;

    const updated = await storage.updateEpisode(episodeId, updates);
    res.json(updated);
  } catch (error) {
    logger.error("Error updating episode:", error);
    res.status(500).json({ message: "Failed to update episode" });
  }
});

router.post('/api/patients/:patientId/episodes/:episodeId/close', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId, episodeId } = req.params;
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

    const episode = await storage.closeEpisode(episodeId, userId);
    res.json(episode);
  } catch (error) {
    logger.error("Error closing episode:", error);
    res.status(500).json({ message: "Failed to close episode" });
  }
});

router.post('/api/patients/:patientId/episodes/:episodeId/reopen', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId, episodeId } = req.params;
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

    const episode = await storage.reopenEpisode(episodeId);
    res.json(episode);
  } catch (error) {
    logger.error("Error reopening episode:", error);
    res.status(500).json({ message: "Failed to reopen episode" });
  }
});

// ========== FOLDER ROUTES ==========

router.get('/api/episodes/:episodeId/folders', isAuthenticated, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const folders = await storage.getEpisodeFolders(episodeId);
    res.json(folders);
  } catch (error) {
    logger.error("Error fetching episode folders:", error);
    res.status(500).json({ message: "Failed to fetch folders" });
  }
});

router.post('/api/episodes/:episodeId/folders', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Folder name is required" });
    }

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot modify a closed episode" });
    }

    const folder = await storage.createEpisodeFolder({ episodeId, name });
    res.status(201).json(folder);
  } catch (error) {
    logger.error("Error creating folder:", error);
    res.status(500).json({ message: "Failed to create folder" });
  }
});

router.patch('/api/episodes/:episodeId/folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId, folderId } = req.params;
    const { name, sortOrder } = req.body;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot modify a closed episode" });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    const folder = await storage.updateEpisodeFolder(folderId, updates);
    res.json(folder);
  } catch (error) {
    logger.error("Error updating folder:", error);
    res.status(500).json({ message: "Failed to update folder" });
  }
});

router.delete('/api/episodes/:episodeId/folders/:folderId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId, folderId } = req.params;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot modify a closed episode" });
    }

    await storage.deleteEpisodeFolder(folderId);
    res.json({ message: "Folder deleted" });
  } catch (error) {
    logger.error("Error deleting folder:", error);
    res.status(500).json({ message: "Failed to delete folder" });
  }
});

router.post('/api/episodes/:episodeId/folders/reorder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const { folderIds } = req.body;

    if (!Array.isArray(folderIds)) {
      return res.status(400).json({ message: "folderIds must be an array" });
    }

    await storage.reorderEpisodeFolders(episodeId, folderIds);
    res.json({ message: "Folders reordered" });
  } catch (error) {
    logger.error("Error reordering folders:", error);
    res.status(500).json({ message: "Failed to reorder folders" });
  }
});

// ========== EPISODE DOCUMENT ROUTES ==========

router.get('/api/episodes/:episodeId/documents', isAuthenticated, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const documents = await storage.getEpisodeDocuments(episodeId);
    res.json(documents);
  } catch (error) {
    logger.error("Error fetching episode documents:", error);
    res.status(500).json({ message: "Failed to fetch documents" });
  }
});

router.post('/api/episodes/:episodeId/documents/upload-url', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const { filename, contentType } = req.body;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot upload to a closed episode" });
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
    const key = `patient-documents/${episode.hospitalId}/${episode.patientId}/${objectName}`;

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
    logger.error("Error generating episode upload URL:", error);
    res.status(500).json({ message: "Failed to generate upload URL" });
  }
});

router.post('/api/episodes/:episodeId/documents', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const userId = req.user.id;
    const { category, fileName, fileUrl, mimeType, fileSize, description, folderId } = req.body;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot upload to a closed episode" });
    }

    const document = await storage.createPatientDocument({
      hospitalId: episode.hospitalId,
      patientId: episode.patientId,
      category: category || 'other',
      fileName,
      fileUrl,
      mimeType,
      fileSize,
      description,
      uploadedBy: userId,
      episodeId,
      episodeFolderId: folderId || null,
    });

    res.status(201).json(document);
  } catch (error: any) {
    logger.error("Error creating episode document:", error);
    res.status(500).json({ message: "Failed to create document" });
  }
});

// ========== DOCUMENT ASSIGNMENT/MOVEMENT ROUTES ==========

router.patch('/api/patients/:patientId/documents/:docId/episode', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId, docId } = req.params;
    const { episodeId, folderId } = req.body;
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

    let document;
    if (episodeId) {
      document = await storage.assignDocumentToEpisode(docId, episodeId, folderId);
    } else {
      document = await storage.unassignDocumentFromEpisode(docId);
    }

    res.json(document);
  } catch (error) {
    logger.error("Error assigning document to episode:", error);
    res.status(500).json({ message: "Failed to assign document" });
  }
});

router.patch('/api/patients/:patientId/documents/:docId/folder', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { patientId, docId } = req.params;
    const { folderId } = req.body;
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

    const document = await storage.moveDocumentToFolder(docId, folderId || null);
    res.json(document);
  } catch (error) {
    logger.error("Error moving document to folder:", error);
    res.status(500).json({ message: "Failed to move document" });
  }
});

// ========== LINKING ROUTES ==========

router.post('/api/episodes/:episodeId/link/surgery/:surgeryId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId, surgeryId } = req.params;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot modify a closed episode" });
    }

    const surgery = await storage.linkSurgeryToEpisode(surgeryId, episodeId);
    res.json(surgery);
  } catch (error) {
    logger.error("Error linking surgery to episode:", error);
    res.status(500).json({ message: "Failed to link surgery" });
  }
});

router.delete('/api/episodes/:episodeId/link/surgery/:surgeryId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { surgeryId } = req.params;
    const surgery = await storage.unlinkSurgeryFromEpisode(surgeryId);
    res.json(surgery);
  } catch (error) {
    logger.error("Error unlinking surgery from episode:", error);
    res.status(500).json({ message: "Failed to unlink surgery" });
  }
});

router.get('/api/episodes/:episodeId/surgeries', isAuthenticated, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const surgeries = await storage.getEpisodeSurgeries(episodeId);
    res.json(surgeries);
  } catch (error) {
    logger.error("Error fetching episode surgeries:", error);
    res.status(500).json({ message: "Failed to fetch surgeries" });
  }
});

router.post('/api/episodes/:episodeId/link/note/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { episodeId, noteId } = req.params;

    const episode = await storage.getEpisode(episodeId);
    if (!episode) {
      return res.status(404).json({ message: "Episode not found" });
    }
    if (episode.status === "closed") {
      return res.status(400).json({ message: "Cannot modify a closed episode" });
    }

    const note = await storage.linkNoteToEpisode(noteId, episodeId);
    res.json(note);
  } catch (error) {
    logger.error("Error linking note to episode:", error);
    res.status(500).json({ message: "Failed to link note" });
  }
});

router.delete('/api/episodes/:episodeId/link/note/:noteId', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const { noteId } = req.params;
    const note = await storage.unlinkNoteFromEpisode(noteId);
    res.json(note);
  } catch (error) {
    logger.error("Error unlinking note from episode:", error);
    res.status(500).json({ message: "Failed to unlink note" });
  }
});

router.get('/api/episodes/:episodeId/notes', isAuthenticated, async (req: any, res) => {
  try {
    const { episodeId } = req.params;
    const notes = await storage.getEpisodeNotes(episodeId);
    res.json(notes);
  } catch (error) {
    logger.error("Error fetching episode notes:", error);
    res.status(500).json({ message: "Failed to fetch notes" });
  }
});

export default router;
