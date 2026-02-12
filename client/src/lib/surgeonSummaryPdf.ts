import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import i18next from "i18next";
import { formatDate } from "@/lib/dateUtils";

interface TimeMarker {
  code: string;
  label: string;
  time: number | null;
}

interface StaffMember {
  id: string;
  role: string;
  name: string;
  timestamp: string | Date;
}

interface SurgeonSummaryData {
  patient: {
    firstName: string;
    surname: string;
    birthday: string;
    patientNumber: string;
  };
  surgery: {
    plannedSurgery: string;
    chopCode?: string | null;
    surgeon?: string | null;
    plannedDate: string | Date;
    actualStartTime?: string | Date | null;
    actualEndTime?: string | Date | null;
    status: string;
  };
  anesthesiaRecord?: {
    anesthesiaStartTime?: string | Date | null;
    anesthesiaEndTime?: string | Date | null;
    timeMarkers?: Array<TimeMarker>;
  } | null;
  staffMembers?: Array<StaffMember>;
}

function formatTimeFrom24h(timeMs: number): string {
  const date = new Date(timeMs);
  if (isNaN(date.getTime())) return i18next.t("anesthesia.pdf.invalidTime");
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function formatDateTime24h(date: string | Date | null | undefined): string {
  if (!date) return i18next.t("anesthesia.pdf.na");
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return i18next.t("anesthesia.pdf.invalidDate");
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch {
    return i18next.t("anesthesia.pdf.invalidDate");
  }
}

const roleLabels: Record<string, string> = {
  surgeon: "Surgeon",
  surgicalAssistant: "Surgical Assistant",
  instrumentNurse: "Instrument Nurse",
  circulatingNurse: "Circulating Nurse",
  anesthesiologist: "Anesthesiologist",
  anesthesiaNurse: "Anesthesia Nurse",
  pacuNurse: "PACU Nurse",
};

export function generateSurgeonSummaryPDF(data: SurgeonSummaryData): jsPDF {
  const doc = new jsPDF("portrait", "mm", "a4");
  const t = (key: string) => i18next.t(key);
  let yPos = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Surgery Summary", 105, yPos, { align: "center" });
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(`${t("anesthesia.pdf.generated")}: ${formatDateTime24h(new Date())}`, 105, yPos, { align: "center" });
  doc.setTextColor(0, 0, 0);
  yPos += 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(t("anesthesia.pdf.patientInformation"), 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const patientRows = [
    [t("anesthesia.pdf.name"), `${data.patient.surname}, ${data.patient.firstName}`],
    [t("anesthesia.pdf.dateOfBirth"), formatDate(data.patient.birthday)],
    [t("anesthesia.pdf.patientId"), data.patient.patientNumber],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: patientRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 120 },
    },
    margin: { left: 20, right: 20 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(t("anesthesia.pdf.surgeryInformation"), 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  const surgeryRows: string[][] = [
    [t("anesthesia.pdf.procedure"), data.surgery.plannedSurgery || t("anesthesia.pdf.na")],
  ];

  if (data.surgery.chopCode) {
    surgeryRows.push(["CHOP", data.surgery.chopCode]);
  }

  surgeryRows.push(
    [t("anesthesia.pdf.surgeon"), data.surgery.surgeon || t("anesthesia.pdf.na")],
    [t("anesthesia.pdf.plannedDate"), formatDate(data.surgery.plannedDate)],
    [t("anesthesia.pdf.actualStart"), data.surgery.actualStartTime ? formatDateTime24h(data.surgery.actualStartTime) : t("anesthesia.pdf.na")],
    [t("anesthesia.pdf.actualEnd"), data.surgery.actualEndTime ? formatDateTime24h(data.surgery.actualEndTime) : t("anesthesia.pdf.na")],
    [t("anesthesia.pdf.status"), data.surgery.status],
  );

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: surgeryRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: 120 },
    },
    margin: { left: 20, right: 20 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(t("anesthesia.pdf.timeMarkers"), 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  const timeRows: string[][] = [];

  if (data.anesthesiaRecord?.anesthesiaStartTime) {
    timeRows.push([
      "AS",
      t("anesthesia.pdf.anesthesiaStart"),
      formatDateTime24h(data.anesthesiaRecord.anesthesiaStartTime),
    ]);
  }

  if (data.anesthesiaRecord?.timeMarkers) {
    data.anesthesiaRecord.timeMarkers.forEach((marker) => {
      timeRows.push([
        marker.code,
        marker.label,
        marker.time ? formatTimeFrom24h(marker.time) : t("anesthesia.pdf.na"),
      ]);
    });
  }

  if (data.anesthesiaRecord?.anesthesiaEndTime) {
    timeRows.push([
      "AE",
      t("anesthesia.pdf.anesthesiaEnd"),
      formatDateTime24h(data.anesthesiaRecord.anesthesiaEndTime),
    ]);
  }

  if (timeRows.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [[t("anesthesia.pdf.code"), t("anesthesia.pdf.event"), t("anesthesia.pdf.time")]],
      body: timeRows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 95 },
        2: { cellWidth: 50 },
      },
      margin: { left: 20, right: 20 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(t("anesthesia.pdf.na"), 25, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
  }

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(t("anesthesia.pdf.anesthesiaStaff"), 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  if (data.staffMembers && data.staffMembers.length > 0) {
    const sortedStaff = [...data.staffMembers].sort((a, b) => {
      const roleOrder = ["surgeon", "surgicalAssistant", "instrumentNurse", "circulatingNurse", "anesthesiologist", "anesthesiaNurse", "pacuNurse"];
      return roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role);
    });

    const staffRows = sortedStaff.map((member) => [
      roleLabels[member.role] || member.role,
      member.name,
      formatDateTime24h(member.timestamp),
    ]);

    autoTable(doc, {
      startY: yPos,
      head: [[t("anesthesia.pdf.role"), t("anesthesia.pdf.name"), t("anesthesia.pdf.time")]],
      body: staffRows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 70 },
        2: { cellWidth: 50 },
      },
      margin: { left: 20, right: 20 },
    });
  } else {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(t("anesthesia.pdf.na"), 25, yPos);
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}

export function downloadSurgeonSummaryPDF(data: SurgeonSummaryData): void {
  const doc = generateSurgeonSummaryPDF(data);
  const dateStr = formatDate(new Date()).replace(/\//g, "-");
  const filename = `Surgery_Summary_${data.patient.surname}_${dateStr}.pdf`;
  doc.save(filename);
}
