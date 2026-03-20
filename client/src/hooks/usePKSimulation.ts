// client/src/hooks/usePKSimulation.ts

import { useMemo, useState, useEffect, useRef } from "react";
import {
  simulate,
  simulateForward,
  parsePatientCovariates,
  convertToMassPerMin,
  parseDrugConcentration,
  deriveBolusUnit,
  convertBolusToSegment,
  BOLUS_DURATION_MS,
} from "@/lib/pharmacokinetics";
import type { PKTimePoint, TargetEvent, RateSegment } from "@/lib/pharmacokinetics";

// ── Constants ────────────────────────────────────────────

const TICK_INTERVAL_MS = 15_000; // 15 seconds — keeps curves in sync with NOW line

// ── Local type (mirrors RateInfusionSession from useMedicationState) ──────────

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
  midBoluses?: Array<{ timestamp: number; dose: string }>;
}

// ── Swimlane metadata passed from UnifiedTimeline ───────

export interface SwimlaneMetadata {
  rateUnit: string | null;
  ampuleTotalContent: string | null;
}

// ── Types ────────────────────────────────────────────────

export type PKMode = "tiva" | "tci" | null;

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
  missingFields: string[];
  sexDefaultApplied: boolean;
  mode: PKMode;
  /** Timestamp where both Cp fall below 0.1 after all perfusors stopped — visualization cutoff */
  pkCutoffTime: number | null;
}

// ── Drug identification ───────────────────────────────────

const PROPOFOL_NAMES = ["propofol", "diprivan"];
const REMI_NAMES = ["remifentanil", "remi", "ultiva"];

/**
 * Identify the PK drug from a medication label.
 * Handles generic names, concentrations ("propofol 1%"), and brand names.
 */
export function identifyTCIDrug(label: string): "propofol" | "remifentanil" | null {
  const lower = label.toLowerCase();
  if (PROPOFOL_NAMES.some(name => lower.includes(name))) return "propofol";
  if (REMI_NAMES.some(name => lower.includes(name))) return "remifentanil";
  return null;
}

// ── Target extraction (TCI mode) ────────────────────────

/**
 * Convert RateInfusionSession[] to TargetEvent[] for the TCI PK engine.
 */
export function extractTCITargets(
  sessions: RateInfusionSession[],
  caseStartTime: number,
): TargetEvent[] {
  const events: TargetEvent[] = [];

  for (const session of sessions) {
    if (!session.startTime) continue;

    const startConc = parseFloat(session.startDose);
    if (!isNaN(startConc) && startConc > 0) {
      events.push({
        type: "start",
        timestamp: session.startTime,
        targetConcentration: startConc,
      });
    }

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

// ── Rate segment extraction (TIVA mode) ─────────────────

/**
 * Convert RateInfusionSession[] to RateSegment[] for forward simulation.
 * Each segment in a session maps to a RateSegment with converted mass/min rate.
 */
export function extractRateSegments(
  sessions: RateInfusionSession[],
  drug: "propofol" | "remifentanil",
  weightKg: number,
  swimlaneMetadata: Record<string, SwimlaneMetadata>,
  nowMs: number,
): RateSegment[] {
  const segments: RateSegment[] = [];

  for (const session of sessions) {
    if (!session.startTime) continue;

    // Get concentration from ampule content + syringe volume
    const meta = swimlaneMetadata[session.swimlaneId];
    const syringeVol = parseFloat(session.syringeQuantity) || 0;
    const concentrationMgPerMl = parseDrugConcentration(
      meta?.ampuleTotalContent,
      syringeVol,
    );
    const bolusUnit = deriveBolusUnit(meta?.rateUnit);

    // Initial bolus → short high-rate segment
    let hasBolus = false;
    if (session.initialBolus) {
      const bolusValue = parseFloat(session.initialBolus);
      if (!isNaN(bolusValue) && bolusValue > 0) {
        const bolusSeg = convertBolusToSegment(
          bolusValue, bolusUnit, drug, concentrationMgPerMl, session.startTime,
        );
        if (bolusSeg) {
          segments.push(bolusSeg);
          hasBolus = true;
        }
      }
    }

    // Mid-infusion boluses
    if (session.midBoluses) {
      for (const bolus of session.midBoluses) {
        const bolusValue = parseFloat(bolus.dose);
        if (!isNaN(bolusValue) && bolusValue > 0) {
          const bolusSeg = convertBolusToSegment(
            bolusValue, bolusUnit, drug, concentrationMgPerMl, bolus.timestamp,
          );
          if (bolusSeg) segments.push(bolusSeg);
        }
      }
    }

    // Continuous rate segments
    for (let i = 0; i < session.segments.length; i++) {
      const seg = session.segments[i];
      const rateValue = parseFloat(seg.rate);
      if (isNaN(rateValue) || rateValue <= 0) continue;

      const massPerMin = convertToMassPerMin(
        rateValue,
        seg.rateUnit,
        drug,
        weightKg,
        concentrationMgPerMl,
      );
      if (massPerMin === null) continue;

      // Offset first segment by bolus duration to avoid overlap
      const segStartTime = (i === 0 && hasBolus)
        ? seg.startTime + BOLUS_DURATION_MS
        : seg.startTime;

      // Segment end: next segment start, or session end, or now
      const nextSegStart = i + 1 < session.segments.length
        ? session.segments[i + 1].startTime
        : null;
      const endTime = nextSegStart
        ?? (session.endTime && session.state === "stopped" ? session.endTime : nowMs);

      if (segStartTime < endTime) {
        segments.push({
          startTime: segStartTime,
          endTime,
          rateMassPerMin: massPerMin,
        });
      }
    }
  }

  return segments.sort((a, b) => a.startTime - b.startTime);
}

// ── Rate unit classification ────────────────────────────

/** Rate units that indicate a manual/TIVA pump (not TCI, not bolus, not free-flow). */
const TIVA_RATE_UNITS = new Set([
  "mg/kg/h", "mg/kg/min", "mg/h", "mg/min",
  "μg/kg/min", "μg/kg/h", "μg/min", "μg/h",
  "ml/h", "ml/min",
]);

function isTivaRateUnit(rateUnit: string | null | undefined): boolean {
  if (!rateUnit) return false;
  // Normalize unicode variations
  const normalized = rateUnit
    .replace(/µ/g, "μ")
    .replace(/ug/gi, "μg")
    .replace(/mcg/gi, "μg")
    .trim();
  return TIVA_RATE_UNITS.has(normalized);
}

// ── Hook ─────────────────────────────────────────────────

export function usePKSimulation(
  patientData: { birthday?: string | null; sex?: string | null } | null,
  covariateData: { weight?: string | null; height?: string | null } | null,
  rateInfusionSessions: Record<string, RateInfusionSession[]>,
  swimlaneMetadata: Record<string, SwimlaneMetadata>,
  caseId: string | null,
  caseStartTime: number,
): PKSimulationResult {
  const tickRef = useRef(0);
  const [tick, setTick] = useState(0);

  // Parse patient covariates
  const parsed = useMemo(() => {
    if (!patientData || !covariateData) {
      return { covariates: null, missingFields: ["age", "weight", "height"], sexDefaultApplied: false };
    }
    return parsePatientCovariates({
      birthday: patientData.birthday ?? null,
      sex: patientData.sex ?? null,
      weight: covariateData.weight ?? null,
      height: covariateData.height ?? null,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientData?.birthday, patientData?.sex, covariateData?.weight, covariateData?.height]);

  // Classify sessions: TCI vs TIVA
  const classified = useMemo(() => {
    const tciPropofol: RateInfusionSession[] = [];
    const tciRemi: RateInfusionSession[] = [];
    const tivaPropofol: RateInfusionSession[] = [];
    const tivaRemi: RateInfusionSession[] = [];

    for (const [swimlaneId, sessions] of Object.entries(rateInfusionSessions)) {
      const meta = swimlaneMetadata[swimlaneId];
      const rateUnit = meta?.rateUnit;

      const isTCI = rateUnit === "TCI";
      const isTIVA = isTivaRateUnit(rateUnit);
      if (!isTCI && !isTIVA) continue;

      for (const session of sessions) {
        const drug = identifyTCIDrug(session.label);
        if (!drug) continue;

        if (isTCI) {
          if (drug === "propofol") tciPropofol.push(session);
          else tciRemi.push(session);
        } else {
          if (drug === "propofol") tivaPropofol.push(session);
          else tivaRemi.push(session);
        }
      }
    }

    return { tciPropofol, tciRemi, tivaPropofol, tivaRemi };
  }, [rateInfusionSessions, swimlaneMetadata]);

  // Determine mode: TIVA takes priority (it shows more info), then TCI, then null
  const mode: PKMode = useMemo(() => {
    if (classified.tivaPropofol.length > 0 || classified.tivaRemi.length > 0) return "tiva";
    if (classified.tciPropofol.length > 0 || classified.tciRemi.length > 0) return "tci";
    return null;
  }, [classified]);

  const isActive = mode !== null;

  // TCI targets (only used in TCI mode)
  const propofolTargets = useMemo(
    () => mode === "tci" ? extractTCITargets(classified.tciPropofol, caseStartTime) : [],
    [mode, classified.tciPropofol, caseStartTime],
  );
  const remiTargets = useMemo(
    () => mode === "tci" ? extractTCITargets(classified.tciRemi, caseStartTime) : [],
    [mode, classified.tciRemi, caseStartTime],
  );

  // Background tick for periodic refresh
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      tickRef.current++;
      setTick(tickRef.current);
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isActive]);

  // Run PK simulation — segments + simulation computed together so Date.now() is fresh
  const pkTimeSeries = useMemo(() => {
    if (!isActive || !parsed.covariates) return [];

    const now = Date.now();
    const timeRange = { start: caseStartTime, end: now };

    if (mode === "tci") {
      if (propofolTargets.length === 0 && remiTargets.length === 0) return [];
      return simulate(parsed.covariates, propofolTargets, remiTargets, timeRange);
    } else if (mode === "tiva") {
      const propSegs = extractRateSegments(classified.tivaPropofol, "propofol", parsed.covariates.weight, swimlaneMetadata, now);
      const remiSegs = extractRateSegments(classified.tivaRemi, "remifentanil", parsed.covariates.weight, swimlaneMetadata, now);
      if (propSegs.length === 0 && remiSegs.length === 0) return [];
      return simulateForward(parsed.covariates, propSegs, remiSegs, timeRange);
    }

    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsed.covariates, propofolTargets, remiTargets, classified.tivaPropofol, classified.tivaRemi, swimlaneMetadata, caseStartTime, isActive, mode, tick]);

  // Most-recent values
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

  // Cutoff: when both Cp < 0.1 after ALL perfusors are stopped
  const pkCutoffTime = useMemo(() => {
    const allSessions = [
      ...classified.tivaPropofol, ...classified.tivaRemi,
      ...classified.tciPropofol, ...classified.tciRemi,
    ];
    if (allSessions.length === 0) return null;
    const allStopped = allSessions.every(s => s.state === "stopped");
    if (!allStopped) return null;

    const latestStop = Math.max(...allSessions.map(s => s.endTime ?? 0));
    if (latestStop === 0) return null;

    const CP_CUTOFF = 0.1;
    for (const pt of pkTimeSeries) {
      if (pt.timestamp < latestStop) continue;
      const propCpBelow = pt.propofolCp === null || pt.propofolCp < CP_CUTOFF;
      const remiCpBelow = pt.remiCp === null || pt.remiCp < CP_CUTOFF;
      if (propCpBelow && remiCpBelow) return pt.timestamp;
    }
    return null;
  }, [pkTimeSeries, classified]);

  // After cutoff, null out sidebar values — concentrations are clinically irrelevant
  const displayValues = useMemo(() => {
    if (pkCutoffTime != null) return null;
    return currentValues;
  }, [currentValues, pkCutoffTime]);

  return {
    pkTimeSeries,
    currentValues: displayValues,
    isActive,
    missingFields: parsed.missingFields,
    sexDefaultApplied: parsed.sexDefaultApplied,
    mode,
    pkCutoffTime,
  };
}
