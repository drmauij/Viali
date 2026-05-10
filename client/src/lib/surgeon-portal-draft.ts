// localStorage-backed draft persistence for the surgeon-portal request form.
// Pure module — no React. The "snapshot" is opaque to this module so callers
// can pass any shape (we only persist + restore JSON). Stale drafts (>7 days)
// or mismatched versions are silently discarded on load.

const KEY_PREFIX = "viali.surgeon-portal.draft";
const CURRENT_VERSION = 1 as const;
const MAX_AGE_DAYS = 7;

export type SurgerySnapshot = Record<string, unknown>;

export type SurgeonPortalDraft = {
  savedAt: string;
  version: typeof CURRENT_VERSION;
  values: SurgerySnapshot;
};

function storageKey(token: string, email: string): string {
  return `${KEY_PREFIX}.${token}.${email.toLowerCase()}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function saveDraft(token: string, email: string, values: SurgerySnapshot): void {
  const ls = safeStorage();
  if (!ls) return;
  const payload: SurgeonPortalDraft = {
    savedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
    values,
  };
  try {
    ls.setItem(storageKey(token, email), JSON.stringify(payload));
  } catch {
    // Quota exceeded or write disabled; ignore.
  }
}

export function loadDraft(token: string, email: string): SurgeonPortalDraft | null {
  const ls = safeStorage();
  if (!ls) return null;
  const key = storageKey(token, email);
  let raw: string | null;
  try {
    raw = ls.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SurgeonPortalDraft;
    if (parsed.version !== CURRENT_VERSION) {
      ls.removeItem(key);
      return null;
    }
    const ageMs = Date.now() - new Date(parsed.savedAt).getTime();
    if (ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      ls.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    try {
      ls.removeItem(key);
    } catch {
      /* noop */
    }
    return null;
  }
}

export function clearDraft(token: string, email: string): void {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(storageKey(token, email));
  } catch {
    /* noop */
  }
}
