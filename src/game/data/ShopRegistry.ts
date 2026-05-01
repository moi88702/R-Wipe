/**
 * ShopRegistry — static shop definitions for all dockable locations.
 *
 * Each shop is a named list of purchasable items. Shop ids are referenced by
 * `Location.shops` in the LocationRegistry. Players can buy items at full
 * price and sell them back at 50% of purchase price.
 *
 * Usage:
 *   ShopRegistry.getShopItems("shop-tf-alpha")
 *   ShopRegistry.getItem("item-medkit")
 *   ShopRegistry.getAllShopIds()
 */

// ── ShopItem definition ───────────────────────────────────────────────────────

export interface ShopItem {
  /** Unique item id referenced by purchase / sell operations. */
  id: string;
  /** Player-facing display name. */
  name: string;
  /** Functional category used by the HUD and ship configuration screens. */
  category: "weapon" | "ability" | "equipment" | "consumable";
  /** Standard purchase price in credits. Sell price is floor(priceCredits * 0.5). */
  priceCredits: number;
  /** Short description shown in the shop interface. */
  description: string;
}

// ── Item catalogue ────────────────────────────────────────────────────────────
// All purchasable items in the game. Each shop references a subset by id.

const ALL_ITEMS: readonly ShopItem[] = Object.freeze([
  // ── Consumables ────────────────────────────────────────────────────────────
  {
    id: "item-medkit",
    name: "Medical Kit",
    category: "consumable",
    priceCredits: 100,
    description: "Restores 50 hull integrity on use.",
  },
  {
    id: "item-repair-drone",
    name: "Repair Drone",
    category: "consumable",
    priceCredits: 250,
    description: "Automated hull-repair unit. Single use.",
  },
  {
    id: "item-trade-manifest",
    name: "Trade Manifest",
    category: "consumable",
    priceCredits: 50,
    description: "Merchant route documentation required by Federation customs.",
  },
  {
    id: "item-salvage-kit",
    name: "Salvage Kit",
    category: "consumable",
    priceCredits: 75,
    description: "Increases salvageable material yield by 20%.",
  },
  {
    id: "item-jury-rig",
    name: "Jury Rig",
    category: "consumable",
    priceCredits: 150,
    description: "Field-expedient temporary repair. Buys time but not durability.",
  },
  {
    id: "item-emp-device",
    name: "EMP Device",
    category: "consumable",
    priceCredits: 200,
    description: "Single-use pulse that temporarily disables nearby enemy systems.",
  },
  // ── Equipment ──────────────────────────────────────────────────────────────
  {
    id: "item-scanner-basic",
    name: "Basic Scanner",
    category: "equipment",
    priceCredits: 500,
    description: "Standard scanner module. Range 500 km, no penetration.",
  },
  {
    id: "item-shield-booster",
    name: "Shield Booster",
    category: "equipment",
    priceCredits: 400,
    description: "Enhances shield capacity by 25%. Stackable up to three units.",
  },
  {
    id: "item-xeno-relay",
    name: "Xeno Relay",
    category: "equipment",
    priceCredits: 800,
    description: "Alien communications array. Required for Collective contracts.",
  },
  {
    id: "item-drill-head",
    name: "Drill Head",
    category: "equipment",
    priceCredits: 600,
    description: "Hardened mining attachment. Increases ore-extraction rate by 40%.",
  },
  {
    id: "item-ore-scanner",
    name: "Ore Scanner",
    category: "equipment",
    priceCredits: 350,
    description: "Passive sensor array that locates mineral deposits within 200 km.",
  },
  {
    id: "item-rebel-beacon",
    name: "Rebel Beacon",
    category: "equipment",
    priceCredits: 450,
    description: "Rebel faction identifier. Grants passage through rebel-held zones.",
  },
  // ── Weapons ────────────────────────────────────────────────────────────────
  {
    id: "item-laser-cannon",
    name: "Laser Cannon",
    category: "weapon",
    priceCredits: 900,
    description: "Standard-issue energy weapon. High accuracy, moderate damage.",
  },
  {
    id: "item-plasma-rifle",
    name: "Plasma Rifle",
    category: "weapon",
    priceCredits: 1200,
    description: "Fires superheated plasma bolts. High damage, slower fire rate.",
  },
] as const);

const ITEM_MAP: Readonly<Record<string, ShopItem>> = Object.freeze(
  Object.fromEntries(ALL_ITEMS.map((i) => [i.id, i])),
);

// ── Shop definitions ──────────────────────────────────────────────────────────
// Maps shop id → list of item ids stocked at that shop.

const SHOP_STOCK: Readonly<Record<string, readonly string[]>> = Object.freeze({
  // Terran Federation — Station Alpha (well-stocked Federation supply post)
  "shop-tf-alpha": [
    "item-medkit",
    "item-repair-drone",
    "item-trade-manifest",
    "item-scanner-basic",
    "item-laser-cannon",
  ],
  // Terran Federation — Frontier Outpost (limited supplies)
  "shop-tf-frontier": [
    "item-medkit",
    "item-trade-manifest",
  ],
  // Void Merchants — Station Beta (trading hub)
  "shop-vm-beta": [
    "item-medkit",
    "item-repair-drone",
    "item-shield-booster",
    "item-laser-cannon",
    "item-plasma-rifle",
  ],
  // Void Merchants — Neutral Hub (large trading depot)
  "shop-vm-neutral": [
    "item-medkit",
    "item-repair-drone",
    "item-trade-manifest",
    "item-scanner-basic",
    "item-shield-booster",
    "item-laser-cannon",
    "item-plasma-rifle",
  ],
  // Xeno Collective — Nexus
  "shop-xc-nexus": [
    "item-xeno-relay",
    "item-scanner-basic",
    "item-medkit",
  ],
  // Xeno Collective — Crystal Spire
  "shop-xc-spire": [
    "item-xeno-relay",
    "item-shield-booster",
    "item-medkit",
  ],
  // Scavenger Clans — Haven
  "shop-sc-haven": [
    "item-salvage-kit",
    "item-jury-rig",
    "item-ore-scanner",
    "item-medkit",
  ],
  // Deep Miners — Outpost Gamma
  "shop-dm-gamma": [
    "item-drill-head",
    "item-ore-scanner",
    "item-salvage-kit",
    "item-medkit",
  ],
  // Deep Miners — Core Station
  "shop-dm-core": [
    "item-drill-head",
    "item-ore-scanner",
    "item-scanner-basic",
    "item-medkit",
    "item-repair-drone",
  ],
  // Nova Rebels — Base
  "shop-nr-base": [
    "item-emp-device",
    "item-rebel-beacon",
    "item-jury-rig",
    "item-medkit",
  ],
});

// ── Public API ─────────────────────────────────────────────────────────────────

export const ShopRegistry = {
  /**
   * Returns all items stocked at the given shop id, in display order.
   * Returns an empty array for unknown shop ids.
   */
  getShopItems(shopId: string): ShopItem[] {
    const itemIds = SHOP_STOCK[shopId];
    if (!itemIds) return [];
    return itemIds
      .map((id) => ITEM_MAP[id])
      .filter((item): item is ShopItem => item !== undefined);
  },

  /**
   * Returns the item definition for a given item id, or `undefined` if unknown.
   */
  getItem(itemId: string): ShopItem | undefined {
    return ITEM_MAP[itemId];
  },

  /**
   * Returns every defined item in the catalogue.
   */
  getAllItems(): readonly ShopItem[] {
    return ALL_ITEMS;
  },

  /**
   * Returns all known shop ids.
   */
  getAllShopIds(): string[] {
    return Object.keys(SHOP_STOCK);
  },

  /**
   * Compute the sell-back price for an item (50% of purchase price, floored).
   */
  getSellPrice(itemId: string): number {
    const item = ITEM_MAP[itemId];
    return item ? Math.floor(item.priceCredits * 0.5) : 0;
  },
} as const;
