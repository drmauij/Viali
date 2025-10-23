import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "../storage";
import { Pool } from "pg";
import { seedHospitalData } from "../seed-hospital";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  
  // Create a pool with SSL configuration for PostgreSQL
  // Only accept self-signed certificates if explicitly configured
  const sslConfig = process.env.DATABASE_URL?.includes('sslmode=require')
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' }
    : undefined;
  
  const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig
  });
  
  const sessionStore = new pgStore({
    pool: sessionPool,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: sessionTtl,
    },
  });
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
    
    console.log(`[Auth] Created and seeded new hospital for user ${user.id}`);
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
    console.log('[Auth] Setting up Google OAuth strategy');
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: getCallbackURL(),
      scope: ['profile', 'email']
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        const user = await upsertUser(profile);
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
        console.error('[Auth] Error during Google OAuth:', error);
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
      (req, res) => {
        // Successful authentication, redirect home
        res.redirect("/");
      }
    );
  } else {
    console.log('[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
    
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
    req.logout((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
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
