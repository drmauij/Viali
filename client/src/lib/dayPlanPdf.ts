import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { formatDate, formatTime, formatDateForInput } from "@/lib/dateUtils";
import { getPositionDisplayLabel, getArmDisplayLabel } from "@/components/surgery/PatientPositionFields";

export interface DayPlanPdfColumn {
  header: string;
  width: number;
  getValue: (surgery: any, helpers: DayPlanPdfHelpers) => string;
}

export interface DayPlanPdfHelpers {
  patientMap: Map<string, any>;
  roomMap: Map<string, string>;
  displayDate: string;
  formatTime: (date: any) => string;
  formatDate: (date: any) => string;
}

export interface RoomStaffInfo {
  roomId: string;
  staffByRole: Map<string, string[]>; // role -> names
}

type TFunction = (key: string, fallback: string) => string;

export interface DayPlanPdfOptions {
  date: Date;
  hospitalName: string;
  surgeries: any[];
  patientMap: Map<string, any>;
  roomMap: Map<string, string>;
  columns: DayPlanPdfColumn[];
  roomStaffByRoom?: Map<string, RoomStaffInfo>;
  dayNotes?: string;
  t: TFunction;
}

function getRoleLabels(t: TFunction): Record<string, string> {
  return {
    surgeon: t('pdf.role.surgeon', 'Chirurg'),
    surgicalAssistant: t('pdf.role.surgicalAssistant', 'Assistenz'),
    instrumentNurse: t('pdf.role.instrumentNurse', 'OTA'),
    circulatingNurse: t('pdf.role.circulatingNurse', 'Springer'),
    anesthesiologist: t('pdf.role.anesthesiologist', 'ANÄ'),
    anesthesiaNurse: t('pdf.role.anesthesiaNurse', 'Anä-Pflege'),
    pacuNurse: t('pdf.role.pacuNurse', 'IMC/AWR'),
  };
}

export function generateDayPlanPdf(options: DayPlanPdfOptions): void {
  const { date, hospitalName, surgeries, patientMap, roomMap, columns, roomStaffByRoom, dayNotes, t } = options;

  if (surgeries.length === 0) {
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape' });
  const roleLabels = getRoleLabels(t);

  const displayDate = formatDate(date);
  const dateKey = formatDateForInput(date);

  doc.setFontSize(16);
  doc.text(`${t('pdf.title', 'OP-TAG')} ${displayDate}`, 14, 15);
  doc.setFontSize(10);
  doc.text(hospitalName || '', 14, 22);
  
  const surgeriesByRoom = new Map<string, any[]>();
  surgeries.forEach((surgery: any) => {
    const roomId = surgery.surgeryRoomId || 'unassigned';
    const roomSurgeries = surgeriesByRoom.get(roomId) || [];
    roomSurgeries.push(surgery);
    surgeriesByRoom.set(roomId, roomSurgeries);
  });
  
  const sortedRoomIds = Array.from(surgeriesByRoom.keys()).sort((a, b) => {
    if (a === 'unassigned') return 1;
    if (b === 'unassigned') return -1;
    const nameA = roomMap.get(a) || '';
    const nameB = roomMap.get(b) || '';
    return nameA.localeCompare(nameB);
  });
  
  const helpers: DayPlanPdfHelpers = {
    patientMap,
    roomMap,
    displayDate,
    formatTime: (dateVal: any) => {
      if (!dateVal) return '-';
      return formatTime(new Date(dateVal));
    },
    formatDate: (dateVal: any) => {
      if (!dateVal) return '-';
      return formatDate(new Date(dateVal));
    },
  };
  
  let currentY = 28;

  // Render day notes if present — prominent box
  if (dayNotes && dayNotes.trim()) {
    const pageWidth = doc.internal.pageSize.getWidth();
    const boxX = 14;
    const boxW = pageWidth - 28;
    const padding = 3;

    // Label
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    const labelText = t('pdf.dayNotes', 'Tagesnotizen');
    doc.text(labelText, boxX + padding, currentY + padding + 3);
    const labelWidth = doc.getTextWidth(labelText);

    // Notes text
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const wrappedLines = doc.splitTextToSize(dayNotes.trim(), boxW - padding * 2 - labelWidth - 4);
    const textHeight = wrappedLines.length * 4.5;
    const boxH = Math.max(textHeight + padding * 2 + 2, 10);

    // Amber-ish background + border
    doc.setFillColor(255, 243, 205); // light amber
    doc.setDrawColor(217, 175, 62);  // amber border
    doc.roundedRect(boxX, currentY, boxW, boxH, 1.5, 1.5, 'FD');

    // Re-draw label on top of fill
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(120, 80, 0);
    doc.text(labelText, boxX + padding, currentY + padding + 3);

    // Notes text
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 40, 0);
    doc.text(wrappedLines, boxX + padding + labelWidth + 4, currentY + padding + 3);

    // Reset colors
    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);
    currentY += boxH + 8;
  }

  sortedRoomIds.forEach((roomId, index) => {
    const roomSurgeries = surgeriesByRoom.get(roomId) || [];
    const roomName = roomId === 'unassigned'
      ? t('pdf.unassignedRoom', 'Ohne Saal')
      : (roomMap.get(roomId) || `${t('pdf.room', 'Saal')} ${roomId}`);
    
    const sortedRoomSurgeries = [...roomSurgeries].sort((a: any, b: any) => {
      const dateA = a.plannedDate ? new Date(a.plannedDate) : null;
      const dateB = b.plannedDate ? new Date(b.plannedDate) : null;
      if (!dateA && !dateB) return 0;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return dateA.getTime() - dateB.getTime();
    });
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`${roomName}`, 14, currentY);
    currentY += 5;
    
    // Add staff information if available
    if (roomStaffByRoom && roomId !== 'unassigned') {
      const roomStaffInfo = roomStaffByRoom.get(roomId);
      if (roomStaffInfo && roomStaffInfo.staffByRole.size > 0) {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const staffParts: string[] = [];
        roomStaffInfo.staffByRole.forEach((names, role) => {
          const label = roleLabels[role] || role;
          staffParts.push(`${label}: ${names.join(', ')}`);
        });
        const staffText = staffParts.join('  |  ');
        doc.text(staffText, 14, currentY);
        currentY += 5;
      }
    }
    currentY += 1;
    
    const tableData = sortedRoomSurgeries.map((surgery) => 
      columns.map((col) => col.getValue(surgery, helpers))
    );
    
    // Calculate total defined width to proportionally scale columns to full page width
    const pageWidth = doc.internal.pageSize.getWidth();
    const marginLeft = 10;
    const marginRight = 10;
    const availableWidth = pageWidth - marginLeft - marginRight;
    const totalDefinedWidth = columns.reduce((sum, col) => sum + col.width, 0);
    const scaleFactor = availableWidth / totalDefinedWidth;
    
    // Apply scaled widths
    const scaledColumnStyles: Record<number, { cellWidth: number }> = {};
    columns.forEach((col, idx) => {
      scaledColumnStyles[idx] = { cellWidth: col.width * scaleFactor };
    });

    autoTable(doc, {
      startY: currentY,
      head: [columns.map((col) => col.header)],
      body: tableData,
      theme: 'grid',
      styles: { 
        fontSize: 10, 
        cellPadding: 3,
        overflow: 'linebreak',
        valign: 'top'
      },
      headStyles: {
        fillColor: [66, 66, 66],
        fontSize: 11,
        fontStyle: 'bold'
      },
      columnStyles: scaledColumnStyles,
      margin: { left: marginLeft, right: marginRight },
      tableWidth: 'auto',
      didParseCell: (data) => {
        // Check if cell content contains surgeon label - store metadata for didDrawCell
        const surgeonPrefix = `${t('pdf.surgeon', 'Chirurg')}:`;
        if (data.section === 'body' && typeof data.cell.text === 'object') {
          const textArr = data.cell.text as string[];
          const surgeonLineIndex = textArr.findIndex(line => line.startsWith(surgeonPrefix));
          if (surgeonLineIndex !== -1) {
            (data.cell as any).hasSurgeonLine = true;
            (data.cell as any).surgeonLineIndex = surgeonLineIndex;
            (data.cell as any).surgeonLineText = textArr[surgeonLineIndex];
          }
        }
      },
      didDrawCell: (data) => {
        // After autoTable draws the cell, overdraw the surgeon line in bold
        if (data.section === 'body' && (data.cell as any).hasSurgeonLine) {
          const cell = data.cell;
          const surgeonLineIndex = (cell as any).surgeonLineIndex;
          const surgeonLineText = (cell as any).surgeonLineText;
          const textPos = (cell as any).textPos;
          
          if (textPos && surgeonLineText) {
            // Calculate the Y position for the surgeon line
            const lineHeight = cell.styles.fontSize * ((cell.styles.lineWidth as number) || 1.15);
            const surgeonY = textPos.y + (surgeonLineIndex * lineHeight);
            
            // Draw a white rectangle to cover the normal text first
            doc.setFillColor(255, 255, 255);
            const textWidth = doc.getTextWidth(surgeonLineText);
            doc.rect(textPos.x, surgeonY - cell.styles.fontSize * 0.8, textWidth + 1, cell.styles.fontSize * 1.2, 'F');
            
            // Draw the surgeon line in bold
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(cell.styles.fontSize);
            doc.text(surgeonLineText, textPos.x, surgeonY);
            doc.setFont('helvetica', 'normal');
          }
        }
      },
    });
    
    const finalY = (doc as any).lastAutoTable?.finalY || currentY;
    currentY = finalY + 10;
    
    if (index < sortedRoomIds.length - 1 && currentY > 180) {
      doc.addPage();
      currentY = 20;
    }
  });
  
  doc.save(`${t('pdf.filename', 'OP-Tag')}_${dateKey}.pdf`);
}

export const defaultColumns = {
  datum: (displayDate: string, t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.date', 'Datum'),
    width: 26,
    getValue: (surgery, helpers) => {
      const admissionTime = helpers.formatTime(surgery.admissionTime);
      const startTime = helpers.formatTime(surgery.plannedDate);
      return [
        displayDate,
        `• ${t('pdf.admission', 'Eintritt')}: ${admissionTime}`,
        `• ${t('pdf.incision', 'Schnitt')}: ${startTime}`
      ].join('\n');
    },
  }),

  operator: (t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.operator', 'Operator'),
    width: 22,
    getValue: (surgery) => surgery.surgeon || '-',
  }),

  patient: (t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.patient', 'Patient'),
    width: 32,
    getValue: (surgery, helpers) => {
      const patient = surgery.patientId ? helpers.patientMap.get(surgery.patientId) : null;
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : (surgery.patientId ? '-' : t('pdf.slotReserved', 'SLOT RESERVED'));
      const patientBirthday = patient?.birthday
        ? `(${formatDate(new Date(patient.birthday))})`
        : '';
      const allergies = patient?.allergies;
      const otherAllergies = patient?.otherAllergies;
      let allergyText = '';
      const allergiesLabel = t('pdf.allergies', 'Allergien');
      if (allergies && allergies.length > 0) {
        allergyText = `\n${allergiesLabel}: ${allergies.join(', ')}`;
      }
      if (otherAllergies) {
        allergyText += allergyText ? `, ${otherAllergies}` : `\n${allergiesLabel}: ${otherAllergies}`;
      }
      return `${patientName}\n${patientBirthday}${allergyText}`;
    },
  }),

  eingriff: (t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.procedure', 'Eingriff'),
    width: 42,
    getValue: (surgery) => {
      const surgeryText = surgery.plannedSurgery || '-';
      const surgeonLabel = t('pdf.surgeon', 'Chirurg');
      const surgeonText = surgery.surgeon ? `\n${surgeonLabel}: ${surgery.surgeon}` : '';

      let positionText = '';
      if (surgery.patientPosition || surgery.leftArmPosition || surgery.rightArmPosition) {
        const parts: string[] = [];
        if (surgery.patientPosition) {
          parts.push(getPositionDisplayLabel(surgery.patientPosition, true));
        }
        if (surgery.leftArmPosition) {
          parts.push(`L: ${getArmDisplayLabel(surgery.leftArmPosition, true)}`);
        }
        if (surgery.rightArmPosition) {
          parts.push(`R: ${getArmDisplayLabel(surgery.rightArmPosition, true)}`);
        }
        positionText = '\n' + parts.join(' | ');
      }

      const abText = surgery.antibioseProphylaxe ? `\n${t('pdf.abProphylaxis', 'AB-Prophylaxe')}` : '';

      return surgeryText + surgeonText + positionText + abText;
    },
  }),

  preOp: (formatPreOpSummary: (surgeryId: string) => string, t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.anesthesia', 'Anästhesie'),
    width: 50,
    getValue: (surgery) => formatPreOpSummary(surgery.id),
  }),

  note: (t: TFunction): DayPlanPdfColumn => ({
    header: t('pdf.col.note', 'Note'),
    width: 50,
    getValue: (surgery) => surgery.notes || '-',
  }),
};
