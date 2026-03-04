import * as Sentry from "@sentry/node";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import { startWorker } from "./worker";
import { backfillChecklistTemplateAssignments } from "./storage/checklists";
import { cleanupExpiredPortalData } from "./storage/portalOtp";
import logger from "./logger";

// Initialize Sentry for backend error monitoring
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 0.1,
  });
  logger.info("[Sentry] Backend monitoring initialized");
}

// Get the directory of the current module (works in both dev and production)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// In production (dist/), go up one level to find migrations
// In development (server/), go up one level to find migrations
const migrationsPath = path.resolve(__dirname, "..", "migrations");

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      connectSrc: ["'self'", "wss:", "ws://localhost:21965", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => !req.path.startsWith('/api'),
  message: { message: 'Too many requests, please try again later.' },
});
app.use(apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts, please try again later.' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many AI requests, please try again later.' },
});
app.use('/api/analyze-monitor', aiLimiter);
app.use('/api/items/analyze-image', aiLimiter);
app.use('/api/items/analyze-images', aiLimiter);
app.use('/api/items/analyze-codes', aiLimiter);
app.use('/api/items/analyze-bulk-codes', aiLimiter);
app.use('/api/transcribe-voice', aiLimiter);
app.use('/api/parse-drug-command', aiLimiter);
app.use('/api/translate', aiLimiter);

declare module 'http' {
  interface IncomingMessage {
    rawBody: Buffer
  }
}

// Stripe webhook needs raw body - register it before JSON parsing
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use((req, res, next) => {
  // Skip JSON parsing for webhook endpoint (already handled with raw body above)
  if (req.path === '/api/billing/webhook') {
    return next();
  }
  express.json({
    limit: '50mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    }
  })(req, res, next);
});
app.use(express.urlencoded({ extended: false, limit: '50mb' }));
app.use(cookieParser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Run Drizzle migrations on startup.
    // Drizzle's migrate() is fast when nothing to do (single SELECT).
    // All migration SQL files MUST be idempotent (IF NOT EXISTS, etc.).
    try {
      log(`Running database migrations from: ${migrationsPath}`);
      await migrate(db, { migrationsFolder: migrationsPath });
      log("✓ Database migrations completed");
    } catch (error: any) {
      log(`✗ Migration failed: ${error.message}`);
      throw error;
    }

    try {
      await backfillChecklistTemplateAssignments();
    } catch (err) {
      logger.warn("Checklist assignment backfill skipped or failed:", err);
    }

    const server = await registerRoutes(app);

    app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Report server errors to Sentry (4xx and 5xx)
      Sentry.captureException(err, {
        tags: {
          type: "api_error",
          status: status,
          method: req.method,
          path: req.path,
        },
        extra: {
          query: req.query,
          userId: (req as any).user?.id,
        },
      });

      res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || '5000', 10);
    
    server.listen({
      port,
      host: "0.0.0.0",
      reusePort: true,
    }, () => {
      log(`serving on port ${port}`);
      
      // Start background worker for processing jobs (bulk imports, price syncs)
      startWorker();

      // Clean up expired portal verification codes and sessions every hour
      setInterval(() => {
        cleanupExpiredPortalData().catch((err) =>
          logger.error("[PortalOTP] Cleanup failed:", err),
        );
      }, 60 * 60 * 1000);
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      logger.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${port} is already in use`);
      }
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  logger.error('Unhandled error during server startup:', error);
  process.exit(1);
});
