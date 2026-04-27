/**
 * Docking system data models for the Open World Solar System Exploration feature.
 *
 * Covers the result of a docking permission check, the location proximity
 * query result returned by `DockingSystem.checkProximity`, and the result of
 * a full docking request returned by `DockingSystem.requestDocking`.
 */

import type { Location } from "./solarsystem";

// ── Docking Check ─────────────────────────────────────────────────────────────

/**
 * Result returned by `DockingSystem.canDock(...)`.
 *
 * When `allowed` is `false`, the `reason` field identifies which gate
 * blocked permission so the UI can display an appropriate denial message.
 */
export interface DockingCheckResult {
  /** True if all docking conditions (reputation, items, missions) are met. */
  allowed: boolean;
  /**
   * Why docking was refused. Absent when `allowed` is `true`.
   * - `"low-reputation"` — player's faction standing is below the threshold.
   * - `"missing-item"` — player doesn't carry a required item.
   * - `"mission-incomplete"` — a prerequisite mission hasn't been completed.
   */
  reason?: "low-reputation" | "missing-item" | "mission-incomplete";
  /**
   * Minimum reputation required by the location.
   * Present when `reason === "low-reputation"`.
   */
  requiredReputation?: number;
  /**
   * Player's current reputation with the controlling faction.
   * Present when `reason === "low-reputation"`.
   */
  currentReputation?: number;
}

// ── Proximity Query ───────────────────────────────────────────────────────────

/**
 * Result returned by `DockingSystem.checkProximity(playerPos, locations)`.
 *
 * Identifies whether the player's ship is within any location's docking
 * radius and returns the closest candidate together with the exact distance.
 */
export interface LocationProximity {
  /**
   * The location whose docking radius the player has entered.
   * `null` if the player is not within docking range of any location.
   */
  withinDockingRange: Location | null;
  /** Distance (km) from the player to the closest location in the system. */
  distance: number;
}

// ── Docking Request ───────────────────────────────────────────────────────────

/**
 * Result returned by `DockingSystem.requestDocking(location)`.
 *
 * Represents the outcome of a full docking attempt — whether permission was
 * granted and, if not, the first gate that blocked it. The caller (typically
 * the UI layer) uses this to trigger a docking animation, open the location
 * menu, or display a denial message.
 */
export interface DockingRequestResult {
  /**
   * Whether docking permission was granted.
   * `true` means all gates (reputation, items, missions) passed.
   * `false` means at least one gate blocked the request.
   */
  granted: boolean;
  /**
   * Why docking was denied. Absent when `granted` is `true`.
   * Mirrors the `reason` field on `DockingCheckResult`.
   */
  reason?: "low-reputation" | "missing-item" | "mission-incomplete";
  /** The location that was requested. */
  location: Location;
}
