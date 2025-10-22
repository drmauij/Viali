import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./db";

const app = express();

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
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
    // Run database migrations automatically on startup
    log("Running database migrations...");
    try {
      // Check if users table exists (indicates schema is already set up)
      const checkSchema = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public'
          AND table_name = 'users'
        );
      `);
      
      const schemaExists = checkSchema.rows[0]?.exists;
      
      if (schemaExists) {
        // Schema exists - ensure migrations tracking is set up before running migrate()
        await pool.query(`CREATE SCHEMA IF NOT EXISTS drizzle;`);
        await pool.query(`
          CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
          );
        `);
        
        // Check if baseline migration is tracked
        const checkBaseline = await pool.query(`
          SELECT EXISTS (
            SELECT FROM drizzle.__drizzle_migrations 
            WHERE hash = '0000_broken_liz_osborn'
          );
        `);
        
        if (!checkBaseline.rows[0]?.exists) {
          // Mark baseline as complete so migrate() won't try to rerun it
          await pool.query(`
            INSERT INTO drizzle.__drizzle_migrations (hash, created_at) 
            VALUES ('0000_broken_liz_osborn', ${Date.now()});
          `);
          log("✓ Existing schema baselined for migration tracking");
        }
      }
      
      // Always run migrate() to apply any new migrations
      await migrate(db, { migrationsFolder: "./migrations" });
      log("✓ Database migrations completed successfully");
    } catch (error: any) {
      console.error("FATAL: Database migration failed:", error);
      throw new Error(`Failed to run database migrations: ${error.message}`);
    }

    const server = await registerRoutes(app);

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      res.status(status).json({ message });
      throw err;
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
    });

    // Handle server errors
    server.on('error', (error: NodeJS.ErrnoException) => {
      console.error('Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`Port ${port} is already in use`);
      }
      process.exit(1);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  console.error('Unhandled error during server startup:', error);
  process.exit(1);
});
