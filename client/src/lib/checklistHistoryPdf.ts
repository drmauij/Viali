import { formatDateTimeLong } from "@/lib/dateUtils";

export interface ChecklistHistoryPdfEntry {
  date: Date;
  userName: string;
  status: 'completed' | 'skipped';
  comment?: string;
  reason?: string;
  signature?: string;
}

type TFunction = (key: string) => string;

export interface ChecklistHistoryPdfOptions {
  templateName: string;
  recurrency: string;
  hospitalName: string;
  entries: ChecklistHistoryPdfEntry[];
  t: TFunction;
}

export async function generateChecklistHistoryPdf(options: ChecklistHistoryPdfOptions): Promise<void> {
  const { templateName, recurrency, hospitalName, entries, t } = options;

  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();

  // Header
  doc.setFontSize(16);
  doc.text(t("checklists.pdfTitle"), 14, 15);
  doc.setFontSize(12);
  doc.text(templateName, 14, 23);
  doc.setFontSize(10);
  doc.text(hospitalName, 14, 30);
  doc.text(`${t("checklists.recurrency." + recurrency)} | ${t("checklists.pdfGenerated")}: ${new Date().toLocaleDateString()}`, 14, 36);

  const tableHeaders = [
    t("checklists.dateTime"),
    t("checklists.person"),
    t("checklists.status"),
    t("checklists.commentReason"),
    t("checklists.signature"),
  ];

  const tableBody = entries.map(entry => [
    formatDateTimeLong(entry.date),
    entry.userName,
    entry.status === 'completed' ? t("checklists.completed") : t("checklists.skipped"),
    entry.comment || entry.reason || '-',
    entry.signature ? '[sig]' : '-',
  ]);

  const signatureImages: { row: number; data: string }[] = [];
  entries.forEach((entry, i) => {
    if (entry.signature) {
      signatureImages.push({ row: i, data: entry.signature });
    }
  });

  autoTable(doc, {
    head: [tableHeaders],
    body: tableBody,
    startY: 42,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [41, 128, 185] },
    columnStyles: {
      0: { cellWidth: 38 },
      1: { cellWidth: 35 },
      2: { cellWidth: 22 },
      3: { cellWidth: 55 },
      4: { cellWidth: 30 },
    },
    didDrawCell: (data) => {
      if (data.section === 'body' && data.column.index === 4) {
        const sigEntry = signatureImages.find(s => s.row === data.row.index);
        if (sigEntry) {
          try {
            const imgData = sigEntry.data.startsWith('data:') ? sigEntry.data : `data:image/png;base64,${sigEntry.data}`;
            doc.addImage(imgData, 'PNG', data.cell.x + 1, data.cell.y + 1, 20, data.cell.height - 2);
          } catch {
            // If image fails, leave the [sig] text
          }
        }
      }
    },
    didDrawPage: (data) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.text(
        `${data.pageNumber} / ${pageCount}`,
        doc.internal.pageSize.width - 20,
        doc.internal.pageSize.height - 10
      );
    },
  });

  const safeName = templateName.replace(/[^a-zA-Z0-9]/g, '_');
  doc.save(`checklist_history_${safeName}.pdf`);
}
