import * as React from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Link2, Copy, Check, RefreshCw, Sparkles, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
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
  const [, navigate] = useLocation();
  const base =
    scope === "hospital"
      ? `/api/business/${ownerId}/contract-templates`
      : `/api/chain/${ownerId}/contract-templates`;
  const galleryHref =
    scope === "hospital"
      ? `/business/contracts/templates`
      : `/chain/contracts/templates`;
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

  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);
  const updateStatus = useMutation({
    mutationFn: (status: "draft" | "active") =>
      fetch(`${base}/${templateId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${base}/${templateId}`] });
      qc.invalidateQueries({ queryKey: [base] });
    },
  });
  const regenerateToken = useMutation({
    mutationFn: () =>
      fetch(`${base}/${templateId}/regenerate-token`, {
        method: "POST",
        credentials: "include",
      }).then((r) => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`${base}/${templateId}`] });
      qc.invalidateQueries({ queryKey: [base] });
      toast({ title: "Share link regenerated", description: "The previous link no longer works." });
    },
  });

  const [aiPrompt, setAiPrompt] = React.useState("");
  const undoRef = React.useRef<{ blocks: Block[]; variables: VariablesSchema } | null>(null);

  const aiSuggest = useMutation({
    mutationFn: async (prompt: string) => {
      const res = await fetch(`${base}/${templateId}/ai-suggest`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt,
          currentBlocks: blocks,
          currentVariables: variables,
          language: template?.language ?? "de",
          selectedBlockId: selectedId,
        }),
      });
      if (!res.ok) throw new Error((await res.text()) || "AI request failed");
      return (await res.json()) as { blocks: Block[]; variables: VariablesSchema };
    },
    onSuccess: (out) => {
      undoRef.current = { blocks, variables };
      setBlocks(out.blocks);
      setVariables(out.variables);
      // Keep the user's selection if the same block id still exists after the edit
      if (selectedId && !findBlock(out.blocks, selectedId)) setSelectedId(null);
      setAiPrompt("");
      toast({
        title: "AI updated the template",
        description: "Review the result and Save when ready.",
        action: (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (!undoRef.current) return;
              setBlocks(undoRef.current.blocks);
              setVariables(undoRef.current.variables);
              undoRef.current = null;
              toast({ title: "Reverted to previous version" });
            }}
            data-testid="button-undo-ai-suggest"
          >
            <Undo2 className="h-4 w-4 mr-1" />
            Undo
          </Button>
        ),
      });
    },
    onError: (err: any) => {
      toast({
        title: "AI assistant failed",
        description: err?.message ?? "Try rephrasing the prompt.",
        variant: "destructive",
      });
    },
  });

  const handleAiSubmit = () => {
    const p = aiPrompt.trim();
    if (!p || aiSuggest.isPending) return;
    aiSuggest.mutate(p);
  };

  if (!template) return <div className="p-6">Loading…</div>;
  const selected = findBlock(blocks, selectedId);
  const shareUrl = template.publicToken
    ? `${window.location.origin}/contract/t/${template.publicToken}`
    : "";

  const handleCopyShare = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Share link copied" });
  };

  return (
    <div className="space-y-3 p-6">
      <button
        onClick={() => navigate(galleryHref)}
        className="-ml-1 inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        data-testid="button-back-to-templates"
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Templates
      </button>
      <div className="flex items-center gap-3 flex-wrap">
        <input
          className="rounded border bg-background text-foreground px-2 py-1 text-lg font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          value={template.status}
          onChange={(e) => updateStatus.mutate(e.target.value as "draft" | "active")}
          className="rounded border bg-background text-foreground px-2 py-1 text-sm"
          disabled={updateStatus.isPending}
          data-testid="select-template-status"
        >
          <option value="draft">Draft</option>
          <option value="active">Active</option>
        </select>
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

      <div className="rounded border bg-card p-3">
        <div className="flex items-center gap-2 mb-2 text-sm font-medium">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Share link
          {template.status !== "active" && (
            <span className="text-xs text-muted-foreground font-normal">
              (template is {template.status} — only active templates accept submissions)
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={shareUrl || "No link yet — save the template once."}
            readOnly
            className="font-mono text-xs"
            data-testid="input-template-share-link"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleCopyShare}
            disabled={!shareUrl}
            data-testid="button-copy-template-share-link"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (window.confirm("Regenerate this template's share link? The current link will stop working.")) {
                regenerateToken.mutate();
              }
            }}
            disabled={regenerateToken.isPending}
            data-testid="button-regenerate-template-share-link"
          >
            <RefreshCw className={`h-4 w-4 ${regenerateToken.isPending ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <ResizablePanelGroup
        direction="horizontal"
        className="min-h-[70vh] rounded border bg-background"
      >
        {showPreview && (
          <>
            <ResizablePanel defaultSize={45} minSize={25}>
              <div className="h-full flex flex-col">
                <div className="border-b bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-primary" />
                    AI assistant
                    {selected && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 px-2 py-0.5 text-xs font-normal">
                        Scope: {blockSummary(selected)}
                        <button
                          onClick={() => setSelectedId(null)}
                          className="ml-1 hover:text-foreground"
                          title="Clear scope"
                          data-testid="button-clear-ai-scope"
                        >
                          ✕
                        </button>
                      </span>
                    )}
                  </div>
                  <textarea
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAiSubmit();
                    }}
                    placeholder='Targeted edits work too: "in the salary paragraph change CHF 50 to CHF 55", "translate section 3 to English", "add a non-disclosure clause section". Or generate from scratch: "Build a complete locum anesthesia nurse contract in English with hourly rate, weekly schedule, and IBAN field".'
                    className="w-full min-h-[60px] rounded border bg-background text-foreground p-2 text-sm resize-y"
                    disabled={aiSuggest.isPending}
                    data-testid="textarea-ai-prompt"
                  />
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selected
                        ? "Edits apply to the selected block only. ⌘/Ctrl+Enter to send."
                        : "Untouched blocks are preserved. ⌘/Ctrl+Enter to send."}
                    </span>
                    <Button
                      size="sm"
                      onClick={handleAiSubmit}
                      disabled={!aiPrompt.trim() || aiSuggest.isPending}
                      data-testid="button-ai-suggest"
                    >
                      {aiSuggest.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Generating…
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-1" />
                          Generate
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3">
                  <TemplatePreview
                    blocks={blocks}
                    variables={variables}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                  />
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
          </>
        )}

        <ResizablePanel defaultSize={showPreview ? 55 : 100} minSize={30}>
          <div className="grid grid-cols-12 gap-3 p-2 h-full">
            <div className="col-span-3 rounded border bg-card p-2 overflow-auto">
              <BlockTree
                blocks={blocks}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onChange={setBlocks}
              />
              <AddBlockMenu onAdd={(b) => setBlocks([...blocks, b])} />
            </div>
            <div className="col-span-6 rounded border bg-card p-3 overflow-auto">
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
            <div className="col-span-3 rounded border bg-card p-2 overflow-auto">
              <VariablesPanel value={variables} onChange={setVariables} />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
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

function blockSummary(b: Block): string {
  switch (b.type) {
    case "heading":
      return `Heading "${truncate(b.text, 40)}"`;
    case "paragraph":
      return `Paragraph "${truncate(b.text, 40)}"`;
    case "list":
      return `List (${b.items.length} item${b.items.length === 1 ? "" : "s"})`;
    case "section":
      return b.title ? `Section "${truncate(b.title, 40)}"` : "Section";
    case "signature":
      return `Signature (${b.party})`;
    case "pageBreak":
      return "Page break";
    case "spacer":
      return "Spacer";
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
