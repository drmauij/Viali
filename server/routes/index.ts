import type { Express } from "express";
import authRouter from "./auth";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  
  // Future domain routers will be added here:
  // app.use(inventoryRouter);
  // app.use(anesthesiaRouter);
  // app.use(adminRouter);
  // app.use(checklistsRouter);
  // app.use(ordersRouter);
}
