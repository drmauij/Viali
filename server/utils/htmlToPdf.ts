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

const BRIEF_TYPE_LABELS: Record<string, string> = {
  surgery_discharge: "Austrittsbrief – Chirurgie",
  anesthesia_discharge: "Austrittsbrief – Anästhesie",
  anesthesia_overnight_discharge: "Austrittsbrief – Anästhesie (Übernachtung)",
  prescription: "Rezept",
};

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
    return node.text;
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
  const maxTextWidth = pageWidth - MARGIN * 2;
  const state: RenderState = { y: HEADER_HEIGHT };

  // Pre-fetch logo as base64 data URL (used for header on every page)
  let logoDataUrl: string | null = null;
  if (opts.hospitalLogoUrl) {
    logoDataUrl = await fetchImageAsDataUrl(opts.hospitalLogoUrl);
  }

  // Brief type title
  pdf.setFontSize(12);
  pdf.setFont("helvetica", "bold");
  pdf.text(
    BRIEF_TYPE_LABELS[opts.briefType] || "Austrittsbrief",
    pageWidth / 2,
    state.y,
    { align: "center" },
  );
  state.y += 8;

  // Patient info line
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const formattedBirthday = formatDateByHospital(opts.patientBirthday, opts.dateFormat);
  const patientLine = `Patient: ${opts.patientName}  |  Geb.: ${formattedBirthday}`;
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
      pdf.text(
        `Unterschrieben am ${formattedSignedAt}`,
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
