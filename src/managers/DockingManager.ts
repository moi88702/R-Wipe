/**
 * DockingManager — orchestrates proximity detection, UI trigger logic,
 * permission enforcement, and game-state transitions for the docking
 * and undocking lifecycle.
 *
 * Relationship with DockingSystem
 * ───────────────────────────────
 * `DockingSystem` (`src/game/solarsystem/DockingSystem.ts`) provides the
 * **pure functions** for proximity geometry and permission gate evaluation.
 * `DockingManager` **wraps those pure functions** and owns the mutable
 * session-state side-effects:
 *
 *   DockingSystem.checkProximity → proximity geometry (pure)
 *   DockingSystem.canDock        → permission check (pure)
 *   DockingManager.dock()        → permission check + session mutation
 *   DockingManager.undock()      → session restoration + state clear
 *
 * Session mutations on `dock()`:
 *   1. `session.dockedLocationId`   ← location.id
 *   2. `session.playerVelocity`     ← { x: 0, y: 0 }
 *   3. `session.discoveredLocations` ← location.id added
 *   4. pre-dock snapshot saved internally (position, velocity, heading,
 *      station position) so `undock()` can restore the ship correctly.
 *
 * Session mutations on `undock()`:
 *   1. `session.playerPosition`   ← docked station's world position (km)
 *   2. `session.playerVelocity`   ← { x: 0, y: 0 }
 *   3. `session.playerHeading`    ← restored from pre-dock snapshot
 *   4. `session.dockedLocationId` ← null
 *   5. pre-dock snapshot cleared
 *
 * Undocking is **always explicit** — the manager never auto-undocks.
 * Callers must invoke `undock()` from the dock menu selection handler.
 *
 * Dock button visibility
 * ──────────────────────
 * `isDockButtonVisible()` returns `true` when the player is within any
 * location's `dockingRadius` and is **not already docked**. Permission
 * checks are deferred to `dock()` to keep the button responsive; the UI
 * shows the button on approach and only displays a denial reason if the
 * player clicks it while ineligible.
 *
 * Units: positions and ranges in km (world space), velocities in m/s,
 * headings in degrees (matching SolarSystemSessionState conventions).
 */

import type { Location, SolarSystemSessionState } from "../types/solarsystem";
import type { FactionStanding } from "../types/factions";
import type { DockingCheckResult } from "../types/docking";
import { DockingSystem } from "../game/solarsystem/DockingSystem";

// ── Supporting types ──────────────────────────────────────────────────────────

/**
 * Snapshot of the player's physical state captured immediately before
 * a successful `dock()` call.  Stored on the manager instance and consumed
 * by `undock()` to correctly restore the ship to the station's location.
 */
export interface PreDockSnapshot {
  /** Player position at the moment of docking (km). */
  readonly position: { x: number; y: number };
  /** Player velocity at the moment of docking (m/s). */
  readonly velocity: { x: number; y: number };
  /** Player heading at the moment of docking (degrees, 0–359 clockwise). */
  readonly heading: number;
  /** Id of the station the player docked at. */
  readonly stationId: string;
  /**
   * World-space position of the docked station (km).
   * Used by `undock()` to place the ship back at the station without needing
   * the full location list.
   */
  readonly stationPosition: { x: number; y: number };
}

/**
 * Result returned by `DockingManager.dock()`.
 */
export interface DockResult {
  /** True when all gates passed and the session transitioned to docked state. */
  readonly success: boolean;
  /**
   * Location id the player is now docked at.
   * Present only when `success` is `true`.
   */
  readonly dockedLocationId?: string;
  /**
   * Why docking failed.  Absent when `success` is `true`.
   *
   * - `"already-docked"`    — player is already docked somewhere.
   * - `"not-in-range"`      — player is outside the station's docking radius.
   * - `"low-reputation"`    — player's faction reputation is below the threshold.
   * - `"missing-item"`      — player does not carry a required item.
   * - `"mission-incomplete"` — a prerequisite mission has not been completed.
   */
  readonly reason?: "already-docked" | "not-in-range" | DockingCheckResult["reason"];
  /** The location that was requested (present on both success and failure). */
  readonly location: Location;
}

/**
 * Result returned by `DockingManager.undock()`.
 */
export interface UndockResult {
  /** True when the session was successfully transitioned back to free-flight. */
  readonly success: boolean;
  /**
   * Why undocking failed.  Absent when `success` is `true`.
   * - `"not-docked"` — the player was not docked when `undock()` was called.
   */
  readonly reason?: "not-docked";
  /**
   * The player's new world-space position after undocking (km).
   * Present only when `success` is `true`.
   */
  readonly restoredPosition?: { x: number; y: number };
}

// ── DockingManager ────────────────────────────────────────────────────────────

export class DockingManager {
  /**
   * Saved state from just before the most recent successful `dock()` call.
   * Used by `undock()` to restore the ship to the station's location.
   * `null` when the player is not currently docked (or docked externally
   * without calling this manager's `dock()` method).
   */
  private preDockSnapshot: PreDockSnapshot | null = null;

  // ── Proximity helpers ───────────────────────────────────────────────────────

  /**
   * Return all locations whose distance from `shipPos` is ≤ `rangeKm`,
   * sorted by distance ascending (closest first).
   *
   * This is a lower-level utility used by the game loop to populate
   * `session.nearbyLocations`.  For dock-button visibility, prefer
   * `isDockButtonVisible()` which uses each location's own `dockingRadius`.
   *
   * @param shipPos   Current player position (km).
   * @param locations All locations in the current system.
   * @param rangeKm   Search radius (km).
   */
  getNearestDocksWithinRange(
    shipPos: { x: number; y: number },
    locations: Location[],
    rangeKm: number,
  ): Location[] {
    return locations
      .map((loc) => {
        const dx = loc.position.x - shipPos.x;
        const dy = loc.position.y - shipPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return { loc, dist };
      })
      .filter(({ dist }) => dist <= rangeKm)
      .sort((a, b) => a.dist - b.dist)
      .map(({ loc }) => loc);
  }

  /**
   * Refresh `session.nearbyLocations` based on the current player position.
   *
   * A location is "nearby" when the player's ship is within that location's
   * `dockingRadius`.  This is called each frame (or whenever the player
   * position changes) so the session always reflects the up-to-date set of
   * approachable stations.
   *
   * @param session   Session state to mutate.
   * @param locations All locations in the current system.
   */
  updateNearbyLocations(
    session: SolarSystemSessionState,
    locations: Location[],
  ): void {
    session.nearbyLocations = locations
      .filter((loc) => {
        const dx = loc.position.x - session.playerPosition.x;
        const dy = loc.position.y - session.playerPosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        return dist <= loc.dockingRadius;
      })
      .map((loc) => loc.id);
  }

  // ── UI trigger ──────────────────────────────────────────────────────────────

  /**
   * Whether the "Dock" button should be visible in the combat HUD.
   *
   * Returns `true` when:
   *   1. The player is **not** currently docked.
   *   2. The player is within at least one location's `dockingRadius`.
   *
   * Permission checks (reputation, items, missions) are intentionally
   * deferred to `dock()` — the button appears on approach and the denial
   * reason is shown only after the player clicks it.
   *
   * @param session   Current session state.
   * @param locations All locations in the current system.
   */
  isDockButtonVisible(
    session: SolarSystemSessionState,
    locations: Location[],
  ): boolean {
    if (session.dockedLocationId !== null) return false;
    const proximity = DockingSystem.checkProximity(session.playerPosition, locations);
    return proximity.withinDockingRange !== null;
  }

  // ── Dock / undock lifecycle ─────────────────────────────────────────────────

  /**
   * Attempt to dock at `location`.
   *
   * Gates (checked in priority order):
   *   1. **Already-docked guard** — fails immediately with `"already-docked"`.
   *   2. **Proximity gate**       — player must be within `location.dockingRadius`.
   *   3. **Permission gates**     — reputation → items → missions (DockingSystem.canDock).
   *
   * On success the session is mutated in-place:
   *   - `dockedLocationId` is set to `location.id`
   *   - `playerVelocity` is zeroed (ship is stationary at dock)
   *   - `discoveredLocations` gains `location.id`
   *   - A pre-dock snapshot is saved internally for `undock()` restoration
   *
   * @param session            Session state to mutate.
   * @param location           The location to dock at.
   * @param factionStanding    Player's standing with the location's faction.
   * @param inventory          Player's current item inventory (itemId → quantity).
   * @param completedMissions  Set of completed mission ids.
   */
  dock(
    session: SolarSystemSessionState,
    location: Location,
    factionStanding: FactionStanding,
    inventory: Record<string, number>,
    completedMissions: Set<string>,
  ): DockResult {
    // Gate 1: already docked
    if (session.dockedLocationId !== null) {
      return { success: false, reason: "already-docked", location };
    }

    // Gate 2: proximity — player must be within the location's docking radius
    const proximity = DockingSystem.checkProximity(session.playerPosition, [location]);
    if (proximity.withinDockingRange === null) {
      return { success: false, reason: "not-in-range", location };
    }

    // Gate 3: permission (reputation → items → missions)
    const check = DockingSystem.canDock(
      factionStanding,
      location,
      inventory,
      completedMissions,
    );
    if (!check.allowed) {
      return { success: false, reason: check.reason, location };
    }

    // All gates passed — save pre-dock state before mutating session
    this.preDockSnapshot = {
      position: { x: session.playerPosition.x, y: session.playerPosition.y },
      velocity: { x: session.playerVelocity.x, y: session.playerVelocity.y },
      heading: session.playerHeading,
      stationId: location.id,
      stationPosition: { x: location.position.x, y: location.position.y },
    };

    // Transition session to docked state
    session.dockedLocationId = location.id;
    session.playerVelocity = { x: 0, y: 0 };
    session.discoveredLocations.add(location.id);

    return { success: true, dockedLocationId: location.id, location };
  }

  /**
   * Undock from the current station (explicit menu action only).
   *
   * This method only runs when called explicitly by the UI/game loop — the
   * DockingManager never auto-undocks.  The caller is responsible for hiding
   * the dock menu and restoring the combat HUD after a successful undock.
   *
   * On success the session is mutated in-place:
   *   - `playerPosition` is set to the docked station's world position (km)
   *   - `playerVelocity` is zeroed
   *   - `playerHeading` is restored from the pre-dock snapshot (if available)
   *   - `dockedLocationId` is set to `null`
   *   - The pre-dock snapshot is cleared
   *
   * @param session Session state to mutate.
   */
  undock(session: SolarSystemSessionState): UndockResult {
    if (session.dockedLocationId === null) {
      return { success: false, reason: "not-docked" };
    }

    // Determine where to place the ship after undocking.
    // Use the station position from the pre-dock snapshot (reliable even when
    // the full location list is not available to this call).
    const restoredPosition: { x: number; y: number } =
      this.preDockSnapshot !== null
        ? { x: this.preDockSnapshot.stationPosition.x, y: this.preDockSnapshot.stationPosition.y }
        : { x: session.playerPosition.x, y: session.playerPosition.y }; // fallback: keep current pos

    // Restore heading from pre-dock snapshot when available
    if (this.preDockSnapshot !== null) {
      session.playerHeading = this.preDockSnapshot.heading;
    }

    // Transition session back to free-flight state
    session.playerPosition = restoredPosition;
    session.playerVelocity = { x: 0, y: 0 };
    session.dockedLocationId = null;

    // Clear the snapshot after consumption
    this.preDockSnapshot = null;

    return { success: true, restoredPosition };
  }

  // ── Snapshot access ─────────────────────────────────────────────────────────

  /**
   * Read-only access to the pre-dock snapshot.
   *
   * Returns `null` when the player is not docked (or docked without
   * going through this manager's `dock()` method).
   *
   * Primarily used by the save/load system to persist the snapshot so that
   * the ship's exact pre-dock state can be restored after a reload while
   * docked.
   */
  getPreDockSnapshot(): Readonly<PreDockSnapshot> | null {
    return this.preDockSnapshot;
  }
}
