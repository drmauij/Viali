import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";

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

export interface DayPlanPdfOptions {
  date: Date;
  hospitalName: string;
  surgeries: any[];
  patientMap: Map<string, any>;
  roomMap: Map<string, string>;
  columns: DayPlanPdfColumn[];
  roomStaffByRoom?: Map<string, RoomStaffInfo>;
}

// Role labels for display
const ROLE_LABELS: Record<string, string> = {
  surgeon: 'Chirurg',
  surgicalAssistant: 'Assistenz',
  instrumentNurse: 'OTA',
  circulatingNurse: 'Springer',
  anesthesiologist: 'ANÄ',
  anesthesiaNurse: 'Anä-Pflege',
  pacuNurse: 'IMC/AWR',
};

export function generateDayPlanPdf(options: DayPlanPdfOptions): void {
  const { date, hospitalName, surgeries, patientMap, roomMap, columns, roomStaffByRoom } = options;

  if (surgeries.length === 0) {
    return;
  }

  const doc = new jsPDF({ orientation: 'landscape' });
  
  const displayDate = format(date, 'dd.MM.yyyy');
  const dateKey = format(date, 'yyyy-MM-dd');
  
  doc.setFontSize(16);
  doc.text(`OP-TAG ${displayDate}`, 14, 15);
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
      return format(new Date(dateVal), 'HH:mm');
    },
    formatDate: (dateVal: any) => {
      if (!dateVal) return '-';
      return format(new Date(dateVal), 'dd.MM.yyyy');
    },
  };
  
  let currentY = 28;
  
  sortedRoomIds.forEach((roomId, index) => {
    const roomSurgeries = surgeriesByRoom.get(roomId) || [];
    const roomName = roomId === 'unassigned' 
      ? 'Ohne Saal' 
      : (roomMap.get(roomId) || `Saal ${roomId}`);
    
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
          const label = ROLE_LABELS[role] || role;
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
        // Check if cell content contains "Chirurg:" - store metadata for didDrawCell
        if (data.section === 'body' && typeof data.cell.text === 'object') {
          const textArr = data.cell.text as string[];
          const surgeonLineIndex = textArr.findIndex(line => line.startsWith('Chirurg:'));
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
          const textPos = cell.textPos;
          
          if (textPos && surgeonLineText) {
            // Calculate the Y position for the surgeon line
            const lineHeight = cell.styles.fontSize * (cell.styles.lineWidth || 1.15);
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
  
  doc.save(`OP-Tag_${dateKey}.pdf`);
}

export const defaultColumns = {
  datum: (displayDate: string): DayPlanPdfColumn => ({
    header: 'Datum',
    width: 26,
    getValue: (surgery, helpers) => {
      const admissionTime = helpers.formatTime(surgery.admissionTime);
      const startTime = helpers.formatTime(surgery.plannedDate);
      return [
        displayDate,
        `• Eintritt: ${admissionTime} Uhr`,
        `• Schnitt: ${startTime}`
      ].join('\n');
    },
  }),
  
  operator: (): DayPlanPdfColumn => ({
    header: 'Operator',
    width: 22,
    getValue: (surgery) => surgery.surgeon || '-',
  }),
  
  patient: (): DayPlanPdfColumn => ({
    header: 'Patient',
    width: 32,
    getValue: (surgery, helpers) => {
      const patient = helpers.patientMap.get(surgery.patientId);
      const patientName = patient ? `${patient.surname}, ${patient.firstName}` : '-';
      const patientBirthday = patient?.birthday 
        ? `(${format(new Date(patient.birthday), 'dd.MM.yyyy')})`
        : '';
      // Add allergies if available
      const allergies = patient?.allergies;
      const otherAllergies = patient?.otherAllergies;
      let allergyText = '';
      if (allergies && allergies.length > 0) {
        allergyText = `\nAllergien: ${allergies.join(', ')}`;
      }
      if (otherAllergies) {
        allergyText += allergyText ? `, ${otherAllergies}` : `\nAllergien: ${otherAllergies}`;
      }
      return `${patientName}\n${patientBirthday}${allergyText}`;
    },
  }),
  
  eingriff: (): DayPlanPdfColumn => ({
    header: 'Eingriff',
    width: 42,
    getValue: (surgery) => {
      const surgeryText = surgery.plannedSurgery || '-';
      const surgeonText = surgery.surgeon ? `\nChirurg: ${surgery.surgeon}` : '';
      return surgeryText + surgeonText;
    },
  }),
  
  preOp: (formatPreOpSummary: (surgeryId: string) => string): DayPlanPdfColumn => ({
    header: 'Anästhesie',
    width: 50,
    getValue: (surgery) => formatPreOpSummary(surgery.id),
  }),
  
  note: (): DayPlanPdfColumn => ({
    header: 'Note',
    width: 50,
    getValue: (surgery) => surgery.notes || '-',
  }),
};
