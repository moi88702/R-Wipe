/**
 * Combat system data models — enemy stations, spawn configurations, and
 * turret definitions for the Space Combat Control System.
 *
 * These types describe hostile structures in the solar system that serve as
 * enemy strongholds: they have faction alignment, defensive weapons (turrets),
 * a shield-then-hull damage model, and a ship-spawn pipeline that releases
 * enemy ships during combat encounters.
 */

import type { EnemyType, WeaponKind } from "./index";

// ── Turret ────────────────────────────────────────────────────────────────────

/**
 * Configuration for an enemy station's autonomous defensive turrets.
 * Turrets fire at any ship within `rangeKm` at `fireRateMs` intervals.
 */
export interface StationTurretConfig {
  /** Number of active turrets mounted on the station. */
  count: number;
  /** Damage dealt per projectile hit. */
  damagePerShot: number;
  /** Milliseconds between shots (per turret). */
  fireRateMs: number;
  /** Maximum range at which turrets will engage a target (km). */
  rangeKm: number;
  /** Weapon kind used by turrets — drives projectile visuals. */
  weaponKind: Extract<WeaponKind, "bullet" | "laser" | "cannon">;
}

// ── Spawn Configuration ───────────────────────────────────────────────────────

/**
 * Ship spawn configuration for a hostile station.
 * Controls what kinds of ships emerge, how many, and how often.
 */
export interface StationSpawnConfig {
  /** Enemy types this station may deploy. Caller selects randomly from this list. */
  shipTypes: EnemyType[];
  /** Hard cap on simultaneously active ships spawned from this station. */
  maxActiveShips: number;
  /** Minimum milliseconds between consecutive spawn waves. */
  spawnIntervalMs: number;
  /** Ships released per wave (may be reduced if near maxActiveShips). */
  shipsPerWave: number;
  /** Radius (km) around the station centre within which ships materialise. */
  spawnRadiusKm: number;
}

// ── Station Definition ────────────────────────────────────────────────────────

/**
 * Static definition of a hostile enemy station.
 * Loaded from EnemyStationRegistry; never mutated during play.
 *
 * Positions are in km (world space), matching CelestialBody and Location
 * coordinate conventions.
 */
export interface EnemyStationDefinition {
  /** Unique station identifier, e.g. "enemy-station-scav-belt". */
  id: string;
  /** Player-facing display name shown on approach / combat HUD. */
  name: string;
  /** Faction that controls and defends this station. */
  factionId: string;
  /** Id of the parent celestial body this station is near (for map grouping). */
  bodyId: string;
  /** World-space centre position (km). */
  position: { x: number; y: number };
  /**
   * Distance (km) at which the station transitions from dormant → alerted.
   * Set to comfortably larger than turret range so stations have time to
   * spin up defences before the player is in weapon range.
   */
  alertRadiusKm: number;
  /** Hull hit-points at full health. Station is destroyed when hull reaches 0. */
  hullHealth: number;
  /** Maximum shield hit-points. Shields absorb damage before hull takes hits. */
  shieldCapacity: number;
  /**
   * Shield hit-points restored per second when not taking damage.
   * 0 means no passive recharge (shields stay at whatever value they were).
   */
  shieldRechargeRatePerS: number;
  /** Defensive turret configuration. */
  turrets: StationTurretConfig;
  /** Ship spawn pipeline configuration. */
  spawnConfig: StationSpawnConfig;
}

// ── Runtime State ─────────────────────────────────────────────────────────────

/**
 * Alert level of a hostile station.
 *
 * - `"dormant"` — player has not entered alert radius; station is inactive.
 * - `"alerted"` — player is within alert radius; defences are powering up but
 *                 spawn timer has not yet triggered a wave.
 * - `"combat"` — station is fully engaged: turrets fire and ships spawn on
 *                interval.
 */
export type StationAlertLevel = "dormant" | "alerted" | "combat";

/**
 * Runtime and persisted state for a single hostile station.
 * Held in memory during a session; serialised to the save slot on exit.
 */
export interface EnemyStationState {
  /** References EnemyStationDefinition.id. */
  stationId: string;
  /** Current hull hit-points. 0 means the station is destroyed. */
  currentHull: number;
  /** Current shield hit-points. */
  currentShield: number;
  /** Operational status of the station. */
  alertLevel: StationAlertLevel;
  /**
   * Entity ids of enemy ships currently active and spawned from this station.
   * Entries are removed when the ship is destroyed (`onEnemyDestroyed`).
   */
  activeEnemyIds: string[];
  /**
   * Simulation timestamp (ms) of the most recent spawn wave.
   * Initialised to 0 so the first wave can fire immediately once combat begins.
   */
  lastSpawnAtMs: number;
  /** True when hull has reached 0; no further spawns or turret fire. */
  isDestroyed: boolean;
}
