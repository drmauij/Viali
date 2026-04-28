// server/seed/seedContractTemplates.ts
import { randomUUID } from "node:crypto";
import { db } from "../db";
import { contractTemplates, hospitalGroups, hospitals } from "@shared/schema";
import { eq, isNull } from "drizzle-orm";
import { STARTERS } from "./contractTemplateStarters";

function newShareToken(): string {
  return randomUUID().replace(/-/g, "");
}

async function ownerHasTemplate(filter: { ownerChainId?: string; ownerHospitalId?: string }): Promise<boolean> {
  const where = filter.ownerChainId
    ? eq(contractTemplates.ownerChainId, filter.ownerChainId)
    : eq(contractTemplates.ownerHospitalId, filter.ownerHospitalId!);
  const [row] = await db.select({ id: contractTemplates.id }).from(contractTemplates).where(where).limit(1);
  return !!row;
}

export async function seedStartersForChain(chainId: string): Promise<void> {
  if (await ownerHasTemplate({ ownerChainId: chainId })) return;
  for (const s of STARTERS) {
    await db.insert(contractTemplates).values({
      ownerChainId: chainId,
      name: s.name,
      language: s.language,
      status: "active",
      blocks: s.body.blocks,
      variables: s.body.variables,
      isStarterClone: true,
      starterKey: s.key,
      publicToken: newShareToken(),
    });
  }
}

export async function seedStartersForHospital(hospitalId: string): Promise<void> {
  if (await ownerHasTemplate({ ownerHospitalId: hospitalId })) return;
  for (const s of STARTERS) {
    await db.insert(contractTemplates).values({
      ownerHospitalId: hospitalId,
      name: s.name,
      language: s.language,
      status: "active",
      blocks: s.body.blocks,
      variables: s.body.variables,
      isStarterClone: true,
      starterKey: s.key,
      publicToken: newShareToken(),
    });
  }
}

/** Idempotent: ensures every chain has starters, and every standalone hospital (no group) has starters. */
export async function seedAllOwners(): Promise<{ chainsSeeded: number; hospitalsSeeded: number }> {
  let chainsSeeded = 0;
  let hospitalsSeeded = 0;

  const chains = await db.select({ id: hospitalGroups.id }).from(hospitalGroups);
  for (const c of chains) {
    const before = await ownerHasTemplate({ ownerChainId: c.id });
    await seedStartersForChain(c.id);
    if (!before) chainsSeeded++;
  }

  const standalone = await db.select({ id: hospitals.id }).from(hospitals).where(isNull(hospitals.groupId));
  for (const h of standalone) {
    const before = await ownerHasTemplate({ ownerHospitalId: h.id });
    await seedStartersForHospital(h.id);
    if (!before) hospitalsSeeded++;
  }

  return { chainsSeeded, hospitalsSeeded };
}
