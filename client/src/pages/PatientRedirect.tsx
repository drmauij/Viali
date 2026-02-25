import { useEffect } from "react";
import { useLocation, useParams, useSearch } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useAuth } from "@/hooks/useAuth";

const PATIENT_CAPABLE_UNITS = ["anesthesia", "or", "clinic"] as const;

const UNIT_TO_MODULE: Record<string, string> = {
  anesthesia: "/anesthesia",
  or: "/surgery",
  clinic: "/clinic",
};

export default function PatientRedirect() {
  const [, navigate] = useLocation();
  const params = useParams<{ id?: string }>();
  const search = useSearch();
  const activeHospital = useActiveHospital();
  const { user } = useAuth();

  useEffect(() => {
    let modulePrefix: string | undefined;

    // Try active unit first
    const unitType = activeHospital?.unitType;
    if (unitType && unitType in UNIT_TO_MODULE) {
      modulePrefix = UNIT_TO_MODULE[unitType];
    }

    // If active unit can't handle patients, find a patient-capable unit on the same hospital
    if (!modulePrefix) {
      const hospitals = (user as any)?.hospitals as Array<{ id: string; unitType?: string | null }> | undefined;
      if (hospitals && activeHospital) {
        const match = hospitals.find(
          (h) =>
            h.id === activeHospital.id &&
            h.unitType &&
            (PATIENT_CAPABLE_UNITS as readonly string[]).includes(h.unitType),
        );
        if (match?.unitType) {
          modulePrefix = UNIT_TO_MODULE[match.unitType];
        }
      }
    }

    // Fallback
    if (!modulePrefix) {
      modulePrefix = "/anesthesia";
    }

    const path = params.id ? `${modulePrefix}/patients/${params.id}` : `${modulePrefix}/patients`;
    const fullUrl = search ? `${path}?${search}` : path;
    navigate(fullUrl, { replace: true });
  }, [activeHospital, user, params.id, search, navigate]);

  return null;
}
