import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useSocket } from "@/contexts/SocketContext";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowLeft, Send, Loader2, X, Check, CheckCheck } from "lucide-react";
import { isToday, isYesterday, format } from "date-fns";

interface ConversationMessage {
  id: string;
  hospitalId: string;
  patientId: string;
  sentBy: string | null;
  channel: string;
  message: string;
  status: string | null;
  isAutomatic: boolean | null;
  messageType: string | null;
  direction: string;
  readByStaffAt: string | null;
  readByPatientAt: string | null;
  createdAt: string;
  senderFirstName?: string | null;
  senderLastName?: string | null;
}

interface PatientChatThreadProps {
  hospitalId: string;
  patientId: string;
  patientName: string;
  patientSurname: string;
  onBack: () => void;
  onClose: () => void;
  onOpenPatientInline?: (patientId: string) => void;
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd.MM.yyyy');
}

function formatMessageTime(dateStr: string): string {
  return format(new Date(dateStr), 'HH:mm');
}

export default function PatientChatThread({
  hospitalId,
  patientId,
  patientName,
  patientSurname,
  onBack,
  onClose,
  onOpenPatientInline,
}: PatientChatThreadProps) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: messages = [], isLoading } = useQuery<ConversationMessage[]>({
    queryKey: ['/api/patient-chat', hospitalId, 'conversations', patientId, 'messages'],
    queryFn: async () => {
      const res = await fetch(`/api/patient-chat/${hospitalId}/conversations/${patientId}/messages`);
      if (!res.ok) throw new Error('Failed to fetch messages');
      return res.json();
    },
    enabled: !!hospitalId && !!patientId,
  });

  // Mark as read on open
  useEffect(() => {
    if (hospitalId && patientId) {
      fetch(`/api/patient-chat/${hospitalId}/conversations/${patientId}/mark-read`, {
        method: 'POST',
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations'] });
        queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'unread-count'] });
      }).catch(() => {});
    }
  }, [hospitalId, patientId]);

  // Listen for new messages via socket
  useEffect(() => {
    if (!socket) return;
    const handler = (data: any) => {
      if (data.hospitalId === hospitalId && data.patientId === patientId) {
        queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations', patientId, 'messages'] });
        // Re-mark as read since we're viewing this thread
        fetch(`/api/patient-chat/${hospitalId}/conversations/${patientId}/mark-read`, {
          method: 'POST',
        }).catch(() => {});
      }
    };
    const readHandler = (data: any) => {
      if (data.hospitalId === hospitalId && data.patientId === patientId) {
        queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations', patientId, 'messages'] });
      }
    };
    socket.on('patient-chat:new-message', handler);
    socket.on('patient-chat:messages-read', readHandler);
    return () => {
      socket.off('patient-chat:new-message', handler);
      socket.off('patient-chat:messages-read', readHandler);
    };
  }, [socket, hospitalId, patientId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`/api/patient-chat/${hospitalId}/conversations/${patientId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations', patientId, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations'] });
      setNewMessage("");
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
    },
  });

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

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewMessage(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  // Group by date
  const groupedMessages: { date: string; messages: ConversationMessage[] }[] = [];
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

  const isAutoMessage = (msg: ConversationMessage) =>
    msg.isAutomatic || (msg.messageType && msg.messageType !== 'manual');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border bg-background">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <button
            className="text-sm font-semibold truncate hover:underline text-left"
            onClick={() => onOpenPatientInline?.(patientId)}
            title="Open patient details"
          >
            {patientSurname} {patientName}
          </button>
          <p className="text-xs text-muted-foreground">Patient Chat</p>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No messages with this patient yet
          </div>
        ) : (
          <>
            {groupedMessages.map((group, gi) => (
              <div key={gi}>
                <div className="flex items-center justify-center my-3">
                  <span className="text-xs text-muted-foreground bg-muted px-3 py-0.5 rounded-full">
                    {formatMessageDate(group.date)}
                  </span>
                </div>
                {group.messages.map((msg) => {
                  const isAuto = isAutoMessage(msg);
                  const isOutbound = msg.direction === 'outbound';
                  const senderName = msg.senderFirstName && msg.senderLastName
                    ? `${msg.senderFirstName} ${msg.senderLastName}`
                    : null;

                  if (isAuto) {
                    // Auto messages - muted, centered
                    return (
                      <div key={msg.id} className="flex justify-center mb-2">
                        <div className="max-w-[85%] bg-muted/50 rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-medium capitalize">
                              {msg.channel === 'sms' ? 'SMS' : msg.channel === 'email' ? 'Email' : msg.channel}
                            </span>
                            <span>&middot;</span>
                            <span>{msg.messageType?.replace('auto_', '')}</span>
                            <span>&middot;</span>
                            <span>{formatMessageTime(msg.createdAt)}</span>
                          </div>
                          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        </div>
                      </div>
                    );
                  }

                  if (isOutbound) {
                    // Staff message - right side, blue
                    const isRead = !!msg.readByPatientAt;
                    const isNotified = msg.status === 'notified';
                    return (
                      <div key={msg.id} className="flex justify-end mb-2">
                        <div className="max-w-[75%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-3.5 py-2 text-sm">
                          {senderName && (
                            <p className="text-[10px] opacity-70 mb-0.5">{senderName}</p>
                          )}
                          <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                          <div className="flex items-center justify-end gap-1 mt-1">
                            <span className="text-[10px] opacity-70">{formatMessageTime(msg.createdAt)}</span>
                            {msg.channel !== 'portal' && (
                              <span className="text-[10px] opacity-60 uppercase">{msg.channel}</span>
                            )}
                            {msg.messageType === 'manual' && (
                              isRead ? (
                                <CheckCheck className="w-3.5 h-3.5 text-white" />
                              ) : isNotified ? (
                                <CheckCheck className="w-3.5 h-3.5 opacity-60" />
                              ) : (
                                <Check className="w-3.5 h-3.5 opacity-60" />
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Inbound (patient) message - left side, green
                  return (
                    <div key={msg.id} className="flex justify-start mb-2">
                      <div className="max-w-[75%] bg-green-100 dark:bg-green-900/30 text-green-900 dark:text-green-100 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm">
                        <p className="whitespace-pre-wrap break-words">{msg.message}</p>
                        <p className="text-[10px] text-green-600 dark:text-green-400 mt-1">
                          {formatMessageTime(msg.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-border p-3 bg-background">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={newMessage}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Reply to patient..."
            rows={1}
            className="flex-1 resize-none rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
          <Button
            size="icon"
            className="shrink-0 rounded-full h-9 w-9"
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
