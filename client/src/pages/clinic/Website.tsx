import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { Send, Loader2, RefreshCw, ExternalLink, Bot, User, Check, Rocket } from "lucide-react";

const PREVIEW_URL = "https://privatklinik-kreuzlingen.vercel.app/";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolLog?: string[];
}

export default function Website() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [deployState, setDeployState] = useState<{ status: "idle" | "waiting" | "live"; elapsed: number }>({ status: "idle", elapsed: 0 });
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => scrollToBottom(), [messages, deployState, scrollToBottom]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + "px";
    }
  }, [input]);

  // Smart deploy detection — poll etag until it changes
  const waitForDeploy = useCallback(async () => {
    if (pollRef.current) clearInterval(pollRef.current);

    // Get current etag as baseline
    let baseEtag = "";
    try {
      const resp = await fetch("/api/website/deploy-status");
      const data = await resp.json();
      baseEtag = data.etag;
    } catch { /* ignore */ }

    setDeployState({ status: "waiting", elapsed: 0 });
    const start = Date.now();

    pollRef.current = setInterval(async () => {
      const elapsed = Math.round((Date.now() - start) / 1000);
      setDeployState({ status: "waiting", elapsed });

      try {
        const resp = await fetch(`/api/website/deploy-status?etag=${encodeURIComponent(baseEtag)}`);
        const data = await resp.json();
        if (data.changed) {
          // Deploy is live!
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setIframeKey((k) => k + 1);
          setDeployState({ status: "live", elapsed });
          setTimeout(() => setDeployState({ status: "idle", elapsed: 0 }), 5000);
        }
      } catch { /* ignore */ }

      // Give up after 120s
      if (elapsed > 120) {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
        setIframeKey((k) => k + 1);
        setDeployState({ status: "idle", elapsed: 0 });
      }
    }, 3000);
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    const newHistory = [...history, { role: "user", content: userMsg }];

    try {
      const resp = await fetch("/api/website/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newHistory }),
        signal: AbortSignal.timeout(180000),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      setMessages((prev) => [...prev, {
        role: "assistant",
        content: data.text,
        toolLog: data.toolLog,
      }]);
      setHistory([...newHistory, { role: "assistant", content: data.text }]);

      if (data.didWrite) {
        waitForDeploy();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <div className="h-[calc(100vh-6.5rem)] overflow-hidden">
      <ResizablePanelGroup direction="horizontal" className="rounded-lg border">
        {/* Chat */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <Bot className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">Website Editor</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm space-y-3">
                  <Bot className="h-12 w-12 opacity-20" />
                  <p className="font-medium">AI Website Editor</p>
                  <p className="text-xs opacity-60 text-center max-w-[250px]">
                    Describe any change you want. The AI will edit the code, commit to GitHub, and Vercel will deploy it live.
                  </p>
                  <div className="text-xs opacity-40 space-y-1 text-center">
                    <p>"Change the price to CHF 5.000"</p>
                    <p>"Update the hero headline"</p>
                    <p>"Add a new FAQ question"</p>
                  </div>
                </div>
              )}
              {messages.map((msg, i) => (
                <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "assistant" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`rounded-lg px-3 py-2 max-w-[85%] text-sm ${
                    msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                    {msg.toolLog && msg.toolLog.length > 0 && (
                      <details className="mt-2 text-xs opacity-50 border-t border-white/10 pt-1.5">
                        <summary className="cursor-pointer hover:opacity-80">{msg.toolLog.length} tool calls</summary>
                        <div className="mt-1 font-mono space-y-0.5 break-all">
                          {msg.toolLog.map((l, j) => <div key={j}>{l}</div>)}
                        </div>
                      </details>
                    )}
                  </div>
                  {msg.role === "user" && (
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary flex items-center justify-center mt-0.5">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-muted text-sm">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Reading files & making edits...</span>
                    </div>
                    <div className="text-xs opacity-40 mt-1">This takes 10-20 seconds</div>
                  </div>
                </div>
              )}

              {deployState.status === "waiting" && !loading && (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-orange-500/10 flex items-center justify-center">
                    <Rocket className="h-4 w-4 text-orange-400" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-orange-500/10 border border-orange-500/20 text-sm">
                    <div className="flex items-center gap-2 text-orange-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Deploying to Vercel... {deployState.elapsed}s</span>
                    </div>
                    <div className="text-xs opacity-50 mt-1">Preview will refresh automatically when ready</div>
                  </div>
                </div>
              )}

              {deployState.status === "live" && (
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-400" />
                  </div>
                  <div className="rounded-lg px-3 py-2 bg-green-500/10 border border-green-500/20 text-sm text-green-400">
                    Live! Deployed in {deployState.elapsed}s
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the change you want..."
                  className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  rows={1}
                  disabled={loading}
                />
                <Button onClick={sendMessage} disabled={!input.trim() || loading} size="icon" className="shrink-0">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Preview */}
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex flex-col h-full">
            <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
              <span className="font-semibold text-sm">Live Preview</span>
              {deployState.status === "waiting" && (
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="h-2 w-2 rounded-full bg-orange-400 animate-pulse" />
                  <span className="text-xs text-orange-400">Deploying... {deployState.elapsed}s</span>
                </div>
              )}
              {deployState.status === "live" && (
                <div className="flex items-center gap-1.5 ml-2">
                  <div className="h-2 w-2 rounded-full bg-green-400" />
                  <span className="text-xs text-green-400">Updated!</span>
                </div>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIframeKey((k) => k + 1)} title="Refresh">
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.open(PREVIEW_URL, "_blank")} title="Open in new tab">
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Card className="flex-1 m-0 rounded-none border-0">
              <iframe key={iframeKey} src={PREVIEW_URL} className="w-full h-full border-0" title="Website Preview" />
            </Card>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
