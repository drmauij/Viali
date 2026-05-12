import { describe, it, expect } from "vitest";
import { suggestConcept } from "../suggestConcept";

describe("suggestConcept (heuristic)", () => {
  const cases: Array<{ label: string; id?: string; translations?: Record<string, string>; expected: string | null }> = [
    // Hypertension — English / abbreviation / German
    { label: "Hypertension (HTN)", expected: "HYPERTENSION" },
    { id: "htn", label: "HTN", expected: "HYPERTENSION" },
    { label: "Bluthochdruck", expected: "HYPERTENSION" },
    { label: "Arterielle Hypertonie", expected: "HYPERTENSION" },

    // CAD
    { label: "Coronary Heart Disease (CHD)", expected: "CAD" },
    { label: "Coronary Artery Disease", expected: "CAD" },
    { id: "khk", label: "KHK", expected: "CAD" },
    { label: "Koronare Herzkrankheit", expected: "CAD" },
    { label: "Herzinfarkt (anamnestisch)", expected: "CAD" },

    // CHF
    { label: "Heart Failure", expected: "CHF" },
    { label: "Herzinsuffizienz", expected: "CHF" },
    { label: "CHF NYHA III", expected: "CHF" },

    // Stroke — specific stroke flavor must win over generic
    { label: "Recent Stroke (<30 days)", expected: "RECENT_STROKE_30D" },
    { label: "Schlaganfall in den letzten 30 Tagen", expected: "RECENT_STROKE_30D" },
    { label: "Stroke History", expected: "STROKE_HISTORY" },
    { label: "Schlaganfall", expected: "STROKE_HISTORY" },
    { label: "TIA", expected: "STROKE_HISTORY" },

    // Insulin diabetes
    { label: "Diabetes (insulin-dependent)", expected: "INSULIN_DIABETES" },
    { label: "Insulinabhängiger Diabetes", expected: "INSULIN_DIABETES" },
    { label: "IDDM", expected: "INSULIN_DIABETES" },
    // Generic diabetes — should NOT match insulin (other concepts will not match either → null)
    { label: "Diabetes", expected: null },

    // VTE
    { label: "Venous Thromboembolism (VTE)", expected: "VTE_HISTORY" },
    { label: "Deep Vein Thrombosis", expected: "VTE_HISTORY" },
    { label: "Lungenembolie", expected: "VTE_HISTORY" },
    { label: "Pulmonary Embolism", expected: "VTE_HISTORY" },
    { label: "Tiefe Beinvenenthrombose", expected: "VTE_HISTORY" },

    // Family thrombophilia (must beat generic VTE)
    { label: "Familiare Thrombophilie", expected: "FAMILY_THROMBOPHILIA" },
    { label: "Family Thrombophilia", expected: "FAMILY_THROMBOPHILIA" },
    { label: "Factor V Leiden", expected: "FAMILY_THROMBOPHILIA" },

    // Renal
    { label: "Chronic Kidney Disease (CKD)", expected: "CKD_OR_DIALYSIS" },
    { label: "Niereninsuffizienz", expected: "CKD_OR_DIALYSIS" },
    { label: "Dialyse", expected: "CKD_OR_DIALYSIS" },

    // Active cancer
    { label: "Active Cancer / Malignancy", expected: "ACTIVE_CANCER" },
    { label: "Aktives Malignom", expected: "ACTIVE_CANCER" },

    // Caprini risk modifiers
    { label: "Leg Swelling / Edema", expected: "LEG_SWELLING" },
    { label: "Beinschwellung", expected: "LEG_SWELLING" },
    { label: "Varicose Veins", expected: "VARICOSE_VEINS" },
    { label: "Krampfadern", expected: "VARICOSE_VEINS" },

    // Reproductive
    { label: "Pregnancy", expected: "PREGNANCY_OR_POSTPARTUM" },
    { label: "Postpartum (≤6 weeks)", expected: "PREGNANCY_OR_POSTPARTUM" },
    { label: "Schwangerschaft", expected: "PREGNANCY_OR_POSTPARTUM" },
    { label: "Oral Contraceptives", expected: "OC_OR_HRT" },
    { label: "Antibabypille", expected: "OC_OR_HRT" },

    // Pulmonary
    { label: "COPD", expected: "COPD" },
    { label: "Chronic Obstructive Pulmonary Disease", expected: "COPD" },
    { label: "Untreated Sleep Apnea", expected: "KNOWN_UNTREATED_OSAS" },
    { label: "Unbehandelte Schlafapnoe", expected: "KNOWN_UNTREATED_OSAS" },

    // Spinal cord injury
    { label: "Spinal Cord Injury", expected: "SPINAL_CORD_INJURY" },
    { label: "Querschnittlähmung", expected: "SPINAL_CORD_INJURY" },

    // PONV
    { label: "Previous PONV", expected: "PONV_HISTORY" },
    { label: "Motion Sickness", expected: "PONV_HISTORY" },
    { label: "Post-operative Nausea/Vomiting", expected: "PONV_HISTORY" },
    { label: "Reisekrankheit", expected: "PONV_HISTORY" },

    // No match (control)
    { label: "Loose Teeth", expected: null },
    { label: "Dental Implants", expected: null },
    { label: "Asthma", expected: null },

    // Translations should be considered
    {
      id: "custom1",
      label: "Hochdruck",
      translations: { en: "High Blood Pressure", de: "Bluthochdruck" },
      expected: "HYPERTENSION",
    },
    {
      id: "custom2",
      label: "Eigene Bezeichnung",
      translations: { en: "Sleep Apnea" },
      // Generic sleep apnea (no "untreated") shouldn't trigger KNOWN_UNTREATED_OSAS
      expected: null,
    },
  ];

  for (const c of cases) {
    it(`maps "${c.label}" → ${c.expected ?? "null"}`, () => {
      const result = suggestConcept({
        id: c.id,
        label: c.label,
        labelTranslations: c.translations as any,
      });
      expect(result).toBe(c.expected);
    });
  }
});
