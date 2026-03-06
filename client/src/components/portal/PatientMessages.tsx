import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2, Check, CheckCheck } from "lucide-react";
import { usePortalSocket } from "@/hooks/usePortalSocket";
import { cn } from "@/lib/utils";

export interface PatientMessage {
  id: string;
  message: string;
  direction: string;
  channel: string;
  createdAt: string;
  readByPatientAt: string | null;
  readByStaffAt: string | null;
}

interface PatientMessagesProps {
  token: string;
  hospitalId: string;
  patientId: string;
  isDark: boolean;
  className?: string;
  messages?: PatientMessage[];
  messagesLoading?: boolean;
  translations: {
    messagesTitle: string;
    typeMessage: string;
    send: string;
    noMessages: string;
    noMessagesDesc: string;
    today: string;
    yesterday: string;
  };
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDate(dateStr: string, t: PatientMessagesProps['translations']): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t.today;
  if (date.toDateString() === yesterday.toDateString()) return t.yesterday;
  return date.toLocaleDateString([], { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default function PatientMessages({ token, hospitalId, patientId, isDark, className, messages: externalMessages, messagesLoading, translations: t }: PatientMessagesProps) {
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { socket, isConnected } = usePortalSocket({
    portalToken: token,
    hospitalId,
    patientId,
    enabled: !!hospitalId && !!patientId,
  });

  // Use external messages if provided, otherwise fetch internally
  const { data: internalMessages = [], isLoading: internalLoading } = useQuery<PatientMessage[]>({
    queryKey: ['/api/patient-portal', token, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/patient-portal/${token}/messages`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !externalMessages,
  });

  const messages = externalMessages ?? internalMessages;
  const isLoading = messagesLoading ?? internalLoading;

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/patient-portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patient-portal', token, 'messages'] });
      setNewMessage("");
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
  });

  // Mark messages as read via IntersectionObserver — only when actually visible
  const markReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const markVisibleAsRead = useCallback(() => {
    if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
    markReadTimeoutRef.current = setTimeout(() => {
      if (document.visibilityState === 'visible') {
        fetch(`/api/patient-portal/${token}/messages/mark-read`, { method: 'POST' })
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['/api/patient-portal', token, 'messages'] });
          })
          .catch(() => {});
      }
    }, 300);
  }, [token, queryClient]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const hasUnread = messages.some(m => m.direction === 'outbound' && !m.readByPatientAt);
    if (!hasUnread) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const anyVisible = entries.some(e => e.isIntersecting);
        if (anyVisible) {
          markVisibleAsRead();
        }
      },
      { root: container, threshold: 0.5 }
    );

    // Observe unread outbound message elements
    const unreadEls = container.querySelectorAll('[data-unread-outbound]');
    unreadEls.forEach(el => observerRef.current?.observe(el));

    return () => {
      observerRef.current?.disconnect();
      if (markReadTimeoutRef.current) clearTimeout(markReadTimeoutRef.current);
    };
  }, [messages, markVisibleAsRead]);

  // Listen for new messages via socket
  useEffect(() => {
    if (!socket) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patient-portal', token, 'messages'] });
    };
    socket.on('patient-chat:new-message', handler);
    return () => { socket.off('patient-chat:new-message', handler); };
  }, [socket, queryClient, token]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = newMessage.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: PatientMessage[] }[] = [];
  let currentDate = '';
  for (const msg of messages) {
    const msgDate = new Date(msg.createdAt).toDateString();
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msg.createdAt, messages: [msg] });
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  return (
    <div className={cn("flex flex-col bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden", className)}>
      {/* Messages area */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-3 space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t.noMessages}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{t.noMessagesDesc}</p>
          </div>
        ) : (
          <>
            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                {/* Date separator */}
                <div className="flex items-center justify-center my-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-0.5 rounded-full">
                    {formatMessageDate(group.date, t)}
                  </span>
                </div>
                {/* Messages */}
                {group.messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex mb-2 ${msg.direction === 'inbound' ? 'justify-end' : 'justify-start'}`}
                    {...(msg.direction === 'outbound' && !msg.readByPatientAt ? { 'data-unread-outbound': '' } : {})}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        msg.direction === 'inbound'
                          ? 'bg-blue-500 text-white rounded-br-md'
                          : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                      <div className={`flex items-center justify-end gap-1 mt-1 ${
                        msg.direction === 'inbound' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'
                      }`}>
                        <span className="text-[10px]">
                          {formatMessageTime(msg.createdAt)}
                        </span>
                        {msg.direction === 'inbound' && (
                          msg.readByStaffAt ? (
                            <CheckCheck className="w-3.5 h-3.5 text-white" />
                          ) : (
                            <Check className="w-3.5 h-3.5 opacity-70" />
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={t.typeMessage}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMutation.isPending}
            className="shrink-0 w-9 h-9 rounded-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white flex items-center justify-center transition-colors"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
