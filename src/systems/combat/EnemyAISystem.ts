/**
 * EnemyAISystem — scanner-based targeting, aggression state machine, and
 * per-frame targeting loop for AI-controlled enemy ships.
 *
 * Design decisions
 * ─────────────────
 * • Pure static API — no mutable instance state. Each enemy carries its own
 *   EnemyAIState object which the caller owns and passes per call, identical to
 *   the TargetLockManager + TargetingState pattern.
 *
 * • Aggression is a one-way escalation machine:
 *   NEUTRAL  → VIGILANT  when the player enters vigilance range
 *   NEUTRAL  → HOSTILE   immediately when the player fires on the enemy
 *   VIGILANT → HOSTILE   when the player fires on the enemy
 *   HOSTILE  → (stays HOSTILE — no de-escalation)
 *
 * • Only VIGILANT and HOSTILE enemies participate in scanner scanning and
 *   target-locking. NEUTRAL enemies ignore the player until provoked.
 *
 * • Enemy locking reuses TargetLockManager exactly as the player does — each
 *   enemy carries its own TargetingState and the same lock-limit, range, and
 *   penetration rules apply symmetrically.
 *
 * • The tick() method is the main entry-point for the game loop. It runs:
 *   (1) updateAggression, (2) validateEnemyLocks, (3) acquirePlayerLock when
 *   shouldEngage is true, and returns a summary so callers know whether to fire.
 *
 * Units: positions in km; timestamps in ms.
 */

import type { CelestialBody } from "../../types/solarsystem";
import { Aggression } from "./types";
import type { ScannerEquipment, TargetLock, TargetingState } from "./types";
import { TargetLockManager } from "./TargetLockManager";

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * All the state EnemyAISystem needs to drive one AI enemy ship.
 *
 * Callers construct and own this object (one per enemy); the system mutates it
 * in-place every frame, mirroring the TargetLockManager / TargetingState contract.
 */
export interface EnemyAIState {
  /** Unique entity identifier (matches the entity in the game world). */
  id: string;
  /** Display name used in lock-indicator HUD rendering. */
  name: string;
  /** World-space position (km). Updated externally each frame by movement AI. */
  position: { x: number; y: number };
  /** Scanner equipment — drives range, penetration, and max simultaneous locks. */
  scanner: ScannerEquipment;
  /** Multi-lock targeting state. Mutated via TargetLockManager. */
  targetingState: TargetingState;
  /**
   * Current aggression level.
   * One-way escalation: NEUTRAL → VIGILANT → HOSTILE.
   */
  aggression: Aggression;
  /**
   * Timestamp (ms) of the last "player fired on me" event.
   * Undefined until the enemy has been attacked at least once.
   */
  lastAggravatedByPlayerAt?: number | undefined;
}

/**
 * Summary returned by EnemyAISystem.tick() after one frame update.
 * Callers consume this to decide whether to fire, play SFX, etc.
 */
export interface EnemyAITickResult {
  /** True when the aggression level changed during this tick. */
  aggressionChanged: boolean;
  /** True when a brand-new target lock was established this tick. */
  lockAcquired: boolean;
  /** Ids of locks that were broken this tick (range, LOS, or target destroyed). */
  brokenLockIds: string[];
  /**
   * True when the enemy has a focused lock and is in an aggressive state.
   * When true the caller should invoke the enemy's fire logic aimed at the
   * focused target returned by getFocusedTarget().
   */
  shouldFire: boolean;
}

// ── Internal constant ─────────────────────────────────────────────────────────

/** Default vigilance radius (km): a NEUTRAL enemy becomes VIGILANT when the player
 *  enters this range without firing. */
const DEFAULT_VIGILANCE_RANGE_KM = 200;

// ── EnemyAISystem ─────────────────────────────────────────────────────────────

export class EnemyAISystem {
  /**
   * Distance threshold (km) at which a NEUTRAL enemy transitions to VIGILANT
   * when the player simply approaches (no firing required).
   */
  static readonly VIGILANCE_RANGE_KM = DEFAULT_VIGILANCE_RANGE_KM;

  // ── State factory ──────────────────────────────────────────────────────────

  /**
   * Create a fresh EnemyAIState for a new enemy entity.
   *
   * @param id        Unique entity id.
   * @param name      Display name.
   * @param position  Spawn position (km).
   * @param scanner   Scanner equipment to assign.
   * @param aggression Initial aggression level (defaults to NEUTRAL).
   */
  static createState(
    id: string,
    name: string,
    position: { x: number; y: number },
    scanner: ScannerEquipment,
    aggression: Aggression = Aggression.NEUTRAL,
  ): EnemyAIState {
    return {
      id,
      name,
      position,
      scanner,
      targetingState: TargetLockManager.createTargetingState(),
      aggression,
    };
  }

  // ── Aggression state machine ───────────────────────────────────────────────

  /**
   * Advance the enemy's aggression level based on player proximity and attacks.
   *
   * Transition rules (in evaluation order):
   *  1. HOSTILE → stays HOSTILE (early return, no further processing).
   *  2. Player fired on this enemy → HOSTILE (permanent escalation).
   *  3. Enemy is NEUTRAL and player is within VIGILANCE_RANGE_KM → VIGILANT.
   *  4. VIGILANT stays VIGILANT; only player fire escalates it further.
   *
   * @param enemy              Enemy state to mutate.
   * @param playerPos          Current player world-space position (km).
   * @param playerFiredOnEnemy True when a player projectile hit this enemy this frame.
   * @param nowMs              Current simulation timestamp (ms).
   */
  static updateAggression(
    enemy: EnemyAIState,
    playerPos: { x: number; y: number },
    playerFiredOnEnemy: boolean,
    nowMs: number,
  ): void {
    // Rule 1: already permanently hostile — nothing to do
    if (enemy.aggression === Aggression.HOSTILE) return;

    // Rule 2: player attacked this enemy → permanent hostile escalation
    if (playerFiredOnEnemy) {
      enemy.aggression = Aggression.HOSTILE;
      enemy.lastAggravatedByPlayerAt = nowMs;
      return;
    }

    // Rule 3: proximity check triggers vigilance (NEUTRAL only)
    if (enemy.aggression === Aggression.NEUTRAL) {
      const dist = TargetLockManager.calculateDistance(enemy.position, playerPos);
      if (dist < EnemyAISystem.VIGILANCE_RANGE_KM) {
        enemy.aggression = Aggression.VIGILANT;
      }
    }
    // Rule 4: VIGILANT stays VIGILANT without player fire — handled implicitly.
  }

  // ── Lock management ────────────────────────────────────────────────────────

  /**
   * Attempt to acquire a lock on the player using this enemy's scanner.
   *
   * Delegates entirely to TargetLockManager.attemptLock, which enforces the
   * lock-limit → range → LOS gate sequence. If the enemy already holds a lock
   * on this player, the call is idempotent (existing lock returned, no duplicate).
   *
   * @param enemy     Enemy state to mutate.
   * @param player    Minimal player entity descriptor.
   * @param obstacles Celestial bodies to test for LOS obstruction.
   * @param nowMs     Simulation timestamp (ms).
   * @returns true when a brand-new lock was created (not just re-confirmed).
   */
  static acquirePlayerLock(
    enemy: EnemyAIState,
    player: { id: string; name: string; position: { x: number; y: number } },
    obstacles: CelestialBody[],
    nowMs: number,
  ): boolean {
    const countBefore = enemy.targetingState.allLocks.length;
    const result = TargetLockManager.attemptLock(
      enemy.targetingState,
      enemy.position,
      player,
      enemy.scanner,
      obstacles,
      nowMs,
    );
    return result.success && enemy.targetingState.allLocks.length > countBefore;
  }

  /**
   * Validate all locks the enemy currently holds, removing any that are no
   * longer reachable (target out of range, LOS blocked, or target destroyed).
   *
   * @param enemy         Enemy state to mutate.
   * @param getPlayerPos  Callback returning current player position (km), or
   *                      null if the player has been destroyed.
   * @param obstacles     Celestial bodies to test for LOS obstruction.
   * @returns Array of lock ids that were broken.
   */
  static validateEnemyLocks(
    enemy: EnemyAIState,
    getPlayerPos: (targetId: string) => { x: number; y: number } | null,
    obstacles: CelestialBody[],
  ): string[] {
    return TargetLockManager.validateAllLocks(
      enemy.targetingState,
      enemy.position,
      getPlayerPos,
      enemy.scanner,
      obstacles,
    );
  }

  // ── Per-frame tick ─────────────────────────────────────────────────────────

  /**
   * Execute one complete AI frame for a single enemy.
   *
   * Steps (in order):
   *   1. updateAggression   — escalate aggression based on player proximity / fire.
   *   2. validateEnemyLocks — drop stale locks (range, LOS, or destroyed).
   *   3. acquirePlayerLock  — attempt a new lock if shouldEngage is true.
   *   4. Compute shouldFire — true when engaged + focused lock exists.
   *
   * Individual sub-operations can also be called directly when fine-grained
   * control is needed (e.g. the aggression update can run before movement).
   *
   * @param enemy              Enemy state to mutate.
   * @param player             Player entity descriptor.
   * @param playerFiredOnEnemy True if a player weapon hit this enemy this frame.
   * @param obstacles          Celestial bodies in the scene.
   * @param nowMs              Simulation timestamp (ms).
   * @returns Summary of this tick's state changes.
   */
  static tick(
    enemy: EnemyAIState,
    player: { id: string; name: string; position: { x: number; y: number } },
    playerFiredOnEnemy: boolean,
    obstacles: CelestialBody[],
    nowMs: number,
  ): EnemyAITickResult {
    const prevAggression = enemy.aggression;

    // 1. Aggression state machine
    EnemyAISystem.updateAggression(enemy, player.position, playerFiredOnEnemy, nowMs);
    const aggressionChanged = enemy.aggression !== prevAggression;

    // 2. Validate existing locks — remove stale ones
    const brokenLockIds = EnemyAISystem.validateEnemyLocks(
      enemy,
      (targetId) => (targetId === player.id ? player.position : null),
      obstacles,
    );

    // 3. Acquire lock on player when enemy is aggressive enough
    let lockAcquired = false;
    if (EnemyAISystem.shouldEngage(enemy)) {
      lockAcquired = EnemyAISystem.acquirePlayerLock(enemy, player, obstacles, nowMs);
    }

    // 4. Decide whether to fire
    const shouldFire =
      EnemyAISystem.shouldEngage(enemy) &&
      enemy.targetingState.focusedLockId !== undefined;

    return { aggressionChanged, lockAcquired, brokenLockIds, shouldFire };
  }

  // ── Query helpers ──────────────────────────────────────────────────────────

  /**
   * Return true when the enemy is aggressive enough to engage the player.
   *
   * NEUTRAL enemies never engage. VIGILANT and HOSTILE enemies do.
   */
  static shouldEngage(enemy: EnemyAIState): boolean {
    return enemy.aggression !== Aggression.NEUTRAL;
  }

  /**
   * Return the currently focused TargetLock, or undefined if no lock is held.
   *
   * The focused lock's targetId is the entity the enemy should aim its weapons at.
   */
  static getFocusedTarget(enemy: EnemyAIState): TargetLock | undefined {
    if (!enemy.targetingState.focusedLockId) return undefined;
    return enemy.targetingState.allLocks.find(
      (l) => l.id === enemy.targetingState.focusedLockId,
    );
  }

  /**
   * Return true when this enemy can detect the player with its scanner:
   * the player is within scanner range and no celestial body blocks the
   * line-of-sight at the scanner's penetration level.
   *
   * This is a pure query — no state is mutated.
   *
   * @param enemy      Enemy (source of scanner + position).
   * @param playerPos  Current player world position (km).
   * @param obstacles  Celestial bodies to test for LOS obstruction.
   */
  static canDetectPlayer(
    enemy: EnemyAIState,
    playerPos: { x: number; y: number },
    obstacles: CelestialBody[],
  ): boolean {
    const dist = TargetLockManager.calculateDistance(enemy.position, playerPos);
    if (dist > enemy.scanner.range) return false;

    for (const body of obstacles) {
      if (
        TargetLockManager.isLineOfSightBlocked(
          enemy.position,
          playerPos,
          body,
          enemy.scanner.penetrationLevel,
        )
      ) {
        return false;
      }
    }
    return true;
  }
}
