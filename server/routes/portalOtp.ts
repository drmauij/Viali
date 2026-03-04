import { Router, type Request, type Response } from "express";
import { storage } from "../storage";
import { maskEmail, maskPhone } from "../auth/portalAuth";
import {
  createVerificationCode,
  findActiveVerificationCode,
  findByVerificationToken,
  incrementVerificationAttempt,
  markCodeUsed,
  createPortalSession,
  generateOtpCode,
  generateVerificationToken,
} from "../storage/portalOtp";
import { sendPortalVerificationEmail } from "../resend";
import { sendSms } from "../sms";
import { db } from "../db";
import {
  hospitals,
  patients,
} from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

const router = Router();

type PortalType = "patient" | "worklog" | "surgeon";

// ========== RATE LIMITING ==========

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimits = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(key);
  }
}, 5 * 60 * 1000);

function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || entry.resetAt <= now) {
    rateLimits.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}

// ========== HELPER: Resolve portal contact info ==========

interface PortalContactInfo {
  email: string | null;
  phone: string | null;
  language: string;
  hospitalName: string;
  valid: boolean;
}

async function resolveContactInfo(
  portalType: PortalType,
  portalToken: string,
): Promise<PortalContactInfo> {
  const empty: PortalContactInfo = {
    email: null,
    phone: null,
    language: "de",
    hospitalName: "",
    valid: false,
  };

  if (portalType === "worklog") {
    const link = await storage.getExternalWorklogLinkByToken(portalToken);
    if (!link || !link.isActive) return empty;

    return {
      email: link.email || null,
      phone: null,
      language: link.hospital?.defaultLanguage || "de",
      hospitalName: link.hospital?.name || "Viali",
      valid: true,
    };
  }

  if (portalType === "patient") {
    const link = await storage.getQuestionnaireLinkByToken(portalToken);
    if (!link) return empty;

    // Get hospital info
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, link.hospitalId))
      .limit(1);

    // Contact info from the link's sent-to fields
    let email = link.emailSentTo || null;
    let phone = link.smsSentTo || null;

    // Fallback to patient record
    if ((!email || !phone) && link.patientId) {
      const [patient] = await db
        .select()
        .from(patients)
        .where(eq(patients.id, link.patientId))
        .limit(1);
      if (patient) {
        if (!email) email = patient.email || null;
        if (!phone) phone = patient.phone || null;
      }
    }

    return {
      email,
      phone,
      language: hospital?.defaultLanguage || "de",
      hospitalName: hospital?.name || "Viali",
      valid: true,
    };
  }

  return empty;
}

// ========== ROUTES ==========

/**
 * GET /api/portal-auth/:portalType/:token/hint
 * Returns masked contact info + hospital language for the verification screen.
 */
router.get(
  "/api/portal-auth/:portalType/:token/hint",
  async (req: Request, res: Response) => {
    try {
      const portalType = req.params.portalType as PortalType;
      const { token } = req.params;

      if (!["patient", "worklog", "surgeon"].includes(portalType)) {
        return res.status(400).json({ message: "Invalid portal type" });
      }

      const info = await resolveContactInfo(portalType, token);
      if (!info.valid) {
        // Don't leak whether the token exists — return generic hint
        return res.json({
          emailHint: null,
          hasPhone: false,
          language: "de",
          hospitalName: "Viali",
        });
      }

      return res.json({
        emailHint: info.email ? maskEmail(info.email) : null,
        hasPhone: !!info.phone,
        language: info.language,
        hospitalName: info.hospitalName,
      });
    } catch (error) {
      logger.error("[PortalOTP] Error fetching hint:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/**
 * POST /api/portal-auth/:portalType/:token/request-code
 * Generates and sends OTP via email or SMS.
 */
router.post(
  "/api/portal-auth/:portalType/:token/request-code",
  async (req: Request, res: Response) => {
    try {
      const portalType = req.params.portalType as PortalType;
      const { token } = req.params;
      const { method } = req.body as { method?: "email" | "sms" };

      if (!["patient", "worklog", "surgeon"].includes(portalType)) {
        return res.status(400).json({ message: "Invalid portal type" });
      }

      if (!method || !["email", "sms"].includes(method)) {
        return res.status(400).json({ message: "Invalid delivery method" });
      }

      // Rate limit: 3 requests per 10 minutes per IP+token
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const rlKey = `request:${ip}:${token}`;
      if (!checkRateLimit(rlKey, 3, 10 * 60 * 1000)) {
        // Still return { sent: true } to prevent enumeration
        return res.json({ sent: true });
      }

      const info = await resolveContactInfo(portalType, token);
      if (!info.valid) {
        // Always return success to prevent enumeration
        return res.json({ sent: true });
      }

      const deliverTo =
        method === "email" ? info.email : info.phone;
      if (!deliverTo) {
        return res.json({ sent: true });
      }

      // Generate code + verification token
      const code = generateOtpCode();
      const verificationToken = generateVerificationToken();

      await createVerificationCode(
        portalType,
        token,
        code,
        verificationToken,
        method,
        deliverTo,
      );

      // Build magic link
      const baseUrl =
        process.env.PRODUCTION_URL ||
        process.env.APP_URL ||
        "https://use.viali.app";
      const magicLinkUrl = `${baseUrl}/api/portal-auth/verify/${verificationToken}`;

      // Send via chosen method
      if (method === "email") {
        await sendPortalVerificationEmail(
          deliverTo,
          code,
          magicLinkUrl,
          info.language,
          info.hospitalName,
        );
      } else {
        // SMS — bilingual short message
        const isGerman = info.language === "de";
        const smsMessage = isGerman
          ? `${info.hospitalName}: ${magicLinkUrl} — oder Code: ${code} (15 Min gültig)`
          : `${info.hospitalName}: ${magicLinkUrl} — or code: ${code} (valid 15 min)`;
        await sendSms(deliverTo, smsMessage);
      }

      return res.json({ sent: true });
    } catch (error) {
      logger.error("[PortalOTP] Error requesting code:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/**
 * GET /api/portal-auth/verify/:verificationToken
 * Magic link endpoint — verifies token, creates session, redirects.
 */
router.get(
  "/api/portal-auth/verify/:verificationToken",
  async (req: Request, res: Response) => {
    try {
      const { verificationToken } = req.params;

      const code = await findByVerificationToken(verificationToken);
      if (
        !code ||
        code.usedAt ||
        new Date(code.expiresAt) < new Date()
      ) {
        // Invalid or expired — redirect to portal (gate will show again)
        const portalPath =
          code?.portalType === "patient"
            ? `/patient/${code?.portalToken}`
            : code?.portalType === "worklog"
              ? `/worklog/${code?.portalToken}`
              : "/";
        return res.redirect(portalPath);
      }

      // Mark used + create session
      await markCodeUsed(code.id);
      const sessionToken = await createPortalSession(
        code.portalType,
        code.portalToken,
      );

      // Set cookie
      const isHttps = (process.env.NODE_ENV === "production") ||
        !!process.env.PRODUCTION_URL;
      res.cookie("portal_session", sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days (DB expiry is the real bound)
        path: "/",
      });

      // Redirect to portal
      const redirectPath =
        code.portalType === "patient"
          ? `/patient/${code.portalToken}`
          : code.portalType === "worklog"
            ? `/worklog/${code.portalToken}`
            : `/surgeon/${code.portalToken}`;

      return res.redirect(redirectPath);
    } catch (error) {
      logger.error("[PortalOTP] Error verifying magic link:", error);
      return res.redirect("/");
    }
  },
);

/**
 * POST /api/portal-auth/:portalType/:token/verify-code
 * Verifies the 6-digit OTP code.
 */
router.post(
  "/api/portal-auth/:portalType/:token/verify-code",
  async (req: Request, res: Response) => {
    try {
      const portalType = req.params.portalType as PortalType;
      const { token } = req.params;
      const { code: inputCode } = req.body as { code?: string };

      if (!["patient", "worklog", "surgeon"].includes(portalType)) {
        return res.status(400).json({ message: "Invalid portal type" });
      }

      if (!inputCode || inputCode.length !== 6) {
        return res.status(400).json({ message: "Invalid code format" });
      }

      // Rate limit: 10 attempts per 5 minutes per IP+token
      const ip = req.ip || req.socket.remoteAddress || "unknown";
      const rlKey = `verify:${ip}:${token}`;
      if (!checkRateLimit(rlKey, 10, 5 * 60 * 1000)) {
        return res
          .status(429)
          .json({ message: "Too many attempts, please try again later" });
      }

      const verification = await findActiveVerificationCode(
        portalType,
        token,
      );
      if (!verification) {
        return res
          .status(400)
          .json({ message: "No active code found. Please request a new one." });
      }

      // Max 5 attempts per code
      if (verification.attemptCount >= 5) {
        return res.status(400).json({
          message: "Too many failed attempts. Please request a new code.",
        });
      }

      await incrementVerificationAttempt(verification.id);

      // Compare with bcrypt
      const bcrypt = await import("bcrypt");
      const isValid = await bcrypt.compare(inputCode, verification.codeHash);

      if (!isValid) {
        return res.status(400).json({ message: "Invalid code" });
      }

      // Success — mark used + create session
      await markCodeUsed(verification.id);
      const sessionToken = await createPortalSession(portalType, token);

      const isHttps = (process.env.NODE_ENV === "production") ||
        !!process.env.PRODUCTION_URL;
      res.cookie("portal_session", sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      return res.json({ verified: true });
    } catch (error) {
      logger.error("[PortalOTP] Error verifying code:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

export default router;
