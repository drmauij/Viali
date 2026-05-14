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

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 text-slate-100" data-testid="page-risk-methodology">
      <h1 className="text-2xl font-bold mb-2">{t("riskMethodology.title")}</h1>
      <p className="text-slate-300 mb-6">{t("riskMethodology.intro")}</p>
      <p className="text-slate-300 mb-8">{t("riskMethodology.aggregation")}</p>

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
