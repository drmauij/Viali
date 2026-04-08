import { describe, it, expect, afterAll } from "vitest";
import { getPublicBookableServicesByHospital } from "../server/storage/clinic";

// Use known test data from the local DB
const TEST_HOSPITAL_ID = "93c37796-9d15-4931-aca9-a7f494bd3a16";

afterAll(async () => {
  const { pool } = await import("../server/db");
  await pool.end();
});

describe("getPublicBookableServicesByHospital", () => {
  it("returns empty array for an unknown hospital id", async () => {
    const services = await getPublicBookableServicesByHospital(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(services).toEqual([]);
  });

  it("returns services with the expected shape for a real hospital", async () => {
    const services = await getPublicBookableServicesByHospital(TEST_HOSPITAL_ID);
    expect(Array.isArray(services)).toBe(true);
    for (const s of services) {
      expect(typeof s.id).toBe("string");
      expect(typeof s.name).toBe("string");
      expect(s.description === null || typeof s.description === "string").toBe(true);
      expect(
        s.durationMinutes === null || typeof s.durationMinutes === "number",
      ).toBe(true);
      expect(s.code === null || typeof s.code === "string").toBe(true);
      expect(typeof s.sortOrder).toBe("number");
      expect(Array.isArray(s.providerIds)).toBe(true);
      for (const pid of s.providerIds) {
        expect(typeof pid).toBe("string");
      }
    }
  });
});
