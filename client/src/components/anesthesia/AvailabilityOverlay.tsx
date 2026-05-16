import { useQuery } from "@tanstack/react-query";

export interface BusyWindow {
  start: string;
  end: string;
  room_id: string;
  reason: string;
}

interface AvailabilityOverlayProps {
  destinationHospitalId: string;
  fromIso: string;
  toIso: string;
}

/**
 * Fetches and renders muted/striped busy-zone overlays for a clinic-linked
 * room column. Intended to be mounted inside a `position: relative` container
 * that spans the full visible time range (fromIso → toIso).
 *
 * In the OPCalendar day view, busy windows are fed into react-big-calendar's
 * `backgroundEvents` prop (via `useBusyWindows`) so that they render per
 * resource column. This standalone visual component is available for use in
 * non-RBC calendar contexts.
 */
export function AvailabilityOverlay({ destinationHospitalId, fromIso, toIso }: AvailabilityOverlayProps) {
  const { data } = useQuery<{ busyWindows: BusyWindow[] }>({
    queryKey: ["availability", destinationHospitalId, fromIso, toIso],
    queryFn: async () => {
      const r = await fetch(
        `/api/referral-partnerships/${destinationHospitalId}/availability?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
      );
      if (!r.ok) throw new Error("availability fetch failed");
      return r.json();
    },
    staleTime: 30_000,
  });

  const windows = data?.busyWindows ?? [];

  return (
    <>
      {windows.map((w, i) => {
        const start = new Date(w.start);
        const end = new Date(w.end);
        const topPct = computeTopPct(start, fromIso, toIso);
        const heightPct = computeHeightPct(start, end, fromIso, toIso);
        return (
          <div
            key={`busy-${i}`}
            data-busy="true"
            data-testid={`busy-overlay-${i}`}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: `${topPct}%`,
              height: `${heightPct}%`,
              background:
                "repeating-linear-gradient(45deg, rgba(229,231,235,0.85), rgba(229,231,235,0.85) 4px, rgba(243,244,246,0.85) 4px, rgba(243,244,246,0.85) 8px)",
              pointerEvents: "auto",
              zIndex: 5,
              cursor: "not-allowed",
            }}
            title="Not available at this destination — pick another time"
          />
        );
      })}
    </>
  );
}

function computeTopPct(start: Date, fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(0, ((start.getTime() - from) / (to - from)) * 100);
}

function computeHeightPct(start: Date, end: Date, fromIso: string, toIso: string): number {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return Math.max(1, ((end.getTime() - start.getTime()) / (to - from)) * 100);
}

/**
 * Hook that fetches busy windows for a linked destination hospital over the
 * visible time range. Used by OPCalendar to feed data into RBC `backgroundEvents`
 * and slot-click guards.
 */
export function useBusyWindows(
  destinationHospitalId: string | null | undefined,
  fromIso: string,
  toIso: string
): BusyWindow[] {
  const { data } = useQuery<{ busyWindows: BusyWindow[] }>({
    queryKey: ["availability", destinationHospitalId, fromIso, toIso],
    queryFn: async () => {
      const r = await fetch(
        `/api/referral-partnerships/${destinationHospitalId}/availability?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`
      );
      if (!r.ok) throw new Error("availability fetch failed");
      return r.json();
    },
    staleTime: 30_000,
    enabled: !!destinationHospitalId,
  });
  return data?.busyWindows ?? [];
}
