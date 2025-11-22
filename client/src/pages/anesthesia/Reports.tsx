import { useTranslation } from 'react-i18next';

export default function Reports() {
  const { t } = useTranslation();

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground" data-testid="page-title">{t('anesthesia.reports.title')}</h1>
          <p className="text-muted-foreground mt-2">{t('anesthesia.reports.subtitle')}</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <i className="fas fa-chart-line text-3xl text-primary"></i>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('anesthesia.reports.comingSoon')}</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t('anesthesia.reports.comingSoonDescription')}
          </p>
        </div>
      </div>
    </div>
  );
}
