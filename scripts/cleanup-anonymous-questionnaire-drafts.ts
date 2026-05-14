import "dotenv/config";
import { db } from "../server/db";
import { patientQuestionnaireLinks, patientQuestionnaireResponses } from "@shared/schema";
import { and, isNull, ne, inArray } from "drizzle-orm";

// One-shot maintenance script. Open hospital-link questionnaires (those with
// patientId IS NULL) used to autosave server-side, so any visitor or bot that
// hit the public URL produced a row pair (link + response) that lived forever
// even when the visitor never submitted. The client now persists those drafts
// to localStorage instead, so this script purges the legacy orphan rows.
//
// Safe to re-run. Only touches links with no patient AND no successful submit.
// Submitted unassociated questionnaires (status='submitted') stay — clinic
// staff still needs to associate them with a patient.

export interface CleanupStats { scannedLinks: number; deletedLinks: number; deletedResponses: number; }

export async function cleanupAnonymousDrafts(): Promise<CleanupStats> {
  const orphanLinks = await db
    .select({ id: patientQuestionnaireLinks.id })
    .from(patientQuestionnaireLinks)
    .where(and(
      isNull(patientQuestionnaireLinks.patientId),
      ne(patientQuestionnaireLinks.status, "submitted"),
      ne(patientQuestionnaireLinks.status, "reviewed"),
    ));
  const linkIds = orphanLinks.map((l) => l.id);
  if (linkIds.length === 0) {
    return { scannedLinks: 0, deletedLinks: 0, deletedResponses: 0 };
  }

  const deletedResponses = await db
    .delete(patientQuestionnaireResponses)
    .where(inArray(patientQuestionnaireResponses.linkId, linkIds))
    .returning({ id: patientQuestionnaireResponses.id });

  const deletedLinks = await db
    .delete(patientQuestionnaireLinks)
    .where(inArray(patientQuestionnaireLinks.id, linkIds))
    .returning({ id: patientQuestionnaireLinks.id });

  return {
    scannedLinks: linkIds.length,
    deletedLinks: deletedLinks.length,
    deletedResponses: deletedResponses.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupAnonymousDrafts()
    .then((s) => { console.log(JSON.stringify(s)); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
