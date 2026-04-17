import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { patients } from "../../shared/schema";
import { verifyUnsubscribeToken } from "../services/marketingUnsubscribeToken";
import logger from "../logger";

const router = Router();

router.get("/unsubscribe/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const channel = (req.query.channel as string | undefined) ?? "all";

  let patientId: string;
  try {
    ({ patientId } = verifyUnsubscribeToken(token));
  } catch (err) {
    logger.warn("[unsubscribe] invalid token:", (err as Error).message);
    res.status(400).type("html").send(
      renderPage({
        title: "Ungültiger Link",
        body: "Dieser Abmelde-Link ist ungültig oder abgelaufen.",
      }),
    );
    return;
  }

  const patch: Partial<typeof patients.$inferInsert> = {
    marketingUnsubscribedAt: new Date(),
  };
  if (channel === "sms" || channel === "all") patch.smsMarketingConsent = false;
  if (channel === "email" || channel === "all")
    patch.emailMarketingConsent = false;

  try {
    await db.update(patients).set(patch).where(eq(patients.id, patientId));
  } catch (err) {
    logger.error("[unsubscribe] db error:", err);
    res.status(500).type("html").send(
      renderPage({
        title: "Fehler",
        body:
          "Die Abmeldung konnte nicht gespeichert werden. Bitte versuchen Sie es später erneut.",
      }),
    );
    return;
  }

  res.status(200).type("html").send(
    renderPage({
      title: "Abmeldung bestätigt",
      body:
        channel === "sms"
          ? "Sie haben sich erfolgreich vom SMS-Marketing abmelden lassen."
          : channel === "email"
            ? "Sie haben sich erfolgreich vom E-Mail-Marketing abmelden lassen."
            : "Sie haben sich erfolgreich von allen Marketing-Nachrichten abmelden lassen.",
    }),
  );
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage({ title, body }: { title: string; body: string }): string {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body);
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    body { font-family: system-ui, -apple-system, Arial, sans-serif; background:#f5f5f5; margin:0; padding:40px 20px; color:#222; }
    .card { max-width:480px; margin:0 auto; background:#fff; padding:32px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.08); }
    h1 { margin-top:0; font-size:20px; }
    p { line-height:1.5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeBody}</p>
  </div>
</body>
</html>`;
}

export default router;
