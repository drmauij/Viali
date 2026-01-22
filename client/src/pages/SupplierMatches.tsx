import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Check, X, ExternalLink, Package, Loader2, 
  XCircle, DollarSign, AlertTriangle, CheckCircle2, Search, ChevronRight, AlertCircle
} from "lucide-react";

interface ItemCode {
  id: string;
  itemId: string;
  gtin: string | null;
  pharmacode: string | null;
  manufacturer: string | null;
}

interface SupplierCodeInfo {
  id: string;
  supplierName: string;
  articleCode: string | null;
  matchedProductName: string | null;
  catalogUrl: string | null;
  matchConfidence: string | null;
  matchReason: string | null;
  basispreis: string | null;
  publikumspreis?: string | null;
  lastPriceUpdate?: string | null;
}

interface CategorizedItem {
  id: string;
  name: string;
  description: string | null;
  itemCode: ItemCode | null;
  supplierCodes: any[];
  pendingMatches?: SupplierCodeInfo[];
  confirmedMatch?: SupplierCodeInfo;
}

interface CategorizedData {
  unmatched: CategorizedItem[];
  toVerify: CategorizedItem[];
  confirmedWithPrice: CategorizedItem[];
  confirmedNoPrice: CategorizedItem[];
  counts: {
    unmatched: number;
    toVerify: number;
    confirmedWithPrice: number;
    confirmedNoPrice: number;
    total: number;
  };
}

// Helper to display item codes inline
function ItemCodesDisplay({ itemCode }: { itemCode: ItemCode | null }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {itemCode?.pharmacode && (
        <span>Pharmacode: {itemCode.pharmacode}</span>
      )}
      {itemCode?.gtin && (
        <span>GTIN: {itemCode.gtin}</span>
      )}
      {!itemCode?.pharmacode && !itemCode?.gtin && (
        <span className="italic">No codes</span>
      )}
    </div>
  );
}

export default function SupplierMatches() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();
  
  // Search states for each tab
  const [searchUnmatched, setSearchUnmatched] = useState("");
  const [searchToVerify, setSearchToVerify] = useState("");
  const [searchWithPrice, setSearchWithPrice] = useState("");
  const [searchNoPrice, setSearchNoPrice] = useState("");
  
  // Navigate to Items page with item edit dialog opened to codes tab
  const openItemCodesEditor = (itemId: string) => {
    navigate(`/inventory?editItem=${itemId}&tab=codes&from=matches`);
  };
  
  // Filter function for items
  const filterItems = (items: CategorizedItem[], searchQuery: string) => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase().trim();
    return items.filter(item => 
      item.name.toLowerCase().includes(query) ||
      (item.description?.toLowerCase() || "").includes(query) ||
      (item.itemCode?.pharmacode?.toLowerCase() || "").includes(query) ||
      (item.itemCode?.gtin?.toLowerCase() || "").includes(query)
    );
  };

  const { data: categorizedData, isLoading, refetch } = useQuery<CategorizedData>({
    queryKey: [`/api/supplier-matches/${activeHospital?.id}/categorized`],
    enabled: !!activeHospital?.id,
  });

  const confirmMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/confirm`);
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("common.success"), description: t("supplierMatches.matchConfirmed") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const rejectMatchMutation = useMutation({
    mutationFn: async (matchId: string) => {
      const response = await apiRequest("POST", `/api/supplier-codes/${matchId}/reject`);
      return response.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: t("common.success"), description: t("supplierMatches.matchRejected") });
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  const formatPrice = (price: string | null) => {
    if (!price) return "-";
    return `CHF ${parseFloat(price).toFixed(2)}`;
  };

  const getConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return null;
    const conf = parseFloat(confidence);
    if (conf >= 0.9) {
      return <Badge variant="default" className="bg-green-600 text-xs">{Math.round(conf * 100)}%</Badge>;
    } else if (conf >= 0.7) {
      return <Badge variant="secondary" className="text-xs">{Math.round(conf * 100)}%</Badge>;
    } else {
      return <Badge variant="outline" className="text-xs">{Math.round(conf * 100)}%</Badge>;
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
                <Skeleton className="h-16 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const counts = categorizedData?.counts || { unmatched: 0, toVerify: 0, confirmedWithPrice: 0, confirmedNoPrice: 0, total: 0 };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{t("supplierMatches.title", "Supplier Matches")}</h1>
        <Badge variant="outline" className="text-sm">
          {counts.total} {t("supplierMatches.totalItems", "items")}
        </Badge>
      </div>

      <Tabs defaultValue="toVerify" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="unmatched" data-testid="tab-unmatched" className="text-xs sm:text-sm">
            <XCircle className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.unmatched", "Unmatched")} ({counts.unmatched})
          </TabsTrigger>
          <TabsTrigger value="toVerify" data-testid="tab-to-verify" className="text-xs sm:text-sm">
            <AlertTriangle className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.toVerify", "To Verify")} ({counts.toVerify})
          </TabsTrigger>
          <TabsTrigger value="confirmedNoPrice" data-testid="tab-confirmed-no-price" className="text-xs sm:text-sm">
            <DollarSign className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.confirmedNoPrice", "No Price")} ({counts.confirmedNoPrice})
          </TabsTrigger>
          <TabsTrigger value="confirmedWithPrice" data-testid="tab-confirmed-price" className="text-xs sm:text-sm">
            <CheckCircle2 className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.confirmedWithPrice", "With Price")} ({counts.confirmedWithPrice})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched" className="space-y-3 mt-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="text-amber-700 dark:text-amber-300">
              {t("supplierMatches.unmatchedDesc", "Items without any supplier match. Add pharmacode/GTIN manually or run a sync.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchUnmatched}
              onChange={(e) => setSearchUnmatched(e.target.value)}
              className="pl-9"
              data-testid="input-search-unmatched"
            />
          </div>
          {filterItems(categorizedData?.unmatched || [], searchUnmatched).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchUnmatched.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.allItemsMatched", "All items have supplier matches!")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.unmatched || [], searchUnmatched).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-unmatched-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                    </div>
                    <Badge variant="outline" className="text-red-600 border-red-300 shrink-0">
                      {t("supplierMatches.noMatch", "No Match")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="toVerify" className="space-y-3 mt-4">
          <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3 text-sm">
            <p className="text-blue-700 dark:text-blue-300">
              {t("supplierMatches.toVerifyDesc", "Items matched by product name. Verify the match is correct and confirm to save pharmacode/GTIN.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchToVerify}
              onChange={(e) => setSearchToVerify(e.target.value)}
              className="pl-9"
              data-testid="input-search-to-verify"
            />
          </div>
          {filterItems(categorizedData?.toVerify || [], searchToVerify).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchToVerify.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.noPendingVerification", "No items pending verification")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.toVerify || [], searchToVerify).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-to-verify-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                        <ItemCodesDisplay itemCode={item.itemCode} />
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>

                    {(item.pendingMatches || []).map((match) => (
                      <div key={match.id} className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{match.supplierName}</Badge>
                            {match.articleCode && (
                              <span className="text-xs text-muted-foreground">Art. {match.articleCode}</span>
                            )}
                            {getConfidenceBadge(match.matchConfidence)}
                          </div>
                        </div>
                        
                        {match.matchedProductName && (
                          <p className="text-sm mb-2">
                            <span className="font-medium">{t("supplierMatches.matchedTo", "Matched to")}:</span>{" "}
                            {match.matchedProductName}
                          </p>
                        )}
                        
                        {match.matchReason && (
                          <p className="text-xs text-muted-foreground mb-2">
                            {t("supplierMatches.matchReason", "Reason")}: {match.matchReason}
                          </p>
                        )}
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {match.basispreis && parseFloat(match.basispreis) > 0 && (
                              <span className="font-medium">{formatPrice(match.basispreis)}</span>
                            )}
                            {match.catalogUrl && (
                              <a
                                href={match.catalogUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline text-sm flex items-center gap-1"
                                data-testid={`link-catalog-${match.id}`}
                              >
                                <ExternalLink className="w-3 h-3" />
                                {t("supplierMatches.viewCatalog", "View Catalog")}
                              </a>
                            )}
                          </div>
                          
                          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); rejectMatchMutation.mutate(match.id); }}
                              disabled={rejectMatchMutation.isPending}
                              data-testid={`button-reject-${match.id}`}
                            >
                              {rejectMatchMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <X className="w-4 h-4 mr-1" />
                              )}
                              {t("supplierMatches.reject", "Reject")}
                            </Button>
                            <Button
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); confirmMatchMutation.mutate(match.id); }}
                              disabled={confirmMatchMutation.isPending}
                              data-testid={`button-confirm-${match.id}`}
                            >
                              {confirmMatchMutation.isPending ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4 mr-1" />
                              )}
                              {t("supplierMatches.confirm", "Confirm")}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="confirmedWithPrice" className="space-y-3 mt-4">
          <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg p-3 text-sm">
            <p className="text-green-700 dark:text-green-300">
              {t("supplierMatches.confirmedWithPriceDesc", "Items with confirmed supplier match and price from Galexis.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchWithPrice}
              onChange={(e) => setSearchWithPrice(e.target.value)}
              className="pl-9"
              data-testid="input-search-with-price"
            />
          </div>
          {filterItems(categorizedData?.confirmedWithPrice || [], searchWithPrice).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchWithPrice.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <DollarSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.noConfirmedWithPrice", "No confirmed items with prices yet")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.confirmedWithPrice || [], searchWithPrice).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-confirmed-price-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                      {item.confirmedMatch && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{item.confirmedMatch.supplierName}</Badge>
                          {item.confirmedMatch.articleCode && (
                            <span>Art. {item.confirmedMatch.articleCode}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <span className="text-lg font-bold text-green-600 shrink-0">
                      {formatPrice(item.confirmedMatch?.basispreis || null)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="confirmedNoPrice" className="space-y-3 mt-4">
          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-3 text-sm">
            <p className="text-orange-700 dark:text-orange-300">
              {t("supplierMatches.confirmedNoPriceDesc", "Items with confirmed pharmacode/GTIN but no price from Galexis. These need manual price entry or are not available in Galexis catalog.")}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t("common.search", "Search")}
              value={searchNoPrice}
              onChange={(e) => setSearchNoPrice(e.target.value)}
              className="pl-9"
              data-testid="input-search-no-price"
            />
          </div>
          {filterItems(categorizedData?.confirmedNoPrice || [], searchNoPrice).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              {searchNoPrice.trim() ? (
                <>
                  <Search className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">{t("common.noSearchResults", "No items match your search")}</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
                  <p className="text-muted-foreground">{t("supplierMatches.allHavePrices", "All confirmed items have prices!")}</p>
                </>
              )}
            </div>
          ) : (
            filterItems(categorizedData?.confirmedNoPrice || [], searchNoPrice).map((item) => (
              <Card 
                key={item.id} 
                data-testid={`card-confirmed-no-price-${item.id}`}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => openItemCodesEditor(item.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                      )}
                      <ItemCodesDisplay itemCode={item.itemCode} />
                      {item.confirmedMatch && (
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                          <Badge variant="secondary" className="text-xs">{item.confirmedMatch.supplierName}</Badge>
                          {item.confirmedMatch.articleCode && (
                            <span>Art. {item.confirmedMatch.articleCode}</span>
                          )}
                          <span className="text-orange-600">{t("supplierMatches.priceNotInGalexis", "Not in Galexis")}</span>
                        </div>
                      )}
                    </div>
                    <Badge variant="outline" className="text-orange-600 border-orange-300 shrink-0">
                      {t("supplierMatches.needsPrice", "Needs Price")}
                    </Badge>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
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
