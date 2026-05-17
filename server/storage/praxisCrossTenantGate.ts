import type { Surgery } from "@shared/schema";

export type GateIntent =
  | { intent: "patch"; payload: Record<string, unknown>; reason: string | null; actorId: string }
  | { intent: "archive"; payload: Record<string, unknown>; reason: string | null; actorId: string }
  | { intent: "delete"; payload: Record<string, unknown>; reason: string | null; actorId: string };

export type GateContext = { hasPendingActionRequest: boolean };

export type GateResult =
  | { kind: "pass" }
  | {
      kind: "auto_file";
      actionType: "cancellation" | "reschedule" | "suspension";
      reason: string;
      proposedDate?: string;     // YYYY-MM-DD
      proposedTimeFrom?: number; // minutes since 00:00
      proposedTimeTo?: number;   // minutes since 00:00
    }
  | { kind: "reject"; status: number; body: { code: string; message: string } };

// Fields a praxis surgeon is allowed to express intent for on a confirmed_external
// row. All other fields → SOURCE_SURGERY_PARTIAL_LOCKDOWN.
export const GATED_FIELDS = [
  "plannedDate",
  "actualEndTime",
  "isSuspended",
  "suspendedReason",
] as const;

function toMinutes(d: Date): number {
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function evaluateCrossTenantGate(
  surgery: Pick<Surgery, "referralStatus" | "plannedDate" | "actualEndTime" | "status">,
  intent: GateIntent,
  ctx: GateContext,
): GateResult {
  // Gate only applies to confirmed_external referrals.
  if (surgery.referralStatus !== "confirmed_external") return { kind: "pass" };

  // Past / in-progress check first — most informative error.
  const now = Date.now();
  const plannedMs = surgery.plannedDate ? new Date(surgery.plannedDate as unknown as string).getTime() : null;
  if (plannedMs !== null && plannedMs < now) {
    return {
      kind: "reject",
      status: 409,
      body: {
        code: "SURGERY_NOT_MUTABLE",
        message: "This surgery's planned date has passed. Contact the destination clinic directly.",
      },
    };
  }
  if (surgery.status === "in-progress" || surgery.status === "completed") {
    return {
      kind: "reject",
      status: 409,
      body: {
        code: "SURGERY_NOT_MUTABLE",
        message: "This surgery is in progress or completed and cannot be changed from the praxis side.",
      },
    };
  }

  // One-pending-request invariant.
  if (ctx.hasPendingActionRequest) {
    return {
      kind: "reject",
      status: 409,
      body: {
        code: "SOURCE_SURGERY_PENDING_REQUEST",
        message: "A previous request is still awaiting destination clinic approval. Wait for that decision before filing another.",
      },
    };
  }

  if (intent.intent === "archive" || intent.intent === "delete") {
    if (!intent.reason || !intent.reason.trim()) {
      return {
        kind: "reject",
        status: 400,
        body: { code: "REASON_REQUIRED", message: "A reason is required to request cancellation." },
      };
    }
    return { kind: "auto_file", actionType: "cancellation", reason: intent.reason.trim() };
  }

  const payload = intent.payload;
  const touched = Object.keys(payload);
  const nonGated = touched.filter((k) => !(GATED_FIELDS as readonly string[]).includes(k));

  // Suspend toggle: isSuspended=true → suspension request.
  if (payload.isSuspended === true) {
    if (!intent.reason || !intent.reason.trim()) {
      return {
        kind: "reject",
        status: 400,
        body: { code: "REASON_REQUIRED", message: "A reason is required to request suspension." },
      };
    }
    return { kind: "auto_file", actionType: "suspension", reason: intent.reason.trim() };
  }
  if (payload.isSuspended === false) {
    return {
      kind: "reject",
      status: 409,
      body: {
        code: "SOURCE_SURGERY_PARTIAL_LOCKDOWN",
        message: "Reactivating a suspended surgery must be done by the destination clinic.",
      },
    };
  }

  // Date / duration mutation → reschedule.
  const touchesDate = payload.plannedDate !== undefined || payload.actualEndTime !== undefined;
  if (touchesDate) {
    if (nonGated.length > 0) {
      return {
        kind: "reject",
        status: 409,
        body: {
          code: "SOURCE_SURGERY_PARTIAL_LOCKDOWN",
          message: `Fields ${nonGated.join(", ")} cannot be changed on a surgery scheduled at the destination clinic.`,
        },
      };
    }
    if (!intent.reason || !intent.reason.trim()) {
      return {
        kind: "reject",
        status: 400,
        body: { code: "REASON_REQUIRED", message: "A reason is required to request a reschedule." },
      };
    }
    const newStart = payload.plannedDate
      ? new Date(payload.plannedDate as string)
      : surgery.plannedDate
        ? new Date(surgery.plannedDate as unknown as string)
        : null;
    const newEnd = payload.actualEndTime
      ? new Date(payload.actualEndTime as string)
      : surgery.actualEndTime
        ? new Date(surgery.actualEndTime as unknown as string)
        : null;
    if (!newStart) {
      return {
        kind: "reject",
        status: 400,
        body: { code: "INVALID_PROPOSED_DATE", message: "Cannot derive proposed date from payload." },
      };
    }
    return {
      kind: "auto_file",
      actionType: "reschedule",
      reason: intent.reason.trim(),
      proposedDate: toIsoDate(newStart),
      proposedTimeFrom: toMinutes(newStart),
      proposedTimeTo: newEnd ? toMinutes(newEnd) : undefined,
    };
  }

  // No gated field touched → reject any non-gated changes.
  if (nonGated.length > 0) {
    return {
      kind: "reject",
      status: 409,
      body: {
        code: "SOURCE_SURGERY_PARTIAL_LOCKDOWN",
        message: `Fields ${nonGated.join(", ")} cannot be changed on a surgery scheduled at the destination clinic.`,
      },
    };
  }

  return { kind: "pass" };
}
