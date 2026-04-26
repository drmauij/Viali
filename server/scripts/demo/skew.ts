/* eslint-disable no-console */
//
// Pure data + helpers for the beauty2go demo seed.
// No DB access, no side effects — safe to import anywhere.
//

export const GROUP_NAME = "beauty2go (Demo)";

// Test fixtures from worktree vitest runs (e.g. chain-funnels-endpoints.test.ts)
// create chain hospitals named like "H1-4f4b070e" / "H-1776952446983".
// They leak into the dev DB when an `afterAll` cleanup aborts.
export const DEMO_FIXTURE_NAME_PATTERN = "^H[0-9]?-";

// Chain GROUP names that the wipe scrubs. Conservative pattern — only
// catches the literal demo group name and obvious test-fixture patterns
// from worktree vitest runs. Crucially does NOT match a bare "beauty2go"
// (that's a plausible real customer name and we must never wipe it):
//   "beauty2go (Demo)"      the seeded demo group
//   svc-g-<hex>             chain-services-tab tests
//   t-group-only-<hex>      chain-services-tab tests
//   t-xor-<hex>             chain-services-tab tests
//   t-link-<hex>            chain-services-tab tests
//   test-group-<hex>        legacy test fixtures
//   G-<hex>  /  OG-<hex>    chain-funnels-endpoints tests
//   H-<hex>                 hospital-fixture-shaped group names
//   Test-<hex>              legacy
//
// Production safety: any group whose name doesn't fit this pattern is
// left strictly alone, even if it has demo-shaped child rows.
export const DEMO_GROUP_NAME_PATTERN =
  "^(svc-g-|t-(group-only-|xor-|link-)|test-group-|G-|OG-|H-|Test-)[0-9a-f-]+$|^beauty2go \\(Demo\\)$";

export const DEMO_BOOKING_TOKEN_PREFIX = "beauty2go-demo-";

// Real beauty2go.ch locations + doctors (scraped 2026-04 from /standort/<city>).
// City name only — no "beauty2go " prefix; the chain branding lives on the
// hospital_groups row instead.
export const LOCATIONS = [
  {
    name: "Zürich",
    address: "Bahnhofstrasse 78, 8001 Zürich",
    phone: "+41 44 440 34 34",
    city: "Zürich",
    postalCode: "8001",
    doctors: [
      { firstName: "Cynthia Jahavée", lastName: "Las" },
      { firstName: "Nik", lastName: "Baev" },
      { firstName: "Veronica", lastName: "Kiriak" },
      { firstName: "Natalia Maria", lastName: "Szczepańska" },
      { firstName: "Martina", lastName: "Götze" },
    ],
  },
  {
    name: "Basel",
    address: "Schifflände 2, 4051 Basel",
    phone: "+41 61 261 66 00",
    city: "Basel",
    postalCode: "4051",
    doctors: [{ firstName: "Jürgen", lastName: "Kalnitski", titlePrefix: "Dr." }],
  },
  {
    name: "Bern",
    address: "Kramgasse 61, 3011 Bern",
    phone: "+41 31 311 77 77",
    city: "Bern",
    postalCode: "3011",
    doctors: [
      { firstName: "Luana", lastName: "Reif" },
      { firstName: "Evgeny", lastName: "Zaimenko-Privalov" },
      { firstName: "Radiya Sri", lastName: "Rajendran" },
      { firstName: "Slavko", lastName: "Corluka" },
      { firstName: "Codrin", lastName: "Ivascu" },
    ],
  },
  {
    name: "Genf",
    address: "Rue de la Confédération 15, 1204 Genf",
    phone: "+41 21 331 51 00",
    city: "Genf",
    postalCode: "1204",
    doctors: [{ firstName: "Natalia", lastName: "Smyla" }],
  },
  {
    name: "Lausanne",
    address: "Rue de Bourg 1, 1003 Lausanne",
    phone: "+41 21 711 21 21",
    city: "Lausanne",
    postalCode: "1003",
    doctors: [
      { firstName: "Marta", lastName: "Manero Ricart" },
      { firstName: "Sophie", lastName: "Richter" },
      { firstName: "Jannick", lastName: "De Tobel" },
    ],
  },
  {
    name: "Luzern",
    address: "Mühlenplatz 4, 6004 Luzern",
    phone: "+41 41 211 11 22",
    city: "Luzern",
    postalCode: "6004",
    doctors: [{ firstName: "Patricia", lastName: "Möhl" }],
  },
  {
    name: "St. Gallen",
    address: "Marktgasse 14, 9000 St. Gallen",
    phone: "+41 71 770 02 02",
    city: "St. Gallen",
    postalCode: "9000",
    doctors: [
      { firstName: "Sara", lastName: "Halil" },
      { firstName: "Serafim", lastName: "Papathanassiou" },
    ],
  },
  {
    name: "Winterthur",
    address: "Stadthausstrasse 39, 8400 Winterthur",
    phone: "+41 52 202 92 92",
    city: "Winterthur",
    postalCode: "8400",
    doctors: [{ firstName: "Alexis", lastName: "Choi" }],
  },
] as const;

// Prices in CHF. Rough Swiss aesthetic-clinic ballpark; not the real prices.
export const GROUP_SERVICES = [
  { name: "Botox Glabella", price: "380", durationMinutes: 30 },
  { name: "Botox Zornesfalte", price: "320", durationMinutes: 30 },
  { name: "Hyaluron Lippen", price: "520", durationMinutes: 45 },
  { name: "Hyaluron Wangen", price: "560", durationMinutes: 45 },
  { name: "Lifting-Beratung", price: "0", durationMinutes: 30 },
] as const;

export const PATIENT_SURNAMES = [
  "Müller",
  "Meier",
  "Schmid",
  "Keller",
  "Weber",
  "Huber",
  "Schneider",
  "Meyer",
  "Steiner",
  "Fischer",
];
export const PATIENT_FIRST_NAMES = [
  "Anna",
  "Sophie",
  "Lisa",
  "Laura",
  "Julia",
  "Maria",
  "Hannah",
  "Lena",
  "Sarah",
  "Emma",
];
export const PATIENT_COUNT = 48;
export const CROSS_LOCATION_PATIENT_COUNT = 12;

export const PROVIDER_EMAIL_PATTERN = "%@beauty2go.local";
export const PATIENT_EMAIL_PATTERN = "%@test.beauty2go";

// Demo storyline — per-location traffic skew. Drives funnel.ts so the
// /chain dashboard tells a story (top performer, big movers, anomalies).
// Volume multipliers: 1.0 = baseline, multiply against BASE_*_PER_30D.
export const LOCATION_SKEW: Record<string, { current: number; prior: number }> = {
  Zürich: { current: 1.5, prior: 1.4 },         // top performer
  Basel: { current: 1.2, prior: 1.1 },          // steady #2
  Luzern: { current: 1.3, prior: 0.8 },         // big +mover
  Bern: { current: 1.0, prior: 1.0 },           // stable middle
  "St. Gallen": { current: 0.9, prior: 1.0 },   // slight decline
  Genf: { current: 0.8, prior: 0.9 },           // slight decline
  Lausanne: { current: 0.5, prior: 0.9 },       // big -mover + anomaly
  Winterthur: { current: 0.4, prior: 0.4 },     // bottom of leaderboard
};

// Source mix on referral_events. Weighted random pick per row. The
// `source` column is the schema enum (social / search_engine / marketing
// / word_of_mouth / etc.); `utmSource` is the actual ad platform name
// the chain Funnels heatmap shows alongside it.
export const SOURCE_WEIGHTS = [
  { source: "social", utmSource: "instagram", utmMedium: "social", weight: 35 },
  { source: "search_engine", utmSource: "google", utmMedium: "cpc", weight: 25 },
  { source: "social", utmSource: "facebook", utmMedium: "paidsocial", weight: 15 },
  { source: "marketing", utmSource: "newsletter", utmMedium: "email", weight: 10 },
  { source: "search_engine", utmSource: "google", utmMedium: "organic", weight: 10 },
  { source: "word_of_mouth", utmSource: "referral", utmMedium: "referral", weight: 5 },
] as const;

// Status mix on appointments tied to referrals. ~70% confirmed/completed,
// ~15% cancelled, ~15% no-show — drives the no-show% anomaly check.
export const APPOINTMENT_STATUS_WEIGHTS = [
  { status: "completed", weight: 50 },
  { status: "confirmed", weight: 20 },
  { status: "cancelled", weight: 15 },
  { status: "no_show", weight: 15 },
] as const;

// Per-clinic baseline volumes for the current 30-day window at skew 1.0.
export const BASE_REFERRALS_PER_30D = 80;
export const BASE_LEADS_PER_30D = 40;
export const APPOINTMENT_RATE = 0.4; // 40% of referrals book an appointment
export const TREATMENT_RATE = 0.5;   // 50% of completed appointments → signed treatment

// Period bounds (ms ago from "now"). Three windows so the dashboard's
// 30d / 60d / 365d ranges all have data and period-over-period deltas
// are non-zero.
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const PERIOD_BOUNDS = {
  current: { from: 0, to: 30 * MS_PER_DAY },
  prior: { from: 30 * MS_PER_DAY, to: 60 * MS_PER_DAY },
  older: { from: 60 * MS_PER_DAY, to: 90 * MS_PER_DAY },
} as const;

/**
 * Normalise a doctor's display name (e.g. "Natalia Maria Szczepańska") into an
 * email-safe slug. Used to build `<firstname>.<lastname>@beauty2go.local`.
 */
export function providerEmailSlug(firstName: string, lastName: string): string {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // strip accents
      .replace(/ß/g, "ss")
      .replace(/[^a-zA-Z]+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
  return `${norm(firstName)}.${norm(lastName)}`;
}

export function maybeExit(message: string): never {
  console.error(message);
  process.exit(1);
}

export function isDryRun(): boolean {
  return process.env.DRY_RUN === "1";
}
