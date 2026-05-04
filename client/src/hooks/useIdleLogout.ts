import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface IdleConfig {
  idleTimeoutMinutes: number;
  idleWarningSeconds: number;
}

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "scroll"] as const;
const ACTIVITY_THROTTLE_MS = 1000;
const BROADCAST_CHANNEL = "viali-idle-activity";

interface UseIdleLogoutResult {
  /** True when the warning modal should be visible. */
  warningOpen: boolean;
  /** Seconds remaining in the warning countdown (0 when not warning). */
  secondsRemaining: number;
  /** Cancel the warning + reset the idle clock. */
  stayLoggedIn: () => void;
  /** Force a logout immediately. */
  logoutNow: () => void;
}

/**
 * Activity tracker for staff auto-logout. Mount once in the authenticated app
 * shell. When the active hospital has `idleTimeoutMinutes > 0`, this hook:
 *
 *  - Listens for mouse/keyboard/touch/scroll activity (throttled 1Hz).
 *  - Cross-broadcasts activity to other tabs via BroadcastChannel so a busy
 *    second tab doesn't get logged out.
 *  - After (timeout - warning) seconds idle, opens a countdown.
 *  - At full timeout, calls /api/logout and reloads to /.
 *
 * The server-side idle middleware is the source of truth — this hook only
 * provides the warning UX. If the server logs the user out first (e.g. a
 * background fetch returned 401 IDLE_TIMEOUT), the standard 401 handling in
 * the app will redirect to /.
 */
export function useIdleLogout(): UseIdleLogoutResult {
  const { data: config } = useQuery<IdleConfig>({
    queryKey: ["/api/auth/idle-config"],
    retry: false,
    staleTime: 5 * 60_000,
  });

  const [warningOpen, setWarningOpen] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);

  const lastActivityRef = useRef<number>(Date.now());
  const lastBroadcastRef = useRef<number>(0);
  const checkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  const timeoutMs = (config?.idleTimeoutMinutes ?? 0) * 60_000;
  const warningSec = config?.idleWarningSeconds ?? 30;

  useEffect(() => {
    if (timeoutMs <= 0) return;

    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(BROADCAST_CHANNEL) : null;
    channelRef.current = channel;

    const recordActivity = (broadcast = true) => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (warningOpen) setWarningOpen(false);
      if (broadcast && channel && now - lastBroadcastRef.current > ACTIVITY_THROTTLE_MS) {
        lastBroadcastRef.current = now;
        try { channel.postMessage({ at: now }); } catch { /* closed channel — ignore */ }
      }
    };

    const onLocalActivity = () => recordActivity(true);

    if (channel) {
      channel.onmessage = (event) => {
        const at = event?.data?.at;
        if (typeof at === "number" && at > lastActivityRef.current) {
          lastActivityRef.current = at;
          if (warningOpen) setWarningOpen(false);
        }
      };
    }

    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, onLocalActivity, { passive: true });
    }

    checkTimerRef.current = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMs) {
        // Hard cutoff — force logout.
        window.location.assign("/api/logout");
        return;
      }
      const warnAtMs = timeoutMs - warningSec * 1000;
      if (idleMs >= warnAtMs) {
        const remaining = Math.max(0, Math.ceil((timeoutMs - idleMs) / 1000));
        setSecondsRemaining(remaining);
        if (!warningOpen) setWarningOpen(true);
      } else if (warningOpen) {
        setWarningOpen(false);
      }
    }, 1000);

    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, onLocalActivity);
      }
      if (checkTimerRef.current) clearInterval(checkTimerRef.current);
      if (channel) channel.close();
    };
  }, [timeoutMs, warningSec, warningOpen]);

  const stayLoggedIn = () => {
    lastActivityRef.current = Date.now();
    setWarningOpen(false);
  };

  const logoutNow = () => {
    window.location.assign("/api/logout");
  };

  return { warningOpen, secondsRemaining, stayLoggedIn, logoutNow };
}
