import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";
import "./themes/calendar_white.css";
import "./themes/month_white.css";

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
        if (isSameOrigin && !isExpected401 && !isRateLimited) {
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
