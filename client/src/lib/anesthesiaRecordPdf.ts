import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  Patient,
  Surgery,
  AnesthesiaRecord,
  PreOpAssessment,
  ClinicalSnapshot,
} from "@shared/schema";
import { formatDate } from "@/lib/dateUtils";

interface AnesthesiaEvent {
  id: string;
  timestamp: string;
  description: string;
  eventType: string | null;
}

interface MedicationAdministration {
  id: string;
  itemId: string;
  timestamp: string;
  type: string;
  dose: string;
  unit: string | null;
  route: string | null;
  rate: string | null;
  endTimestamp: string | null;
}

interface AnesthesiaItem {
  id: string;
  name: string;
  administrationUnit?: string | null;
  administrationRoute?: string | null;
}

interface TimeMarker {
  code: string;
  label: string;
  time: number | null;
}

interface StaffMember {
  id: string;
  role: string;
  name: string;
  startTime: string;
  endTime: string | null;
}

interface PositionEntry {
  id: string;
  position: string;
  time: string;
}

interface ExportData {
  patient: Patient;
  surgery: Surgery;
  anesthesiaRecord?: AnesthesiaRecord | null;
  preOpAssessment?: PreOpAssessment | null;
  clinicalSnapshot?: ClinicalSnapshot | null;
  events?: AnesthesiaEvent[];
  medications?: MedicationAdministration[];
  anesthesiaItems?: AnesthesiaItem[];
  staffMembers?: StaffMember[];
  positions?: PositionEntry[];
}

// Helper to format time from milliseconds to HH:MM (24-hour format)
function formatTimeFrom24h(timeMs: number): string {
  const date = new Date(timeMs);
  if (isNaN(date.getTime())) return "Invalid Time";
  
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Helper to format datetime to DD.MM.YYYY HH:MM (24-hour format, European style)
function formatDateTime24h(date: string | Date | null | undefined): string {
  if (!date) return "N/A";
  
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return "Invalid Date";
    
    const day = dateObj.getDate().toString().padStart(2, '0');
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const year = dateObj.getFullYear();
    const hours = dateObj.getHours().toString().padStart(2, '0');
    const minutes = dateObj.getMinutes().toString().padStart(2, '0');
    
    return `${day}.${month}.${year} ${hours}:${minutes}`;
  } catch (error) {
    return "Invalid Date";
  }
}

// Helper to check if we need a new page (conservative spacing for tables)
function checkPageBreak(doc: jsPDF, currentY: number, spaceNeeded: number = 80): number {
  if (currentY + spaceNeeded > 260) {
    doc.addPage();
    return 20;
  }
  return currentY;
}

export function generateAnesthesiaRecordPDF(data: ExportData) {
  const doc = new jsPDF();
  let yPos = 20;

  // ==================== HEADER ====================
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("COMPLETE ANESTHESIA RECORD", 105, yPos, { align: "center" });
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Generated: ${formatDateTime24h(new Date())}`, 105, yPos, { align: "center" });
  yPos += 15;

  // ==================== PATIENT INFORMATION ====================
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("PATIENT INFORMATION", 20, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const patientInfo = [
    [`Patient ID: ${data.patient.patientNumber}`, `Name: ${data.patient.surname}, ${data.patient.firstName}`],
    [`Date of Birth: ${data.patient.birthday}`, `Sex: ${data.patient.sex}`],
    [`Age: ${calculateAge(data.patient.birthday)} years`, `Phone: ${data.patient.phone || "N/A"}`],
  ];

  patientInfo.forEach(row => {
    doc.text(row[0], 20, yPos);
    doc.text(row[1], 110, yPos);
    yPos += 6;
  });

  if (data.patient.allergies && data.patient.allergies.length > 0) {
    yPos += 2;
    doc.setFont("helvetica", "bold");
    doc.text("Allergies:", 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.patient.allergies.join(", "), 42, yPos);
    yPos += 6;
  }

  yPos += 5;

  // ==================== SURGERY INFORMATION ====================
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("SURGERY INFORMATION", 20, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const surgeryInfo = [
    [`Procedure: ${data.surgery.plannedSurgery}`, `Surgeon: ${data.surgery.surgeon || "N/A"}`],
    [`Planned Date: ${formatDate(data.surgery.plannedDate)}`, `Status: ${data.surgery.status.toUpperCase()}`],
  ];

  if (data.surgery.actualStartTime) {
    surgeryInfo.push([`Actual Start: ${formatDateTime24h(data.surgery.actualStartTime)}`, ""]);
  }
  if (data.surgery.actualEndTime) {
    surgeryInfo.push([`Actual End: ${formatDateTime24h(data.surgery.actualEndTime)}`, ""]);
  }

  surgeryInfo.forEach(row => {
    doc.text(row[0], 20, yPos);
    if (row[1]) doc.text(row[1], 110, yPos);
    yPos += 6;
  });

  yPos += 5;

  // ==================== PRE-OPERATIVE ASSESSMENT ====================
  if (data.preOpAssessment) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PRE-OPERATIVE ASSESSMENT", 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const preOpInfo = [];
    if (data.preOpAssessment.height || data.preOpAssessment.weight) {
      preOpInfo.push([
        `Height: ${data.preOpAssessment.height || "N/A"}`,
        `Weight: ${data.preOpAssessment.weight || "N/A"}`
      ]);
    }
    if (data.preOpAssessment.asa) {
      preOpInfo.push([`ASA Classification: ${data.preOpAssessment.asa}`, ""]);
    }
    if (data.preOpAssessment.mallampati) {
      preOpInfo.push([
        `Mallampati: ${data.preOpAssessment.mallampati}`,
        `Airway Difficulty: ${data.preOpAssessment.airwayDifficult || "N/A"}`
      ]);
    }
    if (data.preOpAssessment.lastSolids || data.preOpAssessment.lastClear) {
      preOpInfo.push([
        `Last Solids: ${data.preOpAssessment.lastSolids || "N/A"}`,
        `Last Clear: ${data.preOpAssessment.lastClear || "N/A"}`
      ]);
    }

    preOpInfo.forEach(row => {
      doc.text(row[0], 20, yPos);
      if (row[1]) doc.text(row[1], 110, yPos);
      yPos += 6;
    });

    // Planned anesthesia techniques
    if (data.preOpAssessment.anesthesiaTechniques) {
      const techniques = data.preOpAssessment.anesthesiaTechniques as any;
      if (techniques && Object.keys(techniques).length > 0) {
        yPos += 2;
        doc.setFont("helvetica", "bold");
        doc.text("Planned Anesthesia:", 20, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        Object.entries(techniques).forEach(([key, value]) => {
          if (value === true) {
            doc.text(`• ${key.replace(/([A-Z])/g, ' $1').trim()}`, 25, yPos);
            yPos += 5;
          }
        });
      }
    }

    // Informed consent signature
    if (data.preOpAssessment.informedConsentData) {
      const consentData = data.preOpAssessment.informedConsentData as any;
      if (consentData.signature) {
        yPos += 3;
        doc.setFont("helvetica", "bold");
        doc.text("Informed Consent Signature:", 20, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text("✓ Signed electronically", 25, yPos);
        if (consentData.completedAt) {
          doc.text(`Date: ${formatDateTime24h(new Date(consentData.completedAt))}`, 25, yPos + 5);
          yPos += 5;
        }
        yPos += 5;
      }
    }

    yPos += 5;
  }

  // ==================== ANESTHESIA RECORD DETAILS ====================
  if (data.anesthesiaRecord) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ANESTHESIA DETAILS", 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const anesInfo = [];
    if (data.anesthesiaRecord.anesthesiaType) {
      anesInfo.push([`Type: ${data.anesthesiaRecord.anesthesiaType.toUpperCase()}`, ""]);
    }
    if (data.anesthesiaRecord.physicalStatus) {
      anesInfo.push([`ASA Physical Status: ${data.anesthesiaRecord.physicalStatus}`, ""]);
    }
    if (data.anesthesiaRecord.emergencyCase) {
      anesInfo.push([`Emergency Case: Yes`, ""]);
    }
    if (data.anesthesiaRecord.anesthesiaStartTime) {
      anesInfo.push([`Anesthesia Start: ${formatDateTime24h(data.anesthesiaRecord.anesthesiaStartTime)}`, ""]);
    }
    if (data.anesthesiaRecord.anesthesiaEndTime) {
      anesInfo.push([`Anesthesia End: ${formatDateTime24h(data.anesthesiaRecord.anesthesiaEndTime)}`, ""]);
    }

    anesInfo.forEach(row => {
      doc.text(row[0], 20, yPos);
      yPos += 6;
    });

    yPos += 5;
  }

  // ==================== TIME MARKERS ====================
  if (data.anesthesiaRecord?.timeMarkers) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("TIME MARKERS", 20, yPos);
    yPos += 7;

    const markers = data.anesthesiaRecord.timeMarkers as TimeMarker[];
    const markerData = markers
      .filter(m => m.time !== null)
      .map(m => [
        m.code,
        m.label,
        formatTimeFrom24h(m.time!)
      ]);

    if (markerData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [["Code", "Event", "Time"]],
        body: markerData,
        theme: "grid",
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [59, 130, 246], textColor: 255 },
        columnStyles: {
          0: { cellWidth: 25 },
          1: { cellWidth: 100 },
          2: { cellWidth: 35 },
        },
      });
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
  }

  // ==================== EVENTS & NOTES ====================
  if (data.events && data.events.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("EVENTS & NOTES", 20, yPos);
    yPos += 7;

    const eventData = data.events.map(event => {
      const eventDate = new Date(event.timestamp);
      const timeStr = isNaN(eventDate.getTime()) 
        ? "Invalid Time" 
        : formatTimeFrom24h(eventDate.getTime());
      
      return [
        timeStr,
        event.description,
        event.eventType || "Note"
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Time", "Description", "Type"]],
      body: eventData,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { cellWidth: 30 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== MEDICATION ADMINISTRATION ====================
  if (data.medications && data.medications.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("MEDICATION ADMINISTRATION", 20, yPos);
    yPos += 7;

    // Create a map of itemId to item name (with fallback for missing data)
    const itemMap = new Map((data.anesthesiaItems || []).map(item => [item.id, item]));

    const medData = data.medications.map(med => {
      const medDate = new Date(med.timestamp);
      const timeStr = isNaN(medDate.getTime()) 
        ? "Invalid Time" 
        : formatTimeFrom24h(medDate.getTime());
        
      const item = itemMap.get(med.itemId);
      const itemName = item?.name || "Unknown Medication";
      const doseUnit = med.unit || item?.administrationUnit || "";
      const route = med.route || item?.administrationRoute || "";
      
      let typeDisplay = med.type;
      if (med.type === "infusion_start") {
        typeDisplay = med.rate === "free" ? "Infusion (Free)" : `Infusion (${med.rate})`;
      } else if (med.type === "infusion_stop") {
        typeDisplay = "Stop Infusion";
      } else if (med.type === "bolus") {
        typeDisplay = "Bolus";
      }

      return [
        timeStr,
        itemName,
        `${med.dose} ${doseUnit}`.trim(),
        route,
        typeDisplay
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Time", "Medication", "Dose", "Route", "Type"]],
      body: medData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 60 },
        2: { cellWidth: 35 },
        3: { cellWidth: 25 },
        4: { cellWidth: 35 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== VITAL SIGNS SUMMARY ====================
  if (data.clinicalSnapshot?.data) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("VITAL SIGNS SUMMARY", 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const snapshotData = data.clinicalSnapshot.data as any;
    const vitalsInfo = [];

    if (snapshotData.hr && snapshotData.hr.length > 0) {
      const hrValues = snapshotData.hr.map((p: any) => p.value);
      vitalsInfo.push([
        `Heart Rate: ${Math.min(...hrValues)} - ${Math.max(...hrValues)} bpm (${snapshotData.hr.length} readings)`,
        ""
      ]);
    }

    if (snapshotData.bp && snapshotData.bp.length > 0) {
      const bpSys = snapshotData.bp.map((p: any) => p.sys);
      const bpDia = snapshotData.bp.map((p: any) => p.dia);
      vitalsInfo.push([
        `Blood Pressure: ${Math.min(...bpSys)}/${Math.min(...bpDia)} - ${Math.max(...bpSys)}/${Math.max(...bpDia)} mmHg (${snapshotData.bp.length} readings)`,
        ""
      ]);
    }

    if (snapshotData.spo2 && snapshotData.spo2.length > 0) {
      const spo2Values = snapshotData.spo2.map((p: any) => p.value);
      vitalsInfo.push([
        `SpO2: ${Math.min(...spo2Values)} - ${Math.max(...spo2Values)}% (${snapshotData.spo2.length} readings)`,
        ""
      ]);
    }

    if (snapshotData.temp && snapshotData.temp.length > 0) {
      const tempValues = snapshotData.temp.map((p: any) => p.value);
      vitalsInfo.push([
        `Temperature: ${Math.min(...tempValues).toFixed(1)} - ${Math.max(...tempValues).toFixed(1)}°C (${snapshotData.temp.length} readings)`,
        ""
      ]);
    }

    if (vitalsInfo.length === 0) {
      doc.text("No vital signs recorded", 20, yPos);
      yPos += 6;
    } else {
      vitalsInfo.forEach(row => {
        doc.text(row[0], 20, yPos);
        yPos += 6;
      });
    }

    yPos += 5;
  }

  // ==================== POST-OPERATIVE INFORMATION ====================
  if (data.anesthesiaRecord?.postOpData) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("POST-OPERATIVE INFORMATION", 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const postOpData = data.anesthesiaRecord.postOpData as any;
    const postOpInfo = [];

    if (postOpData.postOpDestination) {
      postOpInfo.push([`Destination: ${postOpData.postOpDestination}`, ""]);
    }
    if (postOpData.complications) {
      postOpInfo.push([`Complications: ${postOpData.complications}`, ""]);
    }
    if (postOpData.postOpNotes) {
      postOpInfo.push([`Notes: ${postOpData.postOpNotes}`, ""]);
    }

    // Medication schedule
    const medSchedule = [];
    if (postOpData.paracetamolTime) medSchedule.push(`Paracetamol: ${postOpData.paracetamolTime}`);
    if (postOpData.nsarTime) medSchedule.push(`NSAR: ${postOpData.nsarTime}`);
    if (postOpData.novalginTime) medSchedule.push(`Novalgin: ${postOpData.novalginTime}`);

    if (medSchedule.length > 0) {
      postOpInfo.push([`Medication Schedule: ${medSchedule.join(", ")}`, ""]);
    }

    postOpInfo.forEach(row => {
      doc.text(row[0], 20, yPos);
      yPos += 6;
    });

    yPos += 5;
  }

  // ==================== STAFFING ====================
  if (data.staffMembers && data.staffMembers.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("ANESTHESIA STAFF", 20, yPos);
    yPos += 7;

    const staffData = data.staffMembers.map(staff => {
      const startDate = new Date(staff.startTime);
      const startTimeStr = isNaN(startDate.getTime()) 
        ? "Invalid Time" 
        : formatTimeFrom24h(startDate.getTime());
      
      const endTimeStr = staff.endTime 
        ? (() => {
            const endDate = new Date(staff.endTime);
            return isNaN(endDate.getTime()) ? "Invalid Time" : formatTimeFrom24h(endDate.getTime());
          })()
        : "Ongoing";

      return [
        staff.role,
        staff.name,
        startTimeStr,
        endTimeStr
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Role", "Name", "Start Time", "End Time"]],
      body: staffData,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 40 },
        1: { cellWidth: 60 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== PATIENT POSITIONING ====================
  if (data.positions && data.positions.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("PATIENT POSITIONING", 20, yPos);
    yPos += 7;

    const positionData = data.positions.map(pos => {
      const posDate = new Date(pos.time);
      const timeStr = isNaN(posDate.getTime()) 
        ? "Invalid Time" 
        : formatTimeFrom24h(posDate.getTime());
      
      return [
        timeStr,
        pos.position
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [["Time", "Position"]],
      body: positionData,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 130 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== SIGNATURES ====================
  if (data.preOpAssessment) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("SIGNATURES", 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    // Pre-operative assessment signature
    if (data.preOpAssessment.doctorSignature) {
      doc.setFont("helvetica", "bold");
      doc.text("Pre-Operative Assessment:", 20, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.text(`Anesthesiologist: ${data.preOpAssessment.doctorSignature}`, 25, yPos);
      yPos += 5;
      if (data.preOpAssessment.assessmentDate) {
        doc.text(`Date: ${formatDate(data.preOpAssessment.assessmentDate)}`, 25, yPos);
        yPos += 7;
      }
    }

    // Informed consent signature
    if (data.preOpAssessment.informedConsentData) {
      const consentData = data.preOpAssessment.informedConsentData as any;
      if (consentData.signature) {
        doc.setFont("helvetica", "bold");
        doc.text("Informed Consent:", 20, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        doc.text("✓ Patient consent obtained electronically", 25, yPos);
        yPos += 5;
        if (consentData.completedAt) {
          doc.text(`Date/Time: ${formatDateTime24h(new Date(consentData.completedAt))}`, 25, yPos);
          yPos += 5;
        }
      }
    }

    yPos += 5;
  }

  // ==================== FOOTER ====================
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Page ${i} of ${pageCount} | ${data.patient.patientNumber} | ${formatDate(data.surgery.plannedDate)}`,
      105,
      287,
      { align: "center" }
    );
  }

  // ==================== SAVE PDF ====================
  const fileName = `AnesthesiaRecord_${data.patient.patientNumber}_${data.surgery.plannedDate.toString().split('T')[0]}.pdf`;
  doc.save(fileName);
}

function calculateAge(birthday: string): number {
  const birthDate = new Date(birthday);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}
