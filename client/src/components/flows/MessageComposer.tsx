import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Send, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  channel: "sms" | "email" | "html_email";
  messageContent: string;
  messageSubject: string;
  onContentChange: (content: string) => void;
  onSubjectChange: (subject: string) => void;
  segmentFilters: Array<{ field: string; operator: string; value: string }>;
  promoCode: string | null;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Preview Components ────────────────────────────────────────────────────────

function SmsPreview({ content }: { content: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      {/* Phone frame */}
      <div className="border-2 border-muted rounded-3xl p-4 w-64 bg-muted/30 shadow-md">
        <div className="flex justify-center mb-3">
          <div className="w-20 h-1.5 bg-muted rounded-full" />
        </div>
        <div className="bg-background rounded-2xl min-h-40 p-2 space-y-2">
          {content ? (
            <div className="flex justify-end">
              <div className="bg-blue-500 text-white text-xs rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words">
                {content}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center pt-4">
              {t("flows.compose.noMessage", "No message yet")}
            </p>
          )}
        </div>
        <div className="flex justify-center mt-3">
          <div className="w-8 h-8 border-2 border-muted rounded-full" />
        </div>
      </div>
    </div>
  );
}

function EmailPreview({
  subject,
  content,
}: {
  subject: string;
  content: string;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full p-4 overflow-auto">
      <div className="border rounded-lg bg-background shadow-sm max-w-lg mx-auto">
        {/* Email header */}
        <div className="border-b p-4">
          <div className="text-xs text-muted-foreground mb-1">{t("flows.compose.subject", "Subject")}:</div>
          <div className="font-semibold text-sm">
            {subject || `(${t("flows.compose.noSubject", "no subject")})`}
          </div>
        </div>
        {/* Email body */}
        <div className="p-4 text-sm whitespace-pre-wrap min-h-32">
          {content || (
            <span className="text-muted-foreground">{t("flows.compose.noContent", "No content yet")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function HtmlEmailPreview({ content }: { content: string }) {
  const { t } = useTranslation();
  // If the AI returned a full HTML document, render it as-is — wrapping it in
  // another <body> produces invalid nested documents that render blank.
  const looksLikeFullDoc = /^\s*(<!DOCTYPE|<html[\s>])/i.test(content);
  const srcDoc = content
    ? looksLikeFullDoc
      ? content
      : `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">${content}</body></html>`
    : `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;color:#999;">${t("flows.compose.noContent", "No content yet")}</body></html>`;

  return (
    <div className="h-full p-4">
      <div className="border rounded-lg overflow-hidden h-full min-h-64">
        <iframe
          title="HTML Email Preview"
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          className="w-full h-full"
          style={{ minHeight: "300px" }}
        />
      </div>
    </div>
  );
}

function PreviewPanel({
  channel,
  messageContent,
  messageSubject,
  referenceUrl,
  onReferenceUrlChange,
}: {
  channel: "sms" | "email" | "html_email";
  messageContent: string;
  messageSubject: string;
  referenceUrl: string;
  onReferenceUrlChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="h-full flex flex-col">
      {channel === "html_email" && (
        <div className="px-3 pt-2 pb-1 border-b">
          <Input
            value={referenceUrl}
            onChange={(e) => onReferenceUrlChange(e.target.value)}
            placeholder={t("flows.compose.referenceUrl", "Design reference URL (optional — defaults to clinic website)")}
            className="h-7 text-xs"
          />
        </div>
      )}
      <div className="text-xs font-medium text-muted-foreground px-3 pt-2 pb-1 border-b">
        {t("flows.compose.preview", "Preview")}
      </div>
      <div className="flex-1 overflow-hidden">
        {channel === "sms" && <SmsPreview content={messageContent} />}
        {channel === "email" && (
          <EmailPreview subject={messageSubject} content={messageContent} />
        )}
        {channel === "html_email" && (
          <HtmlEmailPreview content={messageContent} />
        )}
      </div>
    </div>
  );
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

function AiChatPanel({
  channel,
  segmentFilters,
  promoCode,
  referenceUrl,
  onMessageGenerated,
  onSubjectGenerated,
}: {
  channel: "sms" | "email" | "html_email";
  segmentFilters: Array<{ field: string; operator: string; value: string }>;
  promoCode: string | null;
  referenceUrl: string;
  onMessageGenerated: (content: string) => void;
  onSubjectGenerated?: (subject: string) => void;
}) {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const segmentDescription =
    segmentFilters.length > 0
      ? segmentFilters
          .map((f) => `${f.field} ${f.operator} ${f.value}`)
          .join(", ")
      : t("flows.segment.allPatients", "All Patients");

  const handleSend = async () => {
    if (!prompt.trim() || !hospitalId || loading) return;

    const userMessage: ChatMessage = { role: "user", content: prompt.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setPrompt("");
    setLoading(true);

    try {
      const res = await apiRequest(
        "POST",
        `/api/business/${hospitalId}/flows/compose`,
        {
          channel,
          prompt: userMessage.content,
          segmentDescription,
          promoCode,
          referenceUrl: referenceUrl.trim() || undefined,
          previousMessages: messages,
        }
      );

      const contentType = res.headers.get("content-type") || "";
      let aiContent = "";

      if (contentType.includes("text/event-stream") && res.body) {
        // Streaming path (html_email via Anthropic). Fill the preview as chunks
        // arrive so the user sees progress instead of staring at a spinner.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const stripFences = (s: string) =>
          s.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "");
        const stripSubject = (s: string) =>
          s.replace(/^Subject:\s*.+?[\n\r]+/i, "");

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              const json = JSON.parse(dataLine.slice(6));
              if (typeof json.text === "string") {
                aiContent += json.text;
                // Live-update the preview with a cleaned best-effort view
                const live = stripSubject(stripFences(aiContent)).trim();
                if (live) onMessageGenerated(live);
              } else if (json.error) {
                throw new Error(String(json.error));
              }
            } catch (e) {
              // If it was a JSON parse failure, ignore; otherwise rethrow
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      } else {
        const data = await res.json();
        aiContent = data.message || data.content || "";
      }

      // Strip markdown code fences (```html ... ```)
      aiContent = aiContent.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
      // For email channels, extract subject if AI included one
      if ((channel === "email" || channel === "html_email") && onSubjectGenerated) {
        const subjectMatch = aiContent.match(/^Subject:\s*(.+?)[\n\r]/i);
        if (subjectMatch) {
          onSubjectGenerated(subjectMatch[1].trim());
          aiContent = aiContent.replace(/^Subject:\s*.+?[\n\r]+/i, "").trim();
        }
      }
      // Send final cleaned content to preview
      if (aiContent) {
        onMessageGenerated(aiContent);
      }
      const chatDisplay = channel === "html_email"
        ? t("flows.compose.htmlGenerated", "HTML email generated — see preview →")
        : aiContent;
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: chatDisplay,
      };
      setMessages([...newMessages, aiMessage]);
    } catch {
      const errMessage: ChatMessage = {
        role: "assistant",
        content: t("flows.compose.aiError", "Error generating message. Please try again."),
      };
      setMessages([...newMessages, errMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-3 pt-4 px-2">
            <p className="text-xs text-muted-foreground">{t("flows.compose.placeholder", "Describe the message you want, or try an example:")}</p>
            {[
              channel === "sms"
                ? "Write a friendly SMS reminder for patients who had a treatment with us. Mention we have a special spring offer and include the booking link."
                : channel === "html_email"
                ? "Create a beautiful HTML newsletter for our aesthetic clinic patients. Include a personal greeting, mention their previous treatment, highlight our exclusive spring offer with 20% off, and add a prominent booking button."
                : "Write a professional follow-up email to patients who visited our clinic. Ask how they're feeling after their treatment, mention our loyalty offer, and invite them to book a follow-up consultation.",
            ].map((example) => (
              <button
                key={example}
                onClick={() => setPrompt(example)}
                className="text-left text-xs px-3 py-2 rounded-lg border border-dashed border-muted-foreground/30 hover:border-primary/50 hover:bg-primary/5 transition-colors text-muted-foreground w-full"
              >
                "{example}"
              </button>
            ))}
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={cn(
              "flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-tr-sm"
                  : "bg-muted text-foreground rounded-tl-sm"
              )}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-3 flex gap-2 items-end">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("flows.compose.inputPlaceholder", "Write a request... (Enter to send)")}
          className="resize-none text-sm min-h-[60px] max-h-32"
          rows={2}
          disabled={loading}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!prompt.trim() || loading}
          className="flex-shrink-0"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Editor ────────────────────────────────────────────────────────────────────

function SmsEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const max = 160;
  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("flows.compose.smsPlaceholder", "Enter SMS text...")}
        className="resize-none"
        rows={5}
        maxLength={max}
      />
      <p
        className={cn(
          "text-xs text-right",
          content.length > max ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {content.length}/{max} {t("flows.compose.chars", "characters")}
      </p>
    </div>
  );
}

function RichEditor({
  content,
  onChange,
}: {
  content: string;
  onChange: (v: string) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate({ editor }) {
      onChange(editor.getHTML());
    },
  });

  // Sync external content changes (e.g. from AI)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  return (
    <div className="border rounded-md">
      {/* Toolbar */}
      <div className="flex gap-1 p-2 border-b flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => editor?.chain().focus().toggleBold().run()}
          data-active={editor?.isActive("bold")}
        >
          <strong>B</strong>
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          I
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          •
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          1.
        </Button>
      </div>
      <EditorContent
        editor={editor}
        className="prose prose-sm prose-invert max-w-none p-3 min-h-32 focus-within:outline-none"
      />
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MessageComposer({
  channel,
  messageContent,
  messageSubject,
  onContentChange,
  onSubjectChange,
  segmentFilters,
  promoCode,
}: Props) {
  const { t } = useTranslation();
  const [referenceUrl, setReferenceUrl] = useState("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const wrapperClass = isFullscreen
    ? "fixed inset-0 z-50 bg-background p-6 flex flex-col space-y-3 overflow-hidden"
    : "space-y-3";
  const aiPaneStyle = isFullscreen
    ? { flex: "1 1 auto", minHeight: 0 }
    : { height: "420px" };

  return (
    <div className={wrapperClass}>
      <Tabs defaultValue="ai" className={isFullscreen ? "flex-1 flex flex-col min-h-0" : undefined}>
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="ai">{t("flows.compose.tabAi", "AI Chat")}</TabsTrigger>
            {channel !== "html_email" && (
              <TabsTrigger value="editor">{t("flows.compose.tabEditor", "Editor")}</TabsTrigger>
            )}
          </TabsList>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsFullscreen((v) => !v)}
            aria-label={isFullscreen
              ? t("flows.compose.exitFullscreen", "Exit fullscreen")
              : t("flows.compose.enterFullscreen", "Expand to fullscreen")}
            title={isFullscreen
              ? t("flows.compose.exitFullscreen", "Exit fullscreen")
              : t("flows.compose.enterFullscreen", "Expand to fullscreen")}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>

        {/* AI Chat Tab */}
        <TabsContent value="ai" className={isFullscreen ? "mt-3 flex-1 min-h-0" : "mt-3"}>
          <div className="border rounded-lg overflow-hidden h-full" style={aiPaneStyle}>
            <ResizablePanelGroup direction="horizontal">
              {/* Chat panel – 40% */}
              <ResizablePanel defaultSize={40} minSize={25}>
                <AiChatPanel
                  channel={channel}
                  segmentFilters={segmentFilters}
                  promoCode={promoCode}
                  referenceUrl={referenceUrl}
                  onMessageGenerated={onContentChange}
                  onSubjectGenerated={onSubjectChange}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Preview panel – 60% */}
              <ResizablePanel defaultSize={60} minSize={25}>
                <PreviewPanel
                  channel={channel}
                  messageContent={messageContent}
                  messageSubject={messageSubject}
                  referenceUrl={referenceUrl}
                  onReferenceUrlChange={setReferenceUrl}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        </TabsContent>

        {/* Editor Tab */}
        <TabsContent value="editor" className="mt-3 space-y-3">
          {/* Subject field for email channels */}
          {(channel === "email" || channel === "html_email") && (
            <div className="space-y-1">
              <Label htmlFor="msg-subject">{t("flows.compose.subjectLabel", "Subject")}</Label>
              <Input
                id="msg-subject"
                value={messageSubject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder={t("flows.compose.subjectPlaceholder", "Email subject...")}
              />
            </div>
          )}

          {/* Content editor */}
          <div className="space-y-1">
            <Label>{t("flows.compose.contentLabel", "Content")}</Label>
            {channel === "sms" ? (
              <SmsEditor content={messageContent} onChange={onContentChange} />
            ) : (
              <RichEditor content={messageContent} onChange={onContentChange} />
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
