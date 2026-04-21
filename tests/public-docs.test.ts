import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import publicDocsRouter from "../server/routes/publicDocs";
import clinicRouter from "../server/routes/clinic";
import publicOpenApiRouter from "../server/routes/publicOpenApi";

function buildApp() {
  const app = express();
  app.use(publicDocsRouter);
  return app;
}

describe("/llms.txt", () => {
  it("is served as text/plain and references /api.md", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/plain/);
    expect(res.text).toContain("/api.md");
  });

  it("references all three public endpoint areas", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.text).toMatch(/leads/i);
    expect(res.text).toMatch(/conversions/i);
    expect(res.text).toMatch(/book/i);
  });

  it("does not leak UUIDs or hex tokens", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(res.text).not.toMatch(/\b[0-9a-f]{32,}\b/i);
  });

  it("references the OpenAPI schema", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.text).toContain("/api/openapi.json");
  });

  it("references the MCP Server Card", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.text).toContain("/.well-known/mcp.json");
  });

  it("includes the booking API quick-start", async () => {
    const res = await request(buildApp()).get("/llms.txt");
    expect(res.text).toMatch(/quick-start/i);
    expect(res.text).toContain("/api/public/booking");
  });
});

describe("/api.md", () => {
  it("is served as text/markdown", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/markdown/);
  });

  it("documents every public endpoint path", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("/book/");
    expect(res.text).toContain("/api/webhooks/leads/");
    expect(res.text).toContain("/api/webhooks/conversions/");
    expect(res.text).toContain("/unsubscribe/");
    expect(res.text).toContain("/api/webhooks/resend");
  });

  it("documents booking link URL parameters", async () => {
    const res = await request(buildApp()).get("/api.md");
    for (const param of [
      "service",
      "firstName",
      "email",
      "utm_source",
      "utm_campaign",
      "gclid",
      "fbclid",
      "promo",
      "embed",
    ]) {
      expect(res.text).toContain(param);
    }
    expect(res.text).toContain("`fe`");
  });

  it("documents leads webhook required fields and error codes", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("first_name");
    expect(res.text).toContain("last_name");
    expect(res.text).toContain("source");
    expect(res.text).toContain("401");
    expect(res.text).toContain("403");
    expect(res.text).toContain("400");
  });

  it("documents conversions API filters and levels", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("platform");
    expect(res.text).toContain("level");
    expect(res.text).toContain("meta_forms");
    expect(res.text).toContain("google_ads");
    expect(res.text).toContain("kept");
    expect(res.text).toContain("surgery_planned");
    expect(res.text).toContain("paid");
  });
});

// --- Error shape parity (new in agent-ready Phase 1) ---

describe("/api/public/booking error shape", () => {
  function buildBookingApp() {
    const app = express();
    app.use(express.json());
    app.use(clinicRouter);
    return app;
  }

  it("returns { code: 'HOSPITAL_NOT_FOUND', message } for an invalid booking token", async () => {
    const res = await request(buildBookingApp()).get(
      "/api/public/booking/does-not-exist-token",
    );
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("HOSPITAL_NOT_FOUND");
    expect(typeof res.body.message).toBe("string");
    expect(res.body.message).toMatch(/not found/i);
  });
});

describe("POST /book — NOSHOW_FEE_ACK_REQUIRED", () => {
  it.todo(
    "returns 400 NOSHOW_FEE_ACK_REQUIRED when hospital.noShowFeeMessage is set and payload omits noShowFeeAcknowledged",
  );
  it.todo(
    "succeeds when noShowFeeAcknowledged = true",
  );
  it.todo(
    "ignores noShowFeeAcknowledged when hospital.noShowFeeMessage is empty",
  );
});

describe("POST /cancel-by-token — CANCELLATION_DISABLED", () => {
  it.todo(
    "returns 403 CANCELLATION_DISABLED when hospital.hidePatientCancel = true, even with a valid token",
  );
  it.todo(
    "cancels normally when hospital.hidePatientCancel = false",
  );
});

// --- CORS preflight (new) ---
describe("/api/public/booking CORS", () => {
  it("responds to OPTIONS preflight with permissive headers", async () => {
    const { default: app } = await import("../server/index");
    const res = await request(app)
      .options("/api/public/booking/any-token/services")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "GET")
      .set("Access-Control-Request-Headers", "Idempotency-Key,Content-Type");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toMatch(/GET/);
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
    expect(res.headers["access-control-allow-headers"]).toMatch(/Idempotency-Key/i);
  });

  it("applies the same CORS to /api/clinic/appointments/cancel-by-token", async () => {
    const { default: app } = await import("../server/index");
    const res = await request(app)
      .options("/api/clinic/appointments/cancel-by-token")
      .set("Origin", "https://example.com")
      .set("Access-Control-Request-Method", "POST");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-methods"]).toMatch(/POST/);
  });
});

describe("POST /api/public/booking/:token/book — rate limit", () => {
  it("returns { code: 'RATE_LIMITED', message } after the cap", async () => {
    const { default: app } = await import("../server/index");

    let last: any;
    for (let i = 0; i < 31; i++) {
      last = await request(app)
        .post("/api/public/booking/any-token/book")
        .send({});
    }
    expect(last?.status).toBe(429);
    expect(last?.body.code).toBe("RATE_LIMITED");
    expect(typeof last?.body.message).toBe("string");
  }, 15000);
});

describe("/api/openapi.json", () => {
  function buildApp() {
    const app = express();
    app.use(publicOpenApiRouter);
    return app;
  }

  it("returns valid OpenAPI 3.1 JSON with all 11 documented paths", async () => {
    const res = await request(buildApp()).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    const spec = JSON.parse(res.text);
    expect(spec.openapi).toBe("3.1.0");
    const paths = Object.keys(spec.paths);
    expect(paths).toContain("/api/public/booking/{token}");
    expect(paths).toContain("/api/public/booking/{token}/services");
    expect(paths).toContain("/api/public/booking/{token}/closures");
    expect(paths).toContain("/api/public/booking/{token}/providers/{providerId}/available-dates");
    expect(paths).toContain("/api/public/booking/{token}/providers/{providerId}/slots");
    expect(paths).toContain("/api/public/booking/{token}/best-provider");
    expect(paths).toContain("/api/public/booking/{token}/prefill");
    expect(paths).toContain("/api/public/booking/{token}/promo/{code}");
    expect(paths).toContain("/api/public/booking/{token}/book");
    expect(paths).toContain("/api/clinic/appointments/cancel-info/{token}");
    expect(paths).toContain("/api/clinic/appointments/cancel-by-token");
  });

  it("declares all 10 error codes in the Error schema enum", async () => {
    const res = await request(buildApp()).get("/api/openapi.json");
    const spec = JSON.parse(res.text);
    expect(spec.components.schemas.Error.properties.code.enum.sort()).toEqual(
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

describe("/api/openapi.yaml", () => {
  it("serves valid YAML", async () => {
    const app = express();
    app.use(publicOpenApiRouter);
    const res = await request(app).get("/api/openapi.yaml");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/yaml/);
    expect(res.text).toMatch(/openapi: 3\.1\.0/);
  });
});

describe("/.well-known/openapi.json", () => {
  it("redirects to /api/openapi.json", async () => {
    const app = express();
    app.use(publicOpenApiRouter);
    const res = await request(app).get("/.well-known/openapi.json");
    expect(res.status).toBe(302);
    expect(res.headers["location"]).toBe("/api/openapi.json");
  });
});

describe("/api.md — Booking API (JSON) parity", () => {
  it("documents all 9 booking JSON endpoints", async () => {
    const res = await request(buildApp()).get("/api.md");
    for (const suffix of [
      "/api/public/booking/:token",
      "/services",
      "/closures",
      "/available-dates",
      "/slots",
      "/best-provider",
      "/prefill",
      "/promo/:code",
      "/book",
    ]) {
      expect(res.text).toContain(suffix);
    }
  });

  it("documents all 10 error codes", async () => {
    const res = await request(buildApp()).get("/api.md");
    for (const code of [
      "SLOT_TAKEN",
      "INVALID_BOOKING_DATA",
      "REFERRAL_REQUIRED",
      "NOSHOW_FEE_ACK_REQUIRED",
      "PROVIDER_NOT_BOOKABLE",
      "HOSPITAL_NOT_FOUND",
      "PROMO_INVALID",
      "CANCELLATION_DISABLED",
      "RATE_LIMITED",
      "IDEMPOTENCY_CONFLICT",
    ]) {
      expect(res.text).toContain(code);
    }
  });

  it("mentions Idempotency-Key header", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("Idempotency-Key");
  });

  it("documents cancel-info + cancel-by-token endpoints", async () => {
    const res = await request(buildApp()).get("/api.md");
    expect(res.text).toContain("/api/clinic/appointments/cancel-info/");
    expect(res.text).toContain("/api/clinic/appointments/cancel-by-token");
    expect(res.text).toMatch(/no-show/i);
  });
});
