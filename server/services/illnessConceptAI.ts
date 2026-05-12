// AI-assisted scoring-concept suggester. Sends a batch of illness-list items
// to Claude and asks for a {itemId → ScoringConcept | null} mapping.
//
// Used by the admin illness-list editor when the heuristic suggester can't
// classify a clinic-custom item. Suggestions are surfaced as "proposed" in the
// UI — the admin must confirm before scoring reads them.

import logger from "../logger";
import { SCORING_CONCEPTS, SCORING_CONCEPT_LABELS, type ScoringConcept } from "@shared/scoring/concepts";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type ConceptSuggestItem = {
  id: string;
  label: string;
  labelTranslations?: Record<string, string> | null;
};

export type ConceptSuggestion = {
  itemId: string;
  suggestedConcept: ScoringConcept | null;
};

const CONCEPT_LIST_LINES = SCORING_CONCEPTS.map(
  (c) => `- ${c}: ${SCORING_CONCEPT_LABELS[c]}`,
).join("\n");

const SYSTEM_PROMPT = `You map clinic-customized medical illness/history items to a fixed clinical scoring taxonomy.

Each input item has an id and human label (sometimes translated). For each item, you return ONE of the concept IDs below, or null if no concept applies (e.g. dental items, generic infectious diseases without a scoring meaning).

Valid concepts:
${CONCEPT_LIST_LINES}

Guidance:
- Use null liberally. Most items will be null — only return a concept when the meaning clearly matches.
- "STROKE_HISTORY" and "RECENT_STROKE_30D" are different: only use RECENT_STROKE_30D when the label explicitly says "recent" or "within 30 days" / "<30d".
- "INSULIN_DIABETES" is for type-1 / insulin-dependent diabetes specifically — NOT generic "Diabetes".
- "PONV_HISTORY" includes motion sickness and post-op nausea/vomiting history (Apfel risk factor).
- "ACTIVE_CANCER" is for current/active malignancy — not history of cancer in remission.

You receive a JSON array of items and return ONE JSON object:
{ "suggestions": [ { "itemId": "...", "suggestedConcept": "HYPERTENSION" | null }, ... ] }

Return ONLY the JSON object — no prose, no markdown fences.`;

export async function suggestConceptsBatch(
  items: ConceptSuggestItem[],
): Promise<ConceptSuggestion[]> {
  if (items.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const userMessage = `Items to classify:\n${JSON.stringify(items, null, 2)}`;

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error({ status: resp.status, body }, "[illnessConceptAI] anthropic error");
    throw new Error(`Anthropic request failed: ${resp.status}`);
  }

  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    logger.warn({ excerpt: text.slice(0, 500) }, "[illnessConceptAI] no JSON in response");
    throw new Error("AI returned no parseable JSON");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    logger.warn({ excerpt: match[0].slice(0, 500) }, "[illnessConceptAI] JSON parse failed");
    throw new Error("AI response was not valid JSON");
  }

  const rawSuggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
  const validConcepts: ReadonlySet<string> = new Set(SCORING_CONCEPTS);
  const validIds = new Set(items.map((i) => i.id));

  const result: ConceptSuggestion[] = [];
  for (const s of rawSuggestions) {
    const itemId = typeof s?.itemId === "string" ? s.itemId : null;
    if (!itemId || !validIds.has(itemId)) continue;
    const c = s?.suggestedConcept;
    const concept = typeof c === "string" && validConcepts.has(c) ? (c as ScoringConcept) : null;
    result.push({ itemId, suggestedConcept: concept });
  }
  return result;
}
