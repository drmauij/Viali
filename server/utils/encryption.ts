import crypto from "crypto";
import logger from "../logger";

if (!process.env.ENCRYPTION_SECRET) {
  throw new Error("ENCRYPTION_SECRET environment variable is required for patient data encryption");
}

export const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.ENCRYPTION_SECRET,
  "salt",
  32
);
const IV_LENGTH = 16;

export function encryptPatientData(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptPatientData(text: string): string {
  if (!text.includes(":")) {
    return text;
  }
  
  const parts = text.split(":");
  
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    logger.warn("Invalid encrypted data format, returning as-is");
    return text;
  }
  
  if (parts[0].length !== 32) {
    logger.warn(`Invalid IV length: ${parts[0].length}, expected 32. Returning as-is`);
    return text;
  }
  
  try {
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    logger.error("Failed to decrypt data:", error);
    return text;
  }
}

// Generic credential encryption (same algorithm, separate functions for clarity)
export function encryptCredential(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decryptCredential(encryptedText: string): string | null {
  if (!encryptedText || !encryptedText.includes(":")) {
    return null;
  }
  
  const parts = encryptedText.split(":");
  
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    logger.warn("Invalid encrypted credential format");
    return null;
  }
  
  if (parts[0].length !== 32) {
    logger.warn(`Invalid IV length for credential: ${parts[0].length}, expected 32`);
    return null;
  }
  
  try {
    const iv = Buffer.from(parts[0], "hex");
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    logger.error("Failed to decrypt credential:", error);
    return null;
  }
}
