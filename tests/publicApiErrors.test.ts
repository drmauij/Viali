import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import {
  PUBLIC_API_ERROR_CODES,
  sendPublicApiError,
} from "../server/lib/publicApiErrors";

function buildApp() {
  const app = express();
  app.get("/slot-taken", (_req, res) =>
    sendPublicApiError(res, "SLOT_TAKEN"),
  );
  app.get("/with-extra", (_req, res) =>
    sendPublicApiError(res, "INVALID_BOOKING_DATA", {
      fieldErrors: [{ path: "email", message: "invalid" }],
    }),
  );
  app.get("/tries-to-overwrite-code", (_req, res) =>
    sendPublicApiError(res, "SLOT_TAKEN", {
      code: "EVIL_OVERWRITE",
      message: "pwned",
    } as Record<string, unknown>),
  );
  return app;
}

describe("sendPublicApiError", () => {
  it("returns { code, message } with the catalog's HTTP status", async () => {
    const res = await request(buildApp()).get("/slot-taken");
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      code: "SLOT_TAKEN",
      message: PUBLIC_API_ERROR_CODES.SLOT_TAKEN.message,
    });
  });

  it("merges extra fields into the response", async () => {
    const res = await request(buildApp()).get("/with-extra");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_BOOKING_DATA");
    expect(res.body.fieldErrors).toEqual([
      { path: "email", message: "invalid" },
    ]);
  });

  it("does not let extra fields overwrite code or message", async () => {
    const res = await request(buildApp()).get("/tries-to-overwrite-code");
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("SLOT_TAKEN");
    expect(res.body.message).toBe(PUBLIC_API_ERROR_CODES.SLOT_TAKEN.message);
  });

  it("catalog contains all 10 documented codes", () => {
    expect(Object.keys(PUBLIC_API_ERROR_CODES).sort()).toEqual(
      [
        "CANCELLATION_DISABLED",
        "HOSPITAL_NOT_FOUND",
        "IDEMPOTENCY_CONFLICT",
        "INVALID_BOOKING_DATA",
        "NOSHOW_FEE_ACK_REQUIRED",
        "PROMO_INVALID",
        "PROVIDER_NOT_BOOKABLE",
        "RATE_LIMITED",
        "REFERRAL_REQUIRED",
        "SLOT_TAKEN",
      ].sort(),
    );
  });
});
