// client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx
import { useMemo } from "react";
import type { PKTimePoint } from "@/lib/pharmacokinetics";
import { useTimelineContext } from "../TimelineContext";

export interface PKPredictionSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  pkTimeSeries: PKTimePoint[];
  isDark: boolean;
  /** When set, visualization stops at this timestamp with an end marker */
  cutoffTime?: number | null;
}

const COLORS = {
  propofolCp: "#2dd4bf", // teal-400
  propofolCe: "#14b8a6", // teal-500
  remiCp: "#f472b6",     // pink-400
  remiCe: "#ec4899",     // pink-500
};

function buildPolylinePoints(
  points: Array<{ x: number; y: number }>,
): string {
  return points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join(" ");
}

export function PKPredictionSwimlane({
  swimlanePositions,
  pkTimeSeries,
  isDark,
  cutoffTime,
}: PKPredictionSwimlaneProps) {
  // Read viewport from context (same source as echarts chart) — props can be stale during auto-scroll
  const { currentZoomStart, currentZoomEnd, data } = useTimelineContext();
  const visibleStart = currentZoomStart ?? data.startTime;
  const visibleEnd = currentZoomEnd ?? data.endTime;
  const lane = swimlanePositions.find((l) => l.id === "pk-prediction");
  if (!lane) return null;

  const visibleRange = visibleEnd - visibleStart;

  // Filter to only visible points (with a small margin on each side for smooth entry/exit)
  // When cutoffTime is set, also truncate at that point
  const visiblePoints = useMemo(() => {
    if (!pkTimeSeries.length || visibleRange <= 0) return [];
    const margin = visibleRange * 0.02;
    const upperBound = cutoffTime != null ? Math.min(visibleEnd + margin, cutoffTime) : visibleEnd + margin;
    return pkTimeSeries.filter(
      (pt) => pt.timestamp >= visibleStart - margin && pt.timestamp <= upperBound,
    );
  }, [pkTimeSeries, visibleStart, visibleEnd, visibleRange, cutoffTime]);

  // Separate Y-axis scales: propofol in μg/ml (0–8), remi in ng/ml (0–12)
  const PROPOFOL_MAX = 8;
  const REMI_MAX = 12;

  // Map a value in [0, max] to a Y coordinate in [0, 100] (SVG viewBox 0–100, top=0 is top of lane)
  // We invert so higher concentration is higher on screen (lower Y value).
  // Leave a small padding (5% top/bottom) so lines don't clip at the edges.
  const PADDING = 5;
  const RANGE = 100 - 2 * PADDING;

  function toY(value: number, max: number): number {
    const clamped = Math.max(0, Math.min(value, max));
    return PADDING + RANGE * (1 - clamped / max);
  }

  function toX(timestamp: number): number {
    if (visibleRange <= 0) return 0;
    return ((timestamp - visibleStart) / visibleRange) * 100;
  }

  const propofolCpPoints = useMemo(
    () =>
      visiblePoints
        .filter((pt) => pt.propofolCp !== null)
        .map((pt) => ({ x: toX(pt.timestamp), y: toY(pt.propofolCp!, PROPOFOL_MAX) })),
    [visiblePoints, visibleStart, visibleRange],
  );

  const propofolCePoints = useMemo(
    () =>
      visiblePoints
        .filter((pt) => pt.propofolCe !== null)
        .map((pt) => ({ x: toX(pt.timestamp), y: toY(pt.propofolCe!, PROPOFOL_MAX) })),
    [visiblePoints, visibleStart, visibleRange],
  );

  const remiCpPoints = useMemo(
    () =>
      visiblePoints
        .filter((pt) => pt.remiCp !== null)
        .map((pt) => ({ x: toX(pt.timestamp), y: toY(pt.remiCp!, REMI_MAX) })),
    [visiblePoints, visibleStart, visibleRange],
  );

  const remiCePoints = useMemo(
    () =>
      visiblePoints
        .filter((pt) => pt.remiCe !== null)
        .map((pt) => ({ x: toX(pt.timestamp), y: toY(pt.remiCe!, REMI_MAX) })),
    [visiblePoints, visibleStart, visibleRange],
  );


  return (
    <div
      className="absolute"
      style={{
        left: "200px",
        right: "10px",
        top: `${lane.top}px`,
        height: `${lane.height}px`,
        overflow: "hidden",
        zIndex: 30,
      }}
    >
      {/* SVG curves */}
      <svg
        className="absolute inset-0"
        style={{ width: "100%", height: "100%" }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Propofol Cp — solid teal */}
        {propofolCpPoints.length > 1 && (
          <polyline
            points={buildPolylinePoints(propofolCpPoints)}
            fill="none"
            stroke={COLORS.propofolCp}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            opacity={0.9}
          />
        )}
        {/* Propofol Ce — dashed teal */}
        {propofolCePoints.length > 1 && (
          <polyline
            points={buildPolylinePoints(propofolCePoints)}
            fill="none"
            stroke={COLORS.propofolCe}
            strokeWidth="1.5"
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
            opacity={0.9}
          />
        )}
        {/* Remi Cp — solid pink */}
        {remiCpPoints.length > 1 && (
          <polyline
            points={buildPolylinePoints(remiCpPoints)}
            fill="none"
            stroke={COLORS.remiCp}
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            opacity={0.9}
          />
        )}
        {/* Remi Ce — dashed pink */}
        {remiCePoints.length > 1 && (
          <polyline
            points={buildPolylinePoints(remiCePoints)}
            fill="none"
            stroke={COLORS.remiCe}
            strokeWidth="1.5"
            strokeDasharray="3,2"
            vectorEffect="non-scaling-stroke"
            opacity={0.9}
          />
        )}

        {/* End markers when cutoff is active */}
        {cutoffTime != null && (
          <>
            {propofolCpPoints.length > 0 && (() => {
              const last = propofolCpPoints[propofolCpPoints.length - 1];
              return <circle cx={last.x} cy={last.y} r="3" fill={COLORS.propofolCp} opacity={0.9} vectorEffect="non-scaling-stroke" />;
            })()}
            {propofolCePoints.length > 0 && (() => {
              const last = propofolCePoints[propofolCePoints.length - 1];
              return <circle cx={last.x} cy={last.y} r="3" fill={COLORS.propofolCe} opacity={0.9} vectorEffect="non-scaling-stroke" />;
            })()}
            {remiCpPoints.length > 0 && (() => {
              const last = remiCpPoints[remiCpPoints.length - 1];
              return <circle cx={last.x} cy={last.y} r="3" fill={COLORS.remiCp} opacity={0.9} vectorEffect="non-scaling-stroke" />;
            })()}
            {remiCePoints.length > 0 && (() => {
              const last = remiCePoints[remiCePoints.length - 1];
              return <circle cx={last.x} cy={last.y} r="3" fill={COLORS.remiCe} opacity={0.9} vectorEffect="non-scaling-stroke" />;
            })()}
          </>
        )}
      </svg>

      {/* Values are shown in the sidebar (MedicationItemsSidebar) for better readability */}

    </div>
  );
}
