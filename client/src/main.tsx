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
        const isExpected401 =
          res.status === 401 && url.includes("/api/auth/");
        const isRateLimited = res.status === 429;
        const isExpectedNoise = isExpectedFetchNoise(method, url, res.status);
        // 502/503/504 are nginx/upstream outages — Node process restart, crash,
        // or deploy window. Not app bugs; suppress to avoid flooding Sentry.
        const isUpstreamOutage = res.status === 502 || res.status === 503 || res.status === 504;
        if (isSameOrigin && !isExpected401 && !isRateLimited && !isExpectedNoise && !isUpstreamOutage) {
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

createRoot(document.getElementById("root")!).render(<App />);
