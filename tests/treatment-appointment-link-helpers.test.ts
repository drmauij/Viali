import { describe, it, expect } from "vitest";
import {
  isLinkableAppointmentStatus,
  filterLinkableAppointments,
  pickNearestToNow,
  todayLocalDateString,
  canActOnBanner,
} from "../client/src/components/treatments/appointmentLinkHelpers";

type Appt = { id: string; startTime: string; status: string };

describe("isLinkableAppointmentStatus", () => {
  it("accepts non-cancelled non-no_show statuses", () => {
    for (const s of ["scheduled", "confirmed", "arrived", "in_progress", "completed"]) {
      expect(isLinkableAppointmentStatus(s)).toBe(true);
    }
  });
  it("rejects cancelled and no_show", () => {
    expect(isLinkableAppointmentStatus("cancelled")).toBe(false);
    expect(isLinkableAppointmentStatus("no_show")).toBe(false);
  });
  it("rejects unknown statuses defensively", () => {
    expect(isLinkableAppointmentStatus("garbage")).toBe(false);
  });
});

describe("filterLinkableAppointments", () => {
  it("drops cancelled and no_show entries", () => {
    const input: Appt[] = [
      { id: "a", startTime: "09:00", status: "scheduled" },
      { id: "b", startTime: "10:00", status: "cancelled" },
      { id: "c", startTime: "11:00", status: "no_show" },
      { id: "d", startTime: "12:00", status: "completed" },
    ];
    const out = filterLinkableAppointments(input);
    expect(out.map((a) => a.id)).toEqual(["a", "d"]);
  });
});

describe("pickNearestToNow", () => {
  const appts: Appt[] = [
    { id: "a", startTime: "09:00", status: "scheduled" },
    { id: "b", startTime: "14:00", status: "scheduled" },
    { id: "c", startTime: "18:00", status: "scheduled" },
  ];
  it("picks the appointment closest in absolute time", () => {
    const now = new Date("2026-04-17T13:30:00");
    expect(pickNearestToNow(appts, now)?.id).toBe("b");
  });
  it("handles now after all appointments", () => {
    const now = new Date("2026-04-17T20:00:00");
    expect(pickNearestToNow(appts, now)?.id).toBe("c");
  });
  it("handles now before all appointments", () => {
    const now = new Date("2026-04-17T06:00:00");
    expect(pickNearestToNow(appts, now)?.id).toBe("a");
  });
  it("returns null for empty list", () => {
    expect(pickNearestToNow([], new Date())).toBeNull();
  });
});

describe("todayLocalDateString", () => {
  it("formats as yyyy-MM-dd", () => {
    const d = new Date("2026-04-17T10:00:00");
    expect(todayLocalDateString(d)).toBe("2026-04-17");
  });
});

describe("canActOnBanner", () => {
  it("allows draft and amended", () => {
    expect(canActOnBanner("draft")).toBe(true);
    expect(canActOnBanner("amended")).toBe(true);
  });
  it("blocks signed and invoiced", () => {
    expect(canActOnBanner("signed")).toBe(false);
    expect(canActOnBanner("invoiced")).toBe(false);
  });
  it("allows undefined (new treatment — no status yet)", () => {
    expect(canActOnBanner(undefined)).toBe(true);
  });
});
