/**
 * Post-AI guard for task-list preservation.
 *
 * When a template contains `<ul data-type="taskList">` blocks (imported checklists),
 * the AI is instructed to leave them verbatim. Some models drop, summarize, or
 * rewrite the items anyway. This helper compares the original template to the AI
 * output and, if items are missing, splices the original task-list blocks back in.
 *
 * Strategy: positional substitution. Each `<ul data-type="taskList">…</ul>` block in
 * the AI output is replaced with the corresponding (Nth) block from the template.
 * If the output has fewer blocks than the template, the missing ones are appended.
 */

const TASK_LIST_RE = /<ul[^>]*data-type=["']taskList["'][^>]*>[\s\S]*?<\/ul>/g;
const TASK_ITEM_RE = /data-type=["']taskItem["']/g;

function matchAll(html: string, re: RegExp): string[] {
  return html.match(new RegExp(re.source, re.flags)) ?? [];
}

function countItems(html: string): number {
  return matchAll(html, TASK_ITEM_RE).length;
}

export function preserveTaskListsFromTemplate(
  templateHtml: string,
  outputHtml: string,
): string {
  if (!templateHtml) return outputHtml;
  const templateBlocks = matchAll(templateHtml, TASK_LIST_RE);
  if (templateBlocks.length === 0) return outputHtml;

  // Always substitute: task-list content is template-defined, the AI's only job is
  // to fill surrounding patient-data fields. Positional replacement.
  let i = 0;
  let restored = outputHtml.replace(TASK_LIST_RE, () => {
    return templateBlocks[i++] ?? "";
  });

  // Append any template task-lists the AI dropped entirely.
  if (i < templateBlocks.length) {
    restored = restored + "\n" + templateBlocks.slice(i).join("\n");
  }

  return restored;
}

// Re-export internal helper for testing if needed in the future
export { countItems as _countTaskItems };
