import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, getSessionMiddleware } from "./auth/google";
import { initSocketIO } from "./socket";
import { registerDomainRoutes } from "./routes/index";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  await setupAuth(app);
  
  const sessionMiddleware = getSessionMiddleware();
  initSocketIO(httpServer, sessionMiddleware);

  registerDomainRoutes(app);

  return httpServer;
}
