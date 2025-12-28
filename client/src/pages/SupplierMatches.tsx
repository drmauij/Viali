import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, X, ChevronDown, ChevronUp, ExternalLink, Package, AlertCircle, Loader2 } from "lucide-react";

interface SupplierMatch {
  id: string;
  itemId: string;
  supplierName: string;
  articleCode: string | null;
  catalogUrl: string | null;
  basispreis: string | null;
  publikumspreis: string | null;
  matchConfidence: string | null;
  matchStatus: string;
  matchReason: string | null;
  searchedName: string | null;
  matchedProductName: string | null;
  lastPriceUpdate: string | null;
  lastSyncJobId: string | null;
  item: {
    id: string;
    name: string;
    description: string | null;
  };
}

interface GroupedMatches {
  directMatches: SupplierMatch[];
  suggestedMatches: { item: SupplierMatch["item"]; matches: SupplierMatch[] }[];
}

export default function SupplierMatches() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const { data: matchesData, isLoading } = useQuery<GroupedMatches>({
    queryKey: [`/api/supplier-matches/${activeHospital?.id}`],
    enabled: !!activeHospital?.id,
  });

  const { data: confirmedMatches, isLoading: confirmedLoading } = useQuery<SupplierMatch[]>({
    queryKey: [`/api/supplier-matches/${activeHospital?.id}/confirmed`],
    enabled: !!activeHospital?.id,
  });

  const confirmMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-matches/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-matches/${activeHospital?.id}/confirmed`] });
      toast({ title: t("common.success"), description: t("supplierMatches.matchConfirmed") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("supplierMatches.confirmFailed"), variant: "destructive" });
    },
  });

  const rejectMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-matches/${activeHospital?.id}`] });
      toast({ title: t("common.success"), description: t("supplierMatches.matchRejected") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("supplierMatches.rejectFailed"), variant: "destructive" });
    },
  });

  const selectMatchMutation = useMutation({
    mutationFn: async ({ matchId, itemId }: { matchId: string; itemId: string }) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/select`, { itemId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-matches/${activeHospital?.id}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/supplier-matches/${activeHospital?.id}/confirmed`] });
      toast({ title: t("common.success"), description: t("supplierMatches.matchSelected") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message || t("supplierMatches.selectFailed"), variant: "destructive" });
    },
  });

  const toggleExpanded = (itemId: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(itemId)) {
      newExpanded.delete(itemId);
    } else {
      newExpanded.add(itemId);
    }
    setExpandedItems(newExpanded);
  };

  const formatPrice = (price: string | null) => {
    if (!price) return "-";
    return `CHF ${parseFloat(price).toFixed(2)}`;
  };

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return null;
    const conf = parseFloat(confidence);
    if (conf >= 0.9) {
      return <Badge variant="default" className="bg-green-600">{t("supplierMatches.highConfidence")}</Badge>;
    } else if (conf >= 0.7) {
      return <Badge variant="secondary">{t("supplierMatches.mediumConfidence")}</Badge>;
    } else {
      return <Badge variant="outline">{t("supplierMatches.lowConfidence")}</Badge>;
    }
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t("supplierMatches.noHospitalSelected")}</h3>
          <p className="text-muted-foreground">{t("supplierMatches.selectHospitalFirst")}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{t("supplierMatches.title")}</h1>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const directMatches = matchesData?.directMatches || [];
  const suggestedMatches = matchesData?.suggestedMatches || [];
  const hasMatches = directMatches.length > 0 || suggestedMatches.length > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("supplierMatches.title")}</h1>
        {hasMatches && (
          <Badge variant="outline" className="text-sm">
            {directMatches.length + suggestedMatches.length} {t("supplierMatches.pendingReview")}
          </Badge>
        )}
      </div>

      <Tabs defaultValue={hasMatches ? "direct" : "confirmed"} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="direct" data-testid="tab-direct-matches">
            {t("supplierMatches.pendingReview", "Pending Review")} ({directMatches.length + suggestedMatches.length})
          </TabsTrigger>
          <TabsTrigger value="suggested" data-testid="tab-suggested-matches">
            {t("supplierMatches.needsAttention", "Needs Attention")} ({suggestedMatches.length})
          </TabsTrigger>
          <TabsTrigger value="confirmed" data-testid="tab-confirmed-matches">
            {t("supplierMatches.confirmed", "Confirmed")} ({confirmedMatches?.length || 0})
          </TabsTrigger>
        </TabsList>

          <TabsContent value="direct" className="space-y-4 mt-4">
            {directMatches.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">{t("supplierMatches.noDirectMatches")}</p>
              </div>
            ) : (
              directMatches.map((match) => (
                <Card key={match.id} data-testid={`card-direct-match-${match.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{match.item.name}</h3>
                          {match.item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{match.item.description}</p>
                          )}
                        </div>
                        {getConfidenceBadge(match.matchConfidence)}
                      </div>

                      {/* Match details showing how the match was made */}
                      {(match.matchedProductName || match.matchReason) && (
                        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                              {match.matchedProductName && (
                                <p className="text-amber-700 dark:text-amber-300">
                                  <span className="font-medium">{t("supplierMatches.matchedTo", "Matched to")}:</span> {match.matchedProductName}
                                </p>
                              )}
                              {match.matchReason && (
                                <p className="text-amber-600 dark:text-amber-400 text-xs">
                                  <span className="font-medium">{t("supplierMatches.matchReason", "Reason")}:</span> {match.matchReason}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary">{match.supplierName}</Badge>
                          {match.articleCode && (
                            <span className="text-xs text-muted-foreground">Art. {match.articleCode}</span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            {match.basispreis && (
                              <span className="font-medium">{formatPrice(match.basispreis)}</span>
                            )}
                            {match.publikumspreis && match.basispreis && (
                              <span className="text-muted-foreground ml-2">
                                ({formatPrice(match.publikumspreis)} {t("supplierMatches.retail")})
                              </span>
                            )}
                          </div>
                          {match.catalogUrl && (
                            <a
                              href={match.catalogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm flex items-center gap-1"
                              data-testid={`link-catalog-${match.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t("supplierMatches.viewCatalog")}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="flex gap-2 justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => rejectMatchMutation.mutate(match.id)}
                          disabled={rejectMatchMutation.isPending}
                          data-testid={`button-reject-${match.id}`}
                        >
                          {rejectMatchMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4 mr-1" />
                          )}
                          {t("supplierMatches.reject")}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => confirmMatchMutation.mutate(match.id)}
                          disabled={confirmMatchMutation.isPending}
                          data-testid={`button-accept-${match.id}`}
                        >
                          {confirmMatchMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Check className="w-4 h-4 mr-1" />
                          )}
                          {t("supplierMatches.accept")}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="suggested" className="space-y-4 mt-4">
            {suggestedMatches.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">{t("supplierMatches.noSuggestedMatches")}</p>
              </div>
            ) : (
              suggestedMatches.map((group) => (
                <Collapsible
                  key={group.item.id}
                  open={expandedItems.has(group.item.id)}
                  onOpenChange={() => toggleExpanded(group.item.id)}
                >
                  <Card data-testid={`card-suggested-item-${group.item.id}`}>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-base">{group.item.name}</CardTitle>
                            {group.item.description && (
                              <p className="text-sm text-muted-foreground line-clamp-1">{group.item.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {group.matches.length} {t("supplierMatches.options")}
                            </Badge>
                            {expandedItems.has(group.item.id) ? (
                              <ChevronUp className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="pt-0 space-y-3">
                        {group.matches.map((match) => (
                          <div
                            key={match.id}
                            className="bg-muted/50 rounded-lg p-3"
                            data-testid={`suggested-match-option-${match.id}`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{match.supplierName}</Badge>
                                {match.articleCode && (
                                  <span className="text-xs text-muted-foreground">Art. {match.articleCode}</span>
                                )}
                                {getConfidenceBadge(match.matchConfidence)}
                              </div>
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className="text-sm">
                                {match.basispreis && (
                                  <span className="font-medium">{formatPrice(match.basispreis)}</span>
                                )}
                                {match.catalogUrl && (
                                  <a
                                    href={match.catalogUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary hover:underline ml-3 inline-flex items-center gap-1"
                                    data-testid={`link-catalog-suggested-${match.id}`}
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    {t("supplierMatches.viewCatalog")}
                                  </a>
                                )}
                              </div>
                              <Button
                                size="sm"
                                onClick={() => selectMatchMutation.mutate({ matchId: match.id, itemId: group.item.id })}
                                disabled={selectMatchMutation.isPending}
                                data-testid={`button-select-${match.id}`}
                              >
                                {selectMatchMutation.isPending ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Check className="w-4 h-4 mr-1" />
                                )}
                                {t("supplierMatches.select")}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </TabsContent>

          <TabsContent value="confirmed" className="space-y-4 mt-4">
            {confirmedLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <Skeleton className="h-12 w-12 rounded" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-1/2" />
                          <Skeleton className="h-3 w-1/3" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !confirmedMatches || confirmedMatches.length === 0 ? (
              <div className="bg-card border border-border rounded-lg p-6 text-center">
                <Package className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">{t("supplierMatches.noConfirmedMatches", "No confirmed matches yet. Run a price sync to get started.")}</p>
              </div>
            ) : (
              confirmedMatches.map((match) => (
                <Card key={match.id} data-testid={`card-confirmed-match-${match.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-foreground">{match.item.name}</h3>
                          {match.item.description && (
                            <p className="text-sm text-muted-foreground line-clamp-1">{match.item.description}</p>
                          )}
                        </div>
                        <Badge className="bg-green-600">{t("supplierMatches.confirmed", "Confirmed")}</Badge>
                      </div>

                      {/* Match details showing how the match was made */}
                      {(match.matchedProductName || match.matchReason) && (
                        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                            <div className="space-y-1">
                              {match.matchedProductName && (
                                <p className="text-blue-700 dark:text-blue-300">
                                  <span className="font-medium">{t("supplierMatches.matchedTo", "Matched to")}:</span> {match.matchedProductName}
                                </p>
                              )}
                              {match.matchReason && (
                                <p className="text-blue-600 dark:text-blue-400 text-xs">
                                  <span className="font-medium">{t("supplierMatches.matchReason", "Reason")}:</span> {match.matchReason}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="secondary">{match.supplierName}</Badge>
                          {match.articleCode && (
                            <span className="text-xs text-muted-foreground">Art. {match.articleCode}</span>
                          )}
                          {match.matchConfidence && (
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(parseFloat(match.matchConfidence) * 100)}% {t("supplierMatches.confidence", "confidence")})
                            </span>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <div className="text-sm">
                            {match.basispreis && (
                              <span className="font-medium text-lg">{formatPrice(match.basispreis)}</span>
                            )}
                            {match.lastPriceUpdate && (
                              <span className="text-muted-foreground ml-2 text-xs">
                                {t("supplierMatches.updated", "Updated")}: {new Date(match.lastPriceUpdate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          {match.catalogUrl && (
                            <a
                              href={match.catalogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-sm flex items-center gap-1"
                              data-testid={`link-catalog-confirmed-${match.id}`}
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t("supplierMatches.viewCatalog")}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
    </div>
  );
}
