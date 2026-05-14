import dotenv from "dotenv";
dotenv.config();

// jsdom does not ship ResizeObserver; Radix UI needs it.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
}

// Bootstrap react-i18next so components that call useTranslation() resolve to
// real strings in tests instead of returning the raw key.
import "../client/src/i18n/config";
