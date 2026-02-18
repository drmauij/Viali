import { jsPDF } from "jspdf";

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

export async function renderDischargeBriefPdf(
  opts: DischargeBriefPdfOptions,
): Promise<Buffer> {
  const pdf = new jsPDF();
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const maxTextWidth = pageWidth - margin * 2;
  let y = 20;

  const checkNewPage = (neededSpace: number) => {
    if (y + neededSpace > pageHeight - 25) {
      pdf.addPage();
      y = 20;
    }
  };

  // Header: Hospital name + brief type
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  if (opts.hospitalName) {
    pdf.text(opts.hospitalName, pageWidth / 2, y, { align: "center" });
    y += 8;
  }

  pdf.setFontSize(12);
  pdf.text(
    BRIEF_TYPE_LABELS[opts.briefType] || "Austrittsbrief",
    pageWidth / 2,
    y,
    { align: "center" },
  );
  y += 10;

  // Patient info line
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const patientLine = `Patient: ${opts.patientName}  |  Geb.: ${opts.patientBirthday}`;
  pdf.text(patientLine, margin, y);
  y += 5;

  // Separator line
  pdf.setDrawColor(180, 180, 180);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 8;

  // Parse markdown content and render
  const lines = opts.content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      y += 3; // Empty line spacing
      continue;
    }

    // H1
    if (trimmed.startsWith("# ")) {
      checkNewPage(12);
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      const text = trimmed.replace(/^# /, "");
      const wrapped = pdf.splitTextToSize(text, maxTextWidth);
      for (const w of wrapped) {
        checkNewPage(7);
        pdf.text(w, margin, y);
        y += 7;
      }
      y += 2;
      continue;
    }

    // H2
    if (trimmed.startsWith("## ")) {
      checkNewPage(10);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      const text = trimmed.replace(/^## /, "");
      const wrapped = pdf.splitTextToSize(text, maxTextWidth);
      for (const w of wrapped) {
        checkNewPage(6);
        pdf.text(w, margin, y);
        y += 6;
      }
      y += 2;
      continue;
    }

    // H3
    if (trimmed.startsWith("### ")) {
      checkNewPage(8);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      const text = trimmed.replace(/^### /, "");
      const wrapped = pdf.splitTextToSize(text, maxTextWidth);
      for (const w of wrapped) {
        checkNewPage(6);
        pdf.text(w, margin, y);
        y += 6;
      }
      y += 1;
      continue;
    }

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      checkNewPage(6);
      pdf.setDrawColor(180, 180, 180);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 6;
      continue;
    }

    // Bullet list
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const text = trimmed.replace(/^[-*] /, "");
      const rendered = renderInlineFormatting(pdf, text);
      const wrapped = pdf.splitTextToSize(rendered, maxTextWidth - 8);
      for (let i = 0; i < wrapped.length; i++) {
        checkNewPage(5);
        if (i === 0) {
          pdf.text("\u2022", margin + 2, y);
        }
        pdf.text(wrapped[i], margin + 8, y);
        y += 5;
      }
      continue;
    }

    // Numbered list
    const numMatch = trimmed.match(/^(\d+)\.\s(.+)/);
    if (numMatch) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      const num = numMatch[1];
      const text = numMatch[2];
      const rendered = renderInlineFormatting(pdf, text);
      const wrapped = pdf.splitTextToSize(rendered, maxTextWidth - 10);
      for (let i = 0; i < wrapped.length; i++) {
        checkNewPage(5);
        if (i === 0) {
          pdf.text(`${num}.`, margin + 2, y);
        }
        pdf.text(wrapped[i], margin + 10, y);
        y += 5;
      }
      continue;
    }

    // Regular paragraph
    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    const rendered = renderInlineFormatting(pdf, trimmed);
    const wrapped = pdf.splitTextToSize(rendered, maxTextWidth);
    for (const w of wrapped) {
      checkNewPage(5);
      pdf.text(w, margin, y);
      y += 5;
    }
  }

  // Signature section
  if (opts.signature || opts.signedBy) {
    y += 10;
    checkNewPage(40);

    pdf.setDrawColor(180, 180, 180);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 8;

    if (opts.signature) {
      try {
        // Signature is base64 PNG
        const sigData = opts.signature.startsWith("data:")
          ? opts.signature
          : `data:image/png;base64,${opts.signature}`;
        pdf.addImage(sigData, "PNG", margin, y, 60, 20);
        y += 22;
      } catch {
        // Skip if signature can't be embedded
      }
    }

    if (opts.signedBy) {
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(opts.signedBy, margin, y);
      y += 5;
    }

    if (opts.signedAt) {
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "italic");
      pdf.text(
        `Unterschrieben am ${new Date(opts.signedAt).toLocaleDateString("de-CH")}`,
        margin,
        y,
      );
    }
  }

  // Return as Buffer
  const arrayBuffer = pdf.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}

// Strip **bold** and *italic* markdown for plain text rendering
// jsPDF doesn't support mixed inline styles, so we strip them
function renderInlineFormatting(_pdf: jsPDF, text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1") // bold
    .replace(/\*(.+?)\*/g, "$1") // italic
    .replace(/_(.+?)_/g, "$1"); // italic alt
}
