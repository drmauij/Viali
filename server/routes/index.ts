import type { Express } from "express";
import express from "express";
import authRouter from "./auth";
import inventoryRouter from "./inventory";
import adminRouter from "./admin";
import adminGroupsRouter from "./adminGroups";
import businessGroupsRouter from "./businessGroups";
import logosRouter from "./logos";
import checklistsRouter from "./checklists";
import anesthesiaRouter from "./anesthesia";
import businessRouter from "./business";
import clinicRouter from "./clinic";
import surgeonChecklistsRouter from "./surgeonChecklists";
import chatRouter from "./chat";
import questionnaireRouter from "./questionnaire";
import camerasRouter from "./cameras";
import billingRouter from "./billing";
import externalSurgeryRouter from "./externalSurgery";
import itemsRouter from "./items";
import ordersRouter from "./orders";
import controlledRouter from "./controlled";
import worklogRouter from "./worklog";
import notesRouter from "./notes";
import aiRouter from "./ai";
import importJobsRouter from "./importJobs";
import hospitalsRouter from "./hospitals";
import dischargeBriefsRouter from "./dischargeBriefs";
import worktimeLogsRouter from "./worktimeLogs";
import kioskRouter from "./kiosk";
import cardReaderRouter from "./cardReader";
import tardocRouter from "./tardoc";
import portalOtpRouter from "./portalOtp";
import surgeonPortalRouter from "./surgeonPortal";
import { patientChatRouter } from "./patientChat";
import searchRouter from "./search";
import leadsRouter from "./leads";
import shiftsRouter from "./shifts";
import websiteRouter from "./website";
import flowsRouter from "./flows";
import marketingUnsubscribeRouter from "./marketingUnsubscribe";
import marketingWebhooksRouter from "./marketingWebhooks";
import publicDocsRouter from "./publicDocs";
import publicOpenApiRouter from "./publicOpenApi";
import publicMcpCardRouter from "./publicMcpCard";
import { registerMarketingAiRoutes } from "./marketingAi";
import treatmentsRouter from "./treatments";
import { chainRouter } from "./chain";
import brandingRouter from "./branding";
import contractTemplatesRouter from "./contractTemplates";

export function registerDomainRoutes(app: Express) {
  app.use(authRouter);
  app.use(inventoryRouter);
  app.use(itemsRouter);
  app.use(ordersRouter);
  // Multi-location groups (platform-admin only). Must be mounted BEFORE
  // adminRouter because adminRouter uses /api/admin/:hospitalId/... which
  // would otherwise swallow /api/admin/groups and /api/admin/hospitals.
  app.use(adminGroupsRouter);
  // Group-admin surface (Task 13). Separate from platform-admin group routes.
  // Mount before businessRouter since businessRouter uses /api/business/:hospitalId/*
  // and would otherwise consume `/api/business/group/*` paths.
  app.use(businessGroupsRouter);
  // Logo upload + public download. Public route (`/api/public/logos/:path`)
  // must beat any `:hospitalId` wildcards downstream.
  app.use(logosRouter);
  // Chain-scoped endpoints (/api/chain/:groupId/*). Gate: group_admin or platform admin.
  // Mounted before adminRouter to avoid any :hospitalId wildcards swallowing /chain paths.
  app.use(chainRouter);
  app.use(adminRouter);
  app.use(checklistsRouter);
  app.use(anesthesiaRouter);
  app.use(businessRouter);
  registerMarketingAiRoutes(app);
  app.use(clinicRouter);
  app.use(surgeonChecklistsRouter);
  app.use(chatRouter);
  app.use(questionnaireRouter);
  app.use(camerasRouter);
  app.use(billingRouter);
  app.use(externalSurgeryRouter);
  app.use(controlledRouter);
  app.use(worklogRouter);
  app.use(notesRouter);
  app.use(aiRouter);
  app.use(importJobsRouter);
  app.use(hospitalsRouter);
  app.use(dischargeBriefsRouter);
  app.use(worktimeLogsRouter);
  app.use(kioskRouter);
  app.use(cardReaderRouter);
  app.use(tardocRouter);
  app.use(portalOtpRouter);
  app.use(surgeonPortalRouter);
  app.use(patientChatRouter);
  app.use(searchRouter);
  app.use(leadsRouter);
  app.use(shiftsRouter);
  app.use(websiteRouter);
  app.use(flowsRouter);
  app.use(marketingUnsubscribeRouter);
  // Resend webhook needs raw body for signature verification.
  app.use("/api/webhooks/resend", express.raw({ type: "*/*" }));
  app.use(marketingWebhooksRouter);
  app.use(publicDocsRouter);
  app.use(publicOpenApiRouter);
  app.use(publicMcpCardRouter);
  app.use(treatmentsRouter);
  // Booking theme save endpoints (PATCH /api/branding/{group,hospital}/:id).
  app.use(brandingRouter);
  // Contract template CRUD (hospital + chain scoped).
  app.use(contractTemplatesRouter);
}
