import { Router, Request, Response } from "express";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess, anonymizeWithOpenMed, logAiOutbound } from "../utils";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "../services/aiMonitorAnalysis";
import { z, ZodError } from "zod";
import OpenAI from "openai";
import logger from "../logger";
import { SUPPORTED_QUESTIONNAIRE_LANGS, LANG_DISPLAY_NAMES, type Lang } from "@shared/i18n";

const MISTRAL_TEXT_BASE_URL = "https://api.mistral.ai/v1";

function getMistralTextClient(): OpenAI {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return new OpenAI({ apiKey, baseURL: MISTRAL_TEXT_BASE_URL });
}

function getMistralTextModel(): string {
  return process.env.MISTRAL_TEXT_MODEL || "mistral-small-latest";
}

const router = Router();

router.post('/api/proxy-vitabyte', async (req: Request, res: Response) => {
  try {
    const proxySchema = z.object({
      url: z.string().url(),
      body: z.any().optional(),
    });
    let parsedBody;
    try {
      parsedBody = proxySchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ error: 'Invalid request body', details: err.errors });
      }
      throw err;
    }
    const { url, body } = parsedBody;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error: any) {
    logger.error('Vitabyte API proxy error:', error);
    res.status(500).json({ error: 'Failed to proxy request', details: error.message });
  }
});

router.post('/api/analyze-monitor', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const monitorSchema = z.object({
      image: z.string(),
      hospitalId: z.string().optional(),
    });
    let parsedMonitor;
    try {
      parsedMonitor = monitorSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { image, hospitalId } = parsedMonitor;
    const effectiveHospitalId = hospitalId || req.headers['x-active-hospital-id'];
    const result = await analyzeMonitorImage(image, effectiveHospitalId);
    res.json(result);
  } catch (error: any) {
    logger.error("Error analyzing monitor image:", error);
    res.status(500).json({ message: error.message || "Failed to analyze monitor image" });
  }
});

router.post('/api/transcribe-voice', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const voiceSchema = z.object({
      audioData: z.string(),
    });
    let parsedVoice;
    try {
      parsedVoice = voiceSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { audioData } = parsedVoice;
    const transcription = await transcribeVoice(audioData);
    res.json({ transcription });
  } catch (error: any) {
    logger.error("Error transcribing voice:", error);
    res.status(500).json({ message: error.message || "Failed to transcribe voice" });
  }
});

router.post('/api/parse-drug-command', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const drugCommandSchema = z.object({
      transcription: z.string(),
    });
    let parsedDrugCommand;
    try {
      parsedDrugCommand = drugCommandSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { transcription } = parsedDrugCommand;
    const drugs = await parseDrugCommand(transcription);
    res.json({ drugs });
  } catch (error: any) {
    logger.error("Error parsing drug command:", error);
    res.status(500).json({ message: error.message || "Failed to parse drug command" });
  }
});

const TRANSLATE_BATCH_SIZE = 50;

const translateItemSchema = z.object({
  id: z.string().min(1),
  field: z.enum(['label', 'patientLabel', 'patientHelpText']),
  text: z.string().min(1),
});

const translateRequestSchema = z.object({
  items: z.array(translateItemSchema).min(1),
  sourceLang: z.enum(SUPPORTED_QUESTIONNAIRE_LANGS),
  targetLangs: z.array(z.enum(SUPPORTED_QUESTIONNAIRE_LANGS)).min(1),
});

router.post('/api/translate', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  let parsed;
  try {
    parsed = translateRequestSchema.parse(req.body);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ message: "Invalid request body", details: err.errors });
    }
    throw err;
  }
  const { items, sourceLang, targetLangs } = parsed;

  if (targetLangs.includes(sourceLang)) {
    return res.status(400).json({ message: "targetLangs must not include sourceLang" });
  }

  const targetList = targetLangs.map(l => `"${l}" (${LANG_DISPLAY_NAMES[l]})`).join(', ');

  const mistral = getMistralTextClient();
  const merged: Record<string, Partial<Record<string, string>>> = {};

  for (let i = 0; i < items.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = items.slice(i, i + TRANSLATE_BATCH_SIZE);
    const inputJson = JSON.stringify(batch.map(it => ({ key: `${it.id}:${it.field}`, text: it.text })));

    let response;
    try {
      response = await mistral.chat.completions.create({
        model: getMistralTextModel(),
        messages: [
          {
            role: "system",
            content: `You are a medical translator. Translate the given medical terms from ${LANG_DISPLAY_NAMES[sourceLang]} into the following target languages: ${targetList}.

Return ONLY a JSON object whose keys are the input "key" values and whose values are objects mapping each target language code to the translated string. Example:
{"abc:label": {"en": "Hypertension", "it": "Ipertensione"}}

Rules:
- Keep medical terminology accurate and use clinically standard terms.
- For patient-facing fields (key ends in :patientLabel or :patientHelpText), use everyday language a non-medical patient understands.
- Do not include the source language in the output.
- Do not add explanations, code fences, or any text outside the JSON object.`,
          },
          { role: "user", content: inputJson },
        ],
        temperature: 0.2,
        response_format: { type: "json_object" } as any,
      });
    } catch (error: any) {
      logger.error("Translation Mistral call failed:", error);
      return res.status(502).json({ message: "Upstream translation provider failed" });
    }

    const raw = response.choices[0]?.message?.content || '{}';
    let parsedJson: any;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      logger.warn('Translation JSON parse failed, skipping batch', { raw: raw.slice(0, 500) });
      continue;
    }

    for (const it of batch) {
      const key = `${it.id}:${it.field}`;
      const got = parsedJson?.[key];
      if (!got || typeof got !== 'object') {
        logger.warn('Translation response missing key', { key });
        continue;
      }
      const langs: Partial<Record<string, string>> = {};
      for (const target of targetLangs) {
        const v = got[target];
        if (typeof v === 'string' && v.trim().length > 0) langs[target] = v.trim();
      }
      if (Object.keys(langs).length > 0) merged[key] = langs;
    }
  }

  res.json({ translations: merged });
});

router.post('/api/translate-message', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const schema = z.object({
      text: z.string().min(1, "Text is required"),
      targetLanguage: z.enum(['de', 'en', 'it', 'es', 'fr']),
      knownValues: z.record(z.string()).optional(),
    });
    let parsed;
    try {
      parsed = schema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { text, targetLanguage, knownValues } = parsed;

    // Anonymize PII before sending to external AI (known-values + regex + OpenMed ML)
    const { text: safeText, restore, summary } = await anonymizeWithOpenMed(text, { knownValues });

    await logAiOutbound({
      anonymizedText: safeText,
      summary,
      userId: req.user?.id || "unknown",
      purpose: "translation",
      service: "mistral",
    });

    const mistral = getMistralTextClient();

    const response = await mistral.chat.completions.create({
      model: getMistralTextModel(),
      messages: [
        {
          role: "system",
          content: `You are a professional translator for a medical clinic. Translate the following message to ${LANG_DISPLAY_NAMES[targetLanguage]}.
            - Preserve the original formatting, line breaks, and any URLs exactly as they are
            - Keep the tone professional but friendly, suitable for patient communication
            - Do NOT translate or modify any text inside square brackets like [NAME_1], [DATE_1], [LINK_1] — keep them exactly as they are
            - Return ONLY the translated text, no explanations`
        },
        {
          role: "user",
          content: safeText
        }
      ],
      temperature: 0.3,
    });

    const translatedText = response.choices[0]?.message?.content || '';
    res.json({ translatedText: restore(translatedText) });
  } catch (error: any) {
    logger.error("Error translating message:", error);
    res.status(500).json({ message: error.message || "Failed to translate message" });
  }
});

export default router;
