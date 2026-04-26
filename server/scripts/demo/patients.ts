/* eslint-disable no-console */
//
// 48 demo patients with realistic Swiss surnames, split evenly across the
// 8 hospitals as "home". 12 of them get a second patient_hospitals row to
// simulate cross-location visits, plus a signed treatment + treatment_line
// at BOTH locations so the chart shows unified history.
//
import { db } from "../../db";
import {
  patients,
  patientHospitals,
  treatments,
  treatmentLines,
} from "../../../shared/schema";
import {
  PATIENT_COUNT,
  CROSS_LOCATION_PATIENT_COUNT,
  PATIENT_SURNAMES,
  PATIENT_FIRST_NAMES,
  GROUP_SERVICES,
  LOCATIONS,
} from "./skew";
import type { Location } from "./locations";
import type { ProviderRow } from "./providers";
import type { SeededServices } from "./services";

export type PatientRow = {
  patient: typeof patients.$inferSelect;
  homeIdx: number;
};

export async function seedPatientsAndCrossLocation(args: {
  locationRows: Location[];
  providers: ProviderRow[];
  services: SeededServices;
}): Promise<PatientRow[]> {
  const { locationRows, providers, services } = args;
  console.log(
    `Seeding ${PATIENT_COUNT} patients (split across ${LOCATIONS.length} hospitals)…`,
  );
  const patientRows: PatientRow[] = [];
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
    const phoneDigits = (7000000 + i).toString();
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
  }

  console.log(
    `Seeding ${CROSS_LOCATION_PATIENT_COUNT} cross-location visits + treatments at each end…`,
  );
  const now = Date.now();
  for (let i = 0; i < CROSS_LOCATION_PATIENT_COUNT; i++) {
    const pr = patientRows[i];
    const secondIdx = (pr.homeIdx + 1) % locationRows.length;
    await db.insert(patientHospitals).values({
      patientId: pr.patient.id,
      hospitalId: locationRows[secondIdx].hospital.id,
    });

    // Treatment at home location (90 days ago).
    const homeProvider = providers.find((p) => p.hospitalIdx === pr.homeIdx);
    if (!homeProvider) continue;
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
    await db.insert(treatmentLines).values({
      treatmentId: t1.id,
      serviceId: services.groupServices[0].id, // Botox Glabella
      dose: "20",
      doseUnit: "U",
      zones: ["glabella"],
      unitPrice: GROUP_SERVICES[0].price,
      total: GROUP_SERVICES[0].price,
    });

    // Treatment at second location (30 days ago).
    const secondProvider = providers.find((p) => p.hospitalIdx === secondIdx);
    if (!secondProvider) continue;
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
    await db.insert(treatmentLines).values({
      treatmentId: t2.id,
      serviceId: services.groupServices[2].id, // Hyaluron Lippen
      dose: "1.0",
      doseUnit: "ml",
      zones: ["lips"],
      unitPrice: GROUP_SERVICES[2].price,
      total: GROUP_SERVICES[2].price,
    });
  }

  return patientRows;
}
