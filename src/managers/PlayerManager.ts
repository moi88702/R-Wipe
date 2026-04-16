/**
 * PlayerManager.ts – Owns and updates all player-related game state.
 *
 * Responsibilities:
 *  - Maintain PlayerState (position, velocity, health, lives, shield, weapon).
 *  - Poll input each frame and move the ship within its allowed bounds.
 *  - Enforce the weapon fire-rate and spawn projectiles via the ProjectilePool.
 *  - Apply damage (with shield-absorption logic).
 *  - Apply power-up effects and re-derive dependent weapon values.
 *
 * This module has NO dependency on Pixi.js and is safe to use in the Node
 * test environment.
 */

import type {
  DamageResult,
  InputState,
  PlayerState,
  PowerUpEffect,
  Projectile,
} from "../types/index";
import { ProjectilePool } from "../entities/Projectile";

// ── Movement & bounds ──────────────────────────────────────────────────────

/** Pixels per second the ship travels when a directional key is held. */
const PLAYER_SPEED_PX_S = 200;

/**
 * Allowed movement area for the ship centre (left-centre of viewport).
 * x: 100–300, y: 100–600
 */
const BOUNDS = { xMin: 100, xMax: 300, yMin: 100, yMax: 600 } as const;

// ── Weapon constants ───────────────────────────────────────────────────────

/** Fire-rate (ms between shots) at weapon upgrade level 1. */
export const FIRE_RATE_LEVEL_1_MS = 600;

/** Fire-rate (ms between shots) at weapon upgrade level 5 (4× faster). */
export const FIRE_RATE_LEVEL_5_MS = 150;

/** Base projectile damage at upgrade level 1. */
export const BASE_PROJECTILE_DAMAGE = 10;

/** Projectile speed in pixels per second (fires rightward). */
export const PROJECTILE_SPEED_PX_S = 600;

// ── Invulnerability ────────────────────────────────────────────────────────

/** How long (ms) the player is invulnerable after taking damage. */
const INVULNERABILITY_MS = 1_000;

// ── Weapon upgrade helpers ─────────────────────────────────────────────────

/**
 * Returns the fire-rate (ms between shots) for the given upgrade level.
 *
 * Level 1 → 600 ms, Level 5 → 150 ms (linear interpolation).
 * Values outside [1, 5] are clamped.
 */
export function calcFireRateMs(upgradeLevel: number): number {
  const level = Math.max(1, Math.min(5, upgradeLevel));
  return (
    FIRE_RATE_LEVEL_1_MS -
    ((level - 1) * (FIRE_RATE_LEVEL_1_MS - FIRE_RATE_LEVEL_5_MS)) / 4
  );
}

/**
 * Returns the projectile damage for the given upgrade level.
 *
 * Level 1 → 1× base (10), Level 5 → 2× base (20) (linear interpolation).
 */
export function calcProjectileDamage(upgradeLevel: number): number {
  const level = Math.max(1, Math.min(5, upgradeLevel));
  return BASE_PROJECTILE_DAMAGE * (1 + (level - 1) * 0.25);
}

// ── Default state factory ──────────────────────────────────────────────────

function makeDefaultState(): PlayerState {
  return {
    position: { x: 200, y: 360 },
    velocity: { x: 0, y: 0 },
    health: 100,
    lives: 3,
    shield: { active: false, displayValue: 0, absorptionCapacity: 1 },
    weapon: {
      upgradeLevel: 1,
      fireRateMs: FIRE_RATE_LEVEL_1_MS,
      lastFireTimeMs: 0,
      projectileDamage: BASE_PROJECTILE_DAMAGE,
      projectileSpeed: PROJECTILE_SPEED_PX_S / 60, // stored as px/frame (legacy compat)
    },
    invulnerabilityTimer: 0,
    isAlive: true,
    width: 50,
    height: 32,
  };
}

// ── PlayerManager ──────────────────────────────────────────────────────────

export class PlayerManager {
  private state: PlayerState;
  private readonly projectilePool: ProjectilePool;

  /**
   * Internal clock (ms) that advances with each update call.
   * Used to measure time between shots independently of wall-clock time.
   * Initialised to FIRE_RATE_LEVEL_1_MS so the player can fire immediately.
   */
  private clockMs: number = FIRE_RATE_LEVEL_1_MS;

  /** Viewport dimensions used for out-of-bounds projectile culling. */
  private viewportWidth: number = 1_280;
  private viewportHeight: number = 720;

  constructor(viewportWidth = 1_280, viewportHeight = 720) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.state = makeDefaultState();
    this.projectilePool = new ProjectilePool();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * (Re-)initialise the manager with a specific start position.
   * Clears all active projectiles and resets the internal clock.
   */
  initialize(startX: number, startY: number): void {
    this.state = {
      ...makeDefaultState(),
      position: { x: startX, y: startY },
    };
    this.projectilePool.clear();
    this.clockMs = FIRE_RATE_LEVEL_1_MS; // allow firing immediately
  }

  /**
   * Reset the player's position and clear projectiles between levels.
   * Preserves health, lives, weapon upgrade, and shield state.
   */
  resetForLevel(): void {
    this.state = {
      ...this.state,
      position: { x: 200, y: 360 },
      velocity: { x: 0, y: 0 },
      invulnerabilityTimer: 0,
    };
    this.projectilePool.clear();
    this.clockMs = FIRE_RATE_LEVEL_1_MS;
  }

  // ── Per-frame update ─────────────────────────────────────────────────────

  /**
   * Main game-loop tick.
   *
   * @param deltaTimeMs  Duration of this frame in milliseconds.
   * @param input        Input snapshot polled at the start of the frame.
   */
  update(deltaTimeMs: number, input: InputState): void {
    if (!this.state.isAlive) return;

    this.clockMs += deltaTimeMs;
    this.applyMovement(deltaTimeMs, input);
    this.tickInvulnerability(deltaTimeMs);
    this.tryFire(input);
    this.projectilePool.update(deltaTimeMs, this.viewportWidth, this.viewportHeight);
  }

  // ── Damage & power-ups ───────────────────────────────────────────────────

  /**
   * Apply `amount` damage to the player.
   *
   * Invulnerability window: damage is ignored while the timer is active.
   * Shield absorption: the first hit when shield is active is blocked and
   *   the shield deactivates.
   *
   * When health reaches 0, a life is consumed.  If no lives remain, the
   * player dies (`isAlive = false`).
   */
  takeDamage(amount: number): DamageResult {
    if (!this.state.isAlive) {
      return { blocked: false, health: 0, died: false };
    }

    // Ignore damage during invulnerability window
    if (this.state.invulnerabilityTimer > 0) {
      return { blocked: false, health: this.state.health, died: false };
    }

    // Shield absorbs the hit
    if (this.state.shield.active) {
      this.state = {
        ...this.state,
        shield: { active: false, displayValue: 0, absorptionCapacity: 1 },
      };
      return { blocked: true, health: this.state.health, died: false };
    }

    // Apply damage
    const newHealth = Math.max(0, this.state.health - amount);
    const died = newHealth <= 0;

    if (died) {
      const newLives = this.state.lives - 1;
      this.state = {
        ...this.state,
        health: newHealth,
        lives: newLives,
        isAlive: newLives > 0,
        invulnerabilityTimer: newLives > 0 ? INVULNERABILITY_MS : 0,
      };
    } else {
      this.state = {
        ...this.state,
        health: newHealth,
        invulnerabilityTimer: INVULNERABILITY_MS,
      };
    }

    return { blocked: false, health: newHealth, died };
  }

  /**
   * Apply a power-up effect to the player state.
   * Weapon stats are re-derived from the (possibly updated) upgrade level.
   */
  applyPowerUp(powerUp: PowerUpEffect): void {
    // Allow the power-up to mutate state in-place
    powerUp.apply(this.state);

    // Re-sync fire rate and damage from current upgrade level
    const level = this.state.weapon.upgradeLevel;
    this.state = {
      ...this.state,
      weapon: {
        ...this.state.weapon,
        fireRateMs: calcFireRateMs(level),
        projectileDamage: calcProjectileDamage(level),
      },
    };
  }

  /**
   * Directly set the weapon upgrade level (1–5).
   * Updates fire-rate and damage immediately.
   */
  upgradeWeapon(level: number): void {
    const clampedLevel = Math.max(1, Math.min(5, level));
    this.state = {
      ...this.state,
      weapon: {
        ...this.state.weapon,
        upgradeLevel: clampedLevel,
        fireRateMs: calcFireRateMs(clampedLevel),
        projectileDamage: calcProjectileDamage(clampedLevel),
      },
    };
  }

  // ── State accessors ──────────────────────────────────────────────────────

  /** Returns a read-only snapshot of the current player state. */
  getState(): Readonly<PlayerState> {
    return this.state;
  }

  /** Returns all currently active (alive) projectiles. */
  getProjectiles(): ReadonlyArray<Projectile> {
    return this.projectilePool.getActive();
  }

  /** Teleports the ship to an exact position (bypasses bounds clamping). */
  setPosition(x: number, y: number): void {
    this.state = {
      ...this.state,
      position: { x, y },
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Translates input into velocity and moves the ship.
   * Diagonal movement is normalised to preserve consistent speed.
   * Position is clamped to `BOUNDS`.
   */
  private applyMovement(deltaTimeMs: number, input: InputState): void {
    const dt = deltaTimeMs / 1_000; // ms → seconds
    let vx = 0;
    let vy = 0;

    if (input.moveLeft) vx -= PLAYER_SPEED_PX_S;
    if (input.moveRight) vx += PLAYER_SPEED_PX_S;
    if (input.moveUp) vy -= PLAYER_SPEED_PX_S;
    if (input.moveDown) vy += PLAYER_SPEED_PX_S;

    // Normalise diagonal so diagonal speed equals axis speed
    if (vx !== 0 && vy !== 0) {
      const inv = 1 / Math.SQRT2;
      vx *= inv;
      vy *= inv;
    }

    const newX = Math.max(BOUNDS.xMin, Math.min(BOUNDS.xMax, this.state.position.x + vx * dt));
    const newY = Math.max(BOUNDS.yMin, Math.min(BOUNDS.yMax, this.state.position.y + vy * dt));

    this.state = {
      ...this.state,
      position: { x: newX, y: newY },
      velocity: { x: vx, y: vy },
    };
  }

  /** Decrement the invulnerability timer. */
  private tickInvulnerability(deltaTimeMs: number): void {
    if (this.state.invulnerabilityTimer <= 0) return;
    this.state = {
      ...this.state,
      invulnerabilityTimer: Math.max(0, this.state.invulnerabilityTimer - deltaTimeMs),
    };
  }

  /**
   * Fires a projectile from the ship nose if:
   *  1. The fire key is held.
   *  2. Enough time has elapsed since the last shot (fire-rate cooldown).
   *
   * The nose is the right edge of the ship, centred vertically.
   */
  private tryFire(input: InputState): void {
    if (!input.fire) return;

    const { weapon } = this.state;
    const elapsed = this.clockMs - weapon.lastFireTimeMs;
    if (elapsed < weapon.fireRateMs) return;

    // Spawn from ship nose: right edge, vertical centre
    const noseX = this.state.position.x + this.state.width / 2;
    const noseY = this.state.position.y;

    this.projectilePool.spawn(
      noseX,
      noseY,
      PROJECTILE_SPEED_PX_S,
      0, // rightward only
      weapon.projectileDamage,
      "player",
    );

    this.state = {
      ...this.state,
      weapon: { ...weapon, lastFireTimeMs: this.clockMs },
    };
  }
}
