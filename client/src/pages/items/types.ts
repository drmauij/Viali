import type { Item, StockLevel } from "@shared/schema";

export type FilterType = "all" | "runningLow" | "stockout" | "archived";

export interface ItemWithStock extends Item {
  stockLevel?: StockLevel;
  soonestExpiry?: Date;
}

export type UnitType = "Pack" | "Single unit";

export interface ItemsProps {
  overrideUnitId?: string;
  readOnly?: boolean;
}
