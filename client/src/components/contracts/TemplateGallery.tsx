import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, Plus, Loader2 } from "lucide-react";
import type { ContractTemplate } from "@shared/schema";

interface Props {
  scope: "hospital" | "chain";
  ownerId: string;
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  draft: "secondary",
  active: "default",
  archived: "outline",
};

export function TemplateGallery({ scope, ownerId }: Props) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const base =
    scope === "hospital"
      ? `/api/business/${ownerId}/contract-templates`
      : `/api/chain/${ownerId}/contract-templates`;

  const editBase =
    scope === "hospital"
      ? `/business/contracts/templates`
      : `/chain/contracts/templates`;

  const { data = [], isLoading } = useQuery<ContractTemplate[]>({
    queryKey: [base],
    queryFn: () =>
      apiRequest("GET", base).then((r) => r.json()),
    enabled: !!ownerId,
  });

  const createBlank = useMutation({
    mutationFn: () =>
      apiRequest("POST", base, { name: "Untitled template", language: "de" }).then((r) => r.json()),
    onSuccess: (created: ContractTemplate) => {
      qc.invalidateQueries({ queryKey: [base] });
      navigate(`${editBase}/${created.id}`);
    },
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contract Templates</h1>
        <Button
          onClick={() => createBlank.mutate()}
          disabled={createBlank.isPending}
          size="sm"
        >
          {createBlank.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Blank template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
            <FileText className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No templates yet. Create a blank template to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {data.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground uppercase">
                        {t.language}
                      </span>
                      <Badge variant={STATUS_VARIANT[t.status] ?? "outline"} className="text-xs py-0">
                        {t.status}
                      </Badge>
                      {t.ownerChainId && (
                        <Badge variant="outline" className="text-xs py-0">
                          chain
                        </Badge>
                      )}
                      {t.isStarterClone && (
                        <Badge variant="outline" className="text-xs py-0">
                          starter
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`${editBase}/${t.id}`)}
                >
                  Edit
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
