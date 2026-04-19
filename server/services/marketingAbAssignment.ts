import { createHash } from "node:crypto";
import type { Flow, FlowVariant } from "../../shared/schema";

export interface AssignmentResult {
  variant: FlowVariant | null;
  sendNow: boolean;
}

export function assignVariant(
  patientId: string,
  flow: Pick<Flow, "id" | "abTestEnabled" | "abHoldoutPctPerArm">,
  variants: FlowVariant[],
): AssignmentResult {
  if (!flow.abTestEnabled || variants.length === 0) {
    return { variant: variants[0] ?? null, sendNow: true };
  }

  const hash = createHash("sha256")
    .update(`${patientId}.${flow.id}`)
    .digest("hex")
    .slice(0, 8);
  const bucket = parseInt(hash, 16) % 100;

  const armPct = flow.abHoldoutPctPerArm ?? 10;
  const arms = variants.length;
  const initialSendPct = armPct * arms;

  if (bucket < initialSendPct) {
    const idx = Math.floor(bucket / armPct);
    return { variant: variants[idx], sendNow: true };
  }
  return { variant: null, sendNow: false };
}
