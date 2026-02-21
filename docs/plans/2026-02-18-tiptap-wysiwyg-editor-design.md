# Discharge Brief: Tiptap WYSIWYG Editor with HTML Storage

## Context

The current Discharge Brief editor uses a split view — raw markdown textarea on the left, rendered preview on the right. This is not user-friendly for surgeons. Replace with a single WYSIWYG editor area using Tiptap, and switch storage from markdown to HTML.

No one is using the feature yet, so no data migration is needed.

## Approach

**Tiptap + HTML storage.** Tiptap works natively with HTML. No conversion layer needed. Clean long-term architecture.

## Changes

### 1. Editor Component (DischargeBriefEditor.tsx)

- Remove: `react-markdown`, `remark-gfm`, `Textarea`, `insertMarkdownSyntax()`, mobile tab toggle, split view
- Add: `@tiptap/react`, `@tiptap/starter-kit`
- Single Tiptap editor area replaces both panes
- Toolbar uses Tiptap commands (same buttons: Bold, Italic, H2, H3, BulletList, OrderedList)
- When locked: `editable: false` — shows formatted text inline (no separate preview)
- On save: `editor.getHTML()` sent to API

### 2. PDF Renderer (markdownToPdf.ts → htmlToPdf.ts)

- Rewrite to parse HTML instead of markdown
- Use `node-html-parser` for lightweight DOM parsing
- Same jsPDF rendering approach, same visual output
- Supported tags: h1-h3, p, strong, em, ul/ol/li, hr

### 3. AI System Prompt (dischargeBriefData.ts)

- Change: "Use markdown formatting" → "Output clean HTML using h2, h3, strong, em, ul/li, ol/li, hr, p tags"

### 4. Templates

- Template content switches from markdown text to HTML
- No migration needed (no existing templates in production)

### 5. Unchanged

- All API routes, mutations, query keys
- Signature pad, unlock dialog, audit dialog
- `content` field type in schema (text string)
- Header bar, action buttons, overall layout
