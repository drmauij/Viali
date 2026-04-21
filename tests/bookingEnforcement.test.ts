import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Mock the storage module BEFORE importing the router.
vi.mock("../server/storage", () => {
  return {
    storage: {
      getHospitalByBookingToken: vi.fn(),
      findOrCreatePatientForBooking: vi.fn(),
      createClinicAppointment: vi.fn(),
      getAvailableSlots: vi.fn(),
      getAppointmentActionToken: vi.fn(),
      markAppointmentActionTokenUsed: vi.fn(),
      updateClinicAppointment: vi.fn(),
      getUser: vi.fn(),
      getUnit: vi.fn(),
      getClinicAppointment: vi.fn(),
      createPatientMessage: vi.fn(),
    },
    db: { select: vi.fn(), insert: vi.fn(), delete: vi.fn() },
  };
});

// Also mock bookingIdempotency so it doesn't try to hit a real DB.
vi.mock("../server/storage/bookingIdempotency", () => ({
  findIdempotencyRecord: vi.fn().mockResolvedValue(null),
  recordIdempotencyKey: vi.fn().mockResolvedValue(undefined),
  hashBookingRequest: vi.fn().mockReturnValue("mock-hash"),
}));

// Mock DB-heavy helpers pulled in by clinic.ts dynamic imports.
vi.mock("@shared/schema", async () => {
  const actual = await vi.importActual<any>("@shared/schema");
  return actual;
});

// Mock resend to avoid real email sends in the cancel path.
vi.mock("../server/resend", () => ({
  sendAppointmentPatientCancelledAlertEmail: vi.fn().mockResolvedValue(undefined),
}));

// Silence logger.
vi.mock("../server/logger", () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Now import the router AFTER mocks are registered.
import clinicRouter from "../server/routes/clinic";
import { storage } from "../server/storage";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(clinicRouter);
  return app;
}

describe("POST /book — NOSHOW_FEE_ACK_REQUIRED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 NOSHOW_FEE_ACK_REQUIRED when noShowFeeMessage is set and payload omits noShowFeeAcknowledged", async () => {
    (storage.getHospitalByBookingToken as any).mockResolvedValue({
      id: "hospital-1",
      bookingToken: "tkn",
      noShowFeeMessage: "A 50 CHF fee applies for late cancellations.",
      hidePatientCancel: false,
      enableReferralOnBooking: false,
      bookingSettings: { slotDurationMinutes: 30 },
    });

    const res = await request(buildApp())
      .post("/api/public/booking/tkn/book")
      .send({
        providerId: "11111111-1111-1111-1111-111111111111",
        date: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
        firstName: "Maria",
        surname: "Test",
        email: "maria@example.com",
        phone: "+41791234567",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("NOSHOW_FEE_ACK_REQUIRED");
    expect(typeof res.body.message).toBe("string");
  });

  it("does NOT trigger NOSHOW_FEE_ACK_REQUIRED when noShowFeeMessage is empty", async () => {
    (storage.getHospitalByBookingToken as any).mockResolvedValue({
      id: "hospital-1",
      bookingToken: "tkn",
      noShowFeeMessage: null,
      hidePatientCancel: false,
      enableReferralOnBooking: false,
      bookingSettings: { slotDurationMinutes: 30 },
    });

    // provider lookup will fail (no roles configured) — we want some other error code,
    // not 400 NOSHOW_FEE_ACK_REQUIRED. The point is: fee-ack branch was NOT taken.
    const res = await request(buildApp())
      .post("/api/public/booking/tkn/book")
      .send({
        providerId: "11111111-1111-1111-1111-111111111111",
        date: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
        firstName: "Maria",
        surname: "Test",
        email: "maria@example.com",
        phone: "+41791234567",
      });

    expect(res.body.code).not.toBe("NOSHOW_FEE_ACK_REQUIRED");
  });
});

describe("POST /cancel-by-token — CANCELLATION_DISABLED", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 CANCELLATION_DISABLED when hospital.hidePatientCancel = true, even with a valid token", async () => {
    (storage.getAppointmentActionToken as any).mockResolvedValue({
      used: false,
      expiresAt: null,
      appointment: {
        id: "appt-1",
        status: "scheduled",
        providerId: "11111111-1111-1111-1111-111111111111",
        appointmentDate: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
      },
      hospital: {
        id: "hospital-1",
        hidePatientCancel: true,
        timezone: "Europe/Zurich",
        defaultLanguage: "de",
      },
    });

    const res = await request(buildApp())
      .post("/api/clinic/appointments/cancel-by-token")
      .send({ token: "valid-token", reason: "test" });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CANCELLATION_DISABLED");
  });

  it("does NOT block cancellation when hospital.hidePatientCancel = false", async () => {
    (storage.getAppointmentActionToken as any).mockResolvedValue({
      used: false,
      expiresAt: null,
      appointment: {
        id: "appt-1",
        status: "scheduled",
        providerId: "11111111-1111-1111-1111-111111111111",
        appointmentDate: "2026-06-01",
        startTime: "10:00",
        endTime: "10:30",
        patient: { firstName: "Maria" },
        patientId: "patient-1",
      },
      hospital: {
        id: "hospital-1",
        hidePatientCancel: false,
        timezone: "Europe/Zurich",
        defaultLanguage: "de",
        name: "Test Clinic",
        companyEmail: null,
        externalSurgeryNotificationEmail: null,
      },
    });
    (storage.updateClinicAppointment as any).mockResolvedValue(undefined);
    (storage.markAppointmentActionTokenUsed as any).mockResolvedValue(undefined);
    (storage.createPatientMessage as any).mockResolvedValue(undefined);

    const res = await request(buildApp())
      .post("/api/clinic/appointments/cancel-by-token")
      .send({ token: "valid-token", reason: "test" });

    expect(res.body.code).not.toBe("CANCELLATION_DISABLED");
  });
});
