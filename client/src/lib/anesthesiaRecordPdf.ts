import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import i18next from "i18next";
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
  timestamp: string | Date;
}

interface PositionEntry {
  id: string;
  position: string;
  timestamp: string | Date;
}

interface ChecklistSettings {
  signIn?: Array<{ id: string; label: string }>;
  timeOut?: Array<{ id: string; label: string }>;
  signOut?: Array<{ id: string; label: string }>;
}

interface InventoryUsageEntry {
  id: string;
  itemId: string;
  itemName?: string;
  calculatedQty: string | number;
  overrideQty?: string | number | null;
  unit?: string | null;
}

interface InventoryItem {
  id: string;
  name: string;
  unit?: string | null;
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
  inventoryItems?: InventoryItem[];
  staffMembers?: StaffMember[];
  positions?: PositionEntry[];
  timeMarkers?: TimeMarker[];
  checklistSettings?: ChecklistSettings | null;
  inventoryUsage?: InventoryUsageEntry[];
  chartImage?: string | null;
}

// Helper to format time from milliseconds to HH:MM (24-hour format)
function formatTimeFrom24h(timeMs: number): string {
  const date = new Date(timeMs);
  if (isNaN(date.getTime())) return i18next.t("anesthesia.pdf.invalidTime");
  
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Helper to format datetime to DD.MM.YYYY HH:MM (24-hour format, European style)
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
  } catch (error) {
    return i18next.t("anesthesia.pdf.invalidDate");
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

// Helper to render a base64 signature image in the PDF
function renderSignatureImage(
  doc: jsPDF,
  signatureBase64: string,
  xPos: number,
  yPos: number,
  width: number = 50,
  height: number = 20
): void {
  try {
    // Add signature image (base64 data URL)
    doc.addImage(signatureBase64, 'PNG', xPos, yPos, width, height);
    // Draw a border around the signature
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(xPos, yPos, width, height);
  } catch (error) {
    // Fallback: just draw a placeholder box if image fails
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(xPos, yPos, width, height);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(i18next.t("anesthesia.pdf.signatureError"), xPos + 2, yPos + height / 2);
    doc.setTextColor(0, 0, 0);
  }
}

// Helper to draw WHO Surgical Safety Checklist section
function drawWHOChecklist(
  doc: jsPDF,
  title: string,
  checklistData: { checklist?: Record<string, boolean>; notes?: string; signature?: string } | undefined,
  items: Array<{ key: string; label: string }>,
  yPos: number
): number {
  // Draw section title
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.setFillColor(59, 130, 246);
  doc.rect(20, yPos - 5, 170, 8, "F");
  doc.setTextColor(255, 255, 255);
  doc.text(title, 22, yPos);
  doc.setTextColor(0, 0, 0);
  yPos += 8;

  if (!checklistData || !checklistData.checklist) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(100, 100, 100);
    doc.text(i18next.t("anesthesia.pdf.notCompleted"), 25, yPos);
    doc.setTextColor(0, 0, 0);
    return yPos + 10;
  }

  const checklist = checklistData.checklist;
  
  // Draw checklist items with checkboxes
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  items.forEach((item) => {
    const isChecked = checklist[item.key] || false;
    
    // Draw checkbox
    const boxSize = 4;
    const boxX = 25;
    const boxY = yPos - 3;
    
    doc.setDrawColor(100, 100, 100);
    doc.setLineWidth(0.3);
    doc.rect(boxX, boxY, boxSize, boxSize);
    
    // Draw checkmark if checked
    if (isChecked) {
      doc.setFillColor(34, 197, 94);
      doc.rect(boxX + 0.5, boxY + 0.5, boxSize - 1, boxSize - 1, "F");
      doc.setDrawColor(255, 255, 255);
      doc.setLineWidth(0.5);
      // Draw checkmark symbol
      doc.line(boxX + 1.2, boxY + 2, boxX + 1.8, boxY + 3);
      doc.line(boxX + 1.8, boxY + 3, boxX + 3.2, boxY + 1);
    }
    
    // Draw item label
    doc.setTextColor(0, 0, 0);
    doc.text(item.label, boxX + boxSize + 3, yPos);
    yPos += 5.5;
  });
  
  yPos += 2;
  
  // Draw notes if available
  if (checklistData.notes && checklistData.notes.trim() !== "") {
    // Check if we need a new page before starting notes
    yPos = checkPageBreak(doc, yPos, 30);
    
    doc.setFont("helvetica", "bold");
    doc.text(`${i18next.t("anesthesia.pdf.notes")}:`, 25, yPos);
    yPos += 5;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    const splitNotes = doc.splitTextToSize(checklistData.notes, 160);
    splitNotes.forEach((line: string, idx: number) => {
      // Check for page break every 10 lines or when we're low on space
      if (idx % 10 === 0) {
        yPos = checkPageBreak(doc, yPos, 20);
      }
      doc.text(line, 25, yPos);
      yPos += 4;
    });
    yPos += 3;
  }
  
  // Draw signature if available
  if (checklistData.signature) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(`${i18next.t("anesthesia.pdf.signature")}:`, 25, yPos);
    yPos += 5;
    
    // Render the signature image
    renderSignatureImage(doc, checklistData.signature, 25, yPos, 50, 15);
    yPos += 18;
  }
  
  return yPos + 5;
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
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 5, plotY + plotHeight / 2);
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
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 5, plotY + plotHeight / 2);
    return chartY + chartHeight + 5;
  }

  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);
  let minValue = options.min !== undefined ? options.min : Math.floor(Math.min(...allValues) * 0.9);
  let maxValue = options.max !== undefined ? options.max : Math.ceil(Math.max(...allValues) * 1.1);

  // Guard against single data point (prevents division by zero)
  if (maxTime === minTime) {
    // Expand time range by ±1 hour (3600000 ms)
    minTime -= 3600000;
    maxTime += 3600000;
  }
  if (maxValue === minValue) {
    // Expand value range by ±10% or minimum of ±10
    const range = Math.max(maxValue * 0.1, 10);
    minValue -= range;
    maxValue += range;
  }

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

// ==================== LANDSCAPE CHART FUNCTIONS ====================
// These functions are optimized for landscape A4 pages (297mm x 210mm)

// Landscape version of timeline chart - full width for better visibility
// Enhanced with:
// - Black BP with carets (up for systolic, down for diastolic) and gray fill between
// - Red HR with heart icons
// - Blue SpO2 with separate 50-100 scale on right axis
// - Orange Temperature with circles
function drawLandscapeTimelineChart(
  doc: jsPDF,
  title: string,
  vitalsData: {
    hr: Array<{ time: number; value: number }>;
    bpSys: Array<{ time: number; value: number }>;
    bpDia: Array<{ time: number; value: number }>;
    spo2: Array<{ time: number; value: number }>;
    temp: Array<{ time: number; value: number }>;
  },
  yPos: number,
  options: {
    chartWidth: number;
    height?: number;
  }
): number {
  const chartHeight = options.height || 80;
  const chartX = 20; // Extra margin for left Y-axis
  const chartY = yPos;
  const plotWidth = options.chartWidth - 10; // Reserve space for right Y-axis

  // Draw title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);
  
  const plotY = chartY + 12;
  const plotHeight = chartHeight - 25;

  // Check if we have any data
  const hasData = vitalsData.hr.length > 0 || vitalsData.bpSys.length > 0 || 
                  vitalsData.spo2.length > 0 || vitalsData.temp.length > 0;
  if (!hasData) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 10, plotY + plotHeight / 2);
    return chartY + chartHeight + 8;
  }

  // Find global time range
  let allTimes: number[] = [];
  [vitalsData.hr, vitalsData.bpSys, vitalsData.bpDia, vitalsData.spo2, vitalsData.temp].forEach(arr => {
    arr.forEach(point => allTimes.push(point.time));
  });

  if (allTimes.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 10, plotY + plotHeight / 2);
    return chartY + chartHeight + 8;
  }

  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);
  if (maxTime === minTime) {
    minTime -= 3600000;
    maxTime += 3600000;
  }

  // Calculate left Y-axis range (for HR, BP, Temp) - typically 0-200
  let leftAxisValues: number[] = [];
  [vitalsData.hr, vitalsData.bpSys, vitalsData.bpDia, vitalsData.temp].forEach(arr => {
    arr.forEach(point => leftAxisValues.push(point.value));
  });
  
  let minLeftValue = leftAxisValues.length > 0 ? Math.floor(Math.min(...leftAxisValues) * 0.9) : 0;
  let maxLeftValue = leftAxisValues.length > 0 ? Math.ceil(Math.max(...leftAxisValues) * 1.1) : 200;
  if (maxLeftValue === minLeftValue) {
    minLeftValue = Math.max(0, minLeftValue - 20);
    maxLeftValue = maxLeftValue + 20;
  }
  // Ensure reasonable range for vitals
  minLeftValue = Math.max(0, minLeftValue);
  maxLeftValue = Math.max(maxLeftValue, 180);

  // Right Y-axis for SpO2 (fixed 50-100 range)
  const minSpo2 = 50;
  const maxSpo2 = 100;

  // Draw chart border
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.rect(chartX, plotY, plotWidth, plotHeight);

  // Draw grid lines (horizontal)
  doc.setDrawColor(230, 230, 230);
  doc.setLineWidth(0.15);
  for (let i = 1; i < 5; i++) {
    const y = plotY + (plotHeight / 5) * i;
    doc.line(chartX, y, chartX + plotWidth, y);
  }

  // Draw vertical grid lines for time
  for (let i = 1; i < 8; i++) {
    const x = chartX + (plotWidth / 8) * i;
    doc.line(x, plotY, x, plotY + plotHeight);
  }

  // Draw LEFT Y-axis labels (HR, BP, Temp scale)
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  for (let i = 0; i <= 5; i++) {
    const value = maxLeftValue - ((maxLeftValue - minLeftValue) / 5) * i;
    const y = plotY + (plotHeight / 5) * i;
    doc.text(value.toFixed(0), chartX - 2, y + 2, { align: "right" });
  }

  // Draw RIGHT Y-axis labels (SpO2 scale: 50-100)
  doc.setTextColor(59, 130, 246); // Blue to match SpO2 color
  for (let i = 0; i <= 5; i++) {
    const value = maxSpo2 - ((maxSpo2 - minSpo2) / 5) * i;
    const y = plotY + (plotHeight / 5) * i;
    doc.text(value.toFixed(0), chartX + plotWidth + 3, y + 2, { align: "left" });
  }
  doc.setTextColor(80, 80, 80);

  // Draw X-axis time labels
  const numXLabels = 8;
  for (let i = 0; i <= numXLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numXLabels) * i;
    const x = chartX + (plotWidth / numXLabels) * i;
    doc.setFontSize(7);
    doc.text(formatTimeFrom24h(time), x, plotY + plotHeight + 4, { align: "center" });
  }

  // Helper to get X position from time
  const getX = (time: number) => chartX + ((time - minTime) / (maxTime - minTime)) * plotWidth;
  // Helper to get Y position from value (left axis)
  const getYLeft = (value: number) => plotY + plotHeight - ((value - minLeftValue) / (maxLeftValue - minLeftValue)) * plotHeight;
  // Helper to get Y position from value (right axis - SpO2)
  const getYRight = (value: number) => plotY + plotHeight - ((value - minSpo2) / (maxSpo2 - minSpo2)) * plotHeight;

  // Helper to draw arrow up (for diastolic - pointing up from value)
  const drawArrowUp = (x: number, y: number, size: number, color: [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    // Vertical line
    doc.line(x, y + size, x, y - size);
    // Arrow head (two lines forming a V pointing up)
    doc.line(x, y - size, x - size * 0.5, y - size * 0.3);
    doc.line(x, y - size, x + size * 0.5, y - size * 0.3);
  };

  // Helper to draw arrow down (for systolic - pointing down from value)
  const drawArrowDown = (x: number, y: number, size: number, color: [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.4);
    // Vertical line
    doc.line(x, y - size, x, y + size);
    // Arrow head (two lines forming a V pointing down)
    doc.line(x, y + size, x - size * 0.5, y + size * 0.3);
    doc.line(x, y + size, x + size * 0.5, y + size * 0.3);
  };

  // Helper to draw heart shape (for HR)
  const drawHeart = (x: number, y: number, size: number, color: [number, number, number]) => {
    doc.setFillColor(...color);
    // Simplified heart using two circles and a triangle
    const r = size * 0.5;
    doc.circle(x - r * 0.5, y - r * 0.3, r * 0.6, "F");
    doc.circle(x + r * 0.5, y - r * 0.3, r * 0.6, "F");
    doc.triangle(x - size * 0.7, y, x + size * 0.7, y, x, y + size * 0.9, "F");
  };

  // Colors
  const bpColor: [number, number, number] = [40, 40, 40]; // Black/dark gray for BP
  const hrColor: [number, number, number] = [220, 38, 38]; // Red for HR
  const spo2Color: [number, number, number] = [59, 130, 246]; // Blue for SpO2
  const tempColor: [number, number, number] = [251, 146, 60]; // Orange for Temp

  // Sort data by time
  const sortedBpSys = [...vitalsData.bpSys].sort((a, b) => a.time - b.time);
  const sortedBpDia = [...vitalsData.bpDia].sort((a, b) => a.time - b.time);
  const sortedHr = [...vitalsData.hr].sort((a, b) => a.time - b.time);
  const sortedSpo2 = [...vitalsData.spo2].sort((a, b) => a.time - b.time);
  const sortedTemp = [...vitalsData.temp].sort((a, b) => a.time - b.time);

  // ========== DRAW BP AREA FILL (light gray between systolic and diastolic) ==========
  if (sortedBpSys.length > 0 && sortedBpDia.length > 0) {
    // Match sys and dia by timestamp for area fill
    const matchedPairs: Array<{ time: number; sys: number; dia: number }> = [];
    sortedBpSys.forEach(sysPoint => {
      const diaPoint = sortedBpDia.find(d => d.time === sysPoint.time);
      if (diaPoint) {
        matchedPairs.push({ time: sysPoint.time, sys: sysPoint.value, dia: diaPoint.value });
      }
    });

    if (matchedPairs.length > 1) {
      // Draw filled area between sys and dia using light gray triangles
      doc.setFillColor(230, 230, 230); // Very light gray
      
      for (let i = 0; i < matchedPairs.length - 1; i++) {
        const p1 = matchedPairs[i];
        const p2 = matchedPairs[i + 1];
        const x1 = getX(p1.time);
        const x2 = getX(p2.time);
        const sysY1 = getYLeft(p1.sys);
        const sysY2 = getYLeft(p2.sys);
        const diaY1 = getYLeft(p1.dia);
        const diaY2 = getYLeft(p2.dia);
        
        // Draw quadrilateral as two triangles
        doc.triangle(x1, sysY1, x2, sysY2, x1, diaY1, "F");
        doc.triangle(x2, sysY2, x2, diaY2, x1, diaY1, "F");
      }
    }
  }

  // ========== DRAW BP LINES (black) ==========
  if (sortedBpSys.length > 1) {
    doc.setDrawColor(...bpColor);
    doc.setLineWidth(0.3);
    for (let i = 0; i < sortedBpSys.length - 1; i++) {
      const p1 = sortedBpSys[i];
      const p2 = sortedBpSys[i + 1];
      doc.line(getX(p1.time), getYLeft(p1.value), getX(p2.time), getYLeft(p2.value));
    }
  }
  if (sortedBpDia.length > 1) {
    doc.setDrawColor(...bpColor);
    doc.setLineWidth(0.3);
    for (let i = 0; i < sortedBpDia.length - 1; i++) {
      const p1 = sortedBpDia[i];
      const p2 = sortedBpDia[i + 1];
      doc.line(getX(p1.time), getYLeft(p1.value), getX(p2.time), getYLeft(p2.value));
    }
  }

  // Draw BP points with arrows (systolic: down arrow, diastolic: up arrow)
  sortedBpSys.forEach(point => {
    drawArrowDown(getX(point.time), getYLeft(point.value), 1.5, bpColor);
  });
  sortedBpDia.forEach(point => {
    drawArrowUp(getX(point.time), getYLeft(point.value), 1.5, bpColor);
  });

  // ========== DRAW HR LINE (red with heart icons) ==========
  if (sortedHr.length > 1) {
    doc.setDrawColor(...hrColor);
    doc.setLineWidth(0.3);
    for (let i = 0; i < sortedHr.length - 1; i++) {
      const p1 = sortedHr[i];
      const p2 = sortedHr[i + 1];
      doc.line(getX(p1.time), getYLeft(p1.value), getX(p2.time), getYLeft(p2.value));
    }
  }
  sortedHr.forEach(point => {
    drawHeart(getX(point.time), getYLeft(point.value), 1.8, hrColor);
  });

  // ========== DRAW SpO2 LINE (blue, using RIGHT axis) ==========
  if (sortedSpo2.length > 1) {
    doc.setDrawColor(...spo2Color);
    doc.setLineWidth(0.3);
    for (let i = 0; i < sortedSpo2.length - 1; i++) {
      const p1 = sortedSpo2[i];
      const p2 = sortedSpo2[i + 1];
      doc.line(getX(p1.time), getYRight(p1.value), getX(p2.time), getYRight(p2.value));
    }
  }
  sortedSpo2.forEach(point => {
    doc.setFillColor(...spo2Color);
    doc.circle(getX(point.time), getYRight(point.value), 1, "F");
  });

  // ========== DRAW TEMPERATURE LINE (orange with circles) ==========
  if (sortedTemp.length > 1) {
    doc.setDrawColor(...tempColor);
    doc.setLineWidth(0.3);
    for (let i = 0; i < sortedTemp.length - 1; i++) {
      const p1 = sortedTemp[i];
      const p2 = sortedTemp[i + 1];
      doc.line(getX(p1.time), getYLeft(p1.value), getX(p2.time), getYLeft(p2.value));
    }
  }
  sortedTemp.forEach(point => {
    doc.setFillColor(...tempColor);
    doc.circle(getX(point.time), getYLeft(point.value), 0.8, "F");
  });

  // ========== DRAW LEGEND ==========
  let legendX = chartX;
  const legendY = plotY + plotHeight + 10;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  // HR legend (heart shape)
  drawHeart(legendX + 2, legendY - 1, 1.5, hrColor);
  doc.setTextColor(0, 0, 0);
  doc.text(i18next.t("anesthesia.pdf.hrBpm"), legendX + 6, legendY + 1);
  legendX += doc.getTextWidth(i18next.t("anesthesia.pdf.hrBpm")) + 14;

  // BP Sys legend (arrow down)
  drawArrowDown(legendX + 2, legendY - 1, 1.2, bpColor);
  doc.text(i18next.t("anesthesia.pdf.bpSys"), legendX + 6, legendY + 1);
  legendX += doc.getTextWidth(i18next.t("anesthesia.pdf.bpSys")) + 14;

  // BP Dia legend (arrow up)
  drawArrowUp(legendX + 2, legendY - 1, 1.2, bpColor);
  doc.text(i18next.t("anesthesia.pdf.bpDia"), legendX + 6, legendY + 1);
  legendX += doc.getTextWidth(i18next.t("anesthesia.pdf.bpDia")) + 14;

  // SpO2 legend (circle)
  doc.setFillColor(...spo2Color);
  doc.circle(legendX + 2, legendY - 1, 1, "F");
  doc.text(i18next.t("anesthesia.pdf.spo2Percent"), legendX + 6, legendY + 1);
  legendX += doc.getTextWidth(i18next.t("anesthesia.pdf.spo2Percent")) + 14;

  // Temp legend (small circle)
  doc.setFillColor(...tempColor);
  doc.circle(legendX + 2, legendY - 1, 0.8, "F");
  doc.text(i18next.t("anesthesia.pdf.tempCelsius"), legendX + 6, legendY + 1);

  doc.setTextColor(0, 0, 0);
  return chartY + chartHeight + 15;
}

// Landscape medication timeline
function drawLandscapeMedicationTimeline(
  doc: jsPDF,
  title: string,
  medications: MedicationAdministration[],
  anesthesiaItems: AnesthesiaItem[],
  yPos: number,
  options: { chartWidth: number }
): number {
  const chartX = 15;
  const plotWidth = options.chartWidth;
  let chartY = yPos;

  // Draw title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  if (!medications || medications.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noMedicationsAdministered"), chartX + 10, chartY + 15);
    return chartY + 25;
  }

  let plotY = chartY + 12;
  const itemMap = new Map(anesthesiaItems.map(item => [item.id, item]));

  // Group medications by item
  const medsByItem = new Map<string, MedicationAdministration[]>();
  medications.forEach(med => {
    const meds = medsByItem.get(med.itemId) || [];
    meds.push(med);
    medsByItem.set(med.itemId, meds);
  });

  const sortedItems = Array.from(medsByItem.entries()).sort((a, b) => {
    const aTime = new Date(a[1][0]?.timestamp || 0).getTime();
    const bTime = new Date(b[1][0]?.timestamp || 0).getTime();
    return aTime - bTime;
  });

  // Get time range
  const allTimes = medications.flatMap(m => {
    const times = [new Date(m.timestamp).getTime()];
    if (m.endTimestamp) times.push(new Date(m.endTimestamp).getTime());
    return times;
  });
  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);

  if (maxTime === minTime) {
    minTime -= 3600000;
    maxTime += 3600000;
  }

  const labelWidth = 55;
  const timelineX = chartX + labelWidth;
  const timelineWidth = plotWidth - labelWidth;
  const rowHeight = 8;

  // Draw time axis at top
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(timelineX, plotY - 2, timelineX + timelineWidth, plotY - 2);

  // Time labels
  const numLabels = 10;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = timelineX + (timelineWidth / numLabels) * i;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(formatTimeFrom24h(time), x, plotY - 4, { align: "center" });
  }

  // Draw each medication row
  sortedItems.forEach(([itemId, meds]) => {
    const item = itemMap.get(itemId);
    const itemName = item?.name || 'Unknown';
    const displayName = itemName.length > 25 ? itemName.substring(0, 22) + '...' : itemName;

    // Medication name
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(displayName, chartX, plotY + rowHeight / 2 + 1);

    // Draw timeline for this medication
    meds.forEach(med => {
      const startTime = new Date(med.timestamp).getTime();
      const startX = timelineX + ((startTime - minTime) / (maxTime - minTime)) * timelineWidth;

      if (med.type === 'bolus') {
        // Bolus: vertical bar
        doc.setFillColor(59, 130, 246);
        doc.rect(startX - 1, plotY, 2, rowHeight - 1, "F");
        
        // Dose label
        doc.setFontSize(6);
        doc.setTextColor(59, 130, 246);
        doc.text(med.dose || '', startX, plotY - 1, { align: "center" });
      } else {
        // Infusion: horizontal bar
        const endTime = med.endTimestamp ? new Date(med.endTimestamp).getTime() : maxTime;
        const endX = timelineX + ((endTime - minTime) / (maxTime - minTime)) * timelineWidth;
        const barWidth = Math.max(endX - startX, 3);

        doc.setFillColor(34, 197, 94);
        doc.rect(startX, plotY + 2, barWidth, rowHeight - 5, "F");

        // Rate/dose label
        const label = med.rate ? `${med.rate}` : med.dose || '';
        doc.setFontSize(6);
        doc.setTextColor(34, 197, 94);
        doc.text(label, startX + 2, plotY + 1);
      }
    });

    plotY += rowHeight + 2;
  });

  // Legend
  plotY += 5;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setFillColor(59, 130, 246);
  doc.rect(chartX, plotY - 2, 4, 4, "F");
  doc.setTextColor(0, 0, 0);
  doc.text("Bolus", chartX + 6, plotY + 1);
  doc.setFillColor(34, 197, 94);
  doc.rect(chartX + 30, plotY - 2, 10, 4, "F");
  doc.text("Infusion", chartX + 42, plotY + 1);

  doc.setTextColor(0, 0, 0);
  return plotY + 10;
}

// Landscape ventilation swimlanes
function drawLandscapeVentilationSwimlanes(
  doc: jsPDF,
  title: string,
  snapshotData: any,
  yPos: number,
  options: { chartWidth: number }
): number {
  const chartX = 15;
  const plotWidth = options.chartWidth;
  let chartY = yPos;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  const plotY = chartY + 10;
  const labelWidth = 50;
  const timelineX = chartX + labelWidth;
  const timelineWidth = plotWidth - labelWidth;
  const rowHeight = 7;

  // Define ventilation parameters
  const ventParams = [
    { key: 'pip', label: 'PIP (cmH₂O)', color: [239, 68, 68] as [number, number, number] },
    { key: 'peep', label: 'PEEP (cmH₂O)', color: [34, 197, 94] as [number, number, number] },
    { key: 'tidalVolume', label: 'TV (ml)', color: [59, 130, 246] as [number, number, number] },
    { key: 'respiratoryRate', label: 'RR (/min)', color: [168, 85, 247] as [number, number, number] },
    { key: 'fio2', label: 'FiO₂ (%)', color: [251, 146, 60] as [number, number, number] },
    { key: 'etco2', label: 'EtCO₂ (mmHg)', color: [20, 184, 166] as [number, number, number] },
  ];

  // Get time range from all data
  const allTimes: number[] = [];
  ventParams.forEach(param => {
    const data = snapshotData[param.key];
    if (Array.isArray(data)) {
      data.forEach((p: any) => {
        if (p.timestamp) allTimes.push(new Date(p.timestamp).getTime());
      });
    }
  });

  if (allTimes.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 10, plotY + 15);
    return chartY + 35;
  }

  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);
  if (maxTime === minTime) {
    minTime -= 3600000;
    maxTime += 3600000;
  }

  // Time axis labels
  const numLabels = 10;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = timelineX + (timelineWidth / numLabels) * i;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(formatTimeFrom24h(time), x, plotY - 2, { align: "center" });
  }

  let currentY = plotY;

  ventParams.forEach(param => {
    const data = snapshotData[param.key];
    
    // Row label
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(param.label, chartX, currentY + rowHeight / 2 + 1);

    // Draw background
    doc.setFillColor(250, 250, 250);
    doc.rect(timelineX, currentY, timelineWidth, rowHeight, "F");
    doc.setDrawColor(230, 230, 230);
    doc.rect(timelineX, currentY, timelineWidth, rowHeight, "S");

    if (Array.isArray(data) && data.length > 0) {
      // Plot values as text at their positions
      const sortedData = [...data].sort((a: any, b: any) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      );

      sortedData.forEach((point: any) => {
        const time = new Date(point.timestamp).getTime();
        const x = timelineX + ((time - minTime) / (maxTime - minTime)) * timelineWidth;
        const value = point.value ?? point.sys ?? 0;
        
        doc.setFontSize(6);
        doc.setTextColor(...param.color);
        doc.text(String(Math.round(value)), x, currentY + rowHeight / 2 + 1, { align: "center" });
      });
    }

    currentY += rowHeight + 1;
  });

  doc.setTextColor(0, 0, 0);
  return currentY + 8;
}

// Landscape output chart
function drawLandscapeOutputChart(
  doc: jsPDF,
  title: string,
  snapshotData: any,
  yPos: number,
  options: { chartWidth: number }
): number {
  const chartX = 15;
  let chartY = yPos;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  const outputs = [
    { key: 'urine', label: 'Urine', color: [251, 191, 36] as [number, number, number] },
    { key: 'drainage', label: 'Drainage', color: [239, 68, 68] as [number, number, number] },
    { key: 'gastricTube', label: 'Gastric', color: [34, 197, 94] as [number, number, number] },
    { key: 'blood', label: 'Blood', color: [220, 38, 38] as [number, number, number] },
  ];

  let plotY = chartY + 10;
  const barHeight = 8;
  const maxBarWidth = 150;

  // Calculate max value for scaling
  let maxValue = 0;
  outputs.forEach(o => {
    const value = snapshotData[o.key];
    if (typeof value === 'number') maxValue = Math.max(maxValue, value);
  });

  if (maxValue === 0) maxValue = 100;

  outputs.forEach(o => {
    const value = snapshotData[o.key];
    if (typeof value !== 'number' || value <= 0) return;

    // Label
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    doc.text(o.label, chartX, plotY + barHeight / 2 + 2);

    // Bar
    const barWidth = (value / maxValue) * maxBarWidth;
    doc.setFillColor(...o.color);
    doc.rect(chartX + 45, plotY, barWidth, barHeight, "F");

    // Value label
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`${value} ml`, chartX + 50 + barWidth, plotY + barHeight / 2 + 2);

    plotY += barHeight + 4;
  });

  doc.setTextColor(0, 0, 0);
  return plotY + 5;
}

// Landscape rhythm timeline
function drawLandscapeRhythmTimeline(
  doc: jsPDF,
  title: string,
  rhythmData: Array<{ timestamp: string; rhythm: string }>,
  yPos: number,
  options: { chartWidth: number }
): number {
  const chartX = 15;
  const plotWidth = options.chartWidth;
  let chartY = yPos;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  if (!rhythmData || rhythmData.length === 0) {
    doc.setFontSize(11);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noDataAvailable"), chartX + 10, chartY + 15);
    return chartY + 25;
  }

  const plotY = chartY + 10;
  const barHeight = 15;

  // Get time range
  const times = rhythmData.map(r => new Date(r.timestamp).getTime());
  let minTime = Math.min(...times);
  let maxTime = Math.max(...times);
  if (maxTime === minTime) {
    maxTime += 3600000;
  }

  // Rhythm colors
  const rhythmColors: { [key: string]: [number, number, number] } = {
    'SR': [34, 197, 94],
    'Sinus Rhythm': [34, 197, 94],
    'AF': [239, 68, 68],
    'Atrial Fibrillation': [239, 68, 68],
    'SVT': [251, 146, 60],
    'VT': [185, 28, 28],
  };

  // Draw time labels
  const numLabels = 10;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = chartX + (plotWidth / numLabels) * i;
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(formatTimeFrom24h(time), x, plotY + barHeight + 5, { align: "center" });
  }

  // Draw rhythm segments
  const sortedData = [...rhythmData].sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (let i = 0; i < sortedData.length; i++) {
    const current = sortedData[i];
    const next = sortedData[i + 1];
    
    const startTime = new Date(current.timestamp).getTime();
    const endTime = next ? new Date(next.timestamp).getTime() : maxTime;
    
    const startX = chartX + ((startTime - minTime) / (maxTime - minTime)) * plotWidth;
    const endX = chartX + ((endTime - minTime) / (maxTime - minTime)) * plotWidth;
    const width = Math.max(endX - startX, 2);

    const color = rhythmColors[current.rhythm] || [156, 163, 175];
    doc.setFillColor(...color);
    doc.rect(startX, plotY, width, barHeight, "F");

    // Rhythm label if segment is wide enough
    if (width > 20 && current.rhythm) {
      doc.setFontSize(7);
      doc.setTextColor(255, 255, 255);
      doc.text(current.rhythm, startX + width / 2, plotY + barHeight / 2 + 2, { align: "center" });
    }
  }

  // Legend
  let legendY = plotY + barHeight + 12;
  let legendX = chartX;
  doc.setFontSize(8);
  Object.entries(rhythmColors).forEach(([rhythm, color]) => {
    if (['SR', 'AF', 'SVT', 'VT'].includes(rhythm)) {
      doc.setFillColor(...color);
      doc.rect(legendX, legendY - 2, 6, 4, "F");
      doc.setTextColor(0, 0, 0);
      doc.text(rhythm, legendX + 8, legendY + 1);
      legendX += 30;
    }
  });

  doc.setTextColor(0, 0, 0);
  return legendY + 10;
}

// Helper to draw medication timeline swimlanes - shows ALL medications with proper page breaks
function drawMedicationTimeline(
  doc: jsPDF,
  title: string,
  medications: MedicationAdministration[],
  anesthesiaItems: AnesthesiaItem[],
  yPos: number
): number {
  const chartWidth = 170;
  const chartX = 20;
  let chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  if (!medications || medications.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noMedicationsAdministered"), chartX + 5, chartY + 15);
    return chartY + 25;
  }

  let plotY = chartY + 10;
  const itemMap = new Map(anesthesiaItems.map(item => [item.id, item]));

  // Group medications by item and sort by first timestamp
  const medsByItem = new Map<string, MedicationAdministration[]>();
  medications.forEach(med => {
    const meds = medsByItem.get(med.itemId) || [];
    meds.push(med);
    medsByItem.set(med.itemId, meds);
  });

  // Sort items by their first medication timestamp for consistent ordering
  const sortedItems = Array.from(medsByItem.entries()).sort((a, b) => {
    const aTime = new Date(a[1][0]?.timestamp || 0).getTime();
    const bTime = new Date(b[1][0]?.timestamp || 0).getTime();
    return aTime - bTime;
  });

  // Get time range
  const allTimes = medications.map(m => new Date(m.timestamp).getTime());
  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);

  // Guard against single timestamp (prevents division by zero)
  if (maxTime === minTime) {
    minTime -= 3600000;
    maxTime += 3600000;
  }

  // Draw swimlanes - NO LIMIT, show all medications with page breaks
  let currentY = plotY;
  const laneHeight = 8;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxY = pageHeight - 30; // Leave space for footer

  for (const [itemId, meds] of sortedItems) {
    // Check if we need a page break
    if (currentY + laneHeight > maxY) {
      doc.addPage();
      currentY = 20;
      // Redraw title on new page
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(title + " " + i18next.t("anesthesia.pdf.continued", "(continued)"), chartX, currentY);
      currentY += 10;
    }

    const item = itemMap.get(itemId);
    const itemName = item?.name || i18next.t("anesthesia.pdf.unknownMedication");
    const laneIndex = sortedItems.findIndex(([id]) => id === itemId);

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
        doc.text(med.dose || '', x + 1, currentY + 4);
      } else if (med.type === "infusion_start") {
        // Draw infusion as horizontal bar
        const endMed = meds.find((m: MedicationAdministration) => m.type === "infusion_stop" && new Date(m.timestamp).getTime() > medTime);
        const endTime = endMed ? new Date(endMed.timestamp).getTime() : maxTime;
        const endX = chartX + 40 + ((endTime - minTime) / (maxTime - minTime)) * (chartWidth - 45);

        doc.setFillColor(16, 185, 129);
        doc.rect(x, currentY + 2, Math.max(endX - x, 2), laneHeight - 4, "F");
        // Add rate label
        doc.setFontSize(6);
        doc.setTextColor(255, 255, 255);
        const rateText = med.rate === "free" ? i18next.t("anesthesia.pdf.free") : med.rate || "";
        doc.text(rateText, x + 2, currentY + 5);
      }
    });

    currentY += laneHeight;
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

// Helper to draw ventilation parameters as swimlanes (similar to medications)
function drawVentilationSwimlanes(
  doc: jsPDF,
  title: string,
  snapshotData: any,
  yPos: number
): number {
  const chartWidth = 170;
  const chartX = 20;
  const chartY = yPos;

  // Draw title
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(title, chartX, chartY);

  // Define ventilation parameters to display
  const ventParams = [
    { key: "pip", label: i18next.t("anesthesia.pdf.pipCmH2O"), color: [59, 130, 246] as [number, number, number], unit: "cmH2O" },
    { key: "peep", label: i18next.t("anesthesia.pdf.peepCmH2O"), color: [16, 185, 129] as [number, number, number], unit: "cmH2O" },
    { key: "tidalVolume", label: i18next.t("anesthesia.pdf.tvMl"), color: [251, 146, 60] as [number, number, number], unit: "ml" },
    { key: "respiratoryRate", label: i18next.t("anesthesia.pdf.rrPerMin"), color: [139, 92, 246] as [number, number, number], unit: "/min" },
    { key: "fio2", label: i18next.t("anesthesia.pdf.fio2Percent"), color: [236, 72, 153] as [number, number, number], unit: "%" },
    { key: "etco2", label: i18next.t("anesthesia.pdf.etco2MmHg"), color: [234, 179, 8] as [number, number, number], unit: "mmHg" },
  ];

  // Check if we have any ventilation data
  const hasData = ventParams.some(p => snapshotData[p.key] && snapshotData[p.key].length > 0);
  if (!hasData) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noVentilationData", "No ventilation data available"), chartX + 5, chartY + 15);
    return chartY + 25;
  }

  const plotY = chartY + 10;
  let currentY = plotY;
  const laneHeight = 10;

  // Get time range from all parameters
  const allTimes: number[] = [];
  ventParams.forEach(p => {
    (snapshotData[p.key] || []).forEach((point: any) => {
      allTimes.push(new Date(point.timestamp).getTime());
    });
  });

  if (allTimes.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noVentilationData", "No ventilation data available"), chartX + 5, chartY + 15);
    return chartY + 25;
  }

  let minTime = Math.min(...allTimes);
  let maxTime = Math.max(...allTimes);
  if (maxTime === minTime) {
    minTime -= 3600000;
    maxTime += 3600000;
  }

  // Draw each ventilation parameter as a swimlane
  ventParams.forEach((param, idx) => {
    const data = snapshotData[param.key] || [];
    if (data.length === 0) return;

    // Draw lane background
    doc.setFillColor(idx % 2 === 0 ? 250 : 245, 250, 250);
    doc.rect(chartX, currentY, chartWidth, laneHeight, "F");

    // Draw parameter label
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...param.color);
    doc.text(param.label, chartX + 2, currentY + 6);

    // Sort data by time
    const sortedData = [...data].sort((a: any, b: any) => 
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    // Draw horizontal line connecting values
    if (sortedData.length > 1) {
      doc.setDrawColor(...param.color);
      doc.setLineWidth(0.5);
      
      for (let i = 0; i < sortedData.length - 1; i++) {
        const t1 = new Date(sortedData[i].timestamp).getTime();
        const t2 = new Date(sortedData[i + 1].timestamp).getTime();
        const x1 = chartX + 35 + ((t1 - minTime) / (maxTime - minTime)) * (chartWidth - 40);
        const x2 = chartX + 35 + ((t2 - minTime) / (maxTime - minTime)) * (chartWidth - 40);
        const y = currentY + laneHeight / 2;
        doc.line(x1, y, x2, y);
      }
    }

    // Draw value points with labels
    sortedData.forEach((point: any, i: number) => {
      const pointTime = new Date(point.timestamp).getTime();
      const x = chartX + 35 + ((pointTime - minTime) / (maxTime - minTime)) * (chartWidth - 40);
      
      // Draw small circle at data point
      doc.setFillColor(...param.color);
      doc.circle(x, currentY + laneHeight / 2, 1.2, "F");

      // Add value label (show for first, last, and every 3rd point to avoid clutter)
      if (i === 0 || i === sortedData.length - 1 || i % 3 === 0) {
        doc.setFontSize(6);
        doc.setTextColor(0, 0, 0);
        const valueStr = point.value.toString();
        doc.text(valueStr, x, currentY + 3);
      }
    });

    currentY += laneHeight;
  });

  // Draw time axis
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  const numLabels = 4;
  for (let i = 0; i <= numLabels; i++) {
    const time = minTime + ((maxTime - minTime) / numLabels) * i;
    const x = chartX + 35 + ((chartWidth - 40) / numLabels) * i;
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
    { key: "urine", label: i18next.t("anesthesia.pdf.urine"), color: [251, 191, 36] as [number, number, number] },
    { key: "drainage", label: i18next.t("anesthesia.pdf.drainage"), color: [239, 68, 68] as [number, number, number] },
    { key: "gastricTube", label: i18next.t("anesthesia.pdf.gastric"), color: [34, 197, 94] as [number, number, number] },
    { key: "blood", label: i18next.t("anesthesia.pdf.blood"), color: [220, 38, 38] as [number, number, number] },
  ];

  // Check if we have any data
  const hasData = outputTypes.some(type => outputData[type.key] && outputData[type.key].length > 0);
  
  if (!hasData) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "italic");
    doc.text(i18next.t("anesthesia.pdf.noOutputData"), chartX + 5, plotY + 10);
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
    doc.text(i18next.t("anesthesia.pdf.noOutputData"), chartX + 5, plotY + 10);
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
    doc.text(i18next.t("anesthesia.pdf.noRhythmChanges"), chartX + 5, chartY + 15);
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
  let minTime = Math.min(...times);
  let maxTime = Math.max(...times);

  // Guard against single timestamp (prevents division by zero)
  if (maxTime === minTime) {
    // Expand time range by ±1 hour (3600000 ms)
    minTime -= 3600000;
    maxTime += 3600000;
  }

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
      [i18next.t("anesthesia.pdf.sinus")]: [34, 197, 94],
      [i18next.t("anesthesia.pdf.af")]: [239, 68, 68],
      [i18next.t("anesthesia.pdf.svt")]: [251, 146, 60],
      [i18next.t("anesthesia.pdf.vt")]: [220, 38, 38],
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
  doc.text(i18next.t("anesthesia.pdf.documentTitle"), 105, yPos, { align: "center" });
  yPos += 10;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`${i18next.t("anesthesia.pdf.generated")}: ${formatDateTime24h(new Date())}`, 105, yPos, { align: "center" });
  yPos += 15;

  // ==================== PATIENT INFORMATION ====================
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(i18next.t("anesthesia.pdf.patientInformation"), 20, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const patientInfo = [
    [`${i18next.t("anesthesia.pdf.patientId")}: ${data.patient.patientNumber}`, `${i18next.t("anesthesia.pdf.name")}: ${data.patient.surname}, ${data.patient.firstName}`],
    [`${i18next.t("anesthesia.pdf.dateOfBirth")}: ${data.patient.birthday}`, `${i18next.t("anesthesia.pdf.sex")}: ${data.patient.sex}`],
    [`${i18next.t("anesthesia.pdf.age")}: ${calculateAge(data.patient.birthday)} ${i18next.t("anesthesia.pdf.years")}`, `${i18next.t("anesthesia.pdf.phone")}: ${data.patient.phone || i18next.t("anesthesia.pdf.na")}`],
  ];

  patientInfo.forEach(row => {
    doc.text(row[0], 20, yPos);
    doc.text(row[1], 110, yPos);
    yPos += 6;
  });

  if (data.patient.allergies && data.patient.allergies.length > 0) {
    yPos += 2;
    doc.setFont("helvetica", "bold");
    doc.text(`${i18next.t("anesthesia.pdf.allergies")}:`, 20, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(data.patient.allergies.join(", "), 42, yPos);
    yPos += 6;
  }

  yPos += 5;

  // ==================== SURGERY INFORMATION ====================
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(i18next.t("anesthesia.pdf.surgeryInformation"), 20, yPos);
  yPos += 7;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  
  const surgeryInfo = [
    [`${i18next.t("anesthesia.pdf.procedure")}: ${data.surgery.plannedSurgery}`, `${i18next.t("anesthesia.pdf.surgeon")}: ${data.surgery.surgeon || i18next.t("anesthesia.pdf.na")}`],
    [`${i18next.t("anesthesia.pdf.plannedDate")}: ${formatDate(data.surgery.plannedDate)}`, `${i18next.t("anesthesia.pdf.status")}: ${data.surgery.status.toUpperCase()}`],
  ];

  if (data.surgery.actualStartTime) {
    surgeryInfo.push([`${i18next.t("anesthesia.pdf.actualStart")}: ${formatDateTime24h(data.surgery.actualStartTime)}`, ""]);
  }
  if (data.surgery.actualEndTime) {
    surgeryInfo.push([`${i18next.t("anesthesia.pdf.actualEnd")}: ${formatDateTime24h(data.surgery.actualEndTime)}`, ""]);
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
    doc.text(i18next.t("anesthesia.pdf.preOperativeAssessment"), 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const preOpInfo = [];
    if (data.preOpAssessment.height || data.preOpAssessment.weight) {
      preOpInfo.push([
        `${i18next.t("anesthesia.pdf.height")}: ${data.preOpAssessment.height || i18next.t("anesthesia.pdf.na")}`,
        `${i18next.t("anesthesia.pdf.weight")}: ${data.preOpAssessment.weight || i18next.t("anesthesia.pdf.na")}`
      ]);
    }
    if (data.preOpAssessment.asa) {
      preOpInfo.push([`${i18next.t("anesthesia.pdf.asaClassification")}: ${data.preOpAssessment.asa}`, ""]);
    }
    if (data.preOpAssessment.mallampati) {
      preOpInfo.push([
        `${i18next.t("anesthesia.pdf.mallampati")}: ${data.preOpAssessment.mallampati}`,
        `${i18next.t("anesthesia.pdf.airwayDifficulty")}: ${data.preOpAssessment.airwayDifficult || i18next.t("anesthesia.pdf.na")}`
      ]);
    }
    if (data.preOpAssessment.lastSolids || data.preOpAssessment.lastClear) {
      preOpInfo.push([
        `${i18next.t("anesthesia.pdf.lastSolids")}: ${data.preOpAssessment.lastSolids || i18next.t("anesthesia.pdf.na")}`,
        `${i18next.t("anesthesia.pdf.lastClear")}: ${data.preOpAssessment.lastClear || i18next.t("anesthesia.pdf.na")}`
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
        doc.text(`${i18next.t("anesthesia.pdf.plannedAnesthesia")}:`, 20, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        
        // Map technique keys to translated labels
        const techniqueLabels: Record<string, string> = {
          general: i18next.t("anesthesia.pdf.consentGeneral"),
          spinal: i18next.t("anesthesia.pdf.spinalAnesthesia"),
          epidural: i18next.t("anesthesia.pdf.epiduralAnesthesia"),
          regional: i18next.t("anesthesia.pdf.regionalAnesthesia"),
          sedation: i18next.t("anesthesia.pdf.sedation"),
          combined: i18next.t("anesthesia.pdf.combined"),
          peripheral: i18next.t("anesthesia.pdf.peripheralRegionalAnesthesia", "Periphere Regionalanästhesie"),
          mac: i18next.t("anesthesia.pdf.macAnesthesia", "Überwachte Anästhesiepflege (MAC)"),
          local: i18next.t("anesthesia.pdf.localAnesthesia", "Lokalanästhesie"),
        };
        
        Object.entries(techniques).forEach(([key, value]) => {
          if (value === true) {
            const label = techniqueLabels[key] || key.replace(/([A-Z])/g, ' $1').trim();
            doc.text(`• ${label}`, 25, yPos);
            yPos += 5;
          }
        });
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
    doc.text(i18next.t("anesthesia.pdf.anesthesiaDetails"), 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const anesInfo = [];
    if (data.anesthesiaRecord.anesthesiaType) {
      anesInfo.push([`${i18next.t("anesthesia.pdf.type")}: ${data.anesthesiaRecord.anesthesiaType.toUpperCase()}`, ""]);
    }
    if (data.anesthesiaRecord.physicalStatus) {
      anesInfo.push([`${i18next.t("anesthesia.pdf.asaPhysicalStatus")}: ${data.anesthesiaRecord.physicalStatus}`, ""]);
    }
    if (data.anesthesiaRecord.emergencyCase) {
      anesInfo.push([`${i18next.t("anesthesia.pdf.emergencyCase")}: ${i18next.t("anesthesia.pdf.yes")}`, ""]);
    }
    if (data.anesthesiaRecord.anesthesiaStartTime) {
      anesInfo.push([`${i18next.t("anesthesia.pdf.anesthesiaStart")}: ${formatDateTime24h(data.anesthesiaRecord.anesthesiaStartTime)}`, ""]);
    }
    if (data.anesthesiaRecord.anesthesiaEndTime) {
      anesInfo.push([`${i18next.t("anesthesia.pdf.anesthesiaEnd")}: ${formatDateTime24h(data.anesthesiaRecord.anesthesiaEndTime)}`, ""]);
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
    doc.text(i18next.t("anesthesia.pdf.timeMarkers"), 20, yPos);
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
        head: [[i18next.t("anesthesia.pdf.code"), i18next.t("anesthesia.pdf.event"), i18next.t("anesthesia.pdf.time")]],
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
    doc.text(i18next.t("anesthesia.pdf.eventsNotes"), 20, yPos);
    yPos += 7;

    const eventData = data.events.map(event => {
      const eventDate = new Date(event.timestamp);
      const timeStr = isNaN(eventDate.getTime()) 
        ? i18next.t("anesthesia.pdf.invalidTime")
        : formatTimeFrom24h(eventDate.getTime());
      
      return [
        timeStr,
        event.description,
        event.eventType || i18next.t("anesthesia.pdf.note")
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [[i18next.t("anesthesia.pdf.time"), i18next.t("anesthesia.pdf.description"), i18next.t("anesthesia.pdf.type")]],
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
    doc.text(i18next.t("anesthesia.pdf.medicationAdministration"), 20, yPos);
    yPos += 7;

    // Create a map of itemId to item name (with fallback for missing data)
    const itemMap = new Map((data.anesthesiaItems || []).map(item => [item.id, item]));

    const medData = data.medications.map(med => {
      const medDate = new Date(med.timestamp);
      const timeStr = isNaN(medDate.getTime()) 
        ? i18next.t("anesthesia.pdf.invalidTime")
        : formatTimeFrom24h(medDate.getTime());
        
      const item = itemMap.get(med.itemId);
      const itemName = item?.name || i18next.t("anesthesia.pdf.unknownMedication");
      const doseUnit = med.unit || item?.administrationUnit || "";
      const route = med.route || item?.administrationRoute || "";
      
      let typeDisplay = med.type;
      if (med.type === "infusion_start") {
        typeDisplay = med.rate === "free" ? i18next.t("anesthesia.pdf.infusionFree") : `${i18next.t("anesthesia.pdf.infusion")} (${med.rate})`;
      } else if (med.type === "infusion_stop") {
        typeDisplay = i18next.t("anesthesia.pdf.stopInfusion");
      } else if (med.type === "bolus") {
        typeDisplay = i18next.t("anesthesia.pdf.bolus");
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
      head: [[i18next.t("anesthesia.pdf.time"), i18next.t("anesthesia.pdf.medication"), i18next.t("anesthesia.pdf.dose"), i18next.t("anesthesia.pdf.route"), i18next.t("anesthesia.pdf.type")]],
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

  // ==================== INVENTORY USAGE (MATERIALS USED) ====================
  if (data.inventoryUsage && data.inventoryUsage.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.inventoryUsage", "BESTANDSVERBRAUCH"), 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(i18next.t("anesthesia.pdf.inventoryUsageDesc", "Berechneter Materialverbrauch basierend auf Medikamentenverabreichung"), 20, yPos);
    yPos += 6;

    // Build map of item names from anesthesiaItems and inventoryItems
    const itemNameMap = new Map<string, { name: string; unit: string | null }>();
    if (data.anesthesiaItems) {
      data.anesthesiaItems.forEach(item => {
        itemNameMap.set(item.id, { name: item.name, unit: item.administrationUnit || null });
      });
    }
    // Also include regular inventory items for inventory usage lookup
    if (data.inventoryItems) {
      data.inventoryItems.forEach(item => {
        if (!itemNameMap.has(item.id)) {
          itemNameMap.set(item.id, { name: item.name, unit: item.unit || null });
        }
      });
    }

    const usageData = data.inventoryUsage.map(usage => {
      const itemInfo = itemNameMap.get(usage.itemId);
      const itemName = usage.itemName || itemInfo?.name || usage.itemId;
      const unit = usage.unit || itemInfo?.unit || "";
      const qty = usage.overrideQty !== null && usage.overrideQty !== undefined 
        ? usage.overrideQty 
        : usage.calculatedQty;
      
      return [
        itemName,
        `${qty} ${unit}`.trim(),
        usage.overrideQty !== null && usage.overrideQty !== undefined 
          ? i18next.t("anesthesia.pdf.manualOverride", "Manuell angepasst")
          : i18next.t("anesthesia.pdf.autoCalculated", "Automatisch berechnet")
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [[
        i18next.t("anesthesia.pdf.materialItem", "Material / Artikel"),
        i18next.t("anesthesia.pdf.quantity", "Menge"),
        i18next.t("anesthesia.pdf.calculationType", "Berechnungsart")
      ]],
      body: usageData,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [16, 185, 129], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 100 },
        1: { cellWidth: 35, halign: 'center' },
        2: { cellWidth: 45 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== VITAL SIGNS SUMMARY ====================
  if (data.clinicalSnapshot?.data) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.vitalSignsSummary"), 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const snapshotData = data.clinicalSnapshot.data as any;
    const vitalsInfo = [];

    if (snapshotData.hr && snapshotData.hr.length > 0) {
      const hrValues = snapshotData.hr.map((p: any) => p.value);
      vitalsInfo.push([
        `${i18next.t("anesthesia.pdf.heartRate")}: ${Math.min(...hrValues)} - ${Math.max(...hrValues)} bpm (${snapshotData.hr.length} ${i18next.t("anesthesia.pdf.readings")})`,
        ""
      ]);
    }

    if (snapshotData.bp && snapshotData.bp.length > 0) {
      const bpSys = snapshotData.bp.map((p: any) => p.sys);
      const bpDia = snapshotData.bp.map((p: any) => p.dia);
      vitalsInfo.push([
        `${i18next.t("anesthesia.pdf.bloodPressure")}: ${Math.min(...bpSys)}/${Math.min(...bpDia)} - ${Math.max(...bpSys)}/${Math.max(...bpDia)} mmHg (${snapshotData.bp.length} ${i18next.t("anesthesia.pdf.readings")})`,
        ""
      ]);
    }

    if (snapshotData.spo2 && snapshotData.spo2.length > 0) {
      const spo2Values = snapshotData.spo2.map((p: any) => p.value);
      vitalsInfo.push([
        `SpO2: ${Math.min(...spo2Values)} - ${Math.max(...spo2Values)}% (${snapshotData.spo2.length} ${i18next.t("anesthesia.pdf.readings")})`,
        ""
      ]);
    }

    if (snapshotData.temp && snapshotData.temp.length > 0) {
      const tempValues = snapshotData.temp.map((p: any) => p.value);
      vitalsInfo.push([
        `${i18next.t("anesthesia.pdf.temperature")}: ${Math.min(...tempValues).toFixed(1)} - ${Math.max(...tempValues).toFixed(1)}°C (${snapshotData.temp.length} ${i18next.t("anesthesia.pdf.readings")})`,
        ""
      ]);
    }

    if (vitalsInfo.length === 0) {
      doc.text(i18next.t("anesthesia.pdf.noVitalSigns"), 20, yPos);
      yPos += 6;
    } else {
      vitalsInfo.forEach(row => {
        doc.text(row[0], 20, yPos);
        yPos += 6;
      });
    }

    yPos += 5;

    // ==================== VISUAL CHARTS ON LANDSCAPE PAGE ====================
    // Add a dedicated landscape page for all timeline visualizations
    // This gives maximum space for comprehensive chart display
    doc.addPage('a4', 'landscape');
    
    // Landscape A4 dimensions: 297mm x 210mm
    const landscapeWidth = 297;
    const landscapeHeight = 210;
    const margin = 15;
    const chartWidth = landscapeWidth - (margin * 2); // Full width minus margins
    
    // Prepare vitals data
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

    // ========== SECTION 1: VITALS TIMELINE (Landscape - full width) ==========
    yPos = margin;
    yPos = drawLandscapeTimelineChart(
      doc,
      i18next.t("anesthesia.pdf.vitalSignsTimeline"),
      {
        hr: hrData,
        bpSys: bpSysData,
        bpDia: bpDiaData,
        spo2: spo2Data,
        temp: tempData,
      },
      yPos,
      { chartWidth, height: 80 }
    );

    // ========== SECTION 2: MEDICATIONS TIMELINE (Landscape) ==========
    if (data.medications && data.medications.length > 0) {
      // Check if we need a new page
      if (yPos > landscapeHeight - 70) {
        doc.addPage('a4', 'landscape');
        yPos = margin;
      }
      yPos = drawLandscapeMedicationTimeline(
        doc,
        i18next.t("anesthesia.pdf.medicationsInfusionsTimeline"),
        data.medications,
        data.anesthesiaItems || [],
        yPos,
        { chartWidth }
      );
    }

    // ========== SECTION 3: VENTILATION PARAMETERS (Landscape) ==========
    if (yPos > landscapeHeight - 60) {
      doc.addPage('a4', 'landscape');
      yPos = margin;
    }
    yPos = drawLandscapeVentilationSwimlanes(
      doc,
      i18next.t("anesthesia.pdf.ventilationParameters"),
      snapshotData,
      yPos,
      { chartWidth }
    );

    // ========== SECTION 4: FLUID OUTPUT (Landscape) ==========
    if (yPos > landscapeHeight - 50) {
      doc.addPage('a4', 'landscape');
      yPos = margin;
    }
    yPos = drawLandscapeOutputChart(
      doc,
      i18next.t("anesthesia.pdf.fluidBalanceOutput"),
      snapshotData,
      yPos,
      { chartWidth }
    );

    // ========== SECTION 5: HEART RHYTHM (Landscape) ==========
    if (snapshotData.heartRhythm && snapshotData.heartRhythm.length > 0) {
      if (yPos > landscapeHeight - 40) {
        doc.addPage('a4', 'landscape');
        yPos = margin;
      }
      yPos = drawLandscapeRhythmTimeline(
        doc,
        i18next.t("anesthesia.pdf.heartRhythm"),
        snapshotData.heartRhythm,
        yPos,
        { chartWidth }
      );
    }
    
    // Add portrait page for remaining content (post-op, staff, etc.)
    doc.addPage('a4', 'portrait');
    yPos = 20;
  }

  // ==================== POST-OPERATIVE INFORMATION ====================
  if (data.anesthesiaRecord?.postOpData) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.postOperativeInformation"), 20, yPos);
    yPos += 7;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const postOpData = data.anesthesiaRecord.postOpData as any;
    const postOpInfo = [];

    if (postOpData.postOpDestination) {
      postOpInfo.push([`${i18next.t("anesthesia.pdf.destination")}: ${postOpData.postOpDestination}`, ""]);
    }
    if (postOpData.complications) {
      postOpInfo.push([`${i18next.t("anesthesia.pdf.complications")}: ${postOpData.complications}`, ""]);
    }
    if (postOpData.postOpNotes) {
      postOpInfo.push([`${i18next.t("anesthesia.pdf.notes")}: ${postOpData.postOpNotes}`, ""]);
    }

    // Medication schedule
    const medSchedule = [];
    if (postOpData.paracetamolTime) medSchedule.push(`${i18next.t("anesthesia.pdf.paracetamol")}: ${postOpData.paracetamolTime}`);
    if (postOpData.nsarTime) medSchedule.push(`${i18next.t("anesthesia.pdf.nsar")}: ${postOpData.nsarTime}`);
    if (postOpData.novalginTime) medSchedule.push(`${i18next.t("anesthesia.pdf.novalgin")}: ${postOpData.novalginTime}`);

    if (medSchedule.length > 0) {
      postOpInfo.push([`${i18next.t("anesthesia.pdf.medicationSchedule")}: ${medSchedule.join(", ")}`, ""]);
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
    doc.text(i18next.t("anesthesia.pdf.anesthesiaStaff"), 20, yPos);
    yPos += 7;

    const staffData = data.staffMembers.map(staff => {
      const staffDate = new Date(staff.timestamp);
      const timeStr = isNaN(staffDate.getTime()) 
        ? i18next.t("anesthesia.pdf.invalidTime")
        : formatTimeFrom24h(staffDate.getTime());

      return [
        staff.role,
        staff.name,
        timeStr
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [[i18next.t("anesthesia.pdf.role"), i18next.t("anesthesia.pdf.name"), i18next.t("anesthesia.pdf.time")]],
      body: staffData,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 50 },
        1: { cellWidth: 80 },
        2: { cellWidth: 30 },
      },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // ==================== PATIENT POSITIONING ====================
  if (data.positions && data.positions.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.patientPositioning"), 20, yPos);
    yPos += 7;

    const positionData = data.positions.map(pos => {
      const posDate = new Date(pos.timestamp);
      const timeStr = isNaN(posDate.getTime()) 
        ? i18next.t("anesthesia.pdf.invalidTime")
        : formatTimeFrom24h(posDate.getTime());
      
      return [
        timeStr,
        pos.position
      ];
    });

    autoTable(doc, {
      startY: yPos,
      head: [[i18next.t("anesthesia.pdf.time"), i18next.t("anesthesia.pdf.position")]],
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

  // ==================== WHO SURGICAL SAFETY CHECKLIST ====================
  if (data.anesthesiaRecord && (data.anesthesiaRecord.signInData || data.anesthesiaRecord.timeOutData || data.anesthesiaRecord.signOutData)) {
    yPos = checkPageBreak(doc, yPos, 80);

    // Main WHO Checklist Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.whoChecklistTitle"), 105, yPos, { align: "center" });
    yPos += 12;

    // Sign-In Checklist
    if (data.anesthesiaRecord.signInData) {
      yPos = checkPageBreak(doc, yPos, 60);
      // Use configured checklist items if available, otherwise use defaults
      const signInItems = data.checklistSettings?.signIn?.map(item => ({
        key: item.id,
        label: item.label
      })) || [
        { key: "patient_identity_confirmed", label: i18next.t("anesthesia.pdf.whoSignIn.patientIdentity") },
        { key: "site_marked", label: i18next.t("anesthesia.pdf.whoSignIn.siteMarked") },
        { key: "procedure_confirmed", label: i18next.t("anesthesia.pdf.whoSignIn.procedureConfirmed") },
        { key: "consent_signed", label: i18next.t("anesthesia.pdf.whoSignIn.consentSigned") },
        { key: "anesthesia_safety_check", label: i18next.t("anesthesia.pdf.whoSignIn.anesthesiaSafety") },
        { key: "allergies_known", label: i18next.t("anesthesia.pdf.whoSignIn.allergiesKnown") },
        { key: "difficult_airway_risk", label: i18next.t("anesthesia.pdf.whoSignIn.difficultAirway") },
        { key: "blood_loss_risk", label: i18next.t("anesthesia.pdf.whoSignIn.bloodLossRisk") },
      ];
      yPos = drawWHOChecklist(doc, i18next.t("anesthesia.pdf.whoSignInTitle"), data.anesthesiaRecord.signInData, signInItems, yPos);
    }

    // Time-Out Checklist
    if (data.anesthesiaRecord.timeOutData) {
      yPos = checkPageBreak(doc, yPos, 60);
      const timeOutItems = data.checklistSettings?.timeOut?.map(item => ({
        key: item.id,
        label: item.label
      })) || [
        { key: "team_introductions", label: i18next.t("anesthesia.pdf.whoTimeOut.teamIntroductions") },
        { key: "patient_confirmed", label: i18next.t("anesthesia.pdf.whoTimeOut.patientConfirmed") },
        { key: "procedure_confirmed", label: i18next.t("anesthesia.pdf.whoTimeOut.procedureConfirmed") },
        { key: "antibiotics_given", label: i18next.t("anesthesia.pdf.whoTimeOut.antibioticsGiven") },
        { key: "imaging_available", label: i18next.t("anesthesia.pdf.whoTimeOut.imagingAvailable") },
        { key: "concerns_addressed", label: i18next.t("anesthesia.pdf.whoTimeOut.concernsAddressed") },
      ];
      yPos = drawWHOChecklist(doc, i18next.t("anesthesia.pdf.whoTimeOutTitle"), data.anesthesiaRecord.timeOutData, timeOutItems, yPos);
    }

    // Sign-Out Checklist
    if (data.anesthesiaRecord.signOutData) {
      yPos = checkPageBreak(doc, yPos, 60);
      const signOutItems = data.checklistSettings?.signOut?.map(item => ({
        key: item.id,
        label: item.label
      })) || [
        { key: "procedure_recorded", label: i18next.t("anesthesia.pdf.whoSignOut.procedureRecorded") },
        { key: "counts_correct", label: i18next.t("anesthesia.pdf.whoSignOut.countsCorrect") },
        { key: "specimens_labeled", label: i18next.t("anesthesia.pdf.whoSignOut.specimensLabeled") },
        { key: "equipment_issues", label: i18next.t("anesthesia.pdf.whoSignOut.equipmentIssues") },
        { key: "recovery_concerns", label: i18next.t("anesthesia.pdf.whoSignOut.recoveryConcerns") },
      ];
      yPos = drawWHOChecklist(doc, i18next.t("anesthesia.pdf.whoSignOutTitle"), data.anesthesiaRecord.signOutData, signOutItems, yPos);
    }

    yPos += 5;
  }

  // ==================== PRE-OPERATIVE ASSESSMENT & INFORMED CONSENT ====================
  if (data.preOpAssessment) {
    yPos = checkPageBreak(doc, yPos, 80);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.preOpConsentTitle"), 105, yPos, { align: "center" });
    yPos += 12;

    // Pre-Operative Assessment Section
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(59, 130, 246);
    doc.rect(20, yPos - 5, 170, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(i18next.t("anesthesia.pdf.preOpAssessmentSection"), 22, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Display key pre-op assessment details
    if (data.preOpAssessment.asa) {
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.asaClassification")}: `, 25, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(data.preOpAssessment.asa, 65, yPos);
      yPos += 5;
    }
    if (data.preOpAssessment.assessmentDate) {
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.assessmentDate")}: `, 25, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(formatDate(data.preOpAssessment.assessmentDate), 65, yPos);
      yPos += 5;
    }

    // Planned Anesthesia Technique
    if (data.preOpAssessment.anesthesiaTechniques) {
      yPos = checkPageBreak(doc, yPos, 20);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.plannedAnesthesia")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      
      const techniques = data.preOpAssessment.anesthesiaTechniques as any;
      const techniqueList = [];
      if (techniques.general) techniqueList.push(i18next.t("anesthesia.pdf.consentGeneral"));
      if (techniques.spinal) techniqueList.push(i18next.t("anesthesia.pdf.spinalAnesthesia"));
      if (techniques.epidural) techniqueList.push(i18next.t("anesthesia.pdf.epiduralAnesthesia"));
      if (techniques.regional) techniqueList.push(i18next.t("anesthesia.pdf.regionalAnesthesia"));
      if (techniques.sedation) techniqueList.push(i18next.t("anesthesia.pdf.sedation"));
      if (techniques.combined) techniqueList.push(i18next.t("anesthesia.pdf.combined"));
      
      if (techniqueList.length > 0) {
        techniqueList.forEach(tech => {
          doc.text(`• ${tech}`, 30, yPos);
          yPos += 4.5;
        });
        yPos += 2;
      }
    }

    // Medications
    if (data.preOpAssessment.generalMeds && data.preOpAssessment.generalMeds.length > 0) {
      yPos = checkPageBreak(doc, yPos, 20);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.currentMedications")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.text(data.preOpAssessment.generalMeds.join(", "), 30, yPos);
      yPos += 5;
    }

    // Special Notes
    if (data.preOpAssessment.specialNotes) {
      yPos = checkPageBreak(doc, yPos, 25);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.specialNotes")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const splitNotes = doc.splitTextToSize(data.preOpAssessment.specialNotes, 160);
      splitNotes.forEach((line: string) => {
        yPos = checkPageBreak(doc, yPos, 10);
        doc.text(line, 25, yPos);
        yPos += 4;
      });
      yPos += 3;
      doc.setFontSize(9);
    }

    // Airway Assessment
    if (data.preOpAssessment.mallampati || data.preOpAssessment.airwayDifficult || data.preOpAssessment.airwayNotes) {
      yPos = checkPageBreak(doc, yPos, 20);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.airwayAssessment")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      
      if (data.preOpAssessment.mallampati) {
        doc.text(`Mallampati: ${data.preOpAssessment.mallampati}`, 30, yPos);
        yPos += 4.5;
      }
      if (data.preOpAssessment.airwayDifficult) {
        doc.text(`${i18next.t("anesthesia.pdf.difficultAirway")}: ${data.preOpAssessment.airwayDifficult}`, 30, yPos);
        yPos += 4.5;
      }
      if (data.preOpAssessment.airwayNotes) {
        doc.setFontSize(8);
        const airwaySplit = doc.splitTextToSize(data.preOpAssessment.airwayNotes, 155);
        airwaySplit.forEach((line: string) => {
          doc.text(line, 30, yPos);
          yPos += 4;
        });
        doc.setFontSize(9);
      }
      yPos += 2;
    }

    // Doctor signature
    if (data.preOpAssessment.doctorSignature) {
      yPos = checkPageBreak(doc, yPos, 25);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.anesthesiologistSignature")}:`, 25, yPos);
      yPos += 5;
      
      if (data.preOpAssessment.doctorSignature.startsWith('data:image')) {
        renderSignatureImage(doc, data.preOpAssessment.doctorSignature, 25, yPos, 50, 15);
        yPos += 18;
      } else {
        doc.setFont("helvetica", "normal");
        doc.text(data.preOpAssessment.doctorSignature, 25, yPos);
        yPos += 7;
      }
    }

    yPos += 5;

    // Informed Consent Section
    yPos = checkPageBreak(doc, yPos, 60);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setFillColor(59, 130, 246);
    doc.rect(20, yPos - 5, 170, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.text(i18next.t("anesthesia.pdf.informedConsentSection"), 22, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += 10;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    // Display consent options with full descriptions and risks
    const consentItemsWithDetails = [
      { 
        checked: data.preOpAssessment.consentGiven, 
        label: i18next.t("anesthesia.patientDetail.generalAnesthesiaConsent"),
        description: i18next.t("anesthesia.patientDetail.generalAnesthesiaDescription"),
        risksLabel: i18next.t("anesthesia.patientDetail.possibleAdverseEvents"),
        risks: i18next.t("anesthesia.patientDetail.generalAnesthesiaRisks")
      },
      { 
        checked: data.preOpAssessment.consentAnalgosedation, 
        label: i18next.t("anesthesia.patientDetail.analgosedationConsent"),
        description: i18next.t("anesthesia.patientDetail.analgosedationDescription"),
        risksLabel: i18next.t("anesthesia.patientDetail.possibleAdverseEvents"),
        risks: i18next.t("anesthesia.patientDetail.analgosedationRisks")
      },
      { 
        checked: data.preOpAssessment.consentRegional, 
        label: i18next.t("anesthesia.patientDetail.regionalAnesthesiaConsent"),
        description: i18next.t("anesthesia.patientDetail.regionalAnesthesiaDescription"),
        risksLabel: i18next.t("anesthesia.patientDetail.possibleAdverseEvents"),
        risks: i18next.t("anesthesia.patientDetail.regionalAnesthesiaRisks")
      },
      { 
        checked: data.preOpAssessment.consentInstallations, 
        label: i18next.t("anesthesia.patientDetail.plannedInstallationsConsent"),
        description: i18next.t("anesthesia.patientDetail.plannedInstallationsDescription"),
        risksLabel: i18next.t("anesthesia.patientDetail.possibleAdverseEvents"),
        risks: i18next.t("anesthesia.patientDetail.plannedInstallationsRisks")
      },
      { 
        checked: data.preOpAssessment.consentICU, 
        label: i18next.t("anesthesia.patientDetail.postoperativeIcuAdmission"),
        description: i18next.t("anesthesia.patientDetail.postoperativeIcuDescription"),
        risksLabel: i18next.t("anesthesia.patientDetail.postoperativeIcuPurpose", "Zweck"),
        risks: ""
      }
    ];

    consentItemsWithDetails.forEach(item => {
      if (item.checked) {
        yPos = checkPageBreak(doc, yPos, 35);
        
        // Draw checkbox and title
        const boxSize = 3;
        const boxX = 25;
        const boxY = yPos - 2.5;
        
        doc.setDrawColor(100, 100, 100);
        doc.setLineWidth(0.3);
        doc.rect(boxX, boxY, boxSize, boxSize);
        
        // Draw checkmark
        doc.setFillColor(34, 197, 94);
        doc.rect(boxX + 0.4, boxY + 0.4, boxSize - 0.8, boxSize - 0.8, "F");
        
        // Title in bold
        doc.setTextColor(0, 0, 0);
        doc.setFont("helvetica", "bold");
        doc.text(item.label, boxX + boxSize + 3, yPos);
        yPos += 5;
        
        // Description text
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        const descLines = doc.splitTextToSize(item.description, 155);
        descLines.forEach((line: string) => {
          yPos = checkPageBreak(doc, yPos, 8);
          doc.text(line, 30, yPos);
          yPos += 3.5;
        });
        
        // Risks in red
        if (item.risks) {
          yPos += 1;
          doc.setTextColor(220, 38, 38);
          doc.setFont("helvetica", "bold");
          doc.text(`${item.risksLabel}: `, 30, yPos);
          const risksStartX = 30 + doc.getTextWidth(`${item.risksLabel}: `);
          doc.setFont("helvetica", "normal");
          const riskLines = doc.splitTextToSize(item.risks, 155);
          riskLines.forEach((line: string, idx: number) => {
            if (idx === 0) {
              doc.text(line, risksStartX, yPos);
            } else {
              yPos += 3.5;
              yPos = checkPageBreak(doc, yPos, 8);
              doc.text(line, 30, yPos);
            }
          });
          yPos += 4;
        }
        
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(9);
        yPos += 3;
      }
    });

    yPos += 2;

    // Additional consent notes
    if (data.preOpAssessment.consentNotes) {
      yPos = checkPageBreak(doc, yPos, 30);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.patientDetail.consentNotes")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const splitNotes = doc.splitTextToSize(data.preOpAssessment.consentNotes, 160);
      splitNotes.forEach((line: string) => {
        yPos = checkPageBreak(doc, yPos, 10);
        doc.text(line, 25, yPos);
        yPos += 4;
      });
      yPos += 3;
    }

    // Legacy consent text (if any)
    if (data.preOpAssessment.consentText) {
      yPos = checkPageBreak(doc, yPos, 30);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.consentExplanation")}:`, 25, yPos);
      yPos += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      const splitText = doc.splitTextToSize(data.preOpAssessment.consentText, 160);
      splitText.forEach((line: string) => {
        yPos = checkPageBreak(doc, yPos, 10);
        doc.text(line, 25, yPos);
        yPos += 4;
      });
      yPos += 3;
    }

    doc.setFontSize(9);

    // Consent date
    if (data.preOpAssessment.consentDate) {
      yPos = checkPageBreak(doc, yPos, 10);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.consentDate")}: `, 25, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(formatDate(data.preOpAssessment.consentDate), 55, yPos);
      yPos += 7;
    }

    // Doctor consent signature
    if (data.preOpAssessment.consentDoctorSignature) {
      yPos = checkPageBreak(doc, yPos, 25);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.doctorSignature")}:`, 25, yPos);
      yPos += 5;
      
      if (data.preOpAssessment.consentDoctorSignature.startsWith('data:image')) {
        renderSignatureImage(doc, data.preOpAssessment.consentDoctorSignature, 25, yPos, 50, 15);
        yPos += 18;
      } else {
        doc.setFont("helvetica", "normal");
        doc.text(data.preOpAssessment.consentDoctorSignature, 25, yPos);
        yPos += 7;
      }
    }

    // Patient signature
    if (data.preOpAssessment.patientSignature) {
      yPos = checkPageBreak(doc, yPos, 25);
      doc.setFont("helvetica", "bold");
      doc.text(`${i18next.t("anesthesia.pdf.patientSignature")}:`, 25, yPos);
      yPos += 5;
      
      if (data.preOpAssessment.patientSignature.startsWith('data:image')) {
        renderSignatureImage(doc, data.preOpAssessment.patientSignature, 25, yPos, 50, 15);
        yPos += 18;
      } else {
        doc.setFont("helvetica", "normal");
        doc.text(data.preOpAssessment.patientSignature, 25, yPos);
        yPos += 7;
      }
    }

    yPos += 5;
  }

  // ==================== SURGERY NURSE DOCUMENTATION ====================
  const hasStaffMembers = data.staffMembers && data.staffMembers.length > 0;
  if (data.anesthesiaRecord && (hasStaffMembers || data.anesthesiaRecord.intraOpData || data.anesthesiaRecord.countsSterileData)) {
    doc.addPage();
    yPos = 20;

    // Main Title
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(i18next.t("anesthesia.pdf.nurseDoc.title", "SURGERY NURSE DOCUMENTATION"), 105, yPos, { align: "center" });
    yPos += 12;

    // ===== OR TEAM STAFF =====
    const staffMembers = data.staffMembers || [];
    if (staffMembers.length > 0) {
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(59, 130, 246);
      doc.rect(20, yPos - 5, 170, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(i18next.t("anesthesia.pdf.nurseDoc.orTeam", "OR TEAM"), 22, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const roleLabels: Record<string, string> = {
        surgeon: i18next.t("anesthesia.pdf.nurseDoc.surgeon", "Surgeon"),
        surgicalAssistant: i18next.t("anesthesia.pdf.nurseDoc.surgicalAssistant", "Surgical Assistant"),
        instrumentNurse: i18next.t("anesthesia.pdf.nurseDoc.instrumentNurse", "Instrument Nurse (Scrub)"),
        circulatingNurse: i18next.t("anesthesia.pdf.nurseDoc.circulatingNurse", "Circulating Nurse"),
        anesthesiologist: i18next.t("anesthesia.pdf.nurseDoc.anesthesiologist", "Anesthesiologist"),
        anesthesiaNurse: i18next.t("anesthesia.pdf.nurseDoc.anesthesiaNurse", "Anesthesia Nurse"),
        pacuNurse: i18next.t("anesthesia.pdf.nurseDoc.pacuNurse", "PACU Nurse"),
      };

      const staffByRole: Record<string, string[]> = {};
      staffMembers.forEach((staff: StaffMember) => {
        if (!staffByRole[staff.role]) {
          staffByRole[staff.role] = [];
        }
        staffByRole[staff.role].push(staff.name);
      });

      Object.entries(staffByRole).forEach(([role, names]) => {
        const label = roleLabels[role] || role;
        doc.setFont("helvetica", "bold");
        doc.text(`${label}: `, 25, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(names.join(", "), 80, yPos);
        yPos += 5;
      });
      yPos += 5;
    }

    // ===== INTRAOPERATIVE DOCUMENTATION =====
    const intraOpData = data.anesthesiaRecord.intraOpData as any;
    if (intraOpData) {
      yPos = checkPageBreak(doc, yPos, 60);

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(16, 185, 129);
      doc.rect(20, yPos - 5, 170, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(i18next.t("anesthesia.pdf.nurseDoc.intraOpDoc", "INTRAOPERATIVE DOCUMENTATION"), 22, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      // Positioning
      if (intraOpData.positioning) {
        const pos = intraOpData.positioning;
        const positions: string[] = [];
        if (pos.RL) positions.push(i18next.t("anesthesia.pdf.nurseDoc.supine", "Supine (RL)"));
        if (pos.SL) positions.push(i18next.t("anesthesia.pdf.nurseDoc.lateral", "Lateral (SL)"));
        if (pos.BL) positions.push(i18next.t("anesthesia.pdf.nurseDoc.prone", "Prone (BL)"));
        if (pos.SSL) positions.push(i18next.t("anesthesia.pdf.nurseDoc.lithotomy", "Lithotomy (SSL)"));
        if (pos.EXT) positions.push(i18next.t("anesthesia.pdf.nurseDoc.extension", "Extension"));

        if (positions.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.positioning", "Patient Positioning")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          doc.text(positions.join(", "), 75, yPos);
          yPos += 6;
        }
      }

      // Disinfection
      if (intraOpData.disinfection) {
        const disinfect = intraOpData.disinfection;
        const products: string[] = [];
        if (disinfect.kodanColored) products.push("Kodan (colored)");
        if (disinfect.kodanColorless) products.push("Kodan (colorless)");
        if (disinfect.octanisept) products.push("Octenisept");

        if (products.length > 0 || disinfect.performedBy) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.disinfection", "Disinfection")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          let disinfectText = products.join(", ");
          if (disinfect.performedBy) {
            disinfectText += disinfectText ? ` (${i18next.t("anesthesia.pdf.nurseDoc.performedBy", "by")}: ${disinfect.performedBy})` : disinfect.performedBy;
          }
          doc.text(disinfectText, 65, yPos);
          yPos += 6;
        }
      }

      // Equipment
      if (intraOpData.equipment) {
        const equip = intraOpData.equipment;
        yPos = checkPageBreak(doc, yPos, 20);
        doc.setFont("helvetica", "bold");
        doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.equipment", "Equipment")}:`, 25, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");

        const equipList: string[] = [];
        if (equip.monopolar) equipList.push(i18next.t("anesthesia.pdf.nurseDoc.monopolar", "Monopolar"));
        if (equip.bipolar) equipList.push(i18next.t("anesthesia.pdf.nurseDoc.bipolar", "Bipolar"));
        if (equipList.length > 0) {
          doc.text(`• ${i18next.t("anesthesia.pdf.nurseDoc.electrosurgery", "Electrosurgery")}: ${equipList.join(", ")}`, 30, yPos);
          yPos += 4.5;
        }
        if (equip.neutralElectrodeLocation) {
          const sideText = equip.neutralElectrodeSide ? ` (${i18next.t(`surgery.intraop.${equip.neutralElectrodeSide}`, equip.neutralElectrodeSide)})` : '';
          doc.text(`• ${i18next.t("anesthesia.pdf.nurseDoc.neutralElectrode", "Neutral electrode")}: ${i18next.t(`surgery.intraop.${equip.neutralElectrodeLocation}`, equip.neutralElectrodeLocation)}${sideText}`, 30, yPos);
          yPos += 4.5;
        }
        if (equip.pathology?.histology || equip.pathology?.microbiology) {
          const pathList: string[] = [];
          if (equip.pathology.histology) pathList.push(i18next.t("anesthesia.pdf.nurseDoc.histology", "Histology"));
          if (equip.pathology.microbiology) pathList.push(i18next.t("anesthesia.pdf.nurseDoc.microbiology", "Microbiology"));
          doc.text(`• ${i18next.t("anesthesia.pdf.nurseDoc.pathology", "Pathology")}: ${pathList.join(", ")}`, 30, yPos);
          yPos += 4.5;
        }
        if (equip.devices) {
          doc.text(`• ${i18next.t("anesthesia.pdf.nurseDoc.devices", "Devices")}: ${equip.devices}`, 30, yPos);
          yPos += 4.5;
        }
        if (equip.notes) {
          doc.text(`• ${i18next.t("anesthesia.pdf.nurseDoc.notes", "Notes")}: ${equip.notes}`, 30, yPos);
          yPos += 4.5;
        }
        yPos += 2;
      }

      // CO2 / Laparoskopie
      if (intraOpData.co2Pressure) {
        const co2 = intraOpData.co2Pressure;
        if (co2.pressure || co2.notes) {
          yPos = checkPageBreak(doc, yPos, 15);
          doc.setFont("helvetica", "bold");
          doc.text("CO2 / Laparoskopie:", 25, yPos);
          yPos += 5;
          doc.setFont("helvetica", "normal");
          if (co2.pressure != null) {
            doc.text(`• Druck: ${co2.pressure} mmHg`, 30, yPos);
            yPos += 4.5;
          }
          if (co2.notes) {
            doc.text(`• Notizen: ${co2.notes}`, 30, yPos);
            yPos += 4.5;
          }
          yPos += 2;
        }
      }

      // Blutsperre / Tourniquet
      if (intraOpData.tourniquet) {
        const tq = intraOpData.tourniquet;
        if (tq.position || tq.side || tq.pressure || tq.duration || tq.notes) {
          yPos = checkPageBreak(doc, yPos, 25);
          doc.setFont("helvetica", "bold");
          doc.text("Blutsperre / Tourniquet:", 25, yPos);
          yPos += 5;
          doc.setFont("helvetica", "normal");
          const posLabel = tq.position === 'arm' ? 'Arm' : tq.position === 'leg' ? 'Bein' : tq.position;
          const sideLabel = tq.side === 'left' ? 'Links' : tq.side === 'right' ? 'Rechts' : tq.side;
          if (posLabel) {
            doc.text(`• Position: ${posLabel}`, 30, yPos);
            yPos += 4.5;
          }
          if (sideLabel) {
            doc.text(`• Seite: ${sideLabel}`, 30, yPos);
            yPos += 4.5;
          }
          if (tq.pressure != null) {
            doc.text(`• Druck: ${tq.pressure} mmHg`, 30, yPos);
            yPos += 4.5;
          }
          if (tq.duration != null) {
            doc.text(`• Dauer: ${tq.duration} Min.`, 30, yPos);
            yPos += 4.5;
          }
          if (tq.notes) {
            doc.text(`• Notizen: ${tq.notes}`, 30, yPos);
            yPos += 4.5;
          }
          yPos += 2;
        }
      }

      // Irrigation
      if (intraOpData.irrigation) {
        const irr = intraOpData.irrigation;
        const irrList: string[] = [];
        if (irr.nacl) irrList.push("NaCl");
        if (irr.betadine) irrList.push("Betadine");
        if (irr.hydrogenPeroxide) irrList.push(i18next.t("anesthesia.pdf.nurseDoc.hydrogenPeroxide", "H2O2"));
        if (irr.other) irrList.push(irr.other);

        if (irrList.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.irrigation", "Irrigation")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          doc.text(irrList.join(", "), 60, yPos);
          yPos += 6;
        }
      }

      // Infiltration
      if (intraOpData.infiltration) {
        const inf = intraOpData.infiltration;
        const infList: string[] = [];
        if (inf.tumorSolution) infList.push(i18next.t("anesthesia.pdf.nurseDoc.tumorSolution", "Tumor solution"));
        if (inf.other) infList.push(inf.other);

        if (infList.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.infiltration", "Infiltration")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          doc.text(infList.join(", "), 60, yPos);
          yPos += 6;
        }
      }

      // Medications (intra-op)
      if (intraOpData.medications) {
        const meds = intraOpData.medications;
        const medList: string[] = [];
        if (meds.ropivacain) medList.push("Ropivacain");
        if (meds.bupivacain) medList.push("Bupivacain");
        if (meds.contrast) medList.push(i18next.t("anesthesia.pdf.nurseDoc.contrast", "Contrast"));
        if (meds.ointments) medList.push(i18next.t("anesthesia.pdf.nurseDoc.ointments", "Ointments"));
        if (meds.other) medList.push(meds.other);

        if (medList.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.intraOpMeds", "Intra-Op Medications")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          doc.text(medList.join(", "), 75, yPos);
          yPos += 6;
        }
      }

      // Dressing
      if (intraOpData.dressing) {
        const dress = intraOpData.dressing;
        const dressList: string[] = [];
        if (dress.elasticBandage) dressList.push(i18next.t("anesthesia.pdf.nurseDoc.elasticBandage", "Elastic bandage"));
        if (dress.abdominalBelt) dressList.push(i18next.t("anesthesia.pdf.nurseDoc.abdominalBelt", "Abdominal belt"));
        if (dress.bra) dressList.push(i18next.t("anesthesia.pdf.nurseDoc.bra", "Bra"));
        if (dress.faceLiftMask) dressList.push(i18next.t("anesthesia.pdf.nurseDoc.faceLiftMask", "Face-lift mask"));
        if (dress.steristrips) dressList.push("Steri-strips");
        if (dress.comfeel) dressList.push("Comfeel");
        if (dress.opsite) dressList.push("Opsite");
        if (dress.compresses) dressList.push(i18next.t("anesthesia.pdf.nurseDoc.compresses", "Compresses"));
        if (dress.mefix) dressList.push("Mefix");
        if (dress.other) dressList.push(dress.other);

        if (dressList.length > 0) {
          yPos = checkPageBreak(doc, yPos, 15);
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.dressing", "Dressing")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          const dressText = dressList.join(", ");
          const splitDress = doc.splitTextToSize(dressText, 125);
          splitDress.forEach((line: string, idx: number) => {
            doc.text(line, idx === 0 ? 55 : 25, yPos);
            yPos += 4.5;
          });
          yPos += 2;
        }
      }

      // Drainage
      if (intraOpData.drainage) {
        const drain = intraOpData.drainage;
        const drainInfo: string[] = [];
        if (drain.redonCH) drainInfo.push(`Redon CH${drain.redonCH}`);
        if (drain.redonCount) drainInfo.push(`${i18next.t("anesthesia.pdf.nurseDoc.count", "Count")}: ${drain.redonCount}`);
        if (drain.other) drainInfo.push(drain.other);

        if (drainInfo.length > 0) {
          doc.setFont("helvetica", "bold");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.drainage", "Drainage")}: `, 25, yPos);
          doc.setFont("helvetica", "normal");
          doc.text(drainInfo.join(", "), 55, yPos);
          yPos += 6;
        }
      }

      // Intraoperative Notes
      if (intraOpData.intraoperativeNotes) {
        yPos = checkPageBreak(doc, yPos, 20);
        doc.setFont("helvetica", "bold");
        doc.text("Intraoperative Notizen:", 25, yPos);
        yPos += 5;
        doc.setFont("helvetica", "normal");
        const noteLines = doc.splitTextToSize(intraOpData.intraoperativeNotes, 155);
        noteLines.forEach((line: string) => {
          yPos = checkPageBreak(doc, yPos, 6);
          doc.text(line, 25, yPos);
          yPos += 4.5;
        });
        yPos += 2;
      }

      // Nurse Signatures (intra-op)
      if (intraOpData.signatures) {
        yPos = checkPageBreak(doc, yPos, 40);
        doc.setFont("helvetica", "bold");
        doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.intraOpSignatures", "Intra-Op Signatures")}:`, 25, yPos);
        yPos += 7;

        if (intraOpData.signatures.circulatingNurse) {
          doc.setFont("helvetica", "normal");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.circulatingNurse", "Circulating Nurse")}:`, 25, yPos);
          if (intraOpData.signatures.circulatingNurse.startsWith('data:image')) {
            renderSignatureImage(doc, intraOpData.signatures.circulatingNurse, 80, yPos - 3, 50, 15);
          }
          yPos += 18;
        }

        if (intraOpData.signatures.instrumentNurse) {
          doc.setFont("helvetica", "normal");
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.instrumentNurse", "Instrument Nurse (Scrub)")}:`, 25, yPos);
          if (intraOpData.signatures.instrumentNurse.startsWith('data:image')) {
            renderSignatureImage(doc, intraOpData.signatures.instrumentNurse, 80, yPos - 3, 50, 15);
          }
          yPos += 18;
        }
      }

      yPos += 5;
    }

    // ===== SURGICAL COUNTS & STERILE ITEMS =====
    const countsSterileData = data.anesthesiaRecord.countsSterileData as any;
    if (countsSterileData) {
      yPos = checkPageBreak(doc, yPos, 60);

      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.setFillColor(139, 92, 246);
      doc.rect(20, yPos - 5, 170, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.text(i18next.t("anesthesia.pdf.nurseDoc.countsSterile", "SURGICAL COUNTS & STERILE ITEMS"), 22, yPos);
      doc.setTextColor(0, 0, 0);
      yPos += 10;

      // Surgical Counts Table
      if (countsSterileData.surgicalCounts && countsSterileData.surgicalCounts.length > 0) {
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(i18next.t("anesthesia.pdf.nurseDoc.surgicalCounts", "Surgical Counts"), 25, yPos);
        yPos += 5;

        const countsData = countsSterileData.surgicalCounts.map((item: any) => [
          item.name,
          item.count1 ?? "-",
          item.count2 ?? "-",
          item.countFinal ?? "-"
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[
            i18next.t("anesthesia.pdf.nurseDoc.item", "Item"),
            i18next.t("anesthesia.pdf.nurseDoc.count1", "Count 1"),
            i18next.t("anesthesia.pdf.nurseDoc.count2", "Count 2"),
            i18next.t("anesthesia.pdf.nurseDoc.countFinal", "Final")
          ]],
          body: countsData,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          columnStyles: {
            0: { cellWidth: 80 },
            1: { cellWidth: 25, halign: 'center' },
            2: { cellWidth: 25, halign: 'center' },
            3: { cellWidth: 25, halign: 'center' },
          },
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Sterile Items Table
      if (countsSterileData.sterileItems && countsSterileData.sterileItems.length > 0) {
        yPos = checkPageBreak(doc, yPos, 40);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(i18next.t("anesthesia.pdf.nurseDoc.sterileItems", "Sterile Items Used"), 25, yPos);
        yPos += 5;

        const sterileData = countsSterileData.sterileItems.map((item: any) => [
          item.name,
          item.lotNumber || "-",
          item.quantity
        ]);

        autoTable(doc, {
          startY: yPos,
          head: [[
            i18next.t("anesthesia.pdf.nurseDoc.item", "Item"),
            i18next.t("anesthesia.pdf.nurseDoc.lotNumber", "Lot Number"),
            i18next.t("anesthesia.pdf.nurseDoc.quantity", "Qty")
          ]],
          body: sterileData,
          theme: "grid",
          styles: { fontSize: 8, cellPadding: 2 },
          headStyles: { fillColor: [139, 92, 246], textColor: 255 },
          columnStyles: {
            0: { cellWidth: 90 },
            1: { cellWidth: 50 },
            2: { cellWidth: 20, halign: 'center' },
          },
        });
        yPos = (doc as any).lastAutoTable.finalY + 8;
      }

      // Sutures
      if (countsSterileData.sutures && Object.keys(countsSterileData.sutures).length > 0) {
        yPos = checkPageBreak(doc, yPos, 20);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(i18next.t("anesthesia.pdf.nurseDoc.sutures", "Sutures"), 25, yPos);
        yPos += 5;
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");

        Object.entries(countsSterileData.sutures).forEach(([type, size]) => {
          doc.text(`• ${type}: ${size}`, 30, yPos);
          yPos += 4.5;
        });
        yPos += 3;
      }

      // Count Signatures
      if (countsSterileData.signatures) {
        yPos = checkPageBreak(doc, yPos, 40);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.countSignatures", "Count Verification Signatures")}:`, 25, yPos);
        yPos += 7;

        if (countsSterileData.signatures.instrumenteur) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.instrumentNurse", "Instrument Nurse (Scrub)")}:`, 25, yPos);
          if (countsSterileData.signatures.instrumenteur.startsWith('data:image')) {
            renderSignatureImage(doc, countsSterileData.signatures.instrumenteur, 90, yPos - 3, 50, 15);
          }
          yPos += 18;
        }

        if (countsSterileData.signatures.circulating) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(`${i18next.t("anesthesia.pdf.nurseDoc.circulatingNurse", "Circulating Nurse")}:`, 25, yPos);
          if (countsSterileData.signatures.circulating.startsWith('data:image')) {
            renderSignatureImage(doc, countsSterileData.signatures.circulating, 90, yPos - 3, 50, 15);
          }
          yPos += 18;
        }
      }

      // Sticker Documentation Photos (Aufkleber-Dokumentation)
      if (countsSterileData.stickerDocs && countsSterileData.stickerDocs.length > 0) {
        // Add a new page for photos if needed
        doc.addPage();
        yPos = 20;
        
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.setFillColor(139, 92, 246);
        doc.rect(20, yPos - 5, 170, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.text(i18next.t("anesthesia.pdf.nurseDoc.stickerDocs", "AUFKLEBER-DOKUMENTATION"), 22, yPos);
        doc.setTextColor(0, 0, 0);
        yPos += 12;
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(i18next.t("anesthesia.pdf.nurseDoc.stickerDocsDesc", "Fotos vom Aufkleberblatt für Materialien, Implantate und Medikamente"), 25, yPos);
        yPos += 8;
        
        // Photo layout: 2 photos per row, each about 80mm wide x 60mm tall
        const photoWidth = 80;
        const photoHeight = 60;
        const photoMargin = 5;
        let photoIndex = 0;
        
        countsSterileData.stickerDocs.forEach((stickerDoc: any) => {
          if (stickerDoc.type === 'photo' && stickerDoc.data) {
            // Check for page break - need space for photo + caption
            if (yPos + photoHeight + 15 > 270) {
              doc.addPage();
              yPos = 20;
            }
            
            // Calculate X position (alternating left/right)
            const col = photoIndex % 2;
            const xPos = col === 0 ? 25 : 25 + photoWidth + photoMargin;
            
            try {
              // Add the photo
              doc.addImage(stickerDoc.data, 'JPEG', xPos, yPos, photoWidth, photoHeight);
              
              // Draw border around photo
              doc.setDrawColor(150, 150, 150);
              doc.setLineWidth(0.3);
              doc.rect(xPos, yPos, photoWidth, photoHeight);
              
              // Add caption if filename exists
              if (stickerDoc.filename) {
                doc.setFontSize(7);
                doc.setFont("helvetica", "italic");
                doc.text(stickerDoc.filename.substring(0, 40), xPos, yPos + photoHeight + 4);
              }
              
              // Add timestamp if available
              if (stickerDoc.createdAt) {
                const timestamp = new Date(stickerDoc.createdAt);
                doc.setFontSize(6);
                doc.text(formatDateTime24h(timestamp), xPos + photoWidth - 25, yPos + photoHeight + 4);
              }
              
            } catch (error) {
              // If image fails to load, show placeholder
              doc.setDrawColor(200, 200, 200);
              doc.setFillColor(245, 245, 245);
              doc.rect(xPos, yPos, photoWidth, photoHeight, "FD");
              doc.setFontSize(8);
              doc.setTextColor(150, 150, 150);
              doc.text(i18next.t("anesthesia.pdf.nurseDoc.photoError", "Foto konnte nicht geladen werden"), xPos + 5, yPos + photoHeight / 2);
              doc.setTextColor(0, 0, 0);
            }
            
            photoIndex++;
            
            // Move to next row after every 2 photos
            if (photoIndex % 2 === 0) {
              yPos += photoHeight + 12;
            }
          }
        });
        
        // If ended on odd photo, advance Y position
        if (photoIndex % 2 !== 0) {
          yPos += photoHeight + 12;
        }
        
        yPos += 5;
      }

      yPos += 5;
    }
  }

  // ==================== FOOTER ====================
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `${i18next.t("anesthesia.pdf.page")} ${i} ${i18next.t("anesthesia.pdf.of")} ${pageCount} | ${data.patient.patientNumber} | ${formatDate(data.surgery.plannedDate)}`,
      105,
      287,
      { align: "center" }
    );
  }

  // ==================== SAVE PDF ====================
  // Include patient name in filename (sanitize to remove special characters)
  const patientName = `${data.patient.surname}_${data.patient.firstName}`.replace(/[^a-zA-Z0-9_-]/g, '');
  const dateStr = data.surgery.plannedDate.toString().split('T')[0];
  const fileName = `AnesthesiaRecord_${patientName}_${data.patient.patientNumber}_${dateStr}.pdf`;
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
