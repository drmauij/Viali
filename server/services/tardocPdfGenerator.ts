/**
 * TARDOC PDF Invoice Generator
 * Generates Forum Datenaustausch standard invoice form layout.
 * Uses jsPDF for server-side PDF generation (consistent with server/utils/htmlToPdf.ts).
 */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { db } from '../db';
import { tardocInvoices, tardocInvoiceItems, hospitals } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';

// Extend jsPDF types for autoTable plugin
declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

const MARGIN = 15;
const PAGE_WIDTH = 210; // A4 mm
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

interface PdfInvoiceData {
  invoiceNumber: number;
  billingModel: string;
  lawType: string;
  treatmentType: string | null;
  treatmentReason: string | null;
  caseNumber: string | null;
  caseDate: string | null;
  caseDateEnd: string | null;
  treatmentCanton: string | null;
  billerGln: string | null;
  billerZsr: string | null;
  providerGln: string | null;
  providerZsr: string | null;
  referringPhysicianGln: string | null;
  insurerGln: string | null;
  insurerName: string | null;
  insuranceNumber: string | null;
  ahvNumber: string | null;
  patientSurname: string | null;
  patientFirstName: string | null;
  patientBirthday: string | null;
  patientSex: string | null;
  patientStreet: string | null;
  patientPostalCode: string | null;
  patientCity: string | null;
  tpValue: string | null;
  subtotalTp: string | null;
  subtotalChf: string | null;
  vatAmount: string | null;
  totalChf: string | null;
  createdAt: Date | null;
  items: Array<{
    tardocCode: string;
    description: string;
    treatmentDate: string;
    session: number | null;
    quantity: number;
    taxPoints: string;
    tpValue: string;
    scalingFactor: string | null;
    sideCode: string | null;
    providerGln: string | null;
    amountChf: string;
  }>;
  hospital: {
    companyName: string | null;
    companyStreet: string | null;
    companyPostalCode: string | null;
    companyCity: string | null;
    companyPhone: string | null;
    companyEmail: string | null;
    companyGln: string | null;
    companyZsr: string | null;
    companyBankIban: string | null;
    companyBankName: string | null;
  };
}

function formatDateShort(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = dateStr.split('T')[0];
  const parts = d.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return d;
}

export function generateTardocPdf(data: PdfInvoiceData): Buffer {
  const pdf = new jsPDF('portrait', 'mm', 'a4');
  const h = data.hospital;

  let y = MARGIN;

  // ====== Header: Biller/Provider info ======
  pdf.setFontSize(10);
  pdf.setFont('helvetica', 'bold');
  pdf.text(h.companyName || 'Unknown', MARGIN, y);
  y += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  if (h.companyStreet) { pdf.text(h.companyStreet, MARGIN, y); y += 3.5; }
  if (h.companyPostalCode || h.companyCity) {
    pdf.text(`${h.companyPostalCode || ''} ${h.companyCity || ''}`.trim(), MARGIN, y);
    y += 3.5;
  }
  if (h.companyPhone) { pdf.text(`Tel: ${h.companyPhone}`, MARGIN, y); y += 3.5; }
  if (h.companyGln) { pdf.text(`GLN: ${h.companyGln}`, MARGIN, y); y += 3.5; }
  if (h.companyZsr) { pdf.text(`ZSR: ${h.companyZsr}`, MARGIN, y); y += 3.5; }

  // Invoice title (right side)
  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  const titleText = data.billingModel === 'TG' ? 'Rechnung (Tiers Garant)' : 'Rechnung (Tiers Payant)';
  pdf.text(titleText, PAGE_WIDTH - MARGIN, MARGIN, { align: 'right' });

  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const rightX = PAGE_WIDTH - MARGIN;
  let rightY = MARGIN + 6;
  pdf.text(`Nr. ${data.invoiceNumber}`, rightX, rightY, { align: 'right' }); rightY += 4;
  pdf.text(`Datum: ${formatDateShort(data.createdAt?.toISOString().split('T')[0] || null)}`, rightX, rightY, { align: 'right' }); rightY += 4;
  pdf.text(`Gesetz: ${data.lawType}`, rightX, rightY, { align: 'right' }); rightY += 4;
  if (data.caseNumber) { pdf.text(`Fall-Nr: ${data.caseNumber}`, rightX, rightY, { align: 'right' }); rightY += 4; }

  y = Math.max(y, rightY) + 4;

  // ====== Patient & Insurance info ======
  pdf.setDrawColor(200);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 4;

  pdf.setFontSize(8);
  const col1 = MARGIN;
  const col2 = MARGIN + CONTENT_WIDTH / 2;

  // Patient column
  pdf.setFont('helvetica', 'bold');
  pdf.text('Patient', col1, y);
  pdf.text('Versicherung', col2, y);
  y += 4;

  pdf.setFont('helvetica', 'normal');
  pdf.text(`${data.patientSurname || ''} ${data.patientFirstName || ''}`, col1, y);
  pdf.text(data.insurerName || '-', col2, y);
  y += 3.5;

  pdf.text(`Geb.: ${formatDateShort(data.patientBirthday)}`, col1, y);
  pdf.text(`GLN: ${data.insurerGln || '-'}`, col2, y);
  y += 3.5;

  pdf.text(`AHV: ${data.ahvNumber || '-'}`, col1, y);
  pdf.text(`Police: ${data.insuranceNumber || '-'}`, col2, y);
  y += 3.5;

  if (data.patientStreet) {
    pdf.text(data.patientStreet, col1, y);
    y += 3.5;
  }
  if (data.patientPostalCode || data.patientCity) {
    pdf.text(`${data.patientPostalCode || ''} ${data.patientCity || ''}`.trim(), col1, y);
    y += 3.5;
  }

  // Treatment info
  y += 2;
  pdf.setFont('helvetica', 'bold');
  pdf.text('Behandlung', col1, y);
  y += 4;
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Von: ${formatDateShort(data.caseDate)}  Bis: ${formatDateShort(data.caseDateEnd || data.caseDate)}  Kanton: ${data.treatmentCanton || '-'}  Grund: ${data.treatmentReason || '-'}`, col1, y);
  y += 6;

  // ====== Service Lines Table ======
  pdf.setDrawColor(200);
  pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
  y += 2;

  const tableBody = data.items.map(item => [
    formatDateShort(item.treatmentDate),
    item.tardocCode,
    item.description.length > 40 ? item.description.substring(0, 40) + '...' : item.description,
    String(item.session || 1),
    String(item.quantity),
    item.taxPoints,
    parseFloat(item.tpValue).toFixed(4),
    item.scalingFactor || '1.00',
    `${parseFloat(item.amountChf).toFixed(2)}`,
  ]);

  pdf.autoTable({
    startY: y,
    head: [['Datum', 'Code', 'Bezeichnung', 'Sitz.', 'Anz.', 'TP', 'TPW', 'SF', 'Betrag']],
    body: tableBody,
    margin: { left: MARGIN, right: MARGIN },
    styles: {
      fontSize: 7,
      cellPadding: 1.5,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { cellWidth: 18 }, // Date
      1: { cellWidth: 18 }, // Code
      2: { cellWidth: 'auto' }, // Description
      3: { cellWidth: 10, halign: 'right' }, // Session
      4: { cellWidth: 10, halign: 'right' }, // Qty
      5: { cellWidth: 15, halign: 'right' }, // TP
      6: { cellWidth: 15, halign: 'right' }, // TPW
      7: { cellWidth: 12, halign: 'right' }, // SF
      8: { cellWidth: 20, halign: 'right' }, // Amount
    },
    theme: 'grid',
    didDrawPage: () => {
      // Footer on each page
      pdf.setFontSize(7);
      pdf.setTextColor(128);
      pdf.text(
        `Seite ${pdf.getNumberOfPages()}`,
        PAGE_WIDTH - MARGIN,
        297 - 8,
        { align: 'right' }
      );
      pdf.setTextColor(0);
    },
  });

  y = pdf.lastAutoTable.finalY + 6;

  // Check if we need a new page for totals
  if (y > 250) {
    pdf.addPage();
    y = MARGIN;
  }

  // ====== Totals ======
  const totalsX = PAGE_WIDTH - MARGIN - 60;
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');

  pdf.text('Taxpunkte Total:', totalsX, y);
  pdf.text(`${parseFloat(data.subtotalTp || '0').toFixed(2)} TP`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 5;

  pdf.text('Taxpunktwert:', totalsX, y);
  pdf.text(`CHF ${parseFloat(data.tpValue || '1').toFixed(4)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 5;

  pdf.text('Subtotal:', totalsX, y);
  pdf.text(`CHF ${parseFloat(data.subtotalChf || '0').toFixed(2)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 5;

  if (parseFloat(data.vatAmount || '0') > 0) {
    pdf.text('MwSt:', totalsX, y);
    pdf.text(`CHF ${parseFloat(data.vatAmount || '0').toFixed(2)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });
    y += 5;
  }

  pdf.setDrawColor(0);
  pdf.line(totalsX, y, PAGE_WIDTH - MARGIN, y);
  y += 5;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text('Total:', totalsX, y);
  pdf.text(`CHF ${parseFloat(data.totalChf || '0').toFixed(2)}`, PAGE_WIDTH - MARGIN, y, { align: 'right' });

  // ====== QR-Bill section for Tiers Garant ======
  if (data.billingModel === 'TG' && h.companyBankIban) {
    y += 15;

    // Check if we need a new page
    if (y > 230) {
      pdf.addPage();
      y = MARGIN;
    }

    pdf.setDrawColor(200);
    pdf.setLineDashPattern([2, 2], 0);
    pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
    pdf.setLineDashPattern([], 0);
    y += 5;

    pdf.setFontSize(8);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Zahlungsinformationen', MARGIN, y);
    y += 4;

    pdf.setFont('helvetica', 'normal');
    pdf.text(`IBAN: ${h.companyBankIban}`, MARGIN, y); y += 3.5;
    if (h.companyBankName) { pdf.text(`Bank: ${h.companyBankName}`, MARGIN, y); y += 3.5; }
    pdf.text(`Zugunsten von: ${h.companyName}`, MARGIN, y); y += 3.5;
    if (h.companyStreet) { pdf.text(h.companyStreet, MARGIN, y); y += 3.5; }
    pdf.text(`${h.companyPostalCode || ''} ${h.companyCity || ''}`.trim(), MARGIN, y); y += 5;
    pdf.text(`Betrag: CHF ${parseFloat(data.totalChf || '0').toFixed(2)}`, MARGIN, y); y += 3.5;
    pdf.text(`Referenz: ${data.invoiceNumber}`, MARGIN, y);
  }

  // Return as Buffer
  const arrayBuffer = pdf.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

/**
 * Load invoice data and generate PDF
 */
export async function generatePdfForInvoice(invoiceId: string, hospitalId: string): Promise<Buffer> {
  const [invoice] = await db
    .select()
    .from(tardocInvoices)
    .where(eq(tardocInvoices.id, invoiceId));

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  if (invoice.hospitalId !== hospitalId) {
    throw new Error('Invoice does not belong to this hospital');
  }

  const items = await db
    .select()
    .from(tardocInvoiceItems)
    .where(eq(tardocInvoiceItems.invoiceId, invoiceId))
    .orderBy(asc(tardocInvoiceItems.sortOrder));

  const [hospital] = await db
    .select()
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));

  if (!hospital) {
    throw new Error('Hospital not found');
  }

  // Update export timestamp
  await db
    .update(tardocInvoices)
    .set({ pdfExportedAt: new Date(), updatedAt: new Date() })
    .where(eq(tardocInvoices.id, invoiceId));

  return generateTardocPdf({
    invoiceNumber: invoice.invoiceNumber,
    billingModel: invoice.billingModel,
    lawType: invoice.lawType,
    treatmentType: invoice.treatmentType,
    treatmentReason: invoice.treatmentReason,
    caseNumber: invoice.caseNumber,
    caseDate: invoice.caseDate,
    caseDateEnd: invoice.caseDateEnd,
    treatmentCanton: invoice.treatmentCanton,
    billerGln: invoice.billerGln,
    billerZsr: invoice.billerZsr,
    providerGln: invoice.providerGln,
    providerZsr: invoice.providerZsr,
    referringPhysicianGln: invoice.referringPhysicianGln,
    insurerGln: invoice.insurerGln,
    insurerName: invoice.insurerName,
    insuranceNumber: invoice.insuranceNumber,
    ahvNumber: invoice.ahvNumber,
    patientSurname: invoice.patientSurname,
    patientFirstName: invoice.patientFirstName,
    patientBirthday: invoice.patientBirthday,
    patientSex: invoice.patientSex,
    patientStreet: invoice.patientStreet,
    patientPostalCode: invoice.patientPostalCode,
    patientCity: invoice.patientCity,
    tpValue: invoice.tpValue,
    subtotalTp: invoice.subtotalTp,
    subtotalChf: invoice.subtotalChf,
    vatAmount: invoice.vatAmount,
    totalChf: invoice.totalChf,
    createdAt: invoice.createdAt,
    items: items.map(i => ({
      tardocCode: i.tardocCode,
      description: i.description,
      treatmentDate: i.treatmentDate,
      session: i.session,
      quantity: i.quantity,
      taxPoints: i.taxPoints,
      tpValue: i.tpValue,
      scalingFactor: i.scalingFactor,
      sideCode: i.sideCode,
      providerGln: i.providerGln,
      amountChf: i.amountChf,
    })),
    hospital: {
      companyName: hospital.companyName,
      companyStreet: hospital.companyStreet,
      companyPostalCode: hospital.companyPostalCode,
      companyCity: hospital.companyCity,
      companyPhone: hospital.companyPhone,
      companyEmail: hospital.companyEmail,
      companyGln: hospital.companyGln,
      companyZsr: hospital.companyZsr,
      companyBankIban: hospital.companyBankIban,
      companyBankName: hospital.companyBankName,
    },
  });
}
