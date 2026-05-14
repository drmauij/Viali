// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Source-file assertion fallback: OPCalendar fetches its own data via hooks
// and would require extensive query-client + provider mocking to render. We
// guard against regression by asserting the pill JSX is gone from source.
const SOURCE = readFileSync(
  resolve(__dirname, "../OPCalendar.tsx"),
  "utf8",
);

describe("OPCalendar — ambulant pill removed", () => {
  it("does NOT contain the ambulant-pill data-testid", () => {
    expect(SOURCE).not.toMatch(/ambulant-pill-/);
  });

  it("does NOT contain the 🟢|🟡|🔴 emoji literals", () => {
    expect(SOURCE).not.toMatch(/🟢|🟡|🔴/);
  });
});
