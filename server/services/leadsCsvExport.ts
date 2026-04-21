export const BOM = "\uFEFF";

export interface LeadCsvRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  source: string;
  status: string;
  appointmentId: string | null;
  contactCount: number;
  lastContactOutcome: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  createdAt: Date;
}

const HEADER = [
  "id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "source",
  "status",
  "converted",
  "contact_count",
  "last_contact_outcome",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "created_at",
];

function escape(cell: string | number | null | undefined): string {
  if (cell === null || cell === undefined) return "";
  const s = String(cell);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildLeadsCsv(rows: LeadCsvRow[]): string {
  const lines: string[] = [HEADER.join(",")];
  for (const r of rows) {
    const converted = r.status === "converted" || r.appointmentId !== null ? "yes" : "no";
    lines.push(
      [
        escape(r.id),
        escape(r.firstName),
        escape(r.lastName),
        escape(r.email),
        escape(r.phone),
        escape(r.source),
        escape(r.status),
        escape(converted),
        escape(r.contactCount),
        escape(r.lastContactOutcome),
        escape(r.utmSource),
        escape(r.utmMedium),
        escape(r.utmCampaign),
        escape(r.utmTerm),
        escape(r.utmContent),
        escape(r.createdAt.toISOString()),
      ].join(","),
    );
  }
  return BOM + lines.join("\r\n");
}
