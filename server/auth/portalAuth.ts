import type { Request, Response, NextFunction } from "express";
import { findPortalSession } from "../storage/portalOtp";
import logger from "../logger";

type PortalType = "patient" | "worklog" | "surgeon";

/**
 * Factory returning Express middleware that checks for a valid portal session cookie.
 * If valid → next(). Otherwise → 403 { requiresVerification: true }.
 */
export function requirePortalVerification(portalType: PortalType) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const portalToken = req.params.token;
      if (!portalToken) {
        return res.status(400).json({ message: "Missing portal token" });
      }

      const sessionToken = req.cookies?.portal_session;
      if (!sessionToken) {
        return res
          .status(403)
          .json({ requiresVerification: true, portalType });
      }

      const valid = await findPortalSession(
        sessionToken,
        portalType,
        portalToken,
      );
      if (!valid) {
        return res
          .status(403)
          .json({ requiresVerification: true, portalType });
      }

      next();
    } catch (error) {
      logger.error("[PortalAuth] Error checking portal session:", error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
}

/** Masks email: "jo***@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, 2);
  return `${visible}***@${domain}`;
}

/** Masks phone: shows last 4 digits: "******1234" */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return "•".repeat(phone.length - 4) + phone.slice(-4);
}
