import type { EconomyType, DemandLevel, ShopEntry, LocationShopState } from "../types/economy";
import { DEMAND_LEVELS, DEMAND_MULTIPLIER } from "../types/economy";
import { getDemandBias, getModuleSelectionProb, seededRng, economyTypeForLocation } from "../game/data/EconomyProfiles";
import { SolarModuleRegistry } from "../game/data/SolarModuleRegistry";

const CYCLE_DURATION_MS = 5 * 60 * 1000;
const SELL_BACK_RATIO = 0.6;

function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function stockForDemand(demand: DemandLevel, rng: () => number): number {
  switch (demand) {
    case "oversupply": return 200 + Math.floor(rng() * 101);  // 200–300
    case "surplus":    return 70  + Math.floor(rng() * 61);   // 70–130
    case "normal":     return 30  + Math.floor(rng() * 41);   // 30–70
    case "scarce":     return 5   + Math.floor(rng() * 16);   // 5–20
    case "shortage":   return 1   + Math.floor(rng() * 8);    // 1–8
  }
}

function demandAtIndex(i: number): DemandLevel {
  const d = DEMAND_LEVELS[clamp(i, 0, DEMAND_LEVELS.length - 1)];
  if (d === undefined) return "normal";
  return d;
}

export class ShopManager {
  private shops = new Map<string, LocationShopState>();
  private cycleTimerMs = 0;
  private currentCycle = 0;

  generateShop(locationId: string, factionId: string): LocationShopState {
    const economyType: EconomyType = economyTypeForLocation(locationId, factionId);
    const seed = hashString(locationId);
    const rng = seededRng(seed);

    const entries: ShopEntry[] = [];
    const allModules = SolarModuleRegistry.getAllModules();

    // Stations that stock the full catalogue including capital-class and projector modules.
    const isFullStockStation =
      locationId === "station-earth-orbit" ||
      locationId === "outpost-mars";

    for (const def of allModules) {
      if (!isFullStockStation && def.type === "core") continue;
      if (!isFullStockStation && def.sizeClass !== 1) continue;

      // Full-stock stations carry everything; others use economy-weighted selection.
      const selectionProb = isFullStockStation
        ? 1.0
        : getModuleSelectionProb(economyType, def.type);
      if (rng() > selectionProb) continue;

      const bias = getDemandBias(economyType, def.type);
      const equilibriumIndex = clamp(2 + bias, 0, DEMAND_LEVELS.length - 1);

      // ±1 jitter from equilibrium
      const jitter = Math.floor(rng() * 3) - 1;
      const demandIndex = clamp(equilibriumIndex + jitter, 0, DEMAND_LEVELS.length - 1);
      const demand = demandAtIndex(demandIndex);

      const price = Math.round(def.shopCost * DEMAND_MULTIPLIER[demand]);

      // Stock mirrors demand level; converters have an extra 40% chance of being unavailable (not full-stock stations)
      if (!isFullStockStation && def.type === "converter" && rng() < 0.4) continue;
      const stock = stockForDemand(demand, rng);

      entries.push({ moduleDefId: def.id, demand, price, stock });
    }

    const shop: LocationShopState = {
      locationId,
      economyType,
      entries,
      lastRefreshCycle: 0,
      seed,
    };

    this.shops.set(locationId, shop);
    return shop;
  }

  tick(deltaMs: number): boolean {
    this.cycleTimerMs += deltaMs;
    if (this.cycleTimerMs >= CYCLE_DURATION_MS) {
      this.cycleTimerMs -= CYCLE_DURATION_MS;
      this.currentCycle++;
      this.refreshAll();
      return true;
    }
    return false;
  }

  refreshAll(): void {
    for (const shop of this.shops.values()) {
      this.refreshShop(shop);
    }
  }

  refreshShop(shop: LocationShopState): void {
    const allModules = SolarModuleRegistry.getModuleMap();

    for (let i = 0; i < shop.entries.length; i++) {
      const entry = shop.entries[i];
      if (entry === undefined) continue;

      const rng = seededRng(shop.seed + shop.lastRefreshCycle * 1000 + i * 17);
      const def = allModules.get(entry.moduleDefId);
      if (def === undefined) continue;

      const bias = getDemandBias(shop.economyType, def.type);
      const equilibriumIndex = clamp(2 + bias, 0, DEMAND_LEVELS.length - 1);
      const currentIndex = DEMAND_LEVELS.indexOf(entry.demand);

      let newIndex = currentIndex;

      // 3% chance of a 2-level market swing
      if (rng() < 0.03) {
        const swingDir = rng() < 0.5 ? -2 : 2;
        newIndex = clamp(currentIndex + swingDir, 0, DEMAND_LEVELS.length - 1);
      } else if (rng() < 0.20) {
        // 20% chance to drift 1 level
        const driftDir = rng() < 0.5 ? -1 : 1;
        newIndex = clamp(currentIndex + driftDir, 0, DEMAND_LEVELS.length - 1);
      }

      // Bias correction: extra pull toward equilibrium when more than 1 level away
      const distFromEq = newIndex - equilibriumIndex;
      if (Math.abs(distFromEq) > 1 && rng() < 0.4) {
        newIndex = clamp(newIndex - Math.sign(distFromEq), 0, DEMAND_LEVELS.length - 1);
      }

      entry.demand = demandAtIndex(newIndex);
      entry.price = Math.round(def.shopCost * DEMAND_MULTIPLIER[entry.demand]);
    }

    shop.lastRefreshCycle++;
  }

  getShop(locationId: string): LocationShopState | null {
    return this.shops.get(locationId) ?? this.generateShop(locationId, "terran-federation");
  }

  ensureShop(locationId: string, factionId: string): LocationShopState {
    const existing = this.shops.get(locationId);
    if (existing !== undefined) return existing;
    return this.generateShop(locationId, factionId);
  }

  buyModule(
    locationId: string,
    moduleDefId: string,
    playerCredits: number,
  ): { ok: true; price: number; newCredits: number } | { ok: false; reason: "no-shop" | "not-in-stock" | "insufficient-credits" } {
    const shop = this.shops.get(locationId);
    if (shop === undefined) return { ok: false, reason: "no-shop" };

    const entry = shop.entries.find(e => e.moduleDefId === moduleDefId);
    if (entry === undefined || entry.stock === 0) return { ok: false, reason: "not-in-stock" };

    if (playerCredits < entry.price) return { ok: false, reason: "insufficient-credits" };

    if (entry.stock !== -1) entry.stock--;
    const newCredits = playerCredits - entry.price;
    return { ok: true, price: entry.price, newCredits };
  }

  sellModule(
    locationId: string,
    moduleDefId: string,
    playerCredits: number,
  ): { ok: true; sellPrice: number; newCredits: number } | { ok: false; reason: "no-shop" | "not-in-stock" } {
    const shop = this.shops.get(locationId);
    if (shop === undefined) return { ok: false, reason: "no-shop" };

    let entry = shop.entries.find(e => e.moduleDefId === moduleDefId);
    if (entry === undefined) {
      // Item not currently stocked — add it with a shop markup so it appears for resale
      const def = SolarModuleRegistry.getModule(moduleDefId);
      if (!def) return { ok: false, reason: "not-in-stock" };
      const newEntry: ShopEntry = {
        moduleDefId,
        demand: "normal",
        price: Math.round(def.shopCost * 1.15),
        stock: 1,
      };
      shop.entries.push(newEntry);
      entry = newEntry;
    } else {
      entry.stock++;
    }

    const sellPrice = Math.round(entry.price * SELL_BACK_RATIO);
    const newCredits = playerCredits + sellPrice;
    return { ok: true, sellPrice, newCredits };
  }

  serialize(): string {
    return JSON.stringify(Array.from(this.shops.values()));
  }

  deserialize(json: string): void {
    const arr = JSON.parse(json) as LocationShopState[];
    this.shops = new Map(arr.map(s => [s.locationId, s]));
  }

  reset(): void {
    this.shops.clear();
    this.cycleTimerMs = 0;
    this.currentCycle = 0;
  }

  getAllShops(): LocationShopState[] {
    return Array.from(this.shops.values());
  }
}
