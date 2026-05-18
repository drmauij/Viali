import { formatCurrency, formatDate, formatDateTime } from "@/lib/dateUtils";

export interface SurgeryCostsPdfData {
  surgery: {
    id: string;
    date: string;
    surgeryName: string;
    patientName: string;
    status: string;
  };
  duration: { minutes: number; hours: number; x1Time: number | null; a2Time: number | null };
  staffBreakdown: Array<{
    name: string;
    role: string;
    durationHours: number;
    hourlyRate: number;
    cost: number;
  }>;
  staffTotal: number;
  anesthesiaItems: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    cost: number;
  }>;
  anesthesiaTotal: number;
  surgeryItems: Array<{
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    cost: number;
  }>;
  surgeryTotal: number;
  grandTotal: number;
}

type TFunction = (key: string, fallback: string) => string;

interface Options {
  data: SurgeryCostsPdfData;
  hospitalName?: string;
  t: TFunction;
}

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "-";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

export async function generateSurgeryCostsPdf({ data, hospitalName, t }: Options): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 18;

  // --- Header ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(t("business.costs.costBreakdown", "Cost Breakdown"), pageWidth / 2, yPos, { align: "center" });
  yPos += 7;

  if (hospitalName) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(hospitalName, pageWidth / 2, yPos, { align: "center" });
    yPos += 6;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120, 120, 120);
  doc.text(
    `${t("business.invoicePdf.generated", "Generated")}: ${formatDateTime(new Date())}`,
    pageWidth / 2,
    yPos,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  doc.setDrawColor(200, 200, 200);
  doc.line(margin, yPos, pageWidth - margin, yPos);
  yPos += 8;

  // --- Surgery summary ---
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(data.surgery.surgeryName || "-", margin, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const hours = (data.duration.minutes ?? 0) / 60;
  const costPerHour = hours > 0 ? data.grandTotal / hours : 0;

  const summaryLines: Array<[string, string]> = [
    [t("business.costs.date", "Date"), formatDate(data.surgery.date)],
    [t("business.costs.patient", "Patient"), data.surgery.patientName || "-"],
    [t("business.costs.duration", "Duration"), formatDuration(data.duration.minutes)],
    [t("common.status", "Status"), data.surgery.status || "-"],
    [t("business.costs.costPerHour", "Cost/Hour"), formatCurrency(costPerHour)],
  ];
  for (const [label, value] of summaryLines) {
    doc.setFont("helvetica", "normal");
    doc.text(`${label}:`, margin, yPos);
    doc.setFont("helvetica", "bold");
    doc.text(value, margin + 35, yPos);
    yPos += 6;
  }
  yPos += 4;

  // --- Staff costs ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(t("business.costs.staffCosts", "Staff Costs"), margin, yPos);
  yPos += 5;

  if (data.staffBreakdown.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [[
        t("common.name", "Name"),
        t("common.role", "Role"),
        t("business.costs.hours", "Hours"),
        t("business.costs.hourlyRate", "Hourly rate"),
        t("business.costs.cost", "Cost"),
      ]],
      body: data.staffBreakdown.map((s) => [
        s.name,
        s.role,
        s.durationHours.toFixed(2),
        formatCurrency(s.hourlyRate),
        formatCurrency(s.cost),
      ]),
      foot: [[
        { content: t("business.costs.totalStaffCosts", "Total staff costs"), colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(data.staffTotal), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [139, 92, 246] },
      footStyles: { fillColor: [243, 240, 255], textColor: 0 },
      columnStyles: {
        2: { halign: "right" },
        3: { halign: "right" },
        4: { halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text(t("business.costs.noStaffData", "No staff data available"), margin, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 8;
  }

  // --- Anesthesia items ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(t("business.costs.anesthesiaCosts", "Anesthesia Costs"), margin, yPos);
  yPos += 5;

  if (data.anesthesiaItems.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [[
        t("common.item", "Item"),
        t("common.quantity", "Quantity"),
        t("business.costs.unitPrice", "Unit price"),
        t("business.costs.cost", "Cost"),
      ]],
      body: data.anesthesiaItems.map((i) => [
        i.itemName,
        String(i.quantity),
        formatCurrency(i.unitPrice),
        formatCurrency(i.cost),
      ]),
      foot: [[
        { content: t("business.costs.totalAnesthesiaCosts", "Total anesthesia costs"), colSpan: 3, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(data.anesthesiaTotal), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [16, 185, 129] },
      footStyles: { fillColor: [236, 253, 245], textColor: 0 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 6;
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text(t("business.costs.noAnesthesiaItems", "No anesthesia items recorded"), margin, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 8;
  }

  // --- Surgery items ---
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text(t("business.costs.surgeryCosts", "Surgery Costs"), margin, yPos);
  yPos += 5;

  if (data.surgeryItems.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [[
        t("common.item", "Item"),
        t("common.quantity", "Quantity"),
        t("business.costs.unitPrice", "Unit price"),
        t("business.costs.cost", "Cost"),
      ]],
      body: data.surgeryItems.map((i) => [
        i.itemName,
        String(i.quantity),
        formatCurrency(i.unitPrice),
        formatCurrency(i.cost),
      ]),
      foot: [[
        { content: t("business.costs.totalSurgeryCosts", "Total surgery costs"), colSpan: 3, styles: { halign: "right", fontStyle: "bold" } },
        { content: formatCurrency(data.surgeryTotal), styles: { halign: "right", fontStyle: "bold" } },
      ]],
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [59, 130, 246] },
      footStyles: { fillColor: [239, 246, 255], textColor: 0 },
      columnStyles: {
        1: { halign: "right" },
        2: { halign: "right" },
        3: { halign: "right" },
      },
      margin: { left: margin, right: margin },
    });
    yPos = (doc as any).lastAutoTable.finalY + 8;
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(120, 120, 120);
    doc.text(t("business.costs.noSurgeryItems", "No surgery items recorded"), margin, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
  }

  // --- Grand total ---
  const grandTotalHeight = 16;
  if (yPos + grandTotalHeight > doc.internal.pageSize.getHeight() - margin) {
    doc.addPage();
    yPos = margin + 4;
  }
  doc.setFillColor(243, 244, 246);
  doc.rect(margin, yPos, pageWidth - 2 * margin, grandTotalHeight, "F");
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(t("business.costs.grandTotal", "Grand total"), margin + 4, yPos + 10);
  doc.setFontSize(14);
  doc.text(formatCurrency(data.grandTotal), pageWidth - margin - 4, yPos + 10, { align: "right" });

  const safeName = (data.surgery.surgeryName || "surgery")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const dateKey = (data.surgery.date || "").slice(0, 10);
  doc.save(`cost-breakdown-${dateKey}-${safeName}.pdf`);
}
