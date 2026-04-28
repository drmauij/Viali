import { randomUUID } from "node:crypto";
import logger from "../logger";
import type { Block, VariablesSchema, TemplateBody } from "@shared/contractTemplates/types";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";

const SYSTEM_PROMPT = `You author HR contract templates for a clinic-management product called Viali.

You return ONE JSON object with this exact shape:
{
  "blocks": Block[],
  "variables": {
    "simple": SimpleVariable[],
    "selectableLists": SelectableListVariable[]
  }
}

────────  Block types  ────────
A Block is one of:
- { id: string, type: "heading", level: 1|2|3, text: string }
- { id: string, type: "paragraph", text: string }
- { id: string, type: "list", ordered: boolean, items: string[] }
- { id: string, type: "section", title?: string, children: Block[] }
- { id: string, type: "signature", party: "worker"|"manager", label: string }
- { id: string, type: "pageBreak" }
- { id: string, type: "spacer", height: number }

Use sections to group related paragraphs (e.g. "1. Subject of contract", "2. Compensation", …).
Always include exactly one signature block per party (worker, manager) at the end.

────────  Variables  ────────
SimpleVariable: { key: string, type: "text"|"number"|"date"|"money"|"iban"|"email"|"phone", label: string, required?: boolean, default?: string, source?: "auto:<…>" }
The "source" field auto-fills the value at submit time. Recognized sources:
  - "auto:now"                        → today's date (YYYY-MM-DD)
  - "auto:hospital.companyName"       → hospital's legal name
  - "auto:hospital.address"           → composed street + zip + city
  - "auto:hospital.street", "auto:hospital.city", "auto:hospital.postalCode", "auto:hospital.phone", "auto:hospital.email"
Use auto-sources for hospital/company facts so the user does not retype them.

For worker info, use simple variables under the dotted prefix "worker.":
  worker.firstName, worker.lastName, worker.street, worker.postalCode, worker.city,
  worker.email, worker.phone, worker.dateOfBirth, worker.iban
These are the LEGACY recognized worker fields — include the ones the contract needs as required.

SelectableListVariable lets the user pick from preset options (e.g. role with hourly rate):
{ key: "role", label: "Role", fields: [{ key:"id",type:"text"},{ key:"title",type:"text"},{ key:"rate",type:"money"}], options: [{id:"awr_nurse",title:"AWR / OTA / Tagesklinik",rate:"50"},{id:"anesthesia_nurse",title:"Anesthesia nurse",rate:"60"},{id:"anesthesia_doctor",title:"Anesthesia doctor",rate:"150"}] }
Common option ids the legacy system understands: "awr_nurse", "anesthesia_nurse", "anesthesia_doctor", "op_nurse" (op_nurse maps to awr_nurse internally).

────────  Variable references  ────────
Inside any block "text" or list item, reference a variable with double-curly syntax:
  "Hereby {{worker.firstName}} {{worker.lastName}} agrees …"
  "The hourly rate is CHF {{role.rate}} for the role of {{role.title}}."

────────  Rules  ────────
1. PRESERVE UNCHANGED CONTENT VERBATIM. When the instruction is a targeted edit (e.g. "change CHF 50 to CHF 55 in the salary paragraph", "translate section 3 to English", "add an NDA section"), keep all other blocks IDENTICAL to the current template — same text, same order, same structure, same ids. Only modify what the instruction explicitly asks for.
2. KEEP EXISTING BLOCK IDS. If a block already has an id in the current template, return it with that same id. Generate a new UUID-style id ONLY for blocks you create from scratch.
3. When the instruction is "build a new template" / "create from scratch" / "regenerate", you may freely produce new ids and structure.
4. Output language must match the requested language code ("de", "en", "it", …) only if asked to translate or generate fresh content; otherwise keep the existing language.
5. Cover every variable you reference. Do not reference variables you did not declare.
6. Be concise but legally complete. Keep paragraphs short (3-5 sentences max).
7. Always end with TWO signature blocks (worker + manager) placed last. If they already exist, KEEP their existing ids.
8. SELECTED BLOCK SCOPE: when the user message specifies "Selected block id: <id>" with HARD SCOPE, the rule is absolute — only that block (and possibly its nested children if it's a section and the instruction mentions them) may change. Every other block in the output must have the same id and identical content as the input. Do not even re-order them.
9. Output ONLY the JSON object — no prose, no markdown fences, no explanation.`;

export interface AISuggestArgs {
  prompt: string;
  currentBlocks: Block[];
  currentVariables: VariablesSchema;
  language: string;
  selectedBlockId?: string | null;
}

export interface AISuggestResult {
  blocks: Block[];
  variables: VariablesSchema;
}

export async function suggestTemplate(args: AISuggestArgs): Promise<AISuggestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const scopeLine = args.selectedBlockId
    ? `Selected block id: ${args.selectedBlockId}\n→ HARD SCOPE: apply the instruction to this block ONLY. Every other block must come back identical (same id, same text, same order, same children). Do not rephrase or reorder anything else.`
    : "Selected block id: (none — apply globally)";

  const userMessage = [
    `Language: ${args.language || "de"}`,
    scopeLine,
    "",
    "Current template (may be empty — generate from scratch if so):",
    JSON.stringify({ blocks: args.currentBlocks, variables: args.currentVariables }, null, 2),
    "",
    "Instruction:",
    args.prompt,
  ].join("\n");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    logger.error(`[contractTemplateAI] Anthropic error ${resp.status}: ${body}`);
    throw new Error(`Anthropic request failed: ${resp.status}`);
  }

  const data = await resp.json();
  const text: string = data?.content?.[0]?.text ?? "";

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    logger.warn(`[contractTemplateAI] No JSON in response: ${text.slice(0, 500)}`);
    throw new Error("AI returned no parseable JSON");
  }

  let parsed: any;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    logger.warn(`[contractTemplateAI] JSON parse failed: ${match[0].slice(0, 500)}`);
    throw new Error("AI response was not valid JSON");
  }

  return normalize(parsed);
}

// ───────── Normalization ─────────
// Ensure every block has an id and every section has a children array.
function normalize(raw: any): AISuggestResult {
  const blocks = Array.isArray(raw?.blocks) ? raw.blocks.map(normalizeBlock).filter(Boolean) : [];
  const variables: VariablesSchema = {
    simple: Array.isArray(raw?.variables?.simple) ? raw.variables.simple : [],
    selectableLists: Array.isArray(raw?.variables?.selectableLists) ? raw.variables.selectableLists : [],
  };
  return { blocks: blocks as Block[], variables };
}

function normalizeBlock(b: any): Block | null {
  if (!b || typeof b !== "object" || typeof b.type !== "string") return null;
  const id = typeof b.id === "string" && b.id ? b.id : randomUUID();
  switch (b.type) {
    case "heading":
      return { id, type: "heading", level: clampLevel(b.level), text: String(b.text ?? "") };
    case "paragraph":
      return { id, type: "paragraph", text: String(b.text ?? "") };
    case "list":
      return {
        id,
        type: "list",
        ordered: !!b.ordered,
        items: Array.isArray(b.items) ? b.items.map((s: any) => String(s)) : [],
      };
    case "section":
      return {
        id,
        type: "section",
        title: b.title ? String(b.title) : undefined,
        children: Array.isArray(b.children) ? b.children.map(normalizeBlock).filter(Boolean) as Block[] : [],
      };
    case "signature":
      return {
        id,
        type: "signature",
        party: b.party === "manager" ? "manager" : "worker",
        label: String(b.label ?? (b.party === "manager" ? "Manager" : "Worker")),
      };
    case "pageBreak":
      return { id, type: "pageBreak" };
    case "spacer":
      return { id, type: "spacer", height: typeof b.height === "number" ? b.height : 16 };
    default:
      return null;
  }
}

function clampLevel(n: any): 1 | 2 | 3 {
  const v = Number(n);
  if (v === 1 || v === 2 || v === 3) return v;
  return 2;
}
