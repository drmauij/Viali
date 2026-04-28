// server/seed/backfillExistingContracts.ts
import { db } from "../db";
import { workerContracts, contractTemplates, hospitals } from "@shared/schema";
import { and, eq, isNull } from "drizzle-orm";
import { ON_CALL_V1_KEY } from "./contractTemplateStarters";
import { randomUUID } from "node:crypto";
import type { TemplateBody, ContractData } from "@shared/contractTemplates/types";

interface BackfillResult { migrated: number; skippedNoTemplate: number; }

async function findStarterFor(hospitalId: string) {
  const [hospital] = await db.select().from(hospitals).where(eq(hospitals.id, hospitalId));
  if (!hospital) return undefined;

  if (hospital.groupId) {
    const [tmpl] = await db.select().from(contractTemplates).where(and(
      eq(contractTemplates.ownerChainId, hospital.groupId),
      eq(contractTemplates.starterKey, ON_CALL_V1_KEY),
    ));
    if (tmpl) return { hospital, template: tmpl };
  }
  const [tmpl] = await db.select().from(contractTemplates).where(and(
    eq(contractTemplates.ownerHospitalId, hospitalId),
    eq(contractTemplates.starterKey, ON_CALL_V1_KEY),
  ));
  return tmpl ? { hospital, template: tmpl } : undefined;
}

export async function backfillExistingContracts(opts: { dryRun?: boolean } = {}): Promise<BackfillResult> {
  const rows = await db.select().from(workerContracts).where(isNull(workerContracts.templateSnapshot));

  let migrated = 0;
  let skippedNoTemplate = 0;

  for (const row of rows) {
    const found = await findStarterFor(row.hospitalId);
    if (!found) { skippedNoTemplate++; continue; }
    const { hospital, template } = found;

    const variables = template.variables as TemplateBody["variables"];
    const roleOption = variables.selectableLists
      .find((l) => l.key === "role")
      ?.options.find((o) => o.id === row.role);
    if (!roleOption) { skippedNoTemplate++; continue; }

    const data: ContractData = {
      company:  { name: (hospital as Record<string, unknown>).companyName ?? "", address: "", jurisdiction: "Zürich" },
      worker: {
        firstName: row.firstName, lastName: row.lastName,
        street: row.street, postalCode: row.postalCode, city: row.city,
        phone: row.phone ?? "", email: row.email,
        dateOfBirth: row.dateOfBirth, iban: row.iban,
      },
      role: { ...roleOption },
      contract: { signedAt: row.workerSignedAt?.toISOString().slice(0, 10) ?? null },
    };

    const snapshot: TemplateBody = { blocks: template.blocks as TemplateBody["blocks"], variables };

    if (!opts.dryRun) {
      await db.update(workerContracts).set({
        templateId: template.id,
        templateSnapshot: snapshot,
        data,
        publicToken: row.publicToken ?? randomUUID(),
      }).where(eq(workerContracts.id, row.id));
    }
    migrated++;
  }

  return { migrated, skippedNoTemplate };
}
