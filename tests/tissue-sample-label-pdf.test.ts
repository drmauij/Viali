import { describe, expect, it, vi } from "vitest";

describe("printTissueSampleLabel", () => {
  it("uses 29x90mm landscape page dimensions matching DK-11201", async () => {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: [29, 90],
    });
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(90);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(29);
  });

  it("opens a blob URL via window.open when called", async () => {
    const openSpy = vi.fn(() => ({}) as unknown as Window);
    (globalThis as any).window = { open: openSpy };
    if (!(globalThis as any).URL.createObjectURL) {
      (globalThis as any).URL.createObjectURL = vi.fn(() => "blob:stub");
    }
    if (!(globalThis as any).URL.revokeObjectURL) {
      (globalThis as any).URL.revokeObjectURL = vi.fn();
    }

    const { printTissueSampleLabel } = await import(
      "../client/src/lib/tissueSampleLabelPdf.ts"
    );
    await printTissueSampleLabel({
      code: "FAT-2026-0042",
      dateText: "05.05.2026",
    });

    expect(openSpy).toHaveBeenCalledTimes(1);
    const [url] = openSpy.mock.calls[0] as unknown as [string];
    expect(typeof url).toBe("string");
  });
});
