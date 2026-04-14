import type { Lead } from "./schema";

type ReferralSource = "social" | "search_engine" | "llm" | "word_of_mouth" | "belegarzt" | "marketing" | "other";
type CaptureMethod = "manual" | "utm" | "ref" | "staff";

export interface LeadReferralFields {
  source: ReferralSource;
  sourceDetail: string;
  captureMethod: CaptureMethod;
  createdAt: Date;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  fbclid?: string;
  ttclid?: string;
  msclkid?: string;
  igshid?: string;
  li_fat_id?: string;
  twclid?: string;
  metaLeadId?: string;
  metaFormId?: string;
  campaignId?: string;
  campaignName?: string;
  adsetId?: string;
  adId?: string;
}

function nz(v: string | null | undefined): string | undefined {
  return v ? v : undefined;
}

export function mapLeadToReferralFields(lead: Lead): LeadReferralFields {
  const isMetaSource = lead.source === "fb" || lead.source === "ig";

  let source: ReferralSource;
  let sourceDetail: string;
  if (isMetaSource) {
    source = "social";
    sourceDetail = lead.source === "ig" ? "Instagram Lead Form" : "Facebook Lead Form";
  } else if (lead.gclid || lead.msclkid) {
    source = "search_engine";
    sourceDetail = "Website Contact Form";
  } else {
    source = "other";
    sourceDetail = "Website Contact Form";
  }

  return {
    source,
    sourceDetail,
    captureMethod: "staff",
    createdAt: lead.createdAt,
    utmSource: nz(lead.utmSource),
    utmMedium: nz(lead.utmMedium),
    utmCampaign: nz(lead.utmCampaign),
    utmTerm: nz(lead.utmTerm),
    utmContent: nz(lead.utmContent),
    gclid: nz(lead.gclid),
    gbraid: nz(lead.gbraid),
    wbraid: nz(lead.wbraid),
    fbclid: nz(lead.fbclid),
    ttclid: nz(lead.ttclid),
    msclkid: nz(lead.msclkid),
    igshid: nz(lead.igshid),
    li_fat_id: nz(lead.li_fat_id),
    twclid: nz(lead.twclid),
    metaLeadId: nz(lead.metaLeadId),
    metaFormId: nz(lead.metaFormId),
    campaignId: nz(lead.campaignId),
    campaignName: nz(lead.campaignName),
    adsetId: nz(lead.adsetId),
    adId: nz(lead.adId),
  };
}
