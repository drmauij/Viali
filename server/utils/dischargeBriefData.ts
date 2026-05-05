import {
  getAnesthesiaRecord,
  getSurgeryNotes,
  getPatientNotes,
  getSurgery,
  getPatientDischargeMedications,
  getAnesthesiaMedications,
  getSurgeryStaff,
  getSurgeryAssistants,
  getNeuraxialBlocks,
  getPeripheralBlocks,
  getAirwayManagement,
  getDifficultAirwayReport,
  getGeneralTechnique,
  getClinicalSnapshot,
  getAnesthesiaInstallations,
  getAnesthesiaEvents,
} from "../storage/anesthesia";
import { getClinicAppointmentsByHospital } from "../storage/clinic";
import { getTissueSamplesByPatient } from "../storage/tissueSamples";
import { getUser } from "../storage/users";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  items,
  type Patient,
  type Hospital,
} from "../../shared/schema";

// ========== HELPERS ==========

function calcDurationMinutes(
  markers: any[],
  startCode: string,
  endCode: string,
): number | null {
  const start = markers.find((m: any) => m.code === startCode && m.time);
  const end = markers.find((m: any) => m.code === endCode && m.time);
  if (!start || !end) return null;
  const diff = new Date(end.time).getTime() - new Date(start.time).getTime();
  if (diff <= 0) return null;
  return Math.round(diff / 60000);
}

function summarizeVitalsCourse(snapshotData: any): string | null {
  if (!snapshotData) return null;

  const parts: string[] = [];
  let hasAbnormal = false;

  // Heart rate
  const hrPoints = snapshotData.hr as Array<{ value: number }> | undefined;
  if (hrPoints?.length) {
    const values = hrPoints.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    parts.push(`HR ${min}-${max}/min`);
    if (min < 50 || max > 120) hasAbnormal = true;
  }

  // Blood pressure
  const bpPoints = snapshotData.bp as Array<{ sys: number; dia: number }> | undefined;
  if (bpPoints?.length) {
    const sysValues = bpPoints.map((p) => p.sys);
    const diaValues = bpPoints.map((p) => p.dia);
    const sysMin = Math.min(...sysValues);
    const sysMax = Math.max(...sysValues);
    const diaMin = Math.min(...diaValues);
    const diaMax = Math.max(...diaValues);
    parts.push(`BD ${sysMin}/${diaMin}-${sysMax}/${diaMax} mmHg`);
    if (sysMin < 90 || sysMax > 180) hasAbnormal = true;
  }

  // SpO2
  const spo2Points = snapshotData.spo2 as Array<{ value: number }> | undefined;
  if (spo2Points?.length) {
    const values = spo2Points.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    parts.push(`SpO2 ${min}-${max}%`);
    if (min < 92) hasAbnormal = true;
  }

  // Temperature
  const tempPoints = snapshotData.temp as Array<{ value: number }> | undefined;
  if (tempPoints?.length) {
    const values = tempPoints.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    parts.push(`Temp ${min}-${max}°C`);
    if (min < 35.0 || max > 38.5) hasAbnormal = true;
  }

  if (parts.length === 0) return null;

  const rangeStr = parts.join(", ");
  if (hasAbnormal) {
    return `Vitalparameter mit Auffälligkeiten (${rangeStr})`;
  }
  return `Stabile Vitalparameter (${rangeStr})`;
}

// ========== STAFF NAME COLLECTION ==========

export async function collectStaffNames(
  patientId: string,
  hospitalId: string,
  surgeryId?: string | null,
): Promise<string[]> {
  const names = new Set<string>();

  const addName = (firstName?: string | null, lastName?: string | null) => {
    const full = `${firstName || ""} ${lastName || ""}`.trim();
    if (full) names.add(full);
  };

  // Patient note authors
  const pNotes = await getPatientNotes(patientId);
  for (const note of pNotes) {
    addName(note.author?.firstName, note.author?.lastName);
  }

  // Surgery-specific names
  if (surgeryId) {
    // Surgery note authors
    const sNotes = await getSurgeryNotes(surgeryId);
    for (const note of sNotes) {
      addName(note.author?.firstName, note.author?.lastName);
    }

    // Surgery staff from anesthesia record
    const record = await getAnesthesiaRecord(surgeryId);
    if (record?.surgeryStaff) {
      const staff = record.surgeryStaff as Record<string, unknown>;
      for (const name of Object.values(staff)) {
        if (typeof name === "string" && name.trim()) {
          names.add(name.trim());
        }
      }
    }

    // Surgeon name from surgery details
    const surgery = await getSurgery(surgeryId);
    if (surgery?.surgeon) names.add(surgery.surgeon);

    // Actual surgery staff entries from documentation
    if (record) {
      try {
        const staffEntries = await getSurgeryStaff(record.id);
        for (const entry of staffEntries) {
          if (entry.name?.trim()) names.add(entry.name.trim());
        }
      } catch { /* staff entries may not exist */ }
    }

    // Surgery assistants
    try {
      const assistants = await getSurgeryAssistants(surgeryId);
      for (const a of assistants) {
        if (a.name?.trim()) names.add(a.name.trim());
      }
    } catch { /* assistants may not exist */ }
  }

  // Discharge medication doctors
  const meds = await getPatientDischargeMedications(patientId, hospitalId);
  for (const slot of meds) {
    if (slot.doctor) {
      addName(slot.doctor.firstName, slot.doctor.lastName);
    }
  }

  // Clinic appointment provider names
  const today = new Date().toISOString().split("T")[0];
  const appointments = await getClinicAppointmentsByHospital(hospitalId, {
    patientId,
    startDate: today,
  });
  for (const appt of appointments) {
    if (appt.provider) {
      addName(appt.provider.firstName, appt.provider.lastName);
    }
  }

  return Array.from(names);
}

// ========== DATA BLOCK COLLECTORS ==========

export async function collectAnesthesiaRecordData(
  surgeryId: string,
  timezone?: string,
): Promise<string | null> {
  const record = await getAnesthesiaRecord(surgeryId);
  if (!record) return null;

  const lines: string[] = ["## Anesthesia Record"];

  if (record.anesthesiaType) {
    lines.push(`Anesthesia Type: ${record.anesthesiaType}`);
  }
  if (record.physicalStatus) {
    lines.push(`ASA Physical Status: ${record.physicalStatus}`);
  }
  if (record.emergencyCase) {
    lines.push(`Emergency Case: Yes`);
  }

  // Time markers
  if (record.timeMarkers && Array.isArray(record.timeMarkers)) {
    const markers = record.timeMarkers.filter((m: any) => m.time);
    if (markers.length > 0) {
      lines.push("\n### Time Markers");
      for (const m of markers) {
        lines.push(`- ${(m as any).code} (${(m as any).label}): ${new Date((m as any).time).toLocaleTimeString("de-CH", { timeZone: timezone || "Europe/Zurich" })}`);
      }
    }
  }

  // Anesthesia overview
  if (record.anesthesiaOverview) {
    const overview = record.anesthesiaOverview as any;
    const active = Object.entries(overview)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (active.length > 0) {
      lines.push(`\nAnesthesia Techniques: ${active.join(", ")}`);
    }
  }

  // Surgery staff — prefer actual staff entries over legacy JSONB
  try {
    const staffEntries = await getSurgeryStaff(record.id);
    if (staffEntries.length > 0) {
      lines.push("\n### Surgery Staff (Actual)");
      for (const entry of staffEntries) {
        if (entry.name) lines.push(`- ${entry.role}: ${entry.name}`);
      }
    } else if (record.surgeryStaff) {
      const staff = record.surgeryStaff as any;
      lines.push("\n### Surgery Staff");
      for (const [role, name] of Object.entries(staff)) {
        if (name) lines.push(`- ${role}: ${name}`);
      }
    }
  } catch {
    // Fallback to legacy JSONB
    if (record.surgeryStaff) {
      const staff = record.surgeryStaff as any;
      lines.push("\n### Surgery Staff");
      for (const [role, name] of Object.entries(staff)) {
        if (name) lines.push(`- ${role}: ${name}`);
      }
    }
  }

  // Anesthesia duration from time markers
  if (record.timeMarkers && Array.isArray(record.timeMarkers)) {
    const markers = record.timeMarkers.filter((m: any) => m.time);
    const anesDuration = calcDurationMinutes(markers, "X1", "X2");
    if (anesDuration) {
      lines.push(`\nAnesthesia Duration (X1→X2): ${anesDuration} min`);
    }
  }

  // General technique details
  try {
    const technique = await getGeneralTechnique(record.id);
    if (technique) {
      lines.push("\n### General Anesthesia Technique");
      if (technique.approach) lines.push(`Approach: ${technique.approach}`);
      if (technique.rsi) lines.push(`RSI (Rapid Sequence Intubation): Yes`);
      if (technique.sedationLevel) lines.push(`Sedation Level: ${technique.sedationLevel}`);
      if (technique.airwaySupport) lines.push(`Airway Support: ${technique.airwaySupport}`);
      if (technique.notes) lines.push(`Notes: ${technique.notes}`);
    }
  } catch { /* technique may not exist */ }

  // Airway management
  try {
    const airway = await getAirwayManagement(record.id);
    if (airway) {
      lines.push("\n### Airway Management");
      if (airway.airwayDevice) lines.push(`Device: ${airway.airwayDevice}`);
      if (airway.size) lines.push(`Size: ${airway.size}`);
      if (airway.depth) lines.push(`Depth: ${airway.depth} cm`);
      if (airway.cuffPressure) lines.push(`Cuff Pressure: ${airway.cuffPressure} cmH2O`);
      if (airway.intubationPreExisting) lines.push(`Pre-existing intubation: Yes`);
      if (airway.laryngoscopeType) lines.push(`Laryngoscope: ${airway.laryngoscopeType}${airway.laryngoscopeBlade ? ` blade ${airway.laryngoscopeBlade}` : ""}`);
      if (airway.intubationAttempts) lines.push(`Intubation Attempts: ${airway.intubationAttempts}`);
      if (airway.cormackLehane) lines.push(`Cormack-Lehane Grade: ${airway.cormackLehane}`);
      if (airway.difficultAirway) {
        lines.push(`Difficult Airway: Yes`);
        try {
          const dar = await getDifficultAirwayReport(airway.id);
          if (dar) {
            lines.push("\n#### Difficult Airway Report");
            if (dar.description) lines.push(`Description: ${dar.description}`);
            if (dar.finalTechnique) lines.push(`Final Technique: ${dar.finalTechnique}`);
            if (dar.equipmentUsed) lines.push(`Equipment Used: ${dar.equipmentUsed}`);
            if (dar.complications) lines.push(`Complications: ${dar.complications}`);
            if (dar.recommendations) lines.push(`Recommendations: ${dar.recommendations}`);
          }
        } catch { /* report may not exist */ }
      }
      if (airway.notes) lines.push(`Notes: ${airway.notes}`);
    }
  } catch { /* airway may not exist */ }

  // Regional blocks — neuraxial
  try {
    const neuraxialBlocks = await getNeuraxialBlocks(record.id);
    if (neuraxialBlocks.length > 0) {
      lines.push("\n### Neuraxial Blocks");
      for (const block of neuraxialBlocks) {
        const desc = [block.blockType, block.level, block.approach].filter(Boolean).join(", ");
        lines.push(`- ${desc}`);
        if (block.needleGauge) lines.push(`  Needle: ${block.needleGauge}`);
        if (block.attempts) lines.push(`  Attempts: ${block.attempts}`);
        if (block.sensoryLevel) lines.push(`  Sensory Level: ${block.sensoryLevel}`);
        if (block.catheterPresent) lines.push(`  Catheter: Yes${block.catheterDepth ? ` (${block.catheterDepth})` : ""}`);
        if (block.guidanceTechnique) lines.push(`  Guidance: ${block.guidanceTechnique}`);
        if (block.testDose) lines.push(`  Test Dose: ${block.testDose}`);
        if (block.notes) lines.push(`  Notes: ${block.notes}`);
      }
    }
  } catch { /* blocks may not exist */ }

  // Regional blocks — peripheral
  try {
    const peripheralBlocks = await getPeripheralBlocks(record.id);
    if (peripheralBlocks.length > 0) {
      lines.push("\n### Peripheral Blocks");
      for (const block of peripheralBlocks) {
        const desc = [block.blockType, block.laterality].filter(Boolean).join(", ");
        lines.push(`- ${desc}`);
        if (block.guidanceTechnique) lines.push(`  Guidance: ${block.guidanceTechnique}`);
        if (block.needleType) lines.push(`  Needle: ${block.needleType}`);
        if (block.attempts) lines.push(`  Attempts: ${block.attempts}`);
        if (block.catheterPlaced) lines.push(`  Catheter: placed`);
        if (block.sensoryAssessment) lines.push(`  Sensory: ${block.sensoryAssessment}`);
        if (block.motorAssessment) lines.push(`  Motor: ${block.motorAssessment}`);
        if (block.notes) lines.push(`  Notes: ${block.notes}`);
      }
    }
  } catch { /* blocks may not exist */ }

  // Installations (vascular access)
  try {
    const installations = await getAnesthesiaInstallations(record.id);
    if (installations.length > 0) {
      lines.push("\n### Installations / Vascular Access");
      for (const inst of installations) {
        const parts = [inst.category, inst.location].filter(Boolean);
        let detail = parts.join(" — ");
        if (inst.isPreExisting) detail += " (pre-existing)";
        if (inst.attempts && inst.attempts > 1) detail += ` (${inst.attempts} attempts)`;
        const meta = inst.metadata as any;
        if (meta) {
          if (meta.gauge) detail += `, ${meta.gauge}`;
          if (meta.lumens) detail += `, ${meta.lumens}-lumen`;
          if (meta.depth) detail += `, ${meta.depth}cm`;
          if (meta.bladderType) detail += `, ${meta.bladderType}`;
          if (meta.bladderSize) detail += `, CH ${meta.bladderSize}`;
        }
        lines.push(`- ${detail}`);
        if (inst.notes) lines.push(`  Notes: ${inst.notes}`);
      }
    }
  } catch { /* installations may not exist */ }

  // Anesthesia events / inline notes
  try {
    const events = await getAnesthesiaEvents(record.id);
    if (events.length > 0) {
      lines.push("\n### Anesthesia Events / Timeline Notes");
      const sorted = [...events].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      for (const evt of sorted) {
        const time = new Date(evt.timestamp).toLocaleTimeString("de-CH", {
          timeZone: timezone || "Europe/Zurich",
        });
        const desc = [evt.eventType, evt.description].filter(Boolean).join(": ");
        lines.push(`- ${time} — ${desc}`);
      }
    }
  } catch { /* events may not exist */ }

  // Vitals course summary
  try {
    const snapshot = await getClinicalSnapshot(record.id);
    if (snapshot?.data) {
      const vitalsSummary = summarizeVitalsCourse(snapshot.data);
      if (vitalsSummary) {
        lines.push(`\n### Vitals Course Summary`);
        lines.push(vitalsSummary);
      }
    }
  } catch { /* snapshot may not exist */ }

  // WHO Checklists
  for (const [key, label] of [
    ["signInData", "Sign In"],
    ["timeOutData", "Time Out"],
    ["signOutData", "Sign Out"],
  ] as const) {
    const data = record[key] as any;
    if (data?.completedAt) {
      lines.push(`\n### WHO ${label}: Completed`);
      if (data.notes) lines.push(`Notes: ${data.notes}`);
    }
  }

  // Post-op data
  if (record.postOpData) {
    const postOp = record.postOpData as any;
    lines.push("\n### Post-Operative");
    if (postOp.postOpDestination) lines.push(`Destination: ${postOp.postOpDestination}`);
    if (postOp.postOpNotes) lines.push(`Notes: ${postOp.postOpNotes}`);
    if (postOp.complications) lines.push(`Complications: ${postOp.complications}`);
    if (postOp.paracetamolTime) lines.push(`Paracetamol: ${postOp.paracetamolTime}`);
    if (postOp.nsarTime) lines.push(`NSAR: ${postOp.nsarTime}`);
    if (postOp.novalginTime) lines.push(`Novalgin: ${postOp.novalginTime}`);
  }

  // Medications given during anesthesia
  try {
    const meds = await getAnesthesiaMedications(record.id);
    if (meds && meds.length > 0) {
      lines.push("\n### Anesthesia Medications");
      for (const med of meds) {
        // Resolve item name from itemId
        let medName = "Unknown";
        if (med.itemId) {
          const [item] = await db.select().from(items).where(eq(items.id, med.itemId));
          if (item) medName = item.name;
        }
        const parts = [medName];
        if (med.dose) parts.push(`${med.dose}${med.unit || ""}`);
        if (med.route) parts.push(`(${med.route})`);
        if (med.type) parts.push(`[${med.type}]`);
        lines.push(`- ${parts.join(" ")}`);
      }
    }
  } catch {
    // Medications fetch may not be available
  }

  // Anesthesia course verdict
  {
    const postOp = record.postOpData as any;
    const hasComplications = postOp?.complications && postOp.complications.trim().length > 0;
    let hasDifficultAirway = false;
    try {
      const airway = await getAirwayManagement(record.id);
      hasDifficultAirway = !!airway?.difficultAirway;
    } catch { /* ignore */ }
    let hasCriticalEvents = false;
    try {
      const events = await getAnesthesiaEvents(record.id);
      hasCriticalEvents = events.some(
        (e) => e.eventType === "complication",
      );
    } catch { /* ignore */ }

    lines.push("\n### Anesthesia Course Verdict");
    if (!hasComplications && !hasDifficultAirway && !hasCriticalEvents) {
      lines.push("Komplikationsloser Anästhesieverlauf");
    } else {
      const issues: string[] = [];
      if (hasComplications) issues.push(`Complications: ${postOp.complications}`);
      if (hasDifficultAirway) issues.push("Difficult airway encountered");
      if (hasCriticalEvents) issues.push("Critical events during anesthesia (see timeline)");
      lines.push(issues.join("; "));
    }
  }

  return lines.join("\n");
}

export async function collectDischargeMedicationsData(
  patientId: string,
  hospitalId: string,
  selectedMedicationSlotIds?: string[],
): Promise<string | null> {
  const allMeds = await getPatientDischargeMedications(patientId, hospitalId);
  if (!allMeds || allMeds.length === 0) return null;

  const meds = selectedMedicationSlotIds
    ? allMeds.filter((m) => selectedMedicationSlotIds.includes(m.id))
    : allMeds;

  if (meds.length === 0) return null;

  const lines: string[] = ["## Discharge Medications"];

  for (const slot of meds) {
    const doctorName = slot.doctor
      ? `${slot.doctor.firstName || ""} ${slot.doctor.lastName || ""}`.trim()
      : "Unknown";
    lines.push(`\n### Prescription by ${doctorName}`);
    if (slot.notes) lines.push(`Notes: ${slot.notes}`);

    // Format medications as a markdown table for better readability
    lines.push("");
    lines.push("| Medication | Quantity | Route | Frequency | Notes |");
    lines.push("|------------|----------|-------|-----------|-------|");
    for (const item of slot.items) {
      const name = item.item?.name || item.customName || "Unknown medication";
      const qty = item.quantity ? `${item.quantity} ${item.unitType || ""}`.trim() : "-";
      const route = item.administrationRoute || "-";
      const freq = item.frequency || "-";
      const notes = item.notes || "-";
      lines.push(`| ${name} | ${qty} | ${route} | ${freq} | ${notes} |`);
    }
  }

  return lines.join("\n");
}

export async function collectPatientNotesData(
  patientId: string,
  selectedNoteIds?: string[],
  timezone?: string,
): Promise<string | null> {
  const allNotes = await getPatientNotes(patientId);
  if (!allNotes || allNotes.length === 0) return null;

  const notes = selectedNoteIds
    ? allNotes.filter((n) => selectedNoteIds.includes(n.id))
    : allNotes;

  if (notes.length === 0) return null;

  const lines: string[] = ["## Patient Notes"];
  for (const note of notes) {
    const author = `${note.author?.firstName || ""} ${note.author?.lastName || ""}`.trim();
    const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString("de-CH", { timeZone: timezone || "Europe/Zurich" }) : "";
    lines.push(`\n### Note by ${author} (${date})`);
    lines.push(note.content || "");
  }

  return lines.join("\n");
}

export async function collectSurgeryNotesData(
  surgeryId: string,
  timezone?: string,
): Promise<string | null> {
  const notes = await getSurgeryNotes(surgeryId);
  if (!notes || notes.length === 0) return null;

  const lines: string[] = ["## Surgery Notes"];
  for (const note of notes) {
    const author = `${note.author?.firstName || ""} ${note.author?.lastName || ""}`.trim();
    const date = note.createdAt ? new Date(note.createdAt).toLocaleDateString("de-CH", { timeZone: timezone || "Europe/Zurich" }) : "";
    lines.push(`\n### Note by ${author} (${date})`);
    lines.push(note.content || "");
  }

  return lines.join("\n");
}

export async function collectFollowUpAppointmentsData(
  patientId: string,
  hospitalId: string,
  selectedAppointmentIds?: string[],
  timezone?: string,
): Promise<string | null> {
  const today = new Date().toISOString().split("T")[0];
  const allAppts = await getClinicAppointmentsByHospital(hospitalId, {
    patientId,
    startDate: today,
  });

  // Filter out cancelled / no_show
  const activeAppts = allAppts.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );

  const appts = selectedAppointmentIds
    ? activeAppts.filter((a) => selectedAppointmentIds.includes(a.id))
    : activeAppts;

  if (appts.length === 0) return null;

  const lines: string[] = ["## Follow-Up Appointments (Kontrolltermine)"];

  for (const appt of appts) {
    const providerName = appt.provider
      ? `${appt.provider.firstName || ""} ${appt.provider.lastName || ""}`.trim()
      : "Unknown";
    const dateStr = new Date(appt.appointmentDate).toLocaleDateString("de-CH", { timeZone: timezone || "Europe/Zurich" });
    lines.push(`\n### ${dateStr} at ${appt.startTime} — ${providerName}`);
    if (appt.notes) lines.push(`Notes: ${appt.notes}`);
    lines.push(`Duration: ${appt.durationMinutes} minutes`);
  }

  return lines.join("\n");
}

export async function collectTissueSamplesData(
  patientId: string,
  timezone?: string,
): Promise<string | null> {
  const samples = await getTissueSamplesByPatient(patientId);
  if (samples.length === 0) return null;

  const tz = timezone || "Europe/Zurich";
  const fmtDate = (d: Date | string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("de-CH", { timeZone: tz }) : "";
  const fmtDateTime = (d: Date | string | null | undefined) =>
    d
      ? new Date(d).toLocaleString("de-CH", { timeZone: tz })
      : "";

  const lines: string[] = ["## Tissue Samples (Gewebeproben / Fettbanking)"];

  for (const s of samples) {
    const creator = s.createdBy ? await getUser(s.createdBy) : null;
    const createdByName = creator
      ? `${creator.firstName || ""} ${creator.lastName || ""}`.trim()
      : "";
    lines.push(`\n### ${s.code}`);
    lines.push(`Type: ${s.sampleType}`);
    lines.push(`Status: ${s.status} (since ${fmtDateTime(s.statusDate)})`);
    if (s.externalLab) lines.push(`External lab: ${s.externalLab}`);
    if (s.extractionSurgeryId) lines.push(`Extraction surgery: ${s.extractionSurgeryId}`);
    if (s.reimplantSurgeryId) lines.push(`Reimplant surgery: ${s.reimplantSurgeryId}`);
    if (createdByName) lines.push(`Created by: ${createdByName}`);
    if (s.createdAt) lines.push(`Created: ${fmtDate(s.createdAt)}`);
    if (s.notes) lines.push(`Notes: ${s.notes}`);
  }

  return lines.join("\n");
}

export async function collectSurgeryData(
  surgeryId: string,
  timezone?: string,
): Promise<string | null> {
  const surgery = await getSurgery(surgeryId);
  if (!surgery) return null;

  const lines: string[] = ["## Surgery Details"];
  if (surgery.plannedSurgery) lines.push(`Procedure: ${surgery.plannedSurgery}`);
  if (surgery.plannedDate) lines.push(`Date: ${new Date(surgery.plannedDate).toLocaleDateString("de-CH", { timeZone: timezone || "Europe/Zurich" })}`);
  if (surgery.surgerySide) lines.push(`Side: ${surgery.surgerySide}`);
  if (surgery.chopCode) lines.push(`CHOP Code: ${surgery.chopCode}`);
  if (surgery.surgeon) lines.push(`Surgeon (planned): ${surgery.surgeon}`);
  if (surgery.notes) lines.push(`Notes: ${surgery.notes}`);
  if (surgery.implantDetails) lines.push(`Implants: ${surgery.implantDetails}`);

  // Actual surgical assistants
  try {
    const assistants = await getSurgeryAssistants(surgeryId);
    if (assistants.length > 0) {
      lines.push(`\n### Surgical Assistants`);
      for (const a of assistants) {
        lines.push(`- ${a.name}`);
      }
    }
  } catch { /* assistants may not exist */ }

  // Surgery duration from anesthesia record time markers (O1→O2)
  try {
    const record = await getAnesthesiaRecord(surgeryId);
    if (record?.timeMarkers && Array.isArray(record.timeMarkers)) {
      const markers = record.timeMarkers.filter((m: any) => m.time);
      const surgDuration = calcDurationMinutes(markers, "O1", "O2");
      if (surgDuration) {
        lines.push(`\nSurgery Duration (O1→O2): ${surgDuration} min`);
      }
    }

    // Intraoperative data from anesthesia record
    if (record?.intraOpData) {
      const intra = record.intraOpData as any;
      const intraParts: string[] = [];

      // Positioning
      if (intra.positioning) {
        const pos = intra.positioning;
        const positions: string[] = [];
        if (pos.RL) positions.push("Rückenlage");
        if (pos.SL) positions.push("Seitenlage");
        if (pos.BL) positions.push("Bauchlage");
        if (pos.SSL) positions.push("Steinschnittlage");
        if (pos.EXT) positions.push("Extension");
        if (positions.length > 0) intraParts.push(`Positioning: ${positions.join(", ")}${pos.notes ? ` (${pos.notes})` : ""}`);
      }

      // Equipment
      if (intra.equipment) {
        const eq = intra.equipment;
        const eqParts: string[] = [];
        if (eq.monopolar) eqParts.push("Monopolar");
        if (eq.bipolar) eqParts.push("Bipolar");
        if (eq.neutralElectrodeLocation) eqParts.push(`Neutral electrode: ${eq.neutralElectrodeSide || ""} ${eq.neutralElectrodeLocation}`.trim());
        if (eq.devices) eqParts.push(eq.devices);
        if (eqParts.length > 0) intraParts.push(`Equipment: ${eqParts.join(", ")}`);
        if (eq.pathology) {
          const path: string[] = [];
          if (eq.pathology.histology) path.push("Histology");
          if (eq.pathology.microbiology) path.push("Microbiology");
          if (path.length > 0) intraParts.push(`Pathology Specimens: ${path.join(", ")}`);
        }
      }

      // Tourniquet
      if (intra.tourniquet) {
        const t = intra.tourniquet;
        const tParts = [t.position, t.side].filter(Boolean).join(" ");
        let tLine = `Tourniquet: ${tParts}`;
        if (t.pressure) tLine += `, ${t.pressure} mmHg`;
        if (t.duration) tLine += `, ${t.duration} min`;
        if (t.notes) tLine += ` (${t.notes})`;
        intraParts.push(tLine);
      }

      // Drainages (new array format)
      if (intra.drainages?.length) {
        for (const d of intra.drainages) {
          const dParts = [d.type === "Other" ? d.typeOther : d.type, d.size, d.position].filter(Boolean);
          intraParts.push(`Drainage: ${dParts.join(", ")}`);
        }
      } else if (intra.drainage) {
        // Legacy format
        const d = intra.drainage;
        const dParts = [];
        if (d.redonCH) dParts.push(`Redon CH ${d.redonCH}`);
        if (d.redonCount) dParts.push(`×${d.redonCount}`);
        if (d.other) dParts.push(d.other);
        if (dParts.length > 0) intraParts.push(`Drainage: ${dParts.join(", ")}`);
      }

      // X-ray / fluoroscopy
      if (intra.xray?.used) {
        let xLine = "X-ray/Fluoroscopy: Yes";
        if (intra.xray.imageCount) xLine += `, ${intra.xray.imageCount} images`;
        if (intra.xray.bodyRegion) xLine += `, ${intra.xray.bodyRegion}`;
        if (intra.xray.notes) xLine += ` (${intra.xray.notes})`;
        intraParts.push(xLine);
      }

      // CO2 pressure
      if (intra.co2Pressure?.pressure) {
        intraParts.push(`CO2 Pressure: ${intra.co2Pressure.pressure} mmHg${intra.co2Pressure.notes ? ` (${intra.co2Pressure.notes})` : ""}`);
      }

      // Intraoperative notes
      if (intra.intraoperativeNotes) {
        intraParts.push(`Intraoperative Notes: ${intra.intraoperativeNotes}`);
      }

      if (intraParts.length > 0) {
        lines.push("\n### Intraoperative Details");
        for (const p of intraParts) {
          lines.push(`- ${p}`);
        }
      }
    }
  } catch { /* anesthesia record may not exist */ }

  return lines.join("\n");
}

// ========== SERIALIZATION ==========

export function serializeBlocksToText(
  blocks: (string | null)[],
): string {
  return blocks.filter(Boolean).join("\n\n---\n\n");
}

// ========== KNOWN VALUES FOR ANONYMIZATION ==========

export function buildKnownValues(
  patient: Patient,
  hospital?: Hospital | null,
  staffNames?: string[],
): Record<string, string> {
  const kv: Record<string, string> = {};

  // Patient PII
  if (patient.firstName) kv.patientFirstName = patient.firstName;
  if (patient.surname) kv.patientLastName = patient.surname;
  if (patient.firstName && patient.surname) {
    kv.patientName = `${patient.firstName} ${patient.surname}`;
  }
  if (patient.email) kv.email = patient.email;
  if (patient.phone) kv.phone = patient.phone;
  if (patient.healthInsuranceNumber) kv.ahv = patient.healthInsuranceNumber;
  if (patient.insuranceNumber) kv.insuranceNumber = patient.insuranceNumber;
  if (patient.birthday) kv.birthday = patient.birthday;

  // Hospital
  if (hospital?.name) kv.hospitalName = hospital.name;
  if (hospital?.companyName) kv.clinicName = hospital.companyName;

  // Staff names — add each as a known value
  if (staffNames) {
    staffNames.forEach((name, i) => {
      if (name && name.trim()) {
        kv[`staffName${i}`] = name.trim();
      }
    });
  }

  return kv;
}

// ========== DATA PREVIEW (for wizard step 1) ==========

export interface DataBlockPreview {
  key: string;
  available: boolean;
  count?: number;
  notes?: Array<{ id: string; title: string; createdAt: string; surgeryId?: string | null }>;
}

export async function getAvailableDataBlocks(
  patientId: string,
  hospitalId: string,
  surgeryId?: string,
  timezone?: string,
): Promise<DataBlockPreview[]> {
  const blocks: DataBlockPreview[] = [];

  // Anesthesia Record — always shown, available only with surgery
  if (surgeryId) {
    const record = await getAnesthesiaRecord(surgeryId);
    blocks.push({ key: "anesthesia_record", available: !!record });
  } else {
    blocks.push({ key: "anesthesia_record", available: false });
  }

  // Surgery Notes — always shown, available only with surgery
  if (surgeryId) {
    const notes = await getSurgeryNotes(surgeryId);
    blocks.push({ key: "surgery_notes", available: notes.length > 0, count: notes.length });
  } else {
    blocks.push({ key: "surgery_notes", available: false, count: 0 });
  }

  // Patient Notes — with sub-list for selection
  const pNotes = await getPatientNotes(patientId);
  blocks.push({
    key: "patient_notes",
    available: pNotes.length > 0,
    count: pNotes.length,
    notes: pNotes.map((n) => ({
      id: n.id,
      title: (n.content ?? "").substring(0, 60).replace(/\n/g, " ") || "Note",
      createdAt: n.createdAt instanceof Date ? n.createdAt.toISOString() : String(n.createdAt),
    })),
  });

  // Discharge Medications — expose slot sub-items (with surgeryId for wizard auto-select)
  const meds = await getPatientDischargeMedications(patientId, hospitalId);
  blocks.push({
    key: "discharge_medications",
    available: meds.length > 0,
    count: meds.length,
    notes: meds.map((m) => ({
      id: m.id,
      title: m.doctor
        ? `Dr. ${m.doctor.firstName || ""} ${m.doctor.lastName || ""}`.trim()
        : "Prescription",
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
      surgeryId: m.surgeryId ?? null,
    })),
  });

  // Surgery Details — always shown, available only with surgery
  if (surgeryId) {
    const surgery = await getSurgery(surgeryId);
    blocks.push({ key: "surgery_details", available: !!surgery });
  } else {
    blocks.push({ key: "surgery_details", available: false });
  }

  // Tissue Samples — banking / lab samples for this patient
  const samples = await getTissueSamplesByPatient(patientId);
  blocks.push({
    key: "tissue_samples",
    available: samples.length > 0,
    count: samples.length,
    notes: samples.map((s) => ({
      id: s.id,
      title: `${s.code} — ${s.sampleType} (${s.status})`,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
    })),
  });

  // Follow-Up Appointments — future clinic appointments for this patient
  const today = new Date().toISOString().split("T")[0];
  const appts = await getClinicAppointmentsByHospital(hospitalId, {
    patientId,
    startDate: today,
  });
  const activeAppts = appts.filter(
    (a) => a.status !== "cancelled" && a.status !== "no_show",
  );
  blocks.push({
    key: "follow_up_appointments",
    available: activeAppts.length > 0,
    count: activeAppts.length,
    notes: activeAppts.map((a) => {
      const providerName = a.provider
        ? `${a.provider.firstName || ""} ${a.provider.lastName || ""}`.trim()
        : "";
      const dateStr = new Date(a.appointmentDate).toLocaleDateString("de-CH", { timeZone: timezone || "Europe/Zurich" });
      const title = [dateStr, a.startTime, providerName, a.notes]
        .filter(Boolean)
        .join(" — ");
      return {
        id: a.id,
        title,
        createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      };
    }),
  });

  return blocks;
}

// ========== USER MESSAGE SUFFIX (reinforces mandatory sections via recency bias) ==========

export function buildUserMessageSuffix(selectedBlocks: string[], briefType?: string): string {
  if (briefType === "prescription") return "";

  const blocks = new Set(selectedBlocks);
  const sections: string[] = [];

  if (blocks.has("anesthesia_record")) {
    sections.push(
      `- Write a section titled "Anästhesie" that summarizes: anesthesia type and technique details (TIVA/balanced/sedation), airway management (device, size, intubation details), regional blocks (neuraxial and peripheral with technique/level), installations/vascular access (lines, catheters), lead anesthesiologist, anesthesia duration (X1→X2), vitals course summary, anesthesia events/timeline notes, and any complications. Use the detailed "Anesthesia Record" data above including the Airway Management, Regional Blocks, Installations, Events, and Vitals Course sections.`,
    );
    sections.push(
      `- If the "Anesthesia Course Verdict" indicates "Komplikationsloser Anästhesieverlauf", summarize the anesthesia course briefly as "komplikationsloser Anästhesieverlauf" (or equivalent in the target language). If complications are noted, describe them.`,
    );
  }

  if (blocks.has("surgery_details") || blocks.has("surgery_notes")) {
    sections.push(
      `- Write a section titled "Operationsbericht" that summarizes: surgery date (ALWAYS include this), procedure performed (with side), lead surgeon and surgical assistants, surgery duration (O1→O2), intraoperative details (positioning, tourniquet, drainage, equipment), and a brief operative course description. Use the "Surgery Details" and/or "Surgery Notes" data above including the Intraoperative Details section.`,
    );
  }

  if (sections.length === 0) return "";

  return `\n\n## REQUIRED OUTPUT SECTIONS\nYou MUST include the following sections in your output. These are mandatory even if the template does not have matching headings:\n${sections.join("\n")}`;
}

// ========== SYSTEM PROMPTS PER BRIEF TYPE ==========

export function getSystemPrompt(
  briefType: string,
  language: string,
  templateContent?: string | null,
  selectedBlocks?: string[],
): string {
  const langNames: Record<string, string> = {
    de: "German",
    en: "English",
    fr: "French",
    it: "Italian",
  };
  const langName = langNames[language] || "German";

  const briefTypeLabels: Record<string, string> = {
    surgery_discharge: "Surgery Discharge Brief",
    anesthesia_discharge: "Anesthesia Discharge Brief",
    anesthesia_overnight_discharge: "Anesthesia Overnight Stay Discharge Brief",
    prescription: "Prescription",
    surgery_report: "Surgery Report (OP-Bericht)",
    surgery_estimate: "Surgery Estimate (Kostenvoranschlag)",
    generic: "Brief",
    tissue_checklist: "Tissue Banking Checklist",
  };
  const briefLabel = briefTypeLabels[briefType] || "Discharge Brief";

  // Build mandatory clinical summary instructions based on selected data blocks
  let mandatorySummaries = "";
  if (selectedBlocks?.length && briefType !== "prescription") {
    const blocks = new Set(selectedBlocks);

    if (blocks.has("anesthesia_record")) {
      mandatorySummaries += `

## Mandatory: Anesthesia Summary
You MUST include a concise anesthesia summary with these details (extract from the Anesthesia Record data):
- Type of anesthesia and technique details (e.g., TIVA, balanced gas, sedation approach)
- Airway management (device type, size, intubation details, difficult airway if applicable)
- Regional blocks: neuraxial blocks (type, level, approach) and peripheral blocks (type, laterality, guidance technique)
- Installations/vascular access (peripheral IV, arterial line, central venous catheter, bladder catheter — with gauge/size)
- Lead anesthesiologist name (from Surgery Staff entries)
- Anesthesia duration (use the X1→X2 duration provided)
- Vitals course summary (use the provided vitals ranges)
- Anesthesia events/timeline notes (include significant events chronologically)
- If the Anesthesia Course Verdict indicates no complications, state "komplikationsloser Anästhesieverlauf". If complications are noted, describe them.`;
    }

    if (blocks.has("surgery_details") || blocks.has("surgery_notes")) {
      mandatorySummaries += `

## Mandatory: Surgery Summary
You MUST include a concise surgery summary with these details (extract from Surgery Details / Surgery Notes data):
- Surgery date (ALWAYS include the date of the surgery — this is essential)
- Procedure performed (with side if applicable)
- Lead surgeon and surgical assistants
- Surgery duration (use the O1→O2 duration provided)
- Intraoperative details: patient positioning, tourniquet (if used), drainage, equipment, pathology specimens, X-ray/fluoroscopy
- A very brief description of the operative course based on documented surgery notes`;
    }
  }

  // When a template is provided, use it as the base document — just inject real data
  if (templateContent?.trim()) {
    const hasTaskList = /data-type=["']taskList["']/.test(templateContent);
    const taskListInstructions = hasTaskList
      ? `

## CRITICAL: Task-list preservation (this template is a checklist)
The template contains task-list elements: \`<ul data-type="taskList">\` with one or more \`<li data-type="taskItem" data-checked="…">\` children.
You MUST preserve EVERY task-list and EVERY task-item EXACTLY as given:
- Do NOT add or remove items.
- Do NOT change the order of items.
- Do NOT change the \`data-checked\` attribute (leave them as "false" / "true" exactly as given).
- Do NOT rewrite, summarize, translate, or shorten task-item text — copy it character-for-character.
- Do NOT remove the \`<label><input type="checkbox">…</label>\` markup inside each task-item.
- Surrounding \`<h3>\` section headings (e.g. "BEI ANKUNFT", "OP-TAG") MUST stay intact and in the same order.
The task-list represents procedural steps a clinician will manually tick — treat them as immutable structural content.

## Empty value cells in patient-data tables
Where the template has a 2-column table whose first cell is a label (e.g. \`<td><strong>Patientencode</strong></td>\`) and the second cell is empty (e.g. \`<td></td>\`), FILL the empty cell with the matching value from the clinical data below. Do not remove the empty cell or merge it with the label cell.`
      : "";

    return `You are a medical documentation assistant. The user provides clinical data and a template document.

Your job is simple: take the template below and produce the final brief by injecting the real clinical data into it.

## Instructions
1. Start from the template HTML EXACTLY as given — keep every heading, every section, every paragraph.
2. Where the template contains example/placeholder text that matches available clinical data, REPLACE that text with the real data.
3. Where clinical data is available but the template has no matching section, ADD a new section at the end.
4. Where the template has text but NO matching clinical data exists, keep the template text as-is — it serves as a structural example the doctor will edit manually.
5. NEVER invent clinical details. Only inject data that is explicitly present in the clinical data below.
6. Keep placeholders like [NAME_1], [DATE_1] etc. intact — do NOT replace them.
7. Write in ${langName}.
8. Output clean HTML only (no markdown).${taskListInstructions}

## Template (this is your starting document):
${templateContent}`;
  }

  // No template — use default section structure
  let typePrompt = "";

  switch (briefType) {
    case "surgery_discharge":
      typePrompt = `You are a medical documentation assistant generating a Surgery Discharge Brief.

Structure the brief with the following sections:
1. **Diagnosis & Procedure** — Primary diagnosis and surgical procedure performed
2. **Intraoperative Findings** — Key findings during surgery
3. **Post-Operative Course** — Recovery summary and complications if any
4. **Discharge Medications** — All medications prescribed at discharge with dosing
5. **Follow-Up** — Follow-up appointments and instructions (use exact dates from data if available)
6. **Activity Restrictions** — Physical activity guidelines
7. **Emergency Signs** — Warning signs requiring immediate medical attention`;
      break;

    case "anesthesia_discharge":
      typePrompt = `You are a medical documentation assistant generating an Anesthesia Discharge Brief.

Structure the brief with the following sections:
1. **Anesthesia Type & Technique** — Type of anesthesia and techniques used
2. **Recovery Summary** — Post-anesthesia recovery course
3. **Pain Management** — Current pain management plan
4. **Post-Anesthesia Instructions** — Diet, driving, physical activity restrictions
5. **Warning Signs** — Symptoms requiring immediate medical attention
6. **Follow-Up** — When and who to contact for follow-up (use exact dates from data if available)`;
      break;

    case "anesthesia_overnight_discharge":
      typePrompt = `You are a medical documentation assistant generating an Anesthesia Overnight Stay Discharge Brief.

Structure the brief with the following sections:
1. **Anesthesia Type & Technique** — Type of anesthesia and techniques used
2. **Overnight Observation Summary** — Key events during overnight monitoring
3. **Vital Signs Trend** — Summary of vital sign progression
4. **Recovery Summary** — Overall recovery course
5. **Pain Management** — Current pain management plan
6. **Post-Anesthesia Instructions** — Diet, driving, physical activity restrictions
7. **Warning Signs** — Symptoms requiring immediate medical attention
8. **Follow-Up** — When and who to contact for follow-up (use exact dates from data if available)`;
      break;

    case "prescription":
      typePrompt = `You are a medical documentation assistant generating a Prescription document for a patient to take to a pharmacy.

Structure the prescription with the following sections:
1. **Patient Information** — Use the actual patient name, date of birth, and prescription date provided in the data. Output these values directly — do NOT use placeholders.
2. **Medications** — For each medication: name, dosage/strength, quantity to dispense, frequency, route of administration, duration of treatment, and any special instructions

Do NOT include a prescribing doctor or signature section — this is handled separately by the system.
Keep it clean and pharmacy-ready. Do not include narrative text — use an HTML table for medications with columns: Medication, Dosage/Strength, Quantity, Frequency, Route, Duration, Instructions.`;
      break;

    case "surgery_report":
      typePrompt = `You are a medical documentation assistant generating a Surgery Report (OP-Bericht).

Structure the report with the following sections:
1. **Indication** — Reason for surgical intervention, diagnosis, and clinical indication
2. **Procedure / Technique** — Detailed operative technique including approach, instruments, and steps
3. **Intraoperative Findings** — Surgical findings during the procedure
4. **Complications** — Any intraoperative complications or "keine" if none
5. **Post-Operative Instructions** — Immediate post-operative care plan, drains, dressings, activity restrictions
6. **Follow-Up** — Follow-up plan (use exact dates from data if available)`;
      break;

    case "generic":
      typePrompt = `You are a medical documentation assistant generating a clinical brief.

Structure the brief based on the available data blocks. Use appropriate section headings that match the provided clinical data. Include all relevant information from the selected data sources in a logical, well-organized format.`;
      break;

    default:
      typePrompt = "You are a medical documentation assistant generating a discharge brief.";
  }

  return `${typePrompt}
${mandatorySummaries}

## Rules
- Write the brief in ${langName}
- Use professional medical language appropriate for clinical documentation
- Base the content ONLY on the provided clinical data — do not invent information
- Keep placeholders like [NAME_1], [DATE_1] etc. intact — do NOT replace them
- Output as clean HTML. Use <h2> and <h3> for section headings, <p> for paragraphs, <strong> for bold, <em> for italic, <ul><li> for bullet lists, <ol><li> for numbered lists, <table> for tabular data, and <hr> for separators. Do NOT use markdown formatting.
- IMPORTANT: When listing medications (discharge medications, prescriptions, or any medication list), ALWAYS use an HTML table with columns for Medication, Quantity, Route, Frequency, and Notes. Never list medications as bullet points or plain text.
- Be concise but thorough`;
}
