/* eslint-disable no-console */
//
// One marketing flow campaign authored by the chain's first location.
// Group scope is a runtime concept (set at send time via the audience
// hospitalIds picker), not stored on the row itself.
//
import { db } from "../../db";
import { flows } from "../../../shared/schema";
import type { Location } from "./locations";

export async function seedFlows(args: {
  locationRows: Location[];
}): Promise<void> {
  const { locationRows } = args;
  if (!locationRows[0]) return;
  console.log(
    `Seeding 1 marketing campaign (authored by ${locationRows[0].hospital.name})…`,
  );
  await db.insert(flows).values({
    hospitalId: locationRows[0].hospital.id,
    name: "Demo: Spring Chain Campaign",
    status: "draft",
    triggerType: "manual",
    channel: "email",
    messageSubject: "Frühlings-Angebot bei beauty2go",
    messageTemplate:
      "Liebe {{firstName}}, 20% Rabatt auf Botox & Hyaluron an allen beauty2go-Standorten. Jetzt buchen!",
  } as any);
}
