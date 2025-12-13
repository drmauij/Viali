import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/contexts/SocketContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  X, 
  Send, 
  Plus, 
  Search,
  ArrowLeft,
  Users,
  User,
  Building2,
  MessageCircle,
  MoreVertical,
  Paperclip
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ChatDockProps {
  isOpen: boolean;
  onClose: () => void;
  activeHospital?: {
    id: string;
    name: string;
    unitId: string;
    unitName: string;
  };
}

interface Conversation {
  id: string;
  hospitalId: string;
  creatorId: string;
  scopeType: 'self' | 'direct' | 'unit' | 'hospital';
  title: string | null;
  unitId: string | null;
  patientId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  participants: Array<{
    id: string;
    conversationId: string;
    userId: string;
    role: string;
    lastReadAt: string | null;
    user?: {
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };
  }>;
  unreadCount?: number;
}

interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  messageType: string;
  replyToMessageId: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  editedAt: string | null;
  sender?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email?: string;
  };
  mentions?: Array<{
    id: string;
    mentionType: string;
    mentionedUserId?: string;
  }>;
  attachments?: Array<{
    id: string;
    filename: string;
    mimeType: string;
    storageKey: string;
  }>;
}

type ChatView = 'list' | 'conversation' | 'new';

export default function ChatDock({ isOpen, onClose, activeHospital }: ChatDockProps) {
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const [view, setView] = useState<ChatView>('list');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<Conversation[]>({
    queryKey: ['/api/chat', activeHospital?.id, 'conversations'],
    queryFn: async () => {
      const response = await fetch(`/api/chat/${activeHospital?.id}/conversations`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch conversations');
      return response.json();
    },
    enabled: !!activeHospital?.id && isOpen,
    refetchInterval: 30000,
  });

  const { data: messages = [], isLoading: messagesLoading, refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'],
    queryFn: async () => {
      const response = await fetch(`/api/chat/conversations/${selectedConversation?.id}/messages?limit=100`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch messages');
      return response.json();
    },
    enabled: !!selectedConversation?.id && view === 'conversation',
  });

  const { data: users = [] } = useQuery<Array<{id: string; firstName?: string; lastName?: string; email?: string}>>({
    queryKey: ['/api/users', activeHospital?.id],
    queryFn: async () => {
      const response = await fetch(`/api/users?hospitalId=${activeHospital?.id}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && view === 'new',
  });

  const createConversationMutation = useMutation({
    mutationFn: async (data: { scopeType: string; participantIds?: string[]; title?: string }) => {
      const response = await apiRequest("POST", `/api/chat/${activeHospital?.id}/conversations`, data);
      return response.json();
    },
    onSuccess: (newConvo) => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
      setSelectedConversation(newConvo);
      setView('conversation');
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      const response = await apiRequest("POST", `/api/chat/conversations/${selectedConversation?.id}/messages`, {
        content,
        messageType: 'text'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
      setMessageText("");
    },
  });

  useEffect(() => {
    if (selectedConversation && socket && isConnected) {
      socket.emit('chat:join', selectedConversation.id);
      socket.emit('chat:read', { conversationId: selectedConversation.id });
      
      return () => {
        socket.emit('chat:leave', selectedConversation.id);
      };
    }
  }, [selectedConversation?.id, socket, isConnected]);

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleNewMessage = (data: any) => {
      if (data.conversationId === selectedConversation?.id) {
        refetchMessages();
      }
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
    };

    const handleTyping = (data: any) => {
      if (data.conversationId === selectedConversation?.id && data.userId !== (user as any)?.id) {
        if (data.isTyping) {
          setTypingUsers(prev => new Map(prev).set(data.userId, data.userName));
        } else {
          setTypingUsers(prev => {
            const next = new Map(prev);
            next.delete(data.userId);
            return next;
          });
        }
      }
    };

    const handleMessageDeleted = (data: any) => {
      if (data.conversationId === selectedConversation?.id) {
        refetchMessages();
      }
    };

    const handleMessageEdited = (data: any) => {
      if (data.conversationId === selectedConversation?.id) {
        refetchMessages();
      }
    };

    socket.on('chat:new-message', handleNewMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:message-deleted', handleMessageDeleted);
    socket.on('chat:message-edited', handleMessageEdited);

    return () => {
      socket.off('chat:new-message', handleNewMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:message-deleted', handleMessageDeleted);
      socket.off('chat:message-edited', handleMessageEdited);
    };
  }, [socket, isConnected, selectedConversation?.id, refetchMessages, activeHospital?.id, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleTyping = useCallback(() => {
    if (!socket || !selectedConversation) return;
    
    socket.emit('chat:typing', {
      conversationId: selectedConversation.id,
      userName: (user as any)?.firstName || 'User',
      isTyping: true
    });

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('chat:typing', {
        conversationId: selectedConversation.id,
        userName: (user as any)?.firstName || 'User',
        isTyping: false
      });
    }, 2000);
  }, [socket, selectedConversation, user]);

  const handleSendMessage = () => {
    if (!messageText.trim() || !selectedConversation) return;
    
    if (socket) {
      socket.emit('chat:typing', {
        conversationId: selectedConversation.id,
        userName: (user as any)?.firstName || 'User',
        isTyping: false
      });
    }
    
    sendMessageMutation.mutate(messageText.trim());
  };

  const getConversationTitle = (convo: Conversation) => {
    if (convo.title) return convo.title;
    if (convo.scopeType === 'self') return 'Personal Notes';
    if (convo.scopeType === 'direct') {
      const otherParticipant = convo.participants.find(p => p.userId !== (user as any)?.id);
      if (otherParticipant?.user) {
        return `${otherParticipant.user.firstName || ''} ${otherParticipant.user.lastName || ''}`.trim() || otherParticipant.user.email;
      }
    }
    if (convo.scopeType === 'unit') return 'Unit Chat';
    if (convo.scopeType === 'hospital') return 'Hospital Chat';
    return 'Conversation';
  };

  const getConversationIcon = (scopeType: string) => {
    switch (scopeType) {
      case 'self': return <User className="w-4 h-4" />;
      case 'direct': return <MessageCircle className="w-4 h-4" />;
      case 'unit': return <Users className="w-4 h-4" />;
      case 'hospital': return <Building2 className="w-4 h-4" />;
      default: return <MessageCircle className="w-4 h-4" />;
    }
  };

  const formatMessageTime = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return `Yesterday ${format(date, 'HH:mm')}`;
    return format(date, 'MMM d, HH:mm');
  };

  const getInitials = (firstName?: string, lastName?: string, email?: string) => {
    if (firstName || lastName) {
      return `${firstName?.[0] || ''}${lastName?.[0] || ''}`.toUpperCase();
    }
    return email?.[0]?.toUpperCase() || '?';
  };

  const filteredConversations = conversations.filter(c => {
    if (!searchQuery) return true;
    const title = getConversationTitle(c) || '';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const panelContent = (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-[998]"
          onClick={onClose}
          data-testid="chat-overlay"
          style={{ touchAction: 'none' }}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-card border-l border-border shadow-xl z-[999] transform transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
        data-testid="chat-panel"
        style={{ touchAction: 'pan-y', pointerEvents: 'auto' }}
      >
        <div className="flex flex-col h-full">
          {view === 'list' && (
            <>
              <div className="flex items-center justify-between p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground">Messages</h2>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setView('new')}
                    data-testid="button-new-conversation"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    data-testid="button-close-chat"
                  >
                    <X className="w-5 h-5" />
                  </Button>
                </div>
              </div>

              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search conversations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                    data-testid="input-search-conversations"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-muted-foreground">Loading...</div>
                ) : filteredConversations.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    No conversations yet
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredConversations.map((convo) => (
                      <button
                        key={convo.id}
                        className="w-full p-3 hover:bg-accent/50 text-left flex items-start gap-3"
                        onClick={() => {
                          setSelectedConversation(convo);
                          setView('conversation');
                        }}
                        data-testid={`conversation-${convo.id}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          {getConversationIcon(convo.scopeType)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground truncate">
                              {getConversationTitle(convo)}
                            </span>
                            {convo.lastMessageAt && (
                              <span className="text-xs text-muted-foreground">
                                {formatMessageTime(convo.lastMessageAt)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {convo.participants.length} participant{convo.participants.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        {(convo.unreadCount ?? 0) > 0 && (
                          <span className="bg-primary text-primary-foreground text-xs font-medium px-2 py-0.5 rounded-full">
                            {convo.unreadCount}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </>
          )}

          {view === 'conversation' && selectedConversation && (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-border">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setView('list');
                    setSelectedConversation(null);
                  }}
                  data-testid="button-back-to-list"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-foreground truncate">
                    {getConversationTitle(selectedConversation)}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {selectedConversation.participants.length} participant{selectedConversation.participants.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem data-testid="menu-view-participants">
                      View Participants
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  data-testid="button-close-chat-conv"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="text-center text-muted-foreground">Loading messages...</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    No messages yet. Start the conversation!
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[...messages].reverse().map((msg) => {
                      const isOwnMessage = msg.senderId === (user as any)?.id;
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div className={`flex items-end gap-2 max-w-[80%] ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
                            {!isOwnMessage && (
                              <Avatar className="w-7 h-7">
                                <AvatarFallback className="text-xs">
                                  {getInitials(msg.sender?.firstName, msg.sender?.lastName, msg.sender?.email)}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div>
                              {!isOwnMessage && (
                                <p className="text-xs text-muted-foreground mb-1">
                                  {msg.sender?.firstName || msg.sender?.email || 'Unknown'}
                                </p>
                              )}
                              <div
                                className={`rounded-2xl px-4 py-2 ${
                                  isOwnMessage
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-accent'
                                } ${msg.isDeleted ? 'opacity-50 italic' : ''}`}
                              >
                                <p className="text-sm whitespace-pre-wrap break-words">
                                  {msg.isDeleted ? 'This message was deleted' : msg.content}
                                </p>
                              </div>
                              <p className={`text-xs text-muted-foreground mt-1 ${isOwnMessage ? 'text-right' : ''}`}>
                                {formatMessageTime(msg.createdAt)}
                                {msg.isEdited && ' (edited)'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
                {typingUsers.size > 0 && (
                  <div className="text-sm text-muted-foreground italic mt-2">
                    {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
              </ScrollArea>

              <div className="p-4 border-t border-border">
                <div className="flex items-end gap-2">
                  <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-attach-file">
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <Input
                    placeholder="Type a message..."
                    value={messageText}
                    onChange={(e) => {
                      setMessageText(e.target.value);
                      handleTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                    className="flex-1"
                    data-testid="input-message"
                  />
                  <Button
                    size="icon"
                    onClick={handleSendMessage}
                    disabled={!messageText.trim() || sendMessageMutation.isPending}
                    data-testid="button-send-message"
                  >
                    <Send className="w-5 h-5" />
                  </Button>
                </div>
              </div>
            </>
          )}

          {view === 'new' && (
            <>
              <div className="flex items-center gap-3 p-4 border-b border-border">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setView('list')}
                  data-testid="button-back-from-new"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-semibold text-foreground">New Conversation</h2>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="p-4 space-y-4">
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3"
                  onClick={() => {
                    createConversationMutation.mutate({ scopeType: 'self' });
                  }}
                  data-testid="button-create-self-chat"
                >
                  <User className="w-5 h-5" />
                  Personal Notes
                </Button>

                <div className="pt-4 border-t border-border">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Start a conversation with:</h3>
                  <ScrollArea className="h-[300px]">
                    {users.filter(u => u.id !== (user as any)?.id).map((u) => (
                      <button
                        key={u.id}
                        className="w-full p-3 hover:bg-accent/50 rounded-lg text-left flex items-center gap-3"
                        onClick={() => {
                          createConversationMutation.mutate({
                            scopeType: 'direct',
                            participantIds: [u.id]
                          });
                        }}
                        data-testid={`user-${u.id}`}
                      >
                        <Avatar>
                          <AvatarFallback>
                            {getInitials(u.firstName, u.lastName, u.email)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {u.firstName || u.lastName 
                              ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
                              : u.email}
                          </p>
                          {(u.firstName || u.lastName) && u.email && (
                            <p className="text-sm text-muted-foreground">{u.email}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </ScrollArea>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );

  if (!isOpen && typeof window === 'undefined') {
    return null;
  }

  return typeof window !== 'undefined' 
    ? createPortal(panelContent, document.body)
    : null;
}
