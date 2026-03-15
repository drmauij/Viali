import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TFunction } from "i18next";
import type { ItemWithStock } from "./types";
import { getStockStatus, getDaysUntilExpiry, getExpiryColor } from "./itemHandlers";

export type ItemRowMode = "normal" | "bulk-edit" | "bulk-delete";

export interface ItemRowProps {
  item: ItemWithStock;
  mode: ItemRowMode;
  isSelected?: boolean;
  canWrite: boolean;
  openOrderItems: Record<string, { totalQty: number }>;
  bulkEditData?: Record<string, any>;
  onEdit: (item: ItemWithStock) => void;
  onQuickOrder: (e: React.MouseEvent, item: ItemWithStock) => void;
  onQuickReduce: (e: React.MouseEvent, item: ItemWithStock) => void;
  onToggleSelect: (itemId: string) => void;
  onBulkEditChange: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  t: TFunction;
}

const ItemRow = React.memo(function ItemRow({
  item,
  mode,
  isSelected = false,
  canWrite,
  openOrderItems,
  bulkEditData,
  onEdit,
  onQuickOrder,
  onQuickReduce,
  onToggleSelect,
  onBulkEditChange,
  t,
}: ItemRowProps) {
  const stockStatus = getStockStatus(item, t);
  const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
  const currentQty = item.stockLevel?.qtyOnHand || 0;
  const isBulkEditMode = mode === "bulk-edit";
  const isBulkDeleteMode = mode === "bulk-delete";
  const editData = bulkEditData?.[item.id];

  return (
    <div
      className="item-row"
      onClick={!isBulkEditMode && !isBulkDeleteMode ? () => onEdit(item) : undefined}
      style={!isBulkEditMode && !isBulkDeleteMode ? { cursor: "pointer" } : undefined}
      data-testid={`item-${item.id}`}
    >
      <div className="flex items-start justify-between mb-3">
        {isBulkDeleteMode ? (
          <div
            className="flex items-center gap-3 flex-1 cursor-pointer -ml-2 -mr-2 pl-2 pr-2 py-1 rounded hover:bg-muted/50 transition-colors"
            onClick={() => onToggleSelect(item.id)}
          >
            <div onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(item.id)}
                data-testid={`checkbox-item-${item.id}`}
              />
            </div>
            <div className="flex-1 pointer-events-none">
              <h3 className="font-semibold text-foreground">{item.name}</h3>
              <p className="text-sm text-muted-foreground">{item.description || ""}</p>
            </div>
          </div>
        ) : isBulkEditMode ? (
          item.controlled ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2">
                <h3 className="font-semibold text-foreground truncate flex-1">{item.name}</h3>
                <span className="status-chip chip-controlled text-xs" data-testid={`item-${item.id}-controlled`}>
                  <i className="fas fa-shield-halved"></i>
                </span>
              </div>
            </div>
          ) : (
            <div className="flex-1 space-y-2">
              <div>
                <Label className="text-xs">{t("items.name")}</Label>
                <Input
                  value={editData?.name !== undefined ? editData.name : item.name}
                  onChange={(e) => {
                    onBulkEditChange((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], name: e.target.value },
                    }));
                  }}
                  data-testid={`bulk-edit-name-${item.id}`}
                />
              </div>
            </div>
          )
        ) : (
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-foreground">{item.name}</h3>
                <p className="text-sm text-muted-foreground">{item.description || ""}</p>
              </div>
              {item.controlled && (
                <span
                  className="status-chip chip-controlled text-xs flex-shrink-0"
                  data-testid={`item-${item.id}-controlled`}
                >
                  <i className="fas fa-shield-halved"></i>
                </span>
              )}
              {item.isService && (
                <span
                  className="status-chip bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs flex-shrink-0"
                  data-testid={`item-${item.id}-service`}
                >
                  <i className="fas fa-concierge-bell mr-1"></i>
                  {t("items.serviceBadge")}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {daysUntilExpiry !== null && (
        <div className="flex items-center gap-2 mb-2">
          <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
          <span className="text-sm text-muted-foreground">
            {t("items.expiresInDays", { days: Math.max(0, daysUntilExpiry) })}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        {isBulkEditMode ? (
          item.controlled ? (
            <div
              className="flex items-center gap-2 text-muted-foreground py-2"
              data-testid={`bulk-edit-controlled-disabled-${item.id}`}
            >
              <i className="fas fa-shield-halved text-amber-500"></i>
              <span className="text-sm">{t("items.controlledNoBulkEdit")}</span>
            </div>
          ) : (
            <BulkEditFields
              item={item}
              editData={editData}
              currentQty={currentQty}
              onBulkEditChange={onBulkEditChange}
              t={t}
            />
          )
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center w-full gap-2">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                {item.trackExactQuantity || item.unit.toLowerCase() === "single unit" ? (
                  <>
                    <span
                      className={`text-2xl font-bold ${stockStatus.color}`}
                      data-testid={`item-${item.id}-stock`}
                    >
                      {item.trackExactQuantity ? item.currentUnits || 0 : currentQty}
                    </span>
                    <i className={`fas fa-vial text-lg ${stockStatus.color}`}></i>
                  </>
                ) : (
                  <>
                    <span
                      className={`text-2xl font-bold ${stockStatus.color}`}
                      data-testid={`item-${item.id}-stock`}
                    >
                      {currentQty}
                    </span>
                    <i className={`fas fa-box text-lg ${stockStatus.color}`}></i>
                  </>
                )}
              </div>
              {item.status === "archived" && (
                <span className="px-1.5 py-0.5 bg-gray-500 text-white rounded text-xs">
                  {t("items.archivedBadge")}
                </span>
              )}
            </div>
            <div className="sm:ml-auto flex gap-2 items-center justify-end">
              {canWrite &&
                !item.controlled &&
                (item.trackExactQuantity ? (item.currentUnits || 0) > 0 : currentQty > 0) && (
                  <button
                    onClick={(e) => onQuickReduce(e, item)}
                    className="px-2 py-1.5 sm:px-4 sm:py-2 bg-orange-500 text-white rounded-lg text-xs sm:text-sm font-medium hover:bg-orange-600 active:bg-orange-700 transition-colors flex items-center justify-center touch-manipulation"
                    data-testid={`item-${item.id}-quick-reduce`}
                    title={
                      item.trackExactQuantity || item.unit.toLowerCase() === "single unit"
                        ? "Reduce 1 unit"
                        : "Reduce 1 pack"
                    }
                  >
                    <i className="fas fa-arrow-right-from-bracket mr-1 sm:mr-1.5"></i>
                    {t("items.takeOut", "Take Out")}
                  </button>
                )}
              {canWrite &&
                currentQty <= (item.minThreshold || 0) &&
                currentQty < (item.maxThreshold || Infinity) &&
                (openOrderItems[item.id] ? (
                  <button
                    disabled
                    className="px-2 py-1.5 sm:px-4 sm:py-2 bg-muted text-muted-foreground rounded-lg text-xs sm:text-sm font-medium cursor-not-allowed"
                    data-testid={`item-${item.id}-quick-ordered`}
                  >
                    <i className="fas fa-check mr-1 sm:mr-1.5"></i>
                    {t("items.quickOrdered", { count: openOrderItems[item.id].totalQty })}
                  </button>
                ) : (
                  <button
                    onClick={(e) => onQuickOrder(e, item)}
                    className="px-2 py-1.5 sm:px-4 sm:py-2 bg-primary text-primary-foreground rounded-lg text-xs sm:text-sm font-medium hover:bg-primary/90 transition-colors"
                    data-testid={`item-${item.id}-quick-order`}
                  >
                    <i className="fas fa-bolt mr-1 sm:mr-1.5"></i>
                    {t("items.quickOrder")}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/** Inline bulk-edit grid — extracted to keep ItemRow readable */
function BulkEditFields({
  item,
  editData,
  currentQty,
  onBulkEditChange,
  t,
}: {
  item: ItemWithStock;
  editData: Record<string, any> | undefined;
  currentQty: number;
  onBulkEditChange: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  t: TFunction;
}) {
  const trackExact =
    editData?.trackExactQuantity !== undefined ? editData.trackExactQuantity : item.trackExactQuantity;

  return (
    <div className="grid grid-cols-4 gap-2 w-full">
      <div>
        <Label className="text-xs">{t("items.unitType")}</Label>
        <Select
          value={
            editData?.trackExactQuantity !== undefined
              ? editData.trackExactQuantity
                ? "pack"
                : "single"
              : item.trackExactQuantity
                ? "pack"
                : "single"
          }
          onValueChange={(val) => {
            onBulkEditChange((prev) => ({
              ...prev,
              [item.id]: { ...prev[item.id], trackExactQuantity: val === "pack" },
            }));
          }}
        >
          <SelectTrigger className="h-9" data-testid={`bulk-edit-unit-type-${item.id}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pack">{t("items.pack")}</SelectItem>
            <SelectItem value="single">{t("items.singleUnit")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {trackExact ? (
        <div>
          <Label className="text-xs">{t("items.packSize")}</Label>
          <Input
            type="number"
            min="1"
            value={editData?.packSize !== undefined ? editData.packSize : item.packSize || 1}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 1;
              onBulkEditChange((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], packSize: val },
              }));
            }}
            data-testid={`bulk-edit-pack-size-${item.id}`}
          />
        </div>
      ) : (
        <div></div>
      )}
      <div>
        <Label className="text-xs">{trackExact ? t("items.currentUnits") : t("items.stock")}</Label>
        <Input
          type="number"
          value={
            item.trackExactQuantity
              ? editData?.currentUnits !== undefined
                ? editData.currentUnits
                : item.currentUnits || 0
              : editData?.actualStock !== undefined
                ? editData.actualStock
                : currentQty
          }
          onChange={(e) => {
            const val = parseInt(e.target.value) || 0;
            if (item.trackExactQuantity) {
              onBulkEditChange((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], currentUnits: val },
              }));
            } else {
              onBulkEditChange((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], actualStock: val },
              }));
            }
          }}
          data-testid={`bulk-edit-${item.trackExactQuantity ? "units" : "stock"}-${item.id}`}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">{t("items.minThreshold")}</Label>
          <Input
            type="number"
            value={editData?.minThreshold !== undefined ? editData.minThreshold : item.minThreshold || 0}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              onBulkEditChange((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], minThreshold: val },
              }));
            }}
            data-testid={`bulk-edit-min-${item.id}`}
          />
        </div>
        <div>
          <Label className="text-xs">{t("items.maxThreshold")}</Label>
          <Input
            type="number"
            value={editData?.maxThreshold !== undefined ? editData.maxThreshold : item.maxThreshold || 0}
            onChange={(e) => {
              const val = parseInt(e.target.value) || 0;
              onBulkEditChange((prev) => ({
                ...prev,
                [item.id]: { ...prev[item.id], maxThreshold: val },
              }));
            }}
            data-testid={`bulk-edit-max-${item.id}`}
          />
        </div>
      </div>
    </div>
  );
}

export default ItemRow;
