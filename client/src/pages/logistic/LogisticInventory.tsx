import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link, useLocation } from "wouter";
import Items from "@/pages/Items";
import type { Unit } from "@shared/schema";

export default function LogisticInventory() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");

  const { data: allUnits = [] } = useQuery<Unit[]>({
    queryKey: [`/api/units/${activeHospital?.hospitalId}`],
    enabled: !!activeHospital?.hospitalId,
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
      <Tabs defaultValue="inventory" className="flex flex-col flex-1">
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="container px-4">
            <TabsList className="h-12">
              <TabsTrigger value="inventory" className="data-[state=active]:bg-primary/10">
                <i className="fas fa-boxes mr-2"></i>
                {t('logistic.inventory', 'Inventory')}
              </TabsTrigger>
              <TabsTrigger value="orders" asChild>
                <Link href="/logistic/orders" className="inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50">
                  <i className="fas fa-clipboard-list mr-2"></i>
                  {t('logistic.orders', 'Orders')}
                </Link>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="inventory" className="flex-1 m-0">
          <div className="bg-muted/30 border-b py-3 px-4">
            <div className="container flex items-center gap-4">
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

          {effectiveUnitId ? (
            <LogisticItemsView hospitalId={activeHospital?.hospitalId || ""} unitId={effectiveUnitId} />
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LogisticItemsView({ hospitalId, unitId }: { hospitalId: string; unitId: string }) {
  return (
    <div className="logistic-items-wrapper" data-hospital-id={hospitalId} data-unit-id={unitId}>
      <Items overrideUnitId={unitId} />
    </div>
  );
}
