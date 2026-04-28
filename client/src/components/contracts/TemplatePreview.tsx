import * as React from "react";
import { pdf } from "@react-pdf/renderer";
import { ContractDocumentPdf } from "@/lib/contractTemplates/ContractDocumentPdf";
import { resolveText } from "@shared/contractTemplates/resolveText";
import type { Block, VariablesSchema, ContractData } from "@shared/contractTemplates/types";

function setByPath(obj: Record<string, unknown>, key: string, value: unknown) {
  const parts = key.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    cur[parts[i]] = (cur[parts[i]] as Record<string, unknown> | undefined) ?? {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function sampleData(variables: VariablesSchema): ContractData {
  const out: Record<string, unknown> = {};
  for (const v of variables.simple) {
    if (v.source) continue;
    setByPath(out, v.key, v.default ?? `[${v.label}]`);
  }
  for (const l of variables.selectableLists) {
    setByPath(out, l.key, l.options[0] ?? {});
  }
  return out;
}

interface Props {
  blocks: Block[];
  variables: VariablesSchema;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}

export function TemplatePreview({ blocks, variables, selectedId = null, onSelect }: Props) {
  const data = sampleData(variables);
  async function downloadPdf() {
    const blob = await pdf(
      <ContractDocumentPdf
        blocks={blocks}
        data={data}
        workerSignaturePng={null}
        managerSignaturePng={null}
      />
    ).toBlob();
    const url = URL.createObjectURL(blob);
    window.open(url);
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <button onClick={downloadPdf} className="underline">
          Download sample PDF
        </button>
        {onSelect && (
          <span className="text-xs text-muted-foreground">
            Click any block to select it.
            {selectedId && (
              <button
                onClick={() => onSelect(null)}
                className="ml-2 underline hover:text-foreground"
              >
                Clear selection
              </button>
            )}
          </span>
        )}
      </div>
      <div
        className="rounded border bg-white text-black"
        onClick={() => onSelect?.(null)}
      >
        <div className="contract-document mx-auto max-w-3xl space-y-4 p-8 text-sm leading-relaxed">
          {blocks.map((b) => (
            <SelectableBlock
              key={b.id}
              block={b}
              data={data}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SelectableProps {
  block: Block;
  data: ContractData;
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
}

function SelectableBlock({ block, data, selectedId, onSelect }: SelectableProps) {
  const isSelected = selectedId === block.id;
  const wrapperBase =
    "rounded transition-colors cursor-pointer hover:bg-blue-50/50 focus-visible:outline-none";
  const wrapperSelected = isSelected
    ? "ring-2 ring-blue-500 bg-blue-50/40"
    : "";

  const handleClick = (e: React.MouseEvent) => {
    if (!onSelect) return;
    e.stopPropagation();
    onSelect(block.id);
  };

  const wrap = (children: React.ReactNode) => (
    <div
      className={`${wrapperBase} ${wrapperSelected} ${onSelect ? "p-1 -m-1" : ""}`}
      onClick={onSelect ? handleClick : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      data-block-id={block.id}
      data-selected={isSelected ? "true" : undefined}
    >
      {children}
    </div>
  );

  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level}`) as "h1" | "h2" | "h3";
      const sizeCls =
        block.level === 1
          ? "text-xl font-bold text-center mt-2"
          : block.level === 2
            ? "text-lg font-semibold mt-4"
            : "text-base font-semibold mt-3";
      return wrap(<Tag className={sizeCls}>{resolveText(block.text, data as Record<string, unknown>)}</Tag>);
    }
    case "paragraph":
      return wrap(<p>{resolveText(block.text, data as Record<string, unknown>)}</p>);
    case "list":
      return wrap(
        block.ordered ? (
          <ol className="list-decimal pl-6">
            {block.items.map((it, i) => (
              <li key={i}>{resolveText(it, data as Record<string, unknown>)}</li>
            ))}
          </ol>
        ) : (
          <ul className="list-disc pl-6">
            {block.items.map((it, i) => (
              <li key={i}>{resolveText(it, data as Record<string, unknown>)}</li>
            ))}
          </ul>
        ),
      );
    case "section":
      return wrap(
        <section className="space-y-2">
          {block.title && (
            <h2 className="text-base font-semibold mt-4">
              {resolveText(block.title, data as Record<string, unknown>)}
            </h2>
          )}
          {block.children.map((c) => (
            <SelectableBlock
              key={c.id}
              block={c}
              data={data}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </section>,
      );
    case "signature":
      return wrap(
        <div className="mt-8 inline-block">
          <div className="text-xs text-gray-600">{block.label}</div>
          <div
            className="border-b border-black mt-12 w-64 h-12 flex items-end"
            data-testid={`sig-placeholder-${block.party}`}
          />
        </div>,
      );
    case "pageBreak":
      return wrap(<div className="page-break-before border-dashed border-t border-gray-300 my-2" />);
    case "spacer":
      return wrap(<div style={{ height: block.height }} />);
  }
}
