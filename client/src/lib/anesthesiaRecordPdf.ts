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
  timeMarkers?: TimeMarker[];
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

// Helper to draw a timeline chart with multiple data series
function drawTimelineChart(
  doc: jsPDF,
  title: string,
  dataSeries: Array<{
    name: string;
    data: Array<{ time: number; value: number }>;
    color: [number, number, number];
  }>,
  yPos: number,
  options: {
    yLabel?: string;
    min?: number;
    max?: number;
    height?: number;
  }
): number {
  const chartHeight = options.height || 60;
  const chartWidth = 170;
  const chartX = 20;
  const chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);
  
  const plotY = chartY + 10;
  const plotHeight = chartHeight - 20;
  const plotWidth = chartWidth;

  // Check if we have any data
  const hasData = dataSeries.some(series => series.data.length > 0);
  if (!hasData) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No data available", chartX + 5, plotY + plotHeight / 2);
    return chartY + chartHeight + 5;
  }

  // Find global min/max time and values
  let allTimes: number[] = [];
  let allValues: number[] = [];
  dataSeries.forEach(series => {
    series.data.forEach(point => {
      allTimes.push(point.time);
      allValues.push(point.value);
    });
  });

  if (allTimes.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No data available", chartX + 5, plotY + plotHeight / 2);
    return chartY + chartHeight + 5;
  }

  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);
  const minValue = options.min !== undefined ? options.min : Math.floor(Math.min(...allValues) * 0.9);
  const maxValue = options.max !== undefined ? options.max : Math.ceil(Math.max(...allValues) * 1.1);

  // Draw chart border
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(chartX, plotY, plotWidth, plotHeight);

  // Draw grid lines (horizontal)
  doc.setDrawColor(240, 240, 240);
  doc.setLineWidth(0.2);
  for (let i = 1; i < 5; i++) {
    const y = plotY + (plotHeight / 5) * i;
    doc.line(chartX, y, chartX + plotWidth, y);
  }

  // Draw Y-axis labels
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  for (let i = 0; i <= 5; i++) {
    const value = maxValue - ((maxValue - minValue) / 5) * i;
    const y = plotY + (plotHeight / 5) * i;
    doc.text(value.toFixed(0), chartX - 10, y + 2, { align: "right" });
  }

  // Y-axis label
  if (options.yLabel) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(options.yLabel, chartX - 15, plotY + plotHeight / 2, {
      angle: 90,
      align: "center",
    });
  }

  // Draw X-axis time labels
  const numXLabels = 5;
  for (let i = 0; i <= numXLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numXLabels) * i;
    const x = chartX + (plotWidth / numXLabels) * i;
    doc.setFontSize(7);
    doc.text(formatTimeFrom24h(time), x, plotY + plotHeight + 5, { align: "center" });
  }

  // Plot data series
  dataSeries.forEach(series => {
    if (series.data.length === 0) return;

    doc.setDrawColor(...series.color);
    doc.setLineWidth(0.8);

    const sortedData = [...series.data].sort((a, b) => a.time - b.time);

    for (let i = 0; i < sortedData.length - 1; i++) {
      const p1 = sortedData[i];
      const p2 = sortedData[i + 1];

      const x1 = chartX + ((p1.time - minTime) / (maxTime - minTime)) * plotWidth;
      const y1 = plotY + plotHeight - ((p1.value - minValue) / (maxValue - minValue)) * plotHeight;
      const x2 = chartX + ((p2.time - minTime) / (maxTime - minTime)) * plotWidth;
      const y2 = plotY + plotHeight - ((p2.value - minValue) / (maxValue - minValue)) * plotHeight;

      doc.line(x1, y1, x2, y2);
    }

    // Draw points
    sortedData.forEach(point => {
      const x = chartX + ((point.time - minTime) / (maxTime - minTime)) * plotWidth;
      const y = plotY + plotHeight - ((point.value - minValue) / (maxValue - minValue)) * plotHeight;
      doc.setFillColor(...series.color);
      doc.circle(x, y, 0.5, "F");
    });
  });

  // Draw legend
  let legendX = chartX;
  const legendY = plotY + plotHeight + 10;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  dataSeries.forEach((series, idx) => {
    doc.setFillColor(...series.color);
    doc.rect(legendX, legendY - 2, 3, 3, "F");
    doc.setTextColor(0, 0, 0);
    doc.text(series.name, legendX + 5, legendY);
    legendX += doc.getTextWidth(series.name) + 15;
  });

  doc.setTextColor(0, 0, 0);
  return chartY + chartHeight + 5;
}

// Helper to draw medication timeline swimlanes
function drawMedicationTimeline(
  doc: jsPDF,
  title: string,
  medications: MedicationAdministration[],
  anesthesiaItems: AnesthesiaItem[],
  yPos: number
): number {
  const chartHeight = 60;
  const chartWidth = 170;
  const chartX = 20;
  const chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  if (!medications || medications.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No medications administered", chartX + 5, chartY + 15);
    return chartY + 25;
  }

  const plotY = chartY + 10;
  const itemMap = new Map(anesthesiaItems.map(item => [item.id, item]));

  // Group medications by item
  const medsByItem = new Map<string, MedicationAdministration[]>();
  medications.forEach(med => {
    const meds = medsByItem.get(med.itemId) || [];
    meds.push(med);
    medsByItem.set(med.itemId, meds);
  });

  // Get time range
  const allTimes = medications.map(m => new Date(m.timestamp).getTime());
  const minTime = Math.min(...allTimes);
  const maxTime = Math.max(...allTimes);

  // Draw swimlanes
  let currentY = plotY;
  const laneHeight = 8;
  const maxLanes = Math.min(medsByItem.size, 6); // Limit to 6 lanes to fit in chart

  let laneIndex = 0;
  for (const [itemId, meds] of Array.from(medsByItem.entries())) {
    if (laneIndex >= maxLanes) break;

    const item = itemMap.get(itemId);
    const itemName = item?.name || "Unknown";

    // Draw lane background
    doc.setFillColor(laneIndex % 2 === 0 ? 250 : 245, 250, 250);
    doc.rect(chartX, currentY, chartWidth, laneHeight, "F");

    // Draw item name
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(50, 50, 50);
    const truncatedName = itemName.length > 20 ? itemName.substring(0, 17) + "..." : itemName;
    doc.text(truncatedName, chartX + 2, currentY + 5);

    // Draw medication events
    meds.forEach((med: MedicationAdministration) => {
      const medTime = new Date(med.timestamp).getTime();
      const x = chartX + 40 + ((medTime - minTime) / (maxTime - minTime)) * (chartWidth - 45);

      if (med.type === "bolus") {
        // Draw bolus as vertical bar
        doc.setFillColor(59, 130, 246);
        doc.rect(x - 0.5, currentY + 1, 1, laneHeight - 2, "F");
        // Add dose label
        doc.setFontSize(6);
        doc.setTextColor(0, 0, 0);
        doc.text(med.dose, x + 1, currentY + 4);
      } else if (med.type === "infusion_start") {
        // Draw infusion as horizontal bar
        const endMed = meds.find((m: MedicationAdministration) => m.type === "infusion_stop" && new Date(m.timestamp).getTime() > medTime);
        const endTime = endMed ? new Date(endMed.timestamp).getTime() : maxTime;
        const endX = chartX + 40 + ((endTime - minTime) / (maxTime - minTime)) * (chartWidth - 45);

        doc.setFillColor(16, 185, 129);
        doc.rect(x, currentY + 2, endX - x, laneHeight - 4, "F");
        // Add rate label
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        const rateText = med.rate === "free" ? "Free" : med.rate || "";
        doc.text(rateText, x + 2, currentY + 5);
      }
    });

    currentY += laneHeight;
    laneIndex++;
  }

  // Draw time axis
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const numLabels = 4;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = chartX + 40 + ((chartWidth - 45) / numLabels) * i;
    doc.text(formatTimeFrom24h(time), x, currentY + 5, { align: "center" });
  }

  doc.setTextColor(0, 0, 0);
  return currentY + 10;
}

// Helper to draw output/fluid balance chart
function drawOutputChart(
  doc: jsPDF,
  title: string,
  outputData: any,
  yPos: number
): number {
  const chartHeight = 50;
  const chartWidth = 170;
  const chartX = 20;
  const chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  const plotY = chartY + 10;

  // Collect all output types
  const outputTypes = [
    { key: "urine", label: "Urine", color: [251, 191, 36] as [number, number, number] },
    { key: "drainage", label: "Drainage", color: [239, 68, 68] as [number, number, number] },
    { key: "gastricTube", label: "Gastric", color: [34, 197, 94] as [number, number, number] },
    { key: "blood", label: "Blood", color: [220, 38, 38] as [number, number, number] },
  ];

  // Check if we have any data
  const hasData = outputTypes.some(type => outputData[type.key] && outputData[type.key].length > 0);
  
  if (!hasData) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No output data available", chartX + 5, plotY + 10);
    return chartY + 25;
  }

  // Calculate totals for each type
  const totals: { label: string; value: number; color: [number, number, number] }[] = [];
  outputTypes.forEach(type => {
    const data = outputData[type.key] || [];
    if (data.length > 0) {
      const total = data.reduce((sum: number, point: any) => sum + (point.value || 0), 0);
      if (total > 0) {
        totals.push({ label: type.label, value: total, color: type.color });
      }
    }
  });

  if (totals.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No output data available", chartX + 5, plotY + 10);
    return chartY + 25;
  }

  // Draw bar chart
  const maxValue = Math.max(...totals.map(t => t.value));
  const barHeight = 15;
  const maxBarWidth = chartWidth - 60;

  totals.forEach((item, idx) => {
    const barY = plotY + idx * (barHeight + 5);
    const barWidth = (item.value / maxValue) * maxBarWidth;

    // Draw bar
    doc.setFillColor(...item.color);
    doc.rect(chartX + 50, barY, barWidth, barHeight, "F");

    // Draw label
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(item.label, chartX, barY + 10);

    // Draw value
    doc.text(`${item.value.toFixed(0)} ml`, chartX + 55 + barWidth, barY + 10);
  });

  doc.setTextColor(0, 0, 0);
  return chartY + totals.length * (barHeight + 5) + 15;
}

// Helper to draw rhythm timeline
function drawRhythmTimeline(
  doc: jsPDF,
  title: string,
  rhythmData: Array<{ id: string; timestamp: string; value: string }>,
  yPos: number
): number {
  const chartHeight = 30;
  const chartWidth = 170;
  const chartX = 20;
  const chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  if (!rhythmData || rhythmData.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text("No rhythm changes recorded", chartX + 5, chartY + 15);
    return chartY + 25;
  }

  const plotY = chartY + 10;
  const laneHeight = 15;

  // Sort by timestamp
  const sortedData = [...rhythmData].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Get time range
  const times = sortedData.map(r => new Date(r.timestamp).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);

  // Draw timeline background
  doc.setFillColor(250, 250, 250);
  doc.rect(chartX, plotY, chartWidth, laneHeight, "F");
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.5);
  doc.rect(chartX, plotY, chartWidth, laneHeight);

  // Draw rhythm segments
  sortedData.forEach((rhythm, idx) => {
    const startTime = new Date(rhythm.timestamp).getTime();
    const endTime = idx < sortedData.length - 1 
      ? new Date(sortedData[idx + 1].timestamp).getTime() 
      : maxTime;

    const x1 = chartX + ((startTime - minTime) / (maxTime - minTime)) * chartWidth;
    const x2 = chartX + ((endTime - minTime) / (maxTime - minTime)) * chartWidth;

    // Color code by rhythm
    const rhythmColors: { [key: string]: [number, number, number] } = {
      "Sinus": [34, 197, 94],
      "AF": [239, 68, 68],
      "SVT": [251, 146, 60],
      "VT": [220, 38, 38],
    };
    const color = rhythmColors[rhythm.value] || [100, 100, 100];
    
    doc.setFillColor(...color);
    doc.rect(x1, plotY + 2, x2 - x1, laneHeight - 4, "F");

    // Add label if segment is wide enough
    if (x2 - x1 > 15) {
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(rhythm.value, x1 + 2, plotY + 9);
    }
  });

  // Draw time labels
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const numLabels = 4;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = chartX + (chartWidth / numLabels) * i;
    doc.text(formatTimeFrom24h(time), x, plotY + laneHeight + 5, { align: "center" });
  }

  doc.setTextColor(0, 0, 0);
  return chartY + chartHeight + 5;
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

    // ==================== VISUAL CHARTS: VITALS TIMELINE ====================
    yPos = checkPageBreak(doc, yPos, 90);

    const hrData = (snapshotData.hr || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const bpSysData = (snapshotData.bp || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.sys
    }));
    const bpDiaData = (snapshotData.bp || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.dia
    }));
    const spo2Data = (snapshotData.spo2 || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const tempData = (snapshotData.temp || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));

    // Draw Vitals Chart
    yPos = drawTimelineChart(
      doc,
      "VITAL SIGNS TIMELINE",
      [
        { name: "HR (bpm)", data: hrData, color: [59, 130, 246] },
        { name: "BP Sys", data: bpSysData, color: [220, 38, 38] },
        { name: "BP Dia", data: bpDiaData, color: [239, 68, 68] },
        { name: "SpO2 (%)", data: spo2Data, color: [34, 197, 94] },
        { name: "Temp (°C)", data: tempData, color: [251, 146, 60] },
      ],
      yPos,
      { yLabel: "Value", height: 80 }
    );

    // ==================== VISUAL CHARTS: MEDICATIONS TIMELINE ====================
    if (data.medications && data.medications.length > 0) {
      yPos = checkPageBreak(doc, yPos, 80);
      yPos = drawMedicationTimeline(
        doc,
        "MEDICATIONS & INFUSIONS TIMELINE",
        data.medications,
        data.anesthesiaItems || [],
        yPos
      );
    }

    // ==================== VISUAL CHARTS: VENTILATION PARAMETERS ====================
    yPos = checkPageBreak(doc, yPos, 90);

    const pipData = (snapshotData.pip || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const peepData = (snapshotData.peep || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const tidalVolumeData = (snapshotData.tidalVolume || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const respRateData = (snapshotData.respiratoryRate || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const fio2Data = (snapshotData.fio2 || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));
    const etco2Data = (snapshotData.etco2 || []).map((p: any) => ({
      time: new Date(p.timestamp).getTime(),
      value: p.value
    }));

    // Draw Ventilation Parameters Chart
    yPos = drawTimelineChart(
      doc,
      "VENTILATION PARAMETERS",
      [
        { name: "PIP (cmH2O)", data: pipData, color: [59, 130, 246] },
        { name: "PEEP (cmH2O)", data: peepData, color: [16, 185, 129] },
        { name: "TV (ml)", data: tidalVolumeData, color: [251, 146, 60] },
        { name: "RR (/min)", data: respRateData, color: [139, 92, 246] },
        { name: "FiO2 (%)", data: fio2Data, color: [236, 72, 153] },
        { name: "EtCO2 (mmHg)", data: etco2Data, color: [234, 179, 8] },
      ],
      yPos,
      { yLabel: "Value", height: 80 }
    );

    // ==================== VISUAL CHARTS: FLUID BALANCE & OUTPUT ====================
    yPos = checkPageBreak(doc, yPos, 70);
    yPos = drawOutputChart(
      doc,
      "FLUID BALANCE & OUTPUT",
      snapshotData,
      yPos
    );

    // ==================== VISUAL CHARTS: HEART RHYTHM ====================
    if (snapshotData.heartRhythm && snapshotData.heartRhythm.length > 0) {
      yPos = checkPageBreak(doc, yPos, 50);
      yPos = drawRhythmTimeline(
        doc,
        "HEART RHYTHM",
        snapshotData.heartRhythm,
        yPos
      );
    }
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
