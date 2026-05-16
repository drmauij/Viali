import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, surgeries, hospitals, patients } from "@shared/schema";
import { getUncachableResendClient } from "../email";
import { sendSms } from "../sms";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchAlertContext(input: { surgeryId: string; destinationHospitalId: string }) {
  const [surg] = await db.select().from(surgeries).where(eq(surgeries.id, input.surgeryId));
  if (!(surg as any)?.surgeonId) return null;

  const [surgeon] = await db.select().from(users).where(eq(users.id, (surg as any).surgeonId));
  if (!surgeon) return null;

  const [dest] = await db.select().from(hospitals).where(eq(hospitals.id, input.destinationHospitalId));

  let patientName = "patient";
  if ((surg as any).patientId) {
    const [pt] = await db.select().from(patients).where(eq(patients.id, (surg as any).patientId));
    if (pt) {
      patientName = `${pt.firstName} ${(pt as any).surname ?? (pt as any).lastName ?? ""}`.trim();
    }
  }

  return { surg, surgeon, dest, patientName };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget: notify the source surgeon that the destination clinic
 * rescheduled their referred surgery.
 */
export async function dispatchRescheduleAlert(input: {
  surgeryId: string;
  oldDate: Date | null;
  newDate: Date | null;
  reason: string | null;
  destinationHospitalId: string;
}): Promise<void> {
  try {
    const ctx = await fetchAlertContext({
      surgeryId: input.surgeryId,
      destinationHospitalId: input.destinationHospitalId,
    });
    if (!ctx) return;

    const { surgeon, dest, patientName } = ctx;
    const destName = dest?.name ?? "destination clinic";
    const oldStr = input.oldDate?.toLocaleString() ?? "—";
    const newStr = input.newDate?.toLocaleString() ?? "—";
    const subject = `Surgery rescheduled at ${destName} — ${patientName}`;
    const bodyLines = [
      `A surgery you submitted has been rescheduled.`,
      ``,
      `Patient: ${patientName}`,
      `Old date: ${oldStr}`,
      `New date: ${newStr}`,
    ];
    if (input.reason) bodyLines.push(`Reason: ${input.reason}`);
    const body = bodyLines.join("\n");

    if (surgeon.email) {
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        await client.emails.send({
          from: fromEmail,
          to: surgeon.email,
          subject,
          text: body,
        });
      } catch (err) {
        console.error("[reschedule-alert] email failed", err);
      }
    }

    if (surgeon.phone) {
      try {
        await sendSms(
          surgeon.phone,
          `Surgery rescheduled at ${destName}: ${newStr}`,
        );
      } catch (err) {
        console.error("[reschedule-alert] SMS failed", err);
      }
    }
  } catch (err) {
    console.error("[reschedule-alert] dispatch failed", err);
  }
}

/**
 * Fire-and-forget: notify the source surgeon that the destination clinic
 * cancelled a previously-accepted referral.
 */
export async function dispatchCancelAfterAcceptAlert(input: {
  surgeryId: string;
  reason: string | null;
  destinationHospitalId: string;
}): Promise<void> {
  try {
    const ctx = await fetchAlertContext({
      surgeryId: input.surgeryId,
      destinationHospitalId: input.destinationHospitalId,
    });
    if (!ctx) return;

    const { surgeon, dest, patientName } = ctx;
    const destName = dest?.name ?? "destination clinic";
    const subject = `Surgery cancelled at ${destName} — ${patientName}`;
    const bodyLines = [
      `A previously-confirmed surgery has been cancelled.`,
      ``,
      `Patient: ${patientName}`,
    ];
    if (input.reason) bodyLines.push(`Reason: ${input.reason}`);
    const body = bodyLines.join("\n");

    if (surgeon.email) {
      try {
        const { client, fromEmail } = await getUncachableResendClient();
        await client.emails.send({
          from: fromEmail,
          to: surgeon.email,
          subject,
          text: body,
        });
      } catch (err) {
        console.error("[cancel-alert] email failed", err);
      }
    }

    if (surgeon.phone) {
      try {
        await sendSms(
          surgeon.phone,
          `Surgery cancelled at ${destName}`,
        );
      } catch (err) {
        console.error("[cancel-alert] SMS failed", err);
      }
    }
  } catch (err) {
    console.error("[cancel-alert] dispatch failed", err);
  }
}
