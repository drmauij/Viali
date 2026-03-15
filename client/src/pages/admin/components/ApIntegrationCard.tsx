import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle2, AlertCircle } from "lucide-react";

export function ApIntegrationCard({ hospitalId }: { hospitalId?: string }) {
  const { toast } = useToast();

  const { data: apStatus, isLoading: apStatusLoading, refetch: refetchApStatus } = useQuery<{
    count: number;
    version: string | null;
  }>({
    queryKey: ['/api/tardoc/ap-catalog-status'],
    retry: false,
    staleTime: 0,
  });

  const importApMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-ap-remote`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: 'AP Import Successful', description: data.message });
      refetchApStatus();
    },
    onError: (error: any) => {
      toast({
        title: 'AP Import Failed',
        description: error.message || 'Failed to import AP catalog',
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
              Ambulante Pauschalen {apStatus?.version || '1.1c'} Catalog
            </h3>
            <p className="text-sm text-muted-foreground">
              Swiss flat-rate outpatient billing codes.{' '}
              <a href="https://oaat-otma.ch/gesamt-tarifsystem/vertraege-und-anhaenge" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                oaat-otma.ch
              </a>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {apStatusLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (apStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(apStatus?.count ?? 0).toLocaleString()} positions
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-600">Not imported</span>
              </>
            )}
          </div>

          <Button
            onClick={() => importApMutation.mutate()}
            disabled={importApMutation.isPending || !hospitalId}
            size="sm"
          >
            {importApMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (apStatus?.count ?? 0) > 0 ? (
              'Update Catalog'
            ) : (
              'Import AP Catalog'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
