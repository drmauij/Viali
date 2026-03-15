import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle2, AlertCircle } from "lucide-react";

export function TardocIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: tardocStatus, isLoading: tardocStatusLoading, refetch: refetchTardocStatus } = useQuery<{
    count: number;
    version: string | null;
  }>({
    queryKey: ['/api/tardoc/catalog-status'],
    retry: false,
    staleTime: 0,
  });

  const importTardocMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-tardoc-remote`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'TARDOC Import Successful',
        description: data.message,
      });
      refetchTardocStatus();
    },
    onError: (error: any) => {
      toast({
        title: 'TARDOC Import Failed',
        description: error.message || 'Failed to import TARDOC catalog',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">
              TARDOC {tardocStatus?.version || '1.4c'} Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              {t('admin.tardocDescription', 'Swiss tariff codes for insurance billing.')}
              {' '}
              <a
                href="https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-xs"
              >
                oaat-otma.ch
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {tardocStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (tardocStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(tardocStatus?.count ?? 0).toLocaleString()} positions
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">
                  {t('admin.tardocNotImported', 'Not imported')}
                </span>
              </>
            )}
          </div>

          <Button
            onClick={() => importTardocMutation.mutate()}
            disabled={importTardocMutation.isPending || !hospitalId}
            size="sm"
            data-testid="button-import-tardoc"
          >
            {importTardocMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('admin.importing', 'Importing...')}
              </>
            ) : (tardocStatus?.count ?? 0) > 0 ? (
              t('admin.updateCatalog', 'Update Catalog')
            ) : (
              t('admin.importTardoc', 'Import TARDOC')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
