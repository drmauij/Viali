import { useTranslation } from "react-i18next";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle2, AlertCircle } from "lucide-react";

export function ChopIntegrationCard() {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Check CHOP import status
  const { data: chopStatus, isLoading: chopStatusLoading, isError: chopStatusError, refetch: refetchChopStatus } = useQuery<{
    imported: boolean;
    count: number;
  }>({
    queryKey: ['/api/tardoc/chop-status'],
    retry: false,
    staleTime: 0,
  });

  // CHOP import mutation
  const importChopMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/admin/import-chop');
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: t('admin.chopImportSuccess', 'CHOP Import Successful'),
        description: data.message,
      });
      refetchChopStatus();
    },
    onError: (error: any) => {
      toast({
        title: t('admin.chopImportError', 'CHOP Import Failed'),
        description: error.message || 'Failed to import CHOP procedures',
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
            <h3 className="font-medium">{t('admin.chopProcedures', 'CHOP 2026 Procedures')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('admin.chopDescription', 'Swiss procedure codes for TARDOC billing')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {chopStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : chopStatus?.imported ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {chopStatus.count.toLocaleString()} {t('admin.proceduresImported', 'procedures')}
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">
                  {t('admin.chopNotImported', 'Not imported')}
                </span>
              </>
            )}
          </div>

          <Button
            onClick={() => importChopMutation.mutate()}
            disabled={importChopMutation.isPending || chopStatus?.imported}
            size="sm"
            data-testid="button-import-chop"
          >
            {importChopMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('admin.importing', 'Importing...')}
              </>
            ) : chopStatus?.imported ? (
              t('admin.alreadyImported', 'Imported')
            ) : (
              t('admin.importChop', 'Import CHOP')
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
