// Curated Google Fonts shortlist for the booking page theme editor.
// Heading-friendly fonts have strong personality (serif/display).
// Body-friendly fonts are highly legible at 14-16px.

export const HEADING_FONTS = [
  "Playfair Display",
  "Cormorant Garamond",
  "Merriweather",
  "Lora",
  "DM Serif Display",
  "Libre Baskerville",
  "Montserrat",
  "Poppins",
  "Bebas Neue",
  "Oswald",
] as const;

export const BODY_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Source Sans 3",
  "Nunito Sans",
  "Work Sans",
  "DM Sans",
  "IBM Plex Sans",
  "Manrope",
] as const;

const SERIF_HINTS = ["serif", "playfair", "garamond", "baskerville", "merriweather", "lora", "georgia", "times"];
const SANS_HINTS  = ["sans", "inter", "roboto", "lato", "helvetica", "arial", "avenir", "futura", "nunito", "manrope"];

export type FontKind = "heading" | "body";

export function nearestMatch(name: string, kind: FontKind): string {
  const list = kind === "heading" ? HEADING_FONTS : BODY_FONTS;
  const lower = name.toLowerCase();

  for (const f of list) {
    if (f.toLowerCase() === lower) return f;
  }

  const isSerif = SERIF_HINTS.some(h => lower.includes(h));
  const isSans  = SANS_HINTS.some(h => lower.includes(h));

  if (kind === "heading") {
    if (isSans) return "Montserrat";
    return "Playfair Display";
  } else {
    if (isSerif) return "Lora";
    return "Inter";
  }
}
