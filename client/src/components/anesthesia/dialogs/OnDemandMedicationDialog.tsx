import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Loader2, Plus, Search, PackageOpen } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

type OnDemandMedication = {
  id: string;
  itemId: string;
  itemName: string;
  medicationGroup: string | null;
  administrationGroup: string | null;
  defaultDose: string | null;
  administrationUnit: string | null;
  ampuleTotalContent: string | null;
  administrationRoute: string | null;
  rateUnit: string | null;
  sortOrder: number | null;
  isImported: boolean;
};

interface OnDemandMedicationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anesthesiaRecordId: string;
  administrationGroupId: string;
  administrationGroupName: string;
  onMedicationImported?: () => void;
}

export function OnDemandMedicationDialog({
  open,
  onOpenChange,
  anesthesiaRecordId,
  administrationGroupId,
  administrationGroupName,
  onMedicationImported,
}: OnDemandMedicationDialogProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchQuery, setSearchQuery] = useState("");

  const { data: medications = [], isLoading, refetch } = useQuery<OnDemandMedication[]>({
    queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'on-demand-medications', administrationGroupId],
    queryFn: async () => {
      const response = await fetch(`/api/anesthesia/records/${anesthesiaRecordId}/on-demand-medications/${administrationGroupId}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch medications');
      return response.json();
    },
    enabled: open && !!anesthesiaRecordId && !!administrationGroupId,
  });

  const importMutation = useMutation({
    mutationFn: async (medicationConfigId: string) => {
      return apiRequest('POST', `/api/anesthesia/records/${anesthesiaRecordId}/imported-medications`, {
        medicationConfigId,
      });
    },
    onSuccess: () => {
      toast({
        title: t("anesthesia.timeline.medicationAdded", "Medication Added"),
        description: t("anesthesia.timeline.medicationAddedDescription", "The medication has been added to this record"),
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/anesthesia/records', anesthesiaRecordId, 'imported-medications'] });
      onMedicationImported?.();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: t("anesthesia.timeline.error", "Error"),
        description: error.message || t("anesthesia.timeline.failedToAddMedication", "Failed to add medication"),
      });
    },
  });

  const filteredMedications = medications.filter((med) =>
    med.itemName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleImport = (medicationConfigId: string) => {
    importMutation.mutate(medicationConfigId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]" data-testid="dialog-on-demand-medication">
        <DialogHeader>
          <DialogTitle>
            {t("anesthesia.timeline.addOnDemandMedication", "Add On-Demand Medication")}
          </DialogTitle>
          <DialogDescription>
            {t("anesthesia.timeline.selectMedicationToAdd", "Select a medication to add to {{groupName}}", { groupName: administrationGroupName })}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("anesthesia.timeline.searchMedications", "Search medications...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-medications"
          />
        </div>

        <ScrollArea className="h-[300px] rounded-md border">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMedications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-6 text-center">
              <PackageOpen className="h-12 w-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground font-medium">
                {searchQuery
                  ? t("anesthesia.timeline.noMedicationsFound", "No medications found")
                  : t("anesthesia.timeline.noOnDemandMedications", "No on-demand medications configured for this group")}
              </p>
              {!searchQuery && (
                <p className="text-sm text-muted-foreground/70 mt-2">
                  {t("anesthesia.timeline.configureOnDemandHint", "Configure medications as 'on-demand' in Admin settings")}
                </p>
              )}
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {filteredMedications.map((med) => (
                <div
                  key={med.id}
                  className={`flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
                    med.isImported ? 'bg-muted/30' : ''
                  }`}
                  data-testid={`medication-item-${med.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{med.itemName}</div>
                    <div className="text-sm text-muted-foreground">
                      {med.defaultDose && (
                        <span>{med.defaultDose} {med.administrationUnit}</span>
                      )}
                      {med.administrationRoute && (
                        <span className="ml-2">({med.administrationRoute})</span>
                      )}
                      {med.rateUnit && med.rateUnit !== 'free' && (
                        <span className="ml-2">• {med.rateUnit}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {med.isImported ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled
                        className="text-green-600"
                        data-testid={`button-imported-${med.id}`}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        {t("anesthesia.timeline.added", "Added")}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleImport(med.id)}
                        disabled={importMutation.isPending}
                        data-testid={`button-import-${med.id}`}
                      >
                        {importMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            {t("anesthesia.timeline.add", "Add")}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-close-dialog"
          >
            {t("anesthesia.timeline.close", "Close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
