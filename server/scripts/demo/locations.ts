/* eslint-disable no-console */
//
// Insert one hospitals row per LOCATIONS entry plus a default `Clinic`
// unit per hospital. Returns the rows so downstream modules (services,
// providers, patients, …) can wire IDs without re-querying.
//
import { db } from "../../db";
import { hospitals, units } from "../../../shared/schema";
import { LOCATIONS } from "./skew";

export type Location = {
  hospital: typeof hospitals.$inferSelect;
  unit: typeof units.$inferSelect;
};

export async function seedLocationsAndUnits(args: {
  groupId: string;
}): Promise<Location[]> {
  console.log(`Creating ${LOCATIONS.length} locations + units…`);
  const out: Location[] = [];
  // Deterministic per-hospital booking tokens so each demo location has a
  // public /book/:hospitalToken URL. Without these, the /book/g/:token
  // group picker (BookGroup.tsx) filters every hospital out since it links
  // each row via `hospital.bookingToken`.
  const hospitalBookingToken = (idx: number) =>
    `b2g-demo-${idx.toString().padStart(2, "0")}-${Date.now().toString(36)}`;

  for (let i = 0; i < LOCATIONS.length; i++) {
    const loc = LOCATIONS[i];
    // Derive companyStreet from the full address by stripping the trailing
    // ", <postal> <city>" segment. The /book page reads company* fields
    // (not the legacy `address` text) for its Standort card.
    const companyStreet = loc.address.split(",")[0]?.trim() ?? loc.address;
    const [h] = await db
      .insert(hospitals)
      .values({
        name: loc.name,
        address: loc.address,
        companyPhone: loc.phone,
        companyStreet,
        companyPostalCode: loc.postalCode,
        companyCity: loc.city,
        bookingToken: hospitalBookingToken(i),
        groupId: args.groupId,
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
    out.push({ hospital: h, unit: u });
  }
  return out;
}
