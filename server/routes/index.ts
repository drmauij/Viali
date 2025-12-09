import type { Express } from "express";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import adminRouter from "./admin";
import checklistsRouter from "./checklists";
import anesthesiaRouter from "./anesthesia";
import businessRouter from "./business";
import clinicRouter from "./clinic";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  app.use(inventoryRouter);
  app.use(adminRouter);
  app.use(checklistsRouter);
  app.use(anesthesiaRouter);
  app.use(businessRouter);
  app.use(clinicRouter);
}
