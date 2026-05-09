export type EconomyType = "military" | "industrial" | "agricultural" | "research" | "trading" | "mining";
export type DemandLevel = "oversupply" | "surplus" | "normal" | "scarce" | "shortage";

export const DEMAND_LEVELS: readonly DemandLevel[] = ["oversupply", "surplus", "normal", "scarce", "shortage"];
export const DEMAND_MULTIPLIER: Record<DemandLevel, number> = {
  oversupply: 0.55, surplus: 0.80, normal: 1.00, scarce: 1.35, shortage: 1.80,
};
export const DEMAND_LABEL: Record<DemandLevel, string> = {
  oversupply: "OVERSUPPLIED", surplus: "SURPLUS", normal: "NORMAL", scarce: "SCARCE", shortage: "SHORTAGE",
};

export interface ShopEntry {
  readonly moduleDefId: string;
  demand: DemandLevel;
  price: number;
  stock: number;
}

export interface LocationShopState {
  readonly locationId: string;
  readonly economyType: EconomyType;
  entries: ShopEntry[];
  lastRefreshCycle: number;
  readonly seed: number;
}

// ── Render data ───────────────────────────────────────────────────────────────

export interface ShopRenderEntry {
  readonly moduleDefId: string;
  readonly name: string;
  readonly moduleType: string;
  readonly demand: DemandLevel;
  readonly price: number;
  readonly stock: number;
  readonly owned: number;
  readonly isSelected: boolean;
}

export interface ShopRenderData {
  readonly locationName: string;
  readonly economyType: EconomyType;
  readonly entries: ReadonlyArray<ShopRenderEntry>;
  readonly selectedIndex: number;
  readonly scrollOffset: number;
  readonly searchText: string;
  readonly playerCredits: number;
  readonly statusMsg: string | null;
}
