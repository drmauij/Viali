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
  hospitalId: string | null;
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
    hospitalId: null,
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
      hospitalId: link.hospitalId || null,
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
      hospitalId: link.hospitalId,
      valid: true,
    };
  }

  if (portalType === "surgeon") {
    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.externalSurgeryToken, portalToken))
      .limit(1);

    if (!hospital) return empty;

    return {
      email: null,  // Surgeon provides their email in the request
      phone: null,
      language: hospital.defaultLanguage || "de",
      hospitalName: hospital.name || "Viali",
      hospitalId: hospital.id,
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
          requiresEmailInput: portalType === "surgeon",
        });
      }

      return res.json({
        emailHint: info.email ? maskEmail(info.email) : null,
        hasPhone: !!info.phone,
        language: info.language,
        hospitalName: info.hospitalName,
        requiresEmailInput: portalType === "surgeon",
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

      // For surgeon portal, email comes from request body
      let deliverTo: string | null;
      if (portalType === "surgeon") {
        const { email } = req.body as { email?: string; method?: string };
        if (!email || !email.includes("@")) {
          return res.json({ sent: true }); // Don't leak validation
        }
        deliverTo = email;
      } else {
        deliverTo = method === "email" ? info.email : info.phone;
      }
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
        // SMS — code first so it's visible in notification preview
        const isGerman = info.language === "de";
        const smsMessage = isGerman
          ? `${code} - Ihr Zugangscode fuer ${info.hospitalName} (15 Min gueltig)`
          : `${code} - Your access code for ${info.hospitalName} (valid 15 min)`;
        const smsResult = await sendSms(deliverTo, smsMessage, info.hospitalId || undefined);
        if (!smsResult.success) {
          logger.error(`[PortalOTP] SMS send failed: ${smsResult.error}`);
        }
      }

      return res.json({ sent: true });
    } catch (error) {
      logger.error("[PortalOTP] Error requesting code:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  },
);

/**
 * Helper: resolve portal redirect path from a verification code record.
 */
function getPortalPath(portalType: string, portalToken: string): string {
  if (portalType === "patient") return `/patient/${portalToken}`;
  if (portalType === "worklog") return `/worklog/${portalToken}`;
  if (portalType === "surgeon") return `/surgeon-portal/${portalToken}`;
  return "/";
}

/**
 * GET /api/portal-auth/verify/:verificationToken
 * Magic link — serves an interstitial HTML page that auto-submits a POST form.
 * This prevents link pre-fetchers (SMS apps, email scanners) from consuming the token,
 * since they only perform GET/HEAD requests and don't execute JavaScript or submit forms.
 */
router.get(
  "/api/portal-auth/verify/:verificationToken",
  async (req: Request, res: Response) => {
    try {
      const { verificationToken } = req.params;

      // Quick check: if token is already used or expired, redirect to portal immediately
      const code = await findByVerificationToken(verificationToken);
      if (
        !code ||
        code.usedAt ||
        new Date(code.expiresAt) < new Date()
      ) {
        const portalPath = code
          ? getPortalPath(code.portalType, code.portalToken)
          : "/";
        return res.redirect(portalPath);
      }

      // Token is valid — serve interstitial page that auto-POSTs
      const actionUrl = `/api/portal-auth/verify/${verificationToken}`;
      return res.send(`<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verifying...</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; justify-content: center;
         align-items: center; min-height: 100vh; margin: 0; background: #f9fafb; }
  .card { text-align: center; padding: 40px; background: white; border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,.1); max-width: 400px; }
  .spinner { width: 32px; height: 32px; border: 3px solid #e5e7eb; border-top-color: #2563eb;
             border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  noscript .btn { display: inline-block; background: #2563eb; color: white; padding: 12px 32px;
                  border-radius: 8px; text-decoration: none; font-weight: 600; border: none;
                  cursor: pointer; font-size: 16px; }
</style>
</head><body>
<div class="card">
  <div class="spinner"></div>
  <p>Verifying access...</p>
  <noscript>
    <p>Click below to verify:</p>
    <form method="POST" action="${actionUrl}">
      <button type="submit" class="btn">Verify Access</button>
    </form>
  </noscript>
</div>
<form id="f" method="POST" action="${actionUrl}" style="display:none"></form>
<script>document.getElementById('f').submit();</script>
</body></html>`);
    } catch (error) {
      logger.error("[PortalOTP] Error serving magic link page:", error);
      return res.redirect("/");
    }
  },
);

/**
 * POST /api/portal-auth/verify/:verificationToken
 * Actual magic link verification — consumes token, creates session, redirects.
 * Only triggered by the interstitial page's form submission (not by link pre-fetchers).
 */
router.post(
  "/api/portal-auth/verify/:verificationToken",
  async (req: Request, res: Response) => {
    try {
      const { verificationToken } = req.params;

      const code = await findByVerificationToken(verificationToken);
      logger.info(`[DEBUG-AUTH] magic-link: code found=${!!code}, used=${!!code?.usedAt}, expired=${code ? new Date(code.expiresAt) < new Date() : 'N/A'}, deliveredTo=${code?.deliveredTo || 'N/A'}`);
      if (
        !code ||
        code.usedAt ||
        new Date(code.expiresAt) < new Date()
      ) {
        const portalPath = code
          ? getPortalPath(code.portalType, code.portalToken)
          : "/";
        logger.info(`[DEBUG-AUTH] magic-link: REJECTED, redirecting to ${portalPath}`);
        return res.redirect(portalPath);
      }

      // Mark magic link token as used + create session
      await markCodeUsed(code.id);
      const surgeonEmail = code.portalType === "surgeon" ? code.deliveredTo : undefined;
      const sessionToken = await createPortalSession(
        code.portalType,
        code.portalToken,
        surgeonEmail,
      );
      logger.info(`[DEBUG-AUTH] magic-link SUCCESS: surgeonEmail=${surgeonEmail}, sessionToken=${sessionToken.slice(0,8)}..., portalToken=${code.portalToken.slice(0,8)}...`);

      // Set cookie
      const isHttps = (process.env.NODE_ENV === "production") ||
        !!process.env.PRODUCTION_URL;
      res.cookie("portal_session", sessionToken, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "lax",
        maxAge: 90 * 24 * 60 * 60 * 1000,
        path: "/",
      });

      // Redirect to portal
      return res.redirect(getPortalPath(code.portalType, code.portalToken));
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
      const { code: inputCode, email } = req.body as { code?: string; email?: string };

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

      // For surgeon portal, pass email to find the correct code
      // (multiple surgeons share the same hospital token)
      const deliveredTo = portalType === "surgeon" ? email : undefined;
      const verification = await findActiveVerificationCode(
        portalType,
        token,
        deliveredTo,
      );
      logger.info(`[DEBUG-AUTH] verify-code: portalType=${portalType}, token=${token.slice(0,8)}..., verification found=${!!verification}, deliveredTo=${verification?.deliveredTo || 'N/A'}, attempts=${verification?.attemptCount || 0}`);
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
        logger.info(`[DEBUG-AUTH] verify-code: bcrypt compare FAILED for deliveredTo=${verification.deliveredTo}`);
        return res.status(400).json({ message: "Invalid code" });
      }

      // Success — mark used + create session
      await markCodeUsed(verification.id);
      const surgeonEmail = portalType === "surgeon" ? verification.deliveredTo : undefined;
      const sessionToken = await createPortalSession(portalType, token, surgeonEmail);
      logger.info(`[DEBUG-AUTH] verify-code SUCCESS: surgeonEmail=${surgeonEmail}, sessionToken=${sessionToken.slice(0,8)}...`);

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
