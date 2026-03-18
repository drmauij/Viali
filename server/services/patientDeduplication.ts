import { db } from "../storage";
import { eq, and, isNull, sql } from "drizzle-orm";
import {
  patients,
  surgeries,
  cases,
  patientDocuments,
  patientNotes,
  patientMessages,
  clinicAppointments,
  clinicInvoices,
  patientEpisodes,
  patientQuestionnaireLinks,
  dischargeBriefs,
  tardocInvoices,
} from "@shared/schema";
import logger from "../logger";

// ============================================================
// Types
// ============================================================

export interface PatientDuplicatePair {
  patient1: PatientSummary;
  patient2: PatientSummary;
  confidence: number;
  reasons: string[];
}

interface PatientSummary {
  id: string;
  surname: string;
  firstName: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
}

export interface PatientMatchCandidate {
  id: string;
  firstName: string;
  surname: string;
  birthday: string | null;
  patientNumber: string | null;
  email: string | null;
  phone: string | null;
  confidence: number;
  reasons: string[];
}

// ============================================================
// Name normalization & similarity
// ============================================================

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Strip combining diacritical marks
    .replace(/[^a-z\s]/g, "") // Remove non-letter chars, keep spaces
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  const m = a.length,
    n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0)
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function calculateNameSimilarity(
  name1: string,
  name2: string
): number {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;

  // Jaccard word similarity
  const words1 = new Set(n1.split(" ").filter((w) => w.length > 1));
  const words2 = new Set(n2.split(" ").filter((w) => w.length > 1));

  const intersection = new Set(
    Array.from(words1).filter((x) => words2.has(x))
  );
  const union = new Set([...Array.from(words1), ...Array.from(words2)]);
  const jaccard = union.size > 0 ? intersection.size / union.size : 0;

  // Levenshtein character similarity
  const levDist = levenshtein(n1, n2);
  const maxLen = Math.max(n1.length, n2.length);
  const levSim = maxLen > 0 ? 1 - levDist / maxLen : 0;

  return Math.min(1.0, jaccard * 0.6 + levSim * 0.4);
}

// ============================================================
// Internal helpers
// ============================================================

type PatientRow = typeof patients.$inferSelect;

function toSummary(p: PatientRow): PatientSummary {
  return {
    id: p.id,
    surname: p.surname,
    firstName: p.firstName,
    birthday: p.birthday ?? null,
    patientNumber: p.patientNumber ?? null,
    email: p.email ?? null,
    phone: p.phone ?? null,
  };
}

function matchPatients(
  p1: PatientRow,
  p2: PatientRow,
  sameBirthday: boolean
): PatientDuplicatePair | null {
  const fullName1 = `${p1.firstName} ${p1.surname}`.trim();
  const fullName2 = `${p2.firstName} ${p2.surname}`.trim();

  if (!fullName1 || !fullName2) return null;

  const reasons: string[] = [];
  let confidence = 0;

  const norm1 = normalizeName(fullName1);
  const norm2 = normalizeName(fullName2);

  // Tier 1: Exact normalized full name match
  if (norm1 === norm2) {
    confidence = 1.0;
    reasons.push("Exact name match");
  } else {
    // Tier 2: First/Last name swapped
    const normFirst1 = normalizeName(p1.firstName);
    const normLast1 = normalizeName(p1.surname);
    const normFirst2 = normalizeName(p2.firstName);
    const normLast2 = normalizeName(p2.surname);

    if (
      normFirst1 &&
      normLast1 &&
      normFirst2 &&
      normLast2 &&
      normFirst1 === normLast2 &&
      normLast1 === normFirst2
    ) {
      confidence = 0.95;
      reasons.push("First/last name swapped");
    } else {
      // Tier 3: Fuzzy match
      const sim = calculateNameSimilarity(fullName1, fullName2);
      if (sim >= 0.6) {
        confidence = 0.7 + (sim - 0.6) * 0.375;
        reasons.push(
          `Fuzzy name match (${Math.round(sim * 100)}% similarity)`
        );
      }
    }
  }

  if (confidence === 0) return null;

  if (sameBirthday) {
    reasons.push("Same birthday");
  }

  // Boost signals
  if (
    p1.phone &&
    p2.phone &&
    p1.phone.replace(/\s+/g, "") === p2.phone.replace(/\s+/g, "")
  ) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching phone number");
  }

  if (p1.email && p2.email && p1.email.toLowerCase() === p2.email.toLowerCase()) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching email");
  }

  return {
    patient1: toSummary(p1),
    patient2: toSummary(p2),
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

// ============================================================
// Single-patient fuzzy matching (for external surgery scheduling)
// ============================================================

/**
 * Match a single input (from external surgery request) against an existing patient candidate.
 * Returns null if confidence < 0.6. Pure function — no DB access.
 */
export function matchPatientCandidate(
  input: { firstName: string; lastName: string; birthday?: string; email?: string; phone?: string },
  candidate: { id: string; firstName: string; surname: string; birthday: string | null; patientNumber: string | null; email: string | null; phone: string | null },
): PatientMatchCandidate | null {
  const fullNameInput = `${input.firstName} ${input.lastName}`.trim();
  const fullNameCandidate = `${candidate.firstName} ${candidate.surname}`.trim();

  if (!fullNameInput || !fullNameCandidate) return null;

  const reasons: string[] = [];
  let confidence = 0;

  const normInput = normalizeName(fullNameInput);
  const normCandidate = normalizeName(fullNameCandidate);

  // Tier 1: Exact normalized full name match
  if (normInput === normCandidate) {
    confidence = 1.0;
    reasons.push("Exact name match");
  } else {
    // Tier 2: First/Last name swapped
    const normFirstIn = normalizeName(input.firstName);
    const normLastIn = normalizeName(input.lastName);
    const normFirstCand = normalizeName(candidate.firstName);
    const normLastCand = normalizeName(candidate.surname);

    if (normFirstIn && normLastIn && normFirstCand && normLastCand &&
        normFirstIn === normLastCand && normLastIn === normFirstCand) {
      confidence = 0.95;
      reasons.push("First/last name swapped");
    } else {
      // Tier 3: Fuzzy match
      const sim = calculateNameSimilarity(fullNameInput, fullNameCandidate);
      if (sim >= 0.6) {
        confidence = 0.7 + (sim - 0.6) * 0.375;
        reasons.push(`Fuzzy name match (${Math.round(sim * 100)}% similarity)`);
      }
    }
  }

  if (confidence === 0) return null;

  // Check birthday match explicitly
  if (input.birthday && candidate.birthday && input.birthday === candidate.birthday) {
    reasons.push("Same birthday");
  }

  // Boost signals
  if (input.phone && candidate.phone &&
      input.phone.replace(/\s+/g, "") === candidate.phone.replace(/\s+/g, "")) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching phone number");
  }

  if (input.email && candidate.email &&
      input.email.toLowerCase() === candidate.email.toLowerCase()) {
    confidence = Math.min(1.0, confidence + 0.05);
    reasons.push("Matching email");
  }

  return {
    ...candidate,
    confidence: Math.round(confidence * 100) / 100,
    reasons,
  };
}

/**
 * Find existing patients that fuzzy-match the given name+birthday.
 * Used by the external surgery scheduling flow to prevent duplicates.
 */
export async function findFuzzyPatientMatches(
  hospitalId: string,
  firstName: string,
  lastName: string,
  birthday: string,
  email?: string,
  phone?: string,
): Promise<PatientMatchCandidate[]> {
  // Query candidates with same birthday (strong pre-filter)
  const candidates = await db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.birthday, birthday),
        eq(patients.isArchived, false),
        isNull(patients.deletedAt),
      )
    );

  const input = { firstName, lastName, birthday, email, phone };
  const matches: PatientMatchCandidate[] = [];

  for (const candidate of candidates) {
    const match = matchPatientCandidate(input, {
      id: candidate.id,
      firstName: candidate.firstName,
      surname: candidate.surname,
      birthday: candidate.birthday ?? null,
      patientNumber: candidate.patientNumber ?? null,
      email: candidate.email ?? null,
      phone: candidate.phone ?? null,
    });
    if (match) {
      matches.push(match);
    }
  }

  // Sort by confidence descending, cap at 10
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches.slice(0, 10);
}

// ============================================================
// Duplicate Detection
// ============================================================

export async function findPatientDuplicates(
  hospitalId: string
): Promise<PatientDuplicatePair[]> {
  // 1. Fetch all non-archived, non-deleted patients for the hospital
  const allPatients = await db
    .select()
    .from(patients)
    .where(
      and(
        eq(patients.hospitalId, hospitalId),
        eq(patients.isArchived, false),
        isNull(patients.deletedAt)
      )
    );

  if (allPatients.length < 2) return [];

  const pairs: PatientDuplicatePair[] = [];
  const seen = new Set<string>();

  // 2. Group by birthday for efficient comparison
  const birthdayGroups = new Map<string, PatientRow[]>();
  const noBirthdayPatients: PatientRow[] = [];

  for (const p of allPatients) {
    if (p.birthday) {
      const existing = birthdayGroups.get(p.birthday);
      if (existing) {
        existing.push(p);
      } else {
        birthdayGroups.set(p.birthday, [p]);
      }
    } else {
      noBirthdayPatients.push(p);
    }
  }

  // 3. Compare within same-birthday groups
  for (const [, group] of birthdayGroups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pairKey = [group[i].id, group[j].id].sort().join(":");
        if (seen.has(pairKey)) continue;

        const match = matchPatients(group[i], group[j], true);
        if (match) {
          seen.add(pairKey);
          pairs.push(match);
        }
      }
    }
  }

  // 3b. Cross-birthday pass — exact or near-exact name matches across different birthday groups
  // Groups by normalized full name to efficiently find same-name patients with different birthdays
  const nameGroups = new Map<string, PatientRow[]>();
  for (const p of allPatients) {
    const key = normalizeName(`${p.firstName} ${p.surname}`);
    if (!key) continue;
    const existing = nameGroups.get(key);
    if (existing) {
      existing.push(p);
    } else {
      nameGroups.set(key, [p]);
    }
  }

  // Exact name match with different birthdays
  for (const [, group] of nameGroups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pi = group[i]!;
        const pj = group[j]!;
        if (pi.birthday === pj.birthday) continue; // already handled in step 3
        const pairKey = [pi.id, pj.id].sort().join(":");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const reasons: string[] = ["Exact name match", "Different birthday — verify"];
        let confidence = 0.55; // low — same name across clinics isn't rare, but worth checking

        // Boost signals
        if (pi.phone && pj.phone && pi.phone.replace(/\s+/g, "") === pj.phone.replace(/\s+/g, "")) {
          confidence = Math.min(1.0, confidence + 0.05);
          reasons.push("Same phone");
        }
        if (pi.email && pj.email && pi.email.toLowerCase() === pj.email.toLowerCase()) {
          confidence = Math.min(1.0, confidence + 0.05);
          reasons.push("Same email");
        }

        pairs.push({
          patient1: toSummary(pi),
          patient2: toSummary(pj),
          confidence: Math.round(confidence * 100) / 100,
          reasons,
        });
      }
    }
  }

  // Also check name-swapped across different birthdays
  for (const p of allPatients) {
    const swapped = normalizeName(`${p.surname} ${p.firstName}`);
    if (!swapped) continue;
    const matchGroup = nameGroups.get(swapped);
    if (!matchGroup) continue;
    for (const other of matchGroup) {
      if (other.id === p.id) continue;
      if (other.birthday === p.birthday) continue; // already handled
      const pairKey = [p.id, other.id].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const reasons: string[] = ["Name/surname swapped", "Different birthday — verify"];
      let confidence = 0.5;

      if (p.phone && other.phone && p.phone.replace(/\s+/g, "") === other.phone.replace(/\s+/g, "")) {
        confidence = Math.min(1.0, confidence + 0.05);
        reasons.push("Same phone");
      }
      if (p.email && other.email && p.email.toLowerCase() === other.email.toLowerCase()) {
        confidence = Math.min(1.0, confidence + 0.05);
        reasons.push("Same email");
      }

      pairs.push({
        patient1: toSummary(p),
        patient2: toSummary(other),
        confidence: Math.round(confidence * 100) / 100,
        reasons,
      });
    }
  }

  // 4. Insurance number pass — find pairs with matching insurance numbers not already found
  const insuranceGroups = new Map<string, PatientRow[]>();

  for (const p of allPatients) {
    const keys: string[] = [];
    if (p.healthInsuranceNumber) keys.push(`hin:${p.healthInsuranceNumber}`);
    if (p.insuranceNumber) keys.push(`in:${p.insuranceNumber}`);

    for (const key of keys) {
      const existing = insuranceGroups.get(key);
      if (existing) {
        existing.push(p);
      } else {
        insuranceGroups.set(key, [p]);
      }
    }
  }

  for (const [insuranceKey, group] of insuranceGroups) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const pi = group[i]!;
        const pj = group[j]!;
        const pairKey = [pi.id, pj.id].sort().join(":");
        if (seen.has(pairKey)) continue;
        seen.add(pairKey);

        const reasons: string[] = [];
        let confidence = 0.9;

        const label = insuranceKey.startsWith("hin:")
          ? "health insurance number"
          : "insurance number";
        reasons.push(`Matching ${label}`);

        // Boost signals
        const phoneI = pi.phone;
        const phoneJ = pj.phone;
        if (
          phoneI &&
          phoneJ &&
          phoneI.replace(/\s+/g, "") ===
            phoneJ.replace(/\s+/g, "")
        ) {
          confidence = Math.min(1.0, confidence + 0.05);
          reasons.push("Matching phone number");
        }

        const emailI = pi.email;
        const emailJ = pj.email;
        if (
          emailI &&
          emailJ &&
          emailI.toLowerCase() === emailJ.toLowerCase()
        ) {
          confidence = Math.min(1.0, confidence + 0.05);
          reasons.push("Matching email");
        }

        pairs.push({
          patient1: toSummary(pi),
          patient2: toSummary(pj),
          confidence: Math.round(confidence * 100) / 100,
          reasons,
        });
      }
    }
  }

  // 5. Sort by confidence descending
  pairs.sort((a, b) => b.confidence - a.confidence);

  logger.info(
    `[PatientDedup] Found ${pairs.length} duplicate candidates for hospital ${hospitalId}`
  );

  return pairs;
}

// ============================================================
// Patient Scoring (for primary recommendation during merge)
// ============================================================

export async function scorePatient(
  patientId: string,
  hospitalId: string
): Promise<number> {
  // Count FK references across related tables
  const fkTables = [
    { table: surgeries, col: surgeries.patientId },
    { table: cases, col: cases.patientId },
    { table: patientDocuments, col: patientDocuments.patientId },
    { table: patientNotes, col: patientNotes.patientId },
    { table: patientMessages, col: patientMessages.patientId },
    { table: clinicAppointments, col: clinicAppointments.patientId },
    { table: clinicInvoices, col: clinicInvoices.patientId },
    { table: patientEpisodes, col: patientEpisodes.patientId },
    { table: patientQuestionnaireLinks, col: patientQuestionnaireLinks.patientId },
    { table: dischargeBriefs, col: dischargeBriefs.patientId },
    { table: tardocInvoices, col: tardocInvoices.patientId },
  ] as const;

  const counts = await Promise.all(
    fkTables.map((t) =>
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(t.table)
        .where(eq(t.col, patientId))
        .then((rows) => rows[0]?.count ?? 0)
    )
  );

  const fkCount = counts.reduce((sum, c) => sum + c, 0);

  // Count field completeness on the patient record
  const [patient] = await db
    .select()
    .from(patients)
    .where(
      and(eq(patients.id, patientId), eq(patients.hospitalId, hospitalId))
    );

  if (!patient) return 0;

  const completenessFields = [
    patient.email,
    patient.phone,
    patient.address,
    patient.street,
    patient.postalCode,
    patient.city,
    patient.insuranceProvider,
    patient.insuranceNumber,
    patient.healthInsuranceNumber,
    patient.emergencyContact,
  ];

  const totalFields = completenessFields.length; // 10
  const filledFields = completenessFields.filter(
    (f) => f !== null && f !== undefined && f !== ""
  ).length;

  // Score = log2(fkCount + 1) * 0.7 + (filledFields / totalFields) * 10 * 0.3
  const score =
    Math.log2(fkCount + 1) * 0.7 +
    (filledFields / totalFields) * 10 * 0.3;

  return Math.round(score * 100) / 100;
}
