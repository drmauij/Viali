// Plivo SMS integration for sending SMS messages
import * as plivo from 'plivo';

interface PlivoCredentials {
  authId: string;
  authToken: string;
  fromNumber: string;
}

function getPlivoCredentials(): PlivoCredentials {
  const authId = process.env.PLIVO_AUTH_ID;
  const authToken = process.env.PLIVO_AUTH_TOKEN;
  const fromNumber = process.env.PLIVO_FROM_NUMBER;

  if (!authId) {
    throw new Error('PLIVO_AUTH_ID environment variable is required');
  }

  if (!authToken) {
    throw new Error('PLIVO_AUTH_TOKEN environment variable is required');
  }

  if (!fromNumber) {
    throw new Error('PLIVO_FROM_NUMBER environment variable is required');
  }

  return { authId, authToken, fromNumber };
}

function getPlivoClient(): plivo.Client {
  const { authId, authToken } = getPlivoCredentials();
  return new plivo.Client(authId, authToken);
}

export interface SendSmsResult {
  success: boolean;
  messageUuid?: string;
  error?: string;
}

/**
 * Send an SMS message using Plivo
 * @param to - Destination phone number in E.164 format (e.g., +41791234567)
 * @param message - The SMS message text (max 1600 characters, will be split if longer)
 */
export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  try {
    const { fromNumber } = getPlivoCredentials();
    const client = getPlivoClient();

    // Ensure phone number is in E.164 format
    const normalizedTo = normalizePhoneNumber(to);
    
    if (!normalizedTo) {
      return {
        success: false,
        error: 'Invalid phone number format',
      };
    }

    console.log(`[SMS] Sending SMS to ${normalizedTo} from ${fromNumber}`);
    
    const response = await client.messages.create(
      fromNumber,
      normalizedTo,
      message
    );

    console.log(`[SMS] Message sent successfully, UUID: ${response.messageUuid}`);
    
    return {
      success: true,
      messageUuid: Array.isArray(response.messageUuid) 
        ? response.messageUuid[0] 
        : response.messageUuid,
    };
  } catch (error) {
    console.error('[SMS] Failed to send SMS:', error);
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
 * Check if SMS is configured
 */
export function isSmsConfigured(): boolean {
  return !!(
    process.env.PLIVO_AUTH_ID &&
    process.env.PLIVO_AUTH_TOKEN &&
    process.env.PLIVO_FROM_NUMBER
  );
}
