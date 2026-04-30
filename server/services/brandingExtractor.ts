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
// Pre-validation, we normalise Claude's output so common-but-invalid forms
// (CSS-style font fallbacks, rgb()/rgba() colors, hex without `#`) don't
// throw. The downstream `nearestMatch` does fuzzy mapping anyway, so the
// font input just needs to be a clean catalog-style token; for colors we
// only accept #RGB/#RRGGBB (no alpha) since they're stored as-is.
const claudeShape = z.object({
  bgColor: z.string().regex(HEX_RE),
  primaryColor: z.string().regex(HEX_RE),
  secondaryColor: z.string().regex(HEX_RE),
  headingFont: z.string().regex(FONT_NAME_RE).max(60),
  bodyFont: z.string().regex(FONT_NAME_RE).max(60),
  cardRadius: z.enum(["sharp", "rounded", "pill"]).optional(),
  buttonStyle: z.enum(["filled", "outline", "ghost"]).optional(),
});

function normaliseColor(input: unknown): unknown {
  if (typeof input !== "string") return input;
  let s = input.trim();
  // rgb(r, g, b) or rgba(r, g, b, a) → #rrggbb (alpha dropped)
  const rgbMatch = s.match(
    /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+)?\s*\)$/i,
  );
  if (rgbMatch) {
    const toHex = (n: string) =>
      Math.max(0, Math.min(255, parseInt(n, 10)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  if (!s.startsWith("#")) s = `#${s}`;
  // Strip alpha channel if Claude returns 8-digit hex (#rrggbbaa).
  if (/^#[0-9a-fA-F]{8}$/.test(s)) s = s.slice(0, 7);
  return s.toLowerCase();
}

function normaliseFont(input: unknown): unknown {
  if (typeof input !== "string") return input;
  // Take the first entry from a CSS font-family list, strip surrounding
  // quotes, replace separators (hyphen, underscore, dot) with space, then
  // collapse whitespace. nearestMatch handles fuzzy mapping after this.
  let s = input.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  s = s.replace(/[-_.]/g, " ").replace(/\s+/g, " ").trim();
  return s.slice(0, 60);
}

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
  `headingFont, bodyFont, cardRadius. Colors are hex (e.g. "#c89b6b"). primaryColor ` +
  `= the main accent (CTA buttons / brand color). secondaryColor = a complementary ` +
  `accent (small details, links). headingFont and bodyFont are font-family names ` +
  `from the page; if a font is proprietary (Avenir Next, Helvetica Neue, etc.) ` +
  `return its actual name and the server will map to the closest Google Font. ` +
  `cardRadius is one of "sharp" (no/tiny corner radius, modern minimalist look), ` +
  `"rounded" (medium radius ~12-16px, the default modern look), or "pill" ` +
  `(large radius ~24-32px, soft/friendly look) — pick whichever the page's cards ` +
  `and buttons match. buttonStyle is one of "filled" (solid colored bg, white ` +
  `text — bold CTAs), "outline" (transparent bg, colored border + text — premium/ ` +
  `clinic look), or "ghost" (transparent, just colored text — minimal/airy) — ` +
  `pick whichever the page's primary buttons use. Output ONLY the JSON object, ` +
  `no prose.`;

export type ExtractResult = {
  bgColor: string;
  primaryColor: string;
  secondaryColor: string;
  headingFont: string;
  bodyFont: string;
  cardRadius?: "sharp" | "rounded" | "pill";
  buttonStyle?: "filled" | "outline" | "ghost";
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
  const text = data.content?.[0]?.text ?? "";
  // Claude sometimes wraps JSON in a ```json fence or precedes it with prose
  // despite the system-prompt instruction. Strip a fenced block first, then
  // fall back to extracting the largest {...} block.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
  let raw: any;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    logger.warn({ snippet: text.slice(0, 500) }, "Failed to parse Claude response as JSON");
    throw new Error("Failed to parse Claude response as JSON");
  }
  if (raw && typeof raw === "object") {
    raw.bgColor = normaliseColor(raw.bgColor);
    raw.primaryColor = normaliseColor(raw.primaryColor);
    raw.secondaryColor = normaliseColor(raw.secondaryColor);
    raw.headingFont = normaliseFont(raw.headingFont);
    raw.bodyFont = normaliseFont(raw.bodyFont);
  }
  const result = claudeShape.safeParse(raw);
  if (!result.success) {
    logger.warn(
      { raw, issues: result.error.flatten() },
      "Claude branding output failed schema validation",
    );
    throw new Error(
      `Claude branding output invalid: ${result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }

  const headingMapped = nearestMatch(result.data.headingFont, "heading");
  const bodyMapped = nearestMatch(result.data.bodyFont, "body");
  const mapped: ExtractResult = {
    bgColor: result.data.bgColor,
    primaryColor: result.data.primaryColor,
    secondaryColor: result.data.secondaryColor,
    headingFont: headingMapped,
    bodyFont: bodyMapped,
    ...(result.data.cardRadius ? { cardRadius: result.data.cardRadius } : {}),
    ...(result.data.buttonStyle ? { buttonStyle: result.data.buttonStyle } : {}),
  };
  if (headingMapped !== result.data.headingFont || bodyMapped !== result.data.bodyFont) {
    mapped.sourceFont = { heading: result.data.headingFont, body: result.data.bodyFont };
  }
  return mapped;
}
