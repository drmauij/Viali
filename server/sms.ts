// SMS integration for sending messages via ASPSMS or Vonage
import { Vonage } from '@vonage/server-sdk';
import { storage } from './storage';
import { decryptCredential } from './utils/encryption';
import logger from "./logger";

// ─── Types ───────────────────────────────────────────────────────────────────

interface VonageCredentials {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
  source: 'hospital' | 'default';
}

interface AspsmsCredentials {
  userKey: string;
  password: string;
  originator: string;
  source: 'hospital' | 'default';
}

export interface SendSmsResult {
  success: boolean;
  messageUuid?: string;
  error?: string;
  source?: 'hospital' | 'default';
}

type SmsProvider = 'aspsms' | 'vonage' | 'auto';

// ─── Vonage credential resolution ────────────────────────────────────────────

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

async function getVonageCredentials(hospitalId?: string): Promise<VonageCredentials | null> {
  // Try hospital-specific credentials first
  if (hospitalId) {
    const hospitalCreds = await getHospitalVonageCredentials(hospitalId);
    if (hospitalCreds) {
      return hospitalCreds;
    }
  }

  // Fall back to default credentials
  return getDefaultVonageCredentials();
}

function getVonageClient(apiKey: string, apiSecret: string): Vonage {
  return new Vonage({ apiKey, apiSecret });
}

// ─── ASPSMS credential resolution ────────────────────────────────────────────

function getDefaultAspsmsCredentials(): AspsmsCredentials | null {
  const userKey = process.env.ASPSMS_USERKEY;
  const password = process.env.ASPSMS_PASSWORD;

  if (!userKey || !password) {
    return null;
  }

  const originator = process.env.ASPSMS_DEFAULT_ORIGINATOR || 'ViALI';
  return { userKey, password, originator, source: 'default' };
}

async function getHospitalAspsmsCredentials(hospitalId: string): Promise<AspsmsCredentials | null> {
  try {
    const config = await storage.getHospitalAspsmsConfig(hospitalId);

    if (!config) {
      logger.info(`[SMS] No ASPSMS config found for hospital ${hospitalId}`);
      return null;
    }

    if (config.isEnabled === false) {
      logger.info(`[SMS] ASPSMS config exists but is disabled for hospital ${hospitalId}`);
      return null;
    }

    if (!config.encryptedUserKey || !config.encryptedPassword) {
      logger.info(`[SMS] ASPSMS config incomplete for hospital ${hospitalId}: hasUserKey=${!!config.encryptedUserKey}, hasPassword=${!!config.encryptedPassword}`);
      return null;
    }

    const userKey = decryptCredential(config.encryptedUserKey);
    const password = decryptCredential(config.encryptedPassword);

    if (!userKey || !password) {
      logger.warn(`[SMS] Failed to decrypt ASPSMS credentials for hospital ${hospitalId}`);
      return null;
    }

    const originator = config.originator || await resolveOriginatorFromHospital(hospitalId);
    return { userKey, password, originator, source: 'hospital' };
  } catch (error) {
    logger.error(`[SMS] Error fetching hospital ASPSMS config:`, error);
    return null;
  }
}

async function getAspsmsCredentials(hospitalId?: string): Promise<AspsmsCredentials | null> {
  // Try hospital-specific credentials first
  if (hospitalId) {
    const hospitalCreds = await getHospitalAspsmsCredentials(hospitalId);
    if (hospitalCreds) {
      return hospitalCreds;
    }
  }

  // Fall back to default credentials
  return getDefaultAspsmsCredentials();
}

// ─── Originator resolution ──────────────────────────────────────────────────

async function resolveOriginatorFromHospital(hospitalId: string): Promise<string> {
  try {
    const hospital = await storage.getHospital(hospitalId);
    if (hospital?.name) {
      // Remove non-alphanumeric, truncate to 11 chars (ASPSMS limit)
      const clean = hospital.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 11);
      if (clean.length > 0) return clean;
    }
  } catch (error) {
    logger.warn(`[SMS] Failed to resolve originator from hospital ${hospitalId}:`, error);
  }
  return process.env.ASPSMS_DEFAULT_ORIGINATOR || 'ViALI';
}

async function resolveOriginator(hospitalId?: string): Promise<string> {
  // 1. Check hospital ASPSMS config originator
  if (hospitalId) {
    try {
      const config = await storage.getHospitalAspsmsConfig(hospitalId);
      if (config?.originator) return config.originator;
    } catch {}

    // 2. Use hospital name (truncated to 11 alphanumeric chars)
    return resolveOriginatorFromHospital(hospitalId);
  }

  // 3. Default originator
  return process.env.ASPSMS_DEFAULT_ORIGINATOR || 'ViALI';
}

// ─── Provider resolution ────────────────────────────────────────────────────

async function resolveProvider(hospitalId?: string): Promise<'aspsms' | 'vonage' | null> {
  // Get hospital's explicit preference
  let preference: SmsProvider = 'auto';
  if (hospitalId) {
    try {
      const hospital = await storage.getHospital(hospitalId);
      if (hospital?.smsProvider && hospital.smsProvider !== 'auto') {
        preference = hospital.smsProvider as SmsProvider;
      }
    } catch {}
  }

  // If explicit preference, try that provider only (then fall through to auto)
  if (preference === 'aspsms') {
    const creds = await getAspsmsCredentials(hospitalId);
    if (creds) return 'aspsms';
  }
  if (preference === 'vonage') {
    const creds = await getVonageCredentials(hospitalId);
    if (creds) return 'vonage';
  }

  // Auto: ASPSMS first, then Vonage
  if (preference === 'auto' || preference === 'aspsms') {
    // Try hospital ASPSMS
    if (hospitalId) {
      const hospCreds = await getHospitalAspsmsCredentials(hospitalId);
      if (hospCreds) return 'aspsms';
    }
    // Try default ASPSMS
    if (getDefaultAspsmsCredentials()) return 'aspsms';
  }

  if (preference === 'auto' || preference === 'vonage') {
    // Try hospital Vonage
    if (hospitalId) {
      const hospCreds = await getHospitalVonageCredentials(hospitalId);
      if (hospCreds) return 'vonage';
    }
    // Try default Vonage
    if (getDefaultVonageCredentials()) return 'vonage';
  }

  return null;
}

// ─── Sending functions ──────────────────────────────────────────────────────

async function sendSmsViaVonage(to: string, message: string, credentials: VonageCredentials): Promise<SendSmsResult> {
  try {
    const vonage = getVonageClient(credentials.apiKey, credentials.apiSecret);

    // Remove + prefix for Vonage (it expects numbers without +)
    const vonageTo = to.replace(/^\+/, '');
    const vonageFrom = credentials.fromNumber.replace(/^\+/, '');

    logger.info(`[SMS/Vonage] Sending SMS to ${to} from ${credentials.fromNumber} (source: ${credentials.source})`);

    const response = await vonage.sms.send({
      to: vonageTo,
      from: vonageFrom,
      text: message,
    });

    const firstMessage = response.messages[0];

    if (firstMessage.status === '0') {
      logger.info(`[SMS/Vonage] Message sent successfully, ID: ${firstMessage.messageId}`);
      return {
        success: true,
        messageUuid: firstMessage.messageId,
        source: credentials.source,
      };
    } else {
      logger.error(`[SMS/Vonage] Failed to send: ${firstMessage.errorText}`);
      return {
        success: false,
        error: firstMessage.errorText || 'Unknown Vonage error',
        source: credentials.source,
      };
    }
  } catch (error) {
    logger.error('[SMS/Vonage] Failed to send SMS:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown Vonage error',
    };
  }
}

async function sendSmsViaAspsms(to: string, message: string, credentials: AspsmsCredentials): Promise<SendSmsResult> {
  try {
    const response = await fetch('https://json.aspsms.com/SendSimpleTextSMS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        UserName: credentials.userKey,
        Password: credentials.password,
        Originator: credentials.originator,
        Recipients: [to],
        MessageText: message,
      }),
    });

    const result = await response.json();

    if (result.StatusCode === '1') {
      logger.info(`[SMS/ASPSMS] Message sent successfully to ${to} (originator: ${credentials.originator}, source: ${credentials.source})`);
      return { success: true, source: credentials.source };
    } else {
      logger.error(`[SMS/ASPSMS] Failed: ${result.StatusCode} - ${result.StatusInfo}`);
      return { success: false, error: `ASPSMS error ${result.StatusCode}: ${result.StatusInfo}`, source: credentials.source };
    }
  } catch (error) {
    logger.error('[SMS/ASPSMS] Request failed:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown ASPSMS error' };
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Send an SMS message via the best available provider (ASPSMS or Vonage)
 * @param to - Destination phone number in E.164 format (e.g., +41791234567)
 * @param message - The SMS message text
 * @param hospitalId - Optional hospital ID for hospital-specific credentials/provider
 */
export async function sendSms(to: string, message: string, hospitalId?: string): Promise<SendSmsResult> {
  // Ensure phone number is in E.164 format
  const normalizedTo = normalizePhoneNumber(to);

  if (!normalizedTo) {
    return {
      success: false,
      error: 'Invalid phone number format',
    };
  }

  const provider = await resolveProvider(hospitalId);

  if (!provider) {
    logger.error(`[SMS] No SMS provider configured${hospitalId ? ` for hospital ${hospitalId}` : ''}`);
    return {
      success: false,
      error: 'No SMS provider configured',
    };
  }

  if (provider === 'aspsms') {
    const credentials = await getAspsmsCredentials(hospitalId);
    if (!credentials) {
      return { success: false, error: 'ASPSMS credentials not available' };
    }
    // Always resolve originator from hospital name when using default credentials
    if (hospitalId && credentials.source === 'default') {
      credentials.originator = await resolveOriginator(hospitalId);
    }
    // ASPSMS expects E.164 format WITH the + prefix
    const result = await sendSmsViaAspsms(normalizedTo, message, credentials);

    // If hospital-specific ASPSMS account failed, fall back to system default
    if (!result.success && credentials.source === 'hospital') {
      const defaultCreds = getDefaultAspsmsCredentials();
      if (defaultCreds) {
        logger.warn(`[SMS] Hospital ASPSMS account failed (${result.error}), falling back to system default for hospital ${hospitalId}`);
        // Resolve originator from hospital name for the default account
        if (hospitalId) {
          defaultCreds.originator = await resolveOriginator(hospitalId);
        }
        return sendSmsViaAspsms(normalizedTo, message, defaultCreds);
      }
    }

    return result;
  }

  // provider === 'vonage'
  const credentials = await getVonageCredentials(hospitalId);
  if (!credentials) {
    return { success: false, error: 'Vonage credentials not available' };
  }
  return sendSmsViaVonage(normalizedTo, message, credentials);
}

/**
 * Normalize phone number to E.164 format
 * Handles common Swiss and German formats
 */
export function normalizePhoneNumber(phone: string): string | null {
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
 * Check if SMS is configured (either ASPSMS or Vonage defaults)
 */
export function isSmsConfigured(): boolean {
  return !!(
    (process.env.ASPSMS_USERKEY && process.env.ASPSMS_PASSWORD) ||
    (process.env.VONAGE_API_KEY && process.env.VONAGE_API_SECRET && process.env.VONAGE_FROM_NUMBER)
  );
}

/**
 * Check if SMS is configured for a specific hospital (any provider)
 */
export async function isSmsConfiguredForHospital(hospitalId: string): Promise<boolean> {
  const provider = await resolveProvider(hospitalId);
  return provider !== null;
}
