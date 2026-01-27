import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import SupplierMatches from "@/pages/SupplierMatches";
import type { Unit } from "@shared/schema";

export default function LogisticMatches() {
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
              <SelectTrigger className="w-[250px]" data-testid="logistic-matches-unit-selector">
                <SelectValue placeholder={t('logistic.selectUnitPlaceholder', 'Select a unit...')} />
              </SelectTrigger>
              <SelectContent>
                {inventoryUnits.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id} data-testid={`logistic-matches-unit-${unit.id}`}>
                    {unit.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedUnit && (
              <span className="text-sm text-muted-foreground">
                {t('logistic.viewingMatches', 'Viewing matches for')}: <strong>{selectedUnit.name}</strong>
              </span>
            )}
          </div>
        </div>

        {/* Matches view with the selected unit */}
        {effectiveUnitId ? (
          <SupplierMatches overrideUnitId={effectiveUnitId} />
        ) : (
          <div className="flex items-center justify-center h-64">
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                <i className="fas fa-link text-4xl mb-4 opacity-50"></i>
                <p>{t('logistic.noUnitsAvailable', 'No units with inventory available.')}</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
