import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import OPCalendar from "@/components/anesthesia/OPCalendar";

export default function SurgeryOpList() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();

  const handleSurgeryClick = (surgeryId: string) => {
    navigate(`/surgery/op/${surgeryId}`);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-background">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <i className="fas fa-user-nurse text-teal-500"></i>
          {t('surgery.opList.title')}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {t('surgery.opList.subtitle')}
        </p>
      </div>
      
      <div className="flex-1 overflow-hidden">
        <OPCalendar onEventClick={handleSurgeryClick} />
      </div>
    </div>
  );
}
