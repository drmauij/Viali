// Resolves the /business dashboard range filter into concrete date bounds.
//
// Accepted formats:
//   "all"             — no upper/lower bound (effectively 1970 → 2999)
//   "YYYY"            — calendar year [Jan 1 YYYY, Jan 1 YYYY+1)
//   "Nd" (legacy)     — last N days up to now (kept for backward-compat with
//                       older callers and tests that still pass "30d"/"365d")
//
// The shape is intentionally generous: both ISO timestamps (for `timestamp`
// columns like `treatments.performed_at`) and plain YYYY-MM-DD strings (for
// `date` columns like `surgeries.payment_date`) are provided so callers don't
// have to slice/format on their own.

export interface RangeBounds {
  startIso: string;            // inclusive lower bound, ISO timestamp
  endIso: string;              // exclusive upper bound, ISO timestamp
  startDate: string;           // inclusive lower bound, YYYY-MM-DD
  endDate: string;             // exclusive upper bound, YYYY-MM-DD
  priorStartIso?: string;      // prior-period lower bound (year mode only)
  priorEndIso?: string;        // prior-period upper bound (year mode only)
  isAll: boolean;
  isYear: boolean;
  year?: number;
}

const FAR_PAST_ISO = "1970-01-01T00:00:00.000Z";
const FAR_PAST_DATE = "1970-01-01";
const FAR_FUTURE_ISO = "2999-12-31T23:59:59.999Z";
const FAR_FUTURE_DATE = "2999-12-31";

export function resolveRange(range: string | undefined | null): RangeBounds {
  const value = (range ?? "").trim();

  if (value === "" || value === "all") {
    return {
      startIso: FAR_PAST_ISO,
      endIso: FAR_FUTURE_ISO,
      startDate: FAR_PAST_DATE,
      endDate: FAR_FUTURE_DATE,
      isAll: true,
      isYear: false,
    };
  }

  if (/^\d{4}$/.test(value)) {
    const year = parseInt(value, 10);
    const startIso = new Date(Date.UTC(year, 0, 1)).toISOString();
    const endIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString();
    const priorStartIso = new Date(Date.UTC(year - 1, 0, 1)).toISOString();
    const priorEndIso = startIso;
    return {
      startIso,
      endIso,
      startDate: `${year}-01-01`,
      endDate: `${year + 1}-01-01`,
      priorStartIso,
      priorEndIso,
      isAll: false,
      isYear: true,
      year,
    };
  }

  const daysMatch = /^(\d+)d$/.exec(value);
  if (daysMatch) {
    const days = parseInt(daysMatch[1], 10) || 30;
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const priorEnd = new Date(start);
    const priorStart = new Date(start);
    priorStart.setDate(priorStart.getDate() - days);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      priorStartIso: priorStart.toISOString(),
      priorEndIso: priorEnd.toISOString(),
      isAll: false,
      isYear: false,
    };
  }

  // Unknown — fall back to all-time.
  return resolveRange("all");
}
