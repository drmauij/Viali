import logger from "../logger";
import { getItems } from "../storage/inventory";
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

- medication: { id: string (uuid), type: "medication", medicationRef: string, dose: string, route: "po"|"iv"|"sc"|"im", scheduleMode: "scheduled"|"prn", frequency?: string, startAt?: string (HH:MM), prnMaxPerDay?: number, prnMaxPerInterval?: { count: number, intervalH: number }, note?: string }
- lab: { id: string, type: "lab", panel: string[], when: "one_shot"|"daily"|"every_n_hours", oneShotOffsetH?: number, everyNHours?: number }
- task: { id: string, type: "task", title: string, when: "one_shot"|"daily"|"every_n_hours"|"ad_hoc"|"conditional", oneShotAt?: string, everyNHours?: number, condition?: string }
- free_text: { id: string, type: "free_text", section: "general"|"meds"|"labs"|"other", text: string }

Frequency values for scheduled medications use these codes: "continuous","q15min","q30min","q1h","q2h","q4h","q6h","q8h","q12h","q24h","2x_daily","4x_daily". You may also pass raw strings like "einmal" / "once" when no code fits.

Rules:
1. For each medication, try to match to an inventory item provided in the user message. Use the inventory item's "name" verbatim as \`medicationRef\`.
2. If no inventory match, set \`medicationRef\` to the name the user wrote, and add the drug name to \`unresolved\`.
3. "bei Bedarf" / "as needed" / "PRN" → scheduleMode: "prn". "every N hours max M/day" in PRN → prnMaxPerInterval: { count: 1, intervalH: N }, prnMaxPerDay: M.
4. "every N hours" in a scheduled context → frequency: "qNh" if N is standard, else raw string.
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

function dedupeInventory(invItems: Array<{ id: string; name: string | null; description: string | null }>) {
  const normalize = (s: string) => s.toLowerCase().replace(/[.,/()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  const groups = new Map<string, { name: string; description: string }>();
  for (const inv of invItems) {
    const name = inv.name ?? '';
    const desc = inv.description ?? '';
    const canonical = desc.length > name.length ? desc : name;
    const key = normalize(canonical);
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

export async function parsePostopOrders(
  rawText: string,
  hospitalId: string,
  unitId: string,
): Promise<AIParseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const inventory = await getItems(hospitalId, unitId);
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
    .map(it => ({ ...it, id: typeof it.id === 'string' && it.id ? it.id : crypto.randomUUID() }));

  return { items: validated, unresolved, warnings };
}
