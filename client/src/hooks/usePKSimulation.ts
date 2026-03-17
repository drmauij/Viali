// client/src/hooks/usePKSimulation.ts

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { simulate, parsePatientCovariates } from "@/lib/pharmacokinetics";
import type { PKTimePoint, TargetEvent } from "@/lib/pharmacokinetics";

// ── Constants ────────────────────────────────────────────

const TICK_INTERVAL_MS = 120_000; // 2 minutes
const DISMISS_KEY_PREFIX = "pk-dismiss-";
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Local type (mirrors RateInfusionSession from useMedicationState) ──────────
// Defined locally to avoid circular dependency concerns.

export interface RateInfusionSession {
  id: string;
  swimlaneId: string;
  label: string;
  syringeQuantity: string;
  startDose: string;
  startNote?: string | null;
  initialBolus?: string | null;
  segments: Array<{ startTime: number; rate: string; rateUnit: string }>;
  state: "running" | "paused" | "stopped";
  startTime?: number;
  endTime?: number | null;
  actualAmountUsed?: string | null;
  stopRecordId?: string | null;
}

// ── Types ────────────────────────────────────────────────

export interface PKSimulationResult {
  pkTimeSeries: PKTimePoint[];
  currentValues: {
    propofolCp: number | null;
    propofolCe: number | null;
    remiCp: number | null;
    remiCe: number | null;
    eBIS: number | null;
  } | null;
  isActive: boolean;
  isDismissed: boolean;
  missingFields: string[];
  sexDefaultApplied: boolean;
  dismiss: () => void;
  restore: () => void;
}

// ── Drug identification ───────────────────────────────────

const PROPOFOL_NAMES = ["propofol", "diprivan"];
const REMI_NAMES = ["remifentanil", "remi", "ultiva"];

/**
 * Identify the TCI drug from a medication label.
 * Handles generic names, concentrations ("propofol 1%"), and brand names.
 * Returns null for unknown drugs.
 */
export function identifyTCIDrug(label: string): "propofol" | "remifentanil" | null {
  const lower = label.toLowerCase();
  if (PROPOFOL_NAMES.some(name => lower.includes(name))) return "propofol";
  if (REMI_NAMES.some(name => lower.includes(name))) return "remifentanil";
  return null;
}

// ── Target extraction ────────────────────────────────────

/**
 * Convert RateInfusionSession[] to TargetEvent[] for the PK engine.
 * Each session contributes: a start event, optional rate_change events
 * (from segments[1+]), and a stop event if the session has ended.
 */
export function extractTCITargets(
  sessions: RateInfusionSession[],
  caseStartTime: number,
): TargetEvent[] {
  const events: TargetEvent[] = [];

  for (const session of sessions) {
    if (!session.startTime) continue;

    // Start event (use startDose as initial target concentration)
    const startConc = parseFloat(session.startDose);
    if (!isNaN(startConc) && startConc > 0) {
      events.push({
        type: "start",
        timestamp: session.startTime,
        targetConcentration: startConc,
      });
    }

    // Rate change segments — skip index 0 (that's the start event above)
    for (let i = 1; i < session.segments.length; i++) {
      const seg = session.segments[i];
      const conc = parseFloat(seg.rate);
      if (!isNaN(conc) && conc > 0) {
        events.push({
          type: "rate_change",
          timestamp: seg.startTime,
          targetConcentration: conc,
        });
      }
    }

    // Stop event
    if (session.endTime && session.state === "stopped") {
      events.push({
        type: "stop",
        timestamp: session.endTime,
        targetConcentration: 0,
      });
    }
  }

  return events.sort((a, b) => a.timestamp - b.timestamp);
}

// ── Dismiss key cleanup ───────────────────────────────────

function cleanupDismissKeys(): void {
  const now = Date.now();
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(DISMISS_KEY_PREFIX)) {
      try {
        const ts = parseInt(localStorage.getItem(key) || "0", 10);
        if (now - ts > DISMISS_TTL_MS) {
          keysToRemove.push(key);
        }
      } catch { /* ignore */ }
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

// ── Hook ─────────────────────────────────────────────────

export function usePKSimulation(
  patientData: { birthday?: string | null; sex?: string | null } | null,
  anesthesiaRecord: { weight?: string | null; height?: string | null } | null,
  rateInfusionSessions: Record<string, RateInfusionSession[]>,
  swimlaneRateUnits: Record<string, string | null | undefined>,
  caseId: string | null,
  caseStartTime: number,
): PKSimulationResult {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (!caseId) return false;
    return localStorage.getItem(`${DISMISS_KEY_PREFIX}${caseId}`) !== null;
  });

  // Cleanup old dismiss keys on mount
  useEffect(() => { cleanupDismissKeys(); }, []);

  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  // Parse patient covariates from raw patient/record data
  const parsed = useMemo(() => {
    if (!patientData || !anesthesiaRecord) {
      return { covariates: null, missingFields: ["age", "weight", "height"], sexDefaultApplied: false };
    }
    return parsePatientCovariates({
      birthday: patientData.birthday ?? null,
      sex: patientData.sex ?? null,
      weight: anesthesiaRecord.weight ?? null,
      height: anesthesiaRecord.height ?? null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientData?.birthday, patientData?.sex, anesthesiaRecord?.weight, anesthesiaRecord?.height]);

  // Identify TCI sessions by swimlane rate unit and drug label
  const tciSessions = useMemo(() => {
    const propofol: RateInfusionSession[] = [];
    const remi: RateInfusionSession[] = [];

    for (const [swimlaneId, sessions] of Object.entries(rateInfusionSessions)) {
      const rateUnit = swimlaneRateUnits[swimlaneId];
      if (rateUnit !== "TCI") continue;

      for (const session of sessions) {
        const drug = identifyTCIDrug(session.label);
        if (drug === "propofol") {
          propofol.push(session);
        } else if (drug === "remifentanil") {
          remi.push(session);
        }
      }
    }

    return { propofol, remi };
  }, [rateInfusionSessions, swimlaneRateUnits]);

  const isActive = tciSessions.propofol.length > 0 || tciSessions.remi.length > 0;

  // Extract TargetEvent arrays for each drug
  const propofolTargets = useMemo(
    () => extractTCITargets(tciSessions.propofol, caseStartTime),
    [tciSessions.propofol, caseStartTime],
  );
  const remiTargets = useMemo(
    () => extractTCITargets(tciSessions.remi, caseStartTime),
    [tciSessions.remi, caseStartTime],
  );

  // Background tick so Ce equilibration updates every 2 minutes
  useEffect(() => {
    if (!isActive || isDismissed) return;
    const interval = setInterval(() => {
      tickRef.current++;
      setTick(tickRef.current);
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActive, isDismissed]);

  // Run PK simulation; re-runs on target changes and periodic tick
  const pkTimeSeries = useMemo(() => {
    if (!isActive || !parsed.covariates) return [];
    if (propofolTargets.length === 0 && remiTargets.length === 0) return [];

    const now = Date.now();
    return simulate(parsed.covariates, propofolTargets, remiTargets, {
      start: caseStartTime,
      end: now,
    });
    // `tick` is included so the series refreshes on the background interval
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.covariates, propofolTargets, remiTargets, caseStartTime, isActive, tick]);

  // Most-recent values (last time point)
  const currentValues = useMemo(() => {
    if (pkTimeSeries.length === 0) return null;
    const last = pkTimeSeries[pkTimeSeries.length - 1];
    return {
      propofolCp: last.propofolCp,
      propofolCe: last.propofolCe,
      remiCp: last.remiCp,
      remiCe: last.remiCe,
      eBIS: last.eBIS,
    };
  }, [pkTimeSeries]);

  const dismiss = useCallback(() => {
    setIsDismissed(true);
    if (caseId) {
      localStorage.setItem(`${DISMISS_KEY_PREFIX}${caseId}`, String(Date.now()));
    }
  }, [caseId]);

  const restore = useCallback(() => {
    setIsDismissed(false);
    if (caseId) {
      localStorage.removeItem(`${DISMISS_KEY_PREFIX}${caseId}`);
    }
  }, [caseId]);

  return {
    pkTimeSeries,
    currentValues,
    isActive,
    isDismissed,
    missingFields: parsed.missingFields,
    sexDefaultApplied: parsed.sexDefaultApplied,
    dismiss,
    restore,
  };
}
