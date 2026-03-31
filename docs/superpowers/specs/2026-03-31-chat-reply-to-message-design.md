# Chat Reply-to-Message Feature

## Overview

Add WhatsApp-style reply functionality to the chat system. Users can reply to a specific message, which appears as a quoted bubble above their reply. The backend already supports this via `replyToMessageId` on `chatMessages` — this is purely a UI feature.

## Design Decisions

- **Trigger:** "Reply" option in the existing message hover action menu (alongside Edit/Delete/Add to To-Do)
- **Input indicator:** Compact banner above the input — `↩ Replying to [sender name]` with X to dismiss (Escape also dismisses)
- **Reply bubble display:** Rounded background block above the reply message showing `↩ Replying to [sender]` + up to 2 lines of original message text
- **Click-to-scroll:** Clicking the reply bubble smooth-scrolls to the original message and briefly highlights it (pulse animation)

## Scope

All changes are in `ChatDock.tsx` (and potentially the chat storage/routes for fetching referenced messages).

### In scope

1. Add "Reply" to the message hover action menu
2. Reply state management in the chat input area
3. Reply bubble rendering above messages that have `replyToMessageId`
4. Resolving replied-to message content (from loaded messages or via API fetch)
5. Click-to-scroll with highlight animation
6. Keyboard shortcut: Escape to cancel reply

### Out of scope

- Threading / nested reply views
- Reply notifications (beyond existing message notifications)
- Swipe-to-reply gesture (mobile)

## Components

### 1. Reply State

New state in the chat input area:

```
replyingTo: { messageId: string, senderName: string, content: string } | null
```

Set when user clicks "Reply" in the action menu. Cleared on send, dismiss (X), or Escape.

### 2. Reply Menu Option

Add to the existing message hover action menu:
- Icon: reply arrow (↩ or equivalent from lucide-react)
- Label: "Reply"
- Position: first item in the menu (most common action)
- Hidden on system messages (`messageType === 'system'`)

### 3. Reply Input Banner

Shown above the text input when `replyingTo` is set:
- Layout: `↩ Replying to [sender name]` on the left, `✕` button on the right
- Style: subtle background, compact height
- Dismiss: click X or press Escape
- On send: include `replyToMessageId` in the message payload, then clear state

### 4. Reply Bubble (on messages)

Shown above messages where `replyToMessageId` is not null:
- Layout: rounded background block
- Content: `↩ Replying to [sender name]` + up to 2 lines of original message, truncated with ellipsis
- Click handler: smooth-scroll to original message + highlight animation
- Cursor: pointer

### 5. Resolving Replied-to Message Data

Messages from the API include `replyToMessageId` but not the original message content. Resolution strategy:
- First, look up the message in the already-loaded messages array (most common case — replies are usually to recent messages)
- If not found (original message is beyond the loaded window), fetch via a lightweight API call
- Cache fetched reply-to messages to avoid repeated requests for the same message

### 6. Edge Cases

| Case | Behavior |
|------|----------|
| Original message deleted (soft) | Show "↩ Original message was deleted" with muted styling |
| Original message not in loaded messages | Fetch on demand, show loading skeleton briefly |
| Replying to a reply | Works naturally — shows the direct parent only |
| System messages | No "Reply" option in their action menu |
| Long original message | Truncate to 2 lines with CSS `-webkit-line-clamp` |
| Original message has attachments | Show "[attachment name]" or "[Image]" as preview text if no text content |

### 7. Click-to-Scroll Behavior

When the reply bubble is clicked:
1. Find the original message element by ID in the DOM
2. If present: `scrollIntoView({ behavior: 'smooth', block: 'center' })` + add a CSS class for a brief highlight pulse (e.g., background flash for 1.5s)
3. If not present (scrolled beyond loaded messages): load messages up to that point, then scroll

## API Changes

### Existing (no changes needed)

- `POST /api/chat/conversations/:id/messages` already accepts `replyToMessageId`
- `GET /api/chat/conversations/:id/messages` already returns `replyToMessageId` on each message

### New endpoint needed

- `GET /api/chat/messages/:messageId` — fetch a single message by ID (for resolving reply targets not in the loaded window). Returns the message with sender info. Requires participant access check.

## Testing

- Reply to a message and verify the bubble displays correctly
- Reply to a deleted message — verify "Original message was deleted" display
- Click a reply bubble — verify scroll and highlight
- Press Escape while replying — verify state clears
- Click X on reply banner — verify state clears
- Send a reply — verify `replyToMessageId` is set on the created message
- Reply to a message that's scrolled far up — verify fetch and display
