export const SNIPPET_EDIT_SYSTEM_PROMPT = `You are editing ONE element of an HTML email newsletter.

You will receive:
1. The current outerHTML of the element (with a data-vai-marker attribute).
2. The email's <head> for brand reference (CSS, fonts, palette).
3. The user's instruction.

Return ONLY the replacement outerHTML for that single element. Rules:
- Output exactly ONE root element. No prose, no markdown fences, no <html>/<head>/<body>.
- Preserve the data-vai-marker attribute on the root element verbatim.
- Match the brand's existing CSS — same color palette, same font stack, same spacing scale.
- Keep all template variables ({{vorname}}, {{nachname}}, {{behandlung}}, {{buchungslink}}) intact unless the user explicitly asks to change them.
- Use ONLY inline styles (email-safe).
- Do not change the element's tag unless the instruction explicitly requires it.`;

export function buildSnippetEditUserMessage(
  brandHead: string,
  selectedSnippet: string,
  prompt: string,
): string {
  return [
    `Brand reference (head):\n${(brandHead || "").slice(0, 3000)}`,
    `Element to edit:\n${selectedSnippet}`,
    `Instruction:\n${prompt}`,
  ].join("\n\n");
}

export function stripMarkdownFencesServer(s: string): string {
  return s
    .trim()
    .replace(/^```(?:html|HTML)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "");
}
