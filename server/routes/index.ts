import type { Express } from "express";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import adminRouter from "./admin";
import checklistsRouter from "./checklists";
import anesthesiaRouter from "./anesthesia";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  app.use(inventoryRouter);
  app.use(adminRouter);
  app.use(checklistsRouter);
  app.use(anesthesiaRouter);
  
  // Future domain routers will be added here:
  // app.use(ordersRouter);
}
