import { useTranslation } from "react-i18next";

export default function SurgerySettings() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <i className="fas fa-cog text-teal-500"></i>
          {t('surgery.settings.title')}
        </h1>
      </div>
      
      <div className="flex-1 overflow-auto p-4">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <i className="fas fa-flask text-yellow-600 dark:text-yellow-400 text-xl"></i>
            <div>
              <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">
                {t('surgery.settings.comingSoon')}
              </h3>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                {t('surgery.settings.comingSoonDescription')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
