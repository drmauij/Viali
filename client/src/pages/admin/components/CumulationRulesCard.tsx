import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Database, CheckCircle2, AlertCircle } from "lucide-react";

export function CumulationRulesCard({ hospitalId }: { hospitalId?: string }) {
  const { toast } = useToast();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const { data: rulesStatus, isLoading, refetch } = useQuery<{ count: number }>({
    queryKey: ['/api/tardoc/cumulation-rules-status'],
    retry: false,
    staleTime: 0,
  });

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await apiRequest('POST', `/api/admin/${hospitalId}/import-cumulation-rules`, {
        fileContent: base64,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({ title: 'Rules Imported', description: data.message });
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import rules',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) importMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className="border rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="font-medium">TARDOC Cumulation / Exclusion Rules</h3>
            <p className="text-sm text-muted-foreground">
              Advisory warnings for conflicting TARDOC codes on invoices
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (rulesStatus?.count ?? 0) > 0 ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="text-sm text-green-600">
                  {(rulesStatus?.count ?? 0).toLocaleString()} rules
                </span>
              </>
            ) : (
              <>
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">No rules loaded</span>
              </>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending || !hospitalId}
            size="sm"
            variant="outline"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (rulesStatus?.count ?? 0) > 0 ? (
              'Update Rules'
            ) : (
              'Import Rules'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
