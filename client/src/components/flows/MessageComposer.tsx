import { useState, useRef, useEffect } from "react";
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
import { Loader2, Send } from "lucide-react";
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
  return (
    <div className="flex flex-col items-center justify-center h-full p-4">
      {/* Phone frame */}
      <div className="border-2 border-gray-300 rounded-3xl p-4 w-64 bg-gray-50 shadow-md">
        <div className="flex justify-center mb-3">
          <div className="w-20 h-1.5 bg-gray-300 rounded-full" />
        </div>
        <div className="bg-white rounded-2xl min-h-40 p-2 space-y-2">
          {content ? (
            <div className="flex justify-end">
              <div className="bg-blue-500 text-white text-xs rounded-2xl rounded-tr-sm px-3 py-2 max-w-[85%] whitespace-pre-wrap break-words">
                {content}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center pt-4">
              Noch keine Nachricht
            </p>
          )}
        </div>
        <div className="flex justify-center mt-3">
          <div className="w-8 h-8 border-2 border-gray-300 rounded-full" />
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
  return (
    <div className="h-full p-4 overflow-auto">
      <div className="border rounded-lg bg-white shadow-sm max-w-lg mx-auto">
        {/* Email header */}
        <div className="border-b p-4">
          <div className="text-xs text-muted-foreground mb-1">Betreff:</div>
          <div className="font-semibold text-sm">
            {subject || "(kein Betreff)"}
          </div>
        </div>
        {/* Email body */}
        <div className="p-4 text-sm whitespace-pre-wrap min-h-32">
          {content || (
            <span className="text-muted-foreground">Noch kein Inhalt</span>
          )}
        </div>
      </div>
    </div>
  );
}

function HtmlEmailPreview({ content }: { content: string }) {
  const srcDoc = content
    ? `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;">${content}</body></html>`
    : `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:16px;color:#999;">Noch kein Inhalt</body></html>`;

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
}: {
  channel: "sms" | "email" | "html_email";
  messageContent: string;
  messageSubject: string;
}) {
  return (
    <div className="h-full flex flex-col">
      <div className="text-xs font-medium text-muted-foreground px-3 pt-3 pb-1 border-b">
        Vorschau
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
  onMessageGenerated,
}: {
  channel: "sms" | "email" | "html_email";
  segmentFilters: Array<{ field: string; operator: string; value: string }>;
  promoCode: string | null;
  onMessageGenerated: (content: string) => void;
}) {
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
      : "Alle Patienten";

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
          previousMessages: messages,
        }
      );
      const data = await res.json();
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: data.message || data.content || "",
      };
      setMessages([...newMessages, aiMessage]);
      if (aiMessage.content) {
        onMessageGenerated(aiMessage.content);
      }
    } catch {
      const errMessage: ChatMessage = {
        role: "assistant",
        content: "Fehler beim Generieren der Nachricht. Bitte versuche es erneut.",
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
          <div className="text-center text-xs text-muted-foreground pt-6">
            Beschreibe die Nachricht, die du verfassen möchtest.
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
          placeholder="Schreibe eine Anfrage... (Enter zum Senden)"
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
  const max = 160;
  return (
    <div className="space-y-2">
      <Textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder="SMS-Text eingeben..."
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
        {content.length}/{max} Zeichen
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
        className="prose prose-sm max-w-none p-3 min-h-32 focus-within:outline-none"
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
  return (
    <div className="space-y-3">
      <Tabs defaultValue="ai">
        <TabsList>
          <TabsTrigger value="ai">AI Chat</TabsTrigger>
          <TabsTrigger value="editor">Editor</TabsTrigger>
        </TabsList>

        {/* AI Chat Tab */}
        <TabsContent value="ai" className="mt-3">
          <div className="border rounded-lg overflow-hidden" style={{ height: "420px" }}>
            <ResizablePanelGroup direction="horizontal">
              {/* Chat panel – 40% */}
              <ResizablePanel defaultSize={40} minSize={25}>
                <AiChatPanel
                  channel={channel}
                  segmentFilters={segmentFilters}
                  promoCode={promoCode}
                  onMessageGenerated={onContentChange}
                />
              </ResizablePanel>

              <ResizableHandle withHandle />

              {/* Preview panel – 60% */}
              <ResizablePanel defaultSize={60} minSize={25}>
                <PreviewPanel
                  channel={channel}
                  messageContent={messageContent}
                  messageSubject={messageSubject}
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
              <Label htmlFor="msg-subject">Betreff</Label>
              <Input
                id="msg-subject"
                value={messageSubject}
                onChange={(e) => onSubjectChange(e.target.value)}
                placeholder="Betreff der E-Mail..."
              />
            </div>
          )}

          {/* Content editor */}
          <div className="space-y-1">
            <Label>Inhalt</Label>
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
