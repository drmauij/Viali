import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, Request, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "../storage";
import type { InsertLoginAuditLog } from "@shared/schema";
import { Pool } from "pg";
import { seedHospitalData } from "../seed-hospital";
import logger from "../logger";

/** Extract IP + user-agent from request and log an auth event. Fire-and-forget. */
function logAuthEvent(req: Request, event: Omit<InsertLoginAuditLog, 'ipAddress' | 'userAgent'>) {
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'unknown';
  const userAgent = req.headers['user-agent'] || null;
  storage.createLoginAuditLog({ ...event, ipAddress, userAgent }).catch(err => {
    logger.error('[Auth] Failed to write login audit log:', err);
  });
}

let sessionMiddleware: ReturnType<typeof session> | null = null;

export function getSession() {
  if (sessionMiddleware) {
    return sessionMiddleware;
  }
  
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  
  // Create a pool with SSL configuration for PostgreSQL
  // Accept self-signed certificates (for Exoscale, Aiven, etc.)
  const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false,
    },
  });
  
  const sessionStore = new pgStore({
    pool: sessionPool,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  // Use secure cookies when PRODUCTION_URL is HTTPS
  const isHttps = process.env.PRODUCTION_URL?.startsWith('https://') || false;
  
  sessionMiddleware = session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isHttps,
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  });
  
  return sessionMiddleware;
}

export function getSessionMiddleware() {
  return getSession();
}

async function upsertUser(profile: any) {
  const userId = profile.id;
  
  const user = await storage.upsertUser({
    id: userId,
    email: profile.emails?.[0]?.value || profile.email,
    firstName: profile.name?.givenName || profile.given_name,
    lastName: profile.name?.familyName || profile.family_name,
    profileImageUrl: profile.photos?.[0]?.value || profile.picture,
  });

  // Check if user has any hospitals assigned
  const userHospitals = await storage.getUserHospitals(user.id);
  
  // If user has no hospitals, create one and seed it with default data
  if (userHospitals.length === 0) {
    const firstName = profile.name?.givenName || profile.given_name || "User";
    const hospitalName = `${firstName}'s Hospital`;
    
    // Create hospital
    const hospital = await storage.createHospital(hospitalName);

    // Seed hospital with default data (locations, surgery rooms, admin groups, medications)
    // This includes: 4 locations, 3 surgery rooms, 5 admin groups, and 13 medications
    await seedHospitalData(hospital.id, user.id);
    
    logger.info(`[Auth] Created and seeded new hospital for user ${user.id}`);
  }
  
  return user;
}

// Check if Google OAuth is configured
export function isGoogleOAuthConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  // Get callback URL from environment or construct from request
  const getCallbackURL = () => {
    const baseUrl = process.env.PRODUCTION_URL || 'http://localhost:5000';
    return `${baseUrl}/api/auth/google/callback`;
  };

  const googleConfigured = isGoogleOAuthConfigured();

  // Setup Google OAuth strategy if credentials are provided
  if (googleConfigured) {
    logger.info('[Auth] Setting up Google OAuth strategy');
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: getCallbackURL(),
      scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertUser(profile);
        
        // Check if user is allowed to login
        if (user.archivedAt) {
          return done(null, false, { message: "Your account has been deactivated. Please contact an administrator." });
        }
        if (user.canLogin === false) {
          return done(null, false, { message: "Your account is not enabled for app access." });
        }
        
        // Store minimal user info in session
        done(null, {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          profileImageUrl: user.profileImageUrl,
          expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 1 week
        });
      } catch (error: any) {
        logger.error('[Auth] Error during Google OAuth:', error);
        done(error);
      }
    }));

    // Google OAuth routes - only mount if configured
    app.get("/api/auth/google", 
      passport.authenticate("google", { 
        scope: ["profile", "email"] 
      })
    );

    app.get("/api/auth/google/callback",
      passport.authenticate("google", {
        failureRedirect: "/login",
      }),
      async (req, res) => {
        // Log successful Google login
        const user = req.user as any;
        if (user?.id) {
          let hospitalId: string | null = null;
          try {
            const hospitals = await storage.getUserHospitals(user.id);
            if (hospitals.length > 0) hospitalId = hospitals[0].id;
          } catch { /* best effort */ }
          logAuthEvent(req, { userId: user.id, email: user.email || 'unknown', eventType: 'google_login_success', hospitalId });
        }
        res.redirect("/");
      }
    );
  } else {
    logger.info('[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
    
    // Return 503 Service Unavailable when Google OAuth is not configured
    app.get("/api/auth/google", (req, res) => {
      res.status(503).json({ 
        message: "Google OAuth is not configured on this server. Please use email/password login or contact your administrator." 
      });
    });

    app.get("/api/auth/google/callback", (req, res) => {
      res.status(503).json({ 
        message: "Google OAuth is not configured on this server." 
      });
    });
  }

  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });

  app.get("/api/logout", (req, res) => {
    const user = req.user as any;
    if (user?.id) {
      logAuthEvent(req, { userId: user.id, email: user.email || 'unknown', eventType: 'logout' });
    }
    req.logout((err) => {
      if (err) {
        logger.error('[Auth] Logout error:', err);
      }
      res.redirect("/");
    });
  });

  // API endpoint to check if Google OAuth is available
  app.get("/api/auth/google/status", (req, res) => {
    res.json({ available: googleConfigured });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // Check if user account has been archived (invalidate existing sessions)
  try {
    const dbUser = await storage.getUser(user.id);
    if (!dbUser || dbUser.archivedAt) {
      req.logout(() => {});
      return res.status(401).json({ message: "Your account has been deactivated." });
    }
  } catch {
    // If DB lookup fails, allow request to proceed rather than lock out all users
  }

  // Check if user must change password (for local auth users)
  const isPasswordChangeEndpoint = req.path === '/api/auth/change-password' || req.path === '/api/auth/user';
  if (user.mustChangePassword && !isPasswordChangeEndpoint) {
    return res.status(403).json({
      message: "Password change required",
      mustChangePassword: true
    });
  }

  return next();
};
