import { Router, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { workerContracts, contractTemplates, hospitals } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import { randomUUID } from "node:crypto";
import type { TemplateBody, ContractData } from "@shared/contractTemplates/types";
import logger from "../logger";

// ---------------------------------------------------------------------------
// Auth middleware (mirrors the pattern in contractTemplates.ts / business.ts)
// ---------------------------------------------------------------------------

/** Hospital-level gate: user must have admin/manager/group_admin at the target hospital. */
async function isBusinessManager(req: any, res: Response, next: any) {
  try {
    const userId = req.user?.id;
    const { hospitalId } = req.params;
    const userHospitals = await storage.getUserHospitals(userId);
    const hasAccess = userHospitals.some(
      (h) =>
        h.id === hospitalId &&
        (h.role === "admin" || h.role === "manager" || h.role === "group_admin"),
    );
    if (!hasAccess) {
      return res.status(403).json({ message: "Business manager access required" });
    }
    next();
  } catch (error) {
    logger.error("Error checking business manager access:", error);
    res.status(500).json({ message: "Failed to verify access" });
  }
}

const router = Router();

// ───────── Path A: Manager creates draft → single-use token URL ─────────

const createInput = z.object({
  templateId: z.string(),
  prefill: z.record(z.string(), z.any()).optional(),
});

router.post(
  "/api/business/:hospitalId/contracts",
  isAuthenticated,
  isBusinessManager,
  async (req, res) => {
    const parsed = createInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    try {
      const [tmpl] = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.id, parsed.data.templateId));
      if (!tmpl) return res.status(404).json({ error: "template not found" });

      const [created] = await db
        .insert(workerContracts)
        .values({
          hospitalId: req.params.hospitalId,
          templateId: tmpl.id,
          publicToken: randomUUID(),
          data: (parsed.data.prefill ?? {}) as ContractData,
          // Legacy denormalized columns: required NOT NULL — populated with
          // placeholders now and overwritten at submit time from data.worker.*
          firstName: "",
          lastName: "",
          street: "",
          postalCode: "",
          city: "",
          email: (parsed.data.prefill as any)?.worker?.email ?? "",
          dateOfBirth: "1970-01-01",
          iban: "",
          // Legacy role enum only supports: awr_nurse, anesthesia_nurse, anesthesia_doctor
          // The real value lives in data.role.id. Placeholder until submit.
          role: "awr_nurse",
          status: "pending_manager_signature",
        } as any)
        .returning();

      res.status(201).json({ ...created, templateSnapshot: null });
    } catch (error) {
      logger.error("Error creating contract draft:", error);
      res.status(500).json({ message: "Failed to create contract draft" });
    }
  },
);

// ───────── Public: fetch contract by single-use token ─────────

router.get("/api/public/contracts/c/:token", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.publicToken, req.params.token));

    if (!row) return res.status(404).end();
    if (row.workerSignedAt) return res.status(410).json({ error: "token already used" });

    const [tmpl] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, row.templateId!));
    if (!tmpl) return res.status(500).json({ error: "template missing" });

    res.json({
      contractId: row.id,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        language: tmpl.language,
        blocks: tmpl.blocks,
        variables: tmpl.variables,
      },
      prefill: row.data ?? {},
      mode: "single-use",
    });
  } catch (error) {
    logger.error("Error fetching contract by token:", error);
    res.status(500).json({ message: "Failed to fetch contract" });
  }
});

// ───────── Public: submit contract by single-use token ─────────

const submitInput = z.object({
  data: z.record(z.string(), z.any()),
  workerSignature: z.string().min(1),
  workerSignatureLocation: z.string().min(1),
});

router.post("/api/public/contracts/c/:token/submit", async (req, res) => {
  try {
    const [row] = await db
      .select()
      .from(workerContracts)
      .where(eq(workerContracts.publicToken, req.params.token));

    if (!row) return res.status(404).end();
    // Single-use enforcement: 410 on any attempt after first successful submit
    if (row.workerSignedAt) return res.status(410).json({ error: "token already used" });

    const [tmpl] = await db
      .select()
      .from(contractTemplates)
      .where(eq(contractTemplates.id, row.templateId!));
    if (!tmpl) return res.status(500).json({ error: "template missing" });

    const parsed = submitInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    const variables = tmpl.variables as TemplateBody["variables"];
    const dataValidator = buildZodSchema(variables);
    const dataParsed = dataValidator.safeParse(parsed.data.data);
    if (!dataParsed.success) return res.status(400).json({ error: dataParsed.error.flatten() });

    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, row.hospitalId));

    const finalData = injectAuto(parsed.data.data, variables, hospital);

    // Snapshot is frozen at submit time — template edits after this point do not affect it
    const snapshot: TemplateBody = {
      blocks: tmpl.blocks as TemplateBody["blocks"],
      variables,
    };

    // Map the role value to a legacy enum-safe value.
    // The legacy "role" column only accepts: awr_nurse, anesthesia_nurse, anesthesia_doctor
    // If the worker chose "op_nurse" (valid in the template system but not in the legacy enum),
    // we store "awr_nurse" as the closest legacy match. The real value is preserved in data.role.id.
    const rawRole = (finalData as any)?.role?.id ?? "awr_nurse";
    const legacyRoleMap: Record<string, string> = {
      awr_nurse: "awr_nurse",
      anesthesia_nurse: "anesthesia_nurse",
      anesthesia_doctor: "anesthesia_doctor",
      op_nurse: "awr_nurse", // op_nurse is not in the legacy enum; nearest match
    };
    const legacyRole = legacyRoleMap[rawRole] ?? "awr_nurse";

    await db
      .update(workerContracts)
      .set({
        templateSnapshot: snapshot,
        data: finalData,
        workerSignature: parsed.data.workerSignature,
        workerSignatureLocation: parsed.data.workerSignatureLocation,
        workerSignedAt: new Date(),
        // Populate legacy denormalized columns from data.worker.*
        firstName: ((finalData as any).worker?.firstName ?? "") as string,
        lastName: ((finalData as any).worker?.lastName ?? "") as string,
        street: ((finalData as any).worker?.street ?? "") as string,
        postalCode: ((finalData as any).worker?.postalCode ?? "") as string,
        city: ((finalData as any).worker?.city ?? "") as string,
        email: ((finalData as any).worker?.email ?? "") as string,
        phone: ((finalData as any).worker?.phone ?? null) as string | null,
        dateOfBirth: ((finalData as any).worker?.dateOfBirth ?? "1970-01-01") as string,
        iban: ((finalData as any).worker?.iban ?? "") as string,
        role: legacyRole as any,
        status: "pending_manager_signature",
        // Note: we intentionally keep publicToken intact so that a second attempt
        // by the same URL returns 410 ("already used") rather than 404 ("not found").
        // Single-use is enforced by the workerSignedAt timestamp check above.
      } as any)
      .where(eq(workerContracts.id, row.id));

    res.status(200).json({ ok: true });
  } catch (error) {
    logger.error("Error submitting contract:", error);
    res.status(500).json({ message: "Failed to submit contract" });
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function injectAuto(
  input: Record<string, any>,
  vars: TemplateBody["variables"],
  hospital: any,
): ContractData {
  const out: any = structuredClone(input ?? {});
  for (const v of vars.simple) {
    if (!v.source) continue;
    let value: unknown;
    if (v.source === "auto:now") {
      value = new Date().toISOString().slice(0, 10);
    } else if (v.source.startsWith("auto:hospital.")) {
      const field = v.source.slice("auto:hospital.".length);
      // Special compose: "address" → street + postalCode + city
      if (field === "address" && hospital) {
        const parts = [
          hospital.street,
          [hospital.postalCode, hospital.city].filter(Boolean).join(" "),
        ].filter(Boolean);
        value = parts.join(", ");
      } else {
        value = hospital?.[field] ?? "";
      }
    }
    setByPath(out, v.key, value);
  }
  return out;
}

function setByPath(obj: any, key: string, value: unknown) {
  const parts = key.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cursor[parts[i]] = cursor[parts[i]] ?? {};
    cursor = cursor[parts[i]];
  }
  cursor[parts[parts.length - 1]] = value;
}

export default router;
