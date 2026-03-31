# Chat Reply-to-Message Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add WhatsApp-style reply-to-message UI so users can reply to a specific message with a quoted bubble, leveraging the existing `replyToMessageId` backend support.

**Architecture:** All UI changes are in `ChatDock.tsx`. One new API endpoint (`GET /api/chat/messages/:messageId/with-sender`) to fetch reply targets not in the loaded message window. One new storage function to support it.

**Tech Stack:** React, TypeScript, TanStack Query, lucide-react, Tailwind CSS

---

### Task 1: Add reply state and "Reply" menu option

**Files:**
- Modify: `client/src/components/chat/ChatDock.tsx:43` (imports)
- Modify: `client/src/components/chat/ChatDock.tsx:207-233` (state)
- Modify: `client/src/components/chat/ChatDock.tsx:2308-2323` (action menu)

- [ ] **Step 1: Add `Reply` icon import**

In `client/src/components/chat/ChatDock.tsx`, add `Reply` to the lucide-react import (line 13-44):

```typescript
// Add Reply to the existing import block:
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
  Check,
  RefreshCw,
  AlertTriangle,
  Reply  // ADD THIS
} from "lucide-react";
```

- [ ] **Step 2: Add `replyingTo` state**

After the existing `editingMessage` state (around line 208), add:

```typescript
const [replyingTo, setReplyingTo] = useState<{ messageId: string; senderName: string; content: string } | null>(null);
```

- [ ] **Step 3: Add "Reply" button to the message action menu**

In the action buttons area (line 2308), add a Reply button **before** the existing "Add to To-Do" button. The Reply button should show for all non-deleted, non-system messages:

```tsx
{!msg.isDeleted && msg.messageType !== 'system' && (
  <Button
    variant="ghost"
    size="icon"
    className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
    onClick={() => {
      const senderName = msg.sender?.firstName || msg.sender?.email || 'Unknown';
      const plainText = msg.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').replace(/#\[([^\]]+)\]\([^)]+\)/g, '#$1');
      setReplyingTo({ messageId: msg.id, senderName, content: plainText });
      setEditingMessage(null);
    }}
    title={t('chat.reply', 'Reply')}
    data-testid={`button-reply-message-${msg.id}`}
  >
    <Reply className="w-3 h-3" />
  </Button>
)}
```

Insert this **before** the existing `{!msg.isDeleted && msg.content && (` block at line 2308.

- [ ] **Step 4: Verify the reply button appears on hover**

Run: `npm run dev`
- Hover over a message in the chat
- Confirm the Reply icon appears alongside the existing To-Do/Edit/Delete buttons
- Confirm clicking it sets `replyingTo` state (the input banner from Task 2 won't exist yet — that's fine)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/chat/ChatDock.tsx
git commit -m "feat(chat): add reply button to message action menu"
```

---

### Task 2: Add reply banner above the input area

**Files:**
- Modify: `client/src/components/chat/ChatDock.tsx:2371-2419` (input area)

- [ ] **Step 1: Add the reply banner UI**

In the input area section (line 2371, inside `<div className="p-4 border-t border-border">`), add the reply banner **before** the `editingMessage` block (line 2372). This ensures reply and edit are mutually exclusive visually:

```tsx
{replyingTo && !editingMessage && (
  <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-accent/50 rounded-lg border border-border">
    <Reply className="w-4 h-4 text-primary shrink-0" />
    <span className="text-sm text-primary font-medium truncate">
      {t('chat.replyingTo', 'Replying to')} {replyingTo.senderName}
    </span>
    <Button
      variant="ghost"
      size="icon"
      className="h-5 w-5 ml-auto shrink-0"
      onClick={() => setReplyingTo(null)}
      data-testid="button-cancel-reply"
    >
      <X className="w-3 h-3" />
    </Button>
  </div>
)}
```

- [ ] **Step 2: Add Escape key handler to dismiss reply**

In the main message input's `onKeyDown` handler (find where `handleMessageKeyDown` or the inline `onKeyDown` is defined for the message input), add an Escape handler:

Find the existing input `onKeyDown` handler. It likely handles Enter for send and various mention shortcuts. Add at the top of the handler:

```typescript
if (e.key === 'Escape' && replyingTo) {
  e.preventDefault();
  setReplyingTo(null);
  return;
}
```

- [ ] **Step 3: Clear replyingTo when entering edit mode**

In the Edit button's onClick (line 2330), also clear `replyingTo`:

```typescript
onClick={() => {
  setEditingMessage({ id: msg.id, content: msg.content });
  setReplyingTo(null);  // ADD THIS
}}
```

- [ ] **Step 4: Verify the reply banner**

Run: `npm run dev`
- Click Reply on a message → banner appears above input showing "Replying to [name]"
- Click X → banner dismisses
- Press Escape → banner dismisses
- Click Edit on a message → reply banner clears, edit UI appears

- [ ] **Step 5: Commit**

```bash
git add client/src/components/chat/ChatDock.tsx
git commit -m "feat(chat): add reply banner above message input"
```

---

### Task 3: Send messages with `replyToMessageId`

**Files:**
- Modify: `client/src/components/chat/ChatDock.tsx:762-782` (mutation)
- Modify: `client/src/components/chat/ChatDock.tsx:1280-1310` (send handler)

- [ ] **Step 1: Update the mutation to accept `replyToMessageId`**

Modify the `sendMessageMutation` (line 762) to include `replyToMessageId` in the type and API call:

```typescript
const sendMessageMutation = useMutation({
  mutationFn: async ({ content, mentions, attachments, replyToMessageId }: {
    content: string;
    mentions: Array<{ type: string; userId?: string; patientId?: string }>;
    attachments?: Array<{ storageKey: string; filename: string; mimeType: string; sizeBytes: number }>;
    replyToMessageId?: string;
  }) => {
    const response = await apiRequest("POST", `/api/chat/conversations/${selectedConversation?.id}/messages`, {
      content,
      messageType: attachments && attachments.length > 0 ? 'file' : 'text',
      mentions: mentions.length > 0 ? mentions : undefined,
      attachments: attachments && attachments.length > 0 ? attachments : undefined,
      replyToMessageId: replyToMessageId || undefined
    });
    return response.json();
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['/api/chat/conversations', selectedConversation?.id, 'messages'] });
    queryClient.invalidateQueries({ queryKey: ['/api/chat', activeHospital?.id, 'conversations'] });
    setMessageText("");
    setPendingAttachments([]);
    setReplyingTo(null);  // ADD THIS - clear reply state after send
  },
});
```

- [ ] **Step 2: Pass `replyToMessageId` in the send handler**

Update `handleSendMessage` (line 1305) to include `replyToMessageId`:

```typescript
sendMessageMutation.mutate({
  content: hasContent ? messageText.trim() : (attachments.length > 0 ? `Sent ${attachments.length} file(s)` : ''),
  mentions,
  attachments: attachments.length > 0 ? attachments : undefined,
  replyToMessageId: replyingTo?.messageId
});
```

- [ ] **Step 3: Verify reply sends correctly**

Run: `npm run dev`
- Click Reply on a message, type a response, press Enter/Send
- Check browser DevTools Network tab — the POST request should include `replyToMessageId`
- Reply banner should clear after sending
- The message should appear in the chat (reply bubble display comes in Task 5)

- [ ] **Step 4: Commit**

```bash
git add client/src/components/chat/ChatDock.tsx
git commit -m "feat(chat): send replyToMessageId with messages"
```

---

### Task 4: Add API endpoint to fetch a single message with sender info

**Files:**
- Modify: `server/storage/chat.ts:286-292` (add new function)
- Modify: `server/routes/chat.ts:502` (add new endpoint)

- [ ] **Step 1: Add `getMessageWithSender` storage function**

In `server/storage/chat.ts`, after the existing `getMessage` function (line 292), add:

```typescript
export async function getMessageWithSender(id: string): Promise<(ChatMessage & { sender: { id: string; firstName: string | null; lastName: string | null; email: string | null } }) | undefined> {
  const result = await db
    .select()
    .from(chatMessages)
    .innerJoin(users, eq(chatMessages.senderId, users.id))
    .where(eq(chatMessages.id, id));

  if (result.length === 0) return undefined;

  const row = result[0];
  return {
    ...row.chat_messages,
    sender: {
      id: row.users.id,
      firstName: row.users.firstName,
      lastName: row.users.lastName,
      email: row.users.email,
    }
  };
}
```

- [ ] **Step 2: Add GET endpoint for single message with sender**

In `server/routes/chat.ts`, after the DELETE message endpoint (around line 559), add:

```typescript
router.get('/api/chat/messages/:messageId', isAuthenticated, async (req: any, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    const message = await storage.getMessageWithSender(messageId);
    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    // Verify the requester is a participant in this conversation
    const participant = await storage.getParticipant(message.conversationId, userId);
    if (!participant) {
      return res.status(403).json({ message: "Not a participant in this conversation" });
    }

    res.json(message);
  } catch (error) {
    logger.error("Error fetching message:", error);
    res.status(500).json({ message: "Failed to fetch message" });
  }
});
```

- [ ] **Step 3: Verify the `getParticipant` function exists**

Check that `storage.getParticipant` exists. It should already be in `server/storage/chat.ts`. If not, it's a simple query:

```typescript
export async function getParticipant(conversationId: string, userId: string): Promise<ChatParticipant | undefined> {
  const [participant] = await db
    .select()
    .from(chatParticipants)
    .where(and(
      eq(chatParticipants.conversationId, conversationId),
      eq(chatParticipants.userId, userId)
    ));
  return participant;
}
```

- [ ] **Step 4: Verify the endpoint**

Run: `npm run dev`
- Find a message ID from browser DevTools (look at the messages GET response)
- Test: `curl -b <cookie> http://localhost:5000/api/chat/messages/<messageId>`
- Should return the message with `sender` object included

- [ ] **Step 5: Commit**

```bash
git add server/storage/chat.ts server/routes/chat.ts
git commit -m "feat(chat): add GET endpoint for single message with sender info"
```

---

### Task 5: Display reply bubble above messages

**Files:**
- Modify: `client/src/components/chat/ChatDock.tsx:2230-2238` (message bubble rendering)

- [ ] **Step 1: Add a cache and fetch function for reply target messages**

Near the top of the ChatDock component (after the query hooks, around line 330), add a ref-based cache and fetch helper:

```typescript
const replyMessageCache = useRef<Map<string, { senderName: string; content: string; isDeleted: boolean } | null>>(new Map());

const getReplyMessage = useCallback(async (messageId: string): Promise<{ senderName: string; content: string; isDeleted: boolean } | null> => {
  // Check cache first
  if (replyMessageCache.current.has(messageId)) {
    return replyMessageCache.current.get(messageId)!;
  }

  // Check loaded messages
  const loaded = messages.find(m => m.id === messageId);
  if (loaded) {
    const result = {
      senderName: loaded.sender?.firstName || loaded.sender?.email || 'Unknown',
      content: loaded.content.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').replace(/#\[([^\]]+)\]\([^)]+\)/g, '#$1'),
      isDeleted: loaded.isDeleted
    };
    replyMessageCache.current.set(messageId, result);
    return result;
  }

  // Fetch from API
  try {
    const response = await fetch(`/api/chat/messages/${messageId}`, { credentials: 'include' });
    if (!response.ok) {
      replyMessageCache.current.set(messageId, null);
      return null;
    }
    const msg = await response.json();
    const result = {
      senderName: msg.sender?.firstName || msg.sender?.email || 'Unknown',
      content: (msg.content || '').replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1').replace(/#\[([^\]]+)\]\([^)]+\)/g, '#$1'),
      isDeleted: !!msg.deletedAt
    };
    replyMessageCache.current.set(messageId, result);
    return result;
  } catch {
    replyMessageCache.current.set(messageId, null);
    return null;
  }
}, [messages]);
```

- [ ] **Step 2: Create a `ReplyBubble` inline component**

Add this inside the ChatDock component, after the cache/fetch helper:

```typescript
const ReplyBubble = useCallback(({ replyToMessageId, isOwnMessage }: { replyToMessageId: string; isOwnMessage: boolean }) => {
  const [replyData, setReplyData] = useState<{ senderName: string; content: string; isDeleted: boolean } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    getReplyMessage(replyToMessageId).then(data => {
      if (!cancelled) setReplyData(data);
    });
    return () => { cancelled = true; };
  }, [replyToMessageId]);

  const handleClick = () => {
    const el = document.querySelector(`[data-testid="message-${replyToMessageId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('reply-highlight');
      setTimeout(() => el.classList.remove('reply-highlight'), 1500);
    }
  };

  if (replyData === undefined) {
    return (
      <div className="mb-1 px-3 py-1.5 rounded-lg bg-accent/50 animate-pulse">
        <div className="h-3 w-24 bg-muted rounded" />
      </div>
    );
  }

  if (replyData === null) return null;

  return (
    <div
      className="mb-1 px-3 py-1.5 rounded-lg bg-accent/50 cursor-pointer hover:bg-accent/70 transition-colors max-w-full"
      onClick={handleClick}
      data-testid={`reply-bubble-${replyToMessageId}`}
    >
      <div className="flex items-center gap-1 text-xs text-primary font-medium">
        <Reply className="w-3 h-3" />
        <span>{t('chat.replyingTo', 'Replying to')} {replyData.senderName}</span>
      </div>
      {replyData.isDeleted ? (
        <p className="text-xs text-muted-foreground italic mt-0.5">
          {t('chat.originalMessageDeleted', 'Original message was deleted')}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
          {replyData.content || '[Attachment]'}
        </p>
      )}
    </div>
  );
}, [getReplyMessage, t]);
```

- [ ] **Step 3: Render `ReplyBubble` above the message bubble**

In the message rendering section, **before** the existing message bubble div (line 2230, the `<div className={`rounded-2xl px-4 py-2...`}>` ), add:

```tsx
{msg.replyToMessageId && (
  <ReplyBubble replyToMessageId={msg.replyToMessageId} isOwnMessage={isOwnMessage} />
)}
```

Insert this right before:
```tsx
<div
  className={`rounded-2xl px-4 py-2 ${
    isOwnMessage
```

- [ ] **Step 4: Add the highlight animation CSS**

Add a `<style>` tag inside the component's return, or add to the project's global CSS. The simplest approach is a style tag at the top of the ChatDock return:

Find the outermost `return (` of the ChatDock component and add immediately inside:

```tsx
<style>{`
  @keyframes reply-highlight-pulse {
    0% { background-color: hsl(var(--primary) / 0.15); }
    100% { background-color: transparent; }
  }
  .reply-highlight {
    animation: reply-highlight-pulse 1.5s ease-out;
  }
`}</style>
```

- [ ] **Step 5: Clear reply cache when conversation changes**

In the effect that runs when `selectedConversation` changes (or add a new one):

```typescript
useEffect(() => {
  replyMessageCache.current.clear();
}, [selectedConversation?.id]);
```

- [ ] **Step 6: Verify the reply bubble display**

Run: `npm run dev`
- Send a reply to a message (from Task 3)
- The reply should show a bubble above it: "↩ Replying to [name]" + 2-line preview
- Click the bubble → smooth scroll to the original message + highlight pulse
- Reply to a deleted message → bubble shows "Original message was deleted"

- [ ] **Step 7: Commit**

```bash
git add client/src/components/chat/ChatDock.tsx
git commit -m "feat(chat): display reply bubble with click-to-scroll"
```

---

### Task 6: TypeScript check and final verification

**Files:**
- All modified files

- [ ] **Step 1: Run TypeScript check**

Run: `npm run check`
Expected: No errors related to chat changes

- [ ] **Step 2: Fix any TypeScript errors**

Address any type errors that come up.

- [ ] **Step 3: End-to-end verification**

Run: `npm run dev`

Full test flow:
1. Open chat, go to a conversation with messages
2. Hover a message → Reply button appears
3. Click Reply → "↩ Replying to [name]" banner appears above input
4. Press Escape → banner clears
5. Click Reply again → banner appears
6. Click X → banner clears
7. Click Reply, type a message, press Enter → message sends with reply bubble
8. Reply bubble shows quoted text (2 lines max) with sender name
9. Click the reply bubble → scrolls to original message with highlight
10. Hover a system message → no Reply button
11. Click Edit while replying → reply clears, edit mode activates

- [ ] **Step 4: Commit any fixes**

```bash
git add client/src/components/chat/ChatDock.tsx server/routes/chat.ts server/storage/chat.ts
git commit -m "fix(chat): address typecheck issues in reply feature"
```
