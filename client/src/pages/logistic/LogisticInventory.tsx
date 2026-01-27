import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import Items from "@/pages/Items";
import type { Unit } from "@shared/schema";

export default function LogisticInventory() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: [`/api/units/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const inventoryUnits = useMemo(() => {
    return allUnits.filter(unit => (unit as any).showInventory !== false);
  }, [allUnits]);

  const selectedUnit = useMemo(() => {
    if (selectedUnitId) {
      return inventoryUnits.find(u => u.id === selectedUnitId);
    }
    return inventoryUnits[0];
  }, [selectedUnitId, inventoryUnits]);

  const effectiveUnitId = selectedUnitId || inventoryUnits[0]?.id;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1">
        {/* Unit selector bar for cross-unit management */}
        <div className="bg-muted/30 border-b py-3 px-4">
          <div className="container flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-muted-foreground">
              {t('logistic.selectUnit', 'Select Unit')}:
            </label>
            <Select value={effectiveUnitId} onValueChange={setSelectedUnitId}>
              <SelectTrigger className="w-[250px]" data-testid="logistic-unit-selector">
                <SelectValue placeholder={t('logistic.selectUnitPlaceholder', 'Select a unit...')} />
              </SelectTrigger>
              <SelectContent>
                {inventoryUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id} data-testid={`logistic-unit-${unit.id}`}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUnit && (
              <span className="text-sm text-muted-foreground">
                {t('logistic.viewingInventory', 'Viewing inventory for')}: <strong>{selectedUnit.name}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Items view with the selected unit */}
        {effectiveUnitId ? (
          <Items overrideUnitId={effectiveUnitId} />
        ) : (
          <div className="flex items-center justify-center h-64">
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <i className="fas fa-boxes text-4xl mb-4 opacity-50"></i>
                <p>{t('logistic.noUnitsAvailable', 'No units with inventory available.')}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
