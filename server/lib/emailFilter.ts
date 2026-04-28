/**
 * Returns true if the email is a non-empty, syntactically-plausible address
 * that does NOT contain ".local" anywhere (case-insensitive). The ".local"
 * exclusion rules out seed/dev placeholders like `nurse@hospital.local`.
 *
 * The check is intentionally strict — anything containing the substring
 * `.local` is rejected, even legitimate-looking domains, per product decision.
 */
export function isValidWorkerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const trimmed = email.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return false;
  const lowerTrimmed = trimmed.toLowerCase();
  // Reject if "local" appears as a domain label (after @ or after a dot)
  if (lowerTrimmed.includes(".local") || lowerTrimmed.includes("@local.")) return false;
  return true;
}
