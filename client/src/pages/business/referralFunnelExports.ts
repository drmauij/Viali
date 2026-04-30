// ── Types ──────────────────────────────────────────────────────────────────

export type FunnelRow = {
  referral_id: string;
  source: string;
  source_detail: string | null;
  referral_date: string;
  patient_id: string;
  capture_method: string;
  has_click_id: boolean;
  // True when a row in the `leads` table is linked to this appointment —
  // i.e. the referral came in via the lead webhook (Meta Lead Form, website
  // contact form) and required a staff callback before booking.
  from_lead: boolean;
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
  fbclid: string | null;
  igshid: string | null;
  meta_lead_id: string | null;
  meta_form_id: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  // Unified campaign label: COALESCE(campaign_name, utm_campaign) computed server-side
  campaign: string | null;
  campaign_id: string | null;
  campaign_name: string | null;
  appointment_id: string | null;
  appointment_status: string | null;
  provider_id: string | null;
  appointment_date: string | null;
  provider_first_name: string | null;
  provider_last_name: string | null;
  surgery_id: string | null;
  surgery_status: string | null;
  payment_status: string | null;
  price: string | null;
  payment_date: string | null;
  surgery_planned_date: string | null;
  surgeon_id: string | null;
  // Treatment outcome (parallel to surgery). A row with treatment_id set
  // means the referral's appointment converted into a signed treatment.
  treatment_id: string | null;
  treatment_status: string | null;          // always "signed" when present (SQL filter)
  treatment_performed_at: string | null;
  treatment_total: string | null;           // numeric as string — sum of treatment_lines.total
};

export type ConversionLevel = "kept" | "surgery_planned" | "paid";

// ── Constants ──────────────────────────────────────────────────────────────

export const KEPT_STATUSES = ["arrived", "in_progress", "completed"];

// ── Helpers ────────────────────────────────────────────────────────────────

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Export functions ───────────────────────────────────────────────────────

export function exportAnonymizedCsv(
  rows: FunnelRow[],
  classifyFunnel: (r: FunnelRow) => string,
) {
  const header = [
    "referral_date", "funnel", "source", "source_detail", "capture_method",
    "from_lead",
    "appointment_status", "appointment_date", "provider_name",
    "surgery_status", "payment_status", "price_chf", "payment_date",
    "treatment_status", "treatment_total_chf", "treatment_performed_at",
    "days_to_conversion",
  ].join(",");

  const csvRows = rows.map((r) => {
    // Days from referral to the conversion timestamp (paid or treatment signed)
    const conversionTs = r.payment_date ?? r.treatment_performed_at;
    const daysToConversion =
      conversionTs && r.referral_date
        ? Math.round(
            (new Date(conversionTs).getTime() -
              new Date(r.referral_date).getTime()) /
              (1000 * 60 * 60 * 24),
          )
        : "";
    const providerName = r.provider_first_name
      ? `${r.provider_first_name} ${r.provider_last_name ?? ""}`.trim()
      : "";
    return [
      r.referral_date?.slice(0, 10) ?? "",
      classifyFunnel(r),
      r.source,
      r.source_detail ?? "",
      r.capture_method,
      r.from_lead ? "yes" : "no",
      r.appointment_status ?? "",
      r.appointment_date ?? "",
      providerName,
      r.surgery_status ?? "",
      r.payment_status ?? "",
      r.price ?? "",
      r.payment_date ?? "",
      r.treatment_status ?? "",
      r.treatment_total ?? "",
      r.treatment_performed_at ?? "",
      daysToConversion,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  downloadCsv(
    [header, ...csvRows].join("\n"),
    `referral-funnel-export-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function exportAdPerformanceCsv(
  adPerformance: any[],
  rows: FunnelRow[],
  from: string,
  to: string,
  classifyFunnel: (r: FunnelRow) => string,
) {
  const funnelLabels: Record<string, string> = {
    google_ads: "Google Ads",
    meta_ads: "Meta Ads",
    meta_forms: "Meta Forms",
  };

  // Restrict the budget-side data to months whose first day falls within
  // the user's selected [from, to] period — the detail rows below are
  // already filtered, so we keep both halves of the report aligned.
  const fromMonth = from.slice(0, 7);
  const toMonth = to.slice(0, 7);
  const monthsInRange = adPerformance.filter(
    (m: any) => m.month >= fromMonth && m.month <= toMonth,
  );

  // Section 1: Period summary — one row per funnel, aggregated across all
  // in-range months. Also appends a TOTAL row across funnels.
  type Agg = { budget: number; referrals: number; kept: number; paid: number; revenue: number };
  const summary: Record<string, Agg> = {};
  for (const month of monthsInRange) {
    for (const f of month.funnels ?? []) {
      const a = (summary[f.funnel] ??= { budget: 0, referrals: 0, kept: 0, paid: 0, revenue: 0 });
      a.budget += Number(f.budget) || 0;
      a.referrals += Number(f.leads) || 0;
      a.kept += Number(f.appointmentsKept) || 0;
      a.paid += Number(f.paidConversions) || 0;
      a.revenue += Number(f.revenue) || 0;
    }
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  const cpr = (a: Agg) => (a.referrals > 0 ? Math.round(a.budget / a.referrals) : "");
  const cpk = (a: Agg) => (a.kept > 0 ? Math.round(a.budget / a.kept) : "");
  const cpa = (a: Agg) => (a.paid > 0 ? Math.round(a.budget / a.paid) : "");
  const roi = (a: Agg) =>
    a.budget > 0 && a.paid > 0 ? round2((a.revenue - a.budget) / a.budget) : "";

  const summaryHeader =
    "funnel,budget_chf,referrals,cpr_chf,appointments_kept,cost_per_kept_chf,paid_conversions,cpa_chf,revenue_chf,roi";

  const summaryRows = Object.entries(summary)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([funnel, a]) =>
      [
        funnelLabels[funnel] || funnel,
        a.budget,
        a.referrals,
        cpr(a),
        a.kept,
        cpk(a),
        a.paid,
        cpa(a),
        a.revenue,
        roi(a),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );

  const totalAgg: Agg = Object.values(summary).reduce(
    (acc, a) => ({
      budget: acc.budget + a.budget,
      referrals: acc.referrals + a.referrals,
      kept: acc.kept + a.kept,
      paid: acc.paid + a.paid,
      revenue: acc.revenue + a.revenue,
    }),
    { budget: 0, referrals: 0, kept: 0, paid: 0, revenue: 0 },
  );
  const totalRow = [
    "TOTAL",
    totalAgg.budget,
    totalAgg.referrals,
    cpr(totalAgg),
    totalAgg.kept,
    cpk(totalAgg),
    totalAgg.paid,
    cpa(totalAgg),
    totalAgg.revenue,
    roi(totalAgg),
  ]
    .map((v) => `"${String(v).replace(/"/g, '""')}"`)
    .join(",");

  // Section 2: Per-month × funnel breakdown — same metric set as the summary,
  // so trend comparisons are possible without re-aggregating from detail.
  const monthlyHeader =
    "month,funnel,budget_chf,referrals,cpr_chf,appointments_kept,cost_per_kept_chf,paid_conversions,cpa_chf,revenue_chf,roi";
  const monthlyRows: string[] = [];
  for (const m of monthsInRange) {
    for (const f of m.funnels ?? []) {
      const a: Agg = {
        budget: Number(f.budget) || 0,
        referrals: Number(f.leads) || 0,
        kept: Number(f.appointmentsKept) || 0,
        paid: Number(f.paidConversions) || 0,
        revenue: Number(f.revenue) || 0,
      };
      monthlyRows.push(
        [
          m.month,
          funnelLabels[f.funnel] || f.funnel,
          a.budget,
          a.referrals,
          cpr(a),
          a.kept,
          cpk(a),
          a.paid,
          cpa(a),
          a.revenue,
          roi(a),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      );
    }
  }

  // Section 3: Raw referral-level data with funnel classification
  const detailHeader = "referral_date,funnel,source,source_detail,capture_method,has_click_id,from_lead,appointment_status,appointment_date,provider,surgery_status,payment_status,price_chf,payment_date,days_to_conversion";
  const detailRows = rows.map((r) => {
    const funnel = classifyFunnel(r);
    const daysToConversion = r.payment_date && r.referral_date
      ? Math.round((new Date(r.payment_date).getTime() - new Date(r.referral_date).getTime()) / (1000 * 60 * 60 * 24))
      : "";
    const provider = r.provider_first_name
      ? `${r.provider_first_name} ${r.provider_last_name ?? ""}`.trim()
      : "";
    return [
      r.referral_date?.slice(0, 10) ?? "",
      funnel,
      r.source,
      r.source_detail ?? "",
      r.capture_method,
      r.has_click_id ? "yes" : "no",
      r.from_lead ? "yes" : "no",
      r.appointment_status ?? "",
      r.appointment_date ?? "",
      provider,
      r.surgery_status ?? "",
      r.payment_status ?? "",
      r.price ?? "",
      r.payment_date ?? "",
      daysToConversion,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  const csv = [
    `"Ad Performance Report — ${from} to ${to}"`,
    "",
    "--- SUMMARY (period totals per funnel) ---",
    summaryHeader,
    ...summaryRows,
    totalRow,
    "",
    "--- MONTHLY (per month per funnel) ---",
    monthlyHeader,
    ...monthlyRows,
    "",
    "--- DETAIL (per referral) ---",
    detailHeader,
    ...detailRows,
  ].join("\n");

  downloadCsv(csv, `ad-performance-${from}-to-${to}.csv`);
}

export function matchesConversionLevel(r: FunnelRow, level: ConversionLevel): boolean {
  switch (level) {
    case "kept":
      return KEPT_STATUSES.includes(r.appointment_status || "");
    case "surgery_planned":
      // "Converted" — surgery planned OR treatment signed
      return !!r.surgery_id || !!r.treatment_id;
    case "paid":
      // Surgery paid OR treatment signed (treatment signed = paid by design)
      return !!r.payment_date || r.treatment_status === "signed";
  }
}

export function getConversionTimestamp(r: FunnelRow, level: ConversionLevel): string | null {
  switch (level) {
    case "kept":
      return r.appointment_date;
    case "surgery_planned":
      return r.surgery_planned_date ?? r.treatment_performed_at;
    case "paid":
      return r.payment_date ?? r.treatment_performed_at;
  }
}

export function getConversionValue(r: FunnelRow): string {
  // Prefer surgery price (when present), fall back to treatment total.
  // A row will have only one set in practice; no double-counting.
  if (r.price) return r.price;
  if (r.treatment_total) return r.treatment_total;
  return "";
}

export function exportGoogleAdsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const conversionName = level === "kept" ? "Appointment Kept" : level === "surgery_planned" ? "Converted" : "Paid";
  const filtered = rows.filter((r) => (r.gclid || r.gbraid || r.wbraid) && matchesConversionLevel(r, level));

  const header = "Google Click ID,Click Type,Conversion Name,Conversion Time,Conversion Value,Conversion Currency";
  const csvRows = filtered.map((r) => {
    const clickId = r.gclid || r.gbraid || r.wbraid || "";
    const clickType = r.gclid ? "GCLID" : r.gbraid ? "GBRAID" : "WBRAID";
    const ts = getConversionTimestamp(r, level) || "";
    return [clickId, clickType, conversionName, ts, getConversionValue(r), currency]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  downloadCsv([header, ...csvRows].join("\n"), `google-ads-conversions-${from}-to-${to}.csv`);
}

export function exportMetaAdsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const eventName = level === "kept" ? "Lead" : level === "surgery_planned" ? "Converted" : "Purchase";
  const filtered = rows.filter((r) => (r.fbclid || r.igshid) && matchesConversionLevel(r, level));

  const header = "event_name,event_time,fbc,value,currency,action_source";
  const csvRows = filtered.map((r) => {
    const ts = getConversionTimestamp(r, level);
    const unixTime = ts ? Math.floor(new Date(ts).getTime() / 1000) : "";
    const fbc = r.fbclid
      ? `fb.1.${Math.floor(new Date(r.referral_date).getTime() / 1000)}.${r.fbclid}`
      : r.igshid || "";
    return [eventName, unixTime, fbc, getConversionValue(r), currency, "website"]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  downloadCsv([header, ...csvRows].join("\n"), `meta-ads-conversions-${from}-to-${to}.csv`);
}

export function exportMetaFormsCsv(rows: FunnelRow[], level: ConversionLevel, currency: string, from: string, to: string) {
  const eventName = level === "kept" ? "lead_attended" : level === "surgery_planned" ? "lead_converted" : "lead_paid";
  const filtered = rows.filter((r) => r.meta_lead_id && matchesConversionLevel(r, level));

  const header = "lead_id,event_name,event_time,lead_value,currency";
  const csvRows = filtered.map((r) => {
    const ts = getConversionTimestamp(r, level);
    const unixTime = ts ? Math.floor(new Date(ts).getTime() / 1000) : "";
    return [r.meta_lead_id || "", eventName, unixTime, getConversionValue(r), currency]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });

  downloadCsv([header, ...csvRows].join("\n"), `meta-forms-conversions-${from}-to-${to}.csv`);
}

export function countPlatformConversions(rows: FunnelRow[], level: ConversionLevel) {
  const matching = rows.filter((r) => matchesConversionLevel(r, level));
  return {
    google: matching.filter((r) => r.gclid || r.gbraid || r.wbraid).length,
    meta: matching.filter((r) => r.fbclid || r.igshid).length,
    metaForms: matching.filter((r) => r.meta_lead_id).length,
  };
}
