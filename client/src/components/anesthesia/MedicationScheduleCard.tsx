import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pill, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";

type MedicationTime = "Immediately" | "Contraindicated" | string;

interface MedicationScheduleCardProps {
  postOpData: {
    paracetamolTime?: MedicationTime;
    nsarTime?: MedicationTime;
    novalginTime?: MedicationTime;
  };
}

export function MedicationScheduleCard({ postOpData }: MedicationScheduleCardProps) {
  const { t } = useTranslation();

  const renderMedicationTime = (medicationTime: MedicationTime | undefined, testId: string) => {
    if (!medicationTime) {
      return <span className="text-muted-foreground text-sm">{t('anesthesia.op.notSpecified')}</span>;
    }
    
    if (medicationTime === "Immediately") {
      return <Badge variant="outline" className="bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100">{t('anesthesia.op.immediately')}</Badge>;
    }
    
    if (medicationTime === "Contraindicated") {
      return <Badge variant="outline" className="bg-red-50 dark:bg-red-900/30 text-red-900 dark:text-red-100">{t('anesthesia.op.contraindicated')}</Badge>;
    }
    
    return <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100">{medicationTime}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pill className="h-5 w-5" />
          {t('anesthesia.op.medicationSchedule')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Paracetamol */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Paracetamol</span>
            </div>
            <div data-testid="text-pacu-paracetamol-time">
              {renderMedicationTime(postOpData?.paracetamolTime, "text-pacu-paracetamol-time")}
            </div>
          </div>

          <Separator />

          {/* NSAR */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">NSAR</span>
            </div>
            <div data-testid="text-pacu-nsar-time">
              {renderMedicationTime(postOpData?.nsarTime, "text-pacu-nsar-time")}
            </div>
          </div>

          <Separator />

          {/* Novalgin */}
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Novalgin</span>
            </div>
            <div data-testid="text-pacu-novalgin-time">
              {renderMedicationTime(postOpData?.novalginTime, "text-pacu-novalgin-time")}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
