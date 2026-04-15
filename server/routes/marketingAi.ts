import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import {
  getCachedAnalysis,
  isFresh,
} from "../storage/marketingAiAnalyses";
import { getOrCreateAnalysis } from "../services/marketingAiAnalyzer";
import { isAuthenticated } from "../auth/google";
import { storage } from "../storage";
import logger from "../logger";

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  force: z.boolean().optional(),
});

function resolveLanguage(req: Request): "en" | "de" {
  const raw =
    (req as any).i18n?.language ??
    (req.headers["accept-language"] as string | undefined) ??
    "en";
  return raw.toLowerCase().startsWith("de") ? "de" : "en";
}

async function rolesForHospital(userId: string, hospitalId: string): Promise<string[]> {
  const hospitals = await storage.getUserHospitals(userId);
  return hospitals.filter(h => h.id === hospitalId).map(h => h.role).filter(Boolean) as string[];
}

async function requireMarketingAccess(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "unauthorized" });
    const { hospitalId } = req.params;
    const roles = await rolesForHospital(userId, hospitalId);
    const allowed = roles.some(r => r === "admin" || r === "manager" || r === "marketing");
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    req.marketingRoles = roles;
    next();
  } catch (err) {
    logger.error({ err }, "marketing ai auth check failed");
    res.status(500).json({ error: "auth_check_failed" });
  }
}

export function registerMarketingAiRoutes(app: Express): void {
  app.get(
    "/api/business/:hospitalId/ai-analysis",
    isAuthenticated,
    requireMarketingAccess,
    async (req: Request, res: Response) => {
      const hospitalId = req.params.hospitalId;
      const startDate = String(req.query.startDate ?? "");
      const endDate = String(req.query.endDate ?? "");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
        startDate > endDate
      ) {
        return void res.status(400).json({ error: "invalid date range" });
      }

      const language = resolveLanguage(req);
      const row = await getCachedAnalysis({
        hospitalId,
        startDate,
        endDate,
        language,
      });
      if (!row) return void res.status(404).json({ error: "no cache" });

      return void res.json({
        payload: row.payload,
        generatedAt: row.generatedAt,
        generatedBy: row.generatedBy,
        cached: true,
        stale: !isFresh(row),
      });
    },
  );

  app.post(
    "/api/business/:hospitalId/ai-analysis",
    isAuthenticated,
    requireMarketingAccess,
    async (req: any, res: Response) => {
      const hospitalId = req.params.hospitalId;

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return void res.status(400).json({ error: "invalid body" });
      const { startDate, endDate, force = false } = parsed.data;
      if (startDate > endDate)
        return void res.status(400).json({ error: "invalid date range" });

      const roles: string[] = req.marketingRoles ?? [];
      if (force && !roles.includes("admin")) {
        return void res.status(403).json({ error: "admin required for regenerate" });
      }

      const userId = req.user?.id;
      try {
        const result = await getOrCreateAnalysis({
          hospitalId,
          startDate,
          endDate,
          language: resolveLanguage(req),
          userId,
          force,
        });
        return void res.json(result);
      } catch (err: any) {
        logger.error({ err }, "marketing ai analysis failed");
        console.error("[marketing-ai] generation failed:", err?.stack ?? err);
        const detail =
          process.env.NODE_ENV !== "production"
            ? { message: err?.message ?? String(err), stack: err?.stack }
            : undefined;
        return void res.status(502).json({ error: "analysis_failed", detail });
      }
    },
  );
}
