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
  signature?: string;
  signedBy?: string;
  signedAt?: Date | null;
}

const BRIEF_TYPE_LABELS: Record<string, string> = {
  surgery_discharge: "Austrittsbrief – Chirurgie",
  anesthesia_discharge: "Austrittsbrief – Anästhesie",
  anesthesia_overnight_discharge: "Austrittsbrief – Anästhesie (Übernachtung)",
};

/** Mutable state object passed by reference to all render helpers. */
interface RenderState {
  y: number;
}

/**
 * Extract plain text from any node, recursively stripping HTML tags.
 * This mirrors the old `renderInlineFormatting` which stripped bold/italic markdown.
 */
function getPlainText(node: Node): string {
  if (node.nodeType === NodeType.TEXT_NODE) {
    return node.text;
  }
  if (node.nodeType === NodeType.ELEMENT_NODE) {
    return (node as HTMLElement).childNodes.map(getPlainText).join("");
  }
  return "";
}

/** Add a new page if the needed vertical space would overflow. */
function checkNewPage(
  pdf: jsPDF,
  neededSpace: number,
  state: RenderState,
): void {
  const pageHeight = pdf.internal.pageSize.getHeight();
  if (state.y + neededSpace > pageHeight - 25) {
    pdf.addPage();
    state.y = 20;
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
): void {
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const wrapped: string[] = pdf.splitTextToSize(text, maxTextWidth);
  for (const w of wrapped) {
    checkNewPage(pdf, 5, state);
    pdf.text(w, margin, state.y);
    state.y += 5;
  }
}

function renderParagraph(
  pdf: jsPDF,
  el: HTMLElement,
  margin: number,
  maxTextWidth: number,
  state: RenderState,
): void {
  const text = getPlainText(el).trim();
  if (!text) {
    // Empty paragraph — add small spacing (same as blank line in markdown)
    state.y += 3;
    return;
  }
  renderParagraphText(pdf, text, margin, maxTextWidth, state);
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

  for (const child of el.childNodes) {
    // Skip non-element children (whitespace text nodes between <li>s)
    if (child.nodeType !== NodeType.ELEMENT_NODE) continue;
    const li = child as HTMLElement;
    if (li.tagName?.toUpperCase() !== "LI") continue;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");

    const text = getPlainText(li).trim();
    if (!text) continue;

    if (type === "bullet") {
      const wrapped: string[] = pdf.splitTextToSize(text, maxTextWidth - 8);
      for (let i = 0; i < wrapped.length; i++) {
        checkNewPage(pdf, 5, state);
        if (i === 0) {
          pdf.text("\u2022", margin + 2, state.y);
        }
        pdf.text(wrapped[i], margin + 8, state.y);
        state.y += 5;
      }
    } else {
      // ordered
      const num = String(itemIndex);
      const wrapped: string[] = pdf.splitTextToSize(text, maxTextWidth - 10);
      for (let i = 0; i < wrapped.length; i++) {
        checkNewPage(pdf, 5, state);
        if (i === 0) {
          pdf.text(`${num}.`, margin + 2, state.y);
        }
        pdf.text(wrapped[i], margin + 10, state.y);
        state.y += 5;
      }
    }
    itemIndex++;
  }
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
    const text = node.text.trim();
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
  const margin = 15;
  const maxTextWidth = pageWidth - margin * 2;
  const state: RenderState = { y: 20 };

  // Header: Hospital name + brief type
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  if (opts.hospitalName) {
    pdf.text(opts.hospitalName, pageWidth / 2, state.y, { align: "center" });
    state.y += 8;
  }

  pdf.setFontSize(12);
  pdf.text(
    BRIEF_TYPE_LABELS[opts.briefType] || "Austrittsbrief",
    pageWidth / 2,
    state.y,
    { align: "center" },
  );
  state.y += 10;

  // Patient info line
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const patientLine = `Patient: ${opts.patientName}  |  Geb.: ${opts.patientBirthday}`;
  pdf.text(patientLine, margin, state.y);
  state.y += 5;

  // Separator line
  pdf.setDrawColor(180, 180, 180);
  pdf.line(margin, state.y, pageWidth - margin, state.y);
  state.y += 8;

  // Parse HTML content and render
  const root = parseHtml(opts.content || "");
  for (const child of root.childNodes) {
    renderNode(pdf, child, margin, maxTextWidth, state);
  }

  // Signature section
  if (opts.signature || opts.signedBy) {
    state.y += 10;
    checkNewPage(pdf, 60, state);

    pdf.setDrawColor(180, 180, 180);
    pdf.line(margin, state.y, pageWidth - margin, state.y);
    state.y += 8;

    if (opts.signature) {
      try {
        // Signature is base64 PNG
        const sigData = opts.signature.startsWith("data:")
          ? opts.signature
          : `data:image/png;base64,${opts.signature}`;
        pdf.addImage(sigData, "PNG", margin, state.y, 60, 20);
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
        pdf.text(line, margin, state.y);
        state.y += 5;
      }
    }

    if (opts.signedAt) {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "italic");
      pdf.text(
        `Unterschrieben am ${new Date(opts.signedAt).toLocaleDateString("de-CH")}`,
        margin,
        state.y,
      );
    }
  }

  // Return as Buffer
  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
