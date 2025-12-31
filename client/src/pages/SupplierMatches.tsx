import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useActiveHospital } from "@/hooks/useActiveHospital";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Check, X, ExternalLink, Package, AlertCircle, Loader2, 
  Edit2, Save, XCircle, DollarSign, AlertTriangle, CheckCircle2 
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

function ItemCodesEditor({ 
  item, 
  itemCode, 
  onSave 
}: { 
  item: CategorizedItem; 
  itemCode: ItemCode | null;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [pharmacode, setPharmacode] = useState(itemCode?.pharmacode || "");
  const [gtin, setGtin] = useState(itemCode?.gtin || "");

  const saveMutation = useMutation({
    mutationFn: async (data: { pharmacode: string; gtin: string }) => {
      const response = await apiRequest("PUT", `/api/item-codes/${item.id}`, {
        pharmacode: data.pharmacode || null,
        gtin: data.gtin || null,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: t("common.success"), description: t("supplierMatches.itemCodesSaved", "Item codes saved") });
      setIsEditing(false);
      onSave();
    },
    onError: (error: any) => {
      toast({ title: t("common.error"), description: error.message, variant: "destructive" });
    },
  });

  if (!isEditing) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`item-codes-display-${item.id}`}>
        {itemCode?.pharmacode && (
          <span data-testid={`text-pharmacode-${item.id}`}>Pharmacode: {itemCode.pharmacode}</span>
        )}
        {itemCode?.gtin && (
          <span data-testid={`text-gtin-${item.id}`}>GTIN: {itemCode.gtin}</span>
        )}
        {!itemCode?.pharmacode && !itemCode?.gtin && (
          <span className="italic" data-testid={`text-no-codes-${item.id}`}>{t("supplierMatches.noItemCodes", "No codes")}</span>
        )}
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-6 px-2"
          onClick={() => setIsEditing(true)}
          data-testid={`button-edit-codes-${item.id}`}
        >
          <Edit2 className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 mt-2">
      <div className="flex-1">
        <Label className="text-xs">Pharmacode</Label>
        <Input 
          value={pharmacode}
          onChange={(e) => setPharmacode(e.target.value)}
          placeholder="7654321"
          className="h-8 text-sm"
          data-testid={`input-pharmacode-${item.id}`}
        />
      </div>
      <div className="flex-1">
        <Label className="text-xs">GTIN/EAN</Label>
        <Input 
          value={gtin}
          onChange={(e) => setGtin(e.target.value)}
          placeholder="7680123456789"
          className="h-8 text-sm"
          data-testid={`input-gtin-${item.id}`}
        />
      </div>
      <Button 
        size="sm" 
        className="h-8"
        onClick={() => saveMutation.mutate({ pharmacode, gtin })}
        disabled={saveMutation.isPending}
        data-testid={`button-save-codes-${item.id}`}
      >
        {saveMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
      </Button>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8"
        onClick={() => {
          setIsEditing(false);
          setPharmacode(itemCode?.pharmacode || "");
          setGtin(itemCode?.gtin || "");
        }}
        data-testid={`button-cancel-codes-${item.id}`}
      >
        <XCircle className="w-3 h-3" />
      </Button>
    </div>
  );
}

export default function SupplierMatches() {
  const { t } = useTranslation();
  const activeHospital = useActiveHospital();
  const { toast } = useToast();

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
          <TabsTrigger value="confirmedWithPrice" data-testid="tab-confirmed-price" className="text-xs sm:text-sm">
            <CheckCircle2 className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.confirmedWithPrice", "With Price")} ({counts.confirmedWithPrice})
          </TabsTrigger>
          <TabsTrigger value="confirmedNoPrice" data-testid="tab-confirmed-no-price" className="text-xs sm:text-sm">
            <DollarSign className="w-3 h-3 mr-1 hidden sm:inline" />
            {t("supplierMatches.confirmedNoPrice", "No Price")} ({counts.confirmedNoPrice})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="unmatched" className="space-y-3 mt-4">
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-sm">
            <p className="text-amber-700 dark:text-amber-300">
              {t("supplierMatches.unmatchedDesc", "Items without any supplier match. Add pharmacode/GTIN manually or run a sync.")}
            </p>
          </div>
          {(categorizedData?.unmatched || []).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
              <p className="text-muted-foreground">{t("supplierMatches.allItemsMatched", "All items have supplier matches!")}</p>
            </div>
          ) : (
            (categorizedData?.unmatched || []).map((item) => (
              <Card key={item.id} data-testid={`card-unmatched-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-red-600 border-red-300">
                        {t("supplierMatches.noMatch", "No Match")}
                      </Badge>
                    </div>
                    <ItemCodesEditor item={item} itemCode={item.itemCode} onSave={() => refetch()} />
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
          {(categorizedData?.toVerify || []).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">{t("supplierMatches.noPendingVerification", "No items pending verification")}</p>
            </div>
          ) : (
            (categorizedData?.toVerify || []).map((item) => (
              <Card key={item.id} data-testid={`card-to-verify-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                    </div>
                    
                    <ItemCodesEditor item={item} itemCode={item.itemCode} onSave={() => refetch()} />

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
                          
                          <div className="flex gap-2">
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
                              {t("supplierMatches.reject", "Reject")}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => confirmMatchMutation.mutate(match.id)}
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
          {(categorizedData?.confirmedWithPrice || []).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <DollarSign className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">{t("supplierMatches.noConfirmedWithPrice", "No confirmed items with prices yet")}</p>
            </div>
          ) : (
            (categorizedData?.confirmedWithPrice || []).map((item) => (
              <Card key={item.id} data-testid={`card-confirmed-price-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-green-600">
                          {formatPrice(item.confirmedMatch?.basispreis || null)}
                        </span>
                        <Badge className="bg-green-600">{t("common.confirmed", "Confirmed")}</Badge>
                      </div>
                    </div>
                    
                    <ItemCodesEditor item={item} itemCode={item.itemCode} onSave={() => refetch()} />
                    
                    {item.confirmedMatch && (
                      <div className="bg-muted/50 rounded-lg p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{item.confirmedMatch.supplierName}</Badge>
                            {item.confirmedMatch.articleCode && (
                              <span className="text-xs text-muted-foreground">Art. {item.confirmedMatch.articleCode}</span>
                            )}
                          </div>
                          {item.confirmedMatch.catalogUrl && (
                            <a
                              href={item.confirmedMatch.catalogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t("supplierMatches.viewCatalog", "View")}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
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
          {(categorizedData?.confirmedNoPrice || []).length === 0 ? (
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <CheckCircle2 className="w-8 h-8 mx-auto text-green-500 mb-2" />
              <p className="text-muted-foreground">{t("supplierMatches.allHavePrices", "All confirmed items have prices!")}</p>
            </div>
          ) : (
            (categorizedData?.confirmedNoPrice || []).map((item) => (
              <Card key={item.id} data-testid={`card-confirmed-no-price-${item.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-foreground">{item.name}</h3>
                        {item.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.description}</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-orange-600 border-orange-300">
                        {t("supplierMatches.needsPrice", "Needs Price")}
                      </Badge>
                    </div>
                    
                    <ItemCodesEditor item={item} itemCode={item.itemCode} onSave={() => refetch()} />
                    
                    {item.confirmedMatch && (
                      <div className="bg-muted/50 rounded-lg p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">{item.confirmedMatch.supplierName}</Badge>
                            {item.confirmedMatch.articleCode && (
                              <span className="text-xs text-muted-foreground">Art. {item.confirmedMatch.articleCode}</span>
                            )}
                            <span className="text-xs text-orange-600">{t("supplierMatches.priceNotInGalexis", "Not in Galexis")}</span>
                          </div>
                          {item.confirmedMatch.catalogUrl && (
                            <a
                              href={item.confirmedMatch.catalogUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {t("supplierMatches.viewCatalog", "View")}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
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
