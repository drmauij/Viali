// shared/contractTemplates/resolveText.ts
const TOKEN_RE = /\{\{([\w.]+)\}\}/g;

export function resolveText(text: string, data: Record<string, unknown>): string {
  return text.replace(TOKEN_RE, (_, key: string) => {
    const value = key.split(".").reduce<unknown>(
      (acc, part) => (acc != null && typeof acc === "object" ? (acc as Record<string, unknown>)[part] : undefined),
      data,
    );
    return value == null ? "" : String(value);
  });
}
