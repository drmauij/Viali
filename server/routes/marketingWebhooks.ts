import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { flowExecutions, flowEvents, patients } from "../../shared/schema";
import { verifySvixSignature } from "../services/svixSignature";
import logger from "../logger";

const router = Router();

// Note: this route requires raw body for signature verification. The caller
// (server/routes/index.ts or the main app setup) must register
// `express.raw({ type: "*/*" })` on this path BEFORE the router runs.
router.post("/api/webhooks/resend", async (req: Request, res: Response) => {
  const svixId = req.header("svix-id");
  const svixTimestamp = req.header("svix-timestamp");
  const svixSignature = req.header("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    res.status(400).send("missing svix headers");
    return;
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

  try {
    verifySvixSignature({ svixId, svixTimestamp, svixSignature, rawBody });
  } catch (err) {
    logger.warn("[resend webhook] signature failure:", (err as Error).message);
    res.status(400).send("invalid signature");
    return;
  }

  let payload: { type?: string; data?: { email_id?: string; [k: string]: any } };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    res.status(400).send("invalid json");
    return;
  }

  const eventType = payload.type;
  const emailId = payload.data?.email_id;

  if (!eventType || !emailId) {
    res.status(200).send("ok");
    return;
  }

  const [execution] = await db
    .select({ id: flowExecutions.id, patientId: flowExecutions.patientId })
    .from(flowExecutions)
    .where(eq(flowExecutions.resendEmailId, emailId))
    .limit(1);

  if (!execution) {
    res.status(200).send("ok");
    return;
  }

  switch (eventType) {
    case "email.sent":
    case "email.delivered":
    case "email.opened":
    case "email.clicked":
    case "email.bounced": {
      const localType = eventType.replace("email.", "");
      await db.insert(flowEvents).values({
        executionId: execution.id,
        eventType: localType,
        metadata: payload.data ?? null,
      });
      break;
    }

    case "email.complained": {
      await db.insert(flowEvents).values({
        executionId: execution.id,
        eventType: "complained",
        metadata: payload.data ?? null,
      });
      await db
        .update(patients)
        .set({
          emailMarketingConsent: false,
          marketingUnsubscribedAt: new Date(),
        })
        .where(eq(patients.id, execution.patientId));
      logger.warn(
        `[resend webhook] complaint flipped emailMarketingConsent=false for patient ${execution.patientId}`,
      );
      break;
    }

    case "email.delivery_delayed":
      break;

    default:
      logger.debug(`[resend webhook] unknown event type: ${eventType}`);
      break;
  }

  res.status(200).send("ok");
});

export default router;
