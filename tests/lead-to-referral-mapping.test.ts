import { describe, it, expect } from "vitest";
import { mapLeadToReferralFields } from "../shared/leadToReferralMapping";
import type { Lead } from "../shared/schema";

// Helper — minimal lead row with required fields
function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    hospitalId: "hosp-1",
    firstName: "A",
    lastName: "B",
    email: null,
    phone: null,
    operation: null,
    message: null,
    source: "website",
    metaLeadId: null,
    metaFormId: null,
    campaignId: null,
    campaignName: null,
    adsetId: null,
    adId: null,
    status: "new",
    patientId: null,
    appointmentId: null,
    closedReason: null,
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmTerm: null,
    utmContent: null,
    gclid: null,
    gbraid: null,
    wbraid: null,
    fbclid: null,
    ttclid: null,
    msclkid: null,
    igshid: null,
    li_fat_id: null,
    twclid: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as Lead;
}

describe("mapLeadToReferralFields", () => {
  it("maps fb source to social + Facebook Lead Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "fb" }));
    expect(result.source).toBe("social");
    expect(result.sourceDetail).toBe("Facebook Lead Form");
    expect(result.captureMethod).toBe("staff");
  });

  it("uses the lead's createdAt as the referral createdAt", () => {
    const leadDate = new Date("2026-03-01T10:00:00Z");
    const result = mapLeadToReferralFields(buildLead({ source: "fb", createdAt: leadDate }));
    expect(result.createdAt).toEqual(leadDate);
  });

  it("maps ig source to social + Instagram Lead Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "ig" }));
    expect(result.source).toBe("social");
    expect(result.sourceDetail).toBe("Instagram Lead Form");
  });

  it("maps website source with gclid to search_engine + Website Contact Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "website", gclid: "GCL123" }));
    expect(result.source).toBe("search_engine");
    expect(result.sourceDetail).toBe("Website Contact Form");
  });

  it("maps website source with msclkid to search_engine + Website Contact Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "website", msclkid: "BING123" }));
    expect(result.source).toBe("search_engine");
    expect(result.sourceDetail).toBe("Website Contact Form");
  });

  it("maps website source without click IDs to other + Website Contact Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "website" }));
    expect(result.source).toBe("other");
    expect(result.sourceDetail).toBe("Website Contact Form");
  });

  it("maps email source to other + Website Contact Form", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "email" }));
    expect(result.source).toBe("other");
    expect(result.sourceDetail).toBe("Website Contact Form");
  });

  it("copies every tracking field through to referral payload", () => {
    const lead = buildLead({
      source: "fb",
      utmSource: "facebook",
      utmMedium: "cpc",
      utmCampaign: "PRK-SRCH-LEADS-GEN-Generic",
      utmTerm: "schönheits op",
      utmContent: "ad-variant-42",
      gclid: "CjwKCAjwhe3O",
      fbclid: "IwAR123",
      msclkid: "mc-1",
      ttclid: "tt-1",
      gbraid: "g-1",
      wbraid: "w-1",
      igshid: "i-1",
      li_fat_id: "li-1",
      twclid: "tw-1",
      metaLeadId: "m-lead-1",
      metaFormId: "m-form-1",
      campaignId: "camp-1",
      campaignName: "Camp One",
      adsetId: "adset-1",
      adId: "ad-1",
    });
    const result = mapLeadToReferralFields(lead);
    expect(result.utmSource).toBe("facebook");
    expect(result.utmMedium).toBe("cpc");
    expect(result.utmCampaign).toBe("PRK-SRCH-LEADS-GEN-Generic");
    expect(result.utmTerm).toBe("schönheits op");
    expect(result.utmContent).toBe("ad-variant-42");
    expect(result.gclid).toBe("CjwKCAjwhe3O");
    expect(result.fbclid).toBe("IwAR123");
    expect(result.msclkid).toBe("mc-1");
    expect(result.ttclid).toBe("tt-1");
    expect(result.gbraid).toBe("g-1");
    expect(result.wbraid).toBe("w-1");
    expect(result.igshid).toBe("i-1");
    expect(result.li_fat_id).toBe("li-1");
    expect(result.twclid).toBe("tw-1");
    expect(result.metaLeadId).toBe("m-lead-1");
    expect(result.metaFormId).toBe("m-form-1");
    expect(result.campaignId).toBe("camp-1");
    expect(result.campaignName).toBe("Camp One");
    expect(result.adsetId).toBe("adset-1");
    expect(result.adId).toBe("ad-1");
  });

  it("converts null tracking fields to undefined (Drizzle-friendly)", () => {
    const result = mapLeadToReferralFields(buildLead({ source: "website" }));
    expect(result.utmSource).toBeUndefined();
    expect(result.gclid).toBeUndefined();
    expect(result.metaLeadId).toBeUndefined();
  });
});
