// S3-Compatible Object Storage Service for Exoscale SOS
import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import logger from "./logger";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export interface S3ObjectInfo {
  key: string;
  bucket: string;
  contentType?: string;
  size?: number;
  metadata?: Record<string, string>;
}

function getS3Config() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  const region = process.env.S3_REGION || "ch-dk-2";
  const bucket = process.env.S3_BUCKET;

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
    logger.warn("S3 storage not fully configured. File uploads will not work.");
    return null;
  }

  return { endpoint, accessKeyId, secretAccessKey, region, bucket };
}

function createS3Client(): S3Client | null {
  const config = getS3Config();
  if (!config) return null;

  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

export class ObjectStorageService {
  private s3Client: S3Client | null;
  private bucket: string;

  constructor() {
    this.s3Client = createS3Client();
    this.bucket = process.env.S3_BUCKET || "";
  }

  isConfigured(): boolean {
    return this.s3Client !== null && this.bucket !== "";
  }

  async getObjectEntityUploadURL(filename?: string): Promise<{ uploadURL: string; storageKey: string }> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET environment variables.");
    }

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `uploads/chat/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    return {
      uploadURL,
      storageKey: `/objects/${key}`
    };
  }

  async getUploadURLForFolder(folder: string, filename?: string): Promise<{ uploadURL: string; storageKey: string }> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET environment variables.");
    }

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `${folder}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });

    return {
      uploadURL,
      storageKey: `/objects/${key}`
    };
  }

  async getObjectDownloadURL(storageKey: string, expiresIn: number = 3600): Promise<string> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured");
    }

    const key = this.storageKeyToS3Key(storageKey);
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async objectExists(storageKey: string): Promise<boolean> {
    if (!this.s3Client) return false;

    const key = this.storageKeyToS3Key(storageKey);

    try {
      await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      throw error;
    }
  }

  async getObjectInfo(storageKey: string): Promise<S3ObjectInfo> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured");
    }

    const key = this.storageKeyToS3Key(storageKey);

    try {
      const response = await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      return {
        key,
        bucket: this.bucket,
        contentType: response.ContentType,
        size: response.ContentLength,
        metadata: response.Metadata,
      };
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
  }

  async downloadObject(storageKey: string, res: Response, cacheTtlSec: number = 3600) {
    if (!this.s3Client) {
      res.status(500).json({ error: "S3 storage not configured" });
      return;
    }

    const key = this.storageKeyToS3Key(storageKey);

    try {
      const response = await this.s3Client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      res.set({
        "Content-Type": response.ContentType || "application/octet-stream",
        "Content-Length": response.ContentLength?.toString(),
        "Cache-Control": `private, max-age=${cacheTtlSec}`,
      });

      if (response.Body instanceof Readable) {
        response.Body.pipe(res);
      } else if (response.Body) {
        const webStream = response.Body as ReadableStream;
        const nodeStream = Readable.fromWeb(webStream as any);
        nodeStream.pipe(res);
      } else {
        res.status(500).json({ error: "Error streaming file" });
      }
    } catch (error: any) {
      logger.error("Error downloading file:", error);
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ error: "File not found" });
      } else if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured");
    }

    const key = this.storageKeyToS3Key(storageKey);

    await this.s3Client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));
  }

  async setObjectAclPolicy(storageKey: string, aclPolicy: ObjectAclPolicy): Promise<void> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured");
    }

    const key = this.storageKeyToS3Key(storageKey);

    const headResponse = await this.s3Client.send(new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    }));

    await this.s3Client.send(new CopyObjectCommand({
      Bucket: this.bucket,
      Key: key,
      CopySource: `${this.bucket}/${key}`,
      MetadataDirective: "REPLACE",
      ContentType: headResponse.ContentType,
      Metadata: {
        ...headResponse.Metadata,
        "acl-policy": JSON.stringify(aclPolicy),
      },
    }));
  }

  async getObjectAclPolicy(storageKey: string): Promise<ObjectAclPolicy | null> {
    if (!this.s3Client) return null;

    const key = this.storageKeyToS3Key(storageKey);

    try {
      const response = await this.s3Client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }));

      const aclPolicyStr = response.Metadata?.["acl-policy"];
      if (!aclPolicyStr) return null;

      return JSON.parse(aclPolicyStr);
    } catch (error) {
      return null;
    }
  }

  async canAccessObject(storageKey: string, userId?: string, requestedPermission: ObjectPermission = ObjectPermission.READ): Promise<boolean> {
    const aclPolicy = await this.getObjectAclPolicy(storageKey);
    
    if (!aclPolicy) {
      return true;
    }
    
    if (aclPolicy.visibility === "public" && requestedPermission === ObjectPermission.READ) {
      return true;
    }
    
    if (!userId) {
      return false;
    }
    
    if (aclPolicy.owner === userId) {
      return true;
    }
    
    return false;
  }

  /**
   * Generate upload URL for sticker documentation photos/PDFs
   * Files are stored in: anesthesia/sticker-docs/{recordId}/{uuid}.{ext}
   */
  async getStickerDocUploadURL(
    recordId: string,
    filename?: string,
    contentType?: string
  ): Promise<{ uploadURL: string; storageKey: string }> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET environment variables.");
    }

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `anesthesia/sticker-docs/${recordId}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 min

    return {
      uploadURL,
      storageKey: `/objects/${key}`
    };
  }

  /**
   * Generate upload URL for order attachment files (delivery receipts, Lieferscheine)
   * Files are stored in: orders/{orderId}/{uuid}.{ext}
   */
  async getOrderAttachmentUploadURL(
    orderId: string,
    filename?: string,
    contentType?: string
  ): Promise<{ uploadURL: string; storageKey: string }> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET environment variables.");
    }

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `orders/${orderId}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 min

    return {
      uploadURL,
      storageKey: `/objects/${key}`
    };
  }

  /**
   * Upload a base64 blob directly to S3 (for migration of legacy sticker docs)
   */
  async uploadBase64ToS3(
    base64Data: string,
    key: string,
    contentType: string
  ): Promise<void> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured");
    }

    // Remove data URL prefix if present
    const base64Content = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Content, 'base64');

    await this.s3Client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }));
  }

  /**
   * Generate upload URL for note attachment files (images attached to patient/surgery notes)
   * Files are stored in: notes/{noteType}/{noteId}/{uuid}.{ext}
   */
  async getNoteAttachmentUploadURL(
    noteType: 'patient' | 'surgery',
    noteId: string,
    filename?: string,
    contentType?: string
  ): Promise<{ uploadURL: string; storageKey: string }> {
    if (!this.s3Client) {
      throw new Error("S3 storage not configured. Please set S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, and S3_BUCKET environment variables.");
    }

    const objectId = randomUUID();
    const extension = filename ? filename.split('.').pop() : '';
    const objectName = extension ? `${objectId}.${extension}` : objectId;
    const key = `notes/${noteType}/${noteId}/${objectName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
    });

    const uploadURL = await getSignedUrl(this.s3Client, command, { expiresIn: 900 }); // 15 min

    return {
      uploadURL,
      storageKey: `/objects/${key}`
    };
  }

  private storageKeyToS3Key(storageKey: string): string {
    if (storageKey.startsWith("/objects/")) {
      return storageKey.slice("/objects/".length);
    }
    if (storageKey.startsWith("/")) {
      return storageKey.slice(1);
    }
    return storageKey;
  }

  getObjectEntityFile(objectPath: string): Promise<S3ObjectInfo> {
    return this.getObjectInfo(objectPath);
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: S3ObjectInfo;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    const storageKey = `/objects/${objectFile.key}`;
    return this.canAccessObject(storageKey, userId, requestedPermission ?? ObjectPermission.READ);
  }
}
