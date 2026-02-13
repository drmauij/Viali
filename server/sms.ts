// Vonage SMS integration for sending SMS messages
import { Vonage } from '@vonage/server-sdk';
import { storage } from './storage';
import { decryptCredential } from './utils/encryption';
import logger from "./logger";

interface VonageCredentials {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  source: 'hospital' | 'default';
}

function getDefaultVonageCredentials(): VonageCredentials | null {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const fromNumber = process.env.VONAGE_FROM_NUMBER;

  if (!apiKey || !apiSecret || !fromNumber) {
    return null;
  }

  return { apiKey, apiSecret, fromNumber, source: 'default' };
}

async function getHospitalVonageCredentials(hospitalId: string): Promise<VonageCredentials | null> {
  try {
    const config = await storage.getHospitalVonageConfig(hospitalId);
    
    if (!config) {
      logger.info(`[SMS] No Vonage config found for hospital ${hospitalId}`);
      return null;
    }
    
    if (config.isEnabled === false) {
      logger.info(`[SMS] Vonage config exists but is disabled for hospital ${hospitalId}`);
      return null;
    }
    
    if (!config.encryptedApiKey || !config.encryptedApiSecret || !config.encryptedFromNumber) {
      logger.info(`[SMS] Vonage config incomplete for hospital ${hospitalId}: hasKey=${!!config.encryptedApiKey}, hasSecret=${!!config.encryptedApiSecret}, hasFrom=${!!config.encryptedFromNumber}`);
      return null;
    }
    
    const apiKey = decryptCredential(config.encryptedApiKey);
    const apiSecret = decryptCredential(config.encryptedApiSecret);
    const fromNumber = decryptCredential(config.encryptedFromNumber);
    
    if (!apiKey || !apiSecret || !fromNumber) {
      logger.warn(`[SMS] Failed to decrypt Vonage credentials for hospital ${hospitalId}`);
      return null;
    }
    
    return { apiKey, apiSecret, fromNumber, source: 'hospital' };
  } catch (error) {
    logger.error(`[SMS] Error fetching hospital Vonage config:`, error);
    return null;
  }
}

async function getVonageCredentials(hospitalId?: string): Promise<VonageCredentials> {
  // Try hospital-specific credentials first
  if (hospitalId) {
    const hospitalCreds = await getHospitalVonageCredentials(hospitalId);
    if (hospitalCreds) {
      return hospitalCreds;
    }
  }
  
  // Fall back to default credentials
  const defaultCreds = getDefaultVonageCredentials();
  if (defaultCreds) {
    return defaultCreds;
  }
  
  throw new Error('No Vonage credentials available - neither hospital-specific nor default');
}

function getVonageClient(apiKey: string, apiSecret: string): Vonage {
  return new Vonage({ apiKey, apiSecret });
}

export interface SendSmsResult {
  success: boolean;
  messageUuid?: string;
  error?: string;
  source?: 'hospital' | 'default';
}

/**
 * Send an SMS message using Vonage
 * @param to - Destination phone number in E.164 format (e.g., +41791234567)
 * @param message - The SMS message text
 * @param hospitalId - Optional hospital ID to use hospital-specific Vonage credentials
 */
export async function sendSms(to: string, message: string, hospitalId?: string): Promise<SendSmsResult> {
  try {
    const credentials = await getVonageCredentials(hospitalId);
    const vonage = getVonageClient(credentials.apiKey, credentials.apiSecret);

    // Ensure phone number is in E.164 format
    const normalizedTo = normalizePhoneNumber(to);
    
    if (!normalizedTo) {
      return {
        success: false,
        error: 'Invalid phone number format',
      };
    }

    // Remove + prefix for Vonage (it expects numbers without +)
    const vonageTo = normalizedTo.replace(/^\+/, '');
    const vonageFrom = credentials.fromNumber.replace(/^\+/, '');

    logger.info(`[SMS] Sending SMS to ${normalizedTo} from ${credentials.fromNumber} (source: ${credentials.source}${hospitalId ? `, hospital: ${hospitalId}` : ''})`);
    
    const response = await vonage.sms.send({
      to: vonageTo,
      from: vonageFrom,
      text: message,
    });

    const firstMessage = response.messages[0];
    
    if (firstMessage.status === '0') {
      logger.info(`[SMS] Message sent successfully, ID: ${firstMessage.messageId}`);
      return {
        success: true,
        messageUuid: firstMessage.messageId,
        source: credentials.source,
      };
    } else {
      logger.error(`[SMS] Failed to send: ${firstMessage.errorText}`);
      return {
        success: false,
        error: firstMessage.errorText || 'Unknown Vonage error',
        source: credentials.source,
      };
    }
  } catch (error) {
    logger.error('[SMS] Failed to send SMS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Normalize phone number to E.164 format
 * Handles common Swiss and German formats
 */
function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove all non-digit characters except leading +
  let normalized = phone.trim();
  const hasPlus = normalized.startsWith('+');
  normalized = normalized.replace(/\D/g, '');
  
  if (hasPlus) {
    normalized = '+' + normalized;
  }

  // If already in E.164 format
  if (normalized.startsWith('+')) {
    return normalized;
  }

  // Swiss numbers: 07x xxx xx xx → +41 7x xxx xx xx
  if (normalized.startsWith('07') && normalized.length === 10) {
    return '+41' + normalized.substring(1);
  }

  // German numbers: 01x xxx xxx → +49 1x xxx xxx
  if (normalized.startsWith('01') && normalized.length >= 10) {
    return '+49' + normalized.substring(1);
  }

  // If starts with country code without +
  if (normalized.startsWith('41') && normalized.length >= 11) {
    return '+' + normalized;
  }
  if (normalized.startsWith('49') && normalized.length >= 11) {
    return '+' + normalized;
  }

  // Default: add + if it looks like a full number
  if (normalized.length >= 10) {
    return '+' + normalized;
  }

  return null;
}

/**
 * Check if SMS is configured (either default or for a specific hospital)
 */
export function isSmsConfigured(): boolean {
  return !!(
    process.env.VONAGE_API_KEY &&
    process.env.VONAGE_API_SECRET &&
    process.env.VONAGE_FROM_NUMBER
  );
}

/**
 * Check if SMS is configured for a specific hospital
 */
export async function isSmsConfiguredForHospital(hospitalId: string): Promise<boolean> {
  try {
    const config = await storage.getHospitalVonageConfig(hospitalId);
    if (config && config.isEnabled !== false && config.encryptedApiKey && config.encryptedApiSecret && config.encryptedFromNumber) {
      return true;
    }
  } catch {}
  
  // Fall back to default
  return isSmsConfigured();
}
