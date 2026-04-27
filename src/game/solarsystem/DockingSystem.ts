/**
 * DockingSystem — proximity detection and multi-gate docking permission logic.
 *
 * Three public API methods:
 *
 *   1. `DockingSystem.checkProximity(playerPos, locations)`
 *      Pure function. Scans the location list and returns the closest location
 *      together with the distance to it. `withinDockingRange` is non-null only
 *      when the player has entered that location's `dockingRadius`.
 *
 *   2. `DockingSystem.canDock(factionStanding, location, inventory, completedMissions)`
 *      Pure function. Evaluates three sequential gates in priority order:
 *        Gate 1 — reputation  : player standing ≥ location.requiredReputation
 *        Gate 2 — items       : all requiredItems present in inventory (qty > 0)
 *        Gate 3 — missions    : all requiredMissions appear in completedMissions
 *      Returns on the first failing gate so the UI shows the most actionable
 *      denial message.
 *
 *   3. `requestDocking(location)` (instance method)
 *      Convenience wrapper that calls `canDock` with the player state injected
 *      at construction time and returns a `DockingRequestResult` ready for the
 *      UI layer to consume (trigger animation / open menu / show denial reason).
 *
 * The caller (typically SolarSystemManager) is responsible for updating
 * `SolarSystemSessionState.dockedLocationId` and `nearbyLocations` using the
 * values returned by these methods.
 *
 * Units: all positions and distances are in km (world space), matching the
 * conventions used by `CelestialBody.position` and `Location.position`.
 */

import type { Location } from "../../types/solarsystem";
import type { FactionStanding } from "../../types/factions";
import type {
  DockingCheckResult,
  DockingRequestResult,
  LocationProximity,
} from "../../types/docking";

export class DockingSystem {
  /**
   * Create a DockingSystem bound to a player's current session state.
   *
   * @param factionStanding  - The player's standing with the relevant faction.
   * @param inventory        - Map of itemId → quantity for items the player carries.
   * @param completedMissions - Set of mission ids the player has completed.
   */
  constructor(
    private readonly factionStanding: FactionStanding,
    private readonly inventory: Record<string, number>,
    private readonly completedMissions: Set<string>,
  ) {}

  // ── (1) Proximity check ───────────────────────────────────────────────────

  /**
   * Determine whether the player is within docking range of any location.
   *
   * Iterates all locations, computes the Euclidean distance from `playerPos`
   * to `location.position`, and identifies the closest one. If that closest
   * location's `dockingRadius` encloses the player, it is returned as
   * `withinDockingRange`; otherwise `withinDockingRange` is `null`.
   *
   * `distance` always reflects the distance to the closest location overall
   * (regardless of whether the player is within docking range), so the UI can
   * display "approaching" feedback as the player closes in.
   *
   * When `locations` is empty `distance` is `Infinity`.
   *
   * @param playerPos - Player capital ship position in world space (km).
   * @param locations - All locations in the current system.
   * @returns Proximity result with the nearest in-range location and distance.
   */
  static checkProximity(
    playerPos: { x: number; y: number },
    locations: Location[],
  ): LocationProximity {
    if (locations.length === 0) {
      return { withinDockingRange: null, distance: Infinity };
    }

    let closestLocation: Location | null = null;
    let closestDistance = Infinity;

    for (const location of locations) {
      const dx = location.position.x - playerPos.x;
      const dy = location.position.y - playerPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < closestDistance) {
        closestDistance = dist;
        closestLocation = location;
      }
    }

    // A location is "within docking range" only when the closest location's
    // own docking radius actually contains the player position.
    const withinDockingRange =
      closestLocation !== null &&
      closestDistance <= closestLocation.dockingRadius
        ? closestLocation
        : null;

    return { withinDockingRange, distance: closestDistance };
  }

  // ── (2) Permission check ──────────────────────────────────────────────────

  /**
   * Evaluate all three docking gates and return the first denial reason.
   *
   * Gate priority (checked in order):
   *   1. Reputation  — player rep ≥ location.requiredReputation (default 0)
   *   2. Items       — every id in location.requiredItems has qty > 0 in inventory
   *   3. Missions    — every id in location.requiredMissions is in completedMissions
   *
   * Returning at the first failure keeps the denial message actionable: the
   * player is told the most fundamental prerequisite they are missing.
   *
   * @param factionStanding   - Player's standing with the location's faction.
   * @param location          - The location being evaluated.
   * @param inventory         - Player's current item inventory.
   * @param completedMissions - Set of mission ids the player has completed.
   */
  static canDock(
    factionStanding: FactionStanding,
    location: Location,
    inventory: Record<string, number>,
    completedMissions: Set<string>,
  ): DockingCheckResult {
    // ── Gate 1: faction reputation ────────────────────────────────────────
    // Only applies when the location explicitly declares a requiredReputation.
    // An absent field means the location is open to all factions.
    if (location.requiredReputation !== undefined) {
      if (factionStanding.reputation < location.requiredReputation) {
        return {
          allowed: false,
          reason: "low-reputation",
          requiredReputation: location.requiredReputation,
          currentReputation: factionStanding.reputation,
        };
      }
    }

    // ── Gate 2: required items ────────────────────────────────────────────
    if (location.requiredItems && location.requiredItems.length > 0) {
      const hasMissingItem = location.requiredItems.some(
        (itemId) => (inventory[itemId] ?? 0) <= 0,
      );
      if (hasMissingItem) {
        return { allowed: false, reason: "missing-item" };
      }
    }

    // ── Gate 3: mission prerequisites ─────────────────────────────────────
    if (location.requiredMissions && location.requiredMissions.length > 0) {
      const hasIncompleteMission = location.requiredMissions.some(
        (missionId) => !completedMissions.has(missionId),
      );
      if (hasIncompleteMission) {
        return { allowed: false, reason: "mission-incomplete" };
      }
    }

    return { allowed: true };
  }

  // ── (3) Docking request ───────────────────────────────────────────────────

  /**
   * Request docking at a location using this instance's bound player state.
   *
   * Calls `canDock` internally and translates the result into a
   * `DockingRequestResult` suitable for the UI layer:
   *   - `granted: true`  → trigger docking animation, open location menu.
   *   - `granted: false` → display `reason` as a denial message.
   *
   * @param location - The location the player is attempting to dock at.
   */
  requestDocking(location: Location): DockingRequestResult {
    const check = DockingSystem.canDock(
      this.factionStanding,
      location,
      this.inventory,
      this.completedMissions,
    );

    return {
      granted: check.allowed,
      ...(check.reason !== undefined ? { reason: check.reason } : {}),
      location,
    };
  }
}
