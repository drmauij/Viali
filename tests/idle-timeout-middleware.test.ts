import { describe, it, expect, vi, beforeEach } from "vitest";
import { enforceIdleTimeout } from "../server/auth/idleTimeout";

vi.mock("../server/storage", () => ({
  storage: {
    getUserHospitals: vi.fn(),
  },
}));

vi.mock("../server/logger", () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { storage } from "../server/storage";

function makeReq(overrides: any = {}) {
  return {
    isAuthenticated: () => true,
    user: { id: "user-1" },
    path: "/api/patients",
    sessionID: "sid-1",
    session: { lastActivity: undefined as number | undefined },
    logout: vi.fn((cb: any) => cb()),
    ...overrides,
  };
}

function makeRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

describe("enforceIdleTimeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes through unauthenticated requests", async () => {
    const req: any = makeReq({ isAuthenticated: () => false, user: null });
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes through when timeout is disabled (0)", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 0 }]);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("passes through when user has no hospitals", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([]);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("passes through (fail-open) when storage lookup throws", async () => {
    (storage.getUserHospitals as any).mockRejectedValue(new Error("db down"));
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("stamps lastActivity on first authenticated request when enabled", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(req.session.lastActivity).toBeTypeOf("number");
    expect(next).toHaveBeenCalledOnce();
  });

  it("logs out and returns 401 IDLE_TIMEOUT when idle exceeds limit", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq();
    req.session.lastActivity = Date.now() - 6 * 60_000; // 6 min ago — over the 5 min limit
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(req.logout).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Idle timeout", code: "IDLE_TIMEOUT" });
  });

  it("does not stamp lastActivity for SKIP paths (e.g. /api/auth/user)", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq({ path: "/api/auth/user" });
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(req.session.lastActivity).toBeUndefined();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not log out via SKIP path even when idle exceeded", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq({ path: "/api/auth/user" });
    req.session.lastActivity = Date.now() - 999_999;
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not log out for /api/auth/idle-config polling", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq({ path: "/api/auth/idle-config" });
    req.session.lastActivity = Date.now() - 999_999;
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("does not log out for /api/logout requests", async () => {
    (storage.getUserHospitals as any).mockResolvedValue([{ idleTimeoutMinutes: 5 }]);
    const req = makeReq({ path: "/api/logout" });
    req.session.lastActivity = Date.now() - 999_999;
    const res = makeRes();
    const next = vi.fn();
    await enforceIdleTimeout(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
