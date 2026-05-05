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
 *    `req.session.lastActivity` to now; if the gap exceeds the limit, calls
 *    `req.logout` (which regenerates the session in passport 0.6+) and either
 *    returns 401 `IDLE_TIMEOUT` (for `/api/*` requests, so the SPA fetcher can
 *    react) or 302-redirects to `/` (for top-level page navigations, so the
 *    browser lands on the SPA login screen instead of rendering raw JSON).
 *    On every request that passes the check, refreshes `req.session.lastActivity`.
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
    const idleSec = Math.round((now - last) / 1000);
    logger.info(`[IdleTimeout] session ${sid} expired after ${idleSec}s idle`);
    const isApi = req.path.startsWith("/api/");
    req.logout(() => {
      if (isApi) {
        res.status(401).json({ message: "Idle timeout", code: "IDLE_TIMEOUT" });
      } else {
        // Top-level page navigation (refresh, link click): send the browser
        // back to the SPA root so the login screen renders. Returning JSON
        // here would surface raw `{"code":"IDLE_TIMEOUT"}` text in the tab.
        res.redirect("/");
      }
    });
    return;
  }

  req.session.lastActivity = now;
  return next();
};
