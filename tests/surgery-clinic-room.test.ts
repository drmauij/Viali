import { describe, it, expect, afterAll } from "vitest";
import { db } from "../server/db";
import { surgeries, surgeryRooms } from "@shared/schema";
import { eq } from "drizzle-orm";
import { createSurgery, updateSurgery } from "../server/storage/anesthesia";

const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

// Track created IDs for cleanup
const createdSurgeryIds: string[] = [];
const createdRoomIds: string[] = [];

async function getOrCreateRoom(type: "CLINIC" | "PACU", name: string) {
  // Try to find an existing room of this type for the test hospital
  const [existing] = await db
    .select()
    .from(surgeryRooms)
    .where(eq(surgeryRooms.hospitalId, TEST_HOSPITAL_ID))
    // We filter by type below since drizzle enum filter needs cast
    .limit(20);

  const found = existing
    ? [existing].find((r) => (r as typeof existing).type === type)
    : undefined;

  // Query directly for type match
  const rows = await db
    .select()
    .from(surgeryRooms)
    .where(eq(surgeryRooms.hospitalId, TEST_HOSPITAL_ID));
  const match = rows.find((r) => r.type === type);
  if (match) return match;

  // Create one if none exists
  const [created] = await db
    .insert(surgeryRooms)
    .values({ hospitalId: TEST_HOSPITAL_ID, name, type })
    .returning();
  createdRoomIds.push(created.id);
  return created;
}

async function createTestSurgery(clinicRoomId: string | null, pacuBedId: string | null) {
  const surgery = await createSurgery({
    hospitalId: TEST_HOSPITAL_ID,
    plannedDate: new Date("2026-06-01T08:00:00Z"),
    clinicRoomId,
    pacuBedId,
  });
  createdSurgeryIds.push(surgery.id);
  return surgery;
}

afterAll(async () => {
  for (const id of createdSurgeryIds) {
    await db.delete(surgeries).where(eq(surgeries.id, id)).catch(() => {});
  }
  for (const id of createdRoomIds) {
    await db.delete(surgeryRooms).where(eq(surgeryRooms.id, id)).catch(() => {});
  }
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("surgery clinic-room / PACU sequential rule", () => {
  it("assigning pacuBedId clears clinicRoomId", async () => {
    const clinicRoom = await getOrCreateRoom("CLINIC", "Test Clinic Room");
    const pacuRoom = await getOrCreateRoom("PACU", "Test PACU Room");

    const surgery = await createTestSurgery(clinicRoom.id, null);
    expect(surgery.clinicRoomId).toBe(clinicRoom.id);
    expect(surgery.pacuBedId).toBeNull();

    const updated = await updateSurgery(surgery.id, { pacuBedId: pacuRoom.id });
    expect(updated.pacuBedId).toBe(pacuRoom.id);
    expect(updated.clinicRoomId).toBeNull();
  });

  it("setting only clinicRoomId does NOT clear pacuBedId", async () => {
    const clinicRoom = await getOrCreateRoom("CLINIC", "Test Clinic Room");
    const pacuRoom = await getOrCreateRoom("PACU", "Test PACU Room");

    const surgery = await createTestSurgery(null, pacuRoom.id);
    expect(surgery.pacuBedId).toBe(pacuRoom.id);

    const updated = await updateSurgery(surgery.id, { clinicRoomId: clinicRoom.id });
    expect(updated.clinicRoomId).toBe(clinicRoom.id);
    expect(updated.pacuBedId).toBe(pacuRoom.id);
  });

  it("clearing pacuBedId (setting to null) does NOT repopulate clinicRoomId", async () => {
    const pacuRoom = await getOrCreateRoom("PACU", "Test PACU Room");

    const surgery = await createTestSurgery(null, pacuRoom.id);
    expect(surgery.pacuBedId).toBe(pacuRoom.id);
    expect(surgery.clinicRoomId).toBeNull();

    const updated = await updateSurgery(surgery.id, { pacuBedId: null });
    expect(updated.pacuBedId).toBeNull();
    expect(updated.clinicRoomId).toBeNull();
  });
});
