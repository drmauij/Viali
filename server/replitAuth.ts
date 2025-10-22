import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { storage } from "./storage";
import { Pool } from "pg";

if (!process.env.REPLIT_DOMAINS) {
  throw new Error("Environment variable REPLIT_DOMAINS not provided");
}

const getOidcConfig = memoize(
  async () => {
    return await client.discovery(
      new URL(process.env.ISSUER_URL ?? "https://replit.com/oidc"),
      process.env.REPL_ID!
    );
  },
  { maxAge: 3600 * 1000 }
);

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
    pool: sessionPool, // Pass configured pool
    createTableIfMissing: false,
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
      secure: true,
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(
  claims: any,
) {
  const userId = claims["sub"];
  
  const user = await storage.upsertUser({
    id: userId,
    email: claims["email"],
    firstName: claims["first_name"],
    lastName: claims["last_name"],
    profileImageUrl: claims["profile_image_url"],
  });

  // Check if user has any hospitals assigned - use the returned user's id (handles email conflict)
  const userHospitals = await storage.getUserHospitals(user.id);
  
  // If user has no hospitals, create one and assign them as admin (like signup flow)
  if (userHospitals.length === 0) {
    const firstName = claims["first_name"] || "User";
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

    // Assign user as admin to the first location (Anesthesy) - use the returned user's id
    await storage.createUserHospitalRole({
      userId: user.id,
      hospitalId: hospital.id,
      locationId: anesthesyLocation.id,
      role: "admin",
    });
  }
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    await upsertUser(tokens.claims());
    verified(null, user);
  };

  const domains = new Set<string>();
  for (const domain of process.env.REPLIT_DOMAINS!.split(",")) {
    const trimmed = domain.trim();
    domains.add(trimmed);
    
    // Add all domain variants
    if (trimmed.endsWith('.replit.dev')) {
      // Replace .replit.dev with .repl.co
      domains.add(trimmed.replace('.replit.dev', '.repl.co'));
    }
  }

  console.log('[Auth] Registering strategies for domains:', Array.from(domains));

  for (const domain of Array.from(domains)) {
    const strategy = new Strategy(
      {
        name: `replitauth:${domain}`,
        config,
        scope: "openid email profile offline_access",
        callbackURL: `https://${domain}/api/callback`,
      },
      verify,
    );
    passport.use(strategy);
  }

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    console.log(`[Auth] Login requested for hostname: ${req.hostname}, strategy: ${strategyName}`);
    console.log(`[Auth] Full URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    passport.authenticate(strategyName, {
      prompt: "login consent",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    const strategyName = `replitauth:${req.hostname}`;
    console.log(`[Auth] Callback received for hostname: ${req.hostname}, strategy: ${strategyName}`);
    console.log(`[Auth] Callback URL: ${req.protocol}://${req.get('host')}${req.originalUrl}`);
    console.log(`[Auth] Query params:`, req.query);
    passport.authenticate(strategyName, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect(
        client.buildEndSessionUrl(config, {
          client_id: process.env.REPL_ID!,
          post_logout_redirect_uri: `${req.protocol}://${req.hostname}`,
        }).href
      );
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    // Check if user must change password (except for password change endpoints)
    const isPasswordChangeEndpoint = req.path === '/api/auth/change-password' || req.path === '/api/auth/user';
    if (user.mustChangePassword && !isPasswordChangeEndpoint) {
      return res.status(403).json({ 
        message: "Password change required", 
        mustChangePassword: true 
      });
    }
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (error) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
};
