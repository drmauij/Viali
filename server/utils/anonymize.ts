import { createAuditLog } from "../storage/anesthesia";
import { randomUUID } from "crypto";
import logger from "../logger";

export interface AnonymizeOptions {
  knownValues?: Record<string, string>;
}

export interface AnonymizeResult {
  text: string;
  restore: (processedText: string) => string;
  replacementCount: number;
  summary: string;
}

// Map known-value keys to placeholder categories
const KEY_TO_CATEGORY: Record<string, string> = {
  patientName: "NAME",
  patientFirstName: "NAME",
  patientLastName: "NAME",
  clinicName: "CLINIC",
  hospitalName: "CLINIC",
  doctorName: "NAME",
  email: "EMAIL",
  phone: "PHONE",
};

// Regex patterns in specificity order (most specific first)
const PATTERNS: { category: string; regex: RegExp }[] = [
  // URLs — first, because they contain dates/numbers
  { category: "LINK", regex: /https?:\/\/[^\s),]+/g },
  // Emails
  { category: "EMAIL", regex: /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g },
  // Swiss AHV numbers (social security): 756.NNNN.NNNN.NN
  { category: "AHV", regex: /756\.\d{4}\.\d{4}\.\d{2}/g },
  // Phone numbers: optional +, at least 7 digits, allowing spaces/dashes/dots
  { category: "PHONE", regex: /\+?[\d][\d\s.\-/]{6,}[\d]/g },
  // Datetime: DD.MM.YYYY HH:MM (before plain dates)
  { category: "DATETIME", regex: /\d{1,2}\.\d{1,2}\.\d{4}\s+\d{1,2}:\d{2}/g },
  // Dates: DD.MM.YYYY or YYYY-MM-DD
  { category: "DATE", regex: /\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2}/g },
];

export function anonymize(text: string, options?: AnonymizeOptions): AnonymizeResult {
  // value → placeholder mapping (deduplication)
  const valueToPlaceholder = new Map<string, string>();
  // category → counter
  const counters = new Map<string, number>();
  // category → total count (for summary)
  const categoryCounts = new Map<string, number>();
  let result = text;

  function getPlaceholder(value: string, category: string): string {
    const existing = valueToPlaceholder.get(value);
    if (existing) {
      return existing;
    }
    const count = (counters.get(category) || 0) + 1;
    counters.set(category, count);
    const placeholder = `[${category}_${count}]`;
    valueToPlaceholder.set(value, placeholder);
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
    return placeholder;
  }

  // Layer 1: Known values (sorted longest-first to avoid partial matches)
  if (options?.knownValues) {
    const entries = Object.entries(options.knownValues)
      .filter(([, v]) => v && v.trim().length > 0)
      .sort(([, a], [, b]) => b.length - a.length);

    for (const [key, value] of entries) {
      const category = KEY_TO_CATEGORY[key] || key.toUpperCase();
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "gi");
      result = result.replace(regex, () => getPlaceholder(value, category));
    }
  }

  // Layer 2: Regex patterns (in specificity order)
  for (const { category, regex } of PATTERNS) {
    // Reset regex state
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => {
      // Skip if already inside a placeholder like [CATEGORY_N]
      // We check the surrounding context in the current result
      return getPlaceholder(match, category);
    });
  }

  const replacementCount = valueToPlaceholder.size;

  // Build summary: "2 NAME, 1 LINK, 1 DATE"
  const summaryParts: string[] = [];
  for (const [cat, count] of categoryCounts) {
    summaryParts.push(`${count} ${cat}`);
  }
  const summary = summaryParts.join(", ") || "0 replacements";

  // Build restore function
  const placeholderToValue = new Map<string, string>();
  for (const [value, placeholder] of valueToPlaceholder) {
    placeholderToValue.set(placeholder, value);
  }

  function restore(processedText: string): string {
    let restored = processedText;
    for (const [placeholder, value] of placeholderToValue) {
      // Replace all occurrences of the placeholder
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      restored = restored.replace(new RegExp(escaped, "g"), value);
    }
    return restored;
  }

  return { text: result, restore, replacementCount, summary };
}

// ── OpenMed ML-based PII detection (Layer 3) ─────────────────────────

const OPENMED_URL = process.env.OPENMED_URL || "http://localhost:5050";
const OPENMED_TIMEOUT_MS = 2000;

// Map OpenMed entity labels → our placeholder categories
const OPENMED_TYPE_MAP: Record<string, string> = {
  NAME: "NAME",
  PERSON: "NAME",
  DATE: "DATE",
  LOCATION: "LOCATION",
  ADDRESS: "LOCATION",
  PHONE: "PHONE",
  EMAIL: "EMAIL",
  SSN: "AHV",
  ID: "ID",
};

interface OpenMedEntity {
  start: number;
  end: number;
  text: string;
  type: string;
  confidence: number;
}

/**
 * Call the OpenMed sidecar to detect PII entities in text.
 * Returns empty array if sidecar is unavailable (graceful fallback).
 */
export async function detectPii(
  text: string,
  lang: string = "de",
): Promise<OpenMedEntity[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENMED_TIMEOUT_MS);

  try {
    const res = await fetch(`${OPENMED_URL}/detect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn("OpenMed sidecar returned %d — skipping ML PII layer", res.status);
      return [];
    }

    const data = (await res.json()) as { entities: OpenMedEntity[] };
    return data.entities;
  } catch (err: any) {
    if (err.name === "AbortError") {
      logger.warn("OpenMed sidecar timed out after %dms — skipping ML PII layer", OPENMED_TIMEOUT_MS);
    } else {
      logger.warn("OpenMed sidecar unavailable — skipping ML PII layer: %s", err.message);
    }
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

const PLACEHOLDER_RE = /\[[A-Z_]+_\d+\]/g;

/**
 * Enhanced anonymization: runs existing anonymize() then applies OpenMed ML detection
 * as a third safety-net layer. Falls back gracefully if sidecar is unavailable.
 */
export async function anonymizeWithOpenMed(
  text: string,
  options?: AnonymizeOptions & { lang?: string },
): Promise<AnonymizeResult> {
  // Layer 1 + 2: known values + regex
  const baseResult = anonymize(text, options);

  // Layer 3: OpenMed ML detection on already-anonymized text
  const entities = await detectPii(baseResult.text, options?.lang ?? "de");

  if (entities.length === 0) {
    return baseResult;
  }

  // Build on top of the base result's placeholder map
  // Parse existing placeholders to get current counters
  const counters = new Map<string, number>();
  const existingPlaceholders = new Set<string>();

  for (const match of baseResult.text.matchAll(PLACEHOLDER_RE)) {
    existingPlaceholders.add(match[0]);
    const m = match[0].match(/\[([A-Z_]+)_(\d+)\]/);
    if (m) {
      const cat = m[1];
      const num = parseInt(m[2], 10);
      counters.set(cat, Math.max(counters.get(cat) || 0, num));
    }
  }

  // Additional placeholder mappings from OpenMed
  const openmedValueToPlaceholder = new Map<string, string>();
  const openmedPlaceholderToValue = new Map<string, string>();
  let openmedCount = 0;
  const openmedCategoryCounts = new Map<string, number>();

  function getOpenmedPlaceholder(value: string, category: string): string {
    const existing = openmedValueToPlaceholder.get(value);
    if (existing) return existing;
    const count = (counters.get(category) || 0) + 1;
    counters.set(category, count);
    const placeholder = `[${category}_${count}]`;
    openmedValueToPlaceholder.set(value, placeholder);
    openmedPlaceholderToValue.set(placeholder, value);
    openmedCategoryCounts.set(category, (openmedCategoryCounts.get(category) || 0) + 1);
    openmedCount++;
    return placeholder;
  }

  // Sort entities by start position descending so replacements don't shift indices
  const sorted = [...entities].sort((a, b) => b.start - a.start);

  let enhanced = baseResult.text;

  for (const ent of sorted) {
    // Check if this span is already a placeholder
    const span = enhanced.slice(ent.start, ent.end);
    if (PLACEHOLDER_RE.test(span)) {
      PLACEHOLDER_RE.lastIndex = 0;
      continue;
    }

    const category = OPENMED_TYPE_MAP[ent.type] || ent.type;
    const placeholder = getOpenmedPlaceholder(ent.text, category);
    enhanced = enhanced.slice(0, ent.start) + placeholder + enhanced.slice(ent.end);
  }

  if (openmedCount === 0) {
    return baseResult;
  }

  // Build enhanced summary
  const openmedSummaryParts: string[] = [];
  for (const [cat, count] of openmedCategoryCounts) {
    openmedSummaryParts.push(`${count} ${cat}`);
  }
  const enhancedSummary = baseResult.summary
    + " + " + openmedSummaryParts.join(", ") + " via OpenMed";

  // Build chained restore: first undo OpenMed placeholders, then base restore
  function chainedRestore(processedText: string): string {
    let restored = processedText;
    for (const [placeholder, value] of openmedPlaceholderToValue) {
      const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      restored = restored.replace(new RegExp(escaped, "g"), value);
    }
    return baseResult.restore(restored);
  }

  return {
    text: enhanced,
    restore: chainedRestore,
    replacementCount: baseResult.replacementCount + openmedCount,
    summary: enhancedSummary,
  };
}

export async function logAiOutbound(opts: {
  anonymizedText: string;
  summary: string;
  userId: string;
  purpose: string;
  service: string;
  linkedRecordId?: string;
  linkedRecordType?: string;
}): Promise<string> {
  const auditId = randomUUID();
  await createAuditLog({
    recordType: opts.linkedRecordType || "ai_outbound",
    recordId: opts.linkedRecordId || auditId,
    action: "create",
    userId: opts.userId,
    oldValue: null,
    newValue: {
      anonymizedText: opts.anonymizedText,
      service: opts.service,
      purpose: opts.purpose,
      replacements: opts.summary,
    },
  });
  return auditId;
}
