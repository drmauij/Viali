import { XMLParser } from 'fast-xml-parser';
import logger from "../logger";

const VEKA_ENDPOINT = 'https://www.versichertenkarte.ch/queryws_1_0/VeKa_Query_1_0.asmx';
const VEKA_NAMESPACE = 'http://www.vekacenter.ch/veka_query/';
const VEKA_SOAP_ACTION = 'http://www.vekacenter.ch/veka_query/GetVeKa';
const VEKA_TIMEOUT_MS = 5000;

export interface VekaAddress {
  street: string;
  postalCode: string;
  city: string;
}

interface VekaConfig {
  user: string;
  password: string;
  questioner: string;
  zsr: string;
}

/**
 * Get VeKa config from env vars + hospital ZSR.
 * VEKA_USER, VEKA_PASSWORD, VEKA_QUESTIONER are app-level env vars.
 * ZSR comes from the hospital record (hospitals.zsrNumber).
 */
function getVekaConfig(hospitalZsr?: string | null): VekaConfig | null {
  const user = process.env.VEKA_USER;
  const password = process.env.VEKA_PASSWORD;
  const questioner = process.env.VEKA_QUESTIONER;

  if (!user || !password) {
    return null;
  }

  const zsr = hospitalZsr || process.env.VEKA_ZSR;
  if (!zsr) {
    return null;
  }

  return { user, password, questioner: questioner || '', zsr };
}

export function isVekaConfigured(): boolean {
  return !!(process.env.VEKA_USER && process.env.VEKA_PASSWORD);
}

function buildSoapEnvelope(config: VekaConfig, cardNumber: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:veka="${VEKA_NAMESPACE}">
  <soap:Body>
    <veka:GetVeKa>
      <veka:VeKa_Request>
        <veka:Questioner>
          <veka:QueryUser>${escapeXml(config.user)}</veka:QueryUser>
          <veka:QueryPW>${escapeXml(config.password)}</veka:QueryPW>
          <veka:QueryName>${escapeXml(config.questioner)}</veka:QueryName>
          <veka:ZSR>${escapeXml(config.zsr)}</veka:ZSR>
        </veka:Questioner>
        <veka:VeKaNumber>${escapeXml(cardNumber)}</veka:VeKaNumber>
      </veka:VeKa_Request>
    </veka:GetVeKa>
  </soap:Body>
</soap:Envelope>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Validate a VeKa card number (20-digit, starts with 80756 or 80438).
 */
export function isValidVekaNumber(cardNumber: string): boolean {
  if (!cardNumber) return false;
  const digits = cardNumber.replace(/\s/g, '');
  return /^(80756|80438)\d{15}$/.test(digits);
}

/**
 * Look up a patient's address from the SASIS VeKa-Center using their card number.
 * hospitalZsr: the clinic's ZSR number (from hospitals.zsrNumber).
 * Returns null on any failure — this is a best-effort lookup.
 */
export async function lookupVekaAddress(cardNumber: string, hospitalZsr?: string | null): Promise<VekaAddress | null> {
  const config = getVekaConfig(hospitalZsr);
  if (!config) {
    logger.debug('[VeKa] Not configured — skipping address lookup');
    return null;
  }

  const cleanNumber = cardNumber.replace(/\s/g, '');
  if (!isValidVekaNumber(cleanNumber)) {
    logger.warn(`[VeKa] Invalid card number format: ${cleanNumber.substring(0, 5)}...`);
    return null;
  }

  try {
    const soapXml = buildSoapEnvelope(config, cleanNumber);
    logger.info(`[VeKa] Looking up address for card ${cleanNumber.substring(0, 8)}...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VEKA_TIMEOUT_MS);

    const response = await fetch(VEKA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': VEKA_SOAP_ACTION,
      },
      body: soapXml,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[VeKa] HTTP error ${response.status}: ${errorText.substring(0, 500)}`);
      return null;
    }

    const responseXml = await response.text();
    logger.info(`[VeKa] Response received (${responseXml.length} chars)`);

    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      removeNSPrefix: true,
    });

    const parsed = parser.parse(responseXml);

    // Navigate SOAP envelope to get the response body
    const envelope = parsed.Envelope || parsed['soap:Envelope'];
    const body = envelope?.Body || envelope?.['soap:Body'];
    const getVekaResponse = body?.GetVeKaResponse;
    const result = getVekaResponse?.GetVeKaResult || getVekaResponse?.VeKa_Response;

    if (!result) {
      logger.warn('[VeKa] Could not find VeKa_Response in parsed XML');
      logger.debug('[VeKa] Parsed structure:', JSON.stringify(parsed, null, 2).substring(0, 2000));
      return null;
    }

    // Check error code: 0 = success, 1 = not found, 2 = multiple matches, etc.
    const errorCode = result.ErrorCode ?? result.errorCode ?? result.error_code;
    if (errorCode !== undefined && errorCode !== 0 && errorCode !== '0') {
      const errorMsg = result.ErrorMessage || result.errorMessage || `Error code ${errorCode}`;
      logger.warn(`[VeKa] Lookup returned error: ${errorCode} - ${errorMsg}`);
      return null;
    }

    // Extract address from response
    // The response structure may vary — try multiple paths
    const patient = result.Patient || result.patient || result;
    const basicData = patient.BasicData || patient.basicData || patient;
    const address = basicData.Address || basicData.address || basicData;

    const street = address.Street || address.street || '';
    const postalCode = address.ZipCode || address.zipCode || address.Zip || address.zip || address.PostalCode || address.postalCode || '';
    const city = address.City || address.city || address.Place || address.place || '';

    if (!street && !postalCode && !city) {
      logger.warn('[VeKa] Response contained no address data');
      logger.debug('[VeKa] Result structure:', JSON.stringify(result, null, 2).substring(0, 1000));
      return null;
    }

    const vekaAddress: VekaAddress = {
      street: String(street),
      postalCode: String(postalCode),
      city: String(city),
    };

    logger.info(`[VeKa] Address found: ${vekaAddress.postalCode} ${vekaAddress.city}`);
    return vekaAddress;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      logger.warn('[VeKa] Request timed out after 5s');
    } else {
      logger.error('[VeKa] Lookup error:', error.message || error);
    }
    return null;
  }
}
