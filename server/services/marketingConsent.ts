import { isNull, sql, type SQL } from "drizzle-orm";
import { patients } from "../../shared/schema";

/**
 * Returns the Drizzle SQL conditions that must be ANDed into a patient query
 * to respect marketing consent for the given channel. Callers should spread
 * these into their existing `and(...conditions)` list.
 *
 * Channel "sms" requires smsMarketingConsent=true AND not globally unsubscribed.
 * Channels "email" / "html_email" require emailMarketingConsent=true AND not globally unsubscribed.
 */
export function consentConditionsFor(channel: string): SQL[] {
  switch (channel) {
    case "sms":
      return [
        sql`${patients.smsMarketingConsent} = true`,
        isNull(patients.marketingUnsubscribedAt),
      ];
    case "email":
    case "html_email":
      return [
        sql`${patients.emailMarketingConsent} = true`,
        isNull(patients.marketingUnsubscribedAt),
      ];
    default:
      return [];
  }
}

const FOOTER_COPY: Record<string, { intro: string; link: string }> = {
  de: {
    intro:
      "Sie erhalten diese Nachricht, weil Sie Patient:in bei uns sind. Falls Sie keine Marketing-Nachrichten mehr wünschen:",
    link: "Vom Newsletter abmelden",
  },
  en: {
    intro:
      "You are receiving this because you are a patient of our practice. To stop marketing messages:",
    link: "Unsubscribe",
  },
};

export function appendUnsubscribeFooter(
  html: string,
  token: string,
  baseUrl: string,
  locale: string,
): string {
  const copy = FOOTER_COPY[locale] ?? FOOTER_COPY.de;
  const url = `${baseUrl}/unsubscribe/${token}`;
  const footer = `
<hr style="border:none;border-top:1px solid #ccc;margin:24px 0;" />
<p style="font-size:12px;color:#666;font-family:Arial,sans-serif;text-align:center;">
  ${copy.intro}<br />
  <a href="${url}" style="color:#666;">${copy.link}</a>
</p>`;
  return html + footer;
}
