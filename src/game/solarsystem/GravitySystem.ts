/**
 * GravitySystem — gravitational acceleration from a single primary celestial body.
 *
 * Applies an inverse-square gravitational model to the player's capital ship
 * each simulation tick. Uses explicit Euler integration, which is sufficient
 * for real-time gameplay at typical frame rates.
 *
 * Only one body acts as the primary gravity source per tick, matching the
 * design spec ("one primary celestial body at a time").
 *
 * Units:
 *   - Positions  : km  (world space, matching CelestialBody.position / radius)
 *   - Velocities : m/s (matching capitalShipState.velocity)
 *   - Gravity    : m/s² (matching CelestialBody.gravityStrength)
 *   - Time       : ms input, converted to seconds internally
 */

import type { CelestialBody } from "../../types/solarsystem";

export class GravitySystem {
  /**
   * Compute the player ship's velocity after one gravity tick.
   *
   * ### Normal case (ship outside body radius)
   * Simplified inverse-square law:
   *   a = gravityStrength × (radius / distance)²
   *
   * Explicit Euler integration:
   *   v_new = v + a × dt
   *
   * ### Boundary / collision case (ship inside body radius)
   * The velocity component pointing toward the body centre is cancelled so
   * that the ship cannot continue penetrating the surface. No gravitational
   * acceleration is added. This is the collision response; repositioning the
   * ship outside the body (the "push outward") is the responsibility of the
   * caller's physics integration loop.
   *
   * Degenerate case (ship exactly at body centre): velocity is zeroed.
   *
   * @param shipPos     - Ship world position (km).
   * @param shipVel     - Ship velocity (m/s).
   * @param primaryBody - The active gravity source for this tick.
   * @param deltaMs     - Time elapsed since the last tick (ms).
   * @returns Updated ship velocity (m/s).
   */
  static applyGravity(
    shipPos: { x: number; y: number },
    shipVel: { x: number; y: number },
    primaryBody: CelestialBody,
    deltaMs: number,
  ): { x: number; y: number } {
    const dtS = deltaMs / 1000;

    // Vector from ship to body centre (km).
    const dx = primaryBody.position.x - shipPos.x;
    const dy = primaryBody.position.y - shipPos.y;
    const distanceSquared = dx * dx + dy * dy;
    const distance = Math.sqrt(distanceSquared);

    // ── Boundary / collision check ──────────────────────────────────────────
    if (distance <= primaryBody.radius) {
      // Degenerate: ship is exactly at the body centre.
      if (distance === 0) {
        return { x: 0, y: 0 };
      }

      // Unit vector pointing inward (ship → body).
      const inX = dx / distance;
      const inY = dy / distance;

      // Dot product with current velocity.
      // Positive  → ship is still moving toward the body (must cancel).
      // Zero/neg  → ship is already moving outward or tangentially (safe).
      const inwardSpeed = shipVel.x * inX + shipVel.y * inY;

      if (inwardSpeed <= 0) {
        // Already moving away from or along the surface; no correction needed.
        return { x: shipVel.x, y: shipVel.y };
      }

      // Strip the inward component, preserving the tangential component.
      return {
        x: shipVel.x - inwardSpeed * inX,
        y: shipVel.y - inwardSpeed * inY,
      };
    }

    // ── Normal gravity ──────────────────────────────────────────────────────
    // a = g_surface × (r_surface / distance)²
    const accelMagnitude =
      primaryBody.gravityStrength * (primaryBody.radius / distance) ** 2;

    // Unit vector toward body (direction of acceleration).
    const dirX = dx / distance;
    const dirY = dy / distance;

    return {
      x: shipVel.x + dirX * accelMagnitude * dtS,
      y: shipVel.y + dirY * accelMagnitude * dtS,
    };
  }
}
