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
  PlayerWeaponType,
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

/** Cooldown (ms) between manual B-key bomb drops. */
const BOMB_COOLDOWN_MS = 2_500;

/** Free bombs granted on respawn so the player can clear space immediately. */
const RESPAWN_BOMB_CREDITS = 3;

/**
 * Damage multiplier applied to bomb-kind projectiles, relative to the
 * player's current weapon damage. Bombs are AoE and meant to clear space
 * around the player in a pinch, so they hit notably harder than bullets.
 */
const BOMB_DAMAGE_MULT = 4.4;
/** Minimum damage for a B-key bomb regardless of weapon level. */
const BOMB_MIN_DAMAGE = 36;

/** Radius (px) of the panic-bomb blast, measured from the ship centre. */
const PANIC_BOMB_BLAST_RADIUS = 220;

/**
 * Pending panic-bomb detonation request. Queued by PlayerManager when the
 * player presses bomb; drained once per frame by GameManager which applies
 * AoE damage and FX.
 */
export interface PanicBombEvent {
  x: number;
  y: number;
  damage: number;
  blastRadius: number;
}

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
      weaponType: "bullet",
    },
    invulnerabilityTimer: 0,
    isAlive: true,
    width: 50,
    height: 32,
    speedMultiplier: 1,
    speedBoostMs: 0,
    megaLaserMs: 0,
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
  /** ms remaining on the B-key bomb cooldown (0 = ready). */
  private bombCooldownMs = 0;
  /** Previous frame's bomb-key state, for edge-trigger detection. */
  private prevBombPressed = false;
  /** Dev-only: when true, takeDamage is a no-op. */
  private godMode = false;
  /**
   * Number of cooldown-bypassing bombs available. Granted on respawn so a
   * dying player can immediately clear space. Each drop decrements one; when
   * zero, the normal BOMB_COOLDOWN_MS applies again.
   */
  private bombCredits = 0;
  /** Panic bombs waiting for GameManager to detonate this frame. */
  private pendingPanicBombs: PanicBombEvent[] = [];

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
    this.bombCooldownMs = 0;
    this.prevBombPressed = false;
    this.bombCredits = 0;
    this.pendingPanicBombs = [];
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
      // Stale lastFireTimeMs from the previous level's clock would make
      // `clockMs - lastFireTimeMs` huge and negative once clockMs is reset,
      // which passes the cooldown check only if fireRate is absurdly large.
      // Zero it so the fresh clockMs allows firing immediately.
      weapon: { ...this.state.weapon, lastFireTimeMs: 0 },
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
    this.bombCooldownMs = Math.max(0, this.bombCooldownMs - deltaTimeMs);
    this.tickSpeedBoost(deltaTimeMs);
    this.tickMegaLaser(deltaTimeMs);
    this.applyMovement(deltaTimeMs, input);
    this.tickInvulnerability(deltaTimeMs);
    this.tryFire(input);
    this.tryDropBomb(input);
    this.projectilePool.update(deltaTimeMs, this.viewportWidth, this.viewportHeight);
  }

  private tickSpeedBoost(deltaTimeMs: number): void {
    if (this.state.speedBoostMs <= 0) return;
    const remaining = Math.max(0, this.state.speedBoostMs - deltaTimeMs);
    this.state = {
      ...this.state,
      speedBoostMs: remaining,
      speedMultiplier: remaining > 0 ? this.state.speedMultiplier : 1,
    };
  }

  private tickMegaLaser(deltaTimeMs: number): void {
    if (this.state.megaLaserMs <= 0) return;
    this.state = {
      ...this.state,
      megaLaserMs: Math.max(0, this.state.megaLaserMs - deltaTimeMs),
    };
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

    if (this.godMode) {
      return { blocked: true, health: this.state.health, died: false };
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
      // Always mark dead on a lethal hit. The caller (GameManager) is
      // responsible for running the death animation and calling respawn()
      // when a life remains, or transitioning to game-over when not.
      this.state = {
        ...this.state,
        health: 0,
        lives: newLives,
        isAlive: false,
        invulnerabilityTimer: 0,
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

  /**
   * Bring the player back after a life has been lost.
   * Restores full HP, weapon back to level 1, shield cleared, ship back at
   * the starting position, and grants `invulnerabilityMs` of flicker-invuln
   * (default 3 s) that the caller can cancel early via cancelInvulnerability().
   */
  respawn(
    startX = 200,
    startY: number = this.viewportHeight / 2,
    invulnerabilityMs = 3_000,
  ): void {
    this.state = {
      ...this.state,
      position: { x: startX, y: startY },
      velocity: { x: 0, y: 0 },
      health: 100,
      isAlive: true,
      shield: { active: false, displayValue: 0, absorptionCapacity: 1 },
      weapon: {
        upgradeLevel: 1,
        fireRateMs: FIRE_RATE_LEVEL_1_MS,
        lastFireTimeMs: 0,
        projectileDamage: BASE_PROJECTILE_DAMAGE,
        projectileSpeed: PROJECTILE_SPEED_PX_S / 60,
        weaponType: "bullet",
      },
      invulnerabilityTimer: invulnerabilityMs,
      speedMultiplier: 1,
      speedBoostMs: 0,
    megaLaserMs: 0,
    };
    this.projectilePool.clear();
    this.clockMs = FIRE_RATE_LEVEL_1_MS;
    this.bombCooldownMs = 0;
    this.prevBombPressed = false;
    this.bombCredits = RESPAWN_BOMB_CREDITS;
    this.pendingPanicBombs = [];
  }

  /** End the current invulnerability window immediately. */
  cancelInvulnerability(): void {
    if (this.state.invulnerabilityTimer <= 0) return;
    this.state = { ...this.state, invulnerabilityTimer: 0 };
  }

  /** Marks a projectile in the player pool as dead (e.g. after a hit). */
  killProjectile(id: string): void {
    for (const p of this.projectilePool.getActive()) {
      if (p.id === id) {
        p.isAlive = false;
        return;
      }
    }
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
    const speed = PLAYER_SPEED_PX_S * this.state.speedMultiplier;
    let vx = 0;
    let vy = 0;

    if (input.touchTarget) {
      // Mobile drag-to-move: glide the ship toward the finger at the same
      // max speed as keyboard movement. Clamps to `speed` so long distances
      // don't teleport; when closer than one step, we scale down so the
      // ship settles under the finger instead of oscillating.
      const dx = input.touchTarget.x - this.state.position.x;
      const dy = input.touchTarget.y - this.state.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 0.5) {
        const stepSpeed = Math.min(speed, dist / Math.max(dt, 1e-6));
        vx = (dx / dist) * stepSpeed;
        vy = (dy / dist) * stepSpeed;
      }
    } else {
      if (input.moveLeft) vx -= speed;
      if (input.moveRight) vx += speed;
      if (input.moveUp) vy -= speed;
      if (input.moveDown) vy += speed;

      // Normalise diagonal so diagonal speed equals axis speed
      if (vx !== 0 && vy !== 0) {
        const inv = 1 / Math.SQRT2;
        vx *= inv;
        vy *= inv;
      }
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

    switch (weapon.weaponType) {
      case "spread": {
        // 3-way spread. Upgrade-level 3+ adds two tight outer barrels.
        const speed = PROJECTILE_SPEED_PX_S;
        const angles = weapon.upgradeLevel >= 3
          ? [-0.22, -0.1, 0, 0.1, 0.22]
          : [-0.15, 0, 0.15];
        for (const a of angles) {
          this.projectilePool.spawn(
            noseX, noseY,
            Math.cos(a) * speed, Math.sin(a) * speed,
            weapon.projectileDamage, "player",
          );
        }
        break;
      }
      case "bomb": {
        // Proximity bomb — slower, larger, AoE on proximity.
        this.projectilePool.spawnEx({
          x: noseX,
          y: noseY,
          vx: 420,
          vy: 0,
          damage: weapon.projectileDamage * BOMB_DAMAGE_MULT,
          owner: "player",
          kind: "prox-bomb",
          width: 16,
          height: 16,
          lifetimeMs: 3_000,
          health: 2,
          proxTriggerRadius: 120,
          proxBlastRadius: 170,
        });
        break;
      }
      case "bullet":
      default:
        this.projectilePool.spawn(
          noseX, noseY,
          PROJECTILE_SPEED_PX_S, 0,
          weapon.projectileDamage, "player",
        );
        break;
    }

    this.state = {
      ...this.state,
      weapon: { ...weapon, lastFireTimeMs: this.clockMs },
    };
  }

  /**
   * Queues a panic-bomb detonation centred on the ship when B is pressed
   * (edge-triggered). Panic bombs are independent of the equipped weapon:
   * they clear a wide blast radius around the player, giving breathing
   * room when surrounded. The actual damage + FX are applied by GameManager
   * which drains {@link consumePendingPanicBombs} each frame.
   */
  private tryDropBomb(input: InputState): void {
    const pressed = input.bomb;
    const edge = pressed && !this.prevBombPressed;
    this.prevBombPressed = pressed;
    if (!edge) return;
    // Post-respawn free bombs bypass the cooldown so the player can panic-clear.
    const useCredit = this.bombCredits > 0;
    if (!useCredit && this.bombCooldownMs > 0) return;

    const dmg = Math.max(
      BOMB_MIN_DAMAGE,
      this.state.weapon.projectileDamage * BOMB_DAMAGE_MULT,
    );
    this.pendingPanicBombs.push({
      x: this.state.position.x,
      y: this.state.position.y,
      damage: dmg,
      blastRadius: PANIC_BOMB_BLAST_RADIUS,
    });
    if (useCredit) {
      this.bombCredits -= 1;
    } else {
      this.bombCooldownMs = BOMB_COOLDOWN_MS;
    }
  }

  /**
   * Drain the panic-bomb queue. Returns bombs requested this frame and
   * leaves the queue empty. Called once per frame by GameManager.
   */
  consumePendingPanicBombs(): PanicBombEvent[] {
    if (this.pendingPanicBombs.length === 0) return [];
    const out = this.pendingPanicBombs;
    this.pendingPanicBombs = [];
    return out;
  }

  /** 0..1 readiness of the B-key bomb cooldown (1 = ready, 0 = just fired). */
  getBombCooldownProgress(): number {
    if (BOMB_COOLDOWN_MS <= 0) return 1;
    return 1 - this.bombCooldownMs / BOMB_COOLDOWN_MS;
  }

  /** Number of free cooldown-bypassing panic bombs currently available. */
  getBombCredits(): number {
    return this.bombCredits;
  }

  // ── Dev-only setters (wired by src/dev/cheats.ts; inert in prod) ─────────

  setGodMode(on: boolean): void {
    this.godMode = on;
  }

  setHealth(hp: number): void {
    this.state = { ...this.state, health: Math.max(0, Math.min(100, hp)) };
  }

  setLives(lives: number): void {
    this.state = { ...this.state, lives: Math.max(0, Math.floor(lives)) };
  }

  setWeaponType(type: PlayerWeaponType): void {
    this.state = {
      ...this.state,
      weapon: { ...this.state.weapon, weaponType: type },
    };
  }

  setShieldActive(active: boolean): void {
    this.state = {
      ...this.state,
      shield: active
        ? { active: true, displayValue: 1, absorptionCapacity: 1 }
        : { active: false, displayValue: 0, absorptionCapacity: 1 },
    };
  }

  setSpeedMultiplier(mult: number): void {
    const clamped = Math.max(0.1, Math.min(10, mult));
    this.state = {
      ...this.state,
      speedMultiplier: clamped,
      // A permanent multiplier (dev cheat) shouldn't decay; a huge timer is
      // effectively "forever" for a play session without changing the tick logic.
      speedBoostMs: clamped !== 1 ? Number.MAX_SAFE_INTEGER : 0,
    };
  }

  setMegaLaserMs(ms: number): void {
    this.state = { ...this.state, megaLaserMs: Math.max(0, ms) };
  }
}
