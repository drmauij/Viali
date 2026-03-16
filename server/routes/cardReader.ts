import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import type { Hospital } from "@shared/schema";
import logger from "../logger";
import { lookupVekaAddress, isVekaConfigured, isValidVekaNumber } from "../services/vekaClient";
import { isAuthenticated } from "../auth/google";

const router = Router();

// Rate limiting for card reader endpoints
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetTime < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter(options: { windowMs: number; maxRequests: number; keyPrefix: string }) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${options.keyPrefix}:${ip}`;
    const now = Date.now();

    let entry = rateLimitStore.get(key);
    if (!entry || entry.resetTime < now) {
      entry = { count: 0, resetTime: now + options.windowMs };
      rateLimitStore.set(key, entry);
    }

    entry.count++;
    if (entry.count > options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ message: "Too many requests", retryAfter });
    }

    next();
  };
}

const lookupLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyPrefix: 'cr-lookup'
});

const healthLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 60,
  keyPrefix: 'cr-health'
});

// Middleware: authenticate via Bearer token -> card reader token
interface CardReaderRequest extends Request {
  hospital?: Hospital;
}

async function authenticateCardReaderToken(req: CardReaderRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Missing or invalid Authorization header" });
  }

  const token = authHeader.substring(7);
  if (!token || token.length < 10) {
    return res.status(401).json({ message: "Invalid token" });
  }

  try {
    const hospital = await storage.getHospitalByCardReaderToken(token);
    if (!hospital) {
      return res.status(401).json({ message: "Invalid card reader token" });
    }

    req.hospital = hospital;
    next();
  } catch (error) {
    logger.error("Card reader auth error:", error);
    return res.status(500).json({ message: "Authentication error" });
  }
}

// GET /api/card-reader/health — connectivity check
router.get('/api/card-reader/health', healthLimiter, authenticateCardReaderToken, async (req: CardReaderRequest, res: Response) => {
  res.json({ status: 'ok', hospitalId: req.hospital!.id });
});

// POST /api/card-reader/lookup — search for matching patient by card data
router.post('/api/card-reader/lookup', lookupLimiter, authenticateCardReaderToken, async (req: CardReaderRequest, res: Response) => {
  try {
    const hospitalId = req.hospital!.id;
    const { cardData } = req.body;

    if (!cardData) {
      return res.status(400).json({ message: "Missing cardData in request body" });
    }

    const { healthInsuranceNumber, insuranceNumber, insuranceName, cardNumber, surname, firstName, birthday, sex, street, postalCode, city } = cardData;

    // Search strategy:
    // 1. By healthInsuranceNumber (exact match)
    // 2. By insuranceNumber (exact match)
    // 3. By surname + firstName + birthday (case-insensitive name, exact birthday)
    let patient;

    if (healthInsuranceNumber) {
      patient = await storage.findPatientByInsuranceNumber(hospitalId, healthInsuranceNumber, 'health');
    }

    if (!patient && insuranceNumber) {
      patient = await storage.findPatientByInsuranceNumber(hospitalId, insuranceNumber, 'insurance');
    }

    if (!patient && surname && firstName && birthday) {
      patient = await storage.findPatientByNameAndBirthday(hospitalId, surname, firstName, birthday);
    }

    if (patient) {
      return res.json({
        found: true,
        patientId: patient.id,
        url: `/patients/${patient.id}?openEdit=true`,
      });
    }

    // Enrich with VeKa address if card number is present and address is missing
    let vekaStreet = street;
    let vekaPostalCode = postalCode;
    let vekaCity = city;

    if (!street && !postalCode && !city && cardNumber && isVekaConfigured()) {
      const vekaAddress = await lookupVekaAddress(cardNumber, req.hospital!.companyZsr);
      if (vekaAddress) {
        vekaStreet = vekaAddress.street;
        vekaPostalCode = vekaAddress.postalCode;
        vekaCity = vekaAddress.city;
      }
    }

    // No match — build URL for pre-filled patient creation
    const params = new URLSearchParams({ newPatient: '1' });
    if (surname) params.set('surname', surname);
    if (firstName) params.set('firstName', firstName);
    if (birthday) params.set('birthday', birthday);
    if (sex) params.set('sex', sex);
    if (vekaStreet) params.set('street', vekaStreet);
    if (vekaPostalCode) params.set('postalCode', vekaPostalCode);
    if (vekaCity) params.set('city', vekaCity);
    if (insuranceName) params.set('insuranceProvider', insuranceName);
    if (cardNumber) params.set('insuranceNumber', cardNumber);
    if (healthInsuranceNumber) params.set('healthInsuranceNumber', healthInsuranceNumber);

    return res.json({
      found: false,
      url: `/patients?${params.toString()}`,
    });
  } catch (error) {
    logger.error("Card reader lookup error:", error);
    return res.status(500).json({ message: "Lookup failed" });
  }
});

// POST /api/veka/lookup — manual address lookup by card number (authenticated users)
const vekaLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 20,
  keyPrefix: 'veka-lookup'
});

router.post('/api/veka/lookup', vekaLimiter, isAuthenticated, async (req: any, res: Response) => {
  try {
    const { cardNumber } = req.body;

    if (!cardNumber) {
      return res.status(400).json({ error: 'Missing cardNumber' });
    }

    if (!isValidVekaNumber(cardNumber)) {
      return res.status(400).json({ error: 'Invalid card number format. Expected 20-digit VeKa number.' });
    }

    if (!isVekaConfigured()) {
      return res.status(503).json({ error: 'VeKa-Center integration is not configured' });
    }

    // Get user's hospital ZSR from their first hospital
    let hospitalZsr: string | null = null;
    if (req.user?.id) {
      const userHospitals = await storage.getUserHospitals(req.user.id);
      if (userHospitals.length > 0) {
        hospitalZsr = userHospitals[0].companyZsr || null;
      }
    }

    const address = await lookupVekaAddress(cardNumber, hospitalZsr);
    if (!address) {
      return res.json({ found: false, error: 'Address not found' });
    }

    return res.json({ found: true, ...address });
  } catch (error) {
    logger.error("VeKa lookup error:", error);
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

export default router;
