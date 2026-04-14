import { jsPDF } from "jspdf";
import {
  parse as parseHtml,
  HTMLElement,
  Node,
  NodeType,
} from "node-html-parser";

interface DischargeBriefPdfOptions {
  content: string;
  briefType: string;
  patientName: string;
  patientBirthday: string;
  hospitalName: string;
  hospitalLogoUrl?: string;
  hospitalStreet?: string;
  hospitalPostalCode?: string;
  hospitalCity?: string;
  hospitalPhone?: string;
  hospitalEmail?: string;
  signature?: string;
  signedBy?: string;
  signedAt?: Date | null;
  dateFormat?: string | null;
  language?: string;
}

/** Format a date string per hospital dateFormat setting (european dd.MM.yyyy or american MM/dd/yyyy). */
function formatDateByHospital(dateStr: string, format?: string | null): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  if (format === "american") {
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
  }
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

const BRIEF_TYPE_LABELS: Record<string, Record<string, string>> = {
  surgery_discharge: { de: "Chirurgischer Austrittsbericht", en: "Surgery Discharge" },
  anesthesia_discharge: { de: "Anästhesie-Austrittsbericht", en: "Anesthesia Discharge" },
  anesthesia_overnight_discharge: { de: "Anästhesie + Übernachtung", en: "Anesthesia + Overnight" },
  prescription: { de: "Rezept", en: "Prescription" },
  surgery_report: { de: "OP-Bericht", en: "Surgery Report" },
  surgery_estimate: { de: "Kostenvoranschlag", en: "Surgery Estimate" },
  generic: { de: "Allgemein", en: "Generic" },
};

/** Replace Unicode characters unsupported by jsPDF's default WinAnsi encoding with ASCII equivalents. */
function sanitizeForPdf(text: string): string {
  return text
    .replace(/\u2192/g, "->")   // → RIGHTWARDS ARROW
    .replace(/\u2190/g, "<-")   // ← LEFTWARDS ARROW
    .replace(/\u2194/g, "<->")  // ↔ LEFT RIGHT ARROW
    .replace(/\u2013/g, "-")    // – EN DASH
    .replace(/\u2014/g, "--")   // — EM DASH
    .replace(/\u2018/g, "'")    // ' LEFT SINGLE QUOTATION MARK
    .replace(/\u2019/g, "'")    // ' RIGHT SINGLE QUOTATION MARK
    .replace(/\u201C/g, '"')    // " LEFT DOUBLE QUOTATION MARK
    .replace(/\u201D/g, '"')    // " RIGHT DOUBLE QUOTATION MARK
    .replace(/\u2026/g, "...")  // … HORIZONTAL ELLIPSIS
    .replace(/\u00B2/g, "2")    // ² SUPERSCRIPT TWO
    .replace(/\u00B3/g, "3")    // ³ SUPERSCRIPT THREE
    .replace(/\u2265/g, ">=")   // ≥ GREATER-THAN OR EQUAL TO
    .replace(/\u2264/g, "<=");  // ≤ LESS-THAN OR EQUAL TO
}

// Layout constants (mm)
const MARGIN = 15;
const HEADER_HEIGHT = 32; // reserved space at top for header
const FOOTER_HEIGHT = 18; // reserved space at bottom for footer

/** Mutable state object passed by reference to all render helpers. */
interface RenderState {
  y: number;
}

// ---------------------------------------------------------------------------
// Logo fetching
// ---------------------------------------------------------------------------

/** Fetch an image URL and return as base64 data URL. Returns null on failure. */
async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Header / Footer rendering (stamped on every page after content is laid out)
// ---------------------------------------------------------------------------

function renderPageHeader(
  pdf: jsPDF,
  pageNum: number,
  opts: DischargeBriefPdfOptions,
  logoDataUrl: string | null,
): void {
  pdf.setPage(pageNum);
  const pageWidth = pdf.internal.pageSize.getWidth();

  // Logo (left side, top)
  if (logoDataUrl) {
    try {
      const props = pdf.getImageProperties(logoDataUrl);
      const maxW = 40, maxH = 18;
      const ratio = Math.min(maxW / props.width, maxH / props.height);
      const w = props.width * ratio;
      const h = props.height * ratio;
      pdf.addImage(logoDataUrl, MARGIN, 8, w, h);
    } catch {
      // Skip logo if it can't be embedded
    }
  }

  // Clinic name + contact info (right-aligned)
  const rightX = pageWidth - MARGIN;
  let infoY = 12;

  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0, 0, 0);
  if (opts.hospitalName) {
    pdf.text(opts.hospitalName, rightX, infoY, { align: "right" });
    infoY += 4.5;
  }

  pdf.setFontSize(8);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(100, 100, 100);

  if (opts.hospitalStreet) {
    pdf.text(opts.hospitalStreet, rightX, infoY, { align: "right" });
    infoY += 3.5;
  }
  if (opts.hospitalPostalCode || opts.hospitalCity) {
    const cityLine = [opts.hospitalPostalCode, opts.hospitalCity].filter(Boolean).join(" ");
    pdf.text(cityLine, rightX, infoY, { align: "right" });
    infoY += 3.5;
  }
  if (opts.hospitalPhone) {
    pdf.text(`Tel: ${opts.hospitalPhone}`, rightX, infoY, { align: "right" });
    infoY += 3.5;
  }
  if (opts.hospitalEmail) {
    pdf.text(opts.hospitalEmail, rightX, infoY, { align: "right" });
  }

  // Reset text color
  pdf.setTextColor(0, 0, 0);

  // Header separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.line(MARGIN, HEADER_HEIGHT - 2, pageWidth - MARGIN, HEADER_HEIGHT - 2);
}

function renderPageFooter(
  pdf: jsPDF,
  pageNum: number,
  opts: DischargeBriefPdfOptions,
): void {
  pdf.setPage(pageNum);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const footerY = pageHeight - 10;

  // Footer separator line
  pdf.setDrawColor(200, 200, 200);
  pdf.line(MARGIN, footerY - 3, pageWidth - MARGIN, footerY - 3);

  // Compact contact line
  const parts: string[] = [];
  if (opts.hospitalName) parts.push(opts.hospitalName);
  if (opts.hospitalStreet) parts.push(opts.hospitalStreet);
  const cityParts = [opts.hospitalPostalCode, opts.hospitalCity].filter(Boolean);
  if (cityParts.length) parts.push(cityParts.join(" "));
  if (opts.hospitalPhone) parts.push(`Tel: ${opts.hospitalPhone}`);
  if (opts.hospitalEmail) parts.push(opts.hospitalEmail);

  pdf.setFontSize(7);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(130, 130, 130);
  const footerText = parts.join("  |  ");
  pdf.text(footerText, pageWidth / 2, footerY, { align: "center" });
  pdf.setTextColor(0, 0, 0);
}

// ---------------------------------------------------------------------------
// Content helpers
// ---------------------------------------------------------------------------

/**
 * Extract plain text from any node, recursively stripping HTML tags.
 */
function getPlainText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return sanitizeForPdf(node.text);
  }
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    return (node as HTMLElement).childNodes.map(getPlainText).join("");
  }
  return "";
}

/** Add a new page if the needed vertical space would overflow the content zone. */
function checkNewPage(
  pdf: jsPDF,
  neededSpace: number,
  state: RenderState,
): void {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (state.y + neededSpace > pageHeight - FOOTER_HEIGHT) {
    pdf.addPage();
    state.y = HEADER_HEIGHT;
  }
}

// ---------------------------------------------------------------------------
// Render helpers — each mirrors one branch of the old markdown parser
// ---------------------------------------------------------------------------

function renderHeading(
  pdf: jsPDF,
  el: HTMLElement,
  fontSize: number,
  lineHeight: number,
  afterSpacing: number,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  checkNewPage(pdf, fontSize + afterSpacing, state);
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", "bold");

  const text = getPlainText(el).trim();
  const wrapped: string[] = pdf.splitTextToSize(text, maxTextWidth);
  for (const w of wrapped) {
    checkNewPage(pdf, lineHeight, state);
    pdf.text(w, margin, state.y);
    state.y += lineHeight;
  }
  state.y += afterSpacing;
}

function renderHorizontalRule(
  pdf: jsPDF,
  margin: number,
  state: RenderState,
): void {
  checkNewPage(pdf, 6, state);
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setDrawColor(180, 180, 180);
  pdf.line(margin, state.y, pageWidth - margin, state.y);
  state.y += 6;
}

function renderParagraphText(
  pdf: jsPDF,
  text: string,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
  fontStyle: string = "normal",
): void {
  pdf.setFontSize(10);
  pdf.setFont("helvetica", fontStyle);
  const wrapped: string[] = pdf.splitTextToSize(text, maxTextWidth);
  for (const w of wrapped) {
    checkNewPage(pdf, 5, state);
    pdf.text(w, margin, state.y);
    state.y += 5;
  }
}

/** Inline text segment with a specific font style. */
interface TextSegment {
  text: string;
  fontStyle: string; // "normal", "bold", "italic", "bolditalic"
}

/** Extract text segments from an element, preserving bold/italic formatting. */
function collectTextSegments(
  node: Node,
  parentBold: boolean,
  parentItalic: boolean,
): TextSegment[] {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = sanitizeForPdf(node.text);
    if (!text) return [];
    let fontStyle = "normal";
    if (parentBold && parentItalic) fontStyle = "bolditalic";
    else if (parentBold) fontStyle = "bold";
    else if (parentItalic) fontStyle = "italic";
    return [{ text, fontStyle }];
  }
  if (node.nodeType !== NodeType.ELEMENT_NODE) return [];
  const el = node as HTMLElement;
  const tag = el.tagName?.toUpperCase();

  // Handle <br> as a line-break marker
  if (tag === "BR") {
    return [{ text: "\n", fontStyle: "normal" }];
  }

  const isBold = parentBold || tag === "STRONG" || tag === "B";
  const isItalic = parentItalic || tag === "EM" || tag === "I";
  const segments: TextSegment[] = [];
  for (const child of el.childNodes) {
    segments.push(...collectTextSegments(child, isBold, isItalic));
  }
  return segments;
}

/**
 * Render a paragraph with inline bold/italic support.
 * Groups consecutive segments by style and renders each run.
 */
function renderParagraph(
  pdf: jsPDF,
  el: HTMLElement,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  const segments = collectTextSegments(el, false, false);
  // Merge adjacent segments with same style
  const merged: TextSegment[] = [];
  for (const seg of segments) {
    if (merged.length > 0 && merged[merged.length - 1].fontStyle === seg.fontStyle) {
      merged[merged.length - 1].text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }

  // Split merged segments into lines at \n boundaries (from <br> tags)
  const lines: TextSegment[][] = [[]];
  for (const seg of merged) {
    const parts = seg.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]); // start a new line
      if (parts[i]) {
        lines[lines.length - 1].push({ text: parts[i], fontStyle: seg.fontStyle });
      }
    }
  }

  const totalText = lines.flat().map((s) => s.text).join("").trim();
  if (!totalText) {
    state.y += 3;
    return;
  }

  // Render each line (separated by <br>)
  for (const lineSegs of lines) {
    const lineText = lineSegs.map((s) => s.text).join("").trim();
    if (!lineText) {
      // Empty line from consecutive <br> tags
      state.y += 3;
      continue;
    }

    const uniqueStyles = new Set(lineSegs.map((s) => s.fontStyle));
    if (uniqueStyles.size <= 1) {
      const style = lineSegs[0]?.fontStyle || "normal";
      renderParagraphText(pdf, lineText, margin, maxTextWidth, state, style);
    } else {
      // Mixed styles: render segment by segment, wrapping across lines
      pdf.setFontSize(10);
      const lineHeight = 5;
      let curX = margin;

      for (const seg of lineSegs) {
        const text = seg.text;
        if (!text) continue;

        pdf.setFont("helvetica", seg.fontStyle);

        const words = text.split(/(\s+)/);
        for (const word of words) {
          if (!word) continue;
          const wordWidth = pdf.getTextWidth(word);

          if (curX + wordWidth > margin + maxTextWidth && curX > margin) {
            state.y += lineHeight;
            checkNewPage(pdf, lineHeight, state);
            curX = margin;
          }

          pdf.setFont("helvetica", seg.fontStyle);
          pdf.text(word, curX, state.y);
          curX += wordWidth;
        }
      }
      state.y += lineHeight;
    }
  }
  state.y += 2; // inter-paragraph spacing
}

// TODO: Support nested lists (depth parameter + increased indent) once users start nesting in WYSIWYG
function renderList(
  pdf: jsPDF,
  el: HTMLElement,
  type: "bullet" | "ordered",
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  let itemIndex = 1;
  const indent = type === "bullet" ? 8 : 10;

  for (const child of el.childNodes) {
    // Skip non-element children (whitespace text nodes between <li>s)
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
    const li = child as HTMLElement;
    if (li.tagName?.toUpperCase() !== "LI") continue;

    const segments = collectTextSegments(li, false, false);
    const allText = segments.map((s) => s.text).join("").trim();
    if (!allText) continue;

    pdf.setFontSize(10);

    // Render bullet/number marker
    checkNewPage(pdf, 5, state);
    if (type === "bullet") {
      pdf.setFont("helvetica", "normal");
      pdf.text("\u2022", margin + 2, state.y);
    } else {
      pdf.setFont("helvetica", "normal");
      pdf.text(`${String(itemIndex)}.`, margin + 2, state.y);
    }

    // Merge adjacent segments with same style
    const merged: TextSegment[] = [];
    for (const seg of segments) {
      if (merged.length > 0 && merged[merged.length - 1].fontStyle === seg.fontStyle) {
        merged[merged.length - 1].text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    // Check if all segments share the same style
    const uniqueStyles = new Set(merged.map((s) => s.fontStyle));
    if (uniqueStyles.size === 1) {
      pdf.setFont("helvetica", merged[0].fontStyle);
      const wrapped: string[] = pdf.splitTextToSize(allText, maxTextWidth - indent);
      for (let i = 0; i < wrapped.length; i++) {
        if (i > 0) checkNewPage(pdf, 5, state);
        pdf.text(wrapped[i], margin + indent, state.y);
        if (i < wrapped.length - 1) state.y += 5;
      }
    } else {
      // Mixed styles within list item
      const lineWidth = maxTextWidth - indent;
      let curX = margin + indent;
      for (const seg of merged) {
        if (!seg.text) continue;
        pdf.setFont("helvetica", seg.fontStyle);
        const words = seg.text.split(/(\s+)/);
        for (const word of words) {
          if (!word) continue;
          const wordWidth = pdf.getTextWidth(word);
          if (curX + wordWidth > margin + indent + lineWidth && curX > margin + indent) {
            state.y += 5;
            checkNewPage(pdf, 5, state);
            curX = margin + indent;
          }
          pdf.setFont("helvetica", seg.fontStyle);
          pdf.text(word, curX, state.y);
          curX += wordWidth;
        }
      }
    }

    state.y += 5;
    itemIndex++;
  }
}

// ---------------------------------------------------------------------------
// Table rendering
// ---------------------------------------------------------------------------

function renderTable(
  pdf: jsPDF,
  el: HTMLElement,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  const cellPadding = 2;
  const rowHeight = 6;
  const fontSize = 9;

  // Collect all rows (from thead + tbody or direct tr children)
  // Detect header rows by <thead> wrapper OR by presence of <th> cells
  const rows: { cells: string[]; isHeader: boolean }[] = [];
  const collectRows = (parent: HTMLElement, isHeader: boolean) => {
    for (const child of parent.childNodes) {
      if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
      const childEl = child as HTMLElement;
      const tag = childEl.tagName?.toUpperCase();
      if (tag === "TR") {
        const cells: string[] = [];
        let hasThCells = false;
        for (const td of childEl.childNodes) {
          if (td.nodeType !== NodeType.ELEMENT_NODE) continue;
          const tdTag = (td as HTMLElement).tagName?.toUpperCase();
          if (tdTag === "TD" || tdTag === "TH") {
            cells.push(getPlainText(td).trim());
            if (tdTag === "TH") hasThCells = true;
          }
        }
        if (cells.length > 0) rows.push({ cells, isHeader: isHeader || hasThCells });
      } else if (tag === "THEAD") {
        collectRows(childEl, true);
      } else if (tag === "TBODY") {
        collectRows(childEl, false);
      }
    }
  };
  collectRows(el, false);

  if (rows.length === 0) return;

  // Determine column count and compute content-aware widths
  const colCount = Math.max(...rows.map((r) => r.cells.length));

  // Measure max text width per column, then distribute proportionally
  pdf.setFontSize(fontSize);
  pdf.setFont("helvetica", "normal");
  const colMaxWidths: number[] = new Array(colCount).fill(0);
  for (const row of rows) {
    for (let c = 0; c < colCount; c++) {
      const text = row.cells[c] || "";
      const textW = pdf.getTextWidth(text) + cellPadding * 2;
      colMaxWidths[c] = Math.max(colMaxWidths[c], textW);
    }
  }
  // Minimum column width to prevent columns from being too narrow
  const minColWidth = 15;
  const totalNatural = colMaxWidths.reduce((sum, w) => sum + Math.max(w, minColWidth), 0);
  const colWidths: number[] = colMaxWidths.map((w) => {
    const clamped = Math.max(w, minColWidth);
    return (clamped / totalNatural) * maxTextWidth;
  });

  // Render each row
  for (const row of rows) {
    // Calculate row height based on text wrapping
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", row.isHeader ? "bold" : "normal");
    let maxLines = 1;
    const wrappedCells: string[][] = [];
    for (let c = 0; c < colCount; c++) {
      const text = row.cells[c] || "";
      const wrapped = pdf.splitTextToSize(text, colWidths[c] - cellPadding * 2);
      wrappedCells.push(wrapped);
      maxLines = Math.max(maxLines, wrapped.length);
    }
    const actualRowHeight = Math.max(rowHeight, maxLines * 4.5 + cellPadding * 2);

    checkNewPage(pdf, actualRowHeight, state);

    // Draw cell backgrounds for header rows
    if (row.isHeader) {
      pdf.setFillColor(240, 240, 240);
      pdf.rect(margin, state.y - 4, maxTextWidth, actualRowHeight, "F");
    }

    // Draw cell borders and text
    let xOffset = 0;
    for (let c = 0; c < colCount; c++) {
      const x = margin + xOffset;
      const cw = colWidths[c];

      // Cell border
      pdf.setDrawColor(200, 200, 200);
      pdf.rect(x, state.y - 4, cw, actualRowHeight);

      // Cell text
      pdf.setFontSize(fontSize);
      pdf.setFont("helvetica", row.isHeader ? "bold" : "normal");
      pdf.setTextColor(0, 0, 0);
      const lines = wrappedCells[c] || [];
      for (let l = 0; l < lines.length; l++) {
        pdf.text(lines[l], x + cellPadding, state.y + l * 4.5);
      }
      xOffset += cw;
    }

    state.y += actualRowHeight;
  }
  state.y += 2; // spacing after table
}

// ---------------------------------------------------------------------------
// Recursive node traversal
// ---------------------------------------------------------------------------

function renderNode(
  pdf: jsPDF,
  node: Node,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  // Text nodes (outside of any tag)
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = sanitizeForPdf(node.text).trim();
    if (text) {
      renderParagraphText(pdf, text, margin, maxTextWidth, state);
    }
    return;
  }

  // Only process element nodes from here
  if (node.nodeType !== NodeType.ELEMENT_NODE) return;

  const el = node as HTMLElement;
  const tag = el.tagName?.toUpperCase();

  switch (tag) {
    case "H1":
      renderHeading(pdf, el, 14, 7, 2, margin, maxTextWidth, state);
      break;
    case "H2":
      renderHeading(pdf, el, 12, 6, 2, margin, maxTextWidth, state);
      break;
    case "H3":
      renderHeading(pdf, el, 11, 6, 1, margin, maxTextWidth, state);
      break;
    case "HR":
      renderHorizontalRule(pdf, margin, state);
      break;
    case "UL":
      renderList(pdf, el, "bullet", margin, maxTextWidth, state);
      break;
    case "OL":
      renderList(pdf, el, "ordered", margin, maxTextWidth, state);
      break;
    case "P":
      renderParagraph(pdf, el, margin, maxTextWidth, state);
      break;
    case "TABLE":
      renderTable(pdf, el, margin, maxTextWidth, state);
      break;
    case "BR":
      state.y += 3;
      break;
    default:
      // For unknown/wrapper tags (div, span, strong, em, etc.), recurse into children
      for (const child of el.childNodes) {
        renderNode(pdf, child, margin, maxTextWidth, state);
      }
      break;
  }
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function renderDischargeBriefPdf(
  opts: DischargeBriefPdfOptions,
): Promise<Buffer> {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const maxTextWidth = pageWidth - MARGIN * 2;
  const state: RenderState = { y: HEADER_HEIGHT };

  // Pre-fetch logo as base64 data URL (used for header on every page)
  let logoDataUrl: string | null = null;
  if (opts.hospitalLogoUrl) {
    logoDataUrl = await fetchImageAsDataUrl(opts.hospitalLogoUrl);
  }

  // Brief type title (add gap below header line)
  state.y += 6;
  const lang = opts.language || 'de';
  const briefTypeLabel = BRIEF_TYPE_LABELS[opts.briefType]?.[lang]
    || BRIEF_TYPE_LABELS[opts.briefType]?.de
    || (lang === 'de' ? 'Allgemein' : 'Generic');
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(
    briefTypeLabel,
    pageWidth / 2,
    state.y,
    { align: "center" },
  );
  state.y += 8;

  // Patient info line
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const formattedBirthday = formatDateByHospital(opts.patientBirthday, opts.dateFormat);
  const dobLabel = lang === 'de' ? 'Geb.' : 'DOB';
  const patientLine = `Patient: ${opts.patientName}  |  ${dobLabel}: ${formattedBirthday}`;
  pdf.text(patientLine, MARGIN, state.y);
  state.y += 5;

  // Separator line
  pdf.setDrawColor(180, 180, 180);
  pdf.line(MARGIN, state.y, pageWidth - MARGIN, state.y);
  state.y += 8;

  // Parse HTML content and render
  const root = parseHtml(opts.content || "");
  for (const child of root.childNodes) {
    renderNode(pdf, child, MARGIN, maxTextWidth, state);
  }

  // Signature section
  if (opts.signature || opts.signedBy) {
    state.y += 10;
    checkNewPage(pdf, 60, state);

    pdf.setDrawColor(180, 180, 180);
    pdf.line(MARGIN, state.y, pageWidth - MARGIN, state.y);
    state.y += 8;

    if (opts.signature) {
      try {
        // Signature is base64 PNG
        const sigData = opts.signature.startsWith("data:")
          ? opts.signature
          : `data:image/png;base64,${opts.signature}`;
        pdf.addImage(sigData, "PNG", MARGIN, state.y, 60, 20);
        state.y += 22;
      } catch {
        // Skip if signature can't be embedded
      }
    }

    if (opts.signedBy) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const lines = opts.signedBy.split("\n");
      for (const line of lines) {
        pdf.text(line, MARGIN, state.y);
        state.y += 5;
      }
    }

    if (opts.signedAt) {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "italic");
      const formattedSignedAt = formatDateByHospital(new Date(opts.signedAt).toISOString(), opts.dateFormat);
      const signedLabel = lang === 'de' ? 'Unterschrieben am' : 'Signed on';
      pdf.text(
        `${signedLabel} ${formattedSignedAt}`,
        MARGIN,
        state.y,
      );
    }
  }

  // Stamp header + footer on every page
  const totalPages = pdf.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    renderPageHeader(pdf, i, opts, logoDataUrl);
    renderPageFooter(pdf, i, opts);
  }

  // Return as Buffer
  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
