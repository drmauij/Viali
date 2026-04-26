import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import logger from "../logger";
import { nearestMatch } from "../lib/googleFontsCatalog";

const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const PLAYWRIGHT_TIMEOUT_MS = 8000;
const HTML_LIMIT = 30_000;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
// Same Google-Fonts-style naming we enforce in the save schema (defense in
// depth — Claude's output also passes through nearestMatch which returns a
// catalog entry, but if Claude ever returns garbage that incidentally
// matches the catalog name AND has weird chars, this guards us).
const FONT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9 ]*$/;
const claudeShape = z.object({
  bgColor: z.string().regex(HEX_RE),
  primaryColor: z.string().regex(HEX_RE),
  secondaryColor: z.string().regex(HEX_RE),
  headingFont: z.string().regex(FONT_NAME_RE).max(60),
  bodyFont: z.string().regex(FONT_NAME_RE).max(60),
});

function isPrivateOrReservedIp(ip: string): boolean {
  if (!isIP(ip)) return false;
  // IPv4
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10) return true;                      // 10.0.0.0/8
    if (a === 127) return true;                     // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;        // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;        // 192.168.0.0/16
    if (a === 0) return true;                       // 0.0.0.0/8
    if (a >= 224) return true;                      // multicast/reserved
    return false;
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;                 // loopback
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("fe80")) return true;        // link-local
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped — recurse on the v4 portion
    const v4 = lower.slice("::ffff:".length);
    return isPrivateOrReservedIp(v4);
  }
  return false;
}

const SYSTEM_PROMPT =
  `You are a design-token extractor. Given a screenshot and the HTML of a webpage, ` +
  `return a JSON object with the fields: bgColor, primaryColor, secondaryColor, ` +
  `headingFont, bodyFont. Colors are hex (e.g. "#c89b6b"). primaryColor = the main ` +
  `accent (CTA buttons / brand color). secondaryColor = a complementary accent ` +
  `(small details, links). headingFont and bodyFont are font-family names from the ` +
  `page; if a font is proprietary (Avenir Next, Helvetica Neue, etc.) return its ` +
  `actual name and the server will map to the closest Google Font. Output ONLY the ` +
  `JSON object, no prose.`;

export type ExtractResult = {
  bgColor: string;
  primaryColor: string;
  secondaryColor: string;
  headingFont: string;
  bodyFont: string;
  sourceFont?: { heading: string; body: string };
};

export async function extractThemeFromUrl(url: string): Promise<ExtractResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("invalid url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("invalid url: only http(s) allowed");
  }
  if (url.length > 2048) throw new Error("invalid url: too long");

  // SSRF guard: reject internal hostnames before DNS, and any DNS result
  // that resolves into a private/reserved IP range (cloud-metadata,
  // loopback, RFC1918, link-local, etc.). Without this an authenticated
  // user could target http://169.254.169.254/, internal VPS hostnames, etc.
  // URL.hostname strips the IPv6 brackets, so isIP works on the raw value.
  let hostname = parsed.hostname;
  // Strip IPv6 brackets if URL.hostname kept them (most Node versions don't,
  // but be safe).
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    hostname = hostname.slice(1, -1);
  }
  if (
    hostname === "localhost" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("invalid url: internal hostname");
  }
  // If the hostname is already an IP literal, skip DNS and check directly.
  if (isIP(hostname)) {
    if (isPrivateOrReservedIp(hostname)) {
      throw new Error("invalid url: private or reserved IP");
    }
  } else {
    let addrs: { address: string; family: number }[];
    try {
      addrs = await lookup(hostname, { all: true });
    } catch {
      throw new Error("invalid url: hostname did not resolve");
    }
    for (const a of addrs) {
      if (isPrivateOrReservedIp(a.address)) {
        throw new Error("invalid url: private or reserved IP");
      }
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });
  let screenshot: Buffer;
  let html: string;
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1000, height: 700 },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PLAYWRIGHT_TIMEOUT_MS });
    await page.waitForTimeout(400);
    screenshot = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
    html = await page.content();
  } finally {
    await browser.close();
  }
  const htmlExcerpt = html.slice(0, HTML_LIMIT);

  const userBlocks = [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: screenshot.toString("base64") },
    },
    { type: "text", text: `URL: ${url}\n\nHTML excerpt:\n${htmlExcerpt}` },
  ];

  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userBlocks }],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    logger.error({ status: resp.status, body }, "anthropic api error");
    throw new Error(`Anthropic API error: ${resp.status}`);
  }

  const data: any = await resp.json();
  const text = data.content?.[0]?.text;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("Failed to parse Claude response as JSON");
  }
  const result = claudeShape.safeParse(raw);
  if (!result.success) throw new Error(`Failed to parse Claude response: ${result.error.message}`);

  const headingMapped = nearestMatch(result.data.headingFont, "heading");
  const bodyMapped = nearestMatch(result.data.bodyFont, "body");
  const mapped: ExtractResult = {
    bgColor: result.data.bgColor,
    primaryColor: result.data.primaryColor,
    secondaryColor: result.data.secondaryColor,
    headingFont: headingMapped,
    bodyFont: bodyMapped,
  };
  if (headingMapped !== result.data.headingFont || bodyMapped !== result.data.bodyFont) {
    mapped.sourceFont = { heading: result.data.headingFont, body: result.data.bodyFont };
  }
  return mapped;
}
