import type { Express } from "express";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import adminRouter from "./admin";
import checklistsRouter from "./checklists";
import anesthesiaRouter from "./anesthesia";
import businessRouter from "./business";
import clinicRouter from "./clinic";
import surgeonChecklistsRouter from "./surgeonChecklists";
import chatRouter from "./chat";
import questionnaireRouter from "./questionnaire";
import camerasRouter from "./cameras";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  app.use(inventoryRouter);
  app.use(adminRouter);
  app.use(checklistsRouter);
  app.use(anesthesiaRouter);
  app.use(businessRouter);
  app.use(clinicRouter);
  app.use(surgeonChecklistsRouter);
  app.use(chatRouter);
  app.use(questionnaireRouter);
  app.use(camerasRouter);
}
