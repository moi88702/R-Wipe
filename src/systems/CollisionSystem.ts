/**
 * CollisionSystem.ts – AABB (Axis-Aligned Bounding Box) collision detection.
 *
 * Runs once per frame over all active game entities and returns a flat list of
 * typed CollisionEvents that the caller (game-loop / game manager) can process
 * – e.g. deal damage, collect a power-up, kill a projectile, etc.
 *
 * Collision pairs checked:
 *   1. Player  ←  enemy projectiles
 *   2. Player  ←  power-ups
 *   3. Player projectiles  →  enemies
 *
 * Design notes
 * ─────────────
 * • Positions are treated as the entity's **centre** coordinate.  Callers must
 *   ensure the positions supplied here are centre-based.
 * • This module has NO Pixi.js dependency and is safe in Node / test envs.
 * • The system is stateless: every call to `update()` is independent.
 *   Deduplication (e.g. one projectile hitting one enemy only once) must be
 *   handled by the caller, which should mark projectiles as `isAlive = false`
 *   after processing a hit.
 */

import type { Enemy, PlayerState, PowerUp, Projectile } from "../types/index";

// ── Collision event types ─────────────────────────────────────────────────

export type CollisionEventType =
  | "player-hit-by-projectile"
  | "player-collected-power-up"
  | "enemy-hit-by-projectile";

export interface CollisionEvent {
  /** What kind of collision occurred. */
  type: CollisionEventType;
  /** Projectile involved in the collision (player-hit or enemy-hit events). */
  projectileId?: string;
  /** Enemy involved (enemy-hit event). */
  enemyId?: string;
  /** Power-up involved (collected event). */
  powerUpId?: string;
  /**
   * Damage value to apply.  0 for power-up collection events (the caller
   * consults the PowerUpEffect for the actual effect to apply).
   */
  damage: number;
}

// ── Internal bounding-box descriptor ─────────────────────────────────────

interface Bounded {
  position: { x: number; y: number };
  width: number;
  height: number;
}

// ── CollisionSystem ───────────────────────────────────────────────────────

export class CollisionSystem {
  // ── Core geometry ──────────────────────────────────────────────────────

  /**
   * Returns `true` when the two axis-aligned bounding boxes overlap.
   *
   * Both `a` and `b` must have `position` at their **centre**.
   *
   * Uses the separating-axis theorem for AABBs:
   *   overlap iff |Δx| < sumHalfWidths AND |Δy| < sumHalfHeights
   */
  checkOverlap(a: Bounded, b: Bounded): boolean {
    const dx = Math.abs(a.position.x - b.position.x);
    const dy = Math.abs(a.position.y - b.position.y);
    return dx < (a.width + b.width) / 2 && dy < (a.height + b.height) / 2;
  }

  // ── Per-frame batch check ──────────────────────────────────────────────

  /**
   * Performs all three collision group checks for a single game-loop tick
   * and returns every collision detected as a discrete event object.
   *
   * @param player            Current player state.  Skipped entirely when
   *                          `player.isAlive === false`.
   * @param playerProjectiles Active projectiles fired by the player.
   * @param enemyProjectiles  Active projectiles fired by enemies.
   * @param enemies           All active enemies currently on-screen.
   * @param powerUps          Power-ups that have not yet been collected.
   *
   * @returns An (possibly empty) array of CollisionEvents.  Order within the
   *          array is not guaranteed.
   */
  update(
    player: PlayerState,
    playerProjectiles: ReadonlyArray<Projectile>,
    enemyProjectiles: ReadonlyArray<Projectile>,
    enemies: ReadonlyArray<Enemy>,
    powerUps: ReadonlyArray<PowerUp>,
  ): CollisionEvent[] {
    const events: CollisionEvent[] = [];

    // Bail early if the player is already dead
    if (!player.isAlive) return events;

    // ── 1. Player ← enemy projectiles ─────────────────────────────────
    for (const proj of enemyProjectiles) {
      if (!proj.isAlive) continue;
      if (this.checkOverlap(player, proj)) {
        events.push({
          type: "player-hit-by-projectile",
          projectileId: proj.id,
          damage: proj.damage,
        });
      }
    }

    // ── 2. Player ← power-ups ──────────────────────────────────────────
    for (const powerUp of powerUps) {
      if (powerUp.isCollected) continue;
      if (this.checkOverlap(player, powerUp)) {
        events.push({
          type: "player-collected-power-up",
          powerUpId: powerUp.id,
          damage: 0,
        });
      }
    }

    // ── 3. Player projectiles → enemies ────────────────────────────────
    for (const proj of playerProjectiles) {
      if (!proj.isAlive) continue;
      for (const enemy of enemies) {
        if (!enemy.isAlive) continue;
        if (this.checkOverlap(proj, enemy)) {
          events.push({
            type: "enemy-hit-by-projectile",
            projectileId: proj.id,
            enemyId: enemy.id,
            damage: proj.damage,
          });
        }
      }
    }

    return events;
  }

  // ── Convenience single-pair helpers ────────────────────────────────────

  /**
   * Quick check: is the player currently overlapping with a specific
   * enemy projectile?  Respects `isAlive` flags on both entities.
   */
  isPlayerHitByProjectile(player: PlayerState, proj: Projectile): boolean {
    if (!player.isAlive || !proj.isAlive) return false;
    return this.checkOverlap(player, proj);
  }

  /**
   * Quick check: does a player projectile overlap with a specific enemy?
   * Respects `isAlive` flags on both entities.
   */
  isProjectileHittingEnemy(proj: Projectile, enemy: Enemy): boolean {
    if (!proj.isAlive || !enemy.isAlive) return false;
    return this.checkOverlap(proj, enemy);
  }
}
