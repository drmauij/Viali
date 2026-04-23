import { db } from "../db";
import { patientHospitals } from "@shared/schema";

/**
 * Idempotently enrol a patient on a hospital's roster (`patient_hospitals`).
 *
 * Called from every "this patient was touched at this hospital" write path
 * (new patient, appointment, treatment, document upload, clinical edit) so
 * that a multi-location group's per-hospital patient list stays in sync with
 * real clinical activity.
 *
 * Safe to call multiple times — the unique constraint on
 * (patient_id, hospital_id) is handled via ON CONFLICT DO NOTHING.
 *
 * Do NOT call this from read paths or bulk admin/migration scripts; use it
 * only for genuine clinical touchpoints.
 */
export async function ensurePatientHospitalLink(
  patientId: string,
  hospitalId: string,
  userId: string | null = null,
): Promise<void> {
  if (!patientId || !hospitalId) return;
  await db
    .insert(patientHospitals)
    .values({ patientId, hospitalId, addedBy: userId })
    .onConflictDoNothing({
      target: [patientHospitals.patientId, patientHospitals.hospitalId],
    });
}
