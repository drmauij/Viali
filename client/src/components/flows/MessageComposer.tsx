import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
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
  /** Controlled fullscreen state. When omitted the component manages its own. */
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;
  /** Controlled view — "ai" (chat) or "editor" (manual text). When omitted defaults to "ai". */
  activeView?: "ai" | "editor";
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

function PromptSuggestions({
  channel,
  onPick,
}: {
  channel: "sms" | "email" | "html_email";
  onPick: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const suggestions =
    channel === "sms"
      ? [
          {
            title: t("flows.compose.ex.smsWinbackTitle", "Win-back offer"),
            prompt: t(
              "flows.compose.ex.smsWinback",
              "Short SMS to patients who haven't visited in 3 months. Mention our spring offer (20% off) and include the booking link.",
            ),
          },
          {
            title: t("flows.compose.ex.smsBirthdayTitle", "Birthday greeting"),
            prompt: t(
              "flows.compose.ex.smsBirthday",
              "Warm birthday SMS with a personal gift: free consultation this month. Include booking link.",
            ),
          },
          {
            title: t("flows.compose.ex.smsPostCareTitle", "Post-treatment check-in"),
            prompt: t(
              "flows.compose.ex.smsPostCare",
              "Friendly SMS checking in on patients after their recent treatment. Invite them to book a follow-up.",
            ),
          },
        ]
      : channel === "html_email"
        ? [
            {
              title: t("flows.compose.ex.htmlSpringTitle", "Spring newsletter"),
              prompt: t(
                "flows.compose.ex.htmlSpring",
                "Beautiful HTML newsletter with spring offer, personal greeting using {{vorname}}, hero banner, 3 treatment cards, and a prominent booking button.",
              ),
            },
            {
              title: t("flows.compose.ex.htmlLaunchTitle", "New treatment launch"),
              prompt: t(
                "flows.compose.ex.htmlLaunch",
                "Announce a new aesthetic treatment with before/after styling, 3 benefit bullet points, and a booking CTA. Elegant minimalist design.",
              ),
            },
            {
              title: t("flows.compose.ex.htmlReactivationTitle", "Reactivation with offer"),
              prompt: t(
                "flows.compose.ex.htmlReactivation",
                "Premium reactivation email for patients inactive 6+ months. Warm tone, exclusive 25% off, countdown urgency, booking button.",
              ),
            },
          ]
        : [
            {
              title: t("flows.compose.ex.emailFollowupTitle", "Treatment follow-up"),
              prompt: t(
                "flows.compose.ex.emailFollowup",
                "Professional follow-up email asking how the patient feels after their treatment. Mention loyalty offer and invite to book consultation.",
              ),
            },
            {
              title: t("flows.compose.ex.emailSpringTitle", "Spring offer"),
              prompt: t(
                "flows.compose.ex.emailSpring",
                "Friendly spring-offer email with 20% off, personal greeting, booking link, and short treatment highlights.",
              ),
            },
            {
              title: t("flows.compose.ex.emailReviewTitle", "Review request"),
              prompt: t(
                "flows.compose.ex.emailReview",
                "Polite email asking recent patients to leave a Google review. Include the direct review link placeholder.",
              ),
            },
          ];
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 gap-2 overflow-auto">
      <p className="text-xs text-muted-foreground mb-2">
        {t("flows.compose.suggestTitle", "Pick a starter — you can refine in chat after.")}
      </p>
      {suggestions.map((s) => (
        <button
          key={s.title}
          type="button"
          onClick={() => onPick(s.prompt)}
          className="w-full max-w-md text-left border rounded-lg p-3 hover:border-primary/50 hover:bg-primary/5 transition-colors"
        >
          <div className="text-sm font-medium">{s.title}</div>
          <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.prompt}</div>
        </button>
      ))}
    </div>
  );
}

function PreviewPanel({
  channel,
  messageContent,
  messageSubject,
  onSubjectChange,
  onExamplePromptClick,
}: {
  channel: "sms" | "email" | "html_email";
  messageContent: string;
  messageSubject: string;
  onSubjectChange: (v: string) => void;
  onExamplePromptClick?: (prompt: string) => void;
}) {
  const { t } = useTranslation();
  const isEmpty = !messageContent.trim();
  return (
    <div className="h-full flex flex-col">
      {channel === "html_email" && (
        <div className="px-3 pt-2 pb-1 border-b">
          <Input
            value={messageSubject}
            onChange={(e) => onSubjectChange(e.target.value)}
            placeholder={t("flows.compose.subjectPlaceholder", "Email subject...")}
            className="h-7 text-xs"
          />
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {isEmpty && onExamplePromptClick ? (
          <PromptSuggestions channel={channel} onPick={onExamplePromptClick} />
        ) : (
          <>
            {channel === "sms" && <SmsPreview content={messageContent} />}
            {channel === "email" && (
              <EmailPreview subject={messageSubject} content={messageContent} />
            )}
            {channel === "html_email" && (
              <HtmlEmailPreview content={messageContent} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── AI Chat ───────────────────────────────────────────────────────────────────

interface AiChatPanelHandle {
  setPrompt: (prompt: string) => void;
}

const AiChatPanel = forwardRef<AiChatPanelHandle, {
  channel: "sms" | "email" | "html_email";
  segmentFilters: Array<{ field: string; operator: string; value: string }>;
  promoCode: string | null;
  referenceUrl: string;
  onMessageGenerated: (content: string) => void;
  onSubjectGenerated?: (subject: string) => void;
}>(function AiChatPanel(
  {
    channel,
    segmentFilters,
    promoCode,
    referenceUrl,
    onMessageGenerated,
    onSubjectGenerated,
  },
  ref,
) {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const hospitalId = activeHospital?.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    setPrompt: (p: string) => {
      setPrompt(p);
      // Focus the input so user sees the pre-filled prompt and can press Enter.
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  }));

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
          <div className="flex flex-col items-center justify-center gap-2 pt-6 px-4 text-center">
            <p className="text-xs text-muted-foreground">
              {t(
                "flows.compose.placeholder",
                "Describe the message you want — or pick a starter from the preview.",
              )}
            </p>
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
          ref={textareaRef}
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
});

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
        className="prose prose-sm dark:prose-invert max-w-none p-3 min-h-32 focus-within:outline-none"
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
  isFullscreen: controlledFullscreen,
  onFullscreenToggle,
  activeView: controlledActiveView,
}: Props) {
  const { t } = useTranslation();
  const [referenceUrl, setReferenceUrl] = useState("");
  const chatPaneRef = useRef<AiChatPanelHandle>(null);
  const [internalFullscreen, setInternalFullscreen] = useState(false);
  const isFullscreen = controlledFullscreen ?? internalFullscreen;
  const exitFullscreen = () => {
    if (onFullscreenToggle) onFullscreenToggle();
    else setInternalFullscreen(false);
  };

  // ESC to exit fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") exitFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen]);

  // View is controlled by the parent (FlowCreate renders the AI/Editor toggle
  // in the VariantTabs row above). Defaults to "ai".
  const activeView = controlledActiveView ?? "ai";

  const wrapperClass = isFullscreen
    ? "fixed inset-0 z-[60] bg-background p-6 flex flex-col space-y-3 overflow-hidden"
    : "space-y-3";
  const aiPaneStyle = isFullscreen
    ? { flex: "1 1 auto", minHeight: 0 }
    : { height: "420px" };

  return (
    <div className={wrapperClass}>
      {isFullscreen && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8 absolute top-4 right-4 z-10"
          onClick={exitFullscreen}
          aria-label={t("flows.compose.exitFullscreen", "Exit fullscreen")}
          title={t("flows.compose.exitFullscreen", "Exit fullscreen")}
        >
          <Minimize2 className="h-4 w-4" />
        </Button>
      )}
      <Tabs value={activeView} className={isFullscreen ? "flex-1 flex flex-col min-h-0" : undefined}>
        {/* AI Chat Tab */}
        <TabsContent value="ai" className={isFullscreen ? "mt-3 flex-1 min-h-0" : "mt-3"}>
          <div className="border rounded-lg overflow-hidden h-full" style={aiPaneStyle}>
            <ResizablePanelGroup direction="horizontal">
              {/* Chat panel – 40% */}
              <ResizablePanel defaultSize={40} minSize={25}>
                <AiChatPanel
                  ref={chatPaneRef}
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
                  onSubjectChange={onSubjectChange}
                  onExamplePromptClick={(p) => chatPaneRef.current?.setPrompt(p)}
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
