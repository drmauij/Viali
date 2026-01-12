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

type InventoryTab = "items" | "services" | "matches";

export default function LogisticInventory() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const [, navigate] = useLocation();
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<InventoryTab>("items");

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
              
              <div className="ml-auto flex gap-2">
                <button
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "items"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setActiveTab("items")}
                  data-testid="logistic-tab-items"
                >
                  <i className="fas fa-boxes mr-2"></i>
                  {t('bottomNav.items', 'Items')}
                </button>
                <button
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "services"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setActiveTab("services")}
                  data-testid="logistic-tab-services"
                >
                  <i className="fas fa-briefcase-medical mr-2"></i>
                  {t('bottomNav.services', 'Services')}
                </button>
                <button
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    activeTab === "matches"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                  onClick={() => setActiveTab("matches")}
                  data-testid="logistic-tab-matches"
                >
                  <i className="fas fa-link mr-2"></i>
                  {t('bottomNav.matches', 'Matches')}
                </button>
              </div>
            </div>
          </div>

          {effectiveUnitId ? (
            <div className="logistic-content">
              {activeTab === "items" && (
                <LogisticItemsView hospitalId={activeHospital?.id || ""} unitId={effectiveUnitId} />
              )}
              {activeTab === "services" && (
                <LogisticServicesView hospitalId={activeHospital?.id || ""} unitId={effectiveUnitId} unitName={selectedUnit?.name || ""} />
              )}
              {activeTab === "matches" && (
                <LogisticMatchesView hospitalId={activeHospital?.id || ""} unitId={effectiveUnitId} unitName={selectedUnit?.name || ""} />
              )}
            </div>
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

function LogisticServicesView({ hospitalId, unitId, unitName }: { hospitalId: string; unitId: string; unitName: string }) {
  const { t } = useTranslation();
  const { data: services = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/clinic', hospitalId, 'services', unitId],
    queryFn: async () => {
      const res = await fetch(`/api/clinic/${hospitalId}/services?unitId=${unitId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch services');
      return res.json();
    },
    enabled: !!hospitalId && !!unitId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('logistic.servicesFor', 'Services for')} {unitName}
        </h2>
        <span className="text-sm text-muted-foreground">
          {services.length} {t('logistic.servicesCount', 'services')}
        </span>
      </div>
      
      {services.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            <i className="fas fa-briefcase-medical text-4xl mb-4 opacity-50"></i>
            <p>{t('logistic.noServices', 'No services found for this unit.')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {services.map((service: any) => (
            <Card key={service.id} data-testid={`logistic-service-${service.id}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">{service.name}</h3>
                    {service.description && (
                      <p className="text-sm text-muted-foreground line-clamp-1">{service.description}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {service.price && (
                      <span className="font-medium">CHF {parseFloat(service.price).toFixed(2)}</span>
                    )}
                    {service.durationMinutes && (
                      <p className="text-xs text-muted-foreground">{service.durationMinutes} min</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LogisticMatchesView({ hospitalId, unitId, unitName }: { hospitalId: string; unitId: string; unitName: string }) {
  const { t } = useTranslation();
  const { data: matchesData, isLoading } = useQuery<any>({
    queryKey: ['/api/supplier-matches', hospitalId, 'categorized', unitId],
    queryFn: async () => {
      const res = await fetch(`/api/supplier-matches/${hospitalId}/categorized?unitId=${unitId}`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed to fetch matches');
      return res.json();
    },
    enabled: !!hospitalId && !!unitId,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const counts = matchesData?.counts || { unmatched: 0, toVerify: 0, confirmedWithPrice: 0, confirmedNoPrice: 0, total: 0 };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {t('logistic.matchesFor', 'Supplier Matches for')} {unitName}
        </h2>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-orange-500">{counts.unmatched}</div>
            <div className="text-sm text-muted-foreground">{t('supplierMatches.unmatched', 'Unmatched')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-500">{counts.toVerify}</div>
            <div className="text-sm text-muted-foreground">{t('supplierMatches.toVerify', 'To Verify')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-500">{counts.confirmedWithPrice}</div>
            <div className="text-sm text-muted-foreground">{t('supplierMatches.confirmedWithPrice', 'With Price')}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-500">{counts.confirmedNoPrice}</div>
            <div className="text-sm text-muted-foreground">{t('supplierMatches.confirmedNoPrice', 'No Price')}</div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground text-center">
        {t('logistic.matchesSummary', 'View detailed matches in the regular Inventory module for full editing capabilities.')}
      </p>
    </div>
  );
}
