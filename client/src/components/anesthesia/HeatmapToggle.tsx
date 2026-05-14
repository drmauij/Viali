import { useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "opCalendar.heatmapEnabled";

export function useHeatmapEnabled() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(STORAGE_KEY) === "true";
  });
  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "true" : "false");
    } catch {
      /* noop */
    }
  }, []);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(e.newValue === "true");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return { enabled, setEnabled };
}

export interface HeatmapToggleProps {
  enabled: boolean;
  onChange: (next: boolean) => void;
}

export function HeatmapToggle({ enabled, onChange }: HeatmapToggleProps) {
  return (
    <button
      type="button"
      role="button"
      onClick={() => onChange(!enabled)}
      data-state={enabled ? "on" : "off"}
      data-testid="heatmap-toggle"
      aria-pressed={enabled}
      aria-label="Risk heat-map"
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs border transition-colors ${
        enabled
          ? "border-transparent bg-gradient-to-r from-green-500 via-orange-500 to-red-500 text-white font-semibold"
          : "border-slate-600 bg-slate-700 text-slate-300 hover:bg-slate-600"
      }`}
    >
      <span
        className={`inline-block w-6 h-3 rounded-full relative transition-colors ${
          enabled ? "bg-white/30" : "bg-slate-600"
        }`}
      >
        <span
          className={`absolute top-0.5 w-2 h-2 rounded-full bg-white transition-all ${
            enabled ? "left-3" : "left-0.5"
          }`}
        />
      </span>
      Risk heat-map
    </button>
  );
}
