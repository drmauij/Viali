import { db } from "../db";
import {
  tissueSamples,
  tissueSampleStatusHistory,
  hospitals,
  type TissueSample,
  type TissueSampleStatusHistory,
} from "@shared/schema";
import {
  TISSUE_SAMPLE_TYPES,
  isValidTissueSampleStatus,
  type TissueSampleType,
} from "@shared/tissueSampleTypes";
import {
  generateTissueSampleCode,
  type GenerateCodeDeps,
} from "../lib/tissueSampleCode";
import { eq, sql, desc, asc, or } from "drizzle-orm";

export interface CreateTissueSampleInput {
  hospitalId: string;
  patientId: string;
  sampleType: string;
  notes: string | null;
  extractionSurgeryId?: string | null;
  externalLab?: string | null;
  createdBy: string;
}

export async function createTissueSample(
  input: CreateTissueSampleInput,
): Promise<TissueSample> {
  const typeConfig = TISSUE_SAMPLE_TYPES[input.sampleType as TissueSampleType];
  if (!typeConfig) {
    throw new Error(`Unknown tissue sample type: ${input.sampleType}`);
  }

  // Per-type defaults.
  const initialStatus = typeConfig.initialStatus || "Probe entnommen";
  const externalLab = input.externalLab ?? null;

  return db.transaction(async (tx) => {
    let createdId: string | null = null;

    const deps: GenerateCodeDeps = {
      readHospitalConfig: async (hospitalId) => {
        const [row] = await tx
          .select({
            sampleCodePrefix: hospitals.sampleCodePrefix,
            timezone: hospitals.timezone,
          })
          .from(hospitals)
          .where(eq(hospitals.id, hospitalId));
        return {
          sampleCodePrefix: row?.sampleCodePrefix ?? null,
          timezone: row?.timezone ?? "Europe/Zurich",
        };
      },
      readNextSequence: async (hospitalId, sampleType) => {
        // NB: in a JS template literal, `\d` collapses to `d`. Use a character
        // class so the POSIX regex hits the trailing digits of the code suffix.
        const result = await tx.execute(sql`
          SELECT COALESCE(
            MAX(CAST(SUBSTRING(code FROM '[0-9]+$') AS INT)),
            0
          ) + 1 AS next_seq
          FROM tissue_samples
          WHERE hospital_id = ${hospitalId} AND sample_type = ${sampleType}
        `);
        const row = (result as any).rows?.[0];
        return Number(row?.next_seq ?? 1);
      },
      tryInsertCode: async (code) => {
        const [row] = await tx
          .insert(tissueSamples)
          .values({
            hospitalId: input.hospitalId,
            patientId: input.patientId,
            sampleType: input.sampleType,
            code,
            status: initialStatus,
            statusDate: new Date(),
            notes: input.notes,
            extractionSurgeryId: input.extractionSurgeryId ?? null,
            externalLab,
            createdBy: input.createdBy,
          })
          .returning();
        createdId = row.id;
      },
      now: () => new Date(),
    };

    await generateTissueSampleCode(
      { hospitalId: input.hospitalId, sampleType: input.sampleType },
      deps,
    );

    if (!createdId) {
      throw new Error("Sample insert did not return an id");
    }

    await tx.insert(tissueSampleStatusHistory).values({
      sampleId: createdId,
      fromStatus: null,
      toStatus: initialStatus,
      changedBy: input.createdBy,
    });

    const [sample] = await tx
      .select()
      .from(tissueSamples)
      .where(eq(tissueSamples.id, createdId));
    return sample;
  });
}

export interface UpdateTissueSampleInput {
  notes?: string | null;
  externalLab?: string | null;
  reimplantSurgeryId?: string | null;
  extractionSurgeryId?: string | null;
}

export async function updateTissueSample(
  id: string,
  input: UpdateTissueSampleInput,
): Promise<TissueSample> {
  // If reimplantSurgeryId is being set, validate the type supports reimplant.
  if (input.reimplantSurgeryId) {
    const [existing] = await db
      .select({ sampleType: tissueSamples.sampleType })
      .from(tissueSamples)
      .where(eq(tissueSamples.id, id));
    if (!existing) throw new Error("Sample not found");
    const typeConfig = TISSUE_SAMPLE_TYPES[existing.sampleType as TissueSampleType];
    if (!typeConfig?.supportsReimplant) {
      const e: any = new Error("Type does not support reimplant linkage");
      e.code = "REIMPLANT_NOT_SUPPORTED";
      throw e;
    }
  }
  const [updated] = await db
    .update(tissueSamples)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(tissueSamples.id, id))
    .returning();
  return updated;
}

export interface TransitionStatusInput {
  sampleId: string;
  toStatus: string;
  changedBy: string;
  note?: string | null;
}

export async function transitionTissueSampleStatus(
  input: TransitionStatusInput,
): Promise<TissueSample> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(tissueSamples)
      .where(eq(tissueSamples.id, input.sampleId));
    if (!current) throw new Error("Sample not found");

    if (!isValidTissueSampleStatus(current.sampleType, input.toStatus)) {
      const e: any = new Error(
        `invalid status "${input.toStatus}" for type ${current.sampleType}`,
      );
      e.code = "INVALID_STATUS";
      throw e;
    }

    await tx.insert(tissueSampleStatusHistory).values({
      sampleId: input.sampleId,
      fromStatus: current.status,
      toStatus: input.toStatus,
      changedBy: input.changedBy,
      note: input.note ?? null,
    });

    const [updated] = await tx
      .update(tissueSamples)
      .set({
        status: input.toStatus,
        statusDate: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tissueSamples.id, input.sampleId))
      .returning();
    return updated;
  });
}

export async function getTissueSamplesByPatient(
  patientId: string,
): Promise<TissueSample[]> {
  return db
    .select()
    .from(tissueSamples)
    .where(eq(tissueSamples.patientId, patientId))
    .orderBy(desc(tissueSamples.createdAt));
}

export async function getTissueSamplesBySurgery(
  surgeryId: string,
): Promise<TissueSample[]> {
  return db
    .select()
    .from(tissueSamples)
    .where(
      or(
        eq(tissueSamples.extractionSurgeryId, surgeryId),
        eq(tissueSamples.reimplantSurgeryId, surgeryId),
      ),
    )
    .orderBy(desc(tissueSamples.createdAt));
}

export async function getTissueSampleWithHistory(
  id: string,
): Promise<{ sample: TissueSample; history: TissueSampleStatusHistory[] } | null> {
  const [sample] = await db
    .select()
    .from(tissueSamples)
    .where(eq(tissueSamples.id, id));
  if (!sample) return null;
  const history = await db
    .select()
    .from(tissueSampleStatusHistory)
    .where(eq(tissueSampleStatusHistory.sampleId, id))
    .orderBy(asc(tissueSampleStatusHistory.changedAt));
  return { sample, history };
}
