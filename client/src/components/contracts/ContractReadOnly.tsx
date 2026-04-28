import * as React from "react";
import type {
  Block,
  ContractData,
  VariablesSchema,
} from "@shared/contractTemplates/types";

const TOKEN_RE = /\{\{([\w.]+)\}\}/g;

function getByPath(obj: Record<string, unknown>, key: string): unknown {
  return key.split(".").reduce<unknown>(
    (acc, part) =>
      acc != null && typeof acc === "object"
        ? (acc as Record<string, unknown>)[part]
        : undefined,
    obj,
  );
}

function labelForKey(key: string, variables: VariablesSchema): string {
  const simple = variables.simple.find((s) => s.key === key);
  if (simple) return simple.label;
  for (const list of variables.selectableLists) {
    if (key === list.key) return list.label;
    if (key.startsWith(list.key + ".")) {
      const fieldKey = key.slice(list.key.length + 1);
      return `${list.label} – ${fieldKey}`;
    }
  }
  return key.split(".").pop() ?? key;
}

interface RenderTextProps {
  text: string;
  data: ContractData;
  variables: VariablesSchema;
}

function RenderText({ text, data, variables }: RenderTextProps) {
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > lastIdx) nodes.push(text.slice(lastIdx, idx));
    const key = m[1];
    const value = getByPath(data as Record<string, unknown>, key);
    const filled = value != null && String(value).trim() !== "";
    nodes.push(
      filled ? (
        <span key={`${key}-${idx}`} className="font-medium">
          {String(value)}
        </span>
      ) : (
        <span key={`${key}-${idx}`} className="italic text-muted-foreground">
          [{labelForKey(key, variables)}]
        </span>
      ),
    );
    lastIdx = idx + m[0].length;
  }
  if (lastIdx < text.length) nodes.push(text.slice(lastIdx));
  return <>{nodes}</>;
}

interface BlockProps {
  block: Block;
  data: ContractData;
  variables: VariablesSchema;
}

function RenderBlock({ block, data, variables }: BlockProps) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3";
      const sizeCls =
        block.level === 1
          ? "text-xl font-bold text-center mt-2"
          : block.level === 2
            ? "text-lg font-semibold mt-4"
            : "text-base font-semibold mt-3";
      return (
        <Tag className={sizeCls}>
          <RenderText text={block.text} data={data} variables={variables} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <RenderText text={block.text} data={data} variables={variables} />
        </p>
      );
    case "list":
      return block.ordered ? (
        <ol className="list-decimal pl-6">
          {block.items.map((it, i) => (
            <li key={i}>
              <RenderText text={it} data={data} variables={variables} />
            </li>
          ))}
        </ol>
      ) : (
        <ul className="list-disc pl-6">
          {block.items.map((it, i) => (
            <li key={i}>
              <RenderText text={it} data={data} variables={variables} />
            </li>
          ))}
        </ul>
      );
    case "section":
      return (
        <section className="space-y-2">
          {block.title && (
            <h2 className="text-base font-semibold mt-4">
              <RenderText
                text={block.title}
                data={data}
                variables={variables}
              />
            </h2>
          )}
          {block.children.map((c) => (
            <RenderBlock
              key={c.id}
              block={c}
              data={data}
              variables={variables}
            />
          ))}
        </section>
      );
    case "signature":
      return (
        <div className="mt-8 inline-block">
          <div className="text-xs text-muted-foreground">{block.label}</div>
          <div className="border-b border-current mt-12 w-64 h-12" />
        </div>
      );
    case "pageBreak":
      return <div className="border-dashed border-t border-border my-2" />;
    case "spacer":
      return <div style={{ height: block.height }} />;
  }
}

interface Props {
  blocks: Block[];
  variables: VariablesSchema;
  data: ContractData;
}

export function ContractReadOnly({ blocks, variables, data }: Props) {
  return (
    <div className="rounded border bg-card text-card-foreground">
      <div className="contract-document mx-auto max-w-3xl space-y-4 p-8 text-sm leading-relaxed">
        {blocks.map((b) => (
          <RenderBlock
            key={b.id}
            block={b}
            data={data}
            variables={variables}
          />
        ))}
      </div>
    </div>
  );
}
