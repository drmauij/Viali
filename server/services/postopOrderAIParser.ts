import logger from "../logger";
import { getConfiguredMedicationItems } from "../storage/inventory";
import type { PostopOrderItem } from "@shared/postopOrderItems";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const MAX_INVENTORY_SIZE = 400;

const SYSTEM_PROMPT = `You convert natural-language postoperative order instructions into structured JSON.

You MUST return a JSON object with this exact shape:
{
  "items": PostopOrderItem[],
  "unresolved": string[],
  "warnings": string[]
}

Each item has a \`type\` field. Supported types with their required/optional fields:

- medication: { id: string (uuid), type: "medication", medicationRef: string, dose: string, route: "po"|"iv"|"sc"|"im", timing: { mode: "scheduled"|"one_shot"|"ad_hoc"|"conditional", frequency?: "q1h"|"q2h"|"q4h"|"q6h"|"q8h"|"q12h"|"q24h"|"q48h"|"weekly"|"oral_1_0_0"|"oral_1_0_1"|"oral_1_1_1"|"oral_1_1_1_1", startAt?: string (ISO 8601), end?: { kind: "indefinite" } | { kind: "until", at: string } | { kind: "count", n: number }, condition?: string }, prnMaxPerDay?: number, prnMaxPerInterval?: { count: number, intervalH: number }, note?: string }
- iv_fluid: { id: string, type: "iv_fluid", solution: "nacl_09"|"ringer_lactate"|"glucose_5"|"custom", customName?: string, volumeMl: number, additives?: string, durationH: number, timing: { mode: "scheduled"|"one_shot", frequency?: string, startAt?: string, end?: { kind: "indefinite" } | { kind: "until", at: string } | { kind: "count", n: number } } }
- lab: { id: string, type: "lab", panel: string[], timing: { mode: "scheduled"|"one_shot", frequency?: "q4h"|"q6h"|"q8h"|"q12h"|"q24h", startAt?: string, end?: { kind: "indefinite" } | { kind: "until", at: string } | { kind: "count", n: number } } }
- task: { id: string (uuid), type: "task", subtype: "generic"|"positioning"|"drainage"|"nutrition"|"wound_care"|"mobilization"|"note", title: string, timing: { mode: "scheduled"|"one_shot"|"ad_hoc"|"conditional", frequency?: "q1h"|"q2h"|"q4h"|"q6h"|"q8h"|"q12h"|"q24h"|"q48h"|"weekly", startAt?: string (ISO 8601), end?: { kind: "indefinite" } | { kind: "until", at: string } | { kind: "count", n: number }, condition?: string }, actionHint?: string, note?: string }
- vitals_monitoring: { id: string, type: "vitals_monitoring", parameter: "BP"|"pulse"|"temp"|"spo2"|"bz", timing: { mode: "scheduled", frequency: "continuous"|"q15min"|"q30min"|"q1h"|"q2h"|"q4h"|"q6h"|"q8h"|"q12h" }, min?: number, max?: number, actionLow?: string, actionHigh?: string }
- bz_sliding_scale: { id: string, type: "bz_sliding_scale", drug: string, timing: { mode: "scheduled", frequency: "q1h"|"q2h"|"q4h"|"q6h"|"q8h"|"q12h" }, rules: Array<{ above: number, units: number }>, increment?: { per: number, units: number } }

Frequency values for scheduled items use these codes: "continuous","q15min","q30min","q1h","q2h","q4h","q6h","q8h","q12h","q24h","q48h","weekly","2x_daily","3x_daily","4x_daily","oral_1_0_0","oral_1_0_1","oral_1_1_1","oral_1_1_1_1".

Mapping subtypes (when the order doesn't fit medication/iv_fluid/lab/vitals_monitoring/bz_sliding_scale, emit a task with the appropriate subtype):
- "Mobilization" / "Lagerung" / "Mobilisation" → task with subtype "mobilization"; describe in title.
- "Positioning" / "supine / lateral / head up 30°" / "Oberkörper hochlagern" → task with subtype "positioning"; describe position in title.
- "Drainage" / "Redon" / "Easyflow" / "DK" → task with subtype "drainage"; describe drain type + site in title.
- "Nutrition" / "Diet" / "NPO" / "Vollkost" / "Nüchtern" → task with subtype "nutrition"; describe diet/timing in title.
- "Wound care" / "Verbandwechsel" / "dressing change" → task with subtype "wound_care"; for scheduled dressing changes set timing.mode = "scheduled" + appropriate frequency, otherwise mode "ad_hoc".
- "Note" / "Comment" / freeform clinical observation → task with subtype "note"; description in title.
- Generic clinical order that doesn't fit above (e.g. "call doctor if X") → task with subtype "generic".

Rules:
1. For each medication, try to match to an inventory item provided in the user message. Use the inventory item's "name" verbatim as \`medicationRef\`.
2. If no inventory match, set \`medicationRef\` to the name the user wrote, and add the drug name to \`unresolved\`.
3. "bei Bedarf" / "as needed" / "PRN" → timing: { mode: "ad_hoc" }. "every N hours max M/day" in PRN → prnMaxPerInterval: { count: 1, intervalH: N }, prnMaxPerDay: M.
4. "every N hours" in a scheduled context → timing: { mode: "scheduled", frequency: "qNh" } if N is standard, else use the closest code.
5. Generate UUIDs for id fields. Use crypto-random style (e.g. "ai-1", "ai-2" is fine — the client will replace them).
6. Put doubts/ambiguities in \`warnings\` as short plain strings.
7. German and English input are both supported.
8. Do not invent items the user did not mention. Do not add defaults.

Return ONLY the JSON object, no prose.`;

export interface AIParseResult {
  items: PostopOrderItem[];
  unresolved: string[];
  warnings: string[];
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[.,/()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

function dedupeInventory(invItems: Array<{ id: string; name: string | null; description: string | null }>) {
  const groups = new Map<string, { name: string; description: string }>();
  for (const inv of invItems) {
    const name = inv.name ?? '';
    const desc = inv.description ?? '';
    const canonical = desc.length > name.length ? desc : name;
    const key = normalizeName(canonical);
    if (!key) continue;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { name, description: desc });
      continue;
    }
    const existingFriendly = existing.name !== existing.description;
    const currentFriendly = name !== desc;
    if (currentFriendly && !existingFriendly) groups.set(key, { name, description: desc });
    else if (currentFriendly === existingFriendly && name.length < existing.name.length) {
      groups.set(key, { name, description: desc });
    }
  }
  return Array.from(groups.values());
}

/**
 * LLMs sometimes truncate packaging cruft from a verbatim instruction — e.g.
 * they emit "NOVALGIN Inj Lös 1 g/2ml i.m./i.v" when the canonical DB name is
 * "NOVALGIN Inj Lös 1 g/2ml i.m./i.v 10 Amp 2 ml". The client validator does
 * an exact-name match and would flag this as "Missing configuration", forcing
 * the user to re-paste or configure manually.
 *
 * This snap rewrites `medicationRef` to the canonical inventory name when a
 * normalized match is unambiguous:
 *   1. Exact match on normalized form
 *   2. AI's ref is a prefix of exactly one inventory name (the truncation case)
 *   3. Inventory name is a prefix of exactly one AI ref (rare — over-padding)
 * If zero matches or multiple equally-good matches exist, the ref is left as
 * the AI wrote it (the client will flag and the user can correct manually).
 */
export function snapMedicationRefToInventory(
  ref: string,
  invItems: Array<{ name: string | null }>,
): string {
  const names = invItems.map(i => i.name ?? '').filter(Boolean);
  if (!ref || names.length === 0) return ref;
  if (names.includes(ref)) return ref;

  const refN = normalizeName(ref);
  if (!refN) return ref;

  const exact = names.filter(n => normalizeName(n) === refN);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return ref;

  // AI's ref is a prefix of the canonical name (truncated suffix).
  const prefixMatches = names.filter(n => normalizeName(n).startsWith(refN + ' '));
  if (prefixMatches.length === 1) return prefixMatches[0];

  // Inventory name is a prefix of AI's ref (over-padded by the AI).
  const suffixMatches = names.filter(n => {
    const nn = normalizeName(n);
    return nn.length > 0 && refN.startsWith(nn + ' ');
  });
  if (suffixMatches.length === 1) return suffixMatches[0];

  return ref;
}

export async function parsePostopOrders(
  rawText: string,
  hospitalId: string,
  unitId: string,
): Promise<AIParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  // Only feed the LLM medications that have at least one medication_configs
  // row — those are the names the save-time validator will accept. Otherwise
  // the AI can pick a generic-inventory SKU (e.g. "Paracetamol 1g/100ml Amp")
  // whose anesthesia-configured twin (e.g. "PARACETAMOL 1g") is what the
  // chart actually needs.
  const inventory = await getConfiguredMedicationItems(hospitalId, unitId);
  const deduped = dedupeInventory(inventory).slice(0, MAX_INVENTORY_SIZE);
  const inventoryLines = deduped
    .map(i => i.description && i.description !== i.name ? `- ${i.name} (${i.description})` : `- ${i.name}`)
    .join('\n');

  const userMessage = `Available inventory (use exactly the name before the parenthesis as medicationRef):
${inventoryLines || '(no inventory)'}

Instructions to parse:
${rawText}`;

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error(`[postopAI] Anthropic error ${resp.status}: ${body}`);
    throw new Error(`Anthropic request failed: ${resp.status}`);
  }

  const data = await resp.json();
  const text = data?.content?.[0]?.text ?? '';

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    logger.warn(`[postopAI] Could not find JSON in response: ${text.slice(0, 500)}`);
    return { items: [], unresolved: [], warnings: ['AI returned no parseable JSON'] };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch (e) {
    logger.warn(`[postopAI] JSON parse failed: ${match[0].slice(0, 500)}`);
    return { items: [], unresolved: [], warnings: ['AI response was not valid JSON'] };
  }

  const items: PostopOrderItem[] = Array.isArray(parsed.items) ? parsed.items : [];
  const unresolved: string[] = Array.isArray(parsed.unresolved) ? parsed.unresolved.filter((s: any) => typeof s === 'string') : [];
  const warnings: string[] = Array.isArray(parsed.warnings) ? parsed.warnings.filter((s: any) => typeof s === 'string') : [];

  const validated = items
    .filter(it => it && typeof it === 'object' && typeof (it as any).type === 'string')
    .map(it => ({ ...it, id: typeof it.id === 'string' && it.id ? it.id : crypto.randomUUID() }))
    .map((it: any) => {
      if (it.type === 'medication' && typeof it.medicationRef === 'string') {
        return { ...it, medicationRef: snapMedicationRefToInventory(it.medicationRef, inventory) };
      }
      return it;
    });

  return { items: validated, unresolved, warnings };
}
