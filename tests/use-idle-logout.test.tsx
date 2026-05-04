// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useIdleLogout } from "../client/src/hooks/useIdleLogout";

function wrapper(initialConfig: { idleTimeoutMinutes: number; idleWarningSeconds: number }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(["/api/auth/idle-config"], initialConfig);
  // eslint-disable-next-line react/display-name
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("useIdleLogout", () => {
  let assignSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    // jsdom does not implement BroadcastChannel — stub it.
    (globalThis as any).BroadcastChannel = class {
      onmessage: ((ev: any) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
    };
    // window.location.assign is not configurable in jsdom; replace the method.
    assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does nothing when timeout is 0", () => {
    const { result } = renderHook(() => useIdleLogout(), {
      wrapper: wrapper({ idleTimeoutMinutes: 0, idleWarningSeconds: 30 }),
    });
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current.warningOpen).toBe(false);
    expect(assignSpy).not.toHaveBeenCalled();
  });

  it("opens the warning at (timeout - warningSeconds)", () => {
    const { result } = renderHook(() => useIdleLogout(), {
      wrapper: wrapper({ idleTimeoutMinutes: 1, idleWarningSeconds: 10 }),
    });
    // 1 min timeout, 10s warning -> warning fires at 50s idle.
    act(() => { vi.advanceTimersByTime(49_000); });
    expect(result.current.warningOpen).toBe(false);
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(result.current.warningOpen).toBe(true);
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(10);
  });

  it("forces logout at full timeout", () => {
    renderHook(() => useIdleLogout(), {
      wrapper: wrapper({ idleTimeoutMinutes: 1, idleWarningSeconds: 10 }),
    });
    act(() => { vi.advanceTimersByTime(61_000); });
    expect(assignSpy).toHaveBeenCalledWith("/api/logout");
  });

  it("activity dismisses the warning", () => {
    const { result } = renderHook(() => useIdleLogout(), {
      wrapper: wrapper({ idleTimeoutMinutes: 1, idleWarningSeconds: 10 }),
    });
    act(() => { vi.advanceTimersByTime(55_000); });
    expect(result.current.warningOpen).toBe(true);
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown"));
      vi.advanceTimersByTime(1_500);
    });
    expect(result.current.warningOpen).toBe(false);
  });
});
