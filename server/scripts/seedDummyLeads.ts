/* eslint-disable no-console */
/**
 * Dev-only: seed a bunch of dummy leads so the LeadsPanel overflow /
 * scroll behaviour can be visually verified. 50 is the page limit the
 * panel queries, so seeding 60 guarantees the full page scroll.
 *
 * Usage: npm run seed:dummy-leads -- <hospital-id> [count]
 *   count defaults to 60.
 */
import "dotenv/config";
import { db } from "../db";
import { leads, hospitals } from "../../shared/schema";
import { eq } from "drizzle-orm";

const FIRST_NAMES = [
  "Lukas", "Emma", "Noah", "Mia", "Leon", "Sofia", "Finn", "Hannah",
  "Paul", "Emilia", "Felix", "Anna", "Jonas", "Lea", "Ben", "Lara",
  "Tim", "Marie", "Elias", "Nina", "Jan", "Sara", "Noemi", "Urs",
  "Andrea", "Stefan", "Claudia", "Marco", "Julia", "Simon",
];

const LAST_NAMES = [
  "Müller", "Meier", "Schmid", "Keller", "Weber", "Huber", "Steiner",
  "Frei", "Kurz", "Brunner", "Baumgartner", "Fischer", "Schneider",
  "Moser", "Widmer", "Gerber", "Bühler", "Schwarz", "Zürcher", "Eichler",
];

const OPERATIONS = [
  "Mommy Makeover", "Brustvergrösserung", "Lippen Filler", "Botox",
  "Hyaluron Wangen", "Microneedling", "Laser Gesicht", "Liposuktion",
  "Bauchdeckenstraffung", "Oberlidstraffung",
];

const SOURCES = [
  { source: "meta", utmMedium: "paid_social", fbclid: () => `IwAR${randomString(24)}` },
  { source: "google", utmMedium: "cpc", gclid: () => `Cj0KCQjw${randomString(30)}` },
  { source: "instagram", utmMedium: "social", igshid: () => `MzRlODBiNWFlZA${randomString(8)}` },
  { source: "website", utmMedium: "organic" },
  { source: "referral", utmMedium: "referral" },
  { source: "tiktok", utmMedium: "paid_social", ttclid: () => randomString(28) },
];

const OUTCOMES = ["reached", "no_answer", "wants_callback", "will_call_back", "needs_time"];
const STATUSES: Array<"new" | "in_progress" | "converted" | "closed"> = [
  "new", "new", "new", "new",         // ~40% new
  "in_progress", "in_progress", "in_progress",  // ~30% active
  "closed", "closed",                  // ~20% closed
  "converted",                         // ~10% converted
];

function randomString(len: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function randomDigits(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomPhoneSwiss(): string {
  return `+4179${randomDigits(7)}`;
}

async function main() {
  const hospitalId = process.argv[2];
  const countArg = process.argv[3];
  const count = countArg ? parseInt(countArg, 10) : 60;

  if (!hospitalId || Number.isNaN(count) || count <= 0) {
    console.error("Usage: npm run seed:dummy-leads -- <hospital-id> [count]");
    process.exit(1);
  }

  const [hospital] = await db
    .select({ id: hospitals.id, name: hospitals.name })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId))
    .limit(1);

  if (!hospital) {
    console.error(`Hospital ${hospitalId} not found`);
    process.exit(1);
  }

  console.log(`Seeding ${count} dummy leads for hospital "${hospital.name}" (${hospital.id})`);

  const rows = Array.from({ length: count }, (_, i) => {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const sourceDef = pick(SOURCES);
    const operation = pick(OPERATIONS);
    const status = pick(STATUSES);

    // Created somewhere in the last 30 days, spread out so pagination looks realistic
    const hoursAgo = Math.floor(Math.random() * 24 * 30);
    const createdAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    return {
      hospitalId,
      firstName,
      lastName,
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}+dummy${i}@example.test`,
      phone: randomPhoneSwiss(),
      operation,
      message: Math.random() < 0.4
        ? `Interested in ${operation}. Please call back.`
        : null,
      source: sourceDef.source,
      metaLeadId: sourceDef.source === "meta" ? `l_${randomDigits(15)}` : null,
      metaFormId: sourceDef.source === "meta" ? `f_${randomDigits(15)}` : null,
      campaignId: sourceDef.source === "meta" || sourceDef.source === "google"
        ? randomDigits(15)
        : null,
      campaignName: sourceDef.source === "meta"
        ? `AZW - META - Leads - ${operation} - TOF - ${randomDigits(8)}`
        : sourceDef.source === "google"
        ? `PRK-SRCH-LEADS-BRANDED-PRK/AZW`
        : null,
      adsetId: sourceDef.source === "meta" ? randomDigits(15) : null,
      adId: sourceDef.source === "meta" ? randomDigits(15) : null,
      status,
      utmSource: sourceDef.source,
      utmMedium: sourceDef.utmMedium,
      utmCampaign: operation.toLowerCase().replace(/\s+/g, "-"),
      utmTerm: sourceDef.source === "google" ? pick(["privatklinik kreuzlingen", "botox zurich", "brustvergrösserung schweiz"]) : null,
      utmContent: null,
      gclid: sourceDef.source === "google" ? sourceDef.gclid?.() ?? null : null,
      gbraid: null,
      wbraid: null,
      fbclid: sourceDef.source === "meta" ? sourceDef.fbclid?.() ?? null : null,
      ttclid: sourceDef.source === "tiktok" ? sourceDef.ttclid?.() ?? null : null,
      msclkid: null,
      igshid: sourceDef.source === "instagram" ? sourceDef.igshid?.() ?? null : null,
      li_fat_id: null,
      twclid: null,
      createdAt,
      updatedAt: createdAt,
    };
  });

  // Chunk inserts so we don't hit a giant single INSERT
  const chunkSize = 25;
  for (let i = 0; i < rows.length; i += chunkSize) {
    await db.insert(leads).values(rows.slice(i, i + chunkSize));
    console.log(`  inserted ${Math.min(i + chunkSize, rows.length)} / ${rows.length}`);
  }

  console.log(`Done. Open /clinic/appointments and click the Leads button to verify scroll behaviour.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
