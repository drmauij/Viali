import { Router, type Response } from "express";
import { z } from "zod";
import { db } from "../db";
import { workerContracts, contractTemplates, hospitals, hospitalGroups } from "@shared/schema";
import { eq, and, isNull } from "drizzle-orm";
import rateLimit from "express-rate-limit";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import { buildZodSchema } from "@shared/contractTemplates/buildZodSchema";
import { randomUUID } from "node:crypto";
import type { TemplateBody, ContractData } from "@shared/contractTemplates/types";
import logger from "../logger";
import { assertHospitalCanAccessTemplate } from "./contractTemplates";

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

      if (!await assertHospitalCanAccessTemplate(tmpl, req.params.hospitalId)) {
        return res.status(403).json({ error: "forbidden" });
      }

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

    const [hospital] = await db
      .select()
      .from(hospitals)
      .where(eq(hospitals.id, row.hospitalId));

    const variables = tmpl.variables as TemplateBody["variables"];
    const prefill = injectAuto(
      (row.data ?? {}) as Record<string, unknown>,
      variables,
      hospital,
    );

    res.json({
      contractId: row.id,
      template: {
        id: tmpl.id,
        name: tmpl.name,
        language: tmpl.language,
        blocks: tmpl.blocks,
        variables,
      },
      prefill,
      regional: regionalFromHospital(hospital),
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
    if (!parsed.success) {
      return res.status(400).json({
        message: "Ungültige Eingabe.",
        error: parsed.error.flatten(),
      });
    }

    const variables = tmpl.variables as TemplateBody["variables"];
    const dataValidator = buildZodSchema(variables);
    const dataParsed = dataValidator.safeParse(parsed.data.data);
    if (!dataParsed.success) {
      return res.status(400).json({
        message: "Bitte alle Pflichtfelder ausfüllen.",
        error: dataParsed.error.flatten(),
      });
    }

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

// ───────── Path B: per-template shareable link (uses legacy hospital token) ─────────

// Rate limit: max 3 submissions per token per 24 hours.
// Scoped per legacy hospital token (not per requester IP) to mirror the
// existing in-memory rate limiter pattern on the legacy endpoint.
const pathBLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3,
  keyGenerator: (req) => req.params.token,
  standardHeaders: true,
  legacyHeaders: false,
  // In-memory store is fine — same pattern as the legacy Map-based limiter in business.ts
});

router.get("/api/public/contracts/t/:token", async (req, res) => {
  try {
    const resolved = await resolveTemplateAndHospital(req.params.token);
    if (!resolved) return res.status(404).end();
    const { tmpl, hospital } = resolved;

    const variables = tmpl.variables as TemplateBody["variables"];
    const prefill = injectAuto({}, variables, hospital);

    res.json({
      template: {
        id: tmpl.id,
        name: tmpl.name,
        language: tmpl.language,
        blocks: tmpl.blocks,
        variables,
      },
      prefill,
      regional: regionalFromHospital(hospital),
      mode: "shareable",
    });
  } catch (error) {
    logger.error("Error fetching shareable contract template:", error);
    res.status(500).json({ message: "Failed to fetch template" });
  }
});

router.post("/api/public/contracts/t/:token/submit", pathBLimiter, async (req, res) => {
  try {
    const resolved = await resolveTemplateAndHospital(req.params.token);
    if (!resolved) return res.status(404).end();
    const { tmpl, hospitalId, hospital } = resolved;

    const parsed = submitInput.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Ungültige Eingabe.",
        error: parsed.error.flatten(),
      });
    }

    const variables = tmpl.variables as TemplateBody["variables"];
    const dataParsed = buildZodSchema(variables).safeParse(parsed.data.data);
    if (!dataParsed.success) {
      return res.status(400).json({
        message: "Bitte alle Pflichtfelder ausfüllen.",
        error: dataParsed.error.flatten(),
      });
    }

    const finalData = injectAuto(parsed.data.data, variables, hospital);
    const snapshot: TemplateBody = {
      blocks: tmpl.blocks as TemplateBody["blocks"],
      variables,
    };

    // Map role to legacy enum — same logic as Path A
    const rawRole = (finalData as any)?.role?.id ?? "awr_nurse";
    const legacyRoleMap: Record<string, string> = {
      awr_nurse: "awr_nurse",
      anesthesia_nurse: "anesthesia_nurse",
      anesthesia_doctor: "anesthesia_doctor",
      op_nurse: "awr_nurse",
    };
    const legacyRole = legacyRoleMap[rawRole] ?? "awr_nurse";

    const [created] = await db
      .insert(workerContracts)
      .values({
        hospitalId,
        templateId: tmpl.id,
        templateSnapshot: snapshot,
        data: finalData,
        workerSignature: parsed.data.workerSignature,
        workerSignatureLocation: parsed.data.workerSignatureLocation,
        workerSignedAt: new Date(),
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
      } as any)
      .returning();

    res.status(200).json({ ok: true, contractId: created.id });
  } catch (error) {
    logger.error("Error submitting shareable contract:", error);
    res.status(500).json({ message: "Failed to submit contract" });
  }
});

// Resolves a token to a template (per-template share token first, then legacy hospital token).
async function resolveTemplateByLegacyToken(token: string) {
  const r = await resolveTemplateAndHospital(token);
  return r?.tmpl;
}

// Token resolution order:
//   1. contract_templates.public_token  → that template + a hospital that can own it
//   2. hospitals.contract_token         → seeded on_call_v1 template (legacy fallback)
async function resolveTemplateAndHospital(token: string) {
  // (1) Per-template share token
  const [tmplByToken] = await db
    .select()
    .from(contractTemplates)
    .where(
      and(
        eq(contractTemplates.publicToken, token),
        isNull(contractTemplates.archivedAt),
      ),
    );

  if (tmplByToken) {
    // Pick a hospital that owns/can-own this template, so injectAuto has hospital context.
    let hospital: any | undefined;
    if (tmplByToken.ownerHospitalId) {
      [hospital] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.id, tmplByToken.ownerHospitalId));
    } else if (tmplByToken.ownerChainId) {
      [hospital] = await db
        .select()
        .from(hospitals)
        .where(eq(hospitals.groupId, tmplByToken.ownerChainId));
    }
    if (!hospital) return undefined;
    return { tmpl: tmplByToken, hospitalId: hospital.id, hospital };
  }

  // (2) Legacy hospital token → seeded on_call_v1 template
  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.contractToken, token));
  if (!hospital) return undefined;

  // Chain-owned template (preferred)
  if (hospital.groupId) {
    const [t] = await db
      .select()
      .from(contractTemplates)
      .where(
        and(
          eq(contractTemplates.ownerChainId, hospital.groupId),
          eq(contractTemplates.starterKey, "on_call_v1"),
          isNull(contractTemplates.archivedAt),
        ),
      );
    if (t) return { tmpl: t, hospitalId: hospital.id, hospital };
  }

  // Hospital-owned template (fallback)
  const [t] = await db
    .select()
    .from(contractTemplates)
    .where(
      and(
        eq(contractTemplates.ownerHospitalId, hospital.id),
        eq(contractTemplates.starterKey, "on_call_v1"),
        isNull(contractTemplates.archivedAt),
      ),
    );
  if (t) return { tmpl: t, hospitalId: hospital.id, hospital };

  return undefined;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Regional preferences relevant for the public worker form (date format, locale, etc.).
// Falls back to European/24h/de if the hospital hasn't configured them.
function regionalFromHospital(hospital: any): {
  dateFormat: "european" | "american";
  hourFormat: "24h" | "12h";
  timezone: string;
  defaultLanguage: string;
  currency: string;
} {
  return {
    dateFormat: hospital?.dateFormat === "american" ? "american" : "european",
    hourFormat: hospital?.hourFormat === "12h" ? "12h" : "24h",
    timezone: hospital?.timezone || "Europe/Zurich",
    defaultLanguage: hospital?.defaultLanguage || "de",
    currency: hospital?.currency || "CHF",
  };
}

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
      // Special compose: "address" → companyStreet + companyPostalCode + companyCity
      // (use the billing/company address, not the clinic location street/city columns).
      if (field === "address" && hospital) {
        const parts = [
          hospital.companyStreet,
          [hospital.companyPostalCode, hospital.companyCity]
            .filter(Boolean)
            .join(" "),
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
