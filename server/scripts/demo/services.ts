/* eslint-disable no-console */
//
// One chain-wide bookable service ("Kostenlose Beratung") + 5 documentation-
// only group services + 1 hospital-local laser. Only the bookable service
// is linked to providers via clinic_service_providers — the rest stay
// invisible to /book but selectable in admin treatment forms / treatment_lines.
//
import { db } from "../../db";
import { clinicServices, clinicServiceProviders } from "../../../shared/schema";
import { GROUP_SERVICES, BOOKABLE_GROUP_SERVICE } from "./skew";
import type { Location } from "./locations";
import type { ProviderRow } from "./providers";

export type SeededServices = {
  bookableService: typeof clinicServices.$inferSelect;
  groupServices: Array<typeof clinicServices.$inferSelect>;
  localServices: Array<typeof clinicServices.$inferSelect>;
};

export async function seedServices(args: {
  groupId: string;
  locationRows: Location[];
  providers: ProviderRow[];
}): Promise<SeededServices> {
  const { groupId, locationRows, providers } = args;

  console.log(`Seeding 1 bookable group service ("${BOOKABLE_GROUP_SERVICE.name}") + ${GROUP_SERVICES.length} documentation-only group services…`);

  // 1. The single chain-wide bookable service.
  const [bookableService] = await db
    .insert(clinicServices)
    .values({
      groupId,
      hospitalId: null,
      unitId: null,
      name: BOOKABLE_GROUP_SERVICE.name,
      price: BOOKABLE_GROUP_SERVICE.price,
      durationMinutes: BOOKABLE_GROUP_SERVICE.durationMinutes,
      isInvoiceable: true,
    } as any)
    .returning();

  // 2. Documentation-only group services. NOT linked to providers, so they
  //    don't appear on /book — only in admin treatment forms.
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

  // 3. Hospital-local laser at Zürich. Documentation-only too.
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

  // 4. Provider links — ONLY for the bookable service. Every provider in
  //    the chain gets a link so the consultation can be booked at any
  //    location. The other services intentionally stay unlinked.
  console.log(`Linking every provider to the bookable consultation…`);
  for (const p of providers) {
    await db
      .insert(clinicServiceProviders)
      .values({ serviceId: bookableService.id, providerId: p.user.id });
  }

  return { bookableService, groupServices, localServices: [laser] };
}
