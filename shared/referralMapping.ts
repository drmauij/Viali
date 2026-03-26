export type ReferralSource = "social" | "search_engine" | "llm" | "word_of_mouth" | "belegarzt" | "other";
export type CaptureMethod = "manual" | "utm" | "ref";

interface MappedReferral {
  source: ReferralSource;
  sourceDetail: string | null;
  captureMethod: CaptureMethod;
}

interface UtmParams {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
}

const UTM_SOURCE_MAP: Record<string, { source: ReferralSource; detail: string }> = {
  google: { source: "search_engine", detail: "Google" },
  bing: { source: "search_engine", detail: "Bing" },
  facebook: { source: "social", detail: "Facebook" },
  fb: { source: "social", detail: "Facebook" },
  instagram: { source: "social", detail: "Instagram" },
  ig: { source: "social", detail: "Instagram" },
  tiktok: { source: "social", detail: "TikTok" },
  linkedin: { source: "social", detail: "LinkedIn" },
  chatgpt: { source: "llm", detail: "ChatGPT" },
  openai: { source: "llm", detail: "ChatGPT" },
  claude: { source: "llm", detail: "Claude" },
  anthropic: { source: "llm", detail: "Claude" },
  perplexity: { source: "llm", detail: "Perplexity" },
};

const GOOGLE_MEDIUM_MAP: Record<string, string> = {
  maps: "Google Maps",
  local: "Google Maps",
  cpc: "Google Ads",
};

export function mapUtmToReferral(utm: UtmParams): MappedReferral | null {
  const src = utm.utmSource?.toLowerCase()?.trim();
  if (!src) return null;

  const mapped = UTM_SOURCE_MAP[src];
  if (!mapped) {
    return { source: "other", sourceDetail: utm.utmSource || null, captureMethod: "utm" };
  }

  let detail = mapped.detail;

  if (src === "google" && utm.utmMedium) {
    const medium = utm.utmMedium.toLowerCase().trim();
    if (GOOGLE_MEDIUM_MAP[medium]) {
      detail = GOOGLE_MEDIUM_MAP[medium];
    }
  }

  return { source: mapped.source, sourceDetail: detail, captureMethod: "utm" };
}

export function mapRefToReferral(refParam: string): MappedReferral {
  return { source: "belegarzt", sourceDetail: refParam, captureMethod: "ref" };
}

const CLICK_ID_MAP: Record<string, { source: ReferralSource; detail: string }> = {
  gclid: { source: "search_engine", detail: "Google Ads" },
  gbraid: { source: "search_engine", detail: "Google Ads" },
  wbraid: { source: "search_engine", detail: "Google Ads" },
  fbclid: { source: "social", detail: "Meta Ads" },
  ttclid: { source: "social", detail: "TikTok Ads" },
  msclkid: { source: "search_engine", detail: "Bing Ads" },
  igshid: { source: "social", detail: "Instagram" },
  li_fat_id: { source: "social", detail: "LinkedIn Ads" },
  twclid: { source: "social", detail: "Twitter/X Ads" },
};

export function resolveReferralFromParams(params: {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  ref?: string | null;
  gclid?: string | null;
  gbraid?: string | null;
  wbraid?: string | null;
  fbclid?: string | null;
  ttclid?: string | null;
  msclkid?: string | null;
  igshid?: string | null;
  li_fat_id?: string | null;
  twclid?: string | null;
}): (MappedReferral & { utmParams?: UtmParams; refParam?: string }) | null {
  const utmResult = mapUtmToReferral(params);
  if (utmResult) {
    return {
      ...utmResult,
      utmParams: {
        utmSource: params.utmSource,
        utmMedium: params.utmMedium,
        utmCampaign: params.utmCampaign,
        utmTerm: params.utmTerm,
        utmContent: params.utmContent,
      },
    };
  }

  if (params.ref) {
    return { ...mapRefToReferral(params.ref), refParam: params.ref };
  }

  // Infer source from ad click IDs when no UTM params are present
  for (const [key, mapped] of Object.entries(CLICK_ID_MAP)) {
    if (params[key as keyof typeof params]) {
      return { source: mapped.source, sourceDetail: mapped.detail, captureMethod: "utm" };
    }
  }

  return null;
}
