/* eslint-disable no-console */
/**
 * beauty2go demo seed — populates a multi-location group so Patrick can
 * explore the feature end-to-end on a local dev machine or demo VPS.
 *
 * What it creates
 *   - 1 `hospital_groups` row: "beauty2go (Demo)" (with generated booking token)
 *   - 8 real beauty2go.ch hospitals: Zürich, Basel, Bern, Genf, Lausanne,
 *     Luzern, St. Gallen, Winterthur (CHF / Europe/Zurich / de)
 *   - 1 `units` row per hospital (type = "clinic", isClinicModule = true)
 *   - 5 group-level `clinic_services` shared across the chain
 *   - 1 hospital-local `clinic_services` row ("Laser CO2 Resurfacing") at Zürich
 *   - 19 bookable providers using real beauty2go doctor names (scraped from
 *     beauty2go.ch/standort/<city>) with .local emails so you can book them
 *     from the /book page. Plus one rotating role so Zürich's first doctor
 *     also books at Winterthur.
 *   - `clinic_service_providers` links wiring every provider to every group
 *     service; Zürich providers additionally linked to the laser service
 *   - 48 demo patients with realistic Swiss surnames, split evenly across
 *     the 8 hospitals as "home"; 12 of them get a second `patient_hospitals`
 *     row to simulate cross-location visits
 *   - A signed treatment + one treatment_line at BOTH locations for every
 *     cross-location patient (so the chart shows unified history)
 *   - 1 marketing `flows` campaign authored by the first location (group
 *     scope lives in request headers at send time, not on the row itself)
 *   - Promotes the demo admin (env `DEMO_ADMIN_EMAIL`, fallback
 *     `m.betti80@gmail.com`) to `is_platform_admin` + `group_admin` at the
 *     first location (Zürich). If the user doesn't exist yet we log a
 *     warning and skip instead of failing the seed.
 *
 * Idempotency
 *   Running this twice is safe. At start we look up the group by name; if
 *   found we cascade-clean every row that references it (services, roster,
 *   treatments, patients, providers, user_hospital_roles, hospitals…) then
 *   re-create from scratch.
 *
 * Running it
 *   $ npm run seed:beauty2go-demo
 *
 *   Environment knobs:
 *     DEMO_ADMIN_EMAIL  — user to promote (default m.betti80@gmail.com)
 *     FORCE_SEED=1      — required to run against NODE_ENV=production
 *     DRY_RUN=1         — print the plan without touching the DB
 *
 * Where Patrick goes next
 *   1. Log in as the demo admin (see DEMO_ADMIN_EMAIL above)
 *   2. Visit `/admin/groups` — see beauty2go (Demo) and its members
 *   3. Visit `/business/group` — group admin overview (after switching to
 *      one of the demo hospitals in the top-bar hospital picker)
 *   4. Visit `/book/g/<bookingToken>` in an incognito window — the public
 *      group booking page with the location picker. The token is logged at
 *      the end of the seed run.
 */
import "dotenv/config";
import { db, pool } from "../db";
import {
  hospitalGroups,
  hospitals,
  units,
  userHospitalRoles,
  users,
  clinicServices,
  clinicServiceProviders,
  patients,
  patientHospitals,
  treatments,
  treatmentLines,
  flows,
  inventorySnapshots,
} from "../../shared/schema";
import { and, eq, inArray, like } from "drizzle-orm";

const GROUP_NAME = "beauty2go (Demo)";

// Real beauty2go locations + doctors scraped from beauty2go.ch
// (https://beauty2go.ch/standort/<slug>/ — 2026-04).
const LOCATIONS = [
  {
    name: "beauty2go Zürich",
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
    name: "beauty2go Basel",
    address: "Schifflände 2, 4051 Basel",
    phone: "+41 61 261 66 00",
    city: "Basel",
    postalCode: "4051",
    doctors: [{ firstName: "Jürgen", lastName: "Kalnitski", titlePrefix: "Dr." }],
  },
  {
    name: "beauty2go Bern",
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
    name: "beauty2go Genf",
    address: "Rue de la Confédération 15, 1204 Genf",
    phone: "+41 21 331 51 00",
    city: "Genf",
    postalCode: "1204",
    doctors: [{ firstName: "Natalia", lastName: "Smyla" }],
  },
  {
    name: "beauty2go Lausanne",
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
    name: "beauty2go Luzern",
    address: "Mühlenplatz 4, 6004 Luzern",
    phone: "+41 41 211 11 22",
    city: "Luzern",
    postalCode: "6004",
    doctors: [{ firstName: "Patricia", lastName: "Möhl" }],
  },
  {
    name: "beauty2go St. Gallen",
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
    name: "beauty2go Winterthur",
    address: "Stadthausstrasse 39, 8400 Winterthur",
    phone: "+41 52 202 92 92",
    city: "Winterthur",
    postalCode: "8400",
    doctors: [{ firstName: "Alexis", lastName: "Choi" }],
  },
] as const;

// Prices in CHF. Rough Swiss aesthetic-clinic ballpark; not the real prices.
const GROUP_SERVICES = [
  { name: "Botox Glabella", price: "380", durationMinutes: 30 },
  { name: "Botox Zornesfalte", price: "320", durationMinutes: 30 },
  { name: "Hyaluron Lippen", price: "520", durationMinutes: 45 },
  { name: "Hyaluron Wangen", price: "560", durationMinutes: 45 },
  { name: "Lifting-Beratung", price: "0", durationMinutes: 30 },
] as const;

const PATIENT_SURNAMES = [
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
const PATIENT_FIRST_NAMES = [
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
const PATIENT_COUNT = 48;
const CROSS_LOCATION_PATIENT_COUNT = 12;

const PROVIDER_EMAIL_PATTERN = "%@beauty2go.local";
const PATIENT_EMAIL_PATTERN = "%@test.beauty2go";

/**
 * Normalise a doctor's display name (e.g. "Natalia Maria Szczepańska") into an
 * email-safe slug. Used to build `<firstname>.<lastname>@beauty2go.local`.
 */
function providerEmailSlug(firstName: string, lastName: string): string {
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

type SeedSummary = {
  groupId: string;
  bookingToken: string | null;
  hospitalIds: string[];
  unitIds: string[];
  groupServiceIds: string[];
  hospitalServiceIds: string[];
  providerUserIds: string[];
  roleIds: string[];
  patientIds: string[];
  crossLocationPatientIds: string[];
  treatmentIds: string[];
  flowIds: string[];
  demoAdminPromoted: boolean;
};

function maybeExit(message: string): never {
  console.error(message);
  process.exit(1);
}

function isDryRun(): boolean {
  return process.env.DRY_RUN === "1";
}

/**
 * Cascade-clean everything that belongs to the demo group so the seed can
 * safely re-run. Ordering matters: child rows before parents, and we avoid
 * relying on FK ON DELETE CASCADE for things like user_hospital_roles
 * (which would otherwise block hospital deletes).
 */
export async function wipeExistingGroup(groupId: string): Promise<void> {
  console.log(`  > found existing group ${groupId}, wiping cascade…`);

  // 1. All hospitals that belong to the group (for targeted per-hospital cleanup).
  const memberHospitals = await db
    .select({ id: hospitals.id })
    .from(hospitals)
    .where(eq(hospitals.groupId, groupId));
  const memberHospitalIds = memberHospitals.map((h) => h.id);

  if (memberHospitalIds.length > 0) {
    // 2. Treatment lines + treatments at member hospitals. MUST come before
    //    deleting clinic_services (treatment_lines.service_id FK) and before
    //    deleting patients (treatments.patient_id FK, no cascade set).
    const treatmentRows = await db
      .select({ id: treatments.id })
      .from(treatments)
      .where(inArray(treatments.hospitalId, memberHospitalIds));
    const treatmentIds = treatmentRows.map((r) => r.id);
    if (treatmentIds.length > 0) {
      await db
        .delete(treatmentLines)
        .where(inArray(treatmentLines.treatmentId, treatmentIds));
      await db
        .delete(treatments)
        .where(inArray(treatments.id, treatmentIds));
    }
  }

  // 3. Group-owned services → drop provider links then services. Now safe
  //    because treatment_lines referring to them are already gone.
  const groupServiceRows = await db
    .select({ id: clinicServices.id })
    .from(clinicServices)
    .where(eq(clinicServices.groupId, groupId));
  const groupServiceIds = groupServiceRows.map((r) => r.id);
  if (groupServiceIds.length > 0) {
    await db
      .delete(clinicServiceProviders)
      .where(inArray(clinicServiceProviders.serviceId, groupServiceIds));
    await db
      .delete(clinicServices)
      .where(inArray(clinicServices.id, groupServiceIds));
  }

  if (memberHospitalIds.length > 0) {
    // 4. Hospital-local services at member hospitals (and their provider links).
    const hospitalServiceRows = await db
      .select({ id: clinicServices.id })
      .from(clinicServices)
      .where(inArray(clinicServices.hospitalId, memberHospitalIds));
    const hospitalServiceIds = hospitalServiceRows.map((r) => r.id);
    if (hospitalServiceIds.length > 0) {
      await db
        .delete(clinicServiceProviders)
        .where(inArray(clinicServiceProviders.serviceId, hospitalServiceIds));
      await db
        .delete(clinicServices)
        .where(inArray(clinicServices.id, hospitalServiceIds));
    }

    // 5. Flows authored by member hospitals.
    await db
      .delete(flows)
      .where(inArray(flows.hospitalId, memberHospitalIds));

    // 6. Patient roster rows at member hospitals.
    await db
      .delete(patientHospitals)
      .where(inArray(patientHospitals.hospitalId, memberHospitalIds));

    // 7. Demo patients whose home hospital is in the group. Scope by email
    //    pattern so we only wipe rows this seed created, never real data.
    await db
      .delete(patients)
      .where(
        and(
          inArray(patients.hospitalId, memberHospitalIds),
          like(patients.email, PATIENT_EMAIL_PATTERN),
        ),
      );

    // 8. user_hospital_roles at member hospitals — both demo providers and
    //    any group_admin rows for real users (the demo admin promotion
    //    will be re-applied below if requested).
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.hospitalId, memberHospitalIds));

    // 9a. Clean up anything that still FK-references the demo units. Most of
    //     the 30+ tables that reference `units` never carry rows for demo
    //     units, but a few pick up data from test runs or manual exploration.
    //     If a future FK blocks the unit delete, add the table here.
    const demoUnitRows = await db
      .select({ id: units.id })
      .from(units)
      .where(inArray(units.hospitalId, memberHospitalIds));
    const demoUnitIds = demoUnitRows.map((u) => u.id);
    if (demoUnitIds.length > 0) {
      await db
        .delete(inventorySnapshots)
        .where(inArray(inventorySnapshots.unitId, demoUnitIds));
    }

    // 9b. Units at member hospitals.
    await db
      .delete(units)
      .where(inArray(units.hospitalId, memberHospitalIds));

    // 10. Detach from group then delete hospitals (demo-only).
    await db
      .update(hospitals)
      .set({ groupId: null })
      .where(inArray(hospitals.id, memberHospitalIds));
    await db
      .delete(hospitals)
      .where(inArray(hospitals.id, memberHospitalIds));
  }

  // 11. Orphan demo provider users (same email pattern as we always create).
  //     First clean up any rows still referencing them. A previous run may
  //     have left rows at hospitals that aren't in the current group
  //     (auto-provisioned admin rows + treatments survive group restructure),
  //     so the hospital-scoped deletes above don't catch them.
  const orphanedProviderRows = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, PROVIDER_EMAIL_PATTERN));
  const orphanedProviderIds = orphanedProviderRows.map((u) => u.id);
  if (orphanedProviderIds.length > 0) {
    // Treatments reference provider_id with no cascade — blast any leftover
    // treatments authored by demo providers at unrelated hospitals.
    await db
      .delete(treatments)
      .where(inArray(treatments.providerId, orphanedProviderIds));
    await db
      .delete(userHospitalRoles)
      .where(inArray(userHospitalRoles.userId, orphanedProviderIds));
  }
  await db.delete(users).where(like(users.email, PROVIDER_EMAIL_PATTERN));

  // 12. Finally, the group itself.
  await db.delete(hospitalGroups).where(eq(hospitalGroups.id, groupId));
}

export async function seed(): Promise<SeedSummary> {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_SEED !== "1") {
    maybeExit(
      "Refusing to run seedBeauty2goDemo against NODE_ENV=production without FORCE_SEED=1",
    );
  }

  const summary: SeedSummary = {
    groupId: "",
    bookingToken: null,
    hospitalIds: [],
    unitIds: [],
    groupServiceIds: [],
    hospitalServiceIds: [],
    providerUserIds: [],
    roleIds: [],
    patientIds: [],
    crossLocationPatientIds: [],
    treatmentIds: [],
    flowIds: [],
    demoAdminPromoted: false,
  };

  if (isDryRun()) {
    console.log("[DRY_RUN=1] would wipe any existing group named", GROUP_NAME);
    console.log(
      `[DRY_RUN=1] would create: 1 group, ${LOCATIONS.length} hospitals, ${
        LOCATIONS.length
      } units, ${GROUP_SERVICES.length} group services, 1 hospital-local service, ${
        LOCATIONS.length * 3 + 1
      } user_hospital_roles rows across 9 providers, ${PATIENT_COUNT} patients, ${CROSS_LOCATION_PATIENT_COUNT} cross-location visits, ${
        CROSS_LOCATION_PATIENT_COUNT * 2
      } treatments, 1 marketing campaign`,
    );
    return summary;
  }

  console.log("=== beauty2go demo seed ===");
  console.log(
    `This script WIPES and recreates the "${GROUP_NAME}" demo group and its child data.`,
  );
  // Skip the 3-second grace window under vitest (NODE_ENV=test) so the test
  // suite doesn't pay 6s of sleep across the two runs.
  if (process.env.NODE_ENV !== "test") {
    console.log("Ctrl-C within 3 seconds to abort.");
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log("Wiping previous beauty2go demo…");
  const [existing] = await db
    .select()
    .from(hospitalGroups)
    .where(eq(hospitalGroups.name, GROUP_NAME));
  if (existing) {
    await wipeExistingGroup(existing.id);
  } else {
    console.log("  > no existing group, skipping wipe");
  }

  console.log(`Creating group + ${LOCATIONS.length} locations…`);
  const bookingToken = `beauty2go-demo-${Date.now()}`;
  const [group] = await db
    .insert(hospitalGroups)
    .values({ name: GROUP_NAME, bookingToken })
    .returning();
  summary.groupId = group.id;
  summary.bookingToken = group.bookingToken;

  type Location = { hospital: typeof hospitals.$inferSelect; unit: typeof units.$inferSelect };
  const locationRows: Location[] = [];
  // Deterministic per-hospital booking tokens so each demo location has a
  // public /book/:hospitalToken URL. Without these, the /book/g/:token group
  // picker (BookGroup.tsx) would filter every hospital out since it links
  // each row via `hospital.bookingToken`.
  const hospitalBookingToken = (idx: number) =>
    `b2g-demo-${idx.toString().padStart(2, "0")}-${Date.now().toString(36)}`;
  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    const [h] = await db
      .insert(hospitals)
      .values({
        name: loc.name,
        address: loc.address,
        companyPhone: loc.phone,
        bookingToken: hospitalBookingToken(i),
        groupId: group.id,
        timezone: "Europe/Zurich",
        currency: "CHF",
        defaultLanguage: "de",
      } as any)
      .returning();
    const [u] = await db
      .insert(units)
      .values({
        hospitalId: h.id,
        name: "Clinic",
        type: "clinic",
        isClinicModule: true,
      })
      .returning();
    locationRows.push({ hospital: h, unit: u });
    summary.hospitalIds.push(h.id);
    summary.unitIds.push(u.id);
  }

  console.log(`Seeding ${GROUP_SERVICES.length} group services…`);
  const groupServices: Array<typeof clinicServices.$inferSelect> = [];
  for (const s of GROUP_SERVICES) {
    const [row] = await db
      .insert(clinicServices)
      .values({
        groupId: group.id,
        hospitalId: null,
        unitId: null,
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        isInvoiceable: true,
      } as any)
      .returning();
    groupServices.push(row);
    summary.groupServiceIds.push(row.id);
  }

  console.log("Seeding 1 hospital-local service (Laser CO2 Resurfacing, Zürich)…");
  const [laser] = await db
    .insert(clinicServices)
    .values({
      hospitalId: locationRows[0].hospital.id,
      unitId: locationRows[0].unit.id,
      groupId: null,
      name: "Laser CO2 Resurfacing",
      price: "850",
      durationMinutes: 60,
      isInvoiceable: true,
    } as any)
    .returning();
  summary.hospitalServiceIds.push(laser.id);

  const totalDoctors = LOCATIONS.reduce((n, l) => n + l.doctors.length, 0);
  console.log(
    `Seeding ${totalDoctors} providers (real beauty2go doctors) with .local emails + 1 rotating role…`,
  );
  const providers: Array<{ user: typeof users.$inferSelect; hospitalIdx: number }> = [];
  for (let i = 0; i < locationRows.length; i++) {
    const loc = locationRows[i];
    for (const doc of LOCATIONS[i].doctors) {
      const titlePrefix = (doc as any).titlePrefix ?? "";
      const displayFirst = titlePrefix ? `${titlePrefix} ${doc.firstName}`.trim() : doc.firstName;
      const [u] = await db
        .insert(users)
        .values({
          email: `${providerEmailSlug(doc.firstName, doc.lastName)}@beauty2go.local`,
          firstName: displayFirst,
          lastName: doc.lastName,
        })
        .returning();
      const [role] = await db
        .insert(userHospitalRoles)
        .values({
          userId: u.id,
          hospitalId: loc.hospital.id,
          unitId: loc.unit.id,
          role: "doctor",
          isBookable: true,
          publicCalendarEnabled: true,
        })
        .returning();
      providers.push({ user: u, hospitalIdx: i });
      summary.providerUserIds.push(u.id);
      summary.roleIds.push(role.id);
    }
  }

  // Demo a doctor rotating between locations: the first Zürich doctor also
  // books at Winterthur (same train line, 25 min apart — realistic rotation).
  const rotator = providers.find((p) => p.hospitalIdx === 0)!;
  const winterthurIdx = LOCATIONS.findIndex((l) => l.city === "Winterthur");
  if (winterthurIdx >= 0) {
    const [rotatorRole] = await db
      .insert(userHospitalRoles)
      .values({
        userId: rotator.user.id,
        hospitalId: locationRows[winterthurIdx].hospital.id,
        unitId: locationRows[winterthurIdx].unit.id,
        role: "doctor",
        isBookable: true,
        publicCalendarEnabled: true,
      })
      .returning();
    summary.roleIds.push(rotatorRole.id);
    console.log(
      `  > ${rotator.user.email} also rotates to ${locationRows[winterthurIdx].hospital.name}`,
    );
  }

  console.log("Linking every provider to every group service…");
  for (const p of providers) {
    for (const s of groupServices) {
      await db
        .insert(clinicServiceProviders)
        .values({ serviceId: s.id, providerId: p.user.id });
    }
  }
  // Laser is Zürich-only.
  for (const p of providers.filter((x) => x.hospitalIdx === 0)) {
    await db
      .insert(clinicServiceProviders)
      .values({ serviceId: laser.id, providerId: p.user.id });
  }

  console.log(
    `Seeding ${PATIENT_COUNT} patients (split across ${LOCATIONS.length} hospitals)…`,
  );
  const patientRows: Array<{ patient: typeof patients.$inferSelect; homeIdx: number }> = [];
  for (let i = 0; i < PATIENT_COUNT; i++) {
    const hIdx = i % locationRows.length;
    const home = locationRows[hIdx];
    const locInfo = LOCATIONS[hIdx];
    const surname = PATIENT_SURNAMES[i % PATIENT_SURNAMES.length];
    const firstName = PATIENT_FIRST_NAMES[i % PATIENT_FIRST_NAMES.length];
    // Deterministic, plausible birthday.
    const yy = 80 + (i % 20);
    const mm = String(1 + (i % 12)).padStart(2, "0");
    const dd = String(1 + (i % 28)).padStart(2, "0");
    // Swiss mobile prefix: +41 79 xxx xx xx (Salt). Deterministic per patient.
    const phoneDigits = (7000000 + i).toString(); // 7 digits
    const [p] = await db
      .insert(patients)
      .values({
        hospitalId: home.hospital.id,
        patientNumber: `P-DEMO-${i.toString().padStart(4, "0")}`,
        surname: `${surname}${i > 5 ? i : ""}`,
        firstName,
        birthday: `19${yy}-${mm}-${dd}`,
        sex: "F",
        phone: `+4179${phoneDigits}`,
        email: `patient${i}@test.beauty2go`,
        street: `Demostrasse ${1 + (i % 99)}`,
        postalCode: locInfo.postalCode,
        city: locInfo.city,
      } as any)
      .returning();
    await db
      .insert(patientHospitals)
      .values({ patientId: p.id, hospitalId: home.hospital.id });
    patientRows.push({ patient: p, homeIdx: hIdx });
    summary.patientIds.push(p.id);
  }

  console.log(
    `Seeding ${CROSS_LOCATION_PATIENT_COUNT} cross-location visits + treatments at each end…`,
  );
  const now = Date.now();
  for (let i = 0; i < CROSS_LOCATION_PATIENT_COUNT; i++) {
    const pr = patientRows[i];
    const secondIdx = (pr.homeIdx + 1) % locationRows.length;
    await db
      .insert(patientHospitals)
      .values({
        patientId: pr.patient.id,
        hospitalId: locationRows[secondIdx].hospital.id,
      });
    summary.crossLocationPatientIds.push(pr.patient.id);

    // Treatment at home location (90 days ago).
    const homeProvider = providers.find((p) => p.hospitalIdx === pr.homeIdx)!;
    const [t1] = await db
      .insert(treatments)
      .values({
        hospitalId: locationRows[pr.homeIdx].hospital.id,
        unitId: locationRows[pr.homeIdx].unit.id,
        patientId: pr.patient.id,
        providerId: homeProvider.user.id,
        performedAt: new Date(now - 1000 * 60 * 60 * 24 * 90),
        status: "signed",
      })
      .returning();
    summary.treatmentIds.push(t1.id);
    await db.insert(treatmentLines).values({
      treatmentId: t1.id,
      serviceId: groupServices[0].id, // Botox Glabella
      dose: "20",
      doseUnit: "U",
      zones: ["glabella"],
      unitPrice: GROUP_SERVICES[0].price, // matches Botox Glabella
      total: GROUP_SERVICES[0].price,
    });

    // Treatment at second location (30 days ago).
    const secondProvider = providers.find((p) => p.hospitalIdx === secondIdx)!;
    const [t2] = await db
      .insert(treatments)
      .values({
        hospitalId: locationRows[secondIdx].hospital.id,
        unitId: locationRows[secondIdx].unit.id,
        patientId: pr.patient.id,
        providerId: secondProvider.user.id,
        performedAt: new Date(now - 1000 * 60 * 60 * 24 * 30),
        status: "signed",
      })
      .returning();
    summary.treatmentIds.push(t2.id);
    await db.insert(treatmentLines).values({
      treatmentId: t2.id,
      serviceId: groupServices[2].id, // Hyaluron Lippen
      dose: "1.0",
      doseUnit: "ml",
      zones: ["lips"],
      unitPrice: GROUP_SERVICES[2].price, // matches Hyaluron Lippen
      total: GROUP_SERVICES[2].price,
    });
  }

  console.log(`Seeding 1 marketing campaign (authored by ${locationRows[0].hospital.name})…`);
  const [flow] = await db
    .insert(flows)
    .values({
      hospitalId: locationRows[0].hospital.id,
      name: "Demo: Spring Chain Campaign",
      status: "draft",
      triggerType: "manual",
      channel: "email",
      messageSubject: "Frühlings-Angebot bei beauty2go",
      messageTemplate:
        "Liebe {{firstName}}, 20% Rabatt auf Botox & Hyaluron an allen beauty2go-Standorten. Jetzt buchen!",
    } as any)
    .returning();
  summary.flowIds.push(flow.id);

  console.log(
    `Promoting demo admin to platform admin + group_admin at ${locationRows[0].hospital.name}…`,
  );
  const demoAdminEmail =
    process.env.DEMO_ADMIN_EMAIL ?? "m.betti80@gmail.com";
  const [mau] = await db
    .select()
    .from(users)
    .where(eq(users.email, demoAdminEmail));
  if (mau) {
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, mau.id));
    await db.insert(userHospitalRoles).values({
      userId: mau.id,
      hospitalId: locationRows[0].hospital.id,
      unitId: locationRows[0].unit.id,
      role: "group_admin",
    });
    summary.demoAdminPromoted = true;
    console.log(`  > promoted ${demoAdminEmail}`);
  } else {
    console.warn(
      `  > WARNING: demo admin user ${demoAdminEmail} not found — skipping promotion. Create the account via Google login first, then re-run this seed to attach the group_admin role.`,
    );
  }

  console.log("");
  console.log("=== Done ===");
  console.log(`Group           : ${group.name} (${group.id})`);
  console.log(`Booking token   : ${group.bookingToken}`);
  console.log(`Public picker   : /book/g/${group.bookingToken}`);
  console.log(`Locations       : ${summary.hospitalIds.length}`);
  console.log(`Group services  : ${summary.groupServiceIds.length}`);
  console.log(`Local services  : ${summary.hospitalServiceIds.length}`);
  console.log(`Providers       : ${summary.providerUserIds.length}`);
  console.log(`Patients        : ${summary.patientIds.length}`);
  console.log(`  cross-location: ${summary.crossLocationPatientIds.length}`);
  console.log(`Treatments      : ${summary.treatmentIds.length}`);
  console.log(`Flows           : ${summary.flowIds.length}`);
  console.log(`Demo admin      : ${summary.demoAdminPromoted ? "promoted" : "NOT promoted (user missing)"}`);

  return summary;
}

// Only auto-run when invoked directly via `tsx server/scripts/seedBeauty2goDemo.ts`.
// When imported from a test, the test controls the invocation + cleanup.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("seedBeauty2goDemo.ts");

if (invokedDirectly) {
  seed()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error(err);
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
      process.exit(1);
    });
}
