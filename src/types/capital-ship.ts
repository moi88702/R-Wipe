/**
 * Capital ship data models for the Open World Solar System Exploration feature.
 *
 * Covers the modular upgrade system (tiers 1–11), hull definitions,
 * persisted blueprints, and runtime combat/navigation state.
 *
 * The capital ship is distinct from the away-mission arcade ship:
 *   - Capital ship operates on the solar system map (large-scale combat).
 *   - Away ship is the smaller arcade craft used during location missions.
 */

// ── Upgrade Catalogue ────────────────────────────────────────────────────────

/**
 * A single installable upgrade module for the capital ship.
 * Upgrades are hull-dependent; `hullCompatibility` lists which hulls accept
 * this part, and `hardpointType` restricts which slot it can occupy.
 */
export interface CapitalShipUpgrade {
  /** Unique upgrade id, e.g. "upgrade-laser-mk3". */
  id: string;
  /** Display name shown in the ship builder and inventory. */
  name: string;
  /**
   * High-level category.
   * Drives slot compatibility checks and stat aggregation.
   */
  type: "weapon" | "shield" | "special" | "engine" | "sensor";
  /**
   * Upgrade tier (1–11). Higher tiers are more powerful and may require
   * hull upgrades or specific mission unlocks before they become available.
   */
  tier: number;
  /** Hardpoint slot type this upgrade occupies. Must match hull's slot type. */
  hardpointType: "weapon-slot" | "defense-slot" | "special-slot" | "engine-slot";
  /** Hull ids (from `CapitalShipHull.id`) that can accept this upgrade. */
  hullCompatibility: string[];
  /** Numeric and string stats provided by this upgrade module. */
  stats: {
    /** DPS contribution (weapons only). */
    weaponDamage?: number;
    /** Shots per second (weapons only). */
    fireRateHz?: number;
    /** Maximum shield hit-points (shield upgrades). */
    shieldCapacity?: number;
    /** Named special ability tag (e.g. "tractor-beam", "electronic-warfare"). */
    specialEffect?: string;
  };
  /** Purchase price in credits. */
  cost: number;
  /** Mass added to the ship (kg). Affects inertia in gravity calculations. */
  mass: number;
  /** Continuous power draw (MW) deducted from the hull's power budget. */
  powerDraw: number;
}

// ── Hull Definition ──────────────────────────────────────────────────────────

/**
 * A capital ship hull that determines hardpoint availability and type
 * restrictions. Hulls are static definitions loaded from the registry.
 */
export interface CapitalShipHull {
  /** Unique hull id, e.g. "light-frigate", "heavy-cruiser". */
  id: string;
  /** Canonical internal name. */
  name: string;
  /** Player-facing display name. */
  displayName: string;
  /** Maximum hull hit-points. */
  maxHealth: number;
  /**
   * Ordered list of hardpoint slots on this hull.
   * Each slot specifies its type and the maximum upgrade tier it can hold.
   */
  hardpoints: Array<{
    /** Unique slot id within this hull (e.g. "hardpoint-0"). */
    id: string;
    /** Slot category; only upgrades with a matching `hardpointType` can be installed. */
    type: "weapon-slot" | "defense-slot" | "special-slot" | "engine-slot";
    /** Maximum upgrade tier this slot supports (1–11). */
    capacity: number;
  }>;
  /** Total power budget available for installed upgrades (MW). */
  basePowerCapacity: number;
}

// ── Blueprint ────────────────────────────────────────────────────────────────

/**
 * A named, saved capital ship configuration.
 * Maps each hardpoint slot to an installed upgrade (or `null` if empty).
 * Persisted inside the `rwipe.capital-ship.v1` localStorage slot.
 */
export interface CapitalShipBlueprint {
  /** Unique blueprint id. */
  id: string;
  /** Player-chosen display name for this configuration. */
  name: string;
  /** Hull the blueprint is built around (references `CapitalShipHull.id`). */
  hullId: string;
  /**
   * Installed upgrades per hardpoint slot.
   * Key: hardpointId from the hull definition.
   * Value: upgradeId from the catalogue, or `null` for an empty slot.
   */
  installedUpgrades: Record<string, string | null>;
  /** Unix timestamp (ms) when this blueprint was first created. */
  createdAt: number;
  /** Unix timestamp (ms) of the most recent modification. */
  modifiedAt: number;
}

// ── Runtime State ────────────────────────────────────────────────────────────

/**
 * Runtime state of the player's capital ship during a solar system session.
 * Held in memory; serialised to `rwipe.capital-ship.v1` on exit or docking.
 */
export interface CapitalShipState {
  /** Active blueprint id (references `CapitalShipBlueprint.id`). */
  blueprintId: string;
  /** Current world-space position (km). */
  position: { x: number; y: number };
  /** Current velocity vector (m/s). */
  velocity: { x: number; y: number };
  /** Current heading (degrees, 0–359, clockwise from North). */
  heading: number;
  /** Current hull hit-points. */
  health: number;
  /** Maximum hull hit-points (from the active hull definition). */
  maxHealth: number;
  /** Front shield charge (0–100 %). */
  shieldsFront: number;
  /** Rear shield charge (0–100 %). */
  shieldsRear: number;
  /**
   * Per-weapon runtime state for each installed weapon upgrade.
   * Array order mirrors the hull's weapon hardpoint order.
   */
  weapons: Array<{
    /** References the installed `CapitalShipUpgrade.id`. */
    upgradeId: string;
    /** Remaining ammunition in the current magazine. */
    ammo: number;
    /** Remaining cooldown before this weapon can fire again (ms). */
    cooldownMs: number;
  }>;
  /** True while the ship is actively engaged in map-screen combat. */
  isInCombat: boolean;
  /**
   * Id of the enemy ship currently locked on.
   * `null` when no target is selected.
   */
  targetShipId: string | null;
  /** Unix timestamp (ms) of the most recent damage event (for visual effects). */
  lastDamagedAt: number;
}

// ── Combat Systems ────────────────────────────────────────────────────────────

/**
 * Runtime state for one of the capital ship's active combat sub-systems.
 * Each system is independently toggled by the player during combat.
 */
export interface CombatSystemState {
  /**
   * Which combat sub-system this record describes.
   * Each type maps to a distinct gameplay behaviour and HUD control.
   */
  systemType:
    | "weapon"
    | "shield"
    | "electronic-warfare"
    | "tractor-beam";
  /** True while the system is powered on and operational. */
  isActive: boolean;
  /** Remaining cooldown before the system can be activated or fired (ms). */
  cooldownMs: number;
  /** Current power draw contributed by this system (MW). */
  powerDraw: number;
  /**
   * Optional active-effect payload.
   * Present while the system is producing an ongoing effect.
   */
  effect?: {
    /** Enemy ship id the tractor beam or E-War is targeting. */
    targetId?: string;
    /** Blast radius for AoE weapon effects (km). */
    blastRadius?: number;
  };
}
