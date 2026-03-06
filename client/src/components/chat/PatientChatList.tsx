import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Loader2, Archive, Search, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDistanceToNow } from "date-fns";
import { formatDate } from "@/lib/dateUtils";

interface PatientConversation {
  patientId: string;
  hospitalId: string;
  conversationId: string;
  patientName: string;
  patientSurname: string;
  lastMessage: string;
  lastMessageAt: string;
  lastMessageDirection: string;
  unreadCount: number;
}

interface PatientSearchResult {
  id: string;
  firstName: string | null;
  surname: string | null;
  birthday: string | null;
}

interface PatientChatListProps {
  hospitalId: string;
  onSelectConversation: (conv: PatientConversation) => void;
  onStartNewChat: (patient: { id: string; firstName: string | null; surname: string | null }) => void;
}

export type { PatientConversation };

export default function PatientChatList({ hospitalId, onSelectConversation, onStartNewChat }: PatientChatListProps) {
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: conversations = [], isLoading } = useQuery<PatientConversation[]>({
    queryKey: ['/api/patient-chat', hospitalId, 'conversations'],
    queryFn: async () => {
      const res = await fetch(`/api/patient-chat/${hospitalId}/conversations`);
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
    enabled: !!hospitalId,
    refetchInterval: 30000,
  });

  const { data: searchResults = [], isFetching: isSearching } = useQuery<PatientSearchResult[]>({
    queryKey: ['/api/patient-chat', hospitalId, 'patients/search', searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/patient-chat/${hospitalId}/patients/search?q=${encodeURIComponent(searchQuery)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: showNewChat && searchQuery.length >= 2,
  });

  const archiveMutation = useMutation({
    mutationFn: async (patientId: string) => {
      const res = await fetch(`/api/patient-chat/${hospitalId}/conversations/${patientId}/archive`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to archive');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/patient-chat', hospitalId, 'unread-count'] });
    },
  });

  if (showNewChat) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 p-2 border-b border-border">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => { setShowNewChat(false); setSearchQuery(""); }}>
            <X className="w-4 h-4" />
          </Button>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search patient by name..."
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {isSearching && (
            <div className="p-4 text-center">
              <Loader2 className="h-4 w-4 animate-spin mx-auto text-muted-foreground" />
            </div>
          )}
          {!isSearching && searchQuery.length >= 2 && searchResults.length === 0 && (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No patients found
            </div>
          )}
          {searchResults.map((patient) => {
            const initials = `${(patient.firstName || '').charAt(0)}${(patient.surname || '').charAt(0)}`.toUpperCase() || '?';
            return (
              <button
                key={patient.id}
                className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border"
                onClick={() => {
                  onStartNewChat(patient);
                  setShowNewChat(false);
                  setSearchQuery("");
                }}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarFallback className="bg-green-100 text-green-700 text-xs font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {patient.surname || ''} {patient.firstName || ''}
                  </div>
                  {patient.birthday && (
                    <div className="text-xs text-muted-foreground">{formatDate(patient.birthday + 'T12:00:00')}</div>
                  )}
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* New chat button */}
      <div className="p-2 border-b border-border">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-2"
          onClick={() => setShowNewChat(true)}
        >
          <Plus className="w-4 h-4" />
          New patient chat
        </Button>
      </div>

      {conversations.length === 0 ? (
        <div className="p-4 text-center text-muted-foreground text-sm">
          No patient messages yet
        </div>
      ) : (
        <ScrollArea className="flex-1">
          {conversations.map((conv) => {
            const initials = `${(conv.patientName || '').charAt(0)}${(conv.patientSurname || '').charAt(0)}`.toUpperCase() || '?';
            const preview = (conv.lastMessage || '').length > 60
              ? (conv.lastMessage || '').substring(0, 60) + '...'
              : (conv.lastMessage || '');
            const timeAgo = conv.lastMessageAt
              ? formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true })
              : '';

            return (
              <div
                key={conv.conversationId}
                className="flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors border-b border-border group"
              >
                <button
                  className="flex items-start gap-3 flex-1 min-w-0 text-left"
                  onClick={() => onSelectConversation(conv)}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-green-100 text-green-700 text-sm font-medium">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-semibold' : 'font-medium'}`}>
                        {conv.patientSurname || ''} {conv.patientName || ''}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {timeAgo}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                        {conv.lastMessageDirection === 'outbound' ? 'You: ' : ''}
                        {preview}
                      </span>
                      {conv.unreadCount > 0 && (
                        <span className="shrink-0 bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                <button
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    archiveMutation.mutate(conv.patientId);
                  }}
                  title="Archive conversation"
                >
                  <Archive className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </ScrollArea>
      )}
    </div>
  );
}
