import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";

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

interface PatientChatListProps {
  hospitalId: string;
  onSelectConversation: (conv: PatientConversation) => void;
}

export type { PatientConversation };

export default function PatientChatList({ hospitalId, onSelectConversation }: PatientChatListProps) {
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

  if (isLoading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mx-auto" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No patient messages yet
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      {conversations.map((conv) => {
        const initials = `${conv.patientName.charAt(0)}${conv.patientSurname.charAt(0)}`.toUpperCase();
        const preview = conv.lastMessage.length > 60
          ? conv.lastMessage.substring(0, 60) + '...'
          : conv.lastMessage;
        const timeAgo = formatDistanceToNow(new Date(conv.lastMessageAt), { addSuffix: true });

        return (
          <button
            key={conv.conversationId}
            className="w-full flex items-start gap-3 p-3 hover:bg-muted/50 transition-colors text-left border-b border-border"
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
                  {conv.patientSurname} {conv.patientName}
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
        );
      })}
    </ScrollArea>
  );
}
