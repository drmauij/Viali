// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ContractDocument } from "@/lib/contractTemplates/ContractDocument";
import type { Block, ContractData } from "@shared/contractTemplates/types";

const blocks: Block[] = [
  { id: "h", type: "heading", level: 1, text: "Title {{role.title}}" },
  { id: "p", type: "paragraph", text: "Rate: {{role.rate}}" },
  { id: "sw", type: "signature", party: "worker", label: "Signed" },
];

const data: ContractData = { role: { title: "OTA", rate: "CHF 50" } };

describe("<ContractDocument>", () => {
  it("interpolates variables in heading + paragraph", () => {
    const { container } = render(<ContractDocument blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} />);
    expect(container.textContent).toContain("Title OTA");
    expect(container.textContent).toContain("Rate: CHF 50");
  });

  it("renders signature placeholder when no signature image given", () => {
    const { container } = render(<ContractDocument blocks={blocks} data={data} workerSignaturePng={null} managerSignaturePng={null} />);
    expect(container.querySelector("[data-testid='sig-placeholder-worker']")).toBeTruthy();
  });

  it("renders provided signature PNG inline", () => {
    const { container } = render(
      <ContractDocument blocks={blocks} data={data}
        workerSignaturePng="data:image/png;base64,abc" managerSignaturePng={null} />
    );
    expect(container.querySelector("img[src='data:image/png;base64,abc']")).toBeTruthy();
  });
});
