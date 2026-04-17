import { describe, it, expect } from "vitest";
import { checkAdmissionCongruence } from "../shared/admissionCongruence";

const TZ = "Europe/Zurich";

function d(iso: string): Date {
  return new Date(iso);
}

describe("checkAdmissionCongruence", () => {
  it("returns none when stored admission is null", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: null,
      newPlannedDate: d("2026-05-01T08:30:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("none");
  });

  it("returns invalid/afterStart when admission is after new planned start", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T12:00:00+02:00"),
      newPlannedDate: d("2026-05-01T08:30:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("invalid");
    expect(result.reason).toBe("afterStart");
    expect(result.suggestedAdmission.toISOString()).toBe(d("2026-05-01T07:30:00+02:00").toISOString());
  });

  it("returns invalid/wrongDay when admission is on a different local day", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T12:00:00+02:00"),
      newPlannedDate: d("2026-05-02T08:30:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("invalid");
    expect(result.reason).toBe("wrongDay");
  });

  it("returns none when planned start moved by 0 minutes", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T12:00:00+02:00"),
      newPlannedDate: d("2026-05-01T13:00:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("none");
  });

  it("returns none when planned start moved 60 minutes (within threshold)", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T12:00:00+02:00"),
      newPlannedDate: d("2026-05-01T14:00:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("none");
  });

  it("returns drifted when planned start moved 121 minutes and admission still valid", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T09:00:00+02:00"),
      newPlannedDate: d("2026-05-01T15:01:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("drifted");
    expect(result.reason).toBe("gapDrifted");
  });

  it("invalid wins over drifted when both would apply", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-05-01T13:00:00+02:00"),
      oldAdmissionTime: d("2026-05-01T12:00:00+02:00"),
      newPlannedDate: d("2026-05-01T08:00:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.severity).toBe("invalid");
  });

  it("same local day across DST transition is not wrongDay", () => {
    const result = checkAdmissionCongruence({
      oldPlannedDate: d("2026-03-29T14:00:00+02:00"),
      oldAdmissionTime: d("2026-03-29T01:30:00+01:00"),
      newPlannedDate: d("2026-03-29T15:00:00+02:00"),
      defaultOffsetMinutes: 60,
      hospitalTimeZone: TZ,
    });
    expect(result.reason).not.toBe("wrongDay");
  });
});
