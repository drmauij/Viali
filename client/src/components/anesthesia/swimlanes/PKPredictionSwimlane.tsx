// client/src/components/anesthesia/swimlanes/PKPredictionSwimlane.tsx
import { useMemo } from "react";
import type { PKTimePoint } from "@/lib/pharmacokinetics";

export interface PKPredictionSwimlaneProps {
  swimlanePositions: Array<{ id: string; top: number; height: number }>;
  pkTimeSeries: PKTimePoint[];
  currentValues: {
    propofolCp: number | null;
    propofolCe: number | null;
    remiCp: number | null;
    remiCe: number | null;
    eBIS: number | null;
  } | null;
  visibleStart: number;
  visibleEnd: number;
  isDark: boolean;
  onDismiss: () => void;
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
  currentValues,
  visibleStart,
  visibleEnd,
  isDark,
  onDismiss,
}: PKPredictionSwimlaneProps) {
  const lane = swimlanePositions.find((l) => l.id === "pk-prediction");
  if (!lane) return null;

  const visibleRange = visibleEnd - visibleStart;

  // Filter to only visible points (with a small margin on each side for smooth entry/exit)
  const visiblePoints = useMemo(() => {
    if (!pkTimeSeries.length || visibleRange <= 0) return [];
    const margin = visibleRange * 0.02;
    return pkTimeSeries.filter(
      (pt) => pt.timestamp >= visibleStart - margin && pt.timestamp <= visibleEnd + margin,
    );
  }, [pkTimeSeries, visibleStart, visibleEnd, visibleRange]);

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

  const textColor = isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.75)";
  const bgColor = isDark ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.7)";

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
      {/* Dismiss button */}
      <button
        className="absolute z-40 rounded-full flex items-center justify-center text-xs font-bold transition-colors"
        style={{
          right: 4,
          top: 4,
          width: 16,
          height: 16,
          background: isDark ? "rgba(255,255,255,0.15)" : "rgba(0,0,0,0.12)",
          color: textColor,
          lineHeight: 1,
          border: "none",
          cursor: "pointer",
        }}
        onClick={onDismiss}
        title="Hide PK prediction"
      >
        ×
      </button>

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
      </svg>

      {/* Current values label at right edge */}
      {currentValues && (
        <div
          className="absolute flex flex-col gap-0.5 pointer-events-none"
          style={{
            right: 20,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 35,
            background: bgColor,
            borderRadius: 4,
            padding: "2px 5px",
            fontFamily: "monospace",
            fontSize: 10,
            lineHeight: 1.4,
          }}
        >
          {currentValues.propofolCp !== null && (
            <span style={{ color: COLORS.propofolCp }}>
              Prop {currentValues.propofolCp.toFixed(1)} / {(currentValues.propofolCe ?? 0).toFixed(1)} μg/ml
            </span>
          )}
          {currentValues.remiCp !== null && (
            <span style={{ color: COLORS.remiCp }}>
              Remi {currentValues.remiCp.toFixed(1)} / {(currentValues.remiCe ?? 0).toFixed(1)} ng/ml
            </span>
          )}
        </div>
      )}
    </div>
  );
}
