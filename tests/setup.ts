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
