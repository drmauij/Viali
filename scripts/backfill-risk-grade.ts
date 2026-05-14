import { db } from "../server/db";
import { surgeries } from "@shared/schema";
import { and, eq, gte, ne } from "drizzle-orm";
import { computeRiskSnapshot } from "../server/scoring/computePerioperativeRisk";
import { storage } from "../server/storage";
import { getHospitalAnesthesiaSettings } from "../server/storage/anesthesia";

export interface BackfillStats {
  scanned: number;
  updated: number;
  skipped: number;
}

type IllnessLists = Record<string, Array<{ id: string; scoringConcept?: string | null }>>;

function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

function snapshotsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  try {
    const ax = { ...(a as Record<string, unknown>) };
    const bx = { ...(b as Record<string, unknown>) };
    delete ax.calculatedAt;
    delete bx.calculatedAt;
    return canonicalStringify(ax) === canonicalStringify(bx);
  } catch {
    return false;
  }
}

export async function backfillRiskGrade(): Promise<BackfillStats> {
  const stats: BackfillStats = { scanned: 0, updated: 0, skipped: 0 };

  const rows = await db
    .select()
    .from(surgeries)
    .where(and(
      gte(surgeries.plannedDate, new Date()),
      ne(surgeries.status, "cancelled"),
    ));

  const settingsCache = new Map<string, IllnessLists>();

  for (const surgery of rows) {
    stats.scanned += 1;
    if (!surgery.surgeryRiskClass || !surgery.patientId) {
      stats.skipped += 1;
      continue;
    }
    const patient = await storage.getPatient(surgery.patientId);
    if (!patient) {
      stats.skipped += 1;
      continue;
    }

    let illnessLists = settingsCache.get(surgery.hospitalId);
    if (!illnessLists) {
      const settings = await getHospitalAnesthesiaSettings(surgery.hospitalId);
      illnessLists = (settings?.illnessLists ?? {}) as IllnessLists;
      settingsCache.set(surgery.hospitalId, illnessLists);
    }

    const assessment = await storage.getSurgeryPreOpAssessment(surgery.id).catch(() => null);
    const questionnaire = await storage.getLatestQuestionnaireResponseForPatient(surgery.patientId).catch(() => null);

    const snapshot = computeRiskSnapshot(patient, surgery, assessment ?? null, questionnaire ?? null, illnessLists);

    if (surgery.riskGrade === snapshot.grade && snapshotsEqual(surgery.perioperativeRisk, snapshot)) {
      stats.skipped += 1;
      continue;
    }

    await db
      .update(surgeries)
      .set({ riskGrade: snapshot.grade, perioperativeRisk: snapshot as any })
      .where(eq(surgeries.id, surgery.id));
    stats.updated += 1;
  }

  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  backfillRiskGrade()
    .then((s) => {
      console.log(JSON.stringify(s));
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
