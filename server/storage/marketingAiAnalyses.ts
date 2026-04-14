import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import {
  marketingAiAnalyses,
  type MarketingAiAnalysis,
  type MarketingAiAnalysisPayload,
} from "@shared/schema";

export interface CacheLookup {
  hospitalId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  language: "en" | "de";
}

export async function getCachedAnalysis(
  args: CacheLookup,
): Promise<MarketingAiAnalysis | null> {
  const rows = await db
    .select()
    .from(marketingAiAnalyses)
    .where(
      and(
        eq(marketingAiAnalyses.hospitalId, args.hospitalId),
        eq(marketingAiAnalyses.startDate, args.startDate),
        eq(marketingAiAnalyses.endDate, args.endDate),
        eq(marketingAiAnalyses.language, args.language),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertArgs extends CacheLookup {
  payload: MarketingAiAnalysisPayload;
  inputHash: string;
  generatedBy: string;
}

export async function upsertAnalysis(
  args: UpsertArgs,
): Promise<MarketingAiAnalysis> {
  const [row] = await db
    .insert(marketingAiAnalyses)
    .values({
      hospitalId: args.hospitalId,
      startDate: args.startDate,
      endDate: args.endDate,
      language: args.language,
      payload: args.payload,
      inputHash: args.inputHash,
      generatedBy: args.generatedBy,
    })
    .onConflictDoUpdate({
      target: [
        marketingAiAnalyses.hospitalId,
        marketingAiAnalyses.startDate,
        marketingAiAnalyses.endDate,
        marketingAiAnalyses.language,
      ],
      set: {
        payload: args.payload,
        inputHash: args.inputHash,
        generatedAt: new Date(),
        generatedBy: args.generatedBy,
      },
    })
    .returning();
  return row;
}

export async function pruneOldAnalyses(olderThanDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
  await db
    .delete(marketingAiAnalyses)
    .where(lt(marketingAiAnalyses.generatedAt, cutoff));
}

export function isFresh(row: MarketingAiAnalysis, ttlDays = 7): boolean {
  const age = Date.now() - new Date(row.generatedAt).getTime();
  return age < ttlDays * 24 * 60 * 60 * 1000;
}
