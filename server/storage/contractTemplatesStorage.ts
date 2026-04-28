// server/storage/contractTemplatesStorage.ts
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { contractTemplates, hospitals, type ContractTemplate, type InsertContractTemplate } from "@shared/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import type { TemplateBody } from "@shared/contractTemplates/types";

function newShareToken(): string {
  return randomUUID().replace(/-/g, "");
}

export async function listForHospital(hospitalId: string): Promise<ContractTemplate[]> {
  // Hospital sees: all chain-owned templates of its chain (if any), plus its own.
  const [hospital] = await db.select({ groupId: hospitals.groupId }).from(hospitals).where(eq(hospitals.id, hospitalId));
  const chainId = hospital?.groupId ?? null;

  return db.select().from(contractTemplates).where(
    and(
      isNull(contractTemplates.archivedAt),
      or(
        eq(contractTemplates.ownerHospitalId, hospitalId),
        chainId ? eq(contractTemplates.ownerChainId, chainId) : undefined,
      )!,
    ),
  );
}

export async function listForChain(chainId: string): Promise<ContractTemplate[]> {
  return db.select().from(contractTemplates).where(
    and(eq(contractTemplates.ownerChainId, chainId), isNull(contractTemplates.archivedAt)),
  );
}

export async function getById(id: string): Promise<ContractTemplate | undefined> {
  const [row] = await db.select().from(contractTemplates).where(eq(contractTemplates.id, id));
  return row;
}

export async function create(input: InsertContractTemplate): Promise<ContractTemplate> {
  const [row] = await db
    .insert(contractTemplates)
    .values({ publicToken: newShareToken(), ...input })
    .returning();
  return row;
}

export async function getByPublicToken(token: string): Promise<ContractTemplate | undefined> {
  const [row] = await db
    .select()
    .from(contractTemplates)
    .where(eq(contractTemplates.publicToken, token));
  return row;
}

export async function regeneratePublicToken(id: string): Promise<ContractTemplate> {
  const [row] = await db
    .update(contractTemplates)
    .set({ publicToken: newShareToken(), updatedAt: new Date() })
    .where(eq(contractTemplates.id, id))
    .returning();
  return row;
}

export async function update(id: string, patch: Partial<InsertContractTemplate>): Promise<ContractTemplate> {
  const [row] = await db.update(contractTemplates)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(contractTemplates.id, id))
    .returning();
  return row;
}

export async function archive(id: string): Promise<void> {
  await db.update(contractTemplates).set({ archivedAt: new Date(), status: "archived" }).where(eq(contractTemplates.id, id));
}

// Clones a template (chain or hospital owned) into a new hospital-owned row (override),
// returning the new row. Caller decides ownership (hospital or chain).
export async function cloneInto(
  source: ContractTemplate,
  ownership: { ownerHospitalId?: string; ownerChainId?: string },
  newName?: string,
): Promise<ContractTemplate> {
  return create({
    ownerHospitalId: ownership.ownerHospitalId ?? null,
    ownerChainId:    ownership.ownerChainId    ?? null,
    name: newName ?? `${source.name} (copy)`,
    description: source.description,
    language: source.language,
    status: "draft",
    blocks: source.blocks,
    variables: source.variables,
    isStarterClone: source.isStarterClone,
    starterKey: source.starterKey,
    // publicToken is intentionally omitted — `create` generates a fresh one
  } as InsertContractTemplate);
}
