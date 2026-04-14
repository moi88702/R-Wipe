/**
 * Core game constants: screen dimensions, player stats, physics, timing.
 * Pure data — no logic.
 */

// ============================================================================
// SCREEN / VIEWPORT
// ============================================================================

export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;
export const TARGET_FPS = 60;

/** Background color (hex number for Pixi.js) */
export const BACKGROUND_COLOR = 0x000000;

// ============================================================================
// SAFE ZONE / MOVEMENT BOUNDS
// ============================================================================

/** Pixels from each screen edge that define the player safe zone */
export const SAFE_ZONE_MARGIN = 50;

/** The player may only move within the lower two-thirds of the screen (y ≥ this value) */
export const PLAYER_MOVEMENT_MIN_Y = 240;

export const PLAYER_MOVEMENT_MAX_Y = SCREEN_HEIGHT - SAFE_ZONE_MARGIN;
export const PLAYER_MOVEMENT_MIN_X = SAFE_ZONE_MARGIN;
export const PLAYER_MOVEMENT_MAX_X = SCREEN_WIDTH - SAFE_ZONE_MARGIN;

// ============================================================================
// PLAYER
// ============================================================================

export const PLAYER_WIDTH = 30;
export const PLAYER_HEIGHT = 30;
export const PLAYER_SPEED = 300; // pixels per second
export const PLAYER_STARTING_LIVES = 3;

/** Horizontal center spawn position */
export const PLAYER_SPAWN_X = SCREEN_WIDTH / 2;
/** Vertical spawn position (lower third of screen) */
export const PLAYER_SPAWN_Y = SCREEN_HEIGHT - 150;

/** Default fire rate: one shot every 250 ms (4 shots/s) */
export const PLAYER_BASE_FIRE_RATE_MS = 250;

/** Respawn invincibility window after a death (ms) */
export const PLAYER_RESPAWN_DELAY_MS = 2000;
export const PLAYER_RESPAWN_INVINCIBILITY_MS = 2000;

// ============================================================================
// PROJECTILES
// ============================================================================

export const PROJECTILE_WIDTH = 4;
export const PROJECTILE_HEIGHT = 10;
export const PLAYER_PROJECTILE_SPEED = 500; // pixels per second (upward)
export const ENEMY_PROJECTILE_SPEED = 300;  // pixels per second (downward)

/** Damage dealt by a single player projectile */
export const PLAYER_PROJECTILE_DAMAGE = 10;
/** Damage dealt by a single enemy projectile */
export const ENEMY_PROJECTILE_DAMAGE = 1; // 1 life per hit

// ============================================================================
// SPREAD SHOT ANGLE
// ============================================================================

/** Degrees offset for the two side projectiles of a spread shot */
export const SPREAD_SHOT_ANGLE_DEGREES = 15;

// ============================================================================
// WAVES
// ============================================================================

export const TOTAL_WAVES = 8;

/** Delay between waves (ms) */
export const INTER_WAVE_DELAY_MS = 2000;

/** Interval between enemy spawns within a wave (ms) */
export const ENEMY_SPAWN_INTERVAL_MS = 2000;

// ============================================================================
// HIGH SCORE
// ============================================================================

export const HIGH_SCORE_STORAGE_KEY = 'rtypeCloneHighScore';
export const HIGH_SCORE_DEFAULT = 0;
