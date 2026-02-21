# Tiptap WYSIWYG Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the split markdown editor/preview in the Discharge Brief with a single Tiptap WYSIWYG editor area, switching storage from markdown to HTML.

**Architecture:** Tiptap with `@tiptap/starter-kit` provides bold, italic, headings, lists, horizontal rules out of the box. Content stored as HTML strings in the existing `content` text column. PDF renderer rewritten from markdown parsing to HTML parsing using `node-html-parser`. AI system prompts updated to output HTML instead of markdown.

**Tech Stack:** `@tiptap/react`, `@tiptap/starter-kit`, `node-html-parser`, existing `jsPDF`

---

### Task 1: Install Tiptap dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install packages**

Run:
```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/pm
```

**Step 2: Install server-side HTML parser**

Run:
```bash
npm install node-html-parser
```

**Step 3: Verify installation**

Run: `npm run check`
Expected: No new TypeScript errors

**Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tiptap and node-html-parser dependencies"
```

---

### Task 2: Rewrite DischargeBriefEditor with Tiptap

**Files:**
- Modify: `client/src/components/dischargeBriefs/DischargeBriefEditor.tsx`

**Step 1: Rewrite the editor component**

Replace the entire editor component. Key changes:
- Remove imports: `ReactMarkdown`, `remarkGfm`, `Textarea` (the shadcn one used for editing), `insertMarkdownSyntax` helper function
- Remove: `MobileTab` type, `mobileTab` state, `textareaRef`, `handleToolbar` callback
- Remove: The entire split view (textarea pane + preview pane + mobile tab toggle)
- Add imports: `useEditor`, `EditorContent` from `@tiptap/react`, `StarterKit` from `@tiptap/starter-kit`
- Add Tiptap editor initialization with `useEditor`:
  ```tsx
  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editable: !isLocked,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none dark:prose-invert focus:outline-none min-h-[300px] px-4 py-3",
      },
    },
  });
  ```
- When `brief` loads, set content: `editor?.commands.setContent(brief.content)`
- When `isLocked` changes, toggle: `editor?.setEditable(!isLocked)`
- Toolbar buttons use Tiptap chain commands with active state highlighting:
  ```tsx
  <Button
    variant="ghost"
    size="icon"
    className={cn("h-8 w-8", editor?.isActive("bold") && "bg-accent")}
    onClick={() => editor?.chain().focus().toggleBold().run()}
  >
    <Bold className="h-4 w-4" />
  </Button>
  ```
- Replace both panes with single `<EditorContent editor={editor} />`:
  ```tsx
  <div className="flex-1 min-h-0 overflow-auto">
    <EditorContent editor={editor} />
  </div>
  ```
- On save: use `editor?.getHTML()` instead of `content` state:
  ```tsx
  const saveMutation = useMutation({
    mutationFn: async () => {
      const html = editor?.getHTML() || "";
      await apiRequest("PATCH", `/api/discharge-briefs/${briefId}`, { content: html });
    },
    // ... rest same
  });
  ```

**Full component structure after rewrite:**
```
DischargeBriefEditor
├── Header (badges, close button) — unchanged
├── Toolbar (Tiptap commands, hidden when locked)
│   ├── Bold, Italic (toggleBold, toggleItalic)
│   ├── H2, H3 (toggleHeading level 2/3)
│   └── BulletList, OrderedList (toggleBulletList, toggleOrderedList)
├── EditorContent (single WYSIWYG area, replaces split view)
├── Actions bar (Save, Sign, Export PDF, Audit, Unlock) — unchanged
├── SignaturePad dialog — unchanged
├── Unlock dialog — unchanged
└── Audit dialog (lazy loaded) — unchanged
```

**Step 2: Verify it compiles**

Run: `npm run check`
Expected: No TypeScript errors

**Step 3: Manual test**

Run: `npm run dev`
- Open a patient's discharge briefs
- Create or open a brief
- Verify WYSIWYG editing works (bold, italic, headings, lists)
- Verify locked briefs show formatted text but can't be edited
- Verify save works

**Step 4: Commit**

```bash
git add client/src/components/dischargeBriefs/DischargeBriefEditor.tsx
git commit -m "feat: replace markdown editor with Tiptap WYSIWYG editor"
```

---

### Task 3: Rewrite PDF renderer from markdown to HTML

**Files:**
- Rename + rewrite: `server/utils/markdownToPdf.ts` → `server/utils/htmlToPdf.ts`
- Modify: `server/routes/dischargeBriefs.ts` (update import path)

**Step 1: Create the HTML-based PDF renderer**

Create `server/utils/htmlToPdf.ts`. Same interface (`DischargeBriefPdfOptions`), same jsPDF approach, but parse HTML with `node-html-parser` instead of line-by-line markdown.

Key implementation:
```typescript
import { jsPDF } from "jspdf";
import { parse as parseHtml } from "node-html-parser";

export async function renderDischargeBriefPdf(opts: DischargeBriefPdfOptions): Promise<Buffer> {
  const pdf = new jsPDF();
  // ... same header/patient/separator rendering ...

  const root = parseHtml(opts.content);
  for (const node of root.childNodes) {
    renderNode(pdf, node, margin, maxTextWidth, /* ... */);
  }

  // ... same signature section ...
}
```

Mapping from current markdown → HTML:
| Markdown pattern | HTML tag | PDF rendering |
|---|---|---|
| `# text` | `<h1>` | 14pt bold |
| `## text` | `<h2>` | 12pt bold |
| `### text` | `<h3>` | 11pt bold |
| `---` | `<hr>` | Gray line |
| `- item` | `<ul><li>` | Bullet + indented text |
| `1. item` | `<ol><li>` | Number + indented text |
| `**bold**` | `<strong>` | Strip for jsPDF (same as current) |
| `*italic*` | `<em>` | Strip for jsPDF (same as current) |
| paragraph | `<p>` | 10pt normal |

The `renderNode` function recursively traverses child nodes, handling text extraction from `<strong>` and `<em>` by stripping them (jsPDF doesn't support mixed inline styles, same as current behavior).

**Step 2: Update the import in dischargeBriefs.ts**

Change line ~442:
```typescript
// Before:
const { renderDischargeBriefPdf } = await import("../utils/markdownToPdf");
// After:
const { renderDischargeBriefPdf } = await import("../utils/htmlToPdf");
```

**Step 3: Delete the old file**

Delete `server/utils/markdownToPdf.ts`.

**Step 4: Verify it compiles**

Run: `npm run check`
Expected: No TypeScript errors

**Step 5: Manual test**

Run: `npm run dev`
- Open a brief, click Export PDF
- Verify PDF renders with headings, lists, paragraphs, signature

**Step 6: Commit**

```bash
git add server/utils/htmlToPdf.ts server/routes/dischargeBriefs.ts
git rm server/utils/markdownToPdf.ts
git commit -m "feat: rewrite PDF renderer from markdown to HTML parsing"
```

---

### Task 4: Update AI system prompts to output HTML

**Files:**
- Modify: `server/utils/dischargeBriefData.ts`

**Step 1: Update the system prompts**

In `getSystemPrompt()` function:

1. **Default prompts (no template)** — line ~483: Change:
   ```
   - Use markdown formatting (headings, bold, bullet points)
   ```
   to:
   ```
   - Output as clean HTML. Use <h2> and <h3> for section headings, <p> for paragraphs, <strong> for bold, <em> for italic, <ul><li> for bullet lists, <ol><li> for numbered lists, and <hr> for separators. Do NOT use markdown formatting.
   ```

2. **Template-based prompts** — the template prompt at ~409-426 doesn't specify markdown explicitly, but we should add the HTML instruction. Update the Rules section to include the same HTML output instruction.

3. **Import-file route AI prompt** — in `server/routes/dischargeBriefs.ts` line ~800-811, the AI that processes imported template files should also be told to output HTML for the `content` field. Add to the system prompt: `The "content" field should use clean HTML formatting (h2, h3, p, strong, em, ul/li, ol/li, hr tags).`

**Step 2: Verify it compiles**

Run: `npm run check`
Expected: No errors

**Step 3: Commit**

```bash
git add server/utils/dischargeBriefData.ts server/routes/dischargeBriefs.ts
git commit -m "feat: update AI prompts to output HTML instead of markdown"
```

---

### Task 5: Add basic editor styling

**Files:**
- Modify: `client/src/index.css` (or appropriate global CSS file)

**Step 1: Add Tiptap editor styles**

Tiptap renders a `div[contenteditable]` — it needs minimal CSS to look good. Add styles so:
- The editor area has the same border/background as the rest of the dialog
- Focus ring matches the app's design system
- Placeholder text works (Tiptap supports placeholder via the editor's `editorProps`)
- The `.ProseMirror` class (Tiptap's inner element) has proper padding and min-height

```css
.ProseMirror:focus {
  outline: none;
}
.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
}
```

The `prose` classes from Tailwind Typography (already used in the project via the preview pane) handle heading sizes, list styles, etc.

**Step 2: Verify visually**

Run: `npm run dev`
- Check editor looks clean
- Check placeholder shows when empty

**Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "style: add Tiptap editor base styles"
```

---

### Task 6: Clean up unused markdown dependencies

**Files:**
- Modify: `package.json`

**Step 1: Check if react-markdown/remark-gfm are used elsewhere**

`react-markdown` and `remark-gfm` are still used in `client/src/components/NotesPanel.tsx` (for rendering patient notes). Do NOT remove these packages — they're still needed.

No cleanup needed. Skip this task.

---

### Task 7: Run lint + typecheck

**Step 1: TypeScript check**

Run: `npm run check`
Expected: No errors

**Step 2: Build**

Run: `npm run build`
Expected: Clean build

**Step 3: Fix any issues found**

Fix lint/type errors if any.

**Step 4: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: resolve lint and typecheck issues from tiptap migration"
```
