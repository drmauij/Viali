import { eq, and, isNull } from "drizzle-orm";
import type { Request } from "express";
import { db } from "../db";
import {
  flowExecutions,
  flowEvents,
  flowVariants,
  flows,
  patients,
} from "../../shared/schema";
import { sendSms } from "../sms";
import { getUncachableResendClient } from "../email";
import { appendUnsubscribeFooter } from "./marketingConsent";
import { generateUnsubscribeToken } from "./marketingUnsubscribeToken";
import { generateExecutionToken } from "./marketingExecutionToken";
import logger from "../logger";

export interface RemainderSendResult {
  sentCount: number;
  failedCount: number;
}

/**
 * Sends a chosen winning variant to all hold-out executions
 * (variant_id IS NULL, status = 'pending') of a given flow.
 */
export async function sendRemainderForWinner(
  flow: typeof flows.$inferSelect,
  winnerVariant: typeof flowVariants.$inferSelect,
  req: Request,
): Promise<RemainderSendResult> {
  const pending: Array<{
    id: string;
    patientId: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    surname: string | null;
  }> = await db
    .select({
      id: flowExecutions.id,
      patientId: flowExecutions.patientId,
      email: patients.email,
      phone: patients.phone,
      firstName: patients.firstName,
      surname: patients.surname,
    })
    .from(flowExecutions)
    .innerJoin(patients, eq(patients.id, flowExecutions.patientId))
    .where(
      and(
        eq(flowExecutions.flowId, flow.id),
        isNull(flowExecutions.variantId),
        eq(flowExecutions.status, "pending"),
      ),
    );

  if (pending.length === 0) {
    return { sentCount: 0, failedCount: 0 };
  }

  const baseUrl =
    process.env.PRODUCTION_URL || `${req.protocol}://${req.get("host")}`;

  let sentCount = 0;
  let failedCount = 0;

  for (const exec of pending) {
    try {
      await db
        .update(flowExecutions)
        .set({ variantId: winnerVariant.id })
        .where(eq(flowExecutions.id, exec.id));

      const execToken = generateExecutionToken(exec.id, winnerVariant.id);
      const unsubToken = generateUnsubscribeToken(exec.patientId, flow.hospitalId);

      let message = winnerVariant.messageTemplate;
      message = message.replace(/\{\{vorname\}\}/g, exec.firstName || "");
      message = message.replace(/\{\{nachname\}\}/g, exec.surname || "");
      message = message.replace(
        /\{\{buchungslink\}\}/g,
        `${baseUrl}/book/TOKEN?fe=${execToken}`,
      );

      let success = false;
      if (flow.channel === "sms" && exec.phone) {
        const result = await sendSms(
          exec.phone,
          `${message}\n\nAbmelden: ${baseUrl}/unsubscribe/${unsubToken}`,
          flow.hospitalId,
        );
        success = result.success;
      } else if (
        (flow.channel === "email" || flow.channel === "html_email") &&
        exec.email
      ) {
        const { client, fromEmail } = await getUncachableResendClient();
        const subject = winnerVariant.messageSubject || flow.messageSubject || "Nachricht";
        const baseHtml =
          flow.channel === "html_email"
            ? message
            : `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p style="white-space:pre-wrap;line-height:1.6;">${message}</p></div>`;
        const withFooter = appendUnsubscribeFooter(baseHtml, unsubToken, baseUrl, "de");
        const result = await client.emails.send({
          from: fromEmail,
          to: exec.email,
          subject,
          html: withFooter,
        });
        if (result.data?.id) {
          await db
            .update(flowExecutions)
            .set({ resendEmailId: result.data.id })
            .where(eq(flowExecutions.id, exec.id));
          success = true;
        }
      }

      await db.insert(flowEvents).values({
        executionId: exec.id,
        eventType: success ? "sent" : "bounced",
        metadata: { channel: flow.channel, winnerRemainderSend: true },
      });

      if (success) {
        await db
          .update(flowExecutions)
          .set({ status: "completed", completedAt: new Date() })
          .where(eq(flowExecutions.id, exec.id));
        sentCount++;
      } else {
        await db
          .update(flowExecutions)
          .set({ status: "failed", completedAt: new Date() })
          .where(eq(flowExecutions.id, exec.id));
        failedCount++;
      }
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      logger.error(`[ab remainder] send error for execution ${exec.id}:`, err);
      failedCount++;
    }
  }

  return { sentCount, failedCount };
}
