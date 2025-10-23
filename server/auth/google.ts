import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";
import { storage } from "../storage";
import { Pool } from "pg";

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  
  // Create a pool with SSL configuration for custom PostgreSQL servers (e.g., Exoscale)
  const sessionPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false // Accept self-signed certificates
    }
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
  
  // If user has no hospitals, create one and assign them as admin
  if (userHospitals.length === 0) {
    const firstName = profile.name?.givenName || profile.given_name || "User";
    const hospitalName = `${firstName}'s Hospital`;
    
    // Create hospital
    const hospital = await storage.createHospital(hospitalName);

    // Create 4 default locations
    const anesthesyLocation = await storage.createLocation({
      hospitalId: hospital.id,
      name: "Anesthesy",
      type: "anesthesy",
      parentId: null,
    });
    
    await storage.createLocation({
      hospitalId: hospital.id,
      name: "Operating Room (OR)",
      type: "or",
      parentId: null,
    });
    
    await storage.createLocation({
      hospitalId: hospital.id,
      name: "Emergency Room (ER)",
      type: "er",
      parentId: null,
    });
    
    await storage.createLocation({
      hospitalId: hospital.id,
      name: "Intensive Care Unit (ICU)",
      type: "icu",
      parentId: null,
    });

    // Assign user as admin to the first location (Anesthesy)
    await storage.createUserHospitalRole({
      userId: user.id,
      hospitalId: hospital.id,
      locationId: anesthesyLocation.id,
      role: "admin",
    });
  }
  
  return user;
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

  // Setup Google OAuth strategy if credentials are provided
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    console.log('[Auth] Setting up Google OAuth strategy');
    
    passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
  } else {
    console.log('[Auth] Google OAuth not configured (missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET)');
  }

  passport.serializeUser((user: any, done) => {
    done(null, user);
  });

  passport.deserializeUser((user: any, done) => {
    done(null, user);
  });

  // Google OAuth routes
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

  app.get("/api/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error('[Auth] Logout error:', err);
      }
      res.redirect("/");
    });
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
