// Concept-aware reader for clinic-customized illness lists.
//
// Scoring code MUST go through this helper rather than reading well-known IDs
// like `heartIllnesses.hypertension` directly — those IDs are clinic-renameable.
//
// `findConcept` returns true iff the patient's illness data contains a checked
// item whose `scoringConcept` is the requested concept. Items without an explicit
// (admin-confirmed) `scoringConcept` are ignored — never use a heuristic
// suggestion to feed the score.

import type { ScoringConcept } from "./concepts";

export type IllnessItemLike = {
  id: string;
  scoringConcept?: ScoringConcept | string | null;
};

export function findConcept(
  illnessData: Record<string, unknown> | null | undefined,
  itemList: ReadonlyArray<IllnessItemLike> | null | undefined,
  concept: ScoringConcept,
): boolean {
  if (!illnessData || !itemList || itemList.length === 0) return false;
  for (const item of itemList) {
    if (item.scoringConcept === concept && illnessData[item.id] === true) {
      return true;
    }
  }
  return false;
}
