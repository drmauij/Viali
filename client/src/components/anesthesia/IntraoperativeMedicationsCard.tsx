import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Pill, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";

interface MedicationRecord {
  id: string;
  itemId: string;
  timestamp: string;
  type: string;
  dose?: string | null;
  unit?: string | null;
  route?: string | null;
  rate?: string | null;
  endTimestamp?: string | null;
}

interface IntraoperativeMedicationsCardProps {
  medications: MedicationRecord[];
  items: Array<{ id: string; name: string; controlled?: boolean }>;
}

export function IntraoperativeMedicationsCard({ medications, items }: IntraoperativeMedicationsCardProps) {
  const { t } = useTranslation();

  const getItemName = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    return item?.name || 'Unknown';
  };

  const isItemControlled = (itemId: string) => {
    const item = items.find(i => i.id === itemId);
    return item?.controlled || false;
  };

  const getItemUnit = (itemId: string) => {
    const item = items.find(i => i.id === itemId) as any;
    return item?.administrationUnit || '';
  };

  const getLastAdministrationByItem = () => {
    const medicationMap = new Map<string, { 
      itemId: string;
      lastTime: number; 
      cumulativeDose: number; 
      unit: string; 
      type: string;
      isControlled: boolean;
    }>();

    medications.forEach(med => {
      const itemName = getItemName(med.itemId);
      const timestamp = new Date(med.timestamp).getTime();
      const isControlled = isItemControlled(med.itemId);
      
      const existing = medicationMap.get(itemName);
      
      // Calculate cumulative dose for bolus administrations
      if (med.type === 'bolus' && med.dose) {
        const doseValue = parseFloat(med.dose);
        if (!isNaN(doseValue)) {
          // Get unit from medication record first, fall back to item configuration
          const unit = med.unit || getItemUnit(med.itemId);
          
          if (existing) {
            medicationMap.set(itemName, {
              itemId: med.itemId,
              lastTime: Math.max(existing.lastTime, timestamp),
              cumulativeDose: existing.cumulativeDose + doseValue,
              unit: unit || existing.unit,
              type: 'bolus',
              isControlled
            });
          } else {
            medicationMap.set(itemName, {
              itemId: med.itemId,
              lastTime: timestamp,
              cumulativeDose: doseValue,
              unit: unit,
              type: 'bolus',
              isControlled
            });
          }
        }
      } else if (med.type === 'infusion_start') {
        // For infusions, just track the last start time
        if (!existing || timestamp > existing.lastTime) {
          medicationMap.set(itemName, {
            itemId: med.itemId,
            lastTime: timestamp,
            cumulativeDose: 0,
            unit: '',
            type: 'infusion_start',
            isControlled
          });
        }
      }
    });

    return Array.from(medicationMap.entries())
      .map(([name, data]) => ({
        name,
        lastTime: data.lastTime,
        cumulativeDose: data.cumulativeDose,
        unit: data.unit,
        type: data.type,
        isControlled: data.isControlled
      }))
      .sort((a, b) => {
        // Sort by controlled first, then by last administration time
        if (a.isControlled !== b.isControlled) {
          return a.isControlled ? -1 : 1;
        }
        return b.lastTime - a.lastTime;
      });
  };

  const formatTime = (timestamp: number) => {
    return format(new Date(timestamp), 'HH:mm');
  };

  const formatTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diffMinutes = Math.floor((now - timestamp) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 min ago';
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    
    const hours = Math.floor(diffMinutes / 60);
    const mins = diffMinutes % 60;
    if (hours === 1) return mins > 0 ? `1h ${mins}m ago` : '1h ago';
    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  };

  const medicationsList = getLastAdministrationByItem();

  if (medicationsList.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5" />
            {t('anesthesia.op.intraoperativeMedications')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('anesthesia.op.noMedicationsAdministered')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Pill className="h-5 w-5" />
          {t('anesthesia.op.intraoperativeMedications')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {medicationsList.map((med, index) => (
            <div key={`${med.name}-${med.lastTime}`}>
              {index > 0 && <Separator />}
              <div className="flex items-start justify-between py-2 gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{med.name}</span>
                    {med.isControlled && (
                      <Badge variant="destructive" className="text-xs">
                        BTM
                      </Badge>
                    )}
                    {med.type === 'infusion_start' && (
                      <Badge variant="outline" className="text-xs">
                        Infusion
                      </Badge>
                    )}
                  </div>
                  {med.type === 'bolus' && med.cumulativeDose > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Total: {med.cumulativeDose}{med.unit ? ' ' + med.unit : ''}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex items-center gap-1 text-sm font-medium" data-testid={`text-med-time-${med.name}`}>
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {formatTime(med.lastTime)}
                  </div>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatTimeAgo(med.lastTime)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
