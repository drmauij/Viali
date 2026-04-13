import { describe, it, expect } from "vitest";
import {
  mapUtmToReferral,
  mapRefToReferral,
  resolveReferralFromParams,
  isMarketingUtmSource,
  MARKETING_UTM_SOURCES,
} from "../shared/referralMapping";

describe("mapUtmToReferral", () => {
  // Known sources
  it("maps google to search_engine/Google", () => {
    const result = mapUtmToReferral({ utmSource: "google" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google", captureMethod: "utm" });
  });

  it("maps google+maps medium to search_engine/Google Maps", () => {
    const result = mapUtmToReferral({ utmSource: "google", utmMedium: "maps" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google Maps", captureMethod: "utm" });
  });

  it("maps google+local medium to search_engine/Google Maps", () => {
    const result = mapUtmToReferral({ utmSource: "google", utmMedium: "local" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google Maps", captureMethod: "utm" });
  });

  it("maps google+cpc medium to search_engine/Google (paid detected at query time)", () => {
    const result = mapUtmToReferral({ utmSource: "google", utmMedium: "cpc" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google", captureMethod: "utm" });
  });

  it("maps google+organic medium to search_engine/Google", () => {
    const result = mapUtmToReferral({ utmSource: "google", utmMedium: "organic" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google", captureMethod: "utm" });
  });

  it("maps bing to search_engine/Bing", () => {
    const result = mapUtmToReferral({ utmSource: "bing" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Bing", captureMethod: "utm" });
  });

  it("maps facebook to social/Facebook", () => {
    const result = mapUtmToReferral({ utmSource: "facebook" });
    expect(result).toEqual({ source: "social", sourceDetail: "Facebook", captureMethod: "utm" });
  });

  it("maps fb to social/Facebook", () => {
    const result = mapUtmToReferral({ utmSource: "fb" });
    expect(result).toEqual({ source: "social", sourceDetail: "Facebook", captureMethod: "utm" });
  });

  it("maps instagram to social/Instagram", () => {
    const result = mapUtmToReferral({ utmSource: "instagram" });
    expect(result).toEqual({ source: "social", sourceDetail: "Instagram", captureMethod: "utm" });
  });

  it("maps ig to social/Instagram", () => {
    const result = mapUtmToReferral({ utmSource: "ig" });
    expect(result).toEqual({ source: "social", sourceDetail: "Instagram", captureMethod: "utm" });
  });

  it("maps tiktok to social/TikTok", () => {
    const result = mapUtmToReferral({ utmSource: "tiktok" });
    expect(result).toEqual({ source: "social", sourceDetail: "TikTok", captureMethod: "utm" });
  });

  it("maps chatgpt to llm/ChatGPT", () => {
    const result = mapUtmToReferral({ utmSource: "chatgpt" });
    expect(result).toEqual({ source: "llm", sourceDetail: "ChatGPT", captureMethod: "utm" });
  });

  it("maps openai to llm/ChatGPT", () => {
    const result = mapUtmToReferral({ utmSource: "openai" });
    expect(result).toEqual({ source: "llm", sourceDetail: "ChatGPT", captureMethod: "utm" });
  });

  it("maps claude to llm/Claude", () => {
    const result = mapUtmToReferral({ utmSource: "claude" });
    expect(result).toEqual({ source: "llm", sourceDetail: "Claude", captureMethod: "utm" });
  });

  it("maps perplexity to llm/Perplexity", () => {
    const result = mapUtmToReferral({ utmSource: "perplexity" });
    expect(result).toEqual({ source: "llm", sourceDetail: "Perplexity", captureMethod: "utm" });
  });

  // Unknown source
  it("maps unknown source to other", () => {
    const result = mapUtmToReferral({ utmSource: "somerandomblog" });
    expect(result).toEqual({ source: "other", sourceDetail: "somerandomblog", captureMethod: "utm" });
  });

  // Case insensitive
  it("is case insensitive", () => {
    const result = mapUtmToReferral({ utmSource: "Google" });
    expect(result).toEqual({ source: "search_engine", sourceDetail: "Google", captureMethod: "utm" });
  });

  // Null/empty
  it("returns null for empty utm_source", () => {
    const result = mapUtmToReferral({ utmSource: "" });
    expect(result).toBeNull();
  });

  it("returns null for null utm_source", () => {
    const result = mapUtmToReferral({ utmSource: null });
    expect(result).toBeNull();
  });
});

describe("mapRefToReferral", () => {
  it("maps ref param to belegarzt source", () => {
    const result = mapRefToReferral("dr-smith");
    expect(result.source).toBe("belegarzt");
    expect(result.captureMethod).toBe("ref");
  });

  it("preserves the ref value as sourceDetail", () => {
    const result = mapRefToReferral("dr-smith");
    expect(result.sourceDetail).toBe("dr-smith");
  });
});

describe("resolveReferralFromParams", () => {
  it("returns null when no params", () => {
    const result = resolveReferralFromParams({});
    expect(result).toBeNull();
  });

  it("returns UTM result when utm_source present", () => {
    const result = resolveReferralFromParams({ utmSource: "google" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("search_engine");
    expect(result!.sourceDetail).toBe("Google");
    expect(result!.captureMethod).toBe("utm");
  });

  it("returns ref result when only ref present", () => {
    const result = resolveReferralFromParams({ ref: "dr-jones" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("belegarzt");
    expect(result!.sourceDetail).toBe("dr-jones");
    expect(result!.captureMethod).toBe("ref");
  });

  it("UTM takes priority over ref when both present", () => {
    const result = resolveReferralFromParams({ utmSource: "facebook", ref: "dr-jones" });
    expect(result).not.toBeNull();
    expect(result!.source).toBe("social");
    expect(result!.captureMethod).toBe("utm");
  });

  it("includes utmParams in result when UTM detected", () => {
    const result = resolveReferralFromParams({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer2026",
      utmTerm: "anesthesia",
      utmContent: "banner",
    });
    expect(result).not.toBeNull();
    expect(result!.utmParams).toEqual({
      utmSource: "google",
      utmMedium: "cpc",
      utmCampaign: "summer2026",
      utmTerm: "anesthesia",
      utmContent: "banner",
    });
  });

  it("includes refParam in result when ref detected", () => {
    const result = resolveReferralFromParams({ ref: "dr-jones" });
    expect(result).not.toBeNull();
    expect(result!.refParam).toBe("dr-jones");
  });
});

describe("marketing utm sources", () => {
  // UTM_SOURCE_MAP entries — these must return source=marketing with a friendly detail
  // so new Flows / newsletter bookings get categorized under Marketing.

  it("maps klaviyo to marketing/Klaviyo", () => {
    const result = mapUtmToReferral({ utmSource: "klaviyo" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "Klaviyo", captureMethod: "utm" });
  });

  it("maps mailchimp to marketing/Mailchimp", () => {
    const result = mapUtmToReferral({ utmSource: "mailchimp" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "Mailchimp", captureMethod: "utm" });
  });

  it("maps brevo to marketing/Brevo", () => {
    const result = mapUtmToReferral({ utmSource: "brevo" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "Brevo", captureMethod: "utm" });
  });

  it("maps sendgrid to marketing/SendGrid", () => {
    const result = mapUtmToReferral({ utmSource: "sendgrid" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "SendGrid", captureMethod: "utm" });
  });

  it("maps whatsapp_campaign to marketing/WhatsApp Campaign", () => {
    const result = mapUtmToReferral({ utmSource: "whatsapp_campaign" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "WhatsApp Campaign", captureMethod: "utm" });
  });

  it("klaviyo mapping is case-insensitive (matches Peter Schmid's 'Klaviyo')", () => {
    const result = mapUtmToReferral({ utmSource: "Klaviyo" });
    expect(result).toEqual({ source: "marketing", sourceDetail: "Klaviyo", captureMethod: "utm" });
  });
});

describe("isMarketingUtmSource", () => {
  it("returns true for each value in MARKETING_UTM_SOURCES", () => {
    for (const src of MARKETING_UTM_SOURCES) {
      expect(isMarketingUtmSource(src)).toBe(true);
    }
  });

  it("matches Flows email channel (email_campaign)", () => {
    expect(isMarketingUtmSource("email_campaign")).toBe(true);
  });

  it("matches Flows SMS channel (sms_campaign)", () => {
    expect(isMarketingUtmSource("sms_campaign")).toBe(true);
  });

  it("matches future Flows WhatsApp channel", () => {
    expect(isMarketingUtmSource("whatsapp_campaign")).toBe(true);
  });

  it("matches generic 'newsletter' value", () => {
    expect(isMarketingUtmSource("newsletter")).toBe(true);
  });

  it("matches Klaviyo retroactively (the Peter Schmid case)", () => {
    expect(isMarketingUtmSource("Klaviyo")).toBe(true);
    expect(isMarketingUtmSource("klaviyo")).toBe(true);
    expect(isMarketingUtmSource("KLAVIYO")).toBe(true);
  });

  it("trims whitespace", () => {
    expect(isMarketingUtmSource("  klaviyo  ")).toBe(true);
  });

  it("returns false for ad / search sources", () => {
    expect(isMarketingUtmSource("google")).toBe(false);
    expect(isMarketingUtmSource("facebook")).toBe(false);
    expect(isMarketingUtmSource("tiktok")).toBe(false);
    expect(isMarketingUtmSource("bing")).toBe(false);
  });

  it("returns false for unknown sources", () => {
    expect(isMarketingUtmSource("somerandomblog")).toBe(false);
  });

  it("returns false for null/undefined/empty", () => {
    expect(isMarketingUtmSource(null)).toBe(false);
    expect(isMarketingUtmSource(undefined)).toBe(false);
    expect(isMarketingUtmSource("")).toBe(false);
  });
});
