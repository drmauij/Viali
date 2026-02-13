import { Router, Request, Response } from "express";
import { isAuthenticated } from "../auth/google";
import { requireWriteAccess } from "../utils";
import {
  analyzeMonitorImage,
  transcribeVoice,
  parseDrugCommand
} from "../services/aiMonitorAnalysis";
import { z, ZodError } from "zod";
import OpenAI from "openai";

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
    console.error('Vitabyte API proxy error:', error);
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
    console.error("Error analyzing monitor image:", error);
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
    console.error("Error transcribing voice:", error);
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
    console.error("Error parsing drug command:", error);
    res.status(500).json({ message: error.message || "Failed to parse drug command" });
  }
});

router.post('/api/translate', isAuthenticated, requireWriteAccess, async (req: any, res) => {
  try {
    const translateSchema = z.object({
      items: z.array(z.string()).min(1, "Items array is required"),
    });
    let parsedTranslate;
    try {
      parsedTranslate = translateSchema.parse(req.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return res.status(400).json({ message: "Invalid request body", details: err.errors });
      }
      throw err;
    }
    const { items } = parsedTranslate;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const itemsList = items.join('\n');
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a medical translator. Translate the given medical terms between English and German.
            - If the terms are in English, translate to German
            - If the terms are in German, translate to English
            - Keep medical terminology accurate
            - Return ONLY the translated terms, one per line, in the same order as input
            - Do not add any explanations or numbering`
        },
        {
          role: "user",
          content: itemsList
        }
      ],
      temperature: 0.3,
    });

    const translatedText = response.choices[0]?.message?.content || '';
    const translations = translatedText.split('\n').filter(line => line.trim());
    if (translations.length !== items.length) {
      console.warn('Translation count mismatch:', { input: items.length, output: translations.length });
    }
    res.json({ translations });
  } catch (error: any) {
    console.error("Error translating items:", error);
    res.status(500).json({ message: error.message || "Failed to translate items" });
  }
});

export default router;
