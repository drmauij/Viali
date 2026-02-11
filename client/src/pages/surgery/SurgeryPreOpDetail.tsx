import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import SurgeryPreOpForm from "@/components/surgery/SurgeryPreOpForm";

export default function SurgeryPreOpDetail() {
  const { t } = useTranslation();
  const { surgeryId } = useParams<{ surgeryId: string }>();
  const [, setLocation] = useLocation();
  const activeHospital = useActiveHospital();

  const { data: surgery, isLoading } = useQuery<any>({
    queryKey: [`/api/anesthesia/surgeries/${surgeryId}`],
    enabled: !!surgeryId,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 pb-24">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!surgery) {
    return (
      <div className="container mx-auto px-4 py-6 pb-24">
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('surgery.preop.surgeryNotFound')}</p>
          <Button variant="outline" className="mt-4" onClick={() => setLocation('/surgery/preop')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={() => {
          if (window.history.length > 1) {
            window.history.back();
          } else {
            setLocation('/surgery/preop');
          }
        }} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('surgery.preop.backToList')}
        </Button>
        
        <div className="bg-muted/30 rounded-lg p-4 mb-4">
          <h1 className="text-xl font-bold mb-1">{surgery.patientName}</h1>
          <p className="text-sm text-muted-foreground">{surgery.procedureName}</p>
          {surgery.surgeon && (
            <p className="text-sm text-muted-foreground">{t('surgery.preop.surgeon')}: {surgery.surgeon}</p>
          )}
        </div>
      </div>

      <SurgeryPreOpForm 
        surgeryId={surgeryId!} 
        hospitalId={activeHospital?.id || surgery.hospitalId}
        patientId={surgery?.patientId}
      />
    </div>
  );
}
