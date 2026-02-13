import * as Sentry from "@sentry/node";
import express, { type Request, Response, NextFunction } from "express";
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
  contentSecurityPolicy: false,
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
    // Check if migrations are needed before running them
    const fs = await import('fs');
    const metaPath = path.join(migrationsPath, 'meta', '_journal.json');
    
    let shouldRunMigrations = true;
    
    try {
      // First check if __drizzle_migrations table exists
      const tableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = '__drizzle_migrations'
        )
      `);
      
      const migrationsTableExists = tableCheck.rows[0]?.exists;
      
      if (migrationsTableExists && fs.existsSync(metaPath)) {
        const journal = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        const allMigrations = journal.entries || [];
        
        const result = await db.execute(sql`SELECT hash FROM __drizzle_migrations`);
        const appliedTags = new Set(result.rows.map((r: any) => r.hash));
        
        const unappliedMigrations = allMigrations.filter(
          (m: any) => !appliedTags.has(m.tag)
        );
        
        if (unappliedMigrations.length === 0) {
          log(`✓ Database up-to-date (${allMigrations.length} migrations applied)`);
          shouldRunMigrations = false;
        } else {
          log(`Found ${unappliedMigrations.length} pending migrations`);
        }
      }
    } catch (checkError: any) {
      log(`Migration check failed, will run full migration: ${checkError.message}`);
    }
    
    if (shouldRunMigrations) {
      try {
        log(`Running database migrations from: ${migrationsPath}`);
        await migrate(db, { migrationsFolder: migrationsPath });
        log("✓ Database migrations completed successfully");
      } catch (error: any) {
        // Handle migration failures gracefully
        if (error.message && error.message.includes('already exists')) {
          log("⚠ Migration encountered existing schema - recovering...");
          
          try {
            // First check if __drizzle_migrations table exists
            const tableCheck = await db.execute(sql`
              SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = '__drizzle_migrations'
              )
            `);
            
            const migrationsTableExists = tableCheck.rows[0]?.exists;
            
            if (!migrationsTableExists) {
              log("   Creating migration tracking table...");
              
              await db.execute(sql`
                CREATE TABLE IF NOT EXISTS __drizzle_migrations (
                  id SERIAL PRIMARY KEY,
                  hash text NOT NULL UNIQUE,
                  created_at bigint
                )
              `);
              
              if (fs.existsSync(metaPath)) {
                const journal = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const allMigrations = journal.entries || [];
                
                log(`   Marking ${allMigrations.length} existing migrations as applied...`);
                
                for (const migration of allMigrations) {
                  const timestamp = Date.now();
                  await db.execute(sql.raw(`
                    INSERT INTO __drizzle_migrations (hash, created_at)
                    VALUES ('${migration.tag}', ${timestamp})
                    ON CONFLICT (hash) DO NOTHING
                  `));
                }
                
                log("✓ Migration tracking initialized");
              }
            } else {
              // Migrations table exists, run unapplied idempotent migrations
              if (fs.existsSync(metaPath)) {
                const journal = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                const allMigrations = journal.entries || [];
                
                const result = await db.execute(sql`SELECT hash FROM __drizzle_migrations`);
                const appliedTags = new Set(result.rows.map((r: any) => r.hash));
                
                const unappliedMigrations = allMigrations.filter(
                  (m: any) => !appliedTags.has(m.tag)
                );
                
                if (unappliedMigrations.length > 0) {
                  for (const migration of unappliedMigrations) {
                    const migrationFile = path.join(migrationsPath, `${migration.tag}.sql`);
                    
                    if (fs.existsSync(migrationFile)) {
                      const migrationSql = fs.readFileSync(migrationFile, 'utf-8');
                      const statements = migrationSql
                        .split('--> statement-breakpoint')
                        .map((s: string) => s.trim())
                        .filter((s: string) => s.length > 0);
                      
                      log(`   Running: ${migration.tag}`);
                      
                      for (const statement of statements) {
                        try {
                          await db.execute(sql.raw(statement));
                        } catch (stmtError: any) {
                          if (!stmtError.message?.includes('already exists') && 
                              !stmtError.message?.includes('duplicate key')) {
                            log(`   ⚠ ${stmtError.message}`);
                          }
                        }
                      }
                    }
                    
                    const timestamp = Date.now();
                    await db.execute(sql.raw(`
                      INSERT INTO __drizzle_migrations (hash, created_at)
                      VALUES ('${migration.tag}', ${timestamp})
                      ON CONFLICT (hash) DO NOTHING
                    `));
                  }
                  
                  log("✓ Migrations synchronized");
                }
              }
            }
          } catch (recoveryError: any) {
            log("⚠ Could not auto-recover migration state:", recoveryError.message);
          }
        } else {
          log("✗ Migration failed with error:", error.message);
          throw error;
        }
      }
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
