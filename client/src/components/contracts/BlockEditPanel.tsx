import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import * as React from "react";
import type { Block, VariablesSchema } from "@shared/contractTemplates/types";

interface Props {
  block: Block;
  variables: VariablesSchema;
  onChange: (next: Block) => void;
}

export function BlockEditPanel({ block, variables, onChange }: Props) {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return (
        <RichTextField
          text={block.text}
          variables={variables}
          onChange={(t) => onChange({ ...block, text: t })}
        />
      );
    case "list":
      return <ListEditor block={block} onChange={onChange} />;
    case "section":
      return (
        <input
          className="w-full rounded border bg-background text-foreground px-2 py-1"
          value={block.title ?? ""}
          onChange={(e) => onChange({ ...block, title: e.target.value })}
          placeholder="Section title (optional)"
        />
      );
    case "signature":
      return (
        <div className="space-y-2 text-sm">
          <label className="block">
            Party
            <select
              className="ml-2 rounded border bg-background text-foreground px-2 py-1"
              value={block.party}
              onChange={(e) =>
                onChange({ ...block, party: e.target.value as "worker" | "manager" })
              }
            >
              <option value="worker">Worker</option>
              <option value="manager">Manager</option>
            </select>
          </label>
          <label className="block">
            Label
            <input
              className="ml-2 rounded border bg-background text-foreground px-2 py-1"
              value={block.label}
              onChange={(e) => onChange({ ...block, label: e.target.value })}
            />
          </label>
        </div>
      );
    case "pageBreak":
      return (
        <div className="text-sm text-muted-foreground italic">
          Page break — no editable fields.
        </div>
      );
    case "spacer":
      return (
        <input
          type="number"
          className="rounded border bg-background text-foreground px-2 py-1"
          value={block.height}
          onChange={(e) => onChange({ ...block, height: Number(e.target.value) })}
        />
      );
  }
}

function RichTextField({
  text,
  variables,
  onChange,
}: {
  text: string;
  variables: VariablesSchema;
  onChange: (s: string) => void;
}) {
  const editor = useEditor(
    {
      extensions: [StarterKit],
      content: text,
      onUpdate: ({ editor }) => onChange(editor.getText({ blockSeparator: "\n" })),
    },
    [text],
  );
  return (
    <div className="space-y-2">
      <EditorContent
        editor={editor}
        className="prose prose-sm dark:prose-invert max-w-none rounded border bg-background text-foreground p-3"
      />
      <InsertVariableMenu
        variables={variables}
        onInsert={(key) => editor?.chain().focus().insertContent(`{{${key}}}`).run()}
      />
    </div>
  );
}

function InsertVariableMenu({
  variables,
  onInsert,
}: {
  variables: VariablesSchema;
  onInsert: (key: string) => void;
}) {
  const all = [
    ...variables.simple.map((v) => v.key),
    ...variables.selectableLists.flatMap((l) =>
      l.fields.map((f) => `${l.key}.${f.key}`),
    ),
  ];
  return (
    <select
      onChange={(e) => {
        if (e.target.value) {
          onInsert(e.target.value);
          e.target.value = "";
        }
      }}
      className="rounded border bg-background text-foreground px-2 py-1 text-sm"
    >
      <option value="">Insert variable…</option>
      {all.map((k) => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
}

function ListEditor({
  block,
  onChange,
}: {
  block: Extract<Block, { type: "list" }>;
  onChange: (b: Block) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm flex items-center gap-2">
        <input
          type="checkbox"
          checked={block.ordered}
          onChange={(e) => onChange({ ...block, ordered: e.target.checked })}
        />
        Ordered list
      </label>
      {block.items.map((it, i) => (
        <input
          key={i}
          className="block w-full rounded border bg-background text-foreground px-2 py-1 text-sm"
          value={it}
          onChange={(e) => {
            const next = [...block.items];
            next[i] = e.target.value;
            onChange({ ...block, items: next });
          }}
        />
      ))}
      <button
        onClick={() => onChange({ ...block, items: [...block.items, ""] })}
        className="text-sm underline"
      >
        + Add item
      </button>
    </div>
  );
}
