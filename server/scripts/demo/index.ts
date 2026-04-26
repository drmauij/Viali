/* eslint-disable no-console */
/**
 * beauty2go demo seed — populates a multi-location group so Patrick can
 * explore the chain dashboard end-to-end on a local dev machine.
 *
 * What it creates (with the new modular structure):
 *   - 1 chain group "beauty2go (Demo)" + per-clinic booking tokens
 *   - 8 real beauty2go.ch hospitals + units (skew.ts → locations.ts)
 *   - 19 bookable doctor users + roles (providers.ts)
 *   - 5 chain services + 1 hospital-local service (services.ts)
 *   - 48 patients + 12 cross-location visits w/ signed treatments (patients.ts)
 *   - 1 marketing flow campaign (flows.ts)
 *   - Demo admin promotion (in-line at the bottom of seed())
 *
 * Idempotent. Running twice is safe — `wipeAllDemoGroups` cleans up every
 * previous run (including aborted ones that left duplicates) before we
 * re-create from scratch.
 *
 * Environment knobs:
 *     DEMO_ADMIN_EMAIL  — user to promote (default m.betti80@gmail.com)
 *     FORCE_SEED=1      — required to run against NODE_ENV=production
 *     DRY_RUN=1         — print the plan without touching the DB
 *     WIPE_ONLY=1       — wipe and exit; useful for a clean slate
 *     SEED=<n>          — override the deterministic PRNG seed (Task 4+)
 *
 * Where Patrick goes next:
 *   1. Log in as the demo admin
 *   2. /chain — chain cockpit (top-line KPIs, leaderboard, anomalies)
 *   3. /chain/funnels — referral analytics across the chain
 *   4. /book/g/<token> — public chain booking landing in incognito
 */
import "dotenv/config";
import { db, pool } from "../../db";
import { hospitalGroups, users, userHospitalRoles } from "../../../shared/schema";
import { eq } from "drizzle-orm";

import { GROUP_NAME, isDryRun, maybeExit, LOCATIONS, GROUP_SERVICES, PATIENT_COUNT, CROSS_LOCATION_PATIENT_COUNT } from "./skew";
import { wipeAllDemoGroups } from "./wipe";
import { seedLocationsAndUnits } from "./locations";
import { seedProvidersAndRoles } from "./providers";
import { seedServices } from "./services";
import { seedPatientsAndCrossLocation } from "./patients";
import { seedFlows } from "./flows";
import { seedFunnelData } from "./funnel";
import { seedProviderAvailability } from "./availability";

export type SeedSummary = {
  groupId: string;
  bookingToken: string | null;
  hospitalIds: string[];
  providerCount: number;
  patientCount: number;
  treatmentCount: number;
  funnelStats: {
    referrals: number;
    leads: number;
    appointments: number;
    treatments: number;
  };
  demoAdminPromoted: boolean;
};

export async function seed(): Promise<SeedSummary> {
  if (process.env.NODE_ENV === "production" && process.env.FORCE_SEED !== "1") {
    maybeExit(
      "Refusing to run beauty2go demo seed against NODE_ENV=production without FORCE_SEED=1",
    );
  }

  if (isDryRun()) {
    console.log("[DRY_RUN=1] would wipe every existing group named", GROUP_NAME);
    console.log(
      `[DRY_RUN=1] would create: 1 group, ${LOCATIONS.length} hospitals, ${
        LOCATIONS.length
      } units, ${GROUP_SERVICES.length} group services, 1 hospital-local service, ${
        LOCATIONS.length * 3 + 1
      } user_hospital_roles rows across 19 providers, ${PATIENT_COUNT} patients, ${CROSS_LOCATION_PATIENT_COUNT} cross-location visits, ${
        CROSS_LOCATION_PATIENT_COUNT * 2
      } treatments, 1 marketing campaign`,
    );
    return {
      groupId: "(dry-run)",
      bookingToken: null,
      hospitalIds: [],
      providerCount: 0,
      patientCount: 0,
      treatmentCount: 0,
      funnelStats: { referrals: 0, leads: 0, appointments: 0, treatments: 0 },
      demoAdminPromoted: false,
    };
  }

  console.log("=== beauty2go demo seed ===");
  console.log(
    `This script WIPES and recreates the "${GROUP_NAME}" demo group and its child data.`,
  );
  if (process.env.NODE_ENV !== "test") {
    console.log("Ctrl-C within 3 seconds to abort.");
    await new Promise((r) => setTimeout(r, 3000));
  }

  // 1. Wipe every previous beauty2go demo group + orphan test fixtures.
  console.log("Wiping previous beauty2go demo…");
  await wipeAllDemoGroups();

  if (process.env.WIPE_ONLY === "1") {
    console.log("[WIPE_ONLY=1] wipe complete; skipping seed");
    return {
      groupId: "(wipe-only)",
      bookingToken: null,
      hospitalIds: [],
      providerCount: 0,
      patientCount: 0,
      treatmentCount: 0,
      funnelStats: { referrals: 0, leads: 0, appointments: 0, treatments: 0 },
      demoAdminPromoted: false,
    };
  }

  // 2. Create the chain group + booking token.
  console.log(`Creating group + ${LOCATIONS.length} locations…`);
  const bookingToken = `beauty2go-demo-${Date.now()}`;
  const [group] = await db
    .insert(hospitalGroups)
    .values({ name: GROUP_NAME, bookingToken })
    .returning();

  // 3. Locations + units.
  const locationRows = await seedLocationsAndUnits({ groupId: group.id });

  // 4. Providers + roles.
  const providers = await seedProvidersAndRoles({ locationRows });

  // 5. Services + provider links.
  const services = await seedServices({
    groupId: group.id,
    locationRows,
    providers,
  });

  // 5b. Provider availability — Mon-Fri 09:00-12:00 + 14:00-17:00 so the
  //     /book page actually shows slots when the patient picks a provider.
  await seedProviderAvailability({ locationRows, providers });

  // 6. Patients + cross-location treatments.
  const patientRows = await seedPatientsAndCrossLocation({
    locationRows,
    providers,
    services,
  });

  // 7. Funnel data — referrals + leads + appointments + treatments
  //    spread across current/prior/older windows with per-clinic skew.
  const funnelStats = await seedFunnelData({
    locationRows,
    providers,
    patients: patientRows,
    services,
  });

  // 8. Marketing flow.
  await seedFlows({ locationRows });

  // 9. Demo admin promotion. Preserved from the original monolith.
  console.log(
    `Promoting demo admin to platform admin + group_admin at ${locationRows[0].hospital.name}…`,
  );
  const demoAdminEmail = process.env.DEMO_ADMIN_EMAIL ?? "m.betti80@gmail.com";
  let demoAdminPromoted = false;
  const [admin] = await db
    .select()
    .from(users)
    .where(eq(users.email, demoAdminEmail));
  if (admin) {
    await db
      .update(users)
      .set({ isPlatformAdmin: true } as any)
      .where(eq(users.id, admin.id));
    await db.insert(userHospitalRoles).values({
      userId: admin.id,
      hospitalId: locationRows[0].hospital.id,
      unitId: locationRows[0].unit.id,
      role: "group_admin",
    });
    demoAdminPromoted = true;
    console.log(`  > promoted ${demoAdminEmail}`);
  } else {
    console.warn(
      `  > WARNING: demo admin user ${demoAdminEmail} not found — skipping promotion. Create the account via Google login first, then re-run this seed.`,
    );
  }

  // Cross-location patients each have 2 treatments (one per visit), plus
  // whatever the funnel generator linked to completed appointments.
  const treatmentCount = CROSS_LOCATION_PATIENT_COUNT * 2 + funnelStats.treatments;

  const summary: SeedSummary = {
    groupId: group.id,
    bookingToken: group.bookingToken,
    hospitalIds: locationRows.map((l) => l.hospital.id),
    providerCount: providers.length,
    patientCount: patientRows.length,
    treatmentCount,
    funnelStats,
    demoAdminPromoted,
  };

  console.log("");
  console.log("=== Done ===");
  console.log(`Group           : ${group.name} (${group.id})`);
  console.log(`Booking token   : ${group.bookingToken}`);
  console.log(`Public picker   : /book/g/${group.bookingToken}`);
  console.log(`Locations       : ${summary.hospitalIds.length}`);
  console.log(`Providers       : ${summary.providerCount}`);
  console.log(`Patients        : ${summary.patientCount}`);
  console.log(`Treatments      : ${summary.treatmentCount} (${funnelStats.treatments} from funnel + ${CROSS_LOCATION_PATIENT_COUNT * 2} cross-location)`);
  console.log(`Funnel:`);
  console.log(`  referrals     : ${funnelStats.referrals}`);
  console.log(`  leads         : ${funnelStats.leads}`);
  console.log(`  appointments  : ${funnelStats.appointments}`);
  console.log(
    `Demo admin      : ${summary.demoAdminPromoted ? "promoted" : "NOT promoted (user missing)"}`,
  );

  return summary;
}

// Only auto-run when invoked directly via tsx server/scripts/demo/index.ts.
// When imported from a test, the test controls the invocation + cleanup.
const invokedDirectly =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("/demo/index.ts") ||
    process.argv[1].endsWith("\\demo\\index.ts"));

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
