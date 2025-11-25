import crypto from "crypto";

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
    console.warn("Invalid encrypted data format, returning as-is");
    return text;
  }
  
  if (parts[0].length !== 32) {
    console.warn(`Invalid IV length: ${parts[0].length}, expected 32. Returning as-is`);
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
    console.error("Failed to decrypt data:", error);
    return text;
  }
}
