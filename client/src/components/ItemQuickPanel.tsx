import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Item } from "@shared/schema";

interface ItemQuickPanelProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item & { 
    stockLevel?: { qtyOnHand: number }; 
    lots?: Array<{ id: string; expiryDate: Date; qty: number }>; 
  } | null;
  onStockUpdate?: (itemId: string, newQty: number) => void;
  onControlledDispense?: (item: Item) => void;
  canWrite?: boolean;
}

export default function ItemQuickPanel({
  isOpen,
  onClose,
  item,
  onStockUpdate,
  onControlledDispense,
  canWrite = true,
}: ItemQuickPanelProps) {
  const { t } = useTranslation();
  const [adjustmentQty, setAdjustmentQty] = useState<string>("");

  if (!isOpen || !item) return null;

  const currentQty = item.stockLevel?.qtyOnHand || 0;
  const minThreshold = item.minThreshold || 0;
  const maxThreshold = item.maxThreshold || 100;
  
  const stockPercentage = Math.min((currentQty / maxThreshold) * 100, 100);
  const isLow = currentQty <= minThreshold;
  const isCritical = item.critical;
  const isControlled = item.controlled;

  // Calculate days until expiry for soonest expiring lot
  const soonestLot = item.lots?.find(lot => lot.qty > 0);
  const daysUntilExpiry = soonestLot?.expiryDate 
    ? Math.ceil((new Date(soonestLot.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;

  const getExpiryColor = (days: number | null) => {
    if (!days || days < 0) return "expiry-red";
    if (days <= 30) return "expiry-red";
    if (days <= 60) return "expiry-orange";
    if (days <= 90) return "expiry-yellow";
    return "expiry-green";
  };

  const handleQuantityChange = (operation: "add" | "subtract" | "set", value?: number) => {
    let newQty = currentQty;
    
    if (operation === "add") {
      newQty = currentQty + 1;
    } else if (operation === "subtract") {
      newQty = Math.max(0, currentQty - 1);
    } else if (operation === "set" && value !== undefined) {
      newQty = Math.max(0, value);
    }

    onStockUpdate?.(item.id, newQty);
  };

  const handleSetCount = () => {
    const qty = parseInt(adjustmentQty);
    if (!isNaN(qty)) {
      handleQuantityChange("set", qty);
      setAdjustmentQty("");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="quick-panel" onClick={(e) => e.stopPropagation()}>
        {/* Handle */}
        <div className="w-12 h-1 bg-muted-foreground/30 rounded-full mx-auto mb-4"></div>

        {/* Item Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center border border-border">
            {item.imageUrl ? (
              <img
                src={item.imageUrl}
                alt={item.name}
                className="w-full h-full object-cover rounded-lg"
              />
            ) : (
              <i className="fas fa-prescription-bottle-medical text-2xl text-muted-foreground"></i>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-foreground">{item.name}</h3>
            <p className="text-sm text-muted-foreground">{item.description || `${item.unit} unit`}</p>
            <div className="flex items-center gap-2 mt-2">
              {isCritical && (
                <span className="status-chip chip-critical" data-testid="critical-chip">
                  <i className="fas fa-exclamation-circle text-xs"></i>
                  {t("items.critical")}
                </span>
              )}
              {isControlled && (
                <span className="status-chip chip-controlled" data-testid="controlled-chip">
                  <i className="fas fa-shield-halved text-xs"></i>
                  {t("items.controlled")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stock Status */}
        <div className="bg-muted rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{t("items.stockLevel")}</span>
            <span className="text-sm text-muted-foreground">{t("items.locationOrStorage")}</span>
          </div>
          <div className="flex items-end gap-6 mb-3">
            <div>
              <p className="text-3xl font-bold text-foreground" data-testid="current-qty">
                {currentQty}
              </p>
              <p className="text-xs text-muted-foreground">{t("items.onHand")}</p>
            </div>
            <div className="flex-1 flex items-end gap-4">
              <div>
                <p className="text-lg font-semibold text-warning" data-testid="min-threshold">
                  {minThreshold}
                </p>
                <p className="text-xs text-muted-foreground">{t("items.min")}</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-success" data-testid="max-threshold">
                  {maxThreshold}
                </p>
                <p className="text-xs text-muted-foreground">{t("items.max")}</p>
              </div>
            </div>
          </div>
          <div className="progress-bar">
            <div
              className={`progress-fill ${isLow ? "bg-warning" : "bg-success"}`}
              style={{ width: `${Math.max(stockPercentage, 5)}%` }}
            ></div>
          </div>
          {isLow && (
            <p className="text-xs text-warning font-medium mt-2">
              {t("items.belowMinimumThreshold")}
            </p>
          )}

          {daysUntilExpiry !== null && (
            <div className="flex items-center gap-2 mt-3">
              <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
              <span className="text-sm text-muted-foreground">
                {t("items.expiresInDays", { count: Math.max(0, daysUntilExpiry) })}
              </span>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="space-y-3">
          {canWrite && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <button
                  className="action-button btn-outline flex-col h-20"
                  onClick={() => handleQuantityChange("subtract")}
                  data-testid="qty-decrease"
                >
                  <i className="fas fa-minus text-xl"></i>
                  <span className="text-xs mt-1">-1</span>
                </button>
                <div className="flex flex-col h-20 gap-1">
                  <input
                    type="number"
                    placeholder={t("items.newQty")}
                    value={adjustmentQty}
                    onChange={(e) => setAdjustmentQty(e.target.value)}
                    className="flex-1 px-2 py-1 rounded border border-input bg-background text-foreground text-center text-sm"
                    data-testid="qty-input"
                  />
                  <button
                    className="action-button btn-primary text-xs py-1"
                    onClick={handleSetCount}
                    disabled={!adjustmentQty}
                    data-testid="set-count-button"
                  >
                    {t("items.set")}
                  </button>
                </div>
                <button
                  className="action-button btn-outline flex-col h-20"
                  onClick={() => handleQuantityChange("add")}
                  data-testid="qty-increase"
                >
                  <i className="fas fa-plus text-xl"></i>
                  <span className="text-xs mt-1">+1</span>
                </button>
              </div>

              <button
                className="action-button btn-outline w-full"
                data-testid="add-lot-button"
              >
                <i className="fas fa-calendar-plus"></i>
                <span>{t("items.addLotExpiry")}</span>
              </button>

              <button
                className="action-button btn-outline w-full"
                data-testid="move-stock-button"
              >
                <i className="fas fa-exchange-alt"></i>
                <span>{t("items.moveStock")}</span>
              </button>

              <button
                className="action-button btn-destructive w-full"
                data-testid="mark-expired-button"
              >
                <i className="fas fa-times-circle"></i>
                <span>{t("items.markExpiredDamaged")}</span>
              </button>

              {isControlled && (
                <button
                  className="action-button btn-secondary w-full"
                  onClick={() => onControlledDispense?.(item)}
                  data-testid="record-administration-button"
                >
                  <i className="fas fa-shield-halved"></i>
                  <span>{t("items.recordAdministration")}</span>
                </button>
              )}
            </>
          )}
        </div>

        <button
          className="action-button btn-outline w-full mt-6"
          onClick={onClose}
          data-testid="close-panel-button"
        >
          <span>{t("common.close")}</span>
        </button>
      </div>
    </div>
  );
}
