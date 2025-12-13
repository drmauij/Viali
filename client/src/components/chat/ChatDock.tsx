import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useSocket } from "@/contexts/SocketContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
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
  Paperclip,
  UserCircle,
  Hash,
  Image,
  File,
  Loader2,
  Trash2
} from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MentionSuggestion {
  type: 'user' | 'patient';
  id: string;
  display: string;
  subtext?: string;
}

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
  const { toast } = useToast();
  const [view, setView] = useState<ChatView>('list');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionType, setMentionType] = useState<'user' | 'patient' | null>(null);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    file: globalThis.File;
    preview?: string;
    uploading: boolean;
    storageKey?: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      
      if (activeHospital?.id) {
        fetch(`/api/chat/${activeHospital.id}/notifications/mark-all-read`, {
          method: 'POST',
          credentials: 'include',
        }).then(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital.id, 'notifications'] });
        }).catch(err => console.error('Failed to mark notifications as read:', err));
      }
      
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen, activeHospital?.id]);

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
    queryKey: ['/api/hospitals', activeHospital?.id, 'users-by-module'],
    queryFn: async () => {
      const response = await fetch(`/api/hospitals/${activeHospital?.id}/users-by-module`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      const data = await response.json();
      return data.users || [];
    },
    enabled: !!activeHospital?.id && (view === 'new' || view === 'conversation'),
  });

  const { data: patients = [] } = useQuery<Array<{id: string; firstName?: string; lastName?: string; dateOfBirth?: string}>>({
    queryKey: ['/api/patients', activeHospital?.id],
    queryFn: async () => {
      const response = await fetch(`/api/patients?hospitalId=${activeHospital?.id}&limit=100`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && view === 'conversation',
  });

  const mentionSuggestions = useMemo((): MentionSuggestion[] => {
    if (!showMentionSuggestions || !mentionType) return [];
    
    const searchLower = mentionSearch.toLowerCase();
    
    if (mentionType === 'user') {
      return users
        .filter(u => {
          if (u.id === (user as any)?.id) return false;
          const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
          const email = (u.email || '').toLowerCase();
          return fullName.includes(searchLower) || email.includes(searchLower);
        })
        .slice(0, 5)
        .map(u => ({
          type: 'user' as const,
          id: u.id,
          display: u.firstName || u.lastName ? `${u.firstName || ''} ${u.lastName || ''}`.trim() : u.email || 'Unknown',
          subtext: u.email
        }));
    } else if (mentionType === 'patient') {
      return patients
        .filter(p => {
          const fullName = `${p.firstName || ''} ${p.lastName || ''}`.toLowerCase();
          return fullName.includes(searchLower);
        })
        .slice(0, 5)
        .map(p => {
          let formattedDob = '';
          if (p.dateOfBirth) {
            try {
              formattedDob = format(new Date(p.dateOfBirth), 'dd.MM.yyyy');
            } catch {
              formattedDob = p.dateOfBirth;
            }
          }
          return {
            type: 'patient' as const,
            id: p.id,
            display: `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown Patient',
            subtext: formattedDob ? `* ${formattedDob}` : undefined
          };
        });
    }
    
    return [];
  }, [showMentionSuggestions, mentionType, mentionSearch, users, patients, user]);

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
    mutationFn: async ({ content, mentions, attachments }: { 
      content: string; 
      mentions: Array<{ type: string; userId?: string; patientId?: string }>;
      attachments?: Array<{ storageKey: string; filename: string; mimeType: string; sizeBytes: number }>;
    }) => {
      const response = await apiRequest("POST", `/api/chat/conversations/${selectedConversation?.id}/messages`, {
        content,
        messageType: attachments && attachments.length > 0 ? 'file' : 'text',
        mentions: mentions.length > 0 ? mentions : undefined,
        attachments: attachments && attachments.length > 0 ? attachments : undefined
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'] });
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
      setMessageText("");
      setPendingAttachments([]);
    },
  });

  const deleteConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      await apiRequest("DELETE", `/api/chat/conversations/${conversationId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
      setSelectedConversation(null);
      setView('list');
      toast({
        title: "Conversation deleted",
        description: "The conversation has been removed.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete conversation. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newAttachments = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      uploading: true,
      storageKey: undefined as string | undefined
    }));

    setPendingAttachments(prev => [...prev, ...newAttachments]);
    setIsUploading(true);

    for (let i = 0; i < newAttachments.length; i++) {
      const attachment = newAttachments[i];
      try {
        const uploadResponse = await apiRequest("POST", "/api/chat/upload", { 
          filename: attachment.file.name 
        });
        const { uploadURL, storageKey } = await uploadResponse.json();

        await fetch(uploadURL, {
          method: "PUT",
          body: attachment.file,
          headers: {
            "Content-Type": attachment.file.type
          }
        });

        await apiRequest("POST", "/api/chat/attachments/confirm", {
          storageKey,
          filename: attachment.file.name,
          mimeType: attachment.file.type,
          sizeBytes: attachment.file.size
        });

        setPendingAttachments(prev => prev.map((att, idx) => 
          att.file === attachment.file 
            ? { ...att, uploading: false, storageKey } 
            : att
        ));
      } catch (error) {
        console.error("Upload failed:", error);
        setPendingAttachments(prev => prev.filter(att => att.file !== attachment.file));
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setPendingAttachments(prev => {
      const attachment = prev[index];
      if (attachment?.preview) {
        URL.revokeObjectURL(attachment.preview);
      }
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const detectMentionTrigger = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@(\w*)$/);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    
    if (atMatch) {
      setMentionType('user');
      setMentionSearch(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
      setShowMentionSuggestions(true);
      setSelectedMentionIndex(0);
    } else if (hashMatch) {
      setMentionType('patient');
      setMentionSearch(hashMatch[1]);
      setMentionStartIndex(cursorPos - hashMatch[0].length);
      setShowMentionSuggestions(true);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionSuggestions(false);
      setMentionType(null);
      setMentionSearch("");
    }
  }, []);

  const insertMention = useCallback((suggestion: MentionSuggestion) => {
    const prefix = suggestion.type === 'user' ? '@' : '#';
    const mentionText = `${prefix}[${suggestion.display}](${suggestion.id}) `;
    const newText = messageText.slice(0, mentionStartIndex) + mentionText + messageText.slice(inputRef.current?.selectionStart || messageText.length);
    setMessageText(newText);
    setShowMentionSuggestions(false);
    setMentionType(null);
    setMentionSearch("");
    inputRef.current?.focus();
  }, [messageText, mentionStartIndex]);

  const parseMentions = useCallback((text: string) => {
    const mentions: Array<{ type: string; userId?: string; patientId?: string }> = [];
    const userMentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const patientMentionRegex = /#\[([^\]]+)\]\(([^)]+)\)/g;
    
    let match;
    while ((match = userMentionRegex.exec(text)) !== null) {
      mentions.push({ type: 'user', userId: match[2] });
    }
    while ((match = patientMentionRegex.exec(text)) !== null) {
      mentions.push({ type: 'patient', patientId: match[2] });
    }
    
    return mentions;
  }, []);

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

    const handleNotification = (data: { notification: { conversationId: string; messageId: string; senderName: string; preview: string } }) => {
      const { notification } = data;
      queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'notifications'] });
      
      if (!isOpen || notification.conversationId !== selectedConversation?.id) {
        toast({
          title: `New message from ${notification.senderName}`,
          description: notification.preview.length > 60 ? notification.preview.substring(0, 60) + '...' : notification.preview,
        });
      }
    };

    socket.on('chat:new-message', handleNewMessage);
    socket.on('chat:typing', handleTyping);
    socket.on('chat:message-deleted', handleMessageDeleted);
    socket.on('chat:message-edited', handleMessageEdited);
    socket.on('chat:notification', handleNotification);

    return () => {
      socket.off('chat:new-message', handleNewMessage);
      socket.off('chat:typing', handleTyping);
      socket.off('chat:message-deleted', handleMessageDeleted);
      socket.off('chat:message-edited', handleMessageEdited);
      socket.off('chat:notification', handleNotification);
    };
  }, [socket, isConnected, selectedConversation?.id, refetchMessages, activeHospital?.id, user, isOpen, toast]);

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
    const hasContent = messageText.trim();
    const hasAttachments = pendingAttachments.some(a => a.storageKey && !a.uploading);
    
    if ((!hasContent && !hasAttachments) || !selectedConversation) return;
    if (isUploading || pendingAttachments.some(a => a.uploading)) return;
    
    if (socket) {
      socket.emit('chat:typing', {
        conversationId: selectedConversation.id,
        userName: (user as any)?.firstName || 'User',
        isTyping: false
      });
    }
    
    const mentions = parseMentions(messageText);
    const attachments = pendingAttachments
      .filter(a => a.storageKey && !a.uploading)
      .map(a => ({
        storageKey: a.storageKey!,
        filename: a.file.name,
        mimeType: a.file.type,
        sizeBytes: a.file.size
      }));
    
    sendMessageMutation.mutate({ 
      content: hasContent ? messageText.trim() : (attachments.length > 0 ? `Sent ${attachments.length} file(s)` : ''), 
      mentions,
      attachments: attachments.length > 0 ? attachments : undefined
    });
  };

  const handleMessageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setMessageText(newValue);
    handleTyping();
    detectMentionTrigger(newValue, e.target.selectionStart || newValue.length);
  };

  const handleMessageKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev < mentionSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => 
          prev > 0 ? prev - 1 : mentionSuggestions.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowMentionSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMessageContent = (content: string) => {
    const userMentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const patientMentionRegex = /#\[([^\]]+)\]\(([^)]+)\)/g;
    
    let formattedContent = content
      .replace(userMentionRegex, '<span class="text-primary font-medium">@$1</span>')
      .replace(patientMentionRegex, '<span class="text-amber-500 dark:text-amber-400 font-medium">#$1</span>');
    
    return formattedContent;
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" data-testid="button-conversation-menu">
                      <MoreVertical className="w-5 h-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="z-[1000]" sideOffset={5}>
                    <DropdownMenuItem data-testid="menu-view-participants">
                      <Users className="w-4 h-4 mr-2" />
                      View Participants
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      data-testid="menu-delete-conversation"
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (selectedConversation && confirm("Are you sure you want to delete this conversation? This cannot be undone.")) {
                          deleteConversationMutation.mutate(selectedConversation.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Conversation
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
                                {msg.isDeleted ? (
                                  <p className="text-sm whitespace-pre-wrap break-words italic">
                                    This message was deleted
                                  </p>
                                ) : (
                                  <p 
                                    className="text-sm whitespace-pre-wrap break-words"
                                    dangerouslySetInnerHTML={{ __html: formatMessageContent(msg.content) }}
                                  />
                                )}
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
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.txt,.xls,.xlsx"
                  className="hidden"
                  onChange={handleFileSelect}
                  data-testid="input-file-upload"
                />
                {pendingAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {pendingAttachments.map((attachment, index) => (
                      <div 
                        key={index} 
                        className="relative group bg-accent rounded-lg p-2 flex items-center gap-2"
                        data-testid={`attachment-preview-${index}`}
                      >
                        {attachment.preview ? (
                          <img 
                            src={attachment.preview} 
                            alt={attachment.file.name} 
                            className="w-12 h-12 object-cover rounded"
                          />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded flex items-center justify-center">
                            <File className="w-6 h-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0 max-w-[100px]">
                          <p className="text-xs font-medium truncate">{attachment.file.name}</p>
                          {attachment.uploading && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Uploading...</span>
                            </div>
                          )}
                        </div>
                        <button
                          className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeAttachment(index)}
                          data-testid={`remove-attachment-${index}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="relative">
                  {showMentionSuggestions && mentionSuggestions.length > 0 && (
                    <div 
                      className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10"
                      data-testid="mention-suggestions"
                    >
                      {mentionSuggestions.map((suggestion, index) => (
                        <button
                          key={`${suggestion.type}-${suggestion.id}`}
                          className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent ${
                            index === selectedMentionIndex ? 'bg-accent' : ''
                          }`}
                          onClick={() => insertMention(suggestion)}
                          data-testid={`mention-${suggestion.type}-${suggestion.id}`}
                        >
                          {suggestion.type === 'user' ? (
                            <UserCircle className="w-5 h-5 text-primary" />
                          ) : (
                            <Hash className="w-5 h-5 text-amber-500" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{suggestion.display}</p>
                            {suggestion.subtext && (
                              <p className="text-xs text-muted-foreground truncate">{suggestion.subtext}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="shrink-0" 
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                      data-testid="button-attach-file"
                    >
                      {isUploading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <Paperclip className="w-5 h-5" />
                      )}
                    </Button>
                    <Input
                      ref={inputRef}
                      placeholder="Type @ to mention, # for patient..."
                      value={messageText}
                      onChange={handleMessageInputChange}
                      onKeyDown={handleMessageKeyDown}
                      className="flex-1"
                      data-testid="input-message"
                    />
                    <Button
                      size="icon"
                      onClick={handleSendMessage}
                      disabled={(!messageText.trim() && !pendingAttachments.some(a => a.storageKey)) || sendMessageMutation.isPending || isUploading}
                      data-testid="button-send-message"
                    >
                      <Send className="w-5 h-5" />
                    </Button>
                  </div>
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
