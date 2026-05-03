// scripts/translate-questionnaire-zh.ts
// Run: npx tsx scripts/translate-questionnaire-zh.ts > /tmp/zh-bucket.ts 2>/tmp/zh-bucket.log
// Then paste the output into the `translations` object in PatientQuestionnaire.tsx (after fr).
import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_FILE = path.resolve('client/src/pages/PatientQuestionnaire.tsx');
const src = fs.readFileSync(SOURCE_FILE, 'utf8');

// The file has `const translations: Record<string, Record<string, string>> = { en: { ... }, de: ... }`.
// Slice the en bucket: it starts at `  en: {` and ends at the matching `  },`.
const startMarker = '  en: {';
const start = src.indexOf(startMarker);
if (start === -1) throw new Error('en bucket not found in PatientQuestionnaire.tsx');

let depth = 0;
let end = start;
for (let i = start; i < src.length; i++) {
  const ch = src[i];
  if (ch === '{') depth++;
  else if (ch === '}') {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
const enBlock = src.slice(start, end);

// Pull out key/value pairs as a flat list (preserves order so we can reproduce structure).
const pairRegex = /"([^"]+)":\s*"((?:[^"\\]|\\.)*)"/g;
const entries: [string, string][] = [];
let m: RegExpExecArray | null;
while ((m = pairRegex.exec(enBlock)) !== null) {
  // Unescape only the simple JSON string escapes the regex captured.
  const value = m[2]
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t');
  entries.push([m[1], value]);
}
if (entries.length === 0) throw new Error('No key/value pairs parsed from en bucket');
process.stderr.write(`Parsed ${entries.length} entries from en bucket\n`);

(async () => {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY not set (check .env)');
  const mistral = new OpenAI({ apiKey, baseURL: 'https://api.mistral.ai/v1' });
  const model = process.env.MISTRAL_TEXT_MODEL || 'mistral-small-latest';

  const BATCH = 60;
  const out: Record<string, string> = {};

  for (let i = 0; i < entries.length; i += BATCH) {
    const slice = entries.slice(i, i + BATCH);
    const payload = JSON.stringify(Object.fromEntries(slice));

    let res;
    try {
      res = await mistral.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: `Translate the values of the given JSON object from English into Simplified Chinese (zh-CN). The keys are i18n identifiers — do NOT translate keys, do NOT change keys. Keep medical terminology accurate; use everyday language for patient-facing strings. Return ONLY a JSON object with the same keys, values translated into Simplified Chinese. No explanations, no code fences, no extra text.`,
          },
          { role: 'user', content: payload },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' } as any,
      });
    } catch (err: any) {
      process.stderr.write(`Batch ${i}-${i + slice.length} failed: ${err?.message || err}. Continuing.\n`);
      continue;
    }

    const raw = res.choices[0]?.message?.content || '{}';
    let obj: any;
    try {
      obj = JSON.parse(raw);
    } catch {
      process.stderr.write(`Batch ${i}-${i + slice.length} JSON parse failed. Skipping.\n`);
      continue;
    }
    Object.assign(out, obj);
    process.stderr.write(`Translated ${Math.min(i + BATCH, entries.length)} / ${entries.length}\n`);
  }

  // Print as TS literal ready for pasting. Falls back to the English value if a key wasn't translated.
  console.log('  zh: {');
  for (const [k, v] of entries) {
    const translated = out[k] ?? v;
    console.log(`    ${JSON.stringify(k)}: ${JSON.stringify(translated)},`);
  }
  console.log('  },');
})().catch(err => { console.error(err); process.exit(1); });
