import { HTMLElement, parse } from "node-html-parser";

const WS = "[\\s\\u00A0]";
const CHECKBOX_ALL_GLYPHS = new RegExp(`^${WS}*[☐☑☒✓✔✗✘❏❑❒]+${WS}*$`);
const CHECKBOX_CHECKED_GLYPHS = new RegExp(`^${WS}*[☑✓✔]+${WS}*$`);
const HEADER_CHECKMARK_GLYPHS = new RegExp(`^${WS}*[✓✔]${WS}*$`);
const LINE_PREFIX_UNCHECKED = new RegExp(`^${WS}*(?:[☐❏❑❒]|\\[\\s\\]|-\\s*\\[\\s\\])\\s+`);
const LINE_PREFIX_CHECKED = new RegExp(`^${WS}*(?:[☑✓✔]|\\[[xX]\\]|-\\s*\\[[xX]\\])\\s+`);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function taskItem(checked: boolean, innerHtml: string): string {
  const checkedAttr = checked ? "true" : "false";
  const inputChecked = checked ? ' checked="checked"' : "";
  const trimmed = innerHtml.trim();
  const body = /^<(p|h[1-6]|ul|ol|div|blockquote)\b/i.test(trimmed) ? trimmed : `<p>${trimmed}</p>`;
  return `<li data-type="taskItem" data-checked="${checkedAttr}"><label><input type="checkbox"${inputChecked}><span></span></label><div>${body}</div></li>`;
}

function taskList(items: string[]): string {
  return items.length ? `<ul data-type="taskList">${items.join("")}</ul>` : "";
}

function convertChecklistTable(table: HTMLElement): string | null {
  const rows = table.querySelectorAll("tr");
  const hasCheckboxRow = rows.some((tr) => {
    const cells = tr.querySelectorAll("td");
    return cells.length > 0 && CHECKBOX_ALL_GLYPHS.test(cells[0].text);
  });
  if (!hasCheckboxRow) return null;

  const segments: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      segments.push(taskList(buf));
      buf = [];
    }
  };

  let firstChecklistRowSeen = false;
  for (const tr of rows) {
    if (tr.querySelectorAll("th").length > 0) continue;
    const cells = tr.querySelectorAll("td");
    if (cells.length === 0) continue;

    const firstText = cells[0].text;
    if (CHECKBOX_ALL_GLYPHS.test(firstText)) {
      // First checklist row whose marker is a heavy checkmark (✓/✔) is conventionally
      // a column-header row ("✓ | Aufgabe | Dokument | Zuständig"). Skip it.
      if (!firstChecklistRowSeen && HEADER_CHECKMARK_GLYPHS.test(firstText)) {
        firstChecklistRowSeen = true;
        continue;
      }
      firstChecklistRowSeen = true;
      const checked = CHECKBOX_CHECKED_GLYPHS.test(firstText);
      const descHtml = (cells[1]?.innerHTML || "").trim();
      if (!descHtml) continue;
      // Strip a single <p>...</p> wrapper so meta can sit inside the same paragraph
      const singlePMatch = descHtml.match(/^<p>([\s\S]*)<\/p>$/i);
      const innerHtml = singlePMatch && !/<p[\s>]/i.test(singlePMatch[1]) ? singlePMatch[1] : descHtml;
      const meta = cells.slice(2).map((c) => c.text.trim()).filter(Boolean);
      const metaSuffix = meta.length > 0 ? ` <em>— ${escapeHtml(meta.join(" — "))}</em>` : "";
      buf.push(taskItem(checked, `<p>${innerHtml}${metaSuffix}</p>`));
    } else {
      const headingText = cells.map((c) => c.text.trim()).filter(Boolean).join(" — ");
      if (headingText) {
        flush();
        segments.push(`<h3>${escapeHtml(headingText)}</h3>`);
      }
    }
  }
  flush();
  return segments.join("") || null;
}

export function htmlChecklistsToTaskLists(html: string): string {
  const root = parse(html);

  for (const table of root.querySelectorAll("table")) {
    const replaced = convertChecklistTable(table);
    if (replaced) {
      table.replaceWith(replaced);
    }
  }

  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length > 0) {
      out.push(taskList(buf));
      buf = [];
    }
  };

  for (const child of root.childNodes) {
    if (!(child instanceof HTMLElement)) {
      if (child.toString().trim() === "") continue;
      flush();
      out.push(child.toString());
      continue;
    }
    if (child.tagName === "P") {
      const txt = child.text;
      if (LINE_PREFIX_CHECKED.test(txt)) {
        buf.push(taskItem(true, child.innerHTML.replace(LINE_PREFIX_CHECKED, "")));
        continue;
      }
      if (LINE_PREFIX_UNCHECKED.test(txt)) {
        buf.push(taskItem(false, child.innerHTML.replace(LINE_PREFIX_UNCHECKED, "")));
        continue;
      }
    }
    flush();
    out.push(child.toString());
  }
  flush();
  return out.join("");
}
