import { describe, it, expect } from "vitest";
import { maybeShiftAdmissionTime } from "../server/routes/anesthesia/surgeryAdmissionFallback";

const hospital = { timezone: "Europe/Zurich", defaultAdmissionOffsetMinutes: 60 };

function d(iso: string): Date {
  return new Date(iso);
}

describe("maybeShiftAdmissionTime", () => {
  it("shifts admission when plannedDate moves to a new day and body omits admissionTime", () => {
    const updateData: Record<string, any> = {
      plannedDate: d("2026-05-02T08:30:00+02:00"),
    };
    const { shifted } = maybeShiftAdmissionTime({
      reqBody: { plannedDate: updateData.plannedDate.toISOString() },
      updateData,
      storedSurgery: { admissionTime: d("2026-05-01T12:00:00+02:00") as any },
      hospital: hospital as any,
    });
    expect(shifted).not.toBeNull();
    expect(updateData.admissionTime.toISOString()).toBe(d("2026-05-02T07:30:00+02:00").toISOString());
  });

  it("respects explicit admissionTime in body (even null)", () => {
    const updateData: Record<string, any> = {
      plannedDate: d("2026-05-02T08:30:00+02:00"),
      admissionTime: null,
    };
    const { shifted } = maybeShiftAdmissionTime({
      reqBody: { plannedDate: updateData.plannedDate.toISOString(), admissionTime: null },
      updateData,
      storedSurgery: { admissionTime: d("2026-05-01T12:00:00+02:00") as any },
      hospital: hospital as any,
    });
    expect(shifted).toBeNull();
    expect(updateData.admissionTime).toBeNull();
  });

  it("leaves admission untouched when stored admission is null", () => {
    const updateData: Record<string, any> = {
      plannedDate: d("2026-05-02T08:30:00+02:00"),
    };
    const { shifted } = maybeShiftAdmissionTime({
      reqBody: { plannedDate: updateData.plannedDate.toISOString() },
      updateData,
      storedSurgery: { admissionTime: null as any },
      hospital: hospital as any,
    });
    expect(shifted).toBeNull();
    expect(updateData.admissionTime).toBeUndefined();
  });

  it("leaves admission untouched when new plannedDate is on the same local day", () => {
    const updateData: Record<string, any> = {
      plannedDate: d("2026-05-01T08:30:00+02:00"),
    };
    const { shifted } = maybeShiftAdmissionTime({
      reqBody: { plannedDate: updateData.plannedDate.toISOString() },
      updateData,
      storedSurgery: { admissionTime: d("2026-05-01T12:00:00+02:00") as any },
      hospital: hospital as any,
    });
    expect(shifted).toBeNull();
    expect(updateData.admissionTime).toBeUndefined();
  });
});
