import OpenAI from "openai";
import { db } from "../db";
import { hospitals } from "@shared/schema";
import { eq } from "drizzle-orm";
import logger from "../logger";

export type VisionAiProvider = "openai" | "pixtral";

interface VisionAiClient {
  provider: VisionAiProvider;
  client: OpenAI;
}

const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";

export async function getVisionAiClient(hospitalId: string): Promise<VisionAiClient> {
  const hospital = await db.query.hospitals.findFirst({
    where: eq(hospitals.id, hospitalId),
    columns: { visionAiProvider: true },
  });

  const provider = (hospital?.visionAiProvider as VisionAiProvider) || "openai";

  if (provider === "pixtral") {
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      logger.warn("[VisionAI] MISTRAL_API_KEY not set, falling back to OpenAI");
      return {
        provider: "openai",
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      };
    }
    return {
      provider: "pixtral",
      client: new OpenAI({
        apiKey,
        baseURL: MISTRAL_BASE_URL,
      }),
    };
  }

  return {
    provider: "openai",
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  };
}

export function getVisionModel(provider: VisionAiProvider): string {
  switch (provider) {
    case "pixtral":
      return "pixtral-large-latest";
    case "openai":
    default:
      return "gpt-4o-mini";
  }
}
