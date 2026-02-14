import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
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
  Trash2,
  AtSign,
  Camera,
  Command,
  CheckSquare,
  Circle,
  Play,
  CheckCircle2,
  GripVertical,
  ListTodo,
  Pencil,
  Check
} from "lucide-react";
import html2canvas from "html2canvas";
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

interface MentionChip {
  type: 'user' | 'patient';
  id: string;
  display: string;
}

interface InputSegment {
  type: 'text' | 'mention';
  content: string;
  mentionData?: MentionChip;
}

interface SlashCommand {
  id: string;
  name: string;
  description: string;
  icon: typeof Camera;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { id: 'screenshot', name: 'screenshot', description: 'Take a screenshot of current page', icon: Camera },
];

interface ChatDockProps {
  isOpen: boolean;
  onClose: () => void;
  activeHospital?: {
    id: string;
    name: string;
    unitId: string;
    unitName: string;
    unitType?: string | null;
  };
  onOpenPatientInline?: (patientId: string) => void;
  initialConversationId?: string | null;
  onInitialConversationHandled?: () => void;
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

type ChatView = 'list' | 'conversation' | 'new' | 'mentions';

interface MentionItem {
  id: string;
  mentionType: string;
  mentionedUserId: string | null;
  createdAt: string;
  message: {
    id: string;
    conversationId: string;
    senderId: string;
    content: string;
    createdAt: string;
    sender?: {
      id: string;
      firstName?: string;
      lastName?: string;
      email?: string;
    };
  };
}

export default function ChatDock({ isOpen, onClose, activeHospital, onOpenPatientInline, initialConversationId, onInitialConversationHandled }: ChatDockProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { socket, isConnected } = useSocket();
  const { toast } = useToast();
  const [view, setView] = useState<ChatView>('list');
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [listTab, setListTab] = useState<'messages' | 'todos'>('messages');
  const [editingTodo, setEditingTodo] = useState<{ id: string; title: string; description?: string } | null>(null);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [draggedTodo, setDraggedTodo] = useState<string | null>(null);
  const [dragOverTodo, setDragOverTodo] = useState<string | null>(null);
  const [todoMentionActive, setTodoMentionActive] = useState(false);
  const [todoMentionSearch, setTodoMentionSearch] = useState("");
  const [todoMentionStartIndex, setTodoMentionStartIndex] = useState(-1);
  const [selectedTodoMentionIndex, setSelectedTodoMentionIndex] = useState(0);
  const todoInputRef = useRef<HTMLTextAreaElement>(null);
  const editTodoInputRef = useRef<HTMLTextAreaElement>(null);
  const [editMentionActive, setEditMentionActive] = useState(false);
  const [editMentionSearch, setEditMentionSearch] = useState("");
  const [editMentionStartIndex, setEditMentionStartIndex] = useState(-1);
  const [selectedEditMentionIndex, setSelectedEditMentionIndex] = useState(0);
  const [messageText, setMessageText] = useState("");
  const [typingUsers, setTypingUsers] = useState<Map<string, string>>(new Map());
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionType, setMentionType] = useState<'user' | 'patient' | null>(null);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{
    file: globalThis.File;
    preview?: string;
    uploading: boolean;
    storageKey?: string;
  }>>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [slashSearch, setSlashSearch] = useState("");
  const [slashStartIndex, setSlashStartIndex] = useState(-1);
  const [selectedSlashIndex, setSelectedSlashIndex] = useState(0);
  const [isCapturingScreenshot, setIsCapturingScreenshot] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Array<{id: string; name: string}>>([]);
  const [contactSearchQuery, setContactSearchQuery] = useState("");
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | null>(null);

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

  // Handle initial conversation from deep link
  useEffect(() => {
    if (isOpen && initialConversationId && conversations.length > 0 && !selectedConversation) {
      const targetConversation = conversations.find(c => c.id === initialConversationId);
      if (targetConversation) {
        setSelectedConversation(targetConversation);
        setView('conversation');
        // Clear the initial conversation ID after handling
        if (onInitialConversationHandled) {
          onInitialConversationHandled();
        }
      }
    }
  }, [isOpen, initialConversationId, conversations, selectedConversation, onInitialConversationHandled]);

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
      return response.json();
    },
    enabled: !!activeHospital?.id && (view === 'new' || view === 'conversation'),
  });

  const { data: patients = [] } = useQuery<Array<{id: string; firstName?: string; surname?: string; birthday?: string}>>({
    queryKey: ['/api/patients', activeHospital?.id],
    queryFn: async () => {
      const response = await fetch(`/api/patients?hospitalId=${activeHospital?.id}&limit=100`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && isOpen,
  });

  const { data: myMentions = [], isLoading: mentionsLoading } = useQuery<MentionItem[]>({
    queryKey: ['/api/chat', activeHospital?.id, 'mentions'],
    queryFn: async () => {
      const response = await fetch(`/api/chat/${activeHospital?.id}/mentions`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && (isOpen || view === 'mentions'),
  });

  // Personal todos query
  interface PersonalTodo {
    id: string;
    userId: string;
    hospitalId: string;
    title: string;
    description?: string | null;
    status: 'todo' | 'running' | 'completed';
    position: number;
    createdAt?: string;
    updatedAt?: string;
  }

  const { data: todos = [], isLoading: todosLoading } = useQuery<PersonalTodo[]>({
    queryKey: ['/api/hospitals', activeHospital?.id, 'todos'],
    queryFn: async () => {
      const response = await fetch(`/api/hospitals/${activeHospital?.id}/todos`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!activeHospital?.id && isOpen,
  });

  const createTodoMutation = useMutation({
    mutationFn: async (title: string) => {
      const response = await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/todos`, { title });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', activeHospital?.id, 'todos'] });
      setNewTodoTitle("");
    },
  });

  const updateTodoMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { title?: string; description?: string; status?: string } }) => {
      const response = await apiRequest("PATCH", `/api/todos/${id}`, updates);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', activeHospital?.id, 'todos'] });
      setEditingTodo(null);
    },
  });

  const deleteTodoMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/todos/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', activeHospital?.id, 'todos'] });
    },
  });

  const reorderTodosMutation = useMutation({
    mutationFn: async ({ todoIds, status }: { todoIds: string[]; status: string }) => {
      await apiRequest("POST", `/api/hospitals/${activeHospital?.id}/todos/reorder`, { todoIds, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/hospitals', activeHospital?.id, 'todos'] });
    },
  });

  const handleDragStart = (todoId: string) => {
    setDraggedTodo(todoId);
  };

  const handleDragEnd = () => {
    setDraggedTodo(null);
    setDragOverTodo(null);
  };

  const handleDrop = (targetStatus: 'todo' | 'running' | 'completed', targetTodoId?: string) => {
    if (!draggedTodo) return;
    
    const todo = todos.find(t => t.id === draggedTodo);
    if (!todo) {
      setDraggedTodo(null);
      setDragOverTodo(null);
      return;
    }

    // Get existing todos in target column (excluding the dragged one which may be from any column)
    const columnTodos = todos
      .filter(t => t.status === targetStatus && t.id !== draggedTodo)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    
    // Build new order - dragged item will be included and get its status updated by the reorder API
    let newOrder: string[];
    if (targetTodoId && targetTodoId !== draggedTodo) {
      // Insert before the target todo
      const targetIndex = columnTodos.findIndex(t => t.id === targetTodoId);
      if (targetIndex >= 0) {
        newOrder = [
          ...columnTodos.slice(0, targetIndex).map(t => t.id),
          draggedTodo,
          ...columnTodos.slice(targetIndex).map(t => t.id)
        ];
      } else {
        // Target not found, add to end
        newOrder = [...columnTodos.map(t => t.id), draggedTodo];
      }
    } else {
      // No target, add to end of column
      newOrder = [...columnTodos.map(t => t.id), draggedTodo];
    }

    // Call reorder mutation which updates both position AND status for all items in the list
    reorderTodosMutation.mutate({ todoIds: newOrder, status: targetStatus });
    setDraggedTodo(null);
    setDragOverTodo(null);
  };

  const handleTodoDragOver = (e: React.DragEvent, todoId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedTodo && draggedTodo !== todoId) {
      setDragOverTodo(todoId);
    }
  };

  const handleTodoDragLeave = () => {
    setDragOverTodo(null);
  };

  const handleTodoDropOn = (e: React.DragEvent, targetTodoId: string, targetStatus: 'todo' | 'running' | 'completed') => {
    e.preventDefault();
    e.stopPropagation();
    handleDrop(targetStatus, targetTodoId);
  };

  // Todo patient mention suggestions
  const todoPatientSuggestions = useMemo(() => {
    if (!todoMentionActive) return [];
    
    const searchLower = todoMentionSearch.toLowerCase();
    return patients
      .filter(p => {
        const surname = (p.surname || '').toLowerCase();
        const firstName = (p.firstName || '').toLowerCase();
        let formattedBirthday = '';
        if (p.birthday) {
          try {
            formattedBirthday = format(new Date(p.birthday), 'dd.MM.yyyy');
          } catch {
            formattedBirthday = p.birthday;
          }
        }
        return surname.includes(searchLower) || 
               firstName.includes(searchLower) || 
               formattedBirthday.includes(searchLower);
      })
      .slice(0, 5)
      .map(p => {
        let formattedDob = '';
        if (p.birthday) {
          try {
            formattedDob = format(new Date(p.birthday), 'dd.MM.yyyy');
          } catch {
            formattedDob = p.birthday;
          }
        }
        const displayName = p.surname 
          ? `${p.surname}${p.firstName ? ', ' + p.firstName : ''}${formattedDob ? ' (' + formattedDob + ')' : ''}`
          : p.firstName || 'Unknown Patient';
        return { id: p.id, display: displayName };
      });
  }, [todoMentionActive, todoMentionSearch, patients]);

  const detectTodoMention = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    
    if (hashMatch) {
      setTodoMentionActive(true);
      setTodoMentionSearch(hashMatch[1]);
      setTodoMentionStartIndex(cursorPos - hashMatch[0].length);
      setSelectedTodoMentionIndex(0);
    } else {
      setTodoMentionActive(false);
      setTodoMentionSearch("");
    }
  }, []);

  const insertTodoPatientMention = useCallback((patient: { id: string; display: string }) => {
    const mentionText = `#[${patient.display}](${patient.id}) `;
    const newText = newTodoTitle.slice(0, todoMentionStartIndex) + mentionText + newTodoTitle.slice(todoInputRef.current?.selectionStart || newTodoTitle.length);
    setNewTodoTitle(newText);
    setTodoMentionActive(false);
    setTodoMentionSearch("");
    todoInputRef.current?.focus();
  }, [newTodoTitle, todoMentionStartIndex]);

  // Edit todo patient mention support
  const editPatientSuggestions = useMemo(() => {
    if (!editMentionActive) return [];
    
    const searchLower = editMentionSearch.toLowerCase();
    return patients
      .filter(p => {
        const surname = (p.surname || '').toLowerCase();
        const firstName = (p.firstName || '').toLowerCase();
        let formattedBirthday = '';
        if (p.birthday) {
          try {
            formattedBirthday = format(new Date(p.birthday), 'dd.MM.yyyy');
          } catch {
            formattedBirthday = p.birthday;
          }
        }
        return surname.includes(searchLower) || 
               firstName.includes(searchLower) || 
               formattedBirthday.includes(searchLower);
      })
      .slice(0, 5)
      .map(p => {
        let formattedDob = '';
        if (p.birthday) {
          try {
            formattedDob = format(new Date(p.birthday), 'dd.MM.yyyy');
          } catch {
            formattedDob = p.birthday;
          }
        }
        const displayName = p.surname 
          ? `${p.surname}${p.firstName ? ', ' + p.firstName : ''}${formattedDob ? ' (' + formattedDob + ')' : ''}`
          : p.firstName || 'Unknown Patient';
        return { id: p.id, display: displayName };
      });
  }, [editMentionActive, editMentionSearch, patients]);

  const detectEditMention = useCallback((text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const hashMatch = beforeCursor.match(/#(\w*)$/);
    
    if (hashMatch) {
      setEditMentionActive(true);
      setEditMentionSearch(hashMatch[1]);
      setEditMentionStartIndex(cursorPos - hashMatch[0].length);
      setSelectedEditMentionIndex(0);
    } else {
      setEditMentionActive(false);
      setEditMentionSearch("");
    }
  }, []);

  const insertEditPatientMention = useCallback((patient: { id: string; display: string }) => {
    if (!editingTodo) return;
    const mentionText = `#[${patient.display}](${patient.id}) `;
    const cursorPos = editTodoInputRef.current?.selectionStart || editingTodo.title.length;
    const newText = editingTodo.title.slice(0, editMentionStartIndex) + mentionText + editingTodo.title.slice(cursorPos);
    setEditingTodo({ ...editingTodo, title: newText });
    setEditMentionActive(false);
    setEditMentionSearch("");
    editTodoInputRef.current?.focus();
  }, [editingTodo, editMentionStartIndex]);

  const handleTodoInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setNewTodoTitle(newValue);
    detectTodoMention(newValue, e.target.selectionStart || newValue.length);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
  }, [detectTodoMention]);

  const handleTodoInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (todoMentionActive && todoPatientSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedTodoMentionIndex(prev => 
          prev < todoPatientSuggestions.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedTodoMentionIndex(prev => 
          prev > 0 ? prev - 1 : todoPatientSuggestions.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertTodoPatientMention(todoPatientSuggestions[selectedTodoMentionIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setTodoMentionActive(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey && newTodoTitle.trim()) {
      // Enter submits, Shift+Enter adds newline
      e.preventDefault();
      createTodoMutation.mutate(newTodoTitle.trim());
    }
  }, [todoMentionActive, todoPatientSuggestions, selectedTodoMentionIndex, insertTodoPatientMention, newTodoTitle, createTodoMutation]);

  const formatTodoTitle = useCallback((title: string, strikethrough?: boolean): JSX.Element => {
    const parts: (string | JSX.Element)[] = [];
    const patientMentionRegex = /#\[([^\]]+)\]\(([^)]+)\)/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = patientMentionRegex.exec(title)) !== null) {
      if (match.index > lastIndex) {
        parts.push(title.slice(lastIndex, match.index));
      }
      const displayName = match[1];
      const patientId = match[2];
      parts.push(
        <button
          key={key++}
          type="button"
          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 hover:bg-amber-500/30 text-xs font-medium"
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenPatientInline) onOpenPatientInline(patientId);
          }}
          data-testid={`todo-patient-link-${patientId}`}
        >
          <Hash className="w-3 h-3" />
          {displayName}
        </button>
      );
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < title.length) {
      parts.push(title.slice(lastIndex));
    }

    return (
      <span className={strikethrough ? 'line-through' : ''}>
        {parts.length > 0 ? parts : title}
      </span>
    );
  }, [onOpenPatientInline]);

  const mentionSuggestions = useMemo((): MentionSuggestion[] => {
    if (!showMentionSuggestions || !mentionType) return [];
    
    const searchLower = mentionSearch.toLowerCase();
    
    if (mentionType === 'user') {
      // Deduplicate users by ID first, then filter
      const uniqueUsers = users.filter((u, idx, arr) => arr.findIndex(x => x.id === u.id) === idx);
      return uniqueUsers
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
          const surname = (p.surname || '').toLowerCase();
          const firstName = (p.firstName || '').toLowerCase();
          let formattedBirthday = '';
          if (p.birthday) {
            try {
              formattedBirthday = format(new Date(p.birthday), 'dd.MM.yyyy');
            } catch {
              formattedBirthday = p.birthday;
            }
          }
          // Allow searching by surname, firstName, or birthday
          return surname.includes(searchLower) || 
                 firstName.includes(searchLower) || 
                 formattedBirthday.includes(searchLower) ||
                 (p.birthday || '').includes(searchLower);
        })
        .slice(0, 5)
        .map(p => {
          let formattedDob = '';
          if (p.birthday) {
            try {
              formattedDob = format(new Date(p.birthday), 'dd.MM.yyyy');
            } catch {
              formattedDob = p.birthday;
            }
          }
          // Display format: "Surname, FirstName (birthday)"
          const displayName = p.surname 
            ? `${p.surname}${p.firstName ? ', ' + p.firstName : ''}${formattedDob ? ' (' + formattedDob + ')' : ''}`
            : p.firstName || 'Unknown Patient';
          return {
            type: 'patient' as const,
            id: p.id,
            display: displayName,
            subtext: undefined // Birthday is now in the display name
          };
        });
    }
    
    return [];
  }, [showMentionSuggestions, mentionType, mentionSearch, users, patients, user]);

  const filteredSlashCommands = useMemo(() => {
    if (!showSlashCommands) return [];
    return SLASH_COMMANDS.filter(cmd => cmd.name.toLowerCase().includes(slashSearch.toLowerCase()));
  }, [showSlashCommands, slashSearch]);

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

  const editMessageMutation = useMutation({
    mutationFn: async ({ messageId, content }: { messageId: string; content: string }) => {
      const response = await apiRequest("PATCH", `/api/chat/messages/${messageId}`, { content });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'] });
      setEditingMessage(null);
      toast({
        title: t('chat.messageEdited'),
        description: t('chat.messageEditedDescription'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('chat.failedToEditMessage'),
        variant: "destructive",
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId: string) => {
      await apiRequest("DELETE", `/api/chat/messages/${messageId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'] });
      toast({
        title: t('chat.messageDeleted'),
        description: t('chat.messageDeletedDescription'),
      });
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('chat.failedToDeleteMessage'),
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
    const slashMatch = beforeCursor.match(/\/(\w*)$/);
    
    if (slashMatch) {
      setSlashSearch(slashMatch[1]);
      setSlashStartIndex(cursorPos - slashMatch[0].length);
      setShowSlashCommands(true);
      setSelectedSlashIndex(0);
      setShowMentionSuggestions(false);
      setMentionType(null);
    } else if (atMatch) {
      setMentionType('user');
      setMentionSearch(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
      setShowMentionSuggestions(true);
      setSelectedMentionIndex(0);
      setShowSlashCommands(false);
    } else if (hashMatch) {
      setMentionType('patient');
      setMentionSearch(hashMatch[1]);
      setMentionStartIndex(cursorPos - hashMatch[0].length);
      setShowMentionSuggestions(true);
      setSelectedMentionIndex(0);
      setShowSlashCommands(false);
    } else {
      setShowMentionSuggestions(false);
      setMentionType(null);
      setMentionSearch("");
      setShowSlashCommands(false);
      setSlashSearch("");
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

  const executeSlashCommand = useCallback(async (command: SlashCommand) => {
    setShowSlashCommands(false);
    setSlashSearch("");
    const currentSlashStartIndex = slashStartIndex;
    setSlashStartIndex(-1);
    
    if (currentSlashStartIndex >= 0) {
      const cursorPos = inputRef.current?.selectionStart || messageText.length;
      const newText = messageText.slice(0, currentSlashStartIndex) + messageText.slice(cursorPos);
      setMessageText(newText);
    }
    
    if (command.id === 'screenshot') {
      setIsCapturingScreenshot(true);
      const chatPanel = document.querySelector('[data-testid="chat-panel"]');
      const chatOverlay = document.querySelector('[data-testid="chat-overlay"]');
      try {
        if (chatPanel) (chatPanel as HTMLElement).style.visibility = 'hidden';
        if (chatOverlay) (chatOverlay as HTMLElement).style.visibility = 'hidden';
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const canvas = await html2canvas(document.body, {
          useCORS: true,
          logging: false,
          allowTaint: true,
          scale: window.devicePixelRatio || 1,
          width: window.innerWidth,
          height: window.innerHeight,
          x: window.scrollX,
          y: window.scrollY,
          scrollX: -window.scrollX,
          scrollY: -window.scrollY,
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
          backgroundColor: '#ffffff',
          removeContainer: true,
          imageTimeout: 15000,
          onclone: (clonedDoc) => {
            // Remove any problematic transforms or shadows that cause rendering issues
            const elements = clonedDoc.querySelectorAll('*');
            elements.forEach((el) => {
              const htmlEl = el as HTMLElement;
              const style = window.getComputedStyle(htmlEl);
              // Fix elements with problematic box-shadows
              if (style.boxShadow && style.boxShadow !== 'none') {
                htmlEl.style.boxShadow = 'none';
              }
              // Fix elements with transforms that may cause misalignment
              if (style.transform && style.transform !== 'none') {
                htmlEl.style.transform = 'none';
              }
            });
          }
        });
        
        if (chatPanel) (chatPanel as HTMLElement).style.visibility = 'visible';
        if (chatOverlay) (chatOverlay as HTMLElement).style.visibility = 'visible';
        
        canvas.toBlob(async (blob) => {
          if (!blob) {
            console.error("Screenshot capture failed: toBlob returned null");
            setIsCapturingScreenshot(false);
            return;
          }
          const file = new globalThis.File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
          const preview = URL.createObjectURL(blob);
          
          setPendingAttachments(prev => [...prev, { file, preview, uploading: true }]);
          
          try {
            const uploadResponse = await apiRequest("POST", "/api/chat/upload", { filename: file.name });
            const { uploadURL, storageKey } = await uploadResponse.json();
            await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
            await apiRequest("POST", "/api/chat/attachments/confirm", { storageKey, filename: file.name, mimeType: file.type, sizeBytes: file.size });
            
            setPendingAttachments(prev => prev.map(att => att.file === file ? { ...att, uploading: false, storageKey } : att));
          } catch (error) {
            console.error("Screenshot upload failed:", error);
            setPendingAttachments(prev => prev.filter(att => att.file !== file));
            URL.revokeObjectURL(preview);
          }
        }, 'image/png');
      } catch (error) {
        console.error("Screenshot capture failed:", error);
        if (chatPanel) (chatPanel as HTMLElement).style.visibility = 'visible';
        if (chatOverlay) (chatOverlay as HTMLElement).style.visibility = 'visible';
      } finally {
        setIsCapturingScreenshot(false);
      }
    }
    inputRef.current?.focus();
  }, [messageText, slashStartIndex]);

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

  const parseInputSegments = useCallback((text: string): InputSegment[] => {
    const segments: InputSegment[] = [];
    const combinedRegex = /(@\[([^\]]+)\]\(([^)]+)\))|(#\[([^\]]+)\]\(([^)]+)\))/g;
    let lastIndex = 0;
    let match;
    
    while ((match = combinedRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        segments.push({ type: 'text', content: text.slice(lastIndex, match.index) });
      }
      
      if (match[1]) {
        segments.push({
          type: 'mention',
          content: match[0],
          mentionData: { type: 'user', id: match[3], display: match[2] }
        });
      } else if (match[4]) {
        segments.push({
          type: 'mention',
          content: match[0],
          mentionData: { type: 'patient', id: match[6], display: match[5] }
        });
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      segments.push({ type: 'text', content: text.slice(lastIndex) });
    }
    
    return segments;
  }, []);

  const inputSegments = useMemo(() => parseInputSegments(messageText), [messageText, parseInputSegments]);

  // Smart backspace: delete entire mention if cursor is at end of one
  const handleSmartBackspace = useCallback(() => {
    if (messageText.length === 0) return;
    
    // Check if the text ends with a complete mention pattern
    const userMentionEnd = messageText.match(/@\[[^\]]+\]\([^)]+\)\s*$/);
    const patientMentionEnd = messageText.match(/#\[[^\]]+\]\([^)]+\)\s*$/);
    
    if (userMentionEnd) {
      // Delete the entire mention
      const newText = messageText.slice(0, messageText.length - userMentionEnd[0].length);
      setMessageText(newText);
      detectMentionTrigger(newText, newText.length);
    } else if (patientMentionEnd) {
      // Delete the entire mention
      const newText = messageText.slice(0, messageText.length - patientMentionEnd[0].length);
      setMessageText(newText);
      detectMentionTrigger(newText, newText.length);
    } else {
      // Regular single character delete
      const newText = messageText.slice(0, -1);
      setMessageText(newText);
      detectMentionTrigger(newText, newText.length);
    }
  }, [messageText, detectMentionTrigger]);

  useEffect(() => {
    setTypingUsers(new Map());
    
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

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
    if (showSlashCommands && filteredSlashCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSlashIndex(prev => 
          prev < filteredSlashCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSlashIndex(prev => 
          prev > 0 ? prev - 1 : filteredSlashCommands.length - 1
        );
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        executeSlashCommand(filteredSlashCommands[selectedSlashIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashCommands(false);
      }
    } else if (showMentionSuggestions && mentionSuggestions.length > 0) {
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

  const formatMessageContent = (content: string, onPatientClick?: (patientId: string) => void, isOwnMessage?: boolean): JSX.Element => {
    const parts: (string | JSX.Element)[] = [];
    let key = 0;
    
    // Combined regex for user mentions, patient mentions, and URLs
    // URL regex matches http://, https://, and www. URLs
    const combinedRegex = /(@\[([^\]]+)\]\(([^)]+)\))|(#\[([^\]]+)\]\(([^)]+)\))|(https?:\/\/[^\s<>\"']+|www\.[^\s<>\"']+)/g;
    let lastIndex = 0;
    let match;
    
    // Helper function to process text parts and convert URLs in plain text
    const processTextPart = (text: string): (string | JSX.Element)[] => {
      const urlRegex = /(https?:\/\/[^\s<>\"']+|www\.[^\s<>\"']+)/g;
      const textParts: (string | JSX.Element)[] = [];
      let textLastIndex = 0;
      let urlMatch;
      
      while ((urlMatch = urlRegex.exec(text)) !== null) {
        if (urlMatch.index > textLastIndex) {
          textParts.push(text.slice(textLastIndex, urlMatch.index));
        }
        
        let url = urlMatch[0];
        // Ensure URL has protocol for www. URLs
        const href = url.startsWith('www.') ? `https://${url}` : url;
        // Truncate display URL if too long
        const displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        
        textParts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline hover:opacity-80 ${
              isOwnMessage 
                ? 'text-primary-foreground' 
                : 'text-blue-600 dark:text-blue-400'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-testid="link-external"
          >
            {displayUrl}
          </a>
        );
        
        textLastIndex = urlMatch.index + urlMatch[0].length;
      }
      
      if (textLastIndex < text.length) {
        textParts.push(text.slice(textLastIndex));
      }
      
      return textParts.length > 0 ? textParts : [text];
    };
    
    while ((match = combinedRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        const textBefore = content.slice(lastIndex, match.index);
        parts.push(...processTextPart(textBefore));
      }
      
      if (match[1]) {
        // User mention @[name](id)
        const userName = match[2];
        parts.push(
          <span 
            key={key++}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              isOwnMessage 
                ? 'bg-primary-foreground/20 text-primary-foreground' 
                : 'bg-primary/10 text-primary'
            }`}
          >
            <UserCircle className="w-3 h-3" />
            {userName}
          </span>
        );
      } else if (match[4]) {
        // Patient mention #[name](id)
        const patientName = match[5];
        const patientId = match[6];
        parts.push(
          <button 
            key={key++}
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPatientClick?.(patientId);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              isOwnMessage
                ? 'bg-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/30'
                : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
            }`}
            data-testid={`mention-patient-pill-${patientId}`}
          >
            <Hash className="w-3 h-3" />
            {patientName}
          </button>
        );
      } else if (match[7]) {
        // URL match
        let url = match[7];
        const href = url.startsWith('www.') ? `https://${url}` : url;
        const displayUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
        
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`underline hover:opacity-80 ${
              isOwnMessage 
                ? 'text-primary-foreground' 
                : 'text-blue-600 dark:text-blue-400'
            }`}
            onClick={(e) => e.stopPropagation()}
            data-testid="link-external"
          >
            {displayUrl}
          </a>
        );
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < content.length) {
      const textAfter = content.slice(lastIndex);
      parts.push(...processTextPart(textAfter));
    }
    
    return <>{parts}</>;
  };

  const getConversationTitle = (convo: Conversation) => {
    if (convo.title) return convo.title;
    if (convo.scopeType === 'self') return t('chat.personalNotes', 'Personal Notes');
    if (convo.scopeType === 'direct') {
      const otherParticipant = convo.participants.find(p => p.userId !== (user as any)?.id);
      if (otherParticipant?.user) {
        return `${otherParticipant.user.firstName || ''} ${otherParticipant.user.lastName || ''}`.trim() || otherParticipant.user.email;
      }
    }
    if (convo.scopeType === 'unit') return t('chat.unitChat', 'Unit Chat');
    if (convo.scopeType === 'hospital') return t('chat.hospitalChat', 'Hospital Chat');
    return t('chat.conversation', 'Conversation');
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
    if (isYesterday(date)) return `${t('chat.yesterday', 'Yesterday')} ${format(date, 'HH:mm')}`;
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
                <h2 className="text-lg font-semibold text-foreground">Chat</h2>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  data-testid="button-close-chat"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="flex border-b border-border">
                <button
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    listTab === 'messages' 
                      ? 'text-primary border-b-2 border-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setListTab('messages')}
                  data-testid="tab-messages"
                >
                  <MessageCircle className="w-4 h-4" />
                  Messages
                </button>
                <button
                  className={`flex-1 py-2.5 px-4 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    listTab === 'todos' 
                      ? 'text-primary border-b-2 border-primary' 
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => setListTab('todos')}
                  data-testid="tab-todos"
                >
                  <CheckSquare className="w-4 h-4" />
                  To-Do
                  {todos.filter(t => t.status !== 'completed').length > 0 && (
                    <span className="bg-primary text-primary-foreground text-xs font-medium px-1.5 py-0.5 rounded-full min-w-[20px]">
                      {todos.filter(t => t.status !== 'completed').length}
                    </span>
                  )}
                </button>
              </div>

              {listTab === 'messages' && (
                <>
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
                        {t('chat.noConversations', 'No conversations yet')}
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

              {listTab === 'todos' && (
                <ScrollArea className="flex-1">
                  <div className="p-3 space-y-4">
                    {/* Add new todo */}
                    <div className="relative">
                      <div className="flex gap-2 items-end">
                        <textarea
                          ref={todoInputRef}
                          placeholder={t('todoList.addPlaceholder')}
                          value={newTodoTitle}
                          onChange={handleTodoInputChange}
                          onKeyDown={handleTodoInputKeyDown}
                          rows={1}
                          className="flex-1 min-h-10 max-h-32 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          data-testid="input-new-todo"
                        />
                        <Button
                          size="icon"
                          onClick={() => {
                            if (newTodoTitle.trim()) {
                              createTodoMutation.mutate(newTodoTitle.trim());
                            }
                          }}
                          disabled={!newTodoTitle.trim() || createTodoMutation.isPending}
                          data-testid="button-add-todo"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      
                      {/* Patient mention suggestions for todo */}
                      {todoMentionActive && todoPatientSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                          {todoPatientSuggestions.map((patient, index) => (
                            <button
                              key={patient.id}
                              type="button"
                              className={`w-full flex items-center gap-2 p-2 text-left hover:bg-muted transition-colors ${
                                index === selectedTodoMentionIndex ? 'bg-muted' : ''
                              }`}
                              onClick={() => insertTodoPatientMention(patient)}
                              data-testid={`todo-mention-patient-${patient.id}`}
                            >
                              <Hash className="w-4 h-4 text-amber-500" />
                              <span className="text-sm truncate">{patient.display}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Edit dialog */}
                    {editingTodo && (
                      <div className="bg-card border border-border rounded-lg p-3 shadow-md relative">
                        <textarea
                          ref={editTodoInputRef}
                          value={editingTodo.title}
                          onChange={(e) => {
                            setEditingTodo({ ...editingTodo, title: e.target.value });
                            detectEditMention(e.target.value, e.target.selectionStart || e.target.value.length);
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                          }}
                          onKeyDown={(e) => {
                            if (editMentionActive && editPatientSuggestions.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setSelectedEditMentionIndex(prev => 
                                  prev < editPatientSuggestions.length - 1 ? prev + 1 : 0
                                );
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setSelectedEditMentionIndex(prev => 
                                  prev > 0 ? prev - 1 : editPatientSuggestions.length - 1
                                );
                              } else if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                insertEditPatientMention(editPatientSuggestions[selectedEditMentionIndex]);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditMentionActive(false);
                              }
                            } else if (e.key === 'Enter' && !e.shiftKey && editingTodo.title.trim()) {
                              e.preventDefault();
                              updateTodoMutation.mutate({
                                id: editingTodo.id,
                                updates: { title: editingTodo.title.trim() }
                              });
                            }
                          }}
                          rows={2}
                          className="w-full mb-2 min-h-10 max-h-32 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          autoFocus
                          data-testid="input-edit-todo"
                        />
                        {/* Patient mention suggestions for edit */}
                        {editMentionActive && editPatientSuggestions.length > 0 && (
                          <div className="absolute left-3 right-3 top-24 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                            {editPatientSuggestions.map((patient, index) => (
                              <button
                                key={patient.id}
                                type="button"
                                className={`w-full flex items-center gap-2 p-2 text-left hover:bg-muted transition-colors ${
                                  index === selectedEditMentionIndex ? 'bg-muted' : ''
                                }`}
                                onClick={() => insertEditPatientMention(patient)}
                                data-testid={`edit-mention-patient-${patient.id}`}
                              >
                                <Hash className="w-4 h-4 text-amber-500" />
                                <span className="text-sm truncate">{patient.display}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingTodo(null);
                              setEditMentionActive(false);
                            }}
                            data-testid="button-cancel-edit"
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (editingTodo.title.trim()) {
                                updateTodoMutation.mutate({
                                  id: editingTodo.id,
                                  updates: { title: editingTodo.title.trim() }
                                });
                              }
                            }}
                            disabled={!editingTodo.title.trim() || updateTodoMutation.isPending}
                            data-testid="button-save-edit"
                          >
                            Save
                          </Button>
                        </div>
                      </div>
                    )}

                    {todosLoading ? (
                      <div className="p-4 text-center text-muted-foreground">Loading...</div>
                    ) : (
                      <>
                        {/* Todo Column */}
                        <div 
                          className={`bg-muted/30 rounded-lg p-3 transition-colors ${draggedTodo ? 'ring-2 ring-dashed ring-primary/30' : ''}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop('todo')}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Circle className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm text-foreground">{t('todoList.toDo')}</span>
                            <span className="bg-muted text-muted-foreground text-xs px-1.5 py-0.5 rounded-full">
                              {todos.filter(t => t.status === 'todo').length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {todos.filter(t => t.status === 'todo').map(todo => (
                              <div
                                key={todo.id}
                                draggable
                                onDragStart={() => handleDragStart(todo.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleTodoDragOver(e, todo.id)}
                                onDragLeave={handleTodoDragLeave}
                                onDrop={(e) => handleTodoDropOn(e, todo.id, 'todo')}
                                className={`bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-all group overflow-hidden ${draggedTodo === todo.id ? 'opacity-50' : ''} ${dragOverTodo === todo.id ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                                data-testid={`todo-item-${todo.id}`}
                              >
                                <div className="flex items-start gap-2 overflow-hidden">
                                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0 mt-0.5" />
                                  <span className="text-sm text-foreground flex-1 break-words overflow-hidden whitespace-pre-wrap">{formatTodoTitle(todo.title)}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border flex-wrap">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'running' } })}
                                    data-testid={`button-start-todo-${todo.id}`}
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    {t('todoList.start')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'completed' } })}
                                    data-testid={`button-complete-todo-${todo.id}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    {t('todoList.done')}
                                  </Button>
                                  <div className="flex-1" />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditingTodo({ id: todo.id, title: todo.title, description: todo.description || undefined })}
                                    data-testid={`button-edit-todo-${todo.id}`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteTodoMutation.mutate(todo.id)}
                                    data-testid={`button-delete-todo-${todo.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {todos.filter(t => t.status === 'todo').length === 0 && (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                {t('todoList.noTasksToDo')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Running Column */}
                        <div 
                          className={`bg-blue-500/5 rounded-lg p-3 transition-colors ${draggedTodo ? 'ring-2 ring-dashed ring-blue-500/30' : ''}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop('running')}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <Play className="w-4 h-4 text-blue-500" />
                            <span className="font-medium text-sm text-foreground">{t('todoList.running')}</span>
                            <span className="bg-blue-500/20 text-blue-500 text-xs px-1.5 py-0.5 rounded-full">
                              {todos.filter(t => t.status === 'running').length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {todos.filter(t => t.status === 'running').map(todo => (
                              <div
                                key={todo.id}
                                draggable
                                onDragStart={() => handleDragStart(todo.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleTodoDragOver(e, todo.id)}
                                onDragLeave={handleTodoDragLeave}
                                onDrop={(e) => handleTodoDropOn(e, todo.id, 'running')}
                                className={`bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-all group overflow-hidden ${draggedTodo === todo.id ? 'opacity-50' : ''} ${dragOverTodo === todo.id ? 'border-primary ring-2 ring-primary/30' : 'border-blue-500/30'}`}
                                data-testid={`todo-item-${todo.id}`}
                              >
                                <div className="flex items-start gap-2 overflow-hidden">
                                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0 mt-0.5" />
                                  <span className="text-sm text-foreground flex-1 break-words overflow-hidden whitespace-pre-wrap">{formatTodoTitle(todo.title)}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border flex-wrap">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'todo' } })}
                                    data-testid={`button-pause-todo-${todo.id}`}
                                  >
                                    <Circle className="w-3 h-3 mr-1" />
                                    Pause
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-green-500 hover:text-green-600 hover:bg-green-500/10"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'completed' } })}
                                    data-testid={`button-complete-todo-${todo.id}`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 mr-1" />
                                    {t('todoList.done')}
                                  </Button>
                                  <div className="flex-1" />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditingTodo({ id: todo.id, title: todo.title, description: todo.description || undefined })}
                                    data-testid={`button-edit-todo-${todo.id}`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteTodoMutation.mutate(todo.id)}
                                    data-testid={`button-delete-todo-${todo.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {todos.filter(t => t.status === 'running').length === 0 && (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                {t('todoList.noTasksInProgress')}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Completed Column */}
                        <div 
                          className={`bg-green-500/5 rounded-lg p-3 transition-colors ${draggedTodo ? 'ring-2 ring-dashed ring-green-500/30' : ''}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDrop('completed')}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                            <span className="font-medium text-sm text-foreground">{t('todoList.completed')}</span>
                            <span className="bg-green-500/20 text-green-500 text-xs px-1.5 py-0.5 rounded-full">
                              {todos.filter(t => t.status === 'completed').length}
                            </span>
                          </div>
                          <div className="space-y-2">
                            {todos.filter(t => t.status === 'completed').map(todo => (
                              <div
                                key={todo.id}
                                draggable
                                onDragStart={() => handleDragStart(todo.id)}
                                onDragEnd={handleDragEnd}
                                onDragOver={(e) => handleTodoDragOver(e, todo.id)}
                                onDragLeave={handleTodoDragLeave}
                                onDrop={(e) => handleTodoDropOn(e, todo.id, 'completed')}
                                className={`bg-card border rounded-lg p-3 shadow-sm hover:shadow-md transition-all group opacity-70 overflow-hidden ${draggedTodo === todo.id ? 'opacity-30' : ''} ${dragOverTodo === todo.id ? 'border-primary ring-2 ring-primary/30' : 'border-green-500/30'}`}
                                data-testid={`todo-item-${todo.id}`}
                              >
                                <div className="flex items-start gap-2 overflow-hidden">
                                  <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab shrink-0 mt-0.5" />
                                  <span className="text-sm text-foreground flex-1 break-words overflow-hidden whitespace-pre-wrap">{formatTodoTitle(todo.title, true)}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border flex-wrap">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'todo' } })}
                                    data-testid={`button-reopen-todo-${todo.id}`}
                                  >
                                    <Circle className="w-3 h-3 mr-1" />
                                    {t('todoList.reopen')}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-blue-500 hover:text-blue-600 hover:bg-blue-500/10"
                                    onClick={() => updateTodoMutation.mutate({ id: todo.id, updates: { status: 'running' } })}
                                    data-testid={`button-restart-todo-${todo.id}`}
                                  >
                                    <Play className="w-3 h-3 mr-1" />
                                    {t('todoList.start')}
                                  </Button>
                                  <div className="flex-1" />
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => setEditingTodo({ id: todo.id, title: todo.title, description: todo.description || undefined })}
                                    data-testid={`button-edit-todo-${todo.id}`}
                                  >
                                    <MessageCircle className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    onClick={() => deleteTodoMutation.mutate(todo.id)}
                                    data-testid={`button-delete-todo-${todo.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {todos.filter(t => t.status === 'completed').length === 0 && (
                              <div className="text-center py-4 text-sm text-muted-foreground">
                                {t('todoList.noCompletedTasks')}
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </ScrollArea>
              )}

              {/* Floating Action Button - WhatsApp style - Only show on messages tab */}
              {listTab === 'messages' && (
                <Button
                  className="absolute bottom-6 right-6 w-14 h-14 rounded-full shadow-lg"
                  onClick={() => {
                    setSelectedContacts([]);
                    setContactSearchQuery("");
                    setView('new');
                  }}
                  data-testid="button-new-conversation-fab"
                >
                  <Plus className="w-6 h-6" />
                </Button>
              )}
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
                    {messages.map((msg) => {
                      const isOwnMessage = msg.senderId === (user as any)?.id;
                      const isMentioningMe = msg.mentions?.some(m => m.mentionedUserId === (user as any)?.id);
                      return (
                        <div
                          key={msg.id}
                          className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div className={`flex items-end gap-2 max-w-[80%] group ${isOwnMessage ? 'flex-row-reverse' : ''}`}>
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
                                    : isMentioningMe 
                                      ? 'bg-primary/20 ring-2 ring-primary/50' 
                                      : 'bg-accent'
                                } ${msg.isDeleted ? 'opacity-50 italic' : ''}`}
                              >
                                {msg.isDeleted ? (
                                  <p className="text-sm whitespace-pre-wrap break-words italic">
                                    This message was deleted
                                  </p>
                                ) : (
                                  <>
                                    {msg.content && msg.content.trim() !== '' && (
                                      <div className="text-sm whitespace-pre-wrap break-words">
                                        {formatMessageContent(msg.content, (patientId) => {
                                          if (onOpenPatientInline) {
                                            onOpenPatientInline(patientId);
                                          } else {
                                            // Fallback: determine route based on active hospital module
                                            let route = '/anesthesia/patients';
                                            if (activeHospital?.unitType === 'clinic' || activeHospital?.unitType === 'business') {
                                              route = '/clinic/patients';
                                            } else if (activeHospital?.unitType === 'or') {
                                              route = '/surgery/patients';
                                            }
                                            window.open(`${route}/${patientId}`, '_blank');
                                          }
                                        }, isOwnMessage)}
                                      </div>
                                    )}
                                    {msg.attachments && msg.attachments.length > 0 && (
                                      <div className={`${msg.content && msg.content.trim() !== '' ? 'mt-2' : ''} space-y-2`}>
                                        {msg.attachments.map((attachment: any) => (
                                          <div key={attachment.id} className="flex items-center gap-2">
                                            {attachment.mimeType?.startsWith('image/') ? (
                                              <a 
                                                href={`/api/chat/attachments/${attachment.id}/download`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="block"
                                              >
                                                <img 
                                                  src={`/api/chat/attachments/${attachment.id}/download`}
                                                  alt={attachment.filename}
                                                  className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                                                />
                                              </a>
                                            ) : (
                                              <a
                                                href={`/api/chat/attachments/${attachment.id}/download`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`flex items-center gap-2 px-3 py-2 rounded-lg ${isOwnMessage ? 'bg-primary-foreground/20' : 'bg-background/50'}`}
                                              >
                                                <Paperclip className="w-4 h-4" />
                                                <span className="text-sm truncate max-w-[150px]">{attachment.filename}</span>
                                              </a>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {(!msg.content || msg.content.trim() === '') && (!msg.attachments || msg.attachments.length === 0) && (
                                      <p className="text-sm text-muted-foreground/50 italic">
                                        (Empty message)
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className={`flex items-center gap-2 mt-1 ${isOwnMessage ? 'justify-end' : ''}`}>
                                <p className="text-xs text-muted-foreground">
                                  {formatMessageTime(msg.createdAt)}
                                  {msg.isEdited && ' (edited)'}
                                </p>
                                {!msg.isDeleted && msg.content && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={() => {
                                      const plainText = msg.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').replace(/#\[([^\]]+)\]\([^)]+\)/g, '#$1');
                                      createTodoMutation.mutate(plainText.slice(0, 200));
                                      toast({ title: t('chat.addedToTodo', 'Added to To-Do'), description: t('chat.messageConvertedToTask', 'Message converted to a task') });
                                    }}
                                    title={t('chat.addToTodoList', 'Add to To-Do list')}
                                    data-testid={`button-add-todo-from-message-${msg.id}`}
                                  >
                                    <ListTodo className="w-3 h-3" />
                                  </Button>
                                )}
                                {isOwnMessage && !msg.isDeleted && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() => setEditingMessage({ id: msg.id, content: msg.content })}
                                      title={t('common.edit')}
                                      data-testid={`button-edit-message-${msg.id}`}
                                    >
                                      <Pencil className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
                                      onClick={() => {
                                        if (confirm(t('chat.confirmDeleteMessage'))) {
                                          deleteMessageMutation.mutate(msg.id);
                                        }
                                      }}
                                      title={t('common.delete')}
                                      data-testid={`button-delete-message-${msg.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  </>
                                )}
                              </div>
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
                    {(() => {
                      const uniqueNames = Array.from(new Set(Array.from(typingUsers.values())));
                      return `${uniqueNames.join(', ')} ${uniqueNames.length === 1 ? 'is' : 'are'} typing...`;
                    })()}
                  </div>
                )}
              </ScrollArea>

              <div className="p-4 border-t border-border">
                {editingMessage && (
                  <div className="mb-3 p-3 bg-accent/50 rounded-lg border border-border">
                    <div className="flex items-center gap-2 mb-2">
                      <Pencil className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{t('chat.editingMessage')}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 ml-auto"
                        onClick={() => setEditingMessage(null)}
                        data-testid="button-cancel-edit-message"
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={editingMessage.content}
                        onChange={(e) => setEditingMessage({ ...editingMessage, content: e.target.value })}
                        placeholder={t('chat.editMessagePlaceholder')}
                        className="flex-1"
                        data-testid="input-edit-message"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (editingMessage.content.trim()) {
                              editMessageMutation.mutate({ messageId: editingMessage.id, content: editingMessage.content.trim() });
                            }
                          } else if (e.key === 'Escape') {
                            setEditingMessage(null);
                          }
                        }}
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (editingMessage.content.trim()) {
                            editMessageMutation.mutate({ messageId: editingMessage.id, content: editingMessage.content.trim() });
                          }
                        }}
                        disabled={!editingMessage.content.trim() || editMessageMutation.isPending}
                        data-testid="button-save-edit-message"
                      >
                        {editMessageMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}
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
                  {showSlashCommands && filteredSlashCommands.length > 0 && (
                    <div 
                      className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10"
                      data-testid="slash-command-suggestions"
                    >
                      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                        Commands
                      </div>
                      {filteredSlashCommands.map((command, index) => {
                        const IconComponent = command.icon;
                        return (
                          <button
                            key={command.id}
                            className={`w-full px-3 py-2 flex items-center gap-2 text-left hover:bg-accent ${
                              index === selectedSlashIndex ? 'bg-accent' : ''
                            }`}
                            onClick={() => executeSlashCommand(command)}
                            data-testid={`slash-command-${command.id}`}
                            disabled={isCapturingScreenshot}
                          >
                            <IconComponent className="w-5 h-5 text-primary" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">/{command.name}</p>
                              <p className="text-xs text-muted-foreground">{command.description}</p>
                            </div>
                            {isCapturingScreenshot && command.id === 'screenshot' && (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
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
                    <div 
                      className="flex-1 relative"
                      onClick={() => inputRef.current?.focus()}
                    >
                      {inputSegments.some(s => s.type === 'mention') ? (
                        <div className="flex flex-wrap items-center gap-1 min-h-10 px-3 py-2 rounded-md border border-input bg-background text-sm">
                          {inputSegments.map((segment, idx) => {
                            if (segment.type === 'mention' && segment.mentionData) {
                              const isUser = segment.mentionData.type === 'user';
                              return (
                                <span
                                  key={idx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                    isUser 
                                      ? 'bg-primary/10 text-primary' 
                                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  }`}
                                >
                                  {isUser ? <UserCircle className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                                  {segment.mentionData.display}
                                </span>
                              );
                            }
                            return <span key={idx} className="whitespace-pre-wrap">{segment.content}</span>;
                          })}
                          <textarea
                            ref={inputRef}
                            className="flex-1 min-w-[100px] bg-transparent outline-none resize-none text-sm"
                            rows={1}
                            value=""
                            onChange={(e) => {
                              const newText = messageText + e.target.value;
                              setMessageText(newText);
                              handleTyping();
                              detectMentionTrigger(newText, newText.length);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Backspace' || e.key === 'Delete') {
                                e.preventDefault();
                                handleSmartBackspace();
                              } else if (e.key === 'Enter' && !e.shiftKey && !showMentionSuggestions && !showSlashCommands) {
                                e.preventDefault();
                                handleSendMessage();
                              } else {
                                handleMessageKeyDown(e as any);
                              }
                            }}
                            data-testid="input-message"
                          />
                        </div>
                      ) : (
                        <textarea
                          ref={inputRef}
                          placeholder="Type @ to mention, # for patient..."
                          value={messageText}
                          rows={1}
                          className="w-full min-h-10 max-h-32 px-3 py-2 rounded-md border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          onChange={(e) => {
                            setMessageText(e.target.value);
                            handleTyping();
                            detectMentionTrigger(e.target.value, e.target.selectionStart || e.target.value.length);
                            // Auto-resize
                            e.target.style.height = 'auto';
                            e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey && !showMentionSuggestions && !showSlashCommands) {
                              e.preventDefault();
                              handleSendMessage();
                            } else {
                              handleMessageKeyDown(e as any);
                            }
                          }}
                          data-testid="input-message"
                        />
                      )}
                    </div>
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
                  onClick={() => {
                    setView('list');
                    setSelectedContacts([]);
                    setContactSearchQuery("");
                  }}
                  data-testid="button-back-from-new"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Button>
                <h2 className="text-lg font-semibold text-foreground">New Chat</h2>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>


              <div className="flex-1 flex flex-col min-h-0 relative">
                {/* Quick Actions */}
                <div className="p-3 space-y-1 border-b border-border shrink-0">
                  <button
                    className="w-full p-2.5 hover:bg-accent/50 rounded-lg text-left flex items-center gap-3"
                    onClick={() => {
                      createConversationMutation.mutate({ scopeType: 'self' });
                    }}
                    data-testid="button-create-self-chat"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium">{t('chat.personalNotes', 'Personal Notes')}</span>
                  </button>

                  <button
                    className="w-full p-2.5 hover:bg-accent/50 rounded-lg text-left flex items-center gap-3"
                    onClick={() => {
                      createConversationMutation.mutate({ 
                        scopeType: 'unit',
                        unitId: activeHospital?.unitId 
                      });
                    }}
                    data-testid="button-create-unit-chat"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="w-5 h-5 text-primary" />
                    </div>
                    <span className="font-medium">Message My Unit</span>
                  </button>

                  {activeHospital?.role === 'admin' && (
                    <button
                      className="w-full p-2.5 hover:bg-accent/50 rounded-lg text-left flex items-center gap-3"
                      onClick={() => {
                        createConversationMutation.mutate({ scopeType: 'hospital' });
                      }}
                      data-testid="button-create-hospital-chat"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <span className="font-medium">Message Entire Clinic</span>
                    </button>
                  )}
                </div>

                {/* Search */}
                <div className="p-3 border-b border-border shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search contacts..."
                      value={contactSearchQuery}
                      onChange={(e) => setContactSearchQuery(e.target.value)}
                      className="pl-9"
                      data-testid="input-search-contacts"
                    />
                  </div>
                </div>

                {/* Contacts List with checkmarks */}
                <div className="text-xs font-medium text-muted-foreground px-4 py-2 bg-muted/30">
                  Contacts
                </div>
                <ScrollArea className="flex-1">
                  {users
                    .filter((u, idx, arr) => u.id !== (user as any)?.id && arr.findIndex(x => x.id === u.id) === idx)
                    .filter((u) => {
                      if (!contactSearchQuery) return true;
                      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
                      const email = (u.email || '').toLowerCase();
                      return fullName.includes(contactSearchQuery.toLowerCase()) || email.includes(contactSearchQuery.toLowerCase());
                    })
                    .sort((a, b) => {
                      const nameA = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase() || (a.email || '').toLowerCase();
                      const nameB = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase() || (b.email || '').toLowerCase();
                      return nameA.localeCompare(nameB);
                    })
                    .map((u) => {
                      const userName = u.firstName || u.lastName 
                        ? `${u.firstName || ''} ${u.lastName || ''}`.trim()
                        : u.email || 'Unknown';
                      const isSelected = selectedContacts.some(c => c.id === u.id);
                      
                      return (
                        <button
                          key={u.id}
                          className={`w-full p-3 text-left flex items-center gap-3 transition-colors ${
                            isSelected 
                              ? 'bg-primary/30 border-l-4 border-l-primary' 
                              : 'hover:bg-accent/50 border-l-4 border-l-transparent'
                          }`}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedContacts(prev => prev.filter(c => c.id !== u.id));
                            } else {
                              setSelectedContacts(prev => [...prev, { id: u.id, name: userName }]);
                            }
                          }}
                          data-testid={`contact-${u.id}`}
                        >
                          <Avatar className={isSelected ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}>
                            <AvatarFallback className={isSelected ? 'bg-primary text-primary-foreground' : ''}>
                              {getInitials(u.firstName, u.lastName, u.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className={`font-medium truncate ${isSelected ? 'text-primary' : ''}`}>{userName}</p>
                            {(u.firstName || u.lastName) && u.email && (
                              <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                </ScrollArea>

                {/* Floating Message Button - WhatsApp style */}
                {selectedContacts.length > 0 && (
                  <div className="absolute bottom-6 right-6">
                    <Button
                      className="h-12 px-6 rounded-full shadow-lg gap-2"
                      onClick={() => {
                        if (selectedContacts.length === 1) {
                          createConversationMutation.mutate({
                            scopeType: 'direct',
                            participantIds: [selectedContacts[0].id]
                          });
                        } else {
                          const groupTitle = selectedContacts.map(c => c.name.split(' ')[0]).join(', ');
                          createConversationMutation.mutate({
                            scopeType: 'direct',
                            participantIds: selectedContacts.map(c => c.id),
                            title: groupTitle
                          });
                        }
                      }}
                      disabled={createConversationMutation.isPending}
                      data-testid="button-start-conversation"
                    >
                      {createConversationMutation.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <>
                          <Send className="w-5 h-5" />
                          Message
                        </>
                      )}
                    </Button>
                  </div>
                )}
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
