import { db } from "../db";
import {
  tissueSampleExternalLabs,
  type TissueSampleExternalLab,
  type InsertTissueSampleExternalLab,
} from "@shared/schema";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";

export interface ListLabsOptions {
  sampleType?: string;
  includeArchived?: boolean;
}

/**
 * Returns active labs for a hospital, optionally filtered by sample type.
 * A lab matches a type if its `applicableSampleTypes` is null/empty
 * (universal) OR contains the requested type.
 *
 * Order: `is_default DESC, name ASC` so the default lab appears first.
 */
export async function listTissueSampleLabs(
  hospitalId: string,
  opts: ListLabsOptions = {},
): Promise<TissueSampleExternalLab[]> {
  const { sampleType, includeArchived = false } = opts;

  const conds: any[] = [eq(tissueSampleExternalLabs.hospitalId, hospitalId)];
  if (!includeArchived) {
    conds.push(eq(tissueSampleExternalLabs.isArchived, false));
  }

  if (sampleType) {
    // A lab matches if applicable_sample_types is null OR empty array OR contains the type.
    conds.push(
      sql`(
        ${tissueSampleExternalLabs.applicableSampleTypes} IS NULL
        OR COALESCE(array_length(${tissueSampleExternalLabs.applicableSampleTypes}, 1), 0) = 0
        OR ${tissueSampleExternalLabs.applicableSampleTypes} && ARRAY[${sampleType}]::text[]
      )`,
    );
  }

  return db
    .select()
    .from(tissueSampleExternalLabs)
    .where(and(...conds))
    .orderBy(
      desc(tissueSampleExternalLabs.isDefault),
      asc(tissueSampleExternalLabs.name),
    );
}

export async function getTissueSampleLab(
  id: string,
): Promise<TissueSampleExternalLab | null> {
  const [row] = await db
    .select()
    .from(tissueSampleExternalLabs)
    .where(eq(tissueSampleExternalLabs.id, id));
  return row ?? null;
}

/**
 * Two labs "overlap" if either has null/empty applicableSampleTypes
 * (universal) OR they share at least one element.
 *
 * The clear-siblings query is run inside the supplied transaction so the
 * default-singleton invariant holds under concurrency.
 *
 * @param tx        Drizzle transaction handle (or top-level db).
 * @param hospitalId Scope.
 * @param types     Types of the new/updated row (null/empty = universal).
 * @param excludeId If set, skip this id (used during UPDATE so the row
 *                  we're about to write isn't accidentally cleared).
 */
async function clearOverlappingDefaults(
  tx: any,
  hospitalId: string,
  types: string[] | null | undefined,
  excludeId: string | null,
): Promise<void> {
  // Normalize: an empty array is the same as null/universal.
  const isUniversal = !types || types.length === 0;

  if (isUniversal) {
    // Universal default — clear ALL non-archived siblings (every existing lab
    // overlaps a universal lab by definition).
    if (excludeId) {
      await tx.execute(sql`
        UPDATE tissue_sample_external_labs
           SET is_default = false, updated_at = now()
         WHERE hospital_id = ${hospitalId}
           AND is_archived = false
           AND id <> ${excludeId}
      `);
    } else {
      await tx.execute(sql`
        UPDATE tissue_sample_external_labs
           SET is_default = false, updated_at = now()
         WHERE hospital_id = ${hospitalId}
           AND is_archived = false
      `);
    }
    return;
  }

  // Specific types — clear siblings that are universal OR share at least one type.
  // Build the Postgres ARRAY[...] literal explicitly via sql.join: passing a JS
  // array as a single bind parameter trips pg's "malformed array literal" path
  // because the column is text[], not the JSON-equivalent.
  const typesArr = types as string[];
  const arrayLiteral = sql`ARRAY[${sql.join(
    typesArr.map((t) => sql`${t}`),
    sql`, `,
  )}]::text[]`;
  if (excludeId) {
    await tx.execute(sql`
      UPDATE tissue_sample_external_labs
         SET is_default = false, updated_at = now()
       WHERE hospital_id = ${hospitalId}
         AND is_archived = false
         AND id <> ${excludeId}
         AND (
           applicable_sample_types IS NULL
           OR COALESCE(array_length(applicable_sample_types, 1), 0) = 0
           OR applicable_sample_types && ${arrayLiteral}
         )
    `);
  } else {
    await tx.execute(sql`
      UPDATE tissue_sample_external_labs
         SET is_default = false, updated_at = now()
       WHERE hospital_id = ${hospitalId}
         AND is_archived = false
         AND (
           applicable_sample_types IS NULL
           OR COALESCE(array_length(applicable_sample_types, 1), 0) = 0
           OR applicable_sample_types && ${arrayLiteral}
         )
    `);
  }
}

export async function createTissueSampleLab(
  input: InsertTissueSampleExternalLab,
): Promise<TissueSampleExternalLab> {
  return db.transaction(async (tx) => {
    if (input.isDefault) {
      await clearOverlappingDefaults(
        tx,
        input.hospitalId,
        input.applicableSampleTypes ?? null,
        null,
      );
    }
    const [row] = await tx
      .insert(tissueSampleExternalLabs)
      .values(input)
      .returning();
    return row;
  });
}

export interface UpdateLabInput {
  name?: string;
  applicableSampleTypes?: string[] | null;
  contact?: string | null;
  isDefault?: boolean;
  isArchived?: boolean;
}

export async function updateTissueSampleLab(
  id: string,
  input: UpdateLabInput,
): Promise<TissueSampleExternalLab> {
  return db.transaction(async (tx) => {
    if (input.isDefault === true) {
      // Need the hospital + the (possibly updated) types of the row to
      // determine overlap. Read current state first.
      const [current] = await tx
        .select()
        .from(tissueSampleExternalLabs)
        .where(eq(tissueSampleExternalLabs.id, id));
      if (!current) throw new Error("Lab not found");

      // If the caller is also changing applicableSampleTypes in the same
      // request, use the new value for overlap detection — otherwise the
      // existing one.
      const types =
        "applicableSampleTypes" in input
          ? input.applicableSampleTypes ?? null
          : current.applicableSampleTypes ?? null;

      await clearOverlappingDefaults(tx, current.hospitalId, types, id);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name;
    if ("applicableSampleTypes" in input) {
      patch.applicableSampleTypes = input.applicableSampleTypes;
    }
    if ("contact" in input) patch.contact = input.contact;
    if (input.isDefault !== undefined) patch.isDefault = input.isDefault;
    if (input.isArchived !== undefined) patch.isArchived = input.isArchived;

    const [row] = await tx
      .update(tissueSampleExternalLabs)
      .set(patch)
      .where(eq(tissueSampleExternalLabs.id, id))
      .returning();
    if (!row) throw new Error("Lab not found");
    return row;
  });
}

/**
 * Soft-delete: sets isArchived=true AND isDefault=false (an archived lab
 * cannot be the default for any new sample).
 */
export async function archiveTissueSampleLab(
  id: string,
): Promise<TissueSampleExternalLab> {
  const [row] = await db
    .update(tissueSampleExternalLabs)
    .set({ isArchived: true, isDefault: false, updatedAt: new Date() })
    .where(eq(tissueSampleExternalLabs.id, id))
    .returning();
  if (!row) throw new Error("Lab not found");
  return row;
}
