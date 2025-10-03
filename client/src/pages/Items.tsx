import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Item, StockLevel } from "@shared/schema";

type FilterType = "all" | "critical" | "controlled" | "expiring" | "belowMin";

interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
  soonestExpiry?: Date;
}

export default function Items() {
  const { user } = useAuth();
  const [activeHospital] = useState(() => (user as any)?.hospitals?.[0]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [sortBy, setSortBy] = useState("name");

  const { data: items = [], isLoading } = useQuery<ItemWithStock[]>({
    queryKey: ["/api/items", activeHospital?.id],
    enabled: !!activeHospital?.id,
  });

  const filteredItems = useMemo(() => {
    let filtered = items;

    // Apply search filter
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Apply category filter
    if (activeFilter !== "all") {
      filtered = filtered.filter(item => {
        switch (activeFilter) {
          case "critical":
            return item.critical;
          case "controlled":
            return item.controlled;
          case "expiring":
            if (!item.soonestExpiry) return false;
            const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
          case "belowMin":
            return (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0);
          default:
            return true;
        }
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "expiry":
          const aExpiry = a.soonestExpiry ? new Date(a.soonestExpiry).getTime() : Infinity;
          const bExpiry = b.soonestExpiry ? new Date(b.soonestExpiry).getTime() : Infinity;
          return aExpiry - bExpiry;
        case "usage":
          // Mock usage rate - would come from analytics
          return Math.random() - 0.5;
        case "stock":
          const aStock = a.stockLevel?.qtyOnHand || 0;
          const bStock = b.stockLevel?.qtyOnHand || 0;
          return aStock - bStock;
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [items, searchTerm, activeFilter, sortBy]);

  const getFilterCounts = () => {
    return {
      all: items.length,
      critical: items.filter(item => item.critical).length,
      controlled: items.filter(item => item.controlled).length,
      expiring: items.filter(item => {
        if (!item.soonestExpiry) return false;
        const daysUntilExpiry = Math.ceil((new Date(item.soonestExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysUntilExpiry <= 90 && daysUntilExpiry > 0;
      }).length,
      belowMin: items.filter(item => (item.stockLevel?.qtyOnHand || 0) <= (item.minThreshold || 0)).length,
    };
  };

  const filterCounts = getFilterCounts();

  const getDaysUntilExpiry = (expiryDate?: Date) => {
    if (!expiryDate) return null;
    return Math.ceil((new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryColor = (days: number | null) => {
    if (!days || days < 0) return "expiry-red";
    if (days <= 30) return "expiry-red";
    if (days <= 60) return "expiry-orange";
    if (days <= 90) return "expiry-yellow";
    return "expiry-green";
  };

  const getStockStatus = (item: ItemWithStock) => {
    const currentQty = item.stockLevel?.qtyOnHand || 0;
    const minThreshold = item.minThreshold || 0;
    
    if (currentQty <= minThreshold) {
      return { color: "text-warning", status: "Below Min" };
    }
    return { color: "text-success", status: "Good" };
  };

  if (!activeHospital) {
    return (
      <div className="p-4">
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <i className="fas fa-hospital text-4xl text-muted-foreground mb-4"></i>
          <h3 className="text-lg font-semibold text-foreground mb-2">No Hospital Selected</h3>
          <p className="text-muted-foreground">Please select a hospital to view items.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Items</h1>
        <Button size="sm" data-testid="add-item-button">
          <i className="fas fa-plus mr-2"></i>
          Add Item
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <i className="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"></i>
        <Input
          placeholder="Search items..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
          data-testid="items-search"
        />
      </div>

      {/* Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "all" ? "chip-primary" : "chip-muted"}`}
          onClick={() => setActiveFilter("all")}
          data-testid="filter-all"
        >
          All Items ({filterCounts.all})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "critical" ? "chip-critical" : "chip-muted"}`}
          onClick={() => setActiveFilter("critical")}
          data-testid="filter-critical"
        >
          <i className="fas fa-exclamation-circle text-xs mr-1"></i>
          Critical ({filterCounts.critical})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "controlled" ? "chip-controlled" : "chip-muted"}`}
          onClick={() => setActiveFilter("controlled")}
          data-testid="filter-controlled"
        >
          <i className="fas fa-shield-halved text-xs mr-1"></i>
          Controlled ({filterCounts.controlled})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "expiring" ? "chip-warning" : "chip-muted"}`}
          onClick={() => setActiveFilter("expiring")}
          data-testid="filter-expiring"
        >
          <i className="fas fa-clock text-xs mr-1"></i>
          Expiring ({filterCounts.expiring})
        </button>
        <button
          className={`status-chip whitespace-nowrap ${activeFilter === "belowMin" ? "chip-warning" : "chip-muted"}`}
          onClick={() => setActiveFilter("belowMin")}
          data-testid="filter-below-min"
        >
          <i className="fas fa-arrow-down text-xs mr-1"></i>
          Below Min ({filterCounts.belowMin})
        </button>
      </div>

      {/* Sort Options */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{filteredItems.length} items</span>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-3 py-2 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          data-testid="items-sort"
        >
          <option value="name">Sort: Name A-Z</option>
          <option value="expiry">Sort: Expiry (Soon first)</option>
          <option value="usage">Sort: Usage Rate</option>
          <option value="stock">Sort: Stock Level</option>
        </select>
      </div>

      {/* Items List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="text-center py-8">
            <i className="fas fa-spinner fa-spin text-2xl text-primary mb-2"></i>
            <p className="text-muted-foreground">Loading items...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="bg-card border border-border rounded-lg p-8 text-center">
            <i className="fas fa-search text-4xl text-muted-foreground mb-4"></i>
            <h3 className="text-lg font-semibold text-foreground mb-2">No Items Found</h3>
            <p className="text-muted-foreground">
              {searchTerm ? "Try adjusting your search terms" : "No items match the selected filters"}
            </p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const stockStatus = getStockStatus(item);
            const daysUntilExpiry = getDaysUntilExpiry(item.soonestExpiry);
            const currentQty = item.stockLevel?.qtyOnHand || 0;

            return (
              <div key={item.id} className="item-row" data-testid={`item-${item.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0 pr-3">
                    <h3 className="font-semibold text-foreground">{item.name}</h3>
                    <p className="text-sm text-muted-foreground">{item.description || `${item.unit} unit`}</p>
                  </div>
                  <div className="flex gap-1">
                    {item.critical && (
                      <span className="status-chip chip-critical text-xs">
                        <i className="fas fa-exclamation-circle"></i>
                      </span>
                    )}
                    {item.controlled && (
                      <span className="status-chip chip-controlled text-xs">
                        <i className="fas fa-shield-halved"></i>
                      </span>
                    )}
                  </div>
                </div>

                {daysUntilExpiry !== null && (
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`expiry-indicator ${getExpiryColor(daysUntilExpiry)}`}></div>
                    <span className="text-sm text-muted-foreground">
                      Expires in {Math.max(0, daysUntilExpiry)} days
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className={`text-2xl font-bold ${stockStatus.color}`}>
                      {currentQty}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      / Min: {item.minThreshold || 0} / Max: {item.maxThreshold || 0}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" data-testid={`view-item-${item.id}`}>
                    View
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
