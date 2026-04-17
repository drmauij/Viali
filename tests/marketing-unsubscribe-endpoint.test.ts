import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import request from "supertest";

const setMock = vi.fn();
const whereMock = vi.fn().mockResolvedValue(undefined);

vi.mock("../server/db", () => ({
  db: {
    update: vi.fn(() => ({ set: setMock })),
  },
}));

// Default: set() returns an object whose where() resolves. Tests can override setMock per-case.
beforeEach(() => {
  vi.clearAllMocks();
  setMock.mockReturnValue({ where: whereMock });
  whereMock.mockResolvedValue(undefined);
  process.env.MARKETING_UNSUBSCRIBE_SECRET = "test-secret";
});

afterEach(() => {
  delete process.env.MARKETING_UNSUBSCRIBE_SECRET;
});

import marketingUnsubscribeRouter from "../server/routes/marketingUnsubscribe";
import { generateUnsubscribeToken } from "../server/services/marketingUnsubscribeToken";

function buildApp() {
  const app = express();
  app.use(marketingUnsubscribeRouter);
  return app;
}

describe("GET /unsubscribe/:token", () => {
  it("returns 200 + confirmation HTML for valid token (default channel=all)", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(res.text.toLowerCase()).toMatch(/abmelde/);
    // DB patch should set both channels false + stamp timestamp
    expect(setMock).toHaveBeenCalledTimes(1);
    const patch = setMock.mock.calls[0][0];
    expect(patch.smsMarketingConsent).toBe(false);
    expect(patch.emailMarketingConsent).toBe(false);
    expect(patch.marketingUnsubscribedAt).toBeInstanceOf(Date);
  });

  it("supports channel=sms to only unsubscribe SMS", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}?channel=sms`);
    expect(res.status).toBe(200);
    const patch = setMock.mock.calls[0][0];
    expect(patch.smsMarketingConsent).toBe(false);
    expect(patch.emailMarketingConsent).toBeUndefined();
    expect(patch.marketingUnsubscribedAt).toBeInstanceOf(Date);
  });

  it("supports channel=email to only unsubscribe email", async () => {
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}?channel=email`);
    expect(res.status).toBe(200);
    const patch = setMock.mock.calls[0][0];
    expect(patch.emailMarketingConsent).toBe(false);
    expect(patch.smsMarketingConsent).toBeUndefined();
  });

  it("returns 400 for invalid token signature", async () => {
    const app = buildApp();
    // Build a token then tamper the signature. Splitting on "." is safe because
    // base64url encoding is dot-free — the token is exactly <payloadB64>.<sigB64>.
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const [payload] = token.split(".");
    const res = await request(app).get(`/unsubscribe/${payload}.deadbeef`);
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toMatch(/html/);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed token (no dot)", async () => {
    const app = buildApp();
    const res = await request(app).get("/unsubscribe/garbage");
    expect(res.status).toBe(400);
    expect(setMock).not.toHaveBeenCalled();
  });

  it("returns 500 + HTML error page when the DB update rejects", async () => {
    whereMock.mockRejectedValueOnce(new Error("db down"));
    const app = buildApp();
    const token = generateUnsubscribeToken("pat_1", "hosp_1");
    const res = await request(app).get(`/unsubscribe/${token}`);
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toMatch(/html/);
    // Must still return HTML, not leak the error message
    expect(res.text).not.toContain("db down");
  });
});
