/**
 * Projectile.ts – Object-pool implementation for player (and enemy) projectiles.
 *
 * Inactive Projectile objects are kept in the pool and re-activated on demand
 * to minimise garbage-collection pressure during intense firing sequences.
 *
 * All velocities are in pixels-per-second.  The update function converts to
 * the frame's pixel delta via `deltaTimeMs / 1000`.
 */

import type { Projectile } from "../types/index";

// ── Projectile constants ───────────────────────────────────────────────────

/** Visual size of a player projectile (cyan rectangle). */
export const PROJECTILE_WIDTH = 10;
export const PROJECTILE_HEIGHT = 4;

/** Projectiles are automatically removed after this duration. */
export const PROJECTILE_LIFETIME_MS = 3_000;

// ── ID generation ─────────────────────────────────────────────────────────

let _nextId = 0;
function nextProjectileId(): string {
  return `proj-${++_nextId}`;
}

// ── ProjectilePool ────────────────────────────────────────────────────────

/**
 * Manages a pool of Projectile objects.
 *
 * Usage:
 * ```ts
 * const pool = new ProjectilePool();
 * pool.spawn(noseX, noseY, 600, 0, 10, "player"); // fire rightward
 * pool.update(deltaMs, 1280, 720);                  // advance every frame
 * const projectiles = pool.getActive();             // read for collisions/rendering
 * ```
 */
export class ProjectilePool {
  /** All ever-created projectiles (alive + inactive). */
  private readonly pool: Projectile[] = [];
  /** Subset of pool that is currently alive and being updated. */
  private readonly active: Projectile[] = [];

  // ── Pooling ─────────────────────────────────────────────────────────────

  /**
   * Returns an inactive projectile from the pool, or allocates a new one.
   */
  private acquire(): Projectile {
    for (const p of this.pool) {
      if (!p.isAlive) return p;
    }
    const p: Projectile = {
      id: "",
      owner: "player",
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      damage: 0,
      lifetime: 0,
      width: PROJECTILE_WIDTH,
      height: PROJECTILE_HEIGHT,
      isAlive: false,
    };
    this.pool.push(p);
    return p;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Activates a projectile at position (`x`, `y`).
   *
   * @param x       Spawn x coordinate (pixels).
   * @param y       Spawn y coordinate (pixels).
   * @param vx      Horizontal velocity (pixels/second).
   * @param vy      Vertical velocity   (pixels/second).
   * @param damage  Damage dealt on collision.
   * @param owner   `"player"` or `"enemy"`.
   */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    damage: number,
    owner: "player" | "enemy" = "player",
  ): Projectile {
    const p = this.acquire();
    p.id = nextProjectileId();
    p.owner = owner;
    p.position.x = x;
    p.position.y = y;
    p.velocity.x = vx;
    p.velocity.y = vy;
    p.damage = damage;
    p.lifetime = PROJECTILE_LIFETIME_MS;
    p.width = PROJECTILE_WIDTH;
    p.height = PROJECTILE_HEIGHT;
    p.isAlive = true;
    if (!this.active.includes(p)) {
      this.active.push(p);
    }
    return p;
  }

  /**
   * Advances every active projectile by `deltaTimeMs`.
   * Kills projectiles that have timed-out or left the viewport.
   *
   * @param deltaTimeMs    Frame duration in milliseconds.
   * @param viewportWidth  Right bound; projectile is killed once x > this.
   * @param viewportHeight Bottom bound; projectile is killed once y > this.
   */
  update(
    deltaTimeMs: number,
    viewportWidth: number,
    viewportHeight: number,
  ): void {
    const dt = deltaTimeMs / 1_000; // convert ms → seconds

    for (const p of this.active) {
      if (!p.isAlive) continue;

      p.position.x += p.velocity.x * dt;
      p.position.y += p.velocity.y * dt;
      p.lifetime -= deltaTimeMs;

      if (
        p.lifetime <= 0 ||
        p.position.x > viewportWidth ||
        p.position.x < -p.width ||
        p.position.y > viewportHeight ||
        p.position.y < -p.height
      ) {
        p.isAlive = false;
      }
    }

    // Compact the active list (reverse-iterate to avoid index shifting)
    let i = this.active.length;
    while (i-- > 0) {
      if (!this.active[i]!.isAlive) {
        this.active.splice(i, 1);
      }
    }
  }

  /**
   * Returns all currently alive projectiles (read-only).
   * Suitable for collision checks and rendering each frame.
   */
  getActive(): ReadonlyArray<Projectile> {
    return this.active;
  }

  /**
   * Deactivates all projectiles and empties the active list.
   * Use when resetting a level or respawning the player.
   */
  clear(): void {
    for (const p of this.active) {
      p.isAlive = false;
    }
    this.active.length = 0;
  }

  /** Total pool size (alive + inactive). Useful for debugging/profiling. */
  getPoolSize(): number {
    return this.pool.length;
  }

  /** Number of currently active (alive) projectiles. */
  getActiveCount(): number {
    return this.active.length;
  }
}
