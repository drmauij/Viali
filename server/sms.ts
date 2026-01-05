// Vonage SMS integration for sending SMS messages
import { Vonage } from '@vonage/server-sdk';

interface VonageCredentials {
  apiKey: string;
  apiSecret: string;
  fromNumber: string;
}

function getVonageCredentials(): VonageCredentials {
  const apiKey = process.env.VONAGE_API_KEY;
  const apiSecret = process.env.VONAGE_API_SECRET;
  const fromNumber = process.env.VONAGE_FROM_NUMBER;

  if (!apiKey) {
    throw new Error('VONAGE_API_KEY environment variable is required');
  }

  if (!apiSecret) {
    throw new Error('VONAGE_API_SECRET environment variable is required');
  }

  if (!fromNumber) {
    throw new Error('VONAGE_FROM_NUMBER environment variable is required');
  }

  return { apiKey, apiSecret, fromNumber };
}

function getVonageClient(): Vonage {
  const { apiKey, apiSecret } = getVonageCredentials();
  return new Vonage({
    apiKey,
    apiSecret,
  });
}

export interface SendSmsResult {
  success: boolean;
  messageUuid?: string;
  error?: string;
}

/**
 * Send an SMS message using Vonage
 * @param to - Destination phone number in E.164 format (e.g., +41791234567)
 * @param message - The SMS message text
 */
export async function sendSms(to: string, message: string): Promise<SendSmsResult> {
  try {
    const { fromNumber } = getVonageCredentials();
    const vonage = getVonageClient();

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
    const vonageFrom = fromNumber.replace(/^\+/, '');

    console.log(`[SMS] Sending SMS to ${normalizedTo} from ${fromNumber}`);
    
    const response = await vonage.sms.send({
      to: vonageTo,
      from: vonageFrom,
      text: message,
    });

    const firstMessage = response.messages[0];
    
    if (firstMessage.status === '0') {
      console.log(`[SMS] Message sent successfully, ID: ${firstMessage.messageId}`);
      return {
        success: true,
        messageUuid: firstMessage.messageId,
      };
    } else {
      console.error(`[SMS] Failed to send: ${firstMessage.errorText}`);
      return {
        success: false,
        error: firstMessage.errorText || 'Unknown Vonage error',
      };
    }
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
    process.env.VONAGE_API_KEY &&
    process.env.VONAGE_API_SECRET &&
    process.env.VONAGE_FROM_NUMBER
  );
}
