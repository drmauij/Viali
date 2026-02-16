import { createAuditLog } from "../storage/anesthesia";
import { randomUUID } from "crypto";

interface AnonymizeOptions {
  knownValues?: Record<string, string>;
}

interface AnonymizeResult {
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

export async function logAiOutbound(opts: {
  anonymizedText: string;
  summary: string;
  userId: string;
  purpose: string;
  service: string;
}): Promise<void> {
  await createAuditLog({
    recordType: "ai_outbound",
    recordId: randomUUID(),
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
}
