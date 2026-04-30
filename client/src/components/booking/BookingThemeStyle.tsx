import type { BookingTheme } from "@shared/schema";

interface Props {
  theme: BookingTheme | null;
}

function fontUrl(theme: BookingTheme): string | null {
  const families: string[] = [];
  if (theme.headingFont) families.push(`family=${encodeURIComponent(theme.headingFont)}:wght@600`);
  if (theme.bodyFont) families.push(`family=${encodeURIComponent(theme.bodyFont)}:wght@400;500`);
  if (!families.length) return null;
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

// Pick a contrast-safe foreground (white or near-black) for a given hex
// background. Uses simplified relative luminance per WCAG. Threshold 0.55
// errs on the side of dark text — light primary colors like coral/yellow
// would be unreadable with white text.
function contrastFg(hex: string): string {
  const c = hex.startsWith("#") ? hex.slice(1) : hex;
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  if (full.length !== 6) return "#ffffff";
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.55 ? "#18181b" : "#ffffff";
}

export function BookingThemeStyle({ theme }: Props) {
  if (!theme) return null;

  const decls: string[] = [];
  if (theme.bgColor) decls.push(`--book-bg: ${theme.bgColor};`);
  if (theme.primaryColor) {
    decls.push(`--book-primary: ${theme.primaryColor};`);
    decls.push(`--book-primary-fg: ${contrastFg(theme.primaryColor)};`);
  }
  if (theme.secondaryColor) {
    decls.push(`--book-secondary: ${theme.secondaryColor};`);
    decls.push(`--book-secondary-fg: ${contrastFg(theme.secondaryColor)};`);
  }
  if (theme.headingFont) decls.push(`--book-heading-font: '${theme.headingFont}', sans-serif;`);
  if (theme.bodyFont) decls.push(`--book-body-font: '${theme.bodyFont}', sans-serif;`);

  const link = fontUrl(theme);

  if (decls.length === 0) {
    if (!link) return null;
    return <link rel="stylesheet" href={link} />;
  }

  const cascade: string[] = [];

  // Fonts. Form elements (<input>, <button>, <select>, <textarea>) don't
  // inherit font-family from their parent by browser default, so we have to
  // force inheritance explicitly — otherwise body-font styling applies to
  // labels and copy but not to inputs/buttons, which looks incoherent.
  if (theme.bodyFont) {
    cascade.push(`[data-booking-root] { font-family: var(--book-body-font); }`);
    cascade.push(
      `[data-booking-root] input, ` +
        `[data-booking-root] button, ` +
        `[data-booking-root] select, ` +
        `[data-booking-root] textarea { font-family: inherit; }`,
    );
  }
  if (theme.headingFont) {
    cascade.push(
      `[data-booking-root] h1, ` +
        `[data-booking-root] h2, ` +
        `[data-booking-root] h3, ` +
        `[data-booking-root] h4, ` +
        `[data-booking-root] h5, ` +
        `[data-booking-root] h6 { font-family: var(--book-heading-font); }`,
    );
  }

  // Polish — applies whenever ANY theme is set, regardless of which fields
  // are populated. Tightens letter-spacing and bumps weight on headings;
  // small detail that takes the page from "default-ish" to "designed".
  cascade.push(
    `[data-booking-root] h1, [data-booking-root] h2, [data-booking-root] h3 { ` +
      `letter-spacing: -0.018em; ` +
      `font-weight: 600; ` +
      `}`,
  );

  // Subtle background gradient. Replaces the solid bgColor applied via the
  // page wrapper's inline style. Top → 3% darker at the bottom; gives the
  // page depth without looking gimmicky.
  if (theme.bgColor) {
    cascade.push(
      `[data-booking-root] { ` +
        `background: linear-gradient(180deg, var(--book-bg) 0%, color-mix(in srgb, var(--book-bg) 96%, black) 100%) !important; ` +
        `}`,
    );
  }

  // Card styling — drop heavy shadows on .shadow-sm/md/lg, replace with a
  // single hairline using the secondary color at low opacity. Premium-clinic
  // sites use thin lines, not fluffy SaaS shadows.
  if (theme.secondaryColor) {
    cascade.push(
      `[data-booking-root] .shadow-sm, ` +
        `[data-booking-root] .shadow, ` +
        `[data-booking-root] .shadow-md, ` +
        `[data-booking-root] .shadow-lg, ` +
        `[data-booking-root] .hover\\:shadow-md:hover { ` +
        `box-shadow: 0 0 0 1px color-mix(in srgb, var(--book-secondary) 14%, transparent) !important; ` +
        `}`,
    );
  }

  // Card radius — only the larger card classes; rounded-full (avatars,
  // tiny pills) stays untouched.
  const radius = (theme as any).cardRadius as "sharp" | "rounded" | "pill" | null | undefined;
  if (radius === "sharp") {
    cascade.push(
      `[data-booking-root] .rounded-xl, ` +
        `[data-booking-root] .rounded-2xl, ` +
        `[data-booking-root] .rounded-lg, ` +
        `[data-booking-root] .rounded { border-radius: 0 !important; }`,
    );
  } else if (radius === "pill") {
    cascade.push(
      `[data-booking-root] .rounded-xl, ` +
        `[data-booking-root] .rounded-2xl, ` +
        `[data-booking-root] .rounded-lg { border-radius: 28px !important; }`,
    );
  }

  // Color remaps. Tailwind utility classes containing `/` need backslash-
  // escaping in CSS selectors; in a JS string that's `\\/`.
  if (theme.primaryColor) {
    // Primary surface (full color CTA) — main "Termin buchen" button +
    // selected-slot blue + the green "Kostenlose Beratung" pill.
    cascade.push(
      `[data-booking-root] .bg-blue-500, ` +
        `[data-booking-root] .bg-blue-400, ` +
        `[data-booking-root] .bg-emerald-500, ` +
        `[data-booking-root] .bg-emerald-500\\/90 { ` +
        `background-color: var(--book-primary) !important; ` +
        `color: var(--book-primary-fg) !important; ` +
        `}`,
    );
    // Hover variants — slightly darker primary.
    cascade.push(
      `[data-booking-root] .hover\\:bg-blue-400:hover, ` +
        `[data-booking-root] .hover\\:bg-blue-500\\/20:hover { ` +
        `background-color: color-mix(in srgb, var(--book-primary) 88%, black) !important; ` +
        `color: var(--book-primary-fg) !important; ` +
        `}`,
    );
    // Disabled state — shadcn's base Button has `disabled:opacity-50`, which
    // on a primary-colored button washes both the background AND the text
    // into the page bg, leaving the label barely readable. Override with a
    // pale primary tint background + a dark primary-derived text color so
    // the button stays on-brand but stays legible. `opacity: 1` undoes the
    // shadcn base; `!important` is required because the page sets the
    // background via inline style.
    cascade.push(
      `[data-booking-root] button:disabled, ` +
        `[data-booking-root] button[disabled] { ` +
        `opacity: 1 !important; ` +
        `background: color-mix(in srgb, var(--book-primary) 22%, white) !important; ` +
        `background-color: color-mix(in srgb, var(--book-primary) 22%, white) !important; ` +
        `color: color-mix(in srgb, var(--book-primary) 75%, black) !important; ` +
        `box-shadow: none !important; ` +
        `cursor: not-allowed; ` +
        `}`,
    );
  }

  // Button style — outline or ghost overrides the filled primary remap.
  // Uses inset box-shadow instead of border so the button height doesn't
  // shift. Hover state restores filled look so the affordance stays clear.
  const buttonStyle = (theme as any).buttonStyle as "filled" | "outline" | "ghost" | null | undefined;
  if (theme.primaryColor && buttonStyle === "outline") {
    cascade.push(
      `[data-booking-root] .bg-blue-500, ` +
        `[data-booking-root] .bg-blue-400, ` +
        `[data-booking-root] .bg-emerald-500, ` +
        `[data-booking-root] .bg-emerald-500\\/90 { ` +
        `background-color: transparent !important; ` +
        `color: var(--book-primary) !important; ` +
        `box-shadow: inset 0 0 0 2px var(--book-primary) !important; ` +
        `}`,
    );
    cascade.push(
      `[data-booking-root] .bg-blue-500:hover, ` +
        `[data-booking-root] .bg-emerald-500:hover { ` +
        `background-color: var(--book-primary) !important; ` +
        `color: var(--book-primary-fg) !important; ` +
        `}`,
    );
  } else if (theme.primaryColor && buttonStyle === "ghost") {
    cascade.push(
      `[data-booking-root] .bg-blue-500, ` +
        `[data-booking-root] .bg-blue-400, ` +
        `[data-booking-root] .bg-emerald-500, ` +
        `[data-booking-root] .bg-emerald-500\\/90 { ` +
        `background-color: transparent !important; ` +
        `color: var(--book-primary) !important; ` +
        `box-shadow: none !important; ` +
        `}`,
    );
    cascade.push(
      `[data-booking-root] .bg-blue-500:hover, ` +
        `[data-booking-root] .bg-emerald-500:hover { ` +
        `background-color: color-mix(in srgb, var(--book-primary) 12%, transparent) !important; ` +
        `}`,
    );
  }

  if (theme.secondaryColor) {
    // Soft "pill" backgrounds (VORSCHLAG badge, soft confirm boxes). 18%
    // opacity tint of secondary so the pill looks subtle.
    cascade.push(
      `[data-booking-root] .bg-blue-50, ` +
        `[data-booking-root] .bg-blue-500\\/15, ` +
        `[data-booking-root] .bg-emerald-50, ` +
        `[data-booking-root] .bg-emerald-400\\/15, ` +
        `[data-booking-root] .bg-emerald-500\\/15 { ` +
        `background-color: color-mix(in srgb, var(--book-secondary) 18%, transparent) !important; ` +
        `}`,
    );
    // Link / badge text — "Ändern" links, VORSCHLAG label, etc.
    cascade.push(
      `[data-booking-root] .text-blue-700, ` +
        `[data-booking-root] .text-blue-500, ` +
        `[data-booking-root] .text-blue-300, ` +
        `[data-booking-root] .text-emerald-700, ` +
        `[data-booking-root] .text-emerald-300 { ` +
        `color: var(--book-secondary) !important; ` +
        `}`,
    );
    // Borders + rings — soft pill outlines.
    cascade.push(
      `[data-booking-root] .border-blue-200, ` +
        `[data-booking-root] .border-blue-300, ` +
        `[data-booking-root] .border-blue-400\\/30, ` +
        `[data-booking-root] .border-emerald-200, ` +
        `[data-booking-root] .border-emerald-400\\/30, ` +
        `[data-booking-root] .ring-blue-200, ` +
        `[data-booking-root] .ring-blue-400\\/30, ` +
        `[data-booking-root] .ring-emerald-300\\/40, ` +
        `[data-booking-root] .ring-emerald-600\\/20 { ` +
        `border-color: color-mix(in srgb, var(--book-secondary) 40%, transparent) !important; ` +
        `--tw-ring-color: color-mix(in srgb, var(--book-secondary) 40%, transparent) !important; ` +
        `}`,
    );
  }

  const css =
    `[data-booking-root] {\n  ${decls.join("\n  ")}\n}\n` +
    cascade.join("\n");

  return (
    <>
      {link && <link rel="stylesheet" href={link} />}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
