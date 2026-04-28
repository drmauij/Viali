// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import * as React from "react";
import { ContractDocumentPdf } from "../../client/src/lib/contractTemplates/ContractDocumentPdf";
import { ON_CALL_V1_DE } from "../../server/seed/contractTemplateStarters";

describe("ContractDocumentPdf — PDF smoke", () => {
  it("renders the on-call starter to a non-empty PDF buffer", async () => {
    const data = { role: ON_CALL_V1_DE.variables.selectableLists[0].options[0] };
    const buffer = await renderToBuffer(
      <ContractDocumentPdf
        blocks={ON_CALL_V1_DE.blocks}
        data={data}
        workerSignaturePng={null}
        managerSignaturePng={null}
      />
    );
    expect(buffer.byteLength).toBeGreaterThan(1000);
    // PDF binaries always start with "%PDF-"
    expect(buffer.toString("utf8", 0, 5)).toBe("%PDF-");
  });
});
