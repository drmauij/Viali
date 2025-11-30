import type { Express } from "express";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import adminRouter from "./admin";
import checklistsRouter from "./checklists";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  app.use(inventoryRouter);
  app.use(adminRouter);
  app.use(checklistsRouter);
  
  // Future domain routers will be added here:
  // app.use(anesthesiaRouter);
  // app.use(ordersRouter);
}
