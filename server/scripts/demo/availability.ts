/* eslint-disable no-console */
//
// Mon-Fri 09:00-12:00 + 14:00-17:00, 30-minute slots, for every bookable
// provider at their hospital. ~10 rows per provider × 19 providers = ~190
// rows. The /book page reads this table to render the calendar; without
// these rows the patient sees the provider list but no slots.
//
import { db } from "../../db";
import { providerAvailability } from "../../../shared/schema";
import type { Location } from "./locations";
import type { ProviderRow } from "./providers";

export async function seedProviderAvailability(args: {
  locationRows: Location[];
  providers: ProviderRow[];
}): Promise<void> {
  const { locationRows, providers } = args;
  const SLOTS: Array<{ dayOfWeek: number; startTime: string; endTime: string }> = [];
  for (let day = 1; day <= 5; day++) {
    SLOTS.push({ dayOfWeek: day, startTime: "09:00", endTime: "12:00" });
    SLOTS.push({ dayOfWeek: day, startTime: "14:00", endTime: "17:00" });
  }
  console.log(
    `Seeding availability — ${providers.length} providers × ${SLOTS.length} weekly slots…`,
  );

  const inserts: any[] = [];
  for (const p of providers) {
    const loc = locationRows[p.hospitalIdx];
    if (!loc) continue;
    for (const r of SLOTS) {
      inserts.push({
        providerId: p.user.id,
        hospitalId: loc.hospital.id,
        unitId: loc.unit.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        slotDurationMinutes: 30,
        isActive: true,
      });
    }
  }
  if (inserts.length > 0) {
    await db.insert(providerAvailability).values(inserts);
  }
}
