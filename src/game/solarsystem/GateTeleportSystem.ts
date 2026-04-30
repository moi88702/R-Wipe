/**
 * GateTeleportSystem — proximity detection and inter-system teleportation for
 * solar-system traversal gates.
 *
 * Two pure static operations:
 *
 *   1. `GateTeleportSystem.checkGateProximity(playerPos, gates)`
 *      Returns the first gate whose `triggerRadius` encloses the player, or
 *      `null` if the player is not inside any gate's range.  Iterates in
 *      definition order; the caller controls which gates are passed in
 *      (typically the gates belonging to the current system).
 *
 *   2. `GateTeleportSystem.teleport(session, sourceGate, sisterGate, destinationSystem)`
 *      Executes the inter-system transit.  Validates two pre-conditions:
 *        (a) player is not currently docked
 *        (b) destination system has a primary gravity source
 *      On success, mutates `session` in-place:
 *        - `currentSystem`          ← `destinationSystem`
 *        - `playerPosition`         ← `sisterGate.position`
 *        - `primaryGravitySourceId` ← id of `destinationSystem`'s primary body
 *        - `nearbyLocations`        ← reset to `[]` (old system's ids are stale)
 *        - `playerVelocity`         ← preserved (smooth inertial transition)
 *        - `playerHeading`          ← preserved
 *        - `dockedLocationId`       ← unchanged (always `null` due to guard)
 *      Returns a `TeleportResult` describing the outcome.
 *
 * Design notes
 * ────────────
 * - Callers should invoke `checkGateProximity` each frame with only the gates
 *   for the *current* system, then invoke `teleport` exactly once when a gate
 *   is detected.  Preventing immediate re-triggering upon arrival is the
 *   caller's responsibility (e.g., a one-frame or distance-based cooldown).
 * - Both operations are pure with respect to the registry — no global state is
 *   read or written here.  Pass real data in; get real results out.
 *
 * Units: positions and radii in km (world space), velocity in m/s, heading in
 * degrees (matching `SolarSystemSessionState` conventions).
 */

import type {
  SystemGate,
  SolarSystemSessionState,
  SolarSystemState,
} from "../../types/solarsystem";

// ── Result types ──────────────────────────────────────────────────────────────

/**
 * Outcome of a `GateTeleportSystem.teleport` call.
 *
 * Discriminated on `success`:
 *   - `true`  → transit completed; session has been mutated in-place.
 *   - `false` → precondition failed; session is unchanged.
 */
export type TeleportResult =
  | {
      /** Transit completed successfully. */
      success: true;
      /** The gate the player entered in the source system. */
      sourceGate: SystemGate;
      /** The gate the player arrived at in the destination system. */
      destinationGate: SystemGate;
      /** Player's new world-space position in the destination system (km). */
      newPlayerPosition: { x: number; y: number };
    }
  | {
      /** Transit could not be completed. */
      success: false;
      /** The gate the player attempted to use. */
      sourceGate: SystemGate;
      /**
       * Why the transit was blocked.
       *
       * - `"docked"` — player is currently docked at a station.
       * - `"no-primary-body-in-destination"` — the destination `SolarSystemState`
       *   has no celestial body with `isPrimaryGravitySource: true`.
       */
      reason: "docked" | "no-primary-body-in-destination";
    };

// ── GateTeleportSystem ────────────────────────────────────────────────────────

export class GateTeleportSystem {
  /**
   * Detect whether the player has entered any gate's trigger radius.
   *
   * Iterates `gates` in definition order and returns the **first** gate whose
   * `triggerRadius` encloses `playerPos`.  Returns `null` when no gate's
   * radius contains the player or when `gates` is empty.
   *
   * The check is inclusive at the boundary (`distance ≤ triggerRadius`),
   * consistent with `DockingSystem.checkProximity`.
   *
   * @param playerPos - Current player position (km).
   * @param gates     - Gates to check; pass only the current system's gates.
   */
  static checkGateProximity(
    playerPos: { x: number; y: number },
    gates: SystemGate[],
  ): SystemGate | null {
    for (const gate of gates) {
      const dx = gate.position.x - playerPos.x;
      const dy = gate.position.y - playerPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance <= gate.triggerRadius) {
        return gate;
      }
    }
    return null;
  }

  /**
   * Execute an inter-system transit through a gate pair.
   *
   * Preconditions (both must hold; first failing check returns `false`):
   *   1. `session.dockedLocationId === null` — cannot traverse gates while docked.
   *   2. `destinationSystem` contains a body with `isPrimaryGravitySource === true`.
   *
   * On success the session is mutated in-place and a `TeleportResult` with
   * `success: true` is returned.  Callers can read `newPlayerPosition` to
   * place visual effects at the arrival location.
   *
   * Preserved fields (unchanged by this method):
   *   - `playerVelocity`   — momentum carries through for a smooth exit.
   *   - `playerHeading`    — direction is maintained.
   *   - `zoomLevel`        — map zoom is unaffected.
   *   - `discoveredLocations` — cross-system discovery history is retained.
   *
   * @param session           - Session state to mutate on success.
   * @param sourceGate        - The gate the player just entered (source system).
   * @param sisterGate        - The gate to arrive at (destination system).
   * @param destinationSystem - Full solar system state for the destination.
   */
  static teleport(
    session: SolarSystemSessionState,
    sourceGate: SystemGate,
    sisterGate: SystemGate,
    destinationSystem: SolarSystemState,
  ): TeleportResult {
    // ── Precondition 1: player must not be docked ──────────────────────────
    if (session.dockedLocationId !== null) {
      return { success: false, sourceGate, reason: "docked" };
    }

    // ── Precondition 2: destination system must have a primary gravity body ─
    const primaryBody = destinationSystem.celestialBodies.find(
      (b) => b.isPrimaryGravitySource,
    );
    if (primaryBody === undefined) {
      return {
        success: false,
        sourceGate,
        reason: "no-primary-body-in-destination",
      };
    }

    // ── Execute transit ────────────────────────────────────────────────────
    const newPlayerPosition = {
      x: sisterGate.position.x,
      y: sisterGate.position.y,
    };

    session.currentSystem = destinationSystem;
    session.playerPosition = newPlayerPosition;
    session.primaryGravitySourceId = primaryBody.id;

    // Location ids from the old system are meaningless in the new one.
    session.nearbyLocations = [];

    // playerVelocity, playerHeading, zoomLevel, and discoveredLocations are
    // intentionally preserved (see method doc-comment).

    return {
      success: true,
      sourceGate,
      destinationGate: sisterGate,
      newPlayerPosition,
    };
  }
}
