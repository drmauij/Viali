import { Router, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "../auth/google";
import { userHasHospitalAccess, requireHospitalAccess, requireWriteAccess, getUserRole, canWrite } from "../utils";
import { storage, db } from "../storage";
import { S3Client, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";
import { cameraDevices, insertCameraDeviceSchema } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import logger from "../logger";

const router = Router();

function getS3Client(): S3Client | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_REGION || "ch-dk-2";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    return null;
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function getCameraDeviceByCameraId(cameraId: string) {
  const [device] = await db
    .select()
    .from(cameraDevices)
    .where(eq(cameraDevices.cameraId, cameraId));
  return device || null;
}

async function getCameraDeviceById(id: string) {
  const [device] = await db
    .select()
    .from(cameraDevices)
    .where(eq(cameraDevices.id, id));
  return device || null;
}

async function requireCameraAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { cameraId } = req.params;
    if (!cameraId) {
      return res.status(400).json({ error: "Camera ID required" });
    }

    const device = await getCameraDeviceByCameraId(cameraId);
    if (!device) {
      return res.status(404).json({ error: "Camera not found" });
    }

    const hasAccess = await userHasHospitalAccess(userId, device.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this camera" });
    }

    (req as any).cameraDevice = device;
    next();
  } catch (error) {
    logger.error("Camera access check failed:", error);
    res.status(500).json({ error: "Permission check failed" });
  }
}

async function requireCameraDeviceAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "Device ID required" });
    }

    const device = await getCameraDeviceById(id);
    if (!device) {
      return res.status(404).json({ error: "Camera device not found" });
    }

    const hasAccess = await userHasHospitalAccess(userId, device.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this camera device" });
    }

    (req as any).cameraDevice = device;
    next();
  } catch (error) {
    logger.error("Camera device access check failed:", error);
    res.status(500).json({ error: "Permission check failed" });
  }
}

async function requireCameraWriteAccess(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.user as any)?.id;
    const device = (req as any).cameraDevice;

    if (!userId || !device) {
      return res.status(403).json({ error: "Access denied" });
    }

    const role = await getUserRole(userId, device.hospitalId);
    if (!canWrite(role)) {
      return res.status(403).json({ 
        error: "Insufficient permissions. Write access required.",
        code: "READ_ONLY_ACCESS"
      });
    }

    next();
  } catch (error) {
    logger.error("Write access check failed:", error);
    res.status(500).json({ error: "Permission check failed" });
  }
}

// ============================================
// Camera Image Routes (S3) - Read access
// ============================================

router.get("/cameras/:cameraId/images", isAuthenticated, requireCameraAccess, async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    const since = req.query.since as string | undefined;

    const s3Client = getS3Client();
    if (!s3Client) {
      return res.status(500).json({ error: "S3 storage not configured" });
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: "S3 bucket not configured" });
    }

    const prefix = `cameras/${cameraId}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);
    
    let images = (response.Contents || [])
      .filter(obj => obj.Key?.endsWith('.jpg') || obj.Key?.endsWith('.jpeg'))
      .map(obj => {
        const filename = obj.Key!.split('/').pop()!;
        const timestamp = filename.replace('.jpg', '').replace('.jpeg', '');
        return {
          key: obj.Key!,
          timestamp,
          size: obj.Size,
          lastModified: obj.LastModified,
        };
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    if (since) {
      images = images.filter(img => img.timestamp > since);
    }

    images = images.slice(0, limit);

    res.json({ 
      cameraId, 
      images,
      count: images.length,
    });
  } catch (error: any) {
    logger.error("Error listing camera images:", error);
    res.status(500).json({ error: "Failed to list camera images" });
  }
});

router.get("/cameras/:cameraId/latest", isAuthenticated, requireCameraAccess, async (req: Request, res: Response) => {
  try {
    const { cameraId } = req.params;

    const s3Client = getS3Client();
    if (!s3Client) {
      return res.status(500).json({ error: "S3 storage not configured" });
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: "S3 bucket not configured" });
    }

    const prefix = `cameras/${cameraId}/`;
    
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      MaxKeys: 1000,
    });

    const response = await s3Client.send(command);
    
    const images = (response.Contents || [])
      .filter(obj => obj.Key?.endsWith('.jpg') || obj.Key?.endsWith('.jpeg'))
      .sort((a, b) => (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0));

    if (images.length === 0) {
      return res.status(404).json({ error: "No images found for this camera" });
    }

    const latestImage = images[0];
    const filename = latestImage.Key!.split('/').pop()!;
    const timestamp = filename.replace('.jpg', '').replace('.jpeg', '');

    const downloadCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: latestImage.Key!,
    });

    const downloadUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 3600 });

    res.json({
      cameraId,
      key: latestImage.Key,
      timestamp,
      lastModified: latestImage.LastModified,
      size: latestImage.Size,
      downloadUrl,
    });
  } catch (error: any) {
    logger.error("Error getting latest camera image:", error);
    res.status(500).json({ error: "Failed to get latest camera image" });
  }
});

router.get("/cameras/:cameraId/images/:timestamp/url", isAuthenticated, requireCameraAccess, async (req: Request, res: Response) => {
  try {
    const { cameraId, timestamp } = req.params;

    const s3Client = getS3Client();
    if (!s3Client) {
      return res.status(500).json({ error: "S3 storage not configured" });
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: "S3 bucket not configured" });
    }

    const key = `cameras/${cameraId}/${timestamp}.jpg`;

    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: "Image not found" });
      }
      throw err;
    }

    const downloadCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const downloadUrl = await getSignedUrl(s3Client, downloadCommand, { expiresIn: 3600 });

    res.json({
      cameraId,
      timestamp,
      key,
      downloadUrl,
    });
  } catch (error: any) {
    logger.error("Error getting image URL:", error);
    res.status(500).json({ error: "Failed to get image URL" });
  }
});

router.get("/cameras/:cameraId/images/:timestamp/base64", isAuthenticated, requireCameraAccess, async (req: Request, res: Response) => {
  try {
    const { cameraId, timestamp } = req.params;

    const s3Client = getS3Client();
    if (!s3Client) {
      return res.status(500).json({ error: "S3 storage not configured" });
    }

    const bucket = process.env.S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ error: "S3 bucket not configured" });
    }

    const key = `cameras/${cameraId}/${timestamp}.jpg`;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    });

    const response = await s3Client.send(command);
    
    if (!response.Body) {
      return res.status(404).json({ error: "Image not found" });
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const base64 = buffer.toString('base64');

    res.json({
      cameraId,
      timestamp,
      base64,
      contentType: response.ContentType || 'image/jpeg',
    });
  } catch (error: any) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: "Image not found" });
    }
    logger.error("Error getting image base64:", error);
    res.status(500).json({ error: "Failed to get image" });
  }
});

// ============================================
// Camera Device CRUD (Database Records)
// ============================================

router.get("/api/camera-devices", isAuthenticated, requireHospitalAccess, async (req: Request, res: Response) => {
  try {
    const hospitalId = (req as any).resolvedHospitalId || req.query.hospitalId as string;
    
    if (!hospitalId) {
      return res.status(400).json({ error: "hospitalId is required" });
    }

    const devices = await db
      .select()
      .from(cameraDevices)
      .where(eq(cameraDevices.hospitalId, hospitalId));

    res.json(devices);
  } catch (error: any) {
    logger.error("Error listing camera devices:", error);
    res.status(500).json({ error: "Failed to list camera devices" });
  }
});

router.get("/api/camera-devices/:id", isAuthenticated, requireCameraDeviceAccess, async (req: Request, res: Response) => {
  try {
    const device = (req as any).cameraDevice;
    res.json(device);
  } catch (error: any) {
    logger.error("Error getting camera device:", error);
    res.status(500).json({ error: "Failed to get camera device" });
  }
});

router.post("/api/camera-devices", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any)?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const parsed = insertCameraDeviceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body", details: parsed.error.errors });
    }

    const hasAccess = await userHasHospitalAccess(userId, parsed.data.hospitalId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied to this hospital" });
    }

    const role = await getUserRole(userId, parsed.data.hospitalId);
    if (!canWrite(role)) {
      return res.status(403).json({ error: "Write access required" });
    }

    const [device] = await db
      .insert(cameraDevices)
      .values(parsed.data)
      .returning();

    res.status(201).json(device);
  } catch (error: any) {
    logger.error("Error creating camera device:", error);
    res.status(500).json({ error: "Failed to create camera device" });
  }
});

router.patch("/api/camera-devices/:id", isAuthenticated, requireCameraDeviceAccess, requireCameraWriteAccess, async (req: Request, res: Response) => {
  try {
    const device = (req as any).cameraDevice;

    const updateData = { ...req.body };
    delete updateData.id;
    delete updateData.hospitalId;

    const [updated] = await db
      .update(cameraDevices)
      .set(updateData)
      .where(eq(cameraDevices.id, device.id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error("Error updating camera device:", error);
    res.status(500).json({ error: "Failed to update camera device" });
  }
});

router.delete("/api/camera-devices/:id", isAuthenticated, requireCameraDeviceAccess, requireCameraWriteAccess, async (req: Request, res: Response) => {
  try {
    const device = (req as any).cameraDevice;

    const [deleted] = await db
      .delete(cameraDevices)
      .where(eq(cameraDevices.id, device.id))
      .returning();

    res.json({ success: true });
  } catch (error: any) {
    logger.error("Error deleting camera device:", error);
    res.status(500).json({ error: "Failed to delete camera device" });
  }
});

router.post("/api/camera-devices/:id/heartbeat", isAuthenticated, requireCameraDeviceAccess, requireCameraWriteAccess, async (req: Request, res: Response) => {
  try {
    const device = (req as any).cameraDevice;

    const [updated] = await db
      .update(cameraDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(cameraDevices.id, device.id))
      .returning();

    res.json(updated);
  } catch (error: any) {
    logger.error("Error updating camera heartbeat:", error);
    res.status(500).json({ error: "Failed to update camera heartbeat" });
  }
});

router.get("/api/camera-devices/by-camera-id/:cameraId", isAuthenticated, requireCameraAccess, async (req: Request, res: Response) => {
  try {
    const device = (req as any).cameraDevice;
    res.json(device);
  } catch (error: any) {
    logger.error("Error getting camera device by cameraId:", error);
    res.status(500).json({ error: "Failed to get camera device" });
  }
});

export default router;
