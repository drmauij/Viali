import { addDays, startOfMonth, endOfMonth, format, getDay } from "date-fns";
import type { Locale } from "date-fns";
import type { ShiftType, StaffShift } from "@shared/schema";

export interface ShiftsMonthPdfStrings {
  title: string;          // e.g. "Shift Schedule" / "Dienstplan"
  generated: string;      // e.g. "Generated" / "Erstellt am"
  legend: string;         // e.g. "Legend" / "Legende"
  plannedInOp: string;    // e.g. "Planned in OP" / "OP-Einsatz geplant"
}

export interface ShiftsMonthPdfInput {
  hospitalName: string;
  unitName?: string | null;
  anchor: Date;
  timeZone: string;
  locale: string;
  // date-fns locale used for weekday + month formatting in the table.
  // Defaults to en-US-equivalent if absent.
  dateLocale?: Locale;
  // Translated UI strings. Defaults to English if absent.
  i18n?: Partial<ShiftsMonthPdfStrings>;
  providers: Array<{ id: string; firstName: string; lastName: string }>;
  shiftTypes: ShiftType[];
  staffShifts: StaffShift[];
  absences: Array<{
    providerId: string;
    absenceType: string;
    startDate: string;
    endDate: string;
    notes: string | null;
  }>;
  timeOffs: Array<{
    providerId: string;
    startDate: string;
    endDate: string;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
    notes: string | null;
    approvalStatus?: string;
  }>;
  // Daily OP role assignments — drives the green "planned in OP" indicator.
  // Each entry: provider X has role Y on date D.
  staffPool?: Array<{
    userId: string | null;
    date: string;
    role: string;
  }>;
}

export interface ShiftsMonthPdfResult {
  blob: Blob;
  filename: string;
  base64: string; // raw base64, no data: prefix
}

const DEFAULT_STRINGS: ShiftsMonthPdfStrings = {
  title: "Shift Schedule",
  generated: "Generated",
  legend: "Legend",
  plannedInOp: "Planned in OP",
};

export async function generateShiftsMonthPdf(input: ShiftsMonthPdfInput): Promise<ShiftsMonthPdfResult> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF({ orientation: "landscape", format: "a4" });

  const strings: ShiftsMonthPdfStrings = { ...DEFAULT_STRINGS, ...input.i18n };

  // 1. Compute every day in the month, matching the on-screen view (now Mon-Sun).
  const weekdays = computeWeekdays(input.anchor);

  // 2. Header
  drawHeader(doc, input, strings);

  // 3. Table
  drawShiftsTable(doc, input, weekdays, autoTable);

  // 4. Legend (only for shift types actually used in the rendered month, plus OP marker if any)
  const usedTypeIds = new Set(input.staffShifts.map((s) => s.shiftTypeId).filter(Boolean) as string[]);
  const usedTypes = input.shiftTypes.filter((t) => usedTypeIds.has(t.id));
  const hasOpRoles = (input.staffPool ?? []).some((e) => e.userId && e.role);
  drawLegend(doc, usedTypes, hasOpRoles, strings);

  // 5. Output
  const monthStr = `${input.anchor.getFullYear()}-${String(input.anchor.getMonth() + 1).padStart(2, "0")}`;
  const safeName = input.hospitalName.replace(/[^a-zA-Z0-9]/g, "_") || "hospital";
  const filename = `shifts-${monthStr}-${safeName}.pdf`;

  const arrayBuffer = doc.output("arraybuffer");
  const blob = new Blob([arrayBuffer], { type: "application/pdf" });
  const base64 = arrayBufferToBase64(arrayBuffer);

  return { blob, filename, base64 };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function computeWeekdays(anchor: Date): Date[] {
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  const out: Date[] = [];
  let cur = new Date(start);
  while (cur <= end) {
    out.push(new Date(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([a-f0-9]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  const num = parseInt(m[1], 16);
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff];
}

function drawHeader(doc: any, input: ShiftsMonthPdfInput, strings: ShiftsMonthPdfStrings): void {
  const monthLabel = new Date(input.anchor.getFullYear(), input.anchor.getMonth(), 1).toLocaleDateString(input.locale, {
    month: "long",
    year: "numeric",
    timeZone: input.timeZone,
  });
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${input.hospitalName} — ${strings.title} — ${monthLabel}`, 14, 12);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const generatedAt = new Date().toLocaleString(input.locale, { timeZone: input.timeZone });
  const subParts = [input.unitName, `${strings.generated} ${generatedAt}`].filter(Boolean);
  doc.text(subParts.join(" · "), 14, 18);
  doc.setTextColor(0);
}

function drawShiftsTable(
  doc: any,
  input: ShiftsMonthPdfInput,
  weekdays: Date[],
  autoTable: any,
): void {
  // Build lookup maps
  const shiftByKey = new Map<string, StaffShift>();
  for (const s of input.staffShifts) shiftByKey.set(`${s.userId}|${s.date}`, s);
  const typeById = new Map<string, ShiftType>();
  for (const t of input.shiftTypes) typeById.set(t.id, t);

  // OP role lookup: which provider has which role on which date.
  const roleByKey = new Map<string, string>();
  for (const e of input.staffPool ?? []) {
    if (!e.userId || !e.role) continue;
    roleByKey.set(`${e.userId}|${e.date}`, e.role);
  }

  function absenceFor(userId: string, day: Date): boolean {
    const dateStr = format(day, "yyyy-MM-dd");
    if (input.absences.some((a) => a.providerId === userId && dateStr >= a.startDate && dateStr <= a.endDate)) return true;
    return input.timeOffs.some((t) => {
      if (t.providerId !== userId) return false;
      if (t.approvalStatus === "declined") return false;
      return dateStr >= t.startDate && dateStr <= t.endDate;
    });
  }

  // Header rows: 2 header rows so weekday letter and day number stack.
  // Use the user's locale for weekday names so they render in the right language.
  // Weekend columns get a slightly darker gray fill to mirror the on-screen tint.
  const dateOpts = input.dateLocale ? { locale: input.dateLocale } : undefined;
  const WEEKEND_FILL: [number, number, number] = [225, 225, 230];
  const isWeekend = (d: Date) => {
    const dow = getDay(d);
    return dow === 0 || dow === 6;
  };
  const headRow1: any[] = ["Staff"];
  const headRow2: any[] = [""];
  for (const d of weekdays) {
    const weekend = isWeekend(d);
    headRow1.push(weekend
      ? { content: format(d, "EEE", dateOpts), styles: { fillColor: WEEKEND_FILL } }
      : format(d, "EEE", dateOpts));
    headRow2.push(weekend
      ? { content: format(d, "d", dateOpts), styles: { fillColor: WEEKEND_FILL } }
      : format(d, "d", dateOpts));
  }
  const head = [headRow1, headRow2];

  // Body. All data cells are rendered manually in didDrawCell so the shift
  // appears as a rounded inset box (matching the in-app view) and the OP dot
  // floats above it. We tell autoTable to render the cells empty/white so it
  // doesn't paint the full-cell shift color over our drawing.
  const body = input.providers.map((p) => {
    const name =
      `${p.lastName}, ${p.firstName}`.replace(/^,\s*/, "").replace(/,\s*$/, "") ||
      p.firstName ||
      p.lastName ||
      "Unknown";
    const cells: any[] = [name];
    for (const d of weekdays) {
      const dateStr = format(d, "yyyy-MM-dd");
      const shift = shiftByKey.get(`${p.id}|${dateStr}`);
      const shiftType = shift?.shiftTypeId ? typeById.get(shift.shiftTypeId) : null;
      const opRole = roleByKey.get(`${p.id}|${dateStr}`);
      const isAbsent = !shiftType && absenceFor(p.id, d);
      const meta = {
        opRole,
        shiftCode: shiftType?.code ?? null,
        shiftColor: shiftType?.color ?? null,
        isAbsent,
      };
      cells.push({
        content: "",
        _opMeta: meta,
        styles: { fillColor: isWeekend(d) ? WEEKEND_FILL : [255, 255, 255] },
      });
    }
    return cells;
  });

  autoTable(doc, {
    head,
    body,
    startY: 28,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.8, minCellHeight: 6, halign: "center", valign: "middle", lineColor: [220, 220, 220] },
    headStyles: { fillColor: [240, 240, 240], textColor: [40, 40, 40], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 32, halign: "left", fontStyle: "bold", fillColor: [248, 248, 248] },
    },
    didDrawCell: (data: any) => {
      // Skip headers and the leftmost staff-name column.
      if (data.section !== "body" || data.column.index === 0) return;
      const meta = data.cell.raw?._opMeta;
      if (!meta) return;

      // Replicate the in-app cell: a small floating green dot at the top
      // (shown only when the provider has an OP role assignment), and a
      // rounded inset box with the shift color (or absence grey) below it.
      const { x, y, width, height } = data.cell;
      const sidePad = 0.8;     // horizontal padding around the shift box
      const dotRadius = 0.75;
      const dotMargin = 1.2;   // distance from cell top to dot center

      // 1) Floating green dot (top-center of cell). No background strip —
      //    matches the bare dot in the screen version.
      if (meta.opRole) {
        doc.setFillColor(34, 197, 94); // tailwind green-500
        doc.circle(x + width / 2, y + dotMargin, dotRadius, "F");
      }

      // 2) Rounded shift / absence box, inset from cell edges. The top of the
      //    box leaves room for the dot when present; otherwise centers the box.
      const topPad = meta.opRole ? dotMargin + dotRadius + 0.6 : 1.0;
      const botPad = 0.8;
      const boxX = x + sidePad;
      const boxY = y + topPad;
      const boxW = width - sidePad * 2;
      const boxH = height - topPad - botPad;

      if (meta.shiftColor) {
        const [r, g, b] = hexToRgb(meta.shiftColor);
        doc.setFillColor(r, g, b);
        doc.roundedRect(boxX, boxY, boxW, boxH, 0.6, 0.6, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(meta.shiftCode ?? "", boxX + boxW / 2, boxY + boxH / 2 + 1.0, { align: "center" });
        doc.setTextColor(0);
      } else if (meta.isAbsent) {
        doc.setFillColor(229, 231, 235);
        doc.roundedRect(boxX, boxY, boxW, boxH, 0.6, 0.6, "F");
      }
      // else: no shift, no absence — leave white. (Dot may still be drawn above.)
    },
    didDrawPage: (data: any) => {
      const pageCount = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(
        `${data.pageNumber} / ${pageCount}`,
        doc.internal.pageSize.width - 20,
        doc.internal.pageSize.height - 8,
      );
      doc.setTextColor(0);
    },
  });
}

function drawLegend(doc: any, types: ShiftType[], hasOpRoles: boolean, strings: ShiftsMonthPdfStrings): void {
  if (types.length === 0 && !hasOpRoles) return;

  const startY = (doc.lastAutoTable?.finalY ?? 28) + 8;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;

  let cursorX = 14;
  let cursorY = startY;
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(strings.legend, cursorX, cursorY);
  cursorY += 5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  const colWidth = (pageWidth - 28) / 2;
  const rowHeight = 6;

  let entryIdx = 0;
  function placeEntry(draw: () => void) {
    if (cursorY + rowHeight > pageHeight - 12) {
      doc.addPage();
      cursorX = 14;
      cursorY = 14;
    }
    draw();
    if (entryIdx % 2 === 0) {
      cursorX += colWidth;
    } else {
      cursorX = 14;
      cursorY += rowHeight;
    }
    entryIdx += 1;
  }

  types.forEach((t) => {
    placeEntry(() => {
      const [r, g, b] = hexToRgb(t.color);
      doc.setFillColor(r, g, b);
      doc.rect(cursorX, cursorY - 3, 8, 4, "F");
      doc.text(`${t.code} — ${t.name} (${t.startTime}–${t.endTime})`, cursorX + 11, cursorY);
    });
  });

  if (hasOpRoles) {
    placeEntry(() => {
      // Sample of the OP marker: green dot floating above a rounded purple
      // shift box. Mirrors how cells look in the table.
      const swX = cursorX;
      const swY = cursorY - 3.2;
      const swW = 8;
      const swH = 4.2;
      // Floating green dot, centered horizontally over the swatch
      doc.setFillColor(34, 197, 94);
      doc.circle(swX + swW / 2, swY + 0.6, 0.6, "F");
      // Rounded shift swatch
      doc.setFillColor(99, 102, 241); // illustrative shift color
      doc.roundedRect(swX, swY + 1.4, swW, swH - 1.4, 0.5, 0.5, "F");
      doc.text(strings.plannedInOp, swX + 11, cursorY);
    });
  }
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
