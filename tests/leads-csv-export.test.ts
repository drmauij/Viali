import { describe, it, expect } from "vitest";
import { buildLeadsCsv, type LeadCsvRow, BOM } from "../server/services/leadsCsvExport";

const row = (over: Partial<LeadCsvRow> = {}): LeadCsvRow => ({
  id: "l1",
  firstName: "Maria",
  lastName: "Müller",
  email: "maria@example.com",
  phone: "+41791234567",
  source: "ig",
  status: "new",
  appointmentId: null,
  contactCount: 0,
  lastContactOutcome: null,
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  createdAt: new Date("2026-04-21T09:00:00Z"),
  ...over,
});

describe("buildLeadsCsv", () => {
  it("prepends UTF-8 BOM so Excel recognises encoding", () => {
    const csv = buildLeadsCsv([]);
    expect(csv.startsWith(BOM)).toBe(true);
  });

  it("emits the fixed header row", () => {
    const csv = buildLeadsCsv([]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[0]).toBe(
      "id,first_name,last_name,email,phone,source,status,converted,contact_count,last_contact_outcome,utm_source,utm_medium,utm_campaign,utm_term,utm_content,created_at",
    );
  });

  it("derives converted=yes when status is converted", () => {
    const csv = buildLeadsCsv([row({ status: "converted" })]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[1].split(",")[7]).toBe("yes");
  });

  it("derives converted=yes when appointment_id is present even if status is not converted", () => {
    const csv = buildLeadsCsv([row({ status: "in_progress", appointmentId: "ap1" })]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[1].split(",")[7]).toBe("yes");
  });

  it("derives converted=no when neither signal is present", () => {
    const csv = buildLeadsCsv([row({ status: "new", appointmentId: null })]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[1].split(",")[7]).toBe("no");
  });

  it("quotes and escapes values that contain commas, quotes, or newlines", () => {
    const csv = buildLeadsCsv([row({ lastName: 'He said "hi", then left' })]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[1]).toContain('"He said ""hi"", then left"');
  });

  it("emits empty strings for null optional fields", () => {
    const csv = buildLeadsCsv([row({ email: null, phone: null, utmCampaign: null })]);
    const lines = csv.replace(BOM, "").split("\r\n");
    const cols = lines[1].split(",");
    expect(cols[3]).toBe("");
    expect(cols[4]).toBe("");
    expect(cols[12]).toBe("");
  });

  it("serialises created_at as ISO-8601 UTC", () => {
    const csv = buildLeadsCsv([row()]);
    const lines = csv.replace(BOM, "").split("\r\n");
    expect(lines[1]).toContain("2026-04-21T09:00:00.000Z");
  });
});
