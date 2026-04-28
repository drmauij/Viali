import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BlockTree } from "./BlockTree";
import { BlockEditPanel } from "./BlockEditPanel";
import { VariablesPanel } from "./VariablesPanel";
import { TemplatePreview } from "./TemplatePreview";
import { AddBlockMenu } from "./AddBlockMenu";
import type { ContractTemplate } from "@shared/schema";
import type { Block, VariablesSchema } from "@shared/contractTemplates/types";

interface Props {
  templateId: string;
  scope: "hospital" | "chain";
  ownerId: string;
}

export function TemplateEditor({ templateId, scope, ownerId }: Props) {
  const base =
    scope === "hospital"
      ? `/api/business/${ownerId}/contract-templates`
      : `/api/chain/${ownerId}/contract-templates`;
  const qc = useQueryClient();

  const { data: template } = useQuery<ContractTemplate>({
    queryKey: [`${base}/${templateId}`],
    queryFn: () =>
      fetch(`${base}/${templateId}`, { credentials: "include" }).then((r) => r.json()),
  });

  const [blocks, setBlocks] = React.useState<Block[]>([]);
  const [variables, setVariables] = React.useState<VariablesSchema>({
    simple: [],
    selectableLists: [],
  });
  const [name, setName] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [showPreview, setShowPreview] = React.useState(false);

  React.useEffect(() => {
    if (!template) return;
    setBlocks(template.blocks as unknown as Block[]);
    setVariables(template.variables as unknown as VariablesSchema);
    setName(template.name);
  }, [template]);

  const save = useMutation({
    mutationFn: () =>
      fetch(`${base}/${templateId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, blocks, variables }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: [base] }),
  });

  if (!template) return <div className="p-6">Loading…</div>;
  const selected = findBlock(blocks, selectedId);

  return (
    <div className="space-y-3 p-6">
      <div className="flex items-center gap-3">
        <input
          className="rounded border bg-background text-foreground px-2 py-1 text-lg font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          onClick={() => save.mutate()}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
          disabled={save.isPending}
        >
          {save.isPending ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => setShowPreview((v) => !v)}
          className="rounded border bg-background text-foreground px-3 py-1.5 text-sm"
        >
          {showPreview ? "Hide preview" : "Preview"}
        </button>
      </div>

      <div className="grid grid-cols-12 gap-3">
        <div className="col-span-3 rounded border bg-card p-2">
          <BlockTree
            blocks={blocks}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onChange={setBlocks}
          />
          <AddBlockMenu onAdd={(b) => setBlocks([...blocks, b])} />
        </div>
        <div className="col-span-6 rounded border bg-card p-3">
          {selected ? (
            <BlockEditPanel
              block={selected}
              variables={variables}
              onChange={(b) => setBlocks(replaceBlock(blocks, b))}
            />
          ) : (
            <div className="text-sm text-muted-foreground">
              Select a block on the left to edit it.
            </div>
          )}
        </div>
        <div className="col-span-3 rounded border bg-card p-2">
          <VariablesPanel value={variables} onChange={setVariables} />
        </div>
      </div>

      {showPreview && <TemplatePreview blocks={blocks} variables={variables} />}
    </div>
  );
}

function findBlock(blocks: Block[], id: string | null): Block | null {
  if (!id) return null;
  for (const b of blocks) {
    if (b.id === id) return b;
    if (b.type === "section") {
      const found = findBlock(b.children, id);
      if (found) return found;
    }
  }
  return null;
}

function replaceBlock(blocks: Block[], next: Block): Block[] {
  return blocks.map((b) => {
    if (b.id === next.id) return next;
    if (b.type === "section") return { ...b, children: replaceBlock(b.children, next) };
    return b;
  });
}
