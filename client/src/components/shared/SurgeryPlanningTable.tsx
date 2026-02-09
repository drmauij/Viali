import { useState, useMemo, useEffect, Fragment, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Check, 
  X, 
  Clock,
  AlertCircle,
  Package,
  FileText,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronUp,
  Loader2,
  Download,
  FileEdit,
  PauseCircle,
  CircleDashed,
  Stethoscope,
  CheckCircle2,
  XCircle,
  StickyNote,
  Plus
} from "lucide-react";
import { generateDayPlanPdf, defaultColumns, DayPlanPdfColumn, RoomStaffInfo } from "@/lib/dayPlanPdf";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useToast } from "@/hooks/use-toast";
import { ROLE_CONFIG } from "@/components/anesthesia/PlannedStaffBox";
import type { Surgery, Patient, DailyStaffPool } from "@shared/schema";

export type ModuleContext = "anesthesia" | "surgery" | "business" | "marketing";

export type ColumnGroup = 
  | "clinical" 
  | "scheduling" 
  | "business" 
  | "contracts" 
  | "implants"
  | "paidStatus";

interface SurgeryPlanningTableProps {
  moduleContext: ModuleContext;
  visibleColumnGroups?: ColumnGroup[];
  onSurgeryClick?: (surgery: Surgery) => void;
  dateFrom?: Date;
  dateTo?: Date;
  showFilters?: boolean;
}

type SortDirection = "asc" | "desc" | null;
type SortField = keyof Surgery | "patientName" | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  partial: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400",
};

const DEFAULT_COLUMN_GROUPS: Record<ModuleContext, ColumnGroup[]> = {
  anesthesia: ["clinical", "scheduling", "paidStatus", "contracts", "implants"],
  surgery: ["clinical", "scheduling", "paidStatus", "contracts", "implants"],
  business: ["clinical", "scheduling", "business"],
  marketing: ["clinical", "business"],
};

function formatDate(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "dd.MM.yyyy");
  } catch {
    return "-";
  }
}

function formatDateTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "dd.MM.yyyy HH:mm");
  } catch {
    return "-";
  }
}

function formatTime(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
    return format(date, "HH:mm");
  } catch {
    return "-";
  }
}

function formatCurrency(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "-";
  return new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(num);
}

interface EditableDateCellProps {
  value: string | Date | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: string | null) => void;
  isPending: boolean;
}

interface EditableCurrencyCellProps {
  value: string | number | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: string | null) => void;
  isPending: boolean;
}

interface SurgeryNoteWithAuthor {
  id: string;
  surgeryId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  author: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
}

interface MentionableUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface AdminNoteCellProps {
  surgeryId: string;
}

// Shared utilities for notes
const renderNoteContent = (content: string) => {
  const parts: Array<{ type: 'text' | 'mention'; content: string; display?: string }> = [];
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;
  
  while ((match = mentionRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'mention', content: match[2], display: match[1] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: 'text', content: content.slice(lastIndex) });
  }

  return parts.map((part, i) => 
    part.type === 'mention' 
      ? <span key={i} className="bg-primary/20 text-primary rounded px-1">@{part.display}</span>
      : <span key={i}>{part.content}</span>
  );
};

const formatNoteAuthor = (author: SurgeryNoteWithAuthor['author']) => {
  if (author.firstName || author.lastName) {
    return `${author.firstName || ''} ${author.lastName || ''}`.trim();
  }
  return author.email || 'Unknown';
};

const formatNoteDate = (dateStr: string) => {
  try {
    return format(parseISO(dateStr), 'dd.MM.yyyy HH:mm');
  } catch {
    return dateStr;
  }
};

// Inline Case Notes component for expanded row detail
function InlineCaseNotes({ surgeryId }: { surgeryId: string }) {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notes = [], isLoading } = useQuery<SurgeryNoteWithAuthor[]>({
    queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries/${surgeryId}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
  });

  const { data: mentionableUsers = [] } = useQuery<MentionableUser[]>({
    queryKey: ['/api/anesthesia/hospitals', activeHospital?.id, 'users'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/hospitals/${activeHospital?.id}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: !!activeHospital?.id,
  });

  const mentionSuggestions = useMemo(() => {
    if (!showMentionSuggestions) return [];
    const searchLower = mentionSearch.toLowerCase();
    return mentionableUsers
      .filter(user => {
        const name = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower);
      })
      .slice(0, 5)
      .map(user => ({
        id: user.id,
        display: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.email || user.id,
      }));
  }, [showMentionSuggestions, mentionSearch, mentionableUsers]);

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest('POST', `/api/anesthesia/surgeries/${surgeryId}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      setNewNoteContent("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/surgery-notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
    },
  });

  const handleAddNote = () => {
    if (newNoteContent.trim()) {
      createNoteMutation.mutate(newNoteContent.trim());
    }
  };

  const handleNoteInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewNoteContent(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentionSuggestions(true);
      setMentionSearch(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionSuggestions(false);
      setMentionSearch("");
      setMentionStartIndex(-1);
    }
  };

  const insertMention = (suggestion: { id: string; display: string }) => {
    const mentionText = `@[${suggestion.display}](${suggestion.id}) `;
    const newText = newNoteContent.slice(0, mentionStartIndex) + mentionText + newNoteContent.slice(textareaRef.current?.selectionStart || newNoteContent.length);
    setNewNoteContent(newText);
    setShowMentionSuggestions(false);
    setMentionSearch("");
    setMentionStartIndex(-1);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev < mentionSuggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev > 0 ? prev - 1 : mentionSuggestions.length - 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionSuggestions(false);
      }
    } else if (e.key === 'Enter' && !e.shiftKey && newNoteContent.trim()) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const PREVIEW_COUNT = 3;
  const displayedNotes = showAllNotes ? notes : notes.slice(0, PREVIEW_COUNT);
  const hasMoreNotes = notes.length > PREVIEW_COUNT;

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t("common.loading", "Loading...")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {t("surgeryPlanning.noNotesYet", "No notes yet")}
        </p>
      ) : (
        <div className="space-y-2">
          {displayedNotes.map((note) => (
            <div key={note.id} className="border rounded-md p-2 bg-background text-sm group">
              <div className="flex items-start justify-between gap-2">
                <p className="flex-1 whitespace-pre-wrap break-words">{renderNoteContent(note.content)}</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  onClick={() => deleteNoteMutation.mutate(note.id)}
                  disabled={deleteNoteMutation.isPending}
                  data-testid={`button-delete-inline-note-${note.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {formatNoteAuthor(note.author)} · {formatNoteDate(note.createdAt)}
              </div>
            </div>
          ))}
          
          {hasMoreNotes && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-auto py-1 px-2"
              onClick={() => setShowAllNotes(!showAllNotes)}
              data-testid={`button-toggle-notes-${surgeryId}`}
            >
              {showAllNotes 
                ? t("surgeryPlanning.showLessNotes", "Show less") 
                : t("surgeryPlanning.showAllNotes", "Show all {{count}} notes", { count: notes.length })}
              {showAllNotes ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
            </Button>
          )}
        </div>
      )}
      
      {/* Quick add input */}
      <div className="relative">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={newNoteContent}
              onChange={handleNoteInputChange}
              onKeyDown={handleKeyDown}
              placeholder={t("surgeryPlanning.quickAddNote", "Add note... (@ to mention, Enter to save)")}
              rows={1}
              className="resize-none text-sm min-h-[36px] py-2"
              data-testid={`textarea-inline-note-${surgeryId}`}
            />
            {showMentionSuggestions && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 mb-1 w-full bg-popover border rounded-md shadow-lg z-50 max-h-[150px] overflow-y-auto">
                {mentionSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    className={cn(
                      "w-full px-3 py-2 text-left text-sm hover:bg-muted cursor-pointer",
                      index === selectedMentionIndex && "bg-muted"
                    )}
                    onClick={() => insertMention(suggestion)}
                  >
                    {suggestion.display}
                  </button>
                ))}
              </div>
            )}
          </div>
          <Button 
            size="sm"
            onClick={handleAddNote} 
            disabled={!newNoteContent.trim() || createNoteMutation.isPending}
            className="shrink-0"
            data-testid={`button-inline-add-note-${surgeryId}`}
          >
            {createNoteMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Column icon cell - just shows icon with badge, opens dialog for management
function AdminNoteCell({ surgeryId }: AdminNoteCellProps) {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newNoteContent, setNewNoteContent] = useState("");
  const [showMentionSuggestions, setShowMentionSuggestions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: notes = [], isLoading } = useQuery<SurgeryNoteWithAuthor[]>({
    queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries/${surgeryId}/notes`);
      if (!response.ok) throw new Error('Failed to fetch notes');
      return response.json();
    },
    enabled: dialogOpen,
  });

  const { data: mentionableUsers = [] } = useQuery<MentionableUser[]>({
    queryKey: ['/api/anesthesia/hospitals', activeHospital?.id, 'users'],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/hospitals/${activeHospital?.id}/users`);
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: !!activeHospital?.id && dialogOpen,
  });

  const mentionSuggestions = useMemo(() => {
    if (!showMentionSuggestions) return [];
    const searchLower = mentionSearch.toLowerCase();
    return mentionableUsers
      .filter(user => {
        const name = `${user.firstName || ''} ${user.lastName || ''}`.toLowerCase();
        const email = (user.email || '').toLowerCase();
        return name.includes(searchLower) || email.includes(searchLower);
      })
      .slice(0, 5)
      .map(user => ({
        id: user.id,
        display: user.firstName && user.lastName 
          ? `${user.firstName} ${user.lastName}` 
          : user.email || user.id,
      }));
  }, [showMentionSuggestions, mentionSearch, mentionableUsers]);

  const createNoteMutation = useMutation({
    mutationFn: async (content: string) => {
      return apiRequest('POST', `/api/anesthesia/surgeries/${surgeryId}/notes`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
      setNewNoteContent("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/surgery-notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/surgeries', surgeryId, 'notes'] });
    },
  });

  const handleAddNote = () => {
    if (newNoteContent.trim()) {
      createNoteMutation.mutate(newNoteContent.trim());
    }
  };

  const handleNoteInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setNewNoteContent(value);

    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      setShowMentionSuggestions(true);
      setMentionSearch(atMatch[1]);
      setMentionStartIndex(cursorPos - atMatch[0].length);
      setSelectedMentionIndex(0);
    } else {
      setShowMentionSuggestions(false);
      setMentionSearch("");
      setMentionStartIndex(-1);
    }
  };

  const insertMention = (suggestion: { id: string; display: string }) => {
    const mentionText = `@[${suggestion.display}](${suggestion.id}) `;
    const newText = newNoteContent.slice(0, mentionStartIndex) + mentionText + newNoteContent.slice(textareaRef.current?.selectionStart || newNoteContent.length);
    setNewNoteContent(newText);
    setShowMentionSuggestions(false);
    setMentionSearch("");
    setMentionStartIndex(-1);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMentionSuggestions && mentionSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev < mentionSuggestions.length - 1 ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedMentionIndex(prev => (prev > 0 ? prev - 1 : mentionSuggestions.length - 1));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(mentionSuggestions[selectedMentionIndex]);
      } else if (e.key === 'Escape') {
        setShowMentionSuggestions(false);
      }
    }
  };

  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [noteCount, setNoteCount] = useState(0);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  useEffect(() => {
    if (notes.length > 0 || dialogOpen) {
      setNoteCount(notes.length);
      setPreviewLoaded(true);
    }
  }, [notes, dialogOpen]);

  const hasNotes = previewLoaded ? noteCount > 0 : false;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 relative"
              onClick={handleOpen}
              data-testid={`button-admin-note-${surgeryId}`}
            >
              <StickyNote className={cn("h-4 w-4", hasNotes ? "text-primary" : "text-muted-foreground")} />
              {hasNotes && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-medium rounded-full h-4 w-4 flex items-center justify-center">
                  {noteCount > 9 ? '9+' : noteCount}
                </span>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-[300px]">
            <p className="text-muted-foreground">
              {hasNotes 
                ? t("surgeryPlanning.hasNotes", "{{count}} note(s) - click to view", { count: noteCount })
                : t("surgeryPlanning.noCaseNotes", "No notes - click to add")}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("surgeryPlanning.caseNotesTitle", "Case Notes")}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px] max-h-[300px] pr-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : notes.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t("surgeryPlanning.noNotesYet", "No notes yet. Add your first note below.")}
              </div>
            ) : (
              notes.map((note) => (
                <div key={note.id} className="border rounded-md p-3 bg-muted/30">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm whitespace-pre-wrap">{renderNoteContent(note.content)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteNoteMutation.mutate(note.id)}
                      disabled={deleteNoteMutation.isPending}
                      data-testid={`button-delete-note-${note.id}`}
                    >
                      {deleteNoteMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                    <span className="font-medium">{formatNoteAuthor(note.author)}</span>
                    <span>·</span>
                    <span>{formatNoteDate(note.createdAt)}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t pt-4 space-y-2 relative">
            <div className="relative">
              <Textarea
                ref={textareaRef}
                value={newNoteContent}
                onChange={handleNoteInputChange}
                onKeyDown={handleKeyDown}
                placeholder={t("surgeryPlanning.caseNotesPlaceholder", "Add a new note... Use @ to mention team members")}
                rows={2}
                className="resize-none"
                data-testid={`textarea-new-note-${surgeryId}`}
              />
              {showMentionSuggestions && mentionSuggestions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-full bg-popover border rounded-md shadow-lg z-50 max-h-[200px] overflow-y-auto">
                  {mentionSuggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      className={cn(
                        "w-full px-3 py-2 text-left text-sm hover:bg-muted cursor-pointer flex items-center gap-2",
                        index === selectedMentionIndex && "bg-muted"
                      )}
                      onClick={() => insertMention(suggestion)}
                      data-testid={`mention-suggestion-${suggestion.id}`}
                    >
                      <span className="font-medium">{suggestion.display}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                {t("common.close", "Close")}
              </Button>
              <Button 
                onClick={handleAddNote} 
                disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                data-testid={`button-add-note-${surgeryId}`}
              >
                {createNoteMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                {t("surgeryPlanning.addNote", "Add Note")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditableCurrencyCell({ value, surgeryId, field, onUpdate, isPending }: EditableCurrencyCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleStartEdit = () => {
    const num = value !== null && value !== undefined 
      ? (typeof value === "string" ? parseFloat(value) : value)
      : null;
    setInputValue(num !== null && !isNaN(num) ? num.toString() : "");
    setIsEditing(true);
  };

  const handleSave = () => {
    const num = parseFloat(inputValue);
    onUpdate(surgeryId, field, inputValue && !isNaN(num) ? inputValue : null);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <Input
        type="number"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-24"
        autoFocus
        data-testid={`input-${field}-${surgeryId}`}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 justify-start font-medium w-full"
      disabled={isPending}
      onClick={handleStartEdit}
      data-testid={`button-edit-${field}-${surgeryId}`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        formatCurrency(value)
      )}
    </Button>
  );
}

function EditableDateCell({ value, surgeryId, field, onUpdate, isPending }: EditableDateCellProps) {
  const [open, setOpen] = useState(false);
  const currentDate = value ? (typeof value === "string" ? parseISO(value) : value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2 justify-start font-normal w-full"
          disabled={isPending}
          data-testid={`button-edit-${field}-${surgeryId}`}
        >
          {isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            formatDate(value)
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarComponent
          mode="single"
          selected={currentDate}
          onSelect={(date) => {
            onUpdate(surgeryId, field, date ? format(date, "yyyy-MM-dd") : null);
            setOpen(false);
          }}
          initialFocus
        />
        {currentDate && (
          <div className="p-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive"
              onClick={() => {
                onUpdate(surgeryId, field, null);
                setOpen(false);
              }}
            >
              Clear Date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

interface EditableCheckboxCellProps {
  value: boolean | null | undefined;
  surgeryId: string;
  field: string;
  onUpdate: (id: string, field: string, value: boolean) => void;
  isPending: boolean;
}

function EditableCheckboxCell({ value, surgeryId, field, onUpdate, isPending }: EditableCheckboxCellProps) {
  return (
    <div className="flex justify-center">
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Checkbox
          checked={value ?? false}
          onCheckedChange={(checked) => onUpdate(surgeryId, field, checked === true)}
          data-testid={`checkbox-${field}-${surgeryId}`}
        />
      )}
    </div>
  );
}

interface EditableTimeCellProps {
  value: string | Date | null | undefined;
  surgeryId: string;
  plannedDate: string | Date | null | undefined;
  field: string;
  onUpdate: (id: string, field: string, value: string | null) => void;
  isPending: boolean;
}

function EditableTimeCell({ value, surgeryId, plannedDate, field, onUpdate, isPending }: EditableTimeCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const canEdit = !!plannedDate;

  const handleStartEdit = () => {
    if (!canEdit) return;
    if (value) {
      const date = typeof value === "string" ? parseISO(value) : value;
      setInputValue(format(date, "HH:mm"));
    } else {
      setInputValue("");
    }
    setIsEditing(true);
  };

  const handleSave = () => {
    if (inputValue && plannedDate) {
      const baseDate = typeof plannedDate === "string" ? parseISO(plannedDate) : plannedDate;
      const [hours, minutes] = inputValue.split(':').map(Number);
      const newDate = new Date(baseDate);
      newDate.setHours(hours, minutes, 0, 0);
      onUpdate(surgeryId, field, newDate.toISOString());
    } else if (!inputValue) {
      onUpdate(surgeryId, field, null);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setIsEditing(false);
    }
  };

  if (isEditing && canEdit) {
    return (
      <Input
        type="time"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="h-8 w-24"
        autoFocus
        data-testid={`input-${field}-${surgeryId}`}
      />
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 justify-start font-normal w-full"
      disabled={isPending || !canEdit}
      onClick={handleStartEdit}
      title={!canEdit ? "Set surgery date first" : undefined}
      data-testid={`button-edit-${field}-${surgeryId}`}
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        formatTime(value)
      )}
    </Button>
  );
}

interface SortableHeaderProps {
  label: string;
  field: SortField;
  sortState: SortState;
  onSort: (field: SortField) => void;
}

function SortableHeader({ label, field, sortState, onSort }: SortableHeaderProps) {
  const isActive = sortState.field === field;
  
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => onSort(field)}
    >
      {label}
      {isActive ? (
        sortState.direction === "asc" ? (
          <ArrowUp className="ml-2 h-4 w-4" />
        ) : (
          <ArrowDown className="ml-2 h-4 w-4" />
        )
      ) : (
        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50" />
      )}
    </Button>
  );
}

export function SurgeryPlanningTable({
  moduleContext,
  visibleColumnGroups,
  onSurgeryClick,
  dateFrom,
  dateTo,
  showFilters = true,
}: SurgeryPlanningTableProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const activeHospital = useActiveHospital();
  
  const [sortState, setSortState] = useState<SortState>({ field: "plannedDate", direction: "asc" });
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [pendingUpdates, setPendingUpdates] = useState<Set<string>>(new Set());
  const [isCompactView, setIsCompactView] = useState(true); // Default to compact view
  
  const columnGroups = visibleColumnGroups ?? DEFAULT_COLUMN_GROUPS[moduleContext];
  
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (activeHospital?.id) params.set("hospitalId", activeHospital.id);
    if (dateFrom) params.set("dateFrom", dateFrom.toISOString());
    if (dateTo) params.set("dateTo", dateTo.toISOString());
    return params.toString();
  }, [activeHospital?.id, dateFrom, dateTo]);
  
  const { data: surgeries = [], isLoading: surgeriesLoading } = useQuery<Surgery[]>({
    queryKey: ["/api/anesthesia/surgeries", queryParams],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/surgeries?${queryParams}`);
      if (!response.ok) throw new Error('Failed to fetch surgeries');
      return response.json();
    },
    enabled: !!activeHospital?.id,
  });
  
  const { data: patients = [] } = useQuery<Patient[]>({
    queryKey: [`/api/patients?hospitalId=${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
  
  const { data: surgeryRooms = [] } = useQuery<any[]>({
    queryKey: [`/api/surgery-rooms/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });
  
  const patientMap = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach((p) => map.set(p.id, p));
    return map;
  }, [patients]);
  
  const roomMap = useMemo(() => {
    const map = new Map<string, string>();
    surgeryRooms.forEach((r: any) => map.set(r.id, r.name));
    return map;
  }, [surgeryRooms]);
  
  // Get unique dates from surgeries for staff pool fetching
  const uniqueDates = useMemo(() => {
    const dates = new Set<string>();
    surgeries.forEach((surgery) => {
      const dateKey = new Date(surgery.plannedDate).toLocaleDateString('en-CA');
      dates.add(dateKey);
    });
    return Array.from(dates);
  }, [surgeries]);
  
  // Fetch staff pool for all dates
  const { data: staffPoolByDate = {} } = useQuery<Record<string, DailyStaffPool[]>>({
    queryKey: ["/api/staff-pool-multi", activeHospital?.id, uniqueDates],
    queryFn: async () => {
      if (!activeHospital?.id || uniqueDates.length === 0) return {};
      
      const results: Record<string, DailyStaffPool[]> = {};
      await Promise.all(
        uniqueDates.map(async (date) => {
          try {
            const response = await fetch(`/api/staff-pool/${activeHospital.id}/${date}`);
            if (response.ok) {
              results[date] = await response.json();
            }
          } catch {
            // Ignore errors for individual dates
          }
        })
      );
      return results;
    },
    enabled: !!activeHospital?.id && uniqueDates.length > 0,
  });
  
  // Fetch room staff assignments for all dates (for PDF generation)
  const { data: roomStaffByDateAndRoom = {} } = useQuery<Record<string, Record<string, any[]>>>({
    queryKey: ["/api/room-staff-multi", activeHospital?.id, uniqueDates],
    queryFn: async () => {
      if (!activeHospital?.id || uniqueDates.length === 0) return {};
      
      const results: Record<string, Record<string, any[]>> = {};
      await Promise.all(
        uniqueDates.map(async (date) => {
          try {
            const response = await fetch(`/api/room-staff/all/${activeHospital.id}/${date}`);
            if (response.ok) {
              const data = await response.json();
              // Group by surgeryRoomId (API returns surgeryRoomId, not roomId)
              const byRoom: Record<string, any[]> = {};
              data.forEach((staff: any) => {
                const roomId = staff.surgeryRoomId;
                if (!byRoom[roomId]) byRoom[roomId] = [];
                byRoom[roomId].push(staff);
              });
              results[date] = byRoom;
            }
          } catch {
            // Ignore errors for individual dates
          }
        })
      );
      return results;
    },
    enabled: !!activeHospital?.id && uniqueDates.length > 0,
  });
  
  // Fetch pre-op assessments for surgeries (only for anesthesia/surgery modules)
  const surgeryIds = useMemo(() => surgeries.map((s) => s.id), [surgeries]);
  const showPreOpColumn = moduleContext === "anesthesia" || moduleContext === "surgery";
  
  const { data: preOpAssessments = [] } = useQuery<any[]>({
    queryKey: ["/api/anesthesia/preop-assessments/bulk", surgeryIds],
    queryFn: async () => {
      if (surgeryIds.length === 0) return [];
      const response = await fetch(`/api/anesthesia/preop-assessments/bulk?surgeryIds=${surgeryIds.join(",")}`);
      if (!response.ok) return [];
      return response.json();
    },
    enabled: surgeryIds.length > 0 && showPreOpColumn,
  });
  
  // Map pre-op assessments by surgery ID
  const preOpMap = useMemo(() => {
    const map = new Map<string, any>();
    preOpAssessments.forEach((item) => {
      // The API returns assessment records directly with surgeryId field
      if (item.surgeryId) {
        map.set(item.surgeryId, { assessment: item, status: item.status });
      }
    });
    return map;
  }, [preOpAssessments]);
  
  // Helper function to get pre-op summary for expanded row
  const getPreOpSummary = (assessment: any, surgery: any): string | null => {
    if (!assessment) return null;
    
    const parts: string[] = [];
    
    if (assessment.asa != null && assessment.asa !== '') {
      parts.push(`ASA ${assessment.asa}`);
    }
    if (assessment.weight != null && assessment.weight !== '' && assessment.weight !== 0) {
      parts.push(`${assessment.weight}kg`);
    }
    if (assessment.height != null && assessment.height !== '' && assessment.height !== 0) {
      parts.push(`${assessment.height}cm`);
    }
    if (assessment.heartRate != null && assessment.heartRate !== '' && assessment.heartRate !== 0) {
      parts.push(`HR ${assessment.heartRate}`);
    }
    if (assessment.bloodPressureSystolic != null && assessment.bloodPressureDiastolic != null && 
        assessment.bloodPressureSystolic !== 0 && assessment.bloodPressureDiastolic !== 0) {
      parts.push(`BP ${assessment.bloodPressureSystolic}/${assessment.bloodPressureDiastolic}`);
    }
    if (assessment.cave != null && assessment.cave !== '') {
      parts.push(`CAVE: ${assessment.cave}`);
    }
    
    if (assessment.anesthesiaTechniques) {
      const techniques: string[] = [];
      const at = assessment.anesthesiaTechniques;
      
      if (at.general) {
        const generalSubs = at.generalOptions ? Object.entries(at.generalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.toUpperCase())
          : [];
        techniques.push(generalSubs.length > 0 ? `General (${generalSubs.join(', ')})` : 'General');
      }
      if (at.spinal) techniques.push('Spinal');
      if (at.epidural) {
        const epiduralSubs = at.epiduralOptions ? Object.entries(at.epiduralOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
          : [];
        techniques.push(epiduralSubs.length > 0 ? `Epidural (${epiduralSubs.join(', ')})` : 'Epidural');
      }
      if (at.regional) {
        const regionalSubs = at.regionalOptions ? Object.entries(at.regionalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
          : [];
        techniques.push(regionalSubs.length > 0 ? `Regional (${regionalSubs.join(', ')})` : 'Regional');
      }
      if (at.sedation) techniques.push('Sedation');
      if (at.combined) techniques.push('Combined');
      
      if (techniques.length > 0) {
        parts.push(techniques.join(', '));
      }
    }
    
    if (assessment.installations && Object.keys(assessment.installations).length > 0) {
      const installations = Object.entries(assessment.installations)
        .filter(([_, value]) => value)
        .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
        .join(', ');
      if (installations) {
        parts.push(installations);
      }
    }
    
    if (assessment.postOpICU) {
      parts.push(t('anesthesia.preop.postOpICUPlanned'));
    }
    
    if (assessment.specialNotes != null && assessment.specialNotes !== '') {
      parts.push(assessment.specialNotes);
    }
    
    if (assessment.anesthesiaOther != null && assessment.anesthesiaOther !== '') {
      parts.push(assessment.anesthesiaOther);
    }
    
    // Add patient allergies from surgery data
    const allergies: string[] = [];
    if (surgery?.patientAllergies && Array.isArray(surgery.patientAllergies) && surgery.patientAllergies.length > 0) {
      allergies.push(...surgery.patientAllergies);
    }
    if (surgery?.patientOtherAllergies) {
      allergies.push(surgery.patientOtherAllergies);
    }
    if (allergies.length > 0) {
      parts.push(`${t('anesthesia.preop.allergies')}: ${allergies.join(', ')}`);
    }
    
    return parts.length > 0 ? parts.join(' • ') : null;
  };
  
  // Helper function to render pre-op status icon with tooltip
  const renderPreOpStatusIcon = (surgeryId: string) => {
    const preOpData = preOpMap.get(surgeryId);
    
    // No assessment exists - planned (grey)
    if (!preOpData || !preOpData.assessment) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <CircleDashed className="h-5 w-5 text-gray-400 mx-auto" />
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("surgeryPlanning.preOp.statusPlanned")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    const assessment = preOpData.assessment;
    const status = preOpData.status;
    
    // Stand-by (orange pause)
    if (assessment.standBy) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <PauseCircle className="h-5 w-5 text-orange-500 mx-auto" />
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("surgeryPlanning.preOp.statusStandby")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    // Completed - check approval status
    if (status === 'completed') {
      const isApproved = assessment.surgicalApproval === 'approved';
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {isApproved ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 mx-auto" />
              )}
            </TooltipTrigger>
            <TooltipContent>
              <p>{isApproved ? t("surgeryPlanning.preOp.statusApproved") : t("surgeryPlanning.preOp.statusRejected")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }
    
    // Draft / In progress (blue file edit)
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <FileEdit className="h-5 w-5 text-blue-500 mx-auto" />
          </TooltipTrigger>
          <TooltipContent>
            <p>{t("surgeryPlanning.preOp.statusInProgress")}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  // Render staff pills for a given date
  const renderStaffPills = (dateKey: string) => {
    const staff = staffPoolByDate[dateKey];
    if (!staff || staff.length === 0) return null;
    
    return (
      <div className="flex flex-wrap gap-1">
        {staff.map((s) => {
          const config = ROLE_CONFIG[s.role as keyof typeof ROLE_CONFIG];
          const Icon = config?.icon;
          const shortName = s.name.split(' ')[0] || s.name;
          
          return (
            <span
              key={s.id}
              className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full ${config?.bgClass || 'bg-gray-100 dark:bg-gray-800'} ${config?.colorClass || ''}`}
              title={s.name}
            >
              {Icon && <Icon className="h-2.5 w-2.5" />}
              <span className="max-w-[60px] truncate">{shortName}</span>
            </span>
          );
        })}
      </div>
    );
  };
  
  // Helper function to format pre-op summary for PDF
  const formatPreOpSummaryForPdf = (surgeryId: string): string => {
    const preOpData = preOpMap.get(surgeryId);
    if (!preOpData || !preOpData.assessment) return '-';
    
    const assessment = preOpData.assessment;
    const parts: string[] = [];
    
    // ASA classification
    if (assessment.asa != null && assessment.asa !== '') {
      parts.push(`ASA ${assessment.asa}`);
    }
    
    // Weight and height
    if (assessment.weight != null && assessment.weight !== '' && assessment.weight !== 0) {
      parts.push(`${assessment.weight}kg`);
    }
    if (assessment.height != null && assessment.height !== '' && assessment.height !== 0) {
      parts.push(`${assessment.height}cm`);
    }
    
    // Anesthesia techniques
    if (assessment.anesthesiaTechniques) {
      const techniques: string[] = [];
      const at = assessment.anesthesiaTechniques;
      
      if (at.general) {
        const generalSubs = at.generalOptions ? Object.entries(at.generalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.toUpperCase())
          : [];
        techniques.push(generalSubs.length > 0 ? `ITN (${generalSubs.join(', ')})` : 'ITN');
      }
      if (at.spinal) techniques.push('SPA');
      if (at.epidural) techniques.push('PDA');
      if (at.regional) {
        const regionalSubs = at.regionalOptions ? Object.entries(at.regionalOptions)
          .filter(([_, value]) => value)
          .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim())
          : [];
        techniques.push(regionalSubs.length > 0 ? `Regional (${regionalSubs.join(', ')})` : 'Regional');
      }
      if (at.sedation) techniques.push('Sedierung');
      if (at.combined) techniques.push('Kombiniert');
      
      if (techniques.length > 0) {
        parts.push(techniques.join(', '));
      }
    }
    
    // Installations (airway management)
    if (assessment.installations && Object.keys(assessment.installations).length > 0) {
      const installations = Object.entries(assessment.installations)
        .filter(([_, value]) => value)
        .map(([key]) => {
          if (key === 'ett') return 'ETT';
          if (key === 'lma') return 'LMA';
          if (key === 'mask') return 'Maske';
          return key.replace(/([A-Z])/g, ' $1').trim();
        })
        .join(', ');
      if (installations) {
        parts.push(installations);
      }
    }
    
    // Post-op ICU
    if (assessment.postOpICU) {
      parts.push('IMC geplant');
    }
    
    // CAVE (important warnings)
    if (assessment.cave != null && assessment.cave !== '') {
      parts.push(`CAVE: ${assessment.cave}`);
    }
    
    // Use newlines for PDF to avoid messy wrapping with bullet separators
    return parts.length > 0 ? parts.join('\n') : '-';
  };
  
  // Generate PDF for a day's surgeries using shared utility
  const generateDayPdf = (dateKey: string, daySurgeries: Surgery[]) => {
    const displayDate = new Date(dateKey + 'T12:00:00').toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
    
    // Build roomStaffByRoom Map for PDF from fetched data
    const roomStaffForDate = roomStaffByDateAndRoom[dateKey] || {};
    const roomStaffByRoom = new Map<string, RoomStaffInfo>();
    
    Object.entries(roomStaffForDate).forEach(([roomId, staffList]) => {
      const staffByRole = new Map<string, string[]>();
      (staffList as any[]).forEach((s) => {
        const names = staffByRole.get(s.role) || [];
        const isExternal = s.staffType === 'external';
        const displayName = isExternal ? `${s.name} (Extern)` : s.name;
        names.push(displayName);
        staffByRole.set(s.role, names);
      });
      roomStaffByRoom.set(roomId, { roomId, staffByRole });
    });
    
    const columns: DayPlanPdfColumn[] = [
      defaultColumns.datum(displayDate),
      defaultColumns.patient(),
      defaultColumns.eingriff(),
      defaultColumns.note(),
      { ...defaultColumns.preOp(formatPreOpSummaryForPdf), width: 50 },
    ];

    generateDayPlanPdf({
      date: new Date(dateKey + 'T12:00:00'),
      hospitalName: activeHospital?.name || '',
      surgeries: daySurgeries,
      patientMap,
      roomMap,
      columns,
      roomStaffByRoom,
    });
  };
  
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Surgery> }) => {
      return await apiRequest("PATCH", `/api/anesthesia/surgeries/${id}`, updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anesthesia/surgeries"] });
    },
    onError: (error) => {
      toast({
        title: t("common.error"),
        description: String(error),
        variant: "destructive",
      });
    },
  });
  
  const handleUpdate = async (surgeryId: string, field: string, value: any) => {
    const updateKey = `${surgeryId}-${field}`;
    setPendingUpdates((prev) => new Set(prev).add(updateKey));
    
    try {
      await updateMutation.mutateAsync({ id: surgeryId, updates: { [field]: value } });
      toast({
        title: t("common.saved"),
        description: t("surgeryPlanning.updateSuccess"),
      });
    } finally {
      setPendingUpdates((prev) => {
        const next = new Set(prev);
        next.delete(updateKey);
        return next;
      });
    }
  };
  
  const isFieldPending = (surgeryId: string, field: string) => {
    return pendingUpdates.has(`${surgeryId}-${field}`);
  };
  
  const handleSort = (field: SortField) => {
    setSortState((prev) => ({
      field,
      direction:
        prev.field === field
          ? prev.direction === "asc"
            ? "desc"
            : prev.direction === "desc"
            ? null
            : "asc"
          : "asc",
    }));
  };
  
  const sortedSurgeries = useMemo(() => {
    if (!sortState.field || !sortState.direction) return surgeries;
    
    return [...surgeries].sort((a, b) => {
      let aVal: any;
      let bVal: any;
      
      if (sortState.field === "patientName") {
        const patientA = patientMap.get(a.patientId);
        const patientB = patientMap.get(b.patientId);
        aVal = patientA ? `${patientA.surname}, ${patientA.firstName}` : "";
        bVal = patientB ? `${patientB.surname}, ${patientB.firstName}` : "";
      } else {
        aVal = a[sortState.field as keyof Surgery];
        bVal = b[sortState.field as keyof Surgery];
      }
      
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortState.direction === "asc"
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      
      if (aVal < bVal) return sortState.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortState.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [surgeries, sortState, patientMap]);
  
  // Group surgeries by day
  const groupedByDay = useMemo(() => {
    const groups = new Map<string, Surgery[]>();
    sortedSurgeries.forEach((surgery) => {
      const dateKey = new Date(surgery.plannedDate).toLocaleDateString('en-CA'); // YYYY-MM-DD format for sorting
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(surgery);
    });
    // Sort groups by date (respecting current sort direction)
    return Array.from(groups.entries()).sort((a, b) => 
      sortState.direction === 'asc' ? a[0].localeCompare(b[0]) : b[0].localeCompare(a[0])
    );
  }, [sortedSurgeries, sortState.direction]);
  
  const toggleRowExpand = (surgeryId: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(surgeryId)) {
        next.delete(surgeryId);
      } else {
        next.add(surgeryId);
      }
      return next;
    });
  };
  
  const showClinical = columnGroups.includes("clinical");
  const showScheduling = columnGroups.includes("scheduling");
  const showBusiness = columnGroups.includes("business");
  const showContracts = columnGroups.includes("contracts") && !isCompactView;
  const showImplants = columnGroups.includes("implants") && !isCompactView;
  const showPaidStatus = columnGroups.includes("paidStatus") && !isCompactView;
  const hideRoomAndAdmission = moduleContext === "business";
  
  // Check if compact toggle should be shown (only for anesthesia/surgery modules with control columns)
  const showCompactToggle = (moduleContext === "anesthesia" || moduleContext === "surgery") && 
    (columnGroups.includes("paidStatus") || columnGroups.includes("contracts") || columnGroups.includes("implants"));
  
  // Calculate total columns for day header colspan
  const totalColumns = useMemo(() => {
    let count = 1; // expand button column
    if (showClinical) count += hideRoomAndAdmission ? 3 : 4; // patient, procedure, surgeon, (room) - removed date column since grouped by date
    if (showScheduling) count += hideRoomAndAdmission ? 0 : 1; // (admission) - status column hidden
    if (showScheduling && showPreOpColumn) count += 1; // pre-op column
    if (showPaidStatus) count += 1;
    if (showBusiness) count += 7; // price, quote, contract sent/received, invoice, payment, notes
    if (showContracts && !showBusiness) count += 1; // contract received icon only
    if (!showBusiness) count += 1; // notes column for non-business views
    if (showImplants) count += 3;
    return count;
  }, [showClinical, showScheduling, showBusiness, showContracts, showImplants, showPaidStatus, showPreOpColumn, hideRoomAndAdmission]);
  
  if (surgeriesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  
  if (surgeries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>{t("surgeryPlanning.noSurgeries")}</p>
      </div>
    );
  }
  
  return (
    <div>
      {showCompactToggle && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCompactView(!isCompactView)}
            className="gap-2"
            data-testid="toggle-compact-view"
          >
            {isCompactView ? (
              <>
                <ChevronDown className="h-4 w-4" />
                {t("surgeryPlanning.extendedView")}
              </>
            ) : (
              <>
                <ChevronUp className="h-4 w-4" />
                {t("surgeryPlanning.compactView")}
              </>
            )}
          </Button>
        </div>
      )}
      <div className="rounded-md border overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead className="sticky top-0 z-20 bg-background [&_tr]:border-b">
            <TableRow>
              <TableHead className="w-10 lg:sticky lg:left-0 lg:z-30 bg-background"></TableHead>
            
            {showClinical && (
              <>
                <TableHead className="lg:sticky lg:left-10 lg:z-30 bg-background min-w-[140px]">
                  <SortableHeader
                    label={t("surgeryPlanning.columns.patient")}
                    field="patientName"
                    sortState={sortState}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="bg-background">
                  <SortableHeader
                    label={t("surgeryPlanning.columns.procedure")}
                    field="plannedSurgery"
                    sortState={sortState}
                    onSort={handleSort}
                  />
                </TableHead>
                <TableHead className="bg-background">{t("surgeryPlanning.columns.surgeon")}</TableHead>
                {!hideRoomAndAdmission && <TableHead className="bg-background">{t("surgeryPlanning.columns.room")}</TableHead>}
              </>
            )}
            
            {showScheduling && (
              <>
                {!hideRoomAndAdmission && (
                  <TableHead>
                    <Clock className="h-4 w-4 inline mr-1" />
                    {t("surgeryPlanning.columns.admissionTime")}
                  </TableHead>
                )}
                {/* Status column hidden for now
                <TableHead>{t("surgeryPlanning.columns.status")}</TableHead>
                */}
                {showPreOpColumn && (
                  <TableHead className="text-center">
                    <Stethoscope className="h-4 w-4 inline mr-1" />
                    {t("surgeryPlanning.columns.preOp")}
                  </TableHead>
                )}
              </>
            )}
            
            {showPaidStatus && (
              <TableHead className="text-center">
                <CreditCard className="h-4 w-4 inline mr-1" />
                {t("surgeryPlanning.columns.paid", "Paid")}
              </TableHead>
            )}
            
            {showBusiness && (
              <>
                <TableHead>
                  <CreditCard className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.price")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.quoteSent")}</TableHead>
                <TableHead>
                  <FileText className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.contractSent")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.contractReceived")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.invoiceSent")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.paymentDate")}</TableHead>
                <TableHead>
                  <StickyNote className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.caseNotes", "Notes")}
                </TableHead>
              </>
            )}
            
            {showContracts && !showBusiness && (
              <TableHead className="text-center">
                <FileText className="h-4 w-4 inline mr-1" />
                {t("surgeryPlanning.columns.contractReceived")}
              </TableHead>
            )}
            
            {/* Notes column for non-business views */}
            {!showBusiness && (
              <TableHead className="text-center">
                <StickyNote className="h-4 w-4 inline mr-1" />
                {t("surgeryPlanning.columns.caseNotes", "Notes")}
              </TableHead>
            )}
            
            {showImplants && (
              <>
                <TableHead>
                  <Package className="h-4 w-4 inline mr-1" />
                  {t("surgeryPlanning.columns.implantOrdered")}
                </TableHead>
                <TableHead>{t("surgeryPlanning.columns.implantReceived")}</TableHead>
                <TableHead>{t("surgeryPlanning.columns.implantVendor")}</TableHead>
              </>
            )}
          </TableRow>
        </thead>
        <tbody className="[&_tr:last-child]:border-0">
          {groupedByDay.map(([dateKey, daySurgeries]) => (
            <Fragment key={dateKey}>
              {/* Day header row */}
              <TableRow className="bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/40 dark:hover:bg-blue-950/40">
                <TableCell colSpan={totalColumns} className="py-2 font-semibold text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span>
                        {new Date(dateKey + 'T12:00:00').toLocaleDateString(undefined, { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                        <span className="ml-2 text-muted-foreground font-normal">
                          ({daySurgeries.length} {daySurgeries.length === 1 ? t('surgeryPlanning.surgery', 'surgery') : t('surgeryPlanning.surgeries', 'surgeries')})
                        </span>
                      </span>
                      {renderStaffPills(dateKey)}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-muted-foreground hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        generateDayPdf(dateKey, daySurgeries);
                      }}
                      title={t('surgeryPlanning.downloadDayPdf', 'Download day plan as PDF')}
                      data-testid={`button-download-pdf-${dateKey}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
              {/* Surgeries for this day */}
              {daySurgeries.map((surgery) => {
                const patient = patientMap.get(surgery.patientId);
                const patientName = patient ? `${patient.surname}, ${patient.firstName}` : "-";
                const roomName = surgery.surgeryRoomId ? roomMap.get(surgery.surgeryRoomId) ?? "-" : "-";
                const isExpanded = expandedRows.has(surgery.id);
                
                return (
                  <Fragment key={surgery.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    onSurgeryClick && "hover:bg-accent",
                    surgery.isSuspended && "bg-amber-50/50 dark:bg-amber-950/20 border-l-4 border-l-amber-400"
                  )}
                  onClick={() => onSurgeryClick?.(surgery)}
                  data-testid={`row-surgery-${surgery.id}`}
                >
                  <TableCell className="p-1 lg:sticky lg:left-0 lg:z-10 bg-background">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowExpand(surgery.id);
                      }}
                      data-testid={`button-expand-${surgery.id}`}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  
                  {showClinical && (
                    <>
                      <TableCell className="lg:sticky lg:left-10 lg:z-10 bg-background min-w-[140px]">
                        <div className="font-medium">{patientName}</div>
                        {patient?.birthday && (
                          <div className="text-xs text-muted-foreground">
                            {formatDate(patient.birthday)}
                          </div>
                        )}
                        {surgery.isSuspended && (
                          <span className="inline-block mt-0.5 text-[10px] font-bold bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded" data-testid={`badge-suspended-table-${surgery.id}`}>
                            {t('opCalendar.suspended', 'ABGESETZT')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={surgery.plannedSurgery}>
                        {surgery.plannedSurgery}
                      </TableCell>
                      <TableCell>{surgery.surgeon ?? "-"}</TableCell>
                      {!hideRoomAndAdmission && <TableCell>{roomName}</TableCell>}
                    </>
                  )}
                  
                  {showScheduling && (
                    <>
                      {!hideRoomAndAdmission && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <EditableTimeCell
                            value={surgery.admissionTime}
                            surgeryId={surgery.id}
                            plannedDate={surgery.plannedDate}
                            field="admissionTime"
                            onUpdate={handleUpdate}
                            isPending={isFieldPending(surgery.id, "admissionTime")}
                          />
                        </TableCell>
                      )}
                      {/* Status cell hidden for now
                      <TableCell>
                        <Badge
                          className={cn(
                            (surgery as any).planningStatus === "confirmed"
                              ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                          )}
                          variant="secondary"
                        >
                          {t(`surgeryPlanning.planningStatus.${(surgery as any).planningStatus || "pre-registered"}`)}
                        </Badge>
                      </TableCell>
                      */}
                      {showPreOpColumn && (
                        <TableCell className="text-center" data-testid={`cell-preop-${surgery.id}`}>
                          {renderPreOpStatusIcon(surgery.id)}
                        </TableCell>
                      )}
                    </>
                  )}
                  
                  {showPaidStatus && (
                    <TableCell className="text-center">
                      {surgery.paymentDate ? (
                        <Check className="h-5 w-5 text-green-600 dark:text-green-400 mx-auto" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground mx-auto" />
                      )}
                    </TableCell>
                  )}
                  
                  {showBusiness && (
                    <>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableCurrencyCell
                          value={surgery.price}
                          surgeryId={surgery.id}
                          field="price"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "price")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.quoteSentDate}
                          surgeryId={surgery.id}
                          field="quoteSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "quoteSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractSentDate}
                          surgeryId={surgery.id}
                          field="treatmentContractSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.treatmentContractReceivedDate}
                          surgeryId={surgery.id}
                          field="treatmentContractReceivedDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "treatmentContractReceivedDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.invoiceSentDate}
                          surgeryId={surgery.id}
                          field="invoiceSentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "invoiceSentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.paymentDate}
                          surgeryId={surgery.id}
                          field="paymentDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "paymentDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                        <AdminNoteCell surgeryId={surgery.id} />
                      </TableCell>
                    </>
                  )}
                  
                  {showContracts && !showBusiness && (
                    <TableCell className="text-center">
                      {surgery.treatmentContractReceivedDate ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 inline" />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  )}
                  
                  {/* Notes column for non-business views */}
                  {!showBusiness && (
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-center">
                      <AdminNoteCell surgeryId={surgery.id} />
                    </TableCell>
                  )}
                  
                  {showImplants && (
                    <>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.implantOrderDate}
                          surgeryId={surgery.id}
                          field="implantOrderDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "implantOrderDate")}
                        />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <EditableDateCell
                          value={surgery.implantReceivedDate}
                          surgeryId={surgery.id}
                          field="implantReceivedDate"
                          onUpdate={handleUpdate}
                          isPending={isFieldPending(surgery.id, "implantReceivedDate")}
                        />
                      </TableCell>
                      <TableCell>{surgery.implantVendor ?? "-"}</TableCell>
                    </>
                  )}
                </TableRow>
                
                {isExpanded && (
                  <TableRow key={`${surgery.id}-expanded`}>
                    <TableCell colSpan={100} className="bg-muted/30 p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                        {patient && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.patientInfo")}</h4>
                            <div className="space-y-1">
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.patientNumber")}:</span> {patient.patientNumber ?? "-"}</p>
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.birthday")}:</span> {patient.birthday ? formatDate(patient.birthday) : "-"}</p>
                            </div>
                          </div>
                        )}
                        
                        <div>
                          <h4 className="font-semibold mb-2">{t("surgeryPlanning.surgeryDetails")}</h4>
                          <div className="space-y-1">
                            <p><span className="text-muted-foreground">{t("surgeryPlanning.notes")}:</span> {surgery.notes ?? "-"}</p>
                            {surgery.actualStartTime && (
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.actualStart")}:</span> {formatDateTime(surgery.actualStartTime)}</p>
                            )}
                            {surgery.actualEndTime && (
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.actualEnd")}:</span> {formatDateTime(surgery.actualEndTime)}</p>
                            )}
                          </div>
                        </div>
                        
                        {showBusiness && surgery.paymentNotes && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.paymentInfo")}</h4>
                            <div className="space-y-1">
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.paymentMethod")}:</span> {surgery.paymentMethod ?? "-"}</p>
                              <p><span className="text-muted-foreground">{t("surgeryPlanning.paymentNotes")}:</span> {surgery.paymentNotes}</p>
                            </div>
                          </div>
                        )}
                        
                        <div className="lg:col-span-2">
                          <h4 className="font-semibold mb-2 flex items-center gap-2">
                            <StickyNote className="h-4 w-4" />
                            {t("surgeryPlanning.caseNotesTitle", "Case Notes")}
                          </h4>
                          <InlineCaseNotes surgeryId={surgery.id} />
                        </div>
                        
                        {showImplants && surgery.implantDetails && (
                          <div>
                            <h4 className="font-semibold mb-2">{t("surgeryPlanning.implantInfo")}</h4>
                            <p className="text-sm">{surgery.implantDetails}</p>
                          </div>
                        )}
                        
                        {showPreOpColumn && (() => {
                          const preOpData = preOpMap.get(surgery.id);
                          const assessment = preOpData?.assessment;
                          if (!assessment) return null;
                          const summary = getPreOpSummary(assessment, preOpData?.surgery);
                          if (!summary) return null;
                          return (
                            <div className="lg:col-span-3" data-testid={`preop-details-${surgery.id}`}>
                              <h4 className="font-semibold mb-2 flex items-center gap-2">
                                <Stethoscope className="h-4 w-4" />
                                {t("surgeryPlanning.preOpInfo")}
                              </h4>
                              <p className="text-sm text-muted-foreground">{summary}</p>
                            </div>
                          );
                        })()}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                  </Fragment>
                );
              })}
            </Fragment>
          ))}
        </tbody>
          </table>
      </div>
    </div>
  );
}

export default SurgeryPlanningTable;
