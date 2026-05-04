import type { RequestHandler } from "express";
import { storage } from "../storage";
import logger from "../logger";

/**
 * Idle-timeout middleware for staff sessions. Mount AFTER passport / express-session
 * but BEFORE route handlers. Behaviour:
 *
 *  - For unauthenticated requests: passes through.
 *  - For authenticated requests: looks up the user's first hospital, reads
 *    `idleTimeoutMinutes`. If 0 (disabled), passes through. Otherwise, compares
 *    `req.session.lastActivity` to now; if the gap exceeds the limit, destroys
 *    the session and returns 401 with code `IDLE_TIMEOUT`. On every request that
 *    passes the check, refreshes `req.session.lastActivity`.
 *
 *  - Skips the `/api/auth/user` and `/api/auth/idle-config` polls so the client
 *    can detect idle timeout without resetting the timer itself.
 *  - Skips the `/api/logout` endpoint (always allowed).
 */

const SKIP_PATHS = new Set<string>([
  "/api/auth/user",
  "/api/auth/idle-config",
  "/api/logout",
]);

declare module "express-session" {
  interface SessionData {
    lastActivity?: number;
  }
}

export const enforceIdleTimeout: RequestHandler = async (req, res, next) => {
  // Pass through for unauthenticated traffic — let route-level isAuthenticated
  // decide what to do.
  if (!req.isAuthenticated?.() || !req.user) {
    return next();
  }

  if (SKIP_PATHS.has(req.path)) {
    return next();
  }

  const user = req.user as { id: string };

  let timeoutMinutes = 0;
  try {
    // `storage.getUser` returns a plain `User` row (no hospitals embedded).
    // The canonical shape used by `/api/auth/user` is `storage.getUserHospitals`,
    // which returns `Hospital`-extended rows — so we read `idleTimeoutMinutes`
    // directly off the first one and skip a second `getHospital` round-trip.
    const hospitals = await storage.getUserHospitals(user.id);
    timeoutMinutes = hospitals[0]?.idleTimeoutMinutes ?? 0;
  } catch (err) {
    logger.warn("[IdleTimeout] hospital lookup failed; allowing request", err);
    return next();
  }

  if (timeoutMinutes <= 0) {
    return next();
  }

  const now = Date.now();
  const last = req.session.lastActivity;
  const limitMs = timeoutMinutes * 60_000;

  if (last && now - last > limitMs) {
    const sid = req.sessionID;
    req.logout(() => {
      req.session.destroy(() => {
        res.status(401).json({ message: "Idle timeout", code: "IDLE_TIMEOUT" });
      });
    });
    logger.info(`[IdleTimeout] session ${sid} expired after ${Math.round((now - last) / 1000)}s idle`);
    return;
  }

  req.session.lastActivity = now;
  return next();
};
