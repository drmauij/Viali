/* eslint-disable no-console */
//
// 5 group-shared services + 1 hospital-local service (Laser CO2 at Zürich)
// + provider links wiring every provider to every group service. Zürich
// providers additionally linked to the laser service.
//
import { db } from "../../db";
import { clinicServices, clinicServiceProviders } from "../../../shared/schema";
import { GROUP_SERVICES } from "./skew";
import type { Location } from "./locations";
import type { ProviderRow } from "./providers";

export type SeededServices = {
  groupServices: Array<typeof clinicServices.$inferSelect>;
  localServices: Array<typeof clinicServices.$inferSelect>;
};

export async function seedServices(args: {
  groupId: string;
  locationRows: Location[];
  providers: ProviderRow[];
}): Promise<SeededServices> {
  const { groupId, locationRows, providers } = args;

  console.log(`Seeding ${GROUP_SERVICES.length} group services…`);
  const groupServices: SeededServices["groupServices"] = [];
  for (const s of GROUP_SERVICES) {
    const [row] = await db
      .insert(clinicServices)
      .values({
        groupId,
        hospitalId: null,
        unitId: null,
        name: s.name,
        price: s.price,
        durationMinutes: s.durationMinutes,
        isInvoiceable: true,
      } as any)
      .returning();
    groupServices.push(row);
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

  return { groupServices, localServices: [laser] };
}
