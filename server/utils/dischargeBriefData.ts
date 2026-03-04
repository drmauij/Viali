import {
  getAnesthesiaRecord,
  getSurgeryNotes,
  getPatientNotes,
  getSurgery,
  getPatientDischargeMedications,
  getAnesthesiaMedications,
} from "../storage/anesthesia";
import { getClinicAppointmentsByHospital } from "../storage/clinic";
import { db } from "../db";
import { eq } from "drizzle-orm";
import {
  items,
  type Patient,
  type Hospital,
} from "../../shared/schema";

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

  // Surgery staff
  if (record.surgeryStaff) {
    const staff = record.surgeryStaff as any;
    lines.push("\n### Surgery Staff");
    for (const [role, name] of Object.entries(staff)) {
      if (name) lines.push(`- ${role}: ${name}`);
    }
  }

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

    for (const item of slot.items) {
      const parts = [item.item?.name || item.customName || "Unknown medication"];
      if (item.quantity) parts.push(`Qty: ${item.quantity} ${item.unitType || ""}`);
      if (item.administrationRoute) parts.push(`Route: ${item.administrationRoute}`);
      if (item.frequency) parts.push(`Freq: ${item.frequency}`);
      if (item.notes) parts.push(`(${item.notes})`);
      lines.push(`- ${parts.join(" | ")}`);
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
  if (surgery.surgeon) lines.push(`Surgeon: ${surgery.surgeon}`);
  if (surgery.notes) lines.push(`Notes: ${surgery.notes}`);
  if (surgery.implantDetails) lines.push(`Implants: ${surgery.implantDetails}`);

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
      `- Write a section titled "Anästhesie" that summarizes: anesthesia type, techniques/installations (intubation, arterial line, regional blocks etc.), lead anesthesiologist, start/end time with total duration, and any complications. Use the "Anesthesia Record" data above.`,
    );
  }

  if (blocks.has("surgery_details") || blocks.has("surgery_notes")) {
    sections.push(
      `- Write a section titled "Operationsbericht" that summarizes: procedure performed (with side), lead surgeon, surgery duration, and a brief operative course description. Use the "Surgery Details" and/or "Surgery Notes" data above.`,
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
- Type of anesthesia (e.g., general anesthesia, regional, sedation)
- Particular installations/techniques (e.g., intubation, arterial line, central venous catheter, regional blocks)
- Lead anesthesiologist name
- Anesthesia start/end time and total duration (calculate from time markers)
- Notable events or complications during anesthesia, if any`;
    }

    if (blocks.has("surgery_details") || blocks.has("surgery_notes")) {
      mandatorySummaries += `

## Mandatory: Surgery Summary
You MUST include a concise surgery summary with these details (extract from Surgery Details / Surgery Notes data):
- Procedure performed (with side if applicable)
- Lead surgeon name
- Surgery duration (calculate from time markers if available)
- A very brief description of the operative course based on documented surgery notes`;
    }
  }

  // When a template is provided, it defines the structure — but mandatory clinical sections take priority
  if (templateContent?.trim()) {
    return `You are a medical documentation assistant generating a ${briefLabel}.
${mandatorySummaries}

## Template
Use the following template as the PREFERRED structure and tone for the brief.
Fill in each section with the provided clinical data.
Keep headings, order, and tone as close to the template as possible.

If the template does not include a section for the mandatory clinical data above, ADD those sections in a logical position (typically before follow-up / discharge instructions).
The clinical data ends with REQUIRED OUTPUT SECTIONS — you MUST include those sections in your response, even if they don't match a template heading.

---
${templateContent}
---

## Rules
- Write the brief in ${langName}
- Base the content ONLY on the provided clinical data — do not invent information
- Keep placeholders like [NAME_1], [DATE_1] etc. intact — do NOT replace them
- If follow-up appointment data is provided, use the exact dates and times from the data — do not invent appointment dates
- If a template section has no matching clinical data, keep the section heading but note that no data was available ("keine Daten vorhanden")
- Output as clean HTML. Use <h2> and <h3> for section headings, <p> for paragraphs, <strong> for bold, <em> for italic, <ul><li> for bullet lists, <ol><li> for numbered lists, and <hr> for separators. Do NOT use markdown formatting.
- Be concise but thorough`;
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
Keep it clean and pharmacy-ready. Do not include narrative text — use a structured list format for medications.`;
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
- Output as clean HTML. Use <h2> and <h3> for section headings, <p> for paragraphs, <strong> for bold, <em> for italic, <ul><li> for bullet lists, <ol><li> for numbered lists, and <hr> for separators. Do NOT use markdown formatting.
- Be concise but thorough`;
}
