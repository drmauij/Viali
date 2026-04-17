import { randomUUID } from "crypto";
import logger from "../logger";
import { storage } from "../storage";
import type { PatientQuestionnaireLink } from "@shared/schema";

const POSTOP_BUFFER_DAYS = 14;
const PENDING_LINK_VALIDITY_DAYS = 14;

export interface ResolveLinkArgs {
  hospitalId: string;
  patientId: string;
  surgeryId: string;
  surgeryDate: Date;
  validityDays: number;
}

export interface ResolveLinkResult {
  link: PatientQuestionnaireLink;
  reused: boolean;
  hasValidQuestionnaire: boolean;
}

/**
 * Decides whether the auto-dispatch worker should reuse an existing
 * submitted/reviewed questionnaire link for this patient or create a fresh
 * pending one.
 *
 * If a submitted/reviewed link from this patient at this hospital exists with
 * `submittedAt` newer than `now - validityDays`, that link is reused. Its
 * `expiresAt` is extended to `surgeryDate + 14d` (post-op buffer) when the
 * current expiry is earlier than that target. Otherwise a fresh pending link
 * is created with the current 14-day expiry semantics.
 */
export async function resolveQuestionnaireLinkForDispatch(
  args: ResolveLinkArgs,
): Promise<ResolveLinkResult> {
  const { hospitalId, patientId, surgeryId, surgeryDate, validityDays } = args;

  const existing = await storage.getRecentSubmittedQuestionnaireLink(
    hospitalId,
    patientId,
    validityDays,
  );

  if (existing) {
    const targetExpiry = new Date(
      surgeryDate.getTime() + POSTOP_BUFFER_DAYS * 24 * 60 * 60 * 1000,
    );
    let link = existing;
    if (!existing.expiresAt || existing.expiresAt.getTime() < targetExpiry.getTime()) {
      link = await storage.updateQuestionnaireLink(existing.id, {
        expiresAt: targetExpiry,
      });
      logger.info(
        `[QuestionnaireDispatch] Extended expiresAt of reused link ${existing.id} to ${targetExpiry.toISOString()}`,
      );
    }
    logger.info(
      `[QuestionnaireDispatch] Reusing submitted questionnaire link ${existing.id} (submittedAt=${existing.submittedAt?.toISOString()}) for patient ${patientId}; skipping new pending link`,
    );
    return { link, reused: true, hasValidQuestionnaire: true };
  }

  const expiresAt = new Date(
    Date.now() + PENDING_LINK_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
  );
  const newLink = await storage.createQuestionnaireLink({
    hospitalId,
    patientId,
    surgeryId,
    token: randomUUID(),
    expiresAt,
    status: "pending",
    language: "de",
  });
  return { link: newLink, reused: false, hasValidQuestionnaire: false };
}
