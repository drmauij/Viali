export function RiskMethodology() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100" data-testid="page-risk-methodology">
      <h1 className="text-2xl font-bold mb-2">Perioperative Risk Grade</h1>
      <p className="text-slate-300 mb-6">
        The risk grade is a single green / orange / red signal showing global perioperative risk.
        It is computed automatically from existing patient and surgery data and updates whenever
        comorbidities, the questionnaire, or the surgery itself changes.
      </p>
      <p className="text-slate-300 mb-8">
        <strong>Aggregation:</strong> the worst band across five independent domains drives the
        grade. If any domain is high, the grade is red; if any is med (and none high), it is
        orange; otherwise green. Patients aged 75 or older are bumped one band up (never down).
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Cardiac &mdash; RCRI</h2>
        <p className="text-slate-300">
          Revised Cardiac Risk Index (Lee et al., 1999). Counts of: high-risk surgery, ischemic
          heart disease, congestive heart failure, cerebrovascular disease, insulin-dependent
          diabetes, serum creatinine &gt; 2 mg/dL. Bands: low (0 pts) / med (1 pt) / high (&ge;2 pts).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">VTE &mdash; Caprini</h2>
        <p className="text-slate-300">
          Caprini score for venous thromboembolism risk. Combines age, BMI, surgery type, malignancy,
          mobility, VTE history, varicose veins, hormonal therapy, and pregnancy. Bands:
          low (0&ndash;2 pts) / med (3&ndash;4 pts) / high (&ge;5 pts).
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Pulmonary &mdash; Viali pulmonary v1</h2>
        <p className="text-slate-300">
          Custom Viali approximation. Bands: high if COPD present; med if current smoker AND
          (age &ge; 70 OR planned duration &gt; 180 min); otherwise low. This is <em>not</em>
          a validated published score &mdash; it is an explicit approximation using only inputs we
          already capture. A future iteration will replace it with full ARISCAT once SpO2,
          recent respiratory infection, and Hb capture are added.
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Frailty &mdash; mFI-5</h2>
        <p className="text-slate-300">
          5-Factor Modified Frailty Index. Counts of: diabetes, COPD/recent pneumonia, congestive
          heart failure, hypertension requiring meds, and functional dependence in daily
          activities. Bands: low (0) / med (1&ndash;2) / high (&ge;3). Until the functional-dependence
          question on the pre-op questionnaire is answered, the score runs on the 4 available
          factors and is marked <em>partial</em>.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">Surgery weight</h2>
        <p className="text-slate-300">
          Bands directly from the surgery&apos;s risk class: minor &rarr; low, standard / large &rarr; med,
          critical &rarr; high.
        </p>
      </section>

      <footer className="text-xs text-slate-500 border-t border-slate-700 pt-4">
        Methodology v1 &middot; effective 2026-05-13. Threshold or formula changes will bump the
        version number.
      </footer>
    </div>
  );
}

export default RiskMethodology;
