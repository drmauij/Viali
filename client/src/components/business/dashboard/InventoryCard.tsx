import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Package } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCurrencyLocale, formatDate } from "@/lib/dateUtils";

interface UnitValue {
  unitId: string;
  unitName: string;
  unitType: string | null;
  totalValue: number;
  itemCount: number;
  snapshotDate: string;
}

interface UnitItem {
  id: string;
  name: string;
  qty: number;
  unitPrice: number | null;
  totalValue: number;
}

interface Props {
  hospitalId: string;
}

function UnitDetailModal({ hospitalId, unit, onClose }: { hospitalId: string; unit: UnitValue | null; onClose: () => void }) {
  const { t } = useTranslation();
  const open = !!unit;
  const query = useQuery<{ items: UnitItem[] }>({
    queryKey: [`/api/business/${hospitalId}/inventory-unit-detail?unitId=${unit?.unitId ?? ""}&limit=200`],
    enabled: open && !!unit && !!hospitalId,
  });
  const items = query.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t("business.inventory.unitDetailTitle", "{{name}} — stock detail", { name: unit?.unitName ?? "" })}
          </DialogTitle>
          <DialogDescription>
            {unit
              ? t("business.inventory.unitDetailDesc", "Snapshot from {{d}}. Values use the preferred supplier price.", {
                  d: formatDate(unit.snapshotDate),
                })
              : ""}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6">
            {t("business.inventory.noItemsInUnit", "No stocked items in this unit.")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("business.inventory.item", "Item")}</TableHead>
                <TableHead className="text-right">{t("business.inventory.qty", "Qty")}</TableHead>
                <TableHead className="text-right">{t("business.inventory.unitPrice", "Unit price")}</TableHead>
                <TableHead className="text-right">{t("business.inventory.itemValue", "Value")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((it) => (
                <TableRow key={it.id}>
                  <TableCell className="font-medium">{it.name}</TableCell>
                  <TableCell className="text-right">{it.qty}</TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {it.unitPrice == null ? "—" : formatCurrencyLocale(it.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right">{formatCurrencyLocale(it.totalValue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function InventoryCard({ hospitalId }: Props) {
  const { t } = useTranslation();
  const [drillUnit, setDrillUnit] = useState<UnitValue | null>(null);

  const query = useQuery<{ totalValue: number; units: UnitValue[] }>({
    queryKey: [`/api/business/${hospitalId}/inventory-by-unit`],
    enabled: !!hospitalId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          {t("business.money.inventoryOnHand", "Inventory on hand")}
        </CardTitle>
        <CardDescription>
          {t("business.inventory.perUnitDesc", "Current stock value per unit. Click a row for the item-level breakdown.")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !query.data || query.data.units.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            {t("business.money.noInventoryHistory", "No inventory history yet")}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground uppercase">{t("business.money.inventoryValue", "Total stock value")}</div>
              <div className="text-2xl font-bold">{formatCurrencyLocale(query.data.totalValue)}</div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("business.inventory.unit", "Unit")}</TableHead>
                  <TableHead className="text-right">{t("business.inventory.items", "Items")}</TableHead>
                  <TableHead className="text-right">{t("business.money.inventoryValue", "Stock value")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.units.map((u) => (
                  <TableRow
                    key={u.unitId}
                    className="cursor-pointer hover:bg-muted/40"
                    onClick={() => setDrillUnit(u)}
                  >
                    <TableCell className="font-medium">
                      {u.unitName}
                      {u.unitType && <span className="ml-2 text-xs text-muted-foreground">({u.unitType})</span>}
                    </TableCell>
                    <TableCell className="text-right">{u.itemCount}</TableCell>
                    <TableCell className="text-right">{formatCurrencyLocale(u.totalValue)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <UnitDetailModal hospitalId={hospitalId} unit={drillUnit} onClose={() => setDrillUnit(null)} />
    </Card>
  );
}
