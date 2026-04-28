import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

const fakeProviders = [
  { userId: "u1", user: { id: "u1", firstName: "Alice", lastName: "Doe", email: "alice@example.com" } },
  { userId: "u2", user: { id: "u2", firstName: "Bob",   lastName: "Roe", email: "bob@hospital.local" } },
  { userId: "u3", user: { id: "u3", firstName: "Cara",  lastName: "Poe", email: null } },
  { userId: "u4", user: { id: "u4", firstName: "Dan",   lastName: "Voe", email: "dan@example.com" } },
];

vi.mock("../server/auth/google", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.user = { id: "admin-1" };
    next();
  },
}));

vi.mock("../server/utils", () => ({
  requireWriteAccess: (_req: any, _res: any, next: any) => next(),
  requireAdminWriteAccess: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../server/storage", () => ({
  storage: {
    getBookableProvidersByUnit: vi.fn(async () => fakeProviders),
    getBookableProvidersByHospital: vi.fn(async () => fakeProviders),
    getHospital: vi.fn(async (id: string) => ({
      id, name: "Test Hospital", timezone: "Europe/Zurich", language: "en",
    })),
  },
}));

const sendMock = vi.fn(async () => ({ id: "msg-1" }));
vi.mock("../server/email", () => ({
  getUncachableResendClient: vi.fn(async () => ({
    client: { emails: { send: sendMock } },
    fromEmail: "noreply@mail.viali.app",
  })),
}));

vi.mock("../server/db", () => ({ db: {} }));
vi.mock("../server/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

async function buildApp() {
  const { default: shiftsRouter } = await import("../server/routes/shifts");
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(shiftsRouter);
  return app;
}

beforeEach(() => {
  sendMock.mockClear();
});

describe("GET /api/staff-shifts/:hospitalId/email-month-pdf/recipients", () => {
  it("returns valid emails and skipped count, filtering .local and missing emails", async () => {
    const app = await buildApp();
    const res = await request(app)
      .get("/api/staff-shifts/h-1/email-month-pdf/recipients?unitId=unit-1");

    expect(res.status).toBe(200);
    expect(res.body.valid).toEqual(["alice@example.com", "dan@example.com"]);
    expect(res.body.skipped).toBe(2);
  });

  it("requires unitId query parameter", async () => {
    const app = await buildApp();
    const res = await request(app)
      .get("/api/staff-shifts/h-1/email-month-pdf/recipients");
    expect(res.status).toBe(400);
  });
});
