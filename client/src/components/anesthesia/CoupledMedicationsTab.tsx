import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type CoupledMedication = {
  id: string;
  primaryMedicationConfigId: string;
  coupledMedicationConfigId: string;
  defaultDose: string | null;
  notes: string | null;
  hospitalId: string | null;
  unitId: string | null;
  createdAt: string;
  coupledItemId: string;
  coupledItemName: string;
  coupledDefaultDose: string | null;
  coupledAdministrationUnit: string | null;
  coupledAdministrationRoute: string | null;
};

type AvailableMedication = {
  id: string;
  itemId: string;
  itemName: string;
  defaultDose: string | null;
  administrationUnit: string | null;
  administrationRoute: string | null;
  administrationGroup: string | null;
};

interface CoupledMedicationsTabProps {
  medicationConfigId: string;
  medicationName: string;
}

export function CoupledMedicationsTab({
  medicationConfigId,
  medicationName,
}: CoupledMedicationsTabProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { data: couplings = [], isLoading: isLoadingCouplings } = useQuery<CoupledMedication[]>({
    queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/medication-couplings/${medicationConfigId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch couplings');
      return response.json();
    },
    enabled: !!medicationConfigId,
  });

  const { data: availableMedications = [], isLoading: isLoadingAvailable } = useQuery<AvailableMedication[]>({
    queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId, 'available', searchQuery],
    queryFn: async () => {
      const response = await fetch(
        `/api/anesthesia/medication-couplings/${medicationConfigId}/available?search=${encodeURIComponent(searchQuery)}`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Failed to fetch available medications');
      return response.json();
    },
    enabled: !!medicationConfigId && showSearch,
  });

  const addCouplingMutation = useMutation({
    mutationFn: async (coupledMedicationConfigId: string) => {
      return apiRequest('POST', '/api/anesthesia/medication-couplings', {
        primaryMedicationConfigId: medicationConfigId,
        coupledMedicationConfigId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId, 'available'] 
      });
      toast({
        title: t("anesthesia.couplings.added", "Coupled Medication Added"),
        description: t("anesthesia.couplings.addedDescription", "The medication will be automatically added when this one is used"),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("anesthesia.couplings.error", "Error"),
        description: error.message || t("anesthesia.couplings.addFailed", "Failed to add coupling"),
      });
    },
  });

  const removeCouplingMutation = useMutation({
    mutationFn: async (couplingId: string) => {
      return apiRequest('DELETE', `/api/anesthesia/medication-couplings/${couplingId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/anesthesia/medication-couplings', medicationConfigId, 'available'] 
      });
      toast({
        title: t("anesthesia.couplings.removed", "Coupling Removed"),
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("anesthesia.couplings.error", "Error"),
        description: error.message || t("anesthesia.couplings.removeFailed", "Failed to remove coupling"),
      });
    },
  });

  const handleAddCoupling = (coupledMedicationConfigId: string) => {
    addCouplingMutation.mutate(coupledMedicationConfigId);
  };

  const handleRemoveCoupling = (couplingId: string) => {
    removeCouplingMutation.mutate(couplingId);
  };

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {t("anesthesia.couplings.description", "When {{medicationName}} is administered, the following medications will be automatically added to the record and inventory.", { medicationName })}
      </div>

      {/* Current Couplings List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">
            {t("anesthesia.couplings.coupledMedications", "Coupled Medications")}
          </h4>
          {!showSearch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSearch(true)}
              data-testid="button-add-coupling"
            >
              <Plus className="h-4 w-4 mr-1" />
              {t("anesthesia.couplings.addCoupling", "Add")}
            </Button>
          )}
        </div>

        {isLoadingCouplings ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : couplings.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground border rounded-lg bg-muted/20">
            {t("anesthesia.couplings.noCouplings", "No coupled medications configured")}
          </div>
        ) : (
          <div className="space-y-2">
            {couplings.map((coupling) => (
              <div
                key={coupling.id}
                className="flex items-center justify-between p-3 border rounded-lg bg-card"
                data-testid={`coupling-item-${coupling.id}`}
              >
                <div className="flex-1">
                  <div className="font-medium">{coupling.coupledItemName}</div>
                  <div className="text-sm text-muted-foreground">
                    {coupling.coupledDefaultDose && (
                      <span>{coupling.coupledDefaultDose} {coupling.coupledAdministrationUnit}</span>
                    )}
                    {coupling.coupledAdministrationRoute && (
                      <Badge variant="outline" className="ml-2 text-xs">
                        {coupling.coupledAdministrationRoute}
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCoupling(coupling.id)}
                  disabled={removeCouplingMutation.isPending}
                  data-testid={`button-remove-coupling-${coupling.id}`}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search to Add New Couplings */}
      {showSearch && (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">
              {t("anesthesia.couplings.searchToAdd", "Search Medications to Add")}
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("anesthesia.couplings.searchPlaceholder", "Search medications...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-couplings"
              autoFocus
            />
          </div>

          <ScrollArea className="h-[200px]">
            {isLoadingAvailable ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : availableMedications.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground text-sm">
                {searchQuery
                  ? t("anesthesia.couplings.noResults", "No medications found")
                  : t("anesthesia.couplings.typeToSearch", "Type to search for medications")}
              </div>
            ) : (
              <div className="space-y-1 pr-2">
                {availableMedications.map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center justify-between p-2 hover:bg-muted/50 rounded-md cursor-pointer transition-colors"
                    onClick={() => handleAddCoupling(med.id)}
                    data-testid={`available-med-${med.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{med.itemName}</div>
                      <div className="text-xs text-muted-foreground">
                        {med.defaultDose && (
                          <span>{med.defaultDose} {med.administrationUnit}</span>
                        )}
                        {med.administrationGroup && (
                          <span className="ml-2">• {med.administrationGroup}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={addCouplingMutation.isPending}
                      data-testid={`button-add-med-${med.id}`}
                    >
                      {addCouplingMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
