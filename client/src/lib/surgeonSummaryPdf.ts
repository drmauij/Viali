import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import i18next from "i18next";
import { formatDate, formatTime, formatDateTime } from "@/lib/dateUtils";

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
    anesthesiaType?: string | null;
  };
  anesthesiaRecord?: {
    anesthesiaStartTime?: string | Date | null;
    anesthesiaEndTime?: string | Date | null;
    timeMarkers?: Array<TimeMarker>;
    anesthesiaOverview?: {
      general?: boolean;
      sedation?: boolean;
      regionalSpinal?: boolean;
      regionalEpidural?: boolean;
      regionalPeripheral?: boolean;
    } | null;
  } | null;
  staffMembers?: Array<StaffMember>;
  language?: string;
}

function formatTimeFrom24h(timeMs: number): string {
  const date = new Date(timeMs);
  if (isNaN(date.getTime())) return i18next.t("anesthesia.pdf.invalidTime");
  return formatTime(date);
}

function formatDateTime24h(date: string | Date | null | undefined): string {
  if (!date) return i18next.t("anesthesia.pdf.na");
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return i18next.t("anesthesia.pdf.invalidDate");
    return formatDateTime(dateObj);
  } catch {
    return i18next.t("anesthesia.pdf.invalidDate");
  }
}

function formatDuration(startMs: number, endMs: number): string {
  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) return "–";
  const diffMin = Math.round((endMs - startMs) / 60000);
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}min`;
  if (hours > 0) return `${hours}h`;
  return `${minutes} min`;
}

function getAnesthesiaTypeLabels(
  overview: { general?: boolean; sedation?: boolean; regionalSpinal?: boolean; regionalEpidural?: boolean; regionalPeripheral?: boolean } | null | undefined,
  surgeryAnesthesiaType: string | null | undefined,
  t: (key: string) => string,
): string {
  if (overview) {
    const map: Record<string, string> = {
      general: t("anesthesia.pdf.typeGeneral"),
      sedation: t("anesthesia.pdf.typeSedation"),
      regionalSpinal: t("anesthesia.pdf.typeRegionalSpinal"),
      regionalEpidural: t("anesthesia.pdf.typeRegionalEpidural"),
      regionalPeripheral: t("anesthesia.pdf.typeRegionalPeripheral"),
    };
    const active = Object.entries(overview)
      .filter(([, v]) => v)
      .map(([k]) => map[k] || k);
    if (active.length > 0) return active.join(", ");
  }
  if (surgeryAnesthesiaType) {
    const typeMap: Record<string, string> = {
      general: t("anesthesia.pdf.typeGeneral"),
      sedation: t("anesthesia.pdf.typeSedation"),
      spinal: t("anesthesia.pdf.typeRegionalSpinal"),
      epidural: t("anesthesia.pdf.typeRegionalEpidural"),
      regional: t("anesthesia.pdf.typeRegionalPeripheral"),
      combined: t("anesthesia.pdf.typeGeneral") + " + Regional",
    };
    return typeMap[surgeryAnesthesiaType] || surgeryAnesthesiaType;
  }
  return t("anesthesia.pdf.na");
}

export function generateSurgeonSummaryPDF(data: SurgeonSummaryData): jsPDF {
  const doc = new jsPDF("portrait", "mm", "a4");
  const originalLang = i18next.language;
  if (data.language) {
    i18next.changeLanguage(data.language);
  }
  try {
  const t = (key: string) => i18next.t(key);

  const roleLabels: Record<string, string> = {
    surgeon: t("anesthesia.pdf.roleSurgeon"),
    surgicalAssistant: t("anesthesia.pdf.roleSurgicalAssistant"),
    instrumentNurse: t("anesthesia.pdf.roleInstrumentNurse"),
    circulatingNurse: t("anesthesia.pdf.roleCirculatingNurse"),
    anesthesiologist: t("anesthesia.pdf.roleAnesthesiologist"),
    anesthesiaNurse: t("anesthesia.pdf.roleAnesthesiaNurse"),
    pacuNurse: t("anesthesia.pdf.rolePacuNurse"),
  };

  let yPos = 20;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text(t("anesthesia.pdf.surgeonSummaryTitle"), 105, yPos, { align: "center" });
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

  // Derive actual start/end from time markers if surgery fields are empty
  const markers = data.anesthesiaRecord?.timeMarkers || [];
  const firstMarker = markers.find(m => m.code === "A1") || markers.find(m => m.code === "E") || markers[0];
  const lastMarker = [...markers].reverse().find(m => m.code === "P") || [...markers].reverse().find(m => m.code === "A2") || markers[markers.length - 1];

  let actualStartDisplay: string;
  if (data.surgery.actualStartTime) {
    actualStartDisplay = formatDateTime24h(data.surgery.actualStartTime);
  } else if (firstMarker?.time) {
    actualStartDisplay = formatTimeFrom24h(firstMarker.time);
  } else {
    actualStartDisplay = t("anesthesia.pdf.na");
  }

  let actualEndDisplay: string;
  if (data.surgery.actualEndTime) {
    actualEndDisplay = formatDateTime24h(data.surgery.actualEndTime);
  } else if (lastMarker?.time) {
    actualEndDisplay = formatTimeFrom24h(lastMarker.time);
  } else {
    actualEndDisplay = t("anesthesia.pdf.na");
  }

  const surgeryRows: string[][] = [
    [t("anesthesia.pdf.procedure"), data.surgery.plannedSurgery || t("anesthesia.pdf.na")],
  ];

  if (data.surgery.chopCode) {
    surgeryRows.push(["CHOP", data.surgery.chopCode]);
  }

  surgeryRows.push(
    [t("anesthesia.pdf.surgeon"), data.surgery.surgeon || t("anesthesia.pdf.na")],
    [t("anesthesia.pdf.plannedDate"), formatDate(data.surgery.plannedDate)],
    [t("anesthesia.pdf.actualStart"), actualStartDisplay],
    [t("anesthesia.pdf.actualEnd"), actualEndDisplay],
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

  // === Durations & Anesthesia section ===
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(t("anesthesia.pdf.durationsAndAnesthesia"), 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  const o1 = markers.find(m => m.code === "O1")?.time;
  const o2 = markers.find(m => m.code === "O2")?.time;
  const x1 = markers.find(m => m.code === "X1")?.time;
  const a2 = markers.find(m => m.code === "A2")?.time;

  const durationRows: string[][] = [
    [t("anesthesia.pdf.schnittNahtZeit"), o1 && o2 ? formatDuration(o1, o2) : "–"],
    [t("anesthesia.pdf.anesthesiaDuration"), x1 && a2 ? formatDuration(x1, a2) : "–"],
    [t("anesthesia.pdf.anesthesiaType"), getAnesthesiaTypeLabels(data.anesthesiaRecord?.anesthesiaOverview, data.surgery.anesthesiaType, t)],
  ];

  autoTable(doc, {
    startY: yPos,
    head: [],
    body: durationRows,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 3 },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 70 },
      1: { cellWidth: 100 },
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
  } finally {
    if (data.language && data.language !== originalLang) {
      i18next.changeLanguage(originalLang);
    }
  }
}

export function downloadSurgeonSummaryPDF(data: SurgeonSummaryData): void {
  const doc = generateSurgeonSummaryPDF(data);
  const dateStr = formatDate(new Date()).replace(/\//g, "-");
  const filename = `Surgery_Summary_${data.patient.surname}_${dateStr}.pdf`;
  doc.save(filename);
}
