import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";
import "./themes/calendar_white.css";
import "./themes/month_white.css";

// Expected "probe" 4xx responses that are part of normal app flow (missing
// records, invalid/expired tokens, user-input validation) and should NOT
// surface as Sentry issues. Each entry = (method, statuses, path regex).
// Path is the URL path without query string.
const EXPECTED_FETCH_NOISE: Array<{
  method: string;
  statuses: number[];
  pattern: RegExp;
}> = [
  // Existence probes — 404 is the "not found yet" answer, not a bug
  { method: "GET", statuses: [404], pattern: /^\/api\/anesthesia\/records\/surgery\/[^/]+$/ },
  { method: "GET", statuses: [404], pattern: /^\/api\/patient-portal\/[^/]+\/consent-data$/ },
  { method: "GET", statuses: [404], pattern: /^\/api\/public\/questionnaire\/[^/]+\/info-flyers$/ },
  { method: "GET", statuses: [404], pattern: /^\/api\/business\/[^/]+\/ai-analysis$/ },
  // Token-gated public / portal routes — 403 is "invalid or expired token"
  { method: "GET", statuses: [403, 404], pattern: /^\/api\/public\/questionnaire\/[^/]+$/ },
  { method: "GET", statuses: [403, 404], pattern: /^\/api\/patient-portal\/[^/]+$/ },
  { method: "GET", statuses: [403], pattern: /^\/api\/surgeon-portal\/[^/]+\/surgeries$/ },
  { method: "GET", statuses: [403], pattern: /^\/api\/admin\/[^/]+\/questionnaire-token$/ },
  // Patient portal login — 400 on wrong verification code is user input, not a bug
  { method: "POST", statuses: [400, 401], pattern: /^\/api\/portal-auth\/patient\/[^/]+\/verify-code$/ },
  // Worklog portal login — same pattern as patient portal verify-code
  { method: "POST", statuses: [400, 401], pattern: /^\/api\/portal-auth\/worklog\/[^/]+\/verify-code$/ },
  // Patient-portal token GET — 410 Gone = link expired (normal token lifecycle)
  { method: "GET", statuses: [410], pattern: /^\/api\/patient-portal\/[^/]+$/ },
  // Admin email change — 409 EMAIL_EXISTS is user-input collision, surfaced via toast
  { method: "PATCH", statuses: [409], pattern: /^\/api\/admin\/users\/[^/]+\/email$/ },
  // Inventory commit — 400 = missing signature / nothing to commit (user-input validation)
  { method: "POST", statuses: [400], pattern: /^\/api\/anesthesia\/inventory\/[^/]+\/commit$/ },
  // Item archive guard — 409 ITEM_HAS_MED_CONFIGS is the confirm-before-archive flow
  { method: "PATCH", statuses: [409], pattern: /^\/api\/items\/[^/]+$/ },
  // Item reduce-unit — 400 "No units available" when stock is 0 (user clicked "-" on stockout)
  { method: "PATCH", statuses: [400], pattern: /^\/api\/items\/[^/]+\/reduce-unit$/ },
  // PDF export probes sticker docs that may not be persisted yet — caller handles 404 gracefully
  { method: "GET", statuses: [404], pattern: /^\/api\/anesthesia\/records\/[^/]+\/sticker-doc\/[^/]+\/download-url$/ },
];

function isExpectedFetchNoise(method: string, url: string, status: number): boolean {
  // url may be absolute or relative; extract path only
  let path = url;
  try {
    path = new URL(url, window.location.origin).pathname;
  } catch {
    // Fallback: strip query string
    const q = url.indexOf("?");
    if (q >= 0) path = url.slice(0, q);
  }
  return EXPECTED_FETCH_NOISE.some(
    (r) => r.method === method && r.statuses.includes(status) && r.pattern.test(path),
  );
}

// Initialize Sentry for frontend error monitoring
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      // React 18 race when portals/dialogs unmount during route change or when
      // browser extensions (e.g. Google Translate) rewrite the DOM. Not actionable.
      /Failed to execute 'removeChild' on 'Node'/,
      // Stale Vite chunk after a new deploy — user needs to reload; not a bug
      /Failed to fetch dynamically imported module/,
      /Loading chunk .* failed/,
      /Importing a module script failed/,
      /'text\/html' is not a valid JavaScript MIME type/,
    ],
  });

  // Global fetch interceptor: report any non-ok response on same-origin /api
  // calls to Sentry. Covers raw fetch() callsites (e.g. /book page) that don't
  // go through the apiRequest wrapper. Composes safely with the demo-mode
  // interceptor in utils/demoMode.ts (both chain on top of window.fetch).
  const _origFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await _origFetch(input, init);
    try {
      if (!res.ok) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
            ? input.href
            : (input as Request).url;
        const isSameOrigin =
          url.startsWith("/") ||
          url.startsWith(window.location.origin) ||
          url.startsWith(window.location.protocol + "//" + window.location.host);
        const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
        // 401/403 on /api/* are auth/permission state, not bugs: session expired
        // while a page polls in background, or non-admin user hits an admin route.
        // These flood Sentry without representing real errors.
        const isAuthState =
          (res.status === 401 || res.status === 403) && url.includes("/api/");
        const isRateLimited = res.status === 429;
        const isExpectedNoise = isExpectedFetchNoise(method, url, res.status);
        // 502/503/504 are nginx/upstream outages — Node process restart, crash,
        // or deploy window. Not app bugs; suppress to avoid flooding Sentry.
        const isUpstreamOutage = res.status === 502 || res.status === 503 || res.status === 504;
        if (isSameOrigin && !isAuthState && !isRateLimited && !isExpectedNoise && !isUpstreamOutage) {
          let body: string | undefined;
          try {
            body = (await res.clone().text()).slice(0, 2000);
          } catch {
            /* response may not be clonable; ignore */
          }
          Sentry.captureMessage(`${res.status} ${method} ${url}`, {
            level: res.status >= 500 ? "error" : "warning",
            tags: {
              type: "fetch_error",
              status: String(res.status),
              method,
              url,
            },
            extra: {
              response: body,
              statusText: res.statusText,
            },
            fingerprint: ["fetch-error", String(res.status), method, url],
          });
        }
      }
    } catch {
      /* never let instrumentation break the real request */
    }
    return res;
  };
}

// Stale-deploy auto-recovery: when a hashed Vite chunk goes missing after a
// deploy, dynamic import() rejects with one of these messages. The page is
// effectively broken until reload. Reload once per session — guarded so a real
// missing chunk (rare) doesn't infinite-loop the user.
const CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Loading chunk .* failed/i,
  /Importing a module script failed/i,
  /'text\/html' is not a valid JavaScript MIME type/i,
];
const RELOAD_FLAG = "viali_chunk_reload_once";

function maybeReloadOnChunkError(message: unknown) {
  if (typeof message !== "string") return;
  if (!CHUNK_ERROR_PATTERNS.some((re) => re.test(message))) return;
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* private mode etc. — fall through and reload anyway */
  }
  window.location.reload();
}

window.addEventListener("error", (e) => {
  maybeReloadOnChunkError(e.message);
});
window.addEventListener("unhandledrejection", (e) => {
  const reason: any = e.reason;
  maybeReloadOnChunkError(typeof reason === "string" ? reason : reason?.message);
});

createRoot(document.getElementById("root")!).render(<App />);
