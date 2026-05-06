import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useActiveHospital } from '@/hooks/useActiveHospital';
import { MedicationConfigDialog } from './MedicationConfigDialog';

type AnesthesiaItemRow = {
  id: string;
  medicationConfigId?: string;
  name: string;
  administrationGroup?: string | null;
  rateUnit?: string | null;
  defaultDose?: string | null;
  administrationRoute?: string | null;
  administrationUnit?: string | null;
  ampuleTotalContent?: string | null;
  medicationGroup?: string | null;
  onDemandOnly?: boolean | null;
};

/**
 * Surfaces medication_configs rows whose administration_group is NULL.
 * Such configs are invisible on the swimlane (no group → no row), so
 * users have no way to discover or fix them from the chart otherwise.
 * Clicking a chip opens MedicationConfigDialog in edit mode for that
 * specific config; the in-dialog group picker handles the fix.
 */
export function NeedsConfigurationBanner() {
  const { t } = useTranslation();
  const hospital = useActiveHospital();
  const [editingItem, setEditingItem] = useState<AnesthesiaItemRow | null>(null);

  const { data: anesthesiaItems = [] } = useQuery<AnesthesiaItemRow[]>({
    queryKey: [`/api/anesthesia/items/${hospital?.id}`],
    enabled: !!hospital?.id,
  });

  const orphans = useMemo(() => {
    const map = new Map<string, AnesthesiaItemRow>();
    for (const row of anesthesiaItems) {
      if (row.administrationGroup) continue;
      if (!row.medicationConfigId) continue;
      if (!map.has(row.id)) map.set(row.id, row);
    }
    return Array.from(map.values());
  }, [anesthesiaItems]);

  if (orphans.length === 0) return null;

  return (
    <>
      <Card
        className="mx-4 my-2 p-3 border-amber-500/40 bg-amber-500/5 flex items-start gap-3"
        data-testid="banner-needs-configuration"
      >
        <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-amber-500">
            {orphans.length === 1
              ? t(
                  'anesthesia.needsConfig.titleOne',
                  '1 medication needs an administration group'
                )
              : t(
                  'anesthesia.needsConfig.titleMany',
                  '{{count}} medications need an administration group',
                  { count: orphans.length }
                )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {t(
              'anesthesia.needsConfig.description',
              "These medications have a configuration but won't appear on the chart until you assign them to an administration group."
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {orphans.map(item => (
              <Button
                key={item.medicationConfigId ?? item.id}
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setEditingItem(item)}
                data-testid={`button-configure-orphan-${item.id}`}
              >
                {item.name}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <MedicationConfigDialog
        open={!!editingItem}
        onOpenChange={(o) => !o && setEditingItem(null)}
        administrationGroup={null}
        activeHospitalId={hospital?.id}
        activeUnitId={hospital?.unitId}
        editingItem={editingItem}
        onSaveSuccess={() => setEditingItem(null)}
      />
    </>
  );
}
