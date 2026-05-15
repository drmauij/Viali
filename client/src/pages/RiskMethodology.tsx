import { useTranslation } from "react-i18next";

export function RiskMethodology() {
  const { t } = useTranslation();

  const sections: Array<{ titleKey: string; bodyKey: string }> = [
    { titleKey: "riskMethodology.cardiac.title", bodyKey: "riskMethodology.cardiac.body" },
    { titleKey: "riskMethodology.vte.title", bodyKey: "riskMethodology.vte.body" },
    { titleKey: "riskMethodology.pulmonary.title", bodyKey: "riskMethodology.pulmonary.body" },
    { titleKey: "riskMethodology.frailty.title", bodyKey: "riskMethodology.frailty.body" },
    { titleKey: "riskMethodology.surgery.title", bodyKey: "riskMethodology.surgery.body" },
  ];

  const examples = ["a", "b", "c", "d"] as const;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100" data-testid="page-risk-methodology">
      <h1 className="text-2xl font-bold mb-2">{t("riskMethodology.title")}</h1>
      <p className="text-slate-300 mb-6">{t("riskMethodology.intro")}</p>

      <section className="mb-8" data-testid="how-calculated-section">
        <h2 className="text-xl font-semibold mb-3">{t("riskMethodology.howCalculated.title")}</h2>
        <p className="text-slate-300 mb-3 whitespace-pre-line">{t("riskMethodology.howCalculated.pipeline")}</p>
        <p className="text-slate-300 mb-3">{t("riskMethodology.howCalculated.tiebreaker")}</p>
        <p className="text-slate-300 mb-3">{t("riskMethodology.howCalculated.attenuation")}</p>
        <p className="text-slate-300 mb-4">{t("riskMethodology.howCalculated.preliminary")}</p>

        <h3 className="text-base font-semibold mb-2 mt-6">{t("riskMethodology.howCalculated.examplesHeading")}</h3>
        <div className="space-y-3">
          {examples.map((key) => (
            <div
              key={key}
              className="rounded border border-slate-700 bg-slate-800/40 px-3 py-2"
              data-testid={`example-${key}`}
            >
              <div className="font-semibold text-slate-100 mb-1">
                {t(`riskMethodology.howCalculated.examples.${key}.title`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Facts:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.facts`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Bands:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.bands`)}
              </div>
              <div className="text-sm text-slate-300 mb-1">
                <span className="text-slate-400">Modifier:</span>{" "}
                {t(`riskMethodology.howCalculated.examples.${key}.modifier`)}
              </div>
              <div className="text-sm text-slate-100 font-semibold">
                → {t(`riskMethodology.howCalculated.examples.${key}.result`)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {sections.map(({ titleKey, bodyKey }) => (
        <section className="mb-6" key={titleKey}>
          <h2 className="text-xl font-semibold mb-2">{t(titleKey)}</h2>
          <p className="text-slate-300">{t(bodyKey)}</p>
        </section>
      ))}

      <footer className="text-xs text-slate-500 border-t border-slate-700 pt-4 mt-2">
        {t("riskMethodology.footer")}
      </footer>
    </div>
  );
}

export default RiskMethodology;
