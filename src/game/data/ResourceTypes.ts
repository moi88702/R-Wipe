/**
 * ResourceTypes — definitions for every harvestable resource in the game.
 *
 * Three resource types exist:
 *   - alloy           — common structural material, used in most upgrades
 *   - power-crystal   — energetic mineral, used in mid-to-high tier upgrades
 *   - exotic-material — extremely rare; needed only for tier-9–11 upgrades
 *
 * Zone difficulty multipliers control how much of each resource spawns per deposit.
 *
 * Usage:
 *   ResourceTypes.getResourceDefinition("alloy")
 *   ResourceTypes.getAbundanceMultiplier("power-crystal", "hard")
 *   ResourceTypes.getAllResources()
 */

// ── Resource definition ───────────────────────────────────────────────────────

export interface ResourceDefinition {
  /** Canonical type id — matches `ResourceDeposit.type`. */
  id: "alloy" | "power-crystal" | "exotic-material";
  /** Player-facing display name. */
  displayName: string;
  /** Short description shown in the harvesting UI and inventory tooltip. */
  description: string;
  /**
   * Base units available in a deposit before zone multipliers are applied.
   * The actual deposit quantity is `baseQuantity * zoneMultiplier[zoneDifficulty]`.
   */
  baseQuantity: number;
  /**
   * Base harvest rate in units per second before zone multipliers.
   * Controls how fast the player collects resources at a deposit.
   */
  baseHarvestRatePerSecond: number;
  /**
   * Per-zone-difficulty abundance multipliers.
   * Easy zones have scarce resources; hard zones are abundant.
   */
  zoneAbundanceMultipliers: {
    easy: number;
    normal: number;
    hard: number;
  };
  /**
   * Credit value per unit when sold on the open market.
   * NPCs offering trade missions may pay above this price.
   */
  baseMarketValue: number;
  /** Visual accent colour used for deposit markers on the map (0–255). */
  color: { r: number; g: number; b: number };
}

// ── Definitions ───────────────────────────────────────────────────────────────

const ALLOY: ResourceDefinition = {
  id: "alloy",
  displayName: "Alloy",
  description:
    "Refined structural alloy salvaged from asteroid fields. Used in most capital ship upgrades.",
  baseQuantity: 50,
  baseHarvestRatePerSecond: 3,
  zoneAbundanceMultipliers: { easy: 0.5, normal: 1.0, hard: 2.0 },
  baseMarketValue: 12,
  color: { r: 160, g: 160, b: 180 },
};

const POWER_CRYSTAL: ResourceDefinition = {
  id: "power-crystal",
  displayName: "Power Crystal",
  description:
    "High-density energy crystals mined from deep asteroid formations. Required for mid-to-high tier upgrades.",
  baseQuantity: 20,
  baseHarvestRatePerSecond: 1.5,
  zoneAbundanceMultipliers: { easy: 0.25, normal: 0.75, hard: 1.75 },
  baseMarketValue: 40,
  color: { r: 80, g: 200, b: 255 },
};

const EXOTIC_MATERIAL: ResourceDefinition = {
  id: "exotic-material",
  displayName: "Exotic Material",
  description:
    "Unstable exotic matter recovered from collapsed stellar remnants. Extremely rare; essential for tier-9–11 capital ship upgrades.",
  baseQuantity: 5,
  baseHarvestRatePerSecond: 0.5,
  zoneAbundanceMultipliers: { easy: 0.0, normal: 0.25, hard: 1.0 },
  baseMarketValue: 250,
  color: { r: 255, g: 60, b: 200 },
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_RESOURCES: readonly ResourceDefinition[] = Object.freeze([
  ALLOY,
  POWER_CRYSTAL,
  EXOTIC_MATERIAL,
]);

const RESOURCE_MAP: Readonly<
  Record<string, ResourceDefinition>
> = Object.freeze(Object.fromEntries(ALL_RESOURCES.map((r) => [r.id, r])));

// ── Public API ────────────────────────────────────────────────────────────────

export const ResourceTypes = {
  /**
   * Returns the definition for the given resource type id, or `undefined`.
   */
  getResourceDefinition(
    id: "alloy" | "power-crystal" | "exotic-material" | string,
  ): ResourceDefinition | undefined {
    return RESOURCE_MAP[id];
  },

  /**
   * Returns all resource definitions.
   */
  getAllResources(): readonly ResourceDefinition[] {
    return ALL_RESOURCES;
  },

  /**
   * Returns all resource type ids.
   */
  getAllResourceIds(): string[] {
    return ALL_RESOURCES.map((r) => r.id);
  },

  /**
   * Computes the effective deposit quantity for the given resource type and zone.
   * Returns 0 for exotic material in easy zones (no deposits spawn there).
   */
  getDepositQuantity(
    id: "alloy" | "power-crystal" | "exotic-material" | string,
    zoneDifficulty: "easy" | "normal" | "hard",
  ): number {
    const def = RESOURCE_MAP[id];
    if (!def) return 0;
    return def.baseQuantity * def.zoneAbundanceMultipliers[zoneDifficulty];
  },

  /**
   * Returns the raw zone abundance multiplier for a resource type.
   */
  getAbundanceMultiplier(
    id: "alloy" | "power-crystal" | "exotic-material" | string,
    zoneDifficulty: "easy" | "normal" | "hard",
  ): number {
    const def = RESOURCE_MAP[id];
    if (!def) return 0;
    return def.zoneAbundanceMultipliers[zoneDifficulty];
  },

  /**
   * Computes the effective harvest rate (units/second) for the given resource
   * in the given zone.
   */
  getHarvestRate(
    id: "alloy" | "power-crystal" | "exotic-material" | string,
    zoneDifficulty: "easy" | "normal" | "hard",
  ): number {
    const def = RESOURCE_MAP[id];
    if (!def) return 0;
    // Harvest rate scales mildly with zone difficulty (same multiplier as quantity
    // but capped at 1.5× to keep the time sink meaningful in hard zones).
    const mult = Math.min(
      def.zoneAbundanceMultipliers[zoneDifficulty],
      1.5,
    );
    return def.baseHarvestRatePerSecond * Math.max(mult, 0.5);
  },
} as const;
