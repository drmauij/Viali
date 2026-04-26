/* eslint-disable no-console */
//
// Insert real beauty2go doctor users + their userHospitalRoles rows.
// Plus the rotating role: Zürich's first doctor also books at Winterthur
// (same train line, 25 min apart — realistic Swiss-aesthetic-clinic move).
//
import { db } from "../../db";
import { users, userHospitalRoles } from "../../../shared/schema";
import { LOCATIONS, providerEmailSlug } from "./skew";
import type { Location } from "./locations";

export type ProviderRow = {
  user: typeof users.$inferSelect;
  hospitalIdx: number; // index into LOCATIONS / locationRows
};

export async function seedProvidersAndRoles(args: {
  locationRows: Location[];
}): Promise<ProviderRow[]> {
  const { locationRows } = args;
  const totalDoctors = LOCATIONS.reduce((n, l) => n + l.doctors.length, 0);
  console.log(
    `Seeding ${totalDoctors} providers (real beauty2go doctors) with .local emails + 1 rotating role…`,
  );
  const providers: ProviderRow[] = [];
  for (let i = 0; i < locationRows.length; i++) {
    const loc = locationRows[i];
    for (const doc of LOCATIONS[i].doctors) {
      const titlePrefix = (doc as any).titlePrefix ?? "";
      const displayFirst = titlePrefix
        ? `${titlePrefix} ${doc.firstName}`.trim()
        : doc.firstName;
      const [u] = await db
        .insert(users)
        .values({
          email: `${providerEmailSlug(doc.firstName, doc.lastName)}@beauty2go.local`,
          firstName: displayFirst,
          lastName: doc.lastName,
        })
        .returning();
      await db.insert(userHospitalRoles).values({
        userId: u.id,
        hospitalId: loc.hospital.id,
        unitId: loc.unit.id,
        role: "doctor",
        isBookable: true,
        publicCalendarEnabled: true,
      });
      providers.push({ user: u, hospitalIdx: i });
    }
  }

  // Rotating role: the first Zürich doctor also books at Winterthur.
  const rotator = providers.find((p) => p.hospitalIdx === 0);
  const winterthurIdx = LOCATIONS.findIndex((l) => l.city === "Winterthur");
  if (rotator && winterthurIdx >= 0) {
    await db.insert(userHospitalRoles).values({
      userId: rotator.user.id,
      hospitalId: locationRows[winterthurIdx].hospital.id,
      unitId: locationRows[winterthurIdx].unit.id,
      role: "doctor",
      isBookable: true,
      publicCalendarEnabled: true,
    });
    console.log(
      `  > ${rotator.user.email} also rotates to ${locationRows[winterthurIdx].hospital.name}`,
    );
  }

  return providers;
}
