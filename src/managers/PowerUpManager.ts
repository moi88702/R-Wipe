/**
 * PowerUpManager.ts – Manages power-up lifecycle, collision detection, and effect application.
 *
 * Responsibilities:
 *  - Spawn power-ups on enemy defeat using weighted probability:
 *      weapon-upgrade 40%, shield 30%, extra-life 20%, health-recovery 10%
 *  - Advance power-up positions each frame with a slight upward float velocity.
 *  - Despawn uncollected power-ups after 5 seconds.
 *  - Detect player–power-up collisions via CollisionSystem.
 *  - Apply effects immediately: weapon upgrade, shield activation, extra life, health recovery.
 *  - Call playerManager.applyPowerUp() on collection.
 *  - Track shieldsCollected, extraLivesCollected, and gunUpgradeAchieved in RunStats.
 *  - Emit VisualFeedbackEvents for the rendering layer to consume.
 *
 * This module has NO dependency on Pixi.js and is safe to use in the Node test environment.
 * Pixi.js rendering for power-ups lives in src/rendering/PowerUpRenderer.ts.
 */

import type {
  PlayerState,
  PowerUp,
  PowerUpEffect,
  PowerUpType,
  RunStats,
} from "../types/index";
import { CollisionSystem } from "../systems/CollisionSystem";
import type { PlayerManager } from "./PlayerManager";

// ── Constants ──────────────────────────────────────────────────────────────────

/** Visual size of each power-up sprite (square). */
export const POWER_UP_WIDTH = 24;
export const POWER_UP_HEIGHT = 24;

/** How long (ms) a power-up remains on screen before despawning. */
export const POWER_UP_LIFETIME_MS = 5_000;

/**
 * Drift velocity for spawned power-ups. They fly leftward fast enough that
 * they reach the player's movement band (x: 100–300) before expiring, so the
 * player doesn't have to chase them beyond their own movement bounds.
 */
export const FLOAT_VX = -160; // px/s
export const FLOAT_VY = 0;

/**
 * Weighted spawn probability table (cumulative thresholds):
 *   weapon-upgrade  → 40%  (roll < 0.40)
 *   shield          → 30%  (roll < 0.70)
 *   extra-life      → 20%  (roll < 0.90)
 *   health-recovery → 10%  (roll < 1.00)
 */
export const SPAWN_WEIGHTS: ReadonlyArray<{
  type: PowerUpType;
  cumulative: number;
}> = [
  { type: "weapon-upgrade", cumulative: 0.30 },
  { type: "shield", cumulative: 0.48 },
  { type: "extra-life", cumulative: 0.62 },
  { type: "health-recovery", cumulative: 0.72 },
  { type: "speed-boost", cumulative: 0.81 },
  { type: "weapon-spread", cumulative: 0.88 },
  { type: "weapon-bomb", cumulative: 0.95 },
  { type: "mega-laser", cumulative: 1.0 }, // rare
];

// ── Visual feedback types ──────────────────────────────────────────────────────

/** Describes the kind of visual effect to play on power-up collection. */
export type VisualFeedbackType =
  | "weapon-glow"   // cyan flash on ship (weapon upgrade)
  | "shield-ring"   // expanding ring animation (shield)
  | "life-pulse"    // lives counter pulse (extra life)
  | "health-flash"  // green screen flash (health recovery)
  | "speed-trail"   // speed boost collected
  | "weapon-swap"   // weapon type changed
  | "mega-laser";   // mega-laser activated

/** A queued visual effect event for the rendering layer to consume. */
export interface VisualFeedbackEvent {
  /** Which animation to play. */
  type: VisualFeedbackType;
  /** X position of the player at collection time (effect origin). */
  x: number;
  /** Y position of the player at collection time (effect origin). */
  y: number;
}

/** Full result for a single power-up collection event. */
export interface CollectionResult {
  /** Id of the collected power-up. */
  powerUpId: string;
  /** Logical type of the power-up. */
  type: PowerUpType;
  /** The effect that was applied to the player. */
  effect: PowerUpEffect;
  /** Visual feedback event queued for the renderer. */
  feedback: VisualFeedbackEvent;
}

// ── Effect factories ───────────────────────────────────────────────────────────

/**
 * weapon-upgrade: advances upgradeLevel by 1, wraps back to 1 if already at max (5).
 * Note: PlayerManager.applyPowerUp() re-derives fireRateMs & projectileDamage from
 * the updated upgradeLevel automatically.
 */
function makeWeaponUpgradeEffect(): PowerUpEffect {
  return {
    type: "weapon-upgrade",
    apply(state: PlayerState): void {
      state.weapon.upgradeLevel =
        state.weapon.upgradeLevel >= 5 ? 1 : state.weapon.upgradeLevel + 1;
    },
  };
}

/**
 * shield: activates the player's shield for one hit.
 * Resets absorptionCapacity and sets displayValue to full.
 */
function makeShieldEffect(): PowerUpEffect {
  return {
    type: "shield",
    apply(state: PlayerState): void {
      state.shield.active = true;
      state.shield.displayValue = 100;
      state.shield.absorptionCapacity = 1;
    },
  };
}

/**
 * extra-life: unconditionally increments the player's life counter by 1.
 */
function makeExtraLifeEffect(): PowerUpEffect {
  return {
    type: "extra-life",
    apply(state: PlayerState): void {
      state.lives += 1;
    },
  };
}

/**
 * health-recovery: restores 30 HP, capped at 100.
 * Applied even if the player is at full health (idempotent in that case).
 */
function makeHealthRecoveryEffect(): PowerUpEffect {
  return {
    type: "health-recovery",
    apply(state: PlayerState): void {
      state.health = Math.min(100, state.health + 30);
    },
  };
}

/** Speed boost: sets a temporary multiplier on player speed. */
function makeSpeedBoostEffect(): PowerUpEffect {
  return {
    type: "speed-boost",
    apply(state: PlayerState): void {
      state.speedMultiplier = 1.65;
      state.speedBoostMs = 8_000;
    },
  };
}

/** Mega-laser: activates a full-width beam for 5-7 seconds. */
function makeMegaLaserEffect(): PowerUpEffect {
  return {
    type: "mega-laser",
    apply(state: PlayerState): void {
      const durationMs = 5_000 + Math.floor(Math.random() * 2_001); // 5000–7000
      state.megaLaserMs = Math.max(state.megaLaserMs, durationMs);
    },
  };
}

/** Weapon-switch: change the equipped weapon type. */
function makeWeaponSwitchEffect(to: "spread" | "bomb"): PowerUpEffect {
  return {
    type: to === "spread" ? "weapon-spread" : "weapon-bomb",
    apply(state: PlayerState): void {
      state.weapon.weaponType = to;
      // Reset fire timer so the new weapon can shoot immediately.
      state.weapon.lastFireTimeMs = 0;
    },
  };
}

/** Returns a fresh PowerUpEffect for the given type. */
export function createEffect(type: PowerUpType): PowerUpEffect {
  switch (type) {
    case "weapon-upgrade":
      return makeWeaponUpgradeEffect();
    case "shield":
      return makeShieldEffect();
    case "extra-life":
      return makeExtraLifeEffect();
    case "health-recovery":
      return makeHealthRecoveryEffect();
    case "speed-boost":
      return makeSpeedBoostEffect();
    case "weapon-spread":
      return makeWeaponSwitchEffect("spread");
    case "weapon-bomb":
      return makeWeaponSwitchEffect("bomb");
    case "mega-laser":
      return makeMegaLaserEffect();
  }
}

/** Maps a PowerUpType to its corresponding VisualFeedbackType. */
export function feedbackTypeFor(type: PowerUpType): VisualFeedbackType {
  switch (type) {
    case "weapon-upgrade":
      return "weapon-glow";
    case "shield":
      return "shield-ring";
    case "extra-life":
      return "life-pulse";
    case "health-recovery":
      return "health-flash";
    case "speed-boost":
      return "speed-trail";
    case "weapon-spread":
    case "weapon-bomb":
      return "weapon-swap";
    case "mega-laser":
      return "mega-laser";
  }
}

// ── ID generation ──────────────────────────────────────────────────────────────

/** Instance-level counter reset with initialize() for test isolation. */
let _globalNextId = 0;

// ── PowerUpManager ─────────────────────────────────────────────────────────────

export class PowerUpManager {
  private readonly powerUps: PowerUp[] = [];
  private readonly collisionSystem: CollisionSystem;
  private readonly pendingFeedback: VisualFeedbackEvent[] = [];

  /**
   * Set to `true` by checkAndApply() whenever at least one power-up is
   * collected.  The caller MUST call clearStatsDirty() after syncing the
   * mutated RunStats object with StateManager.updateRunStats().
   *
   * checkAndApply() throws if this flag is still set on entry, which catches
   * missing sync calls during development.
   *
   * Assumes one PowerUpManager per game instance (module-level _globalNextId
   * also relies on this single-instance constraint).
   */
  private _statsDirty = false;

  constructor() {
    this.collisionSystem = new CollisionSystem();
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Resets all state.  Call when starting a new game or level.
   */
  initialize(): void {
    this.powerUps.length = 0;
    this.pendingFeedback.length = 0;
    this._statsDirty = false;
    _globalNextId = 0; // reset for deterministic IDs across instances
  }

  // ── Spawning ─────────────────────────────────────────────────────────────────

  /**
   * Called when an enemy is defeated.  Randomly selects a power-up type
   * based on the weighted table and spawns it at the enemy's position.
   *
   * The random roll always hits one of the four types (total probability = 1.0),
   * so a power-up is guaranteed on every enemy defeat.
   *
   * To skip spawning (e.g. boss defeats that use a different drop table),
   * the caller simply doesn't invoke this method.
   */
  onEnemyDefeated(x: number, y: number): void {
    const roll = Math.random();
    for (const entry of SPAWN_WEIGHTS) {
      if (roll < entry.cumulative) {
        this.spawnPowerUp(entry.type, x, y);
        return;
      }
    }
    // Fallback — should never trigger with a full-coverage table
    this.spawnPowerUp("health-recovery", x, y);
  }

  /**
   * Directly spawns a power-up of the given type at position (x, y).
   * Useful for testing and for deterministic game-design scenarios.
   */
  spawnPowerUp(type: PowerUpType, x: number, y: number): void {
    const id = `powerup-${++_globalNextId}`;
    const powerUp: PowerUp = {
      id,
      type,
      position: { x, y },
      velocity: { x: FLOAT_VX, y: FLOAT_VY },
      width: POWER_UP_WIDTH,
      height: POWER_UP_HEIGHT,
      lifetime: POWER_UP_LIFETIME_MS,
      isCollected: false,
    };
    this.powerUps.push(powerUp);
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────

  /**
   * Advances all active power-up positions by their velocity, ticks down
   * lifetimes, and removes expired / collected power-ups.
   *
   * Collision checking and effect application is done separately via
   * checkAndApply() so the caller can interleave it with other systems.
   *
   * @param deltaTimeMs  Frame duration in milliseconds.
   */
  update(deltaTimeMs: number): void {
    const dt = deltaTimeMs / 1_000;
    for (const pu of this.powerUps) {
      if (pu.isCollected) continue;
      pu.position.x += pu.velocity.x * dt;
      pu.position.y += pu.velocity.y * dt;
      pu.lifetime -= deltaTimeMs;
    }
    this.despawnExpired();
  }

  /**
   * Removes all collected and lifetime-expired power-ups from the internal list.
   * Already called internally by update(); exposed for explicit use if needed.
   */
  despawnExpired(): void {
    let i = this.powerUps.length;
    while (i-- > 0) {
      const pu = this.powerUps[i]!;
      if (pu.lifetime <= 0 || pu.isCollected) {
        this.powerUps.splice(i, 1);
      }
    }
  }

  // ── Collision & effect application ──────────────────────────────────────────

  /**
   * Checks all active power-ups for overlap with the player.  For each hit:
   *  1. Marks the power-up as collected (prevents double-collection).
   *  2. Creates the appropriate PowerUpEffect.
   *  3. Calls `playerManager.applyPowerUp(effect)` to mutate player state.
   *  4. Reads the updated player state to record the correct post-effect values.
   *  5. Updates the `runStats` object in-place and sets the `_statsDirty` flag.
   *     The caller MUST call clearStatsDirty() after syncing with StateManager
   *     via StateManager.updateRunStats().  Failing to do so will cause the next
   *     call to checkAndApply() to throw.
   *  6. Queues a VisualFeedbackEvent for the rendering layer.
   *
   * @param playerState   Current player state snapshot (for overlap bounds).
   * @param playerManager Player manager to apply effects through.
   * @param runStats      Mutable RunStats object to update (mutated in-place).
   * @returns             One CollectionResult per power-up collected this frame.
   * @throws              If the previous call's stats have not been cleared via
   *                      clearStatsDirty() (catches missing sync calls early).
   */
  checkAndApply(
    playerState: PlayerState,
    playerManager: PlayerManager,
    runStats: RunStats,
  ): CollectionResult[] {
    if (this._statsDirty) {
      throw new Error(
        "PowerUpManager: stats from the previous checkAndApply() call have not " +
        "been synced with StateManager. Call clearStatsDirty() after calling " +
        "StateManager.updateRunStats().",
      );
    }

    const results: CollectionResult[] = [];

    for (const pu of this.powerUps) {
      if (pu.isCollected) continue;
      if (!this.collisionSystem.checkOverlap(playerState, pu)) continue;

      pu.isCollected = true;

      const effect = createEffect(pu.type);
      playerManager.applyPowerUp(effect);

      // Read the UPDATED player state so stats reflect post-collection values.
      // Guard against an unexpected null return even though the declared return
      // type is non-nullable (defensive against alternative implementations).
      const updatedState = playerManager.getState();
      if (!updatedState) continue;
      this._statsDirty = true;
      this.applyStatsUpdate(pu.type, updatedState, runStats);

      const feedback: VisualFeedbackEvent = {
        type: feedbackTypeFor(pu.type),
        x: playerState.position.x,
        y: playerState.position.y,
      };
      this.pendingFeedback.push(feedback);

      results.push({ powerUpId: pu.id, type: pu.type, effect, feedback });
    }

    return results;
  }

  /**
   * Force-collect a list of power-ups by id. Same side-effects as
   * checkAndApply() (applies effect, mutates runStats in-place, queues a
   * VisualFeedbackEvent), but driven by the caller rather than player-touch
   * collision. Intended for "shoot-to-collect" gameplay.
   *
   * Does NOT toggle _statsDirty — the caller is expected to sync runStats
   * once per frame regardless.
   */
  collectByIds(
    ids: ReadonlyArray<string>,
    playerManager: PlayerManager,
    runStats: RunStats,
  ): CollectionResult[] {
    const results: CollectionResult[] = [];
    for (const id of ids) {
      const pu = this.powerUps.find((p) => p.id === id && !p.isCollected);
      if (!pu) continue;
      pu.isCollected = true;

      const effect = createEffect(pu.type);
      playerManager.applyPowerUp(effect);
      const updatedState = playerManager.getState();
      this.applyStatsUpdate(pu.type, updatedState, runStats);

      const feedback: VisualFeedbackEvent = {
        type: feedbackTypeFor(pu.type),
        x: pu.position.x,
        y: pu.position.y,
      };
      this.pendingFeedback.push(feedback);

      results.push({ powerUpId: pu.id, type: pu.type, effect, feedback });
    }
    return results;
  }

  /**
   * Returns PowerUpEffects for all power-ups that overlap the player,
   * WITHOUT marking them as collected and WITHOUT applying effects.
   *
   * Useful for read-only inspection; prefer checkAndApply() for normal gameplay.
   */
  checkCollisions(playerState: PlayerState): PowerUpEffect[] {
    const effects: PowerUpEffect[] = [];
    for (const pu of this.powerUps) {
      if (pu.isCollected) continue;
      if (this.collisionSystem.checkOverlap(playerState, pu)) {
        effects.push(createEffect(pu.type));
      }
    }
    return effects;
  }

  // ── State accessors ──────────────────────────────────────────────────────────

  /**
   * Returns all currently active (alive, not collected) power-ups.
   * The returned array is a filtered snapshot; do not mutate it.
   */
  getActivePowerUps(): ReadonlyArray<PowerUp> {
    return this.powerUps.filter((pu) => !pu.isCollected && pu.lifetime > 0);
  }

  /** Total power-up count in the internal list (active + recently collected). */
  getCount(): number {
    return this.powerUps.length;
  }

  /**
   * Returns all pending visual feedback events since the last clearFeedback()
   * call.  The rendering layer reads these once per frame.
   */
  getPendingFeedback(): ReadonlyArray<VisualFeedbackEvent> {
    return this.pendingFeedback;
  }

  /**
   * Clears the feedback queue.  Call after the renderer has consumed events
   * (typically at the end of the render pass).
   */
  clearFeedback(): void {
    this.pendingFeedback.length = 0;
  }

  /**
   * Returns `true` if checkAndApply() mutated `runStats` since the last
   * clearStatsDirty() call.  The caller should sync the RunStats object with
   * StateManager.updateRunStats() and then call clearStatsDirty().
   */
  isStatsDirty(): boolean {
    return this._statsDirty;
  }

  /**
   * Resets the stats-dirty flag.  Call this after syncing the RunStats object
   * with StateManager.updateRunStats() so that the next checkAndApply() call
   * does not throw.
   */
  clearStatsDirty(): void {
    this._statsDirty = false;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Mutates `runStats` in-place based on the collected power-up type.
   *
   * @param type           Collected power-up type.
   * @param updatedState   Player state AFTER the effect has been applied.
   * @param runStats       Stats object to update.
   */
  private applyStatsUpdate(
    type: PowerUpType,
    updatedState: Readonly<PlayerState>,
    runStats: RunStats,
  ): void {
    switch (type) {
      case "weapon-upgrade":
        // Track the highest upgrade level achieved this run
        runStats.gunUpgradeAchieved = Math.max(
          runStats.gunUpgradeAchieved,
          updatedState.weapon.upgradeLevel,
        );
        break;
      case "shield":
        runStats.shieldsCollected += 1;
        break;
      case "extra-life":
        runStats.extraLivesCollected += 1;
        break;
      case "health-recovery":
        // No dedicated RunStats field; tracked via totalDamageReceived delta if needed
        break;
    }
  }
}
