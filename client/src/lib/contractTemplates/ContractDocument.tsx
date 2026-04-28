import * as React from "react";
import { resolveText } from "@shared/contractTemplates/resolveText";
import type { Block, ContractData } from "@shared/contractTemplates/types";

interface Props {
  blocks: Block[];
  data: ContractData;
  workerSignaturePng: string | null;  // data: URL or null
  managerSignaturePng: string | null;
}

export function ContractDocument({ blocks, data, workerSignaturePng, managerSignaturePng }: Props) {
  return (
    <div className="contract-document mx-auto max-w-3xl space-y-4 p-8 text-sm leading-relaxed bg-white text-black">
      {blocks.map((b) => <RenderedBlock key={b.id} block={b} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
    </div>
  );
}

function RenderedBlock({ block, data, workerSignaturePng, managerSignaturePng }: { block: Block; data: ContractData; workerSignaturePng: string | null; managerSignaturePng: string | null; }) {
  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}`) as "h1" | "h2" | "h3";
      const sizeCls = block.level === 1 ? "text-xl font-bold text-center mt-2" : block.level === 2 ? "text-lg font-semibold mt-4" : "text-base font-semibold mt-3";
      return <Tag className={sizeCls}>{resolveText(block.text, data as Record<string, unknown>)}</Tag>;
    }
    case "paragraph":
      return <p>{resolveText(block.text, data as Record<string, unknown>)}</p>;
    case "list":
      return block.ordered
        ? <ol className="list-decimal pl-6">{block.items.map((it, i) => <li key={i}>{resolveText(it, data as Record<string, unknown>)}</li>)}</ol>
        : <ul className="list-disc pl-6">{block.items.map((it, i) => <li key={i}>{resolveText(it, data as Record<string, unknown>)}</li>)}</ul>;
    case "section":
      return (
        <section className="space-y-2">
          {block.title && <h2 className="text-base font-semibold mt-4">{resolveText(block.title, data as Record<string, unknown>)}</h2>}
          {block.children.map((c) => <RenderedBlock key={c.id} block={c} data={data} workerSignaturePng={workerSignaturePng} managerSignaturePng={managerSignaturePng} />)}
        </section>
      );
    case "signature": {
      const sigSrc = block.party === "worker" ? workerSignaturePng : managerSignaturePng;
      return (
        <div className="mt-8 inline-block">
          <div className="text-xs text-gray-600">{block.label}</div>
          <div className="border-b border-black mt-12 w-64 h-12 flex items-end" data-testid={sigSrc ? `sig-${block.party}` : `sig-placeholder-${block.party}`}>
            {sigSrc && <img src={sigSrc} alt={`${block.party} signature`} className="max-h-12" />}
          </div>
        </div>
      );
    }
    case "pageBreak":
      return <div className="page-break-before" />;
    case "spacer":
      return <div style={{ height: block.height }} />;
  }
}
