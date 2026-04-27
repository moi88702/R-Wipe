/**
 * CapitalShipUpgradeRegistry — static catalogue of upgrade modules and hulls.
 *
 * Upgrades span tiers 1–11 and are grouped into five categories:
 *   weapon, shield, engine, sensor, special
 *
 * Each upgrade declares which hardpoint slot type it occupies and which hulls
 * can accept it.  Three hulls are defined covering early, mid, and late-game
 * capital ships.
 *
 * Usage:
 *   CapitalShipUpgradeRegistry.getUpgrade("upgrade-laser-1")
 *   CapitalShipUpgradeRegistry.getUpgradesByTier(3)
 *   CapitalShipUpgradeRegistry.getUpgradesByHull("light-frigate")
 *   CapitalShipUpgradeRegistry.getHull("heavy-cruiser")
 */

import type { CapitalShipUpgrade, CapitalShipHull } from "../../types/capital-ship";

// ── Hull definitions ──────────────────────────────────────────────────────────

const LIGHT_FRIGATE: CapitalShipHull = {
  id: "light-frigate",
  name: "light-frigate",
  displayName: "Light Frigate",
  maxHealth: 500,
  hardpoints: [
    { id: "hardpoint-0", type: "weapon-slot",  capacity: 5 },
    { id: "hardpoint-1", type: "weapon-slot",  capacity: 5 },
    { id: "hardpoint-2", type: "defense-slot", capacity: 6 },
    { id: "hardpoint-3", type: "engine-slot",  capacity: 4 },
  ],
  basePowerCapacity: 40,
};

const HEAVY_CRUISER: CapitalShipHull = {
  id: "heavy-cruiser",
  name: "heavy-cruiser",
  displayName: "Heavy Cruiser",
  maxHealth: 1200,
  hardpoints: [
    { id: "hardpoint-0", type: "weapon-slot",  capacity: 8 },
    { id: "hardpoint-1", type: "weapon-slot",  capacity: 8 },
    { id: "hardpoint-2", type: "defense-slot", capacity: 8 },
    { id: "hardpoint-3", type: "defense-slot", capacity: 8 },
    { id: "hardpoint-4", type: "special-slot", capacity: 8 },
    { id: "hardpoint-5", type: "engine-slot",  capacity: 7 },
  ],
  basePowerCapacity: 90,
};

const DREADNOUGHT: CapitalShipHull = {
  id: "dreadnought",
  name: "dreadnought",
  displayName: "Dreadnought",
  maxHealth: 3000,
  hardpoints: [
    { id: "hardpoint-0", type: "weapon-slot",  capacity: 11 },
    { id: "hardpoint-1", type: "weapon-slot",  capacity: 11 },
    { id: "hardpoint-2", type: "weapon-slot",  capacity: 11 },
    { id: "hardpoint-3", type: "defense-slot", capacity: 11 },
    { id: "hardpoint-4", type: "defense-slot", capacity: 11 },
    { id: "hardpoint-5", type: "special-slot", capacity: 11 },
    { id: "hardpoint-6", type: "special-slot", capacity: 11 },
    { id: "hardpoint-7", type: "engine-slot",  capacity: 10 },
  ],
  basePowerCapacity: 200,
};

// ── Upgrade definitions ───────────────────────────────────────────────────────
// 13 upgrades spread across tiers 1–11, covering all five categories.

// ── Tier 1 ────────────────────────────────────────────────────────────────────

const LASER_MK1: CapitalShipUpgrade = {
  id: "upgrade-laser-1",
  name: "Laser Cannon Mk I",
  type: "weapon",
  tier: 1,
  hardpointType: "weapon-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: { weaponDamage: 15, fireRateHz: 2 },
  cost: 400,
  mass: 500,
  powerDraw: 4,
};

const BASIC_SHIELD: CapitalShipUpgrade = {
  id: "upgrade-shield-1",
  name: "Basic Shield Array",
  type: "shield",
  tier: 1,
  hardpointType: "defense-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: { shieldCapacity: 100 },
  cost: 350,
  mass: 300,
  powerDraw: 5,
};

// ── Tier 2 ────────────────────────────────────────────────────────────────────

const LASER_MK2: CapitalShipUpgrade = {
  id: "upgrade-laser-2",
  name: "Laser Cannon Mk II",
  type: "weapon",
  tier: 2,
  hardpointType: "weapon-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: { weaponDamage: 28, fireRateHz: 2.5 },
  cost: 900,
  mass: 520,
  powerDraw: 7,
};

const BASIC_ENGINE: CapitalShipUpgrade = {
  id: "upgrade-engine-1",
  name: "Thruster Pack Mk I",
  type: "engine",
  tier: 2,
  hardpointType: "engine-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: {},
  cost: 700,
  mass: 800,
  powerDraw: 8,
};

// ── Tier 3 ────────────────────────────────────────────────────────────────────

const BURST_LASER: CapitalShipUpgrade = {
  id: "upgrade-burst-laser",
  name: "Burst Laser Array",
  type: "weapon",
  tier: 3,
  hardpointType: "weapon-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: { weaponDamage: 12, fireRateHz: 6 },
  cost: 1200,
  mass: 600,
  powerDraw: 9,
};

const ION_SHIELD: CapitalShipUpgrade = {
  id: "upgrade-shield-2",
  name: "Ion Shield Grid",
  type: "shield",
  tier: 3,
  hardpointType: "defense-slot",
  hullCompatibility: ["light-frigate", "heavy-cruiser", "dreadnought"],
  stats: { shieldCapacity: 250 },
  cost: 1100,
  mass: 400,
  powerDraw: 10,
};

// ── Tier 4 ────────────────────────────────────────────────────────────────────

const PULSE_CANNON: CapitalShipUpgrade = {
  id: "upgrade-cannon-1",
  name: "Pulse Cannon",
  type: "weapon",
  tier: 4,
  hardpointType: "weapon-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: { weaponDamage: 55, fireRateHz: 1.5 },
  cost: 2000,
  mass: 1200,
  powerDraw: 14,
};

const ADVANCED_SENSOR: CapitalShipUpgrade = {
  id: "upgrade-sensor-1",
  name: "Deep-Range Sensor Suite",
  type: "sensor",
  tier: 4,
  hardpointType: "special-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: { specialEffect: "extended-range-scan" },
  cost: 1800,
  mass: 200,
  powerDraw: 6,
};

// ── Tier 5 ────────────────────────────────────────────────────────────────────

const TORPEDO_LAUNCHER: CapitalShipUpgrade = {
  id: "upgrade-torpedo-1",
  name: "Torpedo Launcher",
  type: "weapon",
  tier: 5,
  hardpointType: "weapon-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: { weaponDamage: 120, fireRateHz: 0.5 },
  cost: 3500,
  mass: 2000,
  powerDraw: 18,
};

const ADVANCED_ENGINE: CapitalShipUpgrade = {
  id: "upgrade-engine-2",
  name: "Advanced Thruster Pack",
  type: "engine",
  tier: 5,
  hardpointType: "engine-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: {},
  cost: 3000,
  mass: 1500,
  powerDraw: 20,
};

// ── Tier 7 ────────────────────────────────────────────────────────────────────

const EWAR_JAMMER: CapitalShipUpgrade = {
  id: "upgrade-ewar-1",
  name: "Electronic Warfare Jammer",
  type: "special",
  tier: 7,
  hardpointType: "special-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: { specialEffect: "electronic-warfare" },
  cost: 6000,
  mass: 800,
  powerDraw: 22,
};

// ── Tier 8 ────────────────────────────────────────────────────────────────────

const TRACTOR_BEAM: CapitalShipUpgrade = {
  id: "upgrade-tractor-1",
  name: "Tractor Beam Emitter",
  type: "special",
  tier: 8,
  hardpointType: "special-slot",
  hullCompatibility: ["heavy-cruiser", "dreadnought"],
  stats: { specialEffect: "tractor-beam" },
  cost: 8000,
  mass: 1000,
  powerDraw: 30,
};

// ── Tier 11 ───────────────────────────────────────────────────────────────────

const SINGULARITY_DRIVE: CapitalShipUpgrade = {
  id: "upgrade-singularity-drive",
  name: "Singularity Drive Core",
  type: "special",
  tier: 11,
  hardpointType: "special-slot",
  hullCompatibility: ["dreadnought"],
  stats: { specialEffect: "singularity-jump" },
  cost: 50000,
  mass: 5000,
  powerDraw: 60,
};

// ── Registry ──────────────────────────────────────────────────────────────────

const ALL_HULLS: readonly CapitalShipHull[] = Object.freeze([
  LIGHT_FRIGATE,
  HEAVY_CRUISER,
  DREADNOUGHT,
]);

const HULL_MAP: Readonly<Record<string, CapitalShipHull>> = Object.freeze(
  Object.fromEntries(ALL_HULLS.map((h) => [h.id, h])),
);

const ALL_UPGRADES: readonly CapitalShipUpgrade[] = Object.freeze([
  LASER_MK1,
  BASIC_SHIELD,
  LASER_MK2,
  BASIC_ENGINE,
  BURST_LASER,
  ION_SHIELD,
  PULSE_CANNON,
  ADVANCED_SENSOR,
  TORPEDO_LAUNCHER,
  ADVANCED_ENGINE,
  EWAR_JAMMER,
  TRACTOR_BEAM,
  SINGULARITY_DRIVE,
]);

const UPGRADE_MAP: Readonly<Record<string, CapitalShipUpgrade>> = Object.freeze(
  Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, u])),
);

// ── Public API ────────────────────────────────────────────────────────────────

export const CapitalShipUpgradeRegistry = {
  // ── Upgrade lookups ──────────────────────────────────────────────────────

  /**
   * Returns the upgrade definition for the given id, or `undefined` if unknown.
   */
  getUpgrade(id: string): CapitalShipUpgrade | undefined {
    return UPGRADE_MAP[id];
  },

  /**
   * Returns every upgrade definition in an immutable array.
   */
  getAllUpgrades(): readonly CapitalShipUpgrade[] {
    return ALL_UPGRADES;
  },

  /**
   * Returns all upgrade ids in the catalogue.
   */
  getAllUpgradeIds(): string[] {
    return ALL_UPGRADES.map((u) => u.id);
  },

  /**
   * Returns all upgrades at the given tier.
   */
  getUpgradesByTier(tier: number): CapitalShipUpgrade[] {
    return ALL_UPGRADES.filter((u) => u.tier === tier);
  },

  /**
   * Returns all upgrades of the given category type.
   */
  getUpgradesByType(
    type: "weapon" | "shield" | "engine" | "sensor" | "special",
  ): CapitalShipUpgrade[] {
    return ALL_UPGRADES.filter((u) => u.type === type);
  },

  /**
   * Returns all upgrades compatible with the given hull id.
   */
  getUpgradesByHull(hullId: string): CapitalShipUpgrade[] {
    return ALL_UPGRADES.filter((u) => u.hullCompatibility.includes(hullId));
  },

  /**
   * Returns all upgrades that fit in the given hardpoint slot type.
   */
  getUpgradesBySlot(
    hardpointType: "weapon-slot" | "defense-slot" | "special-slot" | "engine-slot",
  ): CapitalShipUpgrade[] {
    return ALL_UPGRADES.filter((u) => u.hardpointType === hardpointType);
  },

  /**
   * Returns upgrades available for a specific hull + hardpoint slot combination.
   * Filters to upgrades whose tier does not exceed the slot's capacity.
   */
  getCompatibleUpgrades(
    hullId: string,
    hardpointType: "weapon-slot" | "defense-slot" | "special-slot" | "engine-slot",
    slotCapacity: number,
  ): CapitalShipUpgrade[] {
    return ALL_UPGRADES.filter(
      (u) =>
        u.hullCompatibility.includes(hullId) &&
        u.hardpointType === hardpointType &&
        u.tier <= slotCapacity,
    );
  },

  // ── Hull lookups ──────────────────────────────────────────────────────────

  /**
   * Returns the hull definition for the given id, or `undefined` if unknown.
   */
  getHull(id: string): CapitalShipHull | undefined {
    return HULL_MAP[id];
  },

  /**
   * Returns every hull definition in an immutable array.
   */
  getAllHulls(): readonly CapitalShipHull[] {
    return ALL_HULLS;
  },

  /**
   * Returns all hull ids.
   */
  getAllHullIds(): string[] {
    return ALL_HULLS.map((h) => h.id);
  },
} as const;
