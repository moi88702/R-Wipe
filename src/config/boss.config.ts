/**
 * Boss stats and attack pattern configurations.
 * Pure data — no logic.
 */

import { BossPhase } from '../utils/constants';

// ============================================================================
// BOSS ENTITY STATS
// ============================================================================

export const BOSS_WIDTH = 80;
export const BOSS_HEIGHT = 60;
export const BOSS_MAX_HEALTH = 150;

/** Point value awarded when the boss is defeated */
export const BOSS_POINT_VALUE = 500;

// ============================================================================
// BOSS MOVEMENT
// ============================================================================

/** Horizontal speed during normal hover movement (pixels per second) */
export const BOSS_HOVER_SPEED = 100;

/** Y-position at which the boss hovers (top area of screen) */
export const BOSS_SPAWN_Y = 80;

/** Horizontal extent within which the boss moves during hover phases */
export const BOSS_HOVER_MIN_X = 200;
export const BOSS_HOVER_MAX_X = 1080;

/** Speed of the boss during a dash attack (pixels per second) */
export const BOSS_DASH_SPEED = 800;

/** Number of full-width dashes performed in the DASH phase */
export const BOSS_DASH_COUNT = 2;

// ============================================================================
// BOSS ATTACK PHASES
// ============================================================================

export interface BossAttackConfig {
  phase: BossPhase;
  /** Duration of the phase in milliseconds */
  phaseDurationMs: number;
  /** Milliseconds between individual fire events within the phase */
  fireRateMs: number;
  /** Number of projectiles fired per fire event */
  projectileCount: number;
}

export const BOSS_ATTACK_PATTERNS: Record<BossPhase, BossAttackConfig> = {
  [BossPhase.SPREAD_FIRE]: {
    phase: BossPhase.SPREAD_FIRE,
    phaseDurationMs: 5000,
    fireRateMs: 800,
    projectileCount: 5,
  },
  [BossPhase.HOMING]: {
    phase: BossPhase.HOMING,
    phaseDurationMs: 5000,
    fireRateMs: 1500,
    projectileCount: 3,
  },
  [BossPhase.DASH]: {
    phase: BossPhase.DASH,
    phaseDurationMs: 5000,
    fireRateMs: 0,  // no projectiles during dash
    projectileCount: 0,
  },
};

/** Ordered cycle of boss attack phases */
export const BOSS_PHASE_CYCLE: BossPhase[] = [
  BossPhase.SPREAD_FIRE,
  BossPhase.HOMING,
  BossPhase.DASH,
];

// ============================================================================
// BOSS PROJECTILES
// ============================================================================

/** Speed of boss spread projectiles (pixels per second) */
export const BOSS_SPREAD_PROJECTILE_SPEED = 280;

/** Angular spread (degrees) between the outermost boss projectiles in SPREAD_FIRE phase */
export const BOSS_SPREAD_ANGLE_DEGREES = 60;

/** Speed of boss homing projectiles (pixels per second) */
export const BOSS_HOMING_PROJECTILE_SPEED = 200;

/** How quickly homing projectiles steer toward the player (degrees per second) */
export const BOSS_HOMING_TURN_RATE_DEG_PER_SEC = 120;

/** Damage per boss projectile hit (in player lives — 1 = instant death without shield) */
export const BOSS_PROJECTILE_DAMAGE = 1;
